---
name: Background Jobs & Queues (stack-neutral)
description: Async work queue design, retry strategy, dead-letter queues, and monitoring standards (stack-neutral). Read it when offloading long-running work from the HTTP request into a queue, or when designing retries, idempotency, and DLQs. Keywords: queue, job, background, celery, bull, sidekiq, dead-letter, retry, async.
rules:
  - "Offload long-running work (emails, reports, external API calls) from the HTTP request into a queue and immediately return 202 Accepted."
  - "Retry failed jobs with exponential backoff (e.g. 1m→5m→15m→1h) up to N times, and move them to a Dead Letter Queue once exceeded."
  - "Design job definitions to be idempotent — so that running the same job twice does not duplicate side effects."
  - "Set a per-job timeout, and refresh the active state via heartbeat when execution runs long."
  - "Monitor the DLQ periodically and provide a manual reprocessing interface."
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

# ⚙️ Background Jobs & Queues

> Offload long-running work into a queue and process it reliably with idempotency, exponential-backoff retries, and a DLQ. Read it when designing an async job pipeline or deciding retries and monitoring.

## 1. Core Principles

- Offload long-running work (emails, reports, external API calls) from the HTTP request into a queue and immediately return 202 Accepted.
- Retry failed jobs with exponential backoff (e.g. 1m→5m→15m→1h) up to N times, and move them to a Dead Letter Queue once exceeded.
- Design job definitions to be idempotent — so that running the same job twice does not duplicate side effects.
- Set a per-job timeout, and refresh the active state via heartbeat when execution runs long.
- Monitor the DLQ periodically and provide a manual reprocessing interface.

## 2. Rules

### 2-1. Architecture Pattern

```
HTTP 요청 → API 서버 → 큐(Redis/RabbitMQ/SQS) → 워커 프로세스
              ↓                                        ↓
          202 + job_id                          결과 저장(DB/Cache)
```

### 2-2. Retry Strategy (Exponential Backoff)

```
시도 1: 즉시
시도 2: 1분 후
시도 3: 5분 후
시도 4: 15분 후
시도 5: 1시간 후
→ 초과: Dead Letter Queue (수동 검토)
```

### 2-3. Job Idempotency

```python
# ✅ 권장 — 중복 실행돼도 부작용이 한 번만 발생하도록 가드
def send_welcome_email(user_id: str):
    # 이미 발송됐으면 스킵
    if cache.get(f"welcome_sent:{user_id}"):
        return
    email_service.send(user_id, template="welcome")
    cache.set(f"welcome_sent:{user_id}", 1, ex=86400)
```

### 2-4. Implementations by Stack

| Stack | Library |
|------|-----------|
| Python | Celery + Redis, ARQ |
| Node.js | BullMQ, pg-boss |
| Java | Spring Batch, Quartz |
| Ruby | Sidekiq |
| Go | asynq, machinery |

### 2-5. Monitoring Essentials

- Queue-length alerts (to Slack·PagerDuty when a threshold is exceeded)
- DLQ job-count dashboard
- Job processing-time histogram (set an SLA on the P95 basis)
- Worker process liveness health check

## 3. Common Mistakes

- Processing long-running work synchronously inside the HTTP request → timeouts, slow responses.
- Losing the job on a single failure with no retry, or overloading the queue with infinite retries.
- No idempotency guarantee → emails or payments run twice on retry.
- Only piling up the DLQ with no monitoring or reprocessing means, leaving failed jobs unattended.

## 4. Checklist

- [ ] Do you offload long-running work into a queue and immediately return 202 + job_id?
- [ ] Have you applied exponential-backoff retries and a DLQ to failed jobs?
- [ ] Are jobs designed idempotently and safe against duplicate execution?
- [ ] Have you set a per-job timeout and heartbeat?
- [ ] Is there DLQ monitoring and a manual reprocessing interface?
