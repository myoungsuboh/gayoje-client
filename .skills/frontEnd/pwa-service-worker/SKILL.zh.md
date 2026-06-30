---
name: PWA & Service Worker 标准
description: 涵盖可安装条件、按资源的缓存策略(Precache/CacheFirst/NetworkFirst)、禁止缓存对象、更新 UX、manifest 的 PWA 与 Service Worker 通用 Web 标准,不依赖于特定构建工具/框架。在应用 PWA 安装·离线·缓存、检查更新通知·manifest、与原生包装器并行时阅读。
rules:
  - "满足可安装条件: 有效的 web app manifest(含必需字段·图标)、安全上下文(HTTPS 或 localhost)、已注册的 Service Worker —— 这三者是可安装 PWA 的最低条件。"
  - "选择适合资源类型的缓存策略: 不变的静态资源用 Precache,几乎不变的外部资源用 CacheFirst,时效性重要的数据用 NetworkFirst。不要将一种策略一律应用于所有资源。"
  - "不缓存绝对不能缓存的内容: 改变状态的请求(POST/PUT/DELETE 等非幂等请求)、认证/个性化响应、入口 HTML 文档,错误缓存这些会破坏数据完整性·安全·部署反映。"
  - "更新要在保护用户操作的前提下应用: 检测到新版本时,默认采用用户可选择的通知(prompt)方式,而非中断进行中操作的强制 reload。"
  - "将离线作为一级状态对待: 离线时显示回退 UI 而非空白屏幕,需要网络的变更(写入)先入队列,联机恢复时再同步。"
  - "理解 Service Worker 的运行范围: SW 仅在安全上下文(HTTPS/localhost)中运行。在像原生包装器(混合应用)那样通过 file:///自定义 scheme 分发的环境中 SW 不运行,因此在该路径上分离/禁用它。"
  - "通过测量来验证: 用标准工具(例如 Lighthouse PWA 审计、浏览器开发者工具的 Application 面板)确认缓存命中率·离线行为·可安装性。"
tags:
  - "service-worker"
  - "workbox"
  - "manifest.json"
  - "navigator.serviceWorker"
  - "vite-plugin-pwa"
  - "registerSW"
---

# 📱 PWA & Service Worker 标准

> 应用 PWA 可实现 (1) 主屏幕安装、(2) 离线支持、(3) 通过静态资源缓存加速初始加载。关键在于"用何种策略缓存什么、什么绝不缓存,以及如何安全地向用户应用新版本"。在实现 PWA·缓存·离线、检查更新通知·manifest、与原生包装器(混合)并行时阅读。这是基于 Web 标准的标准,不依赖于特定构建工具/框架。
>
> 相关技能: `vite-browser-compatibility`(构建/浏览器兼容性)、`env-config`(环境配置)、`project-structure`(移动/原生分支)。

## 1. 核心原则

- **满足可安装条件**: 有效的 web app manifest(含必需字段·图标)、安全上下文(HTTPS 或 `localhost`)、已注册的 Service Worker —— 这三者是可安装 PWA 的最低条件。
- **选择适合资源类型的缓存策略**: 不变的静态资源用 Precache,几乎不变的外部资源用 CacheFirst,时效性重要的数据用 NetworkFirst。不要将一种策略一律应用于所有资源。
- **不缓存绝对不能缓存的内容**: 改变状态的请求(POST/PUT/DELETE 等非幂等请求)、认证/个性化响应、入口 HTML 文档,错误缓存这些会破坏数据完整性·安全·部署反映。
- **更新要在保护用户操作的前提下应用**: 检测到新版本时,默认采用用户可选择的通知(prompt)方式,而非中断进行中操作的强制 reload。
- **将离线作为一级状态对待**: 离线时显示回退 UI 而非空白屏幕,需要网络的变更(写入)先入队列,联机恢复时再同步。
- **理解 Service Worker 的运行范围**: SW 仅在安全上下文(HTTPS/`localhost`)中运行。在像原生包装器(混合应用)那样通过 `file://`/自定义 scheme 分发的环境中 SW 不运行,因此在该路径上分离/禁用它。
- **通过测量来验证**: 用标准工具(例如 Lighthouse PWA 审计、浏览器开发者工具的 Application 面板)确认缓存命中率·离线行为·可安装性。

## 2. 规则

### 2-1. 填全 manifest 的必需项

要成为可安装 PWA,web app manifest 必须具备以下字段和图标。缺少任何一项都会导致安装提示不出现或主屏幕显示损坏。

| 字段 | 必需 | 备注 |
|---|---|---|
| `name`, `short_name` | ✅ | short_name 是主屏幕标签(要短 —— 建议: 约 12 字以内,按平台/语言调整) |
| `start_url` | ✅ | 安装后的起始路径 |
| `display` | ✅ | 建议 `standalone`(看起来像应用) |
| `theme_color` | ✅ | 状态栏/工具栏颜色 |
| `background_color` | ✅ | 启动画面背景 |
| `icons` | ✅ | 建议 192/512 + **maskable** 变体 |
| `orientation` | △ | 仅在需要锁定方向时 |

```text
// ❌ 无 maskable 图标 → 在部分平台上以白色背景小图显示
icons: [ 192, 512 ]

// ✅ 同时提供常规 + maskable 变体
icons: [ 192, 512, 512(purpose: maskable) ]
```

### 2-2. 按资源类型区分缓存策略

根据资源的变更频率和时效性要求,采用不同的策略。

| 资源 | 策略 | 说明 |
|---|---|---|
| 静态(应用代码/样式/图像) | **Precache** | 预先缓存构建产物,离线也可加载 |
| 几乎不变的外部资源(例如: 地图瓦片·字体) | **CacheFirst** | 缓存优先 + 过期(TTL)·最大条目数限制 |
| 时效性重要的读取 API(GET) | **NetworkFirst** | 网络优先,失败时回退缓存,设置超时 |
| 入口 HTML 文档 | **NetworkFirst** | 使新部署立即反映 |

```text
// ✅ 按资源分别设定策略
static assets        → Precache
map tiles / fonts    → CacheFirst (TTL, maxEntries)
read API (GET)       → NetworkFirst (timeout, fallback)
entry HTML document  → NetworkFirst
```

### 2-3. 显式排除绝对不能缓存的内容

- 改变状态的非幂等请求(POST/PUT/DELETE 等)不缓存 —— 重放缓存的响应会破坏数据。
- 携带认证令牌或因用户而异的响应不缓存 —— 有暴露给其他用户的风险。
- 不要将入口 HTML 文档设为 CacheFirst —— 新部署将永远不会被反映。

```text
// ❌ 禁止 —— 破坏完整性·安全·部署反映的缓存
POST /api/orders        → 缓存
GET  /api/me (认证)     → CacheFirst
index.html              → CacheFirst

// ✅ 推荐 —— 显式排除缓存(仅网络)
POST/PUT/DELETE         → 不缓存 (NetworkOnly)
认证/个性化响应         → 不缓存
index.html              → NetworkFirst
```

### 2-4. 更新默认采用用户可选型(prompt)

- 检测到新版本时通知用户,在其希望时应用(例如: "有新版本 → 更新"操作)。
- 中断进行中输入/操作的自动强制 reload 会导致操作丢失,因此不作为默认值使用。

```text
// ❌ 自动强制更新 → 进行中操作途中 reload,输入丢失
on new version: reload now

// ✅ prompt 方式 → 通知后由用户选择应用时机
on new version: show "更新" 通知 → 用户点击时应用后 reload
```

### 2-5. 用回退 UI + 同步队列处理离线

- 离线时显示"离线模式"回退 UI 而非空白屏幕/错误,让用户感知状态。
- 需要网络的写入操作不要立即失败,先存入队列,联机恢复时自动同步。
- 将无网络也可用的功能(例如: 设备传感器·GPS·本地计算)设计为离线时仍持续工作。

```text
// ✅ 检测离线状态 → 回退 + 队列 → 恢复时同步
online=false → "离线模式" 横幅 + 将写入操作载入同步队列
online=true  → 清空队列并发送至服务器
```

### 2-6. 与原生包装器(混合)并行时分离 SW

- Service Worker 仅在安全上下文(HTTPS 或 `localhost`)中运行。
- 在将静态文件打包进应用并通过 `file://`/自定义 scheme 分发的原生包装器环境中 SW 不运行 → 在该构建/运行路径上分离或禁用 PWA 注册。

```text
// ✅ 按分发环境(scheme)分支 SW 注册
if (安全上下文 = Web/HTTPS):  注册 SW
else (原生包装器/文件 scheme): 禁用 SW (跳过注册)
```

### 2-7. 测量可安装性和缓存行为

- 用标准 PWA 审计工具(例如 Lighthouse PWA 类别)检查可安装条件·离线行为·图标/manifest。
- 观测缓存命中率以确认策略是否按预期运作(命中率异常偏低则重新审视策略)。
- 在浏览器开发者工具的 Application 面板中验证 Service Worker 注册/manifest/Storage。

```text
// ✅ 检查可安装最低条件
[ ] 有效的 manifest(必需字段 + 图标)
[ ] 安全上下文(HTTPS 或 localhost)
[ ] 已注册的 Service Worker,离线时有响应
```

## 3. 常见错误

- ❌ **缓存状态变更请求(POST/PUT/DELETE)** → 重放缓存响应破坏数据完整性。
- ❌ **缓存认证/个性化响应** → 有暴露给其他用户的风险。
- ❌ **将入口 HTML 设为 CacheFirst** → 新部署绝不被反映。
- ❌ **对所有资源一律应用一种策略** → 连需要时效性的数据也被困在缓存中。
- ❌ **自动强制更新(reload)** → 进行中操作途中 reload 导致用户输入丢失。
- ❌ **缺少 maskable 图标** → 在部分平台主屏幕上以小图/白色背景显示。
- ❌ **缺少 manifest 必需字段** → 安装提示不出现。
- ❌ **在非安全上下文/原生包装器中包含 SW** → 不工作,只留下控制台错误。
- ❌ **未考虑离线** → 网络断开时空白屏幕,写入操作直接丢失。

## 4. 检查清单

- [ ] 是否填全 manifest 的所有必需字段(name/short_name/start_url/display/theme_color/background_color/icons)?
- [ ] 是否提供了 192/512 + maskable 全部图标?
- [ ] 是否按资源类型正确区分并应用缓存策略(Precache/CacheFirst/NetworkFirst)?
- [ ] 是否没有错误缓存状态变更(非幂等)请求·认证/个性化响应·入口 HTML?
- [ ] 是否以用户可选型(prompt)安全地处理新版本的应用?
- [ ] 是否具备离线回退 UI 和写入操作的同步队列?
- [ ] 是否满足安全上下文(HTTPS/localhost)条件,并在原生包装器路径上分离/禁用 SW?
- [ ] 是否用标准工具(例如 Lighthouse PWA 审计、开发者工具 Application 面板)验证可安装性·缓存命中率?

## 附录: 按技术栈的示例

> 以下为参考用实现示例。按团队所用技术栈(构建工具·框架·UI 库)以相同模式添加示例。上述 1~4 的原则·规则为标准,附录仅为其应用案例。

### Vite (vite-plugin-pwa) + Vue

用 `vite-plugin-pwa` 生成 manifest·Service Worker(基于 Workbox),用 `virtual:pwa-register/vue` 实现更新通知,用 Vuetify 组件构成通知/横幅 UI 的示例。原生包装器以 Capacitor 为准。

#### 安装 & 基本配置

```bash
npm install -D vite-plugin-pwa
```

```js
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',           // 'autoUpdate' | 'prompt' (用户通知)
      injectRegister: 'auto',
      manifest: {
        name: 'Running Crow',
        short_name: 'RunCrow',
        description: '실시간 GPS 러닝 트래커',
        theme_color: '#fb8c00',
        background_color: '#121212',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dashboard',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.maptiler\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maptiler-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 }
            }
          },
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 }
            }
          }
        ]
      }
    })
  ]
})
```

#### 绝对不能缓存的模式

```js
// 认证 API 等仅限网络
{
  urlPattern: /\/api\/auth\//,
  handler: 'NetworkOnly'
}
```

#### 更新通知 UX (`registerType: 'prompt'`)

```vue
<!-- App.vue -->
<template>
  <v-snackbar v-model="needRefresh" :timeout="-1" color="primary">
    새 버전이 있습니다.
    <template #actions>
      <v-btn variant="text" @click="updateApp">업데이트</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(swUrl, r) { console.log('SW registered', swUrl) },
  onRegisterError(err) { console.error('SW error', err) }
})

function updateApp() {
  updateServiceWorker(true)  // skipWaiting + reload
}
</script>
```

自动更新(`'autoUpdate'`)可能给用户带来非预期的 reload,因此 `'prompt'` 更安全。

#### 离线回退

```vue
<template>
  <v-banner v-if="!online" color="warning" icon="mdi-wifi-off">
    오프라인 모드 — 일부 기능이 제한됩니다.
  </v-banner>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const online = ref(navigator.onLine)
const onChange = () => online.value = navigator.onLine
onMounted(() => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
})
onUnmounted(() => {
  window.removeEventListener('online', onChange)
  window.removeEventListener('offline', onChange)
})
</script>
```

位置追踪应在离线时也能工作 —— GPS 无需互联网也可用。跑步结束后存入同步队列 → 联机恢复时自动上传。

#### 与 Capacitor 并行的注意事项

Capacitor 构建会将静态文件包含进应用包,并通过 `capacitor://localhost` 或 `file://` scheme 分发。**Service Worker 仅在 `https://` 或 `http://localhost` scheme 上运行。**

```js
// vite.config.js — Capacitor 构建时禁用 PWA
import { VitePWA } from 'vite-plugin-pwa'

const isCapacitorBuild = process.env.BUILD_TARGET === 'capacitor'

export default defineConfig({
  plugins: [
    vue(),
    !isCapacitorBuild && VitePWA({ /* ... */ })
  ].filter(Boolean)
})
```

```json
// package.json
"scripts": {
  "build:web": "vite build",
  "build:capacitor": "BUILD_TARGET=capacitor vite build && cap sync"
}
```

或在 Service Worker 注册时检测 Capacitor 环境后跳过:

```js
import { Capacitor } from '@capacitor/core'

if (!Capacitor.isNativePlatform()) {
  // 注册 PWA
}
```

#### 在开发环境调试 PWA

```js
VitePWA({
  devOptions: {
    enabled: true,   // 在 dev 服务器上也启用 SW
    type: 'module'
  }
})
```

在 Chrome DevTools → Application → Service Workers / Manifest / Storage 中验证。

#### 测量(缓存命中率)

```js
// 测量由 SW 处理的 fetch 比例 (缓存命中率)
navigator.serviceWorker.addEventListener('message', (e) => {
  if (e.data.type === 'CACHE_HIT') metrics.cacheHit++
  if (e.data.type === 'CACHE_MISS') metrics.cacheMiss++
})
```

按项目特性设定命中率基准线(例如 60%),低于该值则重新审视缓存策略。(数值为示例 —— 按资源构成·流量模式调整)
