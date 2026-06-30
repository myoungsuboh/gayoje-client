---
name: 响应式样式标准 (Responsive Styling)
description: 响应式原则遵循 `responsive-layout`(SoT)，这里只处理将该标准映射到技术栈(Vue 3 + Vuetify)的实现 — Vuetify断点·VRow/VCol栅格·spacing工具类。用Vuetify构建响应式页面，或确定断点·间距·字号时阅读。关键词: responsive, mobile-first, breakpoints, clamp, grid, viewport, touch target, Vuetify, VRow, VCol.
rules:
  - "布局以定义好的断点为基准进行分支"
  - "字号采用基于clamp的流式排版来设置"
  - "间距使用设计令牌的spacing单位"
  - "以移动优先编写，并向大屏渐进扩展"
tags:
  - "responsive"
  - "mobile-first"
  - "breakpoints"
  - "clamp"
  - "grid"
  - "viewport"
  - "touch target"
  - "Vuetify"
  - "VRow"
  - "VCol"
  - "@media"
  - "breakpoint"
  - "min-width"
  - "max-width"
  - "grid-template"
  - "flex-wrap"
---

# 📐 响应式样式标准 (Responsive Styling)

> 响应式的概念·原则(移动优先、一致的断点、流式排版、流式栅格、触摸目标等)以 `responsive-layout` 技能为单一出处(SoT)。本技能只处理如何在我们的技术栈(Vue 3 + Vuetify)上实现该标准。用Vuetify构建响应式页面，或确定断点·间距·字号时，与 `responsive-layout` 一起阅读。

## 1. 原则遵循 `responsive-layout` (委派)
响应式的所有中立原则 — **移动优先**(用 `min-width` 扩展)、**一致的断点**(内容崩坏的临界点，禁止魔法数字)、**流式排版**(`clamp()` + `rem`)、**流式栅格/弹性单位**(`%`/`fr`/`minmax`)、**按平台的触摸目标·防止横向滚动** — 均以 `responsive-layout` 技能为标准(SoT)。此处不再重复，遵循那一侧即可。

- **按视口差异化间距**的原则也遵循 `responsive-layout`，但间距·间隙**值的令牌化/统一**遵循 `design-system` 技能。
- 以下只处理在我们的技术栈(Vue 3 + Vuetify)上实现该标准的方法，即**技术栈特有部分**。

## 2. Vue 3 + Vuetify 实现

Vuetify提供自有的断点体系(`xs`/`sm`/`md`/`lg`/`xl`)与栅格(`VRow`/`VCol`)、间距工具类(`pa-*`/`ma-*`)。这是将 `responsive-layout` 的标准概念映射到Vuetify惯用法的结果。

### 2-1. 视口基准 (Breakpoints)
- **Mobile (xs)**: `0px` ~ `599px`
- **Tablet (sm, md)**: `600px` ~ `1279px`
- **Web (lg+)**: `1280px` 及以上

### 2-2. 栅格 — VRow / VCol
- 响应式列用 `VRow`/`VCol` 构成，并以断点prop(`cols`, `sm`, `md`, `lg`)分级指定列数。

```vue
<v-row>
  <!-- 移动端12列(1列) → 平板6列(2列) → 桌面4列(3列) -->
  <v-col cols="12" sm="6" lg="4" v-for="item in items" :key="item.id">
    <v-card>{{ item.name }}</v-card>
  </v-col>
</v-row>
```

### 2-3. 间距 — spacing 工具类
- 间距用 `pa-*`(padding)/`ma-*`(margin)工具类给定，按视口的差异化以断点前缀表达。值的令牌化/统一遵循 `design-system`。
- 例: 移动端 `pa-4`，桌面 `pa-8` → `pa-4 pa-lg-8`。

```vue
<!-- 移动端用 pa-4(16px)，lg 及以上用 pa-8(32px) -->
<v-sheet class="pa-4 pa-lg-8">...</v-sheet>
```

### 2-4. 流式排版
- 与Vuetify的排版类(`text-h4` 等)无关，可将 `responsive-layout` 的标准 `clamp()` 直接用在 `scoped` 样式中。

```vue
<style scoped>
.page-title { font-size: clamp(1.5rem, 4vw + 1rem, 3rem); }
</style>
```
