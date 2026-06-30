---
name: ダークモード & テーマシステム
description: CSS Custom Properties と prefers-color-scheme でライト/ダークモードおよび拡張可能なテーマを実装するためのガイド。新しい画面に色を付けるとき、テーマトグル・システムテーマ検出・ダークモードの色を決めるときに読む。キーワード: prefers-color-scheme, data-theme, color-scheme, dark, localStorage, currentColor, --color-.
rules:
  - "色は必ず CSS Custom Properties(セマンティックトークン)経由でのみ参照し、ライト/ダークの値はそれぞれのスコープで再定義する。"
  - "prefers-color-scheme でシステムテーマを自動検出しつつ、ユーザーの手動選択(light/dark/system)もサポートする。"
  - "ダークモードでは純粋な黒(#000000)の代わりに暗いグレー系(#0f172a など)を使い、目の疲れを軽減する。"
  - "画像・動画はダークモードで過度に明るい場合のみケースごとにフィルターを適用し(高彩度の写真は別アセットを検討)、SVG は currentColor を使う。"
  - "テーマ選択は localStorage に保存し、初期ロード時のちらつき(FOUC)を防ぐ。"
tags:
  - "prefers-color-scheme"
  - "data-theme"
  - "color-scheme"
  - "dark"
  - "localStorage"
  - "currentColor"
  - "--color-"
---

# 🌙 ダークモード & テーマシステム

> セマンティックトークン一式でライト/ダーク/拡張テーマを一貫して実装する。新しい画面に色を付けるときやテーマ切り替えを扱うときに読む。

## 1. 基本原則
- 色は必ず CSS Custom Properties(セマンティックトークン)経由でのみ参照し、ライト/ダークの値はそれぞれのスコープで再定義する。
- `prefers-color-scheme` でシステムテーマを自動検出しつつ、ユーザーの手動選択(light/dark/system)もサポートする。
- ダークモードでは純粋な黒(#000000)の代わりに暗いグレー系(#0f172a など)を使い、目の疲れを軽減する。
- 画像・動画はダークモードで過度に明るい場合のみケースごとにフィルターを適用し(高彩度の写真は別アセットを検討)、SVG は `currentColor` を使う。
- テーマ選択は localStorage に保存し、初期ロード時のちらつき(FOUC)を防ぐ。

## 2. ルール

### 2-1. セマンティックトークンベースのテーマ
```css
/* ❌ 금지 — 하드코딩 색, 다크모드에서 재정의 불가 */
.card { background: #ffffff; color: #0f172a; }

/* ✅ 권장 — 시맨틱 토큰 참조 + 스코프별 재정의 */
:root {
  --color-bg-primary:   #ffffff;
  --color-text-primary: #0f172a;
  --color-surface:      #f8fafc;
  --color-border:       #e2e8f0;
}

[data-theme="dark"], @media (prefers-color-scheme: dark) {
  --color-bg-primary:   #0f172a;
  --color-text-primary: #f1f5f9;
  --color-surface:      #1e293b;
  --color-border:       #334155;
}
```

### 2-2. FOUC の防止(ちらつきのない初期ロード)
HTML `<head>` のインラインスクリプトでクラスを即座に適用する — レンダー前にテーマを確定する。
```html
<script>
  (function(){
    const t = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute(
      'data-theme',
      t === 'dark' || (!t && prefersDark) ? 'dark' : 'light'
    );
  })();
</script>
```

### 2-3. テーマトグルの実装パターン
```js
function setTheme(value) {  // 'light' | 'dark' | 'system'
  localStorage.setItem('theme', value);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = value === 'system' ? (prefersDark ? 'dark' : 'light') : value;
  document.documentElement.setAttribute('data-theme', resolved);
}
```

### 2-4. ダークモードでの画像・メディア処理
```css
/* 사진 이미지 — 밝기 살짝 낮춤 (필요한 경우만) */
[data-theme="dark"] img:not([data-no-darken]) {
  filter: brightness(0.85) contrast(1.05);
}
/* SVG 아이콘 — 색상 상속 */
.icon { fill: currentColor; }
```

## 3. よくあるミス
- 色をハードコーディング → ダークモードで再定義されず崩れる。
- 初期インラインスクリプトの省略 → リロード時にライト→ダークのちらつき(FOUC)。
- ダークモードに純粋な黒を使用 → コントラストが強すぎて目が疲れる。
- すべての画像に一律フィルターを適用 → 高彩度の写真がくすむ。

## 4. チェックリスト
- [ ] すべての色をセマンティックトークン(`--color-*`)のみで参照しているか
- [ ] light/dark/system の3モードをすべてサポートしているか
- [ ] 初期インラインスクリプトで FOUC を防いだか
- [ ] テーマ選択を localStorage に保存し復元しているか
- [ ] ダークモードの色が純粋な黒ではなくグレー系か
- [ ] SVG は currentColor、写真はケースごとのフィルターを適用したか
