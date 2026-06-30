---
name: Image Optimization
description: A standard for improving load performance and CLS via WebP/AVIF formats, lazy loading, responsive images (srcset), and CDN serving. Read when adding images or improving LCP/CLS. Keywords: WebP, AVIF, lazy loading, srcset, picture, preload, fetchpriority, CLS, CDN.
rules:
  - "Convert production images to WebP (or AVIF) and provide a <picture> fallback."
  - "Lazy-load (loading='lazy') images outside the viewport."
  - "Load hero/LCP images immediately with preload + loading='eager' + fetchpriority='high'."
  - "Use srcset/sizes to serve resolutions matched to the device DPR and viewport."
  - "Specify width/height (or aspect-ratio) on every image to prevent CLS."
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

# 🖼️ Image Optimization

> Standardize image formats, loading strategy, responsiveness, and CDN to improve load speed and CLS. Read when adding images or improving performance (LCP/CLS).

## 1. Core Principles
- Convert production images to WebP (or AVIF) and provide a `<picture>` fallback.
- Lazy-load (`loading="lazy"`) images outside the viewport.
- Load hero/LCP images immediately with preload + `loading="eager"` + `fetchpriority="high"`.
- Use `srcset`/`sizes` to serve resolutions matched to the device DPR and viewport.
- Specify `width`/`height` (or aspect-ratio) on every image to prevent CLS.

## 2. Rules

### 2-1. Format selection
| Format | Use | Effect |
|---|---|---|
| WebP | Photos / complex graphics | 25–35% smaller than JPEG |
| AVIF | Modern browsers / high compression | 20% smaller than WebP |
| SVG | Icons / logos / illustrations | Lossless when scaled |

### 2-2. Responsive + LCP images
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

### 2-3. Lazy loading (other images)
```html
<!-- ❌ Forbidden — no width/height (causes CLS) + default immediate load -->
<img src="photo.jpg" alt="..." />

<!-- ✅ Recommended — lazy + explicit dimensions -->
<img src="photo.webp" loading="lazy" width="400" height="300" alt="..." />
```

### 2-4. CDN serving
- `Cache-Control: public, max-age=31536000, immutable` (content-hashed URL).
- `Vary: Accept` (WebP/AVIF negotiation).
- Consider using a resizing CDN (Cloudflare Images / imgix).

## 3. Common Mistakes
- Missing `width`/`height` → causes CLS.
- Eager-loading every image → delays initial load.
- Lazy-loading the hero image → worsens LCP.
- Serving original JPEG/PNG as-is → wastes bandwidth.

## 4. Checklist
- [ ] Did you convert production images to WebP/AVIF and provide a fallback?
- [ ] Are images outside the viewport lazy-loaded?
- [ ] Did you handle hero/LCP images with preload + eager + fetchpriority?
- [ ] Did you branch resolutions with srcset/sizes?
- [ ] Did you specify width/height on every image to prevent CLS?
