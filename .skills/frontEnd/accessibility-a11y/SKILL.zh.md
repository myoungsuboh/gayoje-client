---
name: 网页无障碍 (a11y) — Vue 3 + Vuetify
description: Vue 3 + Vuetify 技术栈的无障碍实现指南。当需要组件标记、焦点陷阱、动态通知、reduced-motion、axe/Playwright 验证时阅读。技术栈中立的标准参见 accessibility-wcag。
rules:
  - "通过 WCAG 2.1 AA 标准的发布前检查清单"
  - "优先使用 button、nav、main 等语义化标签，而非 div"
  - "为图标按钮通过 aria-label 提供名称"
  - "让所有交互都可通过键盘(Tab、Enter、Esc)操作"
  - "正文文本确保色彩对比度达到 4.5:1 以上"
tags:
  - "aria-label"
  - "aria-hidden"
  - "aria-live"
  - "role="
  - "alt="
  - "tabindex"
  - "wcag"
---

# ♿ 网页无障碍 (a11y) — Vue 3 + Vuetify

> 介绍如何在 Vue 3 + Vuetify 技术栈上实现 WCAG 2.1 AA。在制作或验收交互式 UI、模态框、动态通知、动画时阅读。
>
> **技术栈中立的原则与标准以 [accessibility-wcag](../../design/accessibility-wcag/SKILL.md) 为权威(SoT)。** POUR、语义优先、键盘操作、`:focus-visible`、色彩对比度数值、禁止仅靠颜色传递信息等遵循该文档。本文档仅介绍技术栈特有的实现。
>
> 缩写: **a11y**(accessibility) · **WCAG**(Web Content Accessibility Guidelines) · **ARIA**(Accessible Rich Internet Applications)。
>
> 相关技能:
> - 设计令牌 / 色彩对比度: [design-system](../design-system/SKILL.md)
> - 多语言(屏幕阅读器语言属性): [i18n-internationalization](../i18n-internationalization/SKILL.md)
> - 测试(与 `data-test` 分开活用 `aria-label`): [frontend-testing](../frontend-testing/SKILL.md)

## 1. 适用方针

- 一般原则遵循 `accessibility-wcag`。以下是如何在 Vue/Vuetify 中实现这些原则。
- Vuetify 组件大多会输出适当的语义标签，但**布局地标需要自己处理**。
- **自动验证 + 手动验证并行** — 在 axe/Lighthouse 自动化之外，键盘与屏幕阅读器的手动验证是必须的。

## 2. 技术栈实现

### 2-1. 布局地标 (语义化标记)

```vue
<template>
  <header><AppHeader /></header>
  <nav aria-label="주 메뉴"><AppNav /></nav>
  <main>
    <h1>{{ $t('dashboard.title') }}</h1>
    <section aria-labelledby="sensors-heading">
      <h2 id="sensors-heading">{{ $t('sensors.heading') }}</h2>
      <SensorList :items="sensors" />
    </section>
  </main>
  <footer><AppFooter /></footer>
</template>
```

> ❌ 不要只用 `<div class="header">`，应使用 `<header>`。屏幕阅读器会将其识别为地标。

### 2-2. ARIA 常用模式

| 情况 | 属性 |
|------|------|
| 图标按钮 (无文本) | `aria-label="저장"` |
| 辅助说明 | `aria-describedby="hint-id"` |
| 切换状态 | `aria-pressed="true"`, `aria-expanded="false"` |
| 动态通知 (吐司) | `role="status" aria-live="polite"` |
| 错误通知 | `role="alert" aria-live="assertive"` |
| 当前页面 (菜单) | `aria-current="page"` |
| 隐藏文本 (仅屏幕阅读器) | `.sr-only` 类 |

```scss
// src/styles/_a11y.scss
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
```

### 2-3. 键盘导航 + 焦点陷阱

```vue
<script setup lang="ts">
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirm() }
}
</script>

<template>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="dlg-title"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <h2 id="dlg-title">확인</h2>
    <!-- ... -->
  </div>
</template>
```

**焦点陷阱** (让 Tab 不会从模态框中跑出去):
```bash
pnpm add focus-trap @vueuse/integrations
```
```ts
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef)
watch(isOpen, (v) => v ? activate() : deactivate())
```

### 2-4. 色彩对比度检查

色彩对比度的数值标准以 [accessibility-wcag](../../design/accessibility-wcag/SKILL.md) §2-4 为单一来源。在定义 [design-system](../design-system/SKILL.md) 令牌时按该标准检查。验证工具参见 §2-7。

### 2-5. 动态内容通知 (Live Region)

```vue
<template>
  <!-- 永久容器。只替换消息 → 屏幕阅读器自动朗读 -->
  <div role="status" aria-live="polite" class="sr-only">
    {{ liveMessage }}
  </div>
</template>

<script setup lang="ts">
const liveMessage = ref('')
function showSavedNotice() {
  liveMessage.value = '저장되었습니다.'
  setTimeout(() => (liveMessage.value = ''), 3000)
}
</script>
```

### 2-6. Reduced Motion

```scss
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

使用 GSAP 时:
```ts
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  ScrollTrigger.disable()
}
```

### 2-7. 自动验证 + 手动验证

| 类型 | 工具 |
|------|------|
| 自动 (CI) | `axe-core`, `@axe-core/playwright` (结合到 E2E) |
| 自动 (本地) | Chrome Lighthouse, axe DevTools 扩展 |
| 手动 (必须) | 仅用键盘通过核心流程，用 NVDA(Windows) 或 VoiceOver(Mac) 朗读一个屏幕 |

Playwright 集成:
```ts
import AxeBuilder from '@axe-core/playwright'

test('대시보드 접근성 위반 없음', async ({ page }) => {
  await page.goto('/dashboard')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

## 3. 技术栈特有的错误

> 一般性错误(移除焦点 outline、图标按钮名称缺失、跳过标题层级、仅靠颜色传递信息)参见 `accessibility-wcag` §3。

- ❌ 只使用 `<div @click>` → 键盘用户无法触发。使用 `<button>` 或 `v-btn`
- ❌ 仅用 Placeholder 代替标签 → 开始输入后消失，用户会忘记那是什么
- ❌ 自动播放的视频/幻灯片 (无用户控制)
- ❌ 模态框打开时背景仍接收焦点 (缺少焦点陷阱)
- ❌ 显示动态通知却没有 `aria-live` → 视觉用户看得到但屏幕阅读器听不到

## 4. 检查清单 (发布前，技术栈实现视角)

> 键盘操作、焦点显示、色彩对比度、alt、`lang` 等通用项目请一并查看 `accessibility-wcag` §4 检查清单。

- [ ] 布局是否由 `<header>/<nav>/<main>/<footer>` 地标构成？
- [ ] 表单输入是否通过 `<label for>` 或 `aria-labelledby` 关联了标签？
- [ ] 是否对模态框应用了焦点陷阱(`useFocusTrap`)和 Esc 关闭？
- [ ] 是否通过 `aria-live` 区域告知动态内容的更新？
- [ ] 是否对 `prefers-reduced-motion: reduce` 用户禁用了大型动画？
- [ ] 是否同时执行了 axe/Playwright 自动验证和键盘、屏幕阅读器手动验证？
