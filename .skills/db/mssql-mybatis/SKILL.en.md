---
name: MSSQL (SQL Server) DB Design Standard (MyBatis Integration)
description: Standard for Microsoft SQL Server table design, T-SQL patterns, IDENTITY/paging (OFFSET·FETCH), and MyBatis Mapper XML integration. Read when designing SQL Server tables or writing T-SQL dynamic queries, paging, or MERGE in MyBatis Mapper XML. Keywords: sqlserver, mssql, T-SQL, jdbc:sqlserver, mybatis, Mapper, SqlSession, IDENTITY, OFFSET, FETCH NEXT, MERGE, NVARCHAR.
rules:
  - "Auto-increment numeric PKs using IDENTITY(1,1)."
  - "Implement paging with the OFFSET ... FETCH NEXT ... ROWS ONLY syntax (SQL Server 2012+)."
  - "Table/column naming and common columns have db-common-conventions as the single source of truth — lowercase plural snake_case, no prefixes (TB_), PascalCase, or abbreviations, logical deletion via deleted_at."
  - "Use NVARCHAR for strings and DATETIME2 for dates (SQL Server-specific types)."
  - "Write T-SQL-specific dynamic queries in MyBatis Mapper XML, and design indexes on the columns used in query conditions."
tags:
  - "sqlserver"
  - "mssql"
  - "T-SQL"
  - "jdbc:sqlserver"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "IDENTITY"
  - "OFFSET"
  - "FETCH NEXT"
  - "MERGE"
  - "NVARCHAR"
---

# 🪟 MSSQL (SQL Server) DB Design Standard (MyBatis Integration)

> Unify SQL Server table design and MyBatis integration. Read this when creating a new table or writing T-SQL paging, dynamic queries, or MERGE in Mapper XML.

## 1. Core Principles
- Auto-increment numeric PKs using `IDENTITY(1,1)`.
- Implement paging with the `OFFSET ... FETCH NEXT ... ROWS ONLY` syntax (SQL Server 2012+).
- **Table/column naming and common columns have `db-common-conventions` as the single source of truth** — lowercase plural `snake_case`, no prefixes (`TB_`), PascalCase, or abbreviations, logical deletion via `deleted_at`.
- Use `NVARCHAR` for strings and `DATETIME2` for dates (SQL Server-specific types).
- Write T-SQL-specific dynamic queries in MyBatis Mapper XML, and design indexes on the columns used in query conditions.

## 2. Rules

### 2-1. Table & Column Naming
Follow `db-common-conventions` for naming and common column specs (lowercase plural `snake_case`). Apply only SQL Server-specific types (`NVARCHAR`·`DATETIME2`·`UNIQUEIDENTIFIER`).

```sql
-- ✅ Recommended — lowercase plural snake_case, full names, common columns + logical deletion
CREATE TABLE users (
    id          UNIQUEIDENTIFIER  DEFAULT NEWID()  NOT NULL,   -- UUID PK
    user_name   NVARCHAR(100)     NOT NULL,
    email       NVARCHAR(255)     NOT NULL,
    created_at  DATETIME2         DEFAULT GETDATE() NOT NULL,
    updated_at  DATETIME2,
    deleted_at  DATETIME2,                                      -- logical deletion: NULL=active
    CONSTRAINT pk_users       PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

-- Table/column descriptions (MS_Description approach)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User',
    @level0type = N'SCHEMA', @level0name = 'dbo',
    @level1type = N'TABLE',  @level1name = 'users';
```

Naming and type rules:
- Table/column: lowercase plural `snake_case`, full names (`db-common-conventions`)
- Strings: ✅ use `NVARCHAR` (prevents Korean text corruption) / ❌ no `VARCHAR`
- Dates: use `DATETIME2` (higher precision than `DATETIME`)
- PK: numbers use `IDENTITY`, UUIDs use `NEWID()` / `NEWSEQUENTIALID()`

### 2-2. IDENTITY Auto-increment
```sql
CREATE TABLE items (
    id          INT           IDENTITY(1,1)   NOT NULL,    -- auto-increment
    item_name   NVARCHAR(200) NOT NULL,
    created_at  DATETIME2     DEFAULT GETDATE() NOT NULL,
    deleted_at  DATETIME2,
    CONSTRAINT pk_items PRIMARY KEY (id)
);

-- Retrieve the generated ID after INSERT
INSERT INTO items (item_name) VALUES (N'Test Product');
SELECT SCOPE_IDENTITY();          -- last IDENTITY value of the current session
-- ✅ Recommended — use the OUTPUT clause
INSERT INTO items (item_name)
OUTPUT INSERTED.id
VALUES (N'Test Product');
```

### 2-3. MyBatis Mapper XML (MSSQL-specific patterns)
Paging uses `OFFSET ... FETCH NEXT`, UPSERT uses `MERGE`, logical deletion fills `deleted_at`. Comparison operators (`<` `>` `&`) must always be escaped or wrapped in `CDATA`.

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

    <!-- MSSQL paging: OFFSET FETCH (SQL Server 2012 or later) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE '%' + #{keyword} + '%'
        </if>
        ORDER BY created_at DESC
        OFFSET #{offset} ROWS
        FETCH NEXT #{limit} ROWS ONLY
    </select>

    <!-- total count -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE '%' + #{keyword} + '%'
        </if>
    </select>

    <!-- INSERT + return generated ID -->
    <insert id="insertItem" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, created_at)
        VALUES (#{itemName}, GETDATE())
    </insert>

    <!-- UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            updated_at = GETDATE()
        </set>
        WHERE id = #{id}
    </update>

    <!-- logical deletion (fill deleted_at) -->
    <update id="deleteItem" parameterType="int">
        UPDATE items
        SET deleted_at = GETDATE()
        WHERE id = #{id}
    </update>

    <!-- MERGE (UPSERT) -->
    <update id="mergeItem" parameterType="com.example.model.Item">
        MERGE INTO items AS T
        USING (SELECT #{id} AS id) AS S
        ON (T.id = S.id)
        WHEN MATCHED THEN
            UPDATE SET T.item_name = #{itemName}, T.updated_at = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (item_name, created_at) VALUES (#{itemName}, GETDATE());
    </update>

    <!-- XML reserved characters: handling < > & -->
    <!-- In MyBatis XML, comparison operators must always use escaping or CDATA -->
    <select id="selectRecentItems" parameterType="int" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        <![CDATA[ AND created_at >= DATEADD(DAY, -#{days}, GETDATE()) ]]>
        ORDER BY created_at DESC
    </select>

</mapper>
```

### 2-4. application.yml + Dependencies
```yaml
spring:
  datasource:
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
    url: jdbc:sqlserver://localhost:1433;databaseName=mydb;encrypt=true;trustServerCertificate=true
    username: sa
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName automatic conversion (snake_case standard)
    default-statement-timeout: 30
```

```groovy
implementation 'com.microsoft.sqlserver:mssql-jdbc:12.4.2.jre11'
```

### 2-5. Frequently Used T-SQL Functions
```sql
-- date
GETDATE()                               -- current datetime
SYSDATETIME()                           -- more precise current time (DATETIME2)
DATEADD(DAY, -7, GETDATE())            -- 7 days ago
DATEDIFF(DAY, start_date, end_date)     -- date difference
FORMAT(GETDATE(), 'yyyy-MM-dd')         -- date format string

-- NULL handling
ISNULL(column, default)                 -- equivalent to Oracle NVL
COALESCE(col1, col2, 'default')         -- ANSI standard, recommended
NULLIF(column, compare_value)           -- returns NULL if equal

-- string
SUBSTRING(column, start, length)
CHARINDEX('keyword', column)            -- equivalent to Oracle INSTR
TRIM(column) / LTRIM / RTRIM
STRING_AGG(column, ',') WITHIN GROUP (ORDER BY column)  -- GROUP_CONCAT (2017+)
CONCAT(col1, N'-', col2)               -- string concatenation (N prefix for Unicode)

-- condition
IIF(condition, true_value, false_value)  -- simple ternary
CASE WHEN condition THEN value ELSE default END

-- analytic functions
ROW_NUMBER() OVER (PARTITION BY group ORDER BY sort)
RANK() / DENSE_RANK()
```

### 2-6. Indexing Strategy
```sql
-- Clustered index: automatically created on the PK (one per table)
-- Nonclustered index: for search optimization
CREATE NONCLUSTERED INDEX idx_items_created_at
    ON items (created_at DESC)
    INCLUDE (item_name);    -- INCLUDE: covering index (adds SELECT columns)

-- Filtered index (active rows only)
CREATE NONCLUSTERED INDEX idx_items_active
    ON items (created_at DESC)
    WHERE deleted_at IS NULL;   -- index only active data → reduced size
```

## 3. Common Mistakes
- Using prefixes (`TB_`), PascalCase, or abbreviations (`UseYn`·`RegDt`) → violates `db-common-conventions`. Use lowercase plural `snake_case`, full names, and `deleted_at`.
- Using `VARCHAR` → Korean text corruption. Use `NVARCHAR` for strings and `N'...'` for literals.
- Writing comparison operators (`<` `>`) directly in Mapper XML → XML parsing error. Use escaping or `CDATA`.
- A leading `%` in a LIKE search on an `NVARCHAR` column → index not used. Consider Full-Text Search or a Filtered Index.
- Omitting `deleted_at IS NULL` in queries → deleted rows are also returned.

## 4. Checklist
- [ ] Do table/column names follow `db-common-conventions` (lowercase plural `snake_case`, full names, `deleted_at`)?
- [ ] Are strings declared as `NVARCHAR` and dates as `DATETIME2`?
- [ ] Are numeric PKs created with `IDENTITY(1,1)` and IDs retrieved via `OUTPUT`/`SCOPE_IDENTITY()`?
- [ ] Is paging done with `OFFSET ... FETCH NEXT`, and is `deleted_at IS NULL` applied in queries?
- [ ] Are comparison operators in Mapper XML handled with escaping/CDATA?
- [ ] Are indexes (covering/filtered as needed) designed on query condition columns?
