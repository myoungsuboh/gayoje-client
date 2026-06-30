---
name: Performance Optimization (Performance Optimization)
description: A framework-/bundler-agnostic, general-purpose standard for front-end performance optimization covering measure-first, code splitting, render optimization, bundle budgets, and Web Vitals. Read it when a screen is slow or the bundle grows large, when auditing/improving performance, or when setting performance criteria (budgets).
rules:
  - "Measure first, don't guess: measure before optimizing. Confirm with data where it is slow (bundle composition, runtime profile, real-user metrics), and tackle the biggest bottleneck first. Don't spend time on micro-optimizations no one feels."
  - "Only what's needed, when it's needed (code splitting, lazy loading): pull code, libraries, and resources not needed for the initial screen out of the initial bundle, and load them at actual use time (route entry, interaction, viewport entry)."
  - "Reduce the amount of rendering: do less drawing on screen — prevent unnecessary re-renders, cache heavy computations (memoization), and draw large lists only as far as they are visible (virtualization)."
  - "Keep data and resources light: reduce heavy resources like images and fonts with appropriate formats, sizes, and lazy loading. Track/observe large data structures only as much as truly needed."
  - "Set a performance budget and keep it: define measurable criteria (budgets) like 'initial bundle ≤ N KB' or 'LCP < 2.5s', and block regressions at build/review."
  - "Verify with user-perceived metrics: don't look only at synthetic scores; confirm results with real user-perceived metrics like Web Vitals (LCP, INP, CLS)."
tags:
  - "defineAsyncComponent"
  - "lazy"
  - "dynamic import"
  - "Suspense"
  - "virtual-scroller"
  - "memo"
---

# ⚡ Performance Optimization (Performance Optimization)

> Find bottlenecks by measurement rather than guessing, ship only the needed code at the needed time, and reduce render and data volume to standardize loading and runtime performance. Read it when a screen is slow or you need to shrink the bundle, when auditing/improving performance, or when setting a performance budget. It is a general-purpose standard not tied to a specific framework/bundler.

## 1. Core Principles
- **Measure first, don't guess**: measure before optimizing. Confirm with data where it is slow (bundle composition, runtime profile, real-user metrics), and tackle the biggest bottleneck first. Don't spend time on micro-optimizations no one feels.
- **Only what's needed, when it's needed (code splitting, lazy loading)**: pull code, libraries, and resources not needed for the initial screen out of the initial bundle, and load them at actual use time (route entry, interaction, viewport entry).
- **Reduce the amount of rendering**: do less drawing on screen — prevent unnecessary re-renders, cache heavy computations (memoization), and draw large lists only as far as they are visible (virtualization).
- **Keep data and resources light**: reduce heavy resources like images and fonts with appropriate formats, sizes, and lazy loading. Track/observe large data structures only as much as truly needed.
- **Set a performance budget and keep it**: define measurable criteria (budgets) like "initial bundle ≤ N KB" or "LCP < 2.5s", and block regressions at build/review.
- **Verify with user-perceived metrics**: don't look only at synthetic scores; confirm results with real user-perceived metrics like Web Vitals (LCP, INP, CLS).

## 2. Rules

### 2-1. Measure first (bundle, runtime, real users)
- Decide the optimization target **with data**: ① bundle analysis (what bloats the bundle), ② runtime profile (which tasks are slow), ③ real-user metrics (which screens are actually slow).
- Don't act on impressions or guesses. After a change, confirm improvement with the same metrics.

```text
// ❌ Forbidden — arbitrarily optimizing a spot you "feel" without measuring
optimize(guessedHotPath)

// ✅ Recommended — measure → biggest bottleneck → fix → re-measure
profile() → pick(biggestBottleneck) → fix() → profile()  // confirm improvement
```

### 2-2. Code splitting (split by entry unit)
- Split code by screen/route, and send down only as much as the initial entry needs.
- Don't statically load every screen as one chunk. Separate with dynamic loading at route (or screen-transition) boundaries.

```text
// ❌ Forbidden — statically include every screen in the initial bundle
route '/'       -> staticImport(Home)
route '/report' -> staticImport(Report)   // the first screen receives even Report

// ✅ Recommended — split (dynamic) loading per route
route '/'       -> lazy(() => load(Home))
route '/report' -> lazy(() => load(Report))  // load only on entry
```

### 2-3. Lazy loading (heavy components, libraries, resources)
- Load heavy components, libraries, and widgets not immediately needed on the first screen at **use time** (interaction, viewport entry).
- In particular, don't put large dependencies like charts, editors, document converters, and maps in the initial bundle; load them dynamically right before invocation.

```text
// ❌ Forbidden — load a heavy library immediately at the top of the module
import Chart from 'heavy-chart'   // even screens that don't show the chart pay the cost

// ✅ Recommended — dynamically load at actual use time
async function showChart() {
  const { Chart } = await load('heavy-chart')  // only when clicked/shown
  render(Chart)
}
```

### 2-4. Render optimization (block unnecessary re-renders)
- Make sure unchanging parts are not redrawn on every data change — split component boundaries appropriately, and skip rendering when the value is unchanged.
- Keep the "observation (reactivity) scope" narrow: track only state that affects the screen, and exclude heavy static data from tracking.

```text
// ❌ Forbidden — when one parent changes, even unrelated children all re-render
render(wholeTree on anyStateChange)

// ✅ Recommended — skip render if input is the same, update only the affected scope
memoizeRender(child, keys=[item.id, item.status])  // same keys → skip
```

### 2-5. Memoization (cache heavy computations)
- Cache **pure, expensive computations** that yield the same result for the same input, so they aren't recomputed on every render.
- However, memoization also has cost (memory, comparison). Don't indiscriminately wrap even cheap computations — only where measurement shows it helps.

```text
// ❌ Forbidden — re-sort/filter a big list on every render
view() { return sortFilter(bigList) }   // recompute every render

// ✅ Recommended — recompute only when input changes (cache)
memoized = memo(() => sortFilter(bigList), deps=[bigList, query])
```

### 2-6. Virtualizing large lists
- For hundreds to thousands of rows or more, don't render them all at once; draw **only the visible area + a small buffer** (virtual scroll/windowing).
- Pagination/infinite scroll are also alternatives. "Draw everything then hide with CSS" is forbidden.

```text
// ❌ Forbidden — render all 10,000 rows into the DOM
list.forEach(row => render(row))   // initial render/memory explosion

// ✅ Recommended — render only what's visible (virtualization)
virtualize(list, itemHeight, viewportHeight)  // only rows entering the screen
```

### 2-7. Image/resource optimization
- For images, prefer **next-gen formats** (WebP/AVIF) with a fallback to legacy formats. **Lazy-load** off-viewport images, and use responsive sizes (`srcset`/`sizes`) to prevent excessive downloads.
- To prevent layout shift (CLS), **specify size (width/height or aspect-ratio)**. For fonts, keep text visible during loading (`font-display: swap`).
- For detailed image-handling rules, see the `image-optimization` skill; for fonts/typography, reference the relevant skill as well.

```text
// ❌ Forbidden — original huge image, no size specified, all loaded immediately
<img src="hero-4000px.png">       // layout jump + oversized transfer

// ✅ Recommended — next-gen format + lazy + explicit size + responsive
<picture>
  <source type="image/avif" srcset="hero.avif">
  <img src="hero.jpg" loading="lazy" width=... height=... srcset="...">
</picture>
```

### 2-8. Input-frequency control (debounce/throttle)
- For expensive work attached to **high-frequency events** like search input, scroll, and resize, reduce call count with debounce (one final call) / throttle (one periodic call).
- Don't trigger a network call/heavy recomputation on every keystroke.

```text
// ❌ Forbidden — immediate search request on every keystroke
onInput(q => fetchResults(q))     // typing flood = request flood

// ✅ Recommended — only once when input stops (debounce)
onInput(debounce(q => fetchResults(q), 300))
onScroll(throttle(() => updatePosition(), 100))
```

### 2-9. Bundle budget & production build hygiene
- Set a measurable **bundle budget** (e.g., an upper limit on initial-entry bundle size), and block regressions at build/review.
- In the production build, apply **dev-only code removal** (console/debugger), compression/minify, chunk splitting, and a sourcemap policy.
- Don't bundle large, unrelated dependencies into one chunk — a screen that needs only one will receive both.

```text
// ❌ Forbidden — no budget, debug code in prod, one giant bundle
build(noMinify, keep(console), oneBigChunk)

// ✅ Recommended — budget + compression + debug removal + reasonable chunk splitting
build(minify, drop(['console','debugger']), splitVendorChunks)
assert(initialBundle <= BUDGET)   // build fails on regression
```

### 2-10. Web Vitals (user-perceived metrics)
- Don't look only at synthetic scores; verify with real user-perceived metrics: **LCP < 2.5s** (main content shown), **INP < 200ms** (interaction responsiveness), **CLS < 0.1** (layout stability).
- LCP: preload core content (main image, etc.) and reduce the initial chunk. INP: split long tasks so they don't block the main thread. CLS: reserve resource sizes (image sizes, font policy).
- For measurement/collection methods, see the `web-vitals` skill.

```text
// ✅ Recommended — preload core content, split long tasks
preload(criticalAsset)                 // improve LCP
splitLongTask(heavyHandler) -> yield   // improve INP (yield the main thread)
reserveSize(image, font)               // improve CLS
```

## 3. Common Mistakes
- **Optimizing without measuring** → fix a spot no one feels while the real bottleneck remains. Always measure → fix → re-measure.
- **Static loading of all screens** → the first entry receives the whole app. Code-split by route/screen.
- **Including heavy libraries in the initial bundle** → screens that don't use them pay the cost. Lazy-load at use time.
- **Deeply tracking/observing entire large data** → unnecessary reactivity explodes render/memory. Narrow the tracking scope.
- **Overusing or omitting memoization** → wrapping even cheap computations creates overhead, or expensive computations are recomputed every time. Decide by measurement.
- **Rendering large lists in full** → initial render/scroll stalls. Virtualization/pagination.
- **Not specifying image size** → layout jumps during loading (CLS). Reserve the size.
- **Unguarded high-frequency events** → request/recompute floods on every input/scroll. Debounce/throttle.
- **Debug code/giant single bundle in production** → size and information exposure. Remove console/debugger, split chunks, enforce a budget.

## 4. Checklist
- [ ] Did you **measure** before and after optimizing (bundle analysis, runtime profile, real-user metrics)?
- [ ] Did you **code-split** by screen/route?
- [ ] Are heavy components/libraries **lazy-loaded at use time**?
- [ ] Did you block unnecessary re-renders and narrow the reactivity/tracking scope?
- [ ] Did you **memoize** expensive pure computations (without overuse)?
- [ ] Did you apply **virtualization** (or pagination) to large lists?
- [ ] Did you apply next-gen formats, lazy loading, and **explicit sizing** to images (see `image-optimization`)?
- [ ] Did you apply **debounce/throttle** to high-frequency events?
- [ ] Did you set a **bundle budget** and apply debug removal/chunk splitting in the production build?
- [ ] Do you meet the **LCP < 2.5s / INP < 200ms / CLS < 0.1** criteria (see `web-vitals`)?

## Appendix: Per-stack Examples

> Below are reference implementation examples. Add examples that fit your team's stack (e.g., React, Svelte, Angular, Next.js, Nuxt) in the same pattern. The principles/rules in 1–4 above are the standard; the appendix is merely an application of them.

### Vue 3 + Vite

> These are **code examples** that implement the principles/rules in sections 1–4 using the Vue 3 reactivity API (`shallowRef`, `markRaw`, `v-memo`, `defineAsyncComponent`), Vite build options, Vuetify virtual scroll, and VueUse. For the "why" of each item, see the same-numbered rule in the main text (code splitting, render optimization, etc.).

#### Route code splitting (main text 2-2)
```javascript
// src/router/index.js — split chunks per route with dynamic import instead of static import
const routes = [
  { path: '/', component: () => import('@/views/Home.vue') },
  { path: '/report', component: () => import('@/views/Report.vue') }
]
```

#### Lazy loading: `defineAsyncComponent` (main text 2-3)
```vue
<script setup>
import { defineAsyncComponent } from 'vue'

const HeavyChart = defineAsyncComponent({
  loader: () => import('@/components/HeavyChart.vue'),
  delay: 200,
  timeout: 10000
})
</script>
```

#### Dynamic import of large libraries (main text 2-3)
```javascript
// Heavy libraries like chart.js, mermaid, xlsx are loaded at use time
const showChart = async () => {
  const { Chart } = await import('chart.js/auto')
  new Chart(ctx, config)
}
```

#### Bundle analysis (main text 2-1)
```bash
npm install -D rollup-plugin-visualizer
```

```javascript
// vite.config.js
import { visualizer } from 'rollup-plugin-visualizer'

export default {
  plugins: [
    visualizer({ open: true, gzipSize: true, brotliSize: true })
  ]
}
```

#### Image optimization (main text 2-7, see `image-optimization`)
```vue
<picture>
  <source type="image/avif" srcset="/img/hero.avif" />
  <source type="image/webp" srcset="/img/hero.webp" />
  <img src="/img/hero.jpg" loading="lazy" decoding="async"
       srcset="/img/hero-480.jpg 480w, /img/hero-960.jpg 960w"
       sizes="(max-width: 600px) 480px, 960px" alt="" />
</picture>
```

#### Virtual scroll (main text 2-6)
```vue
<!-- For 1000+ row tables use VVirtualScroll or VDataTableVirtual -->
<template>
  <VVirtualScroll :items="rows" :item-height="48" height="400">
    <template #default="{ item }">
      <VListItem :title="item.name" />
    </template>
  </VVirtualScroll>
</template>
```

#### Memoization (main text 2-5)
```vue
<template>
  <!-- Static content that won't change -->
  <div v-memo="[item.id, item.status]">
    <ExpensiveCell :item="item" />
  </div>
</template>

<script setup>
import { computed, shallowRef } from 'vue'

const filtered = computed(() => list.value.filter(x => x.active))
const bigTree = shallowRef(initialTree) // deep reactivity not needed
</script>
```

#### Minimizing reactivity scope (main text 2-4 — Vue-specific)
```javascript
import { reactive, shallowReactive, markRaw } from 'vue'

// BAD: wrap a large object/array in deep reactive (e.g., a 10MB JSON tree)
const state = reactive({ hugeTree })

// GOOD: narrow the tracking scope with shallowReactive + markRaw
const state = shallowReactive({ hugeTree: markRaw(hugeTree) })
```

#### Debounce/throttle (main text 2-8)
```javascript
import { useDebounceFn, useThrottleFn } from '@vueuse/core'

const onSearch = useDebounceFn((q) => fetchResults(q), 300)
const onScroll = useThrottleFn(() => updatePosition(), 100)
```

#### Web Vitals (main text 2-10, see `web-vitals`)
```html
<!-- LCP: preload core image / INP: split big handlers with scheduler.yield / CLS: specify image size -->
<link rel="preload" as="image" href="/img/hero.avif" type="image/avif" />
```

#### Production build options (main text 2-9)
```javascript
// vite.config.js
export default {
  build: {
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false, // use 'hidden' for Sentry
    rollupOptions: {
      output: {
        manualChunks: {
          vuetify: ['vuetify'],
          vendor: ['vue', 'vue-router', 'pinia']
        }
      }
    }
  },
  esbuild: {
    drop: ['console', 'debugger']
  }
}
```
