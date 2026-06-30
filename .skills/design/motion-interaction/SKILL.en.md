---
name: Motion & Microinteractions
description: An implementation standard for visualizing feedback, transitions, and state changes with purposeful animation and microinteractions while respecting prefers-reduced-motion. Read this when adding transition effects/animations or deciding motion timing/performance. Keywords: transition, animation, prefers-reduced-motion, transform, opacity, keyframes, ease.
rules:
  - "Disable or minimize every animation under the prefers-reduced-motion: reduce media query."
  - "Default transition durations to 100–300ms, and keep complex layout transitions at 500ms or under."
  - "Use ease-in for elements leaving, ease-out for entering, and ease-in-out for state transitions."
  - "Do not use animation purely as decoration without a UX purpose (feedback, hierarchy, relationship)."
  - "For performance, animate only transform·opacity and avoid width·height·top animations that trigger layout."
tags:
  - "transition"
  - "animation"
  - "prefers-reduced-motion"
  - "transform"
  - "opacity"
  - "keyframes"
  - "ease"
---

# 🎬 Motion & Microinteractions

> Visualize feedback, transitions, and state with purposeful motion while keeping accessibility and performance. Read this when adding animations or deciding transition timing.

## 1. Core Principles
- Disable or minimize every animation under the prefers-reduced-motion: reduce media query.
- Default transition durations to 100–300ms, and keep complex layout transitions at 500ms or under.
- Use ease-in for elements leaving, ease-out for entering, and ease-in-out for state transitions.
- Do not use animation purely as decoration without a UX purpose (feedback, hierarchy, relationship).
- For performance, animate only transform·opacity and avoid width·height·top animations that trigger layout.

## 2. Rules

### 2-1. Accessible Motion
```css
/* 기본 전환 */
.btn { transition: background-color 150ms ease-out, transform 150ms ease-out; }

/* ✅ 권장 — 모션 감소 요청 시 비활성화 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 2-2. Transition Timing Guide
| Type | Duration | Use |
|------|------|------|
| Instant feedback | 100ms | Button hover/active |
| Simple transition | 150–200ms | Dropdown, tooltip |
| Content transition | 250–300ms | Opening a modal, switching tabs |
| Complex layout | 400–500ms | Sidebar, panel |

### 2-3. Microinteraction Patterns
Loading feedback:
```css
@keyframes skeleton-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}
```

Success/error feedback:
- Success: green checkmark + concise text, auto-dismiss after 2–3 seconds
- Error: red border + shake animation (transform: translateX), manual dismiss

### 2-4. GPU Acceleration (Composited Layer)
Animating only transform·opacity is handled on a GPU composite layer, so there is no main-thread blocking.
```css
/* ✅ 좋음 */ .card:hover { transform: translateY(-4px); opacity: 0.9; }
/* ❌ 나쁨 */ .card:hover { top: -4px; height: 200px; } /* layout 유발 */
```

## 3. Common Mistakes
- Not handling prefers-reduced-motion → causes discomfort and dizziness for motion-sensitive users.
- Animating width·height·top·left → causes jank from layout reflow.
- Overusing purposeless decorative motion → makes the interface feel cluttered and slow.
- Excessive transition durations (over 500ms) → makes responses feel sluggish.

## 4. Checklist
- [ ] Did you disable/minimize motion under prefers-reduced-motion: reduce?
- [ ] Are transition durations within the per-use guide (100–500ms)?
- [ ] Did you use easing appropriate to enter/leave/transition (ease-out/in/in-out)?
- [ ] Did you animate only transform·opacity and avoid layout-triggering properties?
- [ ] Does every motion have a UX purpose (feedback, hierarchy, relationship)?
