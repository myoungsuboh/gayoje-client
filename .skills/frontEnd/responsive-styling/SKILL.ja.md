---
name: レスポンシブスタイル標準 (Responsive Styling)
description: レスポンシブの原則は `responsive-layout`(SoT)に従い、ここではその標準をスタック(Vue 3 + Vuetify)へマッピングする実装だけを扱う — Vuetifyのブレークポイント・VRow/VColグリッド・spacingユーティリティ。画面をVuetifyでレスポンシブに構成したり、ブレークポイント・余白・フォントサイズを決めたりするときに読む。キーワード: responsive, mobile-first, breakpoints, clamp, grid, viewport, touch target, Vuetify, VRow, VCol.
rules:
  - "レイアウトは定義されたブレークポイントを基準に分岐する"
  - "フォントサイズはclampベースの流動的タイポグラフィで設定する"
  - "間隔はデザイントークンのspacing単位を使う"
  - "モバイルファーストで記述し、大画面へ段階的に拡張する"
tags:
  - "responsive"
  - "mobile-first"
  - "breakpoints"
  - "clamp"
  - "grid"
  - "viewport"
  - "touch target"
  - "Vuetify"
  - "VRow"
  - "VCol"
  - "@media"
  - "breakpoint"
  - "min-width"
  - "max-width"
  - "grid-template"
  - "flex-wrap"
---

# 📐 レスポンシブスタイル標準 (Responsive Styling)

> レスポンシブの概念・原則(モバイルファースト、一貫したブレークポイント、流動的タイポグラフィ、流動的グリッド、タッチターゲットなど)は `responsive-layout` スキルが単一の出典(SoT)である。このスキルはその標準を当社のスタック(Vue 3 + Vuetify)でどのように実装するかだけを扱う。Vuetifyで画面をレスポンシブに構成したり、ブレークポイント・余白・フォントサイズを決定したりするときに、`responsive-layout` と一緒に読む。

## 1. 原則は `responsive-layout` に従う (委譲)
レスポンシブのすべての中立的原則 — **モバイルファースト**(`min-width` で拡張)、**一貫したブレークポイント**(コンテンツが崩れる地点、マジックナンバー禁止)、**流動的タイポグラフィ**(`clamp()` + `rem`)、**流動的グリッド/柔軟な単位**(`%`/`fr`/`minmax`)、**プラットフォーム別のタッチターゲット・横スクロール防止** — は `responsive-layout` スキルが標準(SoT)である。ここでは繰り返さないので、そちらに従う。

- **余白をビューポートごとに差別化する**原則も `responsive-layout` に従うが、余白・間隔の**値のトークン化/統一**は `design-system` スキルに従う。
- 以下はこの標準を当社のスタック(Vue 3 + Vuetify)で実装する方法、すなわち**スタック固有分**だけを扱う。

## 2. Vue 3 + Vuetify 実装

Vuetifyは独自のブレークポイント体系(`xs`/`sm`/`md`/`lg`/`xl`)とグリッド(`VRow`/`VCol`)、間隔ユーティリティ(`pa-*`/`ma-*`)を提供する。`responsive-layout` の標準概念をVuetifyの慣用句にマッピングしたものである。

### 2-1. ビューポート基準 (Breakpoints)
- **Mobile (xs)**: `0px` ~ `599px`
- **Tablet (sm, md)**: `600px` ~ `1279px`
- **Web (lg+)**: `1280px` 以上

### 2-2. グリッド — VRow / VCol
- レスポンシブなカラムは `VRow`/`VCol` で構成し、ブレークポイントprop(`cols`, `sm`, `md`, `lg`)で列数を段階的に指定する。

```vue
<v-row>
  <!-- モバイル12カラム(1列) → タブレット6カラム(2列) → デスクトップ4カラム(3列) -->
  <v-col cols="12" sm="6" lg="4" v-for="item in items" :key="item.id">
    <v-card>{{ item.name }}</v-card>
  </v-col>
</v-row>
```

### 2-3. 間隔 — spacing ユーティリティ
- 余白は `pa-*`(padding)/`ma-*`(margin)ユーティリティで与え、ビューポートごとの差別化はブレークポイント接頭辞で表現する。値のトークン化/統一は `design-system` に従う。
- 例: モバイル `pa-4`、デスクトップ `pa-8` → `pa-4 pa-lg-8`。

```vue
<!-- モバイルは pa-4(16px)、lg 以上で pa-8(32px) -->
<v-sheet class="pa-4 pa-lg-8">...</v-sheet>
```

### 2-4. 流動的タイポグラフィ
- Vuetifyのタイポクラス(`text-h4` など)とは別に、`responsive-layout` の標準 `clamp()` を `scoped` スタイルにそのまま使える。

```vue
<style scoped>
.page-title { font-size: clamp(1.5rem, 4vw + 1rem, 3rem); }
</style>
```
