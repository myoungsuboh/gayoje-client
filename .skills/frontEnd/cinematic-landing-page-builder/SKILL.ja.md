---
name: シネマティックランディングページビルダー (Vue 3 + Vuetify)
description: Vue 3 + Vuetify 3 + GSAP/Motion をベースに高品質なシネマティックランディングページを構築する際に読む。プリセットベースのデザイントークン、スクロールアニメーション、レスポンシブ、アクセシビリティ標準を扱う。キーワード landing, GSAP, ScrollTrigger, プリセット, グラスモーフィズム。
rules:
  - "メインスタックは Vue 3 + Vuetify 3 + Vite + Pinia (React/JSX の使用禁止)"
  - "デザインは4種のプリセット(デザイントークンのまとまり)をベースに構成する。"
  - "アニメーションは GSAP ScrollTrigger を使うが、ルート遷移時には必ず kill() で後始末する。"
  - "prefers-reduced-motion を尊重し、すべてのコピーは i18n キーで管理する。"
  - "デザイントークンは変数として登録し、コンポーネントに raw hex を直書きしない。"
tags:
  - "framer-motion"
  - "gsap"
  - "scroll-trigger"
  - "intersection-observer"
  - "lottie"
---

# 🎬 シネマティックランディングページビルダー (Vue 3)

> ユーザーがランディングページの作成を依頼した際に、プリセットベースで高品質なシネマティックランディングページを即座に構築するために読む。

**スタックの明確化**: このプロジェクトのメインスタックは **Vue 3 + Vuetify 3 + Vite + Pinia** です。過去にこのファイルに React のコードがあったことがありますが誤った内容だったため、Vue を基準に訂正しました。他の frontEnd スキルと同じスタックです。

関連スキル:
- デザイントークン / グラスモーフィズム: [design-system](../design-system/SKILL.md)
- レスポンシブブレークポイント: [responsive-styling](../responsive-styling/SKILL.md)
- パフォーマンス(LCP, lazy, 画像最適化): [performance-optimization](../performance-optimization/SKILL.md)
- アクセシビリティ: [accessibility-a11y](../accessibility-a11y/SKILL.md)
- 多言語対応: [i18n-internationalization](../i18n-internationalization/SKILL.md)

## 1. 核心原則
- メインスタックは Vue 3 + Vuetify 3 + Vite + Pinia (React/JSX の使用禁止)
- デザインは4種のプリセット(デザイントークンのまとまり)をベースに構成する。
- アニメーションは GSAP ScrollTrigger を使うが、ルート遷移時には必ず `kill()` で後始末する。
- `prefers-reduced-motion` を尊重し、すべてのコピーは i18n キーで管理する。
- デザイントークンは変数として登録し、コンポーネントに raw hex を直書きしない。

## 2. ルール

### 2-1. 役割と作業フロー
ユーザーがランディングページの作成を依頼したら、以下の4つを**一度に**質問し、その回答だけで全体構造を即座に構築する。雑談・繰り返しの質問は禁止。

```
1) ブランド名と一行説明
2) 以下の4種のプリセットから1つを選択 (Organic Tech / Midnight Luxe / Brutalist Signal / Vapor Clinic)
3) 核心となる価値提案3つ
4) メイン CTA (Call To Action — 訪問者がとるべき行動)
```

### 2-2. プリセット (4種)
各プリセットはデザイントークンのまとまり。`src/styles/landing-presets.scss` または [design-system](../design-system/SKILL.md) の themeConfig に変数として登録する。

**Preset A — "Organic Tech" (Clinical Boutique)**
- **パレット**: Moss `#2E4036`, Clay `#CC5833`, Cream `#F2F0E9`, Charcoal `#1A1A1A`
- **フォント**: `Plus Jakarta Sans` (本文) + `Cormorant Garamond Italic` (イタリック強調) + `IBM Plex Mono` (コード/数字)

**Preset B — "Midnight Luxe" (Dark Editorial)**
- **パレット**: Obsidian `#0D0D12`, Champagne `#C9A84C`, Ivory `#FAF8F5`, Slate `#2A2A35`
- **フォント**: `Inter` + `Playfair Display Italic` + `JetBrains Mono`

**Preset C — "Brutalist Signal" (Raw Precision)**
- **パレット**: Paper `#E8E4DD`, Signal Red `#E63B2E`, Off-white `#F5F3EE`, Black `#111111`
- **フォント**: `Space Grotesk` + `DM Serif Display Italic` + `Space Mono`

**Preset D — "Vapor Clinic" (Neon Biotech)**
- **パレット**: Deep Void `#0A0A14`, Plasma `#7B61FF`, Ghost `#F0EFF4`, Graphite `#18181B`
- **フォント**: `Sora` + `Instrument Serif Italic` + `Fira Code`

### 2-3. 技術スタック

| 領域 | ライブラリ |
|------|-----------|
| フレームワーク | Vue 3 (Composition API + `<script setup>`) |
| UI | Vuetify 3 (カスタムグラスモーフィズム — design-system 参照) |
| ビルド | Vite 5 |
| ルーティング | vue-router 4 |
| アニメーション | GSAP 3 + ScrollTrigger (または `@vueuse/motion`) |
| アイコン | `@mdi/font` (Vuetify 標準) または lucide-vue-next |
| 画像 | Unsplash の実 URL (`https://images.unsplash.com/...`) — プリセットのムードに合わせて |

### 2-4. ディレクトリ構造

```
src/views/landing/
├── LandingView.vue              # ルートエントリポイント
├── sections/
│   ├── HeroSection.vue          # ヒーロー + スクロールピン/フェード
│   ├── ValuePropsSection.vue    # 3つの価値提案カード
│   ├── ShowcaseSection.vue      # インタラクティブデモ/スクロールスクラブ
│   ├── TestimonialsSection.vue
│   └── CtaSection.vue           # 最終 CTA
├── composables/
│   ├── useScrollAnimation.ts    # GSAP ScrollTrigger ラッパー
│   └── useParallax.ts
└── styles/
    └── landing-tokens.scss      # プリセット変数
```

### 2-5. GSAP ScrollTrigger Composable (再利用)

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

使用:
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

> ⚠️ `ScrollTrigger` はルート遷移時に必ず `kill()`。さもないと SPA でメモリリークになる。

### 2-6. レスポンシブ / アクセシビリティ / パフォーマンス
- ✅ モバイルファースト (Vuetify breakpoint `xs/sm/md/lg/xl` を活用 — [responsive-styling](../responsive-styling/SKILL.md))
- ✅ 大きなヒーロー画像は WebP/AVIF + `srcset` + `loading="lazy"` ([performance-optimization](../performance-optimization/SKILL.md))
- ✅ ユーザーが `prefers-reduced-motion: reduce` ならアニメーションを無効化:
  ```ts
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) ScrollTrigger.disable()
  ```
- ✅ すべてのインタラクティブ要素にキーボードフォーカス表示 + `aria-label` ([accessibility-a11y](../accessibility-a11y/SKILL.md))
- ✅ すべてのコピーは i18n キーで ([i18n-internationalization](../i18n-internationalization/SKILL.md)) — 韓国語のハードコーディング禁止

## 3. よくあるミス
- ❌ React コンポーネント/JSX の使用 (プロジェクトスタックと不一致)
- ❌ GSAP をグローバルインスタンスのままにしてルート遷移時の cleanup を漏らす
- ❌ `prefers-reduced-motion` を無視 → 乗り物酔い・アクセシビリティ違反
- ❌ ヒーロー画像の原本(5MB+)をそのままロード → LCP(Largest Contentful Paint) 爆発
- ❌ コピーを韓国語でハードコーディング → 多言語切り替え不可
- ❌ デザイントークンをコンポーネントごとに raw hex で直書き → プリセット変更時に全ファイル修正

## 4. チェックリスト
- [ ] 作業開始前に4つ(ブランド名/プリセット/価値提案3つ/CTA)を一度に質問したか
- [ ] 4種のプリセットのうち1つのデザイントークンを変数として登録したか
- [ ] Vue 3 + Vuetify 3 スタックのみを使用したか (React/JSX 禁止)
- [ ] GSAP ScrollTrigger をルート遷移時に `kill()` で後始末したか
- [ ] `prefers-reduced-motion: reduce` 時にアニメーションを無効化したか
- [ ] ヒーロー画像を WebP/AVIF + `srcset` + `loading="lazy"` で最適化したか
- [ ] すべてのコピーを i18n キーで管理し、韓国語のハードコーディングを除去したか
