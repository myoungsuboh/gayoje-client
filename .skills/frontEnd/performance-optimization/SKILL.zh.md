---
name: 性能优化 (Performance Optimization)
description: 涵盖测量优先、代码分割、渲染优化、打包预算与 Web Vitals 的前端性能优化通用标准，与具体框架/打包器无关。当页面缓慢或包体积变大时、需要检查/改进性能时、或制定性能基准(预算)时阅读。
rules:
  - "先测量，禁止猜测：优化前先测量。用数据确认哪里慢(打包构成·运行时分析·真实用户指标)，从最大的瓶颈入手。不要把时间花在感受不到的微优化上。"
  - "只在需要时加载需要的东西(代码分割·延迟加载)：把初始页面不需要的代码·库·资源从初始包中剥离，在实际使用时(进入路由·交互·进入视口)加载。"
  - "减少渲染量：减少在屏幕上绘制的工作 — 阻止不必要的重渲染，缓存重计算(记忆化)，大列表只绘制可见的部分(虚拟化)。"
  - "让数据·资源更轻：图片·字体等重资源用合适的格式·尺寸·延迟加载来减小。大型数据结构只按真正需要的程度追踪/观察。"
  - "制定并遵守性能预算：制定可测量的基准(预算)如『初始包 ≤ N KB』、『LCP < 2.5s』，发生回退时在构建/评审中拦截。"
  - "用用户体感指标验证：不要只看合成分数，用 Web Vitals(LCP·INP·CLS)等真实用户体感指标确认结果。"
tags:
  - "defineAsyncComponent"
  - "lazy"
  - "dynamic import"
  - "Suspense"
  - "virtual-scroller"
  - "memo"
---

# ⚡ 性能优化 (Performance Optimization)

> 用测量而非猜测找出瓶颈，只在需要时发送需要的代码，减少渲染与数据量，从而把加载·运行时性能标准化。当页面缓慢或需要减小包体积时、需要检查/改进性能时、或制定性能预算时阅读。这是不依赖具体框架/打包器的通用标准。

## 1. 核心原则
- **先测量，禁止猜测**：优化前先测量。用数据确认哪里慢(打包构成·运行时分析·真实用户指标)，从最大的瓶颈入手。不要把时间花在感受不到的微优化上。
- **只在需要时加载需要的东西(代码分割·延迟加载)**：把初始页面不需要的代码·库·资源从初始包中剥离，在实际使用时(进入路由·交互·进入视口)加载。
- **减少渲染量**：减少在屏幕上绘制的工作 — 阻止不必要的重渲染，缓存重计算(记忆化)，大列表只绘制可见的部分(虚拟化)。
- **让数据·资源更轻**：图片·字体等重资源用合适的格式·尺寸·延迟加载来减小。大型数据结构只按真正需要的程度追踪/观察。
- **制定并遵守性能预算**："初始包 ≤ N KB"、"LCP < 2.5s" 这类可测量的基准(预算)要制定，发生回退时在构建/评审中拦截。
- **用用户体感指标验证**：不要只看合成分数，用 Web Vitals(LCP·INP·CLS)等真实用户体感指标确认结果。

## 2. 规则

### 2-1. 先测量(打包·运行时·真实用户)
- 用**数据**确定优化对象：① 打包分析(什么把包撑大)，② 运行时分析(哪些操作慢)，③ 真实用户指标(哪些页面实际慢)。
- 不要凭印象或猜测动手。改动后也用相同指标确认改进。

```text
// ❌ 禁止 — 不测量就随意优化"感觉会慢"的地方
optimize(guessedHotPath)

// ✅ 推荐 — 测量 → 最大的瓶颈 → 修复 → 再测量
profile() → pick(biggestBottleneck) → fix() → profile()  // 确认改进
```

### 2-2. 代码分割(按进入单位分割)
- 按页面/路由单位拆分代码，只下发初始进入所需的部分。
- 不要把所有页面作为一整块静态加载。在路由(或页面切换)边界用动态加载分离。

```text
// ❌ 禁止 — 把所有页面静态包含进初始包
route '/'       -> staticImport(Home)
route '/report' -> staticImport(Report)   // 第一个页面把 Report 也全部接收

// ✅ 推荐 — 按路由分离(动态)加载
route '/'       -> lazy(() => load(Home))
route '/report' -> lazy(() => load(Report))  // 进入时才加载
```

### 2-3. 延迟加载(重组件·库·资源)
- 第一个页面当下不需要的重组件·库·小部件，在**使用时**(交互·进入视口)加载。
- 尤其是图表·编辑器·文档转换器·地图这类大依赖，不要放进初始包，在调用前动态加载。

```text
// ❌ 禁止 — 在模块顶部立即加载重库
import Chart from 'heavy-chart'   // 不显示图表的页面也付出代价

// ✅ 推荐 — 在实际使用时动态加载
async function showChart() {
  const { Chart } = await load('heavy-chart')  // 仅在点击/显示时
  render(Chart)
}
```

### 2-4. 渲染优化(阻止不必要的重渲染)
- 不要让不变的部分在每次数据变化时重绘 — 恰当划分组件边界，值不变就跳过渲染。
- 把"观察(响应式)范围"保持得窄：只追踪影响页面的状态，把重的静态数据排除在追踪之外。

```text
// ❌ 禁止 — 父级一处变化就连无关的子级也全部重渲染
render(wholeTree on anyStateChange)

// ✅ 推荐 — 输入相同就跳过渲染，只更新受影响范围
memoizeRender(child, keys=[item.id, item.status])  // 键相同 → 跳过
```

### 2-5. 记忆化(缓存重计算)
- 对输入相同结果就相同的**纯·高成本计算**进行缓存，避免每次渲染都重新计算。
- 但记忆化也有成本(内存·比较)。不要无差别地连廉价计算都包起来 — 只在测量显示有效的地方使用。

```text
// ❌ 禁止 — 每次渲染都对大列表重新排序/过滤
view() { return sortFilter(bigList) }   // 每次渲染都重算

// ✅ 推荐 — 仅在输入变化时重算(缓存)
memoized = memo(() => sortFilter(bigList), deps=[bigList, query])
```

### 2-6. 大量列表虚拟化
- 几百到几千行以上不要一次全部渲染，只绘制**可见区域 + 少量缓冲**(虚拟滚动/窗口化)。
- 分页·无限滚动也是替代方案。禁止"全部绘制后用 CSS 隐藏"。

```text
// ❌ 禁止 — 把 1 万行全部渲染进 DOM
list.forEach(row => render(row))   // 初始渲染·内存爆炸

// ✅ 推荐 — 只渲染可见部分(虚拟化)
virtualize(list, itemHeight, viewportHeight)  // 仅进入屏幕的行
```

### 2-7. 图片·资源优化
- 图片优先用**新一代格式**(WebP/AVIF)，旧格式做 fallback。视口外的图片**延迟加载**，用响应式尺寸(`srcset`/`sizes`)防止过度下载。
- 为防止布局偏移(CLS)要**明确指定尺寸(width/height 或 aspect-ratio)**。字体在加载中也要让文本可见(`font-display: swap`)。
- 详细的图片处理规则参见 `image-optimization` 技能，字体/排版一并参考相应技能。

```text
// ❌ 禁止 — 原始大图，未指定尺寸，全部立即加载
<img src="hero-4000px.png">       // 布局跳动 + 过大传输

// ✅ 推荐 — 新一代格式 + 延迟 + 明确尺寸 + 响应式
<picture>
  <source type="image/avif" srcset="hero.avif">
  <img src="hero.jpg" loading="lazy" width=... height=... srcset="...">
</picture>
```

### 2-8. 输入频率控制(防抖/节流)
- 像搜索输入·滚动·调整大小这类**高频事件**上挂的昂贵操作，用防抖(最后一次)·节流(周期一次)减少调用次数。
- 不要在每次按键时触发网络调用/重计算。

```text
// ❌ 禁止 — 每次按键立即发搜索请求
onInput(q => fetchResults(q))     // 打字暴增 = 请求暴增

// ✅ 推荐 — 输入停止后只执行一次(防抖)
onInput(debounce(q => fetchResults(q), 300))
onScroll(throttle(() => updatePosition(), 100))
```

### 2-9. 打包预算 & 生产构建卫生
- 制定可测量的**打包预算**(初始进入包大小上限等)，发生回退时在构建/评审中拦截。
- 在生产构建中应用**移除开发专用代码**(console/debugger)、压缩/minify、分块、source map 策略。
- 不要把互不相关的大依赖捆进同一个 chunk — 只需要其中一个的页面会两个都接收。

```text
// ❌ 禁止 — 无预算、prod 含调试代码、巨大单一包
build(noMinify, keep(console), oneBigChunk)

// ✅ 推荐 — 预算 + 压缩 + 移除调试 + 合理分块
build(minify, drop(['console','debugger']), splitVendorChunks)
assert(initialBundle <= BUDGET)   // 回退时构建失败
```

### 2-10. Web Vitals(用户体感指标)
- 不要只看合成分数，用真实用户体感指标验证：**LCP < 2.5s**(主要内容显示)、**INP < 200ms**(交互响应)、**CLS < 0.1**(布局稳定)。
- LCP：优先加载(preload)核心内容(主图等)并减小初始 chunk。INP：拆分长任务，不阻塞主线程。CLS：预留资源尺寸(图片尺寸·字体策略)。
- 测量·采集方法参见 `web-vitals` 技能。

```text
// ✅ 推荐 — 优先加载核心内容，拆分长任务
preload(criticalAsset)                 // 改进 LCP
splitLongTask(heavyHandler) -> yield   // 改进 INP(让出主线程)
reserveSize(image, font)               // 改进 CLS
```

## 3. 常见错误
- **不测量就优化** → 修了感受不到的地方，真正的瓶颈原样不动。始终测量 → 修复 → 再测量。
- **所有页面静态加载** → 第一次进入就接收整个应用。按路由/页面单位代码分割。
- **把重库放进初始包** → 不使用的页面也付出代价。使用时延迟加载。
- **深度追踪/观察整个大数据** → 不必要的响应式导致渲染·内存激增。收窄追踪范围。
- **滥用或遗漏记忆化** → 连廉价计算都包起来制造开销，或昂贵计算每次重算。用测量判断。
- **全量渲染大列表** → 初始渲染·滚动卡顿。虚拟化/分页。
- **未指定图片尺寸** → 加载中布局跳动(CLS)。预留尺寸。
- **对高频事件毫无防护** → 每次输入/滚动请求·重算暴增。防抖/节流。
- **生产含调试代码/巨大单一包** → 体积与信息暴露。移除 console/debugger，分块，强制预算。

## 4. 检查清单
- [ ] 优化前后是否**测量**了(打包分析·运行时分析·真实用户指标)
- [ ] 是否按页面/路由单位做了**代码分割**
- [ ] 重组件·库是否在**使用时延迟加载**
- [ ] 是否阻止了不必要的重渲染并收窄了响应式/追踪范围
- [ ] 是否对昂贵的纯计算做了**记忆化**(不滥用)
- [ ] 是否对大量列表应用了**虚拟化**(或分页)
- [ ] 是否对图片应用了新一代格式·延迟加载·**明确尺寸**(参见 `image-optimization`)
- [ ] 是否对高频事件应用了**防抖/节流**
- [ ] 是否制定了**打包预算**，并在生产构建中应用了移除调试·分块
- [ ] 是否满足 **LCP < 2.5s / INP < 200ms / CLS < 0.1** 的基准(参见 `web-vitals`)

## 附录：按技术栈的示例

> 以下是供参考的实现示例。请按相同模式补充适合团队所用技术栈(如 React, Svelte, Angular, Next.js, Nuxt 等)的示例。上述 1~4 的原则·规则是标准，附录只是其应用案例。

### Vue 3 + Vite

> 这是用 Vue 3 响应式 API(`shallowRef`·`markRaw`·`v-memo`·`defineAsyncComponent`)·Vite 构建选项·Vuetify 虚拟滚动·VueUse 实现正文 1~4 原则·规则的**代码示例**。各项的"为什么"参见正文同编号的规则(代码分割·渲染优化等)。

#### 路由代码分割(正文 2-2)
```javascript
// src/router/index.js — 用动态 import 代替静态 import 按路由分离 chunk
const routes = [
  { path: '/', component: () => import('@/views/Home.vue') },
  { path: '/report', component: () => import('@/views/Report.vue') }
]
```

#### 延迟加载：`defineAsyncComponent`(正文 2-3)
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

#### 大型库的动态 import(正文 2-3)
```javascript
// chart.js, mermaid, xlsx 等重库在使用时加载
const showChart = async () => {
  const { Chart } = await import('chart.js/auto')
  new Chart(ctx, config)
}
```

#### 打包分析(正文 2-1)
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

#### 图片优化(正文 2-7，参见 `image-optimization`)
```vue
<picture>
  <source type="image/avif" srcset="/img/hero.avif" />
  <source type="image/webp" srcset="/img/hero.webp" />
  <img src="/img/hero.jpg" loading="lazy" decoding="async"
       srcset="/img/hero-480.jpg 480w, /img/hero-960.jpg 960w"
       sizes="(max-width: 600px) 480px, 960px" alt="" />
</picture>
```

#### 虚拟滚动(正文 2-6)
```vue
<!-- 1000+ 行的表格使用 VVirtualScroll 或 VDataTableVirtual -->
<template>
  <VVirtualScroll :items="rows" :item-height="48" height="400">
    <template #default="{ item }">
      <VListItem :title="item.name" />
    </template>
  </VVirtualScroll>
</template>
```

#### 记忆化(正文 2-5)
```vue
<template>
  <!-- 不会变化的静态内容 -->
  <div v-memo="[item.id, item.status]">
    <ExpensiveCell :item="item" />
  </div>
</template>

<script setup>
import { computed, shallowRef } from 'vue'

const filtered = computed(() => list.value.filter(x => x.active))
const bigTree = shallowRef(initialTree) // 不需要深层响应式
</script>
```

#### 最小化响应式范围(正文 2-4 — Vue 专用)
```javascript
import { reactive, shallowReactive, markRaw } from 'vue'

// BAD: 用 deep reactive 包裹大对象/数组(例如 10MB JSON tree)
const state = reactive({ hugeTree })

// GOOD: 用 shallowReactive + markRaw 缩小追踪范围
const state = shallowReactive({ hugeTree: markRaw(hugeTree) })
```

#### 防抖/节流(正文 2-8)
```javascript
import { useDebounceFn, useThrottleFn } from '@vueuse/core'

const onSearch = useDebounceFn((q) => fetchResults(q), 300)
const onScroll = useThrottleFn(() => updatePosition(), 100)
```

#### Web Vitals(正文 2-10，参见 `web-vitals`)
```html
<!-- LCP: preload 核心图片 / INP: 用 scheduler.yield 拆分大处理器 / CLS: 明确图片尺寸 -->
<link rel="preload" as="image" href="/img/hero.avif" type="image/avif" />
```

#### Production 构建选项(正文 2-9)
```javascript
// vite.config.js
export default {
  build: {
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false, // 用于 Sentry 时为 'hidden'
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
