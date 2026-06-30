---
name: Server State & Data Fetching (Server State & Data Fetching)
description: A stack-neutral standard for handling server-owned async data through a dedicated cache layer (data-fetching library) — separation from client state, loading/error/empty handling, query-key caching & request deduplication, invalidation after mutations, optimistic updates + rollback. Read when fetching lists·details, caching/refreshing/syncing, or when you're piling API responses into a global store. Keywords: server-state, data-fetching, cache, invalidation, optimistic-update, stale-while-revalidate, TanStack-Query, SWR.
rules:
  - "Server state ≠ client state — server data is a distinct category that is async·shared·cached·expiring. Don't manually copy it into a global client store; handle it with a data-fetching layer."
  - "Every async data has loading·error·empty states — don't assume only success. In particular, always handle errors and empty results."
  - "Caches are identified by keys — normalizing the cache by query key (resource+params) automatically merges duplicate requests for the same data."
  - "stale-while-revalidate — show the cached value immediately and refresh in the background. The user sees data immediately (even if slightly stale) instead of a blank screen."
  - "Sync via invalidation after mutations — on a successful write (mutation), invalidate related queries to realign with the server as the source of truth (SoT). Don't hand-edit local arrays."
  - "Optimistic updates come as a set with rollback — to change the UI immediately, you must be able to revert to the previous state on failure."
tags:
  - "server-state"
  - "data-fetching"
  - "cache"
  - "invalidation"
  - "optimistic-update"
  - "stale-while-revalidate"
  - "TanStack-Query"
  - "SWR"
---

# 🔄 Server State & Data Fetching (Server State & Data Fetching)

> Server-owned data (lists·details, etc.) is a **different category** from client UI state — it arrives asynchronously, is shared across multiple screens, gets cached, and goes stale over time. Read this when handling such data with a dedicated cache layer, or when you're manually piling API responses into a global store.

A common anti-pattern is **copying server data directly into a global client store (Pinia/Redux, etc.) and syncing it by hand**. This causes each screen to fetch separately, producing duplicate requests, data changed in one place drifts out of sync with another, and loading·error handling is missing. Server state should be seen not as "state I own" but as "a cache of server state" — so you delegate it to a data-fetching library (TanStack Query·SWR, etc.) that handles caching·invalidation·revalidation for you. This skill covers **server state**; for **client state** like form inputs·modals see `state-management`, and for the HTTP client itself (interceptors·auth) see `api-standard`.

## 1. Core Principles

- **Server state ≠ client state** — server data is a distinct category that is async·shared·cached·expiring. Don't manually copy it into a global client store; handle it with a data-fetching layer.
- **Every async data has loading·error·empty states** — don't assume only success. In particular, always handle errors and empty results.
- **Caches are identified by keys** — normalizing the cache by query key (resource+params) automatically merges duplicate requests for the same data.
- **stale-while-revalidate** — show the cached value immediately and refresh in the background. The user sees data immediately (even if slightly stale) instead of a blank screen.
- **Sync via invalidation after mutations** — on a successful write (mutation), invalidate related queries to realign with the server as the source of truth (SoT). Don't hand-edit local arrays.
- **Optimistic updates come as a set with rollback** — to change the UI immediately, you must be able to revert to the previous state on failure.

## 2. Rules

### 2-1. Don't manually copy server state into a global client store

```text
❌ 금지 — 화면마다 fetch해서 전역 store에 복사, 동기화도 수동
   onMounted: const r = await api.getUsers(); store.users = r   // 다른 화면도 각자 → 중복·불일치

✅ 권장 — 데이터 패칭 계층에 위임 (캐시·중복요청 제거·갱신 자동)
   const { data, isLoading, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
```

### 2-2. Handle loading·error·empty states all

```text
❌ 금지 — 성공만 가정 → 로딩 중 깨지고, 에러는 조용히 사라짐
   <div>{{ data.name }}</div>

✅ 권장 — 4갈래를 명시
   isLoading → 스켈레톤/스피너
   isError   → 에러 + 재시도 UI
   빈 결과    → "데이터 없음" 안내 (빈 배열 ≠ 에러)
   성공       → 렌더
```

### 2-3. Merge cache·duplicate requests by query key

```text
❌ 금지 — 같은 데이터를 컴포넌트마다 따로 요청 → N번 호출
✅ 권장 — 동일 쿼리 키 → 캐시 공유 + 동시 요청 dedup → 1번만 호출
   키에 파라미터를 포함: ['user', userId]  /  ['todos', { status: 'open' }]
```

### 2-4. Sync via invalidation after mutations

```text
❌ 금지 — mutation 후 로컬 캐시를 손으로 수정 → 서버 계산 결과와 어긋남
   addTodo(t); cache.todos.push(t)   // 서버가 부여한 id·정렬·파생필드 누락

✅ 권장 — 성공 시 관련 쿼리 무효화 → 재패칭으로 진실원에 맞춤
   useMutation({ mutationFn: addTodo, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) })
```

### 2-5. Optimistic updates guarantee rollback

```text
✅ 권장 — 즉시 반영하되 실패 시 복원
   onMutate:  진행 중 쿼리 취소 → 이전 값 스냅샷 → 캐시에 낙관적 적용
   onError:   스냅샷으로 롤백
   onSettled: 무효화로 서버와 최종 동기화
```

### 2-6. Decide cache lifetime (staleTime/gc) deliberately

```text
- staleTime: 이 시간 동안은 "신선"으로 보고 재요청 안 함 (과패칭 방지)
- 자주 안 바뀌는 데이터는 길게, 실시간성 높은 데이터는 짧게.
- 실시간이 꼭 필요하면 폴링/구독을 쓰되, 그건 `realtime-client`(WebSocket 등)를 본다.
```

## 3. Common Mistakes

- ❌ Copying server data into a global store and syncing by hand → duplicate requests·inconsistency across screens
- ❌ Missing loading/error/empty states → crashes while loading, errors silently buried
- ❌ Fetching directly in `useEffect`/`onMounted` and hand-managing cancellation·races·duplicates, ending in bugs
- ❌ Manually editing the local cache after a mutation → drifts from server-derived data (id·ordering·totals)
- ❌ Doing only optimistic updates without failure rollback → the UI drifts permanently from the server
- ❌ staleTime 0 on all data → excessive refetching / or infinite cache leaving forever-stale values

> **Application tip**: Ask "is the source of truth for this data the server?" to separate server state from client state. Server state → data-fetching layer, client state → `state-management`. HTTP client config (interceptors·tokens) → `api-standard`.

## 4. Checklist

- [ ] Did you delegate server data to a data-fetching layer instead of manually copying it into a global client store
- [ ] Did you handle loading·error·empty states all
- [ ] Does caching·request dedup happen by query key (parameters included in the key)
- [ ] Did you invalidate related queries after a mutation to sync with the server
- [ ] Does the optimistic update have failure rollback
- [ ] Did you set cache lifetime (staleTime, etc.) to fit the data's characteristics

## Appendix: Per-Stack Examples

> The below are reference implementation examples. Apply the same pattern with the library that fits your team's stack. The principles in 1~4 above are the standard; the appendix is merely an application case.

### Vue 3 (TanStack Query / `@tanstack/vue-query`)

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'

// 조회 — 캐시·중복요청 제거·재검증 자동
const { data: todos, isLoading, isError, refetch } = useQuery({
  queryKey: ['todos', { status: 'open' }],
  queryFn: () => fetchTodos({ status: 'open' }),
  staleTime: 30_000,            // 30초간 신선으로 간주
})

// 변경 — 성공 시 무효화로 동기화
const qc = useQueryClient()
const { mutate: addTodo } = useMutation({
  mutationFn: createTodo,
  onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
})

// 낙관적 업데이트 + 롤백
useMutation({
  mutationFn: toggleTodo,
  onMutate: async (next) => {
    await qc.cancelQueries({ queryKey: ['todos'] })
    const prev = qc.getQueryData(['todos'])
    qc.setQueryData(['todos'], (old) => applyToggle(old, next))
    return { prev }
  },
  onError: (_e, _next, ctx) => qc.setQueryData(['todos'], ctx.prev),  // 롤백
  onSettled: () => qc.invalidateQueries({ queryKey: ['todos'] }),
})
```

### React (TanStack Query) / SWR

```ts
// TanStack Query — Vue 예시와 동일 개념, 훅만 React용
const { data, isLoading, isError } = useQuery({ queryKey: ['todos'], queryFn: fetchTodos })

// SWR (경량 대안)
const { data, error, isLoading, mutate } = useSWR('/api/todos', fetcher)
// 변경 후: await save(); mutate()   // 키 재검증(=무효화)
```
</content>
