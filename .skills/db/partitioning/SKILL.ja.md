---
name: パーティショニング戦略
description: 時系列・範囲・ハッシュパーティショニング設計、パーティションプルーニング、管理自動化の標準（PostgreSQL中心）。数億行の大容量・時系列テーブルを設計したり、古いデータをDROP/アーカイブしたり、パーティションキー・プルーニングを点検する際に読む。キーワード: partition, partitioning, range-partition, hash-partition, list-partition, pg_partman, time-series, pruning, DETACH.
rules:
  - "数億行以上の大容量テーブル、または古いパーティションをDROPする必要がある時系列データにパーティショニングを適用する。"
  - "パーティションキーは、クエリのWHERE条件に常に含まれるカラム（例: created_at）を選び、パーティションプルーニングを活用する。"
  - "時系列データは月・四半期単位のRANGEパーティショニングで管理し、新しいパーティションの生成をスケジューラで自動化する。"
  - "パーティションインデックスはパーティションごとに生成されるため、テーブル全体のインデックスサイズが減る効果を確認する。"
  - "パーティションDROP前にDETACHで検証し、ミス防止のため即座にDELETEしない。"
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

# 🗂️ パーティショニング戦略

> 大容量・時系列テーブルをパーティションに分割し、クエリ性能と管理コストを制御する。数億行のテーブルを設計したり、古いパーティションを整理する際に読む。

## 1. 中核原則
- 数億行以上の大容量テーブル、または古いパーティションをDROPする必要がある時系列データにパーティショニングを適用する。
- パーティションキーは、クエリのWHERE条件に常に含まれるカラム（例: `created_at`）を選び、パーティションプルーニングを活用する。
- 時系列データは月・四半期単位のRANGEパーティショニングで管理し、新しいパーティションの生成をスケジューラで自動化する。
- パーティションインデックスはパーティションごとに生成されるため、テーブル全体のインデックスサイズが減る効果を確認する。
- パーティションDROP前にDETACHで検証し、ミス防止のため即座にDELETEしない。

## 2. ルール

### 2-1. パーティショニング種別の選択
| 種別 | 基準 | 適した状況 |
|------|------|-----------|
| RANGE | 数値・日付の範囲 | 時系列ログ・イベント |
| LIST | 固定値リスト | 地域・ステータスコード |
| HASH | ハッシュ分散 | 均等分散の大容量 |

### 2-2. RANGEパーティショニング (PostgreSQL)
```sql
-- ✅ 親テーブル生成 — パーティションキーはWHEREで常に使うcreated_at
CREATE TABLE events (
  id         BIGINT NOT NULL,
  event_type VARCHAR,
  created_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

-- ✅ 月別パーティション生成
CREATE TABLE events_2026_01
  PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE events_2026_02
  PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### 2-3. パーティションプルーニングの確認
```sql
-- ✅ パーティションキーをWHEREに入れ、単一パーティションのみスキャンされるか確認
EXPLAIN SELECT * FROM events WHERE created_at >= '2026-06-01';
-- "Seq Scan on events_2026_06" のみ出力されるべき
-- "Append" の下に他のパーティションがなければプルーニング成功
```

### 2-4. パーティション自動管理 (pg_partman)
```sql
-- ✅ 未来のパーティションを事前生成して投入漏れを防止
SELECT partman.create_parent(
  p_parent_table => 'public.events',
  p_control => 'created_at',
  p_type => 'range',
  p_interval => '1 month',
  p_premake => 3   -- 未来3ヶ月を事前生成
);
```

### 2-5. 古いパーティションの保管 (DETACH後にDROP)
```sql
-- ✅ まず分離（テーブルとして残す）して検証
ALTER TABLE events DETACH PARTITION events_2025_01;

-- ✅ 検証後に削除またはアーカイブ
DROP TABLE events_2025_01;  -- または ARCHIVE DB へ pg_dump 後に削除

-- ❌ 禁止 — 検証なしに直接パーティションを削除（復旧不可）
-- DROP TABLE events_2025_01;  (DETACH段階を省略)
```

## 3. よくあるミス
- パーティションキーをWHEREに入れず全パーティションをスキャン → プルーニング無効。
- 未来のパーティションを事前に作らず、投入時点でパーティションなしエラー。
- DETACHなしに直接DROP → ミス時に復旧不可。
- パーティション数を過度に細分化し、メタデータ・プランニングコストが増加。

## 4. チェックリスト
- [ ] パーティショニングが本当に必要な規模（数億行/時系列DROP）か
- [ ] パーティションキーがWHEREに常に含まれるカラムか
- [ ] EXPLAINでパーティションプルーニングを確認したか
- [ ] 未来パーティション生成をスケジューラ（pg_partman等）で自動化したか
- [ ] パーティション削除をDETACH → 検証 → DROP の順で行うか
