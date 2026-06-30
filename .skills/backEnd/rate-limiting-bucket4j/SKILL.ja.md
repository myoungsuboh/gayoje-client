---
name: Rate Limiting (Bucket4j + Redis)
description: Spring Boot で IP/ユーザーベースの API スロットリングを分散環境で一貫して実装する標準。Bucket4j + Redis token bucket、エンドポイント別ポリシー、429 + Retry-After レスポンスを扱う。公開 API をリリースしたり、ログインの総当たり・ボット・スパムを防ぐときに読む。キーワード: bucket4j, RateLimit, Bucket, Refill, Bandwidth, tooManyRequests, 429, throttling。
rules:
  - "API スロットリングは Bucket4j のトークンバケットアルゴリズムで実装する。"
  - "分散環境では Redis をバケットストアとして使い、インスタンス間で上限を共有する（in-memory Map 禁止）。"
  - "上限ポリシーはエンドポイント別に定義し、アノテーションで適用する（enum で中央管理）。"
  - "上限超過時は 429 ステータスと Retry-After ヘッダーで再試行時刻を知らせる。"
  - "クライアント IP は X-Forwarded-For の先頭値を、信頼可能なプロキシを基準に抽出する。"
tags:
  - "bucket4j"
  - "RateLimit"
  - "Bucket"
  - "Refill"
  - "Bandwidth"
  - "tooManyRequests"
  - "429"
  - "throttling"
---

# 🚦 Rate Limiting (Bucket4j + Redis)

> ログインの総当たり、会員登録ボット、友達招待スパム — API を公開した瞬間に入ってくる攻撃だ。公開 API が一つでもあれば Rate Limiting はリリース前の必須事項。新しい公開エンドポイントを作成したり、スロットリングポリシーを決めるときに読む。
>
> 関連スキル:
> - セキュリティ認証: [security-backend](../../security/security-backend/SKILL.md)
> - キャッシング: [redis-cache](../redis-cache/SKILL.md)
> - ロギング: [logging-observability](../logging-observability/SKILL.md)

## 1. 基本原則
- API スロットリングは Bucket4j のトークンバケットアルゴリズムで実装する。
- 分散環境では Redis をバケットストアとして使い、インスタンス間で上限を共有する（in-memory Map 禁止）。
- 上限ポリシーはエンドポイント別に定義し、アノテーションで適用する（enum で中央管理）。
- 上限超過時は 429 ステータスと Retry-After ヘッダーで再試行時刻を知らせる。
- クライアント IP は X-Forwarded-For の先頭値を、信頼可能なプロキシを基準に抽出する。

## 2. ルール

### 2-1. アルゴリズムの選択
| アルゴリズム | 長所 | 短所 | 推奨 |
|---|---|---|---|
| Fixed Window | 単純 | ウィンドウ境界で2倍のトラフィックを許容 | ❌ |
| Sliding Window | 正確 | メモリ/演算コスト | △ |
| **Token Bucket** | **バースト許容 + 平均制御** | **やや複雑** | **✅ 推奨** |
| Leaky Bucket | 滑らかな throttle | バースト不許可 | △ |

Bucket4j は token bucket の実装。通常はバーストを許容し平均速度のみを制限するので、正常なユーザー体験を損なわない。

### 2-2. 依存関係
```gradle
implementation 'com.bucket4j:bucket4j-core:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-redis-common:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-lettuce:8.10.1'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-3. ポリシー定義 (enum で中央管理)
```java
// ❌ 금지 — controller마다 한도를 하드코딩
// ✅ 권장 — 엔드포인트별 정책을 enum으로 중앙 관리
public enum RateLimitPolicy {
    LOGIN("login", 5, Duration.ofMinutes(1), KeyType.IP),                   // 로그인 5/분/IP
    SIGNUP("signup", 3, Duration.ofHours(1), KeyType.IP),                   // 가입 3/시간/IP
    FRIEND_INVITE("friend-invite", 30, Duration.ofDays(1), KeyType.USER),   // 초대 30/일/사용자
    DEFAULT("default", 60, Duration.ofMinutes(1), KeyType.USER);            // 그 외 60/분/사용자

    public final String name;
    public final long capacity;
    public final Duration refillPeriod;
    public final KeyType keyType;

    RateLimitPolicy(String n, long cap, Duration period, KeyType type) {
        this.name = n; this.capacity = cap; this.refillPeriod = period; this.keyType = type;
    }

    public Bandwidth toBandwidth() {
        return Bandwidth.classic(capacity, Refill.intervally(capacity, refillPeriod));
    }
}

public enum KeyType { IP, USER }
```

### 2-4. Redis バックエンド構成 (分散上限の共有)
```java
@Configuration
public class RateLimitConfig {

    @Bean
    public LettuceBasedProxyManager<String> proxyManager(RedisClient redisClient) {
        StatefulRedisConnection<String, byte[]> connection = redisClient.connect(
            RedisCodec.of(StringCodec.UTF8, ByteArrayCodec.INSTANCE));
        return LettuceBasedProxyManager.builderFor(connection)
            .withExpirationStrategy(ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(Duration.ofHours(1)))
            .build();
    }

    @Bean
    public RateLimitService rateLimitService(LettuceBasedProxyManager<String> pm) {
        return new RateLimitService(pm);
    }
}
```
```java
@Service
@RequiredArgsConstructor
public class RateLimitService {
    private final LettuceBasedProxyManager<String> proxyManager;

    public boolean tryConsume(RateLimitPolicy policy, String key) {
        Bucket bucket = proxyManager.builder()
            .build(buildKey(policy, key), () -> BucketConfiguration.builder()
                .addLimit(policy.toBandwidth())
                .build());
        return bucket.tryConsume(1);
    }

    public long getRetryAfterSeconds(RateLimitPolicy policy, String key) {
        Bucket bucket = proxyManager.builder().build(buildKey(policy, key), () -> null);
        long nanos = bucket.estimateAbilityToConsume(1).getNanosToWaitForRefill();
        return TimeUnit.NANOSECONDS.toSeconds(nanos) + 1;
    }

    private String buildKey(RateLimitPolicy policy, String key) {
        return "rl:" + policy.name + ":" + key;
    }
}
```

### 2-5. アノテーションベースの適用 (推奨)
```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    RateLimitPolicy value() default RateLimitPolicy.DEFAULT;
}

@Aspect
@Component
@RequiredArgsConstructor
public class RateLimitAspect {
    private final RateLimitService service;
    private final HttpServletRequest request;

    @Around("@annotation(rateLimit)")
    public Object check(ProceedingJoinPoint pjp, RateLimit rateLimit) throws Throwable {
        RateLimitPolicy policy = rateLimit.value();
        String key = resolveKey(policy);
        if (!service.tryConsume(policy, key)) {
            long retry = service.getRetryAfterSeconds(policy, key);
            throw new RateLimitExceededException(policy, retry);
        }
        return pjp.proceed();
    }

    private String resolveKey(RateLimitPolicy policy) {
        return switch (policy.keyType) {
            case IP -> extractClientIp(request);
            case USER -> SecurityContextHolder.getContext().getAuthentication().getName();
        };
    }

    private String extractClientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return req.getRemoteAddr();
    }
}
```
```java
@RestController
public class AuthController {
    @RateLimit(RateLimitPolicy.LOGIN)
    @PostMapping("/auth/login")
    public TokenResponse login(@RequestBody LoginRequest req) { ... }
}
```

### 2-6. 429 レスポンス形式 + Retry-After
```java
@ExceptionHandler(RateLimitExceededException.class)
public ResponseEntity<ApiResponse<Void>> handle(RateLimitExceededException e) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()))
        .body(ApiResponse.fail("RATE_LIMITED",
              "요청이 너무 잦습니다. " + e.getRetryAfterSeconds() + "초 후 다시 시도해 주세요."));
}
```
フロントは `Retry-After` ヘッダーに基づいて自動再試行またはカウントダウン表示を行う。

### 2-7. クライアント IP 抽出の注意
ALB/CloudFront などのプロキシの背後では `request.getRemoteAddr()` はプロキシ IP だ。必ず `X-Forwarded-For` の先頭 IP を信頼チェーンに従って抽出する。
```java
private String extractClientIp(HttpServletRequest req) {
    String[] headers = {"X-Forwarded-For", "X-Real-IP", "CF-Connecting-IP"};
    for (String h : headers) {
        String v = req.getHeader(h);
        if (v != null && !v.isBlank()) return v.split(",")[0].trim();
    }
    return req.getRemoteAddr();
}
```
ALB は `X-Forwarded-For` のみ信頼。CloudFront は `X-Forwarded-For` + `CF-Connecting-IP`。社内インフラ構成に合わせてホワイトリスト方式の信頼プロキシ IP 一覧を運用する。

### 2-8. モニタリング
Bucket4j はメトリクスを公開する。Micrometer で Prometheus に連携:
```java
@Bean
public Bucket4jMetricsBinder metrics() {
    return new Bucket4jMetricsBinder();
}
```
ダッシュボードでポリシー別の遮断率（`rate_limit_blocked_total` / `rate_limit_consumed_total`）をモニタリング。5% を超えたらポリシー緩和を検討する。

## 3. よくある誤り（絶対にやってはいけないこと）
- ❌ in-memory `Map<String, Bucket>` の使用 — 複数インスタンスでポリシーを回避可能。
- ❌ `request.getRemoteAddr()` のみ使用 — プロキシの背後ですべてのユーザーが同じ IP。
- ❌ ポリシーを controller ごとにハードコーディング — enum で中央管理する。
- ❌ 429 レスポンスに `Retry-After` ヘッダーが欠落 — クライアントがバックオフできない。
- ❌ 認証失敗カウンターを Rate Limit と混同 — 認証ロックは別（セキュリティカテゴリ）、Rate Limit はトラフィック制御。

## 4. チェックリスト
- [ ] Token Bucket（Bucket4j）で実装したか
- [ ] Redis バックエンドでインスタンス間の上限を共有するか
- [ ] エンドポイント別ポリシーを enum で中央管理するか
- [ ] アノテーション（@RateLimit）で適用したか
- [ ] 429 + Retry-After ヘッダーを返すか
- [ ] X-Forwarded-For で実際のクライアント IP を抽出するか
- [ ] ポリシー別の遮断率をモニタリングするか
