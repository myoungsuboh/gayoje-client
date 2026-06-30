---
name: Redis 캐싱 전략
description: Redis 캐시 설계 표준 — Key 네이밍, TTL 관리, Cache-Aside 패턴, 실시간 센서 데이터 Hash 서빙, AI 이상 점수 서빙, 로컬 Redis 미실행 시 연결 실패 처리. 캐시를 새로 붙이거나 키·TTL을 정할 때, Redis 연결 오류를 다룰 때 읽는다. 키워드: redis, RedisTemplate, @Cacheable, @CacheEvict, Lettuce, spring-data-redis, RedisConnectionFailureException, Cache-Aside.
rules:
  - "캐시 키는 {서비스}:{도메인}:{식별자} 형식으로 짓고 콜론(:)으로 네임스페이스를 구분한다."
  - "데이터 성격별로 TTL을 다르게 설정한다 — 실시간 센서는 짧게, 정적 데이터는 길게. TTL 없으면 메모리가 계속 쌓인다."
  - "Cache-Aside 패턴으로 캐시 미스 시 DB 조회 후 캐시에 채운다."
  - "Redis 연결 실패 시 예외를 잡아 DB fallback으로 서비스를 유지한다."
  - "실시간 센서 데이터는 Hash 구조로 저장해 필드 단위로 갱신한다."
tags:
  - "redis"
  - "RedisTemplate"
  - "@Cacheable"
  - "@CacheEvict"
  - "Lettuce"
  - "spring-data-redis"
  - "RedisConnectionFailureException"
  - "Cache-Aside"
---

# 🗄️ Redis 캐싱 전략

> Redis 캐시의 키·TTL·패턴을 통일하고, Redis 장애에도 서비스를 유지한다. 캐시를 새로 붙이거나 Redis 연결 오류를 다룰 때 읽는다.

## 1. 핵심 원칙
- 캐시 키는 `{서비스}:{도메인}:{식별자}` 형식으로 짓고 콜론(`:`)으로 네임스페이스를 구분한다.
- 데이터 성격별로 TTL을 다르게 설정한다 — 실시간 센서는 짧게, 정적 데이터는 길게. TTL 없으면 메모리가 계속 쌓인다.
- Cache-Aside 패턴으로 캐시 미스 시 DB 조회 후 캐시에 채운다.
- Redis 연결 실패 시 예외를 잡아 DB fallback으로 서비스를 유지한다.
- 실시간 센서 데이터는 Hash 구조로 저장해 필드 단위로 갱신한다.

## 2. 규칙

### 2-1. Key 네이밍 규칙
Redis Key는 `{서비스}:{도메인}:{식별자}` 형식으로 콜론(`:`)으로 구분한다. 한 눈에 어떤 데이터인지 알 수 있어야 한다.

```
harness:sensor:realtime:{sensorId}         → 센서 최신 실시간 값
harness:sensor:deck:{deckId}               → Deck 전체 센서 목록
harness:anomaly:score:{sensorId}           → 센서별 AI 이상 점수
harness:asset:detail:{tagId}               → 자산 상세 정보 캐시
harness:lock:status:{processBlockId}       → 제어권 Lock 상태
harness:dashboard:summary:{projectId}      → 대시보드 요약 캐시
```

### 2-2. TTL (만료 시간) 설정 기준
데이터 특성에 따라 TTL을 다르게 설정한다. TTL이 없으면 메모리가 계속 쌓이니 반드시 설정한다.

| 데이터 | TTL | 비고 |
|---|---|---|
| 실시간 센서 값 | 30초 | 자주 갱신되는 데이터 |
| AI 이상 점수 | 60초 | 추론 주기에 맞춤 |
| 자산 상세 정보 | 10분 | 잘 안 바뀌는 데이터 |
| 대시보드 요약 | 30초 | 집계 데이터 |
| 제어권 Lock 상태 | 없음 | 명시적으로 해제할 때만 삭제 |

### 2-3. 실시간 센서 데이터 캐싱 (Hash 구조)
Deck 단위로 여러 센서 값을 한 번에 저장/조회할 때는 Hash를 사용한다. Hash를 쓰면 Deck 전체를 한 번의 명령으로 가져올 수 있다.

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorCacheService {

    private final StringRedisTemplate redisTemplate;
    private static final String SENSOR_HASH_KEY = "harness:sensor:deck:";
    private static final Duration TTL = Duration.ofSeconds(30);

    // 센서 데이터 저장 (Hash 필드에 sensorId 별로 저장)
    public void saveSensorValue(String deckId, String sensorId, Double value) {
        String hashKey = SENSOR_HASH_KEY + deckId;
        String fieldValue = String.valueOf(value) + ":" + Instant.now().toEpochMilli();

        redisTemplate.opsForHash().put(hashKey, sensorId, fieldValue);
        redisTemplate.expire(hashKey, TTL); // TTL 갱신

        log.debug("[캐시 저장] deck={}, sensor={}, value={}", deckId, sensorId, value);
    }

    // Deck의 전체 센서 최신값 한 번에 조회
    public Map<Object, Object> getDeckSensors(String deckId) {
        return redisTemplate.opsForHash().entries(SENSOR_HASH_KEY + deckId);
    }

    // 단일 센서 값 조회
    public Optional<Double> getSensorValue(String deckId, String sensorId) {
        Object raw = redisTemplate.opsForHash().get(SENSOR_HASH_KEY + deckId, sensorId);
        if (raw == null) return Optional.empty();

        String valueStr = raw.toString().split(":")[0];
        return Optional.of(Double.parseDouble(valueStr));
    }
}
```

### 2-4. Cache-Aside 패턴 (가장 기본적인 캐싱 방식)
DB 조회 전에 먼저 캐시를 확인하고, 없으면 DB에서 가져온 뒤 캐시에 저장하는 패턴이다.

```java
public AssetResponse getAsset(String tagId) {
    String cacheKey = "harness:asset:detail:" + tagId;

    // 1. 캐시 먼저 확인
    String cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        log.debug("[캐시 HIT] key={}", cacheKey);
        return objectMapper.readValue(cached, AssetResponse.class);
    }

    // 2. 캐시 없으면 DB에서 조회
    log.debug("[캐시 MISS] key={}, DB 조회 시작", cacheKey);
    AssetResponse response = assetRepository.findByTagId(tagId)
        .map(AssetResponse::from)
        .orElseThrow(() -> new BusinessException("NOT_FOUND", "자산을 찾을 수 없습니다."));

    // 3. 캐시에 저장 (10분 TTL)
    redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(response), Duration.ofMinutes(10));

    return response;
}

// 데이터 변경 시 캐시 삭제 (다음 조회 때 DB에서 최신 데이터를 가져옴)
public void updateAsset(String tagId, AssetUpdateRequest request) {
    assetRepository.update(tagId, request);
    redisTemplate.delete("harness:asset:detail:" + tagId); // 캐시 무효화
}
```

### 2-5. AI 이상 점수 서빙
AI 추론 결과를 Redis에 저장하고, 대시보드에서 바로 꺼내 쓰는 패턴이다.

```java
// AI 서비스에서 추론 완료 후 Redis에 저장
public void saveAnomalyScore(String sensorId, double score, String status) {
    String key = "harness:anomaly:score:" + sensorId;
    Map<String, String> data = Map.of(
        "score", String.valueOf(score),
        "status", status,            // "NORMAL", "WARNING", "CRITICAL"
        "updatedAt", Instant.now().toString()
    );
    redisTemplate.opsForHash().putAll(key, data);
    redisTemplate.expire(key, Duration.ofSeconds(60));
}

// 대시보드에서 빠르게 조회
public AnomalyStatus getAnomalyStatus(String sensorId) {
    Map<Object, Object> data = redisTemplate.opsForHash()
        .entries("harness:anomaly:score:" + sensorId);

    if (data.isEmpty()) return AnomalyStatus.unknown();

    return AnomalyStatus.builder()
        .score(Double.parseDouble((String) data.get("score")))
        .status((String) data.get("status"))
        .build();
}
```

### 2-6. `RedisConnectionFailureException` — 로컬 Redis 미실행 오류
로컬 개발 환경에서 Redis가 실행되지 않은 채 Spring Boot를 기동하면 서비스 호출 시 500 에러 발생.

```
RedisConnectionFailureException: Unable to connect to Redis
  Caused by: RedisConnectionException: Unable to connect to localhost/<unresolved>:6379
    Caused by: ConnectException: Connection refused: getsockopt: localhost/127.0.0.1:6379
```

오류 흐름:
```
Controller → Service.getModelMetadata()
  → redisTemplate.execute()
    → Lettuce → localhost:6379 → Connection refused
      → RedisConnectionFailureException
        → 500 INTERNAL_SERVER_ERROR
```

✅ 해결책 1 — 서비스에서 예외 캐치 후 DB fallback (권장). Redis 장애가 전체 요청 실패로 이어지지 않도록 try-catch로 감싼다.

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class ModelMetadataService {

    private final RedisTemplate<String, String> redisTemplate;
    private final ModelMetadataDao modelMetadataDao;  // DB fallback

    public ModelMetadataDto getModelMetadata(String modelId) {
        String cacheKey = "harness:model:meta:" + modelId;

        // 캐시 조회 시도 — Redis 연결 실패해도 서비스 계속 동작
        try {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                return objectMapper.readValue(cached, ModelMetadataDto.class);
            }
        } catch (Exception e) {
            log.warn("[Redis 연결 실패] 캐시 무시하고 DB 조회: {}", e.getMessage());
        }

        // DB에서 직접 조회 (fallback)
        ModelMetadataDto dto = modelMetadataDao.selectByModelId(modelId);

        // Redis 저장 시도 — 실패해도 응답은 정상 반환
        try {
            redisTemplate.opsForValue().set(
                cacheKey,
                objectMapper.writeValueAsString(dto),
                Duration.ofMinutes(10)
            );
        } catch (Exception e) {
            log.warn("[Redis 캐시 저장 실패] key={}: {}", cacheKey, e.getMessage());
        }

        return dto;
    }
}
```

✅ 해결책 2 — 로컬 프로파일에서 Redis 캐시 비활성화. `application-local.yml`에서 캐시 타입을 `none`으로 설정하면 Redis 없이도 기동 가능하다.

```yaml
# application-local.yml
spring:
  cache:
    type: none   # 로컬에서는 캐시 비활성화 (Redis 없어도 기동 가능)

  # Redis 연결 자체를 끄고 싶다면 아래 추가 (RedisAutoConfiguration 제외)
  autoconfigure:
    exclude:
      - org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
      - org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration
```

> `spring.cache.type=none` 만으로도 `@Cacheable`, `@CacheEvict` 어노테이션이 무시되어 Redis 없이 동작한다. 단, `RedisTemplate`을 직접 주입해서 사용하는 코드는 별도로 처리 필요.

✅ 해결책 3 — `@ConditionalOnProperty`로 Redis 빈 조건부 등록. Redis 사용 여부를 `application.yml` 프로퍼티로 제어한다.

```yaml
# application-local.yml
app:
  cache:
    redis-enabled: false   # 로컬 개발 시 false

# application-prod.yml
app:
  cache:
    redis-enabled: true    # 운영에서는 true
```

```java
@Configuration
public class CacheConfig {

    // redis-enabled: true 일 때만 RedisTemplate 빈 활성화
    @Bean
    @ConditionalOnProperty(name = "app.cache.redis-enabled", havingValue = "true")
    public RedisCacheManager redisCacheManager(RedisConnectionFactory factory) {
        return RedisCacheManager.builder(factory)
            .cacheDefaults(
                RedisCacheConfiguration.defaultCacheConfig()
                    .entryTtl(Duration.ofMinutes(10))
            )
            .build();
    }
}
```

```java
@Service
@RequiredArgsConstructor
public class SensorCacheService {

    // Redis가 비활성화된 환경에서는 주입되지 않으므로 Optional로 받음
    @Autowired(required = false)
    private RedisTemplate<String, String> redisTemplate;

    public void saveSensorValue(String deckId, String sensorId, Double value) {
        if (redisTemplate == null) {
            log.debug("[Redis 비활성] 캐시 저장 스킵: deck={}", deckId);
            return;
        }
        // Redis 사용 로직
        redisTemplate.opsForHash().put("harness:sensor:deck:" + deckId, sensorId, String.valueOf(value));
    }
}
```

✅ 해결책 4 — Lettuce 연결 타임아웃 설정 (기동 지연 방지). Redis가 없는 환경에서 Lettuce 기본 타임아웃은 매우 길어서 기동이 느려질 수 있다.

```yaml
# application.yml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      timeout: 1000ms           # 연결 타임아웃 1초로 단축
      connect-timeout: 1000ms   # 소켓 연결 타임아웃
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 0
          max-wait: 500ms        # 풀 대기 타임아웃
```

## 3. 흔한 실수
- TTL을 안 걸어 메모리가 무한정 쌓인다.
- Redis 장애 대응 전략을 **하나만** 고르지 않고 try-catch 폴백(우아한 강등)과 `spring.cache.type=none`(캐시 완전 비활성)을 동시에 쓴다.
- 데이터 변경 시 캐시 무효화(삭제)를 빠뜨려 옛 데이터가 계속 서빙된다.
- 키 네임스페이스를 콜론으로 구분하지 않아 어떤 데이터인지 추적 불가.

## 4. 체크리스트
- [ ] 캐시 키를 `{서비스}:{도메인}:{식별자}` 형식으로 지었는가
- [ ] 데이터 성격별 TTL을 설정했는가 (TTL 없는 키는 의도적인가)
- [ ] 데이터 변경 시 캐시를 무효화(삭제)했는가
- [ ] Redis 연결 실패 시 DB fallback이 동작하는가
- [ ] Redis 장애 대응 전략을 하나만 골랐는가 (try-catch 폴백 또는 cache.type=none)
- [ ] 로컬에서 Redis 없이 기동 가능한가 (cache.type=none 또는 exclude)
