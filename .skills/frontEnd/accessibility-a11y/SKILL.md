---
name: 웹 접근성 (a11y) — Vue 3 + Vuetify
description: Vue 3 + Vuetify 스택의 접근성 구현 가이드. 컴포넌트 마크업·Focus Trap·동적 알림·reduced-motion·axe/Playwright 검증이 필요할 때 읽는다. 스택 중립 기준은 accessibility-wcag 참조.
rules:
  - "WCAG 2.1 AA 기준 출시 전 체크리스트를 통과시킨다"
  - "div 대신 button·nav·main 같은 시맨틱 태그를 우선 사용한다"
  - "아이콘 버튼에는 aria-label 로 이름을 제공한다"
  - "모든 인터랙션은 키보드(Tab·Enter·Esc)로 조작 가능하게 만든다"
  - "본문 텍스트는 색 대비 4.5:1 이상을 확보한다"
tags:
  - "aria-label"
  - "aria-hidden"
  - "aria-live"
  - "role="
  - "alt="
  - "tabindex"
  - "wcag"
---

# ♿ 웹 접근성 (a11y) — Vue 3 + Vuetify

> WCAG 2.1 AA를 Vue 3 + Vuetify 스택에서 구현하는 방법을 다룬다. 인터랙티브 UI·모달·동적 알림·애니메이션을 만들거나 검수할 때 읽는다.
>
> **스택 중립 원칙·기준은 [accessibility-wcag](../../design/accessibility-wcag/SKILL.md)가 권위(SoT)다.** POUR, 시맨틱 우선, 키보드 조작, `:focus-visible`, 색 대비 수치, 색만으로 정보 전달 금지 등은 그쪽을 따른다. 이 문서는 스택 고유 구현만 다룬다.
>
> 약어: **a11y**(accessibility) · **WCAG**(Web Content Accessibility Guidelines) · **ARIA**(Accessible Rich Internet Applications).
>
> 관련 스킬:
> - 디자인 토큰 / 색 대비: [design-system](../design-system/SKILL.md)
> - 다국어 (스크린리더 언어 속성): [i18n-internationalization](../i18n-internationalization/SKILL.md)
> - 테스트(`data-test`와 별개로 `aria-label` 활용): [frontend-testing](../frontend-testing/SKILL.md)

## 1. 적용 방침

- 일반 원칙은 `accessibility-wcag`를 따른다. 아래는 Vue/Vuetify에서 그 원칙을 어떻게 구현하는지다.
- Vuetify 컴포넌트는 대부분 적절한 의미 태그를 출력하지만, **레이아웃 랜드마크는 직접 챙겨야** 한다.
- **자동 검증 + 수동 검증 병행** — axe/Lighthouse 자동화에 더해 키보드·스크린리더 수동 검증 필수.

## 2. 스택 구현

### 2-1. 레이아웃 랜드마크 (시맨틱 마크업)

```vue
<template>
  <header><AppHeader /></header>
  <nav aria-label="주 메뉴"><AppNav /></nav>
  <main>
    <h1>{{ $t('dashboard.title') }}</h1>
    <section aria-labelledby="sensors-heading">
      <h2 id="sensors-heading">{{ $t('sensors.heading') }}</h2>
      <SensorList :items="sensors" />
    </section>
  </main>
  <footer><AppFooter /></footer>
</template>
```

> ❌ `<div class="header">` 만 쓰지 말고 `<header>`. 스크린리더가 랜드마크로 인식.

### 2-2. ARIA 자주 쓰는 패턴

| 상황 | 속성 |
|------|------|
| 아이콘 버튼 (텍스트 없음) | `aria-label="저장"` |
| 보조 설명 | `aria-describedby="hint-id"` |
| 토글 상태 | `aria-pressed="true"`, `aria-expanded="false"` |
| 동적 알림 (토스트) | `role="status" aria-live="polite"` |
| 에러 알림 | `role="alert" aria-live="assertive"` |
| 현재 페이지 (메뉴) | `aria-current="page"` |
| 숨김 텍스트 (스크린리더 전용) | `.sr-only` 클래스 |

```scss
// src/styles/_a11y.scss
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
```

### 2-3. 키보드 네비게이션 + Focus Trap

```vue
<script setup lang="ts">
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirm() }
}
</script>

<template>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="dlg-title"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <h2 id="dlg-title">확인</h2>
    <!-- ... -->
  </div>
</template>
```

**Focus Trap** (모달 안에서 Tab이 빠져나가지 않도록):
```bash
pnpm add focus-trap @vueuse/integrations
```
```ts
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef)
watch(isOpen, (v) => v ? activate() : deactivate())
```

### 2-4. 색 대비 점검

색 대비 수치 기준은 [accessibility-wcag](../../design/accessibility-wcag/SKILL.md) §2-4가 단일 출처다. [design-system](../design-system/SKILL.md) 토큰 정의 시점에 그 기준으로 점검한다. 검증 도구는 §2-7 참조.

### 2-5. 동적 콘텐츠 알림 (Live Region)

```vue
<template>
  <!-- 영구 컨테이너. 메시지만 갈아끼움 → 스크린리더가 자동 읽음 -->
  <div role="status" aria-live="polite" class="sr-only">
    {{ liveMessage }}
  </div>
</template>

<script setup lang="ts">
const liveMessage = ref('')
function showSavedNotice() {
  liveMessage.value = '저장되었습니다.'
  setTimeout(() => (liveMessage.value = ''), 3000)
}
</script>
```

### 2-6. Reduced Motion

```scss
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

GSAP 사용 시:
```ts
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  ScrollTrigger.disable()
}
```

### 2-7. 자동 검증 + 수동 검증

| 종류 | 도구 |
|------|------|
| 자동 (CI) | `axe-core`, `@axe-core/playwright` (E2E에 결합) |
| 자동 (로컬) | Chrome Lighthouse, axe DevTools 확장 |
| 수동 (필수) | 키보드만으로 핵심 플로우 통과, NVDA(Windows) 또는 VoiceOver(Mac) 로 한 화면 읽기 |

Playwright 통합:
```ts
import AxeBuilder from '@axe-core/playwright'

test('대시보드 접근성 위반 없음', async ({ page }) => {
  await page.goto('/dashboard')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

## 3. 스택 고유 실수

> 일반적인 실수(포커스 outline 제거, 아이콘 버튼 이름 누락, 제목 계층 건너뛰기, 색만으로 정보 전달)는 `accessibility-wcag` §3 참조.

- ❌ `<div @click>` 만 사용 → 키보드 사용자는 트리거 불가. `<button>` 또는 `v-btn` 사용
- ❌ Placeholder 만으로 라벨 대체 → 입력 시작하면 사라져 사용자가 무엇인지 잊음
- ❌ 자동 재생 영상/슬라이드 (사용자 제어 없음)
- ❌ 모달 열렸을 때 배경이 여전히 포커스 받음 (Focus Trap 누락)
- ❌ 동적 알림을 `aria-live` 없이 표시 → 시각 사용자는 보지만 스크린리더는 못 들음

## 4. 체크리스트 (출시 전, 스택 구현 관점)

> 키보드 조작·포커스 표시·색 대비·alt·`lang` 등 공통 항목은 `accessibility-wcag` §4 체크리스트를 함께 확인한다.

- [ ] 레이아웃이 `<header>/<nav>/<main>/<footer>` 랜드마크로 구성됐는가
- [ ] 폼 입력은 `<label for>` 또는 `aria-labelledby` 로 라벨 연결했는가
- [ ] 모달에 Focus Trap(`useFocusTrap`)과 Esc 닫기를 적용했는가
- [ ] 동적 콘텐츠 갱신을 `aria-live` 영역으로 안내하는가
- [ ] `prefers-reduced-motion: reduce` 사용자에게 큰 애니메이션을 비활성화했는가
- [ ] axe/Playwright 자동 검증과 키보드·스크린리더 수동 검증을 모두 수행했는가
