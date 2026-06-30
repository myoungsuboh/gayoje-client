---
name: Responsive Layout & Adaptive Design
description: A responsive implementation guide that delivers optimal UX on every screen via mobile-first CSS, flexible grids, and per-viewport typography/spacing adjustments. Read this when building a new screen or deciding layout/breakpoints/touch handling. Keywords: @media, min-width, grid-template, flex, srcset, container, clamp(, vw, rem.
rules:
  - "Mobile-first approach — write base styles for mobile and expand with min-width media queries."
  - "Implement layouts with CSS Grid and Flexbox, and do not use fixed-px layouts."
  - "Default images/media to max-width:100% and use the responsive srcset/sizes attributes."
  - "Keep touch targets at or above the per-platform minimum size (iOS 44pt·Android 48dp·WCAG 2.5.5 24px, etc.)."
  - "When responding to container width rather than viewport width, use container queries."
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

# 📱 Responsive Layout & Adaptive Design

> Deliver optimal UX at every screen width with mobile-first. Read this when building a new screen or deciding layout/breakpoints/touch handling. This is the single source of truth (SoT) for web responsiveness; for stack-specific (e.g., Vuetify) implementation, see the `responsive-styling` skill.

## 1. Core Principles
- Mobile-first approach — write base styles for mobile and expand with `min-width` media queries.
- Implement layouts with CSS Grid and Flexbox, and do not use fixed-px layouts.
- Default images/media to `max-width:100%` and use the responsive `srcset`/`sizes` attributes.
- Keep touch targets at or above the per-platform minimum size (iOS 44pt·Android 48dp·WCAG 2.5.5 24px, etc.).
- When responding to container width rather than viewport width, use container queries.

## 2. Rules

### 2-1. Breakpoint Strategy (Mobile-first)
Tokenizing the base breakpoints per project is recommended.

```css
/* ✅ 권장 — 기본: 모바일 (<640px) */
.container { padding: 0 16px; }

/* 태블릿 */
@media (min-width: 640px) { .container { padding: 0 24px; } }

/* 데스크톱 */
@media (min-width: 1024px) { .container { max-width: 1200px; margin: 0 auto; } }
```

### 2-2. Fluid Typography
```css
/* ✅ 권장 — clamp(최소, 선호, 최대)로 미디어 쿼리 없이 유연한 크기 */
h1 { font-size: clamp(1.5rem, 4vw, 2.5rem); }
p  { font-size: clamp(1rem, 2vw, 1.125rem); }
```

### 2-3. Grid Layout Pattern
```css
/* ✅ 권장 — 자동 채우기 카드 그리드 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
```

### 2-4. Container Queries (Component-level Response)
```css
/* ✅ 권장 — 뷰포트가 아닌 컨테이너 폭으로 반응 */
.card-wrapper { container-type: inline-size; }

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

### 2-5. Touch Optimization
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

Secure touch targets at or above the per-platform minimum size via padding (see the core principles above).

## 3. Common Mistakes
- Using fixed-px layouts → horizontal scrolling appears on narrow screens.
- Writing desktop-first and then shrinking with `max-width` → mobile handling gets deprioritized.
- Omitting `max-width:100%` on images → they overflow the container and break the layout.
- Touch targets below the platform minimum → hard to tap on mobile.
- Exposing hover-only UX on touch devices → the interaction does not work.

## 4. Checklist
- [ ] Did you write base styles for mobile and expand with `min-width`?
- [ ] Did you implement layouts with Grid/Flexbox and avoid fixed px?
- [ ] Did you apply `max-width:100%` and `srcset`/`sizes` to images/media?
- [ ] Did you secure touch targets at or above the per-platform minimum size?
- [ ] Did you limit hover-only UX with `@media (hover: hover)`?
