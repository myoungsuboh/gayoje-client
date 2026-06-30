---
name: HikariCP Connection Pool Tuning (Spring Boot)
description: The meaning of HikariCP parameters, pool size estimation, pool exhaustion diagnosis, the relationship with DB max_connections, and a prod tuning guide. Read it when configuring/tuning a connection pool, when all APIs throw timeouts at traffic peaks, or when setting up read/write split datasources. Keywords: HikariCP, HikariDataSource, maximumPoolSize, idle-timeout, connection-timeout, dataSource.
rules:
  - "Use HikariCP for the connection pool and size maximumPoolSize based on load."
  - "Do not blindly trust the core-count formula for pool size; determine it by measuring actual concurrent query count — a small pool being faster than a large one is overwhelmingly the common case."
  - "Forbid external API calls inside a transaction to prevent a blowup in connection occupancy."
  - "For pool exhaustion, diagnose leaked connections with leakDetectionThreshold."
  - "When splitting read/write, configure a separate pool per datasource."
  - "Tune only with the cycle measure → hypothesize → change → re-measure. 'Let's just bump it up' is almost always the wrong direction."
tags:
  - "HikariCP"
  - "HikariDataSource"
  - "maximumPoolSize"
  - "idle-timeout"
  - "connection-timeout"
  - "dataSource"
---

# 🌊 HikariCP Connection Pool Tuning

> A connection pool is "the concurrency limit between the DB and the app." Read it when configuring/tuning a pool, or when it's normally fine but at a traffic peak all APIs start throwing 30-second timeouts.

## 1. Core Principles
- Use HikariCP for the connection pool and size `maximumPoolSize` based on load.
- Do not blindly trust the core-count formula for pool size; determine it by measuring actual concurrent query count — a small pool being faster than a large one is overwhelmingly the common case.
- Forbid external API calls inside a transaction to prevent a blowup in connection occupancy.
- For pool exhaustion, diagnose leaked connections with `leakDetectionThreshold`.
- When splitting read/write, configure a separate pool per datasource.
- Tune only with the cycle **measure → hypothesize → change → re-measure**. "Let's just bump it up" is almost always the wrong direction.

## 2. Rules

### 2-1. Key parameters
```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20          # 풀이 가질 수 있는 최대 커넥션 수
      minimum-idle: 20               # 유휴 시에도 유지할 최소 커넥션 (= max와 같게 권장)
      connection-timeout: 3000       # 커넥션을 얻기 위해 대기할 최대 시간 (ms)
      idle-timeout: 600000           # 유휴 커넥션 회수 시간 (10분)
      max-lifetime: 1800000          # 커넥션 최대 수명 (30분, DB wait_timeout보다 짧게)
      leak-detection-threshold: 60000 # 커넥션 누수 감지 (60s 이상 미반납 시 경고 로그)
      pool-name: HikariPool-Main
      validation-timeout: 3000
      keepalive-time: 30000          # idle 커넥션을 살아있게 유지 (DB 방화벽/idle kill 회피)
```

| Parameter | Meaning | Recommended prod value |
|---|---|---|
| `maximumPoolSize` | Pool upper bound | 10 ~ 30 (core-count based) |
| `minimumIdle` | Minimum idle | **Equal to `maximumPoolSize`** (Hikari official recommendation) |
| `connectionTimeout` | Limit on waiting for a connection from the pool | 3 ~ 10 s (shorter than HTTP timeout) |
| `idleTimeout` | Idle reclaim | Shorter than `maxLifetime` |
| `maxLifetime` | Connection max lifetime | DB `wait_timeout` - 30 s |
| `leakDetectionThreshold` | Leak detection | Enabled in dev/staging; 60 s or more recommended for prod too |

> Reason `**minimumIdle == maximumPoolSize**` is recommended: creating new connections at a traffic peak adds latency from handshake/TLS costs. Keep them always made.

### 2-2. Pool size estimation — the trap of "core count × 2 + 1"
The often-cited PostgreSQL formula:
```
connections = ((core_count * 2) + effective_spindle_count)
```
This is a formula for **the appropriate concurrent query count of the DB server**, not the application pool size. The app pool is sized by **concurrent transaction count + safety margin**.
```
pool size ≈ (peak concurrent requests) × (avg DB transaction holding time per request / request processing time)
       + REQUIRES_NEW margin
```
Example:
- Peak concurrent requests: 50 RPS, avg processing time 200ms (Little's Law: concurrent processing ≈ 10)
- Of which transaction holding: 80ms → 10 × 0.4 = 4
- `REQUIRES_NEW` method margin +2
- **Recommended: 6 ~ 10**

```yaml
# ❌ Anti — mindlessly large pool: DB CPU context-switch surge → TPS actually drops
maximum-pool-size: 200

# ✅ Recommended — measurement-based sizing
maximum-pool-size: 20
```

### 2-3. Pool exhaustion diagnosis
Symptoms:
```
com.zaxxer.hikari.pool.HikariPool$PoolInitializationException
HikariPool-1 - Connection is not available, request timed out after 30000ms
```
Cause-diagnosis checklist:
1. **External call inside a transaction?** → See the `transaction-locking` skill. A 1-second API occupies the pool → the concurrency limit drops by a factor of pool size × (1 second / avg TX).
2. **Connection leak?** → Check `leakDetectionThreshold` logs. JDBC direct-use code missing `try-with-resources`.
3. **Long-running transaction?** → `SELECT * FROM pg_stat_activity WHERE state = 'active' AND now() - xact_start > interval '1 minute'`
4. **Has the DB slowed down?** → A slow query on the DB lengthens the pool's holding time. As a result the app appears to be short on pool.

```yaml
# 메트릭 노출 (Micrometer)
management:
  metrics:
    enable:
      hikaricp: true
# 핵심 지표
# hikaricp.connections.active  : 현재 사용 중
# hikaricp.connections.pending : 대기 중 (>0이면 풀 부족 신호)
# hikaricp.connections.usage   : 점유 시간 분포
```

> If `pending` is persistently greater than 0, **it's already too late**. It's the state just before bursting via `connectionTimeout`.

### 2-4. Relationship with DB `max_connections`
```
N app instances × pool size P  <  DB max_connections × 0.8
```
e.g.: 8 apps × pool 20 = 160 ≤ MariaDB `max_connections=300` × 0.8 = 240 → OK
- **20% headroom** for operations/management/batch tool connections.
- If HPA scales the app from 8 → 16, then 320 > 240 → DB rejects. When designing autoscale policy, always verify pool × max instances < DB limit.

```sql
-- MariaDB/MySQL
SHOW VARIABLES LIKE 'max_connections';
SHOW STATUS LIKE 'Threads_connected';

-- Postgres
SHOW max_connections;
SELECT count(*) FROM pg_stat_activity;
```

### 2-5. External call inside a transaction = pool occupancy blowup
The most common failure cause directly tied to the `transaction-locking` skill.
```
Pool size 10, avg transaction 50ms → theoretically 200 TPS
↓ add an external API (1 second) inside the transaction
Pool size 10, avg transaction 1050ms → ~10 TPS
```
> **Increasing pool size is not the answer.** Separating the external call out of the transaction is the answer.

### 2-6. Per-environment configuration
```yaml
# dev: 작게, leak 감지 활성
hikari:
  maximum-pool-size: 5
  minimum-idle: 1
  leak-detection-threshold: 10000

# prod: 크기는 측정 기반, 타임아웃은 HTTP보다 짧게
hikari:
  maximum-pool-size: 20
  minimum-idle: 20
  connection-timeout: 3000      # HTTP 30s timeout보다 훨씬 짧게
  max-lifetime: 1740000         # 29분 (DB wait_timeout 30분 가정)
  leak-detection-threshold: 60000
  keepalive-time: 30000
```
> The `connectionTimeout < HTTP timeout` principle: if HTTP is 30 seconds but the pool waits 30 seconds, even other processable requests time out along with it. 3 ~ 5 seconds recommended.

### 2-7. Multi-datasource (read/write split)
```yaml
spring:
  datasource:
    master:
      hikari:
        maximum-pool-size: 10    # 쓰기 위주: 작게
    slave:
      hikari:
        maximum-pool-size: 30    # 읽기 다수: 크게
```
If read load is heavy, make the slave pool large and the write pool small. Branch with `@Transactional(readOnly = true)` and `AbstractRoutingDataSource`.

## 3. Common Mistakes
```yaml
# [안티] 무지성 큰 풀
maximum-pool-size: 200   # DB가 200 동시 쿼리를 처리 못 함. TPS 오히려 하락

# [안티] minimumIdle = 0
minimum-idle: 0          # 피크 진입 시 커넥션 새로 만드느라 latency 스파이크

# [안티] connectionTimeout > HTTP timeout
connection-timeout: 60000 # 60초 기다린 후 의미 없이 응답 실패

# [안티] maxLifetime > DB wait_timeout
max-lifetime: 3600000    # 60분 — DB가 먼저 끊으면 "Communications link failure"
```
```java
// [안티] JDBC 직접 사용하며 close 누락
Connection c = dataSource.getConnection();
PreparedStatement p = c.prepareStatement(...);  // try-with-resources 안 씀 → 누수
```

## 4. Checklist
- [ ] Did you size `maximumPoolSize` by actual concurrent transaction count rather than the core-count formula?
- [ ] Did you set `minimumIdle == maximumPoolSize`?
- [ ] Is `connectionTimeout < HTTP timeout` and `maxLifetime < DB wait_timeout`?
- [ ] Are there no external API calls inside a transaction?
- [ ] Do you detect leaks with `leakDetectionThreshold` and monitor `hikaricp.connections.pending`?
- [ ] Is app instance count × pool size < DB max_connections × 0.8 (including the autoscale maximum)?
