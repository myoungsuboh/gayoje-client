---
name: Observability — Operational Dashboards, SLOs, and Metrics Infrastructure
description: Operations-side standards for observing and diagnosing production systems — SLO metric collection and threshold alerts, metric/trace collection infrastructure, instrumentation of external dependencies. Read when setting up dashboards, alerts, SLOs, or request-tracing infrastructure. Keywords: metrics, SLO, alert, prometheus, opentelemetry, sentry, dashboard, tracing.
rules:
  - "Collect SLO (Service Level Objective) metrics — p99 response time, error rate, availability — and fire alerts when thresholds are exceeded."
  - "Instrument the call time and error rate of external dependencies (DB, cache, external APIs) separately to identify bottlenecks."
  - "Standardize the metric/trace collection infrastructure (Prometheus/OTel Collector, etc.), and set collection targets, retention periods, and sampling as operational baselines."
  - "For application log authoring rules (structuring, correlationId, masking, levels) follow logging-observability — operations focuses on the pipeline that collects, searches, and alerts on the logs left that way."
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

# 🔭 Observability — Operational Dashboards, SLOs, and Metrics Infrastructure

> Observe production systems with logs, metrics, and traces and diagnose incidents quickly. This document covers the **operations side** (SLO alerts, metric collection infrastructure, external-dependency instrumentation, collection-tool selection).
>
> **Authority boundary**: For **application logging common concepts** such as structured logging (JSON), correlationId/traceId propagation, sensitive-data masking, and log-level policy, `logging-observability` is authoritative. We do not repeat them here but reference them. The standard rules of W3C trace propagation are also in `logging-observability`; for service-to-service trace correlation details see `distributed-tracing`.

## 1. Core Principles
- Collect SLO (Service Level Objective) metrics — p99 response time, error rate, availability — and fire alerts when thresholds are exceeded.
- Instrument the call time and error rate of external dependencies (DB, cache, external APIs) separately to identify bottlenecks.
- Standardize the metric/trace collection infrastructure (Prometheus/OTel Collector, etc.), and set collection targets, retention periods, and sampling as operational baselines.
- For application log authoring rules (structuring, correlationId, masking, levels) follow `logging-observability` — operations focuses on the pipeline that **collects, searches, and alerts on** the logs left that way.

## 2. Rules

### 2-1. The Three Pillars of Observability (collection-tool selection)
| Pillar | Purpose | Example Tools |
|------|------|-----------|
| Logs | Event records, debugging | ELK, Loki, CloudWatch |
| Metrics | Aggregate numbers, trends, alerts | Prometheus, Datadog, CloudWatch |
| Traces | Tracing distributed request flow | Jaeger, Zipkin, OpenTelemetry |

> The **format and content** of logs (structured JSON, correlation_id, masking) are authoritative in `logging-observability`. Operations is responsible for **collecting, retaining, and alerting** with the tools above.

### 2-2. Metric Collection + SLO Alerts (Prometheus)
Metric collection without SLOs makes you aware of incidents only after the fact. Wire threshold alerts at the same time as collection.
```python
from prometheus_client import Counter, Histogram, generate_latest

REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests", ["method", "path", "status"])
REQUEST_DURATION = Histogram("http_request_duration_seconds", "Request duration", ["path"])

# SLO alert rules (Prometheus AlertManager)
# - p99 response time > 500ms
# - 5xx error rate > 1%
# - availability < 99.9%
```

### 2-3. External-Dependency Instrumentation (OpenTelemetry)
Instrument external-dependency call time and error rate separately to identify bottlenecks. For the trace-propagation standard (W3C traceparent) see `logging-observability`.
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

tracer = trace.get_tracer("my-service")

with tracer.start_as_current_span("process_order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("order.amount", amount)
    # external DB call — auto-instrumented, so the call time and errors are recorded in the trace
    result = await db.execute(query)
```

## 3. Common Mistakes
- Collecting metrics without SLOs/thresholds → you become aware of incidents only after the fact. Define alert rules at the same time as collection.
- Not instrumenting external dependencies → you can't tell whether the bottleneck is the application or the DB/external API.
- No metric/trace retention/sampling baseline → cost explosion or lack of visibility.
- Arbitrarily redefining application logging rules (structuring, correlation_id, masking, levels) here → follow `logging-observability` as the single source.

## 4. Checklist
- [ ] Do you collect SLO metrics (p99, error rate, availability) and set threshold alerts?
- [ ] Do you instrument the call time and error rate of external dependencies (DB, cache, external APIs) separately?
- [ ] Are the collection targets, retention periods, and sampling of the metric/trace collection infrastructure defined as operational baselines?
- [ ] Do application log authoring rules follow `logging-observability`, while operations guarantees collection, search, and alerting of those logs?
