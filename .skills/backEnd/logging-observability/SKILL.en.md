---
name: Logging & Observability Standards (Logging & Observability)
description: Stack-agnostic universal standards for structured logging (JSON), correlation ID (traceId) propagation, sensitive-data masking, log level policy, metrics/RED, and W3C distributed tracing. Read this when writing/configuring logs, when setting up an environment to quickly trace problems in operations, or when introducing logging/metrics to a new service/language/framework. Keywords: structured logging, JSON log, correlation id, traceId, spanId, MDC, masking, PII, log level, metrics, RED, Prometheus, OpenTelemetry, W3C traceparent.
rules:
  - "Structured logging: logs are output not as human-read free text but as a machine-parsable key-value (JSON, etc.) structure. The message is fixed; variable values are separated into distinct fields."
  - "Correlation ID propagation: so that one request can be traced end to end, automatically carry a correlation ID (traceId) and a subject identifier (userId, etc.) in every log. The same ID is preserved even across service boundaries."
  - "Sensitive-data masking: sensitive data such as passwords, tokens, national ID numbers, and card numbers are masked before being left in logs, or not recorded at all."
  - "Log level policy: the whole team uses the meanings of ERROR/WARN/INFO/DEBUG/TRACE identically, and only the output level and format are separated by environment (local/operations)."
  - "Metrics (RED): expose numeric indicators separately from logs. At minimum measure request count (Rate), error count (Errors), and latency (Duration) to detect trends and anomalies."
  - "Standard trace propagation: propagate distributed tracing with standard headers like W3C traceparent/tracestate so tracing continues even when vendor or language differs."
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

# 🔍 Logging & Observability Standards

> Standardizes structured logging, correlation ID (traceId), sensitive-data masking, log level policy, metrics (RED), and W3C distributed tracing. Read this when writing/configuring logs or setting up an operations-tracing environment. It is a universal standard not bound to any particular language/framework.
>
> **Authority boundary**: structured logging, correlationId/traceId propagation, sensitive-data masking, and log level policy are **the authority of this document**. For the operational side (dashboards, SLO alerts, metrics-collection infrastructure, instrumentation of external dependencies), see `observability`. (For inter-service tracing integration, see `distributed-tracing`; for audit log storage, `audit-logging`; for PII handling principles, `privacy-pii`.)

## 1. Core Principles
- **Structured logging**: logs are output not as human-read free text but as a machine-parsable key-value (JSON, etc.) structure. The message is fixed; variable values are separated into distinct fields.
- **Correlation ID propagation**: so that one request can be traced end to end, automatically carry a correlation ID (traceId) and a subject identifier (userId, etc.) in every log. The same ID is preserved even across service boundaries.
- **Sensitive-data masking**: sensitive data such as passwords, tokens, national ID numbers, and card numbers are masked before being left in logs, or not recorded at all.
- **Log level policy**: the whole team uses the meanings of ERROR/WARN/INFO/DEBUG/TRACE identically, and only the output level and format are separated by environment (local/operations).
- **Metrics (RED)**: expose numeric indicators separately from logs. At minimum measure request count (Rate), error count (Errors), and latency (Duration) to detect trends and anomalies.
- **Standard trace propagation**: propagate distributed tracing with standard headers like W3C `traceparent`/`tracestate` so tracing continues even when vendor or language differs.

## 2. Rules

### 2-1. Structured Logging (Make It Machine-Parsable)
- Operations in a structured format such as JSON, local in a human-readable format. Keep the same code and only change the environment configuration.
- Do not concatenate values onto the message string; separate values into structured fields.

```text
// ❌ Forbidden — values mixed into the message make parsing·aggregation·search hard
log("user " + userId + " created asset " + assetId + " in 230ms")

// ✅ Recommended — fixed message + structured fields (same principle on any backend)
log(level=INFO, msg="asset.created", fields={ userId, assetId, durationMs: 230 })
```

### 2-2. Automatic Injection·Propagation of Correlation ID (traceId)
- At the request entry point (middleware/filter/interceptor), put traceId·userId into the context, and have every log automatically include them. Do not attach them manually on each individual log call.
- When calling out, propagate the trace header, and the receiving side takes it over to connect to the same trace.

```text
// ❌ Forbidden — a log without a trace ID → concurrent requests get mixed and you cannot follow one request
log("payment failed")

// ✅ Recommended — inject traceId/userId into the request context, automatically included in every log
on_request_start: ctx.put(traceId, userId)   // clear when the request ends
log("payment.failed")   // → { traceId, userId, msg: "payment.failed" }
```

### 2-3. Sensitive-Data Masking
- Mask sensitive data in bulk at the step just before recording, or exclude it from the log target from the start.
- Make the principle "by default we don't leave it," not "we'll hide it later if needed."

```text
// ❌ Forbidden — plaintext exposure of tokens·personal data → compliance incident
log("login", { token: "eyJhbGciOi...", ssn: "901010-1234567" })

// ✅ Recommended — record after masking (or exclude sensitive fields entirely)
log("login", { token: "***", ssn: "******-*******" })
```

### 2-4. Log Level Policy (Unify the Meaning)
If levels are not used consistently, alert noise occurs and the truly important ERROR gets buried.
| Level | When to Use | Example |
|------|----------|------|
| ERROR | A system error needing immediate action. Subject to alerts. | DB connection failure, repeated 5xx from external dependencies |
| WARN  | Abnormal but auto-recovered or temporarily worked around. | Retry occurred, cache-miss surge |
| INFO  | Major events of the business flow. For routine lookup. | Login success, resource registration |
| DEBUG | For development/debugging. OFF in operations. | Branch decisions, query parameters |
| TRACE | Very detailed flow tracing. | Entire function entry/exit |

- The operational default level is INFO. Do not leave DEBUG/TRACE on in operations.
- For exceptions, do not leave only the message — leave the stack trace/cause as well — pass the cause object to the logging API as-is.

### 2-5. One Line at Key Branches, Cause Included for Exceptions
- At major business branches (success/failure/duplicate, etc.), leave one INFO or WARN line to make the flow traceable.
- Predictable user errors are WARN; unforeseen system errors are ERROR + stack trace.

```text
// ✅ Recommended — a meaningful line at each branch, distinguished by level
try:
  create(req); log(INFO, "asset.created", { id: req.id })
catch DuplicateError:
  log(WARN, "asset.duplicate", { id: req.id }); raise BusinessError(...)
catch Error as e:
  log(ERROR, "asset.create.failed", { id: req.id }, cause=e)  // stack trace included
  raise
```

### 2-6. Metrics (RED) and Exposure Security
- Expose metrics separately from logs. Measure at minimum RED — Rate (request count)·Errors (error count)·Duration (latency, percentiles p50/p95/p99).
- Use standard instrumentation such as counters (cumulative)·timers (latency distribution), and put any sensitive metrics/health-exposure endpoints behind authentication.

```text
// ✅ Recommended — tool-agnostic RED instrumentation concept
metric.counter("asset.created").inc()
timer = metric.timer("asset.lookup")        // collect p50/p95/p99 distribution
with timer: doLookup()

// Health (liveness/readiness) may be public; detailed metrics/dumps require authentication
```

### 2-7. Standard Trace Propagation (W3C)
- Propagate distributed tracing with the W3C `traceparent`/`tracestate` standard headers (avoid vendor-dependent formats).
- In operations, apply an appropriate sampling rate (e.g., 10%) to balance cost and visibility.
- For concrete collector integration·inter-service context propagation, see `distributed-tracing`.

```text
// Caller side: inject the current trace context as standard headers
outbound.headers["traceparent"] = ctx.traceparent

// Receiver side: restore the trace context from the header and connect to the same trace
ctx = extract("traceparent", inbound.headers)
```

## 3. Common Mistakes (Anti-Patterns — Absolutely Forbidden)
- ❌ Output directly to stdout/stderr (e.g., print, direct console output) → level control impossible, doesn't stay in operational logs. Use a logging abstraction.
- ❌ String-concatenation logs → concatenation cost incurred even when the level is off, parsing·aggregation impossible. Use fixed message + structured fields.
- ❌ Plaintext logging of sensitive data → mask it or don't print it at all.
- ❌ Logging exceptions as messages only → stack trace/cause is lost. Pass the cause object to the logging API.
- ❌ Always-on DEBUG/TRACE in operations → disk/network surge. Operational default INFO.
- ❌ Logs without a traceId → concurrent requests get mixed, tracing impossible. Auto-injection at the entry point is mandatory.
- ❌ Not even one log line at a key business branch → a branch must have a meaningful line.
- ❌ Using logs as a business/audit data store → audit logs go to a separate persistent store (`audit-logging`).
- ❌ Looking only at logs without metrics → trend·anomaly detection impossible. Expose RED metrics separately.

## 4. Checklist
- [ ] Are logs in a structured format (key-value/JSON), and separated by environment (local readability / operational structured)?
- [ ] Are traceId·userId auto-injected at the request entry point and included in every log?
- [ ] Are sensitive data such as tokens·national ID numbers·card numbers masked or excluded?
- [ ] Were the log levels (ERROR/WARN/INFO/DEBUG/TRACE) used consistently as per the guide's meanings?
- [ ] Do exceptions leave not just the message but the stack trace/cause?
- [ ] Is there a meaningful log line at each key business branch?
- [ ] Are RED (request·error·latency) metrics exposed separately from logs?
- [ ] Are sensitive metrics/dump endpoints protected by authentication?
- [ ] Is distributed tracing propagated with W3C traceparent, and is the operational sampling rate set?

## Appendix: Per-Stack Examples

> Below are concrete implementation examples for a specific stack. The neutral principles·rules of 1~4 above take precedence; this appendix merely shows one implementation method.

### Spring Boot (Logback + Micrometer)

#### Dependencies
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    implementation 'io.micrometer:micrometer-registry-prometheus'
    implementation 'io.micrometer:micrometer-tracing-bridge-otel'
    implementation 'io.opentelemetry:opentelemetry-exporter-otlp'
    implementation 'net.logstash.logback:logstash-logback-encoder:7.4'
}
```

#### logback-spring.xml (Per-Environment Separation)
> See body 2-1 for the rule. Below is an example of implementing that per-environment separation (operational JSON / local pattern) with Logback.
```xml
<!-- src/main/resources/logback-spring.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

    <!-- Register the sensitive-data masking converter -->
    <conversionRule conversionWord="mask"
                    converterClass="com.harness.common.log.MaskingConverter"/>

    <property name="LOG_PATH" value="${LOG_PATH:-./logs}"/>
    <property name="APP_NAME" value="${spring.application.name:-harness}"/>

    <!-- Local: readability first -->
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

    <!-- dev/prod: structured JSON -->
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

#### MDC traceId/userId Auto-Injection
```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0    # 0.1 recommended in operations
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
            // Micrometer Tracing already puts traceId/spanId into the MDC. Here we add only userId.
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

#### Sensitive-Data Masking Converter
> ⚠️ **Note on scope of application**: the converter below masks **only the message string (`getFormattedMessage()`)**. If, per the body rules (2-1, 2-3), you do not attach values to the message but separate them into MDC·structured arguments, **those fields do not pass through this converter and remain in plaintext.** Therefore use the pattern converter only as "a last safety net to catch sensitive data that accidentally got mixed into the message," and **structured fields must have masking applied at the encoder/MDC stage per [Field-Level Masking] below.** The surest defense is to exclude sensitive data from the log target in the first place (2-3).

```java
package com.harness.common.log;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.regex.Pattern;

// ⚠️ Message-string-only safety net. It cannot catch structured fields (MDC/arguments) → field-level masking is mandatory alongside.
public class MaskingConverter extends ClassicConverter {

    // JWT token: Bearer xxx.yyy.zzz
    private static final Pattern JWT   = Pattern.compile("(Bearer\\s+)[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_.+/=]*");
    // National ID number: 901010-1234567
    private static final Pattern RRN   = Pattern.compile("\\d{6}-[1-4]\\d{6}");
    // Card number: 4 groups of 4 digits
    private static final Pattern CARD  = Pattern.compile("\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b");
    // For email, keep only the domain and mask the ID
    private static final Pattern EMAIL = Pattern.compile("([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+)");
    // Mobile phone
    private static final Pattern PHONE = Pattern.compile("\\b(01[016789])-?\\d{3,4}-?\\d{4}\\b");

    /** Masking for a single string. Exposed as static so it can be reused anywhere — message or field. */
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

##### Field-Level Masking (Structured Fields Handled at the Encoder/MDC)
The MDC·structured fields that the JSON encoder emits do not pass through the converter above. Apply the same `maskValue(...)` at the value-transformation hook of `LogstashEncoder` (e.g., `ValueMasker`/a custom `JsonProvider`) or at the point before putting into MDC, so that both message and fields pass through the same masking rules. Do not arbitrarily assume hooks the library does not provide; masking just before `MDC.put` and at the domain object's `toString()` stage is the surest.
```java
// ✅ Mask structured fields before putting them in — the message converter does not catch them
MDC.put("authHeader", MaskingConverter.maskValue(rawAuthHeader));
log.info("login.attempt", kv("email", MaskingConverter.maskValue(email)));
```

#### Actuator Endpoints and Security
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
> Sensitive endpoints such as `/actuator/prometheus`, `/actuator/heapdump`, `/actuator/env` are placed behind authentication.
```java
// Part of SecurityConfig
.requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
.requestMatchers("/actuator/**").hasRole("ADMIN")
```

#### Micrometer Custom Metrics
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
            .description("number of registered assets")
            .tag("module", "asset")
            .register(registry);
        this.lookupTimer = Timer.builder("harness.asset.lookup")
            .description("asset lookup elapsed time")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry);
    }

    public void incrementCreated()         { createdCounter.increment(); }
    public Timer.Sample startLookupTimer() { return Timer.start(); }
    public void stopLookup(Timer.Sample s) { s.stop(lookupTimer); }
}
```

#### Distributed Tracing — W3C traceparent
```yaml
management:
  tracing:
    propagation:
      type: w3c           # use the traceparent header (standard instead of B3)
    sampling:
      probability: 0.1    # 10% sampling in operations
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
```
> Spring Boot 3 + Micrometer Tracing automatically injects the `traceparent`, `tracestate` headers into external calls. `RestTemplate`/`WebClient` are auto-instrumented, but when you manually build a `WebClient.Builder`, `@Autowired ObservationRegistry` injection is required.

#### Service Logging Writing Pattern
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    @Override
    @Transactional
    public void createAsset(AssetCreateRequest request) {
        // INFO: business start event (structured key-value)
        log.info("asset registration start tagId={} deckId={}", request.getTagId(), request.getDeckId());
        try {
            assetDao.insert(request);
            log.info("asset registration complete tagId={}", request.getTagId());
        } catch (DuplicateKeyException e) {
            // WARN: predictable user error
            log.warn("duplicate asset registration attempt tagId={}", request.getTagId());
            throw new BusinessException("CONFLICT", "This asset is already registered.");
        } catch (Exception e) {
            // ERROR: unforeseen system error (always include the stack trace)
            log.error("asset registration failed tagId={}", request.getTagId(), e);
            throw e;
        }
    }
}
```
