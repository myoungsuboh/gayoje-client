---
name: Redis 缓存策略
description: Redis 缓存设计标准 — Key 命名、TTL 管理、Cache-Aside 模式、实时传感器数据 Hash 服务、AI 异常分数服务、本地 Redis 未运行时的连接失败处理。在新增缓存、确定键/TTL 或处理 Redis 连接错误时阅读。关键词: redis, RedisTemplate, @Cacheable, @CacheEvict, Lettuce, spring-data-redis, RedisConnectionFailureException, Cache-Aside.
rules:
  - "缓存键以 {服务}:{域}:{标识符} 格式命名，并用冒号(:)区分命名空间。"
  - "按数据性质设置不同的 TTL — 实时传感器短、静态数据长。没有 TTL 内存会不断累积。"
  - "采用 Cache-Aside 模式，缓存未命中时查询 DB 后再写入缓存。"
  - "Redis 连接失败时捕获异常，通过 DB fallback 维持服务。"
  - "实时传感器数据用 Hash 结构存储，以便按字段单位更新。"
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

# 🗄️ Redis 缓存策略

> 统一 Redis 缓存的键、TTL 与模式，并在 Redis 故障时仍维持服务。在新增缓存或处理 Redis 连接错误时阅读。

## 1. 核心原则
- 缓存键以 `{服务}:{域}:{标识符}` 格式命名，并用冒号(`:`)区分命名空间。
- 按数据性质设置不同的 TTL — 实时传感器短、静态数据长。没有 TTL 内存会不断累积。
- 采用 Cache-Aside 模式，缓存未命中时查询 DB 后再写入缓存。
- Redis 连接失败时捕获异常，通过 DB fallback 维持服务。
- 实时传感器数据用 Hash 结构存储，以便按字段单位更新。

## 2. 规则

### 2-1. Key 命名规则
Redis Key 以 `{服务}:{域}:{标识符}` 格式用冒号(`:`)区分。应一眼就能看出是什么数据。

```
harness:sensor:realtime:{sensorId}         → 传感器最新实时值
harness:sensor:deck:{deckId}               → Deck 的全部传感器列表
harness:anomaly:score:{sensorId}           → 各传感器的 AI 异常分数
harness:asset:detail:{tagId}               → 资产详情信息缓存
harness:lock:status:{processBlockId}       → 控制权 Lock 状态
harness:dashboard:summary:{projectId}      → 仪表盘摘要缓存
```

### 2-2. TTL（过期时间）设置标准
根据数据特性设置不同的 TTL。没有 TTL 内存会不断累积，因此务必设置。

| 数据 | TTL | 备注 |
|---|---|---|
| 实时传感器值 | 30秒 | 频繁更新的数据 |
| AI 异常分数 | 60秒 | 与推理周期对齐 |
| 资产详情信息 | 10分钟 | 不常变化的数据 |
| 仪表盘摘要 | 30秒 | 聚合数据 |
| 控制权 Lock 状态 | 无 | 仅在显式释放时删除 |

### 2-3. 实时传感器数据缓存（Hash 结构）
按 Deck 单位一次性存储/查询多个传感器值时使用 Hash。使用 Hash 可以用一条命令获取整个 Deck。

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorCacheService {

    private final StringRedisTemplate redisTemplate;
    private static final String SENSOR_HASH_KEY = "harness:sensor:deck:";
    private static final Duration TTL = Duration.ofSeconds(30);

    // 存储传感器数据（按 sensorId 存入 Hash 字段）
    public void saveSensorValue(String deckId, String sensorId, Double value) {
        String hashKey = SENSOR_HASH_KEY + deckId;
        String fieldValue = String.valueOf(value) + ":" + Instant.now().toEpochMilli();

        redisTemplate.opsForHash().put(hashKey, sensorId, fieldValue);
        redisTemplate.expire(hashKey, TTL); // 刷新 TTL

        log.debug("[缓存存储] deck={}, sensor={}, value={}", deckId, sensorId, value);
    }

    // 一次性查询 Deck 的全部传感器最新值
    public Map<Object, Object> getDeckSensors(String deckId) {
        return redisTemplate.opsForHash().entries(SENSOR_HASH_KEY + deckId);
    }

    // 查询单个传感器值
    public Optional<Double> getSensorValue(String deckId, String sensorId) {
        Object raw = redisTemplate.opsForHash().get(SENSOR_HASH_KEY + deckId, sensorId);
        if (raw == null) return Optional.empty();

        String valueStr = raw.toString().split(":")[0];
        return Optional.of(Double.parseDouble(valueStr));
    }
}
```

### 2-4. Cache-Aside 模式（最基本的缓存方式）
在查询 DB 前先检查缓存，若没有则从 DB 取得后再存入缓存的模式。

```java
public AssetResponse getAsset(String tagId) {
    String cacheKey = "harness:asset:detail:" + tagId;

    // 1. 先检查缓存
    String cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        log.debug("[缓存 HIT] key={}", cacheKey);
        return objectMapper.readValue(cached, AssetResponse.class);
    }

    // 2. 缓存不存在则从 DB 查询
    log.debug("[缓存 MISS] key={}, 开始 DB 查询", cacheKey);
    AssetResponse response = assetRepository.findByTagId(tagId)
        .map(AssetResponse::from)
        .orElseThrow(() -> new BusinessException("NOT_FOUND", "找不到资产。"));

    // 3. 存入缓存（10分钟 TTL）
    redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(response), Duration.ofMinutes(10));

    return response;
}

// 数据变更时删除缓存（下次查询时从 DB 取得最新数据）
public void updateAsset(String tagId, AssetUpdateRequest request) {
    assetRepository.update(tagId, request);
    redisTemplate.delete("harness:asset:detail:" + tagId); // 缓存失效
}
```

### 2-5. AI 异常分数服务
将 AI 推理结果存入 Redis，并从仪表盘直接取出使用的模式。

```java
// 在 AI 服务推理完成后存入 Redis
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

// 从仪表盘快速查询
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

### 2-6. `RedisConnectionFailureException` — 本地 Redis 未运行错误
在本地开发环境未运行 Redis 就启动 Spring Boot 时，调用服务会发生 500 错误。

```
RedisConnectionFailureException: Unable to connect to Redis
  Caused by: RedisConnectionException: Unable to connect to localhost/<unresolved>:6379
    Caused by: ConnectException: Connection refused: getsockopt: localhost/127.0.0.1:6379
```

错误流程:
```
Controller → Service.getModelMetadata()
  → redisTemplate.execute()
    → Lettuce → localhost:6379 → Connection refused
      → RedisConnectionFailureException
        → 500 INTERNAL_SERVER_ERROR
```

✅ 解决方案 1 — 在服务中捕获异常后 DB fallback（推荐）。用 try-catch 包裹，使 Redis 故障不会导致整个请求失败。

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class ModelMetadataService {

    private final RedisTemplate<String, String> redisTemplate;
    private final ModelMetadataDao modelMetadataDao;  // DB fallback

    public ModelMetadataDto getModelMetadata(String modelId) {
        String cacheKey = "harness:model:meta:" + modelId;

        // 尝试查询缓存 — 即使 Redis 连接失败服务也继续运行
        try {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                return objectMapper.readValue(cached, ModelMetadataDto.class);
            }
        } catch (Exception e) {
            log.warn("[Redis 连接失败] 忽略缓存并查询 DB: {}", e.getMessage());
        }

        // 直接从 DB 查询（fallback）
        ModelMetadataDto dto = modelMetadataDao.selectByModelId(modelId);

        // 尝试存入 Redis — 即使失败响应也正常返回
        try {
            redisTemplate.opsForValue().set(
                cacheKey,
                objectMapper.writeValueAsString(dto),
                Duration.ofMinutes(10)
            );
        } catch (Exception e) {
            log.warn("[Redis 缓存存储失败] key={}: {}", cacheKey, e.getMessage());
        }

        return dto;
    }
}
```

✅ 解决方案 2 — 在本地 profile 中禁用 Redis 缓存。在 `application-local.yml` 中将缓存类型设为 `none`，即可在没有 Redis 的情况下启动。

```yaml
# application-local.yml
spring:
  cache:
    type: none   # 本地禁用缓存（没有 Redis 也能启动）

  # 如果想关闭 Redis 连接本身，添加以下内容（排除 RedisAutoConfiguration）
  autoconfigure:
    exclude:
      - org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
      - org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration
```

> 仅靠 `spring.cache.type=none` 也会使 `@Cacheable`、`@CacheEvict` 注解被忽略，从而在没有 Redis 的情况下运行。但直接注入并使用 `RedisTemplate` 的代码需另行处理。

✅ 解决方案 3 — 用 `@ConditionalOnProperty` 有条件地注册 Redis bean。通过 `application.yml` 属性控制是否使用 Redis。

```yaml
# application-local.yml
app:
  cache:
    redis-enabled: false   # 本地开发时为 false

# application-prod.yml
app:
  cache:
    redis-enabled: true    # 生产环境为 true
```

```java
@Configuration
public class CacheConfig {

    // 仅在 redis-enabled: true 时激活 RedisTemplate bean
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

    // 在禁用 Redis 的环境中不会被注入，因此用 Optional 接收
    @Autowired(required = false)
    private RedisTemplate<String, String> redisTemplate;

    public void saveSensorValue(String deckId, String sensorId, Double value) {
        if (redisTemplate == null) {
            log.debug("[Redis 禁用] 跳过缓存存储: deck={}", deckId);
            return;
        }
        // Redis 使用逻辑
        redisTemplate.opsForHash().put("harness:sensor:deck:" + deckId, sensorId, String.valueOf(value));
    }
}
```

✅ 解决方案 4 — 配置 Lettuce 连接超时（防止启动延迟）。在没有 Redis 的环境中，Lettuce 默认超时非常长，可能导致启动变慢。

```yaml
# application.yml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      timeout: 1000ms           # 将连接超时缩短为 1 秒
      connect-timeout: 1000ms   # 套接字连接超时
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 0
          max-wait: 500ms        # 连接池等待超时
```

## 3. 常见错误
- 未设置 TTL，导致内存无限累积。
- 没有**只**选一种 Redis 故障应对策略，而同时使用 try-catch fallback（优雅降级）和 `spring.cache.type=none`（完全禁用缓存）。
- 数据变更时漏掉缓存失效（删除），导致旧数据持续被服务。
- 未用冒号区分键命名空间，无法追踪是哪种数据。

## 4. 检查清单
- [ ] 是否以 `{服务}:{域}:{标识符}` 格式命名了缓存键
- [ ] 是否按数据性质设置了 TTL（没有 TTL 的键是否有意为之）
- [ ] 数据变更时是否使缓存失效（删除）
- [ ] Redis 连接失败时 DB fallback 是否生效
- [ ] 是否只选了一种 Redis 故障应对策略（try-catch fallback 或 cache.type=none）
- [ ] 本地能否在没有 Redis 的情况下启动（cache.type=none 或 exclude）
