---
name: Celery Background Jobs & Task Queues
description: Asynchronous background tasks with Celery — task definition, retry policies, chaining/chord, result backends, and periodic tasks (Celery Beat). Read when moving long-running work (email sending, data processing, notifications) to the background. Keywords: Celery, task, delay, apply_async, retry, chord, chain, beat, Redis, RabbitMQ.
rules:
  - "Move tasks that cannot complete within an HTTP request (email, image processing, external API calls) to Celery and immediately return 202 Accepted to the client."
  - "Set max_retries and exponential backoff retry policies on tasks and configure dead-letter handling for permanent failures."
  - "Task functions must be idempotent — executing the same task twice must produce no additional side effects."
  - "Never pass sensitive data (passwords, tokens) directly to tasks — pass a DB ID and look up the data inside the task."
  - "Use a distributed lock for Celery Beat periodic tasks to prevent duplicate execution across multiple workers."
tags:
  - "Celery"
  - "task"
  - "delay"
  - "apply_async"
  - "retry"
  - "chord"
  - "chain"
  - "beat"
  - "Redis"
  - "RabbitMQ"
---

# 🔄 Celery Background Jobs & Task Queues

> Process long-running tasks in the background with Celery and return HTTP responses immediately. Retry policies and idempotency are the core requirements.

## 1. Core Principles

- Work that doesn't complete immediately goes to the background → client gets an instant response.
- Set retry policies to automatically recover from transient failures (network, external API).
- Tasks must be idempotent — duplicate execution must not corrupt data.

## 2. Rules

### 2-1. Celery Configuration

```python
# celery_app.py
from celery import Celery

celery_app = Celery(
    "worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
    include=["app.tasks.email", "app.tasks.notifications"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,       # ACK after processing (guarantees re-run on restart)
    worker_prefetch_multiplier=1,
)
```

### 2-2. Task Definition + Retry

```python
# tasks/email.py
from app.celery_app import celery_app

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(SMTPException, ConnectionError),
    retry_backoff=True,
)
def send_welcome_email(self, user_id: str):
    # Receive an ID, look up inside the task — ensures idempotency
    user = db.query(User).get(user_id)
    if not user:
        return  # Already deleted — exit quietly

    try:
        email_service.send(user.email, "Welcome", template="welcome")
    except Exception as exc:
        raise self.retry(exc=exc)
```

### 2-3. Dispatching Tasks

```python
# API handler returns immediately
@router.post("/users", status_code=status.HTTP_202_ACCEPTED)
async def create_user(dto: UserCreate, db = Depends(get_db)):
    user = await create_user_in_db(db, dto)

    # Enqueue in the background (returns immediately)
    send_welcome_email.delay(str(user.id))

    return {"id": user.id, "status": "processing"}

# Schedule with a delay
send_welcome_email.apply_async(args=[user_id], countdown=60)
```

### 2-4. Chaining

```python
from celery import chain, chord

# Sequential: upload → convert → notify
pipeline = chain(
    upload_file.s(file_path),
    convert_image.s(),
    notify_user.s(user_id),
)
pipeline.delay()

# Parallel + aggregate: send multiple emails, then notify on completion
job = chord(
    [send_email.s(email) for email in recipients],
    on_all_sent.s(campaign_id),
)
job.delay()
```

## 3. Common Mistakes

- `task_acks_late=False` (default) ACKs immediately on receipt — tasks in-progress are lost if the worker restarts.
- Passing an ORM model object directly to a task fails serialization — always pass an ID.
- Running multiple Beat workers without a distributed lock causes duplicate task execution.

## 4. Checklist

- [ ] Are long-running tasks moved to Celery and does the API return 202 immediately?
- [ ] Are max_retries and retry_backoff configured on tasks?
- [ ] Are tasks idempotent (no side effects from duplicate execution)?
- [ ] Are IDs passed to tasks instead of ORM objects?
