---
name: SEO & Meta Tags (SEO & Meta)
description: Standards for meta tags, Open Graph, structured data (JSON-LD), and sitemaps for search engine optimization. Read when creating new pages, handling search/social-share exposure, or deciding on SPA crawling support. Keywords: SEO, meta description, og:, twitter:card, canonical, JSON-LD, schema.org, sitemap, robots.txt, SSR.
rules:
  - "Specify <title>·<meta name='description'>·canonical on every page."
  - "Add Open Graph + Twitter Card to pages targeted for social sharing."
  - "Include JSON-LD structured data for key entities (products·articles·organizations)."
  - "For dynamic SPAs, let crawlers read content via SSR/prerendering."
  - "Manage sitemap.xml·robots.txt, and explicitly mark noindex pages."
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

# 🔎 SEO & Meta Tags

> Standardize metadata, structured data, and sitemaps for search exposure and social sharing. Read when creating new pages or handling search/share exposure.

## 1. Core Principles
- Specify `<title>`·`<meta name="description">`·canonical on every page.
- Add Open Graph + Twitter Card to pages targeted for social sharing.
- Include JSON-LD structured data for key entities (products·articles·organizations).
- For dynamic SPAs, let crawlers read content via SSR/prerendering.
- Manage sitemap.xml·robots.txt, and explicitly mark noindex pages.

## 2. Rules

### 2-1. Required Meta
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

### 2-3. Structured Data (JSON-LD)
```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebPage", "name": "페이지명" }
</script>
```

### 2-4. SPA Crawling Support
```js
// ❌ 금지 — CSR만 → 크롤러가 빈 페이지를 본다
// ✅ 권장 — 동적 라우트별 메타 변경 (Nuxt useHead / Next <Head>)
useHead({
  title: course.value.name,
  meta: [{ name: 'description', content: course.value.summary }],
})
```
- Prefer SSR (Next/Nuxt) or SSG (vite-ssg). Prerender.io·Rendertron are last resorts.

## 3. Common Mistakes
- All pages share the same title/description.
- Missing canonical → evaluated as duplicate content.
- Missing og:image size/absolute path → broken share card.
- Serving dynamic content with CSR only → missing from the index.

## 4. Checklist
- [ ] Does each page have a unique title·description·canonical
- [ ] Do share-target pages have OG·Twitter Card
- [ ] Did you add JSON-LD to key entities
- [ ] Did you apply SSR/prerendering to dynamic SPAs
- [ ] Do you manage sitemap.xml·robots.txt and specify noindex
</content>
