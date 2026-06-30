---
name: 반응형 스타일 표준 (Responsive Styling)
description: 반응형 원칙은 `responsive-layout`(SoT)을 따르고, 여기서는 그 표준을 스택(Vue 3 + Vuetify)에 매핑하는 구현만 다룬다 — Vuetify 브레이크포인트·VRow/VCol 그리드·spacing 유틸. 화면을 Vuetify로 반응형 구성하거나 브레이크포인트·여백·폰트 크기를 정할 때 읽는다. 키워드: responsive, mobile-first, breakpoints, clamp, grid, viewport, touch target, Vuetify, VRow, VCol.
rules:
  - "레이아웃은 정의된 브레이크포인트 기준으로 분기한다"
  - "폰트 크기는 clamp 기반 유동 타이포그래피로 설정한다"
  - "간격은 디자인 토큰의 spacing 단위를 사용한다"
  - "모바일 우선으로 작성하고 큰 화면을 점진 확장한다"
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

# 📐 반응형 스타일 표준 (Responsive Styling)

> 반응형의 개념·원칙(모바일 퍼스트, 일관된 브레이크포인트, 유체 타이포그래피, 유동 그리드, 터치 타겟 등)은 `responsive-layout` 스킬이 단일 출처(SoT)다. 이 스킬은 그 표준을 우리 스택(Vue 3 + Vuetify)에서 어떻게 구현하는지만 다룬다. Vuetify로 화면을 반응형으로 구성하거나 브레이크포인트·여백·폰트 크기를 결정할 때, `responsive-layout`과 함께 읽는다.

## 1. 원칙은 `responsive-layout`을 따른다 (위임)
반응형의 모든 중립 원칙 — **모바일 퍼스트**(`min-width`로 확장), **일관된 브레이크포인트**(콘텐츠가 깨지는 지점, 매직 넘버 금지), **유체 타이포그래피**(`clamp()` + `rem`), **유동 그리드/유연 단위**(`%`/`fr`/`minmax`), **플랫폼별 터치 타겟·가로 스크롤 방지** — 은 `responsive-layout` 스킬이 표준(SoT)이다. 여기서 반복하지 않으니 그쪽을 따른다.

- **여백을 뷰포트별로 차등**하는 원칙도 `responsive-layout`을 따르되, 여백·간격 **값의 토큰화/통일**은 `design-system` 스킬을 따른다.
- 아래는 이 표준을 우리 스택(Vue 3 + Vuetify)에서 구현하는 방법, 즉 **스택 고유분**만 다룬다.

## 2. Vue 3 + Vuetify 구현

Vuetify는 자체 브레이크포인트 체계(`xs`/`sm`/`md`/`lg`/`xl`)와 그리드(`VRow`/`VCol`), 간격 유틸(`pa-*`/`ma-*`)을 제공한다. `responsive-layout`의 표준 개념을 Vuetify 관용구로 매핑한 것이다.

### 2-1. 뷰포트 기준 (Breakpoints)
- **Mobile (xs)**: `0px` ~ `599px`
- **Tablet (sm, md)**: `600px` ~ `1279px`
- **Web (lg+)**: `1280px` 이상

### 2-2. 그리드 — VRow / VCol
- 반응형 컬럼은 `VRow`/`VCol`로 구성하고, 브레이크포인트 prop(`cols`, `sm`, `md`, `lg`)으로 열 수를 단계별로 지정한다.

```vue
<v-row>
  <!-- 모바일 12칸(1열) → 태블릿 6칸(2열) → 데스크톱 4칸(3열) -->
  <v-col cols="12" sm="6" lg="4" v-for="item in items" :key="item.id">
    <v-card>{{ item.name }}</v-card>
  </v-col>
</v-row>
```

### 2-3. 간격 — spacing 유틸
- 여백은 `pa-*`(padding)/`ma-*`(margin) 유틸로 주고, 뷰포트별 차등은 브레이크포인트 접두사로 표현한다. 값의 토큰화/통일은 `design-system`을 따른다.
- 예: 모바일 `pa-4`, 데스크톱 `pa-8` → `pa-4 pa-lg-8`.

```vue
<!-- 모바일은 pa-4(16px), lg 이상에서 pa-8(32px) -->
<v-sheet class="pa-4 pa-lg-8">...</v-sheet>
```

### 2-4. 유체 타이포그래피
- Vuetify 타이포 클래스(`text-h4` 등)와 별개로, `responsive-layout`의 표준 `clamp()`를 `scoped` 스타일에 그대로 쓸 수 있다.

```vue
<style scoped>
.page-title { font-size: clamp(1.5rem, 4vw + 1rem, 3rem); }
</style>
```
