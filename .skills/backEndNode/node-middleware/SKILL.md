---
name: Node.js Middleware Patterns (Express / NestJS)
description: Express middleware chaining and NestJS Interceptors/Guards/Pipes — authentication, logging, error handling, and request transformation patterns for cross-cutting concerns. Read when structuring concerns that span multiple routes. Keywords: middleware, next(), Interceptor, Guard, Pipe, error-handler, cors, helmet, rate-limit.
rules:
  - "Separate cross-cutting concerns (auth, logging, CORS, rate limiting) into middleware/interceptors — do not mix them into route handlers."
  - "The error-handling middleware must have exactly 4 arguments (err, req, res, next) and must be registered last in the chain."
  - "Do not execute additional code after calling next() — code after next() can cause 'headers already sent' errors."
  - "Register helmet and cors as global middleware to set baseline security headers."
  - "Async errors that occur inside middleware must be passed to the error handler via next(err)."
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

# 🔗 Node.js Middleware Patterns

> Use Express middleware and the NestJS pipeline to structure cross-cutting concerns. Registration order and error propagation are the critical details.

## 1. Core Principles

- Cross-cutting concerns (auth, logging, error handling) belong in middleware/interceptors.
- Middleware registration order = execution order: security (helmet, cors) → parsing → auth → routes → error handler.
- Async middleware errors must be forwarded to next(err).

## 2. Rules

### 2-1. Express Middleware Registration Order

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

### 2-2. Async Middleware Error Handling

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

### 2-3. Global Error Handler (4 arguments)

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

### 2-4. NestJS Pipeline Order

```
Request → Guard (auth/permission) → Interceptor (before) → Pipe (transform/validate) → Handler → Interceptor (after) → Response
```

## 3. Common Mistakes

- Continuing code execution after `next()` without a `return` statement causes "Cannot set headers after they are sent."
- An error handler with 3 arguments is treated as regular middleware — it must have exactly 4 (err, req, res, next).
- Registering `cors()` after routes means preflight OPTIONS requests are not handled.

## 4. Checklist

- [ ] Is middleware registered in the order: security → parsing → logging → routes → error handler?
- [ ] Are async middleware errors forwarded via next(err)?
- [ ] Does the error handler have exactly 4 arguments and is it registered last?
- [ ] Are helmet and cors registered globally?
