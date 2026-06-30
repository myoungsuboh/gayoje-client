---
name: Cinematic Landing Page Builder (Vue 3 + Vuetify)
description: Read this when building high-quality cinematic landing pages based on Vue 3 + Vuetify 3 + GSAP/Motion. Covers preset-based design tokens, scroll animations, responsiveness, and accessibility standards. Keywords landing, GSAP, ScrollTrigger, presets, glassmorphism.
rules:
  - "The main stack is Vue 3 + Vuetify 3 + Vite + Pinia (do not use React/JSX)"
  - "Build the design based on 4 presets (bundles of design tokens)."
  - "Use GSAP ScrollTrigger for animations, but always clean up with kill() on route changes."
  - "Respect prefers-reduced-motion, and manage all copy with i18n keys."
  - "Register design tokens as variables and do not hardcode raw hex into components."
tags:
  - "framer-motion"
  - "gsap"
  - "scroll-trigger"
  - "intersection-observer"
  - "lottie"
---

# 🎬 Cinematic Landing Page Builder (Vue 3)

> Read this when a user requests building a landing page, to immediately construct a high-quality cinematic landing page based on presets.

**Stack clarification**: The main stack of this project is **Vue 3 + Vuetify 3 + Vite + Pinia**. This file previously contained React code, but that was incorrect content, so it has been corrected to the Vue baseline. It is the same stack as the other frontEnd skills.

Related skills:
- Design tokens / glassmorphism: [design-system](../design-system/SKILL.md)
- Responsive breakpoints: [responsive-styling](../responsive-styling/SKILL.md)
- Performance (LCP, lazy, image optimization): [performance-optimization](../performance-optimization/SKILL.md)
- Accessibility: [accessibility-a11y](../accessibility-a11y/SKILL.md)
- Internationalization: [i18n-internationalization](../i18n-internationalization/SKILL.md)

## 1. Core Principles
- The main stack is Vue 3 + Vuetify 3 + Vite + Pinia (do not use React/JSX)
- Build the design based on 4 presets (bundles of design tokens).
- Use GSAP ScrollTrigger for animations, but always clean up with `kill()` on route changes.
- Respect `prefers-reduced-motion`, and manage all copy with i18n keys.
- Register design tokens as variables and do not hardcode raw hex into components.

## 2. Rules

### 2-1. Role and Workflow
When a user requests building a landing page, ask the following 4 things **all at once**, then immediately construct the entire structure from their answers alone. No chitchat or repeated questions.

```
1) Brand name and a one-line description
2) Choose 1 of the 4 presets below (Organic Tech / Midnight Luxe / Brutalist Signal / Vapor Clinic)
3) Three core value propositions
4) Main CTA (Call To Action — the action the visitor should take)
```

### 2-2. Presets (4 types)
Each preset is a bundle of design tokens. Register them as variables in `src/styles/landing-presets.scss` or in the themeConfig of [design-system](../design-system/SKILL.md).

**Preset A — "Organic Tech" (Clinical Boutique)**
- **Palette**: Moss `#2E4036`, Clay `#CC5833`, Cream `#F2F0E9`, Charcoal `#1A1A1A`
- **Fonts**: `Plus Jakarta Sans` (body) + `Cormorant Garamond Italic` (italic emphasis) + `IBM Plex Mono` (code/numbers)

**Preset B — "Midnight Luxe" (Dark Editorial)**
- **Palette**: Obsidian `#0D0D12`, Champagne `#C9A84C`, Ivory `#FAF8F5`, Slate `#2A2A35`
- **Fonts**: `Inter` + `Playfair Display Italic` + `JetBrains Mono`

**Preset C — "Brutalist Signal" (Raw Precision)**
- **Palette**: Paper `#E8E4DD`, Signal Red `#E63B2E`, Off-white `#F5F3EE`, Black `#111111`
- **Fonts**: `Space Grotesk` + `DM Serif Display Italic` + `Space Mono`

**Preset D — "Vapor Clinic" (Neon Biotech)**
- **Palette**: Deep Void `#0A0A14`, Plasma `#7B61FF`, Ghost `#F0EFF4`, Graphite `#18181B`
- **Fonts**: `Sora` + `Instrument Serif Italic` + `Fira Code`

### 2-3. Tech Stack

| Area | Library |
|------|-----------|
| Framework | Vue 3 (Composition API + `<script setup>`) |
| UI | Vuetify 3 (custom glassmorphism — see design-system) |
| Build | Vite 5 |
| Routing | vue-router 4 |
| Animation | GSAP 3 + ScrollTrigger (or `@vueuse/motion`) |
| Icons | `@mdi/font` (Vuetify default) or lucide-vue-next |
| Images | Real Unsplash URLs (`https://images.unsplash.com/...`) — matching the preset mood |

### 2-4. Directory Structure

```
src/views/landing/
├── LandingView.vue              # Route entry point
├── sections/
│   ├── HeroSection.vue          # Hero + scroll pin/fade
│   ├── ValuePropsSection.vue    # 3 value proposition cards
│   ├── ShowcaseSection.vue      # Interactive demo/scroll scrub
│   ├── TestimonialsSection.vue
│   └── CtaSection.vue           # Final CTA
├── composables/
│   ├── useScrollAnimation.ts    # GSAP ScrollTrigger wrapper
│   └── useParallax.ts
└── styles/
    └── landing-tokens.scss      # Preset variables
```

### 2-5. GSAP ScrollTrigger Composable (Reusable)

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

Usage:
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

> ⚠️ `ScrollTrigger` must always be `kill()`-ed on route changes. Otherwise it causes memory leaks in an SPA.

### 2-6. Responsiveness / Accessibility / Performance
- ✅ Mobile first (leverage Vuetify breakpoints `xs/sm/md/lg/xl` — [responsive-styling](../responsive-styling/SKILL.md))
- ✅ Large hero images use WebP/AVIF + `srcset` + `loading="lazy"` ([performance-optimization](../performance-optimization/SKILL.md))
- ✅ Disable animations when the user has `prefers-reduced-motion: reduce`:
  ```ts
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) ScrollTrigger.disable()
  ```
- ✅ Keyboard focus indication + `aria-label` on all interactive elements ([accessibility-a11y](../accessibility-a11y/SKILL.md))
- ✅ All copy via i18n keys ([i18n-internationalization](../i18n-internationalization/SKILL.md)) — no hardcoded Korean

## 3. Common Mistakes
- ❌ Using React components/JSX (mismatch with the project stack)
- ❌ Leaving GSAP as a global instance and missing cleanup on route changes
- ❌ Ignoring `prefers-reduced-motion` → motion sickness/accessibility violation
- ❌ Loading the original hero image (5MB+) as-is → LCP (Largest Contentful Paint) explosion
- ❌ Hardcoding copy in Korean → unable to switch languages
- ❌ Hardcoding design tokens as raw hex in every component → editing every file when changing presets

## 4. Checklist
- [ ] Did you ask the 4 things (brand name/preset/3 value props/CTA) all at once before starting?
- [ ] Did you register the design tokens of one of the 4 presets as variables?
- [ ] Did you use only the Vue 3 + Vuetify 3 stack (no React/JSX)?
- [ ] Did you clean up GSAP ScrollTrigger with `kill()` on route changes?
- [ ] Did you disable animations when `prefers-reduced-motion: reduce`?
- [ ] Did you optimize hero images with WebP/AVIF + `srcset` + `loading="lazy"`?
- [ ] Did you manage all copy with i18n keys and remove hardcoded Korean?
