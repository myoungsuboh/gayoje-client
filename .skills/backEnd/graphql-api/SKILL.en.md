---
name: GraphQL API Design
description: GraphQL schema design, N+1 resolution (DataLoader), cursor pagination, error handling, selection criteria vs REST. Read when newly designing a GraphQL API or dealing with N+1, pagination, or complexity issues. Keywords: graphql, dataloader, schema-first, n+1, cursor-pagination.
rules:
  - "Design schema-first — define types, queries, and mutations first, then implement resolvers."
  - "Resolve N+1 queries with DataLoader (batch + cache) — do not repeat single-row DB lookups in a loop inside resolvers."
  - "Make pagination cursor-based (Relay connection) by default — offset is slow at large scale and risks duplicates/omissions."
  - "Handle errors with a GraphQL errors array + partial data (partial success) — do not rely on a single HTTP status code."
  - "Public APIs prevent malicious nested queries (DoS) with query depth/complexity limits."
tags:
  - "graphql"
  - "dataloader"
  - "schema-first"
  - "n+1"
  - "cursor-pagination"
---

# 🔗 GraphQL API Design

> Standardize GraphQL schema, N+1, pagination, and security. Read when designing a GraphQL API or weighing the choice against REST.

Unlike REST, the client selectively queries only the fields it needs, so over/under-fetching is reduced, but the server takes on new responsibilities in N+1, complexity, and caching.

## 1. Core Principles
- Design schema-first — define types, queries, and mutations first, then implement resolvers.
- Resolve N+1 queries with DataLoader (batch + cache) — do not repeat single-row DB lookups in a loop inside resolvers.
- Make pagination cursor-based (Relay connection) by default — offset is slow at large scale and risks duplicates/omissions.
- Handle errors with a GraphQL errors array + partial data (partial success) — do not rely on a single HTTP status code.
- Public APIs prevent malicious nested queries (DoS) with query depth/complexity limits.

## 2. Rules

### 2-1. Schema Design (schema-first)
Model types around the domain, separate inputs into `input` types, and make guaranteed values `!` (non-null) to strengthen the contract.

```graphql
# ✅ Recommended — domain type separation + input + non-null contract
type User {
  id: ID!
  name: String!
  posts(first: Int!, after: String): PostConnection!   # associations via connection
}
type Post { id: ID!  title: String!  author: User! }

input CreatePostInput { title: String!  body: String! }   # group inputs into an input type to prepare for evolution

type Query {
  user(id: ID!): User
  posts(first: Int!, after: String): PostConnection!
}
type Mutation {
  createPost(input: CreatePostInput!): Post!
}
```
```graphql
# ❌ Forbidden — all fields nullable + giant single type + flat arguments
type Data { id: ID  title: String  authorName: String  authorEmail: String }
type Mutation { createPost(title: String, body: String, tag1: String, tag2: String): Data }
```

### 2-2. N+1 Resolution (DataLoader)
Association field resolvers gather keys from the same tick with DataLoader and fetch them in one go.

```js
// ❌ Forbidden — the author resolver does a single-row DB lookup per Post → N+1 queries for a list of N
const resolvers = { Post: { author: (post) => db.user.findById(post.authorId) } }

// ✅ Recommended — gather same-tick authorIds with DataLoader for a 1-query batch + per-request cache
const userLoader = new DataLoader(async (ids) => {
  const rows = await db.user.findByIds(ids)       // WHERE id IN (...)
  const byId = new Map(rows.map(r => [r.id, r]))
  return ids.map(id => byId.get(id) ?? null)       // return in input key order (required contract)
})
const resolvers = { Post: { author: (post) => userLoader.load(post.authorId) } }
```
> Create DataLoader **fresh per request (context)** — keeping it as a global cache leaks stale data across requests.

### 2-3. Pagination (cursor / Relay connection)
Standardize on a connection of the form `edges`/`pageInfo` (endCursor, hasNextPage).

```graphql
type PostConnection { edges: [PostEdge!]!  pageInfo: PageInfo! }
type PostEdge { node: Post!  cursor: String! }     # cursor = encoded sort key (e.g., base64 of id/created_at)
type PageInfo { endCursor: String  hasNextPage: Boolean! }
```
```text
# ❌ Forbidden — offset/page (slow at large scale, duplicates/omissions on insert/delete)
posts(offset: 10000, limit: 20)
# ✅ Recommended — cursor (only after the last endCursor, index-friendly)
posts(first: 20, after: "WyIyMDI2LTA2LTAxIiwxMjNd")
```

### 2-4. Error Handling
Allow partial success (partial data), and attach `errors[].extensions.code` so machines can branch.

```json
{
  "data": { "user": { "name": "홍길동", "posts": null } },
  "errors": [
    { "message": "게시글 조회 실패", "path": ["user", "posts"],
      "extensions": { "code": "DOWNSTREAM_UNAVAILABLE" } }
  ]
}
```
- Do not rely on a single HTTP status code (200/500) — GraphQL usually returns 200 + an errors array.
- Standardize `extensions.code` (a string enum) so clients can branch.

### 2-5. Security (depth/complexity limits)
Apply depth/complexity limits + authentication/authorization consistently via middleware/directives rather than scattering them across each resolver.

```js
// ❌ Unlimited nesting → user{posts{author{posts{...}}}} DoS
// ✅ Cap with depth + cost analysis
const server = new ApolloServer({
  validationRules: [depthLimit(7), createComplexityLimitRule(1000)],
})
// Do authorization with an @auth(requires: ADMIN) directive or field middleware — no duplication in resolver bodies
```

### 2-6. Choosing vs REST
If field requirements differ greatly per screen or the clients are diverse, GraphQL; for simple CRUD / HTTP-caching-centric needs, REST is simpler.

## 3. Common Mistakes
- ❌ Single-row lookups in a loop in association field resolvers → N+1. **DataLoader is required**, return in key order.
- ❌ Creating DataLoader globally (singleton) → cache pollution across requests. Create it fresh per request context.
- ❌ Using offset pagination at large scale → duplicates, omissions, performance degradation. Use a cursor connection.
- ❌ Public endpoint without depth/complexity limits → nested-query DoS. depthLimit + costAnalysis.
- ❌ Lumping errors into a single HTTP status → make them branchable with `errors[].extensions.code`.
- ❌ All fields nullable → weak contract, clients littered with defensive code. Make guaranteed values `!`.
- ❌ Listing mutation inputs as flat arguments → group them into an `input` type to prepare for field additions.
- ❌ Duplicating authentication/authorization in each resolver → apply consistently via middleware/directives.

## 4. Checklist
- [ ] Did you define the schema first and implement resolvers (domain type separation, inputs as `input`, guaranteed values as `!`)?
- [ ] Did you apply DataLoader in association field resolvers and create it per request (preventing N+1)?
- [ ] Did you design pagination as a cursor-based connection?
- [ ] Did you handle errors with an errors array + partial success + `extensions.code`?
- [ ] Did you apply depth/complexity limits on the public API and apply authorization consistently via middleware/directives?
