---
name: API 통신 표준 (HTTP Client)
description: 프런트엔드 HTTP 통신의 범용 표준 — 단일 HTTP 클라이언트, 요청 인터셉터로 토큰 자동 첨부, 401 시 토큰 1회 갱신 후 재시도, 응답 페이로드 언랩, 전역 vs 인라인 에러 분담, 다중 호출 처리. 특정 라이브러리/프레임워크에 무관하다. API 호출 레이어를 만들거나 에러 처리·인증 흐름을 설계할 때, 응답 포맷·에러 노출 위치를 통일할 때 읽는다. 키워드: http client, interceptor, token, 401 refresh, unwrap, global error, retry, allSettled.
rules:
  - "단일 HTTP 클라이언트만 사용한다: 공통 설정(기본 URL·타임아웃·인터셉터·자격증명)을 적용한 클라이언트 인스턴스를 한 번만 만들어 전체에서 공유한다. 화면·모듈마다 새 인스턴스를 만들면 인터셉터(토큰·에러·언랩)가 누락된다."
  - "인증 토큰은 클라이언트가 자동으로 첨부한다: 각 호출부가 인증 헤더를 직접 박지 않는다. 요청 인터셉터(또는 공통 진입 지점)에서 한곳에서만 토큰을 붙인다."
  - "만료(401)는 즉시 로그아웃하지 않는다: 인증 만료를 받으면 토큰 갱신을 1회 시도하고, 갱신에 성공하면 원래 요청을 재시도한다. 갱신이 실패할 때만 로그아웃한다. 동시에 여러 요청이 만료를 받아도 갱신은 한 번만 수행한다."
  - "응답 페이로드는 한곳에서 한 번만 언랩한다: 서버 공통 래퍼(예: { data, ... })를 응답 인터셉터에서 풀어 실제 데이터만 호출부에 넘긴다. 호출부가 다시 .data 를 파고들지 않는다."
  - "에러 노출 위치를 명확히 나눈다: '사용자가 손쓸 수 없는 오류'(네트워크 끊김·서버 5xx)는 전역으로(예: 토스트) 알리고, '사용자 입력/맥락에 달린 오류'(4xx: 검증·권한)는 호출한 화면이 인라인으로 처리한다."
  - "무의미한 try-catch 래핑을 금지한다: 잡아서 그대로 다시 던지기만 하는 코드는 두지 않는다. 공통 처리(인터셉터)로 충분하면 호출부는 결과/에러만 다룬다."
  - "다중 비동기 호출은 부분 실패를 집계한다: 여러 요청을 병렬로 보낼 때 하나가 실패했다고 전부 버리지 말고, 성공/실패를 함께 거둬 처리한다."
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

# 🔌 API 통신 표준 (HTTP Client)

> 프런트엔드의 모든 외부 통신을 단일 HTTP 클라이언트로 모으고, 인터셉터에서 토큰 첨부·응답 언랩·인증 갱신·전역 에러를 일괄 처리한다. API 호출 레이어를 작성하거나 에러 흐름·인증 흐름을 설계할 때 읽는다. 특정 라이브러리/프레임워크에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙

- **단일 HTTP 클라이언트만 사용한다**: 공통 설정(기본 URL·타임아웃·인터셉터·자격증명)을 적용한 클라이언트 인스턴스를 한 번만 만들어 전체에서 공유한다. 화면·모듈마다 새 인스턴스를 만들면 인터셉터(토큰·에러·언랩)가 누락된다.
- **인증 토큰은 클라이언트가 자동으로 첨부한다**: 각 호출부가 인증 헤더를 직접 박지 않는다. 요청 인터셉터(또는 공통 진입 지점)에서 한곳에서만 토큰을 붙인다.
- **만료(401)는 즉시 로그아웃하지 않는다**: 인증 만료를 받으면 토큰 갱신을 1회 시도하고, 갱신에 성공하면 원래 요청을 재시도한다. 갱신이 실패할 때만 로그아웃한다. 동시에 여러 요청이 만료를 받아도 갱신은 한 번만 수행한다.
- **응답 페이로드는 한곳에서 한 번만 언랩한다**: 서버 공통 래퍼(예: `{ data, ... }`)를 응답 인터셉터에서 풀어 실제 데이터만 호출부에 넘긴다. 호출부가 다시 `.data` 를 파고들지 않는다.
- **에러 노출 위치를 명확히 나눈다**: "사용자가 손쓸 수 없는 오류"(네트워크 끊김·서버 5xx)는 전역으로(예: 토스트) 알리고, "사용자 입력/맥락에 달린 오류"(4xx: 검증·권한)는 호출한 화면이 인라인으로 처리한다.
- **무의미한 try-catch 래핑을 금지한다**: 잡아서 그대로 다시 던지기만 하는 코드는 두지 않는다. 공통 처리(인터셉터)로 충분하면 호출부는 결과/에러만 다룬다.
- **다중 비동기 호출은 부분 실패를 집계한다**: 여러 요청을 병렬로 보낼 때 하나가 실패했다고 전부 버리지 말고, 성공/실패를 함께 거둬 처리한다.

## 2. 규칙

### 2-1. 단일 HTTP 클라이언트로 일원화

- 기본 URL·타임아웃·자격증명(쿠키 전송)·인터셉터를 적용한 클라이언트를 한 번 생성해 공유한다.
- 화면·모듈마다 새 인스턴스를 만들지 않는다 — 공통 인터셉터가 빠지는 순간 토큰·에러·언랩이 모두 깨진다.
- 기본 URL은 환경별 설정에서 주입한다(하드코딩 금지). → `env-config`

```text
// ❌ 금지 — 화면마다 새 클라이언트 (인터셉터 누락)
screenA: client = createClient(baseUrl)   // 토큰/에러/언랩 인터셉터 없음
screenB: client = createClient(baseUrl)

// ✅ 권장 — 공통 설정 + 인터셉터를 붙인 단일 인스턴스를 공유
apiClient = createClient({ baseUrl: env.API_BASE, timeout, withCredentials })
apiClient.onRequest(attachToken)
apiClient.onResponse(unwrap, handleError)
// 모든 API 모듈이 apiClient 를 import 해서 사용
```

### 2-2. 토큰은 인터셉터가 자동 첨부

- 인증 헤더를 호출부가 직접 만들지 않는다. 요청 인터셉터에서 현재 토큰을 읽어 한곳에서만 붙인다.
- 토큰 저장 위치(메모리·쿠키 등)의 선택과 보안 트레이드오프는 → `security-frontend`.

```text
// ❌ 금지 — 컴포넌트가 헤더를 직접 박음 (누락·중복·불일치)
getUsers({ headers: { Authorization: 'Bearer ' + token } })

// ✅ 권장 — 요청 인터셉터가 일괄 첨부
onRequest(config):
  if auth.accessToken: config.headers.Authorization = 'Bearer ' + auth.accessToken
  return config
```

### 2-3. 401 → 토큰 1회 갱신 후 재시도 (동시 요청은 한 번만 갱신)

- 인증 만료를 받으면 곧바로 로그아웃하지 말고 토큰 갱신을 1회 시도한다. 성공하면 새 토큰으로 원래 요청을 재시도, 실패하면 그때 로그아웃한다.
- 같은 요청이 무한 재시도되지 않도록 "이미 한 번 재시도함" 표시를 둔다.
- 동시에 여러 요청이 401을 받아도 갱신 작업은 하나만 공유해 한 번만 수행한다(진행 중 갱신 Promise 재사용).

```text
// ❌ 금지 — 401 즉시 로그아웃 (사용자 작업 유실)
onError(err):
  if err.status == 401: auth.logout()

// ✅ 권장 — 1회 갱신 시도, 동시 401은 단일 갱신 공유
onError(err):
  if err.status == 401 and not err.config.retried:
    err.config.retried = true
    refreshing = refreshing ?? auth.refresh()        // 진행 중이면 같은 Promise 재사용
    // 갱신이 끝(성공/실패)나야 리셋한다 — finally 로 묶어 재사용 창을 유지.
    // (즉시 null 로 비우면 동시 401들이 각자 새 갱신을 띄워 단일 갱신이 깨진다)
    newToken = await refreshing.finally(() => refreshing = null)
    if newToken: return client.request(err.config)   // 원요청 재시도
    auth.logout()
```

### 2-4. 응답 페이로드는 인터셉터에서 한 번만 언랩

- 서버 공통 래퍼를 응답 인터셉터에서 풀어 실제 데이터만 반환한다. 호출부·타입 정의는 "언랩된 페이로드" 기준으로 작성한다.
- 호출부에서 `.data` 를 다시 접근하지 않는다(이중 언랩은 버그의 원인).

```text
// ❌ 금지 — 인터셉터가 안 풀어서 호출부마다 .data 반복
res = await getUser(); user = res.data.data   // 어디까지 파야 하는지 제각각

// ✅ 권장 — 인터셉터가 언랩, 호출부는 바로 사용
onResponse(res): return res.data   // 한 번만 언랩
user = await getUser()             // 이미 페이로드
```

### 2-5. API 함수는 도메인별로 분리하고 명명 규칙을 따른다

- 엔드포인트 호출 함수를 도메인 단위 파일로 나누고, 컴포넌트가 클라이언트를 직접 다루지 않게 한다.
- 함수명은 일관된 규칙(예: `<동사><명사>` + 공통 접미사)으로 통일한다.
- 의미 없는 `try { ... } catch (e) { throw e }` 래핑을 넣지 않는다 — 공통 에러 처리는 인터셉터가 한다.

```text
// ✅ 권장 — 도메인별 모듈, 컴포넌트는 함수만 호출
// api/sensor
getSensors(deckId)  -> client.get('/sensors', { params: { deckId } })
getSensor(id)       -> client.get('/sensors/' + id)
createSensor(body)  -> client.post('/sensors', body)
```

### 2-6. 에러 노출 위치 분담 (전역 vs 인라인)

- 처리 책임을 상태별로 나눈다. 전역 처리(네트워크·5xx)는 인터셉터에서, 맥락 의존 처리(4xx)는 호출한 화면에서.
- 검증/권한 오류(4xx)를 전역 토스트로 띄우지 않는다 — 폼 인라인 메시지여야 사용자가 고칠 수 있다.
- 모니터링 도구로 보낼 오류와 그 시점은 → `error-monitoring`.

| 상태 | 처리 위치 | 사용자 노출 |
|------|-----------|-------------|
| 네트워크 끊김 | 인터셉터(전역) | 전역 알림(토스트) |
| 401 (만료) | 인터셉터(전역) | 갱신 시도 → 실패 시 로그인 화면 |
| 4xx (검증/권한) | 호출 화면(인라인) | 폼/필드 인라인 메시지 |
| 5xx | 인터셉터(전역) | 전역 알림 + 모니터링 캡처 |

```text
// ✅ 권장 — 전역은 인터셉터, 4xx 는 호출자에게 위임
onError(err):
  if no response:        notifyGlobal('네트워크 확인'); reject(NETWORK)
  if err.status >= 500:  notifyGlobal('서버 오류'); 
  reject(err.payload)    // 4xx 는 호출 화면이 받아서 인라인 처리
```

### 2-7. 다중 비동기 호출은 부분 실패를 집계

- 여러 요청을 병렬로 보낼 때 하나의 실패로 전체를 버리지 않는다. 성공/실패를 모두 거둔 뒤 실패분만 모아 처리한다.

```text
// ❌ 금지 — 하나 실패하면 나머지 성공도 통째로 버려짐
[a, b, c] = await all([reqA, reqB, reqC])

// ✅ 권장 — 성공/실패를 함께 거두고 실패만 집계
results = await allSettled([reqA, reqB, reqC])
ok      = results.filter(fulfilled).map(value)
failed  = results.filter(rejected)
if failed: 실패만 별도 처리/표시
```

## 3. 흔한 실수

- **화면마다 새 클라이언트 생성** → 인터셉터(토큰·에러·언랩) 누락. 단일 인스턴스를 공유한다.
- **토큰을 컴포넌트가 직접 헤더에 박음** → 누락·중복·불일치. 요청 인터셉터로 일원화.
- **401에서 즉시 로그아웃** → 사용자 입력이 날아간다. 갱신 1회 시도가 우선.
- **동시 401을 각각 갱신** → 토큰 갱신이 여러 번 중복 실행된다. 진행 중 갱신을 공유한다.
- **언랩을 호출부에서 반복** → 어디까지 `.data` 를 파야 하는지 제각각. 인터셉터에서 한 번만 언랩.
- **4xx를 전역 토스트로 처리** → 폼 검증/권한 메시지가 토스트로 떠 UX가 망가진다. 인라인으로.
- **의미 없는 try-catch rethrow** → 잡아서 그대로 던지기만 하는 래핑은 제거. 인터셉터로 충분.
- **다중 호출에서 부분 실패 무시** → 일부 실패를 삼키거나 전체를 버린다. 성공/실패를 집계한다.

## 4. 체크리스트

- [ ] 모든 API 호출이 **단일 HTTP 클라이언트** 인스턴스를 공유하는가
- [ ] 기본 URL을 환경 설정에서 주입하는가(하드코딩 아님)
- [ ] 인증 토큰을 **요청 인터셉터에서 일괄 첨부**하고 호출부가 직접 박지 않는가
- [ ] 401 시 **토큰 1회 갱신 → 재시도**, 실패할 때만 로그아웃하는가
- [ ] 동시 401에서 갱신 작업을 **한 번만** 수행(진행 중 갱신 공유)하는가
- [ ] 응답 페이로드를 **인터셉터에서 한 번만 언랩**하고 호출부에서 재접근하지 않는가
- [ ] API 함수가 **도메인별 파일**로 분리되고 일관된 명명 규칙을 따르는가
- [ ] 네트워크·5xx는 **전역**, 4xx는 **호출 화면 인라인**으로 처리하는가
- [ ] 의미 없는 try-catch rethrow가 없는가
- [ ] 다중 비동기 호출에서 **부분 실패를 집계**(성공/실패 분리)하는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React + fetch/TanStack Query, Angular HttpClient, Svelte 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vue 3 (Axios + Pinia)

Axios 단일 인스턴스 + Pinia auth store 기반. 토큰 인터셉터·응답 언랩·401 갱신·전역 에러를 인터셉터에서 처리하고, `useApi` composable 로 컴포넌트의 로딩/에러 상태를 묶는다.

> 관련 스킬:
> - 토큰 저장 (localStorage vs httpOnly cookie): [security-frontend](../../security/security-frontend/SKILL.md) §2
> - 에러를 Sentry로 보내는 시점: [error-monitoring](../error-monitoring/SKILL.md) §5
> - 환경별 base URL: [env-config](../env-config/SKILL.md)

#### Axios 인스턴스 (`src/utils/axios.ts`)

모든 API 함수는 이 단일 인스턴스를 사용한다. `axios.create` 를 화면마다 다시 호출하면 인터셉터가 누락된다.

```ts
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth'
import { showErrorToast } from '@/utils/toast'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,    // env-config 참고
  timeout: 20_000,                                // 20s
  withCredentials: true,                          // httpOnly 쿠키(refresh) 전송
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',                 // Spring Security CSRF 매칭
})

/* ── Request: Access Token 자동 첨부 ───────────────────────── */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.set('Authorization', `Bearer ${auth.accessToken}`)
  }
  return config
})

/* ── Response: 언랩 + 401 갱신 + 전역 에러 ──────────────────── */
let refreshing: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res.data,                              // .data 자동 언랩
  async (error: AxiosError<any>) => {
    const { response, config } = error
    if (!response) {
      showErrorToast('네트워크 연결을 확인해주세요.')
      return Promise.reject({ code: 'NETWORK', message: '네트워크 오류' })
    }

    // 401 → refresh 1회 시도 (동시 401 다발 시 한 번만 갱신)
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
      return Promise.reject({ code: 'AUTH_EXPIRED', message: '다시 로그인해주세요.' })
    }

    // 5xx 만 전역 토스트, 4xx 는 호출자가 처리
    if (response.status >= 500) {
      showErrorToast('일시적인 서버 오류입니다. 잠시 후 다시 시도해주세요.')
    }
    return Promise.reject(response.data ?? { code: 'UNKNOWN', message: '오류' })
  }
)

export default api
```

> ⚠️ 인터셉터에서 `response.data` 를 언랩했으므로 호출부에서 `.data` 다시 접근하지 말 것. 타입 정의도 응답 페이로드 그대로.

#### API 함수 작성 규칙

도메인별 파일로 분리. 함수명은 `<동사><명사>Api` 접미사. **`try-catch` 로 그냥 rethrow 하지 말 것** (의미 없음, 인터셉터로 충분).

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

#### `useApi` Composable (반응형 호출용)

VueUse `useAsyncState` 위 얇은 래퍼. 컴포넌트 안에서 로딩/에러 상태가 같이 필요할 때.

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
      error.value = { code: e?.code ?? 'UNKNOWN', message: e?.message ?? '오류' }
      return null
    } finally {
      loading.value = false
    }
  }

  if (options.immediate) void execute()
  return { data, loading, error, execute }
}
```

사용 (`<script setup>`):
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
    <v-btn @click="execute">다시 시도</v-btn>
  </v-alert>
  <SensorList v-else :items="sensors ?? []" />
</template>
```

#### 전역 에러 처리 원칙

에러 노출 위치 분담(네트워크·5xx=전역, 4xx=호출 화면 인라인)은 본문 §2-6 표를 그대로 따른다. 위 인터셉터 코드가 그 매핑을 구현한 것이다.
