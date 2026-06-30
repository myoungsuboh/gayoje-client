---
name: Oracle DB Design Standard (MyBatis Integration)
description: Standard for Oracle table design, naming, sequence/trigger patterns, and MyBatis Mapper XML integration. Read when designing Oracle tables, writing paging/UPSERT/dynamic queries with MyBatis, or designing indexes. Keywords: oracle, ojdbc, jdbc:oracle, mybatis, Mapper, SqlSession, ROWNUM, OFFSET FETCH, sequence, MERGE.
rules:
  - "Generate auto-increment IDs with a sequence, and fill them via a trigger when needed (12c+ supports GENERATED AS IDENTITY)."
  - "Implement paging with ROWNUM (before 12c) or OFFSET/FETCH (12c+) syntax."
  - "Table/column naming and common columns have db-common-conventions as the single source of truth — lowercase plural snake_case, no prefixes (TB_), uppercase, or abbreviations, logical deletion via deleted_at. (Oracle stores unquoted identifiers in uppercase, but notation/mapping is unified as lowercase snake_case.)"
  - "Write Oracle-specific dynamic queries in MyBatis Mapper XML."
  - "Design indexes on the columns used in query conditions (equality conditions first, range conditions later)."
tags:
  - "oracle"
  - "ojdbc"
  - "jdbc:oracle"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "ROWNUM"
  - "OFFSET FETCH"
  - "sequence"
  - "MERGE"
---

# 🗄️ Oracle DB Design Standard (MyBatis Integration)

> Unify Oracle table design and MyBatis Mapper XML integration. Read this when creating Oracle tables or writing/modifying MyBatis queries.

## 1. Core Principles
- Generate auto-increment IDs with a sequence, and fill them via a trigger when needed (12c+ supports `GENERATED AS IDENTITY`).
- Implement paging with ROWNUM (before 12c) or OFFSET/FETCH (12c+) syntax.
- **Table/column naming and common columns have `db-common-conventions` as the single source of truth** — lowercase plural `snake_case`, no prefixes (`TB_`), uppercase, or abbreviations, logical deletion via `deleted_at`. (Oracle stores unquoted identifiers in uppercase, but notation/mapping is unified as lowercase `snake_case`.)
- Write Oracle-specific dynamic queries in MyBatis Mapper XML.
- Design indexes on the columns used in query conditions (equality conditions first, range conditions later).

## 2. Rules

### 2-1. Table & Column Naming
Follow `db-common-conventions` for naming and common column specs (lowercase plural `snake_case`, full names, logical deletion `deleted_at`). Below is an example applying Oracle types and sequences.

```sql
-- ✅ Recommended — lowercase plural snake_case, full names, common columns + logical deletion
CREATE TABLE users (
    id          VARCHAR2(36)   DEFAULT SYS_GUID() NOT NULL,   -- UUID PK
    user_name   VARCHAR2(100)  NOT NULL,
    email       VARCHAR2(255)  NOT NULL,
    created_at  DATE           DEFAULT SYSDATE NOT NULL,
    updated_at  DATE,
    deleted_at  DATE,                                          -- logical deletion: NULL=active
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

COMMENT ON TABLE users IS 'User';
COMMENT ON COLUMN users.id IS 'User ID';
```

- Table: lowercase plural `snake_case` (no prefixes or uppercase)
- Constraints: PK `pk_table`, UK `ux_table_column`, FK `fk_table_referencedtable`
- Common columns: `created_at`/`updated_at`/`created_by`/`updated_by`/`deleted_at`/`deleted_by` — spec in `db-common-conventions`

### 2-2. Sequence (Auto-increment ID)
```sql
-- ✅ Use a sequence when a numeric PK is needed
CREATE SEQUENCE seq_items
    START WITH 1
    INCREMENT BY 1
    NOCACHE
    NOCYCLE;

CREATE TABLE items (
    id          NUMBER         DEFAULT seq_items.NEXTVAL NOT NULL,
    item_name   VARCHAR2(200)  NOT NULL,
    created_at  DATE           DEFAULT SYSDATE NOT NULL,
    deleted_at  DATE,
    CONSTRAINT pk_items PRIMARY KEY (id)
);

-- ✅ Oracle 12c or later: an IDENTITY column can be used
-- id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

### 2-3. MyBatis Mapper XML — Oracle-specific patterns
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.dao.ItemDao">

    <resultMap id="itemResultMap" type="com.example.model.Item">
        <id     property="id"        column="id"/>
        <result property="itemName"  column="item_name"/>
        <result property="createdAt" column="created_at"/>
    </resultMap>

    <!-- ✅ Oracle: ROWNUM-based paging (before 12c) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT *
        FROM (
            SELECT A.*, ROWNUM AS rnum
            FROM (
                SELECT id, item_name, created_at
                FROM items
                WHERE deleted_at IS NULL
                <if test="keyword != null and keyword != ''">
                    AND item_name LIKE '%' || #{keyword} || '%'
                </if>
                ORDER BY created_at DESC
            ) A
            WHERE ROWNUM &lt;= #{endRow}
        )
        WHERE rnum &gt; #{startRow}
    </select>

    <!-- ✅ Oracle 12c or later: OFFSET FETCH paging -->
    <select id="selectItemListV2" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        OFFSET #{offset} ROWS FETCH NEXT #{limit} ROWS ONLY
    </select>

    <!-- ✅ INSERT: using a sequence -->
    <insert id="insertItem" parameterType="com.example.model.Item">
        <selectKey keyProperty="id" resultType="long" order="BEFORE">
            SELECT seq_items.NEXTVAL FROM DUAL
        </selectKey>
        INSERT INTO items (id, item_name, created_at)
        VALUES (#{id}, #{itemName}, SYSDATE)
    </insert>

    <!-- ✅ INSERT: when using GENERATED AS IDENTITY -->
    <insert id="insertItemAuto" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, created_at)
        VALUES (#{itemName}, SYSDATE)
    </insert>

    <!-- ✅ UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            updated_at = SYSDATE
        </set>
        WHERE id = #{id}
    </update>

    <!-- ✅ logical deletion (fill deleted_at) -->
    <update id="deleteItem" parameterType="long">
        UPDATE items
        SET deleted_at = SYSDATE
        WHERE id = #{id}
    </update>

    <!-- ✅ MERGE INTO (UPSERT) -->
    <update id="mergeItem" parameterType="com.example.model.Item">
        MERGE INTO items T
        USING DUAL
        ON (T.id = #{id})
        WHEN MATCHED THEN
            UPDATE SET T.item_name = #{itemName}, T.updated_at = SYSDATE
        WHEN NOT MATCHED THEN
            INSERT (id, item_name, created_at)
            VALUES (seq_items.NEXTVAL, #{itemName}, SYSDATE)
    </update>

</mapper>
```

### 2-4. application.yml Oracle Configuration
```yaml
spring:
  datasource:
    driver-class-name: oracle.jdbc.OracleDriver
    url: jdbc:oracle:thin:@//localhost:1521/XEPDB1   # service name style
    # url: jdbc:oracle:thin:@localhost:1521:ORCL     # SID style (legacy)
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000
      idle-timeout: 600000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName automatic conversion
    default-fetch-size: 100
    default-statement-timeout: 30
```

> With `map-underscore-to-camel-case: true`, automatic mapping is possible even without a resultMap.

### 2-5. Frequently Used Oracle Functions
```sql
-- date formatting
TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
TO_DATE('2024-01-01', 'YYYY-MM-DD')
TRUNC(SYSDATE)          -- today 00:00:00
SYSDATE - 7             -- 7 days ago

-- NULL handling
NVL(column, default)
NVL2(column, value_when_not_null, value_when_null)
COALESCE(col1, col2, 'default')  -- ANSI standard, recommended

-- string
SUBSTR(column, start, length)
INSTR(column, 'keyword')
TRIM(column) / LTRIM / RTRIM
LISTAGG(column, ',') WITHIN GROUP (ORDER BY column)  -- GROUP_CONCAT

-- condition
DECODE(column, 'A', 'a', 'B', 'b', 'other')  -- simple form of CASE WHEN
CASE WHEN condition THEN value ELSE default END

-- analytic functions (window)
ROW_NUMBER() OVER (PARTITION BY group_column ORDER BY sort_column)
RANK() / DENSE_RANK()
SUM(amount) OVER (PARTITION BY month ORDER BY day ROWS UNBOUNDED PRECEDING)
```

### 2-6. Indexing Strategy
```sql
-- ✅ single index
CREATE INDEX idx_items_created_at ON items (created_at DESC);

-- ✅ composite index (optimized for active-row queries: equality → range order)
CREATE INDEX idx_items_active_created ON items (deleted_at, created_at DESC);

-- ✅ function-based index (optimized for LIKE search)
CREATE INDEX idx_items_name_upper ON items (UPPER(item_name));
```

> In the WHERE clause, place equality conditions first and range conditions later. A standalone index on a low-cardinality column is inefficient → place it at the front of a composite index.

## 3. Common Mistakes
- Using prefixes (`TB_`), uppercase, or abbreviations (`USE_YN`·`REG_DT`) → violates `db-common-conventions`. Use lowercase plural `snake_case`, full names, and `deleted_at`.
- Assigning IDs in the application without a sequence → concurrency conflicts.
- Not placing ORDER BY inside the inline view in ROWNUM paging → broken sorting.
- Creating a standalone index on a low-cardinality column → inefficient.
- Turning off `map-underscore-to-camel-case` and also having no resultMap → missing mappings.

## 4. Checklist
- [ ] Do table/column names follow `db-common-conventions` (lowercase plural `snake_case`, full names, `deleted_at`)?
- [ ] Are auto-increment IDs generated with a sequence or IDENTITY?
- [ ] Is paging implemented with ROWNUM/OFFSET FETCH syntax, and is `deleted_at IS NULL` applied in queries?
- [ ] Are indexes designed on query condition columns (equality → range order)?
- [ ] Are common patterns such as logical deletion and UPSERT unified through the Mapper?
