---
name: GraphQL API 設計
description: GraphQL スキーマ設計、N+1 解決(DataLoader)、cursor ページネーション、エラー処理、REST との選択基準。GraphQL API を新たに設計する、または N+1・ページネーション・複雑度の問題を扱うときに読む。キーワード: graphql, dataloader, schema-first, n+1, cursor-pagination.
rules:
  - "スキーマ優先(schema-first)で設計する — 型・クエリ・ミューテーションを先に定義しリゾルバを実装する。"
  - "N+1 クエリは DataLoader(バッチ+キャッシュ)で解決する — リゾルバでループを回して DB 単件照会を繰り返さない。"
  - "ページネーションは cursor ベース(Relay connection)を基本とする — offset は大容量で遅く重複・欠落のリスク。"
  - "エラーは GraphQL errors 配列 + 部分成功(partial data)で扱う — HTTP ステータスコード一つに依存しない。"
  - "公開 API はクエリ深さ・複雑度制限(depth/complexity limit)で悪意ある入れ子クエリ(DoS)を防ぐ。"
tags:
  - "graphql"
  - "dataloader"
  - "schema-first"
  - "n+1"
  - "cursor-pagination"
---

# 🔗 GraphQL API 設計

> GraphQL スキーマ・N+1・ページネーション・セキュリティを標準化する。GraphQL API を設計する、または REST との選択を悩むときに読む。

REST と違いクライアントが必要なフィールドのみ選択照会するため over/under-fetching が減るが、サーバーは N+1・複雑度・キャッシュで新たな責任を負う。

## 1. 核心原則
- スキーマ優先(schema-first)で設計する — 型・クエリ・ミューテーションを先に定義しリゾルバを実装する。
- N+1 クエリは DataLoader(バッチ+キャッシュ)で解決する — リゾルバでループを回して DB 単件照会を繰り返さない。
- ページネーションは cursor ベース(Relay connection)を基本とする — offset は大容量で遅く重複・欠落のリスク。
- エラーは GraphQL errors 配列 + 部分成功(partial data)で扱う — HTTP ステータスコード一つに依存しない。
- 公開 API はクエリ深さ・複雑度制限(depth/complexity limit)で悪意ある入れ子クエリ(DoS)を防ぐ。

## 2. 規則

### 2-1. スキーマ設計 (schema-first)
型をドメイン中心にモデリングし、入力は `input` 型に分離し、保証される値は `!`(non-null)で契約を強くする。

```graphql
# ✅ 推奨 — ドメイン型分離 + input + non-null 契約
type User {
  id: ID!
  name: String!
  posts(first: Int!, after: String): PostConnection!   # 関連は connection で
}
type Post { id: ID!  title: String!  author: User! }

input CreatePostInput { title: String!  body: String! }   # 入力は input 型にまとめ進化に備える

type Query {
  user(id: ID!): User
  posts(first: Int!, after: String): PostConnection!
}
type Mutation {
  createPost(input: CreatePostInput!): Post!
}
```
```graphql
# ❌ 禁止 — 全フィールド nullable + 巨大な単一型 + 平面的な引数
type Data { id: ID  title: String  authorName: String  authorEmail: String }
type Mutation { createPost(title: String, body: String, tag1: String, tag2: String): Data }
```

### 2-2. N+1 解決 (DataLoader)
関連フィールドのリゾルバは DataLoader で同一ティックのキーを集めて一度に照会する。

```js
// ❌ 禁止 — author リゾルバが Post ごとに DB 単件照会 → 一覧 N 件なら N+1 クエリ
const resolvers = { Post: { author: (post) => db.user.findById(post.authorId) } }

// ✅ 推奨 — DataLoader で同一ティックの authorId を集め 1 クエリバッチ + リクエスト単位キャッシュ
const userLoader = new DataLoader(async (ids) => {
  const rows = await db.user.findByIds(ids)       // WHERE id IN (...)
  const byId = new Map(rows.map(r => [r.id, r]))
  return ids.map(id => byId.get(id) ?? null)       // 入力キー順で返す (必須規約)
})
const resolvers = { Post: { author: (post) => userLoader.load(post.authorId) } }
```
> DataLoader は **リクエスト(コンテキスト)ごとに新規生成**する — グローバルキャッシュにするとリクエスト間で stale データが漏れる。

### 2-3. ページネーション (cursor / Relay connection)
`edges`/`pageInfo`(endCursor, hasNextPage)形式の connection を標準とする。

```graphql
type PostConnection { edges: [PostEdge!]!  pageInfo: PageInfo! }
type PostEdge { node: Post!  cursor: String! }     # cursor = ソートキーのエンコード(例: base64 of id/created_at)
type PageInfo { endCursor: String  hasNextPage: Boolean! }
```
```text
# ❌ 禁止 — offset/page (大容量で遅く、挿入/削除時に重複・欠落)
posts(offset: 10000, limit: 20)
# ✅ 推奨 — cursor (最後の endCursor 以降のみ、インデックスに優しい)
posts(first: 20, after: "WyIyMDI2LTA2LTAxIiwxMjNd")
```

### 2-4. エラー処理
部分成功(partial data)を許容し、機械が分岐できるよう `errors[].extensions.code` を付ける。

```json
{
  "data": { "user": { "name": "홍길동", "posts": null } },
  "errors": [
    { "message": "게시글 조회 실패", "path": ["user", "posts"],
      "extensions": { "code": "DOWNSTREAM_UNAVAILABLE" } }
  ]
}
```
- HTTP ステータスコード一つ(200/500)に依存しない — GraphQL は通常 200 + errors 配列。
- クライアントが分岐できるよう `extensions.code`(文字列 enum)を標準化する。

### 2-5. セキュリティ (深さ・複雑度制限)
深さ・複雑度制限 + 認証/認可はリゾルバごとに散らさずミドルウェア・ディレクティブで一貫適用する。

```js
// ❌ 無制限の入れ子 → user{posts{author{posts{...}}}} DoS
// ✅ 深さ + コスト分析で上限
const server = new ApolloServer({
  validationRules: [depthLimit(7), createComplexityLimitRule(1000)],
})
// 認可は @auth(requires: ADMIN) ディレクティブまたはフィールドミドルウェアで — リゾルバ本体の重複禁止
```

### 2-6. REST との選択
画面ごとにフィールド要求が大きく異なる、またはクライアントが多様なら GraphQL、単純 CRUD・HTTP キャッシュ中心なら REST の方が単純だ。

## 3. よくある間違い
- ❌ 関連フィールドのリゾルバでループ単件照会 → N+1。**DataLoader 必須**、キー順で返す。
- ❌ DataLoader をグローバル(シングルトン)で生成 → リクエスト間でキャッシュ汚染。リクエストコンテキストごとに新規作成する。
- ❌ offset ページネーションを大容量に使用 → 重複・欠落・性能低下。cursor connection で。
- ❌ 深さ・複雑度制限のない公開エンドポイント → 入れ子クエリ DoS。depthLimit + costAnalysis。
- ❌ エラーを HTTP ステータス一つで丸める → `errors[].extensions.code` で分岐可能に。
- ❌ 全フィールド nullable → 契約が弱くクライアントが防御コードまみれ。保証値は `!`。
- ❌ ミューテーション入力を平面的な引数で列挙 → `input` 型にまとめフィールド追加に備える。
- ❌ 認証/認可をリゾルバごとに重複実装 → ミドルウェア/ディレクティブで一貫適用。

## 4. チェックリスト
- [ ] スキーマを先に定義しリゾルバを実装したか (ドメイン型分離、入力は `input`、保証値は `!`)
- [ ] 関連フィールドのリゾルバに DataLoader を適用しリクエストごとに生成したか (N+1 防止)
- [ ] ページネーションを cursor ベース connection で設計したか
- [ ] エラーを errors 配列 + 部分成功 + `extensions.code` で扱ったか
- [ ] 公開 API に深さ・複雑度制限をかけ認可をミドルウェア/ディレクティブで一貫適用したか
