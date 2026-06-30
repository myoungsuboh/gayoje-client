---
name: 表单 UX & 输入模式
description: 以无障碍和错误预防为核心设计输入表单的通用标准 — 始终可见的标签、验证时机（onBlur/onSubmit）、字段紧邻的错误显示与 aria 关联、autocomplete、多步骤、提交状态处理。不依赖特定框架。新建输入表单或确定验证·错误显示 UX 时阅读。关键词: form, input, label, validation timing, aria-describedby, aria-invalid, onBlur, onSubmit, required, autocomplete, multi-step, submitting.
rules:
  - "标签始终可见：为每个输入字段提供视觉上始终可见的标签，不要仅用 placeholder 代替标签（一开始输入上下文就消失）。"
  - "验证讲究时机：实时验证在用户离开字段后（blur）开始，输入中（change）不弹出错误以免妨碍打字。提交时一并显示全部错误。"
  - "错误紧邻字段 + 以程序方式关联：错误消息放在该字段正下方，并将字段与消息以程序方式关联（aria-describedby）让屏幕阅读器朗读。错误状态通过 aria-invalid 暴露。"
  - "必填项要明确：必填输入在标签上标注，并在表单某处对该标记的含义（'* 为必填项'）说明一次。不仅给出视觉标记，还要一并放置辅助技术用标记（如 aria-required）。"
  - "防止重复提交：提交期间禁用提交按钮并显示进行状态（加载）以阻止重复提交。"
  - "框架中立：上述概念均可用 HTML 标准元素·ARIA 表达。特定框架的绑定语法只是实现细节，标准是以下规则。"
tags:
  - "form"
  - "input"
  - "label"
  - "validation timing"
  - "aria-describedby"
  - "aria-invalid"
  - "onBlur"
  - "onSubmit"
  - "required"
  - "autocomplete"
  - "multi-step"
  - "submitting"
  - "<form"
  - "<input"
  - "<label"
---

# 📝 表单 UX & 输入模式

> 设计无障碍且能预防错误的表单。制作输入表单或确定验证·错误显示方式时阅读。这是不依赖特定语言/框架的通用标准，以下原则·规则以 HTML 标准语义（语义·ARIA）为基准。验证的服务器端强制参见 `forms-validation`（客户端验证辅助）·服务器输入验证标准，无障碍细则一并参见 `accessibility-wcag`。

## 1. 核心原则
- **标签始终可见**：为每个输入字段提供视觉上始终可见的标签，不要仅用 placeholder 代替标签（一开始输入上下文就消失）。
- **验证讲究时机**：实时验证在用户离开字段后（blur）开始，输入中（change）不弹出错误以免妨碍打字。提交时一并显示全部错误。
- **错误紧邻字段 + 以程序方式关联**：错误消息放在该字段正下方，并将字段与消息以程序方式关联（`aria-describedby`）让屏幕阅读器朗读。错误状态通过 `aria-invalid` 暴露。
- **必填项要明确**：必填输入在标签上标注，并在表单某处对该标记的含义（"* 为必填项"）说明一次。不仅给出视觉标记，还要一并放置辅助技术用标记（如 `aria-required`）。
- **防止重复提交**：提交期间禁用提交按钮并显示进行状态（加载）以阻止重复提交。
- **框架中立**：上述概念均可用 HTML 标准元素·ARIA 表达。特定框架的绑定语法只是实现细节，标准是以下规则。

## 2. 规则

### 2-1. 标签 & 输入字段
每个字段都放置可见的 `<label for>`，并用 `aria-describedby` 关联提示·错误。placeholder 仅作为辅助示例，而非标签。

```html
<!-- ❌ 禁止 — 用 placeholder 代替标签（输入时消失而丢失上下文） -->
<input type="email" placeholder="이메일" />

<!-- ✅ 推荐 — 始终可见的标签 + aria 关联 -->
<label for="email">
  이메일 <span aria-hidden="true">*</span>
  <span class="sr-only">(필수)</span>
</label>
<input
  id="email"
  type="email"
  autocomplete="email"
  aria-describedby="email-hint email-error"
  aria-invalid="true"
  aria-required="true"
/>
<span id="email-hint" class="hint">예: hello@example.com</span>
<span id="email-error" role="alert" class="error">올바른 이메일 형식을 입력해 주세요.</span>
```

### 2-2. 有效性校验时机
| 时点 | 规则 |
|------|------|
| 输入中 (change) | 不显示错误 — 会妨碍用户 |
| 失去焦点 (blur) | 开始显示该字段的错误 |
| 提交时 (submit) | 一并显示全部错误 + 将焦点移到第一个错误字段 |
| 修正错误后 | 该字段切换为 change 上的实时校验 |

> 校验什么（必填·长度·格式·领域规则）及服务器端强制不在本技能范围内 — 遵循 `forms-validation` / 服务器输入验证标准。这里只处理"何时·如何展示"。

### 2-3. 启用自动完成（autocomplete）
指定与输入含义匹配的标准 `autocomplete` 令牌，以帮助浏览器自动补全·自动填充。

```html
<input type="text"     autocomplete="name" />
<input type="email"    autocomplete="email" />
<input type="tel"      autocomplete="tel" />
<input type="text"     autocomplete="street-address" />
<input type="password" autocomplete="current-password" />
```

### 2-4. 多步骤表单模式
- 显示进度（1/3 步骤或进度条）
- 保留各步骤的输入值（返回上一步时）
- 提交前提供摘要页面
- 长表单考虑按区块自动保存（Auto-save）

### 2-5. 提交状态处理
在提交进行期间禁用提交按钮（`disabled`），并通过按钮标签/指示器告知进行状态。禁用本身阻止重复提交，状态文本传达正在进行中。

```html
<!-- ✅ 推荐 — 提交中 disabled 防止重复提交 + 提示进行状态 -->
<!-- isSubmitting = true 期间 -->
<button type="submit" disabled aria-busy="true">저장 중...</button>

<!-- isSubmitting = false 的平常状态 -->
<button type="submit">저장하기</button>
```

> 在框架中，根据 `isSubmitting` 状态绑定 `disabled` 属性和按钮内容即可。具体语法参见[附录](#附录按栈示例)。

## 3. 常见错误
- **用 placeholder 代替标签** → 一开始输入上下文就消失。
- **从输入中（change）起显示错误** → 妨碍打字。从 blur 起显示。
- **未用 aria 关联错误消息** → 屏幕阅读器读不到错误。用 `aria-describedby` + `aria-invalid` 关联。
- **遗漏禁用提交按钮** → 会发生重复提交。
- **必填标记仅用视觉符号显示** → 辅助技术用户不知道是否必填。也通过 `aria-required` 等暴露。

## 4. 检查清单
- [ ] 所有输入是否都有始终可见的标签，并用 `for`/`aria` 关联？
- [ ] 验证是否从 blur 起显示，并在输入中（change）阻止？
- [ ] 错误消息是否放在字段正下方，并用 `aria-describedby`/`aria-invalid` 关联？
- [ ] 必填项是否用视觉标记 + 辅助技术用标记显示，并加入说明文字？
- [ ] 提交期间是否禁用按钮并显示进行状态？
- [ ] 校验什么·服务器端强制是否遵循 `forms-validation` 标准？

## 附录：按栈示例

> 以下是供参考的实现示例。上述 1～4 的原则·规则才是标准，附录只是其应用案例。按团队所用的栈（React/JSX、Angular、纯 HTML 等）以相同模式添加示例。

### Vue

将提交状态处理（2-5）用 Vue 绑定的示例。把 `:disabled` 绑定到 `isSubmitting` 状态，用 `v-if`/`v-else` 切换按钮标签。

```html
<!-- ✅ 推荐 — 提交中禁用按钮 + 加载显示以防止重复提交 -->
<button type="submit" :disabled="isSubmitting">
  <span v-if="isSubmitting">저장 중...</span>
  <span v-else>저장하기</span>
</button>
```
