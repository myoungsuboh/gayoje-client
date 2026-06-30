---
name: 실시간 통신 클라이언트 (WebSocket / SSE)
description: WebSocket(양방향)·SSE(서버→클라 단방향) 클라이언트 구현 표준. 알림·피드·채팅 같은 실시간 기능을 붙일 때, 재연결·연결 상태·정리를 다룰 때 읽는다. 키워드: WebSocket, SSE, EventSource, reconnect, exponential backoff, realtime, pubsub.
rules:
  - "단방향 서버 푸시(알림·피드)는 SSE, 양방향 대화(채팅·협업)는 WebSocket을 쓴다."
  - "연결 끊김 시 지수 백오프(1s→2s→4s…최대 30s)로 자동 재연결하고 최대 재시도를 둔다."
  - "언마운트 시 반드시 연결을 닫아(close()) 메모리 누수를 막는다."
  - "연결 상태(connecting·open·closed·error)를 상태 관리에 노출해 UI에 표시한다."
  - "메시지 타입별 핸들러를 명시 등록하고, 예상 못한 메시지는 로그 후 무시한다."
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

# 🔌 실시간 통신 클라이언트

> WebSocket/SSE 클라이언트의 선택·재연결·정리를 표준화한다. 실시간 알림·피드·채팅을 붙일 때 읽는다.

## 1. 핵심 원칙
- 단방향 서버 푸시(알림·피드)는 SSE, 양방향 대화(채팅·협업)는 WebSocket을 쓴다.
- 연결 끊김 시 지수 백오프(1s→2s→4s…최대 30s)로 자동 재연결하고 최대 재시도를 둔다.
- 언마운트 시 반드시 연결을 닫아(`close()`) 메모리 누수를 막는다.
- 연결 상태(connecting·open·closed·error)를 상태 관리에 노출해 UI에 표시한다.
- 메시지 타입별 핸들러를 명시 등록하고, 예상 못한 메시지는 로그 후 무시한다.

## 2. 규칙

### 2-1. SSE — 단방향
```js
function createSSE(url, handlers) {
  const es = new EventSource(url, { withCredentials: true })
  es.onopen = handlers.onOpen
  es.onmessage = e => handlers.onMessage(JSON.parse(e.data))
  es.onerror = () => { es.close(); scheduleReconnect() }
  return es
}
```

### 2-2. WebSocket — 양방향
```js
function createWS(url) {
  const ws = new WebSocket(url)
  ws.onopen = () => console.log('[WS] connected')
  ws.onmessage = e => dispatch(JSON.parse(e.data))
  ws.onclose = e => { if (!e.wasClean) scheduleReconnect() }
  return ws
}
```

### 2-3. 지수 백오프 재연결
```js
let retryDelay = 1000
function scheduleReconnect() {
  setTimeout(() => { connect(); retryDelay = Math.min(retryDelay * 2, 30000) }, retryDelay)
}
function onConnected() { retryDelay = 1000 }   // 성공 시 리셋
```

### 2-4. Vue composable (자동 정리)
```js
export function useRealtimeFeed(url) {
  const messages = ref([])
  const status = ref('disconnected')
  let es = null
  onMounted(() => { es = createSSE(url, { /* ... */ }); status.value = 'connecting' })
  onUnmounted(() => es?.close())   // 누수 방지
  return { messages, status }
}
```

## 3. 흔한 실수
- 언마운트 시 close 누락 → 좀비 연결·메모리 누수.
- 재연결에 백오프 없음 → 서버 폭주(연결 폭증).
- 연결 상태를 UI에 안 알림 → 끊겼는지 모름.
- 단순 알림에 WebSocket 사용 → SSE면 충분(과설계).

## 4. 체크리스트
- [ ] 방향성에 맞게 SSE/WebSocket을 선택했는가
- [ ] 지수 백오프 재연결 + 최대 재시도를 두었는가
- [ ] 언마운트 시 연결을 닫는가
- [ ] 연결 상태를 상태 관리로 노출하는가
- [ ] 메시지 타입별 핸들러를 명시 등록했는가
