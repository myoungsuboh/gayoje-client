---
name: SEO 与元标签 (SEO & Meta)
description: 用于搜索引擎优化的元标签、Open Graph、结构化数据(JSON-LD)、站点地图标准。在创建新页面、处理搜索/社交分享曝光、或确定 SPA 爬取支持方案时阅读。关键词: SEO, meta description, og:, twitter:card, canonical, JSON-LD, schema.org, sitemap, robots.txt, SSR.
rules:
  - "在每个页面上明确指定<title>·<meta name='description'>·canonical。"
  - "为面向社交分享的页面添加 Open Graph + Twitter Card。"
  - "为主要实体(商品·文章·组织)包含 JSON-LD 结构化数据。"
  - "动态 SPA 通过 SSR/预渲染让爬虫能读取内容。"
  - "管理 sitemap.xml·robots.txt,并明确标注 noindex 页面。"
tags:
  - "SEO"
  - "meta description"
  - "og:"
  - "twitter:card"
  - "canonical"
  - "JSON-LD"
  - "schema.org"
  - "sitemap"
  - "robots.txt"
  - "SSR"
  - "seo"
  - "meta"
  - "json-ld"
---

# 🔎 SEO 与元标签

> 为搜索曝光和社交分享标准化元数据、结构化数据和站点地图。在创建新页面或处理搜索/分享曝光时阅读。

## 1. 核心原则
- 在每个页面上明确指定`<title>`·`<meta name="description">`·canonical。
- 为面向社交分享的页面添加 Open Graph + Twitter Card。
- 为主要实体(商品·文章·组织)包含 JSON-LD 结构化数据。
- 动态 SPA 通过 SSR/预渲染让爬虫能读取内容。
- 管理 sitemap.xml·robots.txt,并明确标注 noindex 页面。

## 2. 规则

### 2-1. 必需元标签
```html
<title>페이지명 | 브랜드명</title>
<meta name="description" content="150자 이내 핵심 요약" />
<link rel="canonical" href="https://example.com/page" />
```

### 2-2. Open Graph / Twitter Card
```html
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="https://.../og.png" />  <!-- 1200×630 권장 -->
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

### 2-3. 结构化数据 (JSON-LD)
```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebPage", "name": "페이지명" }
</script>
```

### 2-4. SPA 爬取支持
```js
// ❌ 금지 — CSR만 → 크롤러가 빈 페이지를 본다
// ✅ 권장 — 동적 라우트별 메타 변경 (Nuxt useHead / Next <Head>)
useHead({
  title: course.value.name,
  meta: [{ name: 'description', content: course.value.summary }],
})
```
- 优先使用 SSR(Next/Nuxt)或 SSG(vite-ssg)。Prerender.io·Rendertron 是最后手段。

## 3. 常见错误
- 所有页面共享相同的 title/description。
- 缺少 canonical → 被评估为重复内容。
- 缺少 og:image 尺寸/绝对路径 → 分享卡片损坏。
- 仅用 CSR 提供动态内容 → 索引遗漏。

## 4. 检查清单
- [ ] 每个页面是否有独有的 title·description·canonical
- [ ] 分享目标页面是否有 OG·Twitter Card
- [ ] 是否为主要实体加入了 JSON-LD
- [ ] 是否对动态 SPA 应用了 SSR/预渲染
- [ ] 是否管理 sitemap.xml·robots.txt 并指定了 noindex
</content>
