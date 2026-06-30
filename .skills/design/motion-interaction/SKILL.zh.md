---
name: 动效 & 微交互
description: 用有目的的动画·微交互将反馈·过渡·状态变化可视化，并尊重 prefers-reduced-motion 的实现标准。加入过渡效果·动画或确定动效时机·性能时阅读。关键词: transition, animation, prefers-reduced-motion, transform, opacity, keyframes, ease.
rules:
  - "所有动画在 prefers-reduced-motion: reduce 媒体查询下禁用或最小化。"
  - "过渡时间以 100～300ms 为基本，复杂的布局过渡保持在 500ms 以下。"
  - "ease-in 用于元素退场，ease-out 用于入场，ease-in-out 用于状态过渡。"
  - "动画不要在没有 UX 目的（反馈·层级·关系）的情况下仅作装饰使用。"
  - "为了性能只对 transform·opacity 做动画，避免会触发 layout 的 width·height·top 动画。"
tags:
  - "transition"
  - "animation"
  - "prefers-reduced-motion"
  - "transform"
  - "opacity"
  - "keyframes"
  - "ease"
---

# 🎬 动效 & 微交互

> 用有目的的动效将反馈·过渡·状态可视化，并守住无障碍·性能。加入动画或确定过渡时机时阅读。

## 1. 核心原则
- 所有动画在 prefers-reduced-motion: reduce 媒体查询下禁用或最小化。
- 过渡时间以 100～300ms 为基本，复杂的布局过渡保持在 500ms 以下。
- ease-in 用于元素退场，ease-out 用于入场，ease-in-out 用于状态过渡。
- 动画不要在没有 UX 目的（反馈·层级·关系）的情况下仅作装饰使用。
- 为了性能只对 transform·opacity 做动画，避免会触发 layout 的 width·height·top 动画。

## 2. 规则

### 2-1. 无障碍动效
```css
/* 기본 전환 */
.btn { transition: background-color 150ms ease-out, transform 150ms ease-out; }

/* ✅ 권장 — 모션 감소 요청 시 비활성화 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 2-2. 过渡时机指南
| 类型 | 时间 | 用途 |
|------|------|------|
| 即时反馈 | 100ms | 按钮 hover/active |
| 简单过渡 | 150～200ms | 下拉菜单、工具提示 |
| 内容过渡 | 250～300ms | 打开模态框、切换标签页 |
| 复杂布局 | 400～500ms | 侧边栏、面板 |

### 2-3. 微交互模式
加载反馈:
```css
@keyframes skeleton-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}
```

成功/错误反馈:
- 成功: 绿色对勾 + 简洁文本，2～3 秒后自动关闭
- 错误: 红色边框 + shake 动画（transform: translateX），手动关闭

### 2-4. GPU 加速 (Composited Layer)
只对 transform·opacity 做动画时会在 GPU composite 层处理，不会阻塞主线程。
```css
/* ✅ 좋음 */ .card:hover { transform: translateY(-4px); opacity: 0.9; }
/* ❌ 나쁨 */ .card:hover { top: -4px; height: 200px; } /* layout 유발 */
```

## 3. 常见错误
- 未处理 prefers-reduced-motion → 给对动效敏感的用户带来不适·眩晕。
- 对 width·height·top·left 做动画 → 因 layout reflow 产生卡顿。
- 滥用无目的的装饰性动效 → 界面显得杂乱且迟缓。
- 过渡时间过长（超过 500ms） → 反应显得迟钝。

## 4. 检查清单
- [ ] 是否在 prefers-reduced-motion: reduce 下禁用/最小化了动效？
- [ ] 过渡时间是否在按用途的指南（100～500ms）范围内？
- [ ] 是否使用了与入场/退场/过渡匹配的 easing（ease-out/in/in-out）？
- [ ] 是否只对 transform·opacity 做动画并避免触发 layout 的属性？
- [ ] 每个动效是否都有 UX 目的（反馈·层级·关系）？
