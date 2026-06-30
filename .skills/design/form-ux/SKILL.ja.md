---
name: フォーム UX & 入力パターン
description: アクセシブルでエラー予防を中心に入力フォームを設計する汎用標準 — 常に表示されるラベル、検証タイミング（onBlur/onSubmit）、フィールド直下のエラー表示と aria 連携、autocomplete、マルチステップ、送信状態の処理。特定のフレームワークに依存しない。入力フォームを新規作成したり、検証・エラー表示の UX を決める際に読む。キーワード: form, input, label, validation timing, aria-describedby, aria-invalid, onBlur, onSubmit, required, autocomplete, multi-step, submitting.
rules:
  - "ラベルは常に表示する: すべての入力フィールドには視覚的に常に表示されるラベルを提供し、placeholder だけでラベルを代替しない（入力開始と同時に文脈が消える）。"
  - "検証はタイミングが重要: リアルタイム検証はユーザーがフィールドを離れた後（blur）に開始し、入力中（change）にはエラーを出してタイピングを妨げない。送信時には全エラーを一括表示する。"
  - "エラーはフィールド直下 + プログラム的に連携: エラーメッセージは該当フィールドのすぐ下に置き、フィールドとメッセージをプログラム的に連携（aria-describedby）してスクリーンリーダーに読ませる。エラー状態は aria-invalid で公開する。"
  - "必須項目は明示的に: 必須入力はラベルに表示し、フォームのどこかにその表示の意味（'* は必須項目'）を一度案内する。視覚表示だけでなく支援技術用の表示（aria-required など）も併せて置く。"
  - "重複送信の防止: 送信中は送信ボタンを無効化し、進行状態（ローディング）を表示して重複送信を防ぐ。"
  - "フレームワーク中立: 上記の概念はすべて HTML 標準要素・ARIA で表現できる。特定フレームワークのバインディング構文は実装の詳細にすぎず、標準は以下のルールである。"
tags:
  - "form"
  - "input"
  - "label"
  - "validation timing"
  - "aria-describedby"
  - "aria-invalid"
  - "onBlur"
  - "onSubmit"
  - "required"
  - "autocomplete"
  - "multi-step"
  - "submitting"
  - "<form"
  - "<input"
  - "<label"
---

# 📝 フォーム UX & 入力パターン

> アクセシブルでエラーを予防するフォームを設計する。入力フォームを作ったり、検証・エラー表示の方法を決める際に読む。特定の言語/フレームワークに依存しない汎用標準であり、以下の原則・ルールは HTML 標準のセマンティクス（セマンティック・ARIA）を基準とする。検証のサーバー側強制は `forms-validation`（クライアント側検証の補助）・サーバー入力検証標準を、アクセシビリティの詳細基準は `accessibility-wcag` を併せて参照する。

## 1. 基本原則
- **ラベルは常に表示する**: すべての入力フィールドには視覚的に常に表示されるラベルを提供し、placeholder だけでラベルを代替しない（入力開始と同時に文脈が消える）。
- **検証はタイミングが重要**: リアルタイム検証はユーザーがフィールドを離れた後（blur）に開始し、入力中（change）にはエラーを出してタイピングを妨げない。送信時には全エラーを一括表示する。
- **エラーはフィールド直下 + プログラム的に連携**: エラーメッセージは該当フィールドのすぐ下に置き、フィールドとメッセージをプログラム的に連携（`aria-describedby`）してスクリーンリーダーに読ませる。エラー状態は `aria-invalid` で公開する。
- **必須項目は明示的に**: 必須入力はラベルに表示し、フォームのどこかにその表示の意味（"* は必須項目"）を一度案内する。視覚表示だけでなく支援技術用の表示（`aria-required` など）も併せて置く。
- **重複送信の防止**: 送信中は送信ボタンを無効化し、進行状態（ローディング）を表示して重複送信を防ぐ。
- **フレームワーク中立**: 上記の概念はすべて HTML 標準要素・ARIA で表現できる。特定フレームワークのバインディング構文は実装の詳細にすぎず、標準は以下のルールである。

## 2. ルール

### 2-1. ラベル & 入力フィールド
フィールドごとに表示される `<label for>` を置き、ヒント・エラーを `aria-describedby` で連携する。placeholder はラベルではなく補助的な例としてのみ使う。

```html
<!-- ❌ 禁止 — placeholder でラベルを代替（入力時に消えて文脈を失う） -->
<input type="email" placeholder="이메일" />

<!-- ✅ 推奨 — 常に表示されるラベル + aria 連携 -->
<label for="email">
  이메일 <span aria-hidden="true">*</span>
  <span class="sr-only">(필수)</span>
</label>
<input
  id="email"
  type="email"
  autocomplete="email"
  aria-describedby="email-hint email-error"
  aria-invalid="true"
  aria-required="true"
/>
<span id="email-hint" class="hint">예: hello@example.com</span>
<span id="email-error" role="alert" class="error">올바른 이메일 형식을 입력해 주세요.</span>
```

### 2-2. バリデーションのタイミング
| 時点 | ルール |
|------|------|
| 入力中 (change) | エラー表示しない — ユーザーを妨げる |
| フォーカス離脱 (blur) | 該当フィールドのエラー表示を開始 |
| 送信時 (submit) | 全エラーを一括表示 + 最初のエラーフィールドへフォーカス移動 |
| エラー修正後 | そのフィールドは change でのリアルタイム検査に切り替え |

> 何を検証するか（必須・長さ・形式・ドメインルール）とサーバー側強制はこのスキルの範囲外である — `forms-validation` / サーバー入力検証標準に従う。ここでは「いつ・どう見せるか」のみを扱う。

### 2-3. オートコンプリート（autocomplete）の有効化
入力の意味に合った標準 `autocomplete` トークンを指定し、ブラウザの自動補完・自動入力を助ける。

```html
<input type="text"     autocomplete="name" />
<input type="email"    autocomplete="email" />
<input type="tel"      autocomplete="tel" />
<input type="text"     autocomplete="street-address" />
<input type="password" autocomplete="current-password" />
```

### 2-4. マルチステップフォームのパターン
- 進捗の表示（1/3 ステップまたはプログレスバー）
- 各ステップの入力値の保持（前ステップへの復帰時）
- 送信前のサマリー画面の提供
- 長いフォームはセクションごとの自動保存（Auto-save）を検討

### 2-5. 送信状態の処理
送信が進行中の間は送信ボタンを無効化（`disabled`）し、ボタンのラベル/インジケーターで進行状態を知らせる。無効化自体で重複送信を防ぎ、状態テキストで進行中であることを伝える。

```html
<!-- ✅ 推奨 — 送信中 disabled で重複送信を防止 + 進行状態を案内 -->
<!-- isSubmitting = true の間 -->
<button type="submit" disabled aria-busy="true">저장 중...</button>

<!-- isSubmitting = false の通常時 -->
<button type="submit">저장하기</button>
```

> フレームワークでは `isSubmitting` 状態に応じて `disabled` 属性とボタン内容をバインドすればよい。具体的な構文は[付録](#付録-スタック別の例)を参照。

## 3. よくある間違い
- **placeholder をラベルの代わりに使う** → 入力開始と同時に文脈が消える。
- **入力中（change）からエラー表示** → タイピングを妨げる。blur から表示する。
- **エラーメッセージを aria で連携しない** → スクリーンリーダーがエラーを読めない。`aria-describedby` + `aria-invalid` で連携する。
- **送信ボタンの無効化漏れ** → 重複送信が発生する。
- **必須表示を視覚記号のみで表示** → 支援技術ユーザーが必須かどうかを知らない。`aria-required` などでも公開する。

## 4. チェックリスト
- [ ] すべての入力に常に表示されるラベルがあり、`for`/`aria` で連携したか
- [ ] 検証を blur から表示し、入力中（change）には妨げたか
- [ ] エラーメッセージをフィールドのすぐ下に置き、`aria-describedby`/`aria-invalid` で連携したか
- [ ] 必須項目を視覚表示 + 支援技術用の表示で表示し、案内文を入れたか
- [ ] 送信中にボタンを無効化し、進行状態を表示したか
- [ ] 何を検証するか・サーバー側強制は `forms-validation` 標準に従っているか

## 付録: スタック別の例

> 以下は参考用の実装例である。上記 1～4 の原則・ルールが標準であり、付録はその適用事例にすぎない。チームが使うスタック（React/JSX、Angular、純粋な HTML など）に合った例を同じパターンで追加する。

### Vue

送信状態の処理（2-5）を Vue でバインドした例。`isSubmitting` 状態に `:disabled` を結び付け、`v-if`/`v-else` でボタンのラベルを切り替える。

```html
<!-- ✅ 推奨 — 送信中ボタン無効化 + ローディング表示で重複送信を防止 -->
<button type="submit" :disabled="isSubmitting">
  <span v-if="isSubmitting">저장 중...</span>
  <span v-else>저장하기</span>
</button>
```
