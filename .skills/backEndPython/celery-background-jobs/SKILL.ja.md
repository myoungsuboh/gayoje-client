---
name: Celery バックグラウンドジョブ & タスクキュー
description: Celery による非同期バックグラウンドタスク — タスク定義、リトライポリシー、チェイニング/コード、結果バックエンド、定期タスク（Celery Beat）。長時間実行される処理（メール送信、データ処理、通知）をバックグラウンドへ移すときに読む。キーワード: Celery, task, delay, apply_async, retry, chord, chain, beat, Redis, RabbitMQ.
rules:
  - "HTTP リクエスト内で完了できないタスク（メール、画像処理、外部 API 呼び出し）を Celery へ移し、クライアントには直ちに 202 Accepted を返す。"
  - "タスクに max_retries と指数バックオフのリトライポリシーを設定し、恒久的な失敗にはデッドレター処理を構成する。"
  - "タスク関数は冪等でなければならない — 同じタスクを二度実行しても追加の副作用が生じてはならない。"
  - "機密データ（パスワード、トークン）をタスクへ直接渡してはならない — DB の ID を渡し、データはタスク内部で参照する。"
  - "Celery Beat の定期タスクには分散ロックを用い、複数ワーカー間での重複実行を防ぐ。"
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

# 🔄 Celery バックグラウンドジョブ & タスクキュー

> Celery で長時間実行されるタスクをバックグラウンド処理し、HTTP レスポンスを即座に返す。リトライポリシーと冪等性が中核要件である。

## 1. 中核原則

- 即座に完了しない処理はバックグラウンドへ → クライアントは即時レスポンスを得る。
- リトライポリシーを設定し、一時的な失敗（ネットワーク、外部 API）から自動回復する。
- タスクは冪等でなければならない — 重複実行でデータを破壊してはならない。

## 2. ルール

### 2-1. Celery の設定

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

### 2-2. タスク定義 + リトライ

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

### 2-3. タスクのディスパッチ

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

### 2-4. チェイニング

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

## 3. よくある間違い

- `task_acks_late=False`（デフォルト）は受信時に即 ACK する — ワーカーが再起動すると処理中のタスクが失われる。
- ORM モデルオブジェクトをタスクへ直接渡すとシリアライズに失敗する — 常に ID を渡す。
- 分散ロックなしで複数の Beat ワーカーを動かすとタスクが重複実行される。

## 4. チェックリスト

- [ ] 長時間タスクは Celery へ移され、API は直ちに 202 を返すか？
- [ ] タスクに max_retries と retry_backoff が設定されているか？
- [ ] タスクは冪等か（重複実行で副作用が出ないか）？
- [ ] タスクには ORM オブジェクトではなく ID が渡されているか？
