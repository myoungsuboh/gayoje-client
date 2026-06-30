---
name: 响应式布局 & 自适应设计
description: 通过 Mobile-first CSS、弹性栅格、按视口调整的排版·间距，在所有屏幕上提供最佳 UX 的响应式实现指南。新建画面或确定布局·断点·触摸适配时阅读。关键词: @media, min-width, grid-template, flex, srcset, container, clamp(, vw, rem.
rules:
  - "Mobile-first 方法 — 以移动端为基准编写基础样式，并用 min-width 媒体查询扩展。"
  - "布局用 CSS Grid 和 Flexbox 实现，不使用固定 px 布局。"
  - "图像·媒体以 max-width:100% 为基本，并使用响应式 srcset/sizes 属性。"
  - "触摸目标保持在各平台的最小尺寸（iOS 44pt·Android 48dp·WCAG 2.5.5 24px 等）以上。"
  - "当按容器宽度而非视口宽度响应时，活用 container queries。"
tags:
  - "@media"
  - "min-width"
  - "grid-template"
  - "flex"
  - "srcset"
  - "container"
  - "clamp("
  - "vw"
  - "rem"
---

# 📱 响应式布局 & 自适应设计

> 以 Mobile-first 在所有屏幕宽度上提供最佳 UX。新建画面或确定布局·断点·触摸适配时阅读。这是 Web 响应式的单一来源（SoT），按栈（如 Vuetify）的实现见 `responsive-styling` 技能。

## 1. 核心原则
- Mobile-first 方法 — 以移动端为基准编写基础样式，并用 `min-width` 媒体查询扩展。
- 布局用 CSS Grid 和 Flexbox 实现，不使用固定 px 布局。
- 图像·媒体以 `max-width:100%` 为基本，并使用响应式 `srcset`/`sizes` 属性。
- 触摸目标保持在各平台的最小尺寸（iOS 44pt·Android 48dp·WCAG 2.5.5 24px 等）以上。
- 当按容器宽度而非视口宽度响应时，活用 container queries。

## 2. 规则

### 2-1. 断点策略 (Mobile-first)
建议将基础断点在项目中令牌化。

```css
/* ✅ 권장 — 기본: 모바일 (<640px) */
.container { padding: 0 16px; }

/* 태블릿 */
@media (min-width: 640px) { .container { padding: 0 24px; } }

/* 데스크톱 */
@media (min-width: 1024px) { .container { max-width: 1200px; margin: 0 auto; } }
```

### 2-2. 流体排版
```css
/* ✅ 권장 — clamp(최소, 선호, 최대)로 미디어 쿼리 없이 유연한 크기 */
h1 { font-size: clamp(1.5rem, 4vw, 2.5rem); }
p  { font-size: clamp(1rem, 2vw, 1.125rem); }
```

### 2-3. Grid 布局模式
```css
/* ✅ 권장 — 자동 채우기 카드 그리드 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
```

### 2-4. Container Queries (组件级响应)
```css
/* ✅ 권장 — 뷰포트가 아닌 컨테이너 폭으로 반응 */
.card-wrapper { container-type: inline-size; }

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

### 2-5. 触摸优化
```css
/* ❌ 금지 — hover 전용 UX를 터치 기기에도 노출 */
.tooltip:hover { display: block; }

/* ✅ 권장 — hover 가능한 기기로 제한 */
@media (hover: hover) {
  .tooltip:hover { display: block; }
}

/* ✅ 권장 — 스와이프 인터랙션에 touch-action 명시 */
.carousel { touch-action: pan-y; }
```

触摸目标用内边距确保在各平台的最小尺寸以上（参见上面的核心原则）。

## 3. 常见错误
- 使用固定 px 布局 → 在窄屏上出现横向滚动。
- 以 desktop-first 编写后用 `max-width` 收缩 → 移动端适配被排到后面。
- 图像遗漏 `max-width:100%` → 溢出容器导致布局破坏。
- 触摸目标低于平台最小值 → 在移动端难以点按。
- 将 hover 专用 UX 暴露给触摸设备 → 交互不起作用。

## 4. 检查清单
- [ ] 是否以移动端为基准编写基础样式并用 `min-width` 扩展？
- [ ] 是否用 Grid/Flexbox 实现布局并避免固定 px？
- [ ] 是否为图像·媒体应用了 `max-width:100%` 和 `srcset`/`sizes`？
- [ ] 是否将触摸目标确保在各平台最小尺寸以上？
- [ ] 是否用 `@media (hover: hover)` 限制了 hover 专用 UX？
