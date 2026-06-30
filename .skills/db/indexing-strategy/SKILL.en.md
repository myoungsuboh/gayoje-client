---
name: Indexing Strategy (Indexing Strategy)
description: A general-purpose standard for index design and maintenance — covers index type selection, composite column order, covering, execution-plan (EXPLAIN) verification, and cleanup of unused indexes. Read when creating a new index, tuning a slow query, or reviewing index order and unused indexes. Keywords: index, composite-index, covering-index, explain, unused-index.
rules:
  - "Indexes make reads faster and writes slower: every write (INSERT/UPDATE/DELETE) also updates the indexes. Focus on columns actually used in WHERE/JOIN/ORDER BY, and avoid over-creation."
  - "Design after measuring: do not create indexes by guesswork — first confirm slow access (full scans, etc.) with an execution plan (EXPLAIN-style), then add the index, and verify the effect again with the execution plan."
  - "For a composite index, column order is everything: put high-cardinality columns and equality (=) condition columns first, and range (>,<,BETWEEN) and sort columns last. An index uses only its 'leftmost prefix', so match it to the order of query conditions."
  - "Transforming a column disables the index: wrapping a column in a function or operation in the WHERE clause (UPPER(col), col + 1) or using a leading-wildcard pattern ('%suffix') nullifies the index — index the expression itself or rewrite the query."
  - "Only as much as needed, narrowed conditionally: if only some rows are queried, reduce size with a conditional (partial) index, and including the columns needed by the query in the index (covering) lets it respond from the index alone without touching the table."
  - "Unused indexes are debt: an index that is never used only consumes write cost and storage space. Periodically check usage statistics and remove them."
  - "Watch out for locks when creating indexes on production tables: creating an index on a large production table can take a write lock and cause an outage — use the online/non-blocking index creation options your DB provides."
tags:
  - "index"
  - "composite-index"
  - "covering-index"
  - "explain"
  - "unused-index"
  - "b-tree"
  - "partial-index"
  - "cardinality"
---

# 📇 Indexing Strategy (Indexing Strategy)

> Unifies index type selection, design, and maintenance. Read when creating a new index, tuning a slow query, or cleaning up unused indexes. This is a general-purpose standard not tied to a specific DB engine/tool. For rewriting the query itself, refer to the query-optimization skill.

## 1. Core Principles
- **Indexes make reads faster and writes slower**: every write (INSERT/UPDATE/DELETE) also updates the indexes. Focus on columns actually used in WHERE/JOIN/ORDER BY, and avoid over-creation.
- **Design after measuring**: do not create indexes by guesswork — first confirm slow access (full scans, etc.) with an execution plan (EXPLAIN-style), then add the index, and verify the effect again with the execution plan.
- **For a composite index, column order is everything**: put high-cardinality columns and equality (=) condition columns first, and range (`>`,`<`,`BETWEEN`) and sort columns last. An index uses only its "leftmost prefix", so match it to the order of query conditions.
- **Transforming a column disables the index**: wrapping a column in a function or operation in the WHERE clause (`UPPER(col)`, `col + 1`) or using a leading-wildcard pattern (`'%suffix'`) nullifies the index — index the expression itself or rewrite the query.
- **Only as much as needed, narrowed conditionally**: if only some rows are queried, reduce size with a conditional (partial) index, and including the columns needed by the query in the index (covering) lets it respond from the index alone without touching the table.
- **Unused indexes are debt**: an index that is never used only consumes write cost and storage space. Periodically check usage statistics and remove them.
- **Watch out for locks when creating indexes on production tables**: creating an index on a large production table can take a write lock and cause an outage — use the online/non-blocking index creation options your DB provides.

## 2. Rules

### 2-1. Limit index targets to WHERE/JOIN/ORDER BY columns
- Place indexes only on columns that real queries filter, join, or sort by.
- Indexing every column "just in case" is prohibited — it slows down every write by updating all indexes.

```text
// ❌ Prohibited — index every column, even ones the query never uses
index(col1); index(col2); index(col3); ... // nearly every column in the table

// ✅ Recommended — only columns that the actual query pattern uses
index(orders.user_id)          // WHERE user_id = ?
index(orders.status)           // WHERE status = ?
```

### 2-2. Choose the index type by access pattern
Most equality, range, and sort needs are sufficiently served by a basic (sorted, often B-tree) index. Below are conceptual selection criteria; actual supported types and syntax differ per DB (see appendix).

| Type (concept) | When to use |
|------|-----------|
| Sorted basic index (B-tree family) | Equality, range, sort — the most common |
| Composite (multi-column) index | Conditions that filter several columns together |
| Conditional (partial) index | When you frequently query only rows meeting a specific condition (e.g., active rows only) |
| Covering index | When the index contains all queried columns, eliminating table access |
| Expression (function) index | When querying by a transformed value such as `lower(email)` |
| Equality-only index (hash family) | When you only need equality comparison, without sort or range |

### 2-3. Composite index column order
Put equality-condition and high-cardinality columns first, range and sort columns last, and match the query condition order. An index is used only from its leftmost prefix.

```sql
-- ✅ Recommended — equality (=) columns first, sort column last, matching the query condition order
CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at DESC);

-- Query that uses the index above
SELECT * FROM orders
 WHERE user_id = ? AND status = 'paid'
 ORDER BY created_at DESC;
```

```text
// ❌ Prohibited — the index is (a, b, c) but the query conditions on b only
//          skipping the leftmost prefix (a) means the index is not used
index(a, b, c)  ↔  WHERE b = ?      // b only, without a → cannot be used
```

### 2-4. A condition that transforms a column disables the index
Wrapping the column itself in a function or operation in the WHERE clause prevents a normal index from being used. Index the expression as is (expression index) or rewrite the query.

```sql
-- ❌ Prohibited — wrapping a column in a function nullifies a normal index
SELECT * FROM users WHERE lower(email) = 'a@b.com';   -- cannot use the email index
SELECT * FROM orders WHERE created_at + 1 > ?;        -- nullified by the operation

-- ✅ Recommended — index the expression itself, or transform the condition so the column is not transformed
-- (Expression index: index lower(email))
-- (Range transform: like created_at > ? - 1, leave the column as is and transform the constant side)
```

### 2-5. Pattern search and indexes
A prefix search with a fixed leading portion uses the index, but a leading wildcard means a full scan. If suffix/partial matches are frequent, consider full-text search features or a search engine.

```sql
-- ✅ Recommended — a prefix search uses the index
SELECT * FROM users WHERE name LIKE 'Kim%';

-- ❌ Prohibited — a leading wildcard means a full scan; consider a full-text search engine
SELECT * FROM users WHERE name LIKE '%Kim';
```

### 2-6. Verify with the execution plan (EXPLAIN)
Look at the execution plan before and after adding an index, and confirm whether a full scan changes to index access. The specific syntax and output differ per DB (see appendix).

```sql
-- Standard entry point (output format and options differ per DB)
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- Common things to check:
--  · Whether a full scan (Full/Seq Scan) changes to index access (Index Scan, etc.)
--  · The gap between the optimizer's estimated rows vs actual rows (a large gap means statistics need refreshing)
--  · Whether the intended index is actually used
```

### 2-7. Covering index (index-only access)
If the index holds all columns needed by a query, it responds from the index alone without accessing the table body. This is effective for a small set of columns frequently queried together. (The syntax to specify included columns differs per DB → appendix)

```text
// Concept — including queried columns (b, c) in the index skips table access
index on t(a) + include(b, c)   ↔   SELECT a, b, c FROM t WHERE a = ?
```

### 2-8. Detect and remove unused indexes
An index not used by any query only takes up write cost and storage space. Periodically check the DB's usage statistics (scan counts, etc.), and list indexes kept at 0 for a long time as removal candidates. (The way to query statistics differs per DB → appendix)

```text
// Concept — make indexes with usage count 0 and enough observation removal candidates
query per-index usage count → usage count = 0 → review as deletion candidate
```

### 2-9. Avoid locks when creating indexes on production tables
Creating an index normally on a large production table takes a write lock during creation and can cause an outage. Use the online/non-blocking index creation options your DB provides. (The syntax for that option differs per DB → appendix)

```text
// ❌ Prohibited — normal creation that locks a large production table
normal index creation  → write lock on the table during creation → outage risk

// ✅ Recommended — use the online/non-blocking creation option your DB provides
non-blocking index creation option  → built in the background without locks
```

## 3. Common Mistakes
- **Overusing indexes on every column** → degraded write performance and wasted storage space. Index only the columns of the actual query pattern.
- **Placing composite index column order differently from the query** → fails to match the leftmost prefix, so the index is not used.
- **Transforming a column with a function/operation in the WHERE clause** → nullifies a normal index. Use an expression index or transform the condition.
- **Expecting an index on a leading-wildcard LIKE** (`'%suffix'`) → full scan. Consider full-text search.
- **Creating an index and not verifying with the execution plan** → you leave an index that the optimizer does not use.
- **Leaving unused indexes** → unnecessary write and storage cost. Check periodically with usage statistics.
- **Normal creation that locks a production table** → outage from a write lock during index creation. Use the non-blocking creation option.

## 4. Checklist
- [ ] Are there indexes on WHERE/JOIN/ORDER BY columns, with no over-creation?
- [ ] Does the composite index column order match equality/cardinality/sort and query order (leftmost prefix)?
- [ ] Did you avoid killing the index by transforming a column with a function/operation in the WHERE condition?
- [ ] Did you avoid trying to handle a leading-wildcard pattern search with an index (consider full-text search)?
- [ ] Before and after adding the index, did you confirm the switch to index access with the execution plan (EXPLAIN)?
- [ ] Did you reduce table access with covering for columns frequently queried together?
- [ ] Did you review and remove unused indexes (usage count 0)?
- [ ] Did you create production-table indexes with the non-blocking/online option?

## Appendix: Per-Stack Examples

> Below are PostgreSQL syntax examples of the 1–4 standards above (see the main text for concepts and selection criteria). Add to it as fits your team's DB (e.g., MySQL/InnoDB, Oracle, SQL Server, MongoDB, etc.).

### PostgreSQL

```sql
-- Syntax per index type (selection criteria in 2-2)
CREATE INDEX ON t(col);                       -- B-tree (default): range, equality, sort
CREATE INDEX ON t(a, b);                       -- Composite: multiple columns
CREATE INDEX ON t(col) WHERE active = true;    -- Partial: only conditional rows
CREATE INDEX ON t(a) INCLUDE (b, c);           -- Covering: include non-search columns with INCLUDE
CREATE INDEX USING HASH ON t(col);             -- Hash: equality only

-- Execution-plan verification (2-6) — a large actual vs estimated gap means ANALYZE; Buffers for cache hit rate
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'test@example.com';

-- Detect unused indexes (2-8) — those with idx_scan = 0, ordered by size
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Non-blocking index creation (2-9) — CONCURRENTLY: create without locks
CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);
```
