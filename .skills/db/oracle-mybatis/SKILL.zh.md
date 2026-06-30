---
name: Oracle 数据库设计标准 (MyBatis 集成)
description: Oracle 表设计、命名、序列/触发器模式与 MyBatis Mapper XML 集成的标准。在设计 Oracle 表、用 MyBatis 编写分页/UPSERT/动态查询，或设计索引时阅读。关键词: oracle, ojdbc, jdbc:oracle, mybatis, Mapper, SqlSession, ROWNUM, OFFSET FETCH, sequence, MERGE.
rules:
  - "自动递增 ID 使用序列生成，必要时通过触发器填充 (12c 以上可用 GENERATED AS IDENTITY)。"
  - "分页使用 ROWNUM(12c 以下) 或 OFFSET/FETCH(12c 以上) 语法实现。"
  - "表/列命名和公共列以 db-common-conventions 为唯一来源 — 小写复数形式 snake_case，禁止前缀(TB_)、大写、缩写，逻辑删除使用 deleted_at。(Oracle 将不加引号的标识符以大写存储，但表示/映射统一为小写 snake_case。)"
  - "在 MyBatis Mapper XML 中编写 Oracle 专用动态查询。"
  - "在查询条件列上设计索引 (等值条件在前，范围条件在后)。"
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

# 🗄️ Oracle 数据库设计标准 (MyBatis 集成)

> 统一 Oracle 表设计与 MyBatis Mapper XML 集成方式。在创建 Oracle 表，或编写/修改 MyBatis 查询时阅读。

## 1. 核心原则
- 自动递增 ID 使用序列生成，必要时通过触发器填充 (12c 以上可用 `GENERATED AS IDENTITY`)。
- 分页使用 ROWNUM(12c 以下) 或 OFFSET/FETCH(12c 以上) 语法实现。
- **表/列命名和公共列以 `db-common-conventions` 为唯一来源** — 小写复数形式 `snake_case`，禁止前缀(`TB_`)、大写、缩写，逻辑删除使用 `deleted_at`。(Oracle 将不加引号的标识符以大写存储，但表示/映射统一为小写 `snake_case`。)
- 在 MyBatis Mapper XML 中编写 Oracle 专用动态查询。
- 在查询条件列上设计索引 (等值条件在前，范围条件在后)。

## 2. 规则

### 2-1. 表与列命名
命名和公共列规范遵循 `db-common-conventions`(小写复数形式 `snake_case`、全名、逻辑删除 `deleted_at`)。下面是应用 Oracle 类型和序列的示例。

```sql
-- ✅ 推荐 — 小写复数形式 snake_case、全名、公共列 + 逻辑删除
CREATE TABLE users (
    id          VARCHAR2(36)   DEFAULT SYS_GUID() NOT NULL,   -- UUID PK
    user_name   VARCHAR2(100)  NOT NULL,
    email       VARCHAR2(255)  NOT NULL,
    created_at  DATE           DEFAULT SYSDATE NOT NULL,
    updated_at  DATE,
    deleted_at  DATE,                                          -- 逻辑删除: NULL=活跃
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

COMMENT ON TABLE users IS '用户';
COMMENT ON COLUMN users.id IS '用户 ID';
```

- 表: 小写复数形式 `snake_case` (禁止前缀、大写)
- 约束: PK `pk_表`、UK `ux_表_列`、FK `fk_表_引用表`
- 公共列: `created_at`/`updated_at`/`created_by`/`updated_by`/`deleted_at`/`deleted_by` — 规范见 `db-common-conventions`

### 2-2. 序列 (自动递增 ID)
```sql
-- ✅ 如需数字 PK 则使用序列
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

-- ✅ Oracle 12c 以上: 可使用 IDENTITY 列
-- id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

### 2-3. MyBatis Mapper XML — Oracle 专用模式
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

    <!-- ✅ Oracle: 基于 ROWNUM 的分页 (12c 以下) -->
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

    <!-- ✅ Oracle 12c 以上: OFFSET FETCH 分页 -->
    <select id="selectItemListV2" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        OFFSET #{offset} ROWS FETCH NEXT #{limit} ROWS ONLY
    </select>

    <!-- ✅ INSERT: 使用序列 -->
    <insert id="insertItem" parameterType="com.example.model.Item">
        <selectKey keyProperty="id" resultType="long" order="BEFORE">
            SELECT seq_items.NEXTVAL FROM DUAL
        </selectKey>
        INSERT INTO items (id, item_name, created_at)
        VALUES (#{id}, #{itemName}, SYSDATE)
    </insert>

    <!-- ✅ INSERT: 使用 GENERATED AS IDENTITY 时 -->
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

    <!-- ✅ 逻辑删除 (填充 deleted_at) -->
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

### 2-4. application.yml Oracle 配置
```yaml
spring:
  datasource:
    driver-class-name: oracle.jdbc.OracleDriver
    url: jdbc:oracle:thin:@//localhost:1521/XEPDB1   # 服务名方式
    # url: jdbc:oracle:thin:@localhost:1521:ORCL     # SID 方式 (旧版本)
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000
      idle-timeout: 600000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 自动转换
    default-fetch-size: 100
    default-statement-timeout: 30
```

> 设置 `map-underscore-to-camel-case: true` 后，即使没有 resultMap 也能自动映射。

### 2-5. 常用 Oracle 函数
```sql
-- 日期格式化
TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
TO_DATE('2024-01-01', 'YYYY-MM-DD')
TRUNC(SYSDATE)          -- 今天 00:00:00
SYSDATE - 7             -- 7 天前

-- NULL 处理
NVL(列, 默认值)
NVL2(列, 非NULL时, NULL时)
COALESCE(col1, col2, '默认值')  -- ANSI 标准，推荐

-- 字符串
SUBSTR(列, 起始, 长度)
INSTR(列, '搜索词')
TRIM(列) / LTRIM / RTRIM
LISTAGG(列, ',') WITHIN GROUP (ORDER BY 列)  -- GROUP_CONCAT

-- 条件
DECODE(列, 'A', '甲', 'B', '乙', '其他')  -- CASE WHEN 简单形式
CASE WHEN 条件 THEN 值 ELSE 默认值 END

-- 分析函数 (窗口)
ROW_NUMBER() OVER (PARTITION BY 分组列 ORDER BY 排序列)
RANK() / DENSE_RANK()
SUM(金额) OVER (PARTITION BY 月 ORDER BY 日 ROWS UNBOUNDED PRECEDING)
```

### 2-6. 索引策略
```sql
-- ✅ 单列索引
CREATE INDEX idx_items_created_at ON items (created_at DESC);

-- ✅ 复合索引 (优化活跃行查询: 等值 → 范围 顺序)
CREATE INDEX idx_items_active_created ON items (deleted_at, created_at DESC);

-- ✅ 基于函数的索引 (优化 LIKE 搜索)
CREATE INDEX idx_items_name_upper ON items (UPPER(item_name));
```

> WHERE 子句的列，等值条件在前、范围条件在后。低基数列单独建索引效率低 → 放在复合索引前部。

## 3. 常见错误
- 使用前缀(`TB_`)、大写、缩写(`USE_YN`·`REG_DT`) → 违反 `db-common-conventions`。使用小写复数形式 `snake_case`、全名、`deleted_at`。
- 不用序列而在应用中分配 ID → 并发冲突。
- ROWNUM 分页中未将 ORDER BY 放在内联视图内 → 排序错乱。
- 在低基数列上创建单独索引 → 低效。
- 关闭 `map-underscore-to-camel-case` 且也没有 resultMap → 映射缺失。

## 4. 检查清单
- [ ] 表/列命名是否遵循 `db-common-conventions`(小写复数形式 `snake_case`、全名、`deleted_at`)
- [ ] 是否用序列或 IDENTITY 生成自动递增 ID
- [ ] 是否用 ROWNUM/OFFSET FETCH 语法实现分页，并在查询中应用 `deleted_at IS NULL`
- [ ] 是否在查询条件列上设计了索引 (等值 → 范围 顺序)
- [ ] 是否通过 Mapper 统一了逻辑删除、UPSERT 等公共模式
