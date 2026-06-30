---
name: Vite 浏览器兼容性错误防范指南 (Vite Browser Compatibility)
description: 在 Vite 环境中使用 Node.js 专用库(sockjs-client 等)时发生的 global/Buffer/process is not defined 等浏览器兼容性错误的原因与解决模式。在调试 WebSocket/SockJS 连接或构建 ReferenceError 时阅读。关键词 global, Buffer, process, globalThis, vite-plugin-node-polyfills, SockJS, STOMP。
rules:
  - "浏览器中不存在 global、Buffer、process 这样的 Node.js 全局对象。"
  - "通过 vite.config.js 的 define: { global: 'globalThis' } 对 global 进行 polyfill 是最推荐的做法。"
  - "用 vite-plugin-node-polyfills 对 Buffer 进行 polyfill 是最干净的做法。"
  - "如有可能，不使用 SockJS 而使用浏览器内置的 WebSocket，从根本上规避 global 问题。"
  - "用 router.onError 进行保护，避免路由初始化错误导致整个应用崩溃。"
tags:
  - "vite"
  - "vite.config"
  - "@vitejs"
  - "esbuild"
  - "polyfill"
  - "browserslist"
---

# ⚙️ Vite 浏览器兼容性错误防范指南

> 定义 Vite 打包产物因某个库引用浏览器中不存在的 Node.js 全局对象(global, Buffer, process)而崩溃的错误的原因与解决方案。在发生 `ReferenceError` 或接入 SockJS/STOMP WebSocket 时阅读。

## 1. 核心原则
- 浏览器中不存在 `global`、`Buffer`、`process` 这样的 Node.js 全局对象。
- 通过 `vite.config.js` 的 `define: { global: 'globalThis' }` 对 `global` 进行 polyfill 是最推荐的做法。
- 用 `vite-plugin-node-polyfills` 对 `Buffer` 进行 polyfill 是最干净的做法。
- 如有可能，不使用 SockJS 而使用浏览器内置的 `WebSocket`，从根本上规避 `global` 问题。
- 用 `router.onError` 进行保护，避免路由初始化错误导致整个应用崩溃。

## 为什么会发生这个错误

Node.js 环境中有 `global`、`Buffer`、`process` 这样的全局对象。
由于 Vite 是面向浏览器打包的，这些全局对象并不存在。
当 `sockjs-client`、`@stomp/stompjs` 这样的库引用 Node.js 全局对象时，
在浏览器中会发生 `ReferenceError`，如果在 Vue Router 初始化过程中崩溃，整个路由都会瘫痪。

```
ReferenceError: global is not defined
  at sockjs-client/lib/utils/browser-crypto.js
    ↓
[Vue Router warn]: Unexpected error when starting the router
    ↓
라우팅 전체 불능 상태
```

## 2. 规则

### 2-1. 解决 `global is not defined`

#### ✅ 方法 1 — 在 vite.config.js 中添加 define(最推荐)

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

> `globalThis` 是在浏览器/Node.js 中都能工作的标准全局对象。
> Vite 在构建时会把源代码中的 `global` 替换为 `globalThis`。

#### ✅ 方法 2 — 在 index.html 中内联 polyfill(快速临时解决)

```html
<!-- index.html <head> 최상단 -->
<script>
  if (typeof global === 'undefined') {
    var global = globalThis;
  }
</script>
```

#### ✅ 方法 3 — 在 main.js 顶部 polyfill(方法 2 的替代)

```js
// src/main.js — 반드시 다른 import보다 먼저 위치해야 함
if (typeof global === 'undefined') {
  window.global = window
}

import { createApp } from 'vue'
import App from './App.vue'
// ...
```

### 2-2. 解决 `Buffer is not defined`

因为缺少 Node.js 的 `Buffer` 而发生。使用 `vite-plugin-node-polyfills` 最为干净。

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

### 2-3. 解决 `process is not defined`

```js
// vite.config.js
export default defineConfig({
  define: {
    global: 'globalThis',
    'process.env': {},       // process.env 접근 허용 (빈 객체로 안전하게)
  },
})
```

### 2-4. 使用 WebSocket / SockJS 时的推荐模式

直接 import `sockjs-client` 会反复出现 `global` 错误。
如果需要 STOMP over WebSocket，请使用 `@stomp/stompjs` 并一并应用 vite define 设置。

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

> **推荐使用原生 WebSocket:** 不使用 SockJS 而使用浏览器内置的 `WebSocket`，
> `global` 问题就根本不会发生。在 Spring Boot 中用 `@EnableWebSocket` 配置。

### 2-5. Vue Router 初始化过程中发生错误时对整个路由的保护

如果在路由初始化过程中发生异步错误，Vue Router 会停止。
用 `router.onError` 捕获，避免应用崩溃。

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

### 2-6. 常见 Vite 兼容性错误速查表

| 错误信息 | 引发问题的库示例 | 解决方法 |
|------------|---------------------|-----------|
| `global is not defined` | sockjs-client, mqtt | `vite.config.js` → `define: { global: 'globalThis' }` |
| `Buffer is not defined` | buffer、crypto 相关 | 安装 `vite-plugin-node-polyfills` |
| `process is not defined` | 基于 webpack 的库 | `define: { 'process.env': {} }` |
| `__dirname is not defined` | Node.js 路径工具 | 改用 `import.meta.url` |
| `require is not defined` | CJS 专用库 | `vite.config.js` → 添加 `optimizeDeps.include` |

#### 强制优化 CJS 库的示例
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

### 2-7. 最终推荐的 vite.config.js 基础模板

如果项目使用基于 Node.js 的库，请将以下设置作为基础包含进来。

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

## 3. 常见错误
- ❌ `vite.config.js` 中缺少 `define: { global: 'globalThis' }` → sockjs `global is not defined`。
- ❌ 包含全部 polyfill → 包体臃肿。只 `include` 需要的模块。
- ❌ 执着于 SockJS → 用原生 `WebSocket` 则根本不存在 `global` 问题。
- ❌ 缺少 `router.onError` → 路由初始化错误会让整个应用崩溃。
- ❌ 未将 CJS 库加入 `optimizeDeps.include` → `require is not defined`。

## 4. 检查清单
- [ ] `vite.config.js` 中是否设置了 `define: { global: 'globalThis' }`?
- [ ] 需要 `Buffer` 时，是否安装/配置了 `vite-plugin-node-polyfills`?
- [ ] 是否为引用 `process.env` 的库添加了 `define: { 'process.env': {} }`?
- [ ] 是否在 `optimizeDeps.include` 中明确了 CJS 库(sockjs-client 等)?
- [ ] 如有可能，是否使用了原生 `WebSocket` 代替 SockJS?
- [ ] 是否用 `router.onError` 捕获路由初始化错误，保护整个应用不崩溃?
