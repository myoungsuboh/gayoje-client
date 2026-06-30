---
name: Flyway DB Migration Operations Standard
description: A Flyway-based DB schema management standard. Covers directory/naming/checksum rules, per-environment policies, zero-downtime migrations, rollback via compensating migrations, Spring Boot/multi-module integration, and CI validation. Read it when changing schema or authoring, reviewing, or deploying migration files. Keywords: flyway, migration, V1__, baseline, db.migration, zero-downtime, flyway_schema_history.
rules:
  - "Manage DB schema with Flyway and follow the V{version}__{description}.sql naming. Never run SQL by hand directly against a production DB."
  - "Never modify a V file that has already been applied; add a new version instead (prevents checksum mismatch)."
  - "Do not perform a DROP and a deployment in the same release."
  - "Never touch the flyway_schema_history table manually (use only flyway repair)."
  - "Deploy column additions/removals in stages to preserve zero-downtime."
  - "Flyway has no automatic rollback, so revert with a compensating migration."
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

# 🛫 Flyway DB Migration Standard

> All schema changes must be made only through version-controlled migration files. Read it when changing schema or authoring, reviewing, or deploying migration files. When this principle is broken, schemas drift across environments and rollback/reproduction becomes impossible.

## 1. Core Principles
- Manage DB schema with Flyway and follow the `V{version}__{description}.sql` naming. Never run SQL by hand directly against a production DB.
- Never modify a `V` file that has already been applied; add a new version instead (prevents checksum mismatch).
- Do not perform a `DROP` and a deployment in the same release.
- Never touch the `flyway_schema_history` table manually (use only `flyway repair`).
- Deploy column additions/removals in stages to preserve zero-downtime.
- Flyway has no automatic rollback, so revert with a compensating migration.

> **Flyway vs Liquibase**: Flyway, which lets you review/debug raw SQL as-is, is advantageous for code review, DBA collaboration, and incident debugging, so it is the default for new projects. Consider Liquibase (XML/YAML DSL, some automatic rollback) only when multi-DBMS conversion is the core requirement.

## 2. Rules

### 2-1. Directory & Naming
```
src/main/resources/db/migration/
├── V1.0.0__init_schema.sql
├── V1.0.1__create_users.sql
├── V1.0.2__create_orders.sql
├── V1.1.0__add_orders_payment_status.sql
├── V1.2.0__seed_reference_data.sql
└── R__refresh_views.sql            # Repeatable (re-run whenever the checksum changes)
```
- Prefix `V` (Versioned, run once) / `R` (Repeatable, re-run on checksum change) / `U` (Undo, paid edition).
- Version: `V{major}.{minor}.{patch}__{description}.sql`. **Two** underscores.
- Description in `snake_case`, starting with a verb is recommended: `create_users`, `add_orders_status_index`, `backfill_user_country`.
- One file = one unit of change. Do not exceed 100 lines.

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false      # false for new; true only when adopting an existing DB
    validate-on-migrate: true       # checksum validation (required in prod)
    out-of-order: false             # false in prod; allowed true only in dev/staging
    placeholder-replacement: false  # disable ${var} substitution (prevents mistakes)
```

### 2-2. Do Not Modify an Already-Applied `V` File
Flyway stores the checksum of each file in `flyway_schema_history`. Modifying an applied file fails validation.
```
ERROR: Validate failed: Migration checksum mismatch for migration version 1.0.1
-> Applied to database : 1234567890
-> Resolved locally    : 9876543210
```
```sql
-- ❌ Forbidden — adding a column by modifying V1.0.1__create_users.sql
-- ✅ Recommended — add a new V file: V1.0.5__add_users_phone.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
```

### 2-3. Do Not DROP and Deploy at the Same Time
```sql
-- ❌ Forbidden — V2.0.0__drop_legacy_column.sql
ALTER TABLE users DROP COLUMN old_field;
-- During deployment, old-version instances SELECT old_field → instant 500
```
→ Split it using the zero-downtime pattern (2-5).

### 2-4. Per-Environment Policy
| Environment | `clean` | `validate` | `out-of-order` | `baseline` |
|---|---|---|---|---|
| local/dev | allowed | true | true | true (if needed) |
| staging | **forbidden** | true | false | false |
| prod | **absolutely forbidden** (disabled in config) | true | false | false |

```yaml
# Extra prod protection — block even a clean() call from code
spring:
  flyway:
    clean-disabled: true
```
> In dev, feel free to reset with `mvn flyway:clean flyway:migrate`, but pin `clean-disabled: true` in prod so data can never be wiped even by accident. Do not touch `flyway_schema_history` by hand; handle it only with `flyway repair`.

### 2-5. Zero-Downtime Migration
Even when old/new versions are running simultaneously during deployment, both must work. Do not add/remove a column in one shot.
```sql
-- Adding a column: nullable → backfill → not null
-- Release 1: V1.5.0__add_users_country_nullable.sql
ALTER TABLE users ADD COLUMN country VARCHAR(2) NULL;
-- Release 2: V1.5.1__backfill_users_country.sql
UPDATE users SET country = 'KR' WHERE country IS NULL;
-- Release 3: V1.5.2__alter_users_country_not_null.sql
ALTER TABLE users MODIFY country VARCHAR(2) NOT NULL;
```
```
Dropping a column: app change → deploy → DROP
1) Remove SELECT/INSERT/UPDATE of the column from app code → deploy
2) Confirm operational stability for a period (at least 1 week)
3) Apply V x.y.z__drop_users_old_field.sql in the next release

Renaming a column: add → dual-write → switch reads → drop
1) Add the new_name column
2) Change the app to write to both (dual write)
3) Copy past data via backfill
4) Change the app to read new_name + stop writing old_name
5) DROP old_name
```
> Zero-downtime gives up the "one deploy = one migration" model and instead breaks the change into small, rollback-able steps.

### 2-6. Rollback — Compensating Migration
Flyway has no automatic rollback (`undo` is in the paid Teams Edition and of low practicality). The standard is a compensating migration.
```sql
-- Failed change: V2.0.0__add_orders_discount.sql
ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) DEFAULT 0;

-- If a rollback is needed, add a new migration
-- V2.0.1__revert_orders_discount.sql
ALTER TABLE orders DROP COLUMN discount;
```
- For data-changing migrations, attach a prior backup + verification query in the PR body.
- For large changes, measure timing on a prod-sized dump in staging. Cases where `ALTER TABLE` takes 5 hours are common.

### 2-7. Spring Boot Integration & Multi-Module
```groovy
// build.gradle
implementation 'org.flywaydb:flyway-core'
runtimeOnly  'org.flywaydb:flyway-mysql'  // MariaDB/MySQL 10.x+ requires the separate module
```
```yaml
# Separate locations in multi-module — avoid conflicts
spring:
  flyway:
    locations:
      - classpath:db/migration/common
      - classpath:db/migration/${MODULE_NAME}    # user / order / payment
    table: flyway_schema_history_${MODULE_NAME}  # separate history table per module
```
> When a service owns its own schema, separate its history table too. During a transition where multiple services attach to one DB, separating `table` prevents conflicts.

### 2-8. Validation in CI/CD
```yaml
# GitHub Actions / GitLab CI steps
- name: Flyway validate
  run: ./gradlew flywayValidate -Pflyway.url=$STAGING_DB_URL

- name: Migration dry-run on staging clone
  run: |
    pg_dump prod | psql staging-clone
    ./gradlew flywayMigrate -Pflyway.url=$STAGING_CLONE_URL
```
> Make it a standard procedure to run the migration on a staging clone before merging the PR, measure execution time/lock time/failure, and attach the result to the body.

## 3. Common Mistakes
```sql
-- [anti] A V file packed only with DML (INSERT/UPDATE) → applied differently per environment. Use R__ or a separate seed
-- [anti] ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT on a huge table → lock + full scan → production halt
ALTER TABLE huge_table ADD COLUMN flag BOOLEAN NOT NULL DEFAULT FALSE;
-- [anti] Bundling multiple unrelated changes in one V file → risk of partial application, review difficulty explodes
```
```yaml
# [anti] Turning off checksum validation in prod → meaningless schema management
spring.flyway.validate-on-migrate: false
```
> A single `psql -c "ALTER TABLE ..."` line at the console is the shortest path to a production incident. A migration is a code change — get it reviewed in a PR, validate it in CI, and prepare a rollback.

## 4. Checklist
- [ ] Did you make every schema change as a `V{version}__{description}.sql` file (no direct SQL execution)?
- [ ] Did you add a new version instead of modifying an already-applied `V` file?
- [ ] One file = one unit of change, within 100 lines?
- [ ] Did you split DROP/column changes into zero-downtime stages?
- [ ] Did you apply per-environment policy (prod `clean-disabled`, `validate-on-migrate: true`)?
- [ ] Did you prepare a compensating migration and backup/verification queries for changes that need rollback?
- [ ] Did you measure time/lock/failure via dry-run on a staging clone before merging the PR?
- [ ] Did you avoid touching `flyway_schema_history` by hand?
