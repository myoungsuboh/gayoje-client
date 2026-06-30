---
name: E2E テスト標準 (End-to-End Testing)
description: ブラウザ上で実際のユーザーシナリオを自動化する E2E テストの汎用標準 — コアフローのみ検証、安定セレクタ(data-testid)、ページオブジェクトによるカプセル化、専用テストデータ、フレーク隔離、CI リトライ・トレース。コアとなるユーザーフローを自動化したり、セレクタ・モック・CI リトライを定めたり、フレークテストを潰すときに読む。特定のツール(Playwright・Cypress など)に依存しない。
rules:
  - "コアフローのみ: ビジネス価値の大きいコアシナリオ(登録→ログイン→注文→決済)に集中し、分岐・境界はより速く安定した下位レイヤー(単体・統合)に任せる。"
  - "変更に強く選択・カプセル化: 要素はマークアップ変更に強い専用識別子(data-testid)で探し、セレクタ・操作はページオブジェクトに隠してテスト本文がシナリオだけを記述するようにする。"
  - "不安定要素を決定的に: 遅いネットワーク・サーバーエラー・外部レスポンスはインターセプト/モックで再現し、非同期は固定 sleep ではなく条件ベースの待機で待つ。"
  - "専用テストデータ: E2E 専用のアカウント・データを使い、本番を汚染しない。"
  - "フレークは覆い隠さず直す: 不安定なテストは直ちに隔離して原因を直す — リトライはセーフティネットであって解決策ではない。"
tags:
  - "playwright"
  - "cypress"
  - "data-testid"
  - "page.click"
  - "page.fill"
  - "expect(page)"
  - "cy.get"
  - "cy.visit"
---

# 🎭 E2E テスト標準 (End-to-End Testing)

> 実際のユーザーシナリオをブラウザ環境で自動化する。コアとなるユーザーフローを自動化したり、セレクタ・API モック・CI リトライを定めたり、フレークテストを潰すときに読む。特定のツール(Playwright/Cypress など)に依存しない汎用標準である。テストレイヤー間の役割分担は `test-strategy` スキルも併せて見る。

## 1. コア原則
- **コアフローのみ**: ビジネス価値の大きいコアシナリオ(登録→ログイン→注文→決済)に集中し、分岐・境界はより速く安定した下位レイヤー(単体・統合)に任せる。
- **変更に強く選択・カプセル化**: 要素はマークアップ変更に強い専用識別子(`data-testid`)で探し、セレクタ・操作はページオブジェクトに隠してテスト本文がシナリオだけを記述するようにする。
- **不安定要素を決定的に**: 遅いネットワーク・サーバーエラー・外部レスポンスはインターセプト/モックで再現し、非同期は固定 `sleep` ではなく条件ベースの待機で待つ。
- **専用テストデータ**: E2E 専用のアカウント・データを使い、本番を汚染しない。
- **フレークは覆い隠さず直す**: 不安定なテストは直ちに隔離して原因を直す — リトライはセーフティネットであって解決策ではない。

## 2. ルール

### 2-1. コアとなるユーザーフローのみを E2E で扱う
- ユーザーが最後まで通過しなければならないコアパスを選び、E2E で検証する。
- すべての分岐・例外・境界値を E2E で網羅しない — 遅く壊れやすい。それは単体/統合に任せる(`test-strategy`)。

```text
// ❌ 禁止 — すべての入力組み合わせ・例外を E2E で網羅(遅くフレーク↑)
e2e: ログイン空値 / 短いパスワード / 特殊文字 / ... 数十ケース

// ✅ 推奨 — コアフローのみ E2E、細かい分岐は下位レイヤー
e2e: "登録→ログイン→注文→決済" の一筋
unit/integration: 入力検証・分岐ケース
```

### 2-2. 安定したセレクタで要素を選択する
- テスト用の専用識別子(例: `data-testid`)で要素を探す。一貫した命名規則を設ける。
- CSS クラス・DOM 構造・文言・XPath のように容易に変わるものに依存しない。

```text
// ❌ 禁止 — スタイル/構造/文言に依存 → マークアップが変わると壊れる
select(".btn.btn-primary")
select("div > form > button:nth-child(3)")

// ✅ 推奨 — 変更に強い専用テスト識別子
select(testid="login-submit-btn")
// 命名規則の例: {画面}-{要素}-{役割}  →  "login-email-input"
```

### 2-3. セレクタ・操作をページオブジェクトにカプセル化する
- 画面ごとのインタラクションをページオブジェクト(画面モデル)にまとめる。テストはシナリオだけを呼び出す。
- セレクタ・クリック・入力をテスト本文に直接ばらまかない — 重複が積み上がり、UI 変更時に修正箇所が散らばる。

```text
// ❌ 禁止 — セレクタ・操作がテストごとに重複
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...  // またコピペ

// ✅ 推奨 — ページオブジェクトが操作を隠し、テストは意図だけを記述
LoginPage.login(email, pw)
test: LoginPage.login("u@x.com", "pw"); assert dashboard
```

### 2-4. 外部依存はインターセプト/モックで制御する
- 遅いレスポンス・サーバーエラー・外部 API のような不安定要素は、ネットワークインターセプトで望むレスポンスを強制して決定的にする。
- 実際の外部システムに直接依存し、フローの成否が外部状態に左右されるようにしない。

```text
// ❌ 禁止 — 実際の外部 API に依存 → 外部が揺れるとテストも揺れる
goto("/users")   // 本物のサーバーレスポンスに運命を委ねる

// ✅ 推奨 — エラー/境界レスポンスをインターセプトで再現
intercept("/api/users") → respond 500
goto("/users"); assert errorState visible
```

### 2-5. 専用テストアカウント・データを使用する
- E2E 専用のアカウント・シードデータを使い、テストが作ったデータは隔離・整理する。
- 本番アカウント・データで E2E を回さない。

```text
// ❌ 禁止 — 本番アカウント/データで注文・決済フローを実行(汚染・事故)
// ✅ 推奨 — 専用テストアカウント + 隔離されたシードデータ、実行後に整理
```

### 2-6. フレークテストは直ちに隔離して直す
- 間欠的に壊れるテストは直ちに隔離(quarantine)し、根本原因(競合・タイミング・外部依存)を直す。
- リトライで覆って「緑色」のように見せかけない — リトライはセーフティネットであって解決策ではない。
- フレーク検出・隔離(quarantine)・リトライポリシーの詳細な運用標準は `flaky-test-management` に従う。

```text
// ❌ 禁止 — フレークをリトライだけで隠して放置
// ✅ 推奨 — 隔離 → 原因(固定 sleep・競合・外部依存)を修正 → 復帰
```

### 2-7. 固定待機の代わりに条件ベースの待機
- 「要素が見えるまで / リクエストが終わるまで」のように、条件が満たされれば直ちに進む待機を使う。
- `sleep(N秒)` のような固定待機は遅い(過大)か不安定(過少)である — 使わない。

```text
// ❌ 禁止 — 任意の固定待機
sleep(3000); click(submit)

// ✅ 推奨 — 条件ベースの待機(ほとんどのツールが自動待機を内蔵)
waitVisible(testid=submit); click(submit)
```

## 3. よくある間違い

ルール(§2)を破ったときに現れる症状 — 見えたら該当ルールに戻る。

- **遅くてよく壊れる** → すべての分岐・境界を E2E で網羅し(2-1)、下位レイヤーがやるべき仕事を背負う。
- **マークアップが変わっただけで壊れる** → CSS/DOM 構造/XPath セレクタに依存している(2-2)。
- **保守が難しい** → セレクタ・操作をテストごとに直接ばらまき(2-3)、重複が積み上がる。
- **間欠的な失敗(flaky)** → 固定 `sleep`(2-7)、外部依存の未制御(2-4)、フレークの放置(2-6)が原因。
- **データ汚染** → 本番アカウント・データでフローを回す(2-5)。
- **失敗しても原因が見えない** → CI にトレース・スクリーンショット・ビデオなどの追跡手段がない(付録の設定を参照)。

## 4. チェックリスト
- [ ] コアとなるユーザーシナリオのみを選んで E2E で扱ったか(分岐・境界は下位レイヤーに)
- [ ] 要素を **安定した専用識別子**(例: `data-testid`)で選択したか(CSS/XPath 禁止)
- [ ] 画面インタラクションを **ページオブジェクト** にカプセル化したか
- [ ] エラー・境界シナリオを **ネットワークインターセプト/モック** で決定的に再現したか
- [ ] **専用テストアカウント・データ** を使用し、本番を汚染しないか
- [ ] 固定 `sleep` の代わりに **条件ベースの待機** を使うか
- [ ] **フレークテスト** を隔離・修正したか(リトライで覆っていないか)
- [ ] CI に **リトライ・トレース・スクリーンショット/ビデオ** などの失敗追跡手段を設定したか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタックに合わせて同じパターンで追加する。上の 1〜4 の原則・ルールが標準であり、付録はその適用例にすぎない。

### Playwright (TypeScript)

#### Page Object (2-3) + 安定セレクタ (2-2)

```typescript
// pages/LoginPage.ts
import { Page, expect } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="login-btn"]');
    await expect(this.page).toHaveURL("/dashboard");
  }

  async assertError(message: string) {
    await expect(this.page.getByTestId("error-message")).toContainText(message);
  }
}

// tests/auth.spec.ts
import { test } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

test("有効な認証情報でログイン成功", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "Password123!");
});

test("誤ったパスワードでエラーメッセージ表示", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "wrong");
  await loginPage.assertError("パスワードが正しくありません");
});
```

#### ネットワークインターセプト (2-4)

```typescript
test("API エラー時にエラーメッセージ表示", async ({ page }) => {
  await page.route("/api/users", async route => {
    await route.fulfill({ status: 500, json: { error: "Internal Error" } });
  });

  await page.goto("/users");
  await expect(page.getByTestId("error-state")).toBeVisible();
});
```

#### data-testid 命名 (2-2)

```html
<!-- 形式: data-testid="{コンポーネント}-{要素}-{役割}" -->
<button data-testid="login-form-submit-btn">ログイン</button>
<input data-testid="login-form-email-input" />
<div data-testid="user-list-empty-state">データがありません</div>
<div data-testid="product-card-{id}">...</div>
```

#### CI リトライ・トレース設定 (失敗追跡)

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,  // CI で 2 回リトライ (flaky 防止)
  reporter: [["html"], ["github"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

### Cypress などほかのスタック

チームのスタックに合わせて同じパターン(安定セレクタ・ページオブジェクト・インターセプト・CI リトライ/トレース)で例を追加する。例: Cypress は `cy.visit`/`cy.get('[data-testid=...]')` でセレクタを、`cy.intercept` でネットワークモックを、`cypress.config` の `retries` でリトライを構成する。
