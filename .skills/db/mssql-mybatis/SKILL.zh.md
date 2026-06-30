---
name: MSSQL(SQL Server) 数据库设计标准 (MyBatis 集成)
description: Microsoft SQL Server 表设计、T-SQL 模式、IDENTITY/分页(OFFSET·FETCH)与 MyBatis Mapper XML 集成的标准。在设计 SQL Server 表，或在 MyBatis Mapper XML 中编写 T-SQL 动态查询、分页、MERGE 时阅读。关键词: sqlserver, mssql, T-SQL, jdbc:sqlserver, mybatis, Mapper, SqlSession, IDENTITY, OFFSET, FETCH NEXT, MERGE, NVARCHAR.
rules:
  - "数字 PK 使用 IDENTITY(1,1) 自动递增。"
  - "分页使用 OFFSET ... FETCH NEXT ... ROWS ONLY 语法实现 (SQL Server 2012+)。"
  - "表/列命名和公共列以 db-common-conventions 为唯一来源 — 小写复数形式 snake_case，禁止前缀(TB_)、PascalCase、缩写，逻辑删除使用 deleted_at。"
  - "字符串使用 NVARCHAR，日期使用 DATETIME2 (SQL Server 专有类型)。"
  - "在 MyBatis Mapper XML 中编写 T-SQL 专用动态查询，并在查询条件列上设计索引。"
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

# 🪟 MSSQL (SQL Server) 数据库设计标准 (MyBatis 集成)

> 统一 SQL Server 表设计与 MyBatis 集成方式。在创建新表，或在 Mapper XML 中编写 T-SQL 分页、动态查询、MERGE 时阅读。

## 1. 核心原则
- 数字 PK 使用 `IDENTITY(1,1)` 自动递增。
- 分页使用 `OFFSET ... FETCH NEXT ... ROWS ONLY` 语法实现 (SQL Server 2012+)。
- **表/列命名和公共列以 `db-common-conventions` 为唯一来源** — 小写复数形式 `snake_case`，禁止前缀(`TB_`)、PascalCase、缩写，逻辑删除使用 `deleted_at`。
- 字符串使用 `NVARCHAR`，日期使用 `DATETIME2` (SQL Server 专有类型)。
- 在 MyBatis Mapper XML 中编写 T-SQL 专用动态查询，并在查询条件列上设计索引。

## 2. 规则

### 2-1. 表与列命名
命名和公共列规范遵循 `db-common-conventions`(小写复数形式 `snake_case`)。仅应用 SQL Server 专有类型(`NVARCHAR`·`DATETIME2`·`UNIQUEIDENTIFIER`)。

```sql
-- ✅ 推荐 — 小写复数形式 snake_case、全名、公共列 + 逻辑删除
CREATE TABLE users (
    id          UNIQUEIDENTIFIER  DEFAULT NEWID()  NOT NULL,   -- UUID PK
    user_name   NVARCHAR(100)     NOT NULL,
    email       NVARCHAR(255)     NOT NULL,
    created_at  DATETIME2         DEFAULT GETDATE() NOT NULL,
    updated_at  DATETIME2,
    deleted_at  DATETIME2,                                      -- 逻辑删除: NULL=活跃
    CONSTRAINT pk_users       PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

-- 表/列说明 (MS_Description 方式)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'用户',
    @level0type = N'SCHEMA', @level0name = 'dbo',
    @level1type = N'TABLE',  @level1name = 'users';
```

命名与类型规则:
- 表/列: 小写复数形式 `snake_case`、全名 (`db-common-conventions`)
- 字符串: ✅ 使用 `NVARCHAR` (防止中文乱码) / ❌ 禁止 `VARCHAR`
- 日期: 使用 `DATETIME2` (比 `DATETIME` 精度更高)
- PK: 数字用 `IDENTITY`，UUID 用 `NEWID()` / `NEWSEQUENTIALID()`

### 2-2. IDENTITY 自动递增
```sql
CREATE TABLE items (
    id          INT           IDENTITY(1,1)   NOT NULL,    -- 自动递增
    item_name   NVARCHAR(200) NOT NULL,
    created_at  DATETIME2     DEFAULT GETDATE() NOT NULL,
    deleted_at  DATETIME2,
    CONSTRAINT pk_items PRIMARY KEY (id)
);

-- INSERT 后查询生成的 ID
INSERT INTO items (item_name) VALUES (N'测试商品');
SELECT SCOPE_IDENTITY();          -- 当前会话的最后一个 IDENTITY 值
-- ✅ 推荐 — 使用 OUTPUT 子句
INSERT INTO items (item_name)
OUTPUT INSERTED.id
VALUES (N'测试商品');
```

### 2-3. MyBatis Mapper XML (MSSQL 专用模式)
分页使用 `OFFSET ... FETCH NEXT`，UPSERT 使用 `MERGE`，逻辑删除填充 `deleted_at`。不等号(`<` `>` `&`)必须转义或用 `CDATA` 包裹。

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

    <!-- MSSQL 分页: OFFSET FETCH (SQL Server 2012 以上) -->
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

    <!-- 总条数 -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE '%' + #{keyword} + '%'
        </if>
    </select>

    <!-- INSERT + 返回生成的 ID -->
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

    <!-- 逻辑删除 (填充 deleted_at) -->
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

    <!-- XML 保留字符: < > & 处理 -->
    <!-- 在 MyBatis XML 中不等号必须使用转义或 CDATA -->
    <select id="selectRecentItems" parameterType="int" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        <![CDATA[ AND created_at >= DATEADD(DAY, -#{days}, GETDATE()) ]]>
        ORDER BY created_at DESC
    </select>

</mapper>
```

### 2-4. application.yml + 依赖
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
    map-underscore-to-camel-case: true   # item_name → itemName 自动转换 (snake_case 标准)
    default-statement-timeout: 30
```

```groovy
implementation 'com.microsoft.sqlserver:mssql-jdbc:12.4.2.jre11'
```

### 2-5. 常用 T-SQL 函数
```sql
-- 日期
GETDATE()                               -- 当前日期时间
SYSDATETIME()                           -- 更精确的当前时间 (DATETIME2)
DATEADD(DAY, -7, GETDATE())            -- 7 天前
DATEDIFF(DAY, 起始日, 结束日)           -- 日期差
FORMAT(GETDATE(), 'yyyy-MM-dd')         -- 日期格式字符串

-- NULL 处理
ISNULL(列, 默认值)                     -- 相当于 Oracle NVL
COALESCE(col1, col2, '默认值')         -- ANSI 标准，推荐
NULLIF(列, 比较值)                     -- 相等则返回 NULL

-- 字符串
SUBSTRING(列, 起始, 长度)
CHARINDEX('搜索词', 列)                -- 相当于 Oracle INSTR
TRIM(列) / LTRIM / RTRIM
STRING_AGG(列, ',') WITHIN GROUP (ORDER BY 列)  -- GROUP_CONCAT (2017+)
CONCAT(col1, N'-', col2)               -- 字符串连接 (N 前缀表示 Unicode)

-- 条件
IIF(条件, 真值, 假值)                 -- 简单三元
CASE WHEN 条件 THEN 值 ELSE 默认值 END

-- 分析函数
ROW_NUMBER() OVER (PARTITION BY 分组 ORDER BY 排序)
RANK() / DENSE_RANK()
```

### 2-6. 索引策略
```sql
-- 聚集索引: 自动在 PK 上创建 (每表 1 个)
-- 非聚集索引: 用于搜索优化
CREATE NONCLUSTERED INDEX idx_items_created_at
    ON items (created_at DESC)
    INCLUDE (item_name);    -- INCLUDE: 覆盖索引 (添加 SELECT 列)

-- 筛选索引 (仅活跃行)
CREATE NONCLUSTERED INDEX idx_items_active
    ON items (created_at DESC)
    WHERE deleted_at IS NULL;   -- 仅索引活跃数据 → 减小体积
```

## 3. 常见错误
- 使用前缀(`TB_`)、PascalCase、缩写(`UseYn`·`RegDt`) → 违反 `db-common-conventions`。使用小写复数形式 `snake_case`、全名、`deleted_at`。
- 使用 `VARCHAR` → 中文乱码。字符串用 `NVARCHAR`，字面量用 `N'...'`。
- 在 Mapper XML 中直接编写不等号(`<` `>`) → XML 解析错误。使用转义或 `CDATA`。
- 在 `NVARCHAR` 列的 LIKE 搜索中前置 `%` → 不使用索引。考虑全文搜索(Full-Text Search)或 Filtered Index。
- 查询中遗漏 `deleted_at IS NULL` → 连已删除的行也被查询出来。

## 4. 检查清单
- [ ] 表/列命名是否遵循 `db-common-conventions`(小写复数形式 `snake_case`、全名、`deleted_at`)
- [ ] 是否将字符串声明为 `NVARCHAR`、日期声明为 `DATETIME2`
- [ ] 是否用 `IDENTITY(1,1)` 创建数字 PK，并通过 `OUTPUT`/`SCOPE_IDENTITY()` 回收 ID
- [ ] 是否用 `OFFSET ... FETCH NEXT` 分页，并在查询中应用 `deleted_at IS NULL`
- [ ] 是否对 Mapper XML 中的不等号进行了转义/CDATA 处理
- [ ] 是否在查询条件列上设计了(必要时为覆盖/筛选)索引
