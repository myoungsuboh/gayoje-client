---
name: 分布式追踪 (OpenTelemetry)
description: 在微服务中以 trace/span 追踪单个请求的分布式追踪标准。决定 OTel 埋点·上下文传播·采样·日志/指标关联·Jaeger/Tempo 集成时,以及诊断请求在哪个服务变慢/失败时阅读。关键词: opentelemetry, otel, distributed-tracing, jaeger, tempo, observability, traceparent, sampling.
rules:
  - "用 OpenTelemetry(OTel)标准 SDK 埋点 — 相比厂商绑定的 agent,优先考虑可移植性·标准性。"
  - "在服务边界(HTTP 头·消息队列属性)传播 trace-id — 哪怕一处断开,追踪就会中断。"
  - "给 span 附加有意义的属性(http.method·db.statement·error·tenant)— 仅靠名字无法做原因诊断。"
  - "生产环境用概率·tail-based 采样来调控成本 — 100% 追踪存储既昂贵又慢。"
  - "把日志·指标·追踪按 trace-id 关联(correlation),从入口到结尾追踪单个请求。"
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

# 🔍 分布式追踪 (OpenTelemetry)

> 在微服务中追踪"单个请求在哪个服务变慢/失败"的可观测性一个维度(追踪)。埋点跨越服务边界的请求,或决定采样·关联策略时阅读。

## 1. 核心原则
- 用 OpenTelemetry(OTel)标准 SDK 埋点 — 相比厂商绑定的 agent,优先考虑可移植性·标准性。
- 在服务边界(HTTP 头·消息队列属性)传播 trace-id — 哪怕一处断开,追踪就会中断。
- 给 span 附加有意义的属性(http.method·db.statement·error·tenant)— 仅靠名字无法做原因诊断。
- 生产环境用概率·tail-based 采样来调控成本 — 100% 追踪存储既昂贵又慢。
- 把日志·指标·追踪按 trace-id 关联(correlation),从入口到结尾追踪单个请求。

## 2. 规则

### 2-1. trace / span 结构
- **trace**:一个请求是一个 trace,每个工作区间是一个 span。以父子关系构成调用树。
- 用自动埋点(框架)广泛铺开,只对核心业务区间用手动埋点加强。

### 2-2. 上下文传播
- 用 W3C `traceparent` 头在服务间传递上下文。
- 在队列·批处理等异步路径上也传播 trace-id,使追踪不中断。

### 2-3. span 属性
```text
// ❌ 禁止 — 只有名字的 span(无法做原因诊断)
span: "queryUser"

// ✅ 推荐 — 附加有意义的属性
span: "queryUser"
  http.method = GET
  db.statement = SELECT ...
  tenant = acme
  error = true
```

### 2-4. 采样
- **head**(请求开始时)vs **tail**(完成后,以错误/延迟为基准)。
- 始终保留错误·慢请求的策略,相对成本而言诊断价值更高。

### 2-5. 信号关联 (log·metric·trace)
- 把三个信号按 trace-id 绑定,就能从告警 → 追踪 → 日志立即深入。

## 3. 常见错误
- ❌ 在异步·队列路径上遗漏 trace 上下文传播 → 追踪中断。把 `traceparent` 也放到消息属性里。
- ❌ span 只有名字而无属性 → 无法做原因诊断。附加 `http.method`·`db.statement`·`error` 等。
- ❌ 生产 100% 采样 → 成本·性能负担。概率/tail 采样(保留错误·延迟)。
- ❌ 在 span/属性中记录 PII·密钥 → 个人信息泄露。进行掩码。
- ❌ 不按 trace-id 关联日志·指标 → 信号各自为政,诊断变慢。
- ❌ 与厂商绑定的 agent 强耦合 → 可移植性下降。用 OTel 标准 SDK。

## 4. 检查清单
- [ ] 是否用 OTel 标准 SDK 埋点?
- [ ] trace-id 是否在所有服务边界(HTTP·队列)传播?
- [ ] 是否给 span 附加了用于诊断的属性(method·statement·error 等)?
- [ ] 是否决定了生产采样策略(保留错误·延迟)?
- [ ] 日志·指标是否按 trace-id 关联?
