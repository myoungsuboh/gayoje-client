---
name: モーション & マイクロインタラクション
description: 目的のあるアニメーション・マイクロインタラクションでフィードバック・遷移・状態変化を視覚化し、prefers-reduced-motion を尊重する実装標準。遷移効果・アニメーションを入れたり、モーションのタイミング・パフォーマンスを決める際に読む。キーワード: transition, animation, prefers-reduced-motion, transform, opacity, keyframes, ease.
rules:
  - "すべてのアニメーションは prefers-reduced-motion: reduce メディアクエリで無効化または最小化する。"
  - "遷移時間は 100～300ms を基本とし、複雑なレイアウト遷移は 500ms 以下を維持する。"
  - "ease-in は要素の退場、ease-out は登場、ease-in-out は状態遷移に使う。"
  - "アニメーションは UX 目的（フィードバック・階層・関係）なしに装飾用としてのみ使わない。"
  - "パフォーマンスのために transform・opacity のみをアニメートし、layout を誘発する width・height・top のアニメーションを避ける。"
tags:
  - "transition"
  - "animation"
  - "prefers-reduced-motion"
  - "transform"
  - "opacity"
  - "keyframes"
  - "ease"
---

# 🎬 モーション & マイクロインタラクション

> 目的のあるモーションでフィードバック・遷移・状態を視覚化し、アクセシビリティ・パフォーマンスを守る。アニメーションを入れたり、遷移のタイミングを決める際に読む。

## 1. 基本原則
- すべてのアニメーションは prefers-reduced-motion: reduce メディアクエリで無効化または最小化する。
- 遷移時間は 100～300ms を基本とし、複雑なレイアウト遷移は 500ms 以下を維持する。
- ease-in は要素の退場、ease-out は登場、ease-in-out は状態遷移に使う。
- アニメーションは UX 目的（フィードバック・階層・関係）なしに装飾用としてのみ使わない。
- パフォーマンスのために transform・opacity のみをアニメートし、layout を誘発する width・height・top のアニメーションを避ける。

## 2. ルール

### 2-1. アクセシブルなモーション
```css
/* 기본 전환 */
.btn { transition: background-color 150ms ease-out, transform 150ms ease-out; }

/* ✅ 권장 — 모션 감소 요청 시 비활성화 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 2-2. 遷移タイミングガイド
| 種類 | 時間 | 用途 |
|------|------|------|
| 即時フィードバック | 100ms | ボタン hover/active |
| シンプルな遷移 | 150～200ms | ドロップダウン、ツールチップ |
| コンテンツ遷移 | 250～300ms | モーダルを開く、タブ切り替え |
| 複雑なレイアウト | 400～500ms | サイドバー、パネル |

### 2-3. マイクロインタラクションのパターン
ローディングのフィードバック:
```css
@keyframes skeleton-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}
```

成功/エラーのフィードバック:
- 成功: グリーンのチェックマーク + 簡潔なテキスト、2～3 秒後に自動で閉じる
- エラー: レッドの枠線 + shake アニメーション（transform: translateX）、手動で閉じる

### 2-4. GPU アクセラレーション (Composited Layer)
transform・opacity のみをアニメートすると GPU composite レイヤーで処理され、メインスレッドのブロッキングがない。
```css
/* ✅ 좋음 */ .card:hover { transform: translateY(-4px); opacity: 0.9; }
/* ❌ 나쁨 */ .card:hover { top: -4px; height: 200px; } /* layout 유발 */
```

## 3. よくある間違い
- prefers-reduced-motion の未処理 → モーションに敏感なユーザーに不快感・めまいを与える。
- width・height・top・left のアニメート → layout reflow でカクつきが発生する。
- 目的のない装飾用モーションの乱用 → インターフェースが雑然として遅く感じられる。
- 遷移時間の過剰（500ms 超過） → 反応が鈍く感じられる。

## 4. チェックリスト
- [ ] prefers-reduced-motion: reduce でモーションを無効化/最小化したか
- [ ] 遷移時間が用途別ガイド（100～500ms）の範囲内にあるか
- [ ] 登場/退場/遷移に合った easing（ease-out/in/in-out）を使ったか
- [ ] transform・opacity のみをアニメートし、layout を誘発する属性を避けたか
- [ ] すべてのモーションに UX 目的（フィードバック・階層・関係）があるか
