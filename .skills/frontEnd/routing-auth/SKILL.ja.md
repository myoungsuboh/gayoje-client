---
name: ルーティング認証/認可標準 (Routing Auth & Authorization)
description: クライアントルーティングで認証・認可を扱う汎用標準 — ルートガードでの一括検査、公開パスの単一管理、トークンの永続保存の回避、アクセスログの非同期化、クライアント認可の不信・サーバー再検証。特定のフレームワーク/ルーターに依存しない。ルートを追加したり、認証/認可ガード・トークン処理を実装・整備したりするときに読む。キーワード: routing, route guard, auth, authorization, RBAC, public routes, token storage, server-side authorization.
rules:
  - "認証・認可はルートガードで一括処理する: 画面遷移前に一箇所(グローバルナビゲーションガード)で、認証済みか → 認証必須ルートか → ロール/権限の順に検査する。画面ごとに即席の検査を散らさない。"
  - "公開パスは単一の出典で管理する: 認証が不要なパス(ログイン・規約・エラーなど)は一箇所で定義し、ガードはそれだけを参照する。同じ情報をガードと画面メタに二重に置かない。"
  - "アクセストークンは永続ストレージに置かない: アクセストークン(access token)はlocalStorageなどの永続ストレージ・ディスクに保存せず、メモリにのみ置く。ただし、メモリ保持はXSSの*露出面*を減らすだけで安全を保証しないため(ランタイムのトークンも窃取され得る)、短い有効期限・httpOnlyクッキーオプションも併せて検討する。再認証はサーバー側の秘密(例: httpOnlyクッキーのリフレッシュトークン)で再発行する。"
  - "アクセスログは非同期で(fire-and-forget): 画面遷移成功後にアクセスログを非同期で送り、失敗は無視する。ログ送信が画面遷移を妨げたり遅くしたりしない。"
  - "クライアント認可の判定は信頼しない: ガード・画面の認可分岐はUX(メニュー・ボタン表示)用にすぎない。実際の強制はサーバーがすべてのリクエストで再検証する。クライアントは回避可能だと仮定する。"
  - "認可分岐はルートとコンポーネントの両方に: ルートガードだけで防ぐと画面内の危険な操作がそのまま露出し、コンポーネントだけで防ぐとURL直接入力で回避される。両方に置く(そして最終強制はサーバー)。"
tags:
  - "routing"
  - "route guard"
  - "auth"
  - "authorization"
  - "RBAC"
  - "public routes"
  - "token storage"
  - "server-side authorization"
  - "vue-router"
  - "router.push"
  - "router-link"
  - "beforeEach"
  - "useRouter"
  - "createRouter"
  - "meta.requiresAuth"
---

# 🔐 ルーティング認証/認可標準 (Routing Auth & Authorization)

> クライアントルーティングで認証と認可を一箇所(ルートガード)で一括処理し、公開パスを単一の出典で管理し、トークンを永続ストレージに置かず、アクセスログは非同期で流し、クライアント認可の判定をセキュリティの根拠としない。ルートを追加したり、認証/認可ガード・トークン処理・アクセスログを実装・整備したりするときに読む。特定のフレームワーク/ルーターに依存しない汎用標準である。
>
> 関連スキル:
> - トークン保存/CSRF: security-frontend
> - 401自動更新・認証リクエスト規約: api-standard
> - 認証状態の保存: state-management
> - サーバー側の認可強制: security-backend

## 1. 基本原則
- **認証・認可はルートガードで一括処理する**: 画面遷移前に一箇所(グローバルナビゲーションガード)で、認証済みか → 認証必須ルートか → ロール/権限の順に検査する。画面ごとに即席の検査を散らさない。
- **公開パスは単一の出典で管理する**: 認証が不要なパス(ログイン・規約・エラーなど)は一箇所で定義し、ガードはそれだけを参照する。同じ情報をガードと画面メタに二重に置かない。
- **アクセストークンは永続ストレージに置かない**: アクセストークン(access token)は `localStorage` などの永続ストレージ・ディスクに保存せず、メモリにのみ置く。ただし、メモリ保持はXSSの*露出面*を減らすだけで安全を保証しないため(ランタイムのトークンも窃取され得る)、短い有効期限・httpOnlyクッキーオプションも併せて検討する。再認証はサーバー側の秘密(例: httpOnlyクッキーのリフレッシュトークン)で再発行する。
- **アクセスログは非同期で(fire-and-forget)**: 画面遷移成功後にアクセスログを非同期で送り、失敗は無視する。ログ送信が画面遷移を妨げたり遅くしたりしない。
- **クライアント認可の判定は信頼しない**: ガード・画面の認可分岐はUX(メニュー・ボタン表示)用にすぎない。実際の強制はサーバーがすべてのリクエストで再検証する。クライアントは回避可能だと仮定する。
- **認可分岐はルートとコンポーネントの両方に**: ルートガードだけで防ぐと画面内の危険な操作がそのまま露出し、コンポーネントだけで防ぐとURL直接入力で回避される。両方に置く(そして最終強制はサーバー)。

## 2. ルール

### 2-1. 認証・認可はルートガードで一括検査
- 画面遷移前にグローバルガードで検査順序を固定する: ①(トークンがなければ)再認証を1回試行 → ② 認証必須ルートなのに未認証ならログインへ → ③ 要求ロール/権限を満たさなければエラー/拒否画面へ。
- 未認証で防ぐときは、元々向かおうとしたパスをredirectパラメータで渡し、ログイン後に復帰させる。

```text
// ❌ 禁止 — 画面ごとに即席の認証/認可検査が散らばる
screen Dashboard:
  if not loggedIn: goto Login        // 画面ごとにコピペ
screen Admin:
  if not loggedIn: goto Login
  if not isAdmin:  goto Error        // 漏れ/不一致が頻発

// ✅ 推奨 — グローバルガード一箇所で順序を固定
onBeforeNavigate(to):
  if to is not public and not authenticated:
    if not tryReauthenticateOnce(): return redirectTo(Login, { redirect: to })
  if to.requiresAuth and not authenticated:
    return redirectTo(Login, { redirect: to })
  if to.requiredRoles and not user.hasAnyRole(to.requiredRoles):
    return redirectTo(Forbidden)
  return allow
```

### 2-2. 公開パスは単一の出典で管理
- 認証免除パスの一覧を一箇所(定数/設定)に定義し、ガードはそれだけを参照する。
- 同じ「公開/非公開」情報をガード一覧と画面メタの両方に置かない — 両者が食い違うと同期が崩れてセキュリティホールが生じる。

```text
// ✅ 推奨 — 一箇所でのみ定義
PUBLIC_ROUTES = [ "/login", "/error", "/terms", "/privacy" ]
isPublic(path) = PUBLIC_ROUTES.contains(path)

// ❌ 禁止 — ガード一覧と画面メタに二重定義 → 同期が崩れる
PUBLIC_ROUTES = [ "/login", "/terms" ]
screen Privacy: meta.public = true        // 一覧にない → 不一致
```

### 2-3. アクセストークンは永続ストレージに置かない (XSS露出面の縮小)
- アクセストークンはメモリ(ランタイム状態)にのみ置く。永続状態として保持すべきなのはトークンではなく、非機微な識別/表示情報(ユーザー識別子・ロール表示など)だけである。
- **メモリ保持は「XSS安全」ではない。** `localStorage` などの永続保存の回避はXSSの*露出面*(リロード後も残るトークン・他タブからのアクセス)を減らすだけで、ランタイムメモリのトークンも注入されたスクリプトで窃取され得る。したがって、**短い有効期限(short-lived access token)**と**httpOnlyクッキーでトークンをそもそもJSから読めなくするオプション**も併せて検討する。 → security-frontend, api-standard
- リロードなどでメモリが空になったら、サーバー側の秘密(例: httpOnlyクッキーのリフレッシュトークン)で再発行して復旧する。トークン自体をディスクに永続化しない。

```text
// ❌ 禁止 — アクセストークンを永続ストレージに保存 (XSS露出面の拡大 + 他タブからのアクセス)
persist(state.accessToken)
localStorage.set("accessToken", token)

// ✅ 推奨 — トークンはメモリにのみ(露出面の縮小)、永続は非機微情報のみ
state.accessToken = token                 // メモリ — XSSで依然窃取可能、短い有効期限で補う
persist([ state.userId, state.roles ])    // トークンは除外
reauthenticate(): token = serverRefresh() // httpOnlyクッキーベースの再発行
```

### 2-4. アクセスログは非同期で(fire-and-forget)
- 画面遷移が「成功」した場合にのみログを残し、送信は非同期で送り、失敗は無視する。
- ログ送信結果を待って画面遷移を妨げない。

```text
// ❌ 禁止 — 同期ログが画面遷移を遅延させる
onNavigated(to):
  await sendAccessLog(to)     // 遷移ごとに待機 → 遅くなる

// ✅ 推奨 — 成功した遷移のみ、非同期 fire-and-forget
onNavigated(to, from, failure):
  if failure: return
  sendAccessLog({ path: to, from }).ignoreErrors()
```

### 2-5. クライアント認可の判定は信頼しない — サーバー再検証
- ガード・コンポーネントの認可分岐はメニュー/ボタン表示などUX目的にすぎない。
- すべての保護リソースはサーバーがリクエストごとに認可を再検証する。クライアント認可検査は回避可能だと仮定する。 → security-backend

```text
// ✅ 推奨 — クライアントはUX用分岐、強制はサーバー
client: if user.hasRole("OPERATOR"): showButton(EmergencyStop)
server: on /emergency-stop: assertRole(req.user, "OPERATOR")  // 本当の強制

// ❌ 禁止 — クライアントが隠したからサーバーは通す
server: on /emergency-stop: execute()   // 認可の再検証なし → URL/スクリプトで回避
```

### 2-6. 認可分岐はルートとコンポーネントの両方に
- ルート遷移はガードで、画面内の危険な操作/要素はコンポーネントレベルの分岐で併せて防ぐ。
- どちらか一方だけ置くと回避される(コンポーネントのみ → URL直接入力、ガードのみ → 画面内の危険な操作が露出)。最終強制は常にサーバー。

```text
// ✅ 推奨 — ルートガード + コンポーネント分岐 (+ サーバー強制)
route Admin:        guard requires role ADMIN
component DangerBtn: render only if user.hasRole("OPERATOR")

// ❌ 禁止 — コンポーネントでのみ隠す
// ガードなし → /admin URL直接入力で画面遷移が可能
```

### 2-7. 認証状態の遷移時の後始末 (ログアウト・セッション終了)
- ログアウト時に画面移動だけで済ませず、認証状態(トークン・ロール・権限など)を必ず初期化する。
- 後始末を漏らすと、同じ端末の次のユーザーに以前の権限が残って漏れる。

```text
// ❌ 禁止 — 移動だけして状態が残る → 権限漏れ
logout(): goto Login

// ✅ 推奨 — 状態初期化後に移動
logout(): serverLogout().ignoreErrors(); resetAuthState(); goto Login
```

## 3. よくある間違い
- **認証/認可検査を画面ごとに散らす** → 漏れ・不一致が頻発する。グローバルガード一箇所で順序を固定する。
- **認可をコンポーネントでのみ検査** → URL直接入力でルート遷移が回避される。ルートガードも併せて置く。
- **認可をガード/クライアントでのみ強制** → クライアントは回避可能。サーバーがすべてのリクエストで再検証する。
- **アクセストークンを永続ストレージ(localStorageなど)に保存** → リロード後も残り、他タブから読まれてXSS露出面が広がる。トークンはメモリにのみ置き(露出面の縮小、安全保証ではない)短い有効期限・httpOnlyクッキーを併用する。
- **再認証試行を非同期で待たない** → リロード直後、トークン復旧前に未認証として誤って弾かれる。再認証を1回待ってから判断する。
- **アクセスログを同期で送信** → 画面遷移が遅くなる。成功した遷移のみ非同期 fire-and-forget で。
- **公開パスを二箇所に定義** → ガード一覧と画面メタが食い違い同期が崩れる。単一の出典で管理する。
- **ログアウト時の状態初期化漏れ** → 次のユーザーに権限が漏れる。トークン・ロール・権限を初期化する。

## 4. チェックリスト
- [ ] 認証・`requiresAuth`・ロール/権限をグローバルルートガードで**定められた順序**で一括検査しているか
- [ ] 未認証で防ぐとき、元のパスをredirectで渡してログイン後に復帰させるか
- [ ] 公開(認証免除)パスを**単一の出典**一箇所でのみ管理しているか
- [ ] アクセストークンを**永続ストレージ/ディスクに保存せず**メモリにのみ置くか(永続は非機微情報のみ)
- [ ] リロードなどでメモリ消失時にサーバー側の秘密で再認証して復旧するか
- [ ] アクセスログを成功した遷移に限り**非同期 fire-and-forget**で送るか
- [ ] 認可分岐をルートガードとコンポーネントの**両方**に置いたか
- [ ] クライアント認可の判定を信頼せず**サーバーがすべてのリクエストで再検証**する前提を維持しているか
- [ ] ログアウト/セッション終了時に認証状態(トークン・ロール・権限)を**初期化**するか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: React Router, Next.js middleware, Angular Guard など)に合わせた例を同じパターンで追加する。上記1~4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Vue 3 (Vue Router + Pinia)

`unplugin-vue-router` の自動ルーティングとPiniaベースの認証・認可ガードで上記原則を実装した例である。

#### 自動ルーティング (`unplugin-vue-router`)

`src/pages/` 配下のファイル構造 = URLパス。別途 `routes` 配列の作成は不要。

```
src/pages/
├── index.vue                     →  /
├── login.vue                     →  /login
├── dashboard.vue                 →  /dashboard
├── sensors/
│   ├── index.vue                 →  /sensors
│   └── [id].vue                  →  /sensors/:id
└── admin/
    └── users.vue                 →  /admin/users          (metaで権限制限)
```

**ページ別メタ (route block)**:
```vue
<!-- src/pages/admin/users.vue -->
<route lang="yaml">
meta:
  requiresAuth: true
  layout: admin
  roles: [ADMIN, OPERATOR]
</route>

<script setup lang="ts">
// 画面ロジック
</script>
```

レイアウトは `vite-plugin-vue-layouts` の `virtual:generated-layouts` から `meta.layout` でマッチング。

#### Pinia Auth Store (`src/stores/auth.ts`)

```ts
import { defineStore } from 'pinia'
import { refreshTokenApi, logoutApi } from '@/api/authApi'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    userId: null as string | null,
    roles: [] as string[],          // ex) ['ADMIN', 'OPERATOR']
    permissions: [] as string[],    // ex) ['sensor.read', 'control.write']
  }),

  getters: {
    isAuthenticated: (s) => !!s.accessToken,
    hasRole: (s) => (role: string) => s.roles.includes(role),
    hasAnyRole: (s) => (roles: string[]) => roles.some((r) => s.roles.includes(r)),
  },

  actions: {
    async refresh(): Promise<string | null> {
      try {
        const { accessToken } = await refreshTokenApi()    // refreshTokenはhttpOnly cookieで自動送信
        this.accessToken = accessToken
        return accessToken
      } catch {
        this.$reset()
        return null
      }
    },
    async logout() {
      await logoutApi().catch(() => {})
      this.$reset()
    },
  },

  persist: {                                                // pinia-plugin-persistedstate
    paths: ['userId', 'roles', 'permissions'],              // accessTokenは絶対にpersist禁止
  },
})
```

> ⚠️ `accessToken` を localStorage に persist しないこと(§2-3)。persist回避は露出面を減らすだけなので、短い有効期限・httpOnlyクッキーも併せて。 → security-frontend §2

#### ナビゲーションガード (`src/router/guards.ts`)

```ts
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { storeAccessLogApi } from '@/api/logApi'

const PUBLIC_ROUTES = ['/login', '/error', '/terms', '/privacy']

export function setupGuards(router: Router) {
  /* ── beforeEach: 認証 + 認可 ─────────────────────────────── */
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const isPublic = PUBLIC_ROUTES.includes(to.path)

    // 1) トークンがなければ refresh を1回試行 (リロード直後のケース)
    if (!auth.isAuthenticated && !isPublic) {
      const token = await auth.refresh()
      if (!token) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }

    // 2) requiresAuth ガード
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 3) ロールベースの認可
    const requiredRoles = (to.meta.roles ?? []) as string[]
    if (requiredRoles.length > 0 && !auth.hasAnyRole(requiredRoles)) {
      return { path: '/error', query: { code: 'FORBIDDEN' } }
    }

    return true
  })

  /* ── afterEach: 成功したナビゲーションのみアクセスログ ────────────── */
  router.afterEach((to, from, failure) => {
    if (failure) return
    storeAccessLogApi({
      path: to.fullPath,
      from: from.fullPath,
      ts: new Date().toISOString(),
    }).catch(() => { /* ログ失敗は無視 — UX影響なし */ })
  })

  /* ── onError: チャンク読み込み失敗時に強制リロード ─────────────── */
  router.onError((err) => {
    if (/Loading chunk .* failed/i.test(err?.message ?? '')) {
      window.location.reload()
    }
  })
}
```

**main.ts 登録**:
```ts
import { setupGuards } from '@/router/guards'
const router = createRouter({ history: createWebHistory(), routes })
setupGuards(router)
```

#### 認証例外 (公開パス)

上記 `PUBLIC_ROUTES`(guards.ts)が§2-2の単一の出典である。さらに、ログインページですでに認証済みのユーザーは `/dashboard` などへ即座にリダイレクト:
  ```ts
  router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.path === '/login' && auth.isAuthenticated) return '/dashboard'
  })
  ```

#### 認可検査 — コンポーネントレベル (`v-if`)

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<template>
  <v-btn v-if="auth.hasRole('OPERATOR')" color="error" @click="triggerEsd">
    緊急遮断 (ESD)
  </v-btn>
</template>
```

> バックエンドは絶対にクライアントの認可チェックを信頼しないこと — すべてのAPIで再検証。 → security-backend §2
