---
name: Rate Limiting (Bucket4j + Redis)
description: A standard for consistently implementing IP/user-based API throttling in a distributed environment in Spring Boot. Covers Bucket4j + Redis token bucket, per-endpoint policy, and 429 + Retry-After responses. Read this when launching a public API or blocking login brute-force, bots, and spam. Keywords: bucket4j, RateLimit, Bucket, Refill, Bandwidth, tooManyRequests, 429, throttling.
rules:
  - "Implement API throttling with the Bucket4j token bucket algorithm."
  - "In a distributed environment, use Redis as the bucket store to share limits across instances (no in-memory Map)."
  - "Define limit policies per endpoint and apply them via annotation (centrally managed with enum)."
  - "On limit exceedance, signal the retry time with a 429 status and a Retry-After header."
  - "Extract the client IP from the first value of X-Forwarded-For based on a trusted proxy."
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

> Login brute-force, signup bots, friend-invite spam — these attacks come the moment an API is exposed. If you have even a single public API, Rate Limiting is mandatory before launch. Read this when building a new public endpoint or deciding a throttling policy.
>
> Related skills:
> - Security authentication: [security-backend](../../security/security-backend/SKILL.md)
> - Caching: [redis-cache](../redis-cache/SKILL.md)
> - Logging: [logging-observability](../logging-observability/SKILL.md)

## 1. Core Principles
- Implement API throttling with the Bucket4j token bucket algorithm.
- In a distributed environment, use Redis as the bucket store to share limits across instances (no in-memory Map).
- Define limit policies per endpoint and apply them via annotation (centrally managed with enum).
- On limit exceedance, signal the retry time with a 429 status and a Retry-After header.
- Extract the client IP from the first value of X-Forwarded-For based on a trusted proxy.

## 2. Rules

### 2-1. Algorithm Selection
| Algorithm | Pros | Cons | Recommended |
|---|---|---|---|
| Fixed Window | Simple | Allows 2x traffic at the window boundary | ❌ |
| Sliding Window | Accurate | Memory/compute cost | △ |
| **Token Bucket** | **Allows bursts + average control** | **Slightly complex** | **✅ Recommended** |
| Leaky Bucket | Smooth throttle | No bursts allowed | △ |

Bucket4j is a token bucket implementation. It normally allows bursts and limits only the average rate, so it does not harm the normal user experience.

### 2-2. Dependencies
```gradle
implementation 'com.bucket4j:bucket4j-core:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-redis-common:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-lettuce:8.10.1'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-3. Policy Definition (centrally managed with enum)
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

### 2-4. Redis Backend Configuration (sharing limits across the cluster)
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

### 2-5. Annotation-based Application (recommended)
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

### 2-6. 429 Response Format + Retry-After
```java
@ExceptionHandler(RateLimitExceededException.class)
public ResponseEntity<ApiResponse<Void>> handle(RateLimitExceededException e) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()))
        .body(ApiResponse.fail("RATE_LIMITED",
              "요청이 너무 잦습니다. " + e.getRetryAfterSeconds() + "초 후 다시 시도해 주세요."));
}
```
The frontend either auto-retries based on the `Retry-After` header or shows a countdown.

### 2-7. Cautions on Client IP Extraction
Behind a proxy like ALB/CloudFront, `request.getRemoteAddr()` is the proxy IP. You must extract the first `X-Forwarded-For` IP according to the trust chain.
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
ALB trusts only `X-Forwarded-For`. CloudFront uses `X-Forwarded-For` + `CF-Connecting-IP`. Operate a whitelist of trusted proxy IPs according to your internal infrastructure configuration.

### 2-8. Monitoring
Bucket4j exposes metrics. Integrate with Prometheus via Micrometer:
```java
@Bean
public Bucket4jMetricsBinder metrics() {
    return new Bucket4jMetricsBinder();
}
```
Monitor the per-policy block rate (`rate_limit_blocked_total` / `rate_limit_consumed_total`) on the dashboard. Consider relaxing the policy if it exceeds 5%.

## 3. Common Mistakes (Things You Must Never Do)
- ❌ Using an in-memory `Map<String, Bucket>` — the policy can be bypassed across multiple instances.
- ❌ Using only `request.getRemoteAddr()` — behind a proxy all users have the same IP.
- ❌ Hardcoding the policy in each controller — manage it centrally with enum.
- ❌ Omitting the `Retry-After` header in the 429 response — the client cannot back off.
- ❌ Confusing the authentication-failure counter with Rate Limit — auth lockout is separate (security category); Rate Limit is traffic control.

## 4. Checklist
- [ ] Did you implement it with Token Bucket (Bucket4j)?
- [ ] Do you share limits across instances with a Redis backend?
- [ ] Do you manage per-endpoint policy centrally with enum?
- [ ] Did you apply it with an annotation (@RateLimit)?
- [ ] Do you return the 429 + Retry-After header?
- [ ] Do you extract the real client IP via X-Forwarded-For?
- [ ] Do you monitor the per-policy block rate?
