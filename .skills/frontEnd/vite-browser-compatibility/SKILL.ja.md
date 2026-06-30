---
name: Vite ブラウザ互換性エラー防止ガイド (Vite Browser Compatibility)
description: Vite 環境で Node.js 専用ライブラリ(sockjs-client など)を使用する際に発生する global/Buffer/process is not defined などのブラウザ互換性エラーの原因と解決パターンです。WebSocket/SockJS 接続やビルドの ReferenceError をデバッグする際に読みます。キーワード global, Buffer, process, globalThis, vite-plugin-node-polyfills, SockJS, STOMP。
rules:
  - "ブラウザには global, Buffer, process のような Node.js のグローバルオブジェクトが存在しない。"
  - "global は vite.config.js の define: { global: 'globalThis' } でポリフィルするのが最も推奨される。"
  - "Buffer は vite-plugin-node-polyfills でポリフィルするのが最もきれいだ。"
  - "可能であれば SockJS なしでブラウザ組み込みの WebSocket を使い、global 問題そのものを回避する。"
  - "ルーター初期化エラーでアプリ全体が落ちないように router.onError で保護する。"
tags:
  - "vite"
  - "vite.config"
  - "@vitejs"
  - "esbuild"
  - "polyfill"
  - "browserslist"
---

# ⚙️ Vite ブラウザ互換性エラー防止ガイド

> Vite バンドルがブラウザに存在しない Node.js グローバルオブジェクト(global, Buffer, process)を参照するライブラリのせいで起きるエラーの原因と解決策を定義する。`ReferenceError` が発生したり SockJS/STOMP WebSocket を付ける際に読む。

## 1. 中核となる原則
- ブラウザには `global`, `Buffer`, `process` のような Node.js のグローバルオブジェクトが存在しない。
- `global` は `vite.config.js` の `define: { global: 'globalThis' }` でポリフィルするのが最も推奨される。
- `Buffer` は `vite-plugin-node-polyfills` でポリフィルするのが最もきれいだ。
- 可能であれば SockJS なしでブラウザ組み込みの `WebSocket` を使い、`global` 問題そのものを回避する。
- ルーター初期化エラーでアプリ全体が落ちないように `router.onError` で保護する。

## なぜこのエラーが発生するのか

Node.js 環境には `global`, `Buffer`, `process` のようなグローバルオブジェクトがある。
Vite はブラウザ向けにバンドリングするため、これらのグローバルオブジェクトが存在しない。
`sockjs-client`, `@stomp/stompjs` のようなライブラリが Node.js のグローバルオブジェクトを参照すると
ブラウザで `ReferenceError` が発生し、Vue Router 初期化中に起きるとルーティング全体が落ちる。

```
ReferenceError: global is not defined
  at sockjs-client/lib/utils/browser-crypto.js
    ↓
[Vue Router warn]: Unexpected error when starting the router
    ↓
라우팅 전체 불능 상태
```

## 2. ルール

### 2-1. `global is not defined` の解決

#### ✅ 方法 1 — vite.config.js に define を追加(最も推奨)

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

> `globalThis` はブラウザ/Node.js の両方で動作する標準のグローバルオブジェクトだ。
> Vite がビルド時にソースコードの `global` を `globalThis` に置換してくれる。

#### ✅ 方法 2 — index.html にインラインポリフィル(素早い一時的解決)

```html
<!-- index.html <head> 최상단 -->
<script>
  if (typeof global === 'undefined') {
    var global = globalThis;
  }
</script>
```

#### ✅ 方法 3 — main.js の最上部にポリフィル(方法 2 の代替)

```js
// src/main.js — 반드시 다른 import보다 먼저 위치해야 함
if (typeof global === 'undefined') {
  window.global = window
}

import { createApp } from 'vue'
import App from './App.vue'
// ...
```

### 2-2. `Buffer is not defined` の解決

Node.js の `Buffer` がないために発生する。`vite-plugin-node-polyfills` の使用が最もきれいだ。

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

### 2-3. `process is not defined` の解決

```js
// vite.config.js
export default defineConfig({
  define: {
    global: 'globalThis',
    'process.env': {},       // process.env 접근 허용 (빈 객체로 안전하게)
  },
})
```

### 2-4. WebSocket / SockJS 使用時の推奨パターン

`sockjs-client` を直接 import すると `global` エラーが繰り返される。
STOMP over WebSocket が必要なら `@stomp/stompjs` を使用し、vite define 設定を併せて適用する。

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

> **ネイティブ WebSocket 推奨:** SockJS なしでブラウザ組み込みの `WebSocket` を使えば
> `global` 問題そのものが発生しない。Spring Boot では `@EnableWebSocket` で設定する。

### 2-5. Vue Router 初期化中にエラーが発生した場合の全体ルーティング保護

ルーター初期化中に非同期エラーが発生すると Vue Router が止まる。
`router.onError` でキャッチしてアプリが落ちないように処理する。

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

### 2-6. よく発生する Vite 互換性エラーのクイックリファレンス表

| エラーメッセージ | 原因となるライブラリ例 | 解決方法 |
|------------|---------------------|-----------|
| `global is not defined` | sockjs-client, mqtt | `vite.config.js` → `define: { global: 'globalThis' }` |
| `Buffer is not defined` | buffer, crypto 関連 | `vite-plugin-node-polyfills` をインストール |
| `process is not defined` | webpack ベースのライブラリ | `define: { 'process.env': {} }` |
| `__dirname is not defined` | Node.js パスユーティリティ | `import.meta.url` の使用で代替 |
| `require is not defined` | CJS 専用ライブラリ | `vite.config.js` → `optimizeDeps.include` を追加 |

#### CJS ライブラリの強制最適化の例
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

### 2-7. 最終的な推奨 vite.config.js 基本テンプレート

Node.js ベースのライブラリを使うプロジェクトなら、以下の設定を基本として含める。

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

## 3. よくある間違い
- ❌ `vite.config.js` に `define: { global: 'globalThis' }` の欠落 → sockjs `global is not defined`。
- ❌ polyfill をすべて含める → バンドルの肥大化。必要なモジュールだけ `include`。
- ❌ SockJS に固執 → ネイティブ `WebSocket` なら `global` 問題そのものがない。
- ❌ `router.onError` の欠落 → ルーター初期化エラーがアプリ全体をダウンさせる。
- ❌ CJS ライブラリを `optimizeDeps.include` に入れない → `require is not defined`。

## 4. チェックリスト
- [ ] `vite.config.js` に `define: { global: 'globalThis' }` が設定されているか?
- [ ] `Buffer` が必要な場合 `vite-plugin-node-polyfills` をインストール/設定したか?
- [ ] `process.env` を参照するライブラリのために `define: { 'process.env': {} }` を追加したか?
- [ ] CJS ライブラリ(sockjs-client など)を `optimizeDeps.include` に明示したか?
- [ ] 可能であれば SockJS の代わりにネイティブ `WebSocket` を使用したか?
- [ ] `router.onError` でルーター初期化エラーをキャッチし、アプリ全体が落ちないように保護したか?
