---
name: Kafka Event Processing Pattern
description: Standards for topic design, message format, idempotent processing, and DLQ (Dead Letter Queue) configuration when implementing Kafka Producer/Consumer. Read this when publishing/consuming events or designing topics, retries, and duplicate defense. Keywords: kafka, KafkaTemplate, @KafkaListener, ConsumerRecord, ProducerRecord, spring-kafka, DLQ, DLT, idempotent.
rules:
  - "Name topics in the form {service-name}.{domain}.{event-type}, and guarantee ordering with the partition key."
  - "Serialize messages into an Event class that has version and identifier fields."
  - "The Consumer defends against duplicate receipts with idempotent processing (record the processing ID, then ignore duplicates)."
  - "Messages that exceed the retry limit are sent to the Dead Letter Queue (DLT)."
  - "The Producer receives delivery confirmation with ack=all."
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

# 📨 Kafka Event Processing Pattern

> Standardizes topic design, message format, idempotent processing, and DLQ for Kafka Producer/Consumer. Read this when publishing/consuming events or designing retries and duplicate defense.
>
> Domain abbreviations: **ESD** (Emergency Shut-Down, industrial equipment emergency shutdown) · **Deck** (the deck unit of an offshore plant — data on the same Deck requires time-ordering guarantees). For domain terms, see [docs-glossary](../docs-glossary/SKILL.md).

## 1. Core Principles
- Name topics in the form `{service-name}.{domain}.{event-type}`, and guarantee ordering with the partition key.
- Serialize messages into an Event class that has version and identifier fields.
- The Consumer defends against duplicate receipts with idempotent processing (record the processing ID, then ignore duplicates).
- Messages that exceed the retry limit are sent to the Dead Letter Queue (DLT).
- The Producer receives delivery confirmation with ack=all.

## 2. Rules

### 2-1. Topic Naming
The `{service-name}.{domain}.{event-type}` form. Use lowercase + hyphens (`-`); underscores (`_`) are forbidden.
```
harness.sensor-data.raw          → raw sensor data
harness.sensor-data.processed    → processed sensor data
harness.alarm.triggered          → alarm-triggered event
harness.esd-command.dispatched   → ESD emergency shutdown command
harness.edge-sync.completed       → edge sync completed
```

### 2-2. Partitioning Strategy (Deck ID Based)
Data from the same Deck goes into the same partition, guaranteeing ordering.
```java
// Set the Deck ID as the message Key in the Producer
ProducerRecord<String, SensorEvent> record = new ProducerRecord<>(
    "harness.sensor-data.raw",
    sensorEvent.getDeckId(),  // Key = Deck ID (the partition-determining criterion)
    sensorEvent
);
kafkaTemplate.send(record);
```

### 2-3. Message Format (Event Class)
```java
public abstract class BaseEvent {
    private String eventId;       // UUID (for duplicate-processing prevention)
    private String eventType;     // event kind (e.g., "SENSOR_DATA_RECEIVED")
    private String source;        // originating service name (e.g., "edge-gateway")
    private Instant occurredAt;   // occurrence time
}

public class SensorDataEvent extends BaseEvent {
    private String sensorId;
    private String deckId;
    private Double value;
    private String unit;
}
```

### 2-4. Writing the Producer
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorEventProducer {

    private final KafkaTemplate<String, SensorDataEvent> kafkaTemplate;
    private static final String TOPIC = "harness.sensor-data.raw";

    public void send(SensorDataEvent event) {
        // Set the Deck ID as the Key so the same Deck goes to the same partition
        kafkaTemplate.send(TOPIC, event.getDeckId(), event)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("[Kafka send failed] topic={}, deckId={}, error={}",
                        TOPIC, event.getDeckId(), ex.getMessage());
                } else {
                    log.debug("[Kafka send succeeded] topic={}, partition={}, offset={}",
                        TOPIC,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                }
            });
    }
}
```

### 2-5. Writing the Consumer (Manual Commit)
```java
@Component
@Slf4j
public class SensorDataConsumer {

    @KafkaListener(
        topics = "harness.sensor-data.raw",
        groupId = "iiot-pipeline-group",
        containerFactory = "sensorKafkaListenerFactory"  // matches the name in application.yml config
    )
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        try {
            log.info("[Sensor data received] sensorId={}, deckId={}", event.getSensorId(), event.getDeckId());
            processSensorData(event);
            ack.acknowledge();   // commit the offset only on successful processing
        } catch (Exception e) {
            log.error("[Sensor data processing failed] eventId={}, error={}", event.getEventId(), e.getMessage());
            // Not calling ack means the same message will be received again (reprocessing)
        }
    }
}
```

### 2-6. Dead Letter Queue (DLQ/DLT) Handling
Messages that keep failing to process are isolated to the DLT (`<original>.DLT`). Prevents an infinite reprocessing loop.
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
        spring.json.trusted.packages: "com.harness.event.*"   # packages allowed for deserialization
    listener:
      ack-mode: MANUAL_IMMEDIATE
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
```
```java
// Register the ErrorHandler + DLQ-publishing beans
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaErrorHandlingConfig {

    // Publish to the DLT after 3 retries (1-second interval). The DLT name is automatically "<original-topic>.DLT".
    @Bean
    public DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template);
        FixedBackOff backOff = new FixedBackOff(1_000L, 3L);
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
        // Deserialization failures go straight to the DLT (retrying is meaningless)
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
// DLT monitoring Consumer
@KafkaListener(topics = "harness.sensor-data.raw.DLT", groupId = "dlt-monitor")
public void onDeadLetter(ConsumerRecord<String, byte[]> record,
                         @Header(KafkaHeaders.EXCEPTION_MESSAGE) String exception) {
    log.error("[DLT received] topic={}, key={}, exception={}", record.topic(), record.key(), exception);
    // Send notifications, record to the operations dashboard, etc.
}
```

### 2-7. Idempotent Consumer (Duplicate-Receipt Defense)
Kafka is **at-least-once** by default, so the same message can arrive more than once. Record the processing history in DB/Redis keyed on `eventId` (UUID) so it is not processed in duplicate.
```java
@Component
@RequiredArgsConstructor
@Slf4j
public class SensorDataConsumer {

    private final StringRedisTemplate redis;              // for duplicate checks
    private final SensorDataService service;

    private static final Duration DEDUP_TTL = Duration.ofHours(24);

    @KafkaListener(topics = "harness.sensor-data.raw",
                   groupId = "iiot-pipeline-group",
                   containerFactory = "sensorKafkaListenerFactory")
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        String dedupKey = "kafka:dedup:sensor:" + event.getEventId();
        // SET NX: returns false if the eventId has already been processed
        Boolean firstTime = redis.opsForValue().setIfAbsent(dedupKey, "1", DEDUP_TTL);

        if (Boolean.FALSE.equals(firstTime)) {
            log.warn("[Duplicate message skipped] eventId={}", event.getEventId());
            ack.acknowledge();
            return;
        }
        try {
            service.process(event);
            ack.acknowledge();
        } catch (Exception e) {
            // Processing failed → delete the dedup key and rethrow for retry (DefaultErrorHandler handles retry/DLT)
            redis.delete(dedupKey);
            throw e;
        }
    }
}
```
> ⚠️ **The dedup key TTL must be longer than the message retention period.** If it is shorter, the same message could be processed twice within the retention period.

### 2-8. ESD Command Processing at QoS 2 Level
ESD commands directly cause safety incidents if lost, so strong guarantees are applied.
```java
@Bean
public ProducerFactory<String, EsdCommandEvent> esdProducerFactory() {
    Map<String, Object> config = new HashMap<>();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
    config.put(ProducerConfig.ACKS_CONFIG, "all");                  // confirm all replicas
    config.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);   // retry to the end
    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);     // prevent duplicate sends
    config.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5); // idempotence-compatible range
    config.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120_000);
    return new DefaultKafkaProducerFactory<>(config);
}

@Bean(name = "esdKafkaTemplate")
public KafkaTemplate<String, EsdCommandEvent> esdKafkaTemplate(
        ProducerFactory<String, EsdCommandEvent> esdProducerFactory) {
    return new KafkaTemplate<>(esdProducerFactory);
}
```
> The topic itself must also be created with `replication.factor >= 3` and `min.insync.replicas = 2` for the acks=all guarantee to be meaningful.

## 3. Common Mistakes (Anti-Patterns)
- ❌ `enable-auto-commit: true` + asynchronous processing → messages that failed processing get committed and are lost.
- ❌ Infinite retries without a DLT → the Consumer stalls.
- ❌ Judging idempotency by the same payload without an eventId → events with different meanings also get skipped.
- ❌ Setting `JsonDeserializer`'s `trusted.packages` to `*` → deserialization RCE (Remote Code Execution) vulnerability.
- ❌ Starting a topic with `partitions=1` and then increasing it → the existing key→partition mapping breaks and ordering guarantees collapse.

## 4. Checklist
- [ ] Is the topic name in the `{service}.{domain}.{event}` form (lowercase·hyphens)?
- [ ] Did you set a partition key (Deck ID, etc.) for data that needs ordering?
- [ ] Does the Consumer do idempotent processing based on `eventId`?
- [ ] Are manual commit (MANUAL_IMMEDIATE) and DLT isolation configured?
- [ ] Did you restrict `trusted.packages` to concrete packages (no `*`)?
- [ ] Did you apply acks=all + replication≥3, min.insync.replicas=2 to topics needing strong guarantees?
