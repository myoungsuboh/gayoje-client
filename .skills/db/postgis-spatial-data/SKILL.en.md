---
name: PostGIS Spatial Data Design (GEOGRAPHY / LINESTRING / GIST)
description: A standard for storing and querying location, route, and area data with PostgreSQL + PostGIS. Read this when handling distance/radius search or polylines, or when deciding between GEOGRAPHY vs GEOMETRY, GIST indexes, ST_DWithin, or JPA Spatial mapping. Keywords: postgis, ST_Distance, ST_Contains, ST_Within, ST_DWithin, geometry, geography, srid, ST_GeomFromText, LINESTRINGZM, GIST.
rules:
  - "Use GEOGRAPHY when you need distance/area calculations, and GEOMETRY for planar operations. For GPS latitude/longitude, use GEOGRAPHY(..., 4326)."
  - "Always create a GIST index on spatial columns."
  - "Use ST_DWithin for radius search to leverage the index."
  - "Store routes as LINESTRINGZM to capture time and altitude as well."
  - "Partition large raw point tables by month, and do not add a GIST index."
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

# 🌍 PostGIS Spatial Data Design (GEOGRAPHY / LINESTRING / GIST)

> Store and search locations, routes, and areas at the DB level. Read this when handling latitude/longitude, distance, radius, or polylines, or when designing spatial indexes.

If you store location coordinates as two columns `lat DOUBLE, lng DOUBLE`, then (1) the application has to compute distances with Haversine every time, (2) spatial queries like "stores within 1km" become full scans, and (3) polylines must be kept as serialized text. Adopting PostGIS solves all three of these in the DB. (For naming and common columns see the db-common-conventions skill; for migrations see the db-migration-flyway skill.)

## 1. Core Principles
- Use `GEOGRAPHY` when you need distance/area calculations, and `GEOMETRY` for planar operations. For GPS latitude/longitude, use `GEOGRAPHY(..., 4326)`.
- Always create a GIST index on spatial columns.
- Use `ST_DWithin` for radius search to leverage the index.
- Store routes as `LINESTRINGZM` to capture time and altitude as well.
- Partition large raw point tables by month, and do not add a GIST index.

## 2. Rules

### 2-1. Installing the Extension
```sql
-- ✅ Included by default in AWS RDS PostgreSQL 16; run once via Flyway V1__enable_postgis.sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;  -- if you use topology
SELECT PostGIS_Version();   -- verify it works
```

### 2-2. GEOGRAPHY vs GEOMETRY
| Type | Coordinate system | Distance unit | Use case |
|---|---|---|---|
| `GEOMETRY` | Planar (XY) | Coordinate-system unit | Small areas, fast operations, pre-projected coordinates |
| **`GEOGRAPHY`** | **Earth sphere (WGS84, SRID 4326)** | **meters** | **GPS latitude/longitude as-is, distances automatically accurate** |

> For every case dealing with GPS coordinates, use `GEOGRAPHY(..., 4326)`. It stays accurate even over long distances where the planar assumption breaks down.

### 2-3. Geometry Type Specification
```sql
POINT          -- single point (one lat/lng pair)
LINESTRING     -- polyline, a sequence of (lng, lat) — running/delivery routes
LINESTRINGZ    -- + altitude (z)
LINESTRINGM    -- + measure (M) dimension — an arbitrary scalar such as time
LINESTRINGZM   -- + altitude + measure
POLYGON        -- area
MULTILINESTRING, MULTIPOLYGON  -- multiple
```

### 2-4. Table Schema — Running Records
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
    polyline_encoded   TEXT,    -- Google Encoded Polyline (cache for API transmission)
    geom               GEOGRAPHY(LINESTRINGZM, 4326) NOT NULL,
    gps_loss_segments  JSONB DEFAULT '[]'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ                  -- logical delete: NULL = active
);

-- ✅ GIST spatial index — required for spatial queries
CREATE INDEX idx_runs_geom ON runs USING GIST (geom);

-- ✅ Partial index for querying your own data
CREATE INDEX idx_runs_user_started ON runs(user_id, started_at DESC) WHERE deleted_at IS NULL;
```

### 2-5. Raw Point Table (Monthly Partitioning)
Raw points have little retention value once statistical post-processing is done. Control operating cost with an auto-discard policy after 30 days.
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

-- DROP the partition after 30 days (Spring batch or pg_partman)
DROP TABLE run_track_points_2026_04;
```

### 2-6. Frequently Used Spatial Functions
```sql
-- distance between two points (m)
SELECT ST_Distance(
    ST_MakePoint(126.9780, 37.5665)::geography,
    ST_MakePoint(127.0276, 37.4979)::geography
);

-- ✅ within-radius search (uses GIST index)
SELECT id, title, distance_m
FROM courses
WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, 10000);  -- 10km

SELECT ST_Length(geom) FROM runs WHERE id = :run_id;                       -- polyline length (m)
SELECT ST_Simplify(geom::geometry, 0.00005)::geography FROM runs WHERE id = :run_id;  -- reduce vertices
SELECT ST_AsText(geom) FROM runs WHERE id = :run_id;                       -- WKT (debugging)
SELECT ST_AsGeoJSON(geom)::json FROM runs WHERE id = :run_id;              -- GeoJSON (API response)
```

### 2-7. INSERT — Loading a Polyline
```sql
-- ✅ via WKT string
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
VALUES (
    1, '2026-05-11 06:00', '2026-05-11 06:52', 10200, 3120,
    ST_GeogFromText('LINESTRINGZM(126.9780 37.5665 35 1715414400, 126.9785 37.5670 36 1715414410, ...)')
);

-- ✅ or ST_MakeLine + array
INSERT INTO runs (user_id, started_at, ended_at, distance_m, duration_s, geom)
SELECT 1, NOW(), NOW(), 10200, 3120,
       ST_MakeLine(ARRAY[
           ST_SetSRID(ST_MakePoint(126.9780, 37.5665), 4326),
           ST_SetSRID(ST_MakePoint(126.9785, 37.5670), 4326)
       ])::geography;
```

### 2-8. JPA / Hibernate Spatial Mapping
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
PostGIS functions are not called via JPQL/HQL but via `@Query(nativeQuery = true)` or JPA Criteria SpatialPredicates.
```java
@Query(value = """
    SELECT * FROM courses
    WHERE ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, :radius_m)
    ORDER BY ST_Distance(geom, ST_MakePoint(:lng, :lat)::geography)
    LIMIT 20
    """, nativeQuery = true)
List<Course> findNearby(@Param("lng") double lng, @Param("lat") double lat, @Param("radius_m") int radiusM);
```

### 2-9. Encoded Polyline ↔ DB Conversion
Compress API responses to a single line of text (~3KB), but store in the DB as a LINESTRING → keep conversion helpers in the backend.
```java
// decode: encoded string → coordinates → ST_MakeLine
public LineString decodeToLineString(String encoded) {
    List<Coordinate> coords = PolylineEncoder.decode(encoded, 5);
    // ... GeometryFactory.createLineString(coords.toArray(...))
}
// encode: LineString → encoded string
public String encodeFromLineString(LineString line) {
    return PolylineEncoder.encode(line.getCoordinates(), 5);
}
```
`PolylineEncoder` comes from `com.google.maps:google-maps-services` or your own implementation. Precision 5 (5 decimal places) = ±1.1m, precision 6 = ±0.11m (1.5× longer).

### 2-10. Index Strategy
| Query pattern | Index |
|---|---|
| within-radius search (`ST_DWithin`) | **GIST(geom)** required |
| per-user time series (`user_id + started_at`) | B-tree composite |
| active data only (`deleted_at IS NULL`) | partial index (`WHERE deleted_at IS NULL`) |
| course catalog (`difficulty`, `distance_m`) | B-tree single/composite |

> GIST indexes carry INSERT/UPDATE cost. Do not add them to INSERT-heavy tables like raw points (they don't run spatial queries anyway).

## 3. Common Mistakes
- ❌ Keeping only two columns `lat DOUBLE, lng DOUBLE` and computing distance/containment in the application — can't use DB indexes.
- ❌ Putting lat/lng into `GEOMETRY` and calling `ST_Distance` — the unit becomes "degrees". **You must use GEOGRAPHY to get meters**.
- ❌ A GIST index on the raw point table — INSERT cost explodes.
- ❌ Storing polylines only as `TEXT` (WKT strings) — spatial queries impossible.
- ❌ Permanently accumulating raw points without partitioning — billions of rows after a year, vacuum hell.

```sql
-- debugging: detect invalid coordinates / average length / regional stats
SELECT id FROM runs WHERE NOT ST_IsValid(geom::geometry);
SELECT AVG(ST_NumPoints(geom::geometry)) FROM runs;
SELECT COUNT(*) FROM runs
WHERE ST_Intersects(geom::geometry, ST_MakeEnvelope(126.9, 37.5, 127.1, 37.6, 4326));
```

## 4. Checklist
- [ ] Did you use `GEOGRAPHY(..., 4326)` for GPS coordinates (not GEOMETRY)?
- [ ] Did you create a GIST index on columns used for spatial search?
- [ ] Did you do radius search with `ST_DWithin`?
- [ ] Did you partition the raw point table by month and leave out GIST?
- [ ] Did you store polylines as LINESTRING and avoid TEXT-only storage?
