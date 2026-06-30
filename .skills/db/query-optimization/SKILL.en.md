---
name: Query Optimization
description: A standard (DB-neutral) for N+1 detection, slow-query analysis, query refactoring, and statistics management. Read this when catching slow queries or improving execution plans, eliminating N+1, or finding why an index isn't being used. Keywords: slow-query, n+1, explain, query-plan, join, batch, select-star, analyze.
rules:
  - "Detect N+1 queries and replace them with JOINs or batch loading (IN clause / DataLoader)."
  - "Set a slow-query log threshold (e.g., 1 second or more) and review and optimize periodically."
  - "Avoid SELECT * and specify only the needed columns to reduce I/O and network transfer."
  - "Verify that the column types in join conditions match — type mismatches invalidate indexes through implicit casting."
  - "Refresh table statistics (ANALYZE) periodically, and when the planner chooses a wrong execution plan, try updating statistics first."
tags:
  - "slow-query"
  - "n+1"
  - "explain"
  - "query-plan"
  - "join"
  - "batch"
  - "select-star"
  - "analyze"
---

# 🐢 Query Optimization

> Establish a standard (DB-neutral) for detecting, analyzing, and refactoring slow queries. Read this when eliminating N+1, improving slow queries, or when execution plans look odd.

## 1. Core Principles
- Detect N+1 queries and replace them with JOINs or batch loading (IN clause / DataLoader).
- Set a slow-query log threshold (e.g., 1 second or more) and review and optimize periodically.
- Avoid `SELECT *` and specify only the needed columns to reduce I/O and network transfer.
- Verify that the column types in join conditions match — type mismatches invalidate indexes through implicit casting.
- Refresh table statistics (ANALYZE) periodically, and when the planner chooses a wrong execution plan, try updating statistics first.

## 2. Rules

### 2-1. The N+1 Problem and Its Solution
```python
# ❌ Forbidden — N+1: one query for orders + one user query per order
orders = db.query("SELECT * FROM orders WHERE status='paid'")
for order in orders:
    user = db.query("SELECT * FROM users WHERE id = ?", order.user_id)  # runs N times

# ✅ Recommended — fetch in one shot with JOIN
orders = db.query("""
    SELECT o.*, u.name, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'paid'
""")
```

### 2-2. Slow-Query Log Configuration
```sql
-- PostgreSQL
ALTER SYSTEM SET log_min_duration_statement = '1000';  -- 1 second or more
SELECT pg_reload_conf();

-- view slow queries
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;
```

### 2-3. Key Points When Reading EXPLAIN
```
Seq Scan       → full scan. Consider adding an index
Hash Join      → join of large tables. Usually fine
Nested Loop    → efficient for few rows, risky for large tables
Sort(external) → sort exceeds memory. Consider increasing work_mem
```

### 2-4. Query Refactoring Patterns
```sql
-- ❌ WHERE YEAR(created_at) = 2026  (function invalidates index)
-- ✅ use a range condition to leverage the index
WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'

-- ❌ NOT IN (subquery)  (NULL caution + performance)
-- ✅ LEFT JOIN ... IS NULL
LEFT JOIN ... WHERE t2.id IS NULL

-- ❌ COUNT(*) > 0
-- ✅ EXISTS (stops immediately when the condition is satisfied)
EXISTS (SELECT 1 FROM ...)
```

### 2-5. Avoiding SELECT *
```sql
-- ❌ Forbidden — transfers even unnecessary columns, index-only scan impossible
SELECT * FROM orders WHERE status = 'paid';

-- ✅ Recommended — specify only the needed columns
SELECT id, user_id, amount FROM orders WHERE status = 'paid';
```

## 3. Common Mistakes
- Hiding N+1 behind an ORM convenience method and not noticing it.
- Join column type mismatch (varchar vs int) invalidating the index via implicit casting.
- Suspecting the index first when statistics are stale and the planner picks a full scan.
- Wrapping a WHERE-clause column in a function and invalidating the index.

## 4. Checklist
- [ ] Did you replace N+1 with a JOIN or batch loading?
- [ ] Did you set a slow-query log threshold and review it periodically?
- [ ] Did you specify only the needed columns instead of `SELECT *`?
- [ ] Do the join column types match?
- [ ] When the execution plan looks odd, did you first check the statistics (ANALYZE) refresh?
