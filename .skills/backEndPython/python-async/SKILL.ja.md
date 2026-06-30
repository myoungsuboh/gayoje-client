---
name: Python 非同期パターン (asyncio / async-await)
description: Python asyncio をベースとした非同期コードのパターン — asyncio.gather による並列実行、非同期コンテキストマネージャ、非同期ジェネレータ、run_in_executor による同期コードの統合。FastAPI や非同期 SQLAlchemy などで非同期 Python バックエンドを書くときに読む。キーワード: async-def, await, asyncio.gather, asyncio.create_task, run_in_executor, AsyncContextManager, aiohttp, httpx.
rules:
  - "独立したコルーチンは逐次 await ではなく asyncio.gather() で並列に実行する。"
  - "同期的なブロッキング関数（ファイル I/O、CPU バウンドな処理）を async 関数内で直接呼び出すとイベントループをブロックする — loop.run_in_executor() でスレッドプールに委譲する。"
  - "asyncio.create_task() で作成したタスクは、ガベージコレクションによるキャンセルを防ぐため参照を保持するか await しなければならない。"
  - "非同期リソース（DB 接続、HTTP セッション）は async with コンテキストマネージャで管理し、リークを防ぐ。"
  - "async 関数内では time.sleep() ではなく await asyncio.sleep() を使う。"
tags:
  - "async-def"
  - "await"
  - "asyncio.gather"
  - "asyncio.create_task"
  - "run_in_executor"
  - "AsyncContextManager"
  - "aiohttp"
  - "httpx"
  - "asyncio"
---

# ⚡ Python 非同期パターン (asyncio)

> Python asyncio ベースの非同期コードの正しいパターン。並列実行、ブロッキング呼び出しの隔離、非同期リソースの管理が中心的な関心事である。

## 1. 基本原則

- 独立したコルーチンを asyncio.gather() で並列に実行し、レイテンシを削減する。
- 同期的なブロッキング関数を run_in_executor() でスレッドプールに委譲し、イベントループを保護する。
- 非同期リソースを async with で管理し、リークを防ぐ。

## 2. ルール

### 2-1. 並列実行 (asyncio.gather)

```python
# ❌ Serial — total time = sum of all operation times
user = await get_user(user_id)
orders = await get_orders(user_id)
notifications = await get_notifications(user_id)

# ✅ Parallel — total time = slowest single operation
user, orders, notifications = await asyncio.gather(
    get_user(user_id),
    get_orders(user_id),
    get_notifications(user_id),
)

# Allow partial failures (return_exceptions=True)
results = await asyncio.gather(
    send_email(email1),
    send_email(email2),
    return_exceptions=True,
)
for result in results:
    if isinstance(result, Exception):
        logger.error(f"Email failed: {result}")
```

### 2-2. ブロッキング関数の隔離

```python
import asyncio

# ❌ Blocks the event loop — other requests are stalled
async def process_image(path: str):
    with open(path, 'rb') as f:  # synchronous blocking
        data = f.read()
    return heavy_cpu_work(data)  # CPU-bound blocking

# ✅ Delegate to a thread pool
async def process_image(path: str):
    loop = asyncio.get_event_loop()

    # I/O blocking
    data = await loop.run_in_executor(None, lambda: open(path, 'rb').read())

    # CPU-bound
    result = await loop.run_in_executor(None, heavy_cpu_work, data)
    return result
```

### 2-3. 非同期コンテキストマネージャ

```python
# DB sessions and HTTP clients should be managed with async with
async def fetch_users():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com/users")
        return response.json()

# Manually managing a session without async with risks leaks
async with async_session() as session:
    users = await session.execute(select(User))
```

### 2-4. asyncio.sleep

```python
# ❌ time.sleep — blocks the event loop
import time
async def retry_logic():
    time.sleep(1)  # no other coroutines can run for 1 second

# ✅ asyncio.sleep — yields control
async def retry_logic():
    await asyncio.sleep(1)  # other coroutines can run
```

## 3. よくある間違い

- `asyncio.gather(*[coro() for ...])` を使う場合、コルーチンは gather の呼び出し時ではなくリスト生成時に実行を開始する — タイミングに注意する。
- `create_task()` で作成して await しないタスクは、関数がリターンすると自動的にキャンセルされる。
- `async def` 関数を `await` なしで呼び出すとコルーチンオブジェクトが返るだけで、実行はされない。

## 4. チェックリスト

- [ ] 独立したコルーチンを asyncio.gather() で並列に実行しているか？
- [ ] 同期的なブロッキング関数を run_in_executor() で隔離しているか？
- [ ] time.sleep() ではなく await asyncio.sleep() を使っているか？
- [ ] 非同期リソースを async with で管理しているか？
