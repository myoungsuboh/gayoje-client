---
name: Python Async Patterns (asyncio / async-await)
description: Async code patterns based on Python asyncio — parallel execution with asyncio.gather, async context managers, async generators, and integrating synchronous code with run_in_executor. Read when writing async Python backends with FastAPI, async SQLAlchemy, etc. Keywords: async-def, await, asyncio.gather, asyncio.create_task, run_in_executor, AsyncContextManager, aiohttp, httpx.
rules:
  - "Run independent coroutines in parallel with asyncio.gather() instead of sequential awaits."
  - "Calling synchronous blocking functions (file I/O, CPU-bound work) directly inside an async function blocks the event loop — delegate them to a thread pool with loop.run_in_executor()."
  - "A task created with asyncio.create_task() must be kept referenced or awaited to prevent it from being cancelled by garbage collection."
  - "Manage async resources (DB connections, HTTP sessions) with async with context managers to prevent leaks."
  - "Use await asyncio.sleep() instead of time.sleep() inside async functions."
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

# ⚡ Python Async Patterns (asyncio)

> Correct patterns for Python asyncio-based async code. Parallel execution, isolating blocking calls, and managing async resources are the core concerns.

## 1. Core Principles

- Run independent coroutines with asyncio.gather() in parallel to reduce latency.
- Delegate synchronous blocking functions to a thread pool with run_in_executor() to protect the event loop.
- Manage async resources with async with to prevent leaks.

## 2. Rules

### 2-1. Parallel Execution (asyncio.gather)

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

### 2-2. Isolating Blocking Functions

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

### 2-3. Async Context Managers

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

## 3. Common Mistakes

- When using `asyncio.gather(*[coro() for ...])`, coroutines start running at list creation time, not at the gather call — be aware of the timing.
- A task created with `create_task()` that is not awaited is automatically cancelled when the function returns.
- Calling an `async def` function without `await` only returns a coroutine object — it does not execute.

## 4. Checklist

- [ ] Are independent coroutines run in parallel with asyncio.gather()?
- [ ] Are synchronous blocking functions isolated with run_in_executor()?
- [ ] Is await asyncio.sleep() used instead of time.sleep()?
- [ ] Are async resources managed with async with?
