---
name: フロントエンドセキュリティ (Security Frontend)
description: Vue 3 + Vuetify環境におけるフロントエンドセキュリティ標準です。XSS/CSRF防御、トークン保存戦略、CSP、外部リンク、環境変数のsecret、依存関係監査を扱い、セキュリティ関連のコードを書く・点検するときに読みます。キーワード XSS, CSRF, DOMPurify, CSP, httpOnly, npm audit。
rules:
  - "v-htmlは信頼できない入力に絶対に使用禁止。必要な場合は必ずDOMPurifyでsanitizeする。"
  - "refresh tokenはhttpOnly+Secure+SameSite=Strictクッキー、access tokenはメモリ（Pinia）のみに保管する。"
  - "CSPヘッダーはサーバーで発行し、unsafe-inlineスクリプトは絶対に許可禁止。"
  - "VITE_接頭辞の変数はすべてクライアントバンドルに含まれるためsecret禁止。"
  - "CIでnpm audit --audit-level=highをゲートとして実行する。"
tags:
  - "DOMPurify"
  - "sanitize"
  - "v-html"
  - "httpOnly"
  - "Secure"
  - "SameSite"
  - "Content-Security-Policy"
  - "noopener"
  - "noreferrer"
  - "XSS"
  - "CSRF"
---

# 🔐 フロントエンドセキュリティ

> Vue 3 + Vuetify環境でXSS/CSRF防御、トークン保存、CSP、依存関係監査などのセキュリティ標準を定義する。認証・入力処理・外部リソース読み込みなど、セキュリティに影響を与えるコードを書いたりレビューしたりするときに読む。

## 1. 中核原則
- `v-html` は信頼できない入力に絶対に使用禁止。必要な場合は必ずDOMPurifyでsanitizeする。
- refresh tokenは `httpOnly`+`Secure`+`SameSite=Strict` クッキー、access tokenはメモリ（Pinia）のみに保管する。
- CSPヘッダーはサーバーで発行し、`unsafe-inline` スクリプトは絶対に許可禁止。
- `VITE_` 接頭辞の変数はすべてクライアントバンドルに含まれるためsecret禁止。
- CIで `npm audit --audit-level=high` をゲートとして実行する。

## 2. ルール

### 2-1. XSS防御
- `v-html` は信頼できない入力に絶対に使用禁止。使用しなければならない場合は必ず **DOMPurify** でsanitizeする。
- Vueの既定の `{{ }}` 補間は自動escapeされるので安全。

```bash
npm install dompurify
```

```vue
<template>
  <VCard>
    <VCardText v-html="safeHtml" />
  </VCard>
</template>

<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({ rawHtml: String })
const safeHtml = computed(() => DOMPurify.sanitize(props.rawHtml, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  ALLOWED_ATTR: ['href', 'target', 'rel']
}))
</script>
```

### 2-2. トークン保存トレードオフマトリクス

| 保存先 | XSS安全性 | CSRF安全性 | SSRアクセス | 推奨度 |
|---|---|---|---|---|
| **httpOnly Cookie** | 安全（JSアクセス不可） | CSRFトークン必要 | 可能 | **推奨** |
| localStorage | 脆弱（JSアクセス可能） | 安全 | 不可 | 非推奨 |
| sessionStorage | 脆弱 | 安全 | 不可 | 短期セッションのみ |
| メモリ（Pinia） | 普通 | 安全 | 不可 | 寿命の短いaccess token |

- **推奨パターン**: refresh tokenは `httpOnly`+`Secure`+`SameSite=Strict` クッキー、access tokenはメモリ（Pinia）のみに保管する。

### 2-3. CSRF（Cookie認証時）
- Spring Security CSRFトークンをAxiosが自動的にヘッダーに載せて送るように設定する。

```javascript
// src/utils/axios.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN'
})

export default api
```

### 2-4. CSP (Content-Security-Policy)
- サーバー（Spring SecurityまたはNginx）でCSPヘッダーを発行する。Vite devでは `vite.config.js` の `server.headers` で模倣可能。
- 既定の推奨値:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
```

- `unsafe-inline` スクリプトは絶対に許可禁止。Vuetifyは `style` に `unsafe-inline` が必要な場合があるのでnonce使用を検討。

### 2-5. 外部リンク
- `target="_blank"` 使用時は必ず `rel="noopener noreferrer"` を追加する（tabnabbing防止）。

```vue
<a href="https://external.com" target="_blank" rel="noopener noreferrer">外部リンク</a>
```

### 2-6. 環境変数Secret禁止
- `VITE_` 接頭辞の変数は **すべてクライアントバンドルに含まれる**。API key/secret禁止。
- 詳細は `env-config` skill参照。

### 2-7. 依存関係監査
```bash
npm audit
npm audit fix
npm audit --audit-level=high
```
- CIで `npm audit --audit-level=high` をゲートとして実行することを推奨。

## 3. よくある間違い
- `v-html` にユーザー入力を直接バインディング
- localStorageにJWTを保存した後「便宜上1年保持」
- `target="_blank"` だけ使い `rel` を欠落
- `VITE_API_SECRET` のようなクライアントsecretを定義
- `// eslint-disable-next-line` でセキュリティルールを無視
- 外部CDNスクリプトをSRI（`integrity`）なしで読み込み

## 4. チェックリスト
- [ ] `v-html` にバインディングされるすべての値がDOMPurifyでsanitizeされているか？
- [ ] access tokenはメモリ（Pinia）、refresh tokenはhttpOnlyクッキーに保管しているか？
- [ ] Cookie認証時にAxiosにXSRFヘッダー設定がされているか？
- [ ] CSPヘッダーがサーバーで発行され、`unsafe-inline` スクリプトを許可していないか？
- [ ] `target="_blank"` リンクに `rel="noopener noreferrer"` がすべて付いているか？
- [ ] `VITE_` 接頭辞の変数にsecret/API keyがないか？
- [ ] CIに `npm audit --audit-level=high` ゲートがあるか？
