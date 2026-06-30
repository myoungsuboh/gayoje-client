---
name: 国际化 (i18n Internationalization)
description: 处理禁止文本硬编码、翻译分离、稳定的键命名、复数/插值、locale 格式化、fallback、语言选择持久化的前端多语言通用标准,与特定语言/框架无关。在引入或整顿多语言时,以及决定消息键命名、格式化、语言切换持久化时阅读。
rules:
  - "不要把 UI 文本硬编码到代码中: 屏幕上可见的所有字符串都从翻译目录(键 → 文案)取得。不要在组件/模板中直接写自然语言字面量。"
  - "翻译与代码分离: 把消息分离为按 locale 的资源文件,使文案变更不波及为改代码。代码只知道「键」。"
  - "键要稳定且基于语义: 键指向「角色」而非译文。不要把自然语言文案本身当键(文案一变键就坏)。使用揭示领域、页面、元素的层级键。"
  - "动态值用插值,复数用规则: 不要直接拼接(concatenation)字符串,而用具名占位符(placeholder)注入。按数量的单/复数变化遵循各语言的复数规则。"
  - "日期、数字、货币用 locale 格式化器: 不要直接组装字符串或固定到某一 locale。应用各 locale 的格式规则(位分隔、货币符号、日期表记)。"
  - "缺失用 fallback 安全处理: 某 locale 没有键时落回默认 locale。开发阶段把缺失键以警告即时暴露。"
  - "持久化语言选择: 把用户选择的语言持久化到存储(如本地存储/cookie/服务器设置),再访问时恢复。"
  - "更新文档语言属性: 语言切换时一并更新文档根的语言属性(<html lang>),使无障碍、搜索引擎、浏览器功能识别正确的语言。"
tags:
  - "vue-i18n"
  - "useI18n"
  - "$t("
  - "createI18n"
  - "messages"
  - "locale"
---

# 🌐 国际化 (i18n Internationalization)

> 把 UI 中暴露的所有文本分离到代码之外的翻译目录,用稳定的键引用,按 locale 规则格式化日期/数字/货币,并持久化用户的语言选择。在引入或整顿多语言、处理消息键/格式化/语言切换时阅读。它是不依赖特定语言/框架的通用标准。

## 1. 核心原则
- **不要把 UI 文本硬编码到代码中**: 屏幕上可见的所有字符串都从翻译目录(键 → 文案)取得。不要在组件/模板中直接写自然语言字面量。
- **翻译与代码分离**: 把消息分离为按 locale 的资源文件,使文案变更不波及为改代码。代码只知道"键"。
- **键要稳定且基于语义**: 键指向"角色"而非译文。不要把自然语言文案本身当键(文案一变键就坏)。使用揭示领域、页面、元素的层级键。
- **动态值用插值,复数用规则**: 不要直接拼接(concatenation)字符串,而用具名占位符(placeholder)注入。按数量的单/复数变化遵循各语言的复数规则。
- **日期、数字、货币用 locale 格式化器**: 不要直接组装字符串或固定到某一 locale。应用各 locale 的格式规则(位分隔、货币符号、日期表记)。
- **缺失用 fallback 安全处理**: 某 locale 没有键时落回默认 locale。开发阶段把缺失键以警告即时暴露。
- **持久化语言选择**: 把用户选择的语言持久化到存储(如本地存储/cookie/服务器设置),再访问时恢复。
- **更新文档语言属性**: 语言切换时一并更新文档根的语言属性(`<html lang>`),使无障碍、搜索引擎、浏览器功能识别正确的语言。

## 2. 规则

### 2-1. 不要硬编码 UI 文本
- 屏幕上可见的字符串经由翻译函数/目录。不要在组件中嵌入自然语言字面量。

```text
// ❌ 禁止 — 把自然语言直接嵌入屏幕
render: "안녕하세요"

// ✅ 推荐 — 用键引用,文案来自目录
render: t("user.profile.greeting")
```

### 2-2. 把翻译分离为按 locale 的资源
- 每个 locale 放单独资源(文件/包),共享同一键集。
- 代码只知道键。文案变更只改资源。

```text
// 按 locale 的资源(相同键,不同文案)
resource[ko]:  common.save = "저장"
resource[en]:  common.save = "Save"
```

### 2-3. 键要稳定、层级化、基于语义
- 键指向"角色"。**不要把自然语言文案当键**(文案一变就坏)。
- 用 `<领域>.<页面>.<元素>` 这样的层级命名空间防止冲突/重复。把公共文案集中到公用命名空间(如 `common.*`)。

```text
// ❌ 禁止 — 自然语言本身就是键
t("안녕하세요")

// ✅ 推荐 — 基于语义的层级键
t("user.profile.greeting")     // <领域>.<页面>.<元素>
t("common.save")               // 公共命名空间
```

### 2-4. 动态值用插值,复数用规则
- 不要直接拼接字符串,而用**具名占位符**注入值(语序因语言而异)。
- 按数量的表达变化用**各语言的复数规则**处理 — 不要在代码里写 `if (n === 1)` 分支。

```text
// ❌ 禁止 — 字符串拼接(语序/复数会坏)
"항목 " + count + "개"

// ✅ 推荐 — 插值 + 复数规则
t("user.profile.greeting", { name })       // "안녕하세요, {name}님"
t("user.profile.itemCount", count)         // 用复数规则选择单/复数
```

### 2-5. 日期、数字、货币用 locale 格式化器
- 不要直接组装字符串或固定到某一 locale。应用 locale 规则(位分隔、货币符号、日期表记顺序)。
- 把格式定义(如 `short` 日期、`currency` 数字)集中到一处复用。

```text
// ❌ 禁止 — 按某一 locale 手动组装
year + "-" + month + "-" + day
"₩" + price

// ✅ 推荐 — locale 格式化器
formatDate(value, "short")     // ko: 2026-06-17 / en: Jun 17, 2026
formatNumber(price, "currency")// ko: ₩1,234 / en: $1,234.00
```

### 2-6. 缺失键用 fallback + 开发警告
- 当前 locale 没有键时**落回默认 locale**,以免屏幕坏掉或键字符串原样暴露。
- 开发阶段把缺失键/缺失 fallback **以警告即时暴露**(生产中静默 fallback)。

```text
// 配置概念
fallbackLocale = 默认 locale
missingWarn    = (仅开发模式) on

// en 中没有 → 用默认 locale 文案,开发中输出警告
```

### 2-7. 语言选择持久化 + 更新文档 lang
- 把用户选择的语言保存到**持久化存储**(本地存储/cookie/服务器档案等),启动时恢复。
- 语言切换时在一处(状态管理/切换函数)一并执行 ① 变更活动 locale ② 持久保存 ③ **更新文档根 lang 属性**。

```text
// ✅ 推荐 — 在一处一致处理切换
setLocale(lang):
  activeLocale = lang                 // 变更活动 locale
  persist("locale", lang)             // 持久保存(供再访问恢复)
  document.root.lang = lang           // 更新 <html lang>(无障碍/SEO)

// 启动时
activeLocale = persisted("locale") ?? 默认 locale
```

## 3. 常见错误
- **硬编码文本** → 把自然语言直接嵌入组件会使翻译本身不可能。用键引用。
- **用自然语言当键** → 文案一变键就坏。用基于语义的层级键。
- **用字符串拼接组装句子** → 在语序不同的语言中会坏。用具名插值。
- **用代码分支处理复数** → 各语言复数规则不同会出错。交给复数规则功能。
- **手动组装日期/数字/货币或固定到单一 locale** → 各 locale 格式会坏。用 locale 格式化器。
- **不用键命名空间** → 键冲突/重复定义频发。用层级命名空间分离。
- **不设置 fallback/缺失检测** → 键字符串原样暴露或捕捉不到缺失。开启 fallback + 开发警告。
- **不持久化语言选择** → 刷新/再访问时语言被重置。持久保存后恢复。
- **不更新文档 lang** → 屏幕阅读器、搜索引擎、浏览器功能以错误语言运作。切换时更新 `<html lang>`。

## 4. 检查清单
- [ ] 是否不硬编码 UI 文本而从**翻译目录**取得?
- [ ] 是否把翻译分离为**按 locale 的资源**且代码只引用键?
- [ ] 键是否不是自然语言而是**基于语义的层级键**(`<领域>.<页面>.<元素>`)?
- [ ] 是否用**具名插值**注入动态值(禁止字符串拼接)?
- [ ] 是否用**各语言的复数规则**处理复数(禁止代码分支)?
- [ ] 是否用 **locale 格式化器**处理日期/数字/货币(禁止固定到单一 locale)?
- [ ] 缺失键是否有 **fallback** 生效,且开发模式下**缺失警告**已开启?
- [ ] 是否**持久化**用户的语言选择并在启动时恢复?
- [ ] 语言切换时是否更新**文档根 lang 属性**?

## 附录: 各技术栈示例

> 以下是参考实现示例。按团队所用的技术栈(如 React/react-i18next·FormatJS、Angular i18n、Svelte 等)以相同模式补充示例。上面 1~4 的原则与规则才是标准,附录只是其应用案例。错误消息等服务器端多语言,一并参考后端输入值校验标准(validation-bean)。

### Vue 3 (vue-i18n)

> 这是用 vue-i18n 9 + Vuetify locale 适配器实现正文 1~4 原则与规则的**代码示例**。键命名(正文 2-3)、fallback(正文 2-6)、语言切换持久化与 `<html lang>` 更新(正文 2-7)的"为什么"见正文。这里只载入 `legacy: false`(Composition API 模式)初始化与实际的持久化代码。

#### 安装及初始化
```bash
npm install vue-i18n@9
```

```javascript
// src/plugins/i18n.js
import { createI18n } from 'vue-i18n'
import ko from '@/locales/ko.json'
import en from '@/locales/en.json'

export const i18n = createI18n({
  legacy: false, // Composition API 模式必需
  locale: localStorage.getItem('locale') || 'ko',
  fallbackLocale: 'en',
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
  messages: { ko, en },
  datetimeFormats: {
    ko: { short: { year: 'numeric', month: '2-digit', day: '2-digit' } },
    en: { short: { year: 'numeric', month: 'short', day: '2-digit' } }
  },
  numberFormats: {
    ko: { currency: { style: 'currency', currency: 'KRW' } },
    en: { currency: { style: 'currency', currency: 'USD' } }
  }
})
```

#### 消息文件结构
- `src/locales/ko.json`, `src/locales/en.json`
- 键用英文领域表记。**不要用韩语当键。**

复数用 `|` 区分单/复数形态。各语言的形态数不同 — 韩语没有单/复数屈折,一种形态(`"항목 {count}개"`)就够;英语单数/复数分开,故需要两种形态。

```json
// en.json — 单数/复数实际不同的语言
{
  "common": { "save": "Save", "cancel": "Cancel" },
  "user": {
    "profile": {
      "title": "Profile",
      "greeting": "Hello, {name}",
      "itemCount": "1 item | {count} items"
    }
  }
}
// ko.json — 无屈折,一种形态即足够: "itemCount": "항목 {count}개"
```

#### Vuetify Locale 适配器对接
```javascript
// src/plugins/vuetify.js
import { createVuetify } from 'vuetify'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { useI18n } from 'vue-i18n'
import { i18n } from './i18n'

export const vuetify = createVuetify({
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n })
  }
})
```

#### 组件使用
```vue
<template>
  <VCard>
    <VCardTitle>{{ t('user.profile.title') }}</VCardTitle>
    <VCardText>
      <p>{{ t('user.profile.greeting', { name: userName }) }}</p>
      <p>{{ t('user.profile.itemCount', count) }}</p>
      <p>{{ d(new Date(), 'short') }}</p>
      <p>{{ n(1234.5, 'currency') }}</p>
      <VBtn @click="changeLocale('en')">English</VBtn>
    </VCardText>
  </VCard>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocaleStore } from '@/store/locale'

const { t, d, n } = useI18n()
const userName = ref('홍길동')
const count = ref(3)

const localeStore = useLocaleStore()
const changeLocale = (lang) => localeStore.setLocale(lang)
</script>
```

#### 语言切换 + 持久化 (正文 2-7 — 在一处变更 locale、持久化、更新 `<html lang>`)
```javascript
// src/store/locale.js
import { defineStore } from 'pinia'
import { i18n } from '@/plugins/i18n'

export const useLocaleStore = defineStore('locale', {
  state: () => ({ locale: localStorage.getItem('locale') || 'ko' }),
  actions: {
    setLocale(lang) {
      this.locale = lang
      i18n.global.locale.value = lang
      localStorage.setItem('locale', lang)
      document.documentElement.setAttribute('lang', lang)
    }
  }
})
```

> 键命名(`<领域>.<页面>.<元素>`·`common.*`)遵循正文 2-3,fallback 与 `missingWarn` 行为遵循正文 2-6 — 上面初始化代码的 `fallbackLocale`/`missingWarn` 设置就是其实现。
