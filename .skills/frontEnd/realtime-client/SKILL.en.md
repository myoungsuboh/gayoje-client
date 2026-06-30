---
name: Realtime Communication Client (WebSocket / SSE)
description: Standard for implementing WebSocket (bidirectional) and SSE (server→client one-way) clients. Read this when adding realtime features like notifications, feeds, or chat, and when handling reconnection, connection state, and cleanup. Keywords: WebSocket, SSE, EventSource, reconnect, exponential backoff, realtime, pubsub.
rules:
  - "Use SSE for one-way server push (notifications, feeds) and WebSocket for bidirectional conversation (chat, collaboration)."
  - "On disconnect, auto-reconnect with exponential backoff (1s→2s→4s…up to 30s) and cap the maximum retries."
  - "Always close the connection on unmount (close()) to prevent memory leaks."
  - "Expose connection state (connecting·open·closed·error) in state management so the UI can display it."
  - "Register a handler per message type explicitly, and log-then-ignore unexpected messages."
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

# 🔌 Realtime Communication Client

> Standardize the selection, reconnection, and cleanup of WebSocket/SSE clients. Read this when adding realtime notifications, feeds, or chat.

## 1. Core Principles
- Use SSE for one-way server push (notifications, feeds) and WebSocket for bidirectional conversation (chat, collaboration).
- On disconnect, auto-reconnect with exponential backoff (1s→2s→4s…up to 30s) and cap the maximum retries.
- Always close the connection on unmount (`close()`) to prevent memory leaks.
- Expose connection state (connecting·open·closed·error) in state management so the UI can display it.
- Register a handler per message type explicitly, and log-then-ignore unexpected messages.

## 2. Rules

### 2-1. SSE — One-way
```js
function createSSE(url, handlers) {
  const es = new EventSource(url, { withCredentials: true })
  es.onopen = handlers.onOpen
  es.onmessage = e => handlers.onMessage(JSON.parse(e.data))
  es.onerror = () => { es.close(); scheduleReconnect() }
  return es
}
```

### 2-2. WebSocket — Bidirectional
```js
function createWS(url) {
  const ws = new WebSocket(url)
  ws.onopen = () => console.log('[WS] connected')
  ws.onmessage = e => dispatch(JSON.parse(e.data))
  ws.onclose = e => { if (!e.wasClean) scheduleReconnect() }
  return ws
}
```

### 2-3. Exponential backoff reconnect
```js
let retryDelay = 1000
function scheduleReconnect() {
  setTimeout(() => { connect(); retryDelay = Math.min(retryDelay * 2, 30000) }, retryDelay)
}
function onConnected() { retryDelay = 1000 }   // reset on success
```

### 2-4. Vue composable (auto cleanup)
```js
export function useRealtimeFeed(url) {
  const messages = ref([])
  const status = ref('disconnected')
  let es = null
  onMounted(() => { es = createSSE(url, { /* ... */ }); status.value = 'connecting' })
  onUnmounted(() => es?.close())   // prevent leaks
  return { messages, status }
}
```

## 3. Common Mistakes
- Missing close on unmount → zombie connections and memory leaks.
- No backoff on reconnect → server overload (connection storm).
- Not surfacing connection state to the UI → no way to tell it dropped.
- Using WebSocket for simple notifications → SSE is enough (over-engineering).

## 4. Checklist
- [ ] Did you choose SSE/WebSocket according to directionality?
- [ ] Did you add exponential backoff reconnect + max retries?
- [ ] Do you close the connection on unmount?
- [ ] Do you expose connection state through state management?
- [ ] Did you register a handler per message type explicitly?
