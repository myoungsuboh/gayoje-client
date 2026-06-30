---
name: 设计系统 & 令牌 (Design System & Tokens)
description: 定义设计令牌(颜色·排版·间距·圆角)的取值与命名的唯一权威(SoT)，同时也是构建可复用组件库的指南。在创建新页面·组件，或确定样式·令牌名称时阅读。Web 应用·主题切换请同时参阅 FE `design-system` 技能。关键词: design-token, css-variable, --color, theme, storybook, variant, token.
rules:
  - "所有颜色·间距·字体·圆角只能作为设计令牌变量(CSS Custom Properties 或主题对象)使用，不得硬编码。"
  - "组件通过 props 接收 variant·size·state，并在内部组合令牌 — 禁止从外部直接覆盖样式。"
  - "编写新组件前，先确认是否可复用现有组件。"
  - "组件文档(Storybook 或 README)必须包含 usage example。"
  - "令牌名称遵循层级(category-role-modifier，例如 color-text-primary)结构。"
tags:
  - "design-token"
  - "css-variable"
  - "--color"
  - "theme"
  - "storybook"
  - "variant"
  - "token"
---

# 🎨 设计系统 & 令牌

> 将 UI 的视觉决策值作为令牌单一来源进行管理，以保证品牌一致性与主题切换。**定义令牌取值·命名的权威(SoT)**就是本技能。在创建新页面·组件或确定样式时阅读。Web 应用·主题优先级·各框架的主题切换在 FE `design-system` 技能中处理。

## 1. 核心原则
- 所有颜色·间距·字体·圆角只能作为设计令牌变量(CSS Custom Properties 或主题对象)使用，不得硬编码。
- 组件通过 props 接收 variant·size·state，并在内部组合令牌 — 禁止从外部直接覆盖样式。
- 编写新组件前，先确认是否可复用现有组件。
- 组件文档(Storybook 或 README)必须包含 usage example。
- 令牌名称遵循层级(category-role-modifier，例如 color-text-primary)结构。

## 2. 规则

### 2-1. 令牌层级结构
设计令牌是将 UI 的视觉决策值代码化的变量。以单一来源(SoT)进行管理。
```
Primitive tokens  → semantic tokens → component tokens
#3B82F6           → color-text-link → button-label-color
```

### 2-2. 仅引用令牌(禁止硬编码)
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

### 2-3. 组件设计原则
- **单一职责**: 一个组件只承担一个角色。
- **Prop API 稳定性**: breaking change 仅允许通过主版本升级进行。
- **Default props**: 为所有必需 prop 提供合理的默认值。
- **Composition over inheritance**: 通过组件组合来处理复杂度。

### 2-4. 令牌命名规则

| 层 | 模式 | 示例 |
|--------|------|------|
| Primitive | `{category}-{scale}` | `color-gray-500`, `space-2` |
| Semantic | `{category}-{role}` | `color-text-primary`, `color-bg-surface` |
| Component | `{component}-{element}-{property}` | `button-label-color` |

## 3. 常见错误
- 硬编码取值 → 切换主题·品牌重塑时必须全部修改。
- 从外部覆盖组件样式 → variant 体系崩溃。
- 重复创建相似组件 → 库变得臃肿。
- 缺少 usage example → 只能靠猜测用法。

## 4. 检查清单
- [ ] 是否将颜色·间距·字体·圆角全部仅作为令牌引用？
- [ ] 是否通过 props 接收 variant·size·state 并在内部组合令牌？
- [ ] 是否先确认了现有组件的可复用性？
- [ ] 令牌名称是否遵循层级(primitive/semantic/component)规则？
- [ ] 是否在 Storybook/README 中包含 usage example？
