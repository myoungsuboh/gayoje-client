---
name: Design System
description: A general-purpose standard for **applying design tokens to the web** — styling priority, theme (light/dark) switching, and reuse of common visual patterns. Read this when deciding the style of a new screen/component, designing dark mode or themes, or cleaning up hardcoded values into tokens. The actual values and name definitions of tokens follow the `design-system-tokens` skill (SoT). Keywords: design token, theme, dark mode, CSS variable, custom property, styling priority, glassmorphism, animation.
rules:
  - "Token definitions follow design-system-tokens: single source of truth for tokens, semantic variables, the primitive→semantic→component hierarchy, and naming are that skill's (SoT) rules. This skill covers only referencing the defined tokens on screens — components paint with semantic tokens only and do not embed raw values or raw palettes directly."
  - "Switch themes by token redefinition: theme differences such as light/dark are expressed by changing the values of semantic tokens per theme. Component code must be unaware of the theme, and branching (if dark) must not be scattered around."
  - "Consistent styling priority: apply in the order tokens/system utilities → common variables → component-local styles. Do not make the same decision separately at multiple layers."
  - "Standardize common visual patterns: recurring visual effects (translucent surfaces, motion/animation, etc.) should not be recreated each time; define them once as common tokens/utilities/mixins and reuse them."
  - "Accessibility is the default: guarantee accessibility constraints such as color contrast and reduced motion (prefers-reduced-motion) at the token/pattern level."
tags:
  - "design token"
  - "theme"
  - "dark mode"
  - "CSS variable"
  - "custom property"
  - "styling priority"
  - "glassmorphism"
  - "animation"
  - "디자인 토큰"
  - "테마"
  - "design-tokens"
  - "var(--"
  - "tailwind"
  - "tokens.json"
---

# 🎨 Design System

> Covers **how design tokens are applied to the web** — styling priority, theme (light/dark) switching, and standardization of common visual patterns. Read this when deciding the style of a new screen/component, designing themes/dark mode, or cleaning up hardcoded values into tokens. It is a general-purpose standard not tied to any specific UI framework/library.
>
> **The authority (SoT) that defines token values, naming, and hierarchy (primitive→semantic→component) is the `design-system-tokens` skill.** This skill covers only the rules for consuming those tokens on the web.

## 1. Core Principles
- **Token definitions follow `design-system-tokens`**: single source of truth for tokens, semantic variables, the primitive→semantic→component hierarchy, and naming are that skill's (SoT) rules. This skill covers only referencing the defined tokens on screens — components paint with semantic tokens only and do not embed raw values or raw palettes directly.
- **Switch themes by token redefinition**: theme differences such as light/dark are expressed by changing the values of semantic tokens per theme. Component code must be unaware of the theme, and branching (`if dark`) must not be scattered around.
- **Consistent styling priority**: apply in the order tokens/system utilities → common variables → component-local styles. Do not make the same decision separately at multiple layers.
- **Standardize common visual patterns**: recurring visual effects (translucent surfaces, motion/animation, etc.) should not be recreated each time; define them once as common tokens/utilities/mixins and reuse them.
- **Accessibility is the default**: guarantee accessibility constraints such as color contrast and reduced motion (`prefers-reduced-motion`) at the token/pattern level.

> Banning arbitrary values (magic numbers) follows `design-system-tokens` at the token level (if it's not in the tokens, expand the tokens) and the `coding-styles` skill at the named-constant level. §2-3 of this skill addresses this only from the styling-priority perspective.

## 2. Rules

### 2-1. Switch themes (light/dark) by token redefinition
- Express theme differences as differences in semantic token values, and hook the theme switch in one place (root/theme scope) by redefining tokens.
- Do not scatter `if (dark) ... else ...` branches inside components. Always paint colors with the same semantic token. (The token names/values themselves follow `design-system-tokens`.)

```text
// ✅ Recommended — redefine only semantic token values per theme; components stay as-is
:root             { --surface-bg: #fff; --text-default: #111; }
[data-theme=dark] { --surface-bg: #111; --text-default: #eee; }

card { background: var(--surface-bg); color: var(--text-default); }  // unaware of the theme

// ❌ Forbidden — the component knows the theme and branches
card { background: isDark ? #111 : #fff; }
```

### 2-2. Honor the styling priority
- Do not make the same styling decision redundantly across multiple layers. Priority:
  1. **Design system tokens / standard utilities** (spacing, typography, alignment, etc. — prefer them if the system provides them)
  2. **Common variables** (reference semantic tokens / common style variables)
  3. **Component-local styles** (only when the above cannot express it, written with a narrowed scope)
- Do not ignore tokens in local styles and re-embed values.

```text
// ✅ Recommended — system utilities/tokens first, local styles only for the gap
<div class="stack gap-3">…</div>            // standard spacing utility
.special { box-shadow: var(--shadow-md); }   // local style referencing a token

// ❌ Forbidden — magic numbers in local styles bypassing the system
.special { margin-top: 13px; box-shadow: 0 2px 7px #0003; }
```

### 2-3. Standardize and reuse common visual patterns
- Define recurring visual effects (translucent/blurred surfaces, motion, etc.) as tokens/utilities/mixins and reuse them.
- Do not recreate the same effect by hand on each screen — values drift slightly and consistency breaks.

```text
// ✅ Recommended — standardize the pattern as a token/utility
.surface-glass {           // define the translucent-surface pattern once and reuse it
  background: var(--surface-overlay);
  backdrop-filter: blur(var(--blur-md));
  border: 1px solid var(--border-subtle);
}

// ❌ Forbidden — embedding numbers directly on each screen, all different
.panel { background: rgba(255,255,255,.15); backdrop-filter: blur(11px); }
```

### 2-4. Build accessibility into patterns
- Define semantic token pairs so that text/background color contrast meets a standard (e.g., WCAG AA).
- Motion patterns respect `prefers-reduced-motion`, disabling them when the user prefers reduced motion.

```text
// ✅ Recommended — respect the reduced-motion preference
@media (prefers-reduced-motion: reduce) {
  * { animation: none; transition: none; }
}
```

## 3. Common Mistakes
- **The component branches on theme** → `if dark` is scattered across screens, so every component must be fixed whenever a new theme is added. Move it to token redefinition.
- **Ignoring the priority** → there are system utilities/tokens, yet values are re-embedded in local styles, causing conflicts/duplication.
- **Reproducing patterns by hand every time** → the numbers of effects like translucency/motion differ slightly per screen, breaking consistency. Standardize as a common pattern.
- **Accessibility as an afterthought** → color contrast and reduced motion get left out when handled later. Guarantee them at the token/pattern level.

> Token-level mistakes such as hardcoding tokens or directly referencing primitive tokens are covered in the "Common Mistakes" of `design-system-tokens`.

## 4. Checklist
- [ ] Do token values, naming, and hierarchy follow the `design-system-tokens` skill (SoT) (components reference semantic tokens only)
- [ ] Are themes such as light/dark switched by **token redefinition**, without scattering theme branches into components
- [ ] Are styles applied in the **tokens/utilities → common variables → local styles** priority
- [ ] Are recurring visual patterns (translucency, motion, etc.) **reused** via common tokens/utilities/mixins
- [ ] Are **accessibility** concerns such as color contrast and `prefers-reduced-motion` built into tokens/patterns

## Appendix: Per-Stack Application Examples

> The following are reference implementation examples. Add examples matching your team's stack (e.g., React + Tailwind, CSS Modules, styled-components, Web Components, etc.) following the same pattern. The principles/rules in 1–4 above are the standard; the appendix is merely an application case.

### Vue 3 + Vuetify

Manage the global theme centrally with the Vuetify theme system, and use utility classes as the first-priority styling means. (Covers only this stack's specific application — the principles of theme switching and styling priority are in §2-1, §2-2.)

#### Theme configuration (`themeConfig.js`)
- Manage global theme settings such as dark/light mode and the primary color centrally in `themeConfig.js`. (A form of §2-1's "redefine tokens in one place" implemented as a Vuetify theme object.)

#### Styling priority (§2-2's Vuetify mapping)
1. **Vuetify utility classes**: prefer Spacing (`pa-4`, `mt-2`), Typography (`text-h5`), Alignment, etc.
2. **Sass variables**: reference commonly defined SCSS variables.
3. **Custom CSS**: use `<style scoped>` only when unavoidable.

#### Dark mode support (Dark Mode)
- Use CSS variables so that colors and opacity adjust automatically on theme switch.
- Use the `[data-theme='dark']` selector to redefine global variables. (§2-1.)
