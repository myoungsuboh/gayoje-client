---
name: Relational DB Common Naming/Type Standard (Relational DB Conventions)
description: A single, universal (foundational) specification of naming, common columns, and data types applied identically to all relational DBs. Read this when designing new tables/columns, migrating legacy such as abbreviated columns, or unifying divergent naming. Dialect differences go to dedicated skills; soft delete/audit is delegated to `soft-delete-audit`. Keywords: snake_case, primary key, foreign key, naming, common columns, created_at, deleted_at, data type, decimal.
rules:
  - "Naming under one spec: table names are plural snake_case, column names are singular snake_case. Do not mix in prefixes (TB_, tb_, etc.), uppercase, or abbreviations."
  - "Keys in a consistent form: unify PKs as id and FKs as referencedtablesingular_id. Do not use natural keys whose meaning can change (email, employee number) as PKs."
  - "Names reveal meaning: forbid abbreviated column names and use whole words — the name alone should tell you what it is."
  - "Enforce common columns: every table has common columns such as creation/update timestamps and author. Do not operate without audit information."
  - "Soft delete is the default: instead of physical deletion, fill in the deletion timestamp (deleted_at), and queries always look only at 'live rows' (deleted_at IS NULL). Preserve audit trails and referential integrity (see soft-delete-audit for the pattern details)."
  - "Types with safe defaults: use fixed-point (not floating-point) for money, a dedicated boolean type for true/false, and a sufficiently large integer/identifier type for keys."
  - "Delegate product/tool dependencies: dialect differences such as paging, UPSERT, and auto-increment keys, and tool usage such as mapper/ORM mapping, are deferred to dedicated skills/appendices rather than the main text."
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

# 🗄️ Relational DB Common Naming/Type Standard

> The single source of truth for naming, common columns, and type selection applied identically across all relational DBs. Read this when designing new tables/columns, migrating legacy abbreviated columns, or unifying naming that has diverged across teams/products. It is a universal standard not tied to any particular DB product, mapper/ORM tool, or language.

## 1. Purpose

- Unify table, column, and index naming into **one spec** to eliminate confusion (`snake_case`/`PascalCase`, presence or absence of prefixes, etc.) that arose because people, teams, and DB products named things differently.
- Make every table follow the same **common columns** and **soft delete** policy to guarantee audit trails and query consistency.
- Set universal principles for data type selection to prevent recurring incidents such as monetary rounding errors and type mismatches.
- Remove product (dialect) and tool (mapper/ORM) dependent details from the main text and delegate them to dedicated skills/appendices, so this document remains a **common spec readable on any stack**.

## 2. Core Principles

- **Naming under one spec**: table names are plural `snake_case`, column names are singular `snake_case`. Do not mix in prefixes (`TB_`, `tb_`, etc.), uppercase, or abbreviations.
- **Keys in a consistent form**: unify PKs as `id` and FKs as `referencedtablesingular_id`. Do not use natural keys whose meaning can change (email, employee number) as PKs.
- **Names reveal meaning**: forbid abbreviated column names and use whole words — the name alone should tell you what it is.
- **Enforce common columns**: every table has common columns such as creation/update timestamps and author. Do not operate without audit information.
- **Soft delete is the default**: instead of physical deletion, fill in the deletion timestamp (`deleted_at`), and queries always look only at "live rows" (`deleted_at IS NULL`). Preserve audit trails and referential integrity (see `soft-delete-audit` for the pattern details).
- **Types with safe defaults**: use fixed-point (not floating-point) for money, a dedicated boolean type for true/false, and a sufficiently large integer/identifier type for keys.
- **Delegate product/tool dependencies**: dialect differences such as paging, UPSERT, and auto-increment keys, and tool usage such as mapper/ORM mapping, are deferred to dedicated skills/appendices rather than the main text.

## 3. Rules

### 3-1. Table Naming — plural snake_case, no prefixes/abbreviations

Join (N:M) tables concatenate the two table names in alphabetical order.

```text
// ✅ Recommended
users
asset_logs
order_items
user_roles          // N:M join table (users × roles)

// ❌ Forbidden (refactor immediately)
TB_USER             // prefix + uppercase + singular
tbl_orders          // prefix
UserAccount         // PascalCase
usr                 // abbreviation
```

### 3-2. Column Naming — PK/FK/general

| Kind | Rule | Example |
|---|---|---|
| PK (single PK recommended) | `id` or `<singular>_id` | `users.id` or `users.user_id` |
| FK | referenced table singular + `_id` | `orders.user_id` → `users.id` |
| General column | `snake_case`, noun | `email`, `total_amount` |
| Boolean | `is_*` / `has_*` | `is_active`, `has_paid` |
| Datetime | `*_at` (time) / `*_on` (date) | `created_at`, `deleted_at`, `birth_on` |

```text
// ✅ Recommended — consistent key/boolean/time naming
table orders:
  id            PK
  user_id       FK → users.id
  total_amount  fixed-point money
  is_paid       boolean (default false)
  paid_at       time (nullable)

// ❌ Forbidden — abbreviated keys, Y/N flags, ambiguous date columns
table orders:
  ordr_id, usr_id, amt, pay_yn('Y'/'N'), pay_dt
```

### 3-3. No Abbreviated Column Names — use full names

The most common readability-destroying pattern in legacy. Forbid it unconditionally in new schemas, and on migration make changing to full names the **first task**.

| ❌ Forbidden abbreviation | ✅ Full name | Note |
|---|---|---|
| `user_nm` | `user_name` | `_nm` has ambiguous meaning |
| `reg_dt`, `upd_dt` | `created_at`, `updated_at` | `_dt` is unclear about date/time |
| `del_yn` (`'Y'`/`'N'`) | `deleted_at` (nullable time) | character Y/N is inefficient for indexes/conditions and cannot record the deletion time |
| `use_yn` | `deleted_at` | express active/deleted via the deletion time |
| `tel_no` | `phone_number` | |
| `cust_cd` | `customer_code` | |

```text
// ❌ Forbidden — abbreviation bombardment
table tb_user:
  user_id, user_nm, use_yn('Y'/'N'), reg_dt, upd_dt

// ✅ Recommended — full names + common columns
table users:
  id            PK
  user_name
  email
  created_at, updated_at
  created_by, updated_by
  deleted_at, deleted_by   // NULL=active, NOT NULL=deleted
```

### 3-4. Common Columns — enforced on every table

Every table has columns with the meanings below (names follow this standard).

| Column | Meaning |
|---|---|
| `created_at` | creation time |
| `updated_at` | update time |
| `created_by` | creator identifier (nullable) |
| `updated_by` | updater identifier (nullable) |
| `deleted_at` | soft-delete time (nullable timestamp, `NULL`=active, `NOT NULL`=deleted) |
| `deleted_by` | deleter identifier (nullable) |

- **Unify the delete flag as `deleted_at` (nullable timestamp)**: instead of a boolean `is_deleted`, fill in the deletion time so that "deleted" and "when it was deleted" are recorded in one column. Instead of physical deletion, fill in `deleted_at` and enforce the "not-deleted rows" (`deleted_at IS NULL`) condition on all queries. For soft-delete/audit pattern details, follow the `soft-delete-audit` skill.
- **The author (`created_by`/`updated_by`) is injected automatically**: intercept and fill it from the authentication context (e.g., a persistence-layer interceptor / cross-cutting concern). The controller/service does not fill it directly — the implementation means is delegated to the team's stack.

```text
// ❌ Forbidden — no audit columns + physical deletion
table products: id, name, price          // no created_at/updated_at
DELETE FROM products WHERE id = ?         // vanishes without a trace

// ✅ Recommended — common columns + soft delete
table products: id, name, price, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by
UPDATE products SET deleted_at = <now>, deleted_by = ? WHERE id = ?
SELECT ... FROM products WHERE deleted_at IS NULL   // queries always see only live rows
```

### 3-5. Index / Constraint Naming

| Kind | Form | Example |
|---|---|---|
| Index | `idx_<table>_<columns>` | `idx_orders_user_id_created_at` |
| Unique index | `ux_<table>_<columns>` | `ux_users_email` |
| FK constraint | `fk_<table>_<referenced table>` | `fk_orders_user` |
| CHECK constraint | `ck_<table>_<column>` | `ck_orders_total_amount` |

```text
// ✅ Recommended — names where kind/target are readable at a glance
idx_orders_user_id_created_at   on orders(user_id, created_at desc)
ux_users_email                  on users(email)

// ❌ Forbidden — auto-generated meaningless names / unclear kind
orders_idx1, SYS_C0012345
```

### 3-6. Data Type Selection — safe defaults

| Use | Recommended | ❌ Avoid |
|---|---|---|
| PK / FK | large integer (e.g., 64-bit) or identifier (UUID) | small integer (range limit) |
| Short string | variable-length string, unified length cap (e.g., 255) | unlimited/inconsistent lengths |
| Code value | short variable string (e.g., 50) | |
| Long text | large text type | |
| **Money** | **fixed-point (decimal/numeric)** | **floating-point (float/double) — rounding error** |
| True/false | dedicated boolean type | character `'Y'`/`'N'` (inefficient for indexes/conditions) |
| Datetime | time type (store in UTC recommended) | |
| Date only | date type | |

- **No floating-point for money**: errors like `0.1 + 0.2 = 0.30000000000000004` lead to accounting incidents. Always fixed-point.
- **True/false is a boolean type**: character Y/N has low cardinality and causes case-sensitivity human errors (`'y'`).
- **Store timezones in UTC**: store server/DB/runtime in UTC and convert to local time only at display time. Concrete types and session-timezone handling are dialect differences (delegated to 3-7 below).

```text
// ❌ Forbidden
amount  float                 // rounding error
is_paid char(1) 'Y'/'N'       // inefficient for indexes/conditions
id      int                   // range limit

// ✅ Recommended
amount  decimal(15,2)
is_paid boolean
id      bigint (or uuid)
```

### 3-7. Dialect/tool differences delegated to dedicated skills

This document covers **the common spec only**. Do not write product (dialect)-specific syntax or tool usage in the main text; consult each dedicated skill.

| Item | Where it is covered |
|---|---|
| Paging, UPSERT, auto-increment PK, concrete boolean/time types | each dialect-dedicated skill (e.g., PostgreSQL/MySQL/Oracle skills) |
| Transactions/locks | `transaction-locking` skill |
| Connection pool | `connection-pool-tuning` skill |
| Migrations | `db-migration-flyway` skill |
| Mapper/ORM mapping, centralizing common clauses | per-stack examples in the appendix (below) |

## 4. Common Mistakes

- **Abbreviation bombardment**: `tb_usr(usr_nm, reg_dt, use_yn)` — forbidden in new schemas, use full names.
- **True/false as character Y/N**: `WHERE use_yn = 'Y'` — low index cardinality and lowercase `'y'` human error. Use a boolean type.
- **Natural key as PK**: using email/employee number as PK makes value changes impossible and FK propagation cost explodes.
- **Floating-point for money**: `0.1 + 0.2 = 0.30000000000000004` rounding error.
- **Physical deletion**: vanishes without a trace, making audit trails impossible and breaking referential integrity. Use soft delete.
- **Missing the delete condition in queries**: omitting `deleted_at IS NULL` queries even deleted rows.
- **Missing common columns**: building without creation/update timestamps or author makes after-the-fact audit/tracking impossible.
- **Embedding dialect syntax in the common spec**: writing product-specific syntax in this document breaks on other products — delegate to a dedicated skill.

## 5. Checklist

- [ ] Are tables plural `snake_case` with no prefixes, and columns singular `snake_case`?
- [ ] Are PKs `id` and FKs `referencedtablesingular_id` (not natural-key PKs)?
- [ ] Did you use full names without abbreviated columns (`_nm`, `_dt`, `_yn`, etc.)?
- [ ] Did you include all common columns (`created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_by`)?
- [ ] Did you apply soft delete (filling `deleted_at`) instead of physical deletion?
- [ ] Does every query include the "not-deleted rows" condition (`deleted_at IS NULL`)?
- [ ] Did you follow the index/constraint prefixes (`idx_`/`ux_`/`fk_`/`ck_`)?
- [ ] Is money fixed-point, true/false boolean, and PK a large integer/UUID?
- [ ] Did you delegate dialect/tool-dependent details (paging, UPSERT, mapper config, etc.) to dedicated skills/appendices?

## Appendix: Per-Stack Examples

> The below are reference implementation examples. The principles/rules in 1–5 above are the standard; the appendix is merely an application case. **Add an example matching your team's stack (mapper/ORM, language) in the same pattern.**

### MyBatis (Java)

In the persistence layer, centralize mapping and common clauses with `resultMap` and `<sql>`/`<include>`. Even when a column changes, fixing it in one place reflects across all Mappers.

```yaml
mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # user_name → userName (unified across the whole project)
    default-statement-timeout: 30
    jdbc-type-for-null: NULL              # Oracle compatibility
    cache-enabled: false                  # second-level cache via a separate cache layer
```
```xml
<!-- ✅ resultMap: always write it even for simple mapping (preparing for JOIN expansion) -->
<resultMap id="userResultMap" type="com.example.dto.UserResponse">
    <id     property="id"         column="id"/>
    <result property="userName"   column="user_name"/>
    <result property="email"      column="email"/>
    <result property="createdAt"  column="created_at"/>
</resultMap>

<!-- ✅ Centralize the common-column SELECT clause by extracting it into <sql> -->
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

<!-- Dynamic IN clause handling -->
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
> Centralizing the SELECT columns and the common WHERE clause with `<sql>` + `<include>` means that when adding a column, fixing one place reflects across all Mappers.

#### MyBatis-Specific Common Mistakes
- **Relying on `SELECT *` auto-mapping without a `resultMap`** — you discover broken mapping in production when a column is added. Write a `resultMap` even for simple mapping.
- **Not centralizing the common WHERE clause** — writing `deleted_at IS NULL` directly in each Mapper causes omissions. Centralize it with `<sql>`/`<include>`.
