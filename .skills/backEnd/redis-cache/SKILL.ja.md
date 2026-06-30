---
name: Redis キャッシュ戦略
description: Redis キャッシュ設計の標準 — Key 命名、TTL 管理、Cache-Aside パターン、リアルタイムセンサーデータの Hash 配信、AI 異常スコア配信、ローカル Redis 未起動時の接続失敗処理。キャッシュを新規導入したり、キー・TTL を決めたり、Redis 接続エラーを扱うときに読む。キーワード: redis, RedisTemplate, @Cacheable, @CacheEvict, Lettuce, spring-data-redis, RedisConnectionFailureException, Cache-Aside.
rules:
  - "キャッシュキーは {サービス}:{ドメイン}:{識別子} 形式で命名し、コロン(:)でネームスペースを区切る。"
  - "データの性質ごとに TTL を変える — リアルタイムセンサーは短く、静的データは長く。TTL がないとメモリが溜まり続ける。"
  - "Cache-Aside パターンで、キャッシュミス時に DB を参照してからキャッシュに書き込む。"
  - "Redis 接続失敗時は例外をキャッチし、DB フォールバックでサービスを維持する。"
  - "リアルタイムセンサーデータは Hash 構造で保存し、フィールド単位で更新する。"
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

# 🗄️ Redis キャッシュ戦略

> Redis キャッシュのキー・TTL・パターンを統一し、Redis 障害時でもサービスを維持する。キャッシュを新規導入したり、Redis 接続エラーを扱うときに読む。

## 1. 基本原則
- キャッシュキーは `{サービス}:{ドメイン}:{識別子}` 形式で命名し、コロン(`:`)でネームスペースを区切る。
- データの性質ごとに TTL を変える — リアルタイムセンサーは短く、静的データは長く。TTL がないとメモリが溜まり続ける。
- Cache-Aside パターンで、キャッシュミス時に DB を参照してからキャッシュに書き込む。
- Redis 接続失敗時は例外をキャッチし、DB フォールバックでサービスを維持する。
- リアルタイムセンサーデータは Hash 構造で保存し、フィールド単位で更新する。

## 2. ルール

### 2-1. Key 命名規則
Redis Key は `{サービス}:{ドメイン}:{識別子}` 形式でコロン(`:`)で区切る。どんなデータか一目で分かるようにする。

```
harness:sensor:realtime:{sensorId}         → センサーの最新リアルタイム値
harness:sensor:deck:{deckId}               → Deck 全体のセンサー一覧
harness:anomaly:score:{sensorId}           → センサーごとの AI 異常スコア
harness:asset:detail:{tagId}               → 資産詳細情報のキャッシュ
harness:lock:status:{processBlockId}       → 制御権 Lock の状態
harness:dashboard:summary:{projectId}      → ダッシュボード要約のキャッシュ
```

### 2-2. TTL（有効期限）の設定基準
データの特性に応じて TTL を変える。TTL がないとメモリが溜まり続けるので必ず設定する。

| データ | TTL | 備考 |
|---|---|---|
| リアルタイムセンサー値 | 30秒 | 頻繁に更新されるデータ |
| AI 異常スコア | 60秒 | 推論周期に合わせる |
| 資産詳細情報 | 10分 | あまり変わらないデータ |
| ダッシュボード要約 | 30秒 | 集計データ |
| 制御権 Lock 状態 | なし | 明示的に解除するときのみ削除 |

### 2-3. リアルタイムセンサーデータのキャッシュ（Hash 構造）
Deck 単位で複数のセンサー値を一度に保存・参照するときは Hash を使う。Hash を使えば Deck 全体を 1 コマンドで取得できる。

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorCacheService {

    private final StringRedisTemplate redisTemplate;
    private static final String SENSOR_HASH_KEY = "harness:sensor:deck:";
    private static final Duration TTL = Duration.ofSeconds(30);

    // センサーデータ保存（Hash フィールドに sensorId ごとに保存）
    public void saveSensorValue(String deckId, String sensorId, Double value) {
        String hashKey = SENSOR_HASH_KEY + deckId;
        String fieldValue = String.valueOf(value) + ":" + Instant.now().toEpochMilli();

        redisTemplate.opsForHash().put(hashKey, sensorId, fieldValue);
        redisTemplate.expire(hashKey, TTL); // TTL 更新

        log.debug("[キャッシュ保存] deck={}, sensor={}, value={}", deckId, sensorId, value);
    }

    // Deck の全センサー最新値を一度に参照
    public Map<Object, Object> getDeckSensors(String deckId) {
        return redisTemplate.opsForHash().entries(SENSOR_HASH_KEY + deckId);
    }

    // 単一センサー値の参照
    public Optional<Double> getSensorValue(String deckId, String sensorId) {
        Object raw = redisTemplate.opsForHash().get(SENSOR_HASH_KEY + deckId, sensorId);
        if (raw == null) return Optional.empty();

        String valueStr = raw.toString().split(":")[0];
        return Optional.of(Double.parseDouble(valueStr));
    }
}
```

### 2-4. Cache-Aside パターン（最も基本的なキャッシュ方式）
DB 参照の前にまずキャッシュを確認し、なければ DB から取得した後にキャッシュへ保存するパターン。

```java
public AssetResponse getAsset(String tagId) {
    String cacheKey = "harness:asset:detail:" + tagId;

    // 1. まずキャッシュを確認
    String cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        log.debug("[キャッシュ HIT] key={}", cacheKey);
        return objectMapper.readValue(cached, AssetResponse.class);
    }

    // 2. キャッシュがなければ DB から参照
    log.debug("[キャッシュ MISS] key={}, DB 参照開始", cacheKey);
    AssetResponse response = assetRepository.findByTagId(tagId)
        .map(AssetResponse::from)
        .orElseThrow(() -> new BusinessException("NOT_FOUND", "資産が見つかりません。"));

    // 3. キャッシュへ保存（10分 TTL）
    redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(response), Duration.ofMinutes(10));

    return response;
}

// データ変更時にキャッシュを削除（次回参照時に DB から最新データを取得）
public void updateAsset(String tagId, AssetUpdateRequest request) {
    assetRepository.update(tagId, request);
    redisTemplate.delete("harness:asset:detail:" + tagId); // キャッシュ無効化
}
```

### 2-5. AI 異常スコアの配信
AI 推論結果を Redis に保存し、ダッシュボードからそのまま取り出して使うパターン。

```java
// AI サービスで推論完了後に Redis へ保存
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

// ダッシュボードから高速に参照
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

### 2-6. `RedisConnectionFailureException` — ローカル Redis 未起動エラー
ローカル開発環境で Redis を起動しないまま Spring Boot を起動すると、サービス呼び出し時に 500 エラーが発生する。

```
RedisConnectionFailureException: Unable to connect to Redis
  Caused by: RedisConnectionException: Unable to connect to localhost/<unresolved>:6379
    Caused by: ConnectException: Connection refused: getsockopt: localhost/127.0.0.1:6379
```

エラーの流れ:
```
Controller → Service.getModelMetadata()
  → redisTemplate.execute()
    → Lettuce → localhost:6379 → Connection refused
      → RedisConnectionFailureException
        → 500 INTERNAL_SERVER_ERROR
```

✅ 解決策 1 — サービスで例外をキャッチして DB フォールバック（推奨）。Redis 障害がリクエスト全体の失敗につながらないよう try-catch で包む。

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class ModelMetadataService {

    private final RedisTemplate<String, String> redisTemplate;
    private final ModelMetadataDao modelMetadataDao;  // DB fallback

    public ModelMetadataDto getModelMetadata(String modelId) {
        String cacheKey = "harness:model:meta:" + modelId;

        // キャッシュ参照を試行 — Redis 接続が失敗してもサービスは動き続ける
        try {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                return objectMapper.readValue(cached, ModelMetadataDto.class);
            }
        } catch (Exception e) {
            log.warn("[Redis 接続失敗] キャッシュを無視して DB 参照: {}", e.getMessage());
        }

        // DB から直接参照（fallback）
        ModelMetadataDto dto = modelMetadataDao.selectByModelId(modelId);

        // Redis 保存を試行 — 失敗してもレスポンスは正常に返す
        try {
            redisTemplate.opsForValue().set(
                cacheKey,
                objectMapper.writeValueAsString(dto),
                Duration.ofMinutes(10)
            );
        } catch (Exception e) {
            log.warn("[Redis キャッシュ保存失敗] key={}: {}", cacheKey, e.getMessage());
        }

        return dto;
    }
}
```

✅ 解決策 2 — ローカルプロファイルで Redis キャッシュを無効化する。`application-local.yml` でキャッシュタイプを `none` に設定すれば、Redis なしでも起動できる。

```yaml
# application-local.yml
spring:
  cache:
    type: none   # ローカルではキャッシュ無効化（Redis なしでも起動可能）

  # Redis 接続自体を切りたい場合は以下を追加（RedisAutoConfiguration を除外）
  autoconfigure:
    exclude:
      - org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
      - org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration
```

> `spring.cache.type=none` だけでも `@Cacheable`、`@CacheEvict` アノテーションが無視され、Redis なしで動作する。ただし `RedisTemplate` を直接注入して使うコードは別途対処が必要。

✅ 解決策 3 — `@ConditionalOnProperty` で Redis ビーンを条件付き登録する。Redis を使うかどうかを `application.yml` のプロパティで制御する。

```yaml
# application-local.yml
app:
  cache:
    redis-enabled: false   # ローカル開発時は false

# application-prod.yml
app:
  cache:
    redis-enabled: true    # 運用では true
```

```java
@Configuration
public class CacheConfig {

    // redis-enabled: true のときのみ RedisTemplate ビーンを有効化
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

    // Redis が無効化された環境では注入されないため Optional で受け取る
    @Autowired(required = false)
    private RedisTemplate<String, String> redisTemplate;

    public void saveSensorValue(String deckId, String sensorId, Double value) {
        if (redisTemplate == null) {
            log.debug("[Redis 無効] キャッシュ保存スキップ: deck={}", deckId);
            return;
        }
        // Redis 利用ロジック
        redisTemplate.opsForHash().put("harness:sensor:deck:" + deckId, sensorId, String.valueOf(value));
    }
}
```

✅ 解決策 4 — Lettuce 接続タイムアウトの設定（起動遅延の防止）。Redis がない環境では Lettuce の既定タイムアウトが非常に長く、起動が遅くなることがある。

```yaml
# application.yml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      timeout: 1000ms           # 接続タイムアウトを 1 秒に短縮
      connect-timeout: 1000ms   # ソケット接続タイムアウト
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 0
          max-wait: 500ms        # プール待機タイムアウト
```

## 3. よくあるミス
- TTL を設定せず、メモリが無制限に溜まる。
- Redis 障害対応戦略を**一つだけ**選ばず、try-catch フォールバック（グレースフルデグラデーション）と `spring.cache.type=none`（キャッシュ完全無効化）を同時に使う。
- データ変更時にキャッシュ無効化（削除）を漏らし、古いデータが配信され続ける。
- キーのネームスペースをコロンで区切らず、どのデータか追跡不能になる。

## 4. チェックリスト
- [ ] キャッシュキーを `{サービス}:{ドメイン}:{識別子}` 形式で命名したか
- [ ] データの性質ごとの TTL を設定したか（TTL なしのキーは意図的か）
- [ ] データ変更時にキャッシュを無効化（削除）したか
- [ ] Redis 接続失敗時に DB フォールバックが動作するか
- [ ] Redis 障害対応戦略を一つだけ選んだか（try-catch フォールバック または cache.type=none）
- [ ] ローカルで Redis なしで起動できるか（cache.type=none または exclude）
