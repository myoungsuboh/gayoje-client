---
name: Routing Auth & Authorization Standard (Routing Auth & Authorization)
description: A general-purpose standard for handling authentication and authorization in client-side routing — batch checks in route guards, single-source management of public routes, avoiding persistent token storage, async access logging, distrusting client authorization and re-verifying on the server. Framework/router agnostic. Read this when adding routes or implementing/maintaining auth/authorization guards and token handling. Keywords: routing, route guard, auth, authorization, RBAC, public routes, token storage, server-side authorization.
rules:
  - "Handle authentication/authorization in route guards in one batch: in one place before screen entry (a global navigation guard), check in the order of authenticated → auth-required route → role/permission. Do not scatter ad-hoc checks across each screen."
  - "Manage public routes as a single source of truth: define routes that need no authentication (login·terms·errors, etc.) in one place and have the guard reference only that. Do not duplicate the same information in both the guard and screen meta."
  - "Do not keep access tokens in persistent storage: do not store access tokens in persistent storage/disk such as localStorage; keep them in memory only. However, since memory storage only reduces the XSS *exposure surface* and does not guarantee safety (runtime tokens can also be stolen), also consider short expiry and the httpOnly cookie option. Reauthentication is reissued via a server-side secret (e.g., a refresh token in an httpOnly cookie)."
  - "Send access logs asynchronously (fire-and-forget): after a navigation succeeds, send the access log asynchronously and ignore failures. Log transmission must not block or slow down navigation."
  - "Do not trust client-side authorization decisions: the authorization branching in guards/screens is only for UX (showing menus·buttons). Actual enforcement is re-verified by the server on every request. Assume the client is bypassable."
  - "Place authorization branching on both routes and components: if you only block at the route guard, dangerous in-screen actions remain exposed; if you only block at the component, direct URL entry bypasses it. Place both (and final enforcement is on the server)."
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

# 🔐 Routing Auth & Authorization Standard (Routing Auth & Authorization)

> In client-side routing, handle authentication and authorization in one place (the route guard) in a single batch, manage public routes as a single source of truth, do not keep tokens in persistent storage, flow access logs asynchronously, and do not treat client-side authorization decisions as the basis of security. Read this when adding routes or implementing/maintaining auth/authorization guards, token handling, and access logging. It is a general-purpose standard not bound to any specific framework/router.
>
> Related skills:
> - Token storage/CSRF: security-frontend
> - 401 auto-refresh·authenticated request convention: api-standard
> - Storing auth state: state-management
> - Server-side authorization enforcement: security-backend

## 1. Core Principles
- **Handle authentication/authorization in route guards in one batch**: in one place before screen entry (a global navigation guard), check in the order of authenticated → auth-required route → role/permission. Do not scatter ad-hoc checks across each screen.
- **Manage public routes as a single source of truth**: define routes that need no authentication (login·terms·errors, etc.) in one place and have the guard reference only that. Do not duplicate the same information in both the guard and screen meta.
- **Do not keep access tokens in persistent storage**: do not store access tokens in persistent storage/disk such as `localStorage`; keep them in memory only. However, since memory storage only reduces the XSS *exposure surface* and does not guarantee safety (runtime tokens can also be stolen), also consider short expiry and the httpOnly cookie option. Reauthentication is reissued via a server-side secret (e.g., a refresh token in an httpOnly cookie).
- **Send access logs asynchronously (fire-and-forget)**: after a navigation succeeds, send the access log asynchronously and ignore failures. Log transmission must not block or slow down navigation.
- **Do not trust client-side authorization decisions**: the authorization branching in guards/screens is only for UX (showing menus·buttons). Actual enforcement is re-verified by the server on every request. Assume the client is bypassable.
- **Place authorization branching on both routes and components**: if you only block at the route guard, dangerous in-screen actions remain exposed; if you only block at the component, direct URL entry bypasses it. Place both (and final enforcement is on the server).

## 2. Rules

### 2-1. Authentication/authorization are batch-checked in the route guard
- Fix the check order in the global guard before screen entry: ① (if no token) attempt reauthentication once → ② if it is an auth-required route but unauthenticated, go to login → ③ if the required role/permission is unmet, go to the error/denied screen.
- When blocking due to being unauthenticated, pass the originally intended path as a redirect parameter so the user returns after login.

```text
// ❌ Forbidden — ad-hoc auth/authorization checks scattered across each screen
screen Dashboard:
  if not loggedIn: goto Login        // copy-pasted on each screen
screen Admin:
  if not loggedIn: goto Login
  if not isAdmin:  goto Error        // frequent omissions/mismatches

// ✅ Recommended — order fixed in one place, the global guard
onBeforeNavigate(to):
  if to is not public and not authenticated:
    if not tryReauthenticateOnce(): return redirectTo(Login, { redirect: to })
  if to.requiresAuth and not authenticated:
    return redirectTo(Login, { redirect: to })
  if to.requiredRoles and not user.hasAnyRole(to.requiredRoles):
    return redirectTo(Forbidden)
  return allow
```

### 2-2. Manage public routes as a single source of truth
- Define the list of auth-exempt routes in one place (constant/config) and have the guard reference only that.
- Do not keep the same "public/private" information in both the guard list and screen meta — if the two diverge, synchronization breaks and a security hole appears.

```text
// ✅ Recommended — defined in one place only
PUBLIC_ROUTES = [ "/login", "/error", "/terms", "/privacy" ]
isPublic(path) = PUBLIC_ROUTES.contains(path)

// ❌ Forbidden — double definition in the guard list and screen meta → broken sync
PUBLIC_ROUTES = [ "/login", "/terms" ]
screen Privacy: meta.public = true        // not in the list → mismatch
```

### 2-3. Do not keep access tokens in persistent storage (reduce the XSS exposure surface)
- Keep access tokens in memory (runtime state) only. What must be kept in persistent state is not the token but non-sensitive identification/display information (user identifier·role display, etc.).
- **Memory storage is not "XSS-safe."** Avoiding persistent storage such as `localStorage` only reduces the *exposure surface* of XSS (tokens surviving across refresh·access from other tabs); a token in runtime memory can also be stolen by an injected script. Therefore, also consider **short-lived access tokens** and the **option of making the token unreadable from JS at all via an httpOnly cookie**. → security-frontend, api-standard
- When memory is emptied by a refresh, etc., recover by reissuing via a server-side secret (e.g., a refresh token in an httpOnly cookie). Do not persist the token itself to disk.

```text
// ❌ Forbidden — storing the access token in persistent storage (wider XSS exposure surface + access from other tabs)
persist(state.accessToken)
localStorage.set("accessToken", token)

// ✅ Recommended — token in memory only (reduced exposure surface), persist only non-sensitive info
state.accessToken = token                 // memory — still stealable via XSS, mitigated by short expiry
persist([ state.userId, state.roles ])    // token excluded
reauthenticate(): token = serverRefresh() // reissue based on httpOnly cookie
```

### 2-4. Send access logs asynchronously (fire-and-forget)
- Log only when the navigation "succeeded", send asynchronously, and ignore failures.
- Do not wait for the log transmission result and thereby block navigation.

```text
// ❌ Forbidden — a synchronous log delays navigation
onNavigated(to):
  await sendAccessLog(to)     // wait on every navigation → slowdown

// ✅ Recommended — successful navigations only, async fire-and-forget
onNavigated(to, from, failure):
  if failure: return
  sendAccessLog({ path: to, from }).ignoreErrors()
```

### 2-5. Do not trust client-side authorization decisions — server re-verification
- The authorization branching in guards/components is only for UX purposes such as showing menus/buttons.
- The server re-verifies authorization on every request for all protected resources. Assume client-side authorization checks are bypassable. → security-backend

```text
// ✅ Recommended — client does UX branching, server enforces
client: if user.hasRole("OPERATOR"): showButton(EmergencyStop)
server: on /emergency-stop: assertRole(req.user, "OPERATOR")  // real enforcement

// ❌ Forbidden — server lets it through because the client hid it
server: on /emergency-stop: execute()   // no authorization re-verification → bypassed via URL/script
```

### 2-6. Place authorization branching on both routes and components
- Block route entry with the guard, and block dangerous in-screen actions/elements together with component-level branching.
- If you place only one side, it is bypassed (component only → direct URL entry, guard only → in-screen dangerous actions exposed). Final enforcement is always the server.

```text
// ✅ Recommended — route guard + component branching (+ server enforcement)
route Admin:        guard requires role ADMIN
component DangerBtn: render only if user.hasRole("OPERATOR")

// ❌ Forbidden — hidden only at the component
// no guard → /admin URL can be entered directly into the screen
```

### 2-7. Cleanup on auth state transition (logout·session end)
- On logout, do not just navigate away; you must reset the auth state (token·roles·permissions, etc.).
- Omitting cleanup leaks the previous permissions to the next user of the same device.

```text
// ❌ Forbidden — only navigates and state remains → permission leak
logout(): goto Login

// ✅ Recommended — navigate after resetting state
logout(): serverLogout().ignoreErrors(); resetAuthState(); goto Login
```

## 3. Common Mistakes
- **Scattering auth/authorization checks across each screen** → frequent omissions·mismatches. Fix the order in one place, the global guard.
- **Checking authorization only at the component** → route entry is bypassed via direct URL entry. Place a route guard as well.
- **Enforcing authorization only at the guard/client** → the client is bypassable. The server re-verifies on every request.
- **Storing access tokens in persistent storage (localStorage, etc.)** → they survive across refresh and are readable from other tabs, widening the XSS exposure surface. Keep tokens in memory only (reduced exposure surface, not a safety guarantee) and combine short expiry·httpOnly cookies.
- **Not awaiting the reauthentication attempt asynchronously** → right after a refresh, the user is wrongly bounced as unauthenticated before token recovery. Wait for one reauthentication, then decide.
- **Sending access logs synchronously** → navigation slows down. Successful navigations only, async fire-and-forget.
- **Defining public routes in two places** → the guard list and screen meta diverge and sync breaks. Manage as a single source of truth.
- **Omitting state reset on logout** → permissions leak to the next user. Reset token·roles·permissions.

## 4. Checklist
- [ ] Are authentication·`requiresAuth`·role/permission batch-checked **in a fixed order** in the global route guard?
- [ ] When blocking due to being unauthenticated, do you pass the original path as redirect to return after login?
- [ ] Are public (auth-exempt) routes managed in one place as a **single source of truth**?
- [ ] Do you keep access tokens in memory only, **not storing them in persistent storage/disk** (persist only non-sensitive info)?
- [ ] When memory is lost (e.g., refresh), do you reauthenticate via a server-side secret to recover?
- [ ] Are access logs sent **async fire-and-forget**, limited to successful navigations?
- [ ] Did you place authorization branching on **both** the route guard and the component?
- [ ] Do you maintain the premise that the **server re-verifies on every request**, not trusting client-side authorization decisions?
- [ ] On logout/session end, do you **reset** the auth state (token·roles·permissions)?

## Appendix: Stack-specific examples

> Below are reference implementation examples. Add examples matching the stack your team uses (e.g., React Router, Next.js middleware, Angular Guard, etc.) following the same pattern. The principles·rules of 1~4 above are the standard, and the appendix is merely an application case.

### Vue 3 (Vue Router + Pinia)

An example implementing the above principles with `unplugin-vue-router` automatic routing and Pinia-based auth/authorization guards.

#### Automatic routing (`unplugin-vue-router`)

File structure under `src/pages/` = URL path. No need to write a separate `routes` array.

```
src/pages/
├── index.vue                     →  /
├── login.vue                     →  /login
├── dashboard.vue                 →  /dashboard
├── sensors/
│   ├── index.vue                 →  /sensors
│   └── [id].vue                  →  /sensors/:id
└── admin/
    └── users.vue                 →  /admin/users          (restricted by permission via meta)
```

**Per-page meta (route block)**:
```vue
<!-- src/pages/admin/users.vue -->
<route lang="yaml">
meta:
  requiresAuth: true
  layout: admin
  roles: [ADMIN, OPERATOR]
</route>

<script setup lang="ts">
// screen logic
</script>
```

Layouts are matched by `meta.layout` from `virtual:generated-layouts` of `vite-plugin-vue-layouts`.

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
        const { accessToken } = await refreshTokenApi()    // refreshToken is sent automatically via httpOnly cookie
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
    paths: ['userId', 'roles', 'permissions'],              // never persist accessToken
  },
})
```

> ⚠️ Do not persist `accessToken` to localStorage (§2-3). Avoiding persist only reduces the exposure surface, so combine short expiry·httpOnly cookies too. → security-frontend §2

#### Navigation guard (`src/router/guards.ts`)

```ts
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { storeAccessLogApi } from '@/api/logApi'

const PUBLIC_ROUTES = ['/login', '/error', '/terms', '/privacy']

export function setupGuards(router: Router) {
  /* ── beforeEach: auth + authorization ─────────────────────────────── */
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const isPublic = PUBLIC_ROUTES.includes(to.path)

    // 1) if no token, attempt refresh once (the case right after a refresh)
    if (!auth.isAuthenticated && !isPublic) {
      const token = await auth.refresh()
      if (!token) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }

    // 2) requiresAuth guard
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 3) role-based authorization
    const requiredRoles = (to.meta.roles ?? []) as string[]
    if (requiredRoles.length > 0 && !auth.hasAnyRole(requiredRoles)) {
      return { path: '/error', query: { code: 'FORBIDDEN' } }
    }

    return true
  })

  /* ── afterEach: access log only for successful navigations ────────────── */
  router.afterEach((to, from, failure) => {
    if (failure) return
    storeAccessLogApi({
      path: to.fullPath,
      from: from.fullPath,
      ts: new Date().toISOString(),
    }).catch(() => { /* log failure ignored — no UX impact */ })
  })

  /* ── onError: force reload on chunk loading failure ─────────────── */
  router.onError((err) => {
    if (/Loading chunk .* failed/i.test(err?.message ?? '')) {
      window.location.reload()
    }
  })
}
```

**Registration in main.ts**:
```ts
import { setupGuards } from '@/router/guards'
const router = createRouter({ history: createWebHistory(), routes })
setupGuards(router)
```

#### Auth exception (public routes)

The above `PUBLIC_ROUTES` (guards.ts) is the single source of truth of §2-2. Additionally, an already-authenticated user on the login page is immediately redirected to `/dashboard`, etc.:
  ```ts
  router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.path === '/login' && auth.isAuthenticated) return '/dashboard'
  })
  ```

#### Authorization check — component level (`v-if`)

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<template>
  <v-btn v-if="auth.hasRole('OPERATOR')" color="error" @click="triggerEsd">
    Emergency Shutdown (ESD)
  </v-btn>
</template>
```

> The backend must never trust the client-side authorization check — re-verify on every API. → security-backend §2
