---
name: チャート & データ可視化 (Charts & Dataviz)
description: チャートライブラリの選定・レスポンシブ・アクセシビリティ・大容量レンダリングの標準。ダッシュボードやチャートを作るとき、ライブラリを選ぶとき、アクセシビリティ・性能に配慮するときに読む。キーワード: Chart.js, ECharts, D3, ResizeObserver, aria-label, WebGL, LTTB, dataviz, canvas, svg。
rules:
  - "要件に合わせてライブラリを選ぶ — Chart.js(汎用)・ECharts(大容量・複雑)・D3(完全カスタム)。"
  - "チャートコンテナはResizeObserverで親のサイズを検知して自動で再描画する。"
  - "色だけで区別しない — パターン・ラベル・凡例を併用する(色覚異常への対応)。"
  - "SVG/Canvasチャートにrole='img' + aria-labelを付け、主要データをテキストテーブルでも提供する。"
  - "1万ポイント以上はWebGLレンダラー(ECharts GL・deck.gl)、またはサーバー集計後に表示する。"
tags:
  - "Chart.js"
  - "ECharts"
  - "D3"
  - "ResizeObserver"
  - "aria-label"
  - "WebGL"
  - "LTTB"
  - "dataviz"
  - "canvas"
  - "svg"
  - "chart"
  - "echarts"
  - "chartjs"
  - "d3"
  - "visualization"
---

# 📈 チャート & データ可視化

> チャートライブラリの選定と、レスポンシブ・アクセシビリティ・大容量データのレンダリングを標準化する。チャートやダッシュボードを作るときに読む。

## 1. 基本原則
- 要件に合わせてライブラリを選ぶ — Chart.js(汎用)・ECharts(大容量・複雑)・D3(完全カスタム)。
- チャートコンテナはResizeObserverで親のサイズを検知して自動で再描画する。
- 色だけで区別しない — パターン・ラベル・凡例を併用する(色覚異常への対応)。
- SVG/Canvasチャートに`role="img"` + `aria-label`を付け、主要データをテキストテーブルでも提供する。
- 1万ポイント以上はWebGLレンダラー(ECharts GL・deck.gl)、またはサーバー集計後に表示する。

## 2. ルール

### 2-1. ライブラリ選定
| ライブラリ | 適した状況 |
|---|---|
| Chart.js | 基本チャート(ライン・バー・パイ)、軽量で簡単 |
| ECharts | ダッシュボード・ヒートマップ・ツリーマップ、大容量 |
| D3.js | 特殊チャート・カスタムインタラクション |

### 2-2. レスポンシブ (ResizeObserver + 後始末)
```js
const chartRef = ref(null)
let chart = null
onMounted(() => {
  chart = echarts.init(chartRef.value)
  chart.setOption(option)
  const ro = new ResizeObserver(() => chart.resize())
  ro.observe(chartRef.value)
  onUnmounted(() => { ro.disconnect(); chart.dispose() })   // メモリリーク防止
})
```

### 2-3. アクセシビリティ
```html
<!-- ❌ 禁止 — スクリーンリーダーが読めない図 -->
<canvas></canvas>

<!-- ✅ 推奨 — ラベル + 代替テーブル -->
<canvas role="img" aria-label="月別売上: 1月 100万、2月 150万 ..."></canvas>
<table class="sr-only">...</table>
```

### 2-4. 大容量データ
- サーバーで集計(GROUP BY)してポイント数を制限する。
- 時系列はズームレベルに応じてダウンサンプリングする。
- ECharts `large: true` + `sampling: 'lttb'`。

## 3. よくあるミス
- リサイズ時にチャートが追従しない(ResizeObserver未使用)。
- dispose/disconnectの漏れ → メモリリーク。
- 系列を色だけで区別 → 色覚異常者が識別不能。
- 数万ポイントをそのままCanvasに描画 → レンダリング遅延。

## 4. チェックリスト
- [ ] 要件に合ったライブラリを選定したか
- [ ] ResizeObserverでレスポンシブにし、アンマウント時にdisposeしているか
- [ ] role/aria-label + 代替テーブルでアクセシビリティを提供しているか
- [ ] 大容量は集計/ダウンサンプリング/WebGLで処理しているか
