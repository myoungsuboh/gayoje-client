---
name: 实时通信客户端 (WebSocket / SSE)
description: WebSocket(双向)·SSE(服务器→客户端单向)客户端实现标准。在接入通知·订阅流·聊天等实时功能时，以及处理重连·连接状态·清理时阅读。关键词: WebSocket, SSE, EventSource, reconnect, exponential backoff, realtime, pubsub.
rules:
  - "单向服务器推送(通知·订阅流)用SSE，双向对话(聊天·协作)用WebSocket。"
  - "断连时以指数退避(1s→2s→4s…最多30s)自动重连，并设置最大重试次数。"
  - "卸载时必须关闭连接(close())以防止内存泄漏。"
  - "将连接状态(connecting·open·closed·error)暴露到状态管理中，以便在UI上显示。"
  - "按消息类型显式注册处理器，对未预期的消息记录日志后忽略。"
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

# 🔌 实时通信客户端

> 标准化WebSocket/SSE客户端的选型·重连·清理。在接入实时通知·订阅流·聊天时阅读。

## 1. 核心原则
- 单向服务器推送(通知·订阅流)用SSE，双向对话(聊天·协作)用WebSocket。
- 断连时以指数退避(1s→2s→4s…最多30s)自动重连，并设置最大重试次数。
- 卸载时必须关闭连接(`close()`)以防止内存泄漏。
- 将连接状态(connecting·open·closed·error)暴露到状态管理中，以便在UI上显示。
- 按消息类型显式注册处理器，对未预期的消息记录日志后忽略。

## 2. 规则

### 2-1. SSE — 单向
```js
function createSSE(url, handlers) {
  const es = new EventSource(url, { withCredentials: true })
  es.onopen = handlers.onOpen
  es.onmessage = e => handlers.onMessage(JSON.parse(e.data))
  es.onerror = () => { es.close(); scheduleReconnect() }
  return es
}
```

### 2-2. WebSocket — 双向
```js
function createWS(url) {
  const ws = new WebSocket(url)
  ws.onopen = () => console.log('[WS] connected')
  ws.onmessage = e => dispatch(JSON.parse(e.data))
  ws.onclose = e => { if (!e.wasClean) scheduleReconnect() }
  return ws
}
```

### 2-3. 指数退避重连
```js
let retryDelay = 1000
function scheduleReconnect() {
  setTimeout(() => { connect(); retryDelay = Math.min(retryDelay * 2, 30000) }, retryDelay)
}
function onConnected() { retryDelay = 1000 }   // 成功时重置
```

### 2-4. Vue composable (自动清理)
```js
export function useRealtimeFeed(url) {
  const messages = ref([])
  const status = ref('disconnected')
  let es = null
  onMounted(() => { es = createSSE(url, { /* ... */ }); status.value = 'connecting' })
  onUnmounted(() => es?.close())   // 防止泄漏
  return { messages, status }
}
```

## 3. 常见错误
- 卸载时漏掉close → 僵尸连接·内存泄漏。
- 重连没有退避 → 服务器过载(连接暴增)。
- 不把连接状态通知UI → 不知道是否已断开。
- 对简单通知使用WebSocket → SSE就够了(过度设计)。

## 4. 检查清单
- [ ] 是否按方向性选择了SSE/WebSocket
- [ ] 是否设置了指数退避重连 + 最大重试
- [ ] 卸载时是否关闭连接
- [ ] 是否通过状态管理暴露连接状态
- [ ] 是否按消息类型显式注册了处理器
