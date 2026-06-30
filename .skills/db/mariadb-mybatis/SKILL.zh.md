---
name: MariaDB/MySQL 数据库设计标准 (MyBatis 集成)
description: MariaDB/MySQL 表设计、AUTO_INCREMENT、分页(LIMIT/OFFSET)与 MyBatis Mapper XML 集成标准。在设计 MariaDB/MySQL 表或用 MyBatis Mapper XML 编写动态查询·分页·UPSERT 时阅读。关键词: mariadb, mysql, mybatis, Mapper, SqlSession, select, insert, update, delete, resultMap, parameterType, AUTO_INCREMENT, LIMIT, OFFSET.
rules:
  - "数值主键用 AUTO_INCREMENT 生成 (推荐 BIGINT)。"
  - "分页用 LIMIT / OFFSET 实现。"
  - "表·列命名与公共列以 db-common-conventions 为单一来源 — 小写复数 snake_case, 禁止前缀(tb_)·缩写, 逻辑删除用 deleted_at(nullable)。本文档仅涉及 MariaDB/MySQL 专有语法。"
  - "在 MyBatis Mapper XML 中编写 MariaDB/MySQL 专用动态查询。"
  - "为查询条件列设计索引。"
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

# 🐬 MariaDB / MySQL 数据库设计标准 (MyBatis 集成)

> 统一 MariaDB/MySQL 表设计与 MyBatis 集成方式。在创建新表或在 Mapper XML 中编写分页·动态查询·UPSERT 时阅读。

## 1. 核心原则
- 数值主键用 `AUTO_INCREMENT` 生成 (推荐 `BIGINT`)。
- 分页用 `LIMIT / OFFSET` 实现。
- **表·列命名与公共列以 `db-common-conventions` 为单一来源** — 小写复数 `snake_case`, 禁止前缀(`tb_`)·缩写, 逻辑删除用 `deleted_at`(nullable)。本文档仅涉及 MariaDB/MySQL 专有语法。
- 在 MyBatis Mapper XML 中编写 MariaDB/MySQL 专用动态查询。
- 为查询条件列设计索引。

## 2. 规则

### 2-1. 表 & 列命名
表用小写复数 `snake_case`(注意 Linux 文件系统的大小写区分)。引擎·字符集必须显式指定。命名·公共列规格遵循 `db-common-conventions`。

```sql
-- ✅ 推荐 — InnoDB + utf8mb4, 小写复数 snake_case, 公共列 + 逻辑删除
CREATE TABLE users (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    user_name   VARCHAR(100)    NOT NULL,
    email       VARCHAR(255)    NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT NOW(),
    updated_at  DATETIME        NULL ON UPDATE NOW(),         -- 更新时自动刷新
    deleted_at  DATETIME        NULL,                          -- 逻辑删除: NULL=活跃
    PRIMARY KEY (id),
    UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users COMMENT = '用户';
```

核心设置:
- `ENGINE=InnoDB`: 支持事务、外键(必须显式指定)
- `CHARSET=utf8mb4`: 完整支持含表情符号的韩文(`utf8` 无法存储表情符号)
- `COLLATE=utf8mb4_unicode_ci`: 不区分大小写的比较 (ci = case insensitive)

> 若需要 UUID 主键, 用 `id VARCHAR(36) NOT NULL DEFAULT (UUID())`。公共列(`created_by`·`updated_by`·`deleted_by` 等)的完整规格遵循 `db-common-conventions`。

### 2-2. AUTO_INCREMENT (数值主键)
```sql
-- ✅ 推荐 — BIGINT AUTO_INCREMENT (比 INT 的 21 亿上限更安全)
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

### 2-3. MyBatis Mapper XML (MariaDB/MySQL 专用模式)
分页用 `LIMIT ? OFFSET ?`, INSERT 用 `useGeneratedKeys` 回收主键, UPSERT 用 `ON DUPLICATE KEY UPDATE`, 逻辑删除填充 `deleted_at` 而查询用 `deleted_at IS NULL` 过滤。

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

    <!-- LIMIT OFFSET 分页 (仅查询存活行) -->
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

    <!-- 总条数 -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
    </select>

    <!-- INSERT + 返回生成的主键 -->
    <insert id="insertItem" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, price, created_at)
        VALUES (#{itemName}, #{price}, NOW())
    </insert>

    <!-- INSERT IGNORE (忽略重复) -->
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

    <!-- 逻辑删除 (填充 deleted_at) -->
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

    <!-- IN 子句 (foreach) -->
    <select id="selectItemsByIds" parameterType="list" resultMap="itemResultMap">
        SELECT id, item_name, price
        FROM items
        WHERE id IN
        <foreach collection="list" item="id" open="(" separator="," close=")">
            #{id}
        </foreach>
        AND deleted_at IS NULL
    </select>

    <!-- 批量 INSERT -->
    <insert id="insertItemBatch" parameterType="list">
        INSERT INTO items (item_name, price, created_at)
        VALUES
        <foreach collection="list" item="item" separator=",">
            (#{item.itemName}, #{item.price}, NOW())
        </foreach>
    </insert>

</mapper>
```

### 2-4. application.yml + 依赖
```yaml
spring:
  datasource:
    driver-class-name: org.mariadb.jdbc.Driver   # MariaDB 专用驱动
    # driver-class-name: com.mysql.cj.jdbc.Driver  # 使用 MySQL 时
    url: jdbc:mariadb://localhost:3306/mydb?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 自动转换
    default-statement-timeout: 30
```

```groovy
// MariaDB
implementation 'org.mariadb.jdbc:mariadb-java-client:3.3.2'
// 使用 MySQL 时
implementation 'com.mysql:mysql-connector-j:8.3.0'
```

### 2-5. 常用函数
```sql
-- 日期
NOW()                               -- 当前日期时间
CURDATE()                           -- 今天日期 (无时间)
DATE_ADD(NOW(), INTERVAL -7 DAY)   -- 7 天前
DATEDIFF(结束日, 开始日)            -- 日期差 (天)
DATE_FORMAT(NOW(), '%Y-%m-%d')     -- 日期格式

-- NULL 处理
IFNULL(列, 默认值)                 -- 相当于 Oracle NVL
COALESCE(col1, col2, '默认值')     -- ANSI 标准
NULLIF(列, 比较值)

-- 字符串
SUBSTRING(列, 起始, 长度)
LOCATE('搜索词', 列)
TRIM(列) / LTRIM / RTRIM
GROUP_CONCAT(列 ORDER BY 列 SEPARATOR ',')   -- 分组合并
CONCAT(col1, '-', col2)

-- 条件
IF(条件, 真值, 假值)
CASE WHEN 条件 THEN 值 ELSE 默认值 END
ELT(索引, 值1, 值2, 值3)        -- 基于索引的选择

-- 分析函数 (MariaDB 10.2+, MySQL 8.0+)
ROW_NUMBER() OVER (PARTITION BY 分组 ORDER BY 排序)
RANK() / DENSE_RANK()
```

### 2-6. 索引策略
```sql
-- 单列索引
ALTER TABLE items ADD INDEX idx_items_created_at (created_at DESC);

-- 复合索引 (优化活跃行查询)
ALTER TABLE items ADD INDEX idx_items_active_created (deleted_at, created_at DESC);

-- 全文搜索索引 (LIKE 搜索的替代)
ALTER TABLE items ADD FULLTEXT INDEX ft_items_name (item_name)
    WITH PARSER ngram;   -- 韩文分词: ngram 解析器为必需

-- 全文搜索查询
SELECT * FROM items
WHERE MATCH(item_name) AGAINST('搜索词' IN BOOLEAN MODE)
  AND deleted_at IS NULL;
```

## 3. 常见错误
- 未指定引擎·字符集 → 表情符号/韩文乱码, 不支持事务。
- 使用 `INT` 主键 → 有触及 21 亿上限的风险(推荐 `BIGINT`)。
- 前缀(`tb_`)·缩写(`user_nm`·`reg_dt`)·`use_yn 'Y'/'N'` 标志 → 违反 `db-common-conventions`。使用全名·`deleted_at`。
- 查询中遗漏 `deleted_at IS NULL` → 连已删除行也被查出。
- 未确认 `lower_case_table_names` → 在 Linux 上因表名大小写区分导致查询失败。Docker 部署时建议在 `my.cnf` 中显式指定。
- LIKE 搜索前缀为 `%` → 不使用索引(考虑全文搜索索引)。

## 4. 检查清单
- [ ] 表=小写复数 `snake_case`, 列=全名, 是否应用了公共列·`deleted_at`?(`db-common-conventions`)
- [ ] 是否在表上显式指定了 `ENGINE=InnoDB`、`CHARSET=utf8mb4`、`COLLATE`?
- [ ] 是否将数值主键创建为 `BIGINT AUTO_INCREMENT`?
- [ ] 是否用 `LIMIT / OFFSET` 实现分页, 并对查询应用了 `deleted_at IS NULL`?
- [ ] 是否在 INSERT 中用 `useGeneratedKeys` 回收主键?
- [ ] 是否为查询条件列设计了索引?
- [ ] 是否确认了 `lower_case_table_names` 设置?
