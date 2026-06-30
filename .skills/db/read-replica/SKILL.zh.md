---
name: Read Replica & 读取分散
description: Primary-Replica 复制配置、读/写分离路由、复制延迟监控标准。将读取负载分散到 Replica，或处理复制延迟、Read-your-writes 问题时，以及将报表查询从生产 DB 分离时阅读。关键词：replica, read-replica, primary, replication, lag, load-balancing, pgbouncer.
rules:
  - "所有写入与事务路由到 Primary，只读查询(报表、搜索、列表查询)路由到 Replica。"
  - "需要立即读取刚写入的数据时(Read-your-writes)，从 Primary 读取或使用会话固定。"
  - "监控复制延迟(replication_lag)，当延迟超过阈值(例如 10 秒)时将 Replica 从读取池中排除。"
  - "对 Replica 做健康检查，故障时自动排除，恢复后自动重新投入的配置。"
  - "分析、报表查询使用专用 Replica(或 Warehouse)，以隔离生产 Replica 的负载。"
tags:
  - "replica"
  - "read-replica"
  - "primary"
  - "replication"
  - "lag"
  - "load-balancing"
  - "pgbouncer"
---

# 🔀 Read Replica & 读取分散

> 制定写入走 Primary、读取分散到 Replica 的标准。分担读取负载，或处理复制延迟、Read-your-writes 问题时阅读。

## 1. 核心原则
- 所有写入与事务路由到 Primary，只读查询(报表、搜索、列表查询)路由到 Replica。
- 需要立即读取刚写入的数据时(Read-your-writes)，从 Primary 读取或使用会话固定。
- 监控复制延迟(replication_lag)，当延迟超过阈值(例如 10 秒)时将 Replica 从读取池中排除。
- 对 Replica 做健康检查，故障时自动排除，恢复后自动重新投入的配置。
- 分析、报表查询使用专用 Replica(或 Warehouse)，以隔离生产 Replica 的负载。

## 2. 规则

### 2-1. 架构
```
写入请求 → [Primary DB]  ─── 流复制 ──→ [Replica 1]  ← 读取请求
                                          [Replica 2]  ← 读取请求
                                          [Analytics Replica] ← 报表
```

### 2-2. 读/写路由 (Python SQLAlchemy 示例)
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

primary_engine  = create_engine(PRIMARY_URL)
replica_engine  = create_engine(REPLICA_URL)

def get_db(readonly: bool = False):
    engine = replica_engine if readonly else primary_engine
    Session = sessionmaker(bind=engine)
    return Session()

# ✅ 只读查询走 Replica
with get_db(readonly=True) as db:
    results = db.query(Order).filter(Order.status == "paid").all()
```

### 2-3. Read-your-Writes 处理
```python
# 方法 1: 写入之后立即从 Primary 读取
async def create_and_return(data):
    result = await primary_db.insert(data)
    return await primary_db.get(result.id)  # 从 Primary

# 方法 2: 会话粘性 (一定时间固定到 Primary)
# 方法 3: 等待复制完成 (synchronous_commit=on, 注意性能成本)
```

### 2-4. 复制延迟监控 (PostgreSQL)
```sql
-- 在 Replica 上执行 — 延迟超过阈值时从读取池排除
SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) AS lag_seconds;
```

### 2-5. PgBouncer 读取分散配置
```ini
[databases]
mydb_rw = host=primary port=5432 dbname=mydb
mydb_ro = host=replica port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
```

## 3. 常见错误
- 写入之后立即从 Replica 读取，错过尚未复制的数据(未处理 Read-your-writes)。
- 不监控复制延迟，把过旧的数据暴露给用户。
- 把繁重的分析、报表查询也放在生产 Replica 上跑，加大负载。
- 无法将故障的 Replica 从读取池自动排除，导致请求失败。

## 4. 检查清单
- [ ] 写入、事务是否路由到 Primary，读取是否路由到 Replica
- [ ] 是否将需要 Read-your-writes 的路径用 Primary 或会话固定处理
- [ ] 是否监控复制延迟并在超过阈值时排除 Replica
- [ ] Replica 健康检查是否能在故障时自动排除、恢复后重新投入
- [ ] 是否将分析、报表查询分离到专用 Replica
