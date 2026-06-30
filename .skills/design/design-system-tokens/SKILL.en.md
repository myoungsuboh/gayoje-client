---
name: Design System & Tokens (Design System & Tokens)
description: A guide that is the single source of truth (SoT) defining the values and naming of design tokens (color, typography, spacing, radius), and for building a reusable component library. Read it when creating new screens/components or deciding style and token names. For web application and theme switching, also see the FE `design-system` skill. Keywords: design-token, css-variable, --color, theme, storybook, variant, token.
rules:
  - "Use all colors, spacing, fonts, and radii only as design token variables (CSS Custom Properties or theme objects), never hardcoded."
  - "Components receive variant, size, and state as props and combine tokens internally — no direct external style overrides."
  - "Before writing a new component, first check whether an existing component can be reused."
  - "Component documentation (Storybook or README) must include a usage example."
  - "Token names follow a hierarchical structure (category-role-modifier, e.g. color-text-primary)."
tags:
  - "design-token"
  - "css-variable"
  - "--color"
  - "theme"
  - "storybook"
  - "variant"
  - "token"
---

# 🎨 Design System & Tokens

> Manage the UI's visual decision values as a single source of tokens to guarantee brand consistency and theme switching. This skill is the **authority (SoT) that defines the values and naming of tokens**. Read it when creating new screens/components or deciding styles. Web application, theme priority, and framework-specific theme switching are covered in the FE `design-system` skill.

## 1. Core Principles
- Use all colors, spacing, fonts, and radii only as design token variables (CSS Custom Properties or theme objects), never hardcoded.
- Components receive variant, size, and state as props and combine tokens internally — no direct external style overrides.
- Before writing a new component, first check whether an existing component can be reused.
- Component documentation (Storybook or README) must include a usage example.
- Token names follow a hierarchical structure (category-role-modifier, e.g. color-text-primary).

## 2. Rules

### 2-1. Token Hierarchy
Design tokens are variables that codify the UI's visual decision values. Manage them as a single source (SoT).
```
Primitive tokens  → semantic tokens → component tokens
#3B82F6           → color-text-link → button-label-color
```

### 2-2. Reference Tokens Only (No Hardcoding)
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

### 2-3. Component Design Principles
- **Single responsibility**: one component handles only one role.
- **Prop API stability**: breaking changes are allowed only via a major version bump.
- **Default props**: provide sensible defaults for all required props.
- **Composition over inheritance**: handle complexity through component composition.

### 2-4. Token Naming Conventions

| Layer | Pattern | Example |
|--------|------|------|
| Primitive | `{category}-{scale}` | `color-gray-500`, `space-2` |
| Semantic | `{category}-{role}` | `color-text-primary`, `color-bg-surface` |
| Component | `{component}-{element}-{property}` | `button-label-color` |

## 3. Common Mistakes
- Hardcoding values → everything must be changed when switching themes or rebranding.
- Overriding component styles externally → the variant system collapses.
- Creating duplicate similar components → the library becomes bloated.
- Omitting the usage example → usage has to be guessed.

## 4. Checklist
- [ ] Are colors, spacing, fonts, and radii all referenced only as tokens?
- [ ] Are variant, size, and state received as props and tokens combined internally?
- [ ] Was reuse of an existing component checked first?
- [ ] Do token names follow the hierarchical (primitive/semantic/component) convention?
- [ ] Is a usage example included in Storybook/README?
