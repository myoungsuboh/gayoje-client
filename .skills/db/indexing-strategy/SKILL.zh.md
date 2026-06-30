---
name: 索引策略 (Indexing Strategy)
description: 索引设计与维护的通用标准 — 涵盖索引类型选择、复合列顺序、覆盖、执行计划(EXPLAIN)确认、未使用索引的清理。在创建新索引、调优慢查询或检查索引顺序与未使用索引时阅读。关键词: index, composite-index, covering-index, explain, unused-index.
rules:
  - "索引让读取更快、写入更慢: 每次写入(INSERT/UPDATE/DELETE)都会一并更新索引。聚焦在 WHERE·JOIN·ORDER BY 中实际使用的列上, 避免过度创建。"
  - "先测量再设计: 不要凭猜测创建索引, 先用执行计划(EXPLAIN 类)确认慢访问(全表扫描等), 然后再添加索引, 并再次用执行计划验证效果。"
  - "复合索引中列顺序就是一切: 把选择度(cardinality)高的列与等值(=)条件列放在前面, 范围(>,<,BETWEEN)与排序列放在后面。索引只利用其『最左前缀(leftmost prefix)』, 因此要与查询条件的顺序对齐。"
  - "对列做加工就用不上索引: 在 WHERE 子句中对列套用函数·运算(UPPER(col), col + 1)或使用前缀为通配符的模式('%suffix')会使索引失效 — 对表达式本身建索引或改写查询。"
  - "只建必要的, 按条件收窄: 若只查询部分行, 用条件(部分)索引减小体积; 把查询所需的列包含进索引(覆盖)便可不访问表、仅凭索引就能响应。"
  - "未使用的索引是负债: 从未被使用的索引只会消耗写入成本与存储空间。定期检查使用统计并删除它们。"
  - "在生产表上创建索引要当心锁: 在大型生产表上创建索引可能加写锁而酿成故障 — 使用数据库提供的在线/无阻塞索引创建选项。"
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

# 📇 索引策略 (Indexing Strategy)

> 统一索引类型选择与设计·维护。在创建新索引、调优慢查询或清理未使用索引时阅读。这是不依赖于特定数据库引擎/工具的通用标准。要重写查询本身, 请参考 query-optimization 技能。

## 1. 核心原则
- **索引让读取更快、写入更慢**: 每次写入(INSERT/UPDATE/DELETE)都会一并更新索引。聚焦在 WHERE·JOIN·ORDER BY 中实际使用的列上, 避免过度创建。
- **先测量再设计**: 不要凭猜测创建索引, 先用执行计划(EXPLAIN 类)确认慢访问(全表扫描等), 然后再添加索引, 并再次用执行计划验证效果。
- **复合索引中列顺序就是一切**: 把选择度(cardinality)高的列与等值(=)条件列放在前面, 范围(`>`,`<`,`BETWEEN`)与排序列放在后面。索引只利用其"最左前缀(leftmost prefix)", 因此要与查询条件的顺序对齐。
- **对列做加工就用不上索引**: 在 WHERE 子句中对列套用函数·运算(`UPPER(col)`, `col + 1`)或使用前缀为通配符的模式(`'%suffix'`)会使索引失效 — 对表达式本身建索引或改写查询。
- **只建必要的, 按条件收窄**: 若只查询部分行, 用条件(部分)索引减小体积; 把查询所需的列包含进索引(覆盖)便可不访问表、仅凭索引就能响应。
- **未使用的索引是负债**: 从未被使用的索引只会消耗写入成本与存储空间。定期检查使用统计并删除它们。
- **在生产表上创建索引要当心锁**: 在大型生产表上创建索引可能加写锁而酿成故障 — 使用数据库提供的在线/无阻塞索引创建选项。

## 2. 规则

### 2-1. 索引对象仅限于 WHERE·JOIN·ORDER BY 的列
- 只在真实查询会过滤·联接·排序的列上建索引。
- 禁止"以防万一"给所有列都建索引 — 每次写入都要更新所有索引而变慢。

```text
// ❌ 禁止 — 连查询根本不用的列也全部建索引
index(col1); index(col2); index(col3); ... // 表中几乎所有列

// ✅ 推荐 — 只对实际查询模式使用的列
index(orders.user_id)          // WHERE user_id = ?
index(orders.status)           // WHERE status = ?
```

### 2-2. 按访问模式选择索引类型
大多数等值·范围·排序用基础(排序型, 多为 B-tree)索引就足够了。下面是概念上的选择标准, 实际支持的类型·语法因数据库而异(参见附录)。

| 类型(概念) | 何时使用 |
|------|-----------|
| 排序型基础索引 (B-tree 类) | 等值·范围·排序 — 最普遍 |
| 复合(多列)索引 | 把多列一起过滤的条件 |
| 条件(部分)索引 | 频繁只查询满足特定条件的行时(例: 仅活跃行) |
| 覆盖索引 | 索引包含全部查询列从而免去表访问时 |
| 表达式(函数)索引 | 用如 `lower(email)` 这样加工后的值查询时 |
| 仅等值索引 (哈希类) | 无需排序·范围、仅需等值比较时 |

### 2-3. 复合索引列顺序
把等值条件·选择度高的列放在前面, 范围·排序列放在后面, 并与查询条件顺序一致。索引仅从其最左前缀开始被利用。

```sql
-- ✅ 推荐 — 等值(=)列在先, 排序列在后, 与查询条件顺序一致
CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at DESC);

-- 使用上面索引的查询
SELECT * FROM orders
 WHERE user_id = ? AND status = 'paid'
 ORDER BY created_at DESC;
```

```text
// ❌ 禁止 — 索引是(a, b, c)而查询只以 b 为条件
//          跳过最左前缀(a)便用不上索引
index(a, b, c)  ↔  WHERE b = ?      // 无 a 只有 b → 无法利用
```

### 2-4. 加工了列的条件会使索引失效
在 WHERE 子句中用函数·运算包裹列本身就用不上普通索引。对表达式照原样建索引(表达式索引)或改写查询。

```sql
-- ❌ 禁止 — 用函数包裹列会使普通索引失效
SELECT * FROM users WHERE lower(email) = 'a@b.com';   -- 用不上 email 索引
SELECT * FROM orders WHERE created_at + 1 > ?;        -- 因运算而失效

-- ✅ 推荐 — 对表达式本身建索引, 或变形条件以免加工列
-- (表达式索引: 给 lower(email) 建索引)
-- (范围变形: 如 created_at > ? - 1, 列保持原样、加工常数一侧)
```

### 2-5. 模式搜索与索引
前缀固定的前缀搜索能利用索引, 但前缀为通配符则是全表扫描。若后缀/部分匹配频繁, 考虑全文搜索(full-text)功能或搜索引擎。

```sql
-- ✅ 推荐 — 前缀搜索利用索引
SELECT * FROM users WHERE name LIKE 'Kim%';

-- ❌ 禁止 — 前缀为通配符则全表扫描, 考虑全文搜索引擎
SELECT * FROM users WHERE name LIKE '%Kim';
```

### 2-6. 用执行计划(EXPLAIN)验证
在添加索引前后查看执行计划, 确认全表扫描是否变为索引访问。具体语法·输出因数据库而异(参见附录)。

```sql
-- 标准入口 (输出格式·选项因数据库而异)
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- 通用确认项:
--  · 全表扫描(Full/Seq Scan) → 是否变为索引访问(Index Scan 等)
--  · 优化器的预估行数 vs 实际行数的差异(差异大则需更新统计)
--  · 是否实际使用了预期的索引
```

### 2-7. 覆盖索引 (仅索引访问)
若索引已包含查询所需的全部列, 便不访问表本体、仅凭索引响应。对频繁一起查询的少数列很有效。(指定包含列的语法因数据库而异 → 附录)

```text
// 概念 — 把查询列(b, c)一起放进索引便省去表访问
index on t(a) + 包含(b, c)   ↔   SELECT a, b, c FROM t WHERE a = ?
```

### 2-8. 检测·删除未使用索引
任何查询都不用的索引只占用写入成本·存储空间。定期检查数据库的使用统计(扫描次数等), 把长期保持为 0 次的索引列入删除候选。(查询统计的方法因数据库而异 → 附录)

```text
// 概念 — 把使用次数为 0 且已充分观察的索引列为删除候选
查询每个索引的使用次数 → 使用次数 = 0 的 → 评估为删除候选
```

### 2-9. 在生产表上创建索引要避免锁
在大型生产表上普通地创建索引, 创建期间会加写锁而可能酿成故障。使用数据库提供的在线/无阻塞索引创建选项。(该选项的语法因数据库而异 → 附录)

```text
// ❌ 禁止 — 对大型生产表加锁的普通创建
普通索引创建  → 创建期间表写锁 → 故障风险

// ✅ 推荐 — 使用数据库提供的在线/无阻塞创建选项
无阻塞索引创建选项  → 无锁在后台构建
```

## 3. 常见错误
- **对所有列滥用索引** → 写入性能下降与存储空间浪费。只对实际查询模式的列建索引。
- **复合索引列顺序与查询不同** → 无法匹配最左前缀而用不上索引。
- **在 WHERE 条件中用函数·运算加工列** → 使普通索引失效。改用表达式索引或变形条件。
- **对前缀为通配符的 LIKE 期待索引** (`'%suffix'`) → 全表扫描。考虑全文搜索。
- **创建索引后不用执行计划验证** → 会放任优化器不使用的索引。
- **放任未使用索引** → 不必要的写入·存储成本。用使用统计定期检查。
- **对生产表加锁的普通创建** → 索引创建期间因写锁而故障。使用无阻塞创建选项。

## 4. 检查清单
- [ ] WHERE·JOIN·ORDER BY 的列上是否有索引且无过度创建?
- [ ] 复合索引列顺序是否与等值/选择度/排序·查询顺序(最左前缀)对齐?
- [ ] 是否避免在 WHERE 条件中用函数·运算加工列而扼杀索引?
- [ ] 是否避免试图用索引处理前缀为通配符的模式搜索(考虑全文搜索)?
- [ ] 添加索引前后是否用执行计划(EXPLAIN)确认了切换为索引访问?
- [ ] 对频繁一起查询的列是否用覆盖减少了表访问?
- [ ] 是否检查·删除了未使用索引(使用次数 0)?
- [ ] 生产表索引是否用无阻塞/在线选项创建?

## 附录: 各技术栈示例

> 以下是上述 1〜4 标准的 PostgreSQL 语法示例(概念·选择标准见正文)。按团队数据库补充(例: MySQL/InnoDB, Oracle, SQL Server, MongoDB 等)。

### PostgreSQL

```sql
-- 各索引类型的语法 (类型选择标准见 2-2)
CREATE INDEX ON t(col);                       -- B-tree (默认): 范围·等值·排序
CREATE INDEX ON t(a, b);                       -- Composite: 多列
CREATE INDEX ON t(col) WHERE active = true;    -- Partial: 仅条件行
CREATE INDEX ON t(a) INCLUDE (b, c);           -- Covering: 用 INCLUDE 包含非检索列
CREATE INDEX USING HASH ON t(col);             -- Hash: 仅等值

-- 执行计划验证 (2-6) — actual vs estimated 差异大则 ANALYZE, Buffers 看缓存命中率
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'test@example.com';

-- 检测未使用索引 (2-8) — 把 idx_scan = 0 的按大小排序
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 无阻塞索引创建 (2-9) — CONCURRENTLY: 无锁创建
CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);
```
