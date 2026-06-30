---
name: Rate Limiting (Bucket4j + Redis)
description: 在 Spring Boot 中于分布式环境下一致地实现基于 IP/用户的 API 限流的标准。涉及 Bucket4j + Redis token bucket、按端点的策略、429 + Retry-After 响应。在发布公开 API 或阻止登录暴力破解・机器人・垃圾信息时阅读。关键词: bucket4j, RateLimit, Bucket, Refill, Bandwidth, tooManyRequests, 429, throttling。
rules:
  - "API 限流用 Bucket4j 令牌桶算法实现。"
  - "分布式环境中使用 Redis 作为桶存储，在实例间共享限额（禁止 in-memory Map）。"
  - "限额策略按端点定义并以注解应用（用 enum 集中管理）。"
  - "超出限额时以 429 状态和 Retry-After 头告知重试时间。"
  - "客户端 IP 以可信代理为基准，从 X-Forwarded-For 的首个值提取。"
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

> 登录暴力破解、注册机器人、好友邀请垃圾信息 — 这些都是 API 一旦暴露就会涌入的攻击。只要有一个公开 API，Rate Limiting 就是发布前的必备项。在构建新的公开端点或确定限流策略时阅读。
>
> 相关技能:
> - 安全认证: [security-backend](../../security/security-backend/SKILL.md)
> - 缓存: [redis-cache](../redis-cache/SKILL.md)
> - 日志: [logging-observability](../logging-observability/SKILL.md)

## 1. 核心原则
- API 限流用 Bucket4j 令牌桶算法实现。
- 分布式环境中使用 Redis 作为桶存储，在实例间共享限额（禁止 in-memory Map）。
- 限额策略按端点定义并以注解应用（用 enum 集中管理）。
- 超出限额时以 429 状态和 Retry-After 头告知重试时间。
- 客户端 IP 以可信代理为基准，从 X-Forwarded-For 的首个值提取。

## 2. 规则

### 2-1. 算法选择
| 算法 | 优点 | 缺点 | 推荐 |
|---|---|---|---|
| Fixed Window | 简单 | 窗口边界处允许 2 倍流量 | ❌ |
| Sliding Window | 精确 | 内存/计算成本 | △ |
| **Token Bucket** | **允许突发 + 平均控制** | **略复杂** | **✅ 推荐** |
| Leaky Bucket | 平滑限流 | 不允许突发 | △ |

Bucket4j 是 token bucket 实现。平时允许突发，仅限制平均速率，不损害正常用户体验。

### 2-2. 依赖
```gradle
implementation 'com.bucket4j:bucket4j-core:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-redis-common:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-lettuce:8.10.1'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-3. 策略定义 (用 enum 集中管理)
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

### 2-4. Redis 后端配置 (共享分布式限额)
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

### 2-5. 基于注解的应用 (推荐)
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

### 2-6. 429 响应格式 + Retry-After
```java
@ExceptionHandler(RateLimitExceededException.class)
public ResponseEntity<ApiResponse<Void>> handle(RateLimitExceededException e) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()))
        .body(ApiResponse.fail("RATE_LIMITED",
              "요청이 너무 잦습니다. " + e.getRetryAfterSeconds() + "초 후 다시 시도해 주세요."));
}
```
前端基于 `Retry-After` 头进行自动重试或显示倒计时。

### 2-7. 客户端 IP 提取注意事项
在 ALB/CloudFront 等代理之后，`request.getRemoteAddr()` 是代理 IP。务必按信任链提取 `X-Forwarded-For` 的首个 IP。
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
ALB 仅信任 `X-Forwarded-For`。CloudFront 使用 `X-Forwarded-For` + `CF-Connecting-IP`。按内部基础设施配置运行白名单可信代理 IP 列表。

### 2-8. 监控
Bucket4j 暴露指标。通过 Micrometer 接入 Prometheus:
```java
@Bean
public Bucket4jMetricsBinder metrics() {
    return new Bucket4jMetricsBinder();
}
```
在仪表盘上监控按策略的拦截率（`rate_limit_blocked_total` / `rate_limit_consumed_total`）。超过 5% 时考虑放宽策略。

## 3. 常见错误（绝对不能做的事）
- ❌ 使用 in-memory `Map<String, Bucket>` — 在多实例下可绕过策略。
- ❌ 仅使用 `request.getRemoteAddr()` — 在代理之后所有用户都是同一 IP。
- ❌ 在每个 controller 硬编码策略 — 用 enum 集中管理。
- ❌ 429 响应缺少 `Retry-After` 头 — 客户端无法退避。
- ❌ 把认证失败计数器与 Rate Limit 混淆 — 认证锁定是另一回事（安全类别），Rate Limit 是流量控制。

## 4. 检查清单
- [ ] 是否用 Token Bucket（Bucket4j）实现
- [ ] 是否用 Redis 后端在实例间共享限额
- [ ] 是否用 enum 集中管理按端点的策略
- [ ] 是否用注解（@RateLimit）应用
- [ ] 是否返回 429 + Retry-After 头
- [ ] 是否通过 X-Forwarded-For 提取真实客户端 IP
- [ ] 是否监控按策略的拦截率
