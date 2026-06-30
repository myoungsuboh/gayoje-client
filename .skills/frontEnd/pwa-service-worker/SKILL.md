---
name: PWA & Service Worker 표준
description: 설치 가능 조건·자원별 캐싱 전략(Precache/CacheFirst/NetworkFirst)·캐싱 금지 대상·업데이트 UX·manifest를 다루는 PWA와 Service Worker의 범용 웹표준으로, 특정 빌드도구/프레임워크에 무관하다. PWA 설치·오프라인·캐싱을 적용하거나 업데이트 알림·manifest를 점검하거나 네이티브 래퍼와 병행할 때 읽는다.
rules:
  - "설치 가능 조건을 갖춘다: 유효한 web app manifest(필수 필드·아이콘 포함), 보안 컨텍스트(HTTPS 또는 localhost), 등록된 Service Worker — 이 셋이 설치 가능 PWA의 최소 조건이다."
  - "자원 유형에 맞는 캐싱 전략을 고른다: 변하지 않는 정적 자원은 Precache, 거의 안 바뀌는 외부 자원은 CacheFirst, 최신성이 중요한 데이터는 NetworkFirst. 한 가지 전략을 모든 자원에 일괄 적용하지 않는다."
  - "절대 캐싱하면 안 되는 것을 캐싱하지 않는다: 상태를 바꾸는 요청(POST/PUT/DELETE 등 비멱등 요청), 인증/개인화된 응답, 진입 HTML 문서를 잘못 캐싱하면 데이터 무결성·보안·배포 반영이 깨진다."
  - "업데이트는 사용자 작업을 지키며 적용한다: 새 버전 감지 시 진행 중인 작업을 끊는 강제 reload 대신, 사용자가 선택할 수 있는 알림(prompt) 방식을 기본으로 한다."
  - "오프라인을 1급 상태로 다룬다: 오프라인일 때 빈 화면 대신 폴백 UI를 보이고, 네트워크가 필요한 변경(쓰기)은 큐에 모았다가 온라인 복귀 시 동기화한다."
  - "Service Worker의 동작 범위를 이해한다: SW는 보안 컨텍스트(HTTPS/localhost)에서만 동작한다. 네이티브 래퍼(하이브리드 앱)처럼 file:///커스텀 스킴으로 서빙되는 환경에서는 SW가 동작하지 않으므로 그 경로에서는 분리/비활성한다."
  - "측정으로 검증한다: 캐시 적중률·오프라인 동작·설치 가능 여부를 표준 도구(예: Lighthouse PWA 감사, 브라우저 개발자도구의 Application 패널)로 확인한다."
tags:
  - "service-worker"
  - "workbox"
  - "manifest.json"
  - "navigator.serviceWorker"
  - "vite-plugin-pwa"
  - "registerSW"
---

# 📱 PWA & Service Worker 표준

> PWA를 적용하면 (1) 홈 화면 설치, (2) 오프라인 대응, (3) 정적 자원 캐싱으로 초기 로딩 가속이 가능하다. 핵심은 "무엇을 어떤 전략으로 캐싱하고, 무엇은 절대 캐싱하지 않으며, 새 버전을 사용자에게 어떻게 안전하게 적용하는가"이다. PWA·캐싱·오프라인을 구현하거나 업데이트 알림·manifest를 점검하거나 네이티브 래퍼(하이브리드)와 병행할 때 읽는다. 특정 빌드도구/프레임워크에 종속되지 않는 웹표준 기반 표준이다.
>
> 관련 스킬: `vite-browser-compatibility`(빌드/브라우저 호환성), `env-config`(환경 설정), `project-structure`(모바일/네이티브 분기).

## 1. 핵심 원칙

- **설치 가능 조건을 갖춘다**: 유효한 web app manifest(필수 필드·아이콘 포함), 보안 컨텍스트(HTTPS 또는 `localhost`), 등록된 Service Worker — 이 셋이 설치 가능 PWA의 최소 조건이다.
- **자원 유형에 맞는 캐싱 전략을 고른다**: 변하지 않는 정적 자원은 Precache, 거의 안 바뀌는 외부 자원은 CacheFirst, 최신성이 중요한 데이터는 NetworkFirst. 한 가지 전략을 모든 자원에 일괄 적용하지 않는다.
- **절대 캐싱하면 안 되는 것을 캐싱하지 않는다**: 상태를 바꾸는 요청(POST/PUT/DELETE 등 비멱등 요청), 인증/개인화된 응답, 진입 HTML 문서를 잘못 캐싱하면 데이터 무결성·보안·배포 반영이 깨진다.
- **업데이트는 사용자 작업을 지키며 적용한다**: 새 버전 감지 시 진행 중인 작업을 끊는 강제 reload 대신, 사용자가 선택할 수 있는 알림(prompt) 방식을 기본으로 한다.
- **오프라인을 1급 상태로 다룬다**: 오프라인일 때 빈 화면 대신 폴백 UI를 보이고, 네트워크가 필요한 변경(쓰기)은 큐에 모았다가 온라인 복귀 시 동기화한다.
- **Service Worker의 동작 범위를 이해한다**: SW는 보안 컨텍스트(HTTPS/`localhost`)에서만 동작한다. 네이티브 래퍼(하이브리드 앱)처럼 `file://`/커스텀 스킴으로 서빙되는 환경에서는 SW가 동작하지 않으므로 그 경로에서는 분리/비활성한다.
- **측정으로 검증한다**: 캐시 적중률·오프라인 동작·설치 가능 여부를 표준 도구(예: Lighthouse PWA 감사, 브라우저 개발자도구의 Application 패널)로 확인한다.

## 2. 규칙

### 2-1. manifest 필수 항목을 모두 채운다

설치 가능 PWA가 되려면 web app manifest에 아래 필드와 아이콘이 있어야 한다. 하나라도 빠지면 설치 프롬프트가 뜨지 않거나 홈 화면 표시가 깨진다.

| 필드 | 필수 | 비고 |
|---|---|---|
| `name`, `short_name` | ✅ | short_name은 홈 화면 라벨(짧게 — 권장: 약 12자 이내, 플랫폼/언어별 조정) |
| `start_url` | ✅ | 설치 후 시작 경로 |
| `display` | ✅ | `standalone` 권장(앱처럼 보임) |
| `theme_color` | ✅ | 상태바/툴바 색상 |
| `background_color` | ✅ | 스플래시 배경 |
| `icons` | ✅ | 192/512 + **maskable** 변형 권장 |
| `orientation` | △ | 방향 고정이 필요할 때만 |

```text
// ❌ maskable 아이콘 없음 → 일부 플랫폼에서 흰 배경에 작게 표시
icons: [ 192, 512 ]

// ✅ 일반 + maskable 변형을 함께 제공
icons: [ 192, 512, 512(purpose: maskable) ]
```

### 2-2. 자원 유형별 캐싱 전략을 구분한다

자원의 변경 빈도와 최신성 요구에 따라 전략을 다르게 적용한다.

| 자원 | 전략 | 설명 |
|---|---|---|
| 정적(앱 코드/스타일/이미지) | **Precache** | 빌드 결과물을 미리 캐시, 오프라인에서도 로드 |
| 거의 안 바뀌는 외부 자원(예: 지도 타일·폰트) | **CacheFirst** | 캐시 우선 + 만료(TTL)·최대 개수 제한 |
| 최신성이 중요한 읽기 API(GET) | **NetworkFirst** | 네트워크 우선, 실패 시 캐시 fallback, 타임아웃 설정 |
| 진입 HTML 문서 | **NetworkFirst** | 새 배포가 즉시 반영되도록 |

```text
// ✅ 자원별로 전략을 나눔
static assets        → Precache
map tiles / fonts    → CacheFirst (TTL, maxEntries)
read API (GET)       → NetworkFirst (timeout, fallback)
entry HTML document  → NetworkFirst
```

### 2-3. 절대 캐싱하면 안 되는 것을 명시적으로 제외한다

- 상태를 바꾸는 비멱등 요청(POST/PUT/DELETE 등)은 캐싱하지 않는다 — 캐시된 응답이 재생되면 데이터가 깨진다.
- 인증 토큰이 실리거나 사용자별로 다른 응답은 캐싱하지 않는다 — 다른 사용자에게 노출될 위험.
- 진입 HTML 문서를 CacheFirst로 두지 않는다 — 새 배포가 영영 반영되지 않는다.

```text
// ❌ 금지 — 무결성·보안·배포 반영이 깨지는 캐싱
POST /api/orders        → 캐시
GET  /api/me (인증)     → CacheFirst
index.html              → CacheFirst

// ✅ 권장 — 명시적으로 캐싱 제외(네트워크 전용)
POST/PUT/DELETE         → 캐싱 안 함 (NetworkOnly)
인증/개인화 응답        → 캐싱 안 함
index.html              → NetworkFirst
```

### 2-4. 업데이트는 사용자 선택형(prompt)을 기본으로 한다

- 새 버전이 감지되면 사용자에게 알리고 그가 원할 때 적용한다(예: "새 버전이 있습니다 → 업데이트" 액션).
- 진행 중인 입력/작업을 끊는 자동 강제 reload는 작업 손실을 부르므로 기본값으로 쓰지 않는다.

```text
// ❌ 자동 강제 업데이트 → 진행 중 작업 중간에 reload, 입력 손실
on new version: reload now

// ✅ prompt 방식 → 알림 후 사용자가 적용 시점 선택
on new version: show "업데이트" 알림 → 사용자 클릭 시 적용 후 reload
```

### 2-5. 오프라인을 폴백 UI + 동기화 큐로 다룬다

- 오프라인일 때 빈 화면/에러 대신 "오프라인 모드" 폴백 UI를 보여 사용자가 상태를 인지하게 한다.
- 네트워크가 필요한 쓰기 작업은 즉시 실패시키지 말고 큐에 저장했다가 온라인 복귀 시 자동 동기화한다.
- 네트워크 없이도 가능한 기능(예: 단말 센서·GPS·로컬 계산)은 오프라인에서도 계속 동작하게 설계한다.

```text
// ✅ 오프라인 상태 감지 → 폴백 + 큐 → 복귀 시 동기화
online=false → "오프라인 모드" 배너 + 쓰기 작업을 동기화 큐에 적재
online=true  → 큐 비우며 서버로 전송
```

### 2-6. 네이티브 래퍼(하이브리드) 병행 시 SW를 분리한다

- Service Worker는 보안 컨텍스트(HTTPS 또는 `localhost`)에서만 동작한다.
- 정적 파일을 앱 번들에 담아 `file://`/커스텀 스킴으로 서빙하는 네이티브 래퍼 환경에서는 SW가 동작하지 않는다 → 그 빌드/실행 경로에서는 PWA 등록을 분리하거나 비활성한다.

```text
// ✅ 서빙 환경(스킴)에 따라 SW 등록 분기
if (보안 컨텍스트 = 웹/HTTPS):  SW 등록
else (네이티브 래퍼/파일 스킴): SW 비활성 (등록 스킵)
```

### 2-7. 설치 가능 여부와 캐시 동작을 측정한다

- 설치 가능 조건·오프라인 동작·아이콘/manifest는 표준 PWA 감사 도구(예: Lighthouse PWA 카테고리)로 점검한다.
- 캐시 적중률을 관측해 전략이 의도대로 동작하는지 확인한다(적중률이 비정상적으로 낮으면 전략 재검토).
- 브라우저 개발자도구의 Application 패널에서 Service Worker 등록/manifest/Storage를 검증한다.

```text
// ✅ 설치 가능 최소 조건 체크
[ ] 유효한 manifest(필수 필드 + 아이콘)
[ ] 보안 컨텍스트(HTTPS 또는 localhost)
[ ] 등록된 Service Worker, 오프라인 시 응답
```

## 3. 흔한 실수

- ❌ **상태 변경 요청(POST/PUT/DELETE) 캐싱** → 캐시된 응답 재생으로 데이터 무결성 파괴.
- ❌ **인증/개인화 응답 캐싱** → 다른 사용자에게 노출 위험.
- ❌ **진입 HTML을 CacheFirst** → 새 배포가 절대 반영되지 않음.
- ❌ **모든 자원에 한 가지 전략 일괄 적용** → 최신성이 필요한 데이터까지 캐시에 갇힘.
- ❌ **자동 강제 업데이트(reload)** → 진행 중 작업 도중 reload로 사용자 입력 손실.
- ❌ **maskable 아이콘 누락** → 일부 플랫폼 홈 화면에서 작게/흰 배경으로 표시.
- ❌ **manifest 필수 필드 누락** → 설치 프롬프트가 뜨지 않음.
- ❌ **보안 컨텍스트 아닌 곳/네이티브 래퍼에 SW 포함** → 동작 안 하고 콘솔 에러만 남음.
- ❌ **오프라인 미고려** → 네트워크가 끊기면 빈 화면, 쓰기 작업이 그대로 유실.

## 4. 체크리스트

- [ ] manifest의 모든 필수 필드(name/short_name/start_url/display/theme_color/background_color/icons)를 채웠는가
- [ ] 192/512 + maskable 아이콘을 모두 제공했는가
- [ ] 자원 유형별 캐싱 전략(Precache/CacheFirst/NetworkFirst)을 올바르게 구분해 적용했는가
- [ ] 상태 변경(비멱등) 요청·인증/개인화 응답·진입 HTML을 잘못 캐싱하지 않았는가
- [ ] 새 버전 적용을 사용자 선택형(prompt)으로 안전하게 처리했는가
- [ ] 오프라인 폴백 UI와 쓰기 작업 동기화 큐를 갖췄는가
- [ ] 보안 컨텍스트(HTTPS/localhost) 조건을 만족하고, 네이티브 래퍼 경로에서는 SW를 분리/비활성했는가
- [ ] 설치 가능 여부·캐시 적중률을 표준 도구(예: Lighthouse PWA 감사, 개발자도구 Application 패널)로 검증했는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(빌드도구·프레임워크·UI 라이브러리)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vite (vite-plugin-pwa) + Vue

`vite-plugin-pwa`로 manifest·Service Worker(Workbox 기반)를 생성하고, `virtual:pwa-register/vue`로 업데이트 알림을, Vuetify 컴포넌트로 알림/배너 UI를 구성한 예시. 네이티브 래퍼는 Capacitor 기준.

#### 설치 & 기본 설정

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
      registerType: 'prompt',           // 'autoUpdate' | 'prompt' (사용자 알림)
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

#### 절대 캐싱하지 말아야 할 패턴

```js
// 인증 API 등은 네트워크 전용
{
  urlPattern: /\/api\/auth\//,
  handler: 'NetworkOnly'
}
```

#### 업데이트 알림 UX (`registerType: 'prompt'`)

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

자동 업데이트(`'autoUpdate'`)는 사용자에게 의도하지 않은 reload를 일으킬 수 있어 `'prompt'`가 안전하다.

#### 오프라인 폴백

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

위치 트래킹은 오프라인에서도 동작해야 한다 — GPS는 인터넷 없이도 가능. 러닝 종료 후 동기화 큐에 저장 → 온라인 복귀 시 자동 업로드.

#### Capacitor와의 병행 주의사항

Capacitor 빌드는 정적 파일을 앱 번들에 포함시키고 `capacitor://localhost` 또는 `file://` 스킴으로 서빙한다. **Service Worker는 `https://` 또는 `http://localhost` 스킴에서만 동작**한다.

```js
// vite.config.js — Capacitor 빌드 시 PWA 비활성
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

또는 Service Worker 등록 시 Capacitor 환경 감지 후 스킵:

```js
import { Capacitor } from '@capacitor/core'

if (!Capacitor.isNativePlatform()) {
  // PWA 등록
}
```

#### 개발 환경에서 PWA 디버깅

```js
VitePWA({
  devOptions: {
    enabled: true,   // dev 서버에서도 SW 활성화
    type: 'module'
  }
})
```

Chrome DevTools → Application → Service Workers / Manifest / Storage 에서 검증.

#### 측정 (캐시 적중률)

```js
// SW로 보낸 fetch 비율 측정 (캐시 적중률)
navigator.serviceWorker.addEventListener('message', (e) => {
  if (e.data.type === 'CACHE_HIT') metrics.cacheHit++
  if (e.data.type === 'CACHE_MISS') metrics.cacheMiss++
})
```

적중률 기준선(예: 60%)을 프로젝트 특성에 맞게 정하고, 그보다 낮으면 캐시 전략을 재검토한다. (수치는 예시 — 자원 구성·트래픽 패턴에 따라 조정)
