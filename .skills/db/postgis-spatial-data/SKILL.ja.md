---
name: PostGIS 空間データ設計 (GEOGRAPHY / LINESTRING / GIST)
description: PostgreSQL + PostGIS で位置・経路・領域データを保存しクエリするための標準。距離・半径検索やポリラインを扱うとき、または GEOGRAPHY か GEOMETRY か・GIST インデックス・ST_DWithin・JPA Spatial マッピングを決めるときに読む。キーワード: postgis, ST_Distance, ST_Contains, ST_Within, ST_DWithin, geometry, geography, srid, ST_GeomFromText, LINESTRINGZM, GIST.
rules:
  - "距離・面積の計算が必要なら GEOGRAPHY、平面演算なら GEOMETRY 型を使う。GPS の緯度経度は GEOGRAPHY(..., 4326)。"
  - "空間カラムには必ず GIST インデックスを作成する。"
  - "半径検索は ST_DWithin でインデックスを活用する。"
  - "経路は LINESTRINGZM で時刻・高度まで保存する。"
  - "大量の raw ポイントテーブルは月別にパーティショニングし、GIST インデックスは置かない。"
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

# 🌍 PostGIS 空間データ設計 (GEOGRAPHY / LINESTRING / GIST)

> 位置・経路・領域を DB レベルで保存・検索する。緯度経度/距離/半径/ポリラインを扱うとき、または空間インデックスを設計するときに読む。

位置座標を `lat DOUBLE, lng DOUBLE` の 2 カラムで保存すると、(1) 距離計算を毎回アプリケーションが Haversine で行う必要があり、(2)「1km 以内の店舗」のような空間クエリがフルスキャンになり、(3) ポリラインはシリアライズしたテキストで保持しなければならない。PostGIS を導入すれば、これら 3 つはすべて DB で解決できる。(命名・共通カラムは db-common-conventions、マイグレーションは db-migration-flyway スキルを参照。)

## 1. 核心原則
- 距離・面積の計算が必要なら `GEOGRAPHY`、平面演算なら `GEOMETRY` 型を使う。GPS の緯度経度は `GEOGRAPHY(..., 4326)`。
- 空間カラムには必ず GIST インデックスを作成する。
- 半径検索は `ST_DWithin` でインデックスを活用する。
- 経路は `LINESTRINGZM` で時刻・高度まで保存する。
- 大量の raw ポイントテーブルは月別にパーティショニングし、GIST インデックスは置かない。

## 2. ルール

### 2-1. 拡張のインストール
```sql
-- ✅ AWS RDS PostgreSQL 16 には標準で含まれる。Flyway V1__enable_postgis.sql で 1 回実行
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;  -- トポロジを使うなら
SELECT PostGIS_Version();   -- 動作確認
```

### 2-2. GEOGRAPHY vs GEOMETRY
| 型 | 座標系 | 距離の単位 | 用途 |
|---|---|---|---|
| `GEOMETRY` | 平面(XY) | 座標系の単位 | 狭い地域、高速な演算、事前投影済み座標 |
| **`GEOGRAPHY`** | **地球球体(WGS84, SRID 4326)** | **メートル** | **GPS の緯度経度そのまま、距離が自動で正確** |

> GPS 座標を扱うすべてのケースで `GEOGRAPHY(..., 4326)` を使う。平面の仮定が崩れる長距離でも正確だ。

### 2-3. ジオメトリ型の仕様
```sql
POINT          -- 単一地点 (緯度経度 1 組)
LINESTRING     -- ポリライン (lng, lat) のシーケンス — ランニング/配達経路
LINESTRINGZ    -- + 高度(z)
LINESTRINGM    -- + measure(M) 次元 — 時刻など任意のスカラ
LINESTRINGZM   -- + 高度 + measure
POLYGON        -- 領域
MULTILINESTRING, MULTIPOLYGON  -- 複数
```

### 2-4. テーブルスキーマ — ランニング記録
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
    polyline_encoded   TEXT,    -- Google Encoded Polyline (API 送信用キャッシュ)
    geom               GEOGRAPHY(LINESTRINGZM, 4326) NOT NULL,
    gps_loss_segments  JSONB DEFAULT '[]'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ                  -- 論理削除: NULL=アクティブ
);

-- ✅ GIST 空間インデックス — 空間クエリに必須
CREATE INDEX idx_runs_geom ON runs USING GIST (geom);

-- ✅ 自分のデータ照会用の部分インデックス
CREATE INDEX idx_runs_user_started ON runs(user_id, started_at DESC) WHERE deleted_at IS NULL;
```

### 2-5. raw ポイントテーブル (月別パーティショニング)
raw ポイントは統計の後処理が終われば保持価値が低い。30 日後の自動破棄ポリシーで運用コストを抑える。
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

-- 30 日後にパーティションを DROP (Spring バッチまたは pg_partman)
DROP TABLE run_track_points_2026_04;
```

### 2-6. よく使う空間関数
```sql
-- 2 点間の距離(m)
SELECT ST_Distance(
    ST_MakePoint(126.9780, 37.5665)::geography,
    ST_MakePoint(127.0276, 37.4979)::geography
);

-- ✅ 半径内検索 (GIST インデックス活用)
SELECT id, title, distance_m
FROM courses
WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, 10000);  -- 10km

SELECT ST_Length(geom) FROM runs WHERE id = :run_id;                       -- ポリラインの長さ(m)
SELECT ST_Simplify(geom::geometry, 0.00005)::geography FROM runs WHERE id = :run_id;  -- vertex を削減
SELECT ST_AsText(geom) FROM runs WHERE id = :run_id;                       -- WKT (デバッグ)
SELECT ST_AsGeoJSON(geom)::json FROM runs WHERE id = :run_id;              -- GeoJSON (API レスポンス)
```

### 2-7. INSERT — ポリラインの投入
```sql
-- ✅ WKT 文字列で
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
VALUES (
    1, '2026-05-11 06:00', '2026-05-11 06:52', 10200, 3120,
    ST_GeogFromText('LINESTRINGZM(126.9780 37.5665 35 1715414400, 126.9785 37.5670 36 1715414410, ...)')
);

-- ✅ または ST_MakeLine + 配列
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
SELECT 1, NOW(), NOW(), 10200, 3120,
       ST_MakeLine(ARRAY[
           ST_SetSRID(ST_MakePoint(126.9780, 37.5665), 4326),
           ST_SetSRID(ST_MakePoint(126.9785, 37.5670), 4326)
       ])::geography;
```

### 2-8. JPA / Hibernate Spatial マッピング
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
PostGIS 関数は JPQL/HQL ではなく `@Query(nativeQuery = true)` または JPA Criteria SpatialPredicates で呼び出す。
```java
@Query(value = """
    SELECT * FROM courses
    WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, :radius_m)
    ORDER BY ST_Distance(geom, ST_MakePoint(:lng, :lat)::geography)
    LIMIT 20
    """, nativeQuery = true)
List<Course> findNearby(@Param("lng") double lng, @Param("lat") double lat, @Param("radius_m") int radiusM);
```

### 2-9. Encoded Polyline ↔ DB 変換
API レスポンスはテキスト 1 行(~3KB)に圧縮しつつ、DB は LINESTRING で保存 → バックエンドに変換ヘルパーを置く。
```java
// デコード: encoded string → coordinates → ST_MakeLine
public LineString decodeToLineString(String encoded) {
    List<Coordinate> coords = PolylineEncoder.decode(encoded, 5);
    // ... GeometryFactory.createLineString(coords.toArray(...))
}
// エンコード: LineString → encoded string
public String encodeFromLineString(LineString line) {
    return PolylineEncoder.encode(line.getCoordinates(), 5);
}
```
`PolylineEncoder` は `com.google.maps:google-maps-services` または独自実装。精度 5(小数 5 桁)=±1.1m、精度 6=±0.11m(1.5 倍長くなる)。

### 2-10. インデックス戦略
| クエリパターン | インデックス |
|---|---|
| 半径内検索 (`ST_DWithin`) | **GIST(geom)** 必須 |
| ユーザー別時系列 (`user_id + started_at`) | B-tree 複合 |
| アクティブデータのみ (`deleted_at IS NULL`) | 部分インデックス(`WHERE deleted_at IS NULL`) |
| コースカタログ (`difficulty`, `distance_m`) | B-tree 単一/複合 |

> GIST インデックスには INSERT/UPDATE コストがある。raw ポイントのような INSERT ヘビーなテーブルには置かない(どのみち空間クエリをしない)。

## 3. よくあるミス
- ❌ `lat DOUBLE, lng DOUBLE` の 2 カラムだけ置いて距離/包含計算をアプリケーションで行う — DB インデックスを使えない。
- ❌ `GEOMETRY` に緯度経度を入れて `ST_Distance` — 単位が「度(degree)」になる。**GEOGRAPHY を使ってこそメートルが出る**。
- ❌ raw ポイントテーブルに GIST インデックス — INSERT が急増する。
- ❌ ポリラインを `TEXT`(WKT 文字列)だけで保存 — 空間クエリ不可。
- ❌ パーティショニングなしで raw ポイントを永久に蓄積 — 1 年後に数十億 row、vacuum 地獄。

```sql
-- デバッグ: 不正な座標の検出 / 平均長 / 地域統計
SELECT id FROM runs WHERE NOT ST_IsValid(geom::geometry);
SELECT AVG(ST_NumPoints(geom::geometry)) FROM runs;
SELECT COUNT(*) FROM runs
WHERE ST_Intersects(geom::geometry, ST_MakeEnvelope(126.9, 37.5, 127.1, 37.6, 4326));
```

## 4. チェックリスト
- [ ] GPS 座標に `GEOGRAPHY(..., 4326)` を使ったか (GEOMETRY ではない)
- [ ] 空間検索用のカラムに GIST インデックスを作ったか
- [ ] 半径検索を `ST_DWithin` で行ったか
- [ ] raw ポイントテーブルを月別パーティショニングし GIST を外したか
- [ ] ポリラインを LINESTRING で保存し TEXT 専用保存を避けたか
