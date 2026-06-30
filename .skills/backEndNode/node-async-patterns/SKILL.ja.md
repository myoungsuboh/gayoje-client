---
name: Node.js 非同期パターンとエラーハンドリング
description: async/await と Promise をベースにした Node.js の非同期コードパターン — Promise.all による並列実行、エラー伝播、unhandledRejection の防止、ストリーム処理。Node.js バックエンドコードを書く・レビューする際に読むこと。Keywords: async-await, Promise.all, Promise.allSettled, unhandledRejection, stream, EventEmitter, try-catch.
rules:
  - "独立した非同期処理は逐次 await ではなく Promise.all で並列実行する。"
  - "async 関数内のエラーは try-catch で捕捉し、意味のあるエラー型に変換して呼び出し元へ再スローする。"
  - "process.on('unhandledRejection') と process.on('uncaughtException') を登録し、漏れたエラーがサーバーを静かに落とさないようにする。"
  - "コールバックベースの Node.js API は util.promisify で Promise 化し、async/await と統合する。"
  - "大きなファイルは Buffer 全体をメモリに読み込まず Stream.pipe で処理する。"
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

# ⚡ Node.js 非同期パターンとエラーハンドリング

> Node.js のイベントループベースの非同期コードに対する正しいパターン。逐次と並列の Promise を使い分け、エラーが静かに握りつぶされないようにする。

## 1. 基本原則

- 独立したタスクは並列で実行する（Promise.all）— 逐次 await は不要なレイテンシを生む。
- すべての async 関数はエラーを処理するか、呼び出し元へ伝播させなければならない。
- プロセスレベルのエラーハンドラを使い、サーバーが静かに停止するのを防ぐ。

## 2. ルール

### 2-1. 並列実行（Promise.all）

```javascript
// ❌ Unnecessary serial wait — total time = user time + orders time
const user = await getUser(id)
const orders = await getOrders(id)  // waits until user finishes

// ✅ Parallel — total time = max(user time, orders time)
const [user, orders] = await Promise.all([getUser(id), getOrders(id)])
```

### 2-2. 部分的な失敗の扱い（Promise.allSettled）

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

### 2-3. エラー伝播パターン

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

### 2-4. プロセスレベルのエラーハンドラ

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

### 2-5. 大きなファイルのストリーム処理

```javascript
// ❌ Loading an entire large file into memory — OOM risk
const data = fs.readFileSync('large-file.csv')

// ✅ Stream processing
const readStream = fs.createReadStream('large-file.csv')
const writeStream = fs.createWriteStream('output.csv')
readStream.pipe(transform).pipe(writeStream)
```

## 3. よくある間違い

- `for...of` と `await` の併用は自動的に逐次化される — 並列実行が必要なときは map + Promise.all を使う。
- Express では、`next(err)` に渡されない async ルートハンドラ内のエラーはグローバルエラーハンドラで捕捉されない。
- setTimeout/setInterval のコールバック内での同期的な throw は `uncaughtException` になる。コールバックを `async` にするのはより安全ではなく*より危険*だ — エラーは `unhandledRejection` となり、`.catch()` やハンドラを追加しない限り静かに握りつぶされる。

## 4. チェックリスト

- [ ] 独立した非同期処理は Promise.all で並列実行されているか？
- [ ] async 関数内のエラーは呼び出し元へ正しく伝播しているか？
- [ ] unhandledRejection/uncaughtException ハンドラは登録されているか？
- [ ] 大きなファイルの処理に Stream を使っているか？
