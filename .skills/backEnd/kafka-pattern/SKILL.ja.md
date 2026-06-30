---
name: Kafka イベント処理パターン
description: Kafka Producer/Consumer 実装時のトピック設計、メッセージフォーマット、冪等処理、DLQ（Dead Letter Queue）構成の標準。イベントを発行・消費したり、トピック・リトライ・重複防御を設計する際に読む。キーワード: kafka, KafkaTemplate, @KafkaListener, ConsumerRecord, ProducerRecord, spring-kafka, DLQ, DLT, idempotent。
rules:
  - "トピック名は {サービス名}.{ドメイン}.{イベントタイプ} 形式で付け、パーティションキーで順序を保証する。"
  - "メッセージはバージョン・識別フィールドを持つ Event クラスにシリアライズする。"
  - "Consumer は冪等処理で重複受信を防御する（処理 ID を記録した後、重複は無視）。"
  - "リトライ上限を超えたメッセージは Dead Letter Queue（DLT）へ送る。"
  - "Producer は ack=all で送信確認を受け取る。"
tags:
  - "kafka"
  - "KafkaTemplate"
  - "@KafkaListener"
  - "ConsumerRecord"
  - "ProducerRecord"
  - "spring-kafka"
  - "DLQ"
  - "DLT"
  - "idempotent"
---

# 📨 Kafka イベント処理パターン

> Kafka Producer/Consumer のトピック設計・メッセージフォーマット・冪等処理・DLQ を標準化する。イベントを発行・消費したり、リトライ・重複防御を設計する際に読む。
>
> ドメイン略語: **ESD**（Emergency Shut-Down、産業設備の緊急遮断）· **Deck**（海洋プラントの甲板単位 — 同じ Deck のデータは時間順序の保証が必要）。ドメイン用語は [docs-glossary](../docs-glossary/SKILL.md) を参照。

## 1. 核心原則
- トピック名は `{サービス名}.{ドメイン}.{イベントタイプ}` 形式で付け、パーティションキーで順序を保証する。
- メッセージはバージョン・識別フィールドを持つ Event クラスにシリアライズする。
- Consumer は冪等処理で重複受信を防御する（処理 ID を記録した後、重複は無視）。
- リトライ上限を超えたメッセージは Dead Letter Queue（DLT）へ送る。
- Producer は ack=all で送信確認を受け取る。

## 2. 規則

### 2-1. トピックの命名
`{サービス名}.{ドメイン}.{イベントタイプ}` 形式。小文字 + ハイフン（`-`）を使用、アンダースコア（`_`）は禁止。
```
harness.sensor-data.raw          → 生センサーデータ
harness.sensor-data.processed    → 処理済みセンサーデータ
harness.alarm.triggered          → アラーム発生イベント
harness.esd-command.dispatched   → ESD 緊急遮断コマンド
harness.edge-sync.completed       → エッジ同期完了
```

### 2-2. パーティショニング戦略（Deck ID ベース）
同じ Deck のデータは同じパーティションに入り、順序が保証される。
```java
// Producer で Deck ID をメッセージ Key に設定
ProducerRecord<String, SensorEvent> record = new ProducerRecord<>(
    "harness.sensor-data.raw",
    sensorEvent.getDeckId(),  // Key = Deck ID（パーティション決定の基準）
    sensorEvent
);
kafkaTemplate.send(record);
```

### 2-3. メッセージフォーマット（Event クラス）
```java
public abstract class BaseEvent {
    private String eventId;       // UUID（重複処理防止用）
    private String eventType;     // イベントの種類（例: "SENSOR_DATA_RECEIVED"）
    private String source;        // 発生サービス名（例: "edge-gateway"）
    private Instant occurredAt;   // 発生時刻
}

public class SensorDataEvent extends BaseEvent {
    private String sensorId;
    private String deckId;
    private Double value;
    private String unit;
}
```

### 2-4. Producer の作成
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorEventProducer {

    private final KafkaTemplate<String, SensorDataEvent> kafkaTemplate;
    private static final String TOPIC = "harness.sensor-data.raw";

    public void send(SensorDataEvent event) {
        // Deck ID を Key に設定して、同じ Deck は同じパーティションへ送る
        kafkaTemplate.send(TOPIC, event.getDeckId(), event)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("[Kafka 送信失敗] topic={}, deckId={}, error={}",
                        TOPIC, event.getDeckId(), ex.getMessage());
                } else {
                    log.debug("[Kafka 送信成功] topic={}, partition={}, offset={}",
                        TOPIC,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                }
            });
    }
}
```

### 2-5. Consumer の作成（手動コミット）
```java
@Component
@Slf4j
public class SensorDataConsumer {

    @KafkaListener(
        topics = "harness.sensor-data.raw",
        groupId = "iiot-pipeline-group",
        containerFactory = "sensorKafkaListenerFactory"  // application.yml の設定名と一致
    )
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        try {
            log.info("[センサーデータ受信] sensorId={}, deckId={}", event.getSensorId(), event.getDeckId());
            processSensorData(event);
            ack.acknowledge();   // 処理成功時のみオフセットをコミット
        } catch (Exception e) {
            log.error("[センサーデータ処理失敗] eventId={}, error={}", event.getEventId(), e.getMessage());
            // ack を呼ばないと同じメッセージを再度受け取る（再処理）
        }
    }
}
```

### 2-6. Dead Letter Queue（DLQ/DLT）の処理
処理に失敗し続けるメッセージは DLT（`<原本>.DLT`）へ隔離する。無限再処理ループの防止。
```yaml
# application.yml
spring:
  kafka:
    bootstrap-servers: kafka:9092
    consumer:
      group-id: iiot-pipeline-group
      enable-auto-commit: false
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
      properties:
        spring.deserializer.value.delegate.class: org.springframework.kafka.support.serializer.JsonDeserializer
        spring.json.trusted.packages: "com.harness.event.*"   # デシリアライズを許可するパッケージ
    listener:
      ack-mode: MANUAL_IMMEDIATE
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
```
```java
// ErrorHandler + DLQ 送信 Bean の登録
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaErrorHandlingConfig {

    // 3 回リトライ（1 秒間隔）後 DLT へ発行。DLT 名は自動的に "<原本トピック>.DLT"。
    @Bean
    public DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template);
        FixedBackOff backOff = new FixedBackOff(1_000L, 3L);
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
        // デシリアライズ失敗は即 DLT（リトライ無意味）
        handler.addNotRetryableExceptions(
            org.springframework.kafka.support.serializer.DeserializationException.class,
            IllegalArgumentException.class
        );
        return handler;
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, SensorDataEvent>
            sensorKafkaListenerFactory(
                ConsumerFactory<String, SensorDataEvent> consumerFactory,
                DefaultErrorHandler kafkaErrorHandler) {
        var factory = new ConcurrentKafkaListenerContainerFactory<String, SensorDataEvent>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(kafkaErrorHandler);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }
}
```
```java
// DLT モニタリング Consumer
@KafkaListener(topics = "harness.sensor-data.raw.DLT", groupId = "dlt-monitor")
public void onDeadLetter(ConsumerRecord<String, byte[]> record,
                         @Header(KafkaHeaders.EXCEPTION_MESSAGE) String exception) {
    log.error("[DLT 受信] topic={}, key={}, exception={}", record.topic(), record.key(), exception);
    // 通知の送信、運用ダッシュボードへの記録など
}
```

### 2-7. 冪等 Consumer（重複受信の防御）
Kafka はデフォルトで **at-least-once** なので、同じメッセージが 2 回以上来ることがある。`eventId`（UUID）を基準に処理履歴を DB/Redis に記録し、重複処理しないようにする。
```java
@Component
@RequiredArgsConstructor
@Slf4j
public class SensorDataConsumer {

    private final StringRedisTemplate redis;              // 重複チェック用
    private final SensorDataService service;

    private static final Duration DEDUP_TTL = Duration.ofHours(24);

    @KafkaListener(topics = "harness.sensor-data.raw",
                   groupId = "iiot-pipeline-group",
                   containerFactory = "sensorKafkaListenerFactory")
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        String dedupKey = "kafka:dedup:sensor:" + event.getEventId();
        // SET NX: すでに処理された eventId なら false を返す
        Boolean firstTime = redis.opsForValue().setIfAbsent(dedupKey, "1", DEDUP_TTL);

        if (Boolean.FALSE.equals(firstTime)) {
            log.warn("[重複メッセージをスキップ] eventId={}", event.getEventId());
            ack.acknowledge();
            return;
        }
        try {
            service.process(event);
            ack.acknowledge();
        } catch (Exception e) {
            // 処理失敗 → リトライのため dedup キーを削除して例外を再スロー（DefaultErrorHandler がリトライ/DLT）
            redis.delete(dedupKey);
            throw e;
        }
    }
}
```
> ⚠️ **dedup キーの TTL はメッセージ保存期間より長く。** 短いと、同じメッセージが保存期間内に 2 回処理されることがある。

### 2-8. QoS 2 レベルの ESD コマンド処理
ESD コマンドは喪失すると安全事故に直結するため、強い保証を適用する。
```java
@Bean
public ProducerFactory<String, EsdCommandEvent> esdProducerFactory() {
    Map<String, Object> config = new HashMap<>();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
    config.put(ProducerConfig.ACKS_CONFIG, "all");                  // すべての replica を確認
    config.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);   // 最後までリトライ
    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);     // 重複送信の防止
    config.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5); // 冪等性の互換範囲
    config.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120_000);
    return new DefaultKafkaProducerFactory<>(config);
}

@Bean(name = "esdKafkaTemplate")
public KafkaTemplate<String, EsdCommandEvent> esdKafkaTemplate(
        ProducerFactory<String, EsdCommandEvent> esdProducerFactory) {
    return new KafkaTemplate<>(esdProducerFactory);
}
```
> トピック自体も `replication.factor >= 3`、`min.insync.replicas = 2` で作成してこそ、acks=all の保証が意味を持つ。

## 3. よくある間違い（アンチパターン）
- ❌ `enable-auto-commit: true` + 非同期処理 → 処理に失敗したメッセージもコミットされ喪失。
- ❌ DLT なしの無限リトライ → Consumer の停止。
- ❌ eventId なしで同じペイロードによる冪等判定 → 意味の異なるイベントもスキップ。
- ❌ `JsonDeserializer` の `trusted.packages` を `*` に → デシリアライズ RCE（Remote Code Execution）脆弱性。
- ❌ トピックを `partitions=1` で開始した後に増やす → 既存の key→partition マッピングが壊れ順序保証が崩れる。

## 4. チェックリスト
- [ ] トピック名が `{サービス}.{ドメイン}.{イベント}` 形式（小文字・ハイフン）か
- [ ] 順序が必要なデータにパーティションキー（Deck ID など）を設定したか
- [ ] Consumer が `eventId` ベースの冪等処理をしているか
- [ ] 手動コミット（MANUAL_IMMEDIATE）と DLT 隔離が構成されているか
- [ ] `trusted.packages` を具体的なパッケージに制限したか（`*` 禁止）
- [ ] 強い保証が必要なトピックに acks=all + replication≥3、min.insync.replicas=2 を適用したか
