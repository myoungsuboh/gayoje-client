---
name: 虚拟滚动 & 无限滚动 (Virtual / Infinite Scroll)
description: 用于大量列表渲染性能的虚拟化与无限滚动实现标准。在渲染 1000 个以上的列表或添加无限滚动时阅读。关键词: virtual scroll, virtualization, infinite scroll, IntersectionObserver, vue-virtual-scroller, TanStack Virtual。
rules:
  - "1000 个以上的行必须应用虚拟滚动(Virtual Scroll)。"
  - "优先使用经过验证的库(vue-virtual-scroller·TanStack Virtual)而非自行实现。"
  - "为虚拟滚动容器设置固定 height，并准确传递条目的预估高度。"
  - "无限滚动使用 IntersectionObserver 监视而非滚动事件，并显示加载、错误、空状态。"
  - "无障碍: 提供 aria-live 或分页的替代方案。"
tags:
  - "virtual scroll"
  - "virtualization"
  - "infinite scroll"
  - "IntersectionObserver"
  - "vue-virtual-scroller"
  - "TanStack Virtual"
  - "virtual-scroll"
  - "infinite-scroll"
  - "tanstack-virtual"
  - "performance"
---

# 📜 虚拟滚动 & 无限滚动

> 将虚拟化、无限滚动标准化，以便流畅地渲染大量列表。在渲染长列表时阅读。

## 1. 核心原则
- 1000 个以上的行必须应用虚拟滚动(Virtual Scroll)。
- 优先使用经过验证的库(vue-virtual-scroller·TanStack Virtual)而非自行实现。
- 为虚拟滚动容器设置固定 height，并准确传递条目的预估高度。
- 无限滚动使用 IntersectionObserver 监视而非滚动事件，并显示加载、错误、空状态。
- 无障碍: 提供 aria-live 或分页的替代方案。

## 2. 规则

### 2-1. 策略选择
| 条目数 | 策略 |
|---|---|
| < 100 | 普通渲染 |
| 100~1000 | 分页 |
| 1000+ | 虚拟滚动 |

### 2-2. 虚拟滚动 (vue-virtual-scroller)
```vue
<template>
  <RecycleScroller class="scroller" :items="items" :item-size="48" key-field="id">
    <template #default="{ item }"><ListItem :data="item" /></template>
  </RecycleScroller>
</template>
<style scoped>.scroller { height: 600px; overflow-y: auto; }</style>
```
- 可变高度使用 `DynamicScroller`(vue)或 `measureElement`(TanStack Virtual)处理。

### 2-3. 无限滚动 (IntersectionObserver)
```js
// ❌ 금지 — scroll 이벤트로 매 프레임 위치 계산
// ✅ 권장 — sentinel 요소를 감시
const sentinel = ref(null)
onMounted(() => {
  const observer = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !loading.value) loadMore()
  })
  observer.observe(sentinel.value)
  onUnmounted(() => observer.disconnect())
})
```

## 3. 常见错误
- 未指定容器 height → 虚拟化不生效。
- 条目高度不准确 → 滚动跳动。
- 直接处理 scroll 事件 → 性能下降(使用 IntersectionObserver)。
- 不显示加载/空状态 → 无法得知是否已到达末尾。

## 4. 检查清单
- [ ] 是否对 1000 个以上应用了虚拟滚动
- [ ] 是否准确指定了容器 height·条目高度
- [ ] 是否用 IntersectionObserver 实现了无限滚动
- [ ] 是否显示加载、错误、空状态
- [ ] 是否提供 aria-live 或分页的替代方案
