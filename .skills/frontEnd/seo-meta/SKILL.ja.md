---
name: SEO・メタタグ (SEO & Meta)
description: 検索エンジン最適化のためのメタタグ・Open Graph・構造化データ(JSON-LD)・サイトマップの標準。新しいページを作成したり、検索/ソーシャル共有の露出を扱ったり、SPA クロール対応を決めるときに読む。キーワード: SEO, meta description, og:, twitter:card, canonical, JSON-LD, schema.org, sitemap, robots.txt, SSR.
rules:
  - "すべてのページに<title>·<meta name='description'>·canonical を明記する。"
  - "ソーシャル共有対象のページに Open Graph + Twitter Card を追加する。"
  - "主要エンティティ(商品·記事·組織)に JSON-LD 構造化データを含める。"
  - "動的 SPA は SSR/プリレンダリングでクローラーがコンテンツを読めるようにする。"
  - "sitemap.xml·robots.txt を管理し、noindex ページは明記する。"
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

# 🔎 SEO・メタタグ

> 検索露出とソーシャル共有のためにメタ·構造化データ·サイトマップを標準化する。新しいページを作成したり、検索/共有の露出を扱うときに読む。

## 1. 核心原則
- すべてのページに`<title>`·`<meta name="description">`·canonical を明記する。
- ソーシャル共有対象のページに Open Graph + Twitter Card を追加する。
- 主要エンティティ(商品·記事·組織)に JSON-LD 構造化データを含める。
- 動的 SPA は SSR/プリレンダリングでクローラーがコンテンツを読めるようにする。
- sitemap.xml·robots.txt を管理し、noindex ページは明記する。

## 2. ルール

### 2-1. 必須メタ
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

### 2-3. 構造化データ (JSON-LD)
```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebPage", "name": "페이지명" }
</script>
```

### 2-4. SPA クロール対応
```js
// ❌ 금지 — CSR만 → 크롤러가 빈 페이지를 본다
// ✅ 권장 — 동적 라우트별 메타 변경 (Nuxt useHead / Next <Head>)
useHead({
  title: course.value.name,
  meta: [{ name: 'description', content: course.value.summary }],
})
```
- SSR(Next/Nuxt)または SSG(vite-ssg)を優先。Prerender.io·Rendertron は最後の手段。

## 3. よくあるミス
- すべてのページが同じ title/description を共有。
- canonical の欠落 → 重複コンテンツとして評価される。
- og:image のサイズ/絶対パスの欠落 → 共有カードが崩れる。
- CSR のみで動的コンテンツを提供 → インデックス漏れ。

## 4. チェックリスト
- [ ] ページごとに固有の title·description·canonical があるか
- [ ] 共有対象ページに OG·Twitter Card があるか
- [ ] 主要エンティティに JSON-LD を入れたか
- [ ] 動的 SPA に SSR/プリレンダリングを適用したか
- [ ] sitemap.xml·robots.txt を管理し noindex を指定したか
</content>
