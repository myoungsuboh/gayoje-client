---
name: リアルタイム通信クライアント (WebSocket / SSE)
description: WebSocket(双方向)・SSE(サーバー→クライアントの単方向)クライアント実装の標準。通知・フィード・チャットのようなリアルタイム機能を追加するとき、再接続・接続状態・後始末を扱うときに読む。キーワード: WebSocket, SSE, EventSource, reconnect, exponential backoff, realtime, pubsub.
rules:
  - "単方向のサーバープッシュ(通知・フィード)にはSSEを、双方向の対話(チャット・コラボレーション)にはWebSocketを使う。"
  - "切断時は指数バックオフ(1s→2s→4s…最大30s)で自動再接続し、最大リトライ回数を設ける。"
  - "アンマウント時は必ず接続を閉じて(close())メモリリークを防ぐ。"
  - "接続状態(connecting・open・closed・error)を状態管理に公開し、UIに表示する。"
  - "メッセージ種別ごとのハンドラを明示的に登録し、想定外のメッセージはログ出力のうえ無視する。"
tags:
  - "WebSocket"
  - "SSE"
  - "EventSource"
  - "reconnect"
  - "exponential backoff"
  - "realtime"
  - "pubsub"
  - "websocket"
  - "sse"
  - "ws"
---

# 🔌 リアルタイム通信クライアント

> WebSocket/SSEクライアントの選択・再接続・後始末を標準化する。リアルタイム通知・フィード・チャットを追加するときに読む。

## 1. 基本原則
- 単方向のサーバープッシュ(通知・フィード)にはSSEを、双方向の対話(チャット・コラボレーション)にはWebSocketを使う。
- 切断時は指数バックオフ(1s→2s→4s…最大30s)で自動再接続し、最大リトライ回数を設ける。
- アンマウント時は必ず接続を閉じて(`close()`)メモリリークを防ぐ。
- 接続状態(connecting・open・closed・error)を状態管理に公開し、UIに表示する。
- メッセージ種別ごとのハンドラを明示的に登録し、想定外のメッセージはログ出力のうえ無視する。

## 2. ルール

### 2-1. SSE — 単方向
```js
function createSSE(url, handlers) {
  const es = new EventSource(url, { withCredentials: true })
  es.onopen = handlers.onOpen
  es.onmessage = e => handlers.onMessage(JSON.parse(e.data))
  es.onerror = () => { es.close(); scheduleReconnect() }
  return es
}
```

### 2-2. WebSocket — 双方向
```js
function createWS(url) {
  const ws = new WebSocket(url)
  ws.onopen = () => console.log('[WS] connected')
  ws.onmessage = e => dispatch(JSON.parse(e.data))
  ws.onclose = e => { if (!e.wasClean) scheduleReconnect() }
  return ws
}
```

### 2-3. 指数バックオフ再接続
```js
let retryDelay = 1000
function scheduleReconnect() {
  setTimeout(() => { connect(); retryDelay = Math.min(retryDelay * 2, 30000) }, retryDelay)
}
function onConnected() { retryDelay = 1000 }   // 成功時にリセット
```

### 2-4. Vue composable (自動後始末)
```js
export function useRealtimeFeed(url) {
  const messages = ref([])
  const status = ref('disconnected')
  let es = null
  onMounted(() => { es = createSSE(url, { /* ... */ }); status.value = 'connecting' })
  onUnmounted(() => es?.close())   // リーク防止
  return { messages, status }
}
```

## 3. よくある間違い
- アンマウント時のclose漏れ → ゾンビ接続・メモリリーク。
- 再接続にバックオフがない → サーバー過負荷(接続の急増)。
- 接続状態をUIに通知しない → 切れたかどうか分からない。
- 単純な通知にWebSocketを使う → SSEで十分(過剰設計)。

## 4. チェックリスト
- [ ] 方向性に合わせてSSE/WebSocketを選んだか
- [ ] 指数バックオフ再接続 + 最大リトライを設けたか
- [ ] アンマウント時に接続を閉じているか
- [ ] 接続状態を状態管理で公開しているか
- [ ] メッセージ種別ごとのハンドラを明示的に登録したか
