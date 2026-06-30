---
name: Kafka 事件处理模式
description: 实现 Kafka Producer/Consumer 时的主题设计、消息格式、幂等处理、DLQ（Dead Letter Queue）配置标准。在发布·消费事件或设计主题·重试·重复防御时阅读。关键词: kafka, KafkaTemplate, @KafkaListener, ConsumerRecord, ProducerRecord, spring-kafka, DLQ, DLT, idempotent。
rules:
  - "主题名以 {服务名}.{领域}.{事件类型} 格式命名，并用分区键保证顺序。"
  - "消息序列化为带有版本·标识字段的 Event 类。"
  - "Consumer 用幂等处理防御重复接收（记录处理 ID 后忽略重复）。"
  - "超过重试上限的消息发送到 Dead Letter Queue（DLT）。"
  - "Producer 用 ack=all 接收发送确认。"
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

# 📨 Kafka 事件处理模式

> 将 Kafka Producer/Consumer 的主题设计·消息格式·幂等处理·DLQ 标准化。在发布·消费事件或设计重试·重复防御时阅读。
>
> 领域缩写: **ESD**（Emergency Shut-Down，工业设备紧急停机）· **Deck**（海洋平台的甲板单位 — 同一 Deck 的数据需保证时间顺序）。领域术语参见 [docs-glossary](../docs-glossary/SKILL.md)。

## 1. 核心原则
- 主题名以 `{服务名}.{领域}.{事件类型}` 格式命名，并用分区键保证顺序。
- 消息序列化为带有版本·标识字段的 Event 类。
- Consumer 用幂等处理防御重复接收（记录处理 ID 后忽略重复）。
- 超过重试上限的消息发送到 Dead Letter Queue（DLT）。
- Producer 用 ack=all 接收发送确认。

## 2. 规则

### 2-1. 主题命名
`{服务名}.{领域}.{事件类型}` 格式。使用小写 + 连字符（`-`），禁止下划线（`_`）。
```
harness.sensor-data.raw          → 原始传感器数据
harness.sensor-data.processed    → 处理后的传感器数据
harness.alarm.triggered          → 告警发生事件
harness.esd-command.dispatched   → ESD 紧急停机命令
harness.edge-sync.completed       → 边缘同步完成
```

### 2-2. 分区策略（基于 Deck ID）
同一 Deck 的数据进入同一分区，从而保证顺序。
```java
// 在 Producer 中将 Deck ID 设为消息 Key
ProducerRecord<String, SensorEvent> record = new ProducerRecord<>(
    "harness.sensor-data.raw",
    sensorEvent.getDeckId(),  // Key = Deck ID（决定分区的依据）
    sensorEvent
);
kafkaTemplate.send(record);
```

### 2-3. 消息格式（Event 类）
```java
public abstract class BaseEvent {
    private String eventId;       // UUID（用于防止重复处理）
    private String eventType;     // 事件种类（例: "SENSOR_DATA_RECEIVED"）
    private String source;        // 发生服务名（例: "edge-gateway"）
    private Instant occurredAt;   // 发生时刻
}

public class SensorDataEvent extends BaseEvent {
    private String sensorId;
    private String deckId;
    private Double value;
    private String unit;
}
```

### 2-4. 编写 Producer
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorEventProducer {

    private final KafkaTemplate<String, SensorDataEvent> kafkaTemplate;
    private static final String TOPIC = "harness.sensor-data.raw";

    public void send(SensorDataEvent event) {
        // 将 Deck ID 设为 Key，使同一 Deck 发往同一分区
        kafkaTemplate.send(TOPIC, event.getDeckId(), event)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("[Kafka 发送失败] topic={}, deckId={}, error={}",
                        TOPIC, event.getDeckId(), ex.getMessage());
                } else {
                    log.debug("[Kafka 发送成功] topic={}, partition={}, offset={}",
                        TOPIC,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                }
            });
    }
}
```

### 2-5. 编写 Consumer（手动提交）
```java
@Component
@Slf4j
public class SensorDataConsumer {

    @KafkaListener(
        topics = "harness.sensor-data.raw",
        groupId = "iiot-pipeline-group",
        containerFactory = "sensorKafkaListenerFactory"  // 与 application.yml 配置名一致
    )
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        try {
            log.info("[传感器数据接收] sensorId={}, deckId={}", event.getSensorId(), event.getDeckId());
            processSensorData(event);
            ack.acknowledge();   // 仅在处理成功时提交偏移量
        } catch (Exception e) {
            log.error("[传感器数据处理失败] eventId={}, error={}", event.getEventId(), e.getMessage());
            // 不调用 ack 则会再次收到同一消息（重新处理）
        }
    }
}
```

### 2-6. Dead Letter Queue（DLQ/DLT）处理
持续处理失败的消息隔离到 DLT（`<原始>.DLT`）。防止无限重处理循环。
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
        spring.json.trusted.packages: "com.harness.event.*"   # 允许反序列化的包
    listener:
      ack-mode: MANUAL_IMMEDIATE
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
```
```java
// 注册 ErrorHandler + DLQ 发送 Bean
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaErrorHandlingConfig {

    // 重试 3 次（间隔 1 秒）后发布到 DLT。DLT 名自动为 "<原始主题>.DLT"。
    @Bean
    public DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template);
        FixedBackOff backOff = new FixedBackOff(1_000L, 3L);
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
        // 反序列化失败立即进 DLT（重试无意义）
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
// DLT 监控 Consumer
@KafkaListener(topics = "harness.sensor-data.raw.DLT", groupId = "dlt-monitor")
public void onDeadLetter(ConsumerRecord<String, byte[]> record,
                         @Header(KafkaHeaders.EXCEPTION_MESSAGE) String exception) {
    log.error("[DLT 接收] topic={}, key={}, exception={}", record.topic(), record.key(), exception);
    // 发送通知、记录到运维仪表板等
}
```

### 2-7. 幂等 Consumer（重复接收防御）
Kafka 默认是 **at-least-once**，因此同一消息可能到达多次。以 `eventId`（UUID）为基准将处理历史记录到 DB/Redis，避免重复处理。
```java
@Component
@RequiredArgsConstructor
@Slf4j
public class SensorDataConsumer {

    private final StringRedisTemplate redis;              // 用于重复检查
    private final SensorDataService service;

    private static final Duration DEDUP_TTL = Duration.ofHours(24);

    @KafkaListener(topics = "harness.sensor-data.raw",
                   groupId = "iiot-pipeline-group",
                   containerFactory = "sensorKafkaListenerFactory")
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        String dedupKey = "kafka:dedup:sensor:" + event.getEventId();
        // SET NX: 若 eventId 已处理则返回 false
        Boolean firstTime = redis.opsForValue().setIfAbsent(dedupKey, "1", DEDUP_TTL);

        if (Boolean.FALSE.equals(firstTime)) {
            log.warn("[跳过重复消息] eventId={}", event.getEventId());
            ack.acknowledge();
            return;
        }
        try {
            service.process(event);
            ack.acknowledge();
        } catch (Exception e) {
            // 处理失败 → 为重试删除 dedup 键并重新抛出异常（DefaultErrorHandler 负责重试/DLT）
            redis.delete(dedupKey);
            throw e;
        }
    }
}
```
> ⚠️ **dedup 键的 TTL 必须长于消息保留期。** 若过短，同一消息可能在保留期内被处理两次。

### 2-8. QoS 2 级别的 ESD 命令处理
ESD 命令一旦丢失将直接导致安全事故，因此应用强保证。
```java
@Bean
public ProducerFactory<String, EsdCommandEvent> esdProducerFactory() {
    Map<String, Object> config = new HashMap<>();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
    config.put(ProducerConfig.ACKS_CONFIG, "all");                  // 确认所有 replica
    config.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);   // 重试到底
    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);     // 防止重复发送
    config.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5); // 幂等性兼容范围
    config.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120_000);
    return new DefaultKafkaProducerFactory<>(config);
}

@Bean(name = "esdKafkaTemplate")
public KafkaTemplate<String, EsdCommandEvent> esdKafkaTemplate(
        ProducerFactory<String, EsdCommandEvent> esdProducerFactory) {
    return new KafkaTemplate<>(esdProducerFactory);
}
```
> 主题本身也必须以 `replication.factor >= 3`、`min.insync.replicas = 2` 创建，acks=all 的保证才有意义。

## 3. 常见错误（反模式）
- ❌ `enable-auto-commit: true` + 异步处理 → 处理失败的消息也被提交而丢失。
- ❌ 无 DLT 的无限重试 → Consumer 停滞。
- ❌ 无 eventId 而以相同载荷判断幂等 → 含义不同的事件也被跳过。
- ❌ 将 `JsonDeserializer` 的 `trusted.packages` 设为 `*` → 反序列化 RCE（Remote Code Execution）漏洞。
- ❌ 主题以 `partitions=1` 启动后再增加 → 既有 key→partition 映射被破坏，顺序保证瓦解。

## 4. 检查清单
- [ ] 主题名是否为 `{服务}.{领域}.{事件}` 格式（小写·连字符）
- [ ] 是否为需要顺序的数据设置了分区键（Deck ID 等）
- [ ] Consumer 是否基于 `eventId` 进行幂等处理
- [ ] 是否配置了手动提交（MANUAL_IMMEDIATE）与 DLT 隔离
- [ ] 是否将 `trusted.packages` 限制为具体包（禁止 `*`）
- [ ] 是否对需要强保证的主题应用了 acks=all + replication≥3、min.insync.replicas=2
