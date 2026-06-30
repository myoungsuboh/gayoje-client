---
name: Web Accessibility (a11y) — Vue 3 + Vuetify
description: Accessibility implementation guide for the Vue 3 + Vuetify stack. Read when you need component markup, focus traps, dynamic announcements, reduced-motion, or axe/Playwright verification. For stack-neutral criteria, see accessibility-wcag.
rules:
  - "Pass the pre-launch checklist against the WCAG 2.1 AA criteria"
  - "Prefer semantic tags like button, nav, and main over div"
  - "Provide a name for icon buttons via aria-label"
  - "Make every interaction operable by keyboard (Tab, Enter, Esc)"
  - "Ensure body text has a color contrast of at least 4.5:1"
tags:
  - "aria-label"
  - "aria-hidden"
  - "aria-live"
  - "role="
  - "alt="
  - "tabindex"
  - "wcag"
---

# ♿ Web Accessibility (a11y) — Vue 3 + Vuetify

> Covers how to implement WCAG 2.1 AA on the Vue 3 + Vuetify stack. Read when building or reviewing interactive UI, modals, dynamic announcements, or animations.
>
> **For stack-neutral principles and criteria, [accessibility-wcag](../../design/accessibility-wcag/SKILL.md) is the authority (SoT).** Follow it for POUR, semantics-first, keyboard operation, `:focus-visible`, color-contrast numbers, no information conveyed by color alone, etc. This document covers only stack-specific implementation.
>
> Abbreviations: **a11y** (accessibility) · **WCAG** (Web Content Accessibility Guidelines) · **ARIA** (Accessible Rich Internet Applications).
>
> Related skills:
> - Design tokens / color contrast: [design-system](../design-system/SKILL.md)
> - Internationalization (screen-reader language attributes): [i18n-internationalization](../i18n-internationalization/SKILL.md)
> - Testing (using `aria-label` separately from `data-test`): [frontend-testing](../frontend-testing/SKILL.md)

## 1. Application Policy

- For general principles, follow `accessibility-wcag`. The following is how to implement those principles in Vue/Vuetify.
- Vuetify components emit appropriate semantic tags in most cases, but **you must handle layout landmarks yourself**.
- **Combine automated and manual verification** — in addition to axe/Lighthouse automation, keyboard and screen-reader manual verification is mandatory.

## 2. Stack Implementation

### 2-1. Layout Landmarks (Semantic Markup)

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

> ❌ Don't use only `<div class="header">`; use `<header>`. Screen readers recognize it as a landmark.

### 2-2. Common ARIA Patterns

| Situation | Attribute |
|------|------|
| Icon button (no text) | `aria-label="저장"` |
| Supplementary description | `aria-describedby="hint-id"` |
| Toggle state | `aria-pressed="true"`, `aria-expanded="false"` |
| Dynamic announcement (toast) | `role="status" aria-live="polite"` |
| Error announcement | `role="alert" aria-live="assertive"` |
| Current page (menu) | `aria-current="page"` |
| Hidden text (screen-reader only) | `.sr-only` class |

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

### 2-3. Keyboard Navigation + Focus Trap

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

**Focus Trap** (so Tab does not escape the modal):
```bash
pnpm add focus-trap @vueuse/integrations
```
```ts
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef)
watch(isOpen, (v) => v ? activate() : deactivate())
```

### 2-4. Color Contrast Check

The color-contrast numeric criteria have a single source in [accessibility-wcag](../../design/accessibility-wcag/SKILL.md) §2-4. Check against that criterion when defining [design-system](../design-system/SKILL.md) tokens. For verification tools, see §2-7.

### 2-5. Dynamic Content Announcements (Live Region)

```vue
<template>
  <!-- Persistent container. Only the message is swapped → screen reader reads it automatically -->
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

When using GSAP:
```ts
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  ScrollTrigger.disable()
}
```

### 2-7. Automated + Manual Verification

| Type | Tool |
|------|------|
| Automated (CI) | `axe-core`, `@axe-core/playwright` (combined with E2E) |
| Automated (local) | Chrome Lighthouse, axe DevTools extension |
| Manual (mandatory) | Pass core flows with keyboard only; read one screen with NVDA (Windows) or VoiceOver (Mac) |

Playwright integration:
```ts
import AxeBuilder from '@axe-core/playwright'

test('대시보드 접근성 위반 없음', async ({ page }) => {
  await page.goto('/dashboard')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

## 3. Stack-Specific Mistakes

> For common mistakes (removing focus outline, missing icon-button names, skipping heading hierarchy, conveying information by color alone), see `accessibility-wcag` §3.

- ❌ Using only `<div @click>` → keyboard users cannot trigger it. Use `<button>` or `v-btn`
- ❌ Replacing a label with only a placeholder → it disappears once typing starts, so the user forgets what it was
- ❌ Auto-playing video/slides (no user control)
- ❌ Background still receives focus when a modal is open (missing focus trap)
- ❌ Showing a dynamic announcement without `aria-live` → sighted users see it but screen readers cannot hear it

## 4. Checklist (Pre-launch, Stack-Implementation View)

> For common items such as keyboard operation, focus indicators, color contrast, alt, and `lang`, also check the `accessibility-wcag` §4 checklist.

- [ ] Is the layout composed of `<header>/<nav>/<main>/<footer>` landmarks?
- [ ] Are form inputs label-linked via `<label for>` or `aria-labelledby`?
- [ ] Is a focus trap (`useFocusTrap`) and Esc-to-close applied to modals?
- [ ] Are dynamic content updates announced through an `aria-live` region?
- [ ] Are large animations disabled for `prefers-reduced-motion: reduce` users?
- [ ] Have you performed both axe/Playwright automated verification and keyboard/screen-reader manual verification?
