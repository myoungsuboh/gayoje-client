---
name: 查询优化
description: N+1 检测、慢查询分析、查询重构、统计管理标准(DB 中立)。捕捉慢查询或改进执行计划时，消除 N+1 或查找索引未生效原因时阅读。关键词：slow-query, n+1, explain, query-plan, join, batch, select-star, analyze.
rules:
  - "检测 N+1 查询并替换为 JOIN 或批量加载(IN 子句、DataLoader)。"
  - "设置慢查询日志阈值(例如 1 秒以上)，并定期审查与优化。"
  - "避免 SELECT *，只明确指定所需列以减少 I/O 和网络传输。"
  - "确认连接条件的列类型是否一致 — 类型不一致会因隐式转换使索引失效。"
  - "定期刷新表统计(ANALYZE)，当规划器选择了错误的执行计划时，先尝试更新统计。"
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

# 🐢 查询优化

> 制定检测、分析、重构慢查询的标准(DB 中立)。消除 N+1 或改进慢查询，以及执行计划异常时阅读。

## 1. 核心原则
- 检测 N+1 查询并替换为 JOIN 或批量加载(IN 子句、DataLoader)。
- 设置慢查询日志阈值(例如 1 秒以上)，并定期审查与优化。
- 避免 `SELECT *`，只明确指定所需列以减少 I/O 和网络传输。
- 确认连接条件的列类型是否一致 — 类型不一致会因隐式转换使索引失效。
- 定期刷新表统计(ANALYZE)，当规划器选择了错误的执行计划时，先尝试更新统计。

## 2. 规则

### 2-1. N+1 问题与解决
```python
# ❌ 禁止 — N+1: 查询一次订单 + 对每个订单查询用户
orders = db.query("SELECT * FROM orders WHERE status='paid'")
for order in orders:
    user = db.query("SELECT * FROM users WHERE id = ?", order.user_id)  # 执行 N 次

# ✅ 推荐 — 用 JOIN 一次取出
orders = db.query("""
    SELECT o.*, u.name, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'paid'
""")
```

### 2-2. 慢查询日志配置
```sql
-- PostgreSQL
ALTER SYSTEM SET log_min_duration_statement = '1000';  -- 1 秒以上
SELECT pg_reload_conf();

-- 查看慢查询
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;
```

### 2-3. 阅读 EXPLAIN 的要点
```
Seq Scan       → 全表扫描。考虑添加索引
Hash Join      → 大表连接。通常正常
Nested Loop    → 行少时高效，对大表有风险
Sort(external) → 排序超出内存。考虑增大 work_mem
```

### 2-4. 查询重构模式
```sql
-- ❌ WHERE YEAR(created_at) = 2026  (函数使索引失效)
-- ✅ 用范围条件利用索引
WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'

-- ❌ NOT IN (subquery)  (注意 NULL + 性能)
-- ✅ LEFT JOIN ... IS NULL
LEFT JOIN ... WHERE t2.id IS NULL

-- ❌ COUNT(*) > 0
-- ✅ EXISTS (满足条件时立即中断)
EXISTS (SELECT 1 FROM ...)
```

### 2-5. 避免 SELECT *
```sql
-- ❌ 禁止 — 连不必要的列也传输，无法做仅索引扫描
SELECT * FROM orders WHERE status = 'paid';

-- ✅ 推荐 — 只明确指定所需列
SELECT id, user_id, amount FROM orders WHERE status = 'paid';
```

## 3. 常见错误
- 把 N+1 藏在 ORM 的便捷方法背后而未察觉。
- 连接列类型不一致(varchar vs int)，因隐式转换使索引失效。
- 统计过旧导致规划器选择全表扫描，却先怀疑索引。
- 在 WHERE 子句的列上套用函数，使索引失效。

## 4. 检查清单
- [ ] 是否将 N+1 替换为 JOIN 或批量加载
- [ ] 是否设置慢查询日志阈值并定期审查
- [ ] 是否用所需列代替了 `SELECT *`
- [ ] 连接列类型是否一致
- [ ] 执行计划异常时，是否先确认统计(ANALYZE)刷新
