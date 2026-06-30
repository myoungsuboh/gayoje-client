---
name: ER 建模规约
description: 实体-关系建模、规范化、命名和关系设计的标准(数据库中立)。在设计新表/架构或确定 PK、FK、N:M 关系、规范化级别时阅读。关键词: er, entity, relationship, normalization, foreign-key, schema, naming, uuid.
rules:
  - "表名和列名使用 snake_case、复数形式(users·orders)，并避免与保留字冲突的名称。"
  - "主键使用 UUID(v7) 或自增 BIGINT，不将业务键(邮箱·订单号)用作 PK。"
  - "默认设计到第三范式(3NF)，但在性能需要时有意进行反规范化并将原因作为注释保留。"
  - "务必声明 FK 约束，让数据库保证参照完整性 — 不要仅在应用中校验。"
  - "用中间表(join table)解决 N:M 关系，并在中间表中也包含审计列(created_at)。"
tags:
  - "er"
  - "entity"
  - "relationship"
  - "normalization"
  - "foreign-key"
  - "schema"
  - "naming"
  - "uuid"
---

# 🗂️ ER 建模规约

> 统一实体-关系建模的命名、规范化和关系设计。在设计新表或架构或确定 PK、FK、N:M 关系时阅读。

## 1. 核心原则
- 表名和列名使用 snake_case、复数形式(users·orders)，并避免与保留字冲突的名称。
- 主键使用 UUID(v7) 或自增 BIGINT，不将业务键(邮箱·订单号)用作 PK。
- 默认设计到第三范式(3NF)，但在性能需要时有意进行反规范化并将原因作为注释保留。
- 务必声明 FK 约束，让数据库保证参照完整性 — 不要仅在应用中校验。
- 用中间表(join table)解决 N:M 关系，并在中间表中也包含审计列(created_at)。

## 2. 规则

### 2-1. 命名规则
| 对象 | 规约 | 示例 |
|------|--------|------|
| 表 | snake_case、复数形式 | `users`, `order_items` |
| 列 | snake_case | `created_at`, `user_id` |
| PK | `id` | `id UUID PRIMARY KEY` |
| FK | `{table_singular}_id` | `user_id`, `order_id` |
| 索引 | `idx_{table}_{cols}` | `idx_orders_user_status` |
| 唯一 | `uq_{table}_{cols}` | `uq_users_email` |

```sql
-- ❌ 禁止 — 单数形式·camelCase·将业务键用作 PK
CREATE TABLE User (userEmail VARCHAR(200) PRIMARY KEY);

-- ✅ 推荐 — 复数形式·snake_case·代理键(PK)
CREATE TABLE users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL
);
```

### 2-2. 基本表结构
```sql
CREATE TABLE products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(200) NOT NULL,
  price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  category_id  UUID NOT NULL REFERENCES categories(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP   -- soft delete
);
```

### 2-3. N:M 关系 (中间表)
```sql
-- 用户 ↔ 角色 (N:M)
CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
```

### 2-4. 规范化级别
```
1NF: 原子值，消除重复组
2NF: 消除部分函数依赖 (复合 PK 时)
3NF: 消除传递函数依赖 (在 A→B→C 中分离 B,C)

反规范化示例: 缓存聚合值 (order.total_amount)
  → 原因: 每次 SUM(order_items.price) 成本很高。
```

### 2-5. FK 行为策略
| 策略 | 说明 | 使用时机 |
|------|------|-----------|
| RESTRICT | 存在引用行时拒绝删除 | 推荐的默认值 |
| CASCADE | 删除父记录时子记录也删除 | 依赖数据 |
| SET NULL | 删除父记录时将 FK 置为 NULL | 可选引用 |

## 3. 常见错误
- 将业务键(邮箱·订单号)用作 PK → 值变更时引用会断裂。
- 不声明 FK 约束而仅在应用中校验 → 完整性得不到保证。
- 无理由的反规范化 → 会成为数据不一致的根源。
- 中间表缺少审计列 → 无法追踪关系的创建时点。

## 4. 检查清单
- [ ] 表名和列名是否为 snake_case、复数形式
- [ ] PK 是否为代理键(UUID/BIGINT)且未使用业务键
- [ ] 默认是否为 3NF，反规范化是否有原因注释
- [ ] 是否声明了 FK 约束并确定了行为策略(RESTRICT/CASCADE/SET NULL)
- [ ] 是否用中间表解决了 N:M 并包含了审计列
