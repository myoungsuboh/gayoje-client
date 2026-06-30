---
name: 仮想スクロール & 無限スクロール (Virtual / Infinite Scroll)
description: 大量リストのレンダリング性能のための仮想化と無限スクロール実装の標準。1000 件以上のリストを描画したり無限スクロールを付ける際に読む。キーワード: virtual scroll, virtualization, infinite scroll, IntersectionObserver, vue-virtual-scroller, TanStack Virtual。
rules:
  - "1000 件以上の行は仮想スクロール(Virtual Scroll)を必須で適用する。"
  - "自前実装よりも実績のあるライブラリ(vue-virtual-scroller・TanStack Virtual)を優先して使う。"
  - "仮想スクロールコンテナに固定 height を与え、アイテムの推定高さを正確に渡す。"
  - "無限スクロールはスクロールイベントの代わりに IntersectionObserver で監視し、ローディング・エラー・空状態を表示する。"
  - "アクセシビリティ: aria-live またはページネーションの代替を提供する。"
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

# 📜 仮想スクロール & 無限スクロール

> 大量リストを途切れなくレンダリングするための仮想化・無限スクロールを標準化する。長いリストを描画する際に読む。

## 1. 中核となる原則
- 1000 件以上の行は仮想スクロール(Virtual Scroll)を必須で適用する。
- 自前実装よりも実績のあるライブラリ(vue-virtual-scroller・TanStack Virtual)を優先して使う。
- 仮想スクロールコンテナに固定 height を与え、アイテムの推定高さを正確に渡す。
- 無限スクロールはスクロールイベントの代わりに IntersectionObserver で監視し、ローディング・エラー・空状態を表示する。
- アクセシビリティ: aria-live またはページネーションの代替を提供する。

## 2. ルール

### 2-1. 戦略の選択
| アイテム数 | 戦略 |
|---|---|
| < 100 | 通常レンダリング |
| 100~1000 | ページネーション |
| 1000+ | 仮想スクロール |

### 2-2. 仮想スクロール (vue-virtual-scroller)
```vue
<template>
  <RecycleScroller class="scroller" :items="items" :item-size="48" key-field="id">
    <template #default="{ item }"><ListItem :data="item" /></template>
  </RecycleScroller>
</template>
<style scoped>.scroller { height: 600px; overflow-y: auto; }</style>
```
- 可変高さは `DynamicScroller`(vue)または `measureElement`(TanStack Virtual)で処理する。

### 2-3. 無限スクロール (IntersectionObserver)
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

## 3. よくある間違い
- コンテナの height 未指定 → 仮想化が動作しない。
- アイテムの高さが不正確 → スクロールのジャンプ。
- scroll イベントを直接処理 → 性能低下(IntersectionObserver を使用)。
- ローディング/空状態の未表示 → 末尾に到達したかどうかが分からない。

## 4. チェックリスト
- [ ] 1000 件以上に仮想スクロールを適用したか
- [ ] コンテナの height・アイテムの高さを正確に指定したか
- [ ] 無限スクロールを IntersectionObserver で実装したか
- [ ] ローディング・エラー・空状態を表示するか
- [ ] aria-live またはページネーションの代替を提供するか
