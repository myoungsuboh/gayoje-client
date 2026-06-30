---
name: React State Management (Zustand / Redux Toolkit)
description: Global state management strategies for React applications — Zustand (lightweight), Redux Toolkit (complex apps), and server state (TanStack Query/SWR). Covers the decision criteria for where to place state and correct usage patterns for each library. Keywords: Zustand, Redux Toolkit, TanStack Query, useSelector, slice, immer, server-state, client-state.
rules:
  - "Use local useState for UI state (modal open/close), Zustand/RTK for shared client state, and TanStack Query/SWR for server data cache."
  - "Split Zustand stores by feature domain — do not consolidate everything into one large store."
  - "Use Redux Toolkit's createSlice to co-locate actions and reducers — do not write dispatch(action) calls directly."
  - "Define TanStack Query's queryKey as an array that includes all parameters the query depends on, so cache invalidation works precisely."
  - "Before lifting state globally, verify that Props Drilling is actually a problem and that Context cannot solve it first."
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

# 🗃️ React State Management

> Manage state in the right place. Distinguish between UI state, client state, and server state, and use the appropriate tool for each.

## 1. Core Principles

| State type | Location | Tool |
|---|---|---|
| UI state (modal, tab selection) | Local to component | useState |
| Shared client state | Global store | Zustand / Redux Toolkit |
| Server data cache | Query cache | TanStack Query / SWR |

- Before lifting state globally, ask: "Is this state truly needed in multiple components simultaneously?"
- Managing server API responses with useState+useEffect requires implementing caching, retry, and sync logic manually — use TanStack Query instead.

## 2. Rules

### 2-1. Zustand Basic Pattern

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

### 2-2. Redux Toolkit createSlice

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

### 2-3. TanStack Query for Server State

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

## 3. Common Mistakes

- Storing server API responses in Zustand/Redux requires implementing caching and revalidation manually — use TanStack Query instead.
- `useSelector(state => state)` subscribes to the entire root state, causing a re-render on every change.
- Omitting dependency parameters from the queryKey array causes incorrect cache reuse.

## 4. Checklist

- [ ] Is UI state local, shared client state in Zustand/RTK, and server state in TanStack Query?
- [ ] Is only the necessary state being selectively subscribed to in Zustand?
- [ ] Does the TanStack Query queryKey include all dependency parameters?
- [ ] If using Redux, are actions and reducers co-located with createSlice?
