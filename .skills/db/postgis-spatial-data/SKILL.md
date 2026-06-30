---
name: PostGIS 공간 데이터 설계 (GEOGRAPHY / LINESTRING / GIST)
description: PostgreSQL + PostGIS로 위치·경로·영역 데이터를 저장하고 쿼리하는 표준. 거리·반경 검색·폴리라인을 다루거나, GEOGRAPHY vs GEOMETRY·GIST 인덱스·ST_DWithin·JPA Spatial 매핑을 정할 때 읽는다. 키워드: postgis, ST_Distance, ST_Contains, ST_Within, ST_DWithin, geometry, geography, srid, ST_GeomFromText, LINESTRINGZM, GIST.
rules:
  - "거리·면적 계산이 필요하면 GEOGRAPHY, 평면 연산이면 GEOMETRY 타입을 쓴다. GPS 위경도는 GEOGRAPHY(..., 4326)."
  - "공간 컬럼에는 반드시 GIST 인덱스를 생성한다."
  - "반경 검색은 ST_DWithin으로 인덱스를 활용한다."
  - "경로는 LINESTRINGZM으로 시간·고도까지 저장한다."
  - "대량 raw 포인트 테이블은 월별로 파티셔닝하고, GIST 인덱스는 두지 않는다."
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

# 🌍 PostGIS 공간 데이터 설계 (GEOGRAPHY / LINESTRING / GIST)

> 위치·경로·영역을 DB 레벨에서 저장·검색한다. 위경도/거리/반경/폴리라인을 다루거나 공간 인덱스를 설계할 때 읽는다.

위치 좌표를 `lat DOUBLE, lng DOUBLE` 두 컬럼으로 저장하면 (1) 거리 계산을 매번 애플리케이션이 Haversine으로 해야 하고, (2) "1km 이내 매장" 같은 공간 쿼리가 풀스캔이고, (3) 폴리라인은 직렬화 텍스트로 보관해야 한다. PostGIS를 도입하면 이 세 가지가 모두 DB에서 해결된다. (네이밍·공통컬럼은 db-common-conventions, 마이그레이션은 db-migration-flyway 스킬 참조.)

## 1. 핵심 원칙
- 거리·면적 계산이 필요하면 `GEOGRAPHY`, 평면 연산이면 `GEOMETRY` 타입을 쓴다. GPS 위경도는 `GEOGRAPHY(..., 4326)`.
- 공간 컬럼에는 반드시 GIST 인덱스를 생성한다.
- 반경 검색은 `ST_DWithin`으로 인덱스를 활용한다.
- 경로는 `LINESTRINGZM`으로 시간·고도까지 저장한다.
- 대량 raw 포인트 테이블은 월별로 파티셔닝하고, GIST 인덱스는 두지 않는다.

## 2. 규칙

### 2-1. 확장 설치
```sql
-- ✅ AWS RDS PostgreSQL 16에는 기본 포함, Flyway V1__enable_postgis.sql로 1회 실행
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;  -- 토폴로지 쓰면
SELECT PostGIS_Version();   -- 동작 확인
```

### 2-2. GEOGRAPHY vs GEOMETRY
| 타입 | 좌표계 | 거리 단위 | 용도 |
|---|---|---|---|
| `GEOMETRY` | 평면(XY) | 좌표계 단위 | 좁은 지역, 빠른 연산, 사전 투영된 좌표 |
| **`GEOGRAPHY`** | **지구 구체(WGS84, SRID 4326)** | **미터** | **GPS 위경도 그대로, 거리 자동 정확** |

> GPS 좌표를 다루는 모든 케이스는 `GEOGRAPHY(..., 4326)`을 쓴다. 평면 가정이 깨지는 장거리에서도 정확하다.

### 2-3. 지오메트리 타입 명세
```sql
POINT          -- 단일 지점 (위경도 한 쌍)
LINESTRING     -- 폴리라인 (lng, lat) 시퀀스 — 러닝/배달 경로
LINESTRINGZ    -- + 고도(z)
LINESTRINGM    -- + measure(M) 차원 — 시간 등 임의 스칼라
LINESTRINGZM   -- + 고도 + measure
POLYGON        -- 영역
MULTILINESTRING, MULTIPOLYGON  -- 다중
```

### 2-4. 테이블 스키마 — 러닝 기록
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
    polyline_encoded   TEXT,    -- Google Encoded Polyline (API 전송용 캐시)
    geom               GEOGRAPHY(LINESTRINGZM, 4326) NOT NULL,
    gps_loss_segments  JSONB DEFAULT '[]'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ                  -- 논리 삭제: NULL=활성
);

-- ✅ GIST 공간 인덱스 — 공간 쿼리 필수
CREATE INDEX idx_runs_geom ON runs USING GIST (geom);

-- ✅ 자기 데이터 조회용 부분 인덱스
CREATE INDEX idx_runs_user_started ON runs(user_id, started_at DESC) WHERE deleted_at IS NULL;
```

### 2-5. raw 포인트 테이블 (월별 파티셔닝)
raw 포인트는 통계 후처리 끝나면 보관 가치가 낮다. 30일 후 자동 폐기 정책으로 운영 비용을 통제한다.
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

-- 30일 후 파티션 DROP (Spring 배치 또는 pg_partman)
DROP TABLE run_track_points_2026_04;
```

### 2-6. 자주 쓰는 공간 함수
```sql
-- 두 점 사이 거리(m)
SELECT ST_Distance(
    ST_MakePoint(126.9780, 37.5665)::geography,
    ST_MakePoint(127.0276, 37.4979)::geography
);

-- ✅ 반경 내 검색 (GIST 인덱스 활용)
SELECT id, title, distance_m
FROM courses
WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, 10000);  -- 10km

SELECT ST_Length(geom) FROM runs WHERE id = :run_id;                       -- 폴리라인 길이(m)
SELECT ST_Simplify(geom::geometry, 0.00005)::geography FROM runs WHERE id = :run_id;  -- vertex 축소
SELECT ST_AsText(geom) FROM runs WHERE id = :run_id;                       -- WKT (디버깅)
SELECT ST_AsGeoJSON(geom)::json FROM runs WHERE id = :run_id;              -- GeoJSON (API 응답)
```

### 2-7. INSERT — 폴리라인 적재
```sql
-- ✅ WKT 문자열로
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
VALUES (
    1, '2026-05-11 06:00', '2026-05-11 06:52', 10200, 3120,
    ST_GeogFromText('LINESTRINGZM(126.9780 37.5665 35 1715414400, 126.9785 37.5670 36 1715414410, ...)')
);

-- ✅ 또는 ST_MakeLine + 배열
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
SELECT 1, NOW(), NOW(), 10200, 3120,
       ST_MakeLine(ARRAY[
           ST_SetSRID(ST_MakePoint(126.9780, 37.5665), 4326),
           ST_SetSRID(ST_MakePoint(126.9785, 37.5670), 4326)
       ])::geography;
```

### 2-8. JPA / Hibernate Spatial 매핑
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
PostGIS 함수는 JPQL/HQL이 아닌 `@Query(nativeQuery = true)` 또는 JPA Criteria SpatialPredicates로 호출한다.
```java
@Query(value = """
    SELECT * FROM courses
    WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, :radius_m)
    ORDER BY ST_Distance(geom, ST_MakePoint(:lng, :lat)::geography)
    LIMIT 20
    """, nativeQuery = true)
List<Course> findNearby(@Param("lng") double lng, @Param("lat") double lat, @Param("radius_m") int radiusM);
```

### 2-9. Encoded Polyline ↔ DB 변환
API 응답은 텍스트 1줄(~3KB)로 압축하되, DB는 LINESTRING으로 저장 → 백엔드에 변환 헬퍼를 둔다.
```java
// 디코드: encoded string → coordinates → ST_MakeLine
public LineString decodeToLineString(String encoded) {
    List<Coordinate> coords = PolylineEncoder.decode(encoded, 5);
    // ... GeometryFactory.createLineString(coords.toArray(...))
}
// 인코드: LineString → encoded string
public String encodeFromLineString(LineString line) {
    return PolylineEncoder.encode(line.getCoordinates(), 5);
}
```
`PolylineEncoder`는 `com.google.maps:google-maps-services` 또는 직접 구현. 정밀도 5(소수 5자리)=±1.1m, 정밀도 6=±0.11m(1.5배 길어짐).

### 2-10. 인덱스 전략
| 쿼리 패턴 | 인덱스 |
|---|---|
| 반경 내 검색 (`ST_DWithin`) | **GIST(geom)** 필수 |
| 사용자별 시계열 (`user_id + started_at`) | B-tree 복합 |
| 활성 데이터만 (`deleted_at IS NULL`) | 부분 인덱스(`WHERE deleted_at IS NULL`) |
| 코스 카탈로그 (`difficulty`, `distance_m`) | B-tree 단일/복합 |

> GIST 인덱스는 INSERT/UPDATE 비용이 있다. raw 포인트처럼 INSERT 헤비한 테이블에는 두지 않는다(어차피 공간쿼리 안 함).

## 3. 흔한 실수
- ❌ `lat DOUBLE, lng DOUBLE` 두 컬럼만 두고 거리/포함 계산을 애플리케이션에서 — DB 인덱스 못 씀.
- ❌ `GEOMETRY`에 위경도를 넣고 `ST_Distance` — 단위가 "도(degree)"가 됨. **GEOGRAPHY 써야 미터가 나옴**.
- ❌ raw 포인트 테이블에 GIST 인덱스 — INSERT 폭증.
- ❌ 폴리라인을 `TEXT`(WKT 문자열)로만 저장 — 공간 쿼리 불가.
- ❌ 파티셔닝 없이 raw 포인트 영구 적재 — 1년 후 수십억 row, vacuum 지옥.

```sql
-- 디버깅: 잘못된 좌표 검출 / 평균 길이 / 지역 통계
SELECT id FROM runs WHERE NOT ST_IsValid(geom::geometry);
SELECT AVG(ST_NumPoints(geom::geometry)) FROM runs;
SELECT COUNT(*) FROM runs
WHERE ST_Intersects(geom::geometry, ST_MakeEnvelope(126.9, 37.5, 127.1, 37.6, 4326));
```

## 4. 체크리스트
- [ ] GPS 좌표에 `GEOGRAPHY(..., 4326)`을 썼는가 (GEOMETRY 아님)
- [ ] 공간 검색용 컬럼에 GIST 인덱스를 만들었는가
- [ ] 반경 검색을 `ST_DWithin`으로 했는가
- [ ] raw 포인트 테이블을 월별 파티셔닝하고 GIST를 뺐는가
- [ ] 폴리라인을 LINESTRING으로 저장하고 TEXT 전용 저장을 피했는가
