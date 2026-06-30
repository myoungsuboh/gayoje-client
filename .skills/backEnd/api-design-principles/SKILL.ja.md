---
name: API 設計原則（REST/HTTP、スタック中立）
description: REST/HTTP API の設計原則 — リソースモデリング・URL 命名、HTTP メソッド/ステータスコードの意味論、一貫したエラー応答フォーマット（RFC 7807）、フィルタ・ソート・ページネーションのクエリ規約、ステートレス性。スタックに依存しない汎用標準であり、新しいエンドポイントを設計するときや応答・エラーフォーマットを決めるときに読む。（バージョン戦略は `api-versioning-swagger`、冪等性は `idempotency`、ページネーション実装は `pagination-filtering`、認証/認可は `authn-authz` に委譲。）キーワード: REST, resource, HTTP method, status code, idempotent, RFC 7807, problem+json, content negotiation, HATEOAS。
rules:
  - "リソース中心の URL: パスは動詞ではなく名詞（リソース）で命名する — /users/{id}/orders (O)、/getUserOrders (X)。コレクションは複数形。"
  - "メソッドの意味を守る: GET（参照・副作用なし）・POST（作成）・PUT（全置換）・PATCH（部分更新）・DELETE（削除）。GET で状態を変えない。"
  - "ステータスコードの意味を守る: 2xx 成功・4xx クライアント側の誤り・5xx サーバ側の誤り。200 にエラーを載せて返さない（例: {success:false} を 200 で）。"
  - "一貫したエラーフォーマット: すべてのエラーを同一の構造で応答する。RFC 7807（application/problem+json: type・title・status・detail）またはプロジェクト共通のエラースキーマに従う。"
  - "参照規約の標準化: フィルタ・ソート・ページネーションをクエリパラメータとして一貫して公開する（例: ?status=open&sort=-created_at&page=2）。"
  - "ステートレス性: 各リクエストは自己完結でなければならない — サーバセッションにリクエスト間の状態を隠さない（認証トークン等は毎リクエストで渡す）。"
tags:
  - "REST"
  - "resource"
  - "HTTP method"
  - "status code"
  - "idempotent"
  - "RFC 7807"
  - "problem+json"
  - "content negotiation"
  - "HATEOAS"
  - "PATCH"
  - "ETag"
---

# 🔌 API 設計原則（REST/HTTP、スタック中立）

> REST/HTTP API が予測可能で一貫するように設計原則を統一する。リソースモデリング・メソッド/ステータスコードの意味・エラーフォーマット・参照規約を定める。新しいエンドポイントを設計するときや応答・エラーフォーマットを決めるときに読む。特定の言語/フレームワークに依存しない汎用標準である。
>
> 境界: API の**バージョン戦略**は [api-versioning-swagger](../api-versioning-swagger/SKILL.md)、**冪等性の保証**は [idempotency](../idempotency/SKILL.md)、**ページネーション実装**は [pagination-filtering](../pagination-filtering/SKILL.md)、**認証/認可**は [authn-authz](../../security/authn-authz/SKILL.md) を参照する。本スキルはそれらの上位にある**設計原則**を扱う。

## 1. 中核原則

- **リソース中心**: URL は行為（verb）ではなく資源（noun）を指す。
- **メソッド・ステータスコードの意味を守る**: HTTP の標準的な意味をそのまま使う — 再発明しない。
- **一貫したエラーフォーマット**: すべてのエラーが同じ形であってこそ、クライアントは一度だけ処理する。
- **ステートレス性**: リクエストは自己完結 — サーバセッションに状態を隠さない。

## 2. 規則

### 2-1. リソースモデリング & URL 命名

```
✅ 推奨（名詞・複数・階層）
GET    /users/{id}/orders          # ユーザーの注文一覧
POST   /orders                     # 注文作成
GET    /orders/{id}                # 注文単件
PATCH  /orders/{id}                # 注文の部分更新

❌ 禁止（動詞・行為を URL に）
POST   /createOrder
GET    /getUserOrders?userId=5
POST   /orders/{id}/cancelAndRefund   # 行為は状態変更としてモデル化する
```

- コレクションは複数形（`/orders`）、単件は `/orders/{id}`。
- 行為がどうしても必要なら（検索・バッチ）下位リソースか明確なアクションで: `POST /orders/{id}/refunds`。

### 2-2. HTTP メソッドの意味

| メソッド | 用途 | 冪等性 | 備考 |
|--------|------|--------|------|
| GET | 参照 | ✓ | 副作用なし — キャッシュ可能 |
| POST | 作成・非冪等な操作 | ✗ | 呼び出すたびに新しいリソース |
| PUT | 全置換 | ✓ | 同じボディで複数回 = 同じ結果 |
| PATCH | 部分更新 | △ | 通常は非冪等 |
| DELETE | 削除 | ✓ | 既に削除済みも成功扱い可能 |

> 冪等性を**保証する実装**（重複リクエスト防御、Idempotency-Key）は `idempotency` スキルを参照する。

### 2-3. ステータスコードの意味

```
2xx 成功        200 OK · 201 Created(+Location) · 204 No Content
4xx クライアント誤り 400 検証失敗 · 401 未認証 · 403 権限なし · 404 なし · 409 競合 · 422 意味エラー · 429 過多リクエスト
5xx サーバ誤り   500 内部エラー · 503 一時的不可
```

- ❌ 禁止: `200 OK` のボディに `{ "success": false, "error": ... }` — エラーを 200 に隠すと、クライアント・プロキシ・モニタリングが成功と誤認する。
- 作成成功は `201` + `Location` ヘッダで新しいリソースの位置を知らせる。

### 2-4. 一貫したエラー応答（RFC 7807）

```json
// Content-Type: application/problem+json
{
  "type": "https://example.com/errors/insufficient-stock",
  "title": "재고 부족",
  "status": 409,
  "detail": "상품 SKU-123 의 재고가 3개 남아 5개 주문 불가",
  "instance": "/orders/789"
}
```

- すべてのエラーが**同一のスキーマ**に従う（RFC 7807 またはプロジェクト共通のエラーオブジェクト）。
- `detail` は人が読めるように、`type` は機械が分岐できるように。
- 機微情報（スタックトレース・内部パス）はボディに入れない。

### 2-5. 参照規約 — フィルタ・ソート・ページネーション

```
GET /orders?status=open&customer=5&sort=-created_at&page=2&size=20
```

- フィルタはフィールド名クエリ（`status=open`）、ソートは `sort=-created_at`（`-` 降順）の規約を定めて一貫適用する。
- ページネーションの**方式選択・実装**（offset vs cursor）は `pagination-filtering` スキルを参照 — ここでは「クエリで一貫公開」の原則のみ。

### 2-6. コンテンツネゴシエーション & キャッシュ（基本）

- リクエスト/応答の形式は `Content-Type`・`Accept` でネゴシエートする（デフォルト `application/json`）。
- 参照応答に `ETag`/`Last-Modified` を付けると、条件付きリクエスト（`If-None-Match`）で帯域を節約できる。

## 3. よくある誤り

- URL に行為を埋め込む（`/getX`、`/doY`）→ REST ではなく RPC になる。リソース+メソッドで表現せよ。
- すべての応答を `200` で返しボディのフラグで成否を区別する → HTTP の意味を捨てること。ステータスコードを正しく使え。
- エンドポイントごとにエラーの形が違う → クライアントがケースごとに分岐する羽目になる。一つに統一せよ。
- GET に副作用（状態変更）を入れる → キャッシュ・プリフェッチ・リトライが意図せずデータを変える。

## 4. チェックリスト

- [ ] URL が動詞ではなくリソース（名詞・複数）か
- [ ] メソッド・ステータスコードを標準的な意味どおりに使ったか（200 にエラーを隠していないか）
- [ ] すべてのエラーが同一のフォーマット（RFC 7807 または共通スキーマ）か
- [ ] フィルタ・ソート・ページネーションを一貫したクエリ規約で公開したか
- [ ] リクエストが自己完結か（サーバセッションにリクエスト間の状態を隠していないか）

## 付録: 関連スキルへの委譲

- バージョン戦略（`/v1/`、Deprecation/Sunset）: `api-versioning-swagger`
- 冪等性の保証（Idempotency-Key、重複防御）: `idempotency`
- ページネーション実装（offset/cursor）: `pagination-filtering`
- 認証/認可: `authn-authz` · 入力検証: `input-validation`
