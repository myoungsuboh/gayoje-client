---
name: MariaDB/MySQL DB Design Standard (MyBatis Integration)
description: Standard for MariaDB/MySQL table design, AUTO_INCREMENT, paging (LIMIT/OFFSET), and MyBatis Mapper XML integration. Read when designing a MariaDB/MySQL table or writing dynamic queries, paging, or UPSERT in MyBatis Mapper XML. Keywords: mariadb, mysql, mybatis, Mapper, SqlSession, select, insert, update, delete, resultMap, parameterType, AUTO_INCREMENT, LIMIT, OFFSET.
rules:
  - "Generate numeric PKs with AUTO_INCREMENT (BIGINT recommended)."
  - "Implement paging with LIMIT / OFFSET."
  - "Table/column naming and common columns have a single source of truth in db-common-conventions — lowercase plural snake_case, no prefixes (tb_) or abbreviations, logical deletion via deleted_at (nullable). This document covers only MariaDB/MySQL-specific syntax."
  - "Write MariaDB/MySQL-specific dynamic queries in MyBatis Mapper XML."
  - "Design indexes on the columns used in query conditions."
tags:
  - "mariadb"
  - "mysql"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "select"
  - "insert"
  - "update"
  - "delete"
  - "resultMap"
  - "parameterType"
  - "AUTO_INCREMENT"
  - "LIMIT"
  - "OFFSET"
  - "<select"
  - "<insert"
  - "<update"
  - "<delete"
---

# 🐬 MariaDB / MySQL DB Design Standard (MyBatis Integration)

> Unifies MariaDB/MySQL table design and the MyBatis integration approach. Read when creating a new table or writing paging, dynamic queries, or UPSERT in Mapper XML.

## 1. Core Principles
- Generate numeric PKs with `AUTO_INCREMENT` (`BIGINT` recommended).
- Implement paging with `LIMIT / OFFSET`.
- **Table/column naming and common columns have a single source of truth in `db-common-conventions`** — lowercase plural `snake_case`, no prefixes (`tb_`) or abbreviations, logical deletion via `deleted_at` (nullable). This document covers only MariaDB/MySQL-specific syntax.
- Write MariaDB/MySQL-specific dynamic queries in MyBatis Mapper XML.
- Design indexes on the columns used in query conditions.

## 2. Rules

### 2-1. Table & Column Naming
Tables are lowercase plural `snake_case` (beware of case sensitivity on the Linux filesystem). Always specify the engine and charset. Follow `db-common-conventions` for naming and common-column specifications.

```sql
-- ✅ Recommended — InnoDB + utf8mb4, lowercase plural snake_case, common columns + logical deletion
CREATE TABLE users (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    user_name   VARCHAR(100)    NOT NULL,
    email       VARCHAR(255)    NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT NOW(),
    updated_at  DATETIME        NULL ON UPDATE NOW(),         -- auto-refresh on update
    deleted_at  DATETIME        NULL,                          -- logical deletion: NULL = active
    PRIMARY KEY (id),
    UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users COMMENT = 'user';
```

Key settings:
- `ENGINE=InnoDB`: transaction and foreign-key support (always specify)
- `CHARSET=utf8mb4`: full support for Korean including emoji (`utf8` cannot store emoji)
- `COLLATE=utf8mb4_unicode_ci`: case-insensitive comparison (ci = case insensitive)

> If you need a UUID PK, use `id VARCHAR(36) NOT NULL DEFAULT (UUID())`. For the full specification of common columns (`created_by`, `updated_by`, `deleted_by`, etc.), follow `db-common-conventions`.

### 2-2. AUTO_INCREMENT (numeric PK)
```sql
-- ✅ Recommended — BIGINT AUTO_INCREMENT (safer than INT's 2.1-billion limit)
CREATE TABLE items (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    item_name   VARCHAR(200)    NOT NULL,
    price       DECIMAL(15, 2)  NOT NULL DEFAULT 0,
    created_at  DATETIME        NOT NULL DEFAULT NOW(),
    updated_at  DATETIME        NULL ON UPDATE NOW(),
    deleted_at  DATETIME        NULL,
    PRIMARY KEY (id),
    KEY idx_items_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2-3. MyBatis Mapper XML (MariaDB/MySQL-specific patterns)
Paging uses `LIMIT ? OFFSET ?`, INSERT recovers the PK with `useGeneratedKeys`, UPSERT uses `ON DUPLICATE KEY UPDATE`, and logical deletion fills `deleted_at` while queries filter with `deleted_at IS NULL`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.dao.ItemDao">

    <resultMap id="itemResultMap" type="com.example.model.Item">
        <id     property="id"        column="id"/>
        <result property="itemName"  column="item_name"/>
        <result property="price"     column="price"/>
        <result property="createdAt" column="created_at"/>
    </resultMap>

    <!-- LIMIT OFFSET paging (query only live rows) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, price, created_at
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
        ORDER BY created_at DESC
        LIMIT #{limit} OFFSET #{offset}
    </select>

    <!-- Total count -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
    </select>

    <!-- INSERT + return generated PK -->
    <insert id="insertItem" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, price, created_at)
        VALUES (#{itemName}, #{price}, NOW())
    </insert>

    <!-- INSERT IGNORE (ignore duplicates) -->
    <insert id="insertItemIgnore" parameterType="com.example.model.Item">
        INSERT IGNORE INTO items (item_name, price)
        VALUES (#{itemName}, #{price})
    </insert>

    <!-- UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            <if test="price != null">price = #{price},</if>
            updated_at = NOW()
        </set>
        WHERE id = #{id}
    </update>

    <!-- Logical deletion (fill deleted_at) -->
    <update id="deleteItem" parameterType="long">
        UPDATE items
        SET deleted_at = NOW()
        WHERE id = #{id}
    </update>

    <!-- ON DUPLICATE KEY UPDATE (UPSERT) -->
    <insert id="upsertItem" parameterType="com.example.model.Item">
        INSERT INTO items (id, item_name, price)
        VALUES (#{id}, #{itemName}, #{price})
        ON DUPLICATE KEY UPDATE
            item_name = VALUES(item_name),
            price     = VALUES(price),
            updated_at = NOW()
    </insert>

    <!-- IN clause (foreach) -->
    <select id="selectItemsByIds" parameterType="list" resultMap="itemResultMap">
        SELECT id, item_name, price
        FROM items
        WHERE id IN
        <foreach collection="list" item="id" open="(" separator="," close=")">
            #{id}
        </foreach>
        AND deleted_at IS NULL
    </select>

    <!-- Batch INSERT -->
    <insert id="insertItemBatch" parameterType="list">
        INSERT INTO items (item_name, price, created_at)
        VALUES
        <foreach collection="list" item="item" separator=",">
            (#{item.itemName}, #{item.price}, NOW())
        </foreach>
    </insert>

</mapper>
```

### 2-4. application.yml + dependencies
```yaml
spring:
  datasource:
    driver-class-name: org.mariadb.jdbc.Driver   # MariaDB-specific driver
    # driver-class-name: com.mysql.cj.jdbc.Driver  # when using MySQL
    url: jdbc:mariadb://localhost:3306/mydb?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName automatic conversion
    default-statement-timeout: 30
```

```groovy
// MariaDB
implementation 'org.mariadb.jdbc:mariadb-java-client:3.3.2'
// when using MySQL
implementation 'com.mysql:mysql-connector-j:8.3.0'
```

### 2-5. Frequently Used Functions
```sql
-- Dates
NOW()                               -- current date-time
CURDATE()                           -- today's date (no time)
DATE_ADD(NOW(), INTERVAL -7 DAY)   -- 7 days ago
DATEDIFF(end_date, start_date)      -- date difference (days)
DATE_FORMAT(NOW(), '%Y-%m-%d')     -- date format

-- NULL handling
IFNULL(column, default)            -- equivalent to Oracle NVL
COALESCE(col1, col2, 'default')    -- ANSI standard
NULLIF(column, compare_value)

-- Strings
SUBSTRING(column, start, length)
LOCATE('search_term', column)
TRIM(column) / LTRIM / RTRIM
GROUP_CONCAT(column ORDER BY column SEPARATOR ',')   -- group concatenation
CONCAT(col1, '-', col2)

-- Conditions
IF(condition, true_value, false_value)
CASE WHEN condition THEN value ELSE default END
ELT(index, value1, value2, value3)        -- index-based selection

-- Window functions (MariaDB 10.2+, MySQL 8.0+)
ROW_NUMBER() OVER (PARTITION BY group ORDER BY sort)
RANK() / DENSE_RANK()
```

### 2-6. Index Strategy
```sql
-- Single index
ALTER TABLE items ADD INDEX idx_items_created_at (created_at DESC);

-- Composite index (optimizes querying active rows)
ALTER TABLE items ADD INDEX idx_items_active_created (deleted_at, created_at DESC);

-- Full-text search index (alternative to LIKE search)
ALTER TABLE items ADD FULLTEXT INDEX ft_items_name (item_name)
    WITH PARSER ngram;   -- Korean segmentation: the ngram parser is required

-- Full-text search query
SELECT * FROM items
WHERE MATCH(item_name) AGAINST('search_term' IN BOOLEAN MODE)
  AND deleted_at IS NULL;
```

## 3. Common Mistakes
- Not specifying engine/charset → garbled emoji/Korean, no transaction support.
- Using an `INT` PK → risk of hitting the 2.1-billion limit (`BIGINT` recommended).
- Prefixes (`tb_`), abbreviations (`user_nm`, `reg_dt`), `use_yn 'Y'/'N'` flags → violate `db-common-conventions`. Use full names and `deleted_at`.
- Omitting `deleted_at IS NULL` in queries → deleted rows are also returned.
- Not checking `lower_case_table_names` → query failures from table-name case sensitivity on Linux. When deploying with Docker, specify it in `my.cnf`.
- A leading `%` in a LIKE search → index not used (consider a full-text search index).

## 4. Checklist
- [ ] Tables = lowercase plural `snake_case`, columns = full names, common columns and `deleted_at` applied? (`db-common-conventions`)
- [ ] Did you specify `ENGINE=InnoDB`, `CHARSET=utf8mb4`, and `COLLATE` on the table?
- [ ] Did you create numeric PKs as `BIGINT AUTO_INCREMENT`?
- [ ] Did you implement paging with `LIMIT / OFFSET` and apply `deleted_at IS NULL` to queries?
- [ ] Did you recover the PK with `useGeneratedKeys` on INSERT?
- [ ] Did you design indexes on the columns used in query conditions?
- [ ] Did you check the `lower_case_table_names` setting?
