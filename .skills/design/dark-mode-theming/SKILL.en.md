---
name: Dark Mode & Theming System
description: A guide for implementing light/dark mode and extensible themes with CSS Custom Properties and prefers-color-scheme. Read it when applying colors to a new screen, building a theme toggle, detecting the system theme, or deciding dark mode colors. Keywords: prefers-color-scheme, data-theme, color-scheme, dark, localStorage, currentColor, --color-.
rules:
  - "Reference colors only through CSS Custom Properties (semantic tokens), and redefine light/dark values within their respective scopes."
  - "Auto-detect the system theme with prefers-color-scheme, while also supporting manual user selection (light/dark/system)."
  - "In dark mode, use a dark gray family (e.g. #0f172a) instead of pure black (#000000) to reduce eye strain."
  - "Apply filters to images and videos case by case only when they are excessively bright in dark mode (consider separate assets for high-saturation photos), and use currentColor for SVGs."
  - "Save the theme choice in localStorage and prevent flicker (FOUC) on initial load."
tags:
  - "prefers-color-scheme"
  - "data-theme"
  - "color-scheme"
  - "dark"
  - "localStorage"
  - "currentColor"
  - "--color-"
---

# 🌙 Dark Mode & Theming System

> Implement light/dark/extended themes consistently with a single set of semantic tokens. Read this when applying colors to a new screen or handling theme switching.

## 1. Core Principles
- Reference colors only through CSS Custom Properties (semantic tokens), and redefine light/dark values within their respective scopes.
- Auto-detect the system theme with `prefers-color-scheme`, while also supporting manual user selection (light/dark/system).
- In dark mode, use a dark gray family (e.g. #0f172a) instead of pure black (#000000) to reduce eye strain.
- Apply filters to images and videos case by case only when they are excessively bright in dark mode (consider separate assets for high-saturation photos), and use `currentColor` for SVGs.
- Save the theme choice in localStorage and prevent flicker (FOUC) on initial load.

## 2. Rules

### 2-1. Semantic-Token-Based Theming
```css
/* ❌ 금지 — 하드코딩 색, 다크모드에서 재정의 불가 */
.card { background: #ffffff; color: #0f172a; }

/* ✅ 권장 — 시맨틱 토큰 참조 + 스코프별 재정의 */
:root {
  --color-bg-primary:   #ffffff;
  --color-text-primary: #0f172a;
  --color-surface:      #f8fafc;
  --color-border:       #e2e8f0;
}

[data-theme="dark"], @media (prefers-color-scheme: dark) {
  --color-bg-primary:   #0f172a;
  --color-text-primary: #f1f5f9;
  --color-surface:      #1e293b;
  --color-border:       #334155;
}
```

### 2-2. Preventing FOUC (Flicker-Free Initial Load)
Apply the class immediately with an inline script in the HTML `<head>` — settle the theme before render.
```html
<script>
  (function(){
    const t = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute(
      'data-theme',
      t === 'dark' || (!t && prefersDark) ? 'dark' : 'light'
    );
  })();
</script>
```

### 2-3. Theme Toggle Implementation Pattern
```js
function setTheme(value) {  // 'light' | 'dark' | 'system'
  localStorage.setItem('theme', value);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = value === 'system' ? (prefersDark ? 'dark' : 'light') : value;
  document.documentElement.setAttribute('data-theme', resolved);
}
```

### 2-4. Handling Images & Media in Dark Mode
```css
/* 사진 이미지 — 밝기 살짝 낮춤 (필요한 경우만) */
[data-theme="dark"] img:not([data-no-darken]) {
  filter: brightness(0.85) contrast(1.05);
}
/* SVG 아이콘 — 색상 상속 */
.icon { fill: currentColor; }
```

## 3. Common Mistakes
- Hardcoding colors → they break in dark mode because they cannot be redefined.
- Omitting the initial inline script → light→dark flicker (FOUC) on refresh.
- Using pure black in dark mode → contrast is excessive and tires the eyes.
- Applying a blanket filter to all images → high-saturation photos turn murky.

## 4. Checklist
- [ ] Are all colors referenced only through semantic tokens (`--color-*`)?
- [ ] Are all three modes (light/dark/system) supported?
- [ ] Is FOUC prevented with an initial inline script?
- [ ] Is the theme choice saved to and restored from localStorage?
- [ ] Are dark mode colors a gray family rather than pure black?
- [ ] Do SVGs use currentColor and photos use case-by-case filters?
