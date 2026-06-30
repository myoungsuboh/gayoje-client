---
name: Read Replica & 읽기 분산
description: Primary-Replica 복제 구성, 읽기/쓰기 분리 라우팅, 복제 지연 모니터링 표준. 읽기 부하를 Replica로 분산하거나 복제 지연·Read-your-writes 문제를 다룰 때, 리포트 쿼리를 운영 DB에서 분리할 때 읽는다. 키워드: replica, read-replica, primary, replication, lag, load-balancing, pgbouncer.
rules:
  - "모든 쓰기·트랜잭션은 Primary, 읽기 전용 쿼리(리포트·검색·목록 조회)는 Replica로 라우팅한다."
  - "방금 쓴 데이터를 즉시 읽어야 하는 경우(Read-your-writes)는 Primary에서 읽거나 세션 고정을 사용한다."
  - "복제 지연(replication_lag)을 모니터링하고, 지연이 임계값(예: 10초)을 초과하면 Replica를 읽기 풀에서 제외한다."
  - "Replica를 헬스체크해 장애 시 자동으로 제외하고, 복구 후 자동 재투입하는 구성을 사용한다."
  - "분석·리포트 쿼리는 전용 Replica(또는 Warehouse)를 사용해 운영 Replica 부하를 분리한다."
tags:
  - "replica"
  - "read-replica"
  - "primary"
  - "replication"
  - "lag"
  - "load-balancing"
  - "pgbouncer"
---

# 🔀 Read Replica & 읽기 분산

> 쓰기는 Primary, 읽기는 Replica로 분산하는 표준을 정한다. 읽기 부하를 나누거나 복제 지연·Read-your-writes 문제를 다룰 때 읽는다.

## 1. 핵심 원칙
- 모든 쓰기·트랜잭션은 Primary, 읽기 전용 쿼리(리포트·검색·목록 조회)는 Replica로 라우팅한다.
- 방금 쓴 데이터를 즉시 읽어야 하는 경우(Read-your-writes)는 Primary에서 읽거나 세션 고정을 사용한다.
- 복제 지연(replication_lag)을 모니터링하고, 지연이 임계값(예: 10초)을 초과하면 Replica를 읽기 풀에서 제외한다.
- Replica를 헬스체크해 장애 시 자동으로 제외하고, 복구 후 자동 재투입하는 구성을 사용한다.
- 분석·리포트 쿼리는 전용 Replica(또는 Warehouse)를 사용해 운영 Replica 부하를 분리한다.

## 2. 규칙

### 2-1. 아키텍처
```
쓰기 요청 → [Primary DB]  ─── 스트리밍 복제 ──→ [Replica 1]  ← 읽기 요청
                                                   [Replica 2]  ← 읽기 요청
                                                   [Analytics Replica] ← 리포트
```

### 2-2. 읽기/쓰기 라우팅 (Python SQLAlchemy 예시)
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

primary_engine  = create_engine(PRIMARY_URL)
replica_engine  = create_engine(REPLICA_URL)

def get_db(readonly: bool = False):
    engine = replica_engine if readonly else primary_engine
    Session = sessionmaker(bind=engine)
    return Session()

# ✅ 읽기 전용 쿼리는 Replica로
with get_db(readonly=True) as db:
    results = db.query(Order).filter(Order.status == "paid").all()
```

### 2-3. Read-your-Writes 처리
```python
# 방법 1: 쓰기 직후는 Primary에서 읽기
async def create_and_return(data):
    result = await primary_db.insert(data)
    return await primary_db.get(result.id)  # Primary에서

# 방법 2: 세션 스티키 (일정 시간 Primary 고정)
# 방법 3: 복제 완료 대기 (synchronous_commit=on, 성능 비용 주의)
```

### 2-4. 복제 지연 모니터링 (PostgreSQL)
```sql
-- Replica에서 실행 — 지연이 임계값 초과 시 읽기 풀에서 제외
SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) AS lag_seconds;
```

### 2-5. PgBouncer 읽기 분산 설정
```ini
[databases]
mydb_rw = host=primary port=5432 dbname=mydb
mydb_ro = host=replica port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
```

## 3. 흔한 실수
- 쓰기 직후 Replica에서 읽어 아직 복제되지 않은 데이터를 놓친다(Read-your-writes 미처리).
- 복제 지연을 모니터링하지 않아 오래된 데이터를 사용자에게 노출한다.
- 무거운 분석·리포트 쿼리를 운영 Replica에 함께 돌려 부하를 키운다.
- 장애 난 Replica를 읽기 풀에서 자동 제외하지 못해 요청이 실패한다.

## 4. 체크리스트
- [ ] 쓰기·트랜잭션은 Primary, 읽기는 Replica로 라우팅했는가
- [ ] Read-your-writes가 필요한 경로를 Primary 또는 세션 고정으로 처리했는가
- [ ] 복제 지연을 모니터링하고 임계값 초과 시 Replica를 제외하는가
- [ ] Replica 헬스체크로 장애 시 자동 제외·복구 재투입이 되는가
- [ ] 분석·리포트 쿼리를 전용 Replica로 분리했는가
