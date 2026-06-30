---
name: Python 异步模式 (asyncio / async-await)
description: 基于 Python asyncio 的异步代码模式 —— 用 asyncio.gather 并行执行、异步上下文管理器、异步生成器，以及用 run_in_executor 集成同步代码。在使用 FastAPI、异步 SQLAlchemy 等编写异步 Python 后端时阅读。关键词: async-def, await, asyncio.gather, asyncio.create_task, run_in_executor, AsyncContextManager, aiohttp, httpx.
rules:
  - "用 asyncio.gather() 并行运行相互独立的协程，而非顺序 await。"
  - "在 async 函数内直接调用同步阻塞函数（文件 I/O、CPU 密集型工作）会阻塞事件循环 —— 用 loop.run_in_executor() 将其委托给线程池。"
  - "用 asyncio.create_task() 创建的任务必须保留引用或被 await，以防被垃圾回收取消。"
  - "用 async with 上下文管理器管理异步资源（数据库连接、HTTP 会话）以防止泄漏。"
  - "在 async 函数内使用 await asyncio.sleep() 而非 time.sleep()。"
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

# ⚡ Python 异步模式 (asyncio)

> Python asyncio 异步代码的正确模式。并行执行、隔离阻塞调用、管理异步资源是核心关注点。

## 1. 核心原则

- 用 asyncio.gather() 并行运行相互独立的协程以降低延迟。
- 用 run_in_executor() 将同步阻塞函数委托给线程池以保护事件循环。
- 用 async with 管理异步资源以防止泄漏。

## 2. 规则

### 2-1. 并行执行 (asyncio.gather)

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

### 2-2. 隔离阻塞函数

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

### 2-3. 异步上下文管理器

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

## 3. 常见错误

- 使用 `asyncio.gather(*[coro() for ...])` 时，协程在列表创建时即开始运行，而非在 gather 调用时 —— 需注意时机。
- 用 `create_task()` 创建却未被 await 的任务会在函数返回时自动取消。
- 调用 `async def` 函数却不加 `await` 只会返回一个协程对象 —— 并不会执行。

## 4. 检查清单

- [ ] 是否用 asyncio.gather() 并行运行相互独立的协程？
- [ ] 是否用 run_in_executor() 隔离同步阻塞函数？
- [ ] 是否使用 await asyncio.sleep() 而非 time.sleep()？
- [ ] 是否用 async with 管理异步资源？
