---
name: Kafka 이벤트 처리 패턴
description: Kafka Producer/Consumer 구현 시 토픽 설계, 메시지 포맷, 멱등 처리, DLQ(Dead Letter Queue) 구성 표준. 이벤트를 발행·소비하거나 토픽·재시도·중복 방어를 설계할 때 읽는다. 키워드: kafka, KafkaTemplate, @KafkaListener, ConsumerRecord, ProducerRecord, spring-kafka, DLQ, DLT, idempotent.
rules:
  - "토픽 이름은 {서비스명}.{도메인}.{이벤트타입} 형식으로 짓고, 파티션 키로 순서를 보장한다."
  - "메시지는 버전·식별 필드를 가진 Event 클래스로 직렬화한다."
  - "Consumer는 멱등 처리로 중복 수신을 방어한다(처리 ID 기록 후 중복 무시)."
  - "재시도 한도를 넘긴 메시지는 Dead Letter Queue(DLT)로 보낸다."
  - "Producer는 ack=all로 전송 확인을 받는다."
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

# 📨 Kafka 이벤트 처리 패턴

> Kafka Producer/Consumer의 토픽 설계·메시지 포맷·멱등 처리·DLQ를 표준화한다. 이벤트를 발행·소비하거나 재시도·중복 방어를 설계할 때 읽는다.
>
> 도메인 약어: **ESD**(Emergency Shut-Down, 산업 설비 긴급차단) · **Deck**(해양 플랜트의 갑판 단위 — 같은 Deck 데이터는 시간 순서 보장 필요). 도메인 용어는 [docs-glossary](../docs-glossary/SKILL.md) 참고.

## 1. 핵심 원칙
- 토픽 이름은 `{서비스명}.{도메인}.{이벤트타입}` 형식으로 짓고, 파티션 키로 순서를 보장한다.
- 메시지는 버전·식별 필드를 가진 Event 클래스로 직렬화한다.
- Consumer는 멱등 처리로 중복 수신을 방어한다(처리 ID 기록 후 중복 무시).
- 재시도 한도를 넘긴 메시지는 Dead Letter Queue(DLT)로 보낸다.
- Producer는 ack=all로 전송 확인을 받는다.

## 2. 규칙

### 2-1. 토픽 네이밍
`{서비스명}.{도메인}.{이벤트타입}` 형식. 소문자 + 하이픈(`-`) 사용, 언더스코어(`_`) 금지.
```
harness.sensor-data.raw          → 원시 센서 데이터
harness.sensor-data.processed    → 처리된 센서 데이터
harness.alarm.triggered          → 알람 발생 이벤트
harness.esd-command.dispatched   → ESD 긴급 차단 명령
harness.edge-sync.completed      → 엣지 동기화 완료
```

### 2-2. 파티셔닝 전략 (Deck ID 기반)
같은 Deck의 데이터는 같은 파티션에 들어가 순서가 보장된다.
```java
// Producer에서 Deck ID를 메시지 Key로 설정
ProducerRecord<String, SensorEvent> record = new ProducerRecord<>(
    "harness.sensor-data.raw",
    sensorEvent.getDeckId(),  // Key = Deck ID (파티션 결정 기준)
    sensorEvent
);
kafkaTemplate.send(record);
```

### 2-3. 메시지 포맷 (Event 클래스)
```java
public abstract class BaseEvent {
    private String eventId;       // UUID (중복 처리 방지용)
    private String eventType;     // 이벤트 종류 (예: "SENSOR_DATA_RECEIVED")
    private String source;        // 발생 서비스명 (예: "edge-gateway")
    private Instant occurredAt;   // 발생 시각
}

public class SensorDataEvent extends BaseEvent {
    private String sensorId;
    private String deckId;
    private Double value;
    private String unit;
}
```

### 2-4. Producer 작성
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SensorEventProducer {

    private final KafkaTemplate<String, SensorDataEvent> kafkaTemplate;
    private static final String TOPIC = "harness.sensor-data.raw";

    public void send(SensorDataEvent event) {
        // Deck ID를 Key로 설정해서 같은 Deck은 같은 파티션으로 보냄
        kafkaTemplate.send(TOPIC, event.getDeckId(), event)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("[Kafka 전송 실패] topic={}, deckId={}, error={}",
                        TOPIC, event.getDeckId(), ex.getMessage());
                } else {
                    log.debug("[Kafka 전송 성공] topic={}, partition={}, offset={}",
                        TOPIC,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                }
            });
    }
}
```

### 2-5. Consumer 작성 (수동 커밋)
```java
@Component
@Slf4j
public class SensorDataConsumer {

    @KafkaListener(
        topics = "harness.sensor-data.raw",
        groupId = "iiot-pipeline-group",
        containerFactory = "sensorKafkaListenerFactory"  // application.yml 설정명과 일치
    )
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        try {
            log.info("[센서 데이터 수신] sensorId={}, deckId={}", event.getSensorId(), event.getDeckId());
            processSensorData(event);
            ack.acknowledge();   // 처리 성공 시에만 오프셋 커밋
        } catch (Exception e) {
            log.error("[센서 데이터 처리 실패] eventId={}, error={}", event.getEventId(), e.getMessage());
            // ack를 호출하지 않으면 같은 메시지를 다시 받게 됨 (재처리)
        }
    }
}
```

### 2-6. Dead Letter Queue (DLQ/DLT) 처리
처리에 계속 실패하는 메시지는 DLT(`<원본>.DLT`)로 격리한다. 무한 재처리 루프 방지.
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
        spring.json.trusted.packages: "com.harness.event.*"   # 역직렬화 허용 패키지
    listener:
      ack-mode: MANUAL_IMMEDIATE
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
```
```java
// ErrorHandler + DLQ 전송 빈 등록
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaErrorHandlingConfig {

    // 3회 재시도(1초 간격) 후 DLT로 발행. DLT 이름은 자동으로 "<원본토픽>.DLT".
    @Bean
    public DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template);
        FixedBackOff backOff = new FixedBackOff(1_000L, 3L);
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
        // 역직렬화 실패는 즉시 DLT (재시도 무의미)
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
// DLT 모니터링 Consumer
@KafkaListener(topics = "harness.sensor-data.raw.DLT", groupId = "dlt-monitor")
public void onDeadLetter(ConsumerRecord<String, byte[]> record,
                         @Header(KafkaHeaders.EXCEPTION_MESSAGE) String exception) {
    log.error("[DLT 수신] topic={}, key={}, exception={}", record.topic(), record.key(), exception);
    // 알림 발송, 운영 대시보드 기록 등
}
```

### 2-7. 멱등 Consumer (중복 수신 방어)
Kafka는 기본 **at-least-once**라 같은 메시지가 두 번 이상 올 수 있다. `eventId`(UUID)를 기준으로 처리 이력을 DB/Redis에 기록해 중복 처리하지 않는다.
```java
@Component
@RequiredArgsConstructor
@Slf4j
public class SensorDataConsumer {

    private final StringRedisTemplate redis;              // 중복 체크용
    private final SensorDataService service;

    private static final Duration DEDUP_TTL = Duration.ofHours(24);

    @KafkaListener(topics = "harness.sensor-data.raw",
                   groupId = "iiot-pipeline-group",
                   containerFactory = "sensorKafkaListenerFactory")
    public void consume(SensorDataEvent event, Acknowledgment ack) {
        String dedupKey = "kafka:dedup:sensor:" + event.getEventId();
        // SET NX: 이미 처리된 eventId면 false 반환
        Boolean firstTime = redis.opsForValue().setIfAbsent(dedupKey, "1", DEDUP_TTL);

        if (Boolean.FALSE.equals(firstTime)) {
            log.warn("[중복 메시지 스킵] eventId={}", event.getEventId());
            ack.acknowledge();
            return;
        }
        try {
            service.process(event);
            ack.acknowledge();
        } catch (Exception e) {
            // 처리 실패 → 재시도 위해 dedup 키 삭제 후 예외 재던짐 (DefaultErrorHandler가 재시도/DLT)
            redis.delete(dedupKey);
            throw e;
        }
    }
}
```
> ⚠️ **dedup 키 TTL은 메시지 보존 기간보다 길게**. 짧으면 같은 메시지가 보존 기간 안에 두 번 처리될 수 있다.

### 2-8. QoS 2 수준의 ESD 명령 처리
ESD 명령은 유실 시 안전 사고로 직결되므로 강한 보장을 적용한다.
```java
@Bean
public ProducerFactory<String, EsdCommandEvent> esdProducerFactory() {
    Map<String, Object> config = new HashMap<>();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
    config.put(ProducerConfig.ACKS_CONFIG, "all");                  // 모든 replica 확인
    config.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);   // 끝까지 재시도
    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);     // 중복 전송 방지
    config.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5); // 멱등성 호환 범위
    config.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120_000);
    return new DefaultKafkaProducerFactory<>(config);
}

@Bean(name = "esdKafkaTemplate")
public KafkaTemplate<String, EsdCommandEvent> esdKafkaTemplate(
        ProducerFactory<String, EsdCommandEvent> esdProducerFactory) {
    return new KafkaTemplate<>(esdProducerFactory);
}
```
> 토픽 자체도 `replication.factor >= 3`, `min.insync.replicas = 2`로 생성해야 acks=all의 보장이 의미를 갖는다.

## 3. 흔한 실수 (안티패턴)
- ❌ `enable-auto-commit: true` + 비동기 처리 → 처리 실패한 메시지도 커밋되어 유실.
- ❌ DLT 없이 무한 재시도 → Consumer 정지.
- ❌ eventId 없이 같은 페이로드로 멱등 판단 → 의미 다른 이벤트도 스킵.
- ❌ `JsonDeserializer`의 `trusted.packages`를 `*`로 → 역직렬화 RCE(Remote Code Execution) 취약점.
- ❌ 토픽 `partitions=1`로 시작 후 늘리기 → 기존 key→partition 매핑이 깨져 순서 보장 무너짐.

## 4. 체크리스트
- [ ] 토픽 이름이 `{서비스}.{도메인}.{이벤트}` 형식(소문자·하이픈)인가
- [ ] 순서가 필요한 데이터에 파티션 키(Deck ID 등)를 설정했는가
- [ ] Consumer가 `eventId` 기반 멱등 처리를 하는가
- [ ] 수동 커밋(MANUAL_IMMEDIATE)과 DLT 격리가 구성됐는가
- [ ] `trusted.packages`를 구체 패키지로 제한했는가(`*` 금지)
- [ ] 강한 보장이 필요한 토픽에 acks=all + replication≥3, min.insync.replicas=2를 적용했는가
