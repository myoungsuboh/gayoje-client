---
name: Node.js 异步模式与错误处理
description: 基于 async/await 和 Promise 的 Node.js 异步代码模式 — 使用 Promise.all 并行执行、错误传播、防止 unhandledRejection 以及流处理。在编写或审查 Node.js 后端代码时阅读。Keywords: async-await, Promise.all, Promise.allSettled, unhandledRejection, stream, EventEmitter, try-catch.
rules:
  - "用 Promise.all 并行执行相互独立的异步操作，而不是顺序 await。"
  - "在 async 函数内用 try-catch 捕获错误，并向调用方重新抛出有意义的错误类型。"
  - "注册 process.on('unhandledRejection') 和 process.on('uncaughtException')，使泄漏的错误不会悄无声息地杀死服务器。"
  - "使用 util.promisify 将基于回调的 Node.js API 转换为 Promise，以便与 async/await 集成。"
  - "用 Stream.pipe 处理大文件，而不是将整个 Buffer 加载到内存中。"
tags:
  - "async-await"
  - "Promise.all"
  - "Promise.allSettled"
  - "unhandledRejection"
  - "stream"
  - "EventEmitter"
  - "try-catch"
  - "promisify"
---

# ⚡ Node.js 异步模式与错误处理

> 针对 Node.js 基于事件循环的异步代码的正确模式。在串行与并行 Promise 之间做选择，并确保错误绝不会被悄无声息地丢弃。

## 1. 核心原则

- 并行运行相互独立的任务（Promise.all）— 串行 await 会引入不必要的延迟。
- 每个 async 函数都必须要么处理错误，要么将其传播给调用方。
- 使用进程级错误处理器，防止服务器悄无声息地关闭。

## 2. 规则

### 2-1. 并行执行（Promise.all）

```javascript
// ❌ Unnecessary serial wait — total time = user time + orders time
const user = await getUser(id)
const orders = await getOrders(id)  // waits until user finishes

// ✅ Parallel — total time = max(user time, orders time)
const [user, orders] = await Promise.all([getUser(id), getOrders(id)])
```

### 2-2. 处理部分失败（Promise.allSettled）

```javascript
// Use when some operations can fail without cancelling the rest
const results = await Promise.allSettled([
  sendEmail(user1),
  sendEmail(user2),
  sendEmail(user3),
])

results.forEach((result, i) => {
  if (result.status === 'rejected') {
    logger.error(`Failed to send email to user ${i}: ${result.reason}`)
  }
})
```

### 2-3. 错误传播模式

```javascript
// ❌ Swallowing errors — caller doesn't know about the failure
async function getUser(id) {
  try {
    return await db.find(id)
  } catch (err) {
    console.log(err)  // only logs, returns undefined
  }
}

// ✅ Re-throw with meaningful error type
async function getUser(id) {
  try {
    const user = await db.find(id)
    if (!user) throw new NotFoundError(`User ${id} not found`)
    return user
  } catch (err) {
    if (err instanceof NotFoundError) throw err
    throw new DatabaseError('Failed to fetch user', { cause: err })
  }
}
```

### 2-4. 进程级错误处理器

```javascript
// Top of app.js
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { reason, promise })
  process.exit(1)  // trigger graceful shutdown
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})
```

### 2-5. 大文件的流处理

```javascript
// ❌ Loading an entire large file into memory — OOM risk
const data = fs.readFileSync('large-file.csv')

// ✅ Stream processing
const readStream = fs.createReadStream('large-file.csv')
const writeStream = fs.createWriteStream('output.csv')
readStream.pipe(transform).pipe(writeStream)
```

## 3. 常见错误

- 将 `for...of` 与 `await` 一起使用会自动串行化 — 需要并行执行时请使用 map + Promise.all。
- 在 Express 中，async 路由处理器内未传给 `next(err)` 的错误不会被全局错误处理器捕获。
- 在 setTimeout/setInterval 回调中同步 throw 会变成 `uncaughtException`。把回调改成 `async` *更*危险而非更安全 — 错误会变成 `unhandledRejection`，除非你添加 `.catch()` 或处理器，否则会被悄无声息地吞掉。

## 4. 检查清单

- [ ] 相互独立的异步操作是否用 Promise.all 并行执行？
- [ ] async 函数内的错误是否正确传播给调用方？
- [ ] 是否注册了 unhandledRejection/uncaughtException 处理器？
- [ ] 大文件处理是否使用了 Stream？
