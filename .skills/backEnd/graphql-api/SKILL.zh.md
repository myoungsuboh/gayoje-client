---
name: GraphQL API 设计
description: GraphQL 模式设计、N+1 解决(DataLoader)、cursor 分页、错误处理、相对 REST 的选择标准。在新设计 GraphQL API 或处理 N+1·分页·复杂度问题时阅读。关键词：graphql, dataloader, schema-first, n+1, cursor-pagination.
rules:
  - "采用模式优先(schema-first)设计 — 先定义类型·查询·变更，再实现解析器。"
  - "N+1 查询用 DataLoader(批处理+缓存)解决 — 禁止在解析器中循环重复进行 DB 单条查询。"
  - "分页默认采用 cursor 方式(Relay connection) — offset 在大数据量下慢且有重复·遗漏风险。"
  - "错误用 GraphQL errors 数组 + 部分成功(partial data)处理 — 不依赖单一 HTTP 状态码。"
  - "公开 API 用查询深度·复杂度限制(depth/complexity limit)防止恶意嵌套查询(DoS)。"
tags:
  - "graphql"
  - "dataloader"
  - "schema-first"
  - "n+1"
  - "cursor-pagination"
---

# 🔗 GraphQL API 设计

> 标准化 GraphQL 模式·N+1·分页·安全。在设计 GraphQL API 或纠结与 REST 的选择时阅读。

与 REST 不同，客户端只选择查询所需字段，因此 over/under-fetching 减少，但服务器在 N+1·复杂度·缓存上承担新的责任。

## 1. 核心原则
- 采用模式优先(schema-first)设计 — 先定义类型·查询·变更，再实现解析器。
- N+1 查询用 DataLoader(批处理+缓存)解决 — 禁止在解析器中循环重复进行 DB 单条查询。
- 分页默认采用 cursor 方式(Relay connection) — offset 在大数据量下慢且有重复·遗漏风险。
- 错误用 GraphQL errors 数组 + 部分成功(partial data)处理 — 不依赖单一 HTTP 状态码。
- 公开 API 用查询深度·复杂度限制(depth/complexity limit)防止恶意嵌套查询(DoS)。

## 2. 规则

### 2-1. 模式设计 (schema-first)
以领域为中心建模类型，将输入分离为 `input` 类型，保证存在的值用 `!`(non-null)使契约更强。

```graphql
# ✅ 推荐 — 领域类型分离 + input + non-null 契约
type User {
  id: ID!
  name: String!
  posts(first: Int!, after: String): PostConnection!   # 关联用 connection
}
type Post { id: ID!  title: String!  author: User! }

input CreatePostInput { title: String!  body: String! }   # 输入归入 input 类型以备演进

type Query {
  user(id: ID!): User
  posts(first: Int!, after: String): PostConnection!
}
type Mutation {
  createPost(input: CreatePostInput!): Post!
}
```
```graphql
# ❌ 禁止 — 所有字段 nullable + 巨大单一类型 + 扁平参数
type Data { id: ID  title: String  authorName: String  authorEmail: String }
type Mutation { createPost(title: String, body: String, tag1: String, tag2: String): Data }
```

### 2-2. N+1 解决 (DataLoader)
关联字段解析器用 DataLoader 汇集同一 tick 的键并一次查询。

```js
// ❌ 禁止 — author 解析器对每个 Post 进行 DB 单条查询 → 列表 N 条则 N+1 查询
const resolvers = { Post: { author: (post) => db.user.findById(post.authorId) } }

// ✅ 推荐 — 用 DataLoader 汇集同一 tick 的 authorId 进行 1 次查询批处理 + 请求级缓存
const userLoader = new DataLoader(async (ids) => {
  const rows = await db.user.findByIds(ids)       // WHERE id IN (...)
  const byId = new Map(rows.map(r => [r.id, r]))
  return ids.map(id => byId.get(id) ?? null)       // 按输入键顺序返回 (必须遵守的约定)
})
const resolvers = { Post: { author: (post) => userLoader.load(post.authorId) } }
```
> DataLoader 要**每个请求(上下文)新建** — 设为全局缓存会在请求间泄漏 stale 数据。

### 2-3. 分页 (cursor / Relay connection)
以 `edges`/`pageInfo`(endCursor, hasNextPage)形式的 connection 为标准。

```graphql
type PostConnection { edges: [PostEdge!]!  pageInfo: PageInfo! }
type PostEdge { node: Post!  cursor: String! }     # cursor = 排序键编码(如 base64 of id/created_at)
type PageInfo { endCursor: String  hasNextPage: Boolean! }
```
```text
# ❌ 禁止 — offset/page (大数据量下慢，插入/删除时重复·遗漏)
posts(offset: 10000, limit: 20)
# ✅ 推荐 — cursor (仅取最后 endCursor 之后，对索引友好)
posts(first: 20, after: "WyIyMDI2LTA2LTAxIiwxMjNd")
```

### 2-4. 错误处理
允许部分成功(partial data)，并附上 `errors[].extensions.code` 让机器可分支。

```json
{
  "data": { "user": { "name": "홍길동", "posts": null } },
  "errors": [
    { "message": "게시글 조회 실패", "path": ["user", "posts"],
      "extensions": { "code": "DOWNSTREAM_UNAVAILABLE" } }
  ]
}
```
- 不依赖单一 HTTP 状态码(200/500) — GraphQL 通常返回 200 + errors 数组。
- 标准化 `extensions.code`(字符串 enum)使客户端可分支。

### 2-5. 安全 (深度·复杂度限制)
深度·复杂度限制 + 认证/授权不要散落在每个解析器，而用中间件·指令一致应用。

```js
// ❌ 无限嵌套 → user{posts{author{posts{...}}}} DoS
// ✅ 用深度 + 成本分析设上限
const server = new ApolloServer({
  validationRules: [depthLimit(7), createComplexityLimitRule(1000)],
})
// 授权用 @auth(requires: ADMIN) 指令或字段中间件 — 禁止在解析器主体中重复
```

### 2-6. 与 REST 的选择
若各界面字段需求差异大或客户端多样则用 GraphQL，若以简单 CRUD·HTTP 缓存为主则 REST 更简单。

## 3. 常见错误
- ❌ 在关联字段解析器中循环单条查询 → N+1。**必须用 DataLoader**，按键顺序返回。
- ❌ 将 DataLoader 创建为全局(单例) → 请求间缓存污染。每个请求上下文新建。
- ❌ 对大数据量使用 offset 分页 → 重复·遗漏·性能下降。改用 cursor connection。
- ❌ 公开端点无深度·复杂度限制 → 嵌套查询 DoS。depthLimit + costAnalysis。
- ❌ 将错误笼统归为单一 HTTP 状态 → 用 `errors[].extensions.code` 使其可分支。
- ❌ 所有字段 nullable → 契约弱，客户端充斥防御代码。保证值用 `!`。
- ❌ 将变更输入列为扁平参数 → 归入 `input` 类型以备字段添加。
- ❌ 在每个解析器中重复实现认证/授权 → 用中间件/指令一致应用。

## 4. 检查清单
- [ ] 是否先定义模式再实现解析器 (领域类型分离、输入用 `input`、保证值用 `!`)
- [ ] 是否在关联字段解析器中应用 DataLoader 并按请求创建 (防止 N+1)
- [ ] 是否将分页设计为 cursor 方式的 connection
- [ ] 是否用 errors 数组 + 部分成功 + `extensions.code` 处理错误
- [ ] 是否对公开 API 施加深度·复杂度限制并用中间件/指令一致应用授权
