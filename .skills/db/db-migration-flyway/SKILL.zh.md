---
name: Flyway 数据库迁移运维标准
description: 基于 Flyway 的数据库架构管理标准。涵盖目录/命名/校验和规则、按环境的策略、零停机迁移、通过补偿迁移回滚、Spring Boot/多模块集成以及 CI 校验。在变更架构或编写、评审、部署迁移文件时阅读。关键词: flyway, migration, V1__, baseline, db.migration, zero-downtime, flyway_schema_history.
rules:
  - "用 Flyway 管理数据库架构，并遵循 V{版本}__{说明}.sql 命名。不由人工直接对生产数据库执行 SQL。"
  - "绝不修改已应用的 V 文件，而是新增一个版本(防止校验和不一致)。"
  - "不在同一次发布中同时执行 DROP 和部署。"
  - "不手动改动 flyway_schema_history 表(仅使用 flyway repair)。"
  - "为实现零停机，分阶段部署列的新增/删除。"
  - "Flyway 没有自动回滚，因此用补偿迁移来撤销。"
tags:
  - "flyway"
  - "migration"
  - "V1__"
  - "baseline"
  - "db.migration"
  - "zero-downtime"
  - "flyway_schema_history"
  - "V2__"
  - "FlywayMigration"
---

# 🛫 Flyway 数据库迁移标准

> 所有架构变更只能通过受版本控制的迁移文件进行。在变更架构或编写、评审、部署迁移文件时阅读。一旦此原则被破坏，各环境的架构就会发生偏移，回滚/复现将变得不可能。

## 1. 核心原则
- 用 Flyway 管理数据库架构，并遵循 `V{版本}__{说明}.sql` 命名。不由人工直接对生产数据库执行 SQL。
- 绝不修改已应用的 `V` 文件，而是新增一个版本(防止校验和不一致)。
- 不在同一次发布中同时执行 `DROP` 和部署。
- 不手动改动 `flyway_schema_history` 表(仅使用 `flyway repair`)。
- 为实现零停机，分阶段部署列的新增/删除。
- Flyway 没有自动回滚，因此用补偿迁移来撤销。

> **Flyway vs Liquibase**: 能够原样评审/调试纯 SQL 的 Flyway 在代码评审、DBA 协作和故障调试中更有优势，因此是新项目的默认选择。仅当多 DBMS 转换是核心需求时才考虑 Liquibase(XML/YAML DSL、部分自动回滚)。

## 2. 规则

### 2-1. 目录 & 命名
```
src/main/resources/db/migration/
├── V1.0.0__init_schema.sql
├── V1.0.1__create_users.sql
├── V1.0.2__create_orders.sql
├── V1.1.0__add_orders_payment_status.sql
├── V1.2.0__seed_reference_data.sql
└── R__refresh_views.sql            # Repeatable (校验和每次变更时重新执行)
```
- 前缀 `V`(Versioned，执行一次) / `R`(Repeatable，校验和变更时重新执行) / `U`(Undo，付费版)。
- 版本: `V{major}.{minor}.{patch}__{说明}.sql`。**两个**下划线。
- 说明用 `snake_case`，建议以动词开头: `create_users`、`add_orders_status_index`、`backfill_user_country`。
- 一个文件 = 一个变更单元。不超过 100 行。

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false      # 新项目为 false，仅在引入既有 DB 时为 true
    validate-on-migrate: true       # 校验和验证 (prod 必需)
    out-of-order: false             # prod 为 false，仅 dev/staging 允许 true
    placeholder-replacement: false  # 禁用 ${var} 替换 (防止失误)
```

### 2-2. 不修改已应用的 `V` 文件
Flyway 会在 `flyway_schema_history` 中保存每个文件的校验和。修改已应用的文件会导致验证失败。
```
ERROR: Validate failed: Migration checksum mismatch for migration version 1.0.1
-> Applied to database : 1234567890
-> Resolved locally    : 9876543210
```
```sql
-- ❌ 禁止 — 修改 V1.0.1__create_users.sql 来添加列
-- ✅ 推荐 — 新增一个 V 文件: V1.0.5__add_users_phone.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
```

### 2-3. 不同时执行 DROP 和部署
```sql
-- ❌ 禁止 — V2.0.0__drop_legacy_column.sql
ALTER TABLE users DROP COLUMN old_field;
-- 部署过程中旧版本实例 SELECT old_field → 立即 500
```
→ 用零停机模式(2-5)进行拆分。

### 2-4. 按环境的策略
| 环境 | `clean` | `validate` | `out-of-order` | `baseline` |
|---|---|---|---|---|
| local/dev | 允许 | true | true | true (按需) |
| staging | **禁止** | true | false | false |
| prod | **绝对禁止** (在配置中禁用) | true | false | false |

```yaml
# prod 额外保护 — 连代码中的 clean() 调用都阻断
spring:
  flyway:
    clean-disabled: true
```
> 在 dev 中可自由用 `mvn flyway:clean flyway:migrate` 重置，但在 prod 中钉死 `clean-disabled: true`，让数据即使误操作也无法被清除。`flyway_schema_history` 不要手动改动，只用 `flyway repair` 处理。

### 2-5. 零停机迁移
即使在部署过程中旧版本/新版本同时运行，二者也都必须能工作。不要一次性新增/删除列。
```sql
-- 添加列: nullable → backfill → not null
-- 发布 1: V1.5.0__add_users_country_nullable.sql
ALTER TABLE users ADD COLUMN country VARCHAR(2) NULL;
-- 发布 2: V1.5.1__backfill_users_country.sql
UPDATE users SET country = 'KR' WHERE country IS NULL;
-- 发布 3: V1.5.2__alter_users_country_not_null.sql
ALTER TABLE users MODIFY country VARCHAR(2) NOT NULL;
```
```
删除列: 应用变更 → 部署 → DROP
1) 从应用代码中移除该列的 SELECT/INSERT/UPDATE → 部署
2) 在一段时间(至少 1 周)内确认运维稳定性
3) 在下一次发布中应用 V x.y.z__drop_users_old_field.sql

重命名列: 添加 → 双写 → 切换读取 → 删除
1) 添加 new_name 列
2) 改为让应用同时写入两者 (双写)
3) 通过回填复制历史数据
4) 改为让应用读取 new_name + 停止写入 old_name
5) DROP old_name
```
> 零停机放弃了"一次部署 = 一次迁移"的模型，转而将变更拆分为可回滚的小步骤。

### 2-6. 回滚 — 补偿迁移
Flyway 没有自动回滚(`undo` 在付费的 Teams Edition 中且实用性低)。标准做法是补偿迁移。
```sql
-- 失败的变更: V2.0.0__add_orders_discount.sql
ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) DEFAULT 0;

-- 若需要回滚，新增一个迁移
-- V2.0.1__revert_orders_discount.sql
ALTER TABLE orders DROP COLUMN discount;
```
- 对于变更数据的迁移，在 PR 正文中附上事前备份 + 验证查询。
- 对于大型变更，在 staging 用 prod 规模的 dump 测量时间。`ALTER TABLE` 耗时 5 小时的情况很常见。

### 2-7. Spring Boot 集成 & 多模块
```groovy
// build.gradle
implementation 'org.flywaydb:flyway-core'
runtimeOnly  'org.flywaydb:flyway-mysql'  // MariaDB/MySQL 10.x+ 必须使用单独的模块
```
```yaml
# 在多模块中分离 location — 避免冲突
spring:
  flyway:
    locations:
      - classpath:db/migration/common
      - classpath:db/migration/${MODULE_NAME}    # user / order / payment
    table: flyway_schema_history_${MODULE_NAME}  # 按模块分离历史表
```
> 当一个服务拥有自己的架构时，其历史表也要分离。在多个服务连接到同一个 DB 的过渡期，分离 `table` 可防止冲突。

### 2-8. 在 CI/CD 中校验
```yaml
# GitHub Actions / GitLab CI 步骤
- name: Flyway validate
  run: ./gradlew flywayValidate -Pflyway.url=$STAGING_DB_URL

- name: Migration dry-run on staging clone
  run: |
    pg_dump prod | psql staging-clone
    ./gradlew flywayMigrate -Pflyway.url=$STAGING_CLONE_URL
```
> 将在 PR 合并前于 staging clone 上执行迁移，测量执行时间/锁时间/是否失败，并把结果贴到正文中，作为标准流程。

## 3. 常见错误
```sql
-- [反模式] V 文件里塞满 DML(INSERT/UPDATE) → 各环境应用结果不同。改用 R__ 或单独的 seed
-- [反模式] 对大表执行 ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT → 锁 + 全表扫描 → 运维停摆
ALTER TABLE huge_table ADD COLUMN flag BOOLEAN NOT NULL DEFAULT FALSE;
-- [反模式] 在一个 V 文件中捆绑多个不相关的变更 → 部分应用风险，评审难度激增
```
```yaml
# [反模式] 在 prod 关闭校验和验证 → 毫无意义的架构管理
spring.flyway.validate-on-migrate: false
```
> 在控制台敲下的一行 `psql -c "ALTER TABLE ..."` 就是通往运维事故的最短路径。迁移就是代码变更 —— 通过 PR 评审、在 CI 中校验，并准备好回滚。

## 4. 检查清单
- [ ] 是否把所有架构变更都做成了 `V{版本}__{说明}.sql` 文件 (禁止直接执行 SQL)
- [ ] 是否没有修改已应用的 `V` 文件，而是新增了一个版本
- [ ] 一个文件 = 一个变更单元，是否在 100 行以内
- [ ] 是否把 DROP/列变更拆分为零停机步骤
- [ ] 是否应用了按环境的策略 (prod `clean-disabled`、`validate-on-migrate: true`)
- [ ] 是否为需要回滚的变更准备了补偿迁移和备份/验证查询
- [ ] 是否在 PR 合并前于 staging clone 上通过 dry-run 测量了时间/锁/失败
- [ ] 是否没有手动改动 `flyway_schema_history`
