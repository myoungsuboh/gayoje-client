---
name: Read Replica & 読み取り分散
description: Primary-Replica レプリケーション構成、読み取り/書き込み分離ルーティング、レプリケーション遅延モニタリングの標準。読み取り負荷を Replica へ分散したり、レプリケーション遅延・Read-your-writes 問題を扱うとき、レポートクエリを運用 DB から分離するときに読む。キーワード: replica, read-replica, primary, replication, lag, load-balancing, pgbouncer.
rules:
  - "すべての書き込み・トランザクションは Primary、読み取り専用クエリ(レポート・検索・一覧照会)は Replica にルーティングする。"
  - "たった今書いたデータを即座に読む必要がある場合(Read-your-writes)は Primary から読むか、セッション固定を使う。"
  - "レプリケーション遅延(replication_lag)をモニタリングし、遅延が閾値(例: 10 秒)を超えたら Replica を読み取りプールから除外する。"
  - "Replica をヘルスチェックして障害時に自動で除外し、復旧後に自動で再投入する構成を使う。"
  - "分析・レポートクエリは専用 Replica(または Warehouse)を使い、運用 Replica の負荷を分離する。"
tags:
  - "replica"
  - "read-replica"
  - "primary"
  - "replication"
  - "lag"
  - "load-balancing"
  - "pgbouncer"
---

# 🔀 Read Replica & 読み取り分散

> 書き込みは Primary、読み取りは Replica へ分散する標準を定める。読み取り負荷を分けたり、レプリケーション遅延・Read-your-writes 問題を扱うときに読む。

## 1. 核心原則
- すべての書き込み・トランザクションは Primary、読み取り専用クエリ(レポート・検索・一覧照会)は Replica にルーティングする。
- たった今書いたデータを即座に読む必要がある場合(Read-your-writes)は Primary から読むか、セッション固定を使う。
- レプリケーション遅延(replication_lag)をモニタリングし、遅延が閾値(例: 10 秒)を超えたら Replica を読み取りプールから除外する。
- Replica をヘルスチェックして障害時に自動で除外し、復旧後に自動で再投入する構成を使う。
- 分析・レポートクエリは専用 Replica(または Warehouse)を使い、運用 Replica の負荷を分離する。

## 2. ルール

### 2-1. アーキテクチャ
```
書き込み要求 → [Primary DB]  ─── ストリーミングレプリケーション ──→ [Replica 1]  ← 読み取り要求
                                                   [Replica 2]  ← 読み取り要求
                                                   [Analytics Replica] ← レポート
```

### 2-2. 読み取り/書き込みルーティング (Python SQLAlchemy 例)
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

primary_engine  = create_engine(PRIMARY_URL)
replica_engine  = create_engine(REPLICA_URL)

def get_db(readonly: bool = False):
    engine = replica_engine if readonly else primary_engine
    Session = sessionmaker(bind=engine)
    return Session()

# ✅ 読み取り専用クエリは Replica へ
with get_db(readonly=True) as db:
    results = db.query(Order).filter(Order.status == "paid").all()
```

### 2-3. Read-your-Writes の処理
```python
# 方法 1: 書き込み直後は Primary から読む
async def create_and_return(data):
    result = await primary_db.insert(data)
    return await primary_db.get(result.id)  # Primary から

# 方法 2: セッションスティッキー (一定時間 Primary に固定)
# 方法 3: レプリケーション完了待ち (synchronous_commit=on, パフォーマンスコストに注意)
```

### 2-4. レプリケーション遅延モニタリング (PostgreSQL)
```sql
-- Replica で実行 — 遅延が閾値超過時に読み取りプールから除外
SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) AS lag_seconds;
```

### 2-5. PgBouncer 読み取り分散設定
```ini
[databases]
mydb_rw = host=primary port=5432 dbname=mydb
mydb_ro = host=replica port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
```

## 3. よくあるミス
- 書き込み直後に Replica から読んで、まだレプリケートされていないデータを取りこぼす(Read-your-writes 未処理)。
- レプリケーション遅延をモニタリングせず、古いデータをユーザーに見せる。
- 重い分析・レポートクエリを運用 Replica で一緒に回して負荷を増やす。
- 障害が起きた Replica を読み取りプールから自動除外できず、リクエストが失敗する。

## 4. チェックリスト
- [ ] 書き込み・トランザクションは Primary、読み取りは Replica にルーティングしたか
- [ ] Read-your-writes が必要な経路を Primary またはセッション固定で処理したか
- [ ] レプリケーション遅延をモニタリングし、閾値超過時に Replica を除外しているか
- [ ] Replica ヘルスチェックで障害時の自動除外・復旧再投入ができるか
- [ ] 分析・レポートクエリを専用 Replica に分離したか
