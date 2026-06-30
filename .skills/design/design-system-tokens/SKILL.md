---
name: 디자인 시스템 & 토큰 (Design System & Tokens)
description: 디자인 토큰(색상·타이포·간격·반경)의 값과 네이밍을 정의하는 단일 권위(SoT)이자 재사용 컴포넌트 라이브러리 구축 가이드. 새 화면·컴포넌트를 만들거나 스타일·토큰 이름을 정할 때 읽는다. 웹 적용·테마 전환은 FE `design-system` 스킬을 함께 본다. 키워드: design-token, css-variable, --color, theme, storybook, variant, token.
rules:
  - "모든 색상·간격·폰트·반경은 디자인 토큰 변수(CSS Custom Properties 또는 테마 객체)로만 쓰고 하드코딩하지 않는다."
  - "컴포넌트는 props로 variant·size·state를 받아 내부에서 토큰을 조합한다 — 외부에서 직접 스타일 오버라이드 금지."
  - "신규 컴포넌트 작성 전 기존 컴포넌트 재사용 가능성을 먼저 확인한다."
  - "컴포넌트 문서(Storybook 또는 README)에 usage example 을 필수로 포함한다."
  - "토큰 이름은 계층(category-role-modifier, 예: color-text-primary) 구조를 따른다."
tags:
  - "design-token"
  - "css-variable"
  - "--color"
  - "theme"
  - "storybook"
  - "variant"
  - "token"
---

# 🎨 디자인 시스템 & 토큰

> UI의 시각 결정값을 토큰 단일 소스로 관리해 브랜드 일관성과 테마 전환을 보장한다. 토큰의 **값·네이밍을 정의하는 권위(SoT)**가 이 스킬이다. 새 화면·컴포넌트를 만들거나 스타일을 정할 때 읽는다. 웹 적용·테마 우선순위·프레임워크별 테마 전환은 FE `design-system` 스킬에서 다룬다.

## 1. 핵심 원칙
- 모든 색상·간격·폰트·반경은 디자인 토큰 변수(CSS Custom Properties 또는 테마 객체)로만 쓰고 하드코딩하지 않는다.
- 컴포넌트는 props로 variant·size·state를 받아 내부에서 토큰을 조합한다 — 외부에서 직접 스타일 오버라이드 금지.
- 신규 컴포넌트 작성 전 기존 컴포넌트 재사용 가능성을 먼저 확인한다.
- 컴포넌트 문서(Storybook 또는 README)에 usage example 을 필수로 포함한다.
- 토큰 이름은 계층(category-role-modifier, 예: color-text-primary) 구조를 따른다.

## 2. 규칙

### 2-1. 토큰 계층 구조
디자인 토큰은 UI의 시각적 결정값을 코드화한 변수다. 단일 소스(SoT)로 관리한다.
```
Primitive tokens  → semantic tokens → component tokens
#3B82F6           → color-text-link → button-label-color
```

### 2-2. 토큰만 참조 (하드코딩 금지)
```css
/* ❌ 금지 — 값 하드코딩, 테마 전환·일관성 깨짐 */
.btn { color: #3B82F6; padding: 16px; border-radius: 8px; }

/* ✅ 권장 — 토큰 참조 */
:root {
  /* Primitive */
  --color-blue-500: #3B82F6;
  --space-4: 16px;

  /* Semantic */
  --color-text-primary: var(--color-gray-900);
  --color-text-link: var(--color-blue-500);
  --radius-button: 8px;
}
.btn { color: var(--color-text-link); padding: var(--space-4); border-radius: var(--radius-button); }
```

### 2-3. 컴포넌트 설계 원칙
- **단일 책임**: 컴포넌트 하나가 하나의 역할만 담당.
- **Prop API 안정성**: breaking change는 major 버전업으로만 허용.
- **Default props**: 모든 필수 prop에 합리적 기본값 제공.
- **Composition over inheritance**: 컴포넌트 조합으로 복잡도 처리.

### 2-4. 토큰 명명 규칙

| 레이어 | 패턴 | 예시 |
|--------|------|------|
| Primitive | `{category}-{scale}` | `color-gray-500`, `space-2` |
| Semantic | `{category}-{role}` | `color-text-primary`, `color-bg-surface` |
| Component | `{component}-{element}-{property}` | `button-label-color` |

## 3. 흔한 실수
- 값 하드코딩 → 테마 전환·리브랜딩 시 전부 수정해야 한다.
- 외부에서 컴포넌트 스타일 오버라이드 → variant 체계가 무너진다.
- 비슷한 컴포넌트 중복 생성 → 라이브러리가 비대해진다.
- usage example 누락 → 사용법을 추측하게 된다.

## 4. 체크리스트
- [ ] 색·간격·폰트·반경을 모두 토큰으로만 참조했는가
- [ ] variant·size·state를 props로 받아 내부에서 토큰을 조합했는가
- [ ] 기존 컴포넌트 재사용 가능성을 먼저 확인했는가
- [ ] 토큰 이름이 계층(primitive/semantic/component) 규칙을 따르는가
- [ ] Storybook/README에 usage example 을 포함했는가
