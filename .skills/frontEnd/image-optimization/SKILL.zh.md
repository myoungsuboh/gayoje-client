---
name: 图像优化 (Image Optimization)
description: 通过 WebP/AVIF 格式、懒加载、响应式图像(srcset)、CDN 分发来改善加载性能和 CLS 的标准。在添加图像或改善 LCP/CLS 时阅读。关键词: WebP, AVIF, lazy loading, srcset, picture, preload, fetchpriority, CLS, CDN。
rules:
  - "生产环境图像转换为 WebP(或 AVIF)并提供 <picture> 回退。"
  - "视口外的图像采用懒加载(loading='lazy')。"
  - "英雄图/LCP 图像使用 preload + loading='eager' + fetchpriority='high' 立即加载。"
  - "用 srcset/sizes 提供匹配设备 DPR 和视口的分辨率。"
  - "为每张图像指定 width/height(或 aspect-ratio)以防止 CLS。"
tags:
  - "WebP"
  - "AVIF"
  - "lazy loading"
  - "srcset"
  - "picture"
  - "preload"
  - "fetchpriority"
  - "CLS"
  - "CDN"
  - "webp"
  - "avif"
  - "lazy"
  - "loading"
  - "cdn"
  - "image"
---

# 🖼️ 图像优化

> 通过标准化图像格式、加载策略、响应式和 CDN 来改善加载速度和 CLS。在添加图像或改善性能(LCP·CLS)时阅读。

## 1. 核心原则
- 生产环境图像转换为 WebP(或 AVIF)并提供 `<picture>` 回退。
- 视口外的图像采用懒加载(`loading="lazy"`)。
- 英雄图/LCP 图像使用 preload + `loading="eager"` + `fetchpriority="high"` 立即加载。
- 用 `srcset`/`sizes` 提供匹配设备 DPR 和视口的分辨率。
- 为每张图像指定 `width`/`height`(或 aspect-ratio)以防止 CLS。

## 2. 规则

### 2-1. 格式选择
| 格式 | 用途 | 效果 |
|---|---|---|
| WebP | 照片·复杂图形 | 比 JPEG 减少 25~35% |
| AVIF | 最新浏览器·高压缩 | 比 WebP 减少 20% |
| SVG | 图标·徽标·插画 | 放大无损 |

### 2-2. 响应式 + LCP 图像
```html
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img src="hero.jpg"
       srcset="hero-480w.jpg 480w, hero-800w.jpg 800w"
       sizes="(max-width: 600px) 480px, 800px"
       width="800" height="450"
       loading="eager" fetchpriority="high" alt="Hero" />
</picture>
```

### 2-3. 懒加载(其他图像)
```html
<!-- ❌ 禁止 — 无 width/height(产生 CLS) + 默认立即加载 -->
<img src="photo.jpg" alt="..." />

<!-- ✅ 推荐 — lazy + 明确尺寸 -->
<img src="photo.webp" loading="lazy" width="400" height="300" alt="..." />
```

### 2-4. CDN 分发
- `Cache-Control: public, max-age=31536000, immutable`(内容哈希 URL)。
- `Vary: Accept`(WebP/AVIF 协商)。
- 考虑使用缩放 CDN(Cloudflare Images·imgix)。

## 3. 常见错误
- 缺少 `width`/`height` → 产生 CLS。
- 所有图像都 eager 加载 → 延迟初始加载。
- 将英雄图像设为 lazy → 恶化 LCP。
- 原样分发原始 JPEG/PNG → 浪费带宽。

## 4. 检查清单
- [ ] 是否将生产环境图像转换为 WebP/AVIF 并提供回退?
- [ ] 视口外的图像是否懒加载?
- [ ] 是否用 preload + eager + fetchpriority 处理英雄图/LCP 图像?
- [ ] 是否用 srcset/sizes 分支分辨率?
- [ ] 是否为每张图像指定 width/height 以防止 CLS?
