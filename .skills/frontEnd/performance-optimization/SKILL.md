---
name: 성능 최적화 (Performance Optimization)
description: 측정 우선·코드 스플리팅·렌더 최적화·번들 예산·Web Vitals를 다루는 프런트엔드 성능 최적화의 범용 표준으로, 특정 프레임워크/번들러에 무관하다. 화면이 느리거나 번들이 커질 때, 성능을 점검·개선하거나 성능 기준(예산)을 정할 때 읽는다.
rules:
  - "측정 먼저, 추측 금지: 최적화 전에 측정한다. 어디가 느린지(번들 구성·런타임 프로파일·실제 사용자 지표)를 데이터로 확인하고, 가장 큰 병목부터 손댄다. 체감되지 않는 미세 최적화에 시간을 쓰지 않는다."
  - "필요한 것만, 필요할 때(코드 스플리팅·지연 로딩): 초기 화면에 필요 없는 코드·라이브러리·자원은 초기 번들에서 떼어내고, 실제 사용 시점(라우트 진입·상호작용·뷰포트 진입)에 로드한다."
  - "렌더 양을 줄인다: 화면에 그리는 일을 줄인다 — 불필요한 재렌더를 막고, 무거운 계산은 캐시(메모이제이션)하며, 큰 목록은 보이는 만큼만 그린다(가상화)."
  - "데이터·자원을 가볍게: 이미지·폰트 등 무거운 자원은 적절한 포맷·크기·지연 로딩으로 줄인다. 큰 데이터 구조는 꼭 필요한 만큼만 추적/관찰한다."
  - "성능 예산을 정하고 지킨다: '초기 번들 ≤ N KB', 'LCP < 2.5s' 같은 측정 가능한 기준(예산)을 정하고, 회귀하면 빌드/리뷰에서 막는다."
  - "사용자 체감 지표로 검증: 합성 점수만 보지 말고 Web Vitals(LCP·INP·CLS) 같은 실제 사용자 체감 지표로 결과를 확인한다."
tags:
  - "defineAsyncComponent"
  - "lazy"
  - "dynamic import"
  - "Suspense"
  - "virtual-scroller"
  - "memo"
---

# ⚡ 성능 최적화 (Performance Optimization)

> 추측이 아니라 측정으로 병목을 찾고, 필요한 코드만 필요한 시점에 보내며, 렌더와 데이터 양을 줄여 로딩·런타임 성능을 표준화한다. 화면이 느리거나 번들을 줄여야 할 때, 성능을 점검·개선하거나 성능 예산을 정할 때 읽는다. 특정 프레임워크/번들러에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **측정 먼저, 추측 금지**: 최적화 전에 측정한다. 어디가 느린지(번들 구성·런타임 프로파일·실제 사용자 지표)를 데이터로 확인하고, 가장 큰 병목부터 손댄다. 체감되지 않는 미세 최적화에 시간을 쓰지 않는다.
- **필요한 것만, 필요할 때(코드 스플리팅·지연 로딩)**: 초기 화면에 필요 없는 코드·라이브러리·자원은 초기 번들에서 떼어내고, 실제 사용 시점(라우트 진입·상호작용·뷰포트 진입)에 로드한다.
- **렌더 양을 줄인다**: 화면에 그리는 일을 줄인다 — 불필요한 재렌더를 막고, 무거운 계산은 캐시(메모이제이션)하며, 큰 목록은 보이는 만큼만 그린다(가상화).
- **데이터·자원을 가볍게**: 이미지·폰트 등 무거운 자원은 적절한 포맷·크기·지연 로딩으로 줄인다. 큰 데이터 구조는 꼭 필요한 만큼만 추적/관찰한다.
- **성능 예산을 정하고 지킨다**: "초기 번들 ≤ N KB", "LCP < 2.5s" 같은 측정 가능한 기준(예산)을 정하고, 회귀하면 빌드/리뷰에서 막는다.
- **사용자 체감 지표로 검증**: 합성 점수만 보지 말고 Web Vitals(LCP·INP·CLS) 같은 실제 사용자 체감 지표로 결과를 확인한다.

## 2. 규칙

### 2-1. 측정 먼저 (번들·런타임·실사용자)
- 최적화 대상을 **데이터로** 정한다: ① 번들 분석(무엇이 번들을 키우나), ② 런타임 프로파일(어떤 작업이 느린가), ③ 실사용자 지표(어떤 화면이 실제로 느린가).
- 인상이나 추측으로 손대지 않는다. 바꾼 뒤에도 같은 지표로 개선을 확인한다.

```text
// ❌ 금지 — 측정 없이 "느낄 것 같은" 곳을 임의 최적화
optimize(guessedHotPath)

// ✅ 권장 — 측정 → 가장 큰 병목 → 수정 → 재측정
profile() → pick(biggestBottleneck) → fix() → profile()  // 개선 확인
```

### 2-2. 코드 스플리팅 (진입 단위 분할)
- 화면/라우트 단위로 코드를 나눠, 초기 진입에 필요한 만큼만 내려보낸다.
- 모든 화면을 한 덩어리로 정적 로딩하지 않는다. 라우트(또는 화면 전환) 경계에서 동적 로딩으로 분리한다.

```text
// ❌ 금지 — 모든 화면을 초기 번들에 정적 포함
route '/'       -> staticImport(Home)
route '/report' -> staticImport(Report)   // 첫 화면이 Report까지 다 받음

// ✅ 권장 — 라우트별로 분리(동적) 로딩
route '/'       -> lazy(() => load(Home))
route '/report' -> lazy(() => load(Report))  // 진입할 때만 로드
```

### 2-3. 지연 로딩 (무거운 컴포넌트·라이브러리·자원)
- 첫 화면에 당장 필요 없는 무거운 컴포넌트·라이브러리·위젯은 **사용 시점**(상호작용·뷰포트 진입)에 로드한다.
- 특히 차트·에디터·문서 변환기·지도 같은 큰 의존성은 초기 번들에 넣지 말고 호출 직전 동적 로딩한다.

```text
// ❌ 금지 — 무거운 라이브러리를 모듈 최상단에서 즉시 로드
import Chart from 'heavy-chart'   // 차트를 안 보는 화면도 비용을 냄

// ✅ 권장 — 실제 사용 시점에 동적 로딩
async function showChart() {
  const { Chart } = await load('heavy-chart')  // 클릭/표시될 때만
  render(Chart)
}
```

### 2-4. 렌더 최적화 (불필요한 재렌더 차단)
- 변하지 않는 부분이 데이터 변화 때마다 다시 그려지지 않게 한다 — 컴포넌트 경계를 적절히 나누고, 값이 그대로면 렌더를 건너뛴다.
- "관찰(반응성) 범위"를 좁게 둔다: 화면에 영향을 주는 상태만 추적하고, 무거운 정적 데이터는 추적 대상에서 제외한다.

```text
// ❌ 금지 — 부모 한 곳이 바뀌면 무관한 자식까지 전부 재렌더
render(wholeTree on anyStateChange)

// ✅ 권장 — 입력이 같으면 렌더 스킵, 영향 범위만 갱신
memoizeRender(child, keys=[item.id, item.status])  // 키 동일 → 스킵
```

### 2-5. 메모이제이션 (무거운 계산 캐시)
- 입력이 같으면 결과가 같은 **순수·고비용 계산**은 캐시해 매 렌더마다 다시 계산하지 않는다.
- 단, 메모이제이션도 비용(메모리·비교)이다. 값싼 계산까지 무차별로 감싸지 않는다 — 측정으로 효과가 있는 곳에만.

```text
// ❌ 금지 — 매 렌더마다 큰 리스트를 다시 정렬/필터
view() { return sortFilter(bigList) }   // 렌더마다 재계산

// ✅ 권장 — 입력 바뀔 때만 재계산(캐시)
memoized = memo(() => sortFilter(bigList), deps=[bigList, query])
```

### 2-6. 대량 리스트 가상화
- 수백~수천 행 이상은 한 번에 모두 렌더하지 말고, **보이는 영역 + 약간의 버퍼만** 그린다(가상 스크롤/윈도잉).
- 페이지네이션·무한 스크롤도 대안이다. "전부 그린 다음 CSS로 숨기기"는 금지.

```text
// ❌ 금지 — 1만 행을 전부 DOM에 렌더
list.forEach(row => render(row))   // 초기 렌더·메모리 폭발

// ✅ 권장 — 보이는 만큼만 렌더(가상화)
virtualize(list, itemHeight, viewportHeight)  // 화면에 들어오는 행만
```

### 2-7. 이미지·자원 최적화
- 이미지는 **차세대 포맷**(WebP/AVIF) 우선, 구형 포맷 fallback. 뷰포트 밖 이미지는 **지연 로딩**, 반응형 크기(`srcset`/`sizes`)로 과한 다운로드를 막는다.
- 레이아웃 이동(CLS)을 막기 위해 **크기(width/height 또는 aspect-ratio)를 명시**한다. 폰트는 로딩 중에도 텍스트가 보이게 한다(`font-display: swap`).
- 자세한 이미지 처리 규칙은 `image-optimization` 스킬을, 폰트/타이포는 해당 스킬을 함께 참조한다.

```text
// ❌ 금지 — 원본 대형 이미지, 크기 미지정, 전부 즉시 로딩
<img src="hero-4000px.png">       // 레이아웃 점프 + 과대 전송

// ✅ 권장 — 차세대 포맷 + 지연 + 크기 명시 + 반응형
<picture>
  <source type="image/avif" srcset="hero.avif">
  <img src="hero.jpg" loading="lazy" width=... height=... srcset="...">
</picture>
```

### 2-8. 입력 빈도 제어 (디바운스/스로틀)
- 검색 입력·스크롤·리사이즈처럼 **고빈도 이벤트**에 붙는 비싼 작업은 디바운스(마지막 한 번)·스로틀(주기적 한 번)로 호출 횟수를 줄인다.
- 매 키 입력마다 네트워크 호출/무거운 재계산을 트리거하지 않는다.

```text
// ❌ 금지 — 키 입력마다 즉시 검색 요청
onInput(q => fetchResults(q))     // 타이핑 폭주 = 요청 폭주

// ✅ 권장 — 입력이 멎으면 한 번만(디바운스)
onInput(debounce(q => fetchResults(q), 300))
onScroll(throttle(() => updatePosition(), 100))
```

### 2-9. 번들 예산 & 프로덕션 빌드 위생
- 측정 가능한 **번들 예산**(초기 진입 번들 크기 상한 등)을 정하고, 회귀하면 빌드/리뷰에서 막는다.
- 프로덕션 빌드에서 **개발 전용 코드 제거**(console/debugger), 압축/minify, 청크 분리, 소스맵 정책을 적용한다.
- 서로 무관한 큰 의존성을 한 청크에 묶지 않는다 — 한쪽만 필요한 화면이 둘 다 받게 된다.

```text
// ❌ 금지 — 예산 없음, prod에 디버그 코드, 거대 단일 번들
build(noMinify, keep(console), oneBigChunk)

// ✅ 권장 — 예산 + 압축 + 디버그 제거 + 합리적 청크 분리
build(minify, drop(['console','debugger']), splitVendorChunks)
assert(initialBundle <= BUDGET)   // 회귀 시 빌드 실패
```

### 2-10. Web Vitals (사용자 체감 지표)
- 합성 점수만 보지 말고 실제 사용자 체감 지표로 검증한다: **LCP < 2.5s**(주요 콘텐츠 표시), **INP < 200ms**(상호작용 반응), **CLS < 0.1**(레이아웃 안정).
- LCP: 핵심 콘텐츠(주요 이미지 등)를 우선 로딩(preload)하고 초기 청크를 줄인다. INP: 긴 작업을 쪼개 메인 스레드를 막지 않는다. CLS: 자원 크기 예약(이미지 크기·폰트 정책).
- 측정·수집 방법은 `web-vitals` 스킬을 참조한다.

```text
// ✅ 권장 — 핵심 콘텐츠 우선 로딩, 긴 작업 분할
preload(criticalAsset)                 // LCP 개선
splitLongTask(heavyHandler) -> yield   // INP 개선(메인 스레드 양보)
reserveSize(image, font)               // CLS 개선
```

## 3. 흔한 실수
- **측정 없이 최적화** → 체감 안 되는 곳을 고치고 정작 병목은 그대로. 항상 측정 → 수정 → 재측정.
- **모든 화면 정적 로딩** → 첫 진입이 앱 전체를 받는다. 라우트/화면 단위로 코드 스플리팅.
- **무거운 라이브러리를 초기 번들에 포함** → 안 쓰는 화면도 비용을 낸다. 사용 시점 지연 로딩.
- **큰 데이터 전체를 깊게 추적/관찰** → 불필요한 반응성으로 렌더·메모리 폭증. 추적 범위를 좁힌다.
- **메모이제이션 남용 또는 누락** → 값싼 계산까지 감싸 오버헤드를 만들거나, 비싼 계산을 매번 재계산. 측정으로 판단.
- **대량 리스트를 전부 렌더** → 초기 렌더·스크롤이 멈춘다. 가상화/페이지네이션.
- **이미지 크기 미지정** → 로딩 중 레이아웃이 점프(CLS). 크기를 예약한다.
- **고빈도 이벤트에 무방비** → 입력/스크롤마다 요청·재계산 폭주. 디바운스/스로틀.
- **프로덕션에 디버그 코드/거대 단일 번들** → 용량·정보 노출. console/debugger 제거, 청크 분리, 예산 강제.

## 4. 체크리스트
- [ ] 최적화 전후로 **측정**했는가 (번들 분석·런타임 프로파일·실사용자 지표)
- [ ] 화면/라우트 단위로 **코드 스플리팅**했는가
- [ ] 무거운 컴포넌트·라이브러리를 **사용 시점에 지연 로딩**하는가
- [ ] 불필요한 재렌더를 막고 반응성/추적 범위를 좁혔는가
- [ ] 비싼 순수 계산을 **메모이제이션**했는가 (남용 없이)
- [ ] 대량 리스트에 **가상화**(또는 페이지네이션)를 적용했는가
- [ ] 이미지에 차세대 포맷·지연 로딩·**크기 명시**를 적용했는가 (`image-optimization` 참조)
- [ ] 고빈도 이벤트에 **디바운스/스로틀**을 적용했는가
- [ ] **번들 예산**을 정하고, 프로덕션 빌드에서 디버그 제거·청크 분리를 적용했는가
- [ ] **LCP < 2.5s / INP < 200ms / CLS < 0.1** 기준을 만족하는가 (`web-vitals` 참조)

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React, Svelte, Angular, Next.js, Nuxt 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vue 3 + Vite

> 본문 1~4의 원칙·규칙을 Vue 3 리액티비티 API(`shallowRef`·`markRaw`·`v-memo`·`defineAsyncComponent`)·Vite 빌드 옵션·Vuetify 가상 스크롤·VueUse로 구현한 **코드 예시**다. 각 항목의 "왜"는 본문 같은 번호 규칙(코드 스플리팅·렌더 최적화 등)을 본다.

#### 라우트 코드 스플리팅 (본문 2-2)
```javascript
// src/router/index.js — 정적 import 대신 동적 import로 라우트별 chunk 분리
const routes = [
  { path: '/', component: () => import('@/views/Home.vue') },
  { path: '/report', component: () => import('@/views/Report.vue') }
]
```

#### 지연 로딩: `defineAsyncComponent` (본문 2-3)
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

#### 큰 라이브러리 동적 import (본문 2-3)
```javascript
// chart.js, mermaid, xlsx 등 무거운 라이브러리는 사용 시점에 로드
const showChart = async () => {
  const { Chart } = await import('chart.js/auto')
  new Chart(ctx, config)
}
```

#### 번들 분석 (본문 2-1)
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

#### 이미지 최적화 (본문 2-7, `image-optimization` 참조)
```vue
<picture>
  <source type="image/avif" srcset="/img/hero.avif" />
  <source type="image/webp" srcset="/img/hero.webp" />
  <img src="/img/hero.jpg" loading="lazy" decoding="async"
       srcset="/img/hero-480.jpg 480w, /img/hero-960.jpg 960w"
       sizes="(max-width: 600px) 480px, 960px" alt="" />
</picture>
```

#### 가상 스크롤 (본문 2-6)
```vue
<!-- 1000+ 행 테이블은 VVirtualScroll 또는 VDataTableVirtual 사용 -->
<template>
  <VVirtualScroll :items="rows" :item-height="48" height="400">
    <template #default="{ item }">
      <VListItem :title="item.name" />
    </template>
  </VVirtualScroll>
</template>
```

#### 메모이제이션 (본문 2-5)
```vue
<template>
  <!-- 변경되지 않을 정적 컨텐츠 -->
  <div v-memo="[item.id, item.status]">
    <ExpensiveCell :item="item" />
  </div>
</template>

<script setup>
import { computed, shallowRef } from 'vue'

const filtered = computed(() => list.value.filter(x => x.active))
const bigTree = shallowRef(initialTree) // 깊은 반응성 불필요
</script>
```

#### 리액티비티 범위 최소화 (본문 2-4 — Vue 전용)
```javascript
import { reactive, shallowReactive, markRaw } from 'vue'

// BAD: 큰 객체/배열을 deep reactive로 감쌈 (예: 10MB JSON tree)
const state = reactive({ hugeTree })

// GOOD: shallowReactive + markRaw로 추적 범위 축소
const state = shallowReactive({ hugeTree: markRaw(hugeTree) })
```

#### 디바운스/스로틀 (본문 2-8)
```javascript
import { useDebounceFn, useThrottleFn } from '@vueuse/core'

const onSearch = useDebounceFn((q) => fetchResults(q), 300)
const onScroll = useThrottleFn(() => updatePosition(), 100)
```

#### Web Vitals (본문 2-10, `web-vitals` 참조)
```html
<!-- LCP: 핵심 이미지 preload / INP: 큰 핸들러는 scheduler.yield로 분할 / CLS: 이미지 크기 명시 -->
<link rel="preload" as="image" href="/img/hero.avif" type="image/avif" />
```

#### Production 빌드 옵션 (본문 2-9)
```javascript
// vite.config.js
export default {
  build: {
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false, // Sentry용은 'hidden'
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
