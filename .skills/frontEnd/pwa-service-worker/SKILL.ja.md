---
name: PWA & Service Worker 標準
description: インストール可能条件・リソース別キャッシュ戦略(Precache/CacheFirst/NetworkFirst)・キャッシュ禁止対象・更新UX・manifestを扱うPWAとService Workerの汎用Web標準で、特定のビルドツール/フレームワークに依存しない。PWAインストール・オフライン・キャッシュを適用する、更新通知・manifestを点検する、ネイティブラッパーと併用するときに読む。
rules:
  - "インストール可能条件を満たす: 有効なweb app manifest(必須フィールド・アイコンを含む)、セキュアコンテキスト(HTTPSまたはlocalhost)、登録されたService Worker — この3つがインストール可能PWAの最小条件である。"
  - "リソース種別に合ったキャッシュ戦略を選ぶ: 変わらない静的リソースはPrecache、ほとんど変わらない外部リソースはCacheFirst、最新性が重要なデータはNetworkFirst。1つの戦略をすべてのリソースに一律適用しない。"
  - "絶対にキャッシュしてはいけないものをキャッシュしない: 状態を変える要求(POST/PUT/DELETEなど非冪等要求)、認証/パーソナライズされた応答、エントリHTML文書を誤ってキャッシュすると、データ整合性・セキュリティ・デプロイ反映が壊れる。"
  - "更新はユーザーの作業を守りながら適用する: 新バージョン検知時に進行中の作業を断つ強制reloadではなく、ユーザーが選択できる通知(prompt)方式を基本とする。"
  - "オフラインを一級の状態として扱う: オフライン時に空画面ではなくフォールバックUIを見せ、ネットワークが必要な変更(書き込み)はキューに溜めてオンライン復帰時に同期する。"
  - "Service Workerの動作範囲を理解する: SWはセキュアコンテキスト(HTTPS/localhost)でのみ動作する。ネイティブラッパー(ハイブリッドアプリ)のようにfile:///カスタムスキームで配信される環境ではSWが動作しないため、その経路では分離/無効化する。"
  - "計測で検証する: キャッシュヒット率・オフライン動作・インストール可能性を標準ツール(例: Lighthouse PWA監査、ブラウザ開発者ツールのApplicationパネル)で確認する。"
tags:
  - "service-worker"
  - "workbox"
  - "manifest.json"
  - "navigator.serviceWorker"
  - "vite-plugin-pwa"
  - "registerSW"
---

# 📱 PWA & Service Worker 標準

> PWAを適用すると (1) ホーム画面インストール、(2) オフライン対応、(3) 静的リソースのキャッシュによる初期読み込み高速化が可能になる。要点は「何をどの戦略でキャッシュし、何は絶対にキャッシュせず、新バージョンをユーザーにどう安全に適用するか」である。PWA・キャッシュ・オフラインを実装する、更新通知・manifestを点検する、ネイティブラッパー(ハイブリッド)と併用するときに読む。特定のビルドツール/フレームワークに依存しないWeb標準ベースの標準である。
>
> 関連スキル: `vite-browser-compatibility`(ビルド/ブラウザ互換性)、`env-config`(環境設定)、`project-structure`(モバイル/ネイティブ分岐)。

## 1. 基本原則

- **インストール可能条件を満たす**: 有効なweb app manifest(必須フィールド・アイコンを含む)、セキュアコンテキスト(HTTPSまたは`localhost`)、登録されたService Worker — この3つがインストール可能PWAの最小条件である。
- **リソース種別に合ったキャッシュ戦略を選ぶ**: 変わらない静的リソースはPrecache、ほとんど変わらない外部リソースはCacheFirst、最新性が重要なデータはNetworkFirst。1つの戦略をすべてのリソースに一律適用しない。
- **絶対にキャッシュしてはいけないものをキャッシュしない**: 状態を変える要求(POST/PUT/DELETEなど非冪等要求)、認証/パーソナライズされた応答、エントリHTML文書を誤ってキャッシュすると、データ整合性・セキュリティ・デプロイ反映が壊れる。
- **更新はユーザーの作業を守りながら適用する**: 新バージョン検知時に進行中の作業を断つ強制reloadではなく、ユーザーが選択できる通知(prompt)方式を基本とする。
- **オフラインを一級の状態として扱う**: オフライン時に空画面ではなくフォールバックUIを見せ、ネットワークが必要な変更(書き込み)はキューに溜めてオンライン復帰時に同期する。
- **Service Workerの動作範囲を理解する**: SWはセキュアコンテキスト(HTTPS/`localhost`)でのみ動作する。ネイティブラッパー(ハイブリッドアプリ)のように`file://`/カスタムスキームで配信される環境ではSWが動作しないため、その経路では分離/無効化する。
- **計測で検証する**: キャッシュヒット率・オフライン動作・インストール可能性を標準ツール(例: Lighthouse PWA監査、ブラウザ開発者ツールのApplicationパネル)で確認する。

## 2. ルール

### 2-1. manifestの必須項目をすべて埋める

インストール可能PWAになるには、web app manifestに以下のフィールドとアイコンが必要である。1つでも欠けるとインストールプロンプトが表示されないか、ホーム画面表示が壊れる。

| フィールド | 必須 | 備考 |
|---|---|---|
| `name`, `short_name` | ✅ | short_nameはホーム画面ラベル(短く — 推奨: 約12文字以内、プラットフォーム/言語別に調整) |
| `start_url` | ✅ | インストール後の開始経路 |
| `display` | ✅ | `standalone`推奨(アプリのように見える) |
| `theme_color` | ✅ | ステータスバー/ツールバー色 |
| `background_color` | ✅ | スプラッシュ背景 |
| `icons` | ✅ | 192/512 + **maskable**バリエーション推奨 |
| `orientation` | △ | 方向固定が必要なときのみ |

```text
// ❌ maskableアイコンなし → 一部プラットフォームで白背景に小さく表示
icons: [ 192, 512 ]

// ✅ 通常 + maskableバリエーションを併せて提供
icons: [ 192, 512, 512(purpose: maskable) ]
```

### 2-2. リソース種別ごとにキャッシュ戦略を区別する

リソースの変更頻度と最新性要求に応じて戦略を異なって適用する。

| リソース | 戦略 | 説明 |
|---|---|---|
| 静的(アプリコード/スタイル/画像) | **Precache** | ビルド成果物を事前にキャッシュ、オフラインでも読み込み |
| ほとんど変わらない外部リソース(例: 地図タイル・フォント) | **CacheFirst** | キャッシュ優先 + 有効期限(TTL)・最大件数制限 |
| 最新性が重要な読み取りAPI(GET) | **NetworkFirst** | ネットワーク優先、失敗時はキャッシュfallback、タイムアウト設定 |
| エントリHTML文書 | **NetworkFirst** | 新しいデプロイが即座に反映されるように |

```text
// ✅ リソース別に戦略を分ける
static assets        → Precache
map tiles / fonts    → CacheFirst (TTL, maxEntries)
read API (GET)       → NetworkFirst (timeout, fallback)
entry HTML document  → NetworkFirst
```

### 2-3. 絶対にキャッシュしてはいけないものを明示的に除外する

- 状態を変える非冪等要求(POST/PUT/DELETEなど)はキャッシュしない — キャッシュされた応答が再生されるとデータが壊れる。
- 認証トークンが乗る、またはユーザーごとに異なる応答はキャッシュしない — 他のユーザーに露出する危険。
- エントリHTML文書をCacheFirstにしない — 新しいデプロイが永遠に反映されない。

```text
// ❌ 禁止 — 整合性・セキュリティ・デプロイ反映が壊れるキャッシュ
POST /api/orders        → キャッシュ
GET  /api/me (認証)     → CacheFirst
index.html              → CacheFirst

// ✅ 推奨 — 明示的にキャッシュ除外(ネットワーク専用)
POST/PUT/DELETE         → キャッシュしない (NetworkOnly)
認証/パーソナライズ応答 → キャッシュしない
index.html              → NetworkFirst
```

### 2-4. 更新はユーザー選択型(prompt)を基本とする

- 新バージョンが検知されたらユーザーに知らせ、彼が望むときに適用する(例: 「新バージョンがあります → 更新」アクション)。
- 進行中の入力/作業を断つ自動強制reloadは作業損失を招くため、デフォルト値として使わない。

```text
// ❌ 自動強制更新 → 進行中の作業の途中でreload、入力損失
on new version: reload now

// ✅ prompt方式 → 通知後にユーザーが適用タイミングを選択
on new version: show "更新" 通知 → ユーザークリック時に適用後reload
```

### 2-5. オフラインをフォールバックUI + 同期キューで扱う

- オフライン時に空画面/エラーではなく「オフラインモード」フォールバックUIを見せ、ユーザーが状態を認識できるようにする。
- ネットワークが必要な書き込み作業は即座に失敗させず、キューに保存してオンライン復帰時に自動同期する。
- ネットワークなしでも可能な機能(例: 端末センサー・GPS・ローカル計算)はオフラインでも動作し続けるよう設計する。

```text
// ✅ オフライン状態検知 → フォールバック + キュー → 復帰時に同期
online=false → "オフラインモード" バナー + 書き込み作業を同期キューに積載
online=true  → キューを空にしながらサーバーへ送信
```

### 2-6. ネイティブラッパー(ハイブリッド)併用時にSWを分離する

- Service Workerはセキュアコンテキスト(HTTPSまたは`localhost`)でのみ動作する。
- 静的ファイルをアプリバンドルに含めて`file://`/カスタムスキームで配信するネイティブラッパー環境ではSWが動作しない → そのビルド/実行経路ではPWA登録を分離または無効化する。

```text
// ✅ 配信環境(スキーム)に応じてSW登録を分岐
if (セキュアコンテキスト = Web/HTTPS):  SW登録
else (ネイティブラッパー/ファイルスキーム): SW無効 (登録スキップ)
```

### 2-7. インストール可能性とキャッシュ動作を計測する

- インストール可能条件・オフライン動作・アイコン/manifestは標準PWA監査ツール(例: Lighthouse PWAカテゴリ)で点検する。
- キャッシュヒット率を観測して戦略が意図どおり動作しているか確認する(ヒット率が異常に低ければ戦略を再検討)。
- ブラウザ開発者ツールのApplicationパネルでService Worker登録/manifest/Storageを検証する。

```text
// ✅ インストール可能最小条件チェック
[ ] 有効なmanifest(必須フィールド + アイコン)
[ ] セキュアコンテキスト(HTTPSまたはlocalhost)
[ ] 登録されたService Worker、オフライン時に応答
```

## 3. よくある間違い

- ❌ **状態変更要求(POST/PUT/DELETE)のキャッシュ** → キャッシュされた応答の再生でデータ整合性が破壊される。
- ❌ **認証/パーソナライズ応答のキャッシュ** → 他のユーザーに露出する危険。
- ❌ **エントリHTMLをCacheFirst** → 新しいデプロイが絶対に反映されない。
- ❌ **すべてのリソースに1つの戦略を一律適用** → 最新性が必要なデータまでキャッシュに閉じ込められる。
- ❌ **自動強制更新(reload)** → 進行中の作業の途中でreloadしユーザー入力が損失。
- ❌ **maskableアイコンの欠落** → 一部プラットフォームのホーム画面で小さく/白背景で表示。
- ❌ **manifest必須フィールドの欠落** → インストールプロンプトが表示されない。
- ❌ **セキュアコンテキストでない場所/ネイティブラッパーにSWを含める** → 動作せずコンソールエラーだけが残る。
- ❌ **オフライン未考慮** → ネットワークが切れると空画面、書き込み作業がそのまま消失。

## 4. チェックリスト

- [ ] manifestのすべての必須フィールド(name/short_name/start_url/display/theme_color/background_color/icons)を埋めたか
- [ ] 192/512 + maskableアイコンをすべて提供したか
- [ ] リソース種別ごとのキャッシュ戦略(Precache/CacheFirst/NetworkFirst)を正しく区別して適用したか
- [ ] 状態変更(非冪等)要求・認証/パーソナライズ応答・エントリHTMLを誤ってキャッシュしていないか
- [ ] 新バージョン適用をユーザー選択型(prompt)で安全に処理したか
- [ ] オフラインフォールバックUIと書き込み作業の同期キューを備えたか
- [ ] セキュアコンテキスト(HTTPS/localhost)条件を満たし、ネイティブラッパー経路ではSWを分離/無効化したか
- [ ] インストール可能性・キャッシュヒット率を標準ツール(例: Lighthouse PWA監査、開発者ツールApplicationパネル)で検証したか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(ビルドツール・フレームワーク・UIライブラリ)に合った例を同じパターンで追加する。上記1〜4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Vite (vite-plugin-pwa) + Vue

`vite-plugin-pwa`でmanifest・Service Worker(Workboxベース)を生成し、`virtual:pwa-register/vue`で更新通知を、Vuetifyコンポーネントで通知/バナーUIを構成した例。ネイティブラッパーはCapacitor基準。

#### インストール & 基本設定

```bash
npm install -D vite-plugin-pwa
```

```js
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',           // 'autoUpdate' | 'prompt' (ユーザー通知)
      injectRegister: 'auto',
      manifest: {
        name: 'Running Crow',
        short_name: 'RunCrow',
        description: '실시간 GPS 러닝 트래커',
        theme_color: '#fb8c00',
        background_color: '#121212',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dashboard',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.maptiler\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maptiler-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 }
            }
          },
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 }
            }
          }
        ]
      }
    })
  ]
})
```

#### 絶対にキャッシュしてはいけないパターン

```js
// 認証APIなどはネットワーク専用
{
  urlPattern: /\/api\/auth\//,
  handler: 'NetworkOnly'
}
```

#### 更新通知UX (`registerType: 'prompt'`)

```vue
<!-- App.vue -->
<template>
  <v-snackbar v-model="needRefresh" :timeout="-1" color="primary">
    새 버전이 있습니다.
    <template #actions>
      <v-btn variant="text" @click="updateApp">업데이트</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(swUrl, r) { console.log('SW registered', swUrl) },
  onRegisterError(err) { console.error('SW error', err) }
})

function updateApp() {
  updateServiceWorker(true)  // skipWaiting + reload
}
</script>
```

自動更新(`'autoUpdate'`)はユーザーに意図しないreloadを引き起こすことがあるため、`'prompt'`が安全である。

#### オフラインフォールバック

```vue
<template>
  <v-banner v-if="!online" color="warning" icon="mdi-wifi-off">
    오프라인 모드 — 일부 기능이 제한됩니다.
  </v-banner>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const online = ref(navigator.onLine)
const onChange = () => online.value = navigator.onLine
onMounted(() => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
})
onUnmounted(() => {
  window.removeEventListener('online', onChange)
  window.removeEventListener('offline', onChange)
})
</script>
```

位置トラッキングはオフラインでも動作すべきである — GPSはインターネットなしでも可能。ランニング終了後に同期キューに保存 → オンライン復帰時に自動アップロード。

#### Capacitorとの併用上の注意事項

Capacitorビルドは静的ファイルをアプリバンドルに含め、`capacitor://localhost`または`file://`スキームで配信する。**Service Workerは`https://`または`http://localhost`スキームでのみ動作**する。

```js
// vite.config.js — Capacitorビルド時にPWA無効
import { VitePWA } from 'vite-plugin-pwa'

const isCapacitorBuild = process.env.BUILD_TARGET === 'capacitor'

export default defineConfig({
  plugins: [
    vue(),
    !isCapacitorBuild && VitePWA({ /* ... */ })
  ].filter(Boolean)
})
```

```json
// package.json
"scripts": {
  "build:web": "vite build",
  "build:capacitor": "BUILD_TARGET=capacitor vite build && cap sync"
}
```

またはService Worker登録時にCapacitor環境を検知してスキップ:

```js
import { Capacitor } from '@capacitor/core'

if (!Capacitor.isNativePlatform()) {
  // PWA登録
}
```

#### 開発環境でのPWAデバッグ

```js
VitePWA({
  devOptions: {
    enabled: true,   // devサーバーでもSW有効化
    type: 'module'
  }
})
```

Chrome DevTools → Application → Service Workers / Manifest / Storage で検証。

#### 計測(キャッシュヒット率)

```js
// SWで処理したfetch比率を計測 (キャッシュヒット率)
navigator.serviceWorker.addEventListener('message', (e) => {
  if (e.data.type === 'CACHE_HIT') metrics.cacheHit++
  if (e.data.type === 'CACHE_MISS') metrics.cacheMiss++
})
```

ヒット率の基準線(例: 60%)をプロジェクト特性に合わせて定め、それより低ければキャッシュ戦略を再検討する。(数値は例 — リソース構成・トラフィックパターンに応じて調整)
