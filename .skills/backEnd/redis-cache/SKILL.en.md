---
name: Redis Caching Strategy
description: Redis cache design standard — key naming, TTL management, Cache-Aside pattern, serving real-time sensor data via Hash, serving AI anomaly scores, handling connection failures when local Redis is not running. Read this when adding a new cache, deciding keys/TTLs, or dealing with Redis connection errors. Keywords: redis, RedisTemplate, @Cacheable, @CacheEvict, Lettuce, spring-data-redis, RedisConnectionFailureException, Cache-Aside.
rules:
  - "Name cache keys in the {service}:{domain}:{identifier} format and separate namespaces with a colon (:)."
  - "Set different TTLs per data characteristic — short for real-time sensors, long for static data. Without a TTL, memory keeps piling up."
  - "Use the Cache-Aside pattern: on a cache miss, query the DB and then populate the cache."
  - "On a Redis connection failure, catch the exception and keep the service alive with a DB fallback."
  - "Store real-time sensor data in a Hash structure so it can be updated field by field."
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

# 🗄️ Redis Caching Strategy

> Unify the keys, TTLs, and patterns of the Redis cache, and keep the service alive even during a Redis outage. Read this when adding a new cache or dealing with Redis connection errors.

## 1. Core Principles
- Name cache keys in the `{service}:{domain}:{identifier}` format and separate namespaces with a colon (`:`).
- Set different TTLs per data characteristic — short for real-time sensors, long for static data. Without a TTL, memory keeps piling up.
- Use the Cache-Aside pattern: on a cache miss, query the DB and then populate the cache.
- On a Redis connection failure, catch the exception and keep the service alive with a DB fallback.
- Store real-time sensor data in a Hash structure so it can be updated field by field.

## 2. Rules

### 2-1. Key Naming Rules
A Redis key is formatted as `{service}:{domain}:{identifier}` and separated by colons (`:`). It should be clear at a glance what data it holds.

```
harness:sensor:realtime:{sensorId}         → latest real-time value of a sensor
harness:sensor:deck:{deckId}               → full list of sensors for a Deck
harness:anomaly:score:{sensorId}           → AI anomaly score per sensor
harness:asset:detail:{tagId}               → asset detail info cache
harness:lock:status:{processBlockId}       → control-authority Lock status
harness:dashboard:summary:{projectId}      → dashboard summary cache
```

### 2-2. TTL (Expiration Time) Criteria
Set different TTLs according to data characteristics. Always set a TTL, because without one memory keeps piling up.

| Data | TTL | Notes |
|---|---|---|
| Real-time sensor value | 30s | Frequently updated data |
| AI anomaly score | 60s | Matches the inference cycle |
| Asset detail info | 10min | Rarely changing data |
| Dashboard summary | 30s | Aggregated data |
| Control-authority Lock status | none | Deleted only on explicit release |

### 2-3. Caching Real-Time Sensor Data (Hash Structure)
When storing/retrieving multiple sensor values per Deck at once, use a Hash. With a Hash you can fetch an entire Deck in a single command.

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorCacheService {

    private final StringRedisTemplate redisTemplate;
    private static final String SENSOR_HASH_KEY = "harness:sensor:deck:";
    private static final Duration TTL = Duration.ofSeconds(30);

    // Store sensor data (stored per sensorId in a Hash field)
    public void saveSensorValue(String deckId, String sensorId, Double value) {
        String hashKey = SENSOR_HASH_KEY + deckId;
        String fieldValue = String.valueOf(value) + ":" + Instant.now().toEpochMilli();

        redisTemplate.opsForHash().put(hashKey, sensorId, fieldValue);
        redisTemplate.expire(hashKey, TTL); // refresh TTL

        log.debug("[cache save] deck={}, sensor={}, value={}", deckId, sensorId, value);
    }

    // Fetch the latest values of all sensors in a Deck at once
    public Map<Object, Object> getDeckSensors(String deckId) {
        return redisTemplate.opsForHash().entries(SENSOR_HASH_KEY + deckId);
    }

    // Fetch a single sensor value
    public Optional<Double> getSensorValue(String deckId, String sensorId) {
        Object raw = redisTemplate.opsForHash().get(SENSOR_HASH_KEY + deckId, sensorId);
        if (raw == null) return Optional.empty();

        String valueStr = raw.toString().split(":")[0];
        return Optional.of(Double.parseDouble(valueStr));
    }
}
```

### 2-4. Cache-Aside Pattern (the most basic caching approach)
This is the pattern of checking the cache before querying the DB, and if absent, fetching from the DB and then storing it in the cache.

```java
public AssetResponse getAsset(String tagId) {
    String cacheKey = "harness:asset:detail:" + tagId;

    // 1. Check the cache first
    String cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        log.debug("[cache HIT] key={}", cacheKey);
        return objectMapper.readValue(cached, AssetResponse.class);
    }

    // 2. If not cached, query the DB
    log.debug("[cache MISS] key={}, starting DB query", cacheKey);
    AssetResponse response = assetRepository.findByTagId(tagId)
        .map(AssetResponse::from)
        .orElseThrow(() -> new BusinessException("NOT_FOUND", "Asset not found."));

    // 3. Store in the cache (10-minute TTL)
    redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(response), Duration.ofMinutes(10));

    return response;
}

// On data change, delete the cache (the next query fetches fresh data from the DB)
public void updateAsset(String tagId, AssetUpdateRequest request) {
    assetRepository.update(tagId, request);
    redisTemplate.delete("harness:asset:detail:" + tagId); // cache invalidation
}
```

### 2-5. Serving AI Anomaly Scores
This is the pattern of storing AI inference results in Redis and pulling them directly into the dashboard.

```java
// Store in Redis after inference completes in the AI service
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

// Fast lookup from the dashboard
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

### 2-6. `RedisConnectionFailureException` — Error When Local Redis Is Not Running
If you start Spring Boot in a local dev environment with Redis not running, a 500 error occurs on service calls.

```
RedisConnectionFailureException: Unable to connect to Redis
  Caused by: RedisConnectionException: Unable to connect to localhost/<unresolved>:6379
    Caused by: ConnectException: Connection refused: getsockopt: localhost/127.0.0.1:6379
```

Error flow:
```
Controller → Service.getModelMetadata()
  → redisTemplate.execute()
    → Lettuce → localhost:6379 → Connection refused
      → RedisConnectionFailureException
        → 500 INTERNAL_SERVER_ERROR
```

✅ Solution 1 — Catch the exception in the service and fall back to the DB (recommended). Wrap with try-catch so a Redis outage does not cause the whole request to fail.

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class ModelMetadataService {

    private final RedisTemplate<String, String> redisTemplate;
    private final ModelMetadataDao modelMetadataDao;  // DB fallback

    public ModelMetadataDto getModelMetadata(String modelId) {
        String cacheKey = "harness:model:meta:" + modelId;

        // Attempt cache lookup — the service keeps working even if Redis connection fails
        try {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                return objectMapper.readValue(cached, ModelMetadataDto.class);
            }
        } catch (Exception e) {
            log.warn("[Redis connection failed] ignoring cache and querying DB: {}", e.getMessage());
        }

        // Query directly from the DB (fallback)
        ModelMetadataDto dto = modelMetadataDao.selectByModelId(modelId);

        // Attempt to store in Redis — the response returns normally even on failure
        try {
            redisTemplate.opsForValue().set(
                cacheKey,
                objectMapper.writeValueAsString(dto),
                Duration.ofMinutes(10)
            );
        } catch (Exception e) {
            log.warn("[Redis cache save failed] key={}: {}", cacheKey, e.getMessage());
        }

        return dto;
    }
}
```

✅ Solution 2 — Disable the Redis cache in the local profile. Setting the cache type to `none` in `application-local.yml` allows startup without Redis.

```yaml
# application-local.yml
spring:
  cache:
    type: none   # disable cache locally (can start without Redis)

  # If you want to turn off the Redis connection itself, add the following (exclude RedisAutoConfiguration)
  autoconfigure:
    exclude:
      - org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
      - org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration
```

> `spring.cache.type=none` alone causes the `@Cacheable` and `@CacheEvict` annotations to be ignored, so it works without Redis. However, code that injects and uses `RedisTemplate` directly needs to be handled separately.

✅ Solution 3 — Conditionally register the Redis bean with `@ConditionalOnProperty`. Control whether Redis is used via an `application.yml` property.

```yaml
# application-local.yml
app:
  cache:
    redis-enabled: false   # false during local development

# application-prod.yml
app:
  cache:
    redis-enabled: true    # true in production
```

```java
@Configuration
public class CacheConfig {

    // Activate the RedisTemplate bean only when redis-enabled: true
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

    // Not injected in an environment where Redis is disabled, so receive it as Optional
    @Autowired(required = false)
    private RedisTemplate<String, String> redisTemplate;

    public void saveSensorValue(String deckId, String sensorId, Double value) {
        if (redisTemplate == null) {
            log.debug("[Redis disabled] skipping cache save: deck={}", deckId);
            return;
        }
        // Redis usage logic
        redisTemplate.opsForHash().put("harness:sensor:deck:" + deckId, sensorId, String.valueOf(value));
    }
}
```

✅ Solution 4 — Configure the Lettuce connection timeout (prevents startup delay). In an environment without Redis, the default Lettuce timeout is very long and can slow down startup.

```yaml
# application.yml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      timeout: 1000ms           # shorten the connection timeout to 1 second
      connect-timeout: 1000ms   # socket connection timeout
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 0
          max-wait: 500ms        # pool wait timeout
```

## 3. Common Mistakes
- Not setting a TTL, so memory piles up indefinitely.
- Not picking **just one** Redis outage strategy, and using both the try-catch fallback (graceful degradation) and `spring.cache.type=none` (fully disabling the cache) at the same time.
- Forgetting to invalidate (delete) the cache on data change, so stale data keeps being served.
- Not separating key namespaces with colons, making it impossible to track which data is which.

## 4. Checklist
- [ ] Did you name the cache key in the `{service}:{domain}:{identifier}` format?
- [ ] Did you set a TTL per data characteristic (is a key without a TTL intentional)?
- [ ] Did you invalidate (delete) the cache on data change?
- [ ] Does the DB fallback work on a Redis connection failure?
- [ ] Did you pick just one Redis outage strategy (try-catch fallback or cache.type=none)?
- [ ] Can it start locally without Redis (cache.type=none or exclude)?
