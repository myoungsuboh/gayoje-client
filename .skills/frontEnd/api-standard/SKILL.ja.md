---
name: API通信標準 (HTTP Client)
description: フロントエンドのHTTP通信の汎用標準 — 単一HTTPクライアント、リクエストインターセプターによるトークン自動付与、401時にトークンを1回更新して再試行、レスポンスペイロードのアンラップ、グローバル対インラインのエラー分担、複数呼び出しの処理。特定のライブラリ/フレームワークに依存しない。API呼び出しレイヤーを作る、またはエラー処理・認証フローを設計するとき、レスポンス形式・エラー表示位置を統一するときに読む。キーワード: http client, interceptor, token, 401 refresh, unwrap, global error, retry, allSettled。
rules:
  - "単一のHTTPクライアントのみを使う: 共通設定(ベースURL・タイムアウト・インターセプター・資格情報)を適用したクライアントインスタンスを一度だけ作り、全体で共有する。画面・モジュールごとに新しいインスタンスを作るとインターセプター(トークン・エラー・アンラップ)が欠落する。"
  - "認証トークンはクライアントが自動で付与する: 各呼び出し元が認証ヘッダーを直接埋め込まない。リクエストインターセプター(または共通の入り口)の一箇所だけでトークンを付ける。"
  - "失効(401)は即座にログアウトしない: 認証失効を受けたらトークン更新を1回試み、更新に成功したら元のリクエストを再試行する。更新が失敗したときだけログアウトする。同時に複数のリクエストが失効を受けても更新は一度だけ行う。"
  - "レスポンスペイロードは一箇所で一度だけアンラップする: サーバーの共通ラッパー(例: { data, ... })をレスポンスインターセプターで剥がし、実際のデータだけを呼び出し元へ渡す。呼び出し元が再び .data を掘らない。"
  - "エラー表示位置を明確に分ける: 「ユーザーが手を打てないエラー」(ネットワーク切断・サーバー5xx)はグローバルに(例: トースト)通知し、「ユーザー入力/文脈に依存するエラー」(4xx: 検証・権限)は呼び出した画面がインラインで処理する。"
  - "無意味なtry-catchラッピングを禁止する: 捕まえてそのまま再スローするだけのコードは置かない。共通処理(インターセプター)で十分なら呼び出し元は結果/エラーだけを扱う。"
  - "複数の非同期呼び出しは部分失敗を集計する: 複数のリクエストを並列で送るとき、一つが失敗したからといって全部を捨てず、成功/失敗を一緒に収めて処理する。"
tags:
  - "http client"
  - "interceptor"
  - "token"
  - "401 refresh"
  - "unwrap"
  - "global error"
  - "retry"
  - "allSettled"
  - "axios"
  - "fetch("
  - "ApiResponse"
  - "axios.create"
  - "baseURL"
  - "Authorization"
---

# 🔌 API通信標準 (HTTP Client)

> フロントエンドのすべての外部通信を単一HTTPクライアントに集約し、インターセプターでトークン付与・レスポンスアンラップ・認証更新・グローバルエラーを一括処理する。API呼び出しレイヤーを書く、またはエラーフロー・認証フローを設計するときに読む。特定のライブラリ/フレームワークに依存しない汎用標準である。

## 1. コア原則

- **単一のHTTPクライアントのみを使う**: 共通設定(ベースURL・タイムアウト・インターセプター・資格情報)を適用したクライアントインスタンスを一度だけ作り、全体で共有する。画面・モジュールごとに新しいインスタンスを作るとインターセプター(トークン・エラー・アンラップ)が欠落する。
- **認証トークンはクライアントが自動で付与する**: 各呼び出し元が認証ヘッダーを直接埋め込まない。リクエストインターセプター(または共通の入り口)の一箇所だけでトークンを付ける。
- **失効(401)は即座にログアウトしない**: 認証失効を受けたらトークン更新を1回試み、更新に成功したら元のリクエストを再試行する。更新が失敗したときだけログアウトする。同時に複数のリクエストが失効を受けても更新は一度だけ行う。
- **レスポンスペイロードは一箇所で一度だけアンラップする**: サーバーの共通ラッパー(例: `{ data, ... }`)をレスポンスインターセプターで剥がし、実際のデータだけを呼び出し元へ渡す。呼び出し元が再び `.data` を掘らない。
- **エラー表示位置を明確に分ける**: 「ユーザーが手を打てないエラー」(ネットワーク切断・サーバー5xx)はグローバルに(例: トースト)通知し、「ユーザー入力/文脈に依存するエラー」(4xx: 検証・権限)は呼び出した画面がインラインで処理する。
- **無意味なtry-catchラッピングを禁止する**: 捕まえてそのまま再スローするだけのコードは置かない。共通処理(インターセプター)で十分なら呼び出し元は結果/エラーだけを扱う。
- **複数の非同期呼び出しは部分失敗を集計する**: 複数のリクエストを並列で送るとき、一つが失敗したからといって全部を捨てず、成功/失敗を一緒に収めて処理する。

## 2. ルール

### 2-1. 単一HTTPクライアントへの一元化

- ベースURL・タイムアウト・資格情報(クッキー送信)・インターセプターを適用したクライアントを一度生成して共有する。
- 画面・モジュールごとに新しいインスタンスを作らない — 共通インターセプターが抜けた瞬間、トークン・エラー・アンラップがすべて壊れる。
- ベースURLは環境別設定から注入する(ハードコーディング禁止)。→ `env-config`

```text
// ❌ 禁止 — 画面ごとに新しいクライアント (インターセプター欠落)
screenA: client = createClient(baseUrl)   // トークン/エラー/アンラップインターセプターなし
screenB: client = createClient(baseUrl)

// ✅ 推奨 — 共通設定 + インターセプターを付けた単一インスタンスを共有
apiClient = createClient({ baseUrl: env.API_BASE, timeout, withCredentials })
apiClient.onRequest(attachToken)
apiClient.onResponse(unwrap, handleError)
// すべてのAPIモジュールが apiClient を import して使う
```

### 2-2. トークンはインターセプターが自動付与

- 認証ヘッダーを呼び出し元が直接作らない。リクエストインターセプターで現在のトークンを読み、一箇所だけで付ける。
- トークンの保存場所(メモリ・クッキーなど)の選択とセキュリティのトレードオフは → `security-frontend`。

```text
// ❌ 禁止 — コンポーネントがヘッダーを直接埋め込む (欠落・重複・不整合)
getUsers({ headers: { Authorization: 'Bearer ' + token } })

// ✅ 推奨 — リクエストインターセプターが一括付与
onRequest(config):
  if auth.accessToken: config.headers.Authorization = 'Bearer ' + auth.accessToken
  return config
```

### 2-3. 401 → トークンを1回更新して再試行 (同時リクエストは一度だけ更新)

- 認証失効を受けたら直ちにログアウトせず、トークン更新を1回試みる。成功したら新しいトークンで元のリクエストを再試行し、失敗したらそのときログアウトする。
- 同じリクエストが無限に再試行されないよう「すでに一度再試行した」印を置く。
- 同時に複数のリクエストが401を受けても、更新作業は一つだけ共有して一度だけ行う(進行中の更新Promiseを再利用)。

```text
// ❌ 禁止 — 401で即座にログアウト (ユーザー作業の喪失)
onError(err):
  if err.status == 401: auth.logout()

// ✅ 推奨 — 1回の更新試行、同時401は単一更新を共有
onError(err):
  if err.status == 401 and not err.config.retried:
    err.config.retried = true
    refreshing = refreshing ?? auth.refresh()        // 進行中なら同じPromiseを再利用
    // 更新が終わって(成功/失敗)からリセットする — finally で囲み再利用窓を維持。
    // (即座にnullに空けると同時401がそれぞれ新しい更新を立ち上げ、単一更新が壊れる)
    newToken = await refreshing.finally(() => refreshing = null)
    if newToken: return client.request(err.config)   // 元リクエスト再試行
    auth.logout()
```

### 2-4. レスポンスペイロードはインターセプターで一度だけアンラップ

- サーバーの共通ラッパーをレスポンスインターセプターで剥がし、実際のデータだけを返す。呼び出し元・型定義は「アンラップ済みペイロード」を基準に書く。
- 呼び出し元で `.data` を再度アクセスしない(二重アンラップはバグの原因)。

```text
// ❌ 禁止 — インターセプターが剥がさず呼び出し元ごとに .data を繰り返す
res = await getUser(); user = res.data.data   // どこまで掘るかバラバラ

// ✅ 推奨 — インターセプターがアンラップ、呼び出し元はそのまま使用
onResponse(res): return res.data   // 一度だけアンラップ
user = await getUser()             // すでにペイロード
```

### 2-5. API関数はドメイン別に分離し命名規則に従う

- エンドポイント呼び出し関数をドメイン単位のファイルに分け、コンポーネントがクライアントを直接扱わないようにする。
- 関数名は一貫した規則(例: `<動詞><名詞>` + 共通サフィックス)で統一する。
- 意味のない `try { ... } catch (e) { throw e }` ラッピングを入れない — 共通エラー処理はインターセプターが行う。

```text
// ✅ 推奨 — ドメイン別モジュール、コンポーネントは関数だけ呼ぶ
// api/sensor
getSensors(deckId)  -> client.get('/sensors', { params: { deckId } })
getSensor(id)       -> client.get('/sensors/' + id)
createSensor(body)  -> client.post('/sensors', body)
```

### 2-6. エラー表示位置の分担 (グローバル対インライン)

- 処理責任を状態別に分ける。グローバル処理(ネットワーク・5xx)はインターセプターで、文脈依存処理(4xx)は呼び出した画面で。
- 検証/権限エラー(4xx)をグローバルトーストで出さない — フォームインラインメッセージでなければユーザーが直せない。
- モニタリングツールへ送るエラーとそのタイミングは → `error-monitoring`。

| 状態 | 処理位置 | ユーザー表示 |
|------|-----------|-------------|
| ネットワーク切断 | インターセプター(グローバル) | グローバル通知(トースト) |
| 401 (失効) | インターセプター(グローバル) | 更新試行 → 失敗時ログイン画面 |
| 4xx (検証/権限) | 呼び出し画面(インライン) | フォーム/フィールドインラインメッセージ |
| 5xx | インターセプター(グローバル) | グローバル通知 + モニタリングキャプチャ |

```text
// ✅ 推奨 — グローバルはインターセプター、4xx は呼び出し元に委譲
onError(err):
  if no response:        notifyGlobal('ネットワークを確認'); reject(NETWORK)
  if err.status >= 500:  notifyGlobal('サーバーエラー'); 
  reject(err.payload)    // 4xx は呼び出し画面が受けてインライン処理
```

### 2-7. 複数の非同期呼び出しは部分失敗を集計

- 複数のリクエストを並列で送るとき、一つの失敗で全体を捨てない。成功/失敗をすべて収めた後、失敗分だけ集めて処理する。

```text
// ❌ 禁止 — 一つ失敗すると残りの成功も丸ごと捨てられる
[a, b, c] = await all([reqA, reqB, reqC])

// ✅ 推奨 — 成功/失敗を一緒に収め失敗だけ集計
results = await allSettled([reqA, reqB, reqC])
ok      = results.filter(fulfilled).map(value)
failed  = results.filter(rejected)
if failed: 失敗だけ別途処理/表示
```

## 3. よくある間違い

- **画面ごとに新しいクライアント生成** → インターセプター(トークン・エラー・アンラップ)欠落。単一インスタンスを共有する。
- **トークンをコンポーネントが直接ヘッダーに埋め込む** → 欠落・重複・不整合。リクエストインターセプターで一元化。
- **401で即座にログアウト** → ユーザー入力が飛ぶ。更新の1回試行が優先。
- **同時401をそれぞれ更新** → トークン更新が複数回重複実行される。進行中の更新を共有する。
- **アンラップを呼び出し元で繰り返す** → どこまで `.data` を掘るかバラバラ。インターセプターで一度だけアンラップ。
- **4xxをグローバルトーストで処理** → フォーム検証/権限メッセージがトーストで出てUXが壊れる。インラインで。
- **意味のないtry-catch rethrow** → 捕まえてそのまま投げるだけのラッピングは除去。インターセプターで十分。
- **複数呼び出しで部分失敗を無視** → 一部の失敗を飲み込むか全体を捨てる。成功/失敗を集計する。

## 4. チェックリスト

- [ ] すべてのAPI呼び出しが**単一HTTPクライアント**インスタンスを共有しているか
- [ ] ベースURLを環境設定から注入しているか(ハードコーディングでない)
- [ ] 認証トークンを**リクエストインターセプターで一括付与**し呼び出し元が直接埋め込まないか
- [ ] 401時に**トークンを1回更新 → 再試行**、失敗したときだけログアウトするか
- [ ] 同時401で更新作業を**一度だけ**行う(進行中の更新を共有)か
- [ ] レスポンスペイロードを**インターセプターで一度だけアンラップ**し呼び出し元で再アクセスしないか
- [ ] API関数が**ドメイン別ファイル**に分離され一貫した命名規則に従っているか
- [ ] ネットワーク・5xxは**グローバル**、4xxは**呼び出し画面のインライン**で処理するか
- [ ] 意味のないtry-catch rethrowがないか
- [ ] 複数の非同期呼び出しで**部分失敗を集計**(成功/失敗を分離)するか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: React + fetch/TanStack Query, Angular HttpClient, Svelteなど)に合った例を同じパターンで追加する。上記1〜4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Vue 3 (Axios + Pinia)

Axios単一インスタンス + Pinia auth storeベース。トークンインターセプター・レスポンスアンラップ・401更新・グローバルエラーをインターセプターで処理し、`useApi` composable でコンポーネントのローディング/エラー状態を束ねる。

> 関連スキル:
> - トークン保存 (localStorage vs httpOnly cookie): [security-frontend](../../security/security-frontend/SKILL.md) §2
> - エラーをSentryへ送るタイミング: [error-monitoring](../error-monitoring/SKILL.md) §5
> - 環境別 base URL: [env-config](../env-config/SKILL.md)

#### Axios インスタンス (`src/utils/axios.ts`)

すべてのAPI関数はこの単一インスタンスを使う。`axios.create` を画面ごとに再度呼ぶとインターセプターが欠落する。

```ts
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth'
import { showErrorToast } from '@/utils/toast'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,    // env-config 参照
  timeout: 20_000,                                // 20s
  withCredentials: true,                          // httpOnly クッキー(refresh) 送信
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',                 // Spring Security CSRF マッチング
})

/* ── Request: Access Token 自動付与 ───────────────────────── */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.set('Authorization', `Bearer ${auth.accessToken}`)
  }
  return config
})

/* ── Response: アンラップ + 401更新 + グローバルエラー ──────────────────── */
let refreshing: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res.data,                              // .data 自動アンラップ
  async (error: AxiosError<any>) => {
    const { response, config } = error
    if (!response) {
      showErrorToast('ネットワーク接続を確認してください。')
      return Promise.reject({ code: 'NETWORK', message: 'ネットワークエラー' })
    }

    // 401 → refresh 1回試行 (同時401多発時は一度だけ更新)
    if (response.status === 401 && !(config as any)._retried) {
      (config as any)._retried = true
      const auth = useAuthStore()
      refreshing ??= auth.refresh()
      const newToken = await refreshing.finally(() => { refreshing = null })
      if (newToken) {
        config!.headers!.set('Authorization', `Bearer ${newToken}`)
        return api.request(config!)
      }
      auth.logout()
      return Promise.reject({ code: 'AUTH_EXPIRED', message: 'もう一度ログインしてください。' })
    }

    // 5xx だけグローバルトースト、4xx は呼び出し元が処理
    if (response.status >= 500) {
      showErrorToast('一時的なサーバーエラーです。しばらくしてからもう一度お試しください。')
    }
    return Promise.reject(response.data ?? { code: 'UNKNOWN', message: 'エラー' })
  }
)

export default api
```

> ⚠️ インターセプターで `response.data` をアンラップしたので呼び出し元で `.data` を再度アクセスしないこと。型定義もレスポンスペイロードそのまま。

#### API関数の作成ルール

ドメイン別ファイルに分離。関数名は `<動詞><名詞>Api` サフィックス。**`try-catch` でただ rethrow しないこと**(意味なし、インターセプターで十分)。

```ts
// src/api/sensorApi.ts
import api from '@/utils/axios'
import type { SensorReading, CreateSensorPayload } from '@/types/sensor'

export const getSensorsApi = (deckId: string) =>
  api.get<unknown, SensorReading[]>('/api/v1/sensors', { params: { deckId } })

export const getSensorApi = (id: string) =>
  api.get<unknown, SensorReading>(`/api/v1/sensors/${id}`)

export const createSensorApi = (payload: CreateSensorPayload) =>
  api.post<unknown, SensorReading>('/api/v1/sensors', payload)
```

#### `useApi` Composable (リアクティブ呼び出し用)

VueUse `useAsyncState` の薄いラッパー。コンポーネント内でローディング/エラー状態が一緒に必要なとき。

```ts
// src/composables/useApi.ts
import { ref, type Ref } from 'vue'

export interface UseApiResult<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<{ code: string; message: string } | null>
  execute: (...args: any[]) => Promise<T | null>
}

export function useApi<T>(
  fn: (...args: any[]) => Promise<T>,
  options: { immediate?: boolean } = {}
): UseApiResult<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<{ code: string; message: string } | null>(null)

  const execute = async (...args: any[]) => {
    loading.value = true
    error.value = null
    try {
      data.value = await fn(...args)
      return data.value
    } catch (e: any) {
      error.value = { code: e?.code ?? 'UNKNOWN', message: e?.message ?? 'エラー' }
      return null
    } finally {
      loading.value = false
    }
  }

  if (options.immediate) void execute()
  return { data, loading, error, execute }
}
```

使用 (`<script setup>`):
```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { getSensorsApi } from '@/api/sensorApi'
import { useApi } from '@/composables/useApi'

const props = defineProps<{ deckId: string }>()
const { data: sensors, loading, error, execute } = useApi(() => getSensorsApi(props.deckId))
onMounted(execute)
</script>

<template>
  <v-progress-circular v-if="loading" indeterminate />
  <v-alert v-else-if="error" type="error">
    {{ error.message }}
    <v-btn @click="execute">もう一度試す</v-btn>
  </v-alert>
  <SensorList v-else :items="sensors ?? []" />
</template>
```

#### グローバルエラー処理の原則

エラー表示位置の分担(ネットワーク・5xx=グローバル、4xx=呼び出し画面のインライン)は本文 §2-6 の表をそのまま従う。上記のインターセプターコードがそのマッピングを実装したものである。
