---
name: SEO & 메타 태그 (SEO & Meta)
description: 검색 엔진 최적화를 위한 메타 태그·Open Graph·구조화 데이터(JSON-LD)·사이트맵 표준. 새 페이지를 만들거나 검색/소셜 공유 노출을 다룰 때, SPA 크롤링 대응을 정할 때 읽는다. 키워드: SEO, meta description, og:, twitter:card, canonical, JSON-LD, schema.org, sitemap, robots.txt, SSR.
rules:
  - "모든 페이지에 <title>·<meta name='description'>·canonical을 명시한다."
  - "소셜 공유 대상 페이지에 Open Graph + Twitter Card를 추가한다."
  - "주요 엔티티(상품·글·조직)에 JSON-LD 구조화 데이터를 포함한다."
  - "동적 SPA는 SSR/프리렌더링으로 크롤러가 콘텐츠를 읽게 한다."
  - "sitemap.xml·robots.txt를 관리하고, noindex 페이지는 명시한다."
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

# 🔎 SEO & 메타 태그

> 검색 노출과 소셜 공유를 위한 메타·구조화 데이터·사이트맵을 표준화한다. 새 페이지를 만들거나 검색/공유 노출을 다룰 때 읽는다.

## 1. 핵심 원칙
- 모든 페이지에 `<title>`·`<meta name="description">`·canonical을 명시한다.
- 소셜 공유 대상 페이지에 Open Graph + Twitter Card를 추가한다.
- 주요 엔티티(상품·글·조직)에 JSON-LD 구조화 데이터를 포함한다.
- 동적 SPA는 SSR/프리렌더링으로 크롤러가 콘텐츠를 읽게 한다.
- sitemap.xml·robots.txt를 관리하고, noindex 페이지는 명시한다.

## 2. 규칙

### 2-1. 필수 메타
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

### 2-3. 구조화 데이터 (JSON-LD)
```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebPage", "name": "페이지명" }
</script>
```

### 2-4. SPA 크롤링 대응
```js
// ❌ 금지 — CSR만 → 크롤러가 빈 페이지를 본다
// ✅ 권장 — 동적 라우트별 메타 변경 (Nuxt useHead / Next <Head>)
useHead({
  title: course.value.name,
  meta: [{ name: 'description', content: course.value.summary }],
})
```
- SSR(Next/Nuxt) 또는 SSG(vite-ssg) 우선. Prerender.io·Rendertron은 최후 수단.

## 3. 흔한 실수
- 모든 페이지가 같은 title/description 공유.
- canonical 누락 → 중복 콘텐츠로 평가.
- og:image 크기/절대경로 누락 → 공유 카드 깨짐.
- CSR만으로 동적 콘텐츠 제공 → 색인 누락.

## 4. 체크리스트
- [ ] 페이지별 고유 title·description·canonical이 있는가
- [ ] 공유 대상 페이지에 OG·Twitter Card가 있는가
- [ ] 주요 엔티티에 JSON-LD를 넣었는가
- [ ] 동적 SPA에 SSR/프리렌더링을 적용했는가
- [ ] sitemap.xml·robots.txt를 관리하고 noindex를 지정했는가
