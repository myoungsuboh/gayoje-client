---
name: エラーモニタリング (Error Monitoring)
description: フロントエンドのエラー収集に関する汎用標準 — エラー収集ツールの導入、ソースマップのアップロード(非公開)、リリース・環境のタグ付け、コンテキストとユーザー影響の特定、PIIのマスキング、環境ごとのサンプリング、アラートのしきい値。特定のツール/フレームワークに依存しない。フロントエンドにエラーモニタリングを組み込む・整備するとき、何を収集/除外するか・ソースマップ・サンプリング・PII処理を決めるときに読む。キーワード: error monitoring, crash reporting, sourcemap, release tagging, environment, breadcrumb, sampling, PII scrub, capture, alert threshold。
rules:
  - "エラーを取りこぼさない(グローバル収集): 未処理の例外・拒否されたPromise・レンダリングエラーをグローバルで一括して捕捉し、どのコードパスで発生しても漏れなく収集する。console.errorだけ出力して終わらせたり、try/catchで握りつぶしてsilent failにしたりしない。"
  - "シグナルとノイズを分ける: すべてのエラーを送らない。ユーザーが手を打てない真の欠陥(サーバーエラー・ネットワーク障害・予期しない例外)だけを収集し、正常フローの一部であるエラー(入力検証失敗のような4xx系)は除外してノイズの急増を防ぐ。"
  - "リリース・環境をタグ付けする: すべてのイベントに、どのバージョン(release)・どの環境(dev/staging/prod)で発生したかを付与し、リグレッションがどのデプロイから始まったか追跡できるようにする。"
  - "ソースマップで元の位置を復元するが公開しない: 圧縮/難読化されたスタックトレースを元のソース位置へ戻すソースマップを収集ツールにのみアップロードする。ソースマップを公開配布物と一緒に出力しない(元コード露出)。"
  - "コンテキストとユーザー影響を残す: エラー直前のユーザー行動の足跡(breadcrumb)、発生した画面/経路、匿名のユーザー識別子を一緒に残し、再現と影響範囲(何人に、どの画面で)の把握を助ける。"
  - "PIIは送信前に除去する: 個人識別情報・秘密値(メール・パスワード・トークン・マイナンバー等)をユーザーコンテキストやペイロードに入れず、送信直前のフックでマスキング/削除する。詳細な基準は別スキル(privacy-pii)に従う。"
  - "環境ごとにサンプリングする: 環境ごとに収集・トレーシングの比率を変える。開発環境は通常無効化してquota・ノイズを節約し、本番はエラー影響に応じて比率を決める。"
  - "しきい値ベースでアラートする: すべてのイベントをアラートに流さず、影響度(頻度・ユーザー数・新規リグレッションか)がしきい値を超えたときだけ通知してアラート疲れを防ぐ。運用観測全般はobservabilityスキルと併せて見る。"
tags:
  - "error monitoring"
  - "crash reporting"
  - "sourcemap"
  - "release tagging"
  - "environment"
  - "breadcrumb"
  - "sampling"
  - "PII scrub"
  - "capture"
  - "alert threshold"
  - "Sentry"
  - "captureException"
  - "captureMessage"
  - "@sentry/vue"
  - "errorHandler"
  - "errorBoundary"
---

# 🛰️ エラーモニタリング (Error Monitoring)

> フロントエンドで発生するエラーを安全に収集・診断し、ユーザー影響の大きい問題を優先的に対応するための標準。エラーモニタリングを導入・整備するとき、何を収集/除外するか、ソースマップ・リリースタグ付け・サンプリング・PII処理を決めるときに読む。特定の収集ツール(例: Sentry)やフレームワーク(例: Vue)に依存しない汎用標準である。具体的な適用例は末尾の付録を参照。

## 1. 中核原則
- **エラーを取りこぼさない(グローバル収集)**: 未処理の例外・拒否されたPromise・レンダリングエラーをグローバルで一括して捕捉し、どのコードパスで発生しても漏れなく収集する。`console.error`だけ出力して終わらせたり、`try/catch`で握りつぶしてsilent failにしたりしない。
- **シグナルとノイズを分ける**: すべてのエラーを送らない。ユーザーが手を打てない真の欠陥(サーバーエラー・ネットワーク障害・予期しない例外)だけを収集し、正常フローの一部であるエラー(入力検証失敗のような4xx系)は除外してノイズの急増を防ぐ。
- **リリース・環境をタグ付けする**: すべてのイベントに、どのバージョン(release)・どの環境(dev/staging/prod)で発生したかを付与し、リグレッションがどのデプロイから始まったか追跡できるようにする。
- **ソースマップで元の位置を復元するが公開しない**: 圧縮/難読化されたスタックトレースを元のソース位置へ戻すソースマップを収集ツールにのみアップロードする。ソースマップを公開配布物と一緒に出力しない(元コード露出)。
- **コンテキストとユーザー影響を残す**: エラー直前のユーザー行動の足跡(breadcrumb)、発生した画面/経路、匿名のユーザー識別子を一緒に残し、再現と影響範囲(何人に、どの画面で)の把握を助ける。
- **PIIは送信前に除去する**: 個人識別情報・秘密値(メール・パスワード・トークン・マイナンバー等)をユーザーコンテキストやペイロードに入れず、送信直前のフックでマスキング/削除する。詳細な基準は別スキル(`privacy-pii`)に従う。
- **環境ごとにサンプリングする**: 環境ごとに収集・トレーシングの比率を変える。開発環境は通常無効化してquota・ノイズを節約し、本番はエラー影響に応じて比率を決める。
- **しきい値ベースでアラートする**: すべてのイベントをアラートに流さず、影響度(頻度・ユーザー数・新規リグレッションか)がしきい値を超えたときだけ通知してアラート疲れを防ぐ。運用観測全般は`observability`スキルと併せて見る。

## 2. ルール

### 2-1. グローバルで漏れなく収集する
- 未処理の例外、拒否されたPromise、フレームワークのレンダリングエラーをグローバルフック一箇所で捕捉する。
- 個別の`try/catch`で捕まえたら復旧するか、復旧できないエラーは収集ツールへ報告してから再スローする — 静かに握りつぶさない。

```text
// ❌ 禁止 — 捕まえて静かに捨てる(何が起きたか誰も分からない)
try { doWork() } catch (e) { console.error(e) }   // 収集されない

// ✅ 推奨 — グローバルフックで一括収集 + 処理できないものは報告後に再スロー
onUnhandledError(e   => capture(e))
onUnhandledRejection(e => capture(e.reason))
onFrameworkError(e   => capture(e))
try { doWork() } catch (e) { capture(e); throw e }
```

### 2-2. 収集するエラーと除外するエラーを区別する
- ユーザーが手を打てない欠陥(サーバーエラー・ネットワーク障害・予期しない例外)だけを収集する。
- 正常フローの一部であるクライアントエラー(入力検証失敗等の4xx系)は除外する — ノイズを増やしシグナルを埋もれさせるだけ。
- どのエラーを送るかを一箇所(共通のネットワーク層/フィルター)で決める。

```text
// ❌ 禁止 — すべてのネットワークエラーを収集(404/401ノイズが急増)
onApiError(err => capture(err))

// ✅ 推奨 — サーバーエラー・ネットワーク障害だけ収集、4xxは除外
onApiError(err => {
  if (err.status >= 500 || err.networkFailed) capture(err)
})
```

### 2-3. すべてのイベントにリリース・環境をタグ付けする
- ビルド時点のバージョンをrelease、実行環境をenvironmentとしてすべてのイベントに自動付与する。
- タグ付けがないと「どのデプロイから壊れたか」を追跡できない。

```text
// ✅ 推奨 — 初期化時に一度設定 → すべてのイベントに自動付与
monitor.init({
  environment: currentEnv,   // dev | staging | prod
  release:     appVersion,   // ビルドに注入されたバージョン/コミット
})
```

### 2-4. ソースマップはツールにのみアップロード、公開配布禁止
- ビルド成果物にソースマップを同梱して公開せず、収集ツールにのみ非公開でアップロードする。
- アップロードはCIで秘密トークンを使って行い、release識別子を合わせてスタックトレースが正確にマッピングされるようにする。

```text
// ❌ 禁止 — 公開配布物にソースマップ同梱(元コード露出)
build: emit *.map alongside public assets

// ✅ 推奨 — 公開物にはソースマップを含めず、ツールにのみアップロード
build:  generate hidden sourcemaps (not served publicly)
deploy: upload sourcemaps to monitoring tool, keyed by release
```

### 2-5. ユーザー影響は匿名識別子で残す
- 「何人に影響したか」を集計できるよう、匿名/内部の識別子だけをユーザーコンテキストに入れる。
- メール等のPIIは入れない(2-7参照)。ログアウト時にユーザーコンテキストを空にする。

```text
// ❌ 禁止 — PIIをユーザーコンテキストに付与
setUser({ id, email, phone })

// ✅ 推奨 — 匿名/内部の識別子だけ
setUser({ id: user.id, displayName: user.handle })  // PII除外
onLogout(() => setUser(null))
```

### 2-6. コンテキスト(足跡・画面/経路)を一緒に残す
- エラー直前のユーザー行動の足跡(breadcrumb)と発生画面/経路タグを残して再現を助ける。
- 足跡にトークン・秘密値が混ざらないようにする(2-7)。

```text
// ✅ 推奨 — 行動の足跡 + 現在の画面タグ
addBreadcrumb({ category: 'user-action', message: 'Clicked export' })
onRouteChange(route => setTag('route', route.name))
```

### 2-7. 送信前にPII・秘密値を除去する
- 送信直前のフックで、ペイロード・足跡・URLクエリの機密情報(パスワード・トークン・マイナンバー等)をマスキング/削除する。
- 何がPIIか・マスキング基準は`privacy-pii`スキルに従う。

```text
// ✅ 推奨 — 送信直前のスクラブフック
beforeSend(event => {
  redact(event.payload, ['password', 'token', 'ssn'])
  maskQueryParams(event.breadcrumbs, ['token', 'access_token'])
  return event
})
```

### 2-8. 環境ごとのサンプリング比率を決める
- 環境ごとに収集/トレーシング比率を分ける。開発は通常無効化、本番は影響度に応じて比率を置く。
- エラー自体は可能な限りすべて受ける(重要なシグナル)が、コストの大きいトレーシング/セッション記録は比率を下げる。

```text
// ✅ 推奨 — 環境ごとのマトリクスで比率を分離
sampleRate = { dev: 0, staging: 0.5, prod: 0.1 }[currentEnv] ?? 0
```

| 環境 | 収集有効化 | トレーシング比率 | 備考 |
|---|---|---|---|
| development | オフ | 0 | ローカルノイズ・quota節約 |
| staging | オン | 中(例: 0.5) | 事前検証 |
| production | オン | 低(例: 0.1) | 影響度に応じて調整 |

### 2-9. アラートは影響しきい値でかける
- 新規リグレッション、急増、影響ユーザー数などしきい値を超えるイシューだけアラートする — 個別イベントごとにアラートしない。
- しきい値・ルーティング(誰に、どのチャネルで)はチーム合意で決め、運用観測は`observability`スキルと連携する。

```text
// ✅ 推奨 — しきい値ベースのアラート(例のポリシー)
alert when: 新イシューの初回発生 OR 24h以内の発生急増 OR 影響ユーザー ≥ N
mute:       既存のknownイシュー、しきい値未満
```

## 3. よくある間違い
- **すべての4xxを収集** → 404/401ノイズが急増し真の欠陥が埋もれる。サーバーエラー・ネットワーク障害だけ。
- **開発環境でも収集を有効化** → ローカルエラーでquota・ダッシュボードが汚染される。devは無効化。
- **PII送信** → ユーザーコンテキスト/ペイロードにメール・電話・トークンを入れる。匿名識別子 + 送信前スクラブ。
- **ソースマップ公開配布** → 公開物に`*.map`を同梱して元コードが露出する。ツールにのみ非公開アップロード。
- **release/environmentタグ付け漏れ** → どのデプロイから壊れたか追跡不可。初期化時に常にタグ付け。
- **`try/catch`で捕まえて未報告(silent fail)** → エラーが消える。報告後に再スローするか復旧。
- **`console.error`だけ出力** → 収集ツールへcaptureしないと観測されない。
- **全イベントアラート** → アラート疲れで肝心の重要なシグナルを見逃す。しきい値ベースで。

## 4. チェックリスト
- [ ] 未処理の例外・拒否されたPromise・レンダリングエラーを**グローバルで**収集しているか
- [ ] サーバーエラー・ネットワーク障害だけを収集し4xx系は除外しているか
- [ ] すべてのイベントに**release・environment**をタグ付けしているか
- [ ] ソースマップを**公開配布せず**収集ツールにのみ非公開アップロードしているか
- [ ] ユーザーコンテキストに**匿名/内部の識別子だけ**を入れPIIを除外しているか (`privacy-pii`)
- [ ] 送信直前のフックでパスワード・トークン・マイナンバー等を**スクラブ**しているか
- [ ] **環境ごとのサンプリング**マトリクス(dev/staging/prod)に従っているか
- [ ] アラートを**影響しきい値ベース**でかけているか (`observability`)
- [ ] `try/catch`で捕まえたエラーをsilent failのまま放置していないか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: React/Next、別の収集ツール、fetchベースのクライアント等)に合った例を同じパターンで追加する。上記1~4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Vue 3 (@sentry/vue)

Sentry Vue SDKをベースにグローバルエラーを収集し、`beforeSend`で機密情報をスクラブし、Viteプラグインでソースマップを非公開アップロードする。

#### インストール
```bash
npm install @sentry/vue
npm install -D @sentry/vite-plugin
```

#### 初期化
```javascript
// src/main.js
import { createApp } from 'vue'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 環境ごとのトレーシング比率 — オブジェクトを直接インデックスするとマッチがないときundefinedになるため
// 別の定数に分離して ?? 0 でnumberを保証する。
const rate = ({ development: 0, staging: 0.5, production: 0.1 })[import.meta.env.MODE] ?? 0

Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  integrations: [
    Sentry.browserTracingIntegration({ router }),
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })
  ],
  tracesSampleRate: rate,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,
  tracePropagationTargets: ['localhost', /^https:\/\/api\.example\.com/],
  beforeSend: scrubSensitive   // 送信直前にスクラブ(定義は下の「機密情報スクラブ」)
})

app.use(router).mount('#app')
```

> 環境ごとの比率は本文§2-8「環境ごとのサンプリング」表に従う(dev=0, staging≈0.5, prod≈0.1)。上記コードの`rate`・`replaysOnErrorSampleRate`・環境ごとの`dsn`がそのポリシーを実装したものである。

#### ユーザーコンテキスト
```javascript
// ログイン時
import * as Sentry from '@sentry/vue'

Sentry.setUser({
  id: user.id,
  username: user.username
  // email/PIIは入れないこと
})

// ログアウト時
Sentry.setUser(null)
```

#### 経路別Transaction
- `browserTracingIntegration({ router })`が自動で経路transitionをtransactionとして記録。
- 追加コンテキスト:

```javascript
router.afterEach((to) => {
  Sentry.setTag('route', to.name)
})
```

#### グローバルエラーハンドラ + Axios Interceptor
```javascript
// src/main.js
app.config.errorHandler = (err, instance, info) => {
  Sentry.captureException(err, {
    contexts: { vue: { componentName: instance?.$options.name, info } }
  })
}

window.addEventListener('unhandledrejection', (e) => {
  Sentry.captureException(e.reason)
})
```

```javascript
// src/utils/axios.js
import api from './axios-instance'
import * as Sentry from '@sentry/vue'

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status ?? 0
    // 4xx除外、5xxのみSentryへ送信
    if (status >= 500 || status === 0) {
      Sentry.captureException(err, {
        tags: { type: 'api', status },
        extra: { url: err.config?.url, method: err.config?.method }
      })
    }
    return Promise.reject(err)
  }
)
```

#### Breadcrumb
```javascript
import * as Sentry from '@sentry/vue'

Sentry.addBreadcrumb({
  category: 'user-action',
  message: 'Clicked export button',
  level: 'info',
  data: { reportId: 123 }
})
```

#### 機密情報スクラブ (`beforeSend`)
```javascript
function scrubSensitive(event) {
  // request body
  if (event.request?.data) {
    const data = typeof event.request.data === 'string'
      ? JSON.parse(event.request.data) : event.request.data
    delete data.password
    delete data.token
    delete data.ssn
    event.request.data = data
  }
  // breadcrumbのURLクエリ文字列のトークンをマスキング
  event.breadcrumbs?.forEach(b => {
    if (b.data?.url) b.data.url = b.data.url.replace(/token=[^&]+/g, 'token=***')
  })
  return event
}
```

#### ソースマップアップロード
```javascript
// vite.config.js
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default {
  build: { sourcemap: 'hidden' },
  plugins: [
    sentryVitePlugin({
      org: 'my-org',
      project: 'frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN, // CI secret
      release: { name: process.env.VITE_APP_VERSION }
    })
  ]
}
```
- ソースマップは**public配布禁止** → `sourcemap: 'hidden'`でSentryにのみアップロード。
