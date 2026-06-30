---
name: Vue 3 + Vuetify 3 UI 개발 표준 (UI Vuetify)
description: Vue 3 + Vuetify 3 기반 화면 컴포넌트 생성 표준입니다. 그리드 레이아웃 계층, PascalCase 컴포넌트 네이밍, 반응형 속성, 유틸리티 클래스 사용 규칙을 정의하며 화면 SFC를 생성하거나 리뷰할 때 읽습니다. 키워드 Vuetify, VContainer, VRow, VCol, PascalCase, 그리드.
rules:
  - "레이아웃은 반드시 VContainer > VRow > VCol 계층 구조를 준수한다."
  - "모든 Vuetify 컴포넌트는 PascalCase(<V...>)로 작성하고 케밥 케이스는 금지한다."
  - "모든 VCol은 cols='12'와 함께 최소 하나 이상의 반응형 속성(md, lg 등)을 명시한다."
  - "인라인 스타일 대신 Vuetify 유틸리티 클래스(ma, pa 등)를 사용한다."
  - "동일 요구사항에 대해 항상 PascalCase 기반의 표준 그리드 구조를 출력한다."
tags:
  - "vuetify"
  - "VBtn"
  - "VCard"
  - "VDialog"
  - "VDataTable"
  - "v-btn"
  - "v-card"
  - "v-dialog"
  - "$vuetify"
  - "createVuetify"
---

# 🎨 Vue 3 + Vuetify 3 UI 개발 표준

> Vue 3 + Vuetify 3 화면 컴포넌트의 그리드 구조, 컴포넌트 네이밍, 반응형/스타일 규칙을 정의한다. 새 화면 SFC를 생성하거나 기존 화면을 리뷰할 때 읽는다.

## 1. 핵심 원칙
- 레이아웃은 반드시 `VContainer` > `VRow` > `VCol` 계층 구조를 준수한다.
- 모든 Vuetify 컴포넌트는 PascalCase(`<V...>`)로 작성하고 케밥 케이스는 금지한다.
- 모든 `VCol`은 `cols="12"`와 함께 최소 하나 이상의 반응형 속성(md, lg 등)을 명시한다.
- 인라인 스타일 대신 Vuetify 유틸리티 클래스(ma, pa 등)를 사용한다.
- 동일 요구사항에 대해 항상 PascalCase 기반의 표준 그리드 구조를 출력한다.

## 2. 규칙

### 2-1. 그리드 시스템 (GRID_SYSTEM_STRICT)
- 레이아웃은 반드시 `VContainer` > `VRow` > `VCol` 계층 구조를 준수한다.
- `VCol`은 `VRow`의 직계 자식으로 포함되어야 한다.

### 2-2. PascalCase 네이밍 (PASCAL_CASE_NAMING, CRITICAL)
- 모든 Vuetify 컴포넌트는 반드시 PascalCase를 사용한다.
  - [O]: `<VContainer>`, `<VRow>`, `<VCol>`, `<VBtn>`, `<VTextField>`
  - [X]: `<v-container>`, `<v-col>`, `<v-btn>` (케밥 케이스 절대 금지)

### 2-3. 반응형 속성 (RESPONSIVE_PROPS)
- 모든 `VCol`은 `cols="12"`와 함께 최소 하나 이상의 반응형 속성(md, lg 등)을 명시한다.

### 2-4. 스타일 / 유틸리티 클래스
- 인라인 스타일 대신 Vuetify 유틸리티 클래스(ma, pa 등)를 사용한다.

### 2-5. 작업 워크플로우
1. **[Analysis]**: PRD의 User Flow를 분석하여 화면 내 컴포넌트 배치 우선순위 결정.
2. **[Building]**: PascalCase 규칙을 적용하여 Vuetify 그리드 및 데이터 바인딩(v-model) 작성.
3. **[Verifying (Self-Check Gate)]**: 자체 검증 게이트로 PascalCase·그리드 계층·Acceptance Criteria·유틸리티 클래스 사용 여부를 점검.
4. **[Recording]**: 최종 .vue 단일 파일 컴포넌트(SFC) 출력.

### 2-6. 표준 출력 구조 (OUTPUT SCHEMA)
```vue
<template>
  <VContainer fluid>
    <VRow justify="center">
      <VCol cols="12" md="10">
        <VCard>
          <VCardTitle>화면 제목</VCardTitle>
          <VCardText>
            <VRow>
              <VCol cols="12" sm="6">
                <VTextField v-model="state.field" label="입력" />
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>

<script setup>
import { reactive } from 'vue'
const state = reactive({ field: '' })
</script>
```

## 3. 흔한 실수
- ❌ 케밥케이스(`<v-col>`) 사용 → PascalCase `<VCol>`.
- ❌ `VCol`을 `VRow` 직계 자식이 아닌 곳에 배치 → 계층을 준수한다.
- ❌ `cols`만 두고 반응형 속성(md/lg) 없음 → 화면 크기별 레이아웃이 깨진다.
- ❌ 인라인 스타일 사용 → Vuetify 유틸리티 클래스(ma/pa).
- ❌ `VContainer` 없이 `VRow` 직접 → `VContainer > VRow > VCol` 계층을 지킨다.

## 4. 체크리스트
- [ ] 모든 컴포넌트가 `<V...>` 형태의 PascalCase인가?
- [ ] `VCol`이 `VRow`의 직계 자식으로 포함되어 있는가?
- [ ] 레이아웃이 `VContainer` > `VRow` > `VCol` 계층을 준수하는가?
- [ ] 모든 `VCol`이 `cols="12"`와 함께 반응형 속성(md, lg 등)을 명시했는가?
- [ ] PRD의 `Acceptance Criteria` 기능을 모두 포함했는가?
- [ ] 인라인 스타일 대신 Vuetify 유틸리티 클래스(ma, pa 등)를 사용했는가?
