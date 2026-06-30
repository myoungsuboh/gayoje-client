---
name: 가상 스크롤 & 무한 스크롤 (Virtual / Infinite Scroll)
description: 대량 리스트 렌더링 성능을 위한 가상화와 무한 스크롤 구현 표준. 1000개 이상 리스트를 그리거나 무한 스크롤을 붙일 때 읽는다. 키워드: virtual scroll, virtualization, infinite scroll, IntersectionObserver, vue-virtual-scroller, TanStack Virtual.
rules:
  - "1000개 이상의 행은 가상 스크롤(Virtual Scroll)을 필수 적용한다."
  - "직접 구현보다 검증된 라이브러리(vue-virtual-scroller·TanStack Virtual)를 우선 쓴다."
  - "가상 스크롤 컨테이너에 고정 height를 주고, 아이템 예상 높이를 정확히 전달한다."
  - "무한 스크롤은 스크롤 이벤트 대신 IntersectionObserver로 감시하고 로딩·오류·빈 상태를 표시한다."
  - "접근성: aria-live 또는 페이지네이션 대안을 제공한다."
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

# 📜 가상 스크롤 & 무한 스크롤

> 대량 리스트를 끊김 없이 렌더링하기 위한 가상화·무한 스크롤을 표준화한다. 긴 리스트를 그릴 때 읽는다.

## 1. 핵심 원칙
- 1000개 이상의 행은 가상 스크롤(Virtual Scroll)을 필수 적용한다.
- 직접 구현보다 검증된 라이브러리(vue-virtual-scroller·TanStack Virtual)를 우선 쓴다.
- 가상 스크롤 컨테이너에 고정 height를 주고, 아이템 예상 높이를 정확히 전달한다.
- 무한 스크롤은 스크롤 이벤트 대신 IntersectionObserver로 감시하고 로딩·오류·빈 상태를 표시한다.
- 접근성: aria-live 또는 페이지네이션 대안을 제공한다.

## 2. 규칙

### 2-1. 전략 선택
| 아이템 수 | 전략 |
|---|---|
| < 100 | 일반 렌더링 |
| 100~1000 | 페이지네이션 |
| 1000+ | 가상 스크롤 |

### 2-2. 가상 스크롤 (vue-virtual-scroller)
```vue
<template>
  <RecycleScroller class="scroller" :items="items" :item-size="48" key-field="id">
    <template #default="{ item }"><ListItem :data="item" /></template>
  </RecycleScroller>
</template>
<style scoped>.scroller { height: 600px; overflow-y: auto; }</style>
```
- 가변 높이는 `DynamicScroller`(vue) 또는 `measureElement`(TanStack Virtual)로 처리한다.

### 2-3. 무한 스크롤 (IntersectionObserver)
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

## 3. 흔한 실수
- 컨테이너 height 미지정 → 가상화가 동작하지 않음.
- 아이템 높이 부정확 → 스크롤 점프.
- scroll 이벤트 직접 처리 → 성능 저하(IntersectionObserver 사용).
- 로딩/빈 상태 미표시 → 끝에 도달했는지 알 수 없음.

## 4. 체크리스트
- [ ] 1000개 이상에 가상 스크롤을 적용했는가
- [ ] 컨테이너 height·아이템 높이를 정확히 지정했는가
- [ ] 무한 스크롤을 IntersectionObserver로 구현했는가
- [ ] 로딩·오류·빈 상태를 표시하는가
- [ ] aria-live 또는 페이지네이션 대안을 제공하는가
