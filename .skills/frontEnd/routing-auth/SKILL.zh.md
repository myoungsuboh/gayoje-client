---
name: 路由认证/授权标准 (Routing Auth & Authorization)
description: 在客户端路由中处理认证与授权的通用标准 — 在路由守卫中集中检查、公开路径单一来源管理、避免令牌持久化存储、访问日志异步化、不信任客户端授权并由服务端重新校验。不依赖于特定框架/路由器。在新增路由或实现/整理认证/授权守卫、令牌处理时阅读。关键词: routing, route guard, auth, authorization, RBAC, public routes, token storage, server-side authorization.
rules:
  - "认证·授权在路由守卫中集中处理: 在进入画面前于一处(全局导航守卫),按 是否已认证 → 是否为需认证的路由 → 角色/权限 的顺序检查。不要把临时检查散落在每个画面里。"
  - "公开路径以单一来源管理: 将无需认证的路径(登录·条款·错误等)定义在一处,守卫只引用它。不要把同一信息在守卫与画面元信息中重复存放。"
  - "访问令牌不放入持久化存储: 访问令牌(access token)不存放在 localStorage 等持久化存储·磁盘中,只放在内存里。但内存保管只是减小 XSS *暴露面*,并不保证安全(运行时令牌仍可能被窃取),因此应同时考虑较短的过期时间·httpOnly cookie 选项。重新认证通过服务端机密(例如 httpOnly cookie 中的刷新令牌)重新签发。"
  - "访问日志以异步方式发送(fire-and-forget): 画面切换成功后异步发送访问日志,失败则忽略。日志发送不得阻塞或拖慢画面切换。"
  - "不信任客户端的权限判断: 守卫·画面中的权限分支只用于 UX(菜单·按钮显隐)。真正的强制由服务端在每个请求上重新校验。假定客户端可被绕过。"
  - "权限分支同时放在路由与组件两侧: 只在路由守卫拦截,则画面内部的危险操作仍会暴露;只在组件拦截,则可通过直接输入 URL 绕过。两者都要放(且最终强制在服务端)。"
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

# 🔐 路由认证/授权标准 (Routing Auth & Authorization)

> 在客户端路由中,将认证与授权集中在一处(路由守卫)处理,以单一来源管理公开路径,不将令牌放入持久化存储,异步流出访问日志,并且不把客户端的权限判断作为安全的依据。在新增路由或实现/整理认证/授权守卫、令牌处理、访问日志时阅读。这是不依赖于特定框架/路由器的通用标准。
>
> 相关技能:
> - 令牌存储/CSRF: security-frontend
> - 401 自动刷新·认证请求约定: api-standard
> - 认证状态存储: state-management
> - 服务端权限强制: security-backend

## 1. 核心原则
- **认证·授权在路由守卫中集中处理**: 在进入画面前于一处(全局导航守卫),按 是否已认证 → 是否为需认证的路由 → 角色/权限 的顺序检查。不要把临时检查散落在每个画面里。
- **公开路径以单一来源管理**: 将无需认证的路径(登录·条款·错误等)定义在一处,守卫只引用它。不要把同一信息在守卫与画面元信息中重复存放。
- **访问令牌不放入持久化存储**: 访问令牌(access token)不存放在 `localStorage` 等持久化存储·磁盘中,只放在内存里。但内存保管只是减小 XSS *暴露面*,并不保证安全(运行时令牌仍可能被窃取),因此应同时考虑**较短的过期时间(short-lived access token)**·httpOnly cookie 选项。重新认证通过服务端机密(例如 httpOnly cookie 中的刷新令牌)重新签发。
- **访问日志以异步方式发送(fire-and-forget)**: 画面切换成功后异步发送访问日志,失败则忽略。日志发送不得阻塞或拖慢画面切换。
- **不信任客户端的权限判断**: 守卫·画面中的权限分支只用于 UX(菜单·按钮显隐)。真正的强制由服务端在每个请求上重新校验。假定客户端可被绕过。
- **权限分支同时放在路由与组件两侧**: 只在路由守卫拦截,则画面内部的危险操作仍会暴露;只在组件拦截,则可通过直接输入 URL 绕过。两者都要放(且最终强制在服务端)。

## 2. 规则

### 2-1. 认证·授权在路由守卫中集中检查
- 在进入画面前于全局守卫中固定检查顺序: ①(无令牌时)尝试重新认证一次 → ② 是需认证的路由但未认证则转到登录 → ③ 不满足所需角色/权限则转到错误/拒绝画面。
- 因未认证而拦截时,把原本要去的路径作为 redirect 参数传递,使登录后能返回。

```text
// ❌ 禁止 — 临时认证/权限检查散落在每个画面
screen Dashboard:
  if not loggedIn: goto Login        // 每个画面复制粘贴
screen Admin:
  if not loggedIn: goto Login
  if not isAdmin:  goto Error        // 频繁遗漏/不一致

// ✅ 推荐 — 在全局守卫一处固定顺序
onBeforeNavigate(to):
  if to is not public and not authenticated:
    if not tryReauthenticateOnce(): return redirectTo(Login, { redirect: to })
  if to.requiresAuth and not authenticated:
    return redirectTo(Login, { redirect: to })
  if to.requiredRoles and not user.hasAnyRole(to.requiredRoles):
    return redirectTo(Forbidden)
  return allow
```

### 2-2. 公开路径以单一来源管理
- 将免认证路径列表定义在一处(常量/配置),守卫只引用它。
- 不要把同一“公开/非公开”信息同时放在守卫列表与画面元信息两侧 — 两者一旦不一致,同步就会被破坏,产生安全漏洞。

```text
// ✅ 推荐 — 只在一处定义
PUBLIC_ROUTES = [ "/login", "/error", "/terms", "/privacy" ]
isPublic(path) = PUBLIC_ROUTES.contains(path)

// ❌ 禁止 — 在守卫列表与画面元信息中重复定义 → 同步被破坏
PUBLIC_ROUTES = [ "/login", "/terms" ]
screen Privacy: meta.public = true        // 列表中没有 → 不一致
```

### 2-3. 访问令牌不放入持久化存储(缩小 XSS 暴露面)
- 访问令牌只放在内存(运行时状态)中。需要保存为持久状态的不是令牌,而仅是非敏感的标识/显示信息(用户标识符·角色显示等)。
- **内存保管并非“XSS 安全”。** 避免 `localStorage` 等持久化存储只是减小 XSS 的*暴露面*(刷新后仍残留的令牌·其他标签页的访问),运行时内存中的令牌仍可能被注入的脚本窃取。因此应同时考虑**较短的过期时间(short-lived access token)**与**通过 httpOnly cookie 让 JS 完全无法读取令牌的选项**。→ security-frontend, api-standard
- 因刷新等导致内存被清空时,通过服务端机密(例如 httpOnly cookie 中的刷新令牌)重新签发以恢复。不要把令牌本身持久化到磁盘。

```text
// ❌ 禁止 — 将访问令牌存入持久化存储(扩大 XSS 暴露面 + 其他标签页访问)
persist(state.accessToken)
localStorage.set("accessToken", token)

// ✅ 推荐 — 令牌只放在内存(缩小暴露面),持久化只放非敏感信息
state.accessToken = token                 // 内存 — 仍可被 XSS 窃取,以较短过期时间弥补
persist([ state.userId, state.roles ])    // 不含令牌
reauthenticate(): token = serverRefresh() // 基于 httpOnly cookie 重新签发
```

### 2-4. 访问日志以异步方式发送(fire-and-forget)
- 仅在画面切换“成功”时记录日志,异步发送,失败则忽略。
- 不要等待日志发送结果而阻塞画面切换。

```text
// ❌ 禁止 — 同步日志拖延画面切换
onNavigated(to):
  await sendAccessLog(to)     // 每次切换都等待 → 变慢

// ✅ 推荐 — 仅成功的切换,异步 fire-and-forget
onNavigated(to, from, failure):
  if failure: return
  sendAccessLog({ path: to, from }).ignoreErrors()
```

### 2-5. 不信任客户端的权限判断 — 服务端重新校验
- 守卫·组件中的权限分支只是菜单/按钮显隐等 UX 目的。
- 所有受保护资源由服务端在每个请求上重新校验权限。假定客户端权限检查可被绕过。→ security-backend

```text
// ✅ 推荐 — 客户端做 UX 分支,强制在服务端
client: if user.hasRole("OPERATOR"): showButton(EmergencyStop)
server: on /emergency-stop: assertRole(req.user, "OPERATOR")  // 真正的强制

// ❌ 禁止 — 因为客户端已隐藏,服务端就放行
server: on /emergency-stop: execute()   // 无权限重新校验 → 可通过 URL/脚本绕过
```

### 2-6. 权限分支同时放在路由与组件两侧
- 路由进入用守卫拦截,画面内部的危险操作/元素用组件级分支一并拦截。
- 只放任一侧都会被绕过(只在组件 → 直接输入 URL;只在守卫 → 画面内部危险操作暴露)。最终强制始终在服务端。

```text
// ✅ 推荐 — 路由守卫 + 组件分支(+ 服务端强制)
route Admin:        guard requires role ADMIN
component DangerBtn: render only if user.hasRole("OPERATOR")

// ❌ 禁止 — 仅在组件中隐藏
// 无守卫 → 可直接输入 /admin URL 进入画面
```

### 2-7. 认证状态切换时的清理(登出·会话结束)
- 登出时不要只做画面跳转,务必重置认证状态(令牌·角色·权限等)。
- 若遗漏清理,在同一设备上之前的权限会残留并泄露给下一个用户。

```text
// ❌ 禁止 — 只跳转而状态残留 → 权限泄露
logout(): goto Login

// ✅ 推荐 — 重置状态后跳转
logout(): serverLogout().ignoreErrors(); resetAuthState(); goto Login
```

## 3. 常见错误
- **将认证/权限检查散落在每个画面** → 频繁遗漏·不一致。在全局守卫一处固定顺序。
- **只在组件中检查权限** → 可通过直接输入 URL 绕过路由进入。也要放路由守卫。
- **只在守卫/客户端强制权限** → 客户端可被绕过。服务端在每个请求上重新校验。
- **将访问令牌存入持久化存储(localStorage 等)** → 刷新后仍残留并被其他标签页读取,XSS 暴露面扩大。令牌只放在内存(缩小暴露面,并非保证安全),并配合较短过期时间·httpOnly cookie。
- **不异步等待重新认证尝试** → 刷新刚结束、令牌恢复之前就被错误地以未认证弹出。等待一次重新认证后再判断。
- **同步发送访问日志** → 画面切换变慢。仅成功的切换以异步 fire-and-forget。
- **在两处定义公开路径** → 守卫列表与画面元信息不一致,同步被破坏。以单一来源管理。
- **登出时遗漏状态重置** → 权限泄露给下一个用户。重置令牌·角色·权限。

## 4. 检查清单
- [ ] 是否在全局路由守卫中以**固定顺序**集中检查认证·`requiresAuth`·角色/权限?
- [ ] 因未认证而拦截时,是否把原路径作为 redirect 传递,使登录后返回?
- [ ] 公开(免认证)路径是否只在一处以**单一来源**管理?
- [ ] 访问令牌是否**不存入持久化存储/磁盘**而只放在内存(持久化只放非敏感信息)?
- [ ] 刷新等导致内存丢失时,是否通过服务端机密重新认证以恢复?
- [ ] 访问日志是否仅对成功的切换以**异步 fire-and-forget**发送?
- [ ] 权限分支是否放在路由守卫与组件**两侧**?
- [ ] 是否保持不信任客户端权限判断、**由服务端在每个请求上重新校验**的前提?
- [ ] 登出/会话结束时是否**重置**认证状态(令牌·角色·权限)?

## 附录: 各技术栈示例

> 以下是供参考的实现示例。请按照相同的模式,补充符合团队所用技术栈(例如 React Router、Next.js middleware、Angular Guard 等)的示例。上面 1~4 的原则·规则是标准,附录只是其应用案例。

### Vue 3 (Vue Router + Pinia)

这是用 `unplugin-vue-router` 自动路由与基于 Pinia 的认证·授权守卫实现上述原则的示例。

#### 自动路由 (`unplugin-vue-router`)

`src/pages/` 下的文件结构 = URL 路径。无需另写 `routes` 数组。

```
src/pages/
├── index.vue                     →  /
├── login.vue                     →  /login
├── dashboard.vue                 →  /dashboard
├── sensors/
│   ├── index.vue                 →  /sensors
│   └── [id].vue                  →  /sensors/:id
└── admin/
    └── users.vue                 →  /admin/users          (用 meta 限制权限)
```

**各页面元信息 (route block)**:
```vue
<!-- src/pages/admin/users.vue -->
<route lang="yaml">
meta:
  requiresAuth: true
  layout: admin
  roles: [ADMIN, OPERATOR]
</route>

<script setup lang="ts">
// 画面逻辑
</script>
```

布局通过 `vite-plugin-vue-layouts` 的 `virtual:generated-layouts` 中的 `meta.layout` 匹配。

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
        const { accessToken } = await refreshTokenApi()    // refreshToken 通过 httpOnly cookie 自动发送
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
    paths: ['userId', 'roles', 'permissions'],              // 绝不持久化 accessToken
  },
})
```

> ⚠️ 不要把 `accessToken` 持久化到 localStorage(§2-3)。避免持久化只是减小暴露面,因此也要配合较短过期时间·httpOnly cookie。→ security-frontend §2

#### 导航守卫 (`src/router/guards.ts`)

```ts
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { storeAccessLogApi } from '@/api/logApi'

const PUBLIC_ROUTES = ['/login', '/error', '/terms', '/privacy']

export function setupGuards(router: Router) {
  /* ── beforeEach: 认证 + 授权 ─────────────────────────────── */
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const isPublic = PUBLIC_ROUTES.includes(to.path)

    // 1) 无令牌时尝试 refresh 一次(刷新刚结束的情况)
    if (!auth.isAuthenticated && !isPublic) {
      const token = await auth.refresh()
      if (!token) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }

    // 2) requiresAuth 守卫
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 3) 基于角色的权限
    const requiredRoles = (to.meta.roles ?? []) as string[]
    if (requiredRoles.length > 0 && !auth.hasAnyRole(requiredRoles)) {
      return { path: '/error', query: { code: 'FORBIDDEN' } }
    }

    return true
  })

  /* ── afterEach: 仅对成功的导航记录访问日志 ────────────── */
  router.afterEach((to, from, failure) => {
    if (failure) return
    storeAccessLogApi({
      path: to.fullPath,
      from: from.fullPath,
      ts: new Date().toISOString(),
    }).catch(() => { /* 忽略日志失败 — 不影响 UX */ })
  })

  /* ── onError: chunk 加载失败时强制刷新 ─────────────── */
  router.onError((err) => {
    if (/Loading chunk .* failed/i.test(err?.message ?? '')) {
      window.location.reload()
    }
  })
}
```

**main.ts 注册**:
```ts
import { setupGuards } from '@/router/guards'
const router = createRouter({ history: createWebHistory(), routes })
setupGuards(router)
```

#### 认证例外(公开路径)

上面的 `PUBLIC_ROUTES`(guards.ts)就是 §2-2 的单一来源。此外,在登录页面上已认证的用户立即重定向到 `/dashboard` 等:
  ```ts
  router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.path === '/login' && auth.isAuthenticated) return '/dashboard'
  })
  ```

#### 权限检查 — 组件级 (`v-if`)

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<template>
  <v-btn v-if="auth.hasRole('OPERATOR')" color="error" @click="triggerEsd">
    紧急切断 (ESD)
  </v-btn>
</template>
```

> 后端绝不可信任客户端权限检查 — 在所有 API 上重新校验。→ security-backend §2
