---
name: 设计系统 (Design System)
description: 将设计令牌**应用到 Web** 的通用标准 — 样式优先级、主题（亮色/暗色）切换、通用视觉模式的复用。在为新页面/组件确定样式、设计暗色模式或主题、把硬编码值整理为令牌时阅读。令牌的实际值与名称定义遵循 `design-system-tokens` 技能（SoT）。关键词: design token, theme, dark mode, CSS variable, custom property, styling priority, glassmorphism, animation.
rules:
  - "令牌定义遵循 design-system-tokens: 令牌的单一来源、语义变量、primitive→semantic→component 层级、命名都是该技能（SoT）的规则。本技能只处理在页面中引用已定义的令牌 — 组件只用语义令牌上色，不直接嵌入原始值或原始调色板。"
  - "主题通过重定义令牌来切换: 亮色/暗色等主题差异通过按主题改变语义令牌的值来表达。组件代码应当不知道主题，且不把分支（if dark）散布各处。"
  - "一致的样式优先级: 按 令牌/系统工具类 → 通用变量 → 组件局部样式 的顺序应用。不在多个层级各自做出相同的决定。"
  - "通用视觉模式要标准化: 反复出现的视觉效果（半透明表面、动效/动画等）不要每次重新制作，而是定义为通用令牌·工具类·混入并复用。"
  - "无障碍是默认值: 在令牌·模式层面保证色彩对比、减少动效（prefers-reduced-motion）等无障碍约束。"
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

# 🎨 设计系统 (Design System)

> 处理**如何将设计令牌应用到 Web** — 样式优先级、主题（亮色/暗色）切换、通用视觉模式的标准化。在为新页面/组件确定样式、设计主题·暗色模式、把硬编码值整理为令牌时阅读。这是不依赖特定 UI 框架/库的通用标准。
>
> **定义令牌的值·命名·层级（primitive→semantic→component）的权威（SoT）是 `design-system-tokens` 技能。** 本技能只处理在 Web 端消费这些令牌的规则。

## 1. 核心原则
- **令牌定义遵循 `design-system-tokens`**: 令牌的单一来源、语义变量、primitive→semantic→component 层级、命名都是该技能（SoT）的规则。本技能只处理在页面中引用已定义的令牌 — 组件只用语义令牌上色，不直接嵌入原始值或原始调色板。
- **主题通过重定义令牌来切换**: 亮色/暗色等主题差异通过按主题改变语义令牌的值来表达。组件代码应当不知道主题，且不把分支（`if dark`）散布各处。
- **一致的样式优先级**: 按 令牌/系统工具类 → 通用变量 → 组件局部样式 的顺序应用。不在多个层级各自做出相同的决定。
- **通用视觉模式要标准化**: 反复出现的视觉效果（半透明表面、动效/动画等）不要每次重新制作，而是定义为通用令牌·工具类·混入并复用。
- **无障碍是默认值**: 在令牌·模式层面保证色彩对比、减少动效（`prefers-reduced-motion`）等无障碍约束。

> 禁止任意值（魔法数字）：在令牌层面遵循 `design-system-tokens`（令牌里没有就扩充令牌），在具名常量层面遵循 `coding-styles` 技能。本技能的 §2-3 仅从样式优先级的角度处理这一点。

## 2. 规则

### 2-1. 主题（亮色/暗色）通过重定义令牌来切换
- 把主题差异表达为语义令牌值的差异，主题开关在一处（根/主题作用域）通过重定义令牌来挂接。
- 不在组件内散布 `if (dark) ... else ...` 分支。颜色始终用同一个语义令牌上色。（令牌名·值本身遵循 `design-system-tokens`。）

```text
// ✅ 推荐 — 按主题只重定义语义令牌值，组件保持原样
:root             { --surface-bg: #fff; --text-default: #111; }
[data-theme=dark] { --surface-bg: #111; --text-default: #eee; }

card { background: var(--surface-bg); color: var(--text-default); }  // 不知道主题

// ❌ 禁止 — 组件知道主题并分支
card { background: isDark ? #111 : #fff; }
```

### 2-2. 遵守样式优先级
- 不在多个层级重复做出相同的样式决定。优先级:
  1. **设计系统令牌 / 标准工具类**（间距·排版·对齐等 — 系统若提供则优先使用）
  2. **通用变量**（引用语义令牌/通用样式变量）
  3. **组件局部样式**（仅在以上无法表达时，缩小作用域编写）
- 不在局部样式中无视令牌而重新嵌入值。

```text
// ✅ 推荐 — 系统工具类/令牌优先，仅不足部分用局部样式
<div class="stack gap-3">…</div>            // 标准间距工具类
.special { box-shadow: var(--shadow-md); }   // 引用令牌的局部样式

// ❌ 禁止 — 在局部样式中绕过系统使用魔法数字
.special { margin-top: 13px; box-shadow: 0 2px 7px #0003; }
```

### 2-3. 通用视觉模式标准化并复用
- 把反复出现的视觉效果（半透明/模糊表面、动效等）定义为令牌·工具类·混入并复用。
- 不在每个页面手动重做相同的效果 — 数值会有微妙偏差，导致一致性破坏。

```text
// ✅ 推荐 — 把模式用令牌/工具类标准化
.surface-glass {           // 半透明表面模式定义一次并复用
  background: var(--surface-overlay);
  backdrop-filter: blur(var(--blur-md));
  border: 1px solid var(--border-subtle);
}

// ❌ 禁止 — 每个页面直接嵌入数值，各不相同
.panel { background: rgba(255,255,255,.15); backdrop-filter: blur(11px); }
```

### 2-4. 把无障碍内建进模式
- 定义语义令牌对，使文本/背景色对比满足标准（例: WCAG AA）。
- 动效模式尊重 `prefers-reduced-motion`，当用户希望减少动效时将其禁用。

```text
// ✅ 推荐 — 尊重减少动效的偏好
@media (prefers-reduced-motion: reduce) {
  * { animation: none; transition: none; }
}
```

## 3. 常见错误
- **组件按主题分支** → `if dark` 散布在各页面，每次新增主题都得修改所有组件。改为令牌重定义。
- **无视优先级** → 明明有系统工具类/令牌，却在局部样式中重新嵌入值，产生冲突·重复。
- **每次手动重现模式** → 半透明·动效等效果的数值在各页面间略有不同，破坏一致性。用通用模式标准化。
- **把无障碍放在后面** → 色彩对比·减少动效在后期补做时被遗漏。在令牌·模式层面保证。

> 令牌硬编码·直接引用原始令牌等令牌层面的错误，参见 `design-system-tokens` 的「常见错误」。

## 4. 检查清单
- [ ] 令牌的值·命名·层级是否遵循 `design-system-tokens` 技能（SoT）（组件只引用语义令牌）
- [ ] 是否通过**重定义令牌**切换亮色/暗色等主题，且不在组件中散布主题分支
- [ ] 是否按**令牌/工具类 → 通用变量 → 局部样式**的优先级应用样式
- [ ] 是否通过通用令牌/工具类/混入**复用**反复出现的视觉模式（半透明·动效等）
- [ ] 是否把色彩对比·`prefers-reduced-motion` 等**无障碍**内建进令牌·模式

## 附录: 各栈应用示例

> 以下是参考用的实现示例。请按相同模式补充符合团队所用栈（例: React + Tailwind, CSS Modules, styled-components, Web Components 等）的示例。上面 1～4 的原则·规则是标准，附录只是其应用案例。

### Vue 3 + Vuetify

用 Vuetify 主题系统集中管理全局主题，并把工具类作为第一优先的样式手段。（只处理该栈特有的应用 — 主题切换·样式优先级的原则见 §2-1, §2-2。）

#### 主题配置 (`themeConfig.js`)
- 暗色/亮色模式、Primary 颜色等全局主题设置在 `themeConfig.js` 中集中管理。（把 §2-1 的「在一处重定义令牌」用 Vuetify 主题对象实现的形式。）

#### 样式优先级 (§2-2 的 Vuetify 映射)
1. **Vuetify 工具类**: 优先使用 Spacing（`pa-4`, `mt-2`）、Typography（`text-h5`）、Alignment 等。
2. **Sass 变量**: 引用通用定义的 SCSS 变量。
3. **Custom CSS**: 仅在不得已时使用 `<style scoped>`。

#### 暗色模式支持 (Dark Mode)
- 使用 CSS 变量，设计为切换主题时颜色与不透明度自动调整。
- 利用 `[data-theme='dark']` 选择器重定义全局变量。（§2-1。）
