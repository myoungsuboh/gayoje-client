---
name: Partitioning Strategy
description: Standards for time-series/range/hash partitioning design, partition pruning, and management automation (PostgreSQL-focused). Read when designing large tables of hundreds of millions of rows or time-series tables, DROPping/archiving old data, or reviewing partition keys and pruning. Keywords: partition, partitioning, range-partition, hash-partition, list-partition, pg_partman, time-series, pruning, DETACH.
rules:
  - "Apply partitioning to large tables with hundreds of millions of rows or more, or to time-series data where old partitions must be DROPped."
  - "Choose a partition key on a column always present in the query WHERE clause (e.g., created_at) to leverage partition pruning."
  - "Manage time-series data with monthly/quarterly RANGE partitioning, and automate new partition creation with a scheduler."
  - "Since partition indexes are created per partition, confirm the effect of reduced total table index size."
  - "Validate with DETACH before DROPping a partition, and do not DELETE immediately to prevent mistakes."
tags:
  - "partition"
  - "partitioning"
  - "range-partition"
  - "hash-partition"
  - "list-partition"
  - "pg_partman"
  - "time-series"
  - "pruning"
  - "DETACH"
---

# 🗂️ Partitioning Strategy

> Split large/time-series tables into partitions to control query performance and management cost. Read when designing tables of hundreds of millions of rows or cleaning up old partitions.

## 1. Core Principles
- Apply partitioning to large tables with hundreds of millions of rows or more, or to time-series data where old partitions must be DROPped.
- Choose a partition key on a column always present in the query WHERE clause (e.g., `created_at`) to leverage partition pruning.
- Manage time-series data with monthly/quarterly RANGE partitioning, and automate new partition creation with a scheduler.
- Since partition indexes are created per partition, confirm the effect of reduced total table index size.
- Validate with DETACH before DROPping a partition, and do not DELETE immediately to prevent mistakes.

## 2. Rules

### 2-1. Choosing a Partitioning Type
| Type | Criterion | Suitable for |
|------|------|-----------|
| RANGE | Numeric/date range | Time-series logs/events |
| LIST | Fixed value list | Region/status codes |
| HASH | Hash distribution | Evenly distributed large volumes |

### 2-2. RANGE Partitioning (PostgreSQL)
```sql
-- ✅ Create parent table — partition key is created_at, always used in WHERE
CREATE TABLE events (
  id         BIGINT NOT NULL,
  event_type VARCHAR,
  created_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

-- ✅ Create monthly partitions
CREATE TABLE events_2026_01
  PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE events_2026_02
  PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### 2-3. Verifying Partition Pruning
```sql
-- ✅ Put the partition key in WHERE and verify only a single partition is scanned
EXPLAIN SELECT * FROM events WHERE created_at >= '2026-06-01';
-- Only "Seq Scan on events_2026_06" should be output
-- If there are no other partitions under "Append", pruning succeeded
```

### 2-4. Automatic Partition Management (pg_partman)
```sql
-- ✅ Pre-create future partitions to prevent load failures
SELECT partman.create_parent(
  p_parent_table => 'public.events',
  p_control => 'created_at',
  p_type => 'range',
  p_interval => '1 month',
  p_premake => 3   -- pre-create 3 future months
);
```

### 2-5. Retiring Old Partitions (DROP after DETACH)
```sql
-- ✅ Detach first (keep as a table) to validate
ALTER TABLE events DETACH PARTITION events_2025_01;

-- ✅ Delete or archive after validation
DROP TABLE events_2025_01;  -- or pg_dump to an ARCHIVE DB then delete

-- ❌ Forbidden — dropping a partition directly without validation (unrecoverable)
-- DROP TABLE events_2025_01;  (skipping the DETACH step)
```

## 3. Common Mistakes
- Not putting the partition key in WHERE, so all partitions are scanned → pruning is void.
- Not pre-creating future partitions, causing a "no partition" error at load time.
- DROPping directly without DETACH → unrecoverable on mistakes.
- Over-splitting into too many partitions, increasing metadata/planning cost.

## 4. Checklist
- [ ] Is the scale really one that needs partitioning (hundreds of millions of rows / time-series DROP)?
- [ ] Is the partition key a column always present in WHERE?
- [ ] Did you verify partition pruning with EXPLAIN?
- [ ] Did you automate future partition creation with a scheduler (pg_partman, etc.)?
- [ ] Do you remove partitions in the order DETACH → validate → DROP?
