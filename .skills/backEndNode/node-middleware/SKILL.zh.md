---
name: Node.js 中间件模式 (Express / NestJS)
description: Express 中间件链与 NestJS 的 Interceptor/Guard/Pipe — 用于横切关注点的认证、日志、错误处理和请求转换模式。在为跨多个路由的关注点设计结构时阅读。Keywords: middleware, next(), Interceptor, Guard, Pipe, error-handler, cors, helmet, rate-limit.
rules:
  - "将横切关注点（认证、日志、CORS、限流）分离到中间件/拦截器中 — 不要混入路由处理器。"
  - "错误处理中间件必须恰好有 4 个参数（err, req, res, next），并且必须在链中最后注册。"
  - "调用 next() 之后不要再执行额外代码 — next() 之后的代码可能导致 'headers already sent' 错误。"
  - "将 helmet 和 cors 注册为全局中间件，以设置基线安全头。"
  - "中间件内发生的异步错误必须通过 next(err) 传递给错误处理器。"
tags:
  - "middleware"
  - "next()"
  - "Interceptor"
  - "Guard"
  - "Pipe"
  - "error-handler"
  - "cors"
  - "helmet"
  - "rate-limit"
---

# 🔗 Node.js 中间件模式

> 使用 Express 中间件和 NestJS 管道来组织横切关注点。注册顺序和错误传播是关键细节。

## 1. 核心原则

- 横切关注点（认证、日志、错误处理）应放在中间件/拦截器中。
- 中间件注册顺序 = 执行顺序: 安全（helmet, cors）→ 解析 → 认证 → 路由 → 错误处理器。
- 异步中间件错误必须转发给 next(err)。

## 2. 规则

### 2-1. Express 中间件注册顺序

```javascript
const app = express()

// 1. Security headers
app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGIN }))

// 2. Request parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 3. Logging
app.use(morgan('combined'))

// 4. Rate limiting
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))

// 5. Routes
app.use('/api/users', usersRouter)

// 6. Error handler (must be last)
app.use(errorHandler)
```

### 2-2. 异步中间件错误处理

```javascript
// ❌ Async errors don't reach Express error handler
app.get('/users/:id', async (req, res) => {
  const user = await getUser(req.params.id)  // error → unhandledRejection
  res.json(user)
})

// ✅ try-catch + next(err)
app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await getUser(req.params.id)
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// Or use an asyncHandler wrapper
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await getUser(req.params.id)
  res.json(user)
}))
```

### 2-3. 全局错误处理器（4 个参数）

```javascript
// Must have exactly 4 arguments for Express to recognize it as an error handler
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  logger.error({ err, req: { method: req.method, url: req.url } })

  res.status(statusCode).json({
    error: { message, ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) }
  })
}
```

### 2-4. NestJS 管道顺序

```
Request → Guard (auth/permission) → Interceptor (before) → Pipe (transform/validate) → Handler → Interceptor (after) → Response
```

## 3. 常见错误

- 没有 `return` 语句就在 `next()` 之后继续执行代码会导致 "Cannot set headers after they are sent."。
- 具有 3 个参数的错误处理器会被当作普通中间件 — 它必须恰好有 4 个（err, req, res, next）。
- 在路由之后注册 `cors()` 意味着预检 OPTIONS 请求不会被处理。

## 4. 检查清单

- [ ] 中间件是否按 安全 → 解析 → 日志 → 路由 → 错误处理器 的顺序注册？
- [ ] 异步中间件错误是否通过 next(err) 转发？
- [ ] 错误处理器是否恰好有 4 个参数并且最后注册？
- [ ] helmet 和 cors 是否全局注册？
