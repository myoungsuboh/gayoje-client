---
name: Web Accessibility — WCAG 2.1 AA (stack-neutral)
description: A stack-neutral accessibility source of truth (SoT) based on WCAG 2.1 AA. Read when building a new screen/component or checking keyboard navigation, color contrast, and screen reader support. Keywords aria-label, role, alt, tabindex, wcag, focus-trap, color contrast.
rules:
  - "Every interactive element must be operable with the keyboard alone (Tab·Enter·Escape·arrow keys)."
  - "Use meaningful alt for images and alt='' for decorative images. Provide accessible names for icon buttons and links."
  - "Do not convey information by color alone (use color + icon/text together)."
  - "Overlays such as modals/drawers must implement a focus trap and close with Esc."
tags:
  - "aria-label"
  - "aria-hidden"
  - "aria-live"
  - "role="
  - "alt="
  - "tabindex"
  - "wcag"
  - "focus-trap"
  - "aria-describedby"
---

# ♿ Web Accessibility — WCAG 2.1 AA

> A stack-neutral standard (SoT) for building UIs that anyone can use, based on WCAG 2.1 AA. Read when building a new screen/component or checking accessibility.
>
> For Vue/Vuetify implementation (component markup, Focus Trap, axe/Playwright, reduced-motion), see `accessibility-a11y`.

## 1. Core Principles

POUR — every accessibility criterion reduces to these four.

| Principle | Meaning | Key criteria |
|------|------|-----------|
| Perceivable | Can be perceived | alt text, color contrast, captions |
| Operable | Can be operated | keyboard, enough time, no seizure risk |
| Understandable | Can be understood | language declaration, consistent navigation, error guidance |
| Robust | Robust | semantic HTML, correct ARIA usage |

Core conventions (details in §2):
- Every interactive element must be operable with the keyboard alone (Tab·Enter·Escape·arrow keys).
- Use meaningful alt for images and `alt=""` for decorative images. Provide accessible names for icon buttons and links.
- Do not convey information by color alone (use color + icon/text together).
- Overlays such as modals/drawers must implement a focus trap and close with Esc.

## 2. Rules

### 2-1. Semantic markup
```html
<!-- ❌ Forbidden — meaningless div, screen reader doesn't know it's a button -->
<div class="btn" onclick="...">Save</div>

<!-- ✅ Recommended — convey the role with a semantic tag -->
<button type="button">Save</button>
```
- Use semantic tags `<button>`, `<nav>`, `<main>`, `<header>`, `<footer>` instead of `<div>`.
- Maintain the heading hierarchy (`h1` → `h2` → `h3`, no skipping).
- Declare `lang="ko"` (or the relevant language).

### 2-2. Keyboard navigation
```css
/* ❌ Forbidden — focus is not visible */
:focus { outline: none; }

/* ✅ Recommended — keep the focus style */
:focus-visible { outline: 2px solid var(--color-focus-ring); }
```
```html
<!-- modal focus trap example -->
<dialog role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">...</h2>
  <!-- focusable elements -->
  <button>Close</button>
</dialog>
```
- Positive `tabindex` (`tabindex="5"`) breaks the tab order, so it is forbidden.

### 2-3. ARIA usage principles
```html
<!-- ❌ Forbidden — icon only, no name -->
<button><svg .../></button>

<!-- ✅ Recommended — provide an accessible name -->
<button aria-label="Close"><svg aria-hidden="true" .../></button>
```
- If HTML semantics solve it, do not add ARIA.
- `aria-live="polite"` — announce dynamic content changes (loading complete, errors, etc.).
- `aria-expanded`, `aria-controls` — convey accordion/dropdown state.

### 2-4. Color contrast criteria

This table is the single source of truth (SoT) for color contrast values.

| Text type | Minimum contrast |
|-------------|-----------|
| Normal text | 4.5 : 1 |
| Large text (18pt normal / 14pt Bold) | 3 : 1 |
| Non-text UI (icons·input borders) | 3 : 1 |

## 3. Common Mistakes
- Removing the focus indicator with `outline: none` → keyboard users lose their position.
- Not providing a name for an icon button → screen readers read only "button."
- Skipping the heading hierarchy (h1 → h4) → the document structure breaks.
- Conveying information by color alone → colorblind/low-vision users cannot distinguish it.

## 4. Checklist
- [ ] Can every interactive element be operated with the keyboard alone?
- [ ] Is the focus style visible (outline not removed)?
- [ ] Did you provide image alt / accessible names for icon buttons?
- [ ] Do you meet 4.5:1 for body text and 3:1 for large/non-text color contrast?
- [ ] Does the modal implement a focus trap + Esc close?
- [ ] Are the heading hierarchy (h1→h2→h3) and `lang` declaration correct?
