---
name: CI/CD パイプライン標準
description: 継続的インテグレーション/デプロイ(CI/CD)パイプラインの汎用標準 — ステージ分離(lint→test→build→scan→deploy)と前ステージ失敗時の遮断、ブランチ保護のマージゲート、環境分離・production の手動承認、不変アーティファクトのタグ付け・ロールバック、シークレット管理、キャッシュ。特定の CI ツールに依存しない。パイプラインを作る、またはステージ・承認・ロールバックを決めるときに読む。キーワード: CI, CD, pipeline, build, deploy, branch protection, manual approval, artifact, rollback, GitHub Actions, GitLab CI.
rules:
  - "マージゲートは自動検証で: すべての変更(PR/MR)は CI を通過しないと統合ブランチへマージできないよう、ブランチ保護ルールを強制する。CI を回すだけで保護ルールがなければ、失敗してもマージされ意味がない。"
  - "ステージを分離して速く失敗する(fail-fast): パイプラインを lint→test→build→セキュリティスキャン→deploy に分け、前のステージが失敗したら後続をスキップする。安く速い検証(lint)を前に、高価な検証(build・deploy)を後ろに置く。"
  - "環境を分離し production は手動承認: dev・staging・production のデプロイを分離する。production デプロイは人による明示的な承認(manual approval)を必須にし、検証なしに障害が伝播しないようにする。"
  - "アーティファクトは一度ビルドして昇格(build once, promote): ビルド成果物はコンテンツ/コミットベースの一意なタグで識別し、環境ごとに再ビルドせず同じアーティファクトを昇格する。どのバージョンがデプロイされたか追跡でき、以前のバージョンへロールバックできる。"
  - "シークレットは秘密ストアから、ログに露出禁止: 認証情報は CI プラットフォームのシークレット管理機能(または外部の秘密ストア)に置き、パイプラインログでマスキングされるか確認する。平文の環境変数・コード・ログにシークレットを露出しない。"
  - "再現可能で速く: 依存はロックファイル(lock)ベースで決定的にインストールし、キャッシュで反復コストを減らす。パイプライン定義はコードでバージョン管理する(pipeline as code)。"
tags:
  - "CI"
  - "CD"
  - "pipeline"
  - "build"
  - "deploy"
  - "branch protection"
  - "manual approval"
  - "artifact"
  - "rollback"
  - "GitHub Actions"
  - "GitLab CI"
  - "github-actions"
  - "workflow"
  - ".github/workflows"
  - "on: push"
---

# 🚀 CI/CD パイプライン標準

> lint からデプロイまでパイプラインをステージに分けて自動化し、検証を通過した変更だけを一貫した品質でリリースする。マージはブランチ保護で、production デプロイは手動承認で止め、アーティファクトは追跡可能にタグ付けしてロールバックを保証する。パイプラインを新たに作る、またはステージ・環境分離・承認・シークレット・ロールバックを決めるときに読む。特定の CI ツール(GitHub Actions・GitLab CI・Jenkins など)に依存しない汎用標準である。

## 1. 基本原則
- **マージゲートは自動検証で**: すべての変更(PR/MR)は CI を通過しないと統合ブランチへマージできないよう、ブランチ保護ルールを強制する。CI を回すだけで保護ルールがなければ、失敗してもマージされ意味がない。
- **ステージを分離して速く失敗する(fail-fast)**: パイプラインを lint→test→build→セキュリティスキャン→deploy に分け、前のステージが失敗したら後続をスキップする。安く速い検証(lint)を前に、高価な検証(build・deploy)を後ろに置く。
- **環境を分離し production は手動承認**: dev・staging・production のデプロイを分離する。production デプロイは人による明示的な承認(manual approval)を必須にし、検証なしに障害が伝播しないようにする。
- **アーティファクトは一度ビルドして昇格(build once, promote)**: ビルド成果物はコンテンツ/コミットベースの一意なタグで識別し、環境ごとに再ビルドせず同じアーティファクトを昇格する。どのバージョンがデプロイされたか追跡でき、以前のバージョンへロールバックできる。
- **シークレットは秘密ストアから、ログに露出禁止**: 認証情報は CI プラットフォームのシークレット管理機能(または外部の秘密ストア)に置き、パイプラインログでマスキングされるか確認する。平文の環境変数・コード・ログにシークレットを露出しない。
- **再現可能で速く**: 依存はロックファイル(lock)ベースで決定的にインストールし、キャッシュで反復コストを減らす。パイプライン定義はコードでバージョン管理する(pipeline as code)。

## 2. ルール

### 2-1. CI 通過をマージ条件として強制(ブランチ保護)
- 統合ブランチ(main/develop など)に保護ルールをかけ、必須 CI チェックが通過しないとマージできないようにする。
- 「CI は回るが失敗してもマージ可能」という状態を作らない — チェック結果がゲートとして作動しなければならない。

```text
// ❌ 禁止 — CI は回るが失敗してもマージ可能(ゲートなし)
PR → CI 失敗 → それでもマージボタンが押せる

// ✅ 推奨 — 必須チェックの通過をマージの前提条件として強制
PR → 必須 CI チェックが通過しないとマージ不可
```

### 2-2. ステージを直列化し前ステージ失敗時に後続を遮断
- パイプラインを lint→test→build→セキュリティスキャン→deploy のステージに分け、ステージ間の依存を明示して前ステージ失敗時に後続を実行しない。
- 1 つのジョブにすべて詰め込んで「どこで壊れたか」を曖昧にしない。速い検証を前に置いてフィードバックを速く受け取る。

```text
// ❌ 禁止 — 1 つのジョブに全部詰め込む、lint が失敗しても最後まで回り時間を浪費
job all: lint; test; build; scan; deploy   // 何が壊れたか不明確

// ✅ 推奨 — ステージ分離 + 依存、前ステージ失敗時に後続をスキップ
lint → test → build → scan → deploy        // 各ステージが前ステージの成功に依存
```

### 2-3. 環境分離 + production 手動承認
- 同じアーティファクトでも dev・staging・production のデプロイ経路を分離し、環境別の設定/シークレットを環境単位で隔離する。
- production デプロイは自動で流さず、人による明示的な承認を経る。どのブランチ/条件がどの環境へ行くかを明確にする。

```text
// ❌ 禁止 — 統合ブランチへのマージが即 production 自動デプロイ
merge → production 自動デプロイ            // 検証なしに障害が伝播

// ✅ 推奨 — 環境分離 + production は手動承認ゲート
develop → staging 自動デプロイ
main    → (手動承認) → production デプロイ
```

### 2-4. アーティファクトのタグ付け + ロールバック(一度ビルド、昇格)
- ビルド成果物にコンテンツ/コミットベースの一意なタグを付け、どのバージョンがどこにデプロイされたか追跡する。
- 環境ごとに再ビルドせず同じアーティファクトを昇格し、直前の正常バージョンへ即座にロールバックできるよう保管する。

```text
// ❌ 禁止 — タグなしで環境ごとに新規ビルド → ロールバック対象が不明確
staging:    build → deploy
production: build(再び) → deploy        // デプロイ済みバージョン・ロールバック対象が追跡不可

// ✅ 推奨 — 一意なタグで一度ビルドしてから昇格、ロールバック可能
build → artifact:<commit-hash>
staging/production とも同じ artifact:<commit-hash> を昇格
ロールバック = 直前の正常タグを再デプロイ
```

### 2-5. シークレットは秘密ストアから、ログマスキング
- 認証情報・トークン・キーは CI プラットフォームのシークレット管理機能(または外部の秘密ストア)から注入し、環境別に分離する。
- シークレットがパイプラインログでマスキングされるか確認し、平文の環境変数・ソースコード・ログに絶対に露出しない。

```text
// ❌ 禁止 — シークレットを平文でコード/ログに露出
DEPLOY_TOKEN = "ghp_xxxxxxxx"          // コード/ログに平文 → 漏洩
echo $DEPLOY_TOKEN                      // ログにそのまま出力される

// ✅ 推奨 — 秘密ストアから注入、ログマスキングを確認
DEPLOY_TOKEN = <secret store から注入>  // ログには *** でマスキング
```

### 2-6. 決定的インストール + キャッシュで速度最適化
- 依存はロックファイル(lock)ベースで決定的にインストールしてビルド再現性を保証する。
- 依存・ビルド成果物をキャッシュして反復コストを減らすが、キャッシュキーはロックファイルのハッシュなど内容に連動させ、古いキャッシュが誤って使われないようにする。

```text
// ✅ 推奨 — lock ベースの決定的インストール + 内容ベースのキャッシュキー
install(lockfile)                       // 同じ入力 → 同じ結果
cache key = hash(lockfile)              // lock が変われば キャッシュ無効化
```

## 3. よくある間違い
- **ブランチ保護なしで CI だけ回す** → チェックが失敗してもマージされ、ゲートとして作動しない。
- **ステージを分離しない** → lint 失敗でもテスト・ビルド・デプロイまで回って時間を浪費し、どこで壊れたか曖昧になる。
- **production 自動デプロイ** → 人の検証なしに即デプロイされ障害がそのまま伝播する。手動承認ゲートを置く。
- **シークレットを平文の環境変数・ログに露出** → 認証情報が漏洩する。秘密ストアから注入しログマスキングを確認する。
- **アーティファクトに一意なタグがない / 環境ごとに再ビルド** → どのバージョンがデプロイされたか・ロールバック対象が不明確。一度ビルドしてタグ付け後に昇格する。
- **キャッシュキーを内容に連動させない** → 依存が変わっても古いキャッシュが使われビルドがずれる。
- **パイプラインを UI で手作業のみで設定** → 変更履歴・レビューがない。パイプライン定義をコードでバージョン管理する。

## 4. チェックリスト
- [ ] CI 通過をマージ条件にする **ブランチ保護ルール** があるか
- [ ] **lint→test→build→セキュリティスキャン→deploy** ステージを分離し前ステージ失敗時に後続をスキップするか
- [ ] dev・staging・production の **環境を分離** し production は **手動承認** を経るか
- [ ] アーティファクトを **一意なタグ** で識別し一度ビルドして昇格し **ロールバック** が可能か
- [ ] シークレットを **秘密ストア** で管理しログに **マスキング** されるか確認したか
- [ ] 依存を **ロックファイルベース** で決定的にインストールし **キャッシュ** で最適化したか
- [ ] パイプライン定義を **コードでバージョン管理** するか

> セキュリティスキャンステージのスキャナー選択・重大度しきい値・ゲーティングポリシーは `依存関係セキュリティスキャン (SCA)` 標準に従う(ここではステージ配置・失敗時の遮断のみを決める)。入力値検証・例外応答などステージ別の詳細ルールは該当スキル(`validation-bean` など)を参照する。

## 付録: スタック別の例

> 以下は参考用の実装例である。上記 1〜4 の原則・ルールが標準であり、付録はその適用事例にすぎない。チームが使う CI ツール(例: GitLab CI, Jenkins, CircleCI など)に合った例を同じパターンで追加する。

### GitHub Actions (GitLab CI など)

`needs` でステージを直列化し前ステージ失敗時に後続ステージをスキップする。

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v4

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: "dist-${{ github.sha }}", path: "dist/" }

  security:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # スキャナー選択・重大度しきい値・ゲーティングポリシーは `依存関係セキュリティスキャン (SCA)` 標準に従う。
      # ここでは build の後に scan ステージを置き、しきい値超過時にビルドを失敗させる「配置」のみを決める。
      - run: # SCA スキャン実行 (しきい値超過時に exit≠0)
```

#### デプロイパイプライン (環境分離 + 手動承認)
```yaml
  deploy-staging:
    needs: security
    if: github.ref == 'refs/heads/develop'
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { name: "dist-${{ github.sha }}" }
      # デプロイコマンド...

  deploy-production:
    needs: security
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://app.example.com
    runs-on: ubuntu-latest
    # environment 設定 → GitHub で手動承認を要求
    steps:
      # デプロイコマンド...
```

#### ブランチ戦略
```
feature/* → develop → PR Review → staging 自動デプロイ
                    → main → production 手動承認後にデプロイ
hotfix/*  → main → production 手動承認後にデプロイ
```

#### キャッシュで速度最適化
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-node-
```
