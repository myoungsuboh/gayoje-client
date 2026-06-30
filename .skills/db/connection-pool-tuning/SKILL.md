---
name: HikariCP 커넥션 풀 튜닝 (Spring Boot)
description: HikariCP 파라미터 의미, 풀 크기 산정, 풀 고갈 진단, DB max_connections 관계, prod 튜닝 가이드. 커넥션 풀을 설정·튜닝하거나, 트래픽 피크에 전 API가 타임아웃을 뱉을 때, 읽기/쓰기 분리 데이터소스를 구성할 때 읽는다. 키워드: HikariCP, HikariDataSource, maximumPoolSize, idle-timeout, connection-timeout, dataSource.
rules:
  - "커넥션 풀은 HikariCP를 사용하고 maximumPoolSize를 부하 기준으로 산정한다."
  - "풀 크기는 코어 수 공식을 맹신하지 말고 실제 동시 쿼리 수로 측정해 정한다 — 풀이 작은 것이 큰 것보다 빠른 경우가 압도적으로 많다."
  - "트랜잭션 안에서 외부 API 호출을 금지해 커넥션 점유 폭발을 막는다."
  - "풀 고갈은 leakDetectionThreshold로 누수 커넥션을 진단한다."
  - "읽기/쓰기 분리 시 데이터소스별로 풀을 따로 구성한다."
  - "튜닝은 측정 → 가설 → 변경 → 재측정 사이클로만 한다. '그냥 늘려보자'는 거의 항상 잘못된 방향."
tags:
  - "HikariCP"
  - "HikariDataSource"
  - "maximumPoolSize"
  - "idle-timeout"
  - "connection-timeout"
  - "dataSource"
---

# 🌊 HikariCP 커넥션 풀 튜닝

> 커넥션 풀은 "DB와 앱 사이의 동시성 한계"다. 풀을 설정·튜닝하거나, 평소엔 멀쩡하다가 트래픽 피크에 전 API가 30초 타임아웃을 뱉기 시작할 때 읽는다.

## 1. 핵심 원칙
- 커넥션 풀은 HikariCP를 사용하고 `maximumPoolSize`를 부하 기준으로 산정한다.
- 풀 크기는 코어 수 공식을 맹신하지 말고 실제 동시 쿼리 수로 측정해 정한다 — 풀이 작은 것이 큰 것보다 빠른 경우가 압도적으로 많다.
- 트랜잭션 안에서 외부 API 호출을 금지해 커넥션 점유 폭발을 막는다.
- 풀 고갈은 `leakDetectionThreshold`로 누수 커넥션을 진단한다.
- 읽기/쓰기 분리 시 데이터소스별로 풀을 따로 구성한다.
- 튜닝은 **측정 → 가설 → 변경 → 재측정** 사이클로만 한다. "그냥 늘려보자"는 거의 항상 잘못된 방향.

## 2. 규칙

### 2-1. 핵심 파라미터
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

| 파라미터 | 의미 | 운영 권장값 |
|---|---|---|
| `maximumPoolSize` | 풀 상한 | 10 ~ 30 (코어 수 기반) |
| `minimumIdle` | 최소 유휴 | **`maximumPoolSize`와 동일하게** (Hikari 공식 권장) |
| `connectionTimeout` | 풀에서 커넥션 대기 한계 | 3 ~ 10초 (HTTP timeout보다 짧게) |
| `idleTimeout` | 유휴 회수 | `maxLifetime`보다 짧게 |
| `maxLifetime` | 커넥션 최대 수명 | DB `wait_timeout` - 30초 |
| `leakDetectionThreshold` | 누수 감지 | dev/staging 활성, prod도 60s 이상 권장 |

> **`minimumIdle == maximumPoolSize`** 권장 이유: 트래픽 피크 시점에 새 커넥션을 만들면 핸드셰이크/TLS 비용으로 추가 latency가 발생. 항상 만들어두자.

### 2-2. 풀 크기 산정 — "코어 수 × 2 + 1"의 함정
흔히 인용되는 PostgreSQL의 공식:
```
connections = ((core_count * 2) + effective_spindle_count)
```
이건 **DB 서버의 적정 동시 쿼리 수** 산정 공식이지, 애플리케이션 풀 크기가 아니다. 앱 풀은 **동시 트랜잭션 수 + 안전 마진**으로 산정한다.
```
풀 크기 ≈ (피크 동시 요청 수) × (요청당 평균 DB 트랜잭션 점유 시간 / 요청 처리 시간)
       + REQUIRES_NEW 마진
```
예시:
- 피크 동시 요청: 50 RPS, 평균 처리 시간 200ms (Little's Law: 동시 처리 ≈ 10)
- 그중 트랜잭션 점유: 80ms → 10 × 0.4 = 4
- `REQUIRES_NEW` 사용 메서드 마진 +2
- **권장: 6 ~ 10**

```yaml
# ❌ 안티 — 무지성 큰 풀: DB CPU 컨텍스트 스위치 폭증 → TPS 오히려 하락
maximum-pool-size: 200

# ✅ 권장 — 측정 기반 산정
maximum-pool-size: 20
```

### 2-3. 풀 고갈 진단
증상:
```
com.zaxxer.hikari.pool.HikariPool$PoolInitializationException
HikariPool-1 - Connection is not available, request timed out after 30000ms
```
원인 진단 체크리스트:
1. **트랜잭션 안 외부 호출?** → `transaction-locking` 스킬 참고. 1초짜리 API가 풀 점유 → 풀 크기 × (1초 / 평균 TX) 배 동시성 한계가 떨어진다.
2. **커넥션 누수?** → `leakDetectionThreshold` 로그 확인. `try-with-resources` 누락된 JDBC 직접 사용 코드.
3. **장기 트랜잭션?** → `SELECT * FROM pg_stat_activity WHERE state = 'active' AND now() - xact_start > interval '1 minute'`
4. **DB가 느려졌나?** → DB의 slow query가 풀의 holding time을 늘린다. 결과적으로 앱이 풀 부족으로 보임.

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

> `pending`이 지속적으로 0보다 크면 **이미 늦었다**. `connectionTimeout`으로 폭주하기 직전 상태.

### 2-4. DB `max_connections` 관계
```
앱 인스턴스 N대 × 풀 크기 P  <  DB max_connections × 0.8
```
예: 앱 8대 × 풀 20 = 160 ≤ MariaDB `max_connections=300` × 0.8 = 240 → OK
- 운영/관리/배치 도구 커넥션을 위해 **20% 여유**.
- HPA로 앱이 8 → 16대로 늘면 320 > 240 → DB 거절. 오토스케일 정책 짤 때 반드시 풀 × max 인스턴스 < DB 한계 검증.

```sql
-- MariaDB/MySQL
SHOW VARIABLES LIKE 'max_connections';
SHOW STATUS LIKE 'Threads_connected';

-- Postgres
SHOW max_connections;
SELECT count(*) FROM pg_stat_activity;
```

### 2-5. 트랜잭션 안 외부 호출 = 풀 점유 폭발
`transaction-locking` 스킬과 직결되는 가장 흔한 장애 원인.
```
풀 크기 10, 평균 트랜잭션 50ms → 이론상 200 TPS
↓ 트랜잭션 안에 외부 API(1초) 추가
풀 크기 10, 평균 트랜잭션 1050ms → ~10 TPS
```
> **풀 크기를 늘리는 것은 해답이 아니다.** 트랜잭션에서 외부 호출을 분리하는 것이 답이다.

### 2-6. 환경별 설정
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
> `connectionTimeout < HTTP timeout` 원칙: HTTP가 30초인데 풀이 30초 기다리면 다른 처리 가능한 요청까지 같이 타임아웃. 3 ~ 5초 권장.

### 2-7. 멀티 데이터소스 (읽기/쓰기 분리)
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
읽기 부하가 크면 슬레이브 풀을 크게, 쓰기 풀은 작게. `@Transactional(readOnly = true)`와 `AbstractRoutingDataSource`로 분기.

## 3. 흔한 실수
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

## 4. 체크리스트
- [ ] `maximumPoolSize`를 코어 수 공식이 아닌 실제 동시 트랜잭션 수로 산정했는가
- [ ] `minimumIdle == maximumPoolSize`로 설정했는가
- [ ] `connectionTimeout < HTTP timeout`, `maxLifetime < DB wait_timeout`인가
- [ ] 트랜잭션 안에 외부 API 호출이 없는가
- [ ] `leakDetectionThreshold`로 누수를 감지하고 `hikaricp.connections.pending`을 모니터링하는가
- [ ] 앱 인스턴스 수 × 풀 크기 < DB max_connections × 0.8 인가 (오토스케일 최대치 포함)
