---
name: Soft Delete & 审计列
description: 逻辑删除、创建/修改/删除审计列与变更历史的通用(foundational)标准 — 用 `deleted_at` 代替物理删除、自动更新审计列、默认过滤为活跃记录、排除已删除行的条件唯一约束、保留历史。在设计删除/审计列，或已删除记录与唯一约束冲突时阅读(列命名/类型见 `db-common-conventions`)。关键词: soft-delete, deleted_at, audit, history, partial unique, 历史表。
rules:
  - "用逻辑删除代替物理删除: 业务数据不删除行，而是以「删除时刻」标记进行逻辑删除。永久删除只通过单独的归档/清理流程处理 — 保留可恢复性与可审计性。"
  - "审计列是所有领域表的共同列: 把创建/修改/删除的「何时·谁」作为标准列(created_at/updated_at/deleted_at、created_by/updated_by/deleted_by)放在所有领域表上。删除标志使用 nullable timestamp deleted_at(NULL=活跃)— 不是布尔值。列命名/类型规约本身遵循 db-common-conventions 技能。"
  - "审计列自动更新: 像 updated_at 这样的值不要依赖手动更新，用 DB 触发器或 ORM/应用钩子自动填充 — 以免在某些路径上遗漏。"
  - "默认过滤为活跃记录: 把「仅未删除的行」条件包含在默认查询中，尽可能用 ORM 全局作用域等自动应用，避免误将已删除行暴露。"
  - "排除已删除记录的唯一约束: 对自然键(如邮箱)的唯一约束以「仅活跃记录」施加 — 以便删除后用相同值重新注册时不冲突。"
  - "变更历史放在单独的表: 当需要追踪重要数据的变更时，单独运行一张历史表(audit_log 或 *_history 后缀)。"
  - "防止无限增长: 只做逻辑删除而不清理，表会无限增大。一并制定保留期限、归档与清理策略。"
tags:
  - "soft-delete"
  - "deleted_at"
  - "audit"
  - "history"
  - "partial unique"
  - "이력 테이블"
  - "created_at"
  - "updated_at"
  - "logical-delete"
foundational: true
---

# 🗑️ Soft Delete & 审计列

> 规定不物理删除数据，而是逻辑删除、审计与历史追踪的标准。在设计领域表，或确定变更历史/删除策略时阅读。这是不依赖特定 DB/ORM 的通用标准。

## 1. 核心原则
- **用逻辑删除代替物理删除**: 业务数据不删除行，而是以"删除时刻"标记进行逻辑删除。永久删除只通过单独的归档/清理流程处理 — 保留可恢复性与可审计性。
- **审计列是所有领域表的共同列**: 把创建/修改/删除的"何时·谁"作为标准列(`created_at`/`updated_at`/`deleted_at`、`created_by`/`updated_by`/`deleted_by`)放在所有领域表上。删除标志使用 nullable timestamp `deleted_at`(NULL=活跃)— 不是布尔值。列命名/类型规约本身遵循 `db-common-conventions` 技能。
- **审计列自动更新**: 像 `updated_at` 这样的值不要依赖手动更新，用 DB 触发器或 ORM/应用钩子自动填充 — 以免在某些路径上遗漏。
- **默认过滤为活跃记录**: 把"仅未删除的行"条件包含在默认查询中，尽可能用 ORM 全局作用域等自动应用，避免误将已删除行暴露。
- **排除已删除记录的唯一约束**: 对自然键(如邮箱)的唯一约束以"仅活跃记录"施加 — 以便删除后用相同值重新注册时不冲突。
- **变更历史放在单独的表**: 当需要追踪重要数据的变更时，单独运行一张历史表(`audit_log` 或 `*_history` 后缀)。
- **防止无限增长**: 只做逻辑删除而不清理，表会无限增大。一并制定保留期限、归档与清理策略。

> 输入校验、错误响应等入口标准遵循 `validation-bean` 技能。本技能聚焦于数据模型(删除/审计/历史)。

## 2. 规则

### 2-1. 在所有领域表上放置标准审计列
- 把创建/修改/删除的"何时(时刻)"与"谁(行为者)"作为标准列一致地放置。
- `deleted_at`(或等价的删除时刻/标志)表示**为空则活跃，已填充则已删除**。

```text
// ✅ 推荐 — 所有领域表共享的审计列(标准 SQL 伪表示)
TABLE <领域>:
  id           <标识符>  PRIMARY KEY
  ...业务列...

  created_at   TIMESTAMP   NOT NULL   -- 创建时刻
  updated_at   TIMESTAMP   NOT NULL   -- 最后修改时刻(自动更新)
  created_by   <标识符>               -- 创建者
  updated_by   <标识符>               -- 最后修改者
  deleted_at   TIMESTAMP   NULL       -- NULL=活跃，NOT NULL=已删除
  deleted_by   <标识符>   NULL        -- 删除者
```

### 2-2. updated_at 等审计列自动更新
- 不要在每个调用处手动填充修改时刻 — 哪怕一条路径遗漏，该列就变得不可信。
- 用 DB 触发器(修改前自动设置)或 ORM/应用钩子之一的团队标准方式一致地自动化。

```text
// ❌ 禁止 — 每次更新手动更新(发生遗漏)
UPDATE <领域> SET name = ?, updated_at = <现在> WHERE id = ?   -- 某处会遗漏

// ✅ 推荐 — 修改时自动填充 updated_at(触发器/ORM 钩子)
ON UPDATE <领域>: set updated_at = <现在>   // 自动应用于所有修改路径
UPDATE <领域> SET name = ? WHERE id = ?      // updated_at 自动
```

### 2-3. 删除是逻辑删除，查询默认过滤为活跃记录
- 用填充删除时刻代替物理删除(`DELETE`)。默认查询只看"未删除的行"。
- 尽可能用 ORM 全局作用域等自动应用活跃过滤，含已删除的查询只在管理员/审计等显式路径上允许。

```text
// ❌ 禁止 — 物理删除(无法恢复·审计)
DELETE FROM <领域> WHERE id = ?

// ✅ 推荐 — 逻辑删除
UPDATE <领域> SET deleted_at = <现在>, deleted_by = ? WHERE id = ?

// 仅查询活跃记录(默认 — 尽可能自动过滤)
SELECT * FROM <领域> WHERE deleted_at IS NULL

// 含已删除的查询(管理员/审计 — 仅在显式路径上)
SELECT * FROM <领域>
```

### 2-4. 唯一约束排除已删除记录
- 若对自然键(邮箱·编码等)施加"整行"唯一，删除后用相同值重新注册时会与已删除的行冲突。
- 唯一约束以"仅活跃记录"施加。若 DB 支持条件(部分)唯一索引就用它，否则用等价手段(例如在唯一键中包含删除标记)。

```text
// ❌ 禁止 — 整体唯一: 已删除行与重新注册冲突
UNIQUE (email)

// ✅ 推荐 — email 仅在活跃记录中唯一(条件/部分唯一)
UNIQUE (email) WHERE deleted_at IS NULL
```

### 2-5. 变更历史放入单独的历史表
- 当需要追踪重要数据的变更时，不要塞进主表，单独运行一张历史表(`audit_log` 或 `*_history`)。
- 历史中至少保留"做了什么(action)·何时(时刻)·谁(行为者)·内容(变更行的快照)"。快照的存储格式(文档/JSON/列展开)按团队的 DB 能力来定。

```text
// ✅ 推荐 — 变更历史表(标准 SQL 伪表示)
TABLE <领域>_history:
  history_id   <自增标识符>  PRIMARY KEY
  action       VARCHAR   NOT NULL    -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP             -- 变更时刻
  changed_by   <标识符>              -- 变更者
  row_data     <行快照>              -- 变更前/后的整行(文档/JSON/展开列)
```

## 3. 常见错误
- **默认查询缺少活跃过滤** → 已删除记录被原样暴露。默认(尽可能自动)应用"仅未删除的行"。
- **整行唯一约束** → 删除后用相同值重新注册时冲突。改为仅活跃记录唯一。
- **依赖手动更新 `updated_at`** → 在某些路径上遗漏而变得不可信。用触发器/ORM 钩子自动化。
- **缺少归档·清理** → 只有逻辑删除堆积，表无限增大。一并制定保留·清理策略。
- **审计列名各不相同** → 每张表用不同名称会使共同处理·查询困难。团队统一为一个。

## 4. 检查清单
- [ ] 业务数据是否用**逻辑删除**(删除时刻/标志)代替物理删除？
- [ ] 所有领域表是否都有创建/修改/删除的**审计列**，且名称统一？
- [ ] `updated_at` 等修改时刻是否**由触发器/ORM 钩子自动更新**？
- [ ] 默认查询是否(尽可能自动)过滤为只看**活跃记录**(排除已删除)？
- [ ] 唯一约束是否**排除已删除记录**(仅活跃)？
- [ ] 对需要变更追踪的表是否单独运行**历史表**？
- [ ] 逻辑删除数据是否有**保留·归档·清理策略**？

## 附录: 各栈示例

> 以下是上述 1~4 标准的 PostgreSQL 实现示例(概念·规则说明见正文)。按相同模式为团队所用的 DB(如 MySQL、Oracle、SQL Server、SQLite 等)添加示例。

### PostgreSQL

PostgreSQL 原生提供 `gen_random_uuid()`、`plpgsql` 触发器、部分唯一索引(`WHERE`)、`JSONB` 等。

```sql
-- 标准审计列 (2-1)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR NOT NULL,
  name        VARCHAR NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES users(id),
  updated_by  UUID REFERENCES users(id),
  deleted_at  TIMESTAMP,          -- NULL = 活跃，NOT NULL = 已删除
  deleted_by  UUID REFERENCES users(id)
);

-- updated_at 自动更新触发器 (2-2)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 逻辑删除 + 活跃过滤 (2-3)
UPDATE users SET deleted_at = NOW(), deleted_by = $user WHERE id = $id;
SELECT * FROM users WHERE deleted_at IS NULL;

-- 仅活跃记录唯一 (2-4) — 部分唯一索引
CREATE UNIQUE INDEX ON users(email) WHERE deleted_at IS NULL;

-- 变更历史表 (2-5) — 快照为 JSONB
CREATE TABLE users_history (
  history_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action       VARCHAR NOT NULL,  -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP DEFAULT NOW(),
  changed_by   UUID,
  row_data     JSONB              -- 变更前的整行
);
```
