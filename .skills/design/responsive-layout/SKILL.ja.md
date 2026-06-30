---
name: レスポンシブレイアウト & アダプティブデザイン
description: Mobile-first CSS、柔軟なグリッド、ビューポートごとのタイポグラフィ・余白調整であらゆる画面で最適な UX を提供するレスポンシブ実装ガイド。新しい画面を作ったり、レイアウト・ブレークポイント・タッチ対応を決める際に読む。キーワード: @media, min-width, grid-template, flex, srcset, container, clamp(, vw, rem.
rules:
  - "Mobile-first アプローチ — 基本スタイルをモバイル基準で書き、min-width メディアクエリで拡張する。"
  - "レイアウトは CSS Grid と Flexbox で実装し、固定 px レイアウトは使わない。"
  - "画像・メディアは max-width:100% を基本とし、レスポンシブな srcset/sizes 属性を使う。"
  - "タッチターゲットはプラットフォームごとの最小サイズ（iOS 44pt・Android 48dp・WCAG 2.5.5 24px など）以上を維持する。"
  - "ビューポート幅ではなくコンテナ幅で反応する場合は container queries を活用する。"
tags:
  - "@media"
  - "min-width"
  - "grid-template"
  - "flex"
  - "srcset"
  - "container"
  - "clamp("
  - "vw"
  - "rem"
---

# 📱 レスポンシブレイアウト & アダプティブデザイン

> Mobile-first であらゆる画面幅で最適な UX を提供する。新しい画面を作ったり、レイアウト・ブレークポイント・タッチ対応を決める際に読む。Web レスポンシブの単一の出典（SoT）であり、スタック別（例: Vuetify）の実装は `responsive-styling` スキルで見る。

## 1. 基本原則
- Mobile-first アプローチ — 基本スタイルをモバイル基準で書き、`min-width` メディアクエリで拡張する。
- レイアウトは CSS Grid と Flexbox で実装し、固定 px レイアウトは使わない。
- 画像・メディアは `max-width:100%` を基本とし、レスポンシブな `srcset`/`sizes` 属性を使う。
- タッチターゲットはプラットフォームごとの最小サイズ（iOS 44pt・Android 48dp・WCAG 2.5.5 24px など）以上を維持する。
- ビューポート幅ではなくコンテナ幅で反応する場合は container queries を活用する。

## 2. ルール

### 2-1. ブレークポイント戦略 (Mobile-first)
基本ブレークポイントはプロジェクトでのトークン化を推奨する。

```css
/* ✅ 권장 — 기본: 모바일 (<640px) */
.container { padding: 0 16px; }

/* 태블릿 */
@media (min-width: 640px) { .container { padding: 0 24px; } }

/* 데스크톱 */
@media (min-width: 1024px) { .container { max-width: 1200px; margin: 0 auto; } }
```

### 2-2. 流体タイポグラフィ
```css
/* ✅ 권장 — clamp(최소, 선호, 최대)로 미디어 쿼리 없이 유연한 크기 */
h1 { font-size: clamp(1.5rem, 4vw, 2.5rem); }
p  { font-size: clamp(1rem, 2vw, 1.125rem); }
```

### 2-3. Grid レイアウトパターン
```css
/* ✅ 권장 — 자동 채우기 카드 그리드 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
```

### 2-4. Container Queries (コンポーネントレベルの反応)
```css
/* ✅ 권장 — 뷰포트가 아닌 컨테이너 폭으로 반응 */
.card-wrapper { container-type: inline-size; }

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

### 2-5. タッチ最適化
```css
/* ❌ 금지 — hover 전용 UX를 터치 기기에도 노출 */
.tooltip:hover { display: block; }

/* ✅ 권장 — hover 가능한 기기로 제한 */
@media (hover: hover) {
  .tooltip:hover { display: block; }
}

/* ✅ 권장 — 스와이프 인터랙션에 touch-action 명시 */
.carousel { touch-action: pan-y; }
```

タッチターゲットはプラットフォームごとの最小サイズ以上をパディングで確保する（上記の基本原則を参照）。

## 3. よくある間違い
- 固定 px レイアウトの使用 → 狭い画面で横スクロールが生じる。
- desktop-first で書いた後に `max-width` で縮小 → モバイル対応が後回しになる。
- 画像に `max-width:100%` の欠落 → コンテナをあふれてレイアウトが崩れる。
- タッチターゲットがプラットフォーム最小未満 → モバイルで押しにくい。
- hover 専用 UX をタッチ機器に公開 → インタラクションが動作しない。

## 4. チェックリスト
- [ ] 基本スタイルをモバイル基準で書き、`min-width` で拡張したか
- [ ] レイアウトを Grid/Flexbox で実装し、固定 px を避けたか
- [ ] 画像・メディアに `max-width:100%` と `srcset`/`sizes` を適用したか
- [ ] タッチターゲットをプラットフォームごとの最小サイズ以上に確保したか
- [ ] hover 専用 UX を `@media (hover: hover)` で制限したか
