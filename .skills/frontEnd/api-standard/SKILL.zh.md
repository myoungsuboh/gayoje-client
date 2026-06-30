---
name: API 通信标准 (HTTP Client)
description: 前端 HTTP 通信的通用标准 — 单一 HTTP 客户端、通过请求拦截器自动附加令牌、401 时刷新一次令牌后重试、解包响应负载、全局与内联的错误分担、多次调用的处理。与特定库/框架无关。在构建 API 调用层或设计错误处理·认证流程时、统一响应格式·错误展示位置时阅读。关键词: http client, interceptor, token, 401 refresh, unwrap, global error, retry, allSettled。
rules:
  - "只使用单一 HTTP 客户端: 应用了公共配置(基础 URL·超时·拦截器·凭据)的客户端实例只创建一次并在全局共享。每个画面·模块都创建新实例会遗漏拦截器(令牌·错误·解包)。"
  - "认证令牌由客户端自动附加: 各调用处不直接塞入认证头。仅在请求拦截器(或公共入口)一处附加令牌。"
  - "失效(401)不立即登出: 收到认证失效时尝试刷新令牌一次,刷新成功则重试原始请求。只有刷新失败时才登出。即使多个请求同时收到失效,刷新也只执行一次。"
  - "响应负载在一处只解包一次: 在响应拦截器中剥离服务端公共包装(例如 { data, ... }),只把实际数据传给调用处。调用处不再去挖 .data。"
  - "明确划分错误展示位置: 「用户无法处理的错误」(网络中断·服务端 5xx)以全局方式(例如 toast)通知,「依赖用户输入/上下文的错误」(4xx: 校验·权限)由发起调用的画面以内联方式处理。"
  - "禁止无意义的 try-catch 包装: 不保留只是捕获后原样重新抛出的代码。公共处理(拦截器)足够时,调用处只处理结果/错误。"
  - "多个异步调用要聚合部分失败: 并行发送多个请求时,不要因为一个失败就全部丢弃,而是把成功/失败一起收集并处理。"
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

# 🔌 API 通信标准 (HTTP Client)

> 将前端所有的外部通信汇聚到单一 HTTP 客户端,并在拦截器中统一处理令牌附加·响应解包·认证刷新·全局错误。在编写 API 调用层或设计错误流程·认证流程时阅读。这是不依赖特定库/框架的通用标准。

## 1. 核心原则

- **只使用单一 HTTP 客户端**: 应用了公共配置(基础 URL·超时·拦截器·凭据)的客户端实例只创建一次并在全局共享。每个画面·模块都创建新实例会遗漏拦截器(令牌·错误·解包)。
- **认证令牌由客户端自动附加**: 各调用处不直接塞入认证头。仅在请求拦截器(或公共入口)一处附加令牌。
- **失效(401)不立即登出**: 收到认证失效时尝试刷新令牌一次,刷新成功则重试原始请求。只有刷新失败时才登出。即使多个请求同时收到失效,刷新也只执行一次。
- **响应负载在一处只解包一次**: 在响应拦截器中剥离服务端公共包装(例如 `{ data, ... }`),只把实际数据传给调用处。调用处不再去挖 `.data`。
- **明确划分错误展示位置**: “用户无法处理的错误”(网络中断·服务端 5xx)以全局方式(例如 toast)通知,“依赖用户输入/上下文的错误”(4xx: 校验·权限)由发起调用的画面以内联方式处理。
- **禁止无意义的 try-catch 包装**: 不保留只是捕获后原样重新抛出的代码。公共处理(拦截器)足够时,调用处只处理结果/错误。
- **多个异步调用要聚合部分失败**: 并行发送多个请求时,不要因为一个失败就全部丢弃,而是把成功/失败一起收集并处理。

## 2. 规则

### 2-1. 统一为单一 HTTP 客户端

- 创建一个应用了基础 URL·超时·凭据(发送 cookie)·拦截器的客户端并共享。
- 不要每个画面·模块都创建新实例 — 一旦缺了公共拦截器,令牌·错误·解包就全部失效。
- 基础 URL 从各环境配置注入(禁止硬编码)。→ `env-config`

```text
// ❌ 禁止 — 每个画面新建客户端 (拦截器缺失)
screenA: client = createClient(baseUrl)   // 没有令牌/错误/解包拦截器
screenB: client = createClient(baseUrl)

// ✅ 推荐 — 共享附带公共配置 + 拦截器的单一实例
apiClient = createClient({ baseUrl: env.API_BASE, timeout, withCredentials })
apiClient.onRequest(attachToken)
apiClient.onResponse(unwrap, handleError)
// 所有 API 模块 import 并使用 apiClient
```

### 2-2. 令牌由拦截器自动附加

- 调用处不直接构造认证头。请求拦截器读取当前令牌,仅在一处附加。
- 令牌存储位置(内存·cookie 等)的选择与安全权衡 → `security-frontend`。

```text
// ❌ 禁止 — 组件直接塞入头 (遗漏·重复·不一致)
getUsers({ headers: { Authorization: 'Bearer ' + token } })

// ✅ 推荐 — 请求拦截器统一附加
onRequest(config):
  if auth.accessToken: config.headers.Authorization = 'Bearer ' + auth.accessToken
  return config
```

### 2-3. 401 → 刷新令牌一次后重试 (并发请求只刷新一次)

- 收到认证失效时不要立即登出,先尝试刷新令牌一次。成功则用新令牌重试原始请求,失败则那时再登出。
- 设置「已重试过一次」标记,避免同一请求被无限重试。
- 即使多个请求同时收到 401,也只共享一个刷新操作并执行一次(复用进行中的刷新 Promise)。

```text
// ❌ 禁止 — 401 立即登出 (丢失用户操作)
onError(err):
  if err.status == 401: auth.logout()

// ✅ 推荐 — 尝试刷新一次,并发 401 共享单次刷新
onError(err):
  if err.status == 401 and not err.config.retried:
    err.config.retried = true
    refreshing = refreshing ?? auth.refresh()        // 进行中则复用同一 Promise
    // 刷新结束(成功/失败)后才重置 — 用 finally 包裹以维持复用窗口。
    // (立即清为 null 会让并发 401 各自发起新的刷新,破坏单次刷新)
    newToken = await refreshing.finally(() => refreshing = null)
    if newToken: return client.request(err.config)   // 重试原始请求
    auth.logout()
```

### 2-4. 响应负载在拦截器中只解包一次

- 在响应拦截器中剥离服务端公共包装,只返回实际数据。调用处·类型定义按「已解包的负载」编写。
- 不要在调用处再次访问 `.data`(二次解包是 bug 之源)。

```text
// ❌ 禁止 — 拦截器没解包导致每个调用处重复 .data
res = await getUser(); user = res.data.data   // 该挖到哪一层各不相同

// ✅ 推荐 — 拦截器解包,调用处直接使用
onResponse(res): return res.data   // 只解包一次
user = await getUser()             // 已经是负载
```

### 2-5. API 函数按域拆分并遵循命名规约

- 把端点调用函数按域单位拆成文件,让组件不直接操作客户端。
- 函数名用一致的规约(例如 `<动词><名词>` + 公共后缀)统一。
- 不要加入无意义的 `try { ... } catch (e) { throw e }` 包装 — 公共错误处理由拦截器完成。

```text
// ✅ 推荐 — 按域的模块,组件只调用函数
// api/sensor
getSensors(deckId)  -> client.get('/sensors', { params: { deckId } })
getSensor(id)       -> client.get('/sensors/' + id)
createSensor(body)  -> client.post('/sensors', body)
```

### 2-6. 错误展示位置分担 (全局对内联)

- 按状态划分处理责任。全局处理(网络·5xx)在拦截器,依赖上下文的处理(4xx)在发起调用的画面。
- 不要用全局 toast 弹出校验/权限错误(4xx) — 必须是表单内联消息,用户才能修正。
- 发送到监控工具的错误及其时机 → `error-monitoring`。

| 状态 | 处理位置 | 用户展示 |
|------|-----------|-------------|
| 网络中断 | 拦截器(全局) | 全局通知(toast) |
| 401 (失效) | 拦截器(全局) | 尝试刷新 → 失败时跳登录画面 |
| 4xx (校验/权限) | 调用画面(内联) | 表单/字段内联消息 |
| 5xx | 拦截器(全局) | 全局通知 + 监控捕获 |

```text
// ✅ 推荐 — 全局在拦截器,4xx 委托给调用方
onError(err):
  if no response:        notifyGlobal('请检查网络'); reject(NETWORK)
  if err.status >= 500:  notifyGlobal('服务器错误'); 
  reject(err.payload)    // 4xx 由调用画面接收并内联处理
```

### 2-7. 多个异步调用聚合部分失败

- 并行发送多个请求时,不要因一个失败而丢弃整体。收集所有成功/失败后,只汇总失败的部分处理。

```text
// ❌ 禁止 — 一个失败,其余成功也被整体丢弃
[a, b, c] = await all([reqA, reqB, reqC])

// ✅ 推荐 — 一起收集成功/失败,只聚合失败
results = await allSettled([reqA, reqB, reqC])
ok      = results.filter(fulfilled).map(value)
failed  = results.filter(rejected)
if failed: 只对失败单独处理/展示
```

## 3. 常见错误

- **每个画面新建客户端** → 缺失拦截器(令牌·错误·解包)。共享单一实例。
- **令牌由组件直接塞入头** → 遗漏·重复·不一致。用请求拦截器统一。
- **401 时立即登出** → 用户输入丢失。优先尝试刷新一次。
- **并发 401 各自刷新** → 令牌刷新重复执行多次。共享进行中的刷新。
- **在调用处重复解包** → 该挖到哪一层 `.data` 各不相同。在拦截器中只解包一次。
- **用全局 toast 处理 4xx** → 表单校验/权限消息以 toast 弹出,破坏 UX。改为内联。
- **无意义的 try-catch rethrow** → 移除只是捕获后原样抛出的包装。拦截器足矣。
- **多次调用中忽略部分失败** → 吞掉部分失败或丢弃整体。聚合成功/失败。

## 4. 检查清单

- [ ] 所有 API 调用是否共享**单一 HTTP 客户端**实例
- [ ] 基础 URL 是否从环境配置注入(非硬编码)
- [ ] 认证令牌是否在**请求拦截器中统一附加**,且调用处不直接塞入
- [ ] 401 时是否**刷新令牌一次 → 重试**,仅失败时登出
- [ ] 并发 401 时是否**只执行一次**刷新(共享进行中的刷新)
- [ ] 响应负载是否**在拦截器中只解包一次**,调用处不再次访问
- [ ] API 函数是否拆为**按域的文件**并遵循一致的命名规约
- [ ] 网络·5xx 是否**全局**处理,4xx 是否**在调用画面内联**处理
- [ ] 是否没有无意义的 try-catch rethrow
- [ ] 多个异步调用中是否**聚合部分失败**(分离成功/失败)

## 附录: 各技术栈示例

> 以下是参考用的实现示例。按团队所用的技术栈(例如 React + fetch/TanStack Query, Angular HttpClient, Svelte 等)以相同模式添加示例。上面 1~4 的原则·规则是标准,附录只是其应用案例。

### Vue 3 (Axios + Pinia)

基于 Axios 单一实例 + Pinia auth store。令牌拦截器·响应解包·401 刷新·全局错误都在拦截器中处理,并用 `useApi` composable 绑定组件的加载/错误状态。

> 相关技能:
> - 令牌存储 (localStorage vs httpOnly cookie): [security-frontend](../../security/security-frontend/SKILL.md) §2
> - 何时将错误发送到 Sentry: [error-monitoring](../error-monitoring/SKILL.md) §5
> - 各环境的 base URL: [env-config](../env-config/SKILL.md)

#### Axios 实例 (`src/utils/axios.ts`)

所有 API 函数都使用这个单一实例。每个画面都再次调用 `axios.create` 会遗漏拦截器。

```ts
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth'
import { showErrorToast } from '@/utils/toast'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,    // 参见 env-config
  timeout: 20_000,                                // 20s
  withCredentials: true,                          // 发送 httpOnly cookie(refresh)
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',                 // Spring Security CSRF 匹配
})

/* ── Request: 自动附加 Access Token ───────────────────────── */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.set('Authorization', `Bearer ${auth.accessToken}`)
  }
  return config
})

/* ── Response: 解包 + 401 刷新 + 全局错误 ──────────────────── */
let refreshing: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res.data,                              // .data 自动解包
  async (error: AxiosError<any>) => {
    const { response, config } = error
    if (!response) {
      showErrorToast('请检查网络连接。')
      return Promise.reject({ code: 'NETWORK', message: '网络错误' })
    }

    // 401 → 尝试 refresh 一次 (并发 401 大量出现时只刷新一次)
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
      return Promise.reject({ code: 'AUTH_EXPIRED', message: '请重新登录。' })
    }

    // 只有 5xx 弹全局 toast,4xx 由调用方处理
    if (response.status >= 500) {
      showErrorToast('服务器临时错误。请稍后重试。')
    }
    return Promise.reject(response.data ?? { code: 'UNKNOWN', message: '错误' })
  }
)

export default api
```

> ⚠️ 由于拦截器已解包 `response.data`,调用处不要再次访问 `.data`。类型定义也按响应负载本身。

#### API 函数编写规则

按域文件拆分。函数名用 `<动词><名词>Api` 后缀。**不要用 `try-catch` 仅做 rethrow**(无意义,拦截器足矣)。

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

#### `useApi` Composable (用于响应式调用)

VueUse `useAsyncState` 之上的薄包装。当组件内需要同时使用加载/错误状态时。

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
      error.value = { code: e?.code ?? 'UNKNOWN', message: e?.message ?? '错误' }
      return null
    } finally {
      loading.value = false
    }
  }

  if (options.immediate) void execute()
  return { data, loading, error, execute }
}
```

使用 (`<script setup>`):
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
    <v-btn @click="execute">重试</v-btn>
  </v-alert>
  <SensorList v-else :items="sensors ?? []" />
</template>
```

#### 全局错误处理原则

错误展示位置的分担(网络·5xx=全局,4xx=调用画面内联)完全遵循正文 §2-6 的表格。上面的拦截器代码就是该映射的实现。
