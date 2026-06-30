---
name: Responsive Styling Standard (Responsive Styling)
description: Responsive principles follow `responsive-layout` (the SoT); here we only cover the implementation that maps that standard onto our stack (Vue 3 + Vuetify) — Vuetify breakpoints, the VRow/VCol grid, and spacing utilities. Read this when composing a responsive screen with Vuetify or deciding breakpoints, spacing, and font sizes. Keywords: responsive, mobile-first, breakpoints, clamp, grid, viewport, touch target, Vuetify, VRow, VCol.
rules:
  - "Branch layout on the defined breakpoints"
  - "Set font sizes with clamp-based fluid typography"
  - "Use the spacing units from the design tokens for spacing"
  - "Author mobile-first and progressively expand to larger screens"
tags:
  - "responsive"
  - "mobile-first"
  - "breakpoints"
  - "clamp"
  - "grid"
  - "viewport"
  - "touch target"
  - "Vuetify"
  - "VRow"
  - "VCol"
  - "@media"
  - "breakpoint"
  - "min-width"
  - "max-width"
  - "grid-template"
  - "flex-wrap"
---

# 📐 Responsive Styling Standard (Responsive Styling)

> The concepts and principles of responsiveness (mobile-first, consistent breakpoints, fluid typography, fluid grids, touch targets, etc.) have the `responsive-layout` skill as their single source of truth (SoT). This skill only covers how to implement that standard on our stack (Vue 3 + Vuetify). When composing a responsive screen with Vuetify or deciding breakpoints, spacing, and font sizes, read it together with `responsive-layout`.

## 1. Principles follow `responsive-layout` (delegation)
All the neutral principles of responsiveness — **mobile-first** (expand with `min-width`), **consistent breakpoints** (the point where content breaks, no magic numbers), **fluid typography** (`clamp()` + `rem`), **fluid grid / flexible units** (`%`/`fr`/`minmax`), **platform-specific touch targets and preventing horizontal scroll** — have the `responsive-layout` skill as their standard (SoT). They are not repeated here, so follow that one.

- For the principle of **varying spacing per viewport**, also follow `responsive-layout`, but for **tokenizing/unifying the values** of spacing and gaps, follow the `design-system` skill.
- Below covers only **the stack-specific part**, i.e., how to implement this standard on our stack (Vue 3 + Vuetify).

## 2. Vue 3 + Vuetify Implementation

Vuetify provides its own breakpoint system (`xs`/`sm`/`md`/`lg`/`xl`), grid (`VRow`/`VCol`), and spacing utilities (`pa-*`/`ma-*`). This is a mapping of the standard concepts of `responsive-layout` onto Vuetify idioms.

### 2-1. Viewport basis (Breakpoints)
- **Mobile (xs)**: `0px` ~ `599px`
- **Tablet (sm, md)**: `600px` ~ `1279px`
- **Web (lg+)**: `1280px` and above

### 2-2. Grid — VRow / VCol
- Compose responsive columns with `VRow`/`VCol`, and specify the column count in stages with breakpoint props (`cols`, `sm`, `md`, `lg`).

```vue
<v-row>
  <!-- mobile 12 cols (1 column) → tablet 6 cols (2 columns) → desktop 4 cols (3 columns) -->
  <v-col cols="12" sm="6" lg="4" v-for="item in items" :key="item.id">
    <v-card>{{ item.name }}</v-card>
  </v-col>
</v-row>
```

### 2-3. Spacing — spacing utilities
- Apply spacing with the `pa-*` (padding) / `ma-*` (margin) utilities, and express per-viewport variation with breakpoint prefixes. For tokenizing/unifying the values, follow `design-system`.
- e.g.: mobile `pa-4`, desktop `pa-8` → `pa-4 pa-lg-8`.

```vue
<!-- mobile uses pa-4 (16px), pa-8 (32px) at lg and above -->
<v-sheet class="pa-4 pa-lg-8">...</v-sheet>
```

### 2-4. Fluid typography
- Separate from Vuetify typography classes (`text-h4`, etc.), you can use the standard `clamp()` of `responsive-layout` directly in a `scoped` style.

```vue
<style scoped>
.page-title { font-size: clamp(1.5rem, 4vw + 1rem, 3rem); }
</style>
```
