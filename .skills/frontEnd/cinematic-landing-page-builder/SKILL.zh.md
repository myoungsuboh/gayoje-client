---
name: 电影感落地页构建器 (Vue 3 + Vuetify)
description: 基于 Vue 3 + Vuetify 3 + GSAP/Motion 构建高质量电影感落地页时阅读。涵盖基于预设的设计令牌、滚动动画、响应式、无障碍标准。关键词 landing, GSAP, ScrollTrigger, 预设, 玻璃拟态。
rules:
  - "主技术栈为 Vue 3 + Vuetify 3 + Vite + Pinia (禁止使用 React/JSX)"
  - "设计基于4种预设(设计令牌集合)进行构成。"
  - "动画使用 GSAP ScrollTrigger，但在路由跳转时务必用 kill() 清理。"
  - "尊重 prefers-reduced-motion，并将所有文案用 i18n 键管理。"
  - "设计令牌注册为变量，不在组件中直接写入 raw hex。"
tags:
  - "framer-motion"
  - "gsap"
  - "scroll-trigger"
  - "intersection-observer"
  - "lottie"
---

# 🎬 电影感落地页构建器 (Vue 3)

> 当用户请求制作落地页时，为了基于预设立即构建高质量的电影感落地页而阅读。

**技术栈澄清**: 本项目的主技术栈是 **Vue 3 + Vuetify 3 + Vite + Pinia**。过去此文件中曾有 React 代码，但那是错误内容，因此已按 Vue 为基准更正。与其他 frontEnd 技能为同一技术栈。

相关技能:
- 设计令牌 / 玻璃拟态: [design-system](../design-system/SKILL.md)
- 响应式断点: [responsive-styling](../responsive-styling/SKILL.md)
- 性能(LCP, lazy, 图片优化): [performance-optimization](../performance-optimization/SKILL.md)
- 无障碍: [accessibility-a11y](../accessibility-a11y/SKILL.md)
- 多语言: [i18n-internationalization](../i18n-internationalization/SKILL.md)

## 1. 核心原则
- 主技术栈为 Vue 3 + Vuetify 3 + Vite + Pinia (禁止使用 React/JSX)
- 设计基于4种预设(设计令牌集合)进行构成。
- 动画使用 GSAP ScrollTrigger，但在路由跳转时务必用 `kill()` 清理。
- 尊重 `prefers-reduced-motion`，并将所有文案用 i18n 键管理。
- 设计令牌注册为变量，不在组件中直接写入 raw hex。

## 2. 规则

### 2-1. 角色与工作流程
当用户请求制作落地页时，将以下4项**一次性**询问，然后仅凭其回答立即构建整体结构。禁止闲聊和重复提问。

```
1) 品牌名与一行说明
2) 从以下4种预设中选择1个 (Organic Tech / Midnight Luxe / Brutalist Signal / Vapor Clinic)
3) 三项核心价值主张
4) 主 CTA (Call To Action — 访客应采取的行动)
```

### 2-2. 预设 (4种)
每个预设都是一组设计令牌。注册为 `src/styles/landing-presets.scss` 或 [design-system](../design-system/SKILL.md) 的 themeConfig 中的变量。

**Preset A — "Organic Tech" (Clinical Boutique)**
- **调色板**: Moss `#2E4036`, Clay `#CC5833`, Cream `#F2F0E9`, Charcoal `#1A1A1A`
- **字体**: `Plus Jakarta Sans` (正文) + `Cormorant Garamond Italic` (斜体强调) + `IBM Plex Mono` (代码/数字)

**Preset B — "Midnight Luxe" (Dark Editorial)**
- **调色板**: Obsidian `#0D0D12`, Champagne `#C9A84C`, Ivory `#FAF8F5`, Slate `#2A2A35`
- **字体**: `Inter` + `Playfair Display Italic` + `JetBrains Mono`

**Preset C — "Brutalist Signal" (Raw Precision)**
- **调色板**: Paper `#E8E4DD`, Signal Red `#E63B2E`, Off-white `#F5F3EE`, Black `#111111`
- **字体**: `Space Grotesk` + `DM Serif Display Italic` + `Space Mono`

**Preset D — "Vapor Clinic" (Neon Biotech)**
- **调色板**: Deep Void `#0A0A14`, Plasma `#7B61FF`, Ghost `#F0EFF4`, Graphite `#18181B`
- **字体**: `Sora` + `Instrument Serif Italic` + `Fira Code`

### 2-3. 技术栈

| 领域 | 库 |
|------|-----------|
| 框架 | Vue 3 (Composition API + `<script setup>`) |
| UI | Vuetify 3 (自定义玻璃拟态 — 参见 design-system) |
| 构建 | Vite 5 |
| 路由 | vue-router 4 |
| 动画 | GSAP 3 + ScrollTrigger (或 `@vueuse/motion`) |
| 图标 | `@mdi/font` (Vuetify 默认) 或 lucide-vue-next |
| 图片 | Unsplash 真实 URL (`https://images.unsplash.com/...`) — 匹配预设的氛围 |

### 2-4. 目录结构

```
src/views/landing/
├── LandingView.vue              # 路由入口点
├── sections/
│   ├── HeroSection.vue          # 主视觉 + 滚动固定/淡入
│   ├── ValuePropsSection.vue    # 3个价值主张卡片
│   ├── ShowcaseSection.vue      # 交互式演示/滚动擦除
│   ├── TestimonialsSection.vue
│   └── CtaSection.vue           # 最终 CTA
├── composables/
│   ├── useScrollAnimation.ts    # GSAP ScrollTrigger 封装
│   └── useParallax.ts
└── styles/
    └── landing-tokens.scss      # 预设变量
```

### 2-5. GSAP ScrollTrigger Composable (可复用)

```vue
<!-- src/views/landing/composables/useScrollAnimation.ts -->
<script lang="ts">
import { onMounted, onBeforeUnmount, type Ref } from 'vue'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function useFadeInUp(target: Ref<HTMLElement | null>, options = {}) {
  let trigger: ScrollTrigger | null = null

  onMounted(() => {
    if (!target.value) return
    trigger = ScrollTrigger.create({
      trigger: target.value,
      start: 'top 80%',
      onEnter: () => gsap.fromTo(target.value,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }
      ),
      once: true,
      ...options
    })
  })

  onBeforeUnmount(() => { trigger?.kill() })
}
</script>
```

使用:
```vue
<!-- HeroSection.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useFadeInUp } from '../composables/useScrollAnimation'

const headlineRef = ref<HTMLElement | null>(null)
useFadeInUp(headlineRef)
</script>

<template>
  <section class="hero">
    <h1 ref="headlineRef">{{ brandTagline }}</h1>
  </section>
</template>
```

> ⚠️ `ScrollTrigger` 在路由跳转时务必 `kill()`。否则会在 SPA 中造成内存泄漏。

### 2-6. 响应式 / 无障碍 / 性能
- ✅ 移动优先 (活用 Vuetify breakpoint `xs/sm/md/lg/xl` — [responsive-styling](../responsive-styling/SKILL.md))
- ✅ 大型主视觉图片使用 WebP/AVIF + `srcset` + `loading="lazy"` ([performance-optimization](../performance-optimization/SKILL.md))
- ✅ 当用户为 `prefers-reduced-motion: reduce` 时禁用动画:
  ```ts
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) ScrollTrigger.disable()
  ```
- ✅ 所有交互元素都有键盘焦点显示 + `aria-label` ([accessibility-a11y](../accessibility-a11y/SKILL.md))
- ✅ 所有文案使用 i18n 键 ([i18n-internationalization](../i18n-internationalization/SKILL.md)) — 禁止韩语硬编码

## 3. 常见错误
- ❌ 使用 React 组件/JSX (与项目技术栈不一致)
- ❌ 将 GSAP 作为全局实例，路由跳转时遗漏 cleanup
- ❌ 忽视 `prefers-reduced-motion` → 眩晕、违反无障碍
- ❌ 直接加载主视觉图片原图(5MB+) → LCP(Largest Contentful Paint) 爆炸
- ❌ 将文案用韩语硬编码 → 无法切换多语言
- ❌ 将设计令牌在每个组件中以 raw hex 直写 → 更改预设时需修改所有文件

## 4. 检查清单
- [ ] 是否在开始工作前将4项(品牌名/预设/3个价值主张/CTA)一次性询问？
- [ ] 是否将4种预设之一的设计令牌注册为变量？
- [ ] 是否仅使用 Vue 3 + Vuetify 3 技术栈 (禁止 React/JSX)？
- [ ] 是否在路由跳转时用 `kill()` 清理 GSAP ScrollTrigger？
- [ ] 是否在 `prefers-reduced-motion: reduce` 时禁用动画？
- [ ] 是否用 WebP/AVIF + `srcset` + `loading="lazy"` 优化主视觉图片？
- [ ] 是否将所有文案用 i18n 键管理并移除韩语硬编码？
