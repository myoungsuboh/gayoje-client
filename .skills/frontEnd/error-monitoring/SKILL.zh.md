---
name: 错误监控 (Error Monitoring)
description: 前端错误收集的通用标准 — 引入错误收集工具、上传 source map(非公开)、标记发布版本与环境、识别上下文与用户影响、屏蔽 PII、按环境采样、告警阈值。与特定工具/框架无关。在前端接入或整顿错误监控时,以及决定收集/排除什么、source map、采样、PII 处理时阅读。关键词: error monitoring, crash reporting, sourcemap, release tagging, environment, breadcrumb, sampling, PII scrub, capture, alert threshold。
rules:
  - "不丢失错误(全局收集): 在全局一处拦截未处理异常、被拒绝的 Promise、渲染错误,无论在哪条代码路径上崩溃都不遗漏地收集。不要只打印 console.error 就结束,或用 try/catch 吞掉造成 silent fail。"
  - "区分信号与噪声: 不要发送所有错误。只收集用户无能为力的真正缺陷(服务器错误、网络故障、意外异常),排除属于正常流程一部分的错误(如输入校验失败这类 4xx),以防噪声暴增。"
  - "标记发布版本与环境: 给每个事件附上它发生于哪个版本(release)、哪个环境(dev/staging/prod),以便追踪回归是从哪次部署开始的。"
  - "用 source map 还原原始位置但不公开: 只把能将压缩/混淆的堆栈追踪还原到原始源位置的 source map 上传到收集工具。不要把 source map 与公开发布物一起导出(原始代码泄露)。"
  - "留存上下文与用户影响: 一并留存错误前的用户行为轨迹(breadcrumb)、发生的页面/路由、匿名用户标识符,以帮助复现与掌握影响范围(影响多少人、在哪个页面)。"
  - "PII 在发送前移除: 不把个人可识别信息与机密值(邮箱、密码、令牌、身份证号等)放入用户上下文或负载,在发送前的钩子中屏蔽/删除。详细标准遵循单独的技能(privacy-pii)。"
  - "按环境采样: 各环境设置不同的收集/追踪比率。开发环境通常禁用以节省配额与噪声,生产按错误影响确定比率。"
  - "按阈值告警: 不要把所有事件都灌入告警,只在影响度(频率、用户数、是否为新回归)超过阈值时才通知,以防告警疲劳。运维可观测性整体与 observability 技能一并参看。"
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

# 🛰️ 错误监控 (Error Monitoring)

> 用于安全地收集与诊断前端发生的错误,并优先处理用户影响大的问题的标准。在引入或整顿错误监控时,以及决定收集/排除什么、敲定 source map、发布版本标记、采样、PII 处理时阅读。它是不依赖特定收集工具(如 Sentry)或框架(如 Vue)的通用标准。具体应用示例参见最末尾的附录。

## 1. 核心原则
- **不丢失错误(全局收集)**: 在全局一处拦截未处理异常、被拒绝的 Promise、渲染错误,无论在哪条代码路径上崩溃都不遗漏地收集。不要只打印 `console.error` 就结束,或用 `try/catch` 吞掉造成 silent fail。
- **区分信号与噪声**: 不要发送所有错误。只收集用户无能为力的真正缺陷(服务器错误、网络故障、意外异常),排除属于正常流程一部分的错误(如输入校验失败这类 4xx),以防噪声暴增。
- **标记发布版本与环境**: 给每个事件附上它发生于哪个版本(release)、哪个环境(dev/staging/prod),以便追踪回归是从哪次部署开始的。
- **用 source map 还原原始位置但不公开**: 只把能将压缩/混淆的堆栈追踪还原到原始源位置的 source map 上传到收集工具。不要把 source map 与公开发布物一起导出(原始代码泄露)。
- **留存上下文与用户影响**: 一并留存错误前的用户行为轨迹(breadcrumb)、发生的页面/路由、匿名用户标识符,以帮助复现与掌握影响范围(影响多少人、在哪个页面)。
- **PII 在发送前移除**: 不把个人可识别信息与机密值(邮箱、密码、令牌、身份证号等)放入用户上下文或负载,在发送前的钩子中屏蔽/删除。详细标准遵循单独的技能(`privacy-pii`)。
- **按环境采样**: 各环境设置不同的收集/追踪比率。开发环境通常禁用以节省配额与噪声,生产按错误影响确定比率。
- **按阈值告警**: 不要把所有事件都灌入告警,只在影响度(频率、用户数、是否为新回归)超过阈值时才通知,以防告警疲劳。运维可观测性整体与 `observability` 技能一并参看。

## 2. 规则

### 2-1. 在全局无遗漏地收集
- 在单一全局钩子处拦截未处理异常、被拒绝的 Promise、框架渲染错误。
- 若在单个 `try/catch` 中捕获,则要么恢复,要么对无法恢复的错误先上报到收集工具再重新抛出 — 不要默默吞掉。

```text
// ❌ 禁止 — 捕获后默默丢弃(谁也不知道发生了什么)
try { doWork() } catch (e) { console.error(e) }   // 未被收集

// ✅ 推荐 — 用全局钩子统一收集 + 无法处理的上报后重新抛出
onUnhandledError(e   => capture(e))
onUnhandledRejection(e => capture(e.reason))
onFrameworkError(e   => capture(e))
try { doWork() } catch (e) { capture(e); throw e }
```

### 2-2. 区分要收集与要排除的错误
- 只收集用户无能为力的缺陷(服务器错误、网络故障、意外异常)。
- 排除属于正常流程一部分的客户端错误(如输入校验失败等 4xx) — 它们只会增加噪声、淹没信号。
- 在一处(公共网络层/过滤器)决定发送哪些错误。

```text
// ❌ 禁止 — 收集所有网络错误(404/401 噪声暴增)
onApiError(err => capture(err))

// ✅ 推荐 — 只收集服务器错误与网络故障,排除 4xx
onApiError(err => {
  if (err.status >= 500 || err.networkFailed) capture(err)
})
```

### 2-3. 给每个事件标记发布版本与环境
- 把构建时的版本作为 release、运行环境作为 environment,自动附加到每个事件。
- 没有标记就无法追踪"从哪次部署开始坏的"。

```text
// ✅ 推荐 — 初始化时设置一次 → 自动附加到每个事件
monitor.init({
  environment: currentEnv,   // dev | staging | prod
  release:     appVersion,   // 注入构建的版本/提交
})
```

### 2-4. source map 只上传到工具,禁止公开发布
- 不要把 source map 随构建产物一起公开,只非公开地上传到收集工具。
- 上传在 CI 中用密钥令牌进行,并对齐 release 标识符,使堆栈追踪准确映射。

```text
// ❌ 禁止 — 在公开发布物中随附 source map(原始代码泄露)
build: emit *.map alongside public assets

// ✅ 推荐 — 公开物不含 source map,只上传到工具
build:  generate hidden sourcemaps (not served publicly)
deploy: upload sourcemaps to monitoring tool, keyed by release
```

### 2-5. 用匿名标识符留存用户影响
- 为能统计"影响了多少人",只把匿名/内部标识符放入用户上下文。
- 不放入邮箱等 PII(参见 2-7)。登出时清空用户上下文。

```text
// ❌ 禁止 — 把 PII 附加到用户上下文
setUser({ id, email, phone })

// ✅ 推荐 — 只用匿名/内部标识符
setUser({ id: user.id, displayName: user.handle })  // 排除 PII
onLogout(() => setUser(null))
```

### 2-6. 一并留存上下文(轨迹、页面/路由)
- 留存错误前的用户行为轨迹(breadcrumb)与发生页面/路由标签以帮助复现。
- 别让轨迹混入令牌、机密值(2-7)。

```text
// ✅ 推荐 — 行为轨迹 + 当前页面标签
addBreadcrumb({ category: 'user-action', message: 'Clicked export' })
onRouteChange(route => setTag('route', route.name))
```

### 2-7. 发送前移除 PII 与机密值
- 在发送前的钩子中,屏蔽/删除负载、轨迹、URL 查询中的敏感信息(密码、令牌、身份证号等)。
- 何为 PII、屏蔽标准遵循 `privacy-pii` 技能。

```text
// ✅ 推荐 — 发送前的脱敏钩子
beforeSend(event => {
  redact(event.payload, ['password', 'token', 'ssn'])
  maskQueryParams(event.breadcrumbs, ['token', 'access_token'])
  return event
})
```

### 2-8. 确定按环境的采样比率
- 按环境分离收集/追踪比率。开发通常禁用,生产按影响度设置比率。
- 错误本身尽量全部接收(重要信号),但成本高的追踪/会话录制降低比率。

```text
// ✅ 推荐 — 用按环境的矩阵分离比率
sampleRate = { dev: 0, staging: 0.5, prod: 0.1 }[currentEnv] ?? 0
```

| 环境 | 启用收集 | 追踪比率 | 备注 |
|---|---|---|---|
| development | 关 | 0 | 节省本地噪声/配额 |
| staging | 开 | 中(如 0.5) | 上线前验证 |
| production | 开 | 低(如 0.1) | 按影响度调整 |

### 2-9. 告警按影响阈值触发
- 只对超过阈值的问题告警,如新回归、激增、受影响用户数 — 不要逐个事件告警。
- 阈值/路由(给谁、走哪个渠道)由团队共识确定,运维观测与 `observability` 技能联动。

```text
// ✅ 推荐 — 基于阈值的告警(示例策略)
alert when: 新问题首次发生 OR 24h 内发生激增 OR 受影响用户 ≥ N
mute:       既有 known 问题, 低于阈值
```

## 3. 常见错误
- **收集所有 4xx** → 404/401 噪声暴增、真正缺陷被淹没。只收服务器错误与网络故障。
- **开发环境也启用收集** → 本地错误污染配额/仪表盘。dev 禁用。
- **发送 PII** → 把邮箱、电话、令牌放入用户上下文/负载。匿名标识符 + 发送前脱敏。
- **公开发布 source map** → 在公开物中随附 `*.map` 导致原始代码泄露。只非公开上传到工具。
- **遗漏 release/environment 标记** → 无法追踪从哪次部署开始坏的。初始化时始终标记。
- **`try/catch` 捕获后未上报(silent fail)** → 错误消失。上报后重新抛出或恢复。
- **只打印 `console.error`** → 不 capture 到收集工具就无法被观测。
- **全事件告警** → 告警疲劳导致错过真正重要的信号。基于阈值。

## 4. 检查清单
- [ ] 是否在**全局**收集未处理异常、被拒绝的 Promise、渲染错误?
- [ ] 是否只收集服务器错误与网络故障而排除 4xx 类?
- [ ] 是否给每个事件标记 **release 与 environment**?
- [ ] 是否**不公开发布** source map 而只非公开上传到收集工具?
- [ ] 是否在用户上下文中**只放匿名/内部标识符**并排除 PII (`privacy-pii`)?
- [ ] 是否在发送前的钩子中**脱敏**密码、令牌、身份证号等?
- [ ] 是否遵循**按环境采样**矩阵(dev/staging/prod)?
- [ ] 是否**基于影响阈值**触发告警 (`observability`)?
- [ ] 是否避免把 `try/catch` 捕获的错误留作 silent fail?

## 附录: 各技术栈示例

> 以下是参考实现示例。按团队所用的技术栈(如 React/Next、其他收集工具、基于 fetch 的客户端等)以相同模式补充示例。上面 1~4 的原则与规则才是标准,附录只是其应用案例。

### Vue 3 (@sentry/vue)

基于 Sentry Vue SDK 收集全局错误,用 `beforeSend` 脱敏敏感信息,并用 Vite 插件非公开上传 source map。

#### 安装
```bash
npm install @sentry/vue
npm install -D @sentry/vite-plugin
```

#### 初始化
```javascript
// src/main.js
import { createApp } from 'vue'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 按环境的追踪比率 — 直接索引对象在无匹配时会变成 undefined,
// 因此分离为单独常量并用 ?? 0 保证为 number。
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
  beforeSend: scrubSensitive   // 发送前脱敏(定义见下方"敏感信息脱敏")
})

app.use(router).mount('#app')
```

> 按环境的比率遵循正文 §2-8"按环境采样"表(dev=0, staging≈0.5, prod≈0.1)。上面代码中的 `rate`、`replaysOnErrorSampleRate`、按环境的 `dsn` 就是该策略的实现。

#### 用户上下文
```javascript
// 登录时
import * as Sentry from '@sentry/vue'

Sentry.setUser({
  id: user.id,
  username: user.username
  // 不要放入 email/PII
})

// 登出时
Sentry.setUser(null)
```

#### 按路由的 Transaction
- `browserTracingIntegration({ router })` 会自动把路由 transition 记录为 transaction。
- 附加上下文:

```javascript
router.afterEach((to) => {
  Sentry.setTag('route', to.name)
})
```

#### 全局错误处理器 + Axios Interceptor
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
    // 排除 4xx,只把 5xx 发送到 Sentry
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

#### 敏感信息脱敏 (`beforeSend`)
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
  // 屏蔽 breadcrumb URL 查询字符串中的令牌
  event.breadcrumbs?.forEach(b => {
    if (b.data?.url) b.data.url = b.data.url.replace(/token=[^&]+/g, 'token=***')
  })
  return event
}
```

#### source map 上传
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
- source map **禁止 public 发布** → 用 `sourcemap: 'hidden'` 只上传到 Sentry。
