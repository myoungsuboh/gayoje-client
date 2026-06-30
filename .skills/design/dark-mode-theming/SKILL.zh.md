---
name: 深色模式 & 主题系统
description: 使用 CSS Custom Properties 与 prefers-color-scheme 实现浅色/深色模式及可扩展主题的指南。在为新页面上色，或确定主题切换、系统主题检测、深色模式配色时阅读。关键词: prefers-color-scheme, data-theme, color-scheme, dark, localStorage, currentColor, --color-.
rules:
  - "颜色必须仅通过 CSS Custom Properties(语义化令牌)引用，浅色/深色的值在各自作用域中重新定义。"
  - "用 prefers-color-scheme 自动检测系统主题，同时也支持用户手动选择(light/dark/system)。"
  - "深色模式下使用深灰色系(如 #0f172a)而非纯黑(#000000)，以减轻眼睛疲劳。"
  - "图片和视频仅在深色模式下过亮时才逐例应用滤镜(高饱和度照片考虑单独的资源),SVG 使用 currentColor。"
  - "将主题选择保存到 localStorage，并在初始加载时防止闪烁(FOUC)。"
tags:
  - "prefers-color-scheme"
  - "data-theme"
  - "color-scheme"
  - "dark"
  - "localStorage"
  - "currentColor"
  - "--color-"
---

# 🌙 深色模式 & 主题系统

> 用一套语义化令牌一致地实现浅色/深色/扩展主题。在为新页面上色或处理主题切换时阅读。

## 1. 核心原则
- 颜色必须仅通过 CSS Custom Properties(语义化令牌)引用，浅色/深色的值在各自作用域中重新定义。
- 用 `prefers-color-scheme` 自动检测系统主题，同时也支持用户手动选择(light/dark/system)。
- 深色模式下使用深灰色系(如 #0f172a)而非纯黑(#000000)，以减轻眼睛疲劳。
- 图片和视频仅在深色模式下过亮时才逐例应用滤镜(高饱和度照片考虑单独的资源)，SVG 使用 `currentColor`。
- 将主题选择保存到 localStorage，并在初始加载时防止闪烁(FOUC)。

## 2. 规则

### 2-1. 基于语义化令牌的主题
```css
/* ❌ 금지 — 하드코딩 색, 다크모드에서 재정의 불가 */
.card { background: #ffffff; color: #0f172a; }

/* ✅ 권장 — 시맨틱 토큰 참조 + 스코프별 재정의 */
:root {
  --color-bg-primary:   #ffffff;
  --color-text-primary: #0f172a;
  --color-surface:      #f8fafc;
  --color-border:       #e2e8f0;
}

[data-theme="dark"], @media (prefers-color-scheme: dark) {
  --color-bg-primary:   #0f172a;
  --color-text-primary: #f1f5f9;
  --color-surface:      #1e293b;
  --color-border:       #334155;
}
```

### 2-2. 防止 FOUC(无闪烁的初始加载)
通过 HTML `<head>` 中的内联脚本立即应用类 — 在渲染前确定主题。
```html
<script>
  (function(){
    const t = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute(
      'data-theme',
      t === 'dark' || (!t && prefersDark) ? 'dark' : 'light'
    );
  })();
</script>
```

### 2-3. 主题切换实现模式
```js
function setTheme(value) {  // 'light' | 'dark' | 'system'
  localStorage.setItem('theme', value);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = value === 'system' ? (prefersDark ? 'dark' : 'light') : value;
  document.documentElement.setAttribute('data-theme', resolved);
}
```

### 2-4. 深色模式下的图片与媒体处理
```css
/* 사진 이미지 — 밝기 살짝 낮춤 (필요한 경우만) */
[data-theme="dark"] img:not([data-no-darken]) {
  filter: brightness(0.85) contrast(1.05);
}
/* SVG 아이콘 — 색상 상속 */
.icon { fill: currentColor; }
```

## 3. 常见错误
- 硬编码颜色 → 在深色模式下无法重新定义而出错。
- 省略初始内联脚本 → 刷新时出现浅色→深色闪烁(FOUC)。
- 在深色模式使用纯黑 → 对比度过强，眼睛疲劳。
- 对所有图片一律应用滤镜 → 高饱和度照片变得灰暗。

## 4. 检查清单
- [ ] 是否所有颜色都仅通过语义化令牌(`--color-*`)引用？
- [ ] 是否支持 light/dark/system 三种模式？
- [ ] 是否通过初始内联脚本防止了 FOUC？
- [ ] 是否将主题选择保存到 localStorage 并恢复？
- [ ] 深色模式的颜色是否为灰色系而非纯黑？
- [ ] SVG 是否使用 currentColor，照片是否逐例应用滤镜？
