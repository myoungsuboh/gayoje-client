---
name: Read Replica & Read Distribution
description: A standard for Primary-Replica replication setup, read/write split routing, and replication-lag monitoring. Read this when distributing read load to Replicas, dealing with replication lag or Read-your-writes problems, or separating report queries from the operational DB. Keywords: replica, read-replica, primary, replication, lag, load-balancing, pgbouncer.
rules:
  - "Route all writes and transactions to the Primary, and read-only queries (reports, search, list queries) to the Replica."
  - "When you must read data you just wrote immediately (Read-your-writes), read from the Primary or use session pinning."
  - "Monitor replication lag (replication_lag), and when the lag exceeds a threshold (e.g., 10 seconds), exclude the Replica from the read pool."
  - "Use a setup that health-checks Replicas to auto-exclude them on failure and auto-reinstate them after recovery."
  - "Use a dedicated Replica (or Warehouse) for analytics/report queries to isolate the operational Replica's load."
tags:
  - "replica"
  - "read-replica"
  - "primary"
  - "replication"
  - "lag"
  - "load-balancing"
  - "pgbouncer"
---

# 🔀 Read Replica & Read Distribution

> Establish a standard for sending writes to the Primary and distributing reads to Replicas. Read this when splitting read load or dealing with replication lag or Read-your-writes problems.

## 1. Core Principles
- Route all writes and transactions to the Primary, and read-only queries (reports, search, list queries) to the Replica.
- When you must read data you just wrote immediately (Read-your-writes), read from the Primary or use session pinning.
- Monitor replication lag (replication_lag), and when the lag exceeds a threshold (e.g., 10 seconds), exclude the Replica from the read pool.
- Use a setup that health-checks Replicas to auto-exclude them on failure and auto-reinstate them after recovery.
- Use a dedicated Replica (or Warehouse) for analytics/report queries to isolate the operational Replica's load.

## 2. Rules

### 2-1. Architecture
```
Write request → [Primary DB]  ─── streaming replication ──→ [Replica 1]  ← read request
                                                            [Replica 2]  ← read request
                                                            [Analytics Replica] ← reports
```

### 2-2. Read/Write Routing (Python SQLAlchemy example)
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

primary_engine  = create_engine(PRIMARY_URL)
replica_engine  = create_engine(REPLICA_URL)

def get_db(readonly: bool = False):
    engine = replica_engine if readonly else primary_engine
    Session = sessionmaker(bind=engine)
    return Session()

# ✅ route read-only queries to the Replica
with get_db(readonly=True) as db:
    results = db.query(Order).filter(Order.status == "paid").all()
```

### 2-3. Handling Read-your-Writes
```python
# Method 1: read from the Primary right after a write
async def create_and_return(data):
    result = await primary_db.insert(data)
    return await primary_db.get(result.id)  # from the Primary

# Method 2: session sticky (pin to Primary for a certain time)
# Method 3: wait for replication completion (synchronous_commit=on, watch the performance cost)
```

### 2-4. Replication Lag Monitoring (PostgreSQL)
```sql
-- run on the Replica — exclude from the read pool when lag exceeds the threshold
SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) AS lag_seconds;
```

### 2-5. PgBouncer Read-Distribution Configuration
```ini
[databases]
mydb_rw = host=primary port=5432 dbname=mydb
mydb_ro = host=replica port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
```

## 3. Common Mistakes
- Reading from the Replica right after a write and missing not-yet-replicated data (Read-your-writes not handled).
- Not monitoring replication lag and exposing stale data to users.
- Running heavy analytics/report queries on the operational Replica too, increasing the load.
- Failing to auto-exclude a failed Replica from the read pool, causing requests to fail.

## 4. Checklist
- [ ] Did you route writes/transactions to the Primary and reads to the Replica?
- [ ] Did you handle paths that need Read-your-writes via the Primary or session pinning?
- [ ] Do you monitor replication lag and exclude the Replica when it exceeds the threshold?
- [ ] Does the Replica health check auto-exclude on failure and reinstate on recovery?
- [ ] Did you isolate analytics/report queries to a dedicated Replica?
