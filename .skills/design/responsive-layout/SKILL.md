---
name: 반응형 레이아웃 & 적응형 디자인
description: Mobile-first CSS, 유연한 그리드, 뷰포트별 타이포그래피·간격 조정으로 모든 화면에서 최적 UX를 제공하는 반응형 구현 가이드. 새 화면을 만들거나 레이아웃·브레이크포인트·터치 대응을 정할 때 읽는다. 키워드: @media, min-width, grid-template, flex, srcset, container, clamp(, vw, rem.
rules:
  - "Mobile-first 접근 — 기본 스타일을 모바일 기준으로 작성하고 min-width 미디어 쿼리로 확장한다."
  - "레이아웃은 CSS Grid와 Flexbox로 구현하고, 고정 px 레이아웃은 사용하지 않는다."
  - "이미지·미디어는 max-width:100%를 기본으로 하고, 반응형 srcset/sizes 속성을 사용한다."
  - "터치 타깃은 플랫폼별 최소 크기(iOS 44pt·Android 48dp·WCAG 2.5.5 24px 등) 이상을 유지한다."
  - "뷰포트 폭이 아닌 컨테이너 폭으로 반응하는 경우 container queries를 활용한다."
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

# 📱 반응형 레이아웃 & 적응형 디자인

> Mobile-first로 모든 화면 폭에서 최적 UX를 제공한다. 새 화면을 만들거나 레이아웃·브레이크포인트·터치 대응을 정할 때 읽는다. 웹 반응형의 단일 출처(SoT)이며, 스택별(예: Vuetify) 구현은 `responsive-styling` 스킬에서 본다.

## 1. 핵심 원칙
- Mobile-first 접근 — 기본 스타일을 모바일 기준으로 작성하고 `min-width` 미디어 쿼리로 확장한다.
- 레이아웃은 CSS Grid와 Flexbox로 구현하고, 고정 px 레이아웃은 사용하지 않는다.
- 이미지·미디어는 `max-width:100%`를 기본으로 하고, 반응형 `srcset`/`sizes` 속성을 사용한다.
- 터치 타깃은 플랫폼별 최소 크기(iOS 44pt·Android 48dp·WCAG 2.5.5 24px 등) 이상을 유지한다.
- 뷰포트 폭이 아닌 컨테이너 폭으로 반응하는 경우 container queries를 활용한다.

## 2. 규칙

### 2-1. 브레이크포인트 전략 (Mobile-first)
기본 브레이크포인트는 프로젝트 토큰화를 권장한다.

```css
/* ✅ 권장 — 기본: 모바일 (<640px) */
.container { padding: 0 16px; }

/* 태블릿 */
@media (min-width: 640px) { .container { padding: 0 24px; } }

/* 데스크톱 */
@media (min-width: 1024px) { .container { max-width: 1200px; margin: 0 auto; } }
```

### 2-2. 유체 타이포그래피
```css
/* ✅ 권장 — clamp(최소, 선호, 최대)로 미디어 쿼리 없이 유연한 크기 */
h1 { font-size: clamp(1.5rem, 4vw, 2.5rem); }
p  { font-size: clamp(1rem, 2vw, 1.125rem); }
```

### 2-3. Grid 레이아웃 패턴
```css
/* ✅ 권장 — 자동 채우기 카드 그리드 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
```

### 2-4. Container Queries (컴포넌트 수준 반응)
```css
/* ✅ 권장 — 뷰포트가 아닌 컨테이너 폭으로 반응 */
.card-wrapper { container-type: inline-size; }

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

### 2-5. 터치 최적화
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

터치 타깃은 플랫폼별 최소 크기 이상을 패딩으로 확보한다(위 핵심 원칙 참조).

## 3. 흔한 실수
- 고정 px 레이아웃 사용 → 좁은 화면에서 가로 스크롤이 생긴다.
- desktop-first로 작성 후 `max-width`로 축소 → 모바일 대응이 후순위로 밀린다.
- 이미지에 `max-width:100%` 누락 → 컨테이너를 넘쳐 레이아웃이 깨진다.
- 터치 타깃이 플랫폼 최소 미만 → 모바일에서 누르기 어렵다.
- hover 전용 UX를 터치 기기에 노출 → 인터랙션이 동작하지 않는다.

## 4. 체크리스트
- [ ] 기본 스타일을 모바일 기준으로 작성하고 `min-width`로 확장했는가
- [ ] 레이아웃을 Grid/Flexbox로 구현하고 고정 px를 피했는가
- [ ] 이미지·미디어에 `max-width:100%`와 `srcset`/`sizes`를 적용했는가
- [ ] 터치 타깃을 플랫폼별 최소 크기 이상으로 확보했는가
- [ ] hover 전용 UX를 `@media (hover: hover)`로 제한했는가
