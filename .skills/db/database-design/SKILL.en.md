---
name: PostgreSQL + TimescaleDB Design (Time-Series Domain)
description: A PostgreSQL + TimescaleDB-specific design guide for time-series data (IIoT sensors/events). Read this when designing hypertables, indexes, MyBatis mappings, and Flyway migrations. For general RDBMS naming and column conventions, db-common-conventions is the single source of truth. Keywords: primary key, foreign key, normalize, snake_case, schema, constraint, hypertable, TimescaleDB.
rules:
  - "Store time-series sensor and event data in PostgreSQL + TimescaleDB hypertables."
  - "Follow the db-common-conventions standard for table and column naming."
  - "Include common columns such as creation/update timestamps in every table."
  - "Design composite indexes that match the query patterns."
  - "Manage DB schema changes as versioned artifacts via Flyway migrations."
tags:
  - "primary key"
  - "foreign key"
  - "normalize"
  - "snake_case"
  - "schema"
  - "constraint"
  - "hypertable"
  - "TimescaleDB"
---

# 🐘 PostgreSQL + TimescaleDB Design

> Design time-series sensor and event data with PostgreSQL + TimescaleDB. Read this when designing hypertables, indexes, MyBatis mappings, and Flyway migrations.

> **Single source of truth for common conventions**: RDBMS-agnostic rules such as table/column naming, common columns (`created_at`, etc.), and MyBatis mapping live in the `db-common-conventions` skill. This file covers **PostgreSQL/TimescaleDB-specific content** only. When naming rules conflict with other dialect files (`mariadb-mybatis`, `oracle-mybatis`, etc.), **`db-common-conventions` takes precedence**. Related skills: `transaction-locking` for transactions/locks, `connection-pool-tuning` for HikariCP tuning, `db-migration-flyway` for migrations.

## 1. Core Principles
- Store time-series sensor and event data in PostgreSQL + TimescaleDB hypertables.
- Follow the `db-common-conventions` standard for table and column naming.
- Include common columns such as creation/update timestamps in every table.
- Design composite indexes that match the query patterns.
- Manage DB schema changes as versioned artifacts via Flyway migrations.

## 2. Rules

### 2-1. Table Naming Rules (summary — single source of truth is db-common-conventions)
- Table names: lowercase + `snake_case` + plural. Prefixes (`tb_`, `TB_`) are **forbidden**.
- Column names: lowercase + `snake_case`. Abbreviations (`_nm`, `_dt`, `use_yn`) are **forbidden**.
- Primary Key: `id` per single table, or `<singular>_id` (e.g., `user_id`) when reference clarity is needed.
- The mapping between Java field names (camelCase) and DB column names (snake_case) is handled automatically by `mybatis.configuration.map-underscore-to-camel-case: true`.

```sql
-- ✅ Good example
CREATE TABLE asset_masters (
    asset_master_id BIGSERIAL       PRIMARY KEY,
    tag_id          VARCHAR(50)     NOT NULL UNIQUE,
    asset_name      VARCHAR(200)    NOT NULL,
    deck_id         VARCHAR(20),
    sap_asset_id    VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ                              -- Soft delete: NULL=active
);

-- ❌ Bad example (singular, mixed uppercase)
CREATE TABLE AssetMaster (
    id      INT PRIMARY KEY,
    TagId   VARCHAR(50)
);
```

### 2-2. Common Columns (included by default in every table)
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- creation time
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- update time
deleted_at  TIMESTAMPTZ                          -- soft delete: NULL=active (db-common-conventions standard)
```

### 2-3. Index Strategy
Index columns that are frequently used in WHERE conditions. Too many indexes slow down INSERT/UPDATE, so create only the ones you truly need.
```sql
-- Single-column index
CREATE INDEX idx_assets_tag_id ON asset_masters(tag_id);

-- Composite index (when two columns are queried together)
CREATE INDEX idx_sensors_deck_time ON sensor_time_series(deck_id, measured_at DESC);

-- Partial index (only non-deleted data)
CREATE INDEX idx_assets_active ON asset_masters(tag_id) WHERE deleted_at IS NULL;
```

### 2-4. TimescaleDB Time-Series Data Handling
Use TimescaleDB hypertables for data that accumulates in chronological order, such as sensor data.
```sql
-- 1. Create the regular table first
CREATE TABLE sensor_time_series (
    sensor_id    VARCHAR(50)      NOT NULL,
    deck_id      VARCHAR(20)      NOT NULL,
    value        DOUBLE PRECISION,
    unit         VARCHAR(20),
    measured_at  TIMESTAMPTZ      NOT NULL
);

-- 2. Convert to a hypertable (auto-partitioned by the time column)
SELECT create_hypertable('sensor_time_series', 'measured_at');

-- 3. Add Deck ID-based space partitioning (improves query performance)
SELECT add_dimension('sensor_time_series', 'deck_id', number_partitions => 8);

-- 4. Data retention policy (auto-delete after 2 years)
SELECT add_retention_policy('sensor_time_series', INTERVAL '2 years');
```

### 2-5. Linking MyBatis Mapper XML with DB Columns
Map DB column names (snake_case) to Java field names (camelCase) explicitly with `<resultMap>`. Setting `map-underscore-to-camel-case: true` in `application.yml` handles conversion automatically, but for complex queries or JOINs, writing the `<resultMap>` directly is clearer.
```xml
<!-- Basic ResultMap -->
<resultMap id="assetResultMap" type="com.harness.dto.response.AssetResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <result property="deckId"    column="deck_id" />
    <result property="sapAssetId" column="sap_asset_id" />
    <result property="createdAt" column="created_at" />
</resultMap>

<!-- With a JOIN - map the associated object with association -->
<resultMap id="assetDetailResultMap" type="com.harness.dto.response.AssetDetailResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <!-- Associated object (1:1) -->
    <association property="sensorInfo" javaType="com.harness.dto.response.SensorInfoResponse">
        <result property="sensorId"   column="sensor_id" />
        <result property="protocol"   column="protocol" />
    </association>
    <!-- Associated collection (1:N) -->
    <collection property="anomalyEvents" ofType="com.harness.dto.response.AnomalyEventResponse">
        <result property="eventId"    column="event_id" />
        <result property="score"      column="anomaly_score" />
    </collection>
</resultMap>
```

### 2-6. Dynamic Query Pattern (MyBatis)
How to write a dynamic query that adds a WHERE clause only when search conditions are present.
```xml
<!-- Take a search-condition DTO and build the query dynamically -->
<select id="findByCondition" parameterType="com.harness.dto.request.AssetSearchRequest"
        resultMap="assetResultMap">
    SELECT asset_master_id
         , tag_id
         , asset_name
         , deck_id
      FROM asset_masters
     <where>
           deleted_at IS NULL
        <if test="deckId != null and deckId != ''">
           AND deck_id = #{deckId}
        </if>
        <if test="keyword != null and keyword != ''">
           AND asset_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
        <if test="sapAssetId != null and sapAssetId != ''">
           AND sap_asset_id = #{sapAssetId}
        </if>
     </where>
     ORDER BY created_at DESC
    <if test="limit != null">
     LIMIT #{limit} OFFSET #{offset}
    </if>
</select>

<!-- Dynamic IN clause handling -->
<select id="findByDeckIds" resultMap="assetResultMap">
    SELECT asset_master_id, tag_id, asset_name, deck_id
      FROM asset_masters
     WHERE deck_id IN
    <foreach item="deckId" collection="deckIds" open="(" separator="," close=")">
        #{deckId}
    </foreach>
       AND deleted_at IS NULL
</select>
```

### 2-7. Flyway Migrations (DB Schema Version Control)
Manage the DB schema change history as code. Do not run SQL files against the DB directly. Filename convention: `V{version}__{description}.sql` (two underscores).
```
src/main/resources/db/migration/
├── V1__create_asset_masters.sql
├── V2__create_sensor_time_series.sql
├── V3__add_sap_asset_id_to_assets.sql
└── V4__create_audit_logs.sql
```
```sql
-- V1__create_asset_masters.sql
CREATE TABLE asset_masters (
    asset_master_id BIGSERIAL    PRIMARY KEY,
    tag_id          VARCHAR(50)  NOT NULL UNIQUE,
    asset_name      VARCHAR(200) NOT NULL,
    deck_id         VARCHAR(20),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_assets_tag_id ON asset_masters(tag_id);
```

## 3. Common Mistakes
- Using prefixes/abbreviations on tables/columns → violates the `db-common-conventions` standard.
- Loading time-series data into a regular table → performance/capacity problems from the lack of partitioning/retention policies.
- Overusing indexes → degrades INSERT/UPDATE performance.
- Running SQL files against the DB directly → no schema version control, inconsistency across environments.

## 4. Checklist
- [ ] Do naming and common columns follow the `db-common-conventions` standard?
- [ ] Did you turn time-series data into a hypertable and set partitioning/retention policies?
- [ ] Did you design composite/partial indexes that match the query patterns (no unnecessary indexes)?
- [ ] Does the MyBatis `<resultMap>` mapping match the column names?
- [ ] Are schema changes managed via Flyway migrations (`V{version}__{description}.sql`)?
