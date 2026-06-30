---
name: 分析事件跟踪 (Analytics Event Tracking)
description: 涵盖一致的事件命名·单一封装·PII 脱敏·征得同意后采集·环境分离的产品指标(转化率·funnel)事件跟踪通用标准,与特定语言/框架/分析厂商无关。在引入分析工具或新定义·发送事件时,在确定个人信息脱敏·同意(opt-out)·防抖时阅读。错误采集见 error-monitoring。
rules:
  - "事件按目录管理: 不要把事件名称和属性以自由形式四处散落,而是用 对象_动作(snake_case·过去式)这样的单一规则统一,并以文档(目录)管理。同一行为以多个名称入库会让分析本身无法进行。"
  - "从核心指标开始定义: 不要试图追踪一切,先定义用于运营决策的转化·funnel 核心事件。没有测量目的的事件就是噪声。"
  - "采集以用户同意为前提: 在确认同意(opt-out/opt-in)状态之前不开始跟踪。同意是分析的前置条件,而非附加功能。"
  - "不要发送个人信息(PII): 分析工具不是 PII 存储库。邮箱·电话·地址·坐标·明文标识符等要在发送路径上移除,或只以无关联风险的形式(哈希·分析专用 ID)发送。"
  - "把厂商藏在单一封装之后: 不要在界面·领域代码中直接调用分析 SDK,而只通过公共封装(track/init/setOptOut 等)调用。让更换工具只需修改一个文件,并把脱敏·同意检查集中到一处。"
  - "高频事件要减量发送: 滚动·拖拽·移动·输入这类短间隔涌出的事件,用防抖/节流合并以控制流量和成本。"
  - "分离环境: 为避免开发事件污染运营仪表盘,按环境(dev/prod)分离分析密钥/端点。"
tags:
  - "gtag"
  - "ga4"
  - "analytics"
  - "mixpanel"
  - "track("
  - "trackEvent"
  - "datalayer"
---

# 📊 分析事件跟踪 (Analytics Event Tracking)

> 把运营决策所需的用户行为指标(DAU/MAU·转化率·funnel),以一致的名称定义并通过单一入口入库。在发送前移除个人信息,只在征得用户同意后采集,并做抽象以不绑定特定分析厂商。在引入分析工具或定义·发送事件时阅读。这是不绑定特定语言/框架/厂商的通用标准。(错误见 `error-monitoring`,用户行为属分析 — 它们是不同的轨道。)

## 1. 核心原则
- **事件按目录管理**: 不要把事件名称和属性以自由形式四处散落,而是用 `对象_动作`(snake_case·过去式)这样的单一规则统一,并以文档(目录)管理。同一行为以多个名称入库会让分析本身无法进行。
- **从核心指标开始定义**: 不要试图追踪一切,先定义用于运营决策的转化·funnel 核心事件。没有测量目的的事件就是噪声。
- **采集以用户同意为前提**: 在确认同意(opt-out/opt-in)状态之前不开始跟踪。同意是分析的前置条件,而非附加功能。
- **不要发送个人信息(PII)**: 分析工具不是 PII 存储库。邮箱·电话·地址·坐标·明文标识符等要在发送路径上移除,或只以无关联风险的形式(哈希·分析专用 ID)发送。
- **把厂商藏在单一封装之后**: 不要在界面·领域代码中直接调用分析 SDK,而只通过公共封装(`track`/`init`/`setOptOut` 等)调用。让更换工具只需修改一个文件,并把脱敏·同意检查集中到一处。
- **高频事件要减量发送**: 滚动·拖拽·移动·输入这类短间隔涌出的事件,用防抖/节流合并以控制流量和成本。
- **分离环境**: 为避免开发事件污染运营仪表盘,按环境(dev/prod)分离分析密钥/端点。

## 2. 规则

### 2-1. 事件名称用单一规则统一并目录化
- 定一种规则如 `对象_动作`(snake_case·过去式)应用到所有事件,并以目录文档管理名称·属性·含义。
- 禁止 subject 缺失、大小写混用、特殊字符、即兴命名。

```text
规则: [Subject]_[Action]_[Object?]   // snake_case + 过去式, 语言统一

// ❌ 禁止 — subject 缺失 · 表记混用 · 特殊字符 · 自由形式
track("signup")
track("inviteFriend")
track("course_complete!")

// ✅ 推荐 — 对象_动作 过去式, 属性用约定的键
track("user_signed_up", { method })
track("friend_invitation_sent", { to_user_id_hashed })
```

### 2-2. 跟踪只通过单一封装调用 (阻断厂商绑定)
- 不要在界面/领域代码中直接调用分析 SDK,而是设一个公共封装(`init`/`track`/`setOptOut`)并只在那里调用 SDK。
- 把是否初始化·是否同意的检查与 PII 脱敏集中在封装一处 — 调用方只关心"发送什么"。

```text
// ❌ 禁止 — 界面代码直接调用厂商 SDK (更换·脱敏·同意检查四处散落)
vendorSdk.logEvent("user_signed_up", { email })   // 连 PII 都原样发送

// ✅ 推荐 — 经由公共封装, 脱敏·同意检查在封装内部统一
module analytics:
  state initialized, optedOut
  init():            if no key: return; vendorSdk.init(key, { collectIp: false }); initialized = true
  track(name, props):if not initialized or optedOut: return; vendorSdk.logEvent(name, sanitize(props))
  setOptOut(out):    optedOut = out; vendorSdk.setOptOut(out)

// 调用方
analytics.track("user_signed_up", { method })
```

### 2-3. PII 在发送前移除 (封装内部 sanitize)
- 敏感属性(邮箱·电话·密码·令牌·地址·坐标等)在封装的单一净化步骤中过滤掉后再发送。
- 如需用户标识,不发明文 ID,而发哈希/分析专用 ID。

```text
// ✅ 推荐 — 在单一点移除禁用键后发送
FORBIDDEN = [email, phone, password, token, lat, lng, address, ...]
sanitize(props): 从 props 中移除键名包含 FORBIDDEN 的项后返回

track(name, props): vendorSdk.logEvent(name, sanitize(props))
```

### 2-4. 仅在同意(opt-out/opt-in)后采集
- 应用启动时先确认同意状态,对未决定的用户(仅一次)显示同意 UI。
- 在取得同意前不进行分析初始化(`init`)和发送(`track`)(遵守 GDPR/PIPL 等个人信息法规)。

```text
// ✅ 推荐 — 同意是跟踪的前置条件
on app start:
  consent = readConsent()
  if consent is undecided: showConsentDialogOnce()
  if consent is granted:   analytics.init()    // 同意前禁止 init/track
```

### 2-5. 高频事件做防抖
- 滚动·拖拽·地图移动·连续输入这类短间隔连续发生的事件,用防抖/节流合并,只发一次。
- 每次发生都发送会让流量·成本暴涨,也会成为分析的噪声。

```text
// ❌ 禁止 — 每次发生都发送
onMove(() => track("map_panned", { zoom }))

// ✅ 推荐 — 一段时间合并发一次
trackPan = debounce((zoom) => track("map_panned", { zoom }), 2000ms)
onMove(() => trackPan(currentZoom))
```

### 2-6. 按环境(dev/prod)分离密钥
- 把分析密钥/端点用环境变量分离,使开发中产生的事件不污染运营仪表盘。
- 共用运营/开发密钥会让数据可信度崩塌。

```text
// ✅ 推荐 — 按环境注入不同密钥 (禁止硬编码到代码)
key = env.ANALYTICS_KEY        // dev 环境注入 dev 密钥, prod 环境注入 prod 密钥
analytics.init(key)
```

## 3. 常见错误
- **把 PII 作为事件属性发送** → 把邮箱·电话·坐标·明文 user_id 原样发送。分析工具不是 PII 存储库。在封装中移除并把标识符哈希。
- **未同意就开始跟踪** → 在确认同意状态前调用 init/track。违反个人信息法规。
- **事件名称自由形式** → 同一行为以多个名称入库,分析时类别爆炸。用单一规则 + 目录归拢。
- **高频事件每次发送** → 每次滚动·移动·按键都发,流量·成本暴涨。做防抖。
- **共用运营/开发密钥** → 开发事件污染运营仪表盘,数据可信度崩塌。按环境分离。
- **在界面代码中直接调用厂商 SDK** → 更换工具·脱敏·同意检查四处散落。藏到单一封装之后。

## 4. 检查清单
- [ ] 事件名称是否遵循单一规则(`对象_动作`·snake_case·过去式)并以目录文档化
- [ ] 是否优先定义了转化·funnel 核心事件
- [ ] 是否不在界面/领域代码中直接调用跟踪,而经由单一封装
- [ ] PII 脱敏(sanitize)是否在单一封装中处理,且标识符以哈希/分析专用 ID 发送
- [ ] 是否仅在确认同意(opt-out/opt-in)后才 init/track
- [ ] 是否对高频事件做防抖/节流
- [ ] 是否分离了 dev/prod 分析密钥

## 附录: 各技术栈示例

> 以下是参考用实现示例。请按相同模式为团队所用的技术栈(例如 React/Next.js、Vue 3、移动/原生、服务端跟踪等)添加示例。上面 1~4 的原则·规则是标准,附录只是其应用案例。

### Vue 3 (Vite) + Amplitude

> 这是把正文 1~4 的原则·规则用 Vite 环境变量 + Amplitude SDK 实现的**代码示例**。命名规则(正文 2-1)·同意(正文 2-4)·防抖(正文 2-5)·环境分离(正文 2-6)的"为什么"看正文。这里只放单一封装(`src/lib/analytics.js`)在一处处理厂商绑定和 PII 脱敏的实际代码。

#### 工具选型 (厂商对比 — 参考)

| 工具 | 免费额度 | 强项 |
|---|---|---|
| Amplitude | 每月 10M | 免费额度大, 上手快 (推荐默认) |
| Mixpanel | 每月 1M | funnel/cohort 分析最强 |
| GA4 | 无限(采样) | 免费, 与广告联动 |
| PostHog(自托管) | 无限 | 开源, 数据主权 |

#### 统一封装 (正文 2-2·2-3 — 阻断厂商绑定 + PII 脱敏)

```js
// src/lib/analytics.js
import amplitude from 'amplitude-js'
let initialized = false, optedOut = false

export function initAnalytics() {
  const key = import.meta.env.VITE_AMPLITUDE_API_KEY  // dev/prod 密钥分离 (正文 2-6)
  if (!key) return
  amplitude.getInstance().init(key, null, { trackingOptions: { ipAddress: false } })
  initialized = true
}
export function track(name, props = {}) {
  if (!initialized || optedOut) return
  amplitude.getInstance().logEvent(name, sanitize(props))
}
export function setOptOut(out) { optedOut = out; amplitude.getInstance().setOptOut(out) }

// 敏感键自动移除 (sanitize)
const FORBIDDEN = ['email', 'phone', 'password', 'token', 'lat', 'lng', 'address']
function sanitize(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !FORBIDDEN.some(f => k.toLowerCase().includes(f)))
  )
}

// 调用方: 名称用 对象_动作 过去式(正文 2-1)
track('user_signed_up', { method: 'kakao' })
```

#### 防抖 (正文 2-5)

```js
import { debounce } from 'lodash-es'
const trackPan = debounce((zoom) => track('map_panned', { zoom }), 2000)
map.on('moveend', () => trackPan(map.getZoom()))
```
