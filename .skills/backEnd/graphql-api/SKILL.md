---
name: GraphQL API 설계
description: GraphQL 스키마 설계, N+1 해결(DataLoader), cursor 페이지네이션, 에러 처리, REST 대비 선택 기준. GraphQL API를 새로 설계하거나 N+1·페이지네이션·복잡도 문제를 다룰 때 읽는다. 키워드: graphql, dataloader, schema-first, n+1, cursor-pagination.
rules:
  - "스키마 우선(schema-first)으로 설계한다 — 타입·쿼리·뮤테이션을 먼저 정의하고 리졸버를 구현한다."
  - "N+1 쿼리는 DataLoader(배치+캐시)로 해결한다 — 리졸버에서 루프 돌며 DB 단건 조회 반복 금지."
  - "페이지네이션은 cursor 기반(Relay connection)을 기본으로 한다 — offset 은 대용량에서 느리고 중복·누락 위험."
  - "에러는 GraphQL errors 배열 + 부분 성공(partial data)으로 다룬다 — HTTP 상태코드 하나에 의존하지 않는다."
  - "공개 API 는 쿼리 깊이·복잡도 제한(depth/complexity limit)으로 악의적 중첩 쿼리(DoS)를 막는다."
tags:
  - "graphql"
  - "dataloader"
  - "schema-first"
  - "n+1"
  - "cursor-pagination"
---

# 🔗 GraphQL API 설계

> GraphQL 스키마·N+1·페이지네이션·보안을 표준화한다. GraphQL API를 설계하거나 REST와 선택을 고민할 때 읽는다.

REST 와 달리 클라이언트가 필요한 필드만 선택 조회하므로 over/under-fetching 이 줄지만, 서버는 N+1·복잡도·캐싱에서 새로운 책임을 진다.

## 1. 핵심 원칙
- 스키마 우선(schema-first)으로 설계한다 — 타입·쿼리·뮤테이션을 먼저 정의하고 리졸버를 구현한다.
- N+1 쿼리는 DataLoader(배치+캐시)로 해결한다 — 리졸버에서 루프 돌며 DB 단건 조회 반복 금지.
- 페이지네이션은 cursor 기반(Relay connection)을 기본으로 한다 — offset 은 대용량에서 느리고 중복·누락 위험.
- 에러는 GraphQL errors 배열 + 부분 성공(partial data)으로 다룬다 — HTTP 상태코드 하나에 의존하지 않는다.
- 공개 API 는 쿼리 깊이·복잡도 제한(depth/complexity limit)으로 악의적 중첩 쿼리(DoS)를 막는다.

## 2. 규칙

### 2-1. 스키마 설계 (schema-first)
타입을 도메인 중심으로 모델링하고, 입력은 `input` 타입으로 분리하며, 보장되는 값은 `!`(non-null)로 계약을 강하게 만든다.

```graphql
# ✅ 권장 — 도메인 타입 분리 + input + non-null 계약
type User {
  id: ID!
  name: String!
  posts(first: Int!, after: String): PostConnection!   # 연관은 connection 으로
}
type Post { id: ID!  title: String!  author: User! }

input CreatePostInput { title: String!  body: String! }   # 입력은 input 타입으로 묶어 진화 대비

type Query {
  user(id: ID!): User
  posts(first: Int!, after: String): PostConnection!
}
type Mutation {
  createPost(input: CreatePostInput!): Post!
}
```
```graphql
# ❌ 금지 — 모든 필드 nullable + 거대 단일 타입 + 평면 인자
type Data { id: ID  title: String  authorName: String  authorEmail: String }
type Mutation { createPost(title: String, body: String, tag1: String, tag2: String): Data }
```

### 2-2. N+1 해결 (DataLoader)
연관 필드 리졸버는 DataLoader 로 같은 틱의 키를 모아 한 번에 조회한다.

```js
// ❌ 금지 — author 리졸버가 Post 마다 DB 단건 조회 → 목록 N건이면 N+1 쿼리
const resolvers = { Post: { author: (post) => db.user.findById(post.authorId) } }

// ✅ 권장 — DataLoader 로 같은 틱의 authorId 를 모아 1쿼리 배치 + 요청 단위 캐시
const userLoader = new DataLoader(async (ids) => {
  const rows = await db.user.findByIds(ids)       // WHERE id IN (...)
  const byId = new Map(rows.map(r => [r.id, r]))
  return ids.map(id => byId.get(id) ?? null)       // 입력 키 순서대로 반환 (필수 규약)
})
const resolvers = { Post: { author: (post) => userLoader.load(post.authorId) } }
```
> DataLoader 는 **요청(컨텍스트)마다 새로 생성**한다 — 전역 캐시로 두면 요청 간 stale 데이터가 샌다.

### 2-3. 페이지네이션 (cursor / Relay connection)
`edges`/`pageInfo`(endCursor, hasNextPage) 형태의 connection 을 표준으로 한다.

```graphql
type PostConnection { edges: [PostEdge!]!  pageInfo: PageInfo! }
type PostEdge { node: Post!  cursor: String! }     # cursor = 정렬키 인코딩(예: base64 of id/created_at)
type PageInfo { endCursor: String  hasNextPage: Boolean! }
```
```text
# ❌ 금지 — offset/page (대용량에서 느리고, 삽입/삭제 시 중복·누락)
posts(offset: 10000, limit: 20)
# ✅ 권장 — cursor (마지막 endCursor 이후만, 인덱스 친화)
posts(first: 20, after: "WyIyMDI2LTA2LTAxIiwxMjNd")
```

### 2-4. 에러 처리
부분 성공(partial data)을 허용하고, 기계가 분기할 수 있게 `errors[].extensions.code` 를 단다.

```json
{
  "data": { "user": { "name": "홍길동", "posts": null } },
  "errors": [
    { "message": "게시글 조회 실패", "path": ["user", "posts"],
      "extensions": { "code": "DOWNSTREAM_UNAVAILABLE" } }
  ]
}
```
- HTTP 상태코드 하나(200/500)에 의존하지 않는다 — GraphQL 은 보통 200 + errors 배열.
- 클라이언트가 분기할 수 있도록 `extensions.code`(문자열 enum)를 표준화한다.

### 2-5. 보안 (깊이·복잡도 제한)
깊이·복잡도 제한 + 인증/인가는 리졸버마다 흩지 말고 미들웨어·디렉티브로 일관 적용한다.

```js
// ❌ 무제한 중첩 → user{posts{author{posts{...}}}} DoS
// ✅ 깊이 + 비용 분석으로 상한
const server = new ApolloServer({
  validationRules: [depthLimit(7), createComplexityLimitRule(1000)],
})
// 인가는 @auth(requires: ADMIN) 디렉티브 또는 필드 미들웨어로 — 리졸버 본문 중복 금지
```

### 2-6. REST 와 선택
화면별로 필드 요구가 크게 다르거나 클라이언트가 다양하면 GraphQL, 단순 CRUD·HTTP 캐싱 중심이면 REST 가 더 단순하다.

## 3. 흔한 실수
- ❌ 연관 필드 리졸버에서 루프 단건 조회 → N+1. **DataLoader 필수**, 키 순서대로 반환.
- ❌ DataLoader 를 전역(싱글톤)으로 생성 → 요청 간 캐시 오염. 요청 컨텍스트마다 새로 만든다.
- ❌ offset 페이지네이션을 대용량에 사용 → 중복·누락·성능 저하. cursor connection 으로.
- ❌ 깊이·복잡도 제한 없는 공개 엔드포인트 → 중첩 쿼리 DoS. depthLimit + costAnalysis.
- ❌ 에러를 HTTP 상태 하나로 뭉뚱그림 → `errors[].extensions.code` 로 분기 가능하게.
- ❌ 모든 필드 nullable → 계약이 약해 클라이언트가 방어 코드 범벅. 보장값은 `!`.
- ❌ 뮤테이션 입력을 평면 인자로 나열 → `input` 타입으로 묶어 필드 추가에 대비.
- ❌ 인증/인가를 리졸버마다 중복 구현 → 미들웨어/디렉티브로 일관 적용.

## 4. 체크리스트
- [ ] 스키마를 먼저 정의하고 리졸버를 구현했는가 (도메인 타입 분리, 입력은 `input`, 보장값은 `!`)
- [ ] 연관 필드 리졸버에 DataLoader 를 적용하고 요청마다 생성했는가 (N+1 방지)
- [ ] 페이지네이션을 cursor 기반 connection 으로 설계했는가
- [ ] 에러를 errors 배열 + 부분 성공 + `extensions.code` 로 다뤘는가
- [ ] 공개 API 에 깊이·복잡도 제한을 걸고 인가를 미들웨어/디렉티브로 일관 적용했는가
