---
name: Vite Browser Compatibility Error Prevention Guide (Vite Browser Compatibility)
description: Causes of and fix patterns for browser-compatibility errors such as global/Buffer/process is not defined that arise when using Node.js-only libraries (sockjs-client, etc.) in a Vite environment. Read it when debugging WebSocket/SockJS connections or build ReferenceErrors. Keywords global, Buffer, process, globalThis, vite-plugin-node-polyfills, SockJS, STOMP.
rules:
  - "The browser does not have Node.js global objects such as global, Buffer, and process."
  - "Polyfilling global via define: { global: 'globalThis' } in vite.config.js is the most recommended approach."
  - "Polyfilling Buffer with vite-plugin-node-polyfills is the cleanest approach."
  - "When possible, use the browser's built-in WebSocket without SockJS to avoid the global problem altogether."
  - "Guard with router.onError so that a router initialization error does not bring down the entire app."
tags:
  - "vite"
  - "vite.config"
  - "@vitejs"
  - "esbuild"
  - "polyfill"
  - "browserslist"
---

# ⚙️ Vite Browser Compatibility Error Prevention Guide

> Defines the causes and fixes for errors that blow up when a Vite bundle references Node.js global objects (global, Buffer, process) that do not exist in the browser, due to a library. Read it when a `ReferenceError` occurs or when attaching a SockJS/STOMP WebSocket.

## 1. Core Principles
- The browser does not have Node.js global objects such as `global`, `Buffer`, and `process`.
- Polyfilling `global` via `define: { global: 'globalThis' }` in `vite.config.js` is the most recommended approach.
- Polyfilling `Buffer` with `vite-plugin-node-polyfills` is the cleanest approach.
- When possible, use the browser's built-in `WebSocket` without SockJS to avoid the `global` problem altogether.
- Guard with `router.onError` so that a router initialization error does not bring down the entire app.

## Why this error occurs

The Node.js environment has global objects such as `global`, `Buffer`, and `process`.
Because Vite bundles for the browser, these global objects do not exist.
When a library such as `sockjs-client` or `@stomp/stompjs` references a Node.js global object,
a `ReferenceError` occurs in the browser, and if it blows up during Vue Router initialization, the entire routing dies.

```
ReferenceError: global is not defined
  at sockjs-client/lib/utils/browser-crypto.js
    ↓
[Vue Router warn]: Unexpected error when starting the router
    ↓
라우팅 전체 불능 상태
```

## 2. Rules

### 2-1. Fixing `global is not defined`

#### ✅ Method 1 — Add define to vite.config.js (most recommended)

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

> `globalThis` is a standard global object that works in both the browser and Node.js.
> At build time Vite replaces `global` in the source code with `globalThis`.

#### ✅ Method 2 — Inline polyfill in index.html (quick temporary fix)

```html
<!-- index.html <head> 최상단 -->
<script>
  if (typeof global === 'undefined') {
    var global = globalThis;
  }
</script>
```

#### ✅ Method 3 — Polyfill at the top of main.js (alternative to Method 2)

```js
// src/main.js — 반드시 다른 import보다 먼저 위치해야 함
if (typeof global === 'undefined') {
  window.global = window
}

import { createApp } from 'vue'
import App from './App.vue'
// ...
```

### 2-2. Fixing `Buffer is not defined`

Occurs because Node.js's `Buffer` is absent. Using `vite-plugin-node-polyfills` is the cleanest.

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

### 2-3. Fixing `process is not defined`

```js
// vite.config.js
export default defineConfig({
  define: {
    global: 'globalThis',
    'process.env': {},       // process.env 접근 허용 (빈 객체로 안전하게)
  },
})
```

### 2-4. Recommended Pattern When Using WebSocket / SockJS

Importing `sockjs-client` directly causes the `global` error to recur.
If STOMP over WebSocket is needed, use `@stomp/stompjs` and apply the vite define setting together.

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

> **Native WebSocket recommended:** Using the browser's built-in `WebSocket` without SockJS
> means the `global` problem does not arise at all. Configure it with `@EnableWebSocket` in Spring Boot.

### 2-5. Protecting the Entire Routing When an Error Occurs During Vue Router Initialization

If an asynchronous error occurs during router initialization, Vue Router stalls.
Catch it with `router.onError` so the app does not die.

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

### 2-6. Quick Reference Table of Common Vite Compatibility Errors

| Error Message | Example Causing Library | Fix |
|------------|---------------------|-----------|
| `global is not defined` | sockjs-client, mqtt | `vite.config.js` → `define: { global: 'globalThis' }` |
| `Buffer is not defined` | buffer, crypto-related | Install `vite-plugin-node-polyfills` |
| `process is not defined` | webpack-based libraries | `define: { 'process.env': {} }` |
| `__dirname is not defined` | Node.js path utilities | Replace with `import.meta.url` |
| `require is not defined` | CJS-only libraries | `vite.config.js` → add `optimizeDeps.include` |

#### Example of Forcing Optimization of a CJS Library
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

### 2-7. Final Recommended Base vite.config.js Template

For a project that uses Node.js-based libraries, include the settings below as the baseline.

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

## 3. Common Mistakes
- ❌ Missing `define: { global: 'globalThis' }` in `vite.config.js` → sockjs `global is not defined`.
- ❌ Including all polyfills → bloated bundle. `include` only the modules you need.
- ❌ Insisting on SockJS → with native `WebSocket` the `global` problem does not exist at all.
- ❌ Missing `router.onError` → a router initialization error brings down the entire app.
- ❌ Not adding a CJS library to `optimizeDeps.include` → `require is not defined`.

## 4. Checklist
- [ ] Is `define: { global: 'globalThis' }` set in `vite.config.js`?
- [ ] If `Buffer` is needed, did you install/configure `vite-plugin-node-polyfills`?
- [ ] Did you add `define: { 'process.env': {} }` for libraries that reference `process.env`?
- [ ] Did you specify CJS libraries (sockjs-client, etc.) in `optimizeDeps.include`?
- [ ] Where possible, did you use native `WebSocket` instead of SockJS?
- [ ] Did you catch router initialization errors with `router.onError` to guard the entire app from dying?
