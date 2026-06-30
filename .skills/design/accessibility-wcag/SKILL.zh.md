---
name: 网页无障碍 — WCAG 2.1 AA (技术栈中立)
description: 基于 WCAG 2.1 AA 的技术栈中立无障碍权威(SoT)。在制作新页面·组件或检查键盘导航·色彩对比·屏幕阅读器支持时阅读。关键词 aria-label, role, alt, tabindex, wcag, focus-trap, 色彩对比。
rules:
  - "所有交互元素必须仅用键盘(Tab·Enter·Escape·方向键)即可操作。"
  - "图片要用有意义的 alt，装饰性图片用 alt=''。为图标按钮·链接提供可访问名称。"
  - "不要仅凭颜色传达信息(颜色 + 图标/文本并用)。"
  - "模态框·抽屉等覆盖层要实现 focus trap 并以 Esc 关闭。"
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

# ♿ 网页无障碍 — WCAG 2.1 AA

> 基于 WCAG 2.1 AA、用于制作人人可用 UI 的技术栈中立基准(SoT)。在制作新页面·组件或检查无障碍时阅读。
>
> Vue/Vuetify 实现(组件标记、Focus Trap、axe/Playwright、reduced-motion)参见 `accessibility-a11y`。

## 1. 核心原则

POUR — 所有无障碍标准都归结为这四项。

| 原则 | 含义 | 主要标准 |
|------|------|-----------|
| Perceivable | 可感知 | alt text, 色彩对比, 字幕 |
| Operable | 可操作 | 键盘, 充足时间, 无癫痫风险 |
| Understandable | 可理解 | 语言声明, 一致的导航, 错误提示 |
| Robust | 健壮 | 语义化 HTML, 正确使用 ARIA |

核心约定(详情见 §2):
- 所有交互元素必须仅用键盘(Tab·Enter·Escape·方向键)即可操作。
- 图片要用有意义的 alt，装饰性图片用 `alt=""`。为图标按钮·链接提供可访问名称。
- 不要仅凭颜色传达信息(颜色 + 图标/文本并用)。
- 模态框·抽屉等覆盖层要实现 focus trap 并以 Esc 关闭。

## 2. 规则

### 2-1. 语义化标记
```html
<!-- ❌ 禁止 — 无意义的 div, 屏幕阅读器不知道它是按钮 -->
<div class="btn" onclick="...">저장</div>

<!-- ✅ 推荐 — 用语义化标签传达角色 -->
<button type="button">저장</button>
```
- 用 `<button>`, `<nav>`, `<main>`, `<header>`, `<footer>` 语义化标签代替 `<div>`。
- 保持标题层级结构 (`h1` → `h2` → `h3`, 禁止跳级)。
- 声明 `lang="ko"` (或相应语言)。

### 2-2. 键盘导航
```css
/* ❌ 禁止 — 焦点不可见 */
:focus { outline: none; }

/* ✅ 推荐 — 保留焦点样式 */
:focus-visible { outline: 2px solid var(--color-focus-ring); }
```
```html
<!-- 模态框 focus trap 示例 -->
<dialog role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">...</h2>
  <!-- 可聚焦元素 -->
  <button>닫기</button>
</dialog>
```
- 正值 `tabindex` (`tabindex="5"`) 会破坏 Tab 顺序，故禁止。

### 2-3. ARIA 使用原则
```html
<!-- ❌ 禁止 — 仅图标, 无名称 -->
<button><svg .../></button>

<!-- ✅ 推荐 — 提供可访问名称 -->
<button aria-label="닫기"><svg aria-hidden="true" .../></button>
```
- 若 HTML 语义已可解决, 则不添加 ARIA。
- `aria-live="polite"` — 动态内容变更通知 (加载完成、错误等)。
- `aria-expanded`, `aria-controls` — 传达手风琴·下拉的状态。

### 2-4. 色彩对比标准

此表是色彩对比数值的唯一定义来源(SoT)。

| 文本类型 | 最小对比度 |
|-------------|-----------|
| 普通文本 | 4.5 : 1 |
| 大型文本 (18pt 普通 / 14pt Bold) | 3 : 1 |
| 非文本 UI (图标·输入边框) | 3 : 1 |

## 3. 常见错误
- 用 `outline: none` 移除焦点指示 → 键盘用户失去位置。
- 图标按钮未提供名称 → 屏幕阅读器只读出“按钮”。
- 跳过标题层级(h1 → h4) → 文档结构被破坏。
- 仅凭颜色传达信息 → 色盲·低视力用户无法区分。

## 4. 检查清单
- [ ] 所有交互元素是否仅用键盘即可操作
- [ ] 焦点样式是否可见 (是否未移除 outline)
- [ ] 是否提供了图片 alt / 图标按钮的可访问名称
- [ ] 是否满足正文 4.5:1、大型/非文本 3:1 的色彩对比
- [ ] 模态框是否实现了 focus trap + Esc 关闭
- [ ] 标题层级(h1→h2→h3)与 `lang` 声明是否正确
