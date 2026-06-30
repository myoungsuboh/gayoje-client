---
name: 可观测性 — 运维仪表盘·SLO·指标基础设施
description: 用于观测、诊断生产系统的运维侧标准 — SLO 指标采集与阈值告警、指标/链路采集基础设施、外部依赖的埋点。在搭建仪表盘、告警、SLO、请求追踪基础设施时阅读。关键词: metrics, SLO, alert, prometheus, opentelemetry, sentry, dashboard, tracing。
rules:
  - "采集 SLO(服务级别目标)基准指标 — 响应时间 p99·错误率·可用性 — 并在超过阈值时发出告警。"
  - "对外部依赖(DB·缓存·外部 API)的调用时间和错误率单独埋点,以识别瓶颈。"
  - "将指标·链路采集基础设施(Prometheus/OTel Collector 等)标准化,并把采集对象·保留期·采样作为运维基准定下来。"
  - "应用日志本身的编写规则(结构化·correlationId·脱敏·级别)遵循 logging-observability — 运维专注于对这样留存的日志进行采集·检索·告警的流水线。"
tags:
  - "metrics"
  - "SLO"
  - "alert"
  - "prometheus"
  - "opentelemetry"
  - "sentry"
  - "dashboard"
  - "tracing"
  - "logger"
  - "logging"
  - "trace"
  - "correlation_id"
  - "structured_log"
---

# 🔭 可观测性 — 运维仪表盘·SLO·指标基础设施

> 用日志·指标·链路观测生产系统,并快速诊断故障。本文档涵盖**运维侧**(SLO 告警·指标采集基础设施·外部依赖埋点·采集工具选型)。
>
> **权威边界**: 结构化日志(JSON)·correlationId/traceId 传播·敏感信息脱敏·日志级别策略等**应用日志通用概念以 `logging-observability` 为权威**。这里不重复而是引用。W3C 链路传播的标准规则也在 `logging-observability`,服务间链路联动细节参见 `distributed-tracing`。

## 1. 核心原则
- 采集 SLO(服务级别目标)基准指标 — 响应时间 p99·错误率·可用性 — 并在超过阈值时发出告警。
- 对外部依赖(DB·缓存·外部 API)的调用时间和错误率单独埋点,以识别瓶颈。
- 将指标·链路采集基础设施(Prometheus/OTel Collector 等)标准化,并把采集对象·保留期·采样作为运维基准定下来。
- 应用日志本身的编写规则(结构化·correlationId·脱敏·级别)遵循 `logging-observability` — 运维专注于对这样留存的日志进行**采集·检索·告警**的流水线。

## 2. 规则

### 2-1. 可观测性三大支柱 (采集工具选型)
| 支柱 | 用途 | 工具示例 |
|------|------|-----------|
| Logs | 事件记录、调试 | ELK, Loki, CloudWatch |
| Metrics | 聚合数值、趋势、告警 | Prometheus, Datadog, CloudWatch |
| Traces | 追踪分布式请求流 | Jaeger, Zipkin, OpenTelemetry |

> 日志的**格式·内容**(结构化 JSON、correlation_id、脱敏)以 `logging-observability` 为权威。运维负责用上述工具进行**采集·保留·告警**。

### 2-2. 指标采集 + SLO 告警 (Prometheus)
没有 SLO 的指标采集会让你只能在事后才感知故障。在采集的同时挂上阈值告警。
```python
from prometheus_client import Counter, Histogram, generate_latest

REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests", ["method", "path", "status"])
REQUEST_DURATION = Histogram("http_request_duration_seconds", "Request duration", ["path"])

# SLO 告警规则 (Prometheus AlertManager)
# - p99 响应时间 > 500ms
# - 5xx 错误率 > 1%
# - 可用性 < 99.9%
```

### 2-3. 外部依赖埋点 (OpenTelemetry)
对外部依赖的调用时间·错误率单独埋点以识别瓶颈。链路传播标准(W3C traceparent)参见 `logging-observability`。
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

tracer = trace.get_tracer("my-service")

with tracer.start_as_current_span("process_order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("order.amount", amount)
    # 外部 DB 调用 — 自动埋点,调用时间·错误会记录到链路中
    result = await db.execute(query)
```

## 3. 常见错误
- 采集没有 SLO·阈值的指标 → 只能在事后感知故障。在采集的同时定义告警规则。
- 不对外部依赖埋点 → 无法区分瓶颈是在应用还是 DB/外部 API。
- 缺少指标/链路的保留·采样基准 → 成本暴涨或可见性不足。
- 在此处擅自重新定义应用日志规则(结构化·correlation_id·脱敏·级别)→ 以 `logging-observability` 为单一来源遵循。

## 4. 检查清单
- [ ] 是否采集 SLO 指标(p99·错误率·可用性)并设置了阈值告警
- [ ] 是否对外部依赖(DB·缓存·外部 API)的调用时间·错误率单独埋点
- [ ] 指标/链路采集基础设施的采集对象·保留期·采样是否已定义为运维基准
- [ ] 应用日志编写规则是否遵循 `logging-observability`,且运维是否保证对这些日志的采集·检索·告警
