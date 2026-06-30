---
name: 后台任务 & 队列 (技术栈无关)
description: 异步任务队列设计、重试策略、死信队列与监控标准(技术栈无关)。在把长耗时任务从 HTTP 请求中剥离出来交由队列处理,或设计重试、幂等性、DLQ 时阅读。关键词: queue, job, background, celery, bull, sidekiq, dead-letter, retry, async.
rules:
  - "把长耗时任务(邮件·报表·外部 API 调用)从 HTTP 请求中剥离放入队列,并立即返回 202 Accepted。"
  - "失败的任务以指数退避(例如 1m→5m→15m→1h)最多重试 N 次,超过后移入 Dead Letter Queue。"
  - "任务定义设计为幂等 — 即使同一任务执行两次也不会重复产生副作用。"
  - "为每个任务设置 timeout,执行时间变长时通过 heartbeat 刷新活跃状态。"
  - "定期监控 DLQ,并提供手动重处理接口。"
tags:
  - "queue"
  - "job"
  - "background"
  - "celery"
  - "bull"
  - "sidekiq"
  - "dead-letter"
  - "retry"
  - "async"
---

# ⚙️ 后台任务 & 队列

> 把长耗时任务剥离到队列,通过幂等、指数退避重试与 DLQ 稳定处理。在设计异步任务流水线或确定重试与监控时阅读。

## 1. 核心原则

- 把长耗时任务(邮件·报表·外部 API 调用)从 HTTP 请求中剥离放入队列,并立即返回 202 Accepted。
- 失败的任务以指数退避(例如 1m→5m→15m→1h)最多重试 N 次,超过后移入 Dead Letter Queue。
- 任务定义设计为幂等 — 即使同一任务执行两次也不会重复产生副作用。
- 为每个任务设置 timeout,执行时间变长时通过 heartbeat 刷新活跃状态。
- 定期监控 DLQ,并提供手动重处理接口。

## 2. 规则

### 2-1. 架构模式

```
HTTP 요청 → API 서버 → 큐(Redis/RabbitMQ/SQS) → 워커 프로세스
              ↓                                        ↓
          202 + job_id                          결과 저장(DB/Cache)
```

### 2-2. 重试策略 (指数退避)

```
시도 1: 즉시
시도 2: 1분 후
시도 3: 5분 후
시도 4: 15분 후
시도 5: 1시간 후
→ 초과: Dead Letter Queue (수동 검토)
```

### 2-3. 任务幂等性

```python
# ✅ 권장 — 중복 실행돼도 부작용이 한 번만 발생하도록 가드
def send_welcome_email(user_id: str):
    # 이미 발송됐으면 스킵
    if cache.get(f"welcome_sent:{user_id}"):
        return
    email_service.send(user_id, template="welcome")
    cache.set(f"welcome_sent:{user_id}", 1, ex=86400)
```

### 2-4. 各技术栈的实现

| 技术栈 | 库 |
|------|-----------|
| Python | Celery + Redis, ARQ |
| Node.js | BullMQ, pg-boss |
| Java | Spring Batch, Quartz |
| Ruby | Sidekiq |
| Go | asynq, machinery |

### 2-5. 监控必备项

- 队列长度告警(超过阈值时发往 Slack·PagerDuty)
- DLQ 任务数仪表盘
- 任务处理时间直方图(按 P95 设定 SLA)
- 工作进程运行状态健康检查

## 3. 常见错误

- 在 HTTP 请求内同步处理长耗时任务 → 超时·响应缓慢。
- 无重试,一次失败即丢失任务;或无限重试导致队列过载。
- 未保证幂等性 → 重试时邮件·支付被重复执行。
- 只堆积 DLQ 而无监控·重处理手段,放任失败任务。

## 4. 检查清单

- [ ] 是否把长耗时任务剥离到队列并立即返回 202 + job_id
- [ ] 是否对失败任务应用了指数退避重试与 DLQ
- [ ] 任务是否设计为幂等,对重复执行安全
- [ ] 是否为每个任务设置了 timeout 与 heartbeat
- [ ] 是否有 DLQ 监控与手动重处理接口
