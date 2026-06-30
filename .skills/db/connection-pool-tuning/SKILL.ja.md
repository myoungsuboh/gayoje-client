---
name: HikariCP コネクションプールチューニング (Spring Boot)
description: HikariCP パラメータの意味、プールサイズの算定、プール枯渇の診断、DB max_connections との関係、prod チューニングガイド。コネクションプールを設定・チューニングするとき、トラフィックピークに全 API がタイムアウトを吐くとき、読み取り/書き込み分離データソースを構成するときに読む。キーワード: HikariCP, HikariDataSource, maximumPoolSize, idle-timeout, connection-timeout, dataSource。
rules:
  - "コネクションプールは HikariCP を使用し、maximumPoolSize を負荷基準で算定する。"
  - "プールサイズはコア数の公式を盲信せず、実際の同時クエリ数を測定して決める — プールが小さいほうが大きいより速い場合が圧倒的に多い。"
  - "トランザクション内での外部 API 呼び出しを禁止し、コネクション占有の爆発を防ぐ。"
  - "プール枯渇は leakDetectionThreshold で漏れたコネクションを診断する。"
  - "読み取り/書き込み分離時はデータソースごとにプールを別々に構成する。"
  - "チューニングは 測定 → 仮説 → 変更 → 再測定 のサイクルでのみ行う。「とりあえず増やそう」はほぼ常に誤った方向。"
tags:
  - "HikariCP"
  - "HikariDataSource"
  - "maximumPoolSize"
  - "idle-timeout"
  - "connection-timeout"
  - "dataSource"
---

# 🌊 HikariCP コネクションプールチューニング

> コネクションプールは「DB とアプリの間の同時性の限界」だ。プールを設定・チューニングするとき、または普段は問題ないのにトラフィックピークに全 API が30秒タイムアウトを吐き始めるときに読む。

## 1. 核心原則
- コネクションプールは HikariCP を使用し、`maximumPoolSize` を負荷基準で算定する。
- プールサイズはコア数の公式を盲信せず、実際の同時クエリ数を測定して決める — プールが小さいほうが大きいより速い場合が圧倒的に多い。
- トランザクション内での外部 API 呼び出しを禁止し、コネクション占有の爆発を防ぐ。
- プール枯渇は `leakDetectionThreshold` で漏れたコネクションを診断する。
- 読み取り/書き込み分離時はデータソースごとにプールを別々に構成する。
- チューニングは **測定 → 仮説 → 変更 → 再測定** のサイクルでのみ行う。「とりあえず増やそう」はほぼ常に誤った方向。

## 2. ルール

### 2-1. 核心パラメータ
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

| パラメータ | 意味 | 運用推奨値 |
|---|---|---|
| `maximumPoolSize` | プール上限 | 10 ~ 30 (コア数ベース) |
| `minimumIdle` | 最小アイドル | **`maximumPoolSize` と同一に** (Hikari 公式推奨) |
| `connectionTimeout` | プールからのコネクション待機限界 | 3 ~ 10秒 (HTTP timeout より短く) |
| `idleTimeout` | アイドル回収 | `maxLifetime` より短く |
| `maxLifetime` | コネクション最大寿命 | DB `wait_timeout` - 30秒 |
| `leakDetectionThreshold` | 漏れ検知 | dev/staging で有効、prod も60秒以上推奨 |

> **`minimumIdle == maximumPoolSize`** を推奨する理由: トラフィックピーク時に新しいコネクションを作るとハンドシェイク/TLS コストで追加 latency が発生する。常に作っておこう。

### 2-2. プールサイズ算定 — 「コア数 × 2 + 1」の罠
よく引用される PostgreSQL の公式:
```
connections = ((core_count * 2) + effective_spindle_count)
```
これは **DB サーバの適正な同時クエリ数** の算定公式であって、アプリケーションのプールサイズではない。アプリプールは **同時トランザクション数 + 安全マージン** で算定する。
```
プールサイズ ≈ (ピーク同時リクエスト数) × (リクエストあたり平均 DB トランザクション占有時間 / リクエスト処理時間)
       + REQUIRES_NEW マージン
```
例:
- ピーク同時リクエスト: 50 RPS、平均処理時間 200ms (Little's Law: 同時処理 ≈ 10)
- そのうちトランザクション占有: 80ms → 10 × 0.4 = 4
- `REQUIRES_NEW` 使用メソッドのマージン +2
- **推奨: 6 ~ 10**

```yaml
# ❌ アンチ — 無分別に大きなプール: DB CPU コンテキストスイッチ急増 → TPS むしろ低下
maximum-pool-size: 200

# ✅ 推奨 — 測定ベースの算定
maximum-pool-size: 20
```

### 2-3. プール枯渇の診断
症状:
```
com.zaxxer.hikari.pool.HikariPool$PoolInitializationException
HikariPool-1 - Connection is not available, request timed out after 30000ms
```
原因診断チェックリスト:
1. **トランザクション内の外部呼び出し?** → `transaction-locking` スキル参照。1秒の API がプールを占有 → プールサイズ × (1秒 / 平均 TX) 倍だけ同時性の限界が下がる。
2. **コネクション漏れ?** → `leakDetectionThreshold` ログを確認。`try-with-resources` が欠けた JDBC 直接使用コード。
3. **長時間トランザクション?** → `SELECT * FROM pg_stat_activity WHERE state = 'active' AND now() - xact_start > interval '1 minute'`
4. **DB が遅くなった?** → DB の slow query がプールの holding time を延ばす。結果としてアプリがプール不足に見える。

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

> `pending` が持続的に0より大きいなら **すでに手遅れ**。`connectionTimeout` で暴走する直前の状態だ。

### 2-4. DB `max_connections` との関係
```
アプリインスタンス N台 × プールサイズ P  <  DB max_connections × 0.8
```
例: アプリ8台 × プール20 = 160 ≤ MariaDB `max_connections=300` × 0.8 = 240 → OK
- 運用/管理/バッチツールのコネクションのために **20% の余裕**。
- HPA でアプリが 8 → 16台に増えると 320 > 240 → DB 拒否。オートスケール方針を立てるとき必ずプール × 最大インスタンス < DB 限界を検証する。

```sql
-- MariaDB/MySQL
SHOW VARIABLES LIKE 'max_connections';
SHOW STATUS LIKE 'Threads_connected';

-- Postgres
SHOW max_connections;
SELECT count(*) FROM pg_stat_activity;
```

### 2-5. トランザクション内の外部呼び出し = プール占有の爆発
`transaction-locking` スキルと直結する最も頻繁な障害原因。
```
プールサイズ 10、平均トランザクション 50ms → 理論上 200 TPS
↓ トランザクション内に外部 API(1秒) を追加
プールサイズ 10、平均トランザクション 1050ms → ~10 TPS
```
> **プールサイズを増やすことは解決策ではない。** トランザクションから外部呼び出しを分離するのが答えだ。

### 2-6. 環境別設定
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
> `connectionTimeout < HTTP timeout` の原則: HTTP が30秒なのにプールが30秒待つと、ほかに処理可能なリクエストまで一緒にタイムアウトする。3 ~ 5秒推奨。

### 2-7. マルチデータソース (読み取り/書き込み分離)
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
読み取り負荷が大きければスレーブプールを大きく、書き込みプールは小さく。`@Transactional(readOnly = true)` と `AbstractRoutingDataSource` で分岐する。

## 3. よくある間違い
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

## 4. チェックリスト
- [ ] `maximumPoolSize` をコア数の公式ではなく実際の同時トランザクション数で算定したか
- [ ] `minimumIdle == maximumPoolSize` に設定したか
- [ ] `connectionTimeout < HTTP timeout`、`maxLifetime < DB wait_timeout` か
- [ ] トランザクション内に外部 API 呼び出しがないか
- [ ] `leakDetectionThreshold` で漏れを検知し `hikaricp.connections.pending` をモニタリングしているか
- [ ] アプリインスタンス数 × プールサイズ < DB max_connections × 0.8 か (オートスケール最大値を含む)
