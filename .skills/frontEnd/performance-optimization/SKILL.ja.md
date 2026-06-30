---
name: パフォーマンス最適化 (Performance Optimization)
description: 計測優先・コードスプリッティング・レンダー最適化・バンドル予算・Web Vitals を扱う、特定のフレームワーク/バンドラに依存しないフロントエンドパフォーマンス最適化の汎用標準。画面が遅い・バンドルが大きいとき、パフォーマンスを点検・改善するとき、パフォーマンス基準(予算)を定めるときに読む。
rules:
  - "計測が先、推測は禁止: 最適化の前に計測する。どこが遅いか(バンドル構成・ランタイムプロファイル・実ユーザー指標)をデータで確認し、最大のボトルネックから着手する。体感されない微小最適化に時間を使わない。"
  - "必要なものだけ、必要なときに(コードスプリッティング・遅延ロード): 初期画面に不要なコード・ライブラリ・リソースは初期バンドルから切り離し、実際の利用時点(ルート遷移・操作・ビューポート進入)にロードする。"
  - "レンダー量を減らす: 画面に描画する作業を減らす — 不要な再レンダーを防ぎ、重い計算はキャッシュ(メモ化)し、大きなリストは見える分だけ描画する(仮想化)。"
  - "データ・リソースを軽くする: 画像・フォントなど重いリソースは適切なフォーマット・サイズ・遅延ロードで減らす。大きなデータ構造は本当に必要な分だけ追跡/監視する。"
  - "パフォーマンス予算を定めて守る: 「初期バンドル ≤ N KB」「LCP < 2.5s」のような計測可能な基準(予算)を定め、リグレッションはビルド/レビューで止める。"
  - "ユーザー体感指標で検証する: 合成スコアだけを見ず、Web Vitals(LCP・INP・CLS)のような実ユーザー体感指標で結果を確認する。"
tags:
  - "defineAsyncComponent"
  - "lazy"
  - "dynamic import"
  - "Suspense"
  - "virtual-scroller"
  - "memo"
---

# ⚡ パフォーマンス最適化 (Performance Optimization)

> 推測ではなく計測でボトルネックを見つけ、必要なコードだけを必要なときに送り、レンダーとデータ量を減らしてロード・ランタイムのパフォーマンスを標準化する。画面が遅い・バンドルを減らす必要があるとき、パフォーマンスを点検・改善するとき、パフォーマンス予算を定めるときに読む。特定のフレームワーク/バンドラに依存しない汎用標準である。

## 1. 中核原則
- **計測が先、推測は禁止**: 最適化の前に計測する。どこが遅いか(バンドル構成・ランタイムプロファイル・実ユーザー指標)をデータで確認し、最大のボトルネックから着手する。体感されない微小最適化に時間を使わない。
- **必要なものだけ、必要なときに(コードスプリッティング・遅延ロード)**: 初期画面に不要なコード・ライブラリ・リソースは初期バンドルから切り離し、実際の利用時点(ルート遷移・操作・ビューポート進入)にロードする。
- **レンダー量を減らす**: 画面に描画する作業を減らす — 不要な再レンダーを防ぎ、重い計算はキャッシュ(メモ化)し、大きなリストは見える分だけ描画する(仮想化)。
- **データ・リソースを軽くする**: 画像・フォントなど重いリソースは適切なフォーマット・サイズ・遅延ロードで減らす。大きなデータ構造は本当に必要な分だけ追跡/監視する。
- **パフォーマンス予算を定めて守る**: 「初期バンドル ≤ N KB」「LCP < 2.5s」のような計測可能な基準(予算)を定め、リグレッションはビルド/レビューで止める。
- **ユーザー体感指標で検証する**: 合成スコアだけを見ず、Web Vitals(LCP・INP・CLS)のような実ユーザー体感指標で結果を確認する。

## 2. 規則

### 2-1. 計測が先(バンドル・ランタイム・実ユーザー)
- 最適化対象を**データで**決める: ① バンドル分析(何がバンドルを膨らませるか)、② ランタイムプロファイル(どの処理が遅いか)、③ 実ユーザー指標(どの画面が実際に遅いか)。
- 印象や推測で着手しない。変更後も同じ指標で改善を確認する。

```text
// ❌ 禁止 — 計測なしで「遅そうな」場所を恣意的に最適化
optimize(guessedHotPath)

// ✅ 推奨 — 計測 → 最大のボトルネック → 修正 → 再計測
profile() → pick(biggestBottleneck) → fix() → profile()  // 改善を確認
```

### 2-2. コードスプリッティング(進入単位で分割)
- 画面/ルート単位でコードを分け、初期進入に必要な分だけ送る。
- すべての画面を一塊で静的ロードしない。ルート(または画面遷移)境界で動的ロードに分離する。

```text
// ❌ 禁止 — すべての画面を初期バンドルに静的に含める
route '/'       -> staticImport(Home)
route '/report' -> staticImport(Report)   // 最初の画面が Report まで全部受け取る

// ✅ 推奨 — ルートごとに分離(動的)ロード
route '/'       -> lazy(() => load(Home))
route '/report' -> lazy(() => load(Report))  // 進入時のみロード
```

### 2-3. 遅延ロード(重いコンポーネント・ライブラリ・リソース)
- 最初の画面にすぐ不要な重いコンポーネント・ライブラリ・ウィジェットは**利用時点**(操作・ビューポート進入)にロードする。
- 特にチャート・エディタ・ドキュメント変換器・地図のような大きな依存は初期バンドルに入れず、呼び出し直前に動的ロードする。

```text
// ❌ 禁止 — 重いライブラリをモジュール最上部で即時ロード
import Chart from 'heavy-chart'   // チャートを見ない画面もコストを払う

// ✅ 推奨 — 実際の利用時点に動的ロード
async function showChart() {
  const { Chart } = await load('heavy-chart')  // クリック/表示時のみ
  render(Chart)
}
```

### 2-4. レンダー最適化(不要な再レンダーを遮断)
- 変わらない部分がデータ変化のたびに再描画されないようにする — コンポーネント境界を適切に分け、値が同じならレンダーをスキップする。
- 「観測(リアクティビティ)範囲」を狭く保つ: 画面に影響する状態だけを追跡し、重い静的データは追跡対象から除外する。

```text
// ❌ 禁止 — 親の一箇所が変わると無関係な子まで全部再レンダー
render(wholeTree on anyStateChange)

// ✅ 推奨 — 入力が同じならレンダーをスキップ、影響範囲だけ更新
memoizeRender(child, keys=[item.id, item.status])  // キーが同一 → スキップ
```

### 2-5. メモ化(重い計算をキャッシュ)
- 入力が同じなら結果も同じである**純粋・高コストな計算**はキャッシュし、毎レンダーで再計算しない。
- ただしメモ化にもコスト(メモリ・比較)がある。安価な計算まで無差別に包まない — 計測で効果がある場所だけに。

```text
// ❌ 禁止 — 毎レンダーで大きなリストを再ソート/フィルタ
view() { return sortFilter(bigList) }   // レンダーごとに再計算

// ✅ 推奨 — 入力が変わったときだけ再計算(キャッシュ)
memoized = memo(() => sortFilter(bigList), deps=[bigList, query])
```

### 2-6. 大量リストの仮想化
- 数百〜数千行以上は一度にすべてレンダーせず、**見える領域 + 少しのバッファだけ**を描画する(仮想スクロール/ウィンドウイング)。
- ページネーション・無限スクロールも代替となる。「全部描画してから CSS で隠す」は禁止。

```text
// ❌ 禁止 — 1万行を全部 DOM にレンダー
list.forEach(row => render(row))   // 初期レンダー・メモリ爆発

// ✅ 推奨 — 見える分だけレンダー(仮想化)
virtualize(list, itemHeight, viewportHeight)  // 画面に入る行のみ
```

### 2-7. 画像・リソース最適化
- 画像は**次世代フォーマット**(WebP/AVIF)を優先、旧フォーマットを fallback。ビューポート外の画像は**遅延ロード**、レスポンシブサイズ(`srcset`/`sizes`)で過剰なダウンロードを防ぐ。
- レイアウトシフト(CLS)を防ぐため**サイズ(width/height または aspect-ratio)を明示**する。フォントはロード中もテキストが見えるようにする(`font-display: swap`)。
- 詳細な画像処理規則は `image-optimization` スキルを、フォント/タイポグラフィは該当スキルを併せて参照する。

```text
// ❌ 禁止 — 原本の大型画像、サイズ未指定、全部即時ロード
<img src="hero-4000px.png">       // レイアウトジャンプ + 過大転送

// ✅ 推奨 — 次世代フォーマット + 遅延 + サイズ明示 + レスポンシブ
<picture>
  <source type="image/avif" srcset="hero.avif">
  <img src="hero.jpg" loading="lazy" width=... height=... srcset="...">
</picture>
```

### 2-8. 入力頻度の制御(デバウンス/スロットル)
- 検索入力・スクロール・リサイズのような**高頻度イベント**に付く高コスト処理は、デバウンス(最後の一回)・スロットル(周期的に一回)で呼び出し回数を減らす。
- 毎キー入力でネットワーク呼び出し/重い再計算をトリガしない。

```text
// ❌ 禁止 — キー入力ごとに即時検索リクエスト
onInput(q => fetchResults(q))     // タイピングの殺到 = リクエストの殺到

// ✅ 推奨 — 入力が止まったら一回だけ(デバウンス)
onInput(debounce(q => fetchResults(q), 300))
onScroll(throttle(() => updatePosition(), 100))
```

### 2-9. バンドル予算 & プロダクションビルドの衛生
- 計測可能な**バンドル予算**(初期進入バンドルサイズの上限など)を定め、リグレッションはビルド/レビューで止める。
- プロダクションビルドで**開発専用コードの除去**(console/debugger)、圧縮/minify、チャンク分離、ソースマップ方針を適用する。
- 互いに無関係な大きな依存を一つのチャンクに束ねない — 一方だけ必要な画面が両方を受け取ることになる。

```text
// ❌ 禁止 — 予算なし、prod にデバッグコード、巨大な単一バンドル
build(noMinify, keep(console), oneBigChunk)

// ✅ 推奨 — 予算 + 圧縮 + デバッグ除去 + 合理的なチャンク分離
build(minify, drop(['console','debugger']), splitVendorChunks)
assert(initialBundle <= BUDGET)   // リグレッション時はビルド失敗
```

### 2-10. Web Vitals(ユーザー体感指標)
- 合成スコアだけを見ず、実ユーザー体感指標で検証する: **LCP < 2.5s**(主要コンテンツ表示)、**INP < 200ms**(操作の反応)、**CLS < 0.1**(レイアウト安定)。
- LCP: 中核コンテンツ(主要画像など)を優先ロード(preload)し初期チャンクを減らす。INP: 長い処理を分割してメインスレッドを塞がない。CLS: リソースサイズの予約(画像サイズ・フォント方針)。
- 計測・収集方法は `web-vitals` スキルを参照する。

```text
// ✅ 推奨 — 中核コンテンツの優先ロード、長い処理の分割
preload(criticalAsset)                 // LCP 改善
splitLongTask(heavyHandler) -> yield   // INP 改善(メインスレッドを譲る)
reserveSize(image, font)               // CLS 改善
```

## 3. よくある間違い
- **計測なしの最適化** → 体感されない場所を直し、肝心のボトルネックはそのまま。常に計測 → 修正 → 再計測。
- **すべての画面を静的ロード** → 最初の進入でアプリ全体を受け取る。ルート/画面単位でコードスプリッティング。
- **重いライブラリを初期バンドルに含める** → 使わない画面もコストを払う。利用時点で遅延ロード。
- **大きなデータ全体を深く追跡/監視** → 不要なリアクティビティでレンダー・メモリが急増。追跡範囲を狭める。
- **メモ化の乱用または欠落** → 安価な計算まで包んでオーバーヘッドを生むか、高コストな計算を毎回再計算。計測で判断。
- **大量リストを全部レンダー** → 初期レンダー・スクロールが止まる。仮想化/ページネーション。
- **画像サイズ未指定** → ロード中にレイアウトがジャンプ(CLS)。サイズを予約する。
- **高頻度イベントに無防備** → 入力/スクロールのたびにリクエスト・再計算が殺到。デバウンス/スロットル。
- **プロダクションにデバッグコード/巨大な単一バンドル** → 容量・情報露出。console/debugger 除去、チャンク分離、予算の強制。

## 4. チェックリスト
- [ ] 最適化の前後で**計測**したか(バンドル分析・ランタイムプロファイル・実ユーザー指標)
- [ ] 画面/ルート単位で**コードスプリッティング**したか
- [ ] 重いコンポーネント・ライブラリを**利用時点で遅延ロード**しているか
- [ ] 不要な再レンダーを防ぎ、リアクティビティ/追跡範囲を狭めたか
- [ ] 高コストな純粋計算を**メモ化**したか(乱用なく)
- [ ] 大量リストに**仮想化**(またはページネーション)を適用したか
- [ ] 画像に次世代フォーマット・遅延ロード・**サイズ明示**を適用したか(`image-optimization` 参照)
- [ ] 高頻度イベントに**デバウンス/スロットル**を適用したか
- [ ] **バンドル予算**を定め、プロダクションビルドでデバッグ除去・チャンク分離を適用したか
- [ ] **LCP < 2.5s / INP < 200ms / CLS < 0.1** の基準を満たすか(`web-vitals` 参照)

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: React, Svelte, Angular, Next.js, Nuxt など)に合う例を同じパターンで追加する。上記 1〜4 の原則・規則が標準であり、付録はその適用事例にすぎない。

### Vue 3 + Vite

> 本文 1〜4 の原則・規則を Vue 3 リアクティビティ API(`shallowRef`・`markRaw`・`v-memo`・`defineAsyncComponent`)・Vite ビルドオプション・Vuetify 仮想スクロール・VueUse で実装した**コード例**である。各項目の「なぜ」は本文の同じ番号の規則(コードスプリッティング・レンダー最適化など)を見る。

#### ルートのコードスプリッティング(本文 2-2)
```javascript
// src/router/index.js — 静的 import の代わりに動的 import でルートごとに chunk を分離
const routes = [
  { path: '/', component: () => import('@/views/Home.vue') },
  { path: '/report', component: () => import('@/views/Report.vue') }
]
```

#### 遅延ロード: `defineAsyncComponent`(本文 2-3)
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

#### 大きなライブラリの動的 import(本文 2-3)
```javascript
// chart.js, mermaid, xlsx など重いライブラリは利用時点でロード
const showChart = async () => {
  const { Chart } = await import('chart.js/auto')
  new Chart(ctx, config)
}
```

#### バンドル分析(本文 2-1)
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

#### 画像最適化(本文 2-7、`image-optimization` 参照)
```vue
<picture>
  <source type="image/avif" srcset="/img/hero.avif" />
  <source type="image/webp" srcset="/img/hero.webp" />
  <img src="/img/hero.jpg" loading="lazy" decoding="async"
       srcset="/img/hero-480.jpg 480w, /img/hero-960.jpg 960w"
       sizes="(max-width: 600px) 480px, 960px" alt="" />
</picture>
```

#### 仮想スクロール(本文 2-6)
```vue
<!-- 1000+ 行のテーブルは VVirtualScroll または VDataTableVirtual を使用 -->
<template>
  <VVirtualScroll :items="rows" :item-height="48" height="400">
    <template #default="{ item }">
      <VListItem :title="item.name" />
    </template>
  </VVirtualScroll>
</template>
```

#### メモ化(本文 2-5)
```vue
<template>
  <!-- 変更されない静的コンテンツ -->
  <div v-memo="[item.id, item.status]">
    <ExpensiveCell :item="item" />
  </div>
</template>

<script setup>
import { computed, shallowRef } from 'vue'

const filtered = computed(() => list.value.filter(x => x.active))
const bigTree = shallowRef(initialTree) // 深いリアクティビティは不要
</script>
```

#### リアクティビティ範囲の最小化(本文 2-4 — Vue 専用)
```javascript
import { reactive, shallowReactive, markRaw } from 'vue'

// BAD: 大きなオブジェクト/配列を deep reactive で包む(例: 10MB JSON tree)
const state = reactive({ hugeTree })

// GOOD: shallowReactive + markRaw で追跡範囲を縮小
const state = shallowReactive({ hugeTree: markRaw(hugeTree) })
```

#### デバウンス/スロットル(本文 2-8)
```javascript
import { useDebounceFn, useThrottleFn } from '@vueuse/core'

const onSearch = useDebounceFn((q) => fetchResults(q), 300)
const onScroll = useThrottleFn(() => updatePosition(), 100)
```

#### Web Vitals(本文 2-10、`web-vitals` 参照)
```html
<!-- LCP: 中核画像を preload / INP: 大きなハンドラは scheduler.yield で分割 / CLS: 画像サイズを明示 -->
<link rel="preload" as="image" href="/img/hero.avif" type="image/avif" />
```

#### Production ビルドオプション(本文 2-9)
```javascript
// vite.config.js
export default {
  build: {
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false, // Sentry 用は 'hidden'
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
