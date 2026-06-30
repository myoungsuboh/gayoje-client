---
name: 차트 & 데이터 시각화 (Charts & Dataviz)
description: 차트 라이브러리 선택·반응형·접근성·대용량 렌더링 표준. 대시보드나 차트를 만들 때, 라이브러리를 고르거나 접근성·성능을 챙길 때 읽는다. 키워드: Chart.js, ECharts, D3, ResizeObserver, aria-label, WebGL, LTTB, dataviz, canvas, svg.
rules:
  - "요구에 맞게 라이브러리를 고른다 — Chart.js(범용)·ECharts(대용량·복잡)·D3(완전 커스텀)."
  - "차트 컨테이너는 ResizeObserver로 부모 크기를 감지해 자동으로 다시 그린다."
  - "색상만으로 구분하지 않는다 — 패턴·레이블·범례를 함께 쓴다(색각 이상 대응)."
  - "SVG/Canvas 차트에 role='img' + aria-label을 넣고, 핵심 데이터를 텍스트 테이블로도 제공한다."
  - "1만 포인트 이상은 WebGL 렌더러(ECharts GL·deck.gl) 또는 서버 집계 후 표시한다."
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

# 📈 차트 & 데이터 시각화

> 차트 라이브러리 선택과 반응형·접근성·대용량 데이터 렌더링을 표준화한다. 차트나 대시보드를 만들 때 읽는다.

## 1. 핵심 원칙
- 요구에 맞게 라이브러리를 고른다 — Chart.js(범용)·ECharts(대용량·복잡)·D3(완전 커스텀).
- 차트 컨테이너는 ResizeObserver로 부모 크기를 감지해 자동으로 다시 그린다.
- 색상만으로 구분하지 않는다 — 패턴·레이블·범례를 함께 쓴다(색각 이상 대응).
- SVG/Canvas 차트에 `role="img"` + `aria-label`을 넣고, 핵심 데이터를 텍스트 테이블로도 제공한다.
- 1만 포인트 이상은 WebGL 렌더러(ECharts GL·deck.gl) 또는 서버 집계 후 표시한다.

## 2. 규칙

### 2-1. 라이브러리 선택
| 라이브러리 | 적합 상황 |
|---|---|
| Chart.js | 기본 차트(라인·바·파이), 가볍고 쉬움 |
| ECharts | 대시보드·히트맵·트리맵, 대용량 |
| D3.js | 특수 차트·커스텀 인터랙션 |

### 2-2. 반응형 (ResizeObserver + 정리)
```js
const chartRef = ref(null)
let chart = null
onMounted(() => {
  chart = echarts.init(chartRef.value)
  chart.setOption(option)
  const ro = new ResizeObserver(() => chart.resize())
  ro.observe(chartRef.value)
  onUnmounted(() => { ro.disconnect(); chart.dispose() })   // 메모리 누수 방지
})
```

### 2-3. 접근성
```html
<!-- ❌ 금지 — 스크린리더가 읽을 수 없는 그림 -->
<canvas></canvas>

<!-- ✅ 권장 — 레이블 + 대안 테이블 -->
<canvas role="img" aria-label="월별 매출: 1월 100만, 2월 150만 ..."></canvas>
<table class="sr-only">...</table>
```

### 2-4. 대용량 데이터
- 서버에서 집계(GROUP BY)해 포인트 수를 제한.
- 시계열은 줌 레벨에 따라 다운샘플링.
- ECharts `large: true` + `sampling: 'lttb'`.

## 3. 흔한 실수
- 리사이즈 시 차트가 안 따라감 (ResizeObserver 미사용).
- dispose/disconnect 누락 → 메모리 누수.
- 색상만으로 계열 구분 → 색각 이상자 식별 불가.
- 수만 포인트를 그대로 Canvas에 → 렌더 지연.

## 4. 체크리스트
- [ ] 요구에 맞는 라이브러리를 선택했는가
- [ ] ResizeObserver로 반응형 + 언마운트 시 dispose 하는가
- [ ] role/aria-label + 대안 테이블로 접근성을 제공하는가
- [ ] 대용량은 집계/다운샘플링/WebGL로 처리하는가
