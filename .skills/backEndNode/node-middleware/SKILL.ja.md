---
name: Node.js ミドルウェアパターン (Express / NestJS)
description: Express のミドルウェアチェーンと NestJS の Interceptor/Guard/Pipe — 認証、ロギング、エラーハンドリング、リクエスト変換といった横断的関心事のパターン。複数ルートにまたがる関心事を構造化する際に読むこと。Keywords: middleware, next(), Interceptor, Guard, Pipe, error-handler, cors, helmet, rate-limit.
rules:
  - "横断的関心事（認証、ロギング、CORS、レート制限）はミドルウェア/インターセプタに分離し、ルートハンドラに混在させない。"
  - "エラーハンドリングミドルウェアは引数をちょうど4つ（err, req, res, next）持ち、チェーンの最後に登録しなければならない。"
  - "next() を呼んだあとに追加のコードを実行しない — next() のあとのコードは 'headers already sent' エラーを引き起こしうる。"
  - "helmet と cors をグローバルミドルウェアとして登録し、基本的なセキュリティヘッダを設定する。"
  - "ミドルウェア内で発生した非同期エラーは next(err) でエラーハンドラへ渡さなければならない。"
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

# 🔗 Node.js ミドルウェアパターン

> Express のミドルウェアと NestJS のパイプラインを使って横断的関心事を構造化する。登録順序とエラー伝播が重要なポイントだ。

## 1. 基本原則

- 横断的関心事（認証、ロギング、エラーハンドリング）はミドルウェア/インターセプタに置く。
- ミドルウェアの登録順 = 実行順: セキュリティ（helmet, cors）→ パース → 認証 → ルート → エラーハンドラ。
- 非同期ミドルウェアのエラーは next(err) に転送しなければならない。

## 2. ルール

### 2-1. Express ミドルウェアの登録順

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

### 2-2. 非同期ミドルウェアのエラーハンドリング

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

### 2-3. グローバルエラーハンドラ（引数4つ）

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

### 2-4. NestJS パイプラインの順序

```
Request → Guard (auth/permission) → Interceptor (before) → Pipe (transform/validate) → Handler → Interceptor (after) → Response
```

## 3. よくある間違い

- `return` 文なしで `next()` のあとにコード実行を続けると "Cannot set headers after they are sent." が発生する。
- 引数が3つのエラーハンドラは通常のミドルウェアとして扱われる — ちょうど4つ（err, req, res, next）でなければならない。
- ルートのあとに `cors()` を登録すると、プリフライトの OPTIONS リクエストが処理されない。

## 4. チェックリスト

- [ ] ミドルウェアは セキュリティ → パース → ロギング → ルート → エラーハンドラ の順で登録されているか？
- [ ] 非同期ミドルウェアのエラーは next(err) で転送されているか？
- [ ] エラーハンドラは引数をちょうど4つ持ち、最後に登録されているか？
- [ ] helmet と cors はグローバルに登録されているか？
