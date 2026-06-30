---
name: トランスポートセキュリティ標準 — TLS・HTTPS・セキュリティヘッダー
description: トランスポート層での盗聴・改ざん・クリックジャッキングを防ぐ汎用(foundational)標準。HTTPS強制、TLS最小バージョン・暗号スイート、HSTS・CSP・セキュリティヘッダー、CORSホワイトリスト、機密応答のキャッシュ禁止を扱う。サーバー・APIのヘッダー・TLS・CORSを構成・点検したり、HTTPS移行を整備するときに読む。
rules:
  - "平文転送を信頼しない: ネットワーク経路は盗聴・改ざんされうると仮定する。すべてのトラフィックはHTTPSのみ許可し、HTTPリクエストは恒久リダイレクト(301)でHTTPSに切り替える。"
  - "HSTSで平文再接続を遮断する: 最初のリクエスト以降、ブラウザが平文に戻らないようにHSTSを強制する。リダイレクトだけでは最初の平文リクエストが露出するため、HSTSが必須だ。"
  - "デフォルト拒否、明示許可(default-deny): CSP・CORSは「すべて遮断し必要なオリジンだけ開く」を基本とする。ワイルドカード許可は信頼境界を崩す。"
  - "TLSは安全なバージョン・暗号のみ: 脆弱なプロトコル・暗号スイートへのダウングレードを防ぐ。最小バージョン以上のみ許可する。"
  - "機密応答はキャッシュに残さない: 認証・個人情報を含む応答がプロキシ・ブラウザキャッシュに残留しないようにする。"
  - "ヘッダー・ポリシーは一箇所で一括適用: セキュリティヘッダーとCORSポリシーをエンドポイントごとにばらまかず、共通入口(ミドルウェア/フィルター/ゲートウェイ)で一貫して掛ける。"
  - "設定はコードではなく環境で: 許可オリジン・証明書など環境ごとに異なる値は環境変数/設定に分離し、開発設定が本番に漏れないようにする。"
tags:
  - "HTTPS"
  - "TLS"
  - "HSTS"
  - "Content-Security-Policy"
  - "X-Frame-Options"
  - "CORS"
  - "Strict-Transport-Security"
  - "helmet"
foundational: true
---

# 🔒 トランスポートセキュリティ標準 — TLS・HTTPS・セキュリティヘッダー

> トランスポート層での盗聴・改ざん・クリックジャッキングを防ぐ。すべてのトラフィックをHTTPSのみで流し、TLSを安全に設定し、標準セキュリティヘッダーとCORSホワイトリストでブラウザを防御する。サーバー・APIのHTTPS・TLS・セキュリティヘッダー・CORSを構成または点検するときに読む。特定の言語/フレームワーク/ツールに依存しない汎用標準だ。(ヘッダー値・TLSバージョン・ポリシー自体は業界標準のため本文にそのまま残す。)

## 1. 核心原則
- **平文転送を信頼しない**: ネットワーク経路は盗聴・改ざんされうると仮定する。すべてのトラフィックはHTTPSのみ許可し、HTTPリクエストは恒久リダイレクト(301)でHTTPSに切り替える。
- **HSTSで平文再接続を遮断する**: 最初のリクエスト以降、ブラウザが平文に戻らないようにHSTSを強制する。リダイレクトだけでは最初の平文リクエストが露出するため、HSTSが必須だ。
- **デフォルト拒否、明示許可(default-deny)**: CSP・CORSは「すべて遮断し必要なオリジンだけ開く」を基本とする。ワイルドカード許可は信頼境界を崩す。
- **TLSは安全なバージョン・暗号のみ**: 脆弱なプロトコル・暗号スイートへのダウングレードを防ぐ。最小バージョン以上のみ許可する。
- **機密応答はキャッシュに残さない**: 認証・個人情報を含む応答がプロキシ・ブラウザキャッシュに残留しないようにする。
- **ヘッダー・ポリシーは一箇所で一括適用**: セキュリティヘッダーとCORSポリシーをエンドポイントごとにばらまかず、共通入口(ミドルウェア/フィルター/ゲートウェイ)で一貫して掛ける。
- **設定はコードではなく環境で**: 許可オリジン・証明書など環境ごとに異なる値は環境変数/設定に分離し、開発設定が本番に漏れないようにする。

## 2. 規則

### 2-1. すべてのトラフィックをHTTPSに強制する
- HTTPで入ってきたリクエストは同一パスのHTTPSへ301リダイレクトする。HTTPをそのまま提供しない。
- リダイレクトに留まらず**HSTSを併せて**適用し、以降の再接続が平文に降りないようにする。

```text
// ❌ 禁止 — HTTPをそのまま残す、またはリダイレクトだけでHSTSを欠落
http://api → (そのまま応答)            // 平文露出
http://api → 301 https://api          // 次の接続が再び平文になりうる

// ✅ 推奨 — HTTPS強制 + HSTSで平文再接続を遮断
http://api → 301 https://api
応答ヘッダー: Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 2-2. 標準セキュリティヘッダーを一括で掛ける
- 以下のヘッダーを共通入口ですべての応答に適用する(値は業界標準)。

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'nonce-{random}';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- HSTSは`max-age=31536000`(1年)以上 + `includeSubDomains`を含める。
- クリックジャッキング防御として`X-Frame-Options: DENY`(またはCSP `frame-ancestors 'none'`)を掛ける。

### 2-3. CSPはdefault-src 'self'基準で、unsafe-inlineを除去
- `default-src 'self'`を基本に置き、必要なオリジンだけをディレクティブごとに**明示許可**する。
- インラインスクリプト/スタイル許可(`unsafe-inline`)はXSS防御を無力化する — nonceまたはハッシュで置き換える。

```text
// ❌ 禁止 — インライン全面許可 (XSS防御を無力化)
Content-Security-Policy: default-src *; script-src 'self' 'unsafe-inline'

// ✅ 推奨 — 基本self、インラインはnonceでのみ許可
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'
```

### 2-4. CORSは明示的ホワイトリストで (ワイルドカード禁止)
- 許可オリジンを**環境別ホワイトリスト**で管理する。本番で`Access-Control-Allow-Origin: *`を使わない。
- 資格情報を伴うリクエスト(`allow_credentials`)にワイルドカードオリジンを絶対に結合しない。
- 許可オリジン一覧はコードに埋め込まず環境変数/設定に分離する。

```text
// 環境別に許可オリジンを明示する
開発:      localhost:3000 許可 (明示的)
ステージング:  staging.example.com 許可
本番:  app.example.com のみ許可
```

```text
// ❌ 禁止 — 本番ですべてのオリジンを許可
Access-Control-Allow-Origin: *

// ✅ 推奨 — 環境変数(ALLOWED_ORIGINS)でホワイトリスト管理
allow_origins = ALLOWED_ORIGINS.split(',')
```

### 2-5. 機密応答はキャッシュ禁止
- 認証・個人情報を含む応答には`Cache-Control: no-store`を掛け、プロキシ・ブラウザキャッシュの残留を防ぐ。

```text
// ❌ 禁止 — 機密応答がキャッシュ可能状態で降りる
200 /me  (Cache-Control なし)         // プロキシ・ブラウザに残留

// ✅ 推奨 — 機密応答はキャッシュ禁止
200 /me  Cache-Control: no-store
```

### 2-6. TLSは安全なバージョン・暗号のみ許可
- TLS 1.2以上のみ許可する(SSLv3、TLS 1.0/1.1を無効化) — 脆弱プロトコルへのダウングレードを防ぐ。
- 強力な暗号スイートのみ許可する。
- 外部点検ツール(例: SSL Labs `ssllabs.com/ssltest`)でA等級を目標にする。
- 証明書は満了前に**自動更新**されるよう運用する(手動更新は満了事故を招く)。

```text
// ❌ 禁止 — 旧バージョンプロトコル許可 → ダウングレード攻撃
TLS 1.0 / 1.1 / SSLv3 enabled

// ✅ 推奨 — 最小バージョン以上 + 強い暗号のみ
min TLS 1.2,  強い cipher suite のみ,  SSL Labs A 等級
```

## 3. よくある間違い
- **リダイレクトだけでHSTS欠落** → 301で転送しても最初のリクエストは平文で露出する。リダイレクト + HSTSを必ず併せて。
- **CSPに`unsafe-inline`が残存** → ヘッダーは掛けたがインラインを許可するとXSS防御が無力化される。nonce/ハッシュで置き換える。
- **ワイルドカードオリジン + 資格情報の結合** → 資格情報リクエストに`*`を使うとブラウザが遮断するか、かえってより危険になる。本番CORSは環境別ホワイトリストで、明示オリジンのみ。
- **機密応答に`no-store`未適用** → 認証・個人情報応答がプロキシ・ブラウザキャッシュに残る。
- **証明書の手動更新** → 更新を逃して満了障害が起きる。自動更新で。
- **ヘッダーをエンドポイントごとに散発適用** → 欠落が頻発する。共通入口で一括に。

## 4. チェックリスト
- [ ] HTTPをHTTPSへ301リダイレクトし**HSTS**を設定したか
- [ ] 標準セキュリティヘッダー(HSTS・CSP・X-Content-Type-Options・X-Frame-Options・Referrer-Policy・Permissions-Policy)を共通地点で一括に掛けたか
- [ ] CSPから`unsafe-inline`を除去しオリジンを明示したか
- [ ] CORSオリジンを環境別ホワイトリストで管理しているか (`*`禁止、資格情報とワイルドカードの結合禁止)
- [ ] 機密API応答に`Cache-Control: no-store`を設定したか
- [ ] TLS 1.2以上のみ許可し強い暗号スイート + SSL Labs A等級を確認したか
- [ ] 証明書が自動更新されるよう運用しているか
- [ ] 許可オリジン・証明書など環境別の値を環境変数/設定に分離したか

## 付録: スタック別の例

> 以下は参考用の実装例だ。チームが使うスタック(例: Node/Helmet、Python/FastAPI、Nginx/Apache、certbotなど)に合った例を同じパターンで追加する。上記1~4の原則・規則が標準であり、付録はその適用事例にすぎない。入力値検証・認証など隣接トピックは該当スキルに従う。

### ツール別の例

#### セキュリティヘッダー設定 — Node.js (Helmet)

```javascript
import helmet from "helmet";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'nonce-{generated}'"],
      imgSrc: ["'self'", "data:", "https://trusted-cdn.com"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

#### HTTPS強制 · CORS — Python (FastAPI)

```python
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(CORSMiddleware,
  allow_origins=["https://app.example.com"],  # ホワイトリスト
  allow_credentials=True,
  allow_methods=["GET", "POST", "PUT", "DELETE"],
  allow_headers=["Authorization", "Content-Type"],
)
```

#### TLS証明書の自動更新 — Let's Encrypt (certbot)

- 証明書の自動更新設定 (Let's Encrypt certbot)
