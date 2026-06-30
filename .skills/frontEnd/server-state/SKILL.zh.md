---
name: 服务器状态 · 数据获取 (Server State & Data Fetching)
description: 通过专用缓存层(数据获取库)处理服务器所拥有的异步数据的栈中立标准 — 与客户端状态分离、加载/错误/空状态处理、查询键缓存·去重请求、变更后失效、乐观更新+回滚。在加载列表·详情、缓存·刷新·同步、或正在把 API 响应堆进全局 store 时阅读。关键词: server-state, data-fetching, cache, invalidation, optimistic-update, stale-while-revalidate, TanStack-Query, SWR.
rules:
  - "服务器状态 ≠ 客户端状态 — 服务器数据是异步·共享·缓存·会过期的独立类别。不要手动复制到全局客户端 store,而用数据获取层处理。"
  - "所有异步数据都有加载·错误·空状态 — 不要只假设成功。尤其要始终处理错误和空结果。"
  - "缓存以键标识 — 用查询键(资源+参数)规范化缓存后,同一数据的重复请求会自动合并。"
  - "stale-while-revalidate — 立即显示缓存值并在后台刷新。用户看到的是立即的数据(即便略旧)而非空白屏。"
  - "变更后通过失效同步 — 写入(mutation)成功时使相关查询失效,以服务器为真实来源(SoT)重新对齐。不要手动修改本地数组。"
  - "乐观更新与回滚成套 — 要立即改变 UI,必须能在失败时回退到之前的状态。"
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

# 🔄 服务器状态 · 数据获取 (Server State & Data Fetching)

> 服务器所拥有的数据(列表·详情等)与客户端 UI 状态是**不同的类别** — 它异步到达,被多个界面共享,被缓存,随时间变旧。在用专用缓存层处理此类数据时、在手动把 API 响应堆进全局 store 时阅读。

常见的反模式是**把服务器数据直接复制到全局客户端 store(Pinia/Redux 等)并手动同步**。这样会导致每个界面各自 fetch 产生重复请求,一处改的数据与另一处不一致,且缺失加载·错误处理。服务器状态应被视为"服务器状态的缓存"而非"我所拥有的状态" — 因此交给替你处理缓存·失效·重新验证的数据获取库(TanStack Query·SWR 等)。本技能处理**服务器状态**,表单输入·弹窗等**客户端状态**见 `state-management`,HTTP 客户端本身(拦截器·认证)见 `api-standard`。

## 1. 核心原则

- **服务器状态 ≠ 客户端状态** — 服务器数据是异步·共享·缓存·会过期的独立类别。不要手动复制到全局客户端 store,而用数据获取层处理。
- **所有异步数据都有加载·错误·空状态** — 不要只假设成功。尤其要始终处理错误和空结果。
- **缓存以键标识** — 用查询键(资源+参数)规范化缓存后,同一数据的重复请求会自动合并。
- **stale-while-revalidate** — 立即显示缓存值并在后台刷新。用户看到的是立即的数据(即便略旧)而非空白屏。
- **变更后通过失效同步** — 写入(mutation)成功时使相关查询失效,以服务器为真实来源(SoT)重新对齐。不要手动修改本地数组。
- **乐观更新与回滚成套** — 要立即改变 UI,必须能在失败时回退到之前的状态。

## 2. 规则

### 2-1. 不要手动把服务器状态复制到全局客户端 store

```text
❌ 금지 — 화면마다 fetch해서 전역 store에 복사, 동기화도 수동
   onMounted: const r = await api.getUsers(); store.users = r   // 다른 화면도 각자 → 중복·불일치

✅ 권장 — 데이터 패칭 계층에 위임 (캐시·중복요청 제거·갱신 자동)
   const { data, isLoading, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
```

### 2-2. 处理所有的加载·错误·空状态

```text
❌ 금지 — 성공만 가정 → 로딩 중 깨지고, 에러는 조용히 사라짐
   <div>{{ data.name }}</div>

✅ 권장 — 4갈래를 명시
   isLoading → 스켈레톤/스피너
   isError   → 에러 + 재시도 UI
   빈 결과    → "데이터 없음" 안내 (빈 배열 ≠ 에러)
   성공       → 렌더
```

### 2-3. 用查询键合并缓存·重复请求

```text
❌ 금지 — 같은 데이터를 컴포넌트마다 따로 요청 → N번 호출
✅ 권장 — 동일 쿼리 키 → 캐시 공유 + 동시 요청 dedup → 1번만 호출
   키에 파라미터를 포함: ['user', userId]  /  ['todos', { status: 'open' }]
```

### 2-4. 变更后通过失效同步

```text
❌ 금지 — mutation 후 로컬 캐시를 손으로 수정 → 서버 계산 결과와 어긋남
   addTodo(t); cache.todos.push(t)   // 서버가 부여한 id·정렬·파생필드 누락

✅ 권장 — 성공 시 관련 쿼리 무효화 → 재패칭으로 진실원에 맞춤
   useMutation({ mutationFn: addTodo, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) })
```

### 2-5. 乐观更新保证回滚

```text
✅ 권장 — 즉시 반영하되 실패 시 복원
   onMutate:  진행 중 쿼리 취소 → 이전 값 스냅샷 → 캐시에 낙관적 적용
   onError:   스냅샷으로 롤백
   onSettled: 무효화로 서버와 최종 동기화
```

### 2-6. 有意识地决定缓存寿命(staleTime/gc)

```text
- staleTime: 이 시간 동안은 "신선"으로 보고 재요청 안 함 (과패칭 방지)
- 자주 안 바뀌는 데이터는 길게, 실시간성 높은 데이터는 짧게.
- 실시간이 꼭 필요하면 폴링/구독을 쓰되, 그건 `realtime-client`(WebSocket 등)를 본다.
```

## 3. 常见错误

- ❌ 把服务器数据复制到全局 store 并手动同步 → 重复请求·界面间不一致
- ❌ 缺失加载/错误/空状态 → 加载中崩溃,错误被悄然掩埋
- ❌ 在 `useEffect`/`onMounted` 中直接 fetch 并自行处理取消·竞态·重复而产生 bug
- ❌ mutation 后手动编辑本地缓存 → 与服务器派生数据(id·排序·合计)不一致
- ❌ 只做乐观更新而无失败回滚 → UI 与服务器永久不一致
- ❌ 对所有数据用 staleTime 0 → 过度重新请求 / 或无限缓存留下永远陈旧的值

> **应用提示**: 通过追问"这份数据的真实来源是服务器吗?"来区分服务器状态与客户端状态。服务器状态用数据获取层,客户端状态用 `state-management`。HTTP 客户端配置(拦截器·令牌)用 `api-standard`。

## 4. 检查清单

- [ ] 是否没有手动把服务器数据复制到全局客户端 store,而交给了数据获取层
- [ ] 是否处理了所有的加载·错误·空状态
- [ ] 是否通过查询键实现了缓存·去重请求(参数包含在键中)
- [ ] 变更(mutation)后是否使相关查询失效以与服务器同步
- [ ] 乐观更新是否有失败回滚
- [ ] 是否根据数据特性设定了缓存寿命(staleTime 等)

## 附录: 各栈示例

> 以下是参考用的实现示例。用适合团队栈的库以相同模式应用。以上 1~4 的原则为标准,附录只是应用案例。

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
