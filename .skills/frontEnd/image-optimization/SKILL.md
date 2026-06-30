---
name: 이미지 최적화 (Image Optimization)
description: WebP/AVIF 포맷·지연 로딩·반응형 이미지(srcset)·CDN 서빙으로 로딩 성능과 CLS를 개선하는 표준. 이미지를 추가하거나 LCP/CLS를 개선할 때 읽는다. 키워드: WebP, AVIF, lazy loading, srcset, picture, preload, fetchpriority, CLS, CDN.
rules:
  - "프로덕션 이미지는 WebP(또는 AVIF)로 변환하고 <picture> 폴백을 제공한다."
  - "뷰포트 밖 이미지는 지연 로딩(loading='lazy')한다."
  - "히어로·LCP 이미지는 preload + loading='eager' + fetchpriority='high'로 즉시 로드한다."
  - "srcset/sizes로 디바이스 DPR·뷰포트에 맞는 해상도를 제공한다."
  - "모든 이미지에 width/height(또는 aspect-ratio)를 명시해 CLS를 방지한다."
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

# 🖼️ 이미지 최적화

> 이미지 포맷·로딩 전략·반응형·CDN을 표준화해 로딩 속도와 CLS를 개선한다. 이미지를 추가하거나 성능(LCP·CLS)을 개선할 때 읽는다.

## 1. 핵심 원칙
- 프로덕션 이미지는 WebP(또는 AVIF)로 변환하고 `<picture>` 폴백을 제공한다.
- 뷰포트 밖 이미지는 지연 로딩(`loading="lazy"`)한다.
- 히어로·LCP 이미지는 preload + `loading="eager"` + `fetchpriority="high"`로 즉시 로드한다.
- `srcset`/`sizes`로 디바이스 DPR·뷰포트에 맞는 해상도를 제공한다.
- 모든 이미지에 `width`/`height`(또는 aspect-ratio)를 명시해 CLS를 방지한다.

## 2. 규칙

### 2-1. 포맷 선택
| 포맷 | 용도 | 효과 |
|---|---|---|
| WebP | 사진·복잡한 그래픽 | JPEG 대비 25~35%↓ |
| AVIF | 최신 브라우저·고압축 | WebP 대비 20%↓ |
| SVG | 아이콘·로고·일러스트 | 확대 무손실 |

### 2-2. 반응형 + LCP 이미지
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

### 2-3. 지연 로딩 (그 외 이미지)
```html
<!-- ❌ 금지 — width/height 없음(CLS 발생) + 기본 즉시 로드 -->
<img src="photo.jpg" alt="..." />

<!-- ✅ 권장 — lazy + 크기 명시 -->
<img src="photo.webp" loading="lazy" width="400" height="300" alt="..." />
```

### 2-4. CDN 서빙
- `Cache-Control: public, max-age=31536000, immutable` (콘텐츠 해시 URL).
- `Vary: Accept` (WebP/AVIF 협상).
- 리사이징 CDN(Cloudflare Images·imgix) 활용 검토.

## 3. 흔한 실수
- `width`/`height` 누락 → CLS 발생.
- 모든 이미지를 eager 로드 → 초기 로딩 지연.
- 히어로 이미지를 lazy 처리 → LCP 악화.
- 원본 JPEG/PNG 그대로 서빙 → 대역폭 낭비.

## 4. 체크리스트
- [ ] 프로덕션 이미지를 WebP/AVIF로 변환하고 폴백을 제공했는가
- [ ] 뷰포트 밖 이미지를 lazy 로딩하는가
- [ ] 히어로/LCP 이미지를 preload + eager + fetchpriority로 처리했는가
- [ ] srcset/sizes로 해상도를 분기했는가
- [ ] 모든 이미지에 width/height를 명시해 CLS를 방지했는가
