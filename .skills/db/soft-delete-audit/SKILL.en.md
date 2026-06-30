---
name: Soft Delete & Audit Columns
description: A general-purpose (foundational) standard for logical deletion, create/update/delete audit columns, and change history — instead of physical deletes use `deleted_at`, auto-update audit columns, default-filter to active records, partial unique excluding deleted rows, and preserve history. Read this when designing delete/audit columns or when deleted records conflict with unique constraints (column naming/types are in `db-common-conventions`). Keywords: soft-delete, deleted_at, audit, history, partial unique, history table.
rules:
  - "Logical delete instead of physical delete: don't remove rows for business data; logically delete by marking a 'deletion timestamp'. Permanent deletion is handled only by a separate archiving/cleanup process — preserving recoverability and auditability."
  - "Audit columns are common to all domain tables: place the 'when and who' of create/update/delete as standard columns (created_at/updated_at/deleted_at, created_by/updated_by/deleted_by) on all domain tables. Use a nullable timestamp deleted_at (NULL = active) for the delete flag — not a boolean. The column naming/type conventions themselves follow the db-common-conventions skill."
  - "Audit columns are updated automatically: don't rely on manual updates for values like updated_at; fill them automatically with a DB trigger or an ORM/application hook — so they're never missed on some path."
  - "Default-filter to active records: include the 'only non-deleted rows' condition in default queries, and apply it automatically where possible (e.g., an ORM global scope) so deleted rows aren't accidentally exposed."
  - "Unique excluding deleted records: apply natural-key (e.g., email) unique constraints 'to active records only' — so re-registering the same value after deletion doesn't conflict."
  - "Change history in a separate table: when you need to track changes to important data, run a separate history table (audit_log or a *_history suffix)."
  - "Prevent unbounded growth: if you only logically delete and never clean up, the table grows without bound. Define retention period, archiving, and cleanup policy together."
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

# 🗑️ Soft Delete & Audit Columns

> Defines the standard for logically deleting, auditing, and tracking history of data instead of physically deleting it. Read this when designing domain tables or deciding change-history/deletion policy. This is a general-purpose standard not tied to a specific DB/ORM.

## 1. Core Principles
- **Logical delete instead of physical delete**: don't remove rows for business data; logically delete by marking a "deletion timestamp". Permanent deletion is handled only by a separate archiving/cleanup process — preserving recoverability and auditability.
- **Audit columns are common to all domain tables**: place the "when and who" of create/update/delete as standard columns (`created_at`/`updated_at`/`deleted_at`, `created_by`/`updated_by`/`deleted_by`) on all domain tables. Use a nullable timestamp `deleted_at` (NULL = active) for the delete flag — not a boolean. The column naming/type conventions themselves follow the `db-common-conventions` skill.
- **Audit columns are updated automatically**: don't rely on manual updates for values like `updated_at`; fill them automatically with a DB trigger or an ORM/application hook — so they're never missed on some path.
- **Default-filter to active records**: include the "only non-deleted rows" condition in default queries, and apply it automatically where possible (e.g., an ORM global scope) so deleted rows aren't accidentally exposed.
- **Unique excluding deleted records**: apply natural-key (e.g., email) unique constraints "to active records only" — so re-registering the same value after deletion doesn't conflict.
- **Change history in a separate table**: when you need to track changes to important data, run a separate history table (`audit_log` or a `*_history` suffix).
- **Prevent unbounded growth**: if you only logically delete and never clean up, the table grows without bound. Define retention period, archiving, and cleanup policy together.

> Entry-point standards such as input validation and error responses follow the `validation-bean` skill. This skill focuses on the data model (delete/audit/history).

## 2. Rules

### 2-1. Place standard audit columns on all domain tables
- Place the "when (timestamp)" and "who (actor)" of create/update/delete consistently as standard columns.
- `deleted_at` (or an equivalent deletion timestamp/flag) means **active when empty, deleted when filled**.

```text
// ✅ Recommended — audit columns shared by all domain tables (standard SQL pseudo-notation)
TABLE <domain>:
  id           <identifier>  PRIMARY KEY
  ...business columns...

  created_at   TIMESTAMP   NOT NULL   -- creation time
  updated_at   TIMESTAMP   NOT NULL   -- last modification time (auto-updated)
  created_by   <identifier>           -- creator
  updated_by   <identifier>           -- last modifier
  deleted_at   TIMESTAMP   NULL       -- NULL = active, NOT NULL = deleted
  deleted_by   <identifier>   NULL    -- deleter
```

### 2-2. Audit columns like updated_at are updated automatically
- Don't fill the modification time by hand at every call site — if even one path misses it, the column becomes untrustworthy.
- Automate consistently with one team-standard approach: a DB trigger (auto-set right before update) or an ORM/application hook.

```text
// ❌ Forbidden — updating by hand on every update (omissions happen)
UPDATE <domain> SET name = ?, updated_at = <now> WHERE id = ?   -- somewhere it gets missed

// ✅ Recommended — fill updated_at automatically on update (trigger/ORM hook)
ON UPDATE <domain>: set updated_at = <now>   // applied automatically on all update paths
UPDATE <domain> SET name = ? WHERE id = ?      // updated_at is automatic
```

### 2-3. Delete is logical; queries default-filter to active records
- Instead of physical delete (`DELETE`), fill the deletion timestamp. Default queries see "only non-deleted rows".
- Where possible, apply the active filter automatically via an ORM global scope, and allow include-deleted queries only on explicit paths such as admin/audit.

```text
// ❌ Forbidden — physical delete (no recovery/audit)
DELETE FROM <domain> WHERE id = ?

// ✅ Recommended — logical delete
UPDATE <domain> SET deleted_at = <now>, deleted_by = ? WHERE id = ?

// Query active records only (default — automatic filter if possible)
SELECT * FROM <domain> WHERE deleted_at IS NULL

// Query including deleted (admin/audit — only on explicit paths)
SELECT * FROM <domain>
```

### 2-4. Unique constraints exclude deleted records
- If you apply a "whole-row" unique on a natural key (email, code, etc.), re-registering the same value after deletion conflicts with the deleted row.
- Apply unique "to active records only". If the DB supports a conditional (partial) unique index, use it; otherwise use an equivalent means (e.g., include the deletion marker in the unique key).

```text
// ❌ Forbidden — whole unique: deleted row conflicts with re-registration
UNIQUE (email)

// ✅ Recommended — email is unique only among active records (conditional/partial unique)
UNIQUE (email) WHERE deleted_at IS NULL
```

### 2-5. Change history goes in a separate history table
- When you need to track changes to important data, don't cram it into the main table; run a separate history table (`audit_log` or `*_history`).
- The history records at minimum "what (action), when (timestamp), who (actor), content (snapshot of the changed row)". Match the snapshot storage format (document/JSON/expanded columns) to your team's DB capabilities.

```text
// ✅ Recommended — change history table (standard SQL pseudo-notation)
TABLE <domain>_history:
  history_id   <auto-increment identifier>  PRIMARY KEY
  action       VARCHAR   NOT NULL    -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP             -- change time
  changed_by   <identifier>          -- changer
  row_data     <row snapshot>        -- full row before/after the change (document/JSON/expanded columns)
```

## 3. Common Mistakes
- **Missing the active filter on default queries** → deleted records are exposed as-is. Apply "only non-deleted rows" by default (automatically if possible).
- **Whole-row unique constraint** → conflicts when re-registering the same value after deletion. Use active-record-only unique.
- **Relying on manual `updated_at` updates** → it gets missed on some paths and becomes untrustworthy. Automate with a trigger/ORM hook.
- **No archiving/cleanup** → only logical deletes pile up and the table grows without bound. Define retention/cleanup policy together.
- **Inconsistent audit column names** → using different names per table makes common processing/querying hard. Standardize on one across the team.

## 4. Checklist
- [ ] Is business data **logically deleted** (deletion timestamp/flag) instead of physically deleted?
- [ ] Do all domain tables have create/update/delete **audit columns**, with unified names?
- [ ] Is the modification time such as `updated_at` **auto-updated by a trigger/ORM hook**?
- [ ] Are default queries filtered (automatically if possible) to see **only active records** (excluding deleted)?
- [ ] Do unique constraints **exclude deleted records** (active only)?
- [ ] For tables needing change tracking, is a separate **history table** maintained?
- [ ] Is there a **retention/archiving/cleanup policy** for logically deleted data?

## Appendix: Per-stack Examples

> Below is a PostgreSQL implementation example of the 1–4 standards above (see the body for concept/rule explanations). Add examples for your team's DB (e.g., MySQL, Oracle, SQL Server, SQLite) following the same pattern.

### PostgreSQL

PostgreSQL provides `gen_random_uuid()`, `plpgsql` triggers, partial unique indexes (`WHERE`), `JSONB`, etc. out of the box.

```sql
-- Standard audit columns (2-1)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR NOT NULL,
  name        VARCHAR NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES users(id),
  updated_by  UUID REFERENCES users(id),
  deleted_at  TIMESTAMP,          -- NULL = active, NOT NULL = deleted
  deleted_by  UUID REFERENCES users(id)
);

-- updated_at auto-update trigger (2-2)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Logical delete + active filter (2-3)
UPDATE users SET deleted_at = NOW(), deleted_by = $user WHERE id = $id;
SELECT * FROM users WHERE deleted_at IS NULL;

-- Active-record-only unique (2-4) — partial unique index
CREATE UNIQUE INDEX ON users(email) WHERE deleted_at IS NULL;

-- Change history table (2-5) — snapshot in JSONB
CREATE TABLE users_history (
  history_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action       VARCHAR NOT NULL,  -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP DEFAULT NOW(),
  changed_by   UUID,
  row_data     JSONB              -- full row before the change
);
```
