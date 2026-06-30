---
name: 서버 상태 · 데이터 패칭 (Server State & Data Fetching)
description: 서버가 소유한 비동기 데이터를 전용 캐시 계층(데이터 패칭 라이브러리)으로 다루는 스택 중립 표준 — 클라이언트 상태와 분리, 로딩/에러/빈 처리, 쿼리 키 캐시·중복요청 제거, 변경 후 무효화, 낙관적 업데이트+롤백. 목록·상세를 불러오거나 캐시·갱신·동기화하거나, 전역 store에 API 응답을 쌓고 있을 때 읽는다. 키워드: server-state, data-fetching, cache, invalidation, optimistic-update, stale-while-revalidate, TanStack-Query, SWR.
rules:
  - "서버 상태 ≠ 클라이언트 상태 — 서버 데이터는 비동기·공유·캐시·만료되는 별개 범주다. 전역 클라 store에 수동 복사하지 말고 데이터 패칭 계층으로 다룬다."
  - "모든 비동기 데이터는 로딩·에러·빈 상태를 가진다 — 성공만 가정하지 않는다. 특히 에러와 빈 결과를 항상 처리한다."
  - "캐시는 키로 식별한다 — 쿼리 키(자원+파라미터)로 캐시를 정규화하면 같은 데이터의 중복 요청이 자동으로 합쳐진다."
  - "stale-while-revalidate — 캐시된 값을 즉시 보여주고 백그라운드에서 갱신한다. 사용자는 빈 화면 대신 (조금 낡았어도) 즉시 데이터를 본다."
  - "변경 후에는 무효화로 동기화 — 쓰기(mutation) 성공 시 관련 쿼리를 무효화해 서버를 진실원(SoT)으로 다시 맞춘다. 로컬 배열을 손으로 고치지 않는다."
  - "낙관적 업데이트는 롤백과 한 세트 — 즉시 UI를 바꾸려면 실패 시 이전 상태로 되돌릴 수 있어야 한다."
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

# 🔄 서버 상태 · 데이터 패칭 (Server State & Data Fetching)

> 서버가 소유한 데이터(목록·상세 등)는 클라이언트 UI 상태와 **다른 범주**다 — 비동기로 오고, 여러 화면이 공유하고, 캐시되고, 시간이 지나면 낡는다. 이런 데이터를 전용 캐시 계층으로 다룰 때, API 응답을 전역 store에 수동으로 쌓고 있을 때 읽는다.

흔한 안티패턴은 **서버 데이터를 전역 클라이언트 store(Pinia/Redux 등)에 직접 복사해 손으로 동기화하는 것**이다. 그러면 화면마다 따로 fetch해 중복 요청이 나고, 한 곳에서 바꾼 데이터가 다른 곳과 어긋나고, 로딩·에러 처리가 빠진다. 서버 상태는 "내가 소유한 상태"가 아니라 "서버 상태의 캐시"로 봐야 한다 — 그래서 캐시·무효화·재검증을 대신 해주는 데이터 패칭 라이브러리(TanStack Query·SWR 등)에 맡긴다. 이 스킬은 **서버 상태**를 다루고, 폼 입력·모달 같은 **클라이언트 상태**는 `state-management`, HTTP 클라이언트 자체(인터셉터·인증)는 `api-standard`를 본다.

## 1. 핵심 원칙

- **서버 상태 ≠ 클라이언트 상태** — 서버 데이터는 비동기·공유·캐시·만료되는 별개 범주다. 전역 클라 store에 수동 복사하지 말고 데이터 패칭 계층으로 다룬다.
- **모든 비동기 데이터는 로딩·에러·빈 상태를 가진다** — 성공만 가정하지 않는다. 특히 에러와 빈 결과를 항상 처리한다.
- **캐시는 키로 식별한다** — 쿼리 키(자원+파라미터)로 캐시를 정규화하면 같은 데이터의 중복 요청이 자동으로 합쳐진다.
- **stale-while-revalidate** — 캐시된 값을 즉시 보여주고 백그라운드에서 갱신한다. 사용자는 빈 화면 대신 (조금 낡았어도) 즉시 데이터를 본다.
- **변경 후에는 무효화로 동기화** — 쓰기(mutation) 성공 시 관련 쿼리를 무효화해 서버를 진실원(SoT)으로 다시 맞춘다. 로컬 배열을 손으로 고치지 않는다.
- **낙관적 업데이트는 롤백과 한 세트** — 즉시 UI를 바꾸려면 실패 시 이전 상태로 되돌릴 수 있어야 한다.

## 2. 규칙

### 2-1. 서버 상태를 전역 클라 store에 수동 복사하지 않는다

```text
❌ 금지 — 화면마다 fetch해서 전역 store에 복사, 동기화도 수동
   onMounted: const r = await api.getUsers(); store.users = r   // 다른 화면도 각자 → 중복·불일치

✅ 권장 — 데이터 패칭 계층에 위임 (캐시·중복요청 제거·갱신 자동)
   const { data, isLoading, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
```

### 2-2. 로딩·에러·빈 상태를 모두 처리한다

```text
❌ 금지 — 성공만 가정 → 로딩 중 깨지고, 에러는 조용히 사라짐
   <div>{{ data.name }}</div>

✅ 권장 — 4갈래를 명시
   isLoading → 스켈레톤/스피너
   isError   → 에러 + 재시도 UI
   빈 결과    → "데이터 없음" 안내 (빈 배열 ≠ 에러)
   성공       → 렌더
```

### 2-3. 쿼리 키로 캐시·중복 요청을 합친다

```text
❌ 금지 — 같은 데이터를 컴포넌트마다 따로 요청 → N번 호출
✅ 권장 — 동일 쿼리 키 → 캐시 공유 + 동시 요청 dedup → 1번만 호출
   키에 파라미터를 포함: ['user', userId]  /  ['todos', { status: 'open' }]
```

### 2-4. 변경 후에는 무효화로 동기화한다

```text
❌ 금지 — mutation 후 로컬 캐시를 손으로 수정 → 서버 계산 결과와 어긋남
   addTodo(t); cache.todos.push(t)   // 서버가 부여한 id·정렬·파생필드 누락

✅ 권장 — 성공 시 관련 쿼리 무효화 → 재패칭으로 진실원에 맞춤
   useMutation({ mutationFn: addTodo, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) })
```

### 2-5. 낙관적 업데이트는 롤백을 보장한다

```text
✅ 권장 — 즉시 반영하되 실패 시 복원
   onMutate:  진행 중 쿼리 취소 → 이전 값 스냅샷 → 캐시에 낙관적 적용
   onError:   스냅샷으로 롤백
   onSettled: 무효화로 서버와 최종 동기화
```

### 2-6. 캐시 수명(staleTime/gc)을 의식적으로 정한다

```text
- staleTime: 이 시간 동안은 "신선"으로 보고 재요청 안 함 (과패칭 방지)
- 자주 안 바뀌는 데이터는 길게, 실시간성 높은 데이터는 짧게.
- 실시간이 꼭 필요하면 폴링/구독을 쓰되, 그건 `realtime-client`(WebSocket 등)를 본다.
```

## 3. 흔한 실수

- ❌ 서버 데이터를 전역 store에 복사하고 손으로 동기화 → 중복 요청·화면 간 불일치
- ❌ 로딩/에러/빈 상태 누락 → 로딩 중 크래시, 에러가 조용히 묻힘
- ❌ `useEffect`/`onMounted`에서 직접 fetch하며 취소·경쟁·중복을 직접 다루다 버그
- ❌ mutation 후 로컬 캐시를 수동 편집 → 서버 파생 데이터(id·정렬·합계)와 어긋남
- ❌ 낙관적 업데이트만 하고 실패 롤백을 안 함 → UI가 서버와 영구히 어긋남
- ❌ 모든 데이터에 staleTime 0 → 과도한 재요청 / 또는 무한 캐시로 영원히 낡은 값

> **적용 팁**: "이 데이터의 진실원이 서버인가?"를 물어 서버 상태와 클라이언트 상태를 가른다. 서버 상태는 데이터 패칭 계층, 클라이언트 상태는 `state-management`. HTTP 클라이언트 설정(인터셉터·토큰)은 `api-standard`.

## 4. 체크리스트

- [ ] 서버 데이터를 전역 클라 store에 수동 복사하지 않고 데이터 패칭 계층에 맡겼는가
- [ ] 로딩·에러·빈 상태를 모두 처리했는가
- [ ] 쿼리 키로 캐시·중복요청 제거가 되는가 (파라미터를 키에 포함)
- [ ] 변경(mutation) 후 관련 쿼리를 무효화해 서버와 동기화했는가
- [ ] 낙관적 업데이트에 실패 롤백이 있는가
- [ ] 캐시 수명(staleTime 등)을 데이터 특성에 맞게 정했는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀 스택에 맞는 라이브러리로 같은 패턴을 적용한다. 위 1~4의 원칙이 표준이고, 부록은 적용 사례일 뿐이다.

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
