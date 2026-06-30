---
name: デザインシステム & トークン (Design System & Tokens)
description: デザイントークン(色・タイポグラフィ・間隔・半径)の値と命名を定義する唯一の権威(SoT)であり、再利用可能なコンポーネントライブラリを構築するためのガイド。新しい画面・コンポーネントを作るときや、スタイル・トークン名を決めるときに読む。Web 適用・テーマ切り替えは FE `design-system` スキルも併せて見る。キーワード: design-token, css-variable, --color, theme, storybook, variant, token.
rules:
  - "すべての色・間隔・フォント・半径はデザイントークン変数(CSS Custom Properties またはテーマオブジェクト)としてのみ使い、ハードコーディングしない。"
  - "コンポーネントは props で variant・size・state を受け取り、内部でトークンを組み合わせる — 外部から直接スタイルをオーバーライドするのは禁止。"
  - "新規コンポーネントを書く前に、既存コンポーネントの再利用可能性をまず確認する。"
  - "コンポーネントのドキュメント(Storybook または README)に usage example を必ず含める。"
  - "トークン名は階層(category-role-modifier、例: color-text-primary)構造に従う。"
tags:
  - "design-token"
  - "css-variable"
  - "--color"
  - "theme"
  - "storybook"
  - "variant"
  - "token"
---

# 🎨 デザインシステム & トークン

> UI の視覚的な決定値をトークンの単一ソースで管理し、ブランドの一貫性とテーマ切り替えを保証する。トークンの**値・命名を定義する権威(SoT)**がこのスキルである。新しい画面・コンポーネントを作るときやスタイルを決めるときに読む。Web 適用・テーマの優先順位・フレームワークごとのテーマ切り替えは FE `design-system` スキルで扱う。

## 1. 基本原則
- すべての色・間隔・フォント・半径はデザイントークン変数(CSS Custom Properties またはテーマオブジェクト)としてのみ使い、ハードコーディングしない。
- コンポーネントは props で variant・size・state を受け取り、内部でトークンを組み合わせる — 外部から直接スタイルをオーバーライドするのは禁止。
- 新規コンポーネントを書く前に、既存コンポーネントの再利用可能性をまず確認する。
- コンポーネントのドキュメント(Storybook または README)に usage example を必ず含める。
- トークン名は階層(category-role-modifier、例: color-text-primary)構造に従う。

## 2. ルール

### 2-1. トークンの階層構造
デザイントークンは UI の視覚的な決定値をコード化した変数である。単一ソース(SoT)で管理する。
```
Primitive tokens  → semantic tokens → component tokens
#3B82F6           → color-text-link → button-label-color
```

### 2-2. トークンのみ参照(ハードコーディング禁止)
```css
/* ❌ 금지 — 값 하드코딩, 테마 전환·일관성 깨짐 */
.btn { color: #3B82F6; padding: 16px; border-radius: 8px; }

/* ✅ 권장 — 토큰 참조 */
:root {
  /* Primitive */
  --color-blue-500: #3B82F6;
  --space-4: 16px;

  /* Semantic */
  --color-text-primary: var(--color-gray-900);
  --color-text-link: var(--color-blue-500);
  --radius-button: 8px;
}
.btn { color: var(--color-text-link); padding: var(--space-4); border-radius: var(--radius-button); }
```

### 2-3. コンポーネント設計原則
- **単一責任**: 一つのコンポーネントが一つの役割のみを担う。
- **Prop API の安定性**: breaking change はメジャーバージョンアップでのみ許可。
- **Default props**: すべての必須 prop に妥当なデフォルト値を提供する。
- **Composition over inheritance**: コンポーネントの組み合わせで複雑さを処理する。

### 2-4. トークンの命名規則

| レイヤー | パターン | 例 |
|--------|------|------|
| Primitive | `{category}-{scale}` | `color-gray-500`, `space-2` |
| Semantic | `{category}-{role}` | `color-text-primary`, `color-bg-surface` |
| Component | `{component}-{element}-{property}` | `button-label-color` |

## 3. よくあるミス
- 値をハードコーディング → テーマ切り替えやリブランディングの際にすべて修正が必要になる。
- 外部からコンポーネントのスタイルをオーバーライド → variant 体系が崩れる。
- 似たコンポーネントを重複生成 → ライブラリが肥大化する。
- usage example の欠落 → 使い方を推測することになる。

## 4. チェックリスト
- [ ] 色・間隔・フォント・半径をすべてトークンのみで参照したか
- [ ] variant・size・state を props で受け取り、内部でトークンを組み合わせたか
- [ ] 既存コンポーネントの再利用可能性をまず確認したか
- [ ] トークン名が階層(primitive/semantic/component)規則に従っているか
- [ ] Storybook/README に usage example を含めたか
