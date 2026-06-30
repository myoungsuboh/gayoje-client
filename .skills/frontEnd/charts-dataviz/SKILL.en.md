---
name: Charts & Dataviz (Charts & Dataviz)
description: Standards for chart library selection, responsiveness, accessibility, and large-scale rendering. Read this when building a dashboard or chart, when choosing a library, or when handling accessibility and performance. Keywords: Chart.js, ECharts, D3, ResizeObserver, aria-label, WebGL, LTTB, dataviz, canvas, svg.
rules:
  - "Choose the library to fit the requirement — Chart.js (general purpose), ECharts (large-scale, complex), D3 (fully custom)."
  - "Have chart containers detect the parent size with ResizeObserver and redraw automatically."
  - "Do not distinguish by color alone — use patterns, labels, and legends together (color-blindness support)."
  - "Add role='img' + aria-label to SVG/Canvas charts, and also provide the key data as a text table."
  - "Render 10,000+ points with a WebGL renderer (ECharts GL, deck.gl) or display them after server-side aggregation."
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

# 📈 Charts & Data Visualization

> Standardizes chart library selection along with responsive, accessible, and large-data rendering. Read this when building a chart or dashboard.

## 1. Core Principles
- Choose the library to fit the requirement — Chart.js (general purpose), ECharts (large-scale, complex), D3 (fully custom).
- Have chart containers detect the parent size with ResizeObserver and redraw automatically.
- Do not distinguish by color alone — use patterns, labels, and legends together (color-blindness support).
- Add `role="img"` + `aria-label` to SVG/Canvas charts, and also provide the key data as a text table.
- Render 10,000+ points with a WebGL renderer (ECharts GL, deck.gl) or display them after server-side aggregation.

## 2. Rules

### 2-1. Library Selection
| Library | Suitable for |
|---|---|
| Chart.js | Basic charts (line, bar, pie), lightweight and easy |
| ECharts | Dashboards, heatmaps, treemaps, large scale |
| D3.js | Specialized charts, custom interactions |

### 2-2. Responsiveness (ResizeObserver + cleanup)
```js
const chartRef = ref(null)
let chart = null
onMounted(() => {
  chart = echarts.init(chartRef.value)
  chart.setOption(option)
  const ro = new ResizeObserver(() => chart.resize())
  ro.observe(chartRef.value)
  onUnmounted(() => { ro.disconnect(); chart.dispose() })   // prevent memory leaks
})
```

### 2-3. Accessibility
```html
<!-- ❌ Forbidden — an image that screen readers cannot read -->
<canvas></canvas>

<!-- ✅ Recommended — label + alternative table -->
<canvas role="img" aria-label="Monthly sales: Jan 1.0M, Feb 1.5M ..."></canvas>
<table class="sr-only">...</table>
```

### 2-4. Large-Scale Data
- Aggregate (GROUP BY) on the server to limit the number of points.
- Downsample time series according to the zoom level.
- ECharts `large: true` + `sampling: 'lttb'`.

## 3. Common Mistakes
- Chart does not follow on resize (ResizeObserver not used).
- Missing dispose/disconnect → memory leak.
- Distinguishing series by color alone → not identifiable by color-blind users.
- Drawing tens of thousands of points directly on Canvas → render lag.

## 4. Checklist
- [ ] Did you choose a library that fits the requirement?
- [ ] Are you responsive with ResizeObserver and disposing on unmount?
- [ ] Do you provide accessibility via role/aria-label + an alternative table?
- [ ] Do you handle large data with aggregation/downsampling/WebGL?
