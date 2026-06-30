---
name: PostgreSQL + TimescaleDB 设计 (时序领域)
description: 处理时序数据(IIoT 传感器/事件)的 PostgreSQL + TimescaleDB 专用设计指南。在设计超表、索引、MyBatis 映射、Flyway 迁移时阅读。通用 RDBMS 的命名与列约定以 db-common-conventions 为单一来源。关键词: primary key, foreign key, normalize, snake_case, schema, constraint, hypertable, TimescaleDB。
rules:
  - "时序传感器与事件数据存储在 PostgreSQL + TimescaleDB 超表中。"
  - "表与列的命名遵循 db-common-conventions 标准。"
  - "在每张表中都包含创建/修改时间等公共列。"
  - "依据查询模式设计复合索引。"
  - "DB 模式变更通过 Flyway 迁移进行版本管理。"
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

# 🐘 PostgreSQL + TimescaleDB 设计

> 用 PostgreSQL + TimescaleDB 设计时序传感器与事件数据。在设计超表、索引、MyBatis 映射、Flyway 迁移时阅读。

> **公共约定的单一来源**: 表/列命名、公共列(`created_at` 等)、MyBatis 映射等与 RDBMS 无关的规则位于 `db-common-conventions` 技能中。本文件仅涵盖 **PostgreSQL/TimescaleDB 特有内容**。当命名规则与其他方言文件(`mariadb-mybatis`、`oracle-mybatis` 等)冲突时,**以 `db-common-conventions` 为准**。相关技能: 事务/锁见 `transaction-locking`,HikariCP 调优见 `connection-pool-tuning`,迁移见 `db-migration-flyway`。

## 1. 核心原则
- 时序传感器与事件数据存储在 PostgreSQL + TimescaleDB 超表中。
- 表与列的命名遵循 `db-common-conventions` 标准。
- 在每张表中都包含创建/修改时间等公共列。
- 依据查询模式设计复合索引。
- DB 模式变更通过 Flyway 迁移进行版本管理。

## 2. 规则

### 2-1. 表命名规则 (摘要 — 单一来源为 db-common-conventions)
- 表名: 小写 + `snake_case` + 复数形式。**禁止**前缀(`tb_`、`TB_`)。
- 列名: 小写 + `snake_case`。**禁止**缩写(`_nm`、`_dt`、`use_yn`)。
- Primary Key: 单表单位用 `id`,或在需要明确引用时用 `<单数>_id`(例: `user_id`)。
- Java 字段名(camelCase)↔ DB 列名(snake_case)的映射通过 `mybatis.configuration.map-underscore-to-camel-case: true` 自动处理。

```sql
-- ✅ 好的示例
CREATE TABLE asset_masters (
    asset_master_id BIGSERIAL       PRIMARY KEY,
    tag_id          VARCHAR(50)     NOT NULL UNIQUE,
    asset_name      VARCHAR(200)    NOT NULL,
    deck_id         VARCHAR(20),
    sap_asset_id    VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ                              -- 逻辑删除: NULL=有效
);

-- ❌ 坏的示例 (单数形式、大小写混用)
CREATE TABLE AssetMaster (
    id      INT PRIMARY KEY,
    TagId   VARCHAR(50)
);
```

### 2-2. 公共列 (默认包含于每张表)
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 创建时间
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 修改时间
deleted_at  TIMESTAMPTZ                          -- 逻辑删除: NULL=有效 (db-common-conventions 标准)
```

### 2-3. 索引策略
对经常用于 WHERE 条件的列建立索引。索引过多会拖慢 INSERT/UPDATE,因此只建确实需要的。
```sql
-- 单列索引
CREATE INDEX idx_assets_tag_id ON asset_masters(tag_id);

-- 复合索引 (两列一起查询时)
CREATE INDEX idx_sensors_deck_time ON sensor_time_series(deck_id, measured_at DESC);

-- 部分索引 (仅未删除的数据)
CREATE INDEX idx_assets_active ON asset_masters(tag_id) WHERE deleted_at IS NULL;
```

### 2-4. TimescaleDB 时序数据处理
像传感器数据这样按时间顺序累积的数据使用 TimescaleDB 的超表。
```sql
-- 1. 先创建普通表
CREATE TABLE sensor_time_series (
    sensor_id    VARCHAR(50)      NOT NULL,
    deck_id      VARCHAR(20)      NOT NULL,
    value        DOUBLE PRECISION,
    unit         VARCHAR(20),
    measured_at  TIMESTAMPTZ      NOT NULL
);

-- 2. 转换为超表 (按时间列自动分区)
SELECT create_hypertable('sensor_time_series', 'measured_at');

-- 3. 添加基于 Deck ID 的空间分区 (提升查询性能)
SELECT add_dimension('sensor_time_series', 'deck_id', number_partitions => 8);

-- 4. 数据保留策略 (2 年后自动删除)
SELECT add_retention_policy('sensor_time_series', INTERVAL '2 years');
```

### 2-5. MyBatis Mapper XML 与 DB 列的联动
DB 列名(snake_case)与 Java 字段名(camelCase)通过 `<resultMap>` 显式映射。在 `application.yml` 中设置 `map-underscore-to-camel-case: true` 可自动转换,但当存在复杂查询或 JOIN 时,直接编写 `<resultMap>` 更清晰。
```xml
<!-- 基础 ResultMap -->
<resultMap id="assetResultMap" type="com.harness.dto.response.AssetResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <result property="deckId"    column="deck_id" />
    <result property="sapAssetId" column="sap_asset_id" />
    <result property="createdAt" column="created_at" />
</resultMap>

<!-- 存在 JOIN 时 - 用 association 映射关联对象 -->
<resultMap id="assetDetailResultMap" type="com.harness.dto.response.AssetDetailResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <!-- 关联对象 (1:1) -->
    <association property="sensorInfo" javaType="com.harness.dto.response.SensorInfoResponse">
        <result property="sensorId"   column="sensor_id" />
        <result property="protocol"   column="protocol" />
    </association>
    <!-- 关联集合 (1:N) -->
    <collection property="anomalyEvents" ofType="com.harness.dto.response.AnomalyEventResponse">
        <result property="eventId"    column="event_id" />
        <result property="score"      column="anomaly_score" />
    </collection>
</resultMap>
```

### 2-6. 动态查询模式 (MyBatis)
仅在存在搜索条件时才追加 WHERE 子句的动态查询写法。
```xml
<!-- 接收搜索条件 DTO 并动态生成查询 -->
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

<!-- IN 子句的动态处理 -->
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

### 2-7. Flyway 迁移 (DB 版本管理)
用代码管理 DB 模式的变更历史。不要直接对 DB 执行 SQL 文件。文件名规则: `V{版本}__{说明}.sql`(两个下划线)。
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

## 3. 常见错误
- 对表/列使用前缀或缩写 → 违反 `db-common-conventions` 标准。
- 将时序数据放入普通表 → 因缺乏分区/保留策略导致性能与容量问题。
- 滥用索引 → 降低 INSERT/UPDATE 性能。
- 直接对 DB 执行 SQL 文件 → 无法进行模式版本管理,环境间不一致。

## 4. 检查清单
- [ ] 命名与公共列是否遵循 `db-common-conventions` 标准
- [ ] 是否将时序数据做成超表并设置了分区/保留策略
- [ ] 是否依据查询模式设计了复合/部分索引(有无不必要的索引)
- [ ] MyBatis `<resultMap>` 映射是否与列名一致
- [ ] 是否通过 Flyway 迁移(`V{版本}__{说明}.sql`)管理模式变更
