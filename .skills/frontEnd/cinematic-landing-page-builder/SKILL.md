---
name: 시네마틱 랜딩 페이지 빌더 (Vue 3 + Vuetify)
description: Vue 3 + Vuetify 3 + GSAP/Motion 기반 고품질 시네마틱 랜딩 페이지를 구축할 때 읽는다. 프리셋 기반 디자인 토큰, 스크롤 애니메이션, 반응형, 접근성 표준을 다룬다. 키워드 landing, GSAP, ScrollTrigger, 프리셋, 글래스모피즘.
rules:
  - "메인 스택은 Vue 3 + Vuetify 3 + Vite + Pinia (React/JSX 사용 금지)"
  - "디자인은 4종 프리셋(디자인 토큰 묶음) 기반으로 구성한다."
  - "애니메이션은 GSAP ScrollTrigger를 사용하되 라우트 이동 시 반드시 kill()로 정리한다."
  - "prefers-reduced-motion을 존중하고, 모든 카피는 i18n 키로 관리한다."
  - "디자인 토큰은 변수로 등록하고 컴포넌트에 raw hex를 박지 않는다."
tags:
  - "framer-motion"
  - "gsap"
  - "scroll-trigger"
  - "intersection-observer"
  - "lottie"
---

# 🎬 시네마틱 랜딩 페이지 빌더 (Vue 3)

> 사용자가 랜딩 페이지 제작을 요청할 때, 프리셋 기반으로 고품질 시네마틱 랜딩 페이지를 즉시 구축하기 위해 읽는다.

**스택 명확화**: 이 프로젝트의 메인 스택은 **Vue 3 + Vuetify 3 + Vite + Pinia** 입니다. 과거 이 파일에 React 코드가 있었던 적이 있으나 잘못된 내용이었으므로 Vue 기준으로 정정했습니다. 다른 frontEnd 스킬들과 동일한 스택입니다.

관련 스킬:
- 디자인 토큰 / 글래스모피즘: [design-system](../design-system/SKILL.md)
- 반응형 브레이크포인트: [responsive-styling](../responsive-styling/SKILL.md)
- 성능(LCP, lazy, 이미지 최적화): [performance-optimization](../performance-optimization/SKILL.md)
- 접근성: [accessibility-a11y](../accessibility-a11y/SKILL.md)
- 다국어: [i18n-internationalization](../i18n-internationalization/SKILL.md)

## 1. 핵심 원칙
- 메인 스택은 Vue 3 + Vuetify 3 + Vite + Pinia (React/JSX 사용 금지)
- 디자인은 4종 프리셋(디자인 토큰 묶음) 기반으로 구성한다.
- 애니메이션은 GSAP ScrollTrigger를 사용하되 라우트 이동 시 반드시 `kill()`로 정리한다.
- `prefers-reduced-motion`을 존중하고, 모든 카피는 i18n 키로 관리한다.
- 디자인 토큰은 변수로 등록하고 컴포넌트에 raw hex를 박지 않는다.

## 2. 규칙

### 2-1. 역할과 작업 흐름
사용자가 랜딩 페이지 제작을 요청하면 다음 4가지를 **한 번에** 질문한 뒤 답변만으로 전체 구조를 즉시 구축한다. 잡담·반복 질문 금지.

```
1) 브랜드명과 한 줄 설명
2) 아래 4가지 프리셋 중 1개 선택 (Organic Tech / Midnight Luxe / Brutalist Signal / Vapor Clinic)
3) 핵심 가치 제안 3가지
4) 메인 CTA (Call To Action — 방문자가 해야 할 행동)
```

### 2-2. 프리셋 (4종)
각 프리셋은 디자인 토큰 묶음. `src/styles/landing-presets.scss` 또는 [design-system](../design-system/SKILL.md)의 themeConfig에 변수로 등록한다.

**Preset A — "Organic Tech" (Clinical Boutique)**
- **팔레트**: Moss `#2E4036`, Clay `#CC5833`, Cream `#F2F0E9`, Charcoal `#1A1A1A`
- **폰트**: `Plus Jakarta Sans` (본문) + `Cormorant Garamond Italic` (이탤릭 강조) + `IBM Plex Mono` (코드/숫자)

**Preset B — "Midnight Luxe" (Dark Editorial)**
- **팔레트**: Obsidian `#0D0D12`, Champagne `#C9A84C`, Ivory `#FAF8F5`, Slate `#2A2A35`
- **폰트**: `Inter` + `Playfair Display Italic` + `JetBrains Mono`

**Preset C — "Brutalist Signal" (Raw Precision)**
- **팔레트**: Paper `#E8E4DD`, Signal Red `#E63B2E`, Off-white `#F5F3EE`, Black `#111111`
- **폰트**: `Space Grotesk` + `DM Serif Display Italic` + `Space Mono`

**Preset D — "Vapor Clinic" (Neon Biotech)**
- **팔레트**: Deep Void `#0A0A14`, Plasma `#7B61FF`, Ghost `#F0EFF4`, Graphite `#18181B`
- **폰트**: `Sora` + `Instrument Serif Italic` + `Fira Code`

### 2-3. 기술 스택

| 영역 | 라이브러리 |
|------|-----------|
| 프레임워크 | Vue 3 (Composition API + `<script setup>`) |
| UI | Vuetify 3 (커스텀 글래스모피즘 — design-system 참고) |
| 빌드 | Vite 5 |
| 라우팅 | vue-router 4 |
| 애니메이션 | GSAP 3 + ScrollTrigger (또는 `@vueuse/motion`) |
| 아이콘 | `@mdi/font` (Vuetify 기본) 또는 lucide-vue-next |
| 이미지 | Unsplash 실제 URL (`https://images.unsplash.com/...`) — 프리셋 무드에 맞게 |

### 2-4. 디렉토리 구조

```
src/views/landing/
├── LandingView.vue              # 라우트 진입점
├── sections/
│   ├── HeroSection.vue          # 히어로 + 스크롤 픽스/페이드
│   ├── ValuePropsSection.vue    # 3개 가치 제안 카드
│   ├── ShowcaseSection.vue      # 인터랙티브 데모/스크롤스크럽
│   ├── TestimonialsSection.vue
│   └── CtaSection.vue           # 최종 CTA
├── composables/
│   ├── useScrollAnimation.ts    # GSAP ScrollTrigger 래퍼
│   └── useParallax.ts
└── styles/
    └── landing-tokens.scss      # 프리셋 변수
```

### 2-5. GSAP ScrollTrigger Composable (재사용)

```vue
<!-- src/views/landing/composables/useScrollAnimation.ts -->
<script lang="ts">
import { onMounted, onBeforeUnmount, type Ref } from 'vue'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function useFadeInUp(target: Ref<HTMLElement | null>, options = {}) {
  let trigger: ScrollTrigger | null = null

  onMounted(() => {
    if (!target.value) return
    trigger = ScrollTrigger.create({
      trigger: target.value,
      start: 'top 80%',
      onEnter: () => gsap.fromTo(target.value,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }
      ),
      once: true,
      ...options
    })
  })

  onBeforeUnmount(() => { trigger?.kill() })
}
</script>
```

사용:
```vue
<!-- HeroSection.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useFadeInUp } from '../composables/useScrollAnimation'

const headlineRef = ref<HTMLElement | null>(null)
useFadeInUp(headlineRef)
</script>

<template>
  <section class="hero">
    <h1 ref="headlineRef">{{ brandTagline }}</h1>
  </section>
</template>
```

> ⚠️ `ScrollTrigger`는 라우트 이동 시 반드시 `kill()`. 안 그러면 SPA에서 메모리 누수.

### 2-6. 반응형 / 접근성 / 성능
- ✅ 모바일 퍼스트 (Vuetify breakpoint `xs/sm/md/lg/xl` 활용 — [responsive-styling](../responsive-styling/SKILL.md))
- ✅ 큰 히어로 이미지는 WebP/AVIF + `srcset` + `loading="lazy"` ([performance-optimization](../performance-optimization/SKILL.md))
- ✅ 사용자가 `prefers-reduced-motion: reduce` 면 애니메이션 비활성:
  ```ts
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) ScrollTrigger.disable()
  ```
- ✅ 모든 인터랙티브 요소에 키보드 포커스 표시 + `aria-label` ([accessibility-a11y](../accessibility-a11y/SKILL.md))
- ✅ 모든 카피는 i18n 키로 ([i18n-internationalization](../i18n-internationalization/SKILL.md)) — 한국어 하드코딩 금지

## 3. 흔한 실수
- ❌ React 컴포넌트/JSX 사용 (프로젝트 스택과 불일치)
- ❌ GSAP를 글로벌 인스턴스로 두고 라우트 이동 시 cleanup 누락
- ❌ `prefers-reduced-motion` 무시 → 멀미·접근성 위반
- ❌ Hero 이미지 원본(5MB+) 그대로 로드 → LCP(Largest Contentful Paint) 폭발
- ❌ 카피를 한국어로 하드코딩 → 다국어 전환 불가
- ❌ 디자인 토큰을 컴포넌트마다 raw hex 로 박기 → 프리셋 변경 시 전 파일 수정

## 4. 체크리스트
- [ ] 작업 시작 전 4가지(브랜드명/프리셋/가치제안 3개/CTA)를 한 번에 질문했는가
- [ ] 4종 프리셋 중 하나의 디자인 토큰을 변수로 등록했는가
- [ ] Vue 3 + Vuetify 3 스택만 사용했는가 (React/JSX 금지)
- [ ] GSAP ScrollTrigger를 라우트 이동 시 `kill()`로 정리했는가
- [ ] `prefers-reduced-motion: reduce` 시 애니메이션을 비활성화했는가
- [ ] 히어로 이미지를 WebP/AVIF + `srcset` + `loading="lazy"`로 최적화했는가
- [ ] 모든 카피를 i18n 키로 관리하고 한국어 하드코딩을 제거했는가
