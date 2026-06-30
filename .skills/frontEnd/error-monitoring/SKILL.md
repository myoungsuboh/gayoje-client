---
name: 에러 모니터링 (Error Monitoring)
description: 프런트엔드 에러 수집의 범용 표준 — 에러 수집 도구 도입, 소스맵 업로드(비공개), 릴리스·환경 태깅, 컨텍스트·사용자 영향 식별, PII 마스킹, 환경별 샘플링, 알림 임계. 특정 도구/프레임워크에 무관하다. 프런트엔드에 에러 모니터링을 붙이거나 정비할 때, 무엇을 수집/제외할지·소스맵·샘플링·PII 처리를 정할 때 읽는다. 키워드: error monitoring, crash reporting, sourcemap, release tagging, environment, breadcrumb, sampling, PII scrub, capture, alert threshold.
rules:
  - "에러를 잃지 않는다(전역 수집): 처리되지 않은 예외·거부된 Promise·렌더링 오류를 전역에서 한 번에 가로채, 어떤 코드 경로에서 터져도 누락 없이 수집한다. console.error만 찍고 끝내거나 try/catch로 삼켜 silent fail로 두지 않는다."
  - "신호와 잡음을 가른다: 모든 오류를 다 보내지 않는다. 사용자가 손쓸 수 없는 진짜 결함(서버 오류·네트워크 장애·예기치 못한 예외)만 수집하고, 정상 흐름의 일부인 오류(입력 검증 실패 같은 4xx류)는 제외해 잡음 폭증을 막는다."
  - "릴리스·환경을 태깅한다: 모든 이벤트에 어느 버전(release)·어느 환경(dev/staging/prod)에서 났는지 붙여, 회귀가 어느 배포에서 시작됐는지 추적 가능하게 한다."
  - "소스맵으로 원본 위치를 복원하되 공개하지 않는다: 압축/난독화된 스택트레이스를 원본 소스 위치로 되돌릴 소스맵을 수집 도구에만 올린다. 소스맵을 공개 배포물에 함께 내보내지 않는다(원본 코드 노출)."
  - "컨텍스트와 사용자 영향을 남긴다: 에러 직전의 사용자 행동 자취(breadcrumb), 발생 화면/경로, 익명 사용자 식별자를 함께 남겨 재현과 영향 범위(몇 명에게, 어느 화면에서) 파악을 돕는다."
  - "PII는 전송 전에 제거한다: 개인식별정보·비밀값(이메일·비밀번호·토큰·주민번호 등)을 사용자 컨텍스트나 페이로드에 넣지 않고, 전송 직전 훅에서 마스킹/삭제한다. 상세 기준은 별도 스킬(privacy-pii)을 따른다."
  - "환경별로 샘플링한다: 환경마다 수집·트레이싱 비율을 다르게 둔다. 개발 환경은 보통 비활성화해 quota·잡음을 아끼고, 운영은 에러 영향에 맞춰 비율을 정한다."
  - "임계 기반으로 알린다: 모든 이벤트를 알림으로 흘리지 말고, 영향도(빈도·사용자 수·신규 회귀 여부) 임계를 넘을 때만 알려 알림 피로를 막는다. 운영 관측 전반은 observability 스킬과 함께 본다."
tags:
  - "error monitoring"
  - "crash reporting"
  - "sourcemap"
  - "release tagging"
  - "environment"
  - "breadcrumb"
  - "sampling"
  - "PII scrub"
  - "capture"
  - "alert threshold"
  - "Sentry"
  - "captureException"
  - "captureMessage"
  - "@sentry/vue"
  - "errorHandler"
  - "errorBoundary"
---

# 🛰️ 에러 모니터링 (Error Monitoring)

> 프런트엔드에서 발생하는 에러를 안전하게 수집·진단하고, 사용자 영향이 큰 문제를 우선 대응하기 위한 표준. 에러 모니터링을 도입·정비하거나 무엇을 수집/제외할지, 소스맵·릴리스 태깅·샘플링·PII 처리를 정할 때 읽는다. 특정 수집 도구(예: Sentry)나 프레임워크(예: Vue)에 종속되지 않는 범용 표준이다. 구체 적용 예시는 맨 끝 부록 참고.

## 1. 핵심 원칙
- **에러를 잃지 않는다(전역 수집)**: 처리되지 않은 예외·거부된 Promise·렌더링 오류를 전역에서 한 번에 가로채, 어떤 코드 경로에서 터져도 누락 없이 수집한다. `console.error`만 찍고 끝내거나 `try/catch`로 삼켜 silent fail로 두지 않는다.
- **신호와 잡음을 가른다**: 모든 오류를 다 보내지 않는다. 사용자가 손쓸 수 없는 진짜 결함(서버 오류·네트워크 장애·예기치 못한 예외)만 수집하고, 정상 흐름의 일부인 오류(입력 검증 실패 같은 4xx류)는 제외해 잡음 폭증을 막는다.
- **릴리스·환경을 태깅한다**: 모든 이벤트에 어느 버전(release)·어느 환경(dev/staging/prod)에서 났는지 붙여, 회귀가 어느 배포에서 시작됐는지 추적 가능하게 한다.
- **소스맵으로 원본 위치를 복원하되 공개하지 않는다**: 압축/난독화된 스택트레이스를 원본 소스 위치로 되돌릴 소스맵을 수집 도구에만 올린다. 소스맵을 공개 배포물에 함께 내보내지 않는다(원본 코드 노출).
- **컨텍스트와 사용자 영향을 남긴다**: 에러 직전의 사용자 행동 자취(breadcrumb), 발생 화면/경로, 익명 사용자 식별자를 함께 남겨 재현과 영향 범위(몇 명에게, 어느 화면에서) 파악을 돕는다.
- **PII는 전송 전에 제거한다**: 개인식별정보·비밀값(이메일·비밀번호·토큰·주민번호 등)을 사용자 컨텍스트나 페이로드에 넣지 않고, 전송 직전 훅에서 마스킹/삭제한다. 상세 기준은 별도 스킬(`privacy-pii`)을 따른다.
- **환경별로 샘플링한다**: 환경마다 수집·트레이싱 비율을 다르게 둔다. 개발 환경은 보통 비활성화해 quota·잡음을 아끼고, 운영은 에러 영향에 맞춰 비율을 정한다.
- **임계 기반으로 알린다**: 모든 이벤트를 알림으로 흘리지 말고, 영향도(빈도·사용자 수·신규 회귀 여부) 임계를 넘을 때만 알려 알림 피로를 막는다. 운영 관측 전반은 `observability` 스킬과 함께 본다.

## 2. 규칙

### 2-1. 전역에서 빠짐없이 수집한다
- 처리되지 않은 예외, 거부된 Promise, 프레임워크 렌더링 오류를 전역 훅 한 곳에서 가로챈다.
- 개별 `try/catch`에서 잡았으면 복구하거나, 복구 못 할 오류는 수집 도구로 보고한 뒤 다시 던진다 — 조용히 삼키지 않는다.

```text
// ❌ 금지 — 잡고 조용히 버림 (무슨 일이 났는지 아무도 모름)
try { doWork() } catch (e) { console.error(e) }   // 수집 안 됨

// ✅ 권장 — 전역 훅으로 일괄 수집 + 처리 못 할 건 보고 후 재던짐
onUnhandledError(e   => capture(e))
onUnhandledRejection(e => capture(e.reason))
onFrameworkError(e   => capture(e))
try { doWork() } catch (e) { capture(e); throw e }
```

### 2-2. 수집할 오류와 제외할 오류를 구분한다
- 사용자가 손쓸 수 없는 결함(서버 오류·네트워크 장애·예기치 못한 예외)만 수집한다.
- 정상 흐름의 일부인 클라이언트 오류(입력 검증 실패 등 4xx류)는 제외한다 — 잡음만 키우고 신호를 묻는다.
- 어떤 오류를 보낼지 한곳(공통 네트워크 계층/필터)에서 결정한다.

```text
// ❌ 금지 — 모든 네트워크 오류를 수집 (404/401 잡음 폭증)
onApiError(err => capture(err))

// ✅ 권장 — 서버 오류·네트워크 장애만 수집, 4xx는 제외
onApiError(err => {
  if (err.status >= 500 || err.networkFailed) capture(err)
})
```

### 2-3. 모든 이벤트에 릴리스·환경을 태깅한다
- 빌드 시점의 버전을 release로, 실행 환경을 environment로 모든 이벤트에 자동 부착한다.
- 태깅이 없으면 "어느 배포부터 깨졌나"를 추적할 수 없다.

```text
// ✅ 권장 — 초기화 시 한 번 설정 → 모든 이벤트에 자동 부착
monitor.init({
  environment: currentEnv,   // dev | staging | prod
  release:     appVersion,   // 빌드에 주입된 버전/커밋
})
```

### 2-4. 소스맵은 도구에만 업로드, 공개 배포 금지
- 빌드 산출물에 소스맵을 동봉해 공개하지 말고, 수집 도구에만 비공개로 업로드한다.
- 업로드는 CI에서 비밀 토큰으로 수행하고, release 식별자를 맞춰 스택트레이스가 정확히 매핑되게 한다.

```text
// ❌ 금지 — 공개 배포물에 소스맵 동봉 (원본 코드 노출)
build: emit *.map alongside public assets

// ✅ 권장 — 공개물엔 소스맵 미포함, 도구에만 업로드
build:  generate hidden sourcemaps (not served publicly)
deploy: upload sourcemaps to monitoring tool, keyed by release
```

### 2-5. 사용자 영향은 익명 식별자로 남긴다
- "몇 명에게 영향을 줬는지" 집계할 수 있도록 익명/내부 식별자만 사용자 컨텍스트에 넣는다.
- 이메일 등 PII는 넣지 않는다(2-7 참고). 로그아웃 시 사용자 컨텍스트를 비운다.

```text
// ❌ 금지 — PII를 사용자 컨텍스트에 부착
setUser({ id, email, phone })

// ✅ 권장 — 익명/내부 식별자만
setUser({ id: user.id, displayName: user.handle })  // PII 제외
onLogout(() => setUser(null))
```

### 2-6. 컨텍스트(자취·화면/경로)를 함께 남긴다
- 에러 직전의 사용자 행동 자취(breadcrumb)와 발생 화면/경로 태그를 남겨 재현을 돕는다.
- 자취에 토큰·비밀값이 섞이지 않게 한다(2-7).

```text
// ✅ 권장 — 행동 자취 + 현재 화면 태그
addBreadcrumb({ category: 'user-action', message: 'Clicked export' })
onRouteChange(route => setTag('route', route.name))
```

### 2-7. 전송 전에 PII·비밀값을 제거한다
- 전송 직전 훅에서 페이로드·자취·URL 쿼리의 민감정보(비밀번호·토큰·주민번호 등)를 마스킹/삭제한다.
- 무엇이 PII인지·마스킹 기준은 `privacy-pii` 스킬을 따른다.

```text
// ✅ 권장 — 전송 직전 스크럽 훅
beforeSend(event => {
  redact(event.payload, ['password', 'token', 'ssn'])
  maskQueryParams(event.breadcrumbs, ['token', 'access_token'])
  return event
})
```

### 2-8. 환경별 샘플링 비율을 정한다
- 환경마다 수집/트레이싱 비율을 분리한다. 개발은 보통 비활성화, 운영은 영향도에 맞춰 비율을 둔다.
- 에러 자체는 가능한 한 모두 받되(중요 신호), 비용이 큰 트레이싱/세션 기록은 비율을 낮춘다.

```text
// ✅ 권장 — 환경별 매트릭스로 비율 분리
sampleRate = { dev: 0, staging: 0.5, prod: 0.1 }[currentEnv] ?? 0
```

| 환경 | 수집 활성화 | 트레이싱 비율 | 비고 |
|---|---|---|---|
| development | 끔 | 0 | 로컬 잡음·quota 절약 |
| staging | 켬 | 중간(예: 0.5) | 사전 검증 |
| production | 켬 | 낮음(예: 0.1) | 영향도에 맞춰 조정 |

### 2-9. 알림은 영향 임계로 건다
- 신규 회귀, 급증, 영향 사용자 수 등 임계를 넘는 이슈만 알린다 — 개별 이벤트마다 알리지 않는다.
- 임계·라우팅(누구에게, 어느 채널로)은 팀 합의로 정하고, 운영 관측은 `observability` 스킬과 연계한다.

```text
// ✅ 권장 — 임계 기반 알림 (예시 정책)
alert when: 새 이슈 최초 발생 OR 24h 내 발생 급증 OR 영향 사용자 ≥ N
mute:       기존 known 이슈, 임계 미만
```

## 3. 흔한 실수
- **모든 4xx를 수집** → 404/401 잡음이 폭증해 진짜 결함이 묻힌다. 서버 오류·네트워크 장애만.
- **개발 환경에서도 수집 활성화** → 로컬 에러로 quota·대시보드가 오염된다. dev는 비활성화.
- **PII 전송** → 사용자 컨텍스트/페이로드에 이메일·전화·토큰을 넣는다. 익명 식별자 + 전송 전 스크럽.
- **소스맵 공개 배포** → 공개물에 `*.map`을 동봉해 원본 코드가 노출된다. 도구에만 비공개 업로드.
- **release/environment 태깅 누락** → 어느 배포부터 깨졌는지 추적 불가. 초기화 시 항상 태깅.
- **`try/catch`로 잡고 미보고(silent fail)** → 에러가 사라진다. 보고 후 재던지거나 복구.
- **`console.error`만 찍음** → 수집 도구로 capture하지 않으면 관측되지 않는다.
- **전 이벤트 알림** → 알림 피로로 정작 중요한 신호를 놓친다. 임계 기반으로.

## 4. 체크리스트
- [ ] 처리되지 않은 예외·거부된 Promise·렌더링 오류를 **전역에서** 수집하는가
- [ ] 서버 오류·네트워크 장애만 수집하고 4xx류는 제외하는가
- [ ] 모든 이벤트에 **release·environment**를 태깅하는가
- [ ] 소스맵을 **공개 배포하지 않고** 수집 도구에만 비공개 업로드하는가
- [ ] 사용자 컨텍스트에 **익명/내부 식별자만** 넣고 PII를 제외하는가 (`privacy-pii`)
- [ ] 전송 직전 훅에서 비밀번호·토큰·주민번호 등을 **스크럽**하는가
- [ ] **환경별 샘플링** 매트릭스(dev/staging/prod)를 따르는가
- [ ] 알림을 **영향 임계 기반**으로 거는가 (`observability`)
- [ ] `try/catch`로 잡은 오류를 silent fail로 두지 않는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React/Next, 다른 수집 도구, fetch 기반 클라이언트 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vue 3 (@sentry/vue)

Sentry Vue SDK 기반으로 전역 에러를 수집하고, `beforeSend`로 민감정보를 스크럽하며, Vite 플러그인으로 소스맵을 비공개 업로드한다.

#### 설치
```bash
npm install @sentry/vue
npm install -D @sentry/vite-plugin
```

#### 초기화
```javascript
// src/main.js
import { createApp } from 'vue'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 환경별 트레이싱 비율 — 객체를 직접 인덱싱하면 매칭 없을 때 undefined가 되므로
// 별도 상수로 분리해 ?? 0 으로 number 를 보장한다.
const rate = ({ development: 0, staging: 0.5, production: 0.1 })[import.meta.env.MODE] ?? 0

Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  integrations: [
    Sentry.browserTracingIntegration({ router }),
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })
  ],
  tracesSampleRate: rate,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,
  tracePropagationTargets: ['localhost', /^https:\/\/api\.example\.com/],
  beforeSend: scrubSensitive   // 전송 직전 스크럽 (정의는 아래 "민감정보 스크럽")
})

app.use(router).mount('#app')
```

> 환경별 비율은 본문 §2-8 "환경별 샘플링" 표를 따른다(dev=0, staging≈0.5, prod≈0.1). 위 코드의 `rate`·`replaysOnErrorSampleRate`·환경별 `dsn` 이 그 정책을 구현한 것이다.

#### 사용자 컨텍스트
```javascript
// 로그인 시
import * as Sentry from '@sentry/vue'

Sentry.setUser({
  id: user.id,
  username: user.username
  // email/PII는 넣지 말 것
})

// 로그아웃 시
Sentry.setUser(null)
```

#### 라우트별 Transaction
- `browserTracingIntegration({ router })`가 자동으로 라우트 transition을 transaction으로 기록.
- 추가 컨텍스트:

```javascript
router.afterEach((to) => {
  Sentry.setTag('route', to.name)
})
```

#### 글로벌 에러 핸들러 + Axios Interceptor
```javascript
// src/main.js
app.config.errorHandler = (err, instance, info) => {
  Sentry.captureException(err, {
    contexts: { vue: { componentName: instance?.$options.name, info } }
  })
}

window.addEventListener('unhandledrejection', (e) => {
  Sentry.captureException(e.reason)
})
```

```javascript
// src/utils/axios.js
import api from './axios-instance'
import * as Sentry from '@sentry/vue'

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status ?? 0
    // 4xx 제외, 5xx만 Sentry 전송
    if (status >= 500 || status === 0) {
      Sentry.captureException(err, {
        tags: { type: 'api', status },
        extra: { url: err.config?.url, method: err.config?.method }
      })
    }
    return Promise.reject(err)
  }
)
```

#### Breadcrumb
```javascript
import * as Sentry from '@sentry/vue'

Sentry.addBreadcrumb({
  category: 'user-action',
  message: 'Clicked export button',
  level: 'info',
  data: { reportId: 123 }
})
```

#### 민감정보 스크럽 (`beforeSend`)
```javascript
function scrubSensitive(event) {
  // request body
  if (event.request?.data) {
    const data = typeof event.request.data === 'string'
      ? JSON.parse(event.request.data) : event.request.data
    delete data.password
    delete data.token
    delete data.ssn
    event.request.data = data
  }
  // breadcrumb URL 쿼리스트링 토큰 마스킹
  event.breadcrumbs?.forEach(b => {
    if (b.data?.url) b.data.url = b.data.url.replace(/token=[^&]+/g, 'token=***')
  })
  return event
}
```

#### 소스맵 업로드
```javascript
// vite.config.js
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default {
  build: { sourcemap: 'hidden' },
  plugins: [
    sentryVitePlugin({
      org: 'my-org',
      project: 'frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN, // CI secret
      release: { name: process.env.VITE_APP_VERSION }
    })
  ]
}
```
- 소스맵은 **public 배포 금지** → `sourcemap: 'hidden'`로 Sentry에만 업로드.
