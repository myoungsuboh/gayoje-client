---
name: Error Monitoring (Error Monitoring)
description: A universal standard for front-end error collection — adopting an error-collection tool, uploading source maps (privately), tagging releases and environments, identifying context and user impact, masking PII, sampling per environment, alert thresholds. Tool/framework-agnostic. Read this when attaching or overhauling error monitoring on a front end, or when deciding what to capture/exclude, source maps, sampling, and PII handling. Keywords: error monitoring, crash reporting, sourcemap, release tagging, environment, breadcrumb, sampling, PII scrub, capture, alert threshold.
rules:
  - "Lose no errors (global capture): intercept unhandled exceptions, rejected Promises, and render errors globally in one place so nothing is missed no matter which code path blows up. Do not just log console.error and stop, or swallow it with try/catch into a silent fail."
  - "Separate signal from noise: do not send every error. Capture only genuine defects the user cannot do anything about (server errors, network failures, unexpected exceptions), and exclude errors that are part of the normal flow (4xx-type such as input-validation failures) to prevent a noise explosion."
  - "Tag release and environment: attach to every event which version (release) and which environment (dev/staging/prod) it occurred in, so you can trace which deploy a regression started from."
  - "Restore original locations with source maps, but do not publish them: upload to the collection tool only the source maps that map minified/obfuscated stack traces back to original source locations. Do not export source maps together with public build artifacts (original code exposure)."
  - "Leave context and user impact: leave the user's action trail just before the error (breadcrumb), the screen/route where it occurred, and an anonymous user identifier together to aid reproduction and grasping the impact scope (how many people, on which screen)."
  - "Remove PII before sending: do not put personally identifiable information or secrets (email, password, token, national ID, etc.) into the user context or payload; mask/delete them in a hook right before sending. Follow the separate skill (privacy-pii) for detailed criteria."
  - "Sample per environment: set collection/tracing rates differently per environment. Development is usually disabled to save quota and noise, and production rates are set to match error impact."
  - "Alert by threshold: do not funnel every event into alerts; alert only when impact (frequency, number of users, whether it is a new regression) exceeds a threshold to prevent alert fatigue. View operational observability as a whole together with the observability skill."
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

# 🛰️ Error Monitoring (Error Monitoring)

> A standard for safely collecting and diagnosing errors that occur on the front end and prioritizing problems with high user impact. Read this when adopting or overhauling error monitoring, or when deciding what to capture/exclude and settling source maps, release tagging, sampling, and PII handling. It is a universal standard not tied to a specific collection tool (e.g., Sentry) or framework (e.g., Vue). See the appendix at the very end for concrete application examples.

## 1. Core Principles
- **Lose no errors (global capture)**: intercept unhandled exceptions, rejected Promises, and render errors globally in one place so nothing is missed no matter which code path blows up. Do not just log `console.error` and stop, or swallow it with `try/catch` into a silent fail.
- **Separate signal from noise**: do not send every error. Capture only genuine defects the user cannot do anything about (server errors, network failures, unexpected exceptions), and exclude errors that are part of the normal flow (4xx-type such as input-validation failures) to prevent a noise explosion.
- **Tag release and environment**: attach to every event which version (release) and which environment (dev/staging/prod) it occurred in, so you can trace which deploy a regression started from.
- **Restore original locations with source maps, but do not publish them**: upload to the collection tool only the source maps that map minified/obfuscated stack traces back to original source locations. Do not export source maps together with public build artifacts (original code exposure).
- **Leave context and user impact**: leave the user's action trail just before the error (breadcrumb), the screen/route where it occurred, and an anonymous user identifier together to aid reproduction and grasping the impact scope (how many people, on which screen).
- **Remove PII before sending**: do not put personally identifiable information or secrets (email, password, token, national ID, etc.) into the user context or payload; mask/delete them in a hook right before sending. Follow the separate skill (`privacy-pii`) for detailed criteria.
- **Sample per environment**: set collection/tracing rates differently per environment. Development is usually disabled to save quota and noise, and production rates are set to match error impact.
- **Alert by threshold**: do not funnel every event into alerts; alert only when impact (frequency, number of users, whether it is a new regression) exceeds a threshold to prevent alert fatigue. View operational observability as a whole together with the `observability` skill.

## 2. Rules

### 2-1. Capture everything globally
- Intercept unhandled exceptions, rejected Promises, and framework render errors in a single global hook.
- If caught in an individual `try/catch`, either recover, or for errors you cannot recover from, report to the collection tool and then rethrow — do not silently swallow.

```text
// ❌ Forbidden — caught and silently discarded (no one knows what happened)
try { doWork() } catch (e) { console.error(e) }   // not collected

// ✅ Recommended — bulk-capture via global hooks + report then rethrow what you cannot handle
onUnhandledError(e   => capture(e))
onUnhandledRejection(e => capture(e.reason))
onFrameworkError(e   => capture(e))
try { doWork() } catch (e) { capture(e); throw e }
```

### 2-2. Distinguish errors to capture from errors to exclude
- Capture only defects the user cannot do anything about (server errors, network failures, unexpected exceptions).
- Exclude client errors that are part of the normal flow (4xx-type such as input-validation failures) — they only grow noise and bury the signal.
- Decide which errors to send in one place (a shared network layer/filter).

```text
// ❌ Forbidden — capture all network errors (404/401 noise explosion)
onApiError(err => capture(err))

// ✅ Recommended — capture only server errors and network failures, exclude 4xx
onApiError(err => {
  if (err.status >= 500 || err.networkFailed) capture(err)
})
```

### 2-3. Tag release and environment on every event
- Automatically attach the build-time version as release and the runtime environment as environment to every event.
- Without tagging you cannot trace "from which deploy did it break."

```text
// ✅ Recommended — set once at init → auto-attached to every event
monitor.init({
  environment: currentEnv,   // dev | staging | prod
  release:     appVersion,   // version/commit injected into the build
})
```

### 2-4. Upload source maps only to the tool, never to public deploys
- Do not bundle and publish source maps in build artifacts; upload them privately only to the collection tool.
- Perform the upload in CI with a secret token, and align the release identifier so stack traces map accurately.

```text
// ❌ Forbidden — bundling source maps with public artifacts (original code exposure)
build: emit *.map alongside public assets

// ✅ Recommended — no source maps in public artifacts, upload only to the tool
build:  generate hidden sourcemaps (not served publicly)
deploy: upload sourcemaps to monitoring tool, keyed by release
```

### 2-5. Record user impact with anonymous identifiers
- Put only anonymous/internal identifiers into the user context so you can aggregate "how many people were affected."
- Do not include PII such as email (see 2-7). Clear the user context on logout.

```text
// ❌ Forbidden — attaching PII to the user context
setUser({ id, email, phone })

// ✅ Recommended — only anonymous/internal identifiers
setUser({ id: user.id, displayName: user.handle })  // PII excluded
onLogout(() => setUser(null))
```

### 2-6. Record context (trail, screen/route) together
- Leave the user's action trail just before the error (breadcrumb) and the screen/route tag where it occurred to aid reproduction.
- Keep tokens/secrets out of the trail (2-7).

```text
// ✅ Recommended — action trail + current screen tag
addBreadcrumb({ category: 'user-action', message: 'Clicked export' })
onRouteChange(route => setTag('route', route.name))
```

### 2-7. Remove PII and secrets before sending
- In a hook right before sending, mask/delete sensitive data (password, token, national ID, etc.) in the payload, trail, and URL query.
- Follow the `privacy-pii` skill for what counts as PII and masking criteria.

```text
// ✅ Recommended — scrub hook right before sending
beforeSend(event => {
  redact(event.payload, ['password', 'token', 'ssn'])
  maskQueryParams(event.breadcrumbs, ['token', 'access_token'])
  return event
})
```

### 2-8. Set sampling rates per environment
- Separate collection/tracing rates per environment. Development usually disabled, production rates set to match impact.
- Receive as many of the errors themselves as possible (the important signal), but lower the rate for costly tracing/session recording.

```text
// ✅ Recommended — separate rates with a per-environment matrix
sampleRate = { dev: 0, staging: 0.5, prod: 0.1 }[currentEnv] ?? 0
```

| Environment | Collection enabled | Tracing rate | Note |
|---|---|---|---|
| development | off | 0 | save local noise/quota |
| staging | on | medium (e.g., 0.5) | pre-validation |
| production | on | low (e.g., 0.1) | adjust to match impact |

### 2-9. Alert on impact thresholds
- Alert only on issues that exceed thresholds such as new regression, surge, or number of affected users — do not alert on every individual event.
- Decide thresholds/routing (who, which channel) by team agreement, and link operational observability with the `observability` skill.

```text
// ✅ Recommended — threshold-based alerts (example policy)
alert when: a new issue first occurs OR a surge of occurrences within 24h OR affected users ≥ N
mute:       existing known issues, below threshold
```

## 3. Common Mistakes
- **Capturing all 4xx** → 404/401 noise explodes and real defects get buried. Server errors and network failures only.
- **Enabling collection even in development** → local errors pollute quota/dashboards. Disable dev.
- **Sending PII** → putting email/phone/token into user context/payload. Anonymous identifiers + scrub before sending.
- **Publishing source maps** → bundling `*.map` in public artifacts exposes original code. Upload privately only to the tool.
- **Missing release/environment tagging** → cannot trace from which deploy it broke. Always tag at init.
- **Caught with `try/catch` and not reported (silent fail)** → the error vanishes. Report and rethrow, or recover.
- **Only logging `console.error`** → if not captured to the collection tool, it is not observed.
- **Alerting on every event** → alert fatigue makes you miss the truly important signal. Threshold-based.

## 4. Checklist
- [ ] Are unhandled exceptions, rejected Promises, and render errors captured **globally**?
- [ ] Do you capture only server errors and network failures, excluding 4xx-type?
- [ ] Do you tag **release and environment** on every event?
- [ ] Do you upload source maps privately only to the collection tool, **not publishing them**?
- [ ] Do you put **only anonymous/internal identifiers** in the user context, excluding PII (`privacy-pii`)?
- [ ] Do you **scrub** password, token, national ID, etc. in a hook right before sending?
- [ ] Do you follow a **per-environment sampling** matrix (dev/staging/prod)?
- [ ] Do you alert on an **impact-threshold basis** (`observability`)?
- [ ] Do you avoid leaving errors caught with `try/catch` as a silent fail?

## Appendix: Per-Stack Examples

> The following are reference implementation examples. Add examples that fit your team's stack (e.g., React/Next, a different collection tool, a fetch-based client) using the same pattern. The principles and rules in 1–4 above are the standard; the appendix is merely an application case.

### Vue 3 (@sentry/vue)

Based on the Sentry Vue SDK, collect global errors, scrub sensitive data with `beforeSend`, and privately upload source maps via a Vite plugin.

#### Install
```bash
npm install @sentry/vue
npm install -D @sentry/vite-plugin
```

#### Initialization
```javascript
// src/main.js
import { createApp } from 'vue'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// Per-environment tracing rate — indexing the object directly becomes undefined on no match,
// so separate it into a constant and guarantee a number with ?? 0.
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
  beforeSend: scrubSensitive   // scrub right before sending (defined below in "Sensitive data scrub")
})

app.use(router).mount('#app')
```

> Per-environment rates follow the §2-8 "Sampling per environment" table in the body (dev=0, staging≈0.5, prod≈0.1). The `rate`, `replaysOnErrorSampleRate`, and per-environment `dsn` in the code above implement that policy.

#### User context
```javascript
// On login
import * as Sentry from '@sentry/vue'

Sentry.setUser({
  id: user.id,
  username: user.username
  // do not put email/PII
})

// On logout
Sentry.setUser(null)
```

#### Per-route Transaction
- `browserTracingIntegration({ router })` automatically records route transitions as transactions.
- Additional context:

```javascript
router.afterEach((to) => {
  Sentry.setTag('route', to.name)
})
```

#### Global error handler + Axios Interceptor
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
    // exclude 4xx, send only 5xx to Sentry
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

#### Sensitive data scrub (`beforeSend`)
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
  // mask tokens in breadcrumb URL query strings
  event.breadcrumbs?.forEach(b => {
    if (b.data?.url) b.data.url = b.data.url.replace(/token=[^&]+/g, 'token=***')
  })
  return event
}
```

#### Source map upload
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
- Source maps are **forbidden in public deploys** → upload only to Sentry with `sourcemap: 'hidden'`.
