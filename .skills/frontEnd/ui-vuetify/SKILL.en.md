---
name: Vue 3 + Vuetify 3 UI Development Standard (UI Vuetify)
description: Standard for creating screen components based on Vue 3 + Vuetify 3. Defines grid layout hierarchy, PascalCase component naming, responsive props, and utility-class usage rules; read it when creating or reviewing screen SFCs. Keywords Vuetify, VContainer, VRow, VCol, PascalCase, grid.
rules:
  - "Layouts must follow the VContainer > VRow > VCol hierarchy."
  - "All Vuetify components must be written in PascalCase (<V...>); kebab-case is forbidden."
  - "Every VCol must specify cols='12' together with at least one responsive prop (md, lg, etc.)."
  - "Use Vuetify utility classes (ma, pa, etc.) instead of inline styles."
  - "For the same requirement, always output the standard PascalCase-based grid structure."
tags:
  - "vuetify"
  - "VBtn"
  - "VCard"
  - "VDialog"
  - "VDataTable"
  - "v-btn"
  - "v-card"
  - "v-dialog"
  - "$vuetify"
  - "createVuetify"
---

# 🎨 Vue 3 + Vuetify 3 UI Development Standard

> Defines the grid structure, component naming, and responsive/style rules for Vue 3 + Vuetify 3 screen components. Read it when creating a new screen SFC or reviewing an existing screen.

## 1. Core Principles
- Layouts must follow the `VContainer` > `VRow` > `VCol` hierarchy.
- All Vuetify components must be written in PascalCase (`<V...>`); kebab-case is forbidden.
- Every `VCol` must specify `cols="12"` together with at least one responsive prop (md, lg, etc.).
- Use Vuetify utility classes (ma, pa, etc.) instead of inline styles.
- For the same requirement, always output the standard PascalCase-based grid structure.

## 2. Rules

### 2-1. Grid System (GRID_SYSTEM_STRICT)
- Layouts must follow the `VContainer` > `VRow` > `VCol` hierarchy.
- `VCol` must be a direct child of `VRow`.

### 2-2. PascalCase Naming (PASCAL_CASE_NAMING, CRITICAL)
- All Vuetify components must use PascalCase.
  - [O]: `<VContainer>`, `<VRow>`, `<VCol>`, `<VBtn>`, `<VTextField>`
  - [X]: `<v-container>`, `<v-col>`, `<v-btn>` (kebab-case is absolutely forbidden)

### 2-3. Responsive Props (RESPONSIVE_PROPS)
- Every `VCol` must specify `cols="12"` together with at least one responsive prop (md, lg, etc.).

### 2-4. Style / Utility Classes
- Use Vuetify utility classes (ma, pa, etc.) instead of inline styles.

### 2-5. Work Workflow
1. **[Analysis]**: Analyze the PRD's User Flow to decide the priority of component placement within the screen.
2. **[Building]**: Apply the PascalCase rule to write the Vuetify grid and data binding (v-model).
3. **[Verifying (Self-Check Gate)]**: Use the self-verification gate to check PascalCase, grid hierarchy, Acceptance Criteria, and utility-class usage.
4. **[Recording]**: Output the final .vue single-file component (SFC).

### 2-6. Standard Output Structure (OUTPUT SCHEMA)
```vue
<template>
  <VContainer fluid>
    <VRow justify="center">
      <VCol cols="12" md="10">
        <VCard>
          <VCardTitle>화면 제목</VCardTitle>
          <VCardText>
            <VRow>
              <VCol cols="12" sm="6">
                <VTextField v-model="state.field" label="입력" />
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>

<script setup>
import { reactive } from 'vue'
const state = reactive({ field: '' })
</script>
```

## 3. Common Mistakes
- ❌ Using kebab-case (`<v-col>`) → use PascalCase `<VCol>`.
- ❌ Placing `VCol` somewhere other than as a direct child of `VRow` → follow the hierarchy.
- ❌ Having only `cols` without a responsive prop (md/lg) → the layout breaks across screen sizes.
- ❌ Using inline styles → use Vuetify utility classes (ma/pa).
- ❌ Using `VRow` directly without `VContainer` → keep the `VContainer` > `VRow` > `VCol` hierarchy.

## 4. Checklist
- [ ] Are all components in PascalCase of the form `<V...>`?
- [ ] Is `VCol` included as a direct child of `VRow`?
- [ ] Does the layout follow the `VContainer` > `VRow` > `VCol` hierarchy?
- [ ] Does every `VCol` specify `cols="12"` together with a responsive prop (md, lg, etc.)?
- [ ] Are all of the PRD's `Acceptance Criteria` features included?
- [ ] Are Vuetify utility classes (ma, pa, etc.) used instead of inline styles?
