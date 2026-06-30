---
name: API Communication Standard (HTTP Client)
description: A universal standard for frontend HTTP communication — a single HTTP client, automatic token attachment via a request interceptor, refreshing the token once and retrying on 401, unwrapping the response payload, dividing global vs inline error handling, and handling multiple calls. Independent of any specific library/framework. Read this when building an API call layer or designing error-handling/auth flows, or when unifying response formats and where errors are surfaced. Keywords: http client, interceptor, token, 401 refresh, unwrap, global error, retry, allSettled.
rules:
  - "Use only a single HTTP client: create one client instance with common settings (base URL, timeout, interceptors, credentials) and share it across the whole app. Creating a new instance per screen/module drops the interceptors (token, error, unwrap)."
  - "The client attaches the auth token automatically: each call site does not insert the auth header itself. Attach the token in one place only, in the request interceptor (or a common entry point)."
  - "Expiry (401) does not log out immediately: when you receive an auth expiry, attempt a token refresh once, and if it succeeds, retry the original request. Log out only when the refresh fails. Even when several requests receive an expiry simultaneously, refresh only once."
  - "Unwrap the response payload once, in one place: unwrap the server's common wrapper (e.g. { data, ... }) in the response interceptor and pass only the actual data to the call site. The call site does not dig into .data again."
  - "Clearly divide where errors are surfaced: errors the user cannot do anything about (network down, server 5xx) are reported globally (e.g. a toast), and errors that depend on user input/context (4xx: validation, permission) are handled inline by the calling screen."
  - "Forbid meaningless try-catch wrapping: do not keep code that only catches and re-throws as-is. When common handling (interceptors) is enough, the call site deals only with results/errors."
  - "Multiple async calls aggregate partial failures: when sending several requests in parallel, do not discard everything just because one failed; collect successes/failures together and handle them."
tags:
  - "http client"
  - "interceptor"
  - "token"
  - "401 refresh"
  - "unwrap"
  - "global error"
  - "retry"
  - "allSettled"
  - "axios"
  - "fetch("
  - "ApiResponse"
  - "axios.create"
  - "baseURL"
  - "Authorization"
---

# 🔌 API Communication Standard (HTTP Client)

> Funnel all of the frontend's external communication into a single HTTP client, and handle token attachment, response unwrapping, auth refresh, and global errors collectively in interceptors. Read this when writing an API call layer or designing error/auth flows. It is a universal standard not tied to any specific library/framework.

## 1. Core Principles

- **Use only a single HTTP client**: create one client instance with common settings (base URL, timeout, interceptors, credentials) and share it across the whole app. Creating a new instance per screen/module drops the interceptors (token, error, unwrap).
- **The client attaches the auth token automatically**: each call site does not insert the auth header itself. Attach the token in one place only, in the request interceptor (or a common entry point).
- **Expiry (401) does not log out immediately**: when you receive an auth expiry, attempt a token refresh once, and if it succeeds, retry the original request. Log out only when the refresh fails. Even when several requests receive an expiry simultaneously, refresh only once.
- **Unwrap the response payload once, in one place**: unwrap the server's common wrapper (e.g. `{ data, ... }`) in the response interceptor and pass only the actual data to the call site. The call site does not dig into `.data` again.
- **Clearly divide where errors are surfaced**: "errors the user cannot do anything about" (network down, server 5xx) are reported globally (e.g. a toast), and "errors that depend on user input/context" (4xx: validation, permission) are handled inline by the calling screen.
- **Forbid meaningless try-catch wrapping**: do not keep code that only catches and re-throws as-is. When common handling (interceptors) is enough, the call site deals only with results/errors.
- **Multiple async calls aggregate partial failures**: when sending several requests in parallel, do not discard everything just because one failed; collect successes/failures together and handle them.

## 2. Rules

### 2-1. Consolidate into a single HTTP client

- Create one client with base URL, timeout, credentials (cookie sending), and interceptors applied, and share it.
- Do not create a new instance per screen/module — the moment a common interceptor is missing, token, error, and unwrap all break.
- Inject the base URL from per-environment config (no hardcoding). → `env-config`

```text
// ❌ Forbidden — a new client per screen (interceptors missing)
screenA: client = createClient(baseUrl)   // no token/error/unwrap interceptors
screenB: client = createClient(baseUrl)

// ✅ Recommended — share a single instance with common settings + interceptors
apiClient = createClient({ baseUrl: env.API_BASE, timeout, withCredentials })
apiClient.onRequest(attachToken)
apiClient.onResponse(unwrap, handleError)
// All API modules import and use apiClient
```

### 2-2. The interceptor attaches the token automatically

- The call site does not build the auth header itself. The request interceptor reads the current token and attaches it in one place only.
- The choice of where to store the token (memory, cookie, etc.) and its security trade-offs → `security-frontend`.

```text
// ❌ Forbidden — a component inserts the header itself (omission, duplication, inconsistency)
getUsers({ headers: { Authorization: 'Bearer ' + token } })

// ✅ Recommended — the request interceptor attaches it collectively
onRequest(config):
  if auth.accessToken: config.headers.Authorization = 'Bearer ' + auth.accessToken
  return config
```

### 2-3. 401 → refresh the token once, then retry (concurrent requests refresh only once)

- On receiving an auth expiry, do not log out right away; attempt a token refresh once. On success, retry the original request with the new token; on failure, log out then.
- Set an "already retried once" flag so the same request is not retried infinitely.
- Even when several requests receive a 401 simultaneously, share a single refresh operation and perform it only once (reuse the in-flight refresh Promise).

```text
// ❌ Forbidden — log out immediately on 401 (loses the user's work)
onError(err):
  if err.status == 401: auth.logout()

// ✅ Recommended — one refresh attempt, concurrent 401s share a single refresh
onError(err):
  if err.status == 401 and not err.config.retried:
    err.config.retried = true
    refreshing = refreshing ?? auth.refresh()        // reuse the same Promise if in flight
    // Reset only after the refresh finishes (success/failure) — wrap in finally to keep the reuse window.
    // (Clearing it to null immediately makes concurrent 401s each kick off a new refresh, breaking the single refresh)
    newToken = await refreshing.finally(() => refreshing = null)
    if newToken: return client.request(err.config)   // retry the original request
    auth.logout()
```

### 2-4. Unwrap the response payload once, in the interceptor

- Unwrap the server's common wrapper in the response interceptor and return only the actual data. Write call sites and type definitions on the basis of the "unwrapped payload".
- Do not access `.data` again at the call site (double unwrapping is a source of bugs).

```text
// ❌ Forbidden — the interceptor does not unwrap, so every call site repeats .data
res = await getUser(); user = res.data.data   // inconsistent on how deep to dig

// ✅ Recommended — the interceptor unwraps, the call site uses it directly
onResponse(res): return res.data   // unwrap once
user = await getUser()             // already the payload
```

### 2-5. Split API functions by domain and follow a naming convention

- Divide endpoint-call functions into per-domain files so that components do not handle the client directly.
- Unify function names with a consistent convention (e.g. `<verb><noun>` + a common suffix).
- Do not add meaningless `try { ... } catch (e) { throw e }` wrapping — common error handling is done by the interceptor.

```text
// ✅ Recommended — per-domain modules, components only call functions
// api/sensor
getSensors(deckId)  -> client.get('/sensors', { params: { deckId } })
getSensor(id)       -> client.get('/sensors/' + id)
createSensor(body)  -> client.post('/sensors', body)
```

### 2-6. Divide where errors are surfaced (global vs inline)

- Divide handling responsibility by state. Global handling (network, 5xx) in the interceptor, context-dependent handling (4xx) in the calling screen.
- Do not surface validation/permission errors (4xx) as a global toast — they must be inline form messages so the user can fix them.
- Which errors to send to a monitoring tool, and when → `error-monitoring`.

| Status | Handled at | User-facing |
|------|-----------|-------------|
| Network down | Interceptor (global) | Global notification (toast) |
| 401 (expiry) | Interceptor (global) | Refresh attempt → login screen on failure |
| 4xx (validation/permission) | Calling screen (inline) | Inline form/field message |
| 5xx | Interceptor (global) | Global notification + monitoring capture |

```text
// ✅ Recommended — global in the interceptor, delegate 4xx to the caller
onError(err):
  if no response:        notifyGlobal('Check your network'); reject(NETWORK)
  if err.status >= 500:  notifyGlobal('Server error'); 
  reject(err.payload)    // the calling screen receives 4xx and handles it inline
```

### 2-7. Multiple async calls aggregate partial failures

- When sending several requests in parallel, do not discard the whole over one failure. Collect all successes/failures, then gather and handle only the failures.

```text
// ❌ Forbidden — one failure discards the other successes wholesale
[a, b, c] = await all([reqA, reqB, reqC])

// ✅ Recommended — collect successes/failures together and aggregate only failures
results = await allSettled([reqA, reqB, reqC])
ok      = results.filter(fulfilled).map(value)
failed  = results.filter(rejected)
if failed: handle/display only the failures separately
```

## 3. Common Mistakes

- **Creating a new client per screen** → interceptors (token, error, unwrap) missing. Share a single instance.
- **A component inserts the token into the header directly** → omission, duplication, inconsistency. Consolidate in the request interceptor.
- **Logging out immediately on 401** → user input is lost. A single refresh attempt comes first.
- **Refreshing each concurrent 401 separately** → token refresh runs redundantly multiple times. Share the in-flight refresh.
- **Repeating unwrap at the call site** → inconsistent on how deep to dig into `.data`. Unwrap once in the interceptor.
- **Handling 4xx with a global toast** → form validation/permission messages pop up as toasts, ruining UX. Handle inline.
- **Meaningless try-catch rethrow** → remove wrapping that only catches and re-throws as-is. The interceptor is enough.
- **Ignoring partial failures across multiple calls** → swallowing some failures or discarding the whole. Aggregate successes/failures.

## 4. Checklist

- [ ] Do all API calls share a **single HTTP client** instance?
- [ ] Is the base URL injected from environment config (not hardcoded)?
- [ ] Is the auth token **attached collectively in the request interceptor**, with no call site inserting it directly?
- [ ] On 401, is it **refresh once → retry**, logging out only on failure?
- [ ] On concurrent 401s, is the refresh performed **only once** (sharing the in-flight refresh)?
- [ ] Is the response payload **unwrapped once in the interceptor**, with no re-access at the call site?
- [ ] Are API functions split into **per-domain files** following a consistent naming convention?
- [ ] Are network/5xx handled **globally** and 4xx handled **inline in the calling screen**?
- [ ] Is there no meaningless try-catch rethrow?
- [ ] Across multiple async calls, are **partial failures aggregated** (successes/failures separated)?

## Appendix: Per-Stack Examples

> Below are reference implementation examples. Add examples matching the stack your team uses (e.g. React + fetch/TanStack Query, Angular HttpClient, Svelte, etc.) following the same pattern. The principles/rules of 1–4 above are the standard; the appendix is merely an application of them.

### Vue 3 (Axios + Pinia)

Based on a single Axios instance + a Pinia auth store. Token interceptor, response unwrap, 401 refresh, and global errors are handled in interceptors, and a `useApi` composable bundles the component's loading/error state.

> Related skills:
> - Token storage (localStorage vs httpOnly cookie): [security-frontend](../../security/security-frontend/SKILL.md) §2
> - When to send errors to Sentry: [error-monitoring](../error-monitoring/SKILL.md) §5
> - Per-environment base URL: [env-config](../env-config/SKILL.md)

#### Axios instance (`src/utils/axios.ts`)

All API functions use this single instance. Calling `axios.create` again per screen drops the interceptors.

```ts
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth'
import { showErrorToast } from '@/utils/toast'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,    // see env-config
  timeout: 20_000,                                // 20s
  withCredentials: true,                          // send httpOnly cookie (refresh)
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',                 // Spring Security CSRF matching
})

/* ── Request: auto-attach Access Token ───────────────────────── */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.set('Authorization', `Bearer ${auth.accessToken}`)
  }
  return config
})

/* ── Response: unwrap + 401 refresh + global error ──────────────────── */
let refreshing: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res.data,                              // auto-unwrap .data
  async (error: AxiosError<any>) => {
    const { response, config } = error
    if (!response) {
      showErrorToast('Please check your network connection.')
      return Promise.reject({ code: 'NETWORK', message: 'Network error' })
    }

    // 401 → attempt refresh once (refresh only once on a burst of concurrent 401s)
    if (response.status === 401 && !(config as any)._retried) {
      (config as any)._retried = true
      const auth = useAuthStore()
      refreshing ??= auth.refresh()
      const newToken = await refreshing.finally(() => { refreshing = null })
      if (newToken) {
        config!.headers!.set('Authorization', `Bearer ${newToken}`)
        return api.request(config!)
      }
      auth.logout()
      return Promise.reject({ code: 'AUTH_EXPIRED', message: 'Please log in again.' })
    }

    // only 5xx gets a global toast; 4xx is handled by the caller
    if (response.status >= 500) {
      showErrorToast('A temporary server error occurred. Please try again shortly.')
    }
    return Promise.reject(response.data ?? { code: 'UNKNOWN', message: 'Error' })
  }
)

export default api
```

> ⚠️ Since the interceptor already unwrapped `response.data`, do not access `.data` again at the call site. Type definitions should also reflect the response payload as-is.

#### API function authoring rules

Split by domain file. Function names use the `<verb><noun>Api` suffix. **Do not just rethrow with `try-catch`** (meaningless; the interceptor is enough).

```ts
// src/api/sensorApi.ts
import api from '@/utils/axios'
import type { SensorReading, CreateSensorPayload } from '@/types/sensor'

export const getSensorsApi = (deckId: string) =>
  api.get<unknown, SensorReading[]>('/api/v1/sensors', { params: { deckId } })

export const getSensorApi = (id: string) =>
  api.get<unknown, SensorReading>(`/api/v1/sensors/${id}`)

export const createSensorApi = (payload: CreateSensorPayload) =>
  api.post<unknown, SensorReading>('/api/v1/sensors', payload)
```

#### `useApi` composable (for reactive calls)

A thin wrapper over VueUse `useAsyncState`. For when you need loading/error state alongside it within a component.

```ts
// src/composables/useApi.ts
import { ref, type Ref } from 'vue'

export interface UseApiResult<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<{ code: string; message: string } | null>
  execute: (...args: any[]) => Promise<T | null>
}

export function useApi<T>(
  fn: (...args: any[]) => Promise<T>,
  options: { immediate?: boolean } = {}
): UseApiResult<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<{ code: string; message: string } | null>(null)

  const execute = async (...args: any[]) => {
    loading.value = true
    error.value = null
    try {
      data.value = await fn(...args)
      return data.value
    } catch (e: any) {
      error.value = { code: e?.code ?? 'UNKNOWN', message: e?.message ?? 'Error' }
      return null
    } finally {
      loading.value = false
    }
  }

  if (options.immediate) void execute()
  return { data, loading, error, execute }
}
```

Usage (`<script setup>`):
```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { getSensorsApi } from '@/api/sensorApi'
import { useApi } from '@/composables/useApi'

const props = defineProps<{ deckId: string }>()
const { data: sensors, loading, error, execute } = useApi(() => getSensorsApi(props.deckId))
onMounted(execute)
</script>

<template>
  <v-progress-circular v-if="loading" indeterminate />
  <v-alert v-else-if="error" type="error">
    {{ error.message }}
    <v-btn @click="execute">Retry</v-btn>
  </v-alert>
  <SensorList v-else :items="sensors ?? []" />
</template>
```

#### Global error handling principle

The division of where errors are surfaced (network/5xx = global, 4xx = inline in the calling screen) follows the table in §2-6 of the main text exactly. The interceptor code above implements that mapping.
