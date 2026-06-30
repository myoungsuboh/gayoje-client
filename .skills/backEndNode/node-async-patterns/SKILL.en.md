---
name: Node.js Async Patterns & Error Handling
description: Async code patterns for Node.js based on async/await and Promises — parallel execution with Promise.all, error propagation, unhandledRejection prevention, and stream processing. Read when writing or reviewing Node.js backend code. Keywords: async-await, Promise.all, Promise.allSettled, unhandledRejection, stream, EventEmitter, try-catch.
rules:
  - "Run independent async operations in parallel with Promise.all instead of sequential awaits."
  - "Catch errors inside async functions with try-catch and re-throw meaningful error types to the caller."
  - "Register process.on('unhandledRejection') and process.on('uncaughtException') so leaked errors don't silently kill the server."
  - "Convert callback-based Node.js APIs to Promises using util.promisify to integrate with async/await."
  - "Process large files with Stream.pipe instead of loading the entire Buffer into memory."
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

# ⚡ Node.js Async Patterns & Error Handling

> Correct patterns for Node.js event-loop-based async code. Choosing between serial and parallel Promises, and ensuring errors are never silently dropped.

## 1. Core Principles

- Run independent tasks in parallel (Promise.all) — serial awaits introduce unnecessary latency.
- Every async function must either handle errors or propagate them to the caller.
- Use process-level error handlers to prevent the server from silently shutting down.

## 2. Rules

### 2-1. Parallel Execution (Promise.all)

```javascript
// ❌ Unnecessary serial wait — total time = user time + orders time
const user = await getUser(id)
const orders = await getOrders(id)  // waits until user finishes

// ✅ Parallel — total time = max(user time, orders time)
const [user, orders] = await Promise.all([getUser(id), getOrders(id)])
```

### 2-2. Handling Partial Failures (Promise.allSettled)

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

### 2-3. Error Propagation Pattern

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

### 2-4. Process-Level Error Handlers

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

### 2-5. Stream Processing for Large Files

```javascript
// ❌ Loading an entire large file into memory — OOM risk
const data = fs.readFileSync('large-file.csv')

// ✅ Stream processing
const readStream = fs.createReadStream('large-file.csv')
const writeStream = fs.createWriteStream('output.csv')
readStream.pipe(transform).pipe(writeStream)
```

## 3. Common Mistakes

- Using `for...of` with `await` automatically serializes — use map + Promise.all when parallel execution is needed.
- In Express, errors inside async route handlers that are not passed to `next(err)` will not be caught by the global error handler.
- A synchronous throw inside a setTimeout/setInterval callback becomes an `uncaughtException`. Making the callback `async` is *more* dangerous, not safer — the error becomes an `unhandledRejection` that is silently swallowed unless you add a `.catch()` or a handler.

## 4. Checklist

- [ ] Are independent async operations run in parallel with Promise.all?
- [ ] Do errors inside async functions propagate properly to callers?
- [ ] Are unhandledRejection/uncaughtException handlers registered?
- [ ] Is Stream used for large file processing?
