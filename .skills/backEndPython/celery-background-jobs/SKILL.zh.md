---
name: Celery 后台作业 & 任务队列
description: 使用 Celery 的异步后台任务 — 任务定义、重试策略、链式/和弦（chord）、结果后端，以及周期性任务（Celery Beat）。当需要把长时间运行的工作（发送邮件、数据处理、通知）移到后台时阅读。关键词: Celery, task, delay, apply_async, retry, chord, chain, beat, Redis, RabbitMQ.
rules:
  - "把无法在一次 HTTP 请求内完成的任务（邮件、图像处理、外部 API 调用）移到 Celery，并立即向客户端返回 202 Accepted。"
  - "为任务设置 max_retries 和指数退避的重试策略，并为永久性失败配置死信处理。"
  - "任务函数必须是幂等的 — 同一任务执行两次不得产生额外的副作用。"
  - "切勿将敏感数据（密码、令牌）直接传给任务 — 传递 DB ID，并在任务内部查询数据。"
  - "对 Celery Beat 周期性任务使用分布式锁，以防止多个 worker 之间重复执行。"
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

# 🔄 Celery 后台作业 & 任务队列

> 用 Celery 在后台处理长时间运行的任务，并立即返回 HTTP 响应。重试策略与幂等性是核心要求。

## 1. 核心原则

- 无法立即完成的工作放到后台 → 客户端获得即时响应。
- 设置重试策略，从瞬时故障（网络、外部 API）中自动恢复。
- 任务必须幂等 — 重复执行不得破坏数据。

## 2. 规则

### 2-1. Celery 配置

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

### 2-2. 任务定义 + 重试

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

### 2-3. 派发任务

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

### 2-4. 链式调用

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

## 3. 常见错误

- `task_acks_late=False`（默认）在接收时立即 ACK — worker 重启时正在处理的任务会丢失。
- 将 ORM 模型对象直接传给任务会导致序列化失败 — 始终传递 ID。
- 在没有分布式锁的情况下运行多个 Beat worker 会导致任务重复执行。

## 4. 检查清单

- [ ] 长时间任务是否已移到 Celery，且 API 是否立即返回 202？
- [ ] 任务是否配置了 max_retries 和 retry_backoff？
- [ ] 任务是否幂等（重复执行无副作用）？
- [ ] 是否向任务传递 ID 而非 ORM 对象？
