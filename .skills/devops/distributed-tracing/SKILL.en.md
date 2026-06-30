---
name: Distributed Tracing (OpenTelemetry)
description: A distributed tracing standard for following a single request across microservices as traces/spans. Read it when deciding OTel instrumentation, context propagation, sampling, log/metric correlation, or Jaeger/Tempo integration, or when diagnosing in which service a request was slow/failed. Keywords: opentelemetry, otel, distributed-tracing, jaeger, tempo, observability, traceparent, sampling.
rules:
  - "Instrument with the OpenTelemetry (OTel) standard SDK — prefer portability and standardization over vendor-locked agents."
  - "Propagate the trace-id across service boundaries (HTTP headers, message queue attributes) — if it breaks even in one place, the trace is severed."
  - "Attach meaningful attributes to spans (http.method, db.statement, error, tenant) — the name alone does not allow root-cause diagnosis."
  - "In production, control cost with probabilistic/tail-based sampling — storing 100% of traces is expensive and slow."
  - "Correlate logs, metrics, and traces by trace-id to follow a single request from entry to end."
tags:
  - "opentelemetry"
  - "otel"
  - "distributed-tracing"
  - "jaeger"
  - "tempo"
  - "observability"
  - "traceparent"
  - "sampling"
---

# 🔍 Distributed Tracing (OpenTelemetry)

> One axis of observability (tracing) for following "in which service a request was slow/failed" across microservices. Read it when instrumenting requests that cross service boundaries or deciding sampling/correlation policy.

## 1. Core Principles
- Instrument with the OpenTelemetry (OTel) standard SDK — prefer portability and standardization over vendor-locked agents.
- Propagate the trace-id across service boundaries (HTTP headers, message queue attributes) — if it breaks even in one place, the trace is severed.
- Attach meaningful attributes to spans (http.method, db.statement, error, tenant) — the name alone does not allow root-cause diagnosis.
- In production, control cost with probabilistic/tail-based sampling — storing 100% of traces is expensive and slow.
- Correlate logs, metrics, and traces by trace-id to follow a single request from entry to end.

## 2. Rules

### 2-1. trace / span structure
- **trace**: a single request is a trace, and each unit of work is a span. They form a call tree as parent-child.
- Lay broad coverage with auto-instrumentation (frameworks), and reinforce only the key business sections with manual instrumentation.

### 2-2. Context propagation
- Pass context between services via the W3C `traceparent` header.
- Propagate the trace-id along asynchronous paths such as queues and batches too, so the trace is not severed.

### 2-3. span attributes
```text
// ❌ Forbidden — a span with only a name (no root-cause diagnosis)
span: "queryUser"

// ✅ Recommended — attach meaningful attributes
span: "queryUser"
  http.method = GET
  db.statement = SELECT ...
  tenant = acme
  error = true
```

### 2-4. Sampling
- **head** (at request start) vs **tail** (after completion, based on error/latency).
- A policy that always keeps errors and slow requests has high diagnostic value relative to cost.

### 2-5. Signal correlation (log, metric, trace)
- Tying the three signals by trace-id lets you drill in immediately from alert → trace → log.

## 3. Common Mistakes
- ❌ Missing trace context propagation on async/queue paths → the trace is severed. Carry `traceparent` in message attributes too.
- ❌ Spans with only a name and no attributes → no root-cause diagnosis. Attach `http.method`, `db.statement`, `error`, etc.
- ❌ 100% sampling in production → cost/performance burden. Probabilistic/tail sampling (preserve errors and latency).
- ❌ Recording PII/secrets in spans/attributes → personal data leak. Mask them.
- ❌ Not correlating logs/metrics by trace-id → signals are disjoint and diagnosis is slow.
- ❌ Tightly coupling to a vendor-locked agent → reduced portability. Use the OTel standard SDK.

## 4. Checklist
- [ ] Did you instrument with the OTel standard SDK?
- [ ] Is the trace-id propagated across all service boundaries (HTTP, queues)?
- [ ] Did you attach the attributes used for diagnosis (method, statement, error, etc.) to spans?
- [ ] Did you decide a production sampling policy (preserve errors and latency)?
- [ ] Are logs/metrics correlated by trace-id?
