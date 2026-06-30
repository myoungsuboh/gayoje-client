---
name: 图表 & 数据可视化 (Charts & Dataviz)
description: 图表库选择、响应式、可访问性、大数据量渲染的标准。在制作仪表盘或图表时、选择库时、或处理可访问性与性能时阅读。关键词: Chart.js, ECharts, D3, ResizeObserver, aria-label, WebGL, LTTB, dataviz, canvas, svg。
rules:
  - "根据需求选择库 — Chart.js(通用)·ECharts(大数据量·复杂)·D3(完全自定义)。"
  - "图表容器用ResizeObserver检测父级尺寸并自动重绘。"
  - "不要仅靠颜色区分 — 同时使用图案·标签·图例(支持色觉异常)。"
  - "为SVG/Canvas图表添加role='img' + aria-label，并以文本表格形式同时提供核心数据。"
  - "超过1万个点时使用WebGL渲染器(ECharts GL·deck.gl)，或在服务端聚合后再展示。"
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

# 📈 图表 & 数据可视化

> 将图表库选择以及响应式、可访问性、大数据量渲染标准化。在制作图表或仪表盘时阅读。

## 1. 核心原则
- 根据需求选择库 — Chart.js(通用)·ECharts(大数据量·复杂)·D3(完全自定义)。
- 图表容器用ResizeObserver检测父级尺寸并自动重绘。
- 不要仅靠颜色区分 — 同时使用图案·标签·图例(支持色觉异常)。
- 为SVG/Canvas图表添加`role="img"` + `aria-label`，并以文本表格形式同时提供核心数据。
- 超过1万个点时使用WebGL渲染器(ECharts GL·deck.gl)，或在服务端聚合后再展示。

## 2. 规则

### 2-1. 库选择
| 库 | 适用场景 |
|---|---|
| Chart.js | 基础图表(折线·柱状·饼图)，轻量易用 |
| ECharts | 仪表盘·热力图·树图，大数据量 |
| D3.js | 特殊图表·自定义交互 |

### 2-2. 响应式 (ResizeObserver + 清理)
```js
const chartRef = ref(null)
let chart = null
onMounted(() => {
  chart = echarts.init(chartRef.value)
  chart.setOption(option)
  const ro = new ResizeObserver(() => chart.resize())
  ro.observe(chartRef.value)
  onUnmounted(() => { ro.disconnect(); chart.dispose() })   // 防止内存泄漏
})
```

### 2-3. 可访问性
```html
<!-- ❌ 禁止 — 屏幕阅读器无法读取的图形 -->
<canvas></canvas>

<!-- ✅ 推荐 — 标签 + 替代表格 -->
<canvas role="img" aria-label="月度销售额: 1月 100万, 2月 150万 ..."></canvas>
<table class="sr-only">...</table>
```

### 2-4. 大数据量
- 在服务端聚合(GROUP BY)以限制点的数量。
- 时间序列按缩放级别进行降采样。
- ECharts `large: true` + `sampling: 'lttb'`。

## 3. 常见错误
- 调整尺寸时图表不跟随(未使用ResizeObserver)。
- 遗漏dispose/disconnect → 内存泄漏。
- 仅靠颜色区分系列 → 色觉异常者无法识别。
- 将数万个点直接画在Canvas上 → 渲染卡顿。

## 4. 检查清单
- [ ] 是否选择了符合需求的库
- [ ] 是否用ResizeObserver实现响应式并在卸载时dispose
- [ ] 是否通过role/aria-label + 替代表格提供可访问性
- [ ] 大数据量是否通过聚合/降采样/WebGL处理
