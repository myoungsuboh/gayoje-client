---
name: HikariCP 连接池调优 (Spring Boot)
description: HikariCP 参数含义、连接池大小估算、连接池耗尽诊断、与 DB max_connections 的关系、prod 调优指南。在配置·调优连接池时、流量峰值时全部 API 抛出超时时、配置读/写分离数据源时阅读。关键词: HikariCP, HikariDataSource, maximumPoolSize, idle-timeout, connection-timeout, dataSource。
rules:
  - "连接池使用 HikariCP，并以负载为基准估算 maximumPoolSize。"
  - "连接池大小不要盲信核数公式，而要测量实际并发查询数来确定——连接池小于大的情况下更快的场景占绝大多数。"
  - "禁止在事务内调用外部 API，以防连接占用爆炸。"
  - "连接池耗尽用 leakDetectionThreshold 诊断泄漏的连接。"
  - "读/写分离时按数据源分别配置连接池。"
  - "调优只用 测量 → 假设 → 变更 → 再测量 的循环。「干脆调大点」几乎总是错误的方向。"
tags:
  - "HikariCP"
  - "HikariDataSource"
  - "maximumPoolSize"
  - "idle-timeout"
  - "connection-timeout"
  - "dataSource"
---

# 🌊 HikariCP 连接池调优

> 连接池是「DB 与应用之间的并发上限」。在配置·调优连接池时，或平时正常但流量峰值时全部 API 开始抛出 30 秒超时时阅读。

## 1. 核心原则
- 连接池使用 HikariCP，并以负载为基准估算 `maximumPoolSize`。
- 连接池大小不要盲信核数公式，而要测量实际并发查询数来确定——连接池小于大的情况下更快的场景占绝大多数。
- 禁止在事务内调用外部 API，以防连接占用爆炸。
- 连接池耗尽用 `leakDetectionThreshold` 诊断泄漏的连接。
- 读/写分离时按数据源分别配置连接池。
- 调优只用 **测量 → 假设 → 变更 → 再测量** 的循环。「干脆调大点」几乎总是错误的方向。

## 2. 规则

### 2-1. 核心参数
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

| 参数 | 含义 | 运行推荐值 |
|---|---|---|
| `maximumPoolSize` | 连接池上限 | 10 ~ 30 (基于核数) |
| `minimumIdle` | 最小空闲 | **与 `maximumPoolSize` 相同** (Hikari 官方推荐) |
| `connectionTimeout` | 从连接池等待连接的上限 | 3 ~ 10 秒 (短于 HTTP timeout) |
| `idleTimeout` | 空闲回收 | 短于 `maxLifetime` |
| `maxLifetime` | 连接最大寿命 | DB `wait_timeout` - 30 秒 |
| `leakDetectionThreshold` | 泄漏检测 | dev/staging 启用，prod 也推荐 60 秒以上 |

> 推荐 **`minimumIdle == maximumPoolSize`** 的原因：在流量峰值时创建新连接会因握手/TLS 成本产生额外 latency。始终保持创建好。

### 2-2. 连接池大小估算 — 「核数 × 2 + 1」的陷阱
常被引用的 PostgreSQL 公式:
```
connections = ((core_count * 2) + effective_spindle_count)
```
这是 **DB 服务器适宜并发查询数** 的估算公式，而非应用连接池大小。应用连接池以 **并发事务数 + 安全余量** 来估算。
```
连接池大小 ≈ (峰值并发请求数) × (每请求平均 DB 事务占用时间 / 请求处理时间)
       + REQUIRES_NEW 余量
```
示例:
- 峰值并发请求: 50 RPS，平均处理时间 200ms (Little's Law: 并发处理 ≈ 10)
- 其中事务占用: 80ms → 10 × 0.4 = 4
- `REQUIRES_NEW` 使用方法余量 +2
- **推荐: 6 ~ 10**

```yaml
# ❌ 反模式 — 无脑的大连接池: DB CPU 上下文切换暴增 → TPS 反而下降
maximum-pool-size: 200

# ✅ 推荐 — 基于测量的估算
maximum-pool-size: 20
```

### 2-3. 连接池耗尽诊断
症状:
```
com.zaxxer.hikari.pool.HikariPool$PoolInitializationException
HikariPool-1 - Connection is not available, request timed out after 30000ms
```
原因诊断检查清单:
1. **事务内的外部调用?** → 参考 `transaction-locking` 技能。1 秒的 API 占用连接池 → 并发上限下降 连接池大小 × (1 秒 / 平均 TX) 倍。
2. **连接泄漏?** → 检查 `leakDetectionThreshold` 日志。缺少 `try-with-resources` 的 JDBC 直接使用代码。
3. **长事务?** → `SELECT * FROM pg_stat_activity WHERE state = 'active' AND now() - xact_start > interval '1 minute'`
4. **DB 变慢了?** → DB 的 slow query 延长连接池的 holding time。结果上应用表现为连接池不足。

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

> 若 `pending` 持续大于 0，**已经晚了**。这是即将通过 `connectionTimeout` 失控前的状态。

### 2-4. 与 DB `max_connections` 的关系
```
应用实例 N 台 × 连接池大小 P  <  DB max_connections × 0.8
```
例: 应用 8 台 × 连接池 20 = 160 ≤ MariaDB `max_connections=300` × 0.8 = 240 → OK
- 为运维/管理/批处理工具的连接预留 **20% 余量**。
- 若 HPA 把应用从 8 → 16 台扩容，则 320 > 240 → DB 拒绝。制定自动扩缩策略时务必验证 连接池 × 最大实例数 < DB 上限。

```sql
-- MariaDB/MySQL
SHOW VARIABLES LIKE 'max_connections';
SHOW STATUS LIKE 'Threads_connected';

-- Postgres
SHOW max_connections;
SELECT count(*) FROM pg_stat_activity;
```

### 2-5. 事务内的外部调用 = 连接占用爆炸
与 `transaction-locking` 技能直接关联的最常见故障原因。
```
连接池大小 10, 平均事务 50ms → 理论上 200 TPS
↓ 在事务内加入外部 API(1 秒)
连接池大小 10, 平均事务 1050ms → ~10 TPS
```
> **增大连接池大小不是答案。** 把外部调用从事务中分离出来才是答案。

### 2-6. 按环境配置
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
> `connectionTimeout < HTTP timeout` 原则: HTTP 为 30 秒而连接池等 30 秒的话，连其他可处理的请求都会一起超时。推荐 3 ~ 5 秒。

### 2-7. 多数据源 (读/写分离)
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
若读负载大，则从库连接池调大，写连接池调小。用 `@Transactional(readOnly = true)` 和 `AbstractRoutingDataSource` 分流。

## 3. 常见错误
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

## 4. 检查清单
- [ ] 是否以实际并发事务数而非核数公式估算了 `maximumPoolSize`
- [ ] 是否设置了 `minimumIdle == maximumPoolSize`
- [ ] 是否满足 `connectionTimeout < HTTP timeout`、`maxLifetime < DB wait_timeout`
- [ ] 事务内是否没有外部 API 调用
- [ ] 是否用 `leakDetectionThreshold` 检测泄漏并监控 `hikaricp.connections.pending`
- [ ] 是否满足 应用实例数 × 连接池大小 < DB max_connections × 0.8 (含自动扩缩最大值)
