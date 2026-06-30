---
name: 로깅 및 옵저버빌리티 표준 (Logging & Observability)
description: 구조화 로깅(JSON), 상관관계 ID(traceId) 전파, 민감정보 마스킹, 로그 레벨 정책, 메트릭/RED, W3C 분산 추적의 스택 무관 범용 표준. 로그를 작성·설정하거나, 운영에서 문제를 빠르게 추적할 환경을 갖출 때, 새 서비스/언어/프레임워크에 로깅·메트릭을 도입할 때 읽는다. 키워드: structured logging, JSON log, correlation id, traceId, spanId, MDC, masking, PII, log level, metrics, RED, Prometheus, OpenTelemetry, W3C traceparent.
rules:
  - "구조화 로깅: 로그는 사람이 읽는 자유 텍스트가 아니라 기계가 파싱 가능한 키-값(JSON 등) 구조로 출력한다. 메시지는 고정, 가변값은 별도 필드로 분리한다."
  - "상관관계 ID 전파: 하나의 요청을 끝까지 추적할 수 있도록 모든 로그에 상관관계 ID(traceId)와 주체 식별자(userId 등)를 자동으로 실어 보낸다. 서비스 경계를 넘어도 같은 ID가 유지된다."
  - "민감정보 마스킹: 비밀번호·토큰·주민번호·카드번호 같은 민감정보는 로그에 남기기 전에 마스킹하거나 아예 기록하지 않는다."
  - "로그 레벨 정책: ERROR/WARN/INFO/DEBUG/TRACE의 의미를 팀 전체가 동일하게 쓰고, 환경(로컬/운영)에 따라 출력 레벨과 포맷만 분리한다."
  - "메트릭(RED): 로그와 별개로 수치 지표를 노출한다. 최소한 요청 수(Rate)·오류 수(Errors)·지연(Duration)을 측정해 추세와 이상을 감지한다."
  - "표준 추적 전파: 분산 추적은 W3C traceparent/tracestate 같은 표준 헤더로 전파해 벤더·언어가 달라도 추적이 이어지게 한다."
tags:
  - "structured logging"
  - "JSON log"
  - "correlation id"
  - "traceId"
  - "spanId"
  - "MDC"
  - "masking"
  - "PII"
  - "log level"
  - "metrics"
  - "RED"
  - "Prometheus"
  - "OpenTelemetry"
  - "W3C traceparent"
  - "slf4j"
  - "logback"
  - "Logger"
  - "LoggerFactory"
  - "@Slf4j"
  - "log.info"
  - "log.warn"
---

# 🔍 로깅 및 옵저버빌리티 표준

> 구조화 로깅·상관관계 ID(traceId)·민감정보 마스킹·로그 레벨 정책·메트릭(RED)·W3C 분산 추적을 표준화한다. 로그를 작성·설정하거나 운영 추적 환경을 갖출 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.
>
> **권위 경계**: 구조화 로깅·correlationId/traceId 전파·민감정보 마스킹·로그 레벨 정책은 **이 문서가 권위**다. 운영 측면(대시보드·SLO 알람·메트릭 수집 인프라·외부 의존성 계측)은 `observability` 참조. (서비스 간 추적 연동은 `distributed-tracing`, 감사 로그 저장은 `audit-logging`, PII 처리 원칙은 `privacy-pii` 참고)

## 1. 핵심 원칙
- **구조화 로깅**: 로그는 사람이 읽는 자유 텍스트가 아니라 기계가 파싱 가능한 키-값(JSON 등) 구조로 출력한다. 메시지는 고정, 가변값은 별도 필드로 분리한다.
- **상관관계 ID 전파**: 하나의 요청을 끝까지 추적할 수 있도록 모든 로그에 상관관계 ID(traceId)와 주체 식별자(userId 등)를 자동으로 실어 보낸다. 서비스 경계를 넘어도 같은 ID가 유지된다.
- **민감정보 마스킹**: 비밀번호·토큰·주민번호·카드번호 같은 민감정보는 로그에 남기기 전에 마스킹하거나 아예 기록하지 않는다.
- **로그 레벨 정책**: ERROR/WARN/INFO/DEBUG/TRACE의 의미를 팀 전체가 동일하게 쓰고, 환경(로컬/운영)에 따라 출력 레벨과 포맷만 분리한다.
- **메트릭(RED)**: 로그와 별개로 수치 지표를 노출한다. 최소한 요청 수(Rate)·오류 수(Errors)·지연(Duration)을 측정해 추세와 이상을 감지한다.
- **표준 추적 전파**: 분산 추적은 W3C `traceparent`/`tracestate` 같은 표준 헤더로 전파해 벤더·언어가 달라도 추적이 이어지게 한다.

## 2. 규칙

### 2-1. 구조화 로깅 (기계가 파싱 가능하게)
- 운영은 JSON 등 구조화 포맷으로, 로컬은 사람이 읽기 좋은 포맷으로. 같은 코드에서 환경 설정만 다르게 둔다.
- 메시지 문자열에 값을 이어 붙이지 말고, 값을 구조화된 필드로 분리한다.

```text
// ❌ 금지 — 값이 메시지에 섞여 파싱·집계·검색이 어렵다
log("user " + userId + " created asset " + assetId + " in 230ms")

// ✅ 권장 — 고정 메시지 + 구조화된 필드 (어떤 백엔드든 동일 원칙)
log(level=INFO, msg="asset.created", fields={ userId, assetId, durationMs: 230 })
```

### 2-2. 상관관계 ID(traceId) 자동 주입·전파
- 요청 진입 지점(미들웨어/필터/인터셉터)에서 traceId·userId를 컨텍스트에 넣고, 모든 로그가 자동으로 포함하게 한다. 개별 로그 호출마다 수동으로 붙이지 않는다.
- 외부로 호출할 때 추적 헤더를 전파하고, 수신 측은 이를 이어받아 같은 trace로 연결한다.

```text
// ❌ 금지 — 추적 ID 없는 로그 → 동시 요청이 섞여 한 요청을 따라갈 수 없다
log("payment failed")

// ✅ 권장 — 요청 컨텍스트에 traceId/userId를 주입, 모든 로그에 자동 포함
on_request_start: ctx.put(traceId, userId)   // 요청 끝나면 정리(clear)
log("payment.failed")   // → { traceId, userId, msg: "payment.failed" }
```

### 2-3. 민감정보 마스킹
- 민감정보는 기록 직전 단계에서 일괄 마스킹하거나, 처음부터 로그 대상에서 제외한다.
- "필요하면 나중에 가린다"가 아니라 "기본적으로 안 남긴다"를 원칙으로 한다.

```text
// ❌ 금지 — 토큰·개인정보 평문 노출 → 컴플라이언스 사고
log("login", { token: "eyJhbGciOi...", ssn: "901010-1234567" })

// ✅ 권장 — 마스킹 후 기록 (또는 민감 필드는 아예 제외)
log("login", { token: "***", ssn: "******-*******" })
```

### 2-4. 로그 레벨 정책 (의미를 통일)
레벨을 일관되게 쓰지 않으면 알람 노이즈가 발생하고 정작 중요한 ERROR가 묻힌다.
| 레벨 | 사용 시점 | 예시 |
|------|----------|------|
| ERROR | 즉시 조치가 필요한 시스템 오류. 알람 대상. | DB 연결 실패, 외부 의존성 5xx 반복 |
| WARN  | 비정상이지만 자동 복구되거나 임시 우회됨. | 재시도 발생, 캐시 미스 폭증 |
| INFO  | 비즈니스 흐름의 주요 이벤트. 평상시 조회용. | 로그인 성공, 자원 등록 |
| DEBUG | 개발/디버깅용. 운영에선 OFF. | 분기 결정, 쿼리 파라미터 |
| TRACE | 매우 상세한 흐름 추적. | 함수 진입/이탈 전체 |

- 운영 기본 레벨은 INFO. DEBUG/TRACE를 운영에서 켜두지 않는다.
- 예외는 메시지만 남기지 말고 스택 트레이스/원인까지 함께 남긴다 — 원인 객체를 로깅 API에 그대로 전달한다.

### 2-5. 핵심 분기엔 한 줄, 예외는 원인까지
- 비즈니스의 주요 분기(성공/실패/중복 등)에는 INFO 또는 WARN 한 줄을 남겨 흐름을 추적 가능하게 한다.
- 예측 가능한 사용자 오류는 WARN, 예측 못한 시스템 오류는 ERROR + 스택 트레이스.

```text
// ✅ 권장 — 분기마다 의미 있는 한 줄, 레벨로 구분
try:
  create(req); log(INFO, "asset.created", { id: req.id })
catch DuplicateError:
  log(WARN, "asset.duplicate", { id: req.id }); raise BusinessError(...)
catch Error as e:
  log(ERROR, "asset.create.failed", { id: req.id }, cause=e)  // 스택 트레이스 포함
  raise
```

### 2-6. 메트릭(RED)과 노출 보안
- 로그와 별개로 메트릭을 노출한다. 최소 RED — Rate(요청 수)·Errors(오류 수)·Duration(지연, 백분위 p50/p95/p99) — 를 측정한다.
- 카운터(누적)·타이머(지연 분포) 같은 표준 계측을 쓰고, 메트릭/헬스 노출 엔드포인트 중 민감한 것은 인증 뒤에 둔다.

```text
// ✅ 권장 — 도구 무관한 RED 계측 개념
metric.counter("asset.created").inc()
timer = metric.timer("asset.lookup")        // p50/p95/p99 분포 수집
with timer: doLookup()

// 헬스(liveness/readiness)는 공개 가능, 상세 메트릭/덤프는 인증 필요
```

### 2-7. 표준 추적 전파 (W3C)
- 분산 추적은 W3C `traceparent`/`tracestate` 표준 헤더로 전파한다(벤더 종속 포맷 지양).
- 운영에서는 적절한 샘플링 비율(예: 10%)을 적용해 비용과 가시성을 균형 잡는다.
- 구체적인 수집기 연동·서비스 간 컨텍스트 전파는 `distributed-tracing` 참고.

```text
// 호출 측: 현재 trace 컨텍스트를 표준 헤더로 주입
outbound.headers["traceparent"] = ctx.traceparent

// 수신 측: 헤더에서 trace 컨텍스트를 복원해 같은 trace로 이어 붙임
ctx = extract("traceparent", inbound.headers)
```

## 3. 흔한 실수 (안티패턴 — 절대 금지)
- ❌ 표준 출력/에러로 직접 출력(예: print, 콘솔 직접 출력) → 레벨 제어 불가, 운영 로그에 안 남음. 로깅 추상화 사용.
- ❌ 문자열 연결 로그 → 레벨이 꺼져도 연결 비용 발생, 파싱·집계 불가. 고정 메시지 + 구조화 필드 사용.
- ❌ 민감정보 평문 로깅 → 마스킹하거나 아예 안 찍기.
- ❌ 예외를 메시지로만 로깅 → 스택 트레이스/원인 소실. 원인 객체를 로깅 API에 전달.
- ❌ 운영에서 DEBUG/TRACE 상시 활성화 → 디스크/네트워크 폭증. 운영 기본 INFO.
- ❌ traceId 없는 로그 → 동시 요청이 섞여 추적 불가. 진입 지점에서 자동 주입 필수.
- ❌ 핵심 비즈니스 분기에 로그 한 줄도 없음 → 분기엔 반드시 의미 있는 한 줄.
- ❌ 로그를 비즈니스/감사 데이터 저장소로 사용 → 감사 로그는 별도 영속 저장소로(`audit-logging`).
- ❌ 메트릭 없이 로그만 봄 → 추세·이상 감지 불가. RED 지표를 별도로 노출.

## 4. 체크리스트
- [ ] 로그가 구조화 포맷(키-값/JSON)이며, 환경별(로컬 가독성 / 운영 구조화)로 분리됐는가
- [ ] traceId·userId가 요청 진입 지점에서 자동 주입되어 모든 로그에 포함되는가
- [ ] 토큰·주민번호·카드번호 등 민감정보가 마스킹되거나 제외되는가
- [ ] 로그 레벨(ERROR/WARN/INFO/DEBUG/TRACE)의 의미를 가이드대로 일관되게 썼는가
- [ ] 예외는 메시지만이 아니라 스택 트레이스/원인까지 남기는가
- [ ] 핵심 비즈니스 분기마다 의미 있는 로그 한 줄이 있는가
- [ ] RED(요청·오류·지연) 메트릭을 로그와 별개로 노출하는가
- [ ] 민감한 메트릭/덤프 엔드포인트가 인증으로 보호되는가
- [ ] 분산 추적이 W3C traceparent로 전파되고, 운영 샘플링 비율이 설정됐는가

## 부록: 스택별 예시

> 아래는 특정 스택의 구체 구현 예시다. 위 1~4의 중립 원칙·규칙이 우선하며, 이 부록은 한 가지 구현 방법을 보여줄 뿐이다.

### Spring Boot (Logback + Micrometer)

#### 의존성
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    implementation 'io.micrometer:micrometer-registry-prometheus'
    implementation 'io.micrometer:micrometer-tracing-bridge-otel'
    implementation 'io.opentelemetry:opentelemetry-exporter-otlp'
    implementation 'net.logstash.logback:logstash-logback-encoder:7.4'
}
```

#### logback-spring.xml (환경별 분리)
> 규칙은 본문 2-1 참조. 아래는 그 환경별 분리(운영 JSON / 로컬 패턴)를 Logback으로 구현한 예다.
```xml
<!-- src/main/resources/logback-spring.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

    <!-- 민감정보 마스킹 컨버터 등록 -->
    <conversionRule conversionWord="mask"
                    converterClass="com.harness.common.log.MaskingConverter"/>

    <property name="LOG_PATH" value="${LOG_PATH:-./logs}"/>
    <property name="APP_NAME" value="${spring.application.name:-harness}"/>

    <!-- 로컬: 가독성 우선 -->
    <springProfile name="local | default">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level [%X{traceId:-},%X{spanId:-}] %logger{36} - %mask(%msg)%n</pattern>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
        </root>
        <logger name="com.harness" level="DEBUG"/>
    </springProfile>

    <!-- dev/prod: 구조화 JSON -->
    <springProfile name="dev | prod">
        <appender name="JSON_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="net.logstash.logback.encoder.LogstashEncoder">
                <includeMdcKeyName>traceId</includeMdcKeyName>
                <includeMdcKeyName>spanId</includeMdcKeyName>
                <includeMdcKeyName>userId</includeMdcKeyName>
                <customFields>{"app":"${APP_NAME}"}</customFields>
            </encoder>
        </appender>

        <appender name="ROLLING_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
            <file>${LOG_PATH}/${APP_NAME}.log</file>
            <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
                <fileNamePattern>${LOG_PATH}/${APP_NAME}-%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
                <maxFileSize>100MB</maxFileSize>
                <maxHistory>30</maxHistory>
                <totalSizeCap>10GB</totalSizeCap>
            </rollingPolicy>
            <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
        </appender>

        <root level="INFO">
            <appender-ref ref="JSON_CONSOLE"/>
            <appender-ref ref="ROLLING_FILE"/>
        </root>
        <logger name="com.harness" level="INFO"/>
    </springProfile>
</configuration>
```

#### MDC traceId/userId 자동 주입
```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0    # 운영은 0.1 권장
  observations:
    key-values:
      app: harness
```
```java
package com.harness.common.log;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MdcContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) throws ServletException, IOException {
        try {
            // Micrometer Tracing이 이미 traceId/spanId를 MDC에 넣어준다. 여기선 userId만 추가.
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated()) {
                MDC.put("userId", auth.getName());
            }
            chain.doFilter(request, response);
        } finally {
            MDC.remove("userId");
        }
    }
}
```

#### 민감정보 마스킹 컨버터
> ⚠️ **적용 범위 주의**: 아래 컨버터는 **메시지 문자열(`getFormattedMessage()`)만** 마스킹한다. 본문 규칙(2-1, 2-3)대로 값을 메시지에 붙이지 않고 MDC·구조화 인자(arguments)로 분리하면, **그 필드는 이 컨버터를 거치지 않아 평문으로 남는다.** 따라서 패턴 컨버터는 "메시지에 실수로 섞여 들어온 민감정보를 잡는 마지막 안전망"으로만 쓰고, **구조화 필드는 아래 [필드 레벨 마스킹]에서 인코더/MDC 단계에 마스킹을 걸어야 한다.** 가장 확실한 방어는 애초에 민감정보를 로그 대상에서 제외하는 것이다(2-3).

```java
package com.harness.common.log;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.regex.Pattern;

// ⚠️ 메시지 문자열 전용 안전망. 구조화 필드(MDC/arguments)는 잡지 못한다 → 필드 레벨 마스킹 병행 필수.
public class MaskingConverter extends ClassicConverter {

    // JWT 토큰: Bearer xxx.yyy.zzz
    private static final Pattern JWT   = Pattern.compile("(Bearer\\s+)[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_.+/=]*");
    // 주민번호: 901010-1234567
    private static final Pattern RRN   = Pattern.compile("\\d{6}-[1-4]\\d{6}");
    // 카드번호: 4자리 4묶음
    private static final Pattern CARD  = Pattern.compile("\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b");
    // 이메일은 도메인만 남기고 ID 마스킹
    private static final Pattern EMAIL = Pattern.compile("([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+)");
    // 핸드폰
    private static final Pattern PHONE = Pattern.compile("\\b(01[016789])-?\\d{3,4}-?\\d{4}\\b");

    /** 문자열 한 건에 대한 마스킹. 메시지·필드 어디서든 재사용할 수 있게 static으로 노출. */
    public static String maskValue(String s) {
        if (s == null) return null;
        s = JWT.matcher(s).replaceAll("$1***");
        s = RRN.matcher(s).replaceAll("******-*******");
        s = CARD.matcher(s).replaceAll("****-****-****-****");
        s = EMAIL.matcher(s).replaceAll("$1***$2");
        s = PHONE.matcher(s).replaceAll("***-****-****");
        return s;
    }

    @Override
    public String convert(ILoggingEvent event) {
        String msg = event.getFormattedMessage();
        return msg == null ? "" : maskValue(msg);
    }
}
```

##### 필드 레벨 마스킹 (구조화 필드는 인코더/MDC에서 처리)
JSON 인코더가 내보내는 MDC·구조화 필드는 위 컨버터를 거치지 않는다. `LogstashEncoder`의 값 변환 훅(예: `ValueMasker`/커스텀 `JsonProvider`)이나 MDC에 넣기 전 시점에 같은 `maskValue(...)`를 적용해, 메시지와 필드 양쪽이 동일한 마스킹 규칙을 통과하게 한다. 라이브러리가 제공하지 않는 훅을 임의로 가정하지 말고, MDC `put` 직전·도메인 객체의 `toString()` 단계에서 마스킹하는 것이 가장 확실하다.
```java
// ✅ 구조화 필드는 넣기 전에 마스킹 — 메시지 컨버터로는 안 걸린다
MDC.put("authHeader", MaskingConverter.maskValue(rawAuthHeader));
log.info("login.attempt", kv("email", MaskingConverter.maskValue(email)));
```

#### Actuator 엔드포인트와 보안
```yaml
# application.yml
management:
  endpoints:
    web:
      base-path: /actuator
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when_authorized
      probes:
        enabled: true            # /actuator/health/liveness, /readiness
    prometheus:
      access: read_only
  metrics:
    tags:
      application: ${spring.application.name}
      env: ${SPRING_PROFILES_ACTIVE:local}
```
> `/actuator/prometheus`, `/actuator/heapdump`, `/actuator/env` 같은 민감 엔드포인트는 인증 뒤에 둔다.
```java
// SecurityConfig 일부
.requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
.requestMatchers("/actuator/**").hasRole("ADMIN")
```

#### Micrometer 커스텀 메트릭
```java
package com.harness.src.asset.service.impl;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

@Service
public class AssetMetricsService {

    private final Counter createdCounter;
    private final Timer   lookupTimer;

    public AssetMetricsService(MeterRegistry registry) {
        this.createdCounter = Counter.builder("harness.asset.created")
            .description("등록된 자산 개수")
            .tag("module", "asset")
            .register(registry);
        this.lookupTimer = Timer.builder("harness.asset.lookup")
            .description("자산 조회 소요 시간")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry);
    }

    public void incrementCreated()         { createdCounter.increment(); }
    public Timer.Sample startLookupTimer() { return Timer.start(); }
    public void stopLookup(Timer.Sample s) { s.stop(lookupTimer); }
}
```

#### 분산 추적 — W3C traceparent
```yaml
management:
  tracing:
    propagation:
      type: w3c           # traceparent 헤더 사용 (B3 대신 표준)
    sampling:
      probability: 0.1    # 운영은 10% 샘플링
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
```
> Spring Boot 3 + Micrometer Tracing은 자동으로 `traceparent`, `tracestate` 헤더를 외부 호출에 주입한다. `RestTemplate`/`WebClient`는 자동 계측되지만, 수동으로 `WebClient.Builder`를 만들 땐 `@Autowired ObservationRegistry` 주입 필요.

#### 서비스 로깅 작성 패턴
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    @Override
    @Transactional
    public void createAsset(AssetCreateRequest request) {
        // INFO: 비즈니스 시작 이벤트 (구조화 키-값)
        log.info("자산 등록 시작 tagId={} deckId={}", request.getTagId(), request.getDeckId());
        try {
            assetDao.insert(request);
            log.info("자산 등록 완료 tagId={}", request.getTagId());
        } catch (DuplicateKeyException e) {
            // WARN: 예측 가능한 사용자 오류
            log.warn("중복 자산 등록 시도 tagId={}", request.getTagId());
            throw new BusinessException("CONFLICT", "이미 등록된 자산입니다.");
        } catch (Exception e) {
            // ERROR: 예측 못한 시스템 오류 (반드시 스택 트레이스)
            log.error("자산 등록 실패 tagId={}", request.getTagId(), e);
            throw e;
        }
    }
}
```
