---
name: Virtual Scroll & Infinite Scroll (Virtual / Infinite Scroll)
description: Standard for virtualization and infinite-scroll implementation aimed at rendering large lists with good performance. Read it when rendering lists of 1000+ items or attaching infinite scroll. Keywords: virtual scroll, virtualization, infinite scroll, IntersectionObserver, vue-virtual-scroller, TanStack Virtual.
rules:
  - "Rows numbering 1000 or more must use Virtual Scroll."
  - "Prefer proven libraries (vue-virtual-scroller / TanStack Virtual) over hand-rolled implementations."
  - "Give the virtual scroll container a fixed height and pass an accurate estimated item height."
  - "Implement infinite scroll with IntersectionObserver instead of the scroll event, and show loading, error, and empty states."
  - "Accessibility: provide aria-live or a pagination alternative."
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

# 📜 Virtual Scroll & Infinite Scroll

> Standardizes virtualization and infinite scroll for rendering large lists smoothly. Read it when rendering long lists.

## 1. Core Principles
- Rows numbering 1000 or more must use Virtual Scroll.
- Prefer proven libraries (vue-virtual-scroller / TanStack Virtual) over hand-rolled implementations.
- Give the virtual scroll container a fixed height and pass an accurate estimated item height.
- Implement infinite scroll with IntersectionObserver instead of the scroll event, and show loading, error, and empty states.
- Accessibility: provide aria-live or a pagination alternative.

## 2. Rules

### 2-1. Strategy Selection
| Item Count | Strategy |
|---|---|
| < 100 | Normal rendering |
| 100~1000 | Pagination |
| 1000+ | Virtual scroll |

### 2-2. Virtual Scroll (vue-virtual-scroller)
```vue
<template>
  <RecycleScroller class="scroller" :items="items" :item-size="48" key-field="id">
    <template #default="{ item }"><ListItem :data="item" /></template>
  </RecycleScroller>
</template>
<style scoped>.scroller { height: 600px; overflow-y: auto; }</style>
```
- Handle variable heights with `DynamicScroller` (vue) or `measureElement` (TanStack Virtual).

### 2-3. Infinite Scroll (IntersectionObserver)
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

## 3. Common Mistakes
- Not specifying the container height → virtualization does not work.
- Inaccurate item height → scroll jumps.
- Handling the scroll event directly → degraded performance (use IntersectionObserver).
- Not showing loading/empty states → you cannot tell whether the end has been reached.

## 4. Checklist
- [ ] Did you apply virtual scroll for 1000+ items
- [ ] Did you accurately specify the container height and item height
- [ ] Did you implement infinite scroll with IntersectionObserver
- [ ] Do you show loading, error, and empty states
- [ ] Do you provide aria-live or a pagination alternative
