---
name: 環境変数 (Env Config)
description: .env の優先順位・環境ごとの分離・secret と公開設定の分離・クライアント露出範囲の制御・テンプレート/検証を扱う環境変数の汎用標準で、ビルドツール/フレームワークに依存しない。環境変数を追加・整備するとき、環境ごとに設定を分離するとき、秘密値の露出を防ぐときに読む。
rules:
  - "設定はコードから分離する: 環境ごとに変わる値（API アドレス・機能フラグ・キー）はコードにハードコードせず、環境変数として外部化する。同じビルド/イメージを環境だけ変えて再利用できるようにする。"
  - "環境ごとに分離する: 開発・ステージング・本番など環境ごとに別々の設定ファイル/ソースを置き、ビルド/実行時にどの環境かを明示的に選択する。ひとつのファイルをビルド直前に手動で差し替える方式は禁止する。"
  - "優先順位を明確にする: 複数の .env ファイルが重なるとき、何が何を上書きするかの規則を定める。一般に、より具体的・ローカルなものほど優先する（例: *.local > 環境別 > 共通）。"
  - "secret と公開設定を分ける: 秘密値（API key・DB 認証情報・トークン署名キーなど）と公開してよい設定（公開 API アドレス・アプリバージョン）を同じ通路に混ぜない。secret は別チャネル/シークレットマネージャで管理する。"
  - "クライアント露出範囲を制御する: フロントエンドのバンドルに入る変数は誰でも抽出できると仮定する。クライアントへ出る値は明示的に表示された（接頭辞・allowlist など）公開値のみに限定し、それ以外はビルド/サーバ時点でのみ使う。"
  - "秘密値が必要な呼び出しはサーバで: クライアントが secret を直接握る構造なら設計が間違っている。秘密が必要な外部呼び出しはバックエンド/BFF でプロキシする。"
  - "ローカル override はコミットしない: 個人のローカル値（*.local など）と secret が混ざったファイルは VCS に上げない。代わりに何を埋めるべきか教えるテンプレート（.env.example）をコミットする。"
  - "存在・形式を検証する: 必須変数の欠落や形式エラーは、ランタイムの奥深くではなく起動時点で素早く現れるようにする（型定義・スキーマ検証・起動時チェック）。"
tags:
  - "import.meta.env"
  - "VITE_"
  - "process.env"
  - ".env"
  - "envConfig"
---

# ⚙️ 環境変数 (Env Config)

> 環境（開発/ステージング/本番）ごとに変わる設定をコードから分離し、秘密値と公開設定を厳格に分け、クライアントへ出る値の露出範囲を制御する。環境変数を定義・ロード・分岐・セキュリティ処理するときに読む。特定のビルドツール/フレームワークに依存しない汎用標準である。

## 1. 核心原則
- **設定はコードから分離する**: 環境ごとに変わる値（API アドレス・機能フラグ・キー）はコードにハードコードせず、環境変数として外部化する。同じビルド/イメージを環境だけ変えて再利用できるようにする。
- **環境ごとに分離する**: 開発・ステージング・本番など環境ごとに別々の設定ファイル/ソースを置き、ビルド/実行時にどの環境かを明示的に選択する。ひとつのファイルをビルド直前に手動で差し替える方式は禁止する。
- **優先順位を明確にする**: 複数の `.env` ファイルが重なるとき、何が何を上書きするかの規則を定める。一般に、より具体的・ローカルなものほど優先する（例: `*.local` > 環境別 > 共通）。
- **secret と公開設定を分ける**: 秘密値（API key・DB 認証情報・トークン署名キーなど）と公開してよい設定（公開 API アドレス・アプリバージョン）を同じ通路に混ぜない。secret は別チャネル/シークレットマネージャで管理する。
- **クライアント露出範囲を制御する**: フロントエンドのバンドルに入る変数は**誰でも抽出できる**と仮定する。クライアントへ出る値は明示的に表示された（接頭辞・allowlist など）公開値のみに限定し、それ以外はビルド/サーバ時点でのみ使う。
- **秘密値が必要な呼び出しはサーバで**: クライアントが secret を直接握る構造なら設計が間違っている。秘密が必要な外部呼び出しはバックエンド/BFF でプロキシする。
- **ローカル override はコミットしない**: 個人のローカル値（`*.local` など）と secret が混ざったファイルは VCS に上げない。代わりに何を埋めるべきか教えるテンプレート（`.env.example`）をコミットする。
- **存在・形式を検証する**: 必須変数の欠落や形式エラーは、ランタイムの奥深くではなく起動時点で素早く現れるようにする（型定義・スキーマ検証・起動時チェック）。

## 2. 規則

### 2-1. 設定をコードから分離し環境ごとに分ける
- 環境ごとに変わる値をソースに埋めず、環境変数として外部化する。
- 環境（dev/staging/prod）ごとに別ソースを置き、ビルド/実行時に環境を明示的に選択する。

```text
// ❌ 禁止 — コードに環境値をハードコード / ひとつのファイルをビルド直前に手動差し替え
const API = "https://prod-api.example.com"   // 環境が変わるたびにコード修正
.env をひとつだけ置いてデプロイ直前に手で値を差し替える

// ✅ 推奨 — 環境別設定 + 明示的な環境選択
.env.development / .env.staging / .env.production
build --env=staging   // どの環境かをビルド/実行時点で選択
```

### 2-2. ファイルの優先順位を定める
- 複数の設定ファイルが重なるときの優先順位をチームで合意して文書化する。
- 一般原則: **より具体的でよりローカルな値が、より一般的な値を上書きする。**

```text
// 優先順位（高 → 低）の例
環境別-ローカル(.env.[env].local) > 環境別(.env.[env]) > 共通-ローカル(.env.local) > 共通(.env)
```

| 分類 | 適用範囲 | VCS コミット |
|---|---|---|
| 共通 | 全環境のデフォルト | O（secret がないとき） |
| 共通-ローカル | 全環境、個人ローカル override | **X** |
| 環境別 | 特定環境（dev/staging/prod） | O（secret がないとき） |
| 環境別-ローカル | 特定環境 + 個人ローカル | **X** |

### 2-3. secret と公開設定を分離する
- 公開してよい設定と秘密値を同じ通路に混ぜない。
- secret は環境変数ファイルに平文で置くより、シークレットマネージャ/デプロイパイプライン注入を優先する。

```text
// ❌ 禁止 — 公開設定と secret をひとつのファイルに平文で混ぜる
PUBLIC_API_URL=https://api.example.com
DB_PASSWORD=super-secret        // 同じファイル・同じ通路

// ✅ 推奨 — 公開設定のみ環境ファイルに、secret は別チャネル
PUBLIC_API_URL=https://api.example.com
# DB_PASSWORD などの秘密はシークレットマネージャ/CI 注入で分離
```

> 秘密値そのものの保管・ローテーション・アクセス制御は `secrets-management` スキルも併せて参照する。

### 2-4. クライアント露出範囲を制御する
- フロントエンドのバンドルに含まれる値は**公開される**と仮定する（バンドルから抽出可能）。
- クライアントへ出す変数を明示的に区別（接頭辞・allowlist など）し、それ以外の変数はクライアントからアクセス不可能にする。

```text
// ❌ 禁止 — 秘密値をクライアント露出変数にする（バンドルにそのまま埋め込まれる）
CLIENT_OPENAI_API_KEY=sk-xxx     // dist バンドルから誰でも抽出

// ✅ 推奨 — クライアントには公開値のみ、秘密はサーバ専用
CLIENT_API_URL=https://api.example.com   // 公開 OK
OPENAI_API_KEY=sk-xxx                     // サーバ環境のみ、クライアントへは出ない
```

### 2-5. 秘密が必要な呼び出しはバックエンド/BFF でプロキシする
- クライアントが secret を直接持って外部 API を呼ぶ構造を作らない。
- 秘密が必要な呼び出しはサーバ（バックエンド/BFF）が代わりに行い、クライアントは自社サーバのみを呼ぶ。

```text
// ❌ 禁止 — ブラウザが secret で外部 API を直接呼ぶ
browser ──(API key)──▶ 外部の決済/AI API

// ✅ 推奨 — サーバが secret を握ってプロキシ
browser ──▶ 自社サーバ(BFF) ──(secret)──▶ 外部 API
```

### 2-6. ローカル override・secret はコミットせず、テンプレートをコミットする
- 個人のローカル値（`*.local` など）と secret が混ざったファイルは `.gitignore` で除外する。
- 新規者が何を埋めるべきか分かるよう、値が空のテンプレート（`.env.example`）をコミットする。

```text
// .gitignore（概念）
*.local            // 個人ローカル override を除外
.env               // secret が混ざるなら共通ファイルも除外し example のみコミット

// .env.example（コミット用テンプレート — キーのみ、値は空）
PUBLIC_API_URL=
PUBLIC_APP_VERSION=
```

### 2-7. 必須変数の存在・形式を起動時点で検証する
- 必須変数の欠落・形式エラーがランタイムの奥で破裂しないよう、起動時点で素早く失敗させる。
- 型定義/スキーマ検証を置き、どの変数がどの形式で必要かを一箇所で見えるようにする。

```text
// ❌ 禁止 — 欠落した変数をずっと後のランタイムで undefined として発見
fetch(config.apiUrl + "/x")   // apiUrl 未設定 → "undefined/x" を呼ぶ

// ✅ 推奨 — 起動時に必須変数を検証、なければ即座に失敗
assert env.PUBLIC_API_URL is set and is URL   // 起動段階で fail-fast
```

## 3. よくある間違い
- **secret をクライアント露出変数にする** → バンドルから抽出されて流出する。秘密はサーバ専用に、露出変数は公開値のみ。
- **ローカル/secret ファイルをコミット** → 秘密流出・環境汚染。`*.local` と secret が混ざったファイルは ignore。
- **`.env.example` を未管理** → 新規者が何を埋めるか分からない。キーのみのテンプレートをコミットする。
- **環境区分なしにひとつのファイルを手動差し替え** → デプロイごとにヒューマンエラー。環境ごとに分離し環境を明示的に選択する。
- **環境名のタイプミスで分岐失敗**（`producton`） → 意図した環境設定が効かない。定数/型でまとめる。
- **露出規則（接頭辞・allowlist）を知らずに変数アクセス** → クライアントで `undefined` のデバッグに時間を浪費。露出規則を先に確認する。
- **ビルドツールごとのアクセス方式の混同** → ビルドツールが定めたアクセス通路ではない方式で読み、常に `undefined`。スタックの規則を確認する。
- **必須変数の検証を省略** → 欠落がランタイムの奥で破裂する。起動時点で検証する。

## 4. チェックリスト
- [ ] 環境ごとに変わる値をコードから分離して環境変数に外部化したか
- [ ] 環境（dev/staging/prod）ごとに設定を分離し、環境を**明示的に選択**しているか（手動差し替え禁止）
- [ ] 重なる設定ファイルの**優先順位**を定めてあるか
- [ ] secret と公開設定を**別の通路**に分離したか（secret はシークレットマネージャ/注入）
- [ ] クライアントバンドルに出る変数を**公開値のみ**に限定したか（露出範囲の制御）
- [ ] 秘密が必要な呼び出しをバックエンド/BFF にプロキシしたか（クライアントが secret を直接握らないように）
- [ ] ローカル override・secret ファイルを `.gitignore` に入れ、**`.env.example` テンプレート**をコミットしたか
- [ ] 必須変数の存在・形式を**起動時点**で検証しているか（型定義/スキーマ）

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック（例: Next.js, Webpack/CRA, Node サーバ, Vite など）に合う例を同じパターンで追加する。上記 1～4 の原則・規則が標準であり、付録はその適用事例にすぎない。

### Vite (Vue)

> 本文 1～4 の原則・規則を Vite で実装するときの**スタック具体値（ファイル名・接頭辞・コマンド・API）のみ**を載せる。優先順位・secret 分離・露出制御などの「なぜ」は本文を見る。

#### ファイルの優先順位（本文 2-2 の Vite 具体値）

後に来るファイルが前のファイルを**上書きする**。優先順位（高 → 低）: `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`

| ファイル | ロード時点 | git コミット |
|---|---|---|
| `.env` | 全モード | O |
| `.env.local` | 全モード（ローカル override） | **X** |
| `.env.[mode]` | 該当モード（`development`/`production`/`staging`） | O |
| `.env.[mode].local` | 該当モード + ローカル | **X** |

#### `VITE_` 接頭辞 = クライアント露出通路（本文 2-4 の Vite 具体値）

クライアント（`import.meta.env`）に露出される変数は必ず `VITE_` で始まり、それ以外の変数はビルド時点でのみ使われる。

```dotenv
# .env
VITE_API_URL=https://api.example.com
VITE_APP_VERSION=1.0.0

# 露出されない（Vite plugin でのみアクセス）
SENTRY_AUTH_TOKEN=xxx
```

#### モード切り替え

```bash
vite                              # development モード（.env.development をロード）
vite --mode staging               # staging モード（.env.staging をロード）
vite build                        # production モード（.env.production をロード）
vite build --mode staging         # staging ビルド
```

`package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build:staging": "vite build --mode staging",
    "build": "vite build"
  }
}
```

#### 環境別 API URL マトリクス

| ファイル | VITE_API_URL | VITE_SENTRY_DSN |
|---|---|---|
| `.env.development` | http://localhost:8080/api | (empty) |
| `.env.staging` | https://staging-api.example.com | staging DSN |
| `.env.production` | https://api.example.com | prod DSN |

#### 使用 (`import.meta.env`)

```javascript
// src/utils/axios.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000
})
export default api
```

組み込み変数: `import.meta.env.MODE`（現在のモード）、`.DEV`/`.PROD`（boolean）、`.BASE_URL`（app base URL）。モード分岐は `import.meta.env.DEV`/`.PROD` で行う。

#### 型定義（本文 2-7 — 起動検証の Vite 方式）

```typescript
// src/env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_VERSION: string
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

#### Secret 分離（本文 2-4・2-5 — `VITE_` はビルド成果物にそのまま埋め込まれる）

```dotenv
# BAD - クライアントバンドルから抽出可能
VITE_OPENAI_API_KEY=sk-xxx

# GOOD - サーバ .env にのみ、secret 呼び出しは BFF でプロキシ
OPENAI_API_KEY=sk-xxx
```

詳細は `security-frontend` skill を参照。

#### `.gitignore`（本文 2-6 の Vite 具体値）

```gitignore
.env.local
.env.*.local
```
`.env`/`.env.[mode]` は secret がないときのみコミットし、secret が混ざればこれらも ignore して `.env.example` のみコミットする。

```dotenv
# .env.example（コミット用テンプレート — キーのみ、値は空）
VITE_API_URL=
VITE_APP_VERSION=
VITE_SENTRY_DSN=
```

#### Vite 特有のよくある間違い

- `VITE_API_SECRET=xxx` で秘密キーをクライアントに露出。
- `.env.local` を git にコミット。
- `process.env.VITE_API_URL` を使用（Vite は `import.meta.env` のみ動作）。
- `import.meta.env.MODE` で分岐しつつモード名をタイプミス（`producton`）。
- `VITE_` 接頭辞のない変数を `import.meta.env` でアクセスした後 `undefined` のデバッグに時間を浪費。
