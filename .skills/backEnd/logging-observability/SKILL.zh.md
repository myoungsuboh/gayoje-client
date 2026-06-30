---
name: 日志与可观测性标准 (Logging & Observability)
description: 结构化日志（JSON）、关联 ID（traceId）传播、敏感信息脱敏、日志级别策略、指标/RED、W3C 分布式追踪的与技术栈无关的通用标准。在编写·配置日志时、需要搭建可在运维中快速追踪问题的环境时、向新服务/语言/框架引入日志·指标时阅读。关键词: structured logging, JSON log, correlation id, traceId, spanId, MDC, masking, PII, log level, metrics, RED, Prometheus, OpenTelemetry, W3C traceparent。
rules:
  - "结构化日志: 日志不是人读的自由文本，而是以机器可解析的键值（JSON 等）结构输出。消息固定，可变值分离为独立字段。"
  - "关联 ID 传播: 为使一个请求可被端到端追踪，所有日志自动携带关联 ID（traceId）和主体标识符（userId 等）。即使跨越服务边界，同一 ID 也保持不变。"
  - "敏感信息脱敏: 密码·令牌·身份证号·卡号等敏感信息在写入日志前脱敏，或干脆不记录。"
  - "日志级别策略: 全团队对 ERROR/WARN/INFO/DEBUG/TRACE 的含义保持一致使用，仅按环境（本地/运维）分离输出级别和格式。"
  - "指标（RED）: 与日志分开暴露数值指标。至少测量请求数（Rate）·错误数（Errors）·延迟（Duration）以检测趋势与异常。"
  - "标准追踪传播: 分布式追踪用 W3C traceparent/tracestate 等标准头传播，使供应商·语言不同时追踪仍能延续。"
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

# 🔍 日志与可观测性标准

> 将结构化日志·关联 ID（traceId）·敏感信息脱敏·日志级别策略·指标（RED）·W3C 分布式追踪标准化。在编写·配置日志或搭建运维追踪环境时阅读。这是不依赖特定语言/框架的通用标准。
>
> **权威边界**: 结构化日志·correlationId/traceId 传播·敏感信息脱敏·日志级别策略以**本文档为权威**。运维层面（仪表板·SLO 告警·指标采集基础设施·外部依赖的埋点）参见 `observability`。（服务间追踪联动参见 `distributed-tracing`，审计日志存储参见 `audit-logging`，PII 处理原则参见 `privacy-pii`）

## 1. 核心原则
- **结构化日志**: 日志不是人读的自由文本，而是以机器可解析的键值（JSON 等）结构输出。消息固定，可变值分离为独立字段。
- **关联 ID 传播**: 为使一个请求可被端到端追踪，所有日志自动携带关联 ID（traceId）和主体标识符（userId 等）。即使跨越服务边界，同一 ID 也保持不变。
- **敏感信息脱敏**: 密码·令牌·身份证号·卡号等敏感信息在写入日志前脱敏，或干脆不记录。
- **日志级别策略**: 全团队对 ERROR/WARN/INFO/DEBUG/TRACE 的含义保持一致使用，仅按环境（本地/运维）分离输出级别和格式。
- **指标（RED）**: 与日志分开暴露数值指标。至少测量请求数（Rate）·错误数（Errors）·延迟（Duration）以检测趋势与异常。
- **标准追踪传播**: 分布式追踪用 W3C `traceparent`/`tracestate` 等标准头传播，使供应商·语言不同时追踪仍能延续。

## 2. 规则

### 2-1. 结构化日志（使其机器可解析）
- 运维用 JSON 等结构化格式，本地用人类易读格式。同一份代码只改环境配置。
- 不要把值拼接到消息字符串上，而要把值分离为结构化字段。

```text
// ❌ 禁止 — 值混入消息使解析·聚合·检索困难
log("user " + userId + " created asset " + assetId + " in 230ms")

// ✅ 推荐 — 固定消息 + 结构化字段（在任何后端都是同一原则）
log(level=INFO, msg="asset.created", fields={ userId, assetId, durationMs: 230 })
```

### 2-2. 关联 ID（traceId）的自动注入·传播
- 在请求入口（中间件/过滤器/拦截器）将 traceId·userId 放入上下文，使所有日志自动包含。不要在每次日志调用时手动附加。
- 对外调用时传播追踪头，接收方接续它以连接到同一 trace。

```text
// ❌ 禁止 — 无追踪 ID 的日志 → 并发请求混杂，无法跟踪单个请求
log("payment failed")

// ✅ 推荐 — 向请求上下文注入 traceId/userId，自动包含于所有日志
on_request_start: ctx.put(traceId, userId)   // 请求结束时清理（clear）
log("payment.failed")   // → { traceId, userId, msg: "payment.failed" }
```

### 2-3. 敏感信息脱敏
- 敏感信息在记录前的最后一步统一脱敏，或从一开始就排除在日志对象之外。
- 以“默认不留下”为原则，而非“需要时再遮蔽”。

```text
// ❌ 禁止 — 令牌·个人信息明文暴露 → 合规事故
log("login", { token: "eyJhbGciOi...", ssn: "901010-1234567" })

// ✅ 推荐 — 脱敏后记录（或干脆排除敏感字段）
log("login", { token: "***", ssn: "******-*******" })
```

### 2-4. 日志级别策略（统一含义）
若级别使用不一致，会产生告警噪声，真正重要的 ERROR 反而被淹没。
| 级别 | 使用时机 | 示例 |
|------|----------|------|
| ERROR | 需立即处置的系统错误。告警对象。 | DB 连接失败、外部依赖反复 5xx |
| WARN  | 异常但自动恢复或临时绕过。 | 发生重试、缓存未命中激增 |
| INFO  | 业务流程的主要事件。平时查询用。 | 登录成功、资源注册 |
| DEBUG | 开发/调试用。运维中 OFF。 | 分支判定、查询参数 |
| TRACE | 极其详细的流程追踪。 | 函数进入/退出的全过程 |

- 运维的默认级别为 INFO。不要在运维中保持 DEBUG/TRACE 开启。
- 异常不要只留消息，要连同堆栈跟踪/原因一起留下 — 将原因对象原样传给日志 API。

### 2-5. 关键分支留一行，异常留到原因
- 在业务的主要分支（成功/失败/重复等）留下一行 INFO 或 WARN，使流程可追踪。
- 可预测的用户错误用 WARN，未预料的系统错误用 ERROR + 堆栈跟踪。

```text
// ✅ 推荐 — 每个分支一行有意义的日志，用级别区分
try:
  create(req); log(INFO, "asset.created", { id: req.id })
catch DuplicateError:
  log(WARN, "asset.duplicate", { id: req.id }); raise BusinessError(...)
catch Error as e:
  log(ERROR, "asset.create.failed", { id: req.id }, cause=e)  // 含堆栈跟踪
  raise
```

### 2-6. 指标（RED）与暴露安全
- 与日志分开暴露指标。至少测量 RED — Rate（请求数）·Errors（错误数）·Duration（延迟，百分位 p50/p95/p99）。
- 使用计数器（累积）·计时器（延迟分布）等标准埋点，并将指标/健康暴露端点中敏感者置于认证之后。

```text
// ✅ 推荐 — 与工具无关的 RED 埋点概念
metric.counter("asset.created").inc()
timer = metric.timer("asset.lookup")        // 收集 p50/p95/p99 分布
with timer: doLookup()

// 健康（liveness/readiness）可公开，详细指标/转储需认证
```

### 2-7. 标准追踪传播（W3C）
- 分布式追踪用 W3C `traceparent`/`tracestate` 标准头传播（避免供应商依赖格式）。
- 运维中应用适当的采样率（例: 10%），在成本与可见性间取得平衡。
- 具体的采集器联动·服务间上下文传播参见 `distributed-tracing`。

```text
// 调用方: 将当前 trace 上下文注入为标准头
outbound.headers["traceparent"] = ctx.traceparent

// 接收方: 从头中恢复 trace 上下文并接续到同一 trace
ctx = extract("traceparent", inbound.headers)
```

## 3. 常见错误（反模式 — 绝对禁止）
- ❌ 直接输出到标准输出/错误（例: print、直接控制台输出） → 无法控制级别，不会留在运维日志中。使用日志抽象。
- ❌ 字符串拼接日志 → 即使级别关闭也产生拼接成本，无法解析·聚合。使用固定消息 + 结构化字段。
- ❌ 敏感信息明文记录 → 脱敏或干脆不打印。
- ❌ 异常仅以消息记录 → 堆栈跟踪/原因丢失。将原因对象传给日志 API。
- ❌ 运维中常开 DEBUG/TRACE → 磁盘/网络激增。运维默认 INFO。
- ❌ 无 traceId 的日志 → 并发请求混杂无法追踪。入口处自动注入是必须的。
- ❌ 关键业务分支连一行日志都没有 → 分支必须有一行有意义的日志。
- ❌ 将日志用作业务/审计数据存储 → 审计日志应进独立持久化存储（`audit-logging`）。
- ❌ 无指标只看日志 → 无法检测趋势·异常。单独暴露 RED 指标。

## 4. 检查清单
- [ ] 日志是否为结构化格式（键值/JSON），并按环境（本地可读 / 运维结构化）分离
- [ ] traceId·userId 是否在请求入口处自动注入并包含于所有日志
- [ ] 令牌·身份证号·卡号等敏感信息是否被脱敏或排除
- [ ] 日志级别（ERROR/WARN/INFO/DEBUG/TRACE）是否按指南含义一致使用
- [ ] 异常是否不仅留消息，还留堆栈跟踪/原因
- [ ] 每个关键业务分支是否都有一行有意义的日志
- [ ] RED（请求·错误·延迟）指标是否与日志分开暴露
- [ ] 敏感的指标/转储端点是否受认证保护
- [ ] 分布式追踪是否以 W3C traceparent 传播，运维采样率是否已设置

## 附录: 各技术栈示例

> 以下是特定技术栈的具体实现示例。上述 1~4 的中立原则·规则优先，本附录仅展示一种实现方法。

### Spring Boot (Logback + Micrometer)

#### 依赖
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    implementation 'io.micrometer:micrometer-registry-prometheus'
    implementation 'io.micrometer:micrometer-tracing-bridge-otel'
    implementation 'io.opentelemetry:opentelemetry-exporter-otlp'
    implementation 'net.logstash.logback:logstash-logback-encoder:7.4'
}
```

#### logback-spring.xml（按环境分离）
> 规则参见正文 2-1。以下是用 Logback 实现该按环境分离（运维 JSON / 本地模式）的示例。
```xml
<!-- src/main/resources/logback-spring.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

    <!-- 注册敏感信息脱敏转换器 -->
    <conversionRule conversionWord="mask"
                    converterClass="com.harness.common.log.MaskingConverter"/>

    <property name="LOG_PATH" value="${LOG_PATH:-./logs}"/>
    <property name="APP_NAME" value="${spring.application.name:-harness}"/>

    <!-- 本地: 可读性优先 -->
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

    <!-- dev/prod: 结构化 JSON -->
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

#### MDC traceId/userId 自动注入
```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0    # 运维建议 0.1
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
            // Micrometer Tracing 已将 traceId/spanId 放入 MDC。此处只追加 userId。
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

#### 敏感信息脱敏转换器
> ⚠️ **适用范围注意**: 下面的转换器**仅**对**消息字符串（`getFormattedMessage()`）**脱敏。若按正文规则（2-1、2-3）不把值拼到消息上，而分离到 MDC·结构化参数（arguments），**那些字段不经过此转换器，会以明文留下。** 因此模式转换器仅作为“捕获误混入消息的敏感信息的最后安全网”使用，而**结构化字段必须按下面的 [字段级脱敏] 在编码器/MDC 阶段施加脱敏。** 最可靠的防御是一开始就把敏感信息排除在日志对象之外（2-3）。

```java
package com.harness.common.log;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.regex.Pattern;

// ⚠️ 消息字符串专用安全网。无法捕获结构化字段（MDC/arguments） → 必须并用字段级脱敏。
public class MaskingConverter extends ClassicConverter {

    // JWT 令牌: Bearer xxx.yyy.zzz
    private static final Pattern JWT   = Pattern.compile("(Bearer\\s+)[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_=]+\\.[A-Za-z0-9\\-_.+/=]*");
    // 身份证号: 901010-1234567
    private static final Pattern RRN   = Pattern.compile("\\d{6}-[1-4]\\d{6}");
    // 卡号: 4 位 4 组
    private static final Pattern CARD  = Pattern.compile("\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b");
    // 邮箱只保留域名，对 ID 脱敏
    private static final Pattern EMAIL = Pattern.compile("([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+)");
    // 手机号
    private static final Pattern PHONE = Pattern.compile("\\b(01[016789])-?\\d{3,4}-?\\d{4}\\b");

    /** 对单个字符串的脱敏。以 static 暴露，便于在消息·字段中任意复用。 */
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

##### 字段级脱敏（结构化字段在编码器/MDC 处理）
JSON 编码器输出的 MDC·结构化字段不经过上面的转换器。在 `LogstashEncoder` 的值变换钩子（例: `ValueMasker`/自定义 `JsonProvider`）或放入 MDC 前的时点应用同一个 `maskValue(...)`，使消息与字段两侧都通过同一脱敏规则。不要擅自假定库未提供的钩子，在 `MDC.put` 之前·领域对象的 `toString()` 阶段脱敏最为可靠。
```java
// ✅ 结构化字段在放入前脱敏 — 消息转换器抓不到
MDC.put("authHeader", MaskingConverter.maskValue(rawAuthHeader));
log.info("login.attempt", kv("email", MaskingConverter.maskValue(email)));
```

#### Actuator 端点与安全
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
> `/actuator/prometheus`、`/actuator/heapdump`、`/actuator/env` 等敏感端点置于认证之后。
```java
// SecurityConfig 的一部分
.requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
.requestMatchers("/actuator/**").hasRole("ADMIN")
```

#### Micrometer 自定义指标
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
            .description("已注册资产数")
            .tag("module", "asset")
            .register(registry);
        this.lookupTimer = Timer.builder("harness.asset.lookup")
            .description("资产查询耗时")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry);
    }

    public void incrementCreated()         { createdCounter.increment(); }
    public Timer.Sample startLookupTimer() { return Timer.start(); }
    public void stopLookup(Timer.Sample s) { s.stop(lookupTimer); }
}
```

#### 分布式追踪 — W3C traceparent
```yaml
management:
  tracing:
    propagation:
      type: w3c           # 使用 traceparent 头（标准，替代 B3）
    sampling:
      probability: 0.1    # 运维 10% 采样
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
```
> Spring Boot 3 + Micrometer Tracing 会自动将 `traceparent`、`tracestate` 头注入外部调用。`RestTemplate`/`WebClient` 会被自动埋点，但手动构建 `WebClient.Builder` 时需注入 `@Autowired ObservationRegistry`。

#### 服务日志编写模式
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    @Override
    @Transactional
    public void createAsset(AssetCreateRequest request) {
        // INFO: 业务起始事件（结构化键值）
        log.info("资产注册开始 tagId={} deckId={}", request.getTagId(), request.getDeckId());
        try {
            assetDao.insert(request);
            log.info("资产注册完成 tagId={}", request.getTagId());
        } catch (DuplicateKeyException e) {
            // WARN: 可预测的用户错误
            log.warn("重复资产注册尝试 tagId={}", request.getTagId());
            throw new BusinessException("CONFLICT", "该资产已注册。");
        } catch (Exception e) {
            // ERROR: 未预料的系统错误（务必带堆栈跟踪）
            log.error("资产注册失败 tagId={}", request.getTagId(), e);
            throw e;
        }
    }
}
```
