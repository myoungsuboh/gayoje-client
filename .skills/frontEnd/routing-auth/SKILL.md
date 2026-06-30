---
name: 라우팅 인증/권한 표준 (Routing Auth & Authorization)
description: 클라이언트 라우팅에서 인증·권한을 다루는 범용 표준 — 라우트 가드 일괄 검사, 공개 경로 단일 관리, 토큰 영속 저장 지양, 접근 로그 비동기, 클라이언트 권한 불신·서버 재검증. 특정 프레임워크/라우터에 무관하다. 라우트를 추가하거나 인증/권한 가드·토큰 처리를 구현·정비할 때 읽는다. 키워드: routing, route guard, auth, authorization, RBAC, public routes, token storage, server-side authorization.
rules:
  - "인증·권한은 라우트 가드에서 일괄 처리: 화면 진입 전 한 곳(전역 네비게이션 가드)에서 인증 여부 → 인증 필요 라우트 → 역할/권한 순으로 검사한다. 화면마다 즉석 검사를 흩뿌리지 않는다."
  - "공개 경로는 단일 출처로 관리: 인증이 필요 없는 경로(로그인·약관·오류 등)는 한 곳에서 정의하고 가드가 그것만 참조한다. 같은 정보를 가드와 화면 메타에 이중으로 두지 않는다."
  - "접근 토큰은 영속 저장소에 두지 않는다: 접근 토큰(access token)은 localStorage 등 영속 저장소·디스크에 저장하지 않고 메모리에만 둔다. 단, 메모리 보관은 XSS *노출면*을 줄일 뿐 안전을 보장하지 않으므로(런타임 토큰도 탈취 가능), 짧은 만료·httpOnly 쿠키 옵션을 함께 고려한다. 재인증은 서버측 비밀(예: httpOnly 쿠키의 갱신 토큰)으로 재발급받는다."
  - "접근 로그는 비동기로(fire-and-forget): 화면 전환 성공 후 접근 로그를 비동기로 보내고 실패는 무시한다. 로그 전송이 화면 전환을 막거나 느리게 하지 않는다."
  - "클라이언트 권한 판단은 신뢰하지 않는다: 가드·화면의 권한 분기는 UX(메뉴·버튼 노출)용일 뿐이다. 실제 강제는 서버가 모든 요청에서 다시 검증한다. 클라이언트는 우회 가능하다고 가정한다."
  - "권한 분기는 라우트와 컴포넌트 양쪽에: 라우트 가드만 막으면 화면 내부 위험 동작이 그대로 노출되고, 컴포넌트만 막으면 URL 직접 입력으로 우회된다. 둘 다 둔다(그리고 최종 강제는 서버)."
tags:
  - "routing"
  - "route guard"
  - "auth"
  - "authorization"
  - "RBAC"
  - "public routes"
  - "token storage"
  - "server-side authorization"
  - "vue-router"
  - "router.push"
  - "router-link"
  - "beforeEach"
  - "useRouter"
  - "createRouter"
  - "meta.requiresAuth"
---

# 🔐 라우팅 인증/권한 표준 (Routing Auth & Authorization)

> 클라이언트 라우팅에서 인증과 권한을 한 곳(라우트 가드)에서 일괄 처리하고, 공개 경로를 단일 출처로 관리하며, 토큰을 영속 저장소에 두지 않고, 접근 로그는 비동기로 흘리며, 클라이언트 권한 판단을 보안의 근거로 삼지 않는다. 라우트를 추가하거나 인증/권한 가드·토큰 처리·접근 로그를 구현·정비할 때 읽는다. 특정 프레임워크/라우터에 종속되지 않는 범용 표준이다.
>
> 관련 스킬:
> - 토큰 저장/CSRF: security-frontend
> - 401 자동 갱신·인증 요청 규약: api-standard
> - 인증 상태 저장: state-management
> - 서버측 권한 강제: security-backend

## 1. 핵심 원칙
- **인증·권한은 라우트 가드에서 일괄 처리**: 화면 진입 전 한 곳(전역 네비게이션 가드)에서 인증 여부 → 인증 필요 라우트 → 역할/권한 순으로 검사한다. 화면마다 즉석 검사를 흩뿌리지 않는다.
- **공개 경로는 단일 출처로 관리**: 인증이 필요 없는 경로(로그인·약관·오류 등)는 한 곳에서 정의하고 가드가 그것만 참조한다. 같은 정보를 가드와 화면 메타에 이중으로 두지 않는다.
- **접근 토큰은 영속 저장소에 두지 않는다**: 접근 토큰(access token)은 `localStorage` 등 영속 저장소·디스크에 저장하지 않고 메모리에만 둔다. 단, 메모리 보관은 XSS *노출면*을 줄일 뿐 안전을 보장하지 않으므로(런타임 토큰도 탈취 가능), 짧은 만료·httpOnly 쿠키 옵션을 함께 고려한다. 재인증은 서버측 비밀(예: httpOnly 쿠키의 갱신 토큰)으로 재발급받는다.
- **접근 로그는 비동기로(fire-and-forget)**: 화면 전환 성공 후 접근 로그를 비동기로 보내고 실패는 무시한다. 로그 전송이 화면 전환을 막거나 느리게 하지 않는다.
- **클라이언트 권한 판단은 신뢰하지 않는다**: 가드·화면의 권한 분기는 UX(메뉴·버튼 노출)용일 뿐이다. 실제 강제는 서버가 모든 요청에서 다시 검증한다. 클라이언트는 우회 가능하다고 가정한다.
- **권한 분기는 라우트와 컴포넌트 양쪽에**: 라우트 가드만 막으면 화면 내부 위험 동작이 그대로 노출되고, 컴포넌트만 막으면 URL 직접 입력으로 우회된다. 둘 다 둔다(그리고 최종 강제는 서버).

## 2. 규칙

### 2-1. 인증·권한은 라우트 가드에서 일괄 검사
- 화면 진입 전 전역 가드에서 검사 순서를 고정한다: ① (토큰 없으면) 재인증 1회 시도 → ② 인증 필요 라우트인데 미인증이면 로그인으로 → ③ 요구 역할/권한 불충족이면 오류/거부 화면으로.
- 미인증으로 막을 때는 원래 가려던 경로를 redirect 파라미터로 넘겨, 로그인 후 복귀시킨다.

```text
// ❌ 금지 — 화면마다 즉석 인증/권한 검사가 흩어짐
screen Dashboard:
  if not loggedIn: goto Login        // 화면마다 복붙
screen Admin:
  if not loggedIn: goto Login
  if not isAdmin:  goto Error        // 누락/불일치 잦음

// ✅ 권장 — 전역 가드 한 곳에서 순서 고정
onBeforeNavigate(to):
  if to is not public and not authenticated:
    if not tryReauthenticateOnce(): return redirectTo(Login, { redirect: to })
  if to.requiresAuth and not authenticated:
    return redirectTo(Login, { redirect: to })
  if to.requiredRoles and not user.hasAnyRole(to.requiredRoles):
    return redirectTo(Forbidden)
  return allow
```

### 2-2. 공개 경로는 단일 출처로 관리
- 인증 면제 경로 목록을 한 곳(상수/설정)에 정의하고 가드가 그것만 참조한다.
- 같은 "공개/비공개" 정보를 가드 목록과 화면 메타 양쪽에 두지 않는다 — 둘이 어긋나면 동기화가 깨져 보안 구멍이 생긴다.

```text
// ✅ 권장 — 한 곳에서만 정의
PUBLIC_ROUTES = [ "/login", "/error", "/terms", "/privacy" ]
isPublic(path) = PUBLIC_ROUTES.contains(path)

// ❌ 금지 — 가드 목록과 화면 메타에 이중 정의 → 동기화 깨짐
PUBLIC_ROUTES = [ "/login", "/terms" ]
screen Privacy: meta.public = true        // 목록엔 없음 → 불일치
```

### 2-3. 접근 토큰은 영속 저장소에 두지 않는다 (XSS 노출면 축소)
- 접근 토큰은 메모리(런타임 상태)에만 둔다. 영속 상태로 보관해야 하는 건 토큰이 아닌 비민감 식별/표시 정보(사용자 식별자·역할 표시 등)뿐이다.
- **메모리 보관은 "XSS 안전"이 아니다.** `localStorage` 등 영속 저장 회피는 XSS의 *노출면*(새로고침 후에도 남는 토큰·다른 탭 접근)을 줄일 뿐, 런타임 메모리의 토큰도 주입된 스크립트로 탈취될 수 있다. 따라서 **짧은 만료(short-lived access token)**와 **httpOnly 쿠키로 토큰을 아예 JS에서 못 읽게 하는 옵션**을 함께 고려한다. → security-frontend, api-standard
- 새로고침 등으로 메모리가 비면, 서버측 비밀(예: httpOnly 쿠키의 갱신 토큰)로 재발급받아 복구한다. 토큰 자체를 디스크에 영속화하지 않는다.

```text
// ❌ 금지 — 접근 토큰을 영속 저장소에 저장 (XSS 노출면 확대 + 다른 탭 접근)
persist(state.accessToken)
localStorage.set("accessToken", token)

// ✅ 권장 — 토큰은 메모리에만(노출면 축소), 영속은 비민감 정보만
state.accessToken = token                 // 메모리 — XSS로 여전히 탈취 가능, 짧은 만료로 보완
persist([ state.userId, state.roles ])    // 토큰 제외
reauthenticate(): token = serverRefresh() // httpOnly 쿠키 기반 재발급
```

### 2-4. 접근 로그는 비동기로(fire-and-forget)
- 화면 전환이 "성공"한 경우에만 로그를 남기고, 전송은 비동기로 보내며 실패는 무시한다.
- 로그 전송 결과를 기다려 화면 전환을 막지 않는다.

```text
// ❌ 금지 — 동기 로그가 화면 전환을 지연
onNavigated(to):
  await sendAccessLog(to)     // 매 전환마다 대기 → 느려짐

// ✅ 권장 — 성공한 전환만, 비동기 fire-and-forget
onNavigated(to, from, failure):
  if failure: return
  sendAccessLog({ path: to, from }).ignoreErrors()
```

### 2-5. 클라이언트 권한 판단은 신뢰하지 않는다 — 서버 재검증
- 가드·컴포넌트의 권한 분기는 메뉴/버튼 노출 등 UX 목적일 뿐이다.
- 모든 보호 자원은 서버가 요청마다 권한을 다시 검증한다. 클라이언트 권한 검사는 우회 가능하다고 가정한다. → security-backend

```text
// ✅ 권장 — 클라는 UX용 분기, 강제는 서버
client: if user.hasRole("OPERATOR"): showButton(EmergencyStop)
server: on /emergency-stop: assertRole(req.user, "OPERATOR")  // 진짜 강제

// ❌ 금지 — 클라가 숨겼으니 서버는 통과시킴
server: on /emergency-stop: execute()   // 권한 재검증 없음 → URL/스크립트로 우회
```

### 2-6. 권한 분기는 라우트와 컴포넌트 양쪽에
- 라우트 진입은 가드로, 화면 내부의 위험 동작/요소는 컴포넌트 레벨 분기로 함께 막는다.
- 어느 한쪽만 두면 우회된다(컴포넌트만 → URL 직접 입력, 가드만 → 화면 내부 위험 동작 노출). 최종 강제는 항상 서버.

```text
// ✅ 권장 — 라우트 가드 + 컴포넌트 분기 (+ 서버 강제)
route Admin:        guard requires role ADMIN
component DangerBtn: render only if user.hasRole("OPERATOR")

// ❌ 금지 — 컴포넌트에서만 숨김
// 가드 없음 → /admin URL 직접 입력으로 화면 진입 가능
```

### 2-7. 인증 상태 전환 시 정리 (로그아웃·세션 종료)
- 로그아웃 시 화면 이동만 하지 말고 인증 상태(토큰·역할·권한 등)를 반드시 초기화한다.
- 정리를 빠뜨리면 같은 기기의 다음 사용자에게 이전 권한이 남아 누수된다.

```text
// ❌ 금지 — 이동만 하고 상태가 남음 → 권한 누수
logout(): goto Login

// ✅ 권장 — 상태 초기화 후 이동
logout(): serverLogout().ignoreErrors(); resetAuthState(); goto Login
```

## 3. 흔한 실수
- **인증/권한 검사를 화면마다 흩뿌림** → 누락·불일치가 잦다. 전역 가드 한 곳에서 순서를 고정한다.
- **권한을 컴포넌트에서만 검사** → URL 직접 입력으로 라우트 진입이 우회된다. 라우트 가드도 함께 둔다.
- **권한을 가드/클라이언트에서만 강제** → 클라는 우회 가능하다. 서버가 모든 요청에서 다시 검증한다.
- **접근 토큰을 영속 저장소(localStorage 등)에 저장** → 새로고침 후에도 남고 다른 탭에서 읽혀 XSS 노출면이 커진다. 토큰은 메모리에만 두고(노출면 축소, 안전 보장은 아님) 짧은 만료·httpOnly 쿠키를 병행한다.
- **재인증 시도를 비동기로 안 기다림** → 새로고침 직후 토큰 복구 전에 미인증으로 잘못 튕긴다. 재인증 1회를 기다린 뒤 판단한다.
- **접근 로그를 동기로 전송** → 화면 전환이 느려진다. 성공한 전환만 비동기 fire-and-forget으로.
- **공개 경로를 두 곳에 정의** → 가드 목록과 화면 메타가 어긋나 동기화가 깨진다. 단일 출처로 관리한다.
- **로그아웃 시 상태 초기화 누락** → 다음 사용자에게 권한이 누수된다. 토큰·역할·권한을 초기화한다.

## 4. 체크리스트
- [ ] 인증·`requiresAuth`·역할/권한을 전역 라우트 가드에서 **정해진 순서**로 일괄 검사하는가
- [ ] 미인증으로 막을 때 원래 경로를 redirect로 넘겨 로그인 후 복귀시키는가
- [ ] 공개(인증 면제) 경로를 **단일 출처** 한 곳에서만 관리하는가
- [ ] 접근 토큰을 **영속 저장소/디스크에 저장하지 않고** 메모리에만 두는가 (영속은 비민감 정보만)
- [ ] 새로고침 등 메모리 소실 시 서버측 비밀로 재인증해 복구하는가
- [ ] 접근 로그를 성공한 전환에 한해 **비동기 fire-and-forget**으로 보내는가
- [ ] 권한 분기를 라우트 가드와 컴포넌트 **양쪽**에 두었는가
- [ ] 클라이언트 권한 판단을 신뢰하지 않고 **서버가 모든 요청에서 재검증**하는 전제를 유지하는가
- [ ] 로그아웃/세션 종료 시 인증 상태(토큰·역할·권한)를 **초기화**하는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React Router, Next.js middleware, Angular Guard 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vue 3 (Vue Router + Pinia)

`unplugin-vue-router` 자동 라우팅과 Pinia 기반 인증·권한 가드로 위 원칙을 구현한 예시다.

#### 자동 라우팅 (`unplugin-vue-router`)

`src/pages/` 하위 파일 구조 = URL 경로. 별도 `routes` 배열 작성 불필요.

```
src/pages/
├── index.vue                     →  /
├── login.vue                     →  /login
├── dashboard.vue                 →  /dashboard
├── sensors/
│   ├── index.vue                 →  /sensors
│   └── [id].vue                  →  /sensors/:id
└── admin/
    └── users.vue                 →  /admin/users          (meta로 권한 제한)
```

**페이지별 메타 (route block)**:
```vue
<!-- src/pages/admin/users.vue -->
<route lang="yaml">
meta:
  requiresAuth: true
  layout: admin
  roles: [ADMIN, OPERATOR]
</route>

<script setup lang="ts">
// 화면 로직
</script>
```

레이아웃은 `vite-plugin-vue-layouts` 의 `virtual:generated-layouts`에서 `meta.layout` 으로 매칭.

#### Pinia Auth Store (`src/stores/auth.ts`)

```ts
import { defineStore } from 'pinia'
import { refreshTokenApi, logoutApi } from '@/api/authApi'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    userId: null as string | null,
    roles: [] as string[],          // ex) ['ADMIN', 'OPERATOR']
    permissions: [] as string[],    // ex) ['sensor.read', 'control.write']
  }),

  getters: {
    isAuthenticated: (s) => !!s.accessToken,
    hasRole: (s) => (role: string) => s.roles.includes(role),
    hasAnyRole: (s) => (roles: string[]) => roles.some((r) => s.roles.includes(r)),
  },

  actions: {
    async refresh(): Promise<string | null> {
      try {
        const { accessToken } = await refreshTokenApi()    // refreshToken은 httpOnly cookie로 자동 전송
        this.accessToken = accessToken
        return accessToken
      } catch {
        this.$reset()
        return null
      }
    },
    async logout() {
      await logoutApi().catch(() => {})
      this.$reset()
    },
  },

  persist: {                                                // pinia-plugin-persistedstate
    paths: ['userId', 'roles', 'permissions'],              // accessToken은 절대 persist 금지
  },
})
```

> ⚠️ `accessToken` 을 localStorage 에 persist 하지 말 것(§2-3). persist 회피는 노출면을 줄일 뿐이니 짧은 만료·httpOnly 쿠키도 함께. → security-frontend §2

#### 네비게이션 가드 (`src/router/guards.ts`)

```ts
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { storeAccessLogApi } from '@/api/logApi'

const PUBLIC_ROUTES = ['/login', '/error', '/terms', '/privacy']

export function setupGuards(router: Router) {
  /* ── beforeEach: 인증 + 권한 ─────────────────────────────── */
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const isPublic = PUBLIC_ROUTES.includes(to.path)

    // 1) 토큰 없으면 refresh 1회 시도 (새로고침 직후 케이스)
    if (!auth.isAuthenticated && !isPublic) {
      const token = await auth.refresh()
      if (!token) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }

    // 2) requiresAuth 가드
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 3) 역할 기반 권한
    const requiredRoles = (to.meta.roles ?? []) as string[]
    if (requiredRoles.length > 0 && !auth.hasAnyRole(requiredRoles)) {
      return { path: '/error', query: { code: 'FORBIDDEN' } }
    }

    return true
  })

  /* ── afterEach: 성공한 네비게이션만 접근 로그 ────────────── */
  router.afterEach((to, from, failure) => {
    if (failure) return
    storeAccessLogApi({
      path: to.fullPath,
      from: from.fullPath,
      ts: new Date().toISOString(),
    }).catch(() => { /* 로그 실패는 무시 — UX 영향 없음 */ })
  })

  /* ── onError: 청크 로딩 실패 시 강제 새로고침 ─────────────── */
  router.onError((err) => {
    if (/Loading chunk .* failed/i.test(err?.message ?? '')) {
      window.location.reload()
    }
  })
}
```

**main.ts 등록**:
```ts
import { setupGuards } from '@/router/guards'
const router = createRouter({ history: createWebHistory(), routes })
setupGuards(router)
```

#### 인증 예외 (공개 경로)

위 `PUBLIC_ROUTES`(guards.ts)가 §2-2의 단일 출처다. 추가로, 로그인 페이지에서 이미 인증된 사용자는 `/dashboard` 등으로 즉시 리다이렉트:
  ```ts
  router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.path === '/login' && auth.isAuthenticated) return '/dashboard'
  })
  ```

#### 권한 검사 — 컴포넌트 레벨 (`v-if`)

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<template>
  <v-btn v-if="auth.hasRole('OPERATOR')" color="error" @click="triggerEsd">
    긴급 차단 (ESD)
  </v-btn>
</template>
```

> 백엔드는 절대 클라이언트 권한 체크를 신뢰하지 말 것 — 모든 API에서 다시 검증. → security-backend §2
