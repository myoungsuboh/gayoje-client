---
name: Vue 3 + Vuetify 3 UI 开发标准 (UI Vuetify)
description: 基于 Vue 3 + Vuetify 3 的画面组件生成标准。定义网格布局层级、PascalCase 组件命名、响应式属性以及工具类使用规则，在生成或评审画面 SFC 时阅读。关键词 Vuetify, VContainer, VRow, VCol, PascalCase, 网格。
rules:
  - "布局必须遵循 VContainer > VRow > VCol 的层级结构。"
  - "所有 Vuetify 组件必须以 PascalCase(<V...>)编写，禁止使用 kebab-case。"
  - "每个 VCol 都必须在 cols='12' 之外明确至少一个响应式属性(md、lg 等)。"
  - "使用 Vuetify 工具类(ma、pa 等)代替内联样式。"
  - "对于相同的需求，始终输出基于 PascalCase 的标准网格结构。"
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

# 🎨 Vue 3 + Vuetify 3 UI 开发标准

> 定义 Vue 3 + Vuetify 3 画面组件的网格结构、组件命名以及响应式/样式规则。在生成新的画面 SFC 或评审现有画面时阅读。

## 1. 核心原则
- 布局必须遵循 `VContainer` > `VRow` > `VCol` 的层级结构。
- 所有 Vuetify 组件必须以 PascalCase(`<V...>`)编写，禁止使用 kebab-case。
- 每个 `VCol` 都必须在 `cols="12"` 之外明确至少一个响应式属性(md、lg 等)。
- 使用 Vuetify 工具类(ma、pa 等)代替内联样式。
- 对于相同的需求，始终输出基于 PascalCase 的标准网格结构。

## 2. 规则

### 2-1. 网格系统 (GRID_SYSTEM_STRICT)
- 布局必须遵循 `VContainer` > `VRow` > `VCol` 的层级结构。
- `VCol` 必须作为 `VRow` 的直接子元素包含其中。

### 2-2. PascalCase 命名 (PASCAL_CASE_NAMING, CRITICAL)
- 所有 Vuetify 组件必须使用 PascalCase。
  - [O]: `<VContainer>`, `<VRow>`, `<VCol>`, `<VBtn>`, `<VTextField>`
  - [X]: `<v-container>`, `<v-col>`, `<v-btn>` (绝对禁止 kebab-case)

### 2-3. 响应式属性 (RESPONSIVE_PROPS)
- 每个 `VCol` 都必须在 `cols="12"` 之外明确至少一个响应式属性(md、lg 等)。

### 2-4. 样式 / 工具类
- 使用 Vuetify 工具类(ma、pa 等)代替内联样式。

### 2-5. 工作流程
1. **[Analysis]**: 分析 PRD 的 User Flow，确定画面内组件布置的优先级。
2. **[Building]**: 应用 PascalCase 规则编写 Vuetify 网格及数据绑定(v-model)。
3. **[Verifying (Self-Check Gate)]**: 通过自我验证关卡检查 PascalCase、网格层级、Acceptance Criteria 以及工具类的使用情况。
4. **[Recording]**: 输出最终的 .vue 单文件组件(SFC)。

### 2-6. 标准输出结构 (OUTPUT SCHEMA)
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

## 3. 常见错误
- ❌ 使用 kebab-case(`<v-col>`) → 使用 PascalCase `<VCol>`。
- ❌ 将 `VCol` 放在 `VRow` 直接子元素以外的位置 → 遵循层级。
- ❌ 只有 `cols` 而没有响应式属性(md/lg) → 不同屏幕尺寸下布局会错乱。
- ❌ 使用内联样式 → 使用 Vuetify 工具类(ma/pa)。
- ❌ 没有 `VContainer` 而直接使用 `VRow` → 遵守 `VContainer` > `VRow` > `VCol` 层级。

## 4. 检查清单
- [ ] 所有组件是否为 `<V...>` 形式的 PascalCase?
- [ ] `VCol` 是否作为 `VRow` 的直接子元素包含其中?
- [ ] 布局是否遵循 `VContainer` > `VRow` > `VCol` 层级?
- [ ] 每个 `VCol` 是否在 `cols="12"` 之外明确了响应式属性(md、lg 等)?
- [ ] 是否包含了 PRD 的 `Acceptance Criteria` 的所有功能?
- [ ] 是否使用 Vuetify 工具类(ma、pa 等)代替了内联样式?
