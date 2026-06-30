---
name: Vite 브라우저 호환성 오류 방지 가이드 (Vite Browser Compatibility)
description: Vite 환경에서 Node.js 전용 라이브러리(sockjs-client 등) 사용 시 발생하는 global/Buffer/process is not defined 등 브라우저 호환성 오류의 원인과 해결 패턴입니다. WebSocket/SockJS 연결이나 빌드 ReferenceError를 디버깅할 때 읽습니다. 키워드 global, Buffer, process, globalThis, vite-plugin-node-polyfills, SockJS, STOMP.
rules:
  - "브라우저에는 global, Buffer, process 같은 Node.js 전역 객체가 없다."
  - "global은 vite.config.js의 define: { global: 'globalThis' }로 폴리필하는 것이 가장 권장된다."
  - "Buffer는 vite-plugin-node-polyfills로 폴리필하는 것이 가장 깔끔하다."
  - "가능하면 SockJS 없이 브라우저 내장 WebSocket을 사용해 global 문제 자체를 회피한다."
  - "라우터 초기화 오류로 앱 전체가 죽지 않도록 router.onError로 보호한다."
tags:
  - "vite"
  - "vite.config"
  - "@vitejs"
  - "esbuild"
  - "polyfill"
  - "browserslist"
---

# ⚙️ Vite 브라우저 호환성 오류 방지 가이드

> Vite 번들이 브라우저에 없는 Node.js 전역 객체(global, Buffer, process)를 참조하는 라이브러리 때문에 터지는 오류의 원인과 해결책을 정의한다. `ReferenceError`가 발생하거나 SockJS/STOMP WebSocket을 붙일 때 읽는다.

## 1. 핵심 원칙
- 브라우저에는 `global`, `Buffer`, `process` 같은 Node.js 전역 객체가 없다.
- `global`은 `vite.config.js`의 `define: { global: 'globalThis' }`로 폴리필하는 것이 가장 권장된다.
- `Buffer`는 `vite-plugin-node-polyfills`로 폴리필하는 것이 가장 깔끔하다.
- 가능하면 SockJS 없이 브라우저 내장 `WebSocket`을 사용해 `global` 문제 자체를 회피한다.
- 라우터 초기화 오류로 앱 전체가 죽지 않도록 `router.onError`로 보호한다.

## 왜 이 오류가 발생하는가

Node.js 환경에는 `global`, `Buffer`, `process` 같은 전역 객체가 있다.
Vite는 브라우저용으로 번들링하기 때문에 이 전역 객체들이 존재하지 않는다.
`sockjs-client`, `@stomp/stompjs` 같은 라이브러리가 Node.js 전역 객체를 참조하면
브라우저에서 `ReferenceError`가 발생하고, Vue Router 초기화 중 터지면 라우팅 전체가 죽는다.

```
ReferenceError: global is not defined
  at sockjs-client/lib/utils/browser-crypto.js
    ↓
[Vue Router warn]: Unexpected error when starting the router
    ↓
라우팅 전체 불능 상태
```

## 2. 규칙

### 2-1. `global is not defined` 해결

#### ✅ 방법 1 — vite.config.js에 define 추가 (가장 권장)

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: {
    global: 'globalThis',   // global → globalThis로 폴리필
  },
})
```

> `globalThis`는 브라우저/Node.js 모두에서 동작하는 표준 전역 객체다.
> Vite가 빌드 시 소스코드의 `global`을 `globalThis`로 치환해준다.

#### ✅ 방법 2 — index.html에 인라인 폴리필 (빠른 임시 해결)

```html
<!-- index.html <head> 최상단 -->
<script>
  if (typeof global === 'undefined') {
    var global = globalThis;
  }
</script>
```

#### ✅ 방법 3 — main.js 최상단에 폴리필 (방법 2 대안)

```js
// src/main.js — 반드시 다른 import보다 먼저 위치해야 함
if (typeof global === 'undefined') {
  window.global = window
}

import { createApp } from 'vue'
import App from './App.vue'
// ...
```

### 2-2. `Buffer is not defined` 해결

Node.js의 `Buffer`가 없어서 발생. `vite-plugin-node-polyfills` 사용이 가장 깔끔하다.

```bash
pnpm add -D vite-plugin-node-polyfills
```

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills({
      include: ['buffer', 'process', 'global'],  // 필요한 것만 선택
    }),
  ],
})
```

### 2-3. `process is not defined` 해결

```js
// vite.config.js
export default defineConfig({
  define: {
    global: 'globalThis',
    'process.env': {},       // process.env 접근 허용 (빈 객체로 안전하게)
  },
})
```

### 2-4. WebSocket / SockJS 사용 시 권장 패턴

`sockjs-client`를 직접 import하면 `global` 오류가 반복된다.
STOMP over WebSocket이 필요하다면 `@stomp/stompjs`를 사용하고 vite define 설정을 함께 적용한다.

```bash
pnpm add @stomp/stompjs
```

```js
// vite.config.js — @stomp/stompjs + sockjs-client 사용 시 필수
export default defineConfig({
  define: {
    global: 'globalThis',
  },
})
```

```js
// WebSocket 연결 예시 (Vue 컴포넌트)
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const client = new Client({
  webSocketFactory: () => new SockJS('/ws'),  // SockJS 사용 시
  // webSocketFactory: () => new WebSocket('ws://localhost:8080/ws'),  // 네이티브 WS
  onConnect: () => {
    console.log('WebSocket 연결됨')
    client.subscribe('/topic/data', (message) => {
      console.log(JSON.parse(message.body))
    })
  },
  onDisconnect: () => console.log('WebSocket 연결 해제'),
  reconnectDelay: 5000,
})

client.activate()
```

> **네이티브 WebSocket 권장:** SockJS 없이 브라우저 내장 `WebSocket`을 사용하면
> `global` 문제 자체가 발생하지 않는다. Spring Boot에서 `@EnableWebSocket`으로 설정.

### 2-5. Vue Router 초기화 중 오류 발생 시 전체 라우팅 보호

라우터 초기화 중 비동기 오류가 발생하면 Vue Router가 멈춘다.
`router.onError`로 캐치해서 앱이 죽지 않도록 처리한다.

```js
// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [...],
})

// 라우터 전역 오류 핸들러 — 초기화 오류로 앱 전체가 죽는 것을 방지
router.onError((error) => {
  console.error('[Router Error]', error)
  // 필요 시 에러 페이지로 이동
  // router.push('/error')
})

export default router
```

### 2-6. 자주 발생하는 Vite 호환성 오류 빠른 참조표

| 오류 메시지 | 원인 라이브러리 예시 | 해결 방법 |
|------------|---------------------|-----------|
| `global is not defined` | sockjs-client, mqtt | `vite.config.js` → `define: { global: 'globalThis' }` |
| `Buffer is not defined` | buffer, crypto 관련 | `vite-plugin-node-polyfills` 설치 |
| `process is not defined` | webpack 기반 라이브러리 | `define: { 'process.env': {} }` |
| `__dirname is not defined` | Node.js 경로 유틸 | `import.meta.url` 사용으로 대체 |
| `require is not defined` | CJS 전용 라이브러리 | `vite.config.js` → `optimizeDeps.include` 추가 |

#### CJS 라이브러리 강제 최적화 예시
```js
// vite.config.js
export default defineConfig({
  optimizeDeps: {
    include: ['sockjs-client', 'some-cjs-lib'],  // CJS 라이브러리 사전 번들링 강제
  },
  define: {
    global: 'globalThis',
  },
})
```

### 2-7. 최종 권장 vite.config.js 기본 템플릿

Node.js 기반 라이브러리를 쓰는 프로젝트라면 아래 설정을 기본으로 포함한다.

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  define: {
    global: 'globalThis',      // sockjs-client, mqtt 등 Node.js 라이브러리 호환
    'process.env': {},          // process.env 참조 라이브러리 호환
  },

  optimizeDeps: {
    include: [
      'sockjs-client',          // CJS 라이브러리는 여기에 명시
    ],
  },
})
```

## 3. 흔한 실수
- ❌ `vite.config.js`에 `define: { global: 'globalThis' }` 누락 → sockjs `global is not defined`.
- ❌ polyfill을 전부 포함 → 번들 비대. 필요한 모듈만 `include`.
- ❌ SockJS를 고집 → 네이티브 `WebSocket`이면 `global` 문제 자체가 없다.
- ❌ `router.onError` 누락 → 라우터 초기화 오류가 앱 전체를 다운시킨다.
- ❌ CJS 라이브러리를 `optimizeDeps.include`에 안 넣음 → `require is not defined`.

## 4. 체크리스트
- [ ] `vite.config.js`에 `define: { global: 'globalThis' }`가 설정되어 있는가?
- [ ] `Buffer`가 필요한 경우 `vite-plugin-node-polyfills`를 설치/설정했는가?
- [ ] `process.env`를 참조하는 라이브러리를 위해 `define: { 'process.env': {} }`를 추가했는가?
- [ ] CJS 라이브러리(sockjs-client 등)를 `optimizeDeps.include`에 명시했는가?
- [ ] 가능하면 SockJS 대신 네이티브 `WebSocket`을 사용했는가?
- [ ] `router.onError`로 라우터 초기화 오류를 캐치해 앱 전체가 죽지 않도록 보호했는가?
