---
name: クエリ最適化
description: N+1 検出、スロークエリ分析、クエリのリファクタリング、統計管理の標準(DB 中立)。遅いクエリを捕まえたり実行計画を改善するとき、N+1 を除去したりインデックスが効かない原因を探すときに読む。キーワード: slow-query, n+1, explain, query-plan, join, batch, select-star, analyze.
rules:
  - "N+1 クエリを検出し、JOIN またはバッチローディング(IN 句・DataLoader)に置き換える。"
  - "スロークエリログの閾値を設定し(例: 1 秒以上)、定期的に検討・最適化する。"
  - "SELECT * を避け、必要なカラムだけを明示して I/O とネットワーク転送を減らす。"
  - "結合条件のカラム型が一致するか確認する — 型の不一致は暗黙のキャストでインデックスを無効化する。"
  - "テーブル統計(ANALYZE)を定期的に更新し、プランナが誤った実行計画を選んだら統計の更新をまず試す。"
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

# 🐢 クエリ最適化

> 遅いクエリを検出・分析・リファクタリングする標準(DB 中立)を定める。N+1 を除去したりスロークエリを改善したり、実行計画がおかしいときに読む。

## 1. 核心原則
- N+1 クエリを検出し、JOIN またはバッチローディング(IN 句・DataLoader)に置き換える。
- スロークエリログの閾値を設定し(例: 1 秒以上)、定期的に検討・最適化する。
- `SELECT *` を避け、必要なカラムだけを明示して I/O とネットワーク転送を減らす。
- 結合条件のカラム型が一致するか確認する — 型の不一致は暗黙のキャストでインデックスを無効化する。
- テーブル統計(ANALYZE)を定期的に更新し、プランナが誤った実行計画を選んだら統計の更新をまず試す。

## 2. ルール

### 2-1. N+1 問題と解決
```python
# ❌ 禁止 — N+1: 注文を 1 回照会 + 各注文ごとにユーザーを照会
orders = db.query("SELECT * FROM orders WHERE status='paid'")
for order in orders:
    user = db.query("SELECT * FROM users WHERE id = ?", order.user_id)  # N 回実行

# ✅ 推奨 — JOIN で一度に
orders = db.query("""
    SELECT o.*, u.name, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'paid'
""")
```

### 2-2. スロークエリログの設定
```sql
-- PostgreSQL
ALTER SYSTEM SET log_min_duration_statement = '1000';  -- 1 秒以上
SELECT pg_reload_conf();

-- スロークエリを見る
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;
```

### 2-3. EXPLAIN を読むポイント
```
Seq Scan       → フルスキャン。インデックス追加を検討
Hash Join      → 大きいテーブルの結合。おおむね正常
Nested Loop    → 行が少ないとき効率的、大きいテーブルには危険
Sort(external) → ソートがメモリ超過。work_mem 増加を検討
```

### 2-4. クエリのリファクタリングパターン
```sql
-- ❌ WHERE YEAR(created_at) = 2026  (関数でインデックス無効化)
-- ✅ 範囲条件でインデックスを活用
WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'

-- ❌ NOT IN (subquery)  (NULL 注意 + パフォーマンス)
-- ✅ LEFT JOIN ... IS NULL
LEFT JOIN ... WHERE t2.id IS NULL

-- ❌ COUNT(*) > 0
-- ✅ EXISTS (条件を満たした時点で即座に中断)
EXISTS (SELECT 1 FROM ...)
```

### 2-5. SELECT * の回避
```sql
-- ❌ 禁止 — 不要なカラムまで転送、インデックスオンリースキャン不可
SELECT * FROM orders WHERE status = 'paid';

-- ✅ 推奨 — 必要なカラムだけを明示
SELECT id, user_id, amount FROM orders WHERE status = 'paid';
```

## 3. よくあるミス
- N+1 を ORM の便利メソッドの裏に隠して気づかない。
- 結合カラムの型不一致(varchar vs int)で、暗黙のキャストによりインデックスが無効化される。
- 統計が古くてプランナがフルスキャンを選んでいるのに、まずインデックスを疑う。
- WHERE 句のカラムに関数をかけてインデックスを無効化する。

## 4. チェックリスト
- [ ] N+1 を JOIN またはバッチローディングに置き換えたか
- [ ] スロークエリログの閾値を設定し定期的に検討しているか
- [ ] `SELECT *` の代わりに必要なカラムだけを明示したか
- [ ] 結合カラムの型が一致するか
- [ ] 実行計画がおかしいとき、統計(ANALYZE)の更新をまず確認したか
