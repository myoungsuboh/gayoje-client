---
name: ウェブアクセシビリティ (a11y) — Vue 3 + Vuetify
description: Vue 3 + Vuetify スタックのアクセシビリティ実装ガイド。コンポーネントのマークアップ・フォーカストラップ・動的通知・reduced-motion・axe/Playwright 検証が必要なときに読む。スタック中立な基準は accessibility-wcag を参照。
rules:
  - "WCAG 2.1 AA 基準のリリース前チェックリストを通過させる"
  - "div の代わりに button・nav・main のようなセマンティックタグを優先して使う"
  - "アイコンボタンには aria-label で名前を提供する"
  - "すべてのインタラクションをキーボード(Tab・Enter・Esc)で操作可能にする"
  - "本文テキストは色のコントラスト 4.5:1 以上を確保する"
tags:
  - "aria-label"
  - "aria-hidden"
  - "aria-live"
  - "role="
  - "alt="
  - "tabindex"
  - "wcag"
---

# ♿ ウェブアクセシビリティ (a11y) — Vue 3 + Vuetify

> WCAG 2.1 AA を Vue 3 + Vuetify スタックで実装する方法を扱う。インタラクティブな UI・モーダル・動的通知・アニメーションを作成または検収するときに読む。
>
> **スタック中立の原則・基準は [accessibility-wcag](../../design/accessibility-wcag/SKILL.md) が権威(SoT)である。** POUR、セマンティクス優先、キーボード操作、`:focus-visible`、色コントラストの数値、色だけで情報を伝えない、などはそちらに従う。本ドキュメントはスタック固有の実装のみを扱う。
>
> 略語: **a11y**(accessibility) · **WCAG**(Web Content Accessibility Guidelines) · **ARIA**(Accessible Rich Internet Applications)。
>
> 関連スキル:
> - デザイントークン / 色コントラスト: [design-system](../design-system/SKILL.md)
> - 多言語(スクリーンリーダーの言語属性): [i18n-internationalization](../i18n-internationalization/SKILL.md)
> - テスト(`data-test` とは別に `aria-label` を活用): [frontend-testing](../frontend-testing/SKILL.md)

## 1. 適用方針

- 一般的な原則は `accessibility-wcag` に従う。以下は Vue/Vuetify でその原則をどう実装するかである。
- Vuetify コンポーネントはほとんど適切なセマンティックタグを出力するが、**レイアウトのランドマークは自分で対応する必要がある**。
- **自動検証 + 手動検証を併用** — axe/Lighthouse の自動化に加えて、キーボード・スクリーンリーダーの手動検証が必須。

## 2. スタック実装

### 2-1. レイアウトのランドマーク (セマンティックマークアップ)

```vue
<template>
  <header><AppHeader /></header>
  <nav aria-label="주 메뉴"><AppNav /></nav>
  <main>
    <h1>{{ $t('dashboard.title') }}</h1>
    <section aria-labelledby="sensors-heading">
      <h2 id="sensors-heading">{{ $t('sensors.heading') }}</h2>
      <SensorList :items="sensors" />
    </section>
  </main>
  <footer><AppFooter /></footer>
</template>
```

> ❌ `<div class="header">` だけを使わず `<header>` を。スクリーンリーダーがランドマークとして認識する。

### 2-2. ARIA でよく使うパターン

| 状況 | 属性 |
|------|------|
| アイコンボタン (テキストなし) | `aria-label="저장"` |
| 補足説明 | `aria-describedby="hint-id"` |
| トグル状態 | `aria-pressed="true"`, `aria-expanded="false"` |
| 動的通知 (トースト) | `role="status" aria-live="polite"` |
| エラー通知 | `role="alert" aria-live="assertive"` |
| 現在のページ (メニュー) | `aria-current="page"` |
| 隠しテキスト (スクリーンリーダー専用) | `.sr-only` クラス |

```scss
// src/styles/_a11y.scss
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
```

### 2-3. キーボードナビゲーション + フォーカストラップ

```vue
<script setup lang="ts">
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirm() }
}
</script>

<template>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="dlg-title"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <h2 id="dlg-title">확인</h2>
    <!-- ... -->
  </div>
</template>
```

**フォーカストラップ** (モーダル内で Tab が抜け出さないように):
```bash
pnpm add focus-trap @vueuse/integrations
```
```ts
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap'
const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef)
watch(isOpen, (v) => v ? activate() : deactivate())
```

### 2-4. 色コントラストの点検

色コントラストの数値基準は [accessibility-wcag](../../design/accessibility-wcag/SKILL.md) §2-4 が単一の出典である。[design-system](../design-system/SKILL.md) のトークン定義時点でその基準で点検する。検証ツールは §2-7 を参照。

### 2-5. 動的コンテンツの通知 (Live Region)

```vue
<template>
  <!-- 恒久的なコンテナ。メッセージだけ差し替える → スクリーンリーダーが自動で読み上げる -->
  <div role="status" aria-live="polite" class="sr-only">
    {{ liveMessage }}
  </div>
</template>

<script setup lang="ts">
const liveMessage = ref('')
function showSavedNotice() {
  liveMessage.value = '저장되었습니다.'
  setTimeout(() => (liveMessage.value = ''), 3000)
}
</script>
```

### 2-6. Reduced Motion

```scss
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

GSAP 使用時:
```ts
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  ScrollTrigger.disable()
}
```

### 2-7. 自動検証 + 手動検証

| 種類 | ツール |
|------|------|
| 自動 (CI) | `axe-core`, `@axe-core/playwright` (E2E に結合) |
| 自動 (ローカル) | Chrome Lighthouse, axe DevTools 拡張 |
| 手動 (必須) | キーボードだけで主要フローを通過、NVDA(Windows) または VoiceOver(Mac) で一画面読み上げ |

Playwright 統合:
```ts
import AxeBuilder from '@axe-core/playwright'

test('대시보드 접근성 위반 없음', async ({ page }) => {
  await page.goto('/dashboard')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

## 3. スタック固有のミス

> 一般的なミス(フォーカスの outline 削除、アイコンボタンの名前欠落、見出し階層の飛ばし、色だけで情報を伝える)は `accessibility-wcag` §3 を参照。

- ❌ `<div @click>` だけを使う → キーボードユーザーはトリガーできない。`<button>` または `v-btn` を使う
- ❌ Placeholder だけでラベルを代替 → 入力を始めると消えてユーザーが何かを忘れる
- ❌ 自動再生される動画/スライド (ユーザー制御なし)
- ❌ モーダルが開いているときに背景がまだフォーカスを受ける (フォーカストラップ欠落)
- ❌ 動的通知を `aria-live` なしで表示 → 視覚ユーザーは見えるがスクリーンリーダーは聞こえない

## 4. チェックリスト (リリース前、スタック実装の観点)

> キーボード操作・フォーカス表示・色コントラスト・alt・`lang` などの共通項目は `accessibility-wcag` §4 チェックリストを合わせて確認する。

- [ ] レイアウトが `<header>/<nav>/<main>/<footer>` ランドマークで構成されているか
- [ ] フォーム入力は `<label for>` または `aria-labelledby` でラベルを連結したか
- [ ] モーダルにフォーカストラップ(`useFocusTrap`)と Esc クローズを適用したか
- [ ] 動的コンテンツの更新を `aria-live` 領域で案内しているか
- [ ] `prefers-reduced-motion: reduce` ユーザーに大きなアニメーションを無効化したか
- [ ] axe/Playwright の自動検証とキーボード・スクリーンリーダーの手動検証を両方実施したか
