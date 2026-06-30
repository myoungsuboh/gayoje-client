---
name: ロギング及びオブザーバビリティ標準 (Logging & Observability)
description: 構造化ロギング（JSON）・相関 ID（traceId）の伝播・機密情報のマスキング・ログレベルポリシー・メトリクス/RED・W3C 分散トレーシングのスタック非依存な汎用標準。ログを作成・設定する際、運用で問題を素早く追跡できる環境を整える際、新しいサービス/言語/フレームワークにロギング・メトリクスを導入する際に読む。キーワード: structured logging, JSON log, correlation id, traceId, spanId, MDC, masking, PII, log level, metrics, RED, Prometheus, OpenTelemetry, W3C traceparent。
rules:
  - "構造化ロギング: ログは人が読む自由テキストではなく、機械がパース可能なキー・バリュー（JSON など）構造で出力する。メッセージは固定し、可変値は別フィールドに分離する。"
  - "相関 ID の伝播: 1 つのリクエストを最後まで追跡できるよう、すべてのログに相関 ID（traceId）と主体識別子（userId など）を自動で載せて送る。サービス境界を越えても同じ ID が維持される。"
  - "機密情報のマスキング: パスワード・トークン・住民番号・カード番号のような機密情報はログに残す前にマスキングするか、そもそも記録しない。"
  - "ログレベルポリシー: ERROR/WARN/INFO/DEBUG/TRACE の意味をチーム全体で同一に使い、環境（ローカル/運用）に応じて出力レベルとフォーマットだけを分離する。"
  - "メトリクス（RED）: ログとは別に数値指標を公開する。最低限、リクエスト数（Rate）・エラー数（Errors）・遅延（Duration）を計測し、トレンドと異常を検知する。"
  - "標準トレース伝播: 分散トレーシングは W3C traceparent/tracestate のような標準ヘッダで伝播し、ベンダー・言語が異なってもトレースが繋がるようにする。"
tags:
  - "structured logging"
  - "JSON log"
  - "correlation id"
  - "traceId"
  - "spanId"
  - "MDC"
  - "masking"
  - "PII"
  - "log level"
  - "metrics"
  - "RED"
  - "Prometheus"
  - "OpenTelemetry"
  - "W3C traceparent"
  - "slf4j"
  - "logback"
  - "Logger"
  - "LoggerFactory"
  - "@Slf4j"
  - "log.info"
  - "log.warn"
---

# 🔍 ロギング及びオブザーバビリティ標準

> 構造化ロギング・相関 ID（traceId）・機密情報のマスキング・ログレベルポリシー・メトリクス（RED）・W3C 分散トレーシングを標準化する。ログを作成・設定する際や運用トレース環境を整える際に読む。特定の言語/フレームワークに依存しない汎用標準である。
>
> **権威の境界**: 構造化ロギング・correlationId/traceId 伝播・機密情報マスキング・ログレベルポリシーは **この文書が権威** である。運用面（ダッシュボード・SLO アラート・メトリクス収集インフラ・外部依存性の計測）は `observability` を参照。（サービス間トレース連携は `distributed-tracing`、監査ログ保存は `audit-logging`、PII 処理原則は `privacy-pii` を参照）

## 1. 核心原則
- **構造化ロギング**: ログは人が読む自由テキストではなく、機械がパース可能なキー・バリュー（JSON など）構造で出力する。メッセージは固定し、可変値は別フィールドに分離する。
- **相関 ID の伝播**: 1 つのリクエストを最後まで追跡できるよう、すべてのログに相関 ID（traceId）と主体識別子（userId など）を自動で載せて送る。サービス境界を越えても同じ ID が維持される。
- **機密情報のマスキング**: パスワード・トークン・住民番号・カード番号のような機密情報はログに残す前にマスキングするか、そもそも記録しない。
- **ログレベルポリシー**: ERROR/WARN/INFO/DEBUG/TRACE の意味をチーム全体で同一に使い、環境（ローカル/運用）に応じて出力レベルとフォーマットだけを分離する。
- **メトリクス（RED）**: ログとは別に数値指標を公開する。最低限、リクエスト数（Rate）・エラー数（Errors）・遅延（Duration）を計測し、トレンドと異常を検知する。
- **標準トレース伝播**: 分散トレーシングは W3C `traceparent`/`tracestate` のような標準ヘッダで伝播し、ベンダー・言語が異なってもトレースが繋がるようにする。

## 2. 規則

### 2-1. 構造化ロギング（機械がパース可能に）
- 運用は JSON など構造化フォーマットで、ローカルは人が読みやすいフォーマットで。同じコードで環境設定だけを変える。
- メッセージ文字列に値を連結せず、値を構造化されたフィールドに分離する。

```text
// ❌ 禁止 — 値がメッセージに混ざりパース・集計・検索が難しい
log("user " + userId + " created asset " + assetId + " in 230ms")

// ✅ 推奨 — 固定メッセージ + 構造化されたフィールド（どのバックエンドでも同じ原則）
log(level=INFO, msg="asset.created", fields={ userId, assetId, durationMs: 230 })
```

### 2-2. 相関 ID（traceId）の自動注入・伝播
- リクエストの入口（ミドルウェア/フィルタ/インターセプター）で traceId・userId をコンテキストに入れ、すべてのログが自動で含むようにする。個々のログ呼び出しごとに手動で付けない。
- 外部へ呼び出す際にトレースヘッダを伝播し、受信側はそれを引き継いで同じ trace に繋げる。

```text
// ❌ 禁止 — トレース ID のないログ → 同時リクエストが混ざり 1 つのリクエストを追えない
log("payment failed")

// ✅ 推奨 — リクエストコンテキストに traceId/userId を注入、すべてのログに自動で含める
on_request_start: ctx.put(traceId, userId)   // リクエスト終了時に整理（clear）
log("payment.failed")   // → { traceId, userId, msg: "payment.failed" }
```

### 2-3. 機密情報のマスキング
- 機密情報は記録直前の段階で一括マスキングするか、最初からログ対象から除外する。
- 「必要なら後で隠す」ではなく「基本的に残さない」を原則とする。

```text
// ❌ 禁止 — トークン・個人情報の平文露出 → コンプライアンス事故
log("login", { token: "eyJhbGciOi...", ssn: "901010-1234567" })

// ✅ 推奨 — マスキング後に記録（または機密フィールドはそもそも除外）
log("login", { token: "***", ssn: "******-*******" })
```

### 2-4. ログレベルポリシー（意味を統一）
レベルを一貫して使わないとアラートノイズが発生し、肝心の重要な ERROR が埋もれる。
| レベル | 使用時点 | 例 |
|------|----------|------|
| ERROR | 即時の対応が必要なシステムエラー。アラート対象。 | DB 接続失敗、外部依存性の 5xx 反復 |
| WARN  | 異常だが自動復旧または一時迂回された。 | リトライ発生、キャッシュミス急増 |
| INFO  | ビジネスフローの主要イベント。平常時の参照用。 | ログイン成功、リソース登録 |
| DEBUG | 開発/デバッグ用。運用では OFF。 | 分岐判定、クエリパラメータ |
| TRACE | 非常に詳細なフロー追跡。 | 関数の入出全体 |

- 運用の既定レベルは INFO。DEBUG/TRACE を運用で点けっぱなしにしない。
- 例外はメッセージだけ残さず、スタックトレース/原因まで一緒に残す — 原因オブジェクトをロギング API にそのまま渡す。

### 2-5. 核心分岐に 1 行、例外は原因まで
- ビジネスの主要分岐（成功/失敗/重複など）には INFO または WARN を 1 行残し、フローを追跡可能にする。
- 予測可能なユーザーエラーは WARN、予測できないシステムエラーは ERROR + スタックトレース。

```text
// ✅ 推奨 — 分岐ごとに意味のある 1 行、レベルで区別
try:
  create(req); log(INFO, "asset.created", { id: req.id })
catch DuplicateError:
  log(WARN, "asset.duplicate", { id: req.id }); raise BusinessError(...)
catch Error as e:
  log(ERROR, "asset.create.failed", { id: req.id }, cause=e)  // スタックトレース含む
  raise
```

### 2-6. メトリクス（RED）と公開セキュリティ
- ログとは別にメトリクスを公開する。最低限 RED — Rate（リクエスト数）・Errors（エラー数）・Duration（遅延、パーセンタイル p50/p95/p99）— を計測する。
- カウンター（累積）・タイマー（遅延分布）のような標準計測を使い、メトリクス/ヘルス公開エンドポイントのうち機密なものは認証の後ろに置く。

```text
// ✅ 推奨 — ツール非依存の RED 計測コンセプト
metric.counter("asset.created").inc()
timer = metric.timer("asset.lookup")        // p50/p95/p99 分布を収集
with timer: doLookup()

// ヘルス（liveness/readiness）は公開可能、詳細メトリクス/ダンプは認証必要
```

### 2-7. 標準トレース伝播（W3C）
- 分散トレーシングは W3C `traceparent`/`tracestate` 標準ヘッダで伝播する（ベンダー依存フォーマットを避ける）。
- 運用では適切なサンプリング比率（例: 10%）を適用し、コストと可視性のバランスを取る。
- 具体的なコレクター連携・サービス間コンテキスト伝播は `distributed-tracing` を参照。

```text
// 呼び出し側: 現在の trace コンテキストを標準ヘッダで注入
outbound.headers["traceparent"] = ctx.traceparent

// 受信側: ヘッダから trace コンテキストを復元し同じ trace に繋ぐ
ctx = extract("traceparent", inbound.headers)
```

## 3. よくある間違い（アンチパターン — 絶対禁止）
- ❌ 標準出力/エラーへ直接出力（例: print、コンソール直接出力） → レベル制御不可、運用ログに残らない。ロギング抽象化を使用。
- ❌ 文字列連結ログ → レベルが切れていても連結コストが発生、パース・集計不可。固定メッセージ + 構造化フィールドを使用。
- ❌ 機密情報の平文ロギング → マスキングするか、そもそも出さない。
- ❌ 例外をメッセージだけでロギング → スタックトレース/原因が消失。原因オブジェクトをロギング API に渡す。
- ❌ 運用で DEBUG/TRACE を常時有効 → ディスク/ネットワーク急増。運用の既定は INFO。
- ❌ traceId のないログ → 同時リクエストが混ざり追跡不可。入口で自動注入が必須。
- ❌ 核心ビジネス分岐にログ 1 行もない → 分岐には必ず意味のある 1 行。
- ❌ ログをビジネス/監査データの保存先として使用 → 監査ログは別の永続ストアへ（`audit-logging`）。
- ❌ メトリクスなしでログだけ見る → トレンド・異常検知不可。RED 指標を別途公開。

## 4. チェックリスト
- [ ] ログが構造化フォーマット（キー・バリュー/JSON）であり、環境別（ローカル可読性 / 運用構造化）に分離されているか
- [ ] traceId・userId がリクエストの入口で自動注入され、すべてのログに含まれるか
- [ ] トークン・住民番号・カード番号など機密情報がマスキングまたは除外されるか
- [ ] ログレベル（ERROR/WARN/INFO/DEBUG/TRACE）の意味をガイド通り一貫して使ったか
- [ ] 例外はメッセージだけでなくスタックトレース/原因まで残すか
- [ ] 核心ビジネス分岐ごとに意味のあるログ 1 行があるか
- [ ] RED（リクエスト・エラー・遅延）メトリクスをログとは別に公開するか
- [ ] 機密なメトリクス/ダンプエンドポイントが認証で保護されているか
- [ ] 分散トレーシングが W3C traceparent で伝播され、運用サンプリング比率が設定されているか

## 付録: スタック別の例

> 以下は特定スタックの具体的な実装例である。上記 1~4 の中立的な原則・規則が優先され、この付録は 1 つの実装方法を示すにすぎない。

### Spring Boot (Logback + Micrometer)

#### 依存関係
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    implementation 'io.micrometer:micrometer-registry-prometheus'
    implementation 'io.micrometer:micrometer-tracing-bridge-otel'
    implementation 'io.opentelemetry:opentelemetry-exporter-otlp'
    implementation 'net.logstash.logback:logstash-logback-encoder:7.4'
}
```

#### logback-spring.xml（環境別の分離）
> 規則は本文 2-1 を参照。以下はその環境別の分離（運用 JSON / ローカルパターン）を Logback で実装した例である。
```xml
<!-- src/main/resources/logback-spring.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

    <!-- 機密情報マスキングコンバーターの登録 -->
    <conversionRule conversionWord="mask"
                    converterClass="com.harness.common.log.MaskingConverter"/>

    <property name="LOG_PATH" value="${LOG_PATH:-./logs}"/>
    <property name="APP_NAME" value="${spring.application.name:-harness}"/>

    <!-- ローカル: 可読性優先 -->
    <springProfile name="local | default">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level [%X{traceId:-},%X{spanId:-}] %logger{36} - %mask(%msg)%n</pattern>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
        </root>
        <logger name="com.harness" level="DEBUG"/>
    </springProfile>

    <!-- dev/prod: 構造化 JSON -->
    <springProfile name="dev | prod">
        <appender name="JSON_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="net.logstash.logback.encoder.LogstashEncoder">
                <includeMdcKeyName>traceId</includeMdcKeyName>
                <includeMdcKeyName>spanId</includeMdcKeyName>
                <includeMdcKeyName>userId</includeMdcKeyName>
                <customFields>{"app":"${APP_NAME}"}</customFields>
            </encoder>
        </appender>

        <appender name="ROLLING_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
            <file>${LOG_PATH}/${APP_NAME}.log</file>
            <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
                <fileNamePattern>${LOG_PATH}/${APP_NAME}-%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
                <maxFileSize>100MB</maxFileSize>
                <maxHistory>30</maxHistory>
                <totalSizeCap>10GB</totalSizeCap>
            </rollingPolicy>
            <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
        </appender>

        <root level="INFO">
            <appender-ref ref="JSON_CONSOLE"/>
            <appender-ref ref="ROLLING_FILE"/>
        </root>
        <logger name="com.harness" level="INFO"/>
    </springProfile>
</configuration>
```

#### MDC traceId/userId の自動注入
```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0    # 運用は 0.1 推奨
  observations:
    key-values:
      app: harness
```
```java
package com.harness.common.log;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MdcContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) throws ServletException, IOException {
        try {
            // Micrometer Tracing が既に traceId/spanId を MDC に入れてくれる。ここでは userId だけ追加。
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated()) {
                MDC.put("userId", auth.getName());
            }
            chain.doFilter(request, response);
        } finally {
            MDC.remove("userId");
        }
    }
}
```

#### 機密情報マスキングコンバーター
> ⚠️ **適用範囲の注意**: 以下のコンバーターは **メッセージ文字列（`getFormattedMessage()`）のみ** マスキングする。本文規則（2-1、2-3）の通り値をメッセージに付けず MDC・構造化引数（arguments）に分離すると、**そのフィールドはこのコンバーターを経由せず平文で残る。** したがってパターンコンバーターは「メッセージに誤って混ざり込んだ機密情報を捕える最後の安全網」としてのみ使い、**構造化フィールドは以下の [フィールドレベルマスキング] でエンコーダ/MDC 段階にマスキングをかけなければならない。** 最も確実な防御は、そもそも機密情報をログ対象から除外することである（2-3）。

```java
package com.harness.common.log;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.regex.Pattern;

// ⚠️ メッセージ文字列専用の安全網。構造化フィールド（MDC/arguments）は捕えられない → フィールドレベルマスキングの併用が必須。
public class MaskingConverter extends ClassicConverter {

    // JWT トークン: Bearer xxx.yyy.zzz
    private static final Pattern JWT   = Pattern.compile("(Bearer\\s+)[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_.+/=]*");
    // 住民番号: 901010-1234567
    private static final Pattern RRN   = Pattern.compile("\\d{6}-[1-4]\\d{6}");
    // カード番号: 4 桁 4 束
    private static final Pattern CARD  = Pattern.compile("\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b");
    // メールはドメインだけ残して ID をマスキング
    private static final Pattern EMAIL = Pattern.compile("([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+)");
    // 携帯電話
    private static final Pattern PHONE = Pattern.compile("\\b(01[016789])-?\\d{3,4}-?\\d{4}\\b");

    /** 文字列 1 件に対するマスキング。メッセージ・フィールドのどこでも再利用できるよう static で公開。 */
    public static String maskValue(String s) {
        if (s == null) return null;
        s = JWT.matcher(s).replaceAll("$1***");
        s = RRN.matcher(s).replaceAll("******-*******");
        s = CARD.matcher(s).replaceAll("****-****-****-****");
        s = EMAIL.matcher(s).replaceAll("$1***$2");
        s = PHONE.matcher(s).replaceAll("***-****-****");
        return s;
    }

    @Override
    public String convert(ILoggingEvent event) {
        String msg = event.getFormattedMessage();
        return msg == null ? "" : maskValue(msg);
    }
}
```

##### フィールドレベルマスキング（構造化フィールドはエンコーダ/MDC で処理）
JSON エンコーダが出力する MDC・構造化フィールドは上記コンバーターを経由しない。`LogstashEncoder` の値変換フック（例: `ValueMasker`/カスタム `JsonProvider`）や MDC に入れる前の時点で同じ `maskValue(...)` を適用し、メッセージとフィールドの両方が同じマスキング規則を通るようにする。ライブラリが提供しないフックを勝手に仮定せず、MDC `put` の直前・ドメインオブジェクトの `toString()` 段階でマスキングするのが最も確実である。
```java
// ✅ 構造化フィールドは入れる前にマスキング — メッセージコンバーターには引っかからない
MDC.put("authHeader", MaskingConverter.maskValue(rawAuthHeader));
log.info("login.attempt", kv("email", MaskingConverter.maskValue(email)));
```

#### Actuator エンドポイントとセキュリティ
```yaml
# application.yml
management:
  endpoints:
    web:
      base-path: /actuator
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when_authorized
      probes:
        enabled: true            # /actuator/health/liveness, /readiness
    prometheus:
      access: read_only
  metrics:
    tags:
      application: ${spring.application.name}
      env: ${SPRING_PROFILES_ACTIVE:local}
```
> `/actuator/prometheus`、`/actuator/heapdump`、`/actuator/env` のような機密エンドポイントは認証の後ろに置く。
```java
// SecurityConfig の一部
.requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
.requestMatchers("/actuator/**").hasRole("ADMIN")
```

#### Micrometer カスタムメトリクス
```java
package com.harness.src.asset.service.impl;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

@Service
public class AssetMetricsService {

    private final Counter createdCounter;
    private final Timer   lookupTimer;

    public AssetMetricsService(MeterRegistry registry) {
        this.createdCounter = Counter.builder("harness.asset.created")
            .description("登録された資産の数")
            .tag("module", "asset")
            .register(registry);
        this.lookupTimer = Timer.builder("harness.asset.lookup")
            .description("資産照会の所要時間")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry);
    }

    public void incrementCreated()         { createdCounter.increment(); }
    public Timer.Sample startLookupTimer() { return Timer.start(); }
    public void stopLookup(Timer.Sample s) { s.stop(lookupTimer); }
}
```

#### 分散トレーシング — W3C traceparent
```yaml
management:
  tracing:
    propagation:
      type: w3c           # traceparent ヘッダ使用（B3 ではなく標準）
    sampling:
      probability: 0.1    # 運用は 10% サンプリング
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
```
> Spring Boot 3 + Micrometer Tracing は自動的に `traceparent`、`tracestate` ヘッダを外部呼び出しに注入する。`RestTemplate`/`WebClient` は自動計測されるが、手動で `WebClient.Builder` を作る場合は `@Autowired ObservationRegistry` の注入が必要。

#### サービスロギングの作成パターン
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    @Override
    @Transactional
    public void createAsset(AssetCreateRequest request) {
        // INFO: ビジネス開始イベント（構造化キー・バリュー）
        log.info("資産登録開始 tagId={} deckId={}", request.getTagId(), request.getDeckId());
        try {
            assetDao.insert(request);
            log.info("資産登録完了 tagId={}", request.getTagId());
        } catch (DuplicateKeyException e) {
            // WARN: 予測可能なユーザーエラー
            log.warn("重複資産登録の試行 tagId={}", request.getTagId());
            throw new BusinessException("CONFLICT", "すでに登録された資産です。");
        } catch (Exception e) {
            // ERROR: 予測できないシステムエラー（必ずスタックトレース）
            log.error("資産登録失敗 tagId={}", request.getTagId(), e);
            throw e;
        }
    }
}
```
