---
name: PostGIS 空间数据设计 (GEOGRAPHY / LINESTRING / GIST)
description: 使用 PostgreSQL + PostGIS 存储和查询位置、路径、区域数据的标准。处理距离、半径检索或折线时，或决定 GEOGRAPHY 还是 GEOMETRY、GIST 索引、ST_DWithin、JPA Spatial 映射时阅读。关键词：postgis, ST_Distance, ST_Contains, ST_Within, ST_DWithin, geometry, geography, srid, ST_GeomFromText, LINESTRINGZM, GIST.
rules:
  - "需要距离、面积计算时用 GEOGRAPHY，平面运算时用 GEOMETRY 类型。GPS 经纬度用 GEOGRAPHY(..., 4326)。"
  - "空间列必须创建 GIST 索引。"
  - "半径检索用 ST_DWithin 以利用索引。"
  - "路径用 LINESTRINGZM 连同时间、高度一并存储。"
  - "大量 raw 点表按月分区，且不建 GIST 索引。"
tags:
  - "postgis"
  - "ST_Distance"
  - "ST_Contains"
  - "ST_Within"
  - "ST_DWithin"
  - "geometry"
  - "geography"
  - "srid"
  - "ST_GeomFromText"
  - "LINESTRINGZM"
  - "GIST"
---

# 🌍 PostGIS 空间数据设计 (GEOGRAPHY / LINESTRING / GIST)

> 在 DB 层面存储和检索位置、路径、区域。处理经纬度/距离/半径/折线时，或设计空间索引时阅读。

若将位置坐标用 `lat DOUBLE, lng DOUBLE` 两列存储，则 (1) 距离计算每次都要由应用用 Haversine 完成，(2)“1km 以内的门店”这类空间查询会全表扫描，(3) 折线必须以序列化文本保存。引入 PostGIS 后，这三点都能在 DB 中解决。(命名、公共列参见 db-common-conventions 技能，迁移参见 db-migration-flyway 技能。)

## 1. 核心原则
- 需要距离、面积计算时用 `GEOGRAPHY`，平面运算时用 `GEOMETRY` 类型。GPS 经纬度用 `GEOGRAPHY(..., 4326)`。
- 空间列必须创建 GIST 索引。
- 半径检索用 `ST_DWithin` 以利用索引。
- 路径用 `LINESTRINGZM` 连同时间、高度一并存储。
- 大量 raw 点表按月分区，且不建 GIST 索引。

## 2. 规则

### 2-1. 安装扩展
```sql
-- ✅ AWS RDS PostgreSQL 16 默认包含，通过 Flyway V1__enable_postgis.sql 执行一次
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;  -- 若使用拓扑
SELECT PostGIS_Version();   -- 确认可用
```

### 2-2. GEOGRAPHY vs GEOMETRY
| 类型 | 坐标系 | 距离单位 | 用途 |
|---|---|---|---|
| `GEOMETRY` | 平面(XY) | 坐标系单位 | 小范围区域、快速运算、已预投影坐标 |
| **`GEOGRAPHY`** | **地球球体(WGS84, SRID 4326)** | **米** | **GPS 经纬度直接使用，距离自动准确** |

> 凡处理 GPS 坐标的所有场景都用 `GEOGRAPHY(..., 4326)`。即使在平面假设失效的长距离也准确。

### 2-3. 几何类型说明
```sql
POINT          -- 单个点 (一对经纬度)
LINESTRING     -- 折线 (lng, lat) 序列 — 跑步/配送路径
LINESTRINGZ    -- + 高度(z)
LINESTRINGM    -- + measure(M) 维度 — 时间等任意标量
LINESTRINGZM   -- + 高度 + measure
POLYGON        -- 区域
MULTILINESTRING, MULTIPOLYGON  -- 多重
```

### 2-4. 表结构 — 跑步记录
```sql
CREATE TABLE runs (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL REFERENCES users(id),
    started_at         TIMESTAMPTZ NOT NULL,
    ended_at           TIMESTAMPTZ NOT NULL,
    distance_m         DOUBLE PRECISION NOT NULL,
    duration_s         INTEGER NOT NULL,
    avg_pace_s_per_km  DOUBLE PRECISION,
    calories           INTEGER,
    polyline_encoded   TEXT,    -- Google Encoded Polyline (用于 API 传输的缓存)
    geom               GEOGRAPHY(LINESTRINGZM, 4326) NOT NULL,
    gps_loss_segments  JSONB DEFAULT '[]'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ                  -- 逻辑删除: NULL=活跃
);

-- ✅ GIST 空间索引 — 空间查询必需
CREATE INDEX idx_runs_geom ON runs USING GIST (geom);

-- ✅ 用于查询自己数据的部分索引
CREATE INDEX idx_runs_user_started ON runs(user_id, started_at DESC) WHERE deleted_at IS NULL;
```

### 2-5. raw 点表 (按月分区)
raw 点在统计后处理完成后保留价值很低。用 30 天后自动废弃策略来控制运营成本。
```sql
CREATE TABLE run_track_points (
    run_id      BIGINT NOT NULL,
    seq         INTEGER NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    altitude    DOUBLE PRECISION,
    accuracy    REAL,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, seq, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE run_track_points_2026_05 PARTITION OF run_track_points
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE run_track_points_2026_06 PARTITION OF run_track_points
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- 30 天后 DROP 分区 (Spring 批处理或 pg_partman)
DROP TABLE run_track_points_2026_04;
```

### 2-6. 常用空间函数
```sql
-- 两点之间的距离(m)
SELECT ST_Distance(
    ST_MakePoint(126.9780, 37.5665)::geography,
    ST_MakePoint(127.0276, 37.4979)::geography
);

-- ✅ 半径内检索 (利用 GIST 索引)
SELECT id, title, distance_m
FROM courses
WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, 10000);  -- 10km

SELECT ST_Length(geom) FROM runs WHERE id = :run_id;                       -- 折线长度(m)
SELECT ST_Simplify(geom::geometry, 0.00005)::geography FROM runs WHERE id = :run_id;  -- 减少 vertex
SELECT ST_AsText(geom) FROM runs WHERE id = :run_id;                       -- WKT (调试)
SELECT ST_AsGeoJSON(geom)::json FROM runs WHERE id = :run_id;              -- GeoJSON (API 响应)
```

### 2-7. INSERT — 加载折线
```sql
-- ✅ 用 WKT 字符串
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
VALUES (
    1, '2026-05-11 06:00', '2026-05-11 06:52', 10200, 3120,
    ST_GeogFromText('LINESTRINGZM(126.9780 37.5665 35 1715414400, 126.9785 37.5670 36 1715414410, ...)')
);

-- ✅ 或 ST_MakeLine + 数组
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
SELECT 1, NOW(), NOW(), 10200, 3120,
       ST_MakeLine(ARRAY[
           ST_SetSRID(ST_MakePoint(126.9780, 37.5665), 4326),
           ST_SetSRID(ST_MakePoint(126.9785, 37.5670), 4326)
       ])::geography;
```

### 2-8. JPA / Hibernate Spatial 映射
```gradle
implementation 'org.hibernate.orm:hibernate-spatial:6.6.+'
```
```java
import org.locationtech.jts.geom.LineString;

@Entity
@Table(name = "runs")
public class Run {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "geom", columnDefinition = "geography(LinestringZM, 4326)")
    private LineString geom;   // JTS LineString
    // ...
}
```
PostGIS 函数不通过 JPQL/HQL，而是通过 `@Query(nativeQuery = true)` 或 JPA Criteria SpatialPredicates 调用。
```java
@Query(value = """
    SELECT * FROM courses
    WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, :radius_m)
    ORDER BY ST_Distance(geom, ST_MakePoint(:lng, :lat)::geography)
    LIMIT 20
    """, nativeQuery = true)
List<Course> findNearby(@Param("lng") double lng, @Param("lat") double lat, @Param("radius_m") int radiusM);
```

### 2-9. Encoded Polyline ↔ DB 转换
API 响应压缩为单行文本(~3KB)，而 DB 以 LINESTRING 存储 → 在后端放置转换辅助方法。
```java
// 解码: encoded string → coordinates → ST_MakeLine
public LineString decodeToLineString(String encoded) {
    List<Coordinate> coords = PolylineEncoder.decode(encoded, 5);
    // ... GeometryFactory.createLineString(coords.toArray(...))
}
// 编码: LineString → encoded string
public String encodeFromLineString(LineString line) {
    return PolylineEncoder.encode(line.getCoordinates(), 5);
}
```
`PolylineEncoder` 来自 `com.google.maps:google-maps-services` 或自行实现。精度 5(小数 5 位)=±1.1m，精度 6=±0.11m(长度增加 1.5 倍)。

### 2-10. 索引策略
| 查询模式 | 索引 |
|---|---|
| 半径内检索 (`ST_DWithin`) | **GIST(geom)** 必需 |
| 按用户的时间序列 (`user_id + started_at`) | B-tree 复合 |
| 仅活跃数据 (`deleted_at IS NULL`) | 部分索引(`WHERE deleted_at IS NULL`) |
| 课程目录 (`difficulty`, `distance_m`) | B-tree 单列/复合 |

> GIST 索引有 INSERT/UPDATE 成本。不要给像 raw 点这样 INSERT 密集的表添加(反正不做空间查询)。

## 3. 常见错误
- ❌ 只放 `lat DOUBLE, lng DOUBLE` 两列，在应用中做距离/包含计算 — 无法使用 DB 索引。
- ❌ 把经纬度放进 `GEOMETRY` 并调用 `ST_Distance` — 单位变成“度(degree)”。**必须用 GEOGRAPHY 才能得到米**。
- ❌ 给 raw 点表加 GIST 索引 — INSERT 暴增。
- ❌ 仅以 `TEXT`(WKT 字符串)存储折线 — 无法做空间查询。
- ❌ 不分区而永久累积 raw 点 — 一年后数十亿 row，vacuum 地狱。

```sql
-- 调试: 检出无效坐标 / 平均长度 / 地区统计
SELECT id FROM runs WHERE NOT ST_IsValid(geom::geometry);
SELECT AVG(ST_NumPoints(geom::geometry)) FROM runs;
SELECT COUNT(*) FROM runs
WHERE ST_Intersects(geom::geometry, ST_MakeEnvelope(126.9, 37.5, 127.1, 37.6, 4326));
```

## 4. 检查清单
- [ ] GPS 坐标是否用了 `GEOGRAPHY(..., 4326)` (而非 GEOMETRY)
- [ ] 是否为空间检索用的列创建了 GIST 索引
- [ ] 是否用 `ST_DWithin` 做半径检索
- [ ] 是否将 raw 点表按月分区并去掉 GIST
- [ ] 是否将折线以 LINESTRING 存储并避免仅用 TEXT 存储
