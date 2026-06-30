---
name: PWA & Service Worker Standard
description: A general web standard for PWAs and Service Workers covering installability conditions, per-resource caching strategies (Precache/CacheFirst/NetworkFirst), things never to cache, update UX, and the manifest — independent of any specific build tool/framework. Read when applying PWA install/offline/caching, reviewing update notifications/manifest, or running alongside a native wrapper.
rules:
  - "Meet the installability conditions: a valid web app manifest (including required fields and icons), a secure context (HTTPS or localhost), and a registered Service Worker — these three are the minimum for an installable PWA."
  - "Choose a caching strategy that fits the resource type: Precache for immutable static assets, CacheFirst for rarely changing external resources, NetworkFirst for data where freshness matters. Do not apply one strategy uniformly to all resources."
  - "Do not cache what must never be cached: state-changing requests (non-idempotent requests such as POST/PUT/DELETE), authenticated/personalized responses, and entry HTML documents — caching these incorrectly breaks data integrity, security, and deployment propagation."
  - "Apply updates while preserving the user's work: on detecting a new version, default to a user-selectable notification (prompt) rather than a forced reload that interrupts in-progress work."
  - "Treat offline as a first-class state: show a fallback UI instead of a blank screen when offline, and queue network-requiring changes (writes) to sync upon returning online."
  - "Understand the Service Worker's operating scope: a SW works only in a secure context (HTTPS/localhost). In environments served via file:///custom schemes like a native wrapper (hybrid app), the SW does not work, so separate/disable it on that path."
  - "Verify by measurement: confirm cache hit rate, offline behavior, and installability with standard tools (e.g., the Lighthouse PWA audit, the Application panel in browser DevTools)."
tags:
  - "service-worker"
  - "workbox"
  - "manifest.json"
  - "navigator.serviceWorker"
  - "vite-plugin-pwa"
  - "registerSW"
---

# 📱 PWA & Service Worker Standard

> Applying a PWA enables (1) home-screen install, (2) offline support, and (3) faster initial loads via static-asset caching. The crux is "what to cache with which strategy, what never to cache, and how to safely apply a new version to the user." Read when implementing PWA/caching/offline, reviewing update notifications/manifest, or running alongside a native wrapper (hybrid). This is a web-standard-based standard, not tied to any specific build tool/framework.
>
> Related skills: `vite-browser-compatibility` (build/browser compatibility), `env-config` (environment configuration), `project-structure` (mobile/native branching).

## 1. Core Principles

- **Meet the installability conditions**: a valid web app manifest (including required fields and icons), a secure context (HTTPS or `localhost`), and a registered Service Worker — these three are the minimum for an installable PWA.
- **Choose a caching strategy that fits the resource type**: Precache for immutable static assets, CacheFirst for rarely changing external resources, NetworkFirst for data where freshness matters. Do not apply one strategy uniformly to all resources.
- **Do not cache what must never be cached**: state-changing requests (non-idempotent requests such as POST/PUT/DELETE), authenticated/personalized responses, and entry HTML documents — caching these incorrectly breaks data integrity, security, and deployment propagation.
- **Apply updates while preserving the user's work**: on detecting a new version, default to a user-selectable notification (prompt) rather than a forced reload that interrupts in-progress work.
- **Treat offline as a first-class state**: show a fallback UI instead of a blank screen when offline, and queue network-requiring changes (writes) to sync upon returning online.
- **Understand the Service Worker's operating scope**: a SW works only in a secure context (HTTPS/`localhost`). In environments served via `file://`/custom schemes like a native wrapper (hybrid app), the SW does not work, so separate/disable it on that path.
- **Verify by measurement**: confirm cache hit rate, offline behavior, and installability with standard tools (e.g., the Lighthouse PWA audit, the Application panel in browser DevTools).

## 2. Rules

### 2-1. Fill in all required manifest fields

To become an installable PWA, the web app manifest must have the fields and icons below. If any is missing, the install prompt won't appear or the home-screen display breaks.

| Field | Required | Note |
|---|---|---|
| `name`, `short_name` | ✅ | short_name is the home-screen label (keep it short — recommended: within ~12 chars, adjusted per platform/language) |
| `start_url` | ✅ | Start path after install |
| `display` | ✅ | `standalone` recommended (looks like an app) |
| `theme_color` | ✅ | Status bar/toolbar color |
| `background_color` | ✅ | Splash background |
| `icons` | ✅ | 192/512 + a **maskable** variant recommended |
| `orientation` | △ | Only when orientation lock is needed |

```text
// ❌ No maskable icon → shows small on a white background on some platforms
icons: [ 192, 512 ]

// ✅ Provide both regular and a maskable variant
icons: [ 192, 512, 512(purpose: maskable) ]
```

### 2-2. Differentiate caching strategy by resource type

Apply strategies differently based on the resource's change frequency and freshness requirement.

| Resource | Strategy | Description |
|---|---|---|
| Static (app code/style/images) | **Precache** | Cache build output ahead of time, load even offline |
| Rarely changing external resources (e.g., map tiles/fonts) | **CacheFirst** | Cache-first + expiration (TTL)/max-entries limit |
| Read API (GET) where freshness matters | **NetworkFirst** | Network-first, fall back to cache on failure, set a timeout |
| Entry HTML document | **NetworkFirst** | So a new deployment is reflected immediately |

```text
// ✅ Split strategy by resource
static assets        → Precache
map tiles / fonts    → CacheFirst (TTL, maxEntries)
read API (GET)       → NetworkFirst (timeout, fallback)
entry HTML document  → NetworkFirst
```

### 2-3. Explicitly exclude what must never be cached

- Do not cache non-idempotent state-changing requests (POST/PUT/DELETE, etc.) — replaying a cached response breaks data.
- Do not cache responses carrying auth tokens or differing per user — risk of exposure to other users.
- Do not put the entry HTML document on CacheFirst — a new deployment will never be reflected.

```text
// ❌ Forbidden — caching that breaks integrity/security/deployment propagation
POST /api/orders        → cache
GET  /api/me (auth)     → CacheFirst
index.html              → CacheFirst

// ✅ Recommended — explicitly exclude from cache (network-only)
POST/PUT/DELETE         → not cached (NetworkOnly)
auth/personalized resp. → not cached
index.html              → NetworkFirst
```

### 2-4. Default updates to a user-selectable (prompt) approach

- When a new version is detected, notify the user and apply it when they want (e.g., a "New version available → Update" action).
- An automatic forced reload that interrupts in-progress input/work causes work loss, so do not use it as the default.

```text
// ❌ Automatic forced update → reload mid-task, input loss
on new version: reload now

// ✅ Prompt approach → notify, then the user picks when to apply
on new version: show "Update" notification → apply and reload on user click
```

### 2-5. Handle offline with a fallback UI + sync queue

- When offline, show an "offline mode" fallback UI instead of a blank screen/error so the user is aware of the state.
- Do not immediately fail write operations that need the network; store them in a queue and auto-sync on returning online.
- Design features that work without the network (e.g., device sensors/GPS/local computation) to keep working offline.

```text
// ✅ Detect offline state → fallback + queue → sync on return
online=false → "offline mode" banner + enqueue write operations into the sync queue
online=true  → drain the queue and send to the server
```

### 2-6. Separate the SW when running alongside a native wrapper (hybrid)

- A Service Worker works only in a secure context (HTTPS or `localhost`).
- In native wrapper environments that bundle static files into the app and serve them via `file://`/custom schemes, the SW does not work → separate or disable PWA registration on that build/run path.

```text
// ✅ Branch SW registration by serving environment (scheme)
if (secure context = web/HTTPS):  register SW
else (native wrapper/file scheme): disable SW (skip registration)
```

### 2-7. Measure installability and cache behavior

- Check installability conditions/offline behavior/icons/manifest with a standard PWA audit tool (e.g., the Lighthouse PWA category).
- Observe cache hit rate to confirm the strategy behaves as intended (if the hit rate is abnormally low, revisit the strategy).
- Verify Service Worker registration/manifest/Storage in the Application panel of browser DevTools.

```text
// ✅ Check the minimum installability conditions
[ ] valid manifest (required fields + icons)
[ ] secure context (HTTPS or localhost)
[ ] registered Service Worker, responds when offline
```

## 3. Common Mistakes

- ❌ **Caching state-changing requests (POST/PUT/DELETE)** → data integrity destroyed by replaying cached responses.
- ❌ **Caching auth/personalized responses** → risk of exposure to other users.
- ❌ **Entry HTML on CacheFirst** → a new deployment is never reflected.
- ❌ **Applying one strategy uniformly to all resources** → even freshness-needing data gets stuck in cache.
- ❌ **Automatic forced update (reload)** → reload mid-task loses user input.
- ❌ **Missing maskable icon** → shows small/on a white background on some platforms' home screens.
- ❌ **Missing required manifest fields** → install prompt does not appear.
- ❌ **Including SW in a non-secure context/native wrapper** → does not work, leaves only console errors.
- ❌ **Ignoring offline** → blank screen when the network drops, write operations lost outright.

## 4. Checklist

- [ ] Did you fill in all required manifest fields (name/short_name/start_url/display/theme_color/background_color/icons)?
- [ ] Did you provide both 192/512 + maskable icons?
- [ ] Did you correctly differentiate and apply caching strategies (Precache/CacheFirst/NetworkFirst) by resource type?
- [ ] Did you avoid incorrectly caching state-changing (non-idempotent) requests, auth/personalized responses, and entry HTML?
- [ ] Did you safely handle applying a new version with a user-selectable (prompt) approach?
- [ ] Did you provide an offline fallback UI and a sync queue for write operations?
- [ ] Did you satisfy the secure-context (HTTPS/localhost) condition, and separate/disable the SW on the native wrapper path?
- [ ] Did you verify installability/cache hit rate with standard tools (e.g., the Lighthouse PWA audit, the DevTools Application panel)?

## Appendix: Per-Stack Examples

> The following are reference implementation examples. Add examples matching your team's stack (build tool, framework, UI library) following the same patterns. The principles/rules in 1–4 above are the standard; the appendix is merely an application case.

### Vite (vite-plugin-pwa) + Vue

An example generating the manifest and Service Worker (Workbox-based) with `vite-plugin-pwa`, the update notification with `virtual:pwa-register/vue`, and the notification/banner UI with Vuetify components. Native wrapper is based on Capacitor.

#### Install & basic setup

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
      registerType: 'prompt',           // 'autoUpdate' | 'prompt' (user notification)
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

#### Patterns that must never be cached

```js
// Auth APIs, etc. are network-only
{
  urlPattern: /\/api\/auth\//,
  handler: 'NetworkOnly'
}
```

#### Update notification UX (`registerType: 'prompt'`)

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

Automatic updates (`'autoUpdate'`) can cause an unintended reload for the user, so `'prompt'` is safer.

#### Offline fallback

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

Location tracking should work offline too — GPS works without the internet. After a run ends, store it in the sync queue → auto-upload on returning online.

#### Notes on running alongside Capacitor

A Capacitor build includes static files in the app bundle and serves them via the `capacitor://localhost` or `file://` scheme. **A Service Worker works only on the `https://` or `http://localhost` scheme.**

```js
// vite.config.js — disable PWA on Capacitor builds
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

Or detect the Capacitor environment at Service Worker registration time and skip:

```js
import { Capacitor } from '@capacitor/core'

if (!Capacitor.isNativePlatform()) {
  // register PWA
}
```

#### Debugging the PWA in the dev environment

```js
VitePWA({
  devOptions: {
    enabled: true,   // enable SW on the dev server too
    type: 'module'
  }
})
```

Verify in Chrome DevTools → Application → Service Workers / Manifest / Storage.

#### Measurement (cache hit rate)

```js
// Measure the ratio of fetches served by the SW (cache hit rate)
navigator.serviceWorker.addEventListener('message', (e) => {
  if (e.data.type === 'CACHE_HIT') metrics.cacheHit++
  if (e.data.type === 'CACHE_MISS') metrics.cacheMiss++
})
```

Set a hit-rate baseline (e.g., 60%) to fit the project's characteristics, and revisit the cache strategy if it falls below that. (The number is an example — adjust to your resource composition/traffic pattern.)
