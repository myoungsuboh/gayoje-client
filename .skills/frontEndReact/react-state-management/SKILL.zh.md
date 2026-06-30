---
name: React 状态管理 (Zustand / Redux Toolkit)
description: React 应用的全局状态管理策略 — Zustand（轻量）、Redux Toolkit（复杂应用）和服务端状态（TanStack Query/SWR）。涵盖状态应放在何处的决策标准，以及每个库的正确使用模式。Keywords: Zustand, Redux Toolkit, TanStack Query, useSelector, slice, immer, server-state, client-state.
rules:
  - "UI 状态（弹窗开/关）使用本地 useState，共享客户端状态使用 Zustand/RTK，服务端数据缓存使用 TanStack Query/SWR。"
  - "按功能领域拆分 Zustand 的 store — 不要把所有内容都合并到一个庞大的 store 中。"
  - "使用 Redux Toolkit 的 createSlice 将 action 与 reducer 放在一处 — 不要直接编写 dispatch(action) 调用。"
  - "将 TanStack Query 的 queryKey 定义为包含查询所依赖的所有参数的数组，以便缓存失效能精确生效。"
  - "在将状态提升为全局之前，先确认 Props Drilling 确实是问题，并且 Context 无法解决它。"
tags:
  - "Zustand"
  - "Redux Toolkit"
  - "TanStack Query"
  - "useSelector"
  - "slice"
  - "immer"
  - "server-state"
  - "client-state"
  - "SWR"
---

# 🗃️ React 状态管理

> 在正确的位置管理状态。区分 UI 状态、客户端状态和服务端状态，并为每种状态使用合适的工具。

## 1. 核心原则

| 状态类型 | 位置 | 工具 |
|---|---|---|
| UI 状态（弹窗、标签选择） | 组件本地 | useState |
| 共享客户端状态 | 全局 store | Zustand / Redux Toolkit |
| 服务端数据缓存 | 查询缓存 | TanStack Query / SWR |

- 在将状态提升为全局之前，先问："这个状态是否真的需要同时被多个组件使用？"
- 用 useState+useEffect 管理服务端 API 响应需要手动实现缓存、重试和同步逻辑 — 应改用 TanStack Query。

## 2. 规则

### 2-1. Zustand 基本模式

```js
// store/userStore.js
import { create } from 'zustand'

export const useUserStore = create((set, get) => ({
  user: null,
  isLoggedIn: false,
  login: (user) => set({ user, isLoggedIn: true }),
  logout: () => set({ user: null, isLoggedIn: false }),
}))

// Selective subscription to avoid unnecessary re-renders
function Avatar() {
  const user = useUserStore(state => state.user)
  return <img src={user?.avatar} />
}
```

### 2-2. Redux Toolkit 的 createSlice

```js
// features/cart/cartSlice.js
import { createSlice } from '@reduxjs/toolkit'

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [], total: 0 },
  reducers: {
    addItem: (state, action) => {
      state.items.push(action.payload)  // Immer handles immutability automatically
    },
    removeItem: (state, action) => {
      state.items = state.items.filter(item => item.id !== action.payload)
    },
  },
})

export const { addItem, removeItem } = cartSlice.actions
export default cartSlice.reducer
```

### 2-3. 用 TanStack Query 管理服务端状态

```js
// Include all dependency parameters in queryKey
const { data, isLoading, error } = useQuery({
  queryKey: ['products', { category, page, sort }],
  queryFn: () => fetchProducts({ category, page, sort }),
  staleTime: 5 * 60 * 1000,  // cache valid for 5 minutes
})

// Invalidate cache after mutation
const mutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
})
```

## 3. 常见错误

- 将服务端 API 响应存储在 Zustand/Redux 中需要手动实现缓存和重新验证 — 应改用 TanStack Query。
- `useSelector(state => state)` 会订阅整个根状态，导致每次变更都重新渲染。
- 从 queryKey 数组中省略依赖参数会导致缓存被错误复用。

## 4. 检查清单

- [ ] UI 状态是否在本地、共享客户端状态是否在 Zustand/RTK、服务端状态是否在 TanStack Query？
- [ ] 是否在 Zustand 中仅选择性订阅所需的状态？
- [ ] TanStack Query 的 queryKey 是否包含所有依赖参数？
- [ ] 若使用 Redux，action 与 reducer 是否用 createSlice 放在一处？
