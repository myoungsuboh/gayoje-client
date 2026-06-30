---
name: Rate Limiting (Bucket4j + Redis)
description: Spring Boot에서 IP/사용자 기반 API throttling을 분산 환경에서 일관되게 구현하는 표준. Bucket4j + Redis token bucket, 엔드포인트별 정책, 429 + Retry-After 응답을 다룬다. 공개 API를 출시하거나 로그인 무차별 대입·봇·스팸을 막을 때 읽는다. 키워드: bucket4j, RateLimit, Bucket, Refill, Bandwidth, tooManyRequests, 429, throttling.
rules:
  - "API throttling은 Bucket4j 토큰 버킷 알고리즘으로 구현한다."
  - "분산 환경에서는 Redis를 버킷 저장소로 사용해 인스턴스 간 한도를 공유한다(in-memory Map 금지)."
  - "한도 정책은 엔드포인트별로 정의하고 어노테이션으로 적용한다(enum 중앙 관리)."
  - "한도 초과 시 429 상태와 Retry-After 헤더로 재시도 시각을 알린다."
  - "클라이언트 IP는 X-Forwarded-For의 첫 값을 신뢰 가능한 프록시 기준으로 추출한다."
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

> 로그인 무차별 대입, 회원가입 봇, 친구 초대 스팸 — API 노출 즉시 들어오는 공격이다. 공개 API가 한 개라도 있으면 Rate Limiting은 출시 전 필수. 새 공개 엔드포인트를 만들거나 throttling 정책을 정할 때 읽는다.
>
> 관련 스킬:
> - 보안 인증: [security-backend](../../security/security-backend/SKILL.md)
> - 캐싱: [redis-cache](../redis-cache/SKILL.md)
> - 로깅: [logging-observability](../logging-observability/SKILL.md)

## 1. 핵심 원칙
- API throttling은 Bucket4j 토큰 버킷 알고리즘으로 구현한다.
- 분산 환경에서는 Redis를 버킷 저장소로 사용해 인스턴스 간 한도를 공유한다(in-memory Map 금지).
- 한도 정책은 엔드포인트별로 정의하고 어노테이션으로 적용한다(enum 중앙 관리).
- 한도 초과 시 429 상태와 Retry-After 헤더로 재시도 시각을 알린다.
- 클라이언트 IP는 X-Forwarded-For의 첫 값을 신뢰 가능한 프록시 기준으로 추출한다.

## 2. 규칙

### 2-1. 알고리즘 선택
| 알고리즘 | 장점 | 단점 | 권장 |
|---|---|---|---|
| Fixed Window | 단순 | 윈도우 경계에서 2배 트래픽 허용 | ❌ |
| Sliding Window | 정확 | 메모리/연산 비용 | △ |
| **Token Bucket** | **버스트 허용 + 평균 제어** | **약간 복잡** | **✅ 권장** |
| Leaky Bucket | 부드러운 throttle | 버스트 미허용 | △ |

Bucket4j는 token bucket 구현. 평소엔 버스트 허용하고 평균 속도만 제한해 정상 사용자 경험을 해치지 않는다.

### 2-2. 의존성
```gradle
implementation 'com.bucket4j:bucket4j-core:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-redis-common:8.10.1'
implementation 'com.bucket4j:bucket4j_jdk17-lettuce:8.10.1'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-3. 정책 정의 (enum 중앙 관리)
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

### 2-4. Redis 백엔드 구성 (분산 한도 공유)
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

### 2-5. 어노테이션 기반 적용 (권장)
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

### 2-6. 429 응답 포맷 + Retry-After
```java
@ExceptionHandler(RateLimitExceededException.class)
public ResponseEntity<ApiResponse<Void>> handle(RateLimitExceededException e) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()))
        .body(ApiResponse.fail("RATE_LIMITED",
              "요청이 너무 잦습니다. " + e.getRetryAfterSeconds() + "초 후 다시 시도해 주세요."));
}
```
프론트는 `Retry-After` 헤더 기반으로 자동 재시도 또는 카운트다운 표시.

### 2-7. 클라이언트 IP 추출 주의
ALB/CloudFront 등 프록시 뒤에서는 `request.getRemoteAddr()`가 프록시 IP다. 반드시 `X-Forwarded-For` 첫 번째 IP를 신뢰 사슬에 따라 추출한다.
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
ALB는 `X-Forwarded-For`만 신뢰. CloudFront는 `X-Forwarded-For` + `CF-Connecting-IP`. 사내 인프라 구성에 맞춰 화이트리스트 신뢰 프록시 IP 목록 운영.

### 2-8. 모니터링
Bucket4j는 메트릭을 노출한다. Micrometer로 Prometheus에 연동:
```java
@Bean
public Bucket4jMetricsBinder metrics() {
    return new Bucket4jMetricsBinder();
}
```
대시보드에서 정책별 차단율(`rate_limit_blocked_total` / `rate_limit_consumed_total`) 모니터링. 5% 초과 시 정책 완화 검토.

## 3. 흔한 실수 (절대 하면 안 되는 것)
- ❌ in-memory `Map<String, Bucket>` 사용 — 다중 인스턴스에서 정책 우회 가능.
- ❌ `request.getRemoteAddr()`만 사용 — 프록시 뒤에서 모든 사용자가 같은 IP.
- ❌ 정책을 controller마다 하드코딩 — enum 중앙 관리.
- ❌ 429 응답에 `Retry-After` 헤더 누락 — 클라이언트가 백오프 못 함.
- ❌ 인증 실패 카운터를 Rate Limit과 혼동 — 인증 잠금은 별도(보안 카테고리), Rate Limit은 트래픽 제어.

## 4. 체크리스트
- [ ] Token Bucket(Bucket4j)으로 구현했는가
- [ ] Redis 백엔드로 인스턴스 간 한도를 공유하는가
- [ ] 엔드포인트별 정책을 enum으로 중앙 관리하는가
- [ ] 어노테이션(@RateLimit)으로 적용했는가
- [ ] 429 + Retry-After 헤더를 반환하는가
- [ ] X-Forwarded-For로 실제 클라이언트 IP를 추출하는가
- [ ] 정책별 차단율을 모니터링하는가
