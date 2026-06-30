---
name: 关系型DB通用 命名/类型 标准 (Relational DB Conventions)
description: 对所有关系型DB同样适用的通用(foundational)命名、公共列、数据类型单一规范。在设计新表/列、迁移如缩写列等遗留、统一分歧命名时阅读。方言差异交由专用技能,逻辑删除/审计委派给 `soft-delete-audit`。关键词: snake_case, primary key, foreign key, naming, common columns, created_at, deleted_at, data type, decimal。
rules:
  - "命名归一规范: 表名为复数 snake_case,列名为单数 snake_case。不混入前缀(TB_、tb_ 等)、大写、缩写。"
  - "键采用一致形式: PK 统一为 id,FK 统一为 引用表单数_id 形式。不将含义可能改变的自然键(邮箱、工号)用作 PK。"
  - "名称揭示含义: 禁止缩写列名并使用完整单词 — 仅凭名称即可知道它是什么。"
  - "强制公共列: 每张表都设置创建/修改时间、作者等公共列。不在无审计(audit)信息下运行。"
  - "删除以逻辑删除为基本: 以填入删除时间(deleted_at)替代物理删除,查询始终只看「存活的行」(deleted_at IS NULL)。保留审计追踪与引用完整性(模式详情见 soft-delete-audit)。"
  - "类型采用安全默认值: 金额用定点数而非浮点数,真/假用专用布尔类型,键用足够大的整数型/标识符型。"
  - "产品/工具依赖予以委派: 分页、UPSERT、自增键等方言差异,以及映射器/ORM 映射等工具用法,不写入正文而推迟到各专用技能/附录。"
tags:
  - "snake_case"
  - "primary key"
  - "foreign key"
  - "naming"
  - "common columns"
  - "created_at"
  - "deleted_at"
  - "data type"
  - "decimal"
  - "varchar"
  - "updated_at"
foundational: true
---

# 🗄️ 关系型DB通用 命名/类型 标准

> 在所有关系型DB中同样适用的命名、公共列、类型选择的单一标准(Single Source of Truth)。在设计新表/列、迁移遗留缩写列、统一各团队/产品分歧的命名时阅读。它是不依赖特定 DB 产品或映射器/ORM 工具、语言的通用标准。

## 1. 目的

- 将表、列、索引命名统一为 **一套规范**,消除因人、团队、DB 产品各自命名而产生的混乱(`snake_case`/`PascalCase`、有无前缀等)。
- 让每张表遵循相同的 **公共列** 与 **逻辑删除** 策略,保证审计追踪与查询一致性。
- 制定数据类型选择的普遍原则,防止金额舍入误差、类型不匹配等反复出现的事故。
- 将依赖产品(方言)、工具(映射器/ORM)的细节移出正文并委派到各专用技能/附录,使本文档保留为 **在任何技术栈都可阅读的通用规范**。

## 2. 核心原则

- **命名归一规范**: 表名为复数 `snake_case`,列名为单数 `snake_case`。不混入前缀(`TB_`、`tb_` 等)、大写、缩写。
- **键采用一致形式**: PK 统一为 `id`,FK 统一为 `引用表单数_id` 形式。不将含义可能改变的自然键(邮箱、工号)用作 PK。
- **名称揭示含义**: 禁止缩写列名并使用完整单词 — 仅凭名称即可知道它是什么。
- **强制公共列**: 每张表都设置创建/修改时间、作者等公共列。不在无审计(audit)信息下运行。
- **删除以逻辑删除为基本**: 以填入删除时间(`deleted_at`)替代物理删除,查询始终只看「存活的行」(`deleted_at IS NULL`)。保留审计追踪与引用完整性(模式详情见 `soft-delete-audit`)。
- **类型采用安全默认值**: 金额用定点数而非浮点数,真/假用专用布尔类型,键用足够大的整数型/标识符型。
- **产品/工具依赖予以委派**: 分页、UPSERT、自增键等方言差异,以及映射器/ORM 映射等工具用法,不写入正文而推迟到各专用技能/附录。

## 3. 规则

### 3-1. 表命名 — 复数 snake_case,禁止前缀/缩写

连接(N:M)表将两个表名按字母顺序连接。

```text
// ✅ 推荐
users
asset_logs
order_items
user_roles          // N:M 连接表 (users × roles)

// ❌ 禁止 (立即重构)
TB_USER             // 前缀 + 大写 + 单数
tbl_orders          // 前缀
UserAccount         // PascalCase
usr                 // 缩写
```

### 3-2. 列命名 — PK/FK/一般

| 种类 | 规则 | 例 |
|---|---|---|
| PK (推荐单一 PK) | `id` 或 `<单数>_id` | `users.id` 或 `users.user_id` |
| FK | 引用表单数 + `_id` | `orders.user_id` → `users.id` |
| 一般列 | `snake_case`,名词 | `email`、`total_amount` |
| 布尔 | `is_*` / `has_*` | `is_active`、`has_paid` |
| 日期时间 | `*_at` (时间) / `*_on` (日期) | `created_at`、`deleted_at`、`birth_on` |

```text
// ✅ 推荐 — 一致的键、布尔、时间命名
table orders:
  id            PK
  user_id       FK → users.id
  total_amount  定点数金额
  is_paid       布尔 (默认 false)
  paid_at       时间 (nullable)

// ❌ 禁止 — 缩写键、Y/N 标志、含糊的日期列
table orders:
  ordr_id, usr_id, amt, pay_yn('Y'/'N'), pay_dt
```

### 3-3. 禁止缩写列名 — 使用完整名称

遗留中最常见的破坏可读性的模式。在新模式中无条件禁止,并在迁移时将改为完整名称作为 **首要工作**。

| ❌ 禁止缩写 | ✅ 完整名称 | 备注 |
|---|---|---|
| `user_nm` | `user_name` | `_nm` 含义模糊 |
| `reg_dt`、`upd_dt` | `created_at`、`updated_at` | `_dt` 对日期/时间不明确 |
| `del_yn` (`'Y'`/`'N'`) | `deleted_at` (nullable 时间) | 字符 Y/N 对索引、条件式低效,且无法留下删除时间 |
| `use_yn` | `deleted_at` | 用删除时间表达有效/删除 |
| `tel_no` | `phone_number` | |
| `cust_cd` | `customer_code` | |

```text
// ❌ 禁止 — 缩写轰炸
table tb_user:
  user_id, user_nm, use_yn('Y'/'N'), reg_dt, upd_dt

// ✅ 推荐 — 完整名称 + 公共列
table users:
  id            PK
  user_name
  email
  created_at, updated_at
  created_by, updated_by
  deleted_at, deleted_by   // NULL=有效, NOT NULL=已删除
```

### 3-4. 公共列 — 对每张表强制

每张表都设置以下含义的列(名称遵循本标准)。

| 列 | 含义 |
|---|---|
| `created_at` | 创建时间 |
| `updated_at` | 修改时间 |
| `created_by` | 创建者标识符 (nullable) |
| `updated_by` | 修改者标识符 (nullable) |
| `deleted_at` | 逻辑删除时间 (nullable timestamp,`NULL`=有效、`NOT NULL`=已删除) |
| `deleted_by` | 删除者标识符 (nullable) |

- **删除标志统一为 `deleted_at`(nullable timestamp)**: 以填入删除时间替代布尔 `is_deleted`,用一列同时记录「已删除」与「何时删除」。以填入 `deleted_at` 替代物理删除,并对所有查询强制「未删除的行」(`deleted_at IS NULL`)条件。逻辑删除/审计模式详情遵循 `soft-delete-audit` 技能。
- **作者(`created_by`/`updated_by`)自动注入**: 从认证上下文中拦截并填入(例: 持久层拦截器、横切关注点)。控制器/服务不直接填入 — 实现手段委派给团队的技术栈。

```text
// ❌ 禁止 — 无审计列 + 物理删除
table products: id, name, price          // 无 created_at/updated_at
DELETE FROM products WHERE id = ?         // 无痕迹消失

// ✅ 推荐 — 公共列 + 逻辑删除
table products: id, name, price, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by
UPDATE products SET deleted_at = <现在>, deleted_by = ? WHERE id = ?
SELECT ... FROM products WHERE deleted_at IS NULL   // 查询始终只看存活的行
```

### 3-5. 索引 / 约束命名

| 种类 | 形式 | 例 |
|---|---|---|
| 索引 | `idx_<表>_<列们>` | `idx_orders_user_id_created_at` |
| 唯一索引 | `ux_<表>_<列们>` | `ux_users_email` |
| FK 约束 | `fk_<表>_<引用表>` | `fk_orders_user` |
| CHECK 约束 | `ck_<表>_<列>` | `ck_orders_total_amount` |

```text
// ✅ 推荐 — 一眼即可读出种类、对象的名称
idx_orders_user_id_created_at   on orders(user_id, created_at desc)
ux_users_email                  on users(email)

// ❌ 禁止 — 自动生成的无意义名称 / 种类不明
orders_idx1, SYS_C0012345
```

### 3-6. 数据类型选择 — 安全默认值

| 用途 | 推荐 | ❌ 避免 |
|---|---|---|
| PK / FK | 大整数型(例: 64-bit)或标识符(UUID) | 小整数型(范围上限) |
| 短字符串 | 可变长字符串,统一长度上限(例: 255) | 无限制/参差不齐的长度 |
| 代码值 | 短可变字符串(例: 50) | |
| 长文本 | 大容量文本类型 | |
| **金额** | **定点数(decimal/numeric)** | **浮点数(float/double) — 舍入误差** |
| 真/假 | 专用布尔类型 | 字符 `'Y'`/`'N'` (对索引、条件式低效) |
| 日期时间 | 时间类型 (推荐按 UTC 存储) | |
| 仅日期 | 日期类型 | |

- **金额禁用浮点数**: 像 `0.1 + 0.2 = 0.30000000000000004` 这样的误差会导致会计事故。始终用定点数。
- **真/假用布尔类型**: 字符 Y/N 基数低,且会出现大小写人为错误(`'y'`)。
- **时区按 UTC 存储**: 将服务器、DB、运行时按 UTC 存储,仅在显示时刻转换为本地时间。具体类型、会话时区处理属于方言差异(委派至下文 3-7)。

```text
// ❌ 禁止
amount  float                 // 舍入误差
is_paid char(1) 'Y'/'N'       // 对索引/条件式低效
id      int                   // 范围上限

// ✅ 推荐
amount  decimal(15,2)
is_paid boolean
id      bigint (或 uuid)
```

### 3-7. 方言/工具差异委派给专用技能

本文档仅涵盖 **通用规范**。不在正文中写产品(方言)特定语法或工具用法,而是查看各专用技能。

| 项目 | 在何处涵盖 |
|---|---|
| 分页、UPSERT、自增 PK、布尔/时间的具体类型 | 各方言专用技能 (例: PostgreSQL/MySQL/Oracle 技能) |
| 事务、锁 | `transaction-locking` 技能 |
| 连接池 | `connection-pool-tuning` 技能 |
| 迁移 | `db-migration-flyway` 技能 |
| 映射器/ORM 映射、公共子句的集中化 | 附录的按技术栈示例 (下文) |

## 4. 常见错误

- **缩写轰炸**: `tb_usr(usr_nm, reg_dt, use_yn)` — 在新模式中禁止,改用完整名称。
- **真/假用字符 Y/N**: `WHERE use_yn = 'Y'` — 索引基数低且小写 `'y'` 的人为错误。改用布尔类型。
- **自然键作 PK**: 将邮箱/工号用作 PK 会使值无法变更,且 FK 传播成本激增。
- **金额用浮点数**: `0.1 + 0.2 = 0.30000000000000004` 舍入误差。
- **物理删除**: 无痕迹消失致使审计追踪无法进行,并破坏引用完整性。改用逻辑删除。
- **查询中遗漏删除条件**: 漏掉 `deleted_at IS NULL` 会连已删除的行一起查出。
- **遗漏公共列**: 无创建/修改时间、作者就构建会使事后审计、追踪无法进行。
- **将方言语法嵌入通用规范**: 将特定产品专用语法写入本文档会在其他产品上失效 — 委派给专用技能。

## 5. 检查清单

- [ ] 表=复数 `snake_case`、无前缀,列=单数 `snake_case` 吗
- [ ] PK 是 `id`、FK 是 `引用表单数_id` 形式吗 (非自然键 PK)
- [ ] 是否未用缩写列(`_nm`、`_dt`、`_yn` 等)而用了完整名称
- [ ] 是否包含全部公共列(`created_at`、`updated_at`、`created_by`、`updated_by`、`deleted_at`、`deleted_by`)
- [ ] 是否以逻辑删除(填入 `deleted_at`)替代物理删除
- [ ] 所有查询是否都包含「未删除的行」条件(`deleted_at IS NULL`)
- [ ] 是否遵循索引/约束前缀(`idx_`/`ux_`/`fk_`/`ck_`)
- [ ] 金额是否为定点数、真/假是否为布尔、PK 是否为大整数型/UUID
- [ ] 是否将方言/工具依赖细节(分页、UPSERT、映射器配置等)委派给专用技能/附录

## 附录: 按技术栈示例

> 以下为参考用实现示例。上述 1~5 的原则、规则才是标准,附录只是其应用案例。**按相同模式添加符合你团队所用技术栈(映射器/ORM、语言)的示例**。

### MyBatis (Java)

在持久层用 `resultMap` 与 `<sql>`/`<include>` 将映射与公共子句集中化。即便列发生变更,只在一处修改即可反映到所有 Mapper。

```yaml
mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # user_name → userName (全项目统一)
    default-statement-timeout: 30
    jdbc-type-for-null: NULL              # Oracle 兼容
    cache-enabled: false                  # 二级缓存交由单独的缓存层
```
```xml
<!-- ✅ resultMap: 即便是简单映射也始终编写 (为 JOIN 扩展做准备) -->
<resultMap id="userResultMap" type="com.example.dto.UserResponse">
    <id     property="id"         column="id"/>
    <result property="userName"   column="user_name"/>
    <result property="email"      column="email"/>
    <result property="createdAt"  column="created_at"/>
</resultMap>

<!-- ✅ 公共列的 SELECT 子句抽取到 <sql> 以集中化 -->
<sql id="userColumns">
    id, user_name, email, created_at, updated_at, deleted_at
</sql>
<sql id="activeWhere">
    AND deleted_at IS NULL
</sql>

<select id="findById" resultMap="userResultMap">
    SELECT <include refid="userColumns"/>
      FROM users
     WHERE id = #{id}
       <include refid="activeWhere"/>
</select>

<!-- IN 子句的动态处理 -->
<select id="findByIds" resultMap="userResultMap">
    SELECT <include refid="userColumns"/>
      FROM users
     WHERE id IN
     <foreach collection="ids" item="id" open="(" separator="," close=")">
         #{id}
     </foreach>
     <include refid="activeWhere"/>
</select>
```
> 用 `<sql>` + `<include>` 将 SELECT 列与公共 WHERE 子句集中化后,添加列时只在一处修改即可反映到所有 Mapper。

#### MyBatis 特有的常见错误
- **不写 `resultMap` 而依赖 `SELECT *` 自动映射** — 添加列时会在运行阶段才发现映射破裂。即便是简单映射也要编写 `resultMap`。
- **公共 WHERE 子句未集中化** — 在每个 Mapper 中直接写 `deleted_at IS NULL` 会产生遗漏。用 `<sql>`/`<include>` 集中化。
