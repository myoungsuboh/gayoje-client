---
name: React 状態管理 (Zustand / Redux Toolkit)
description: React アプリケーションのグローバル状態管理戦略 — Zustand（軽量）、Redux Toolkit（複雑なアプリ）、サーバー状態（TanStack Query/SWR）。状態をどこに置くかの判断基準と、各ライブラリの正しい使用パターンを扱う。Keywords: Zustand, Redux Toolkit, TanStack Query, useSelector, slice, immer, server-state, client-state.
rules:
  - "UI 状態（モーダルの開閉）にはローカルの useState を、共有クライアント状態には Zustand/RTK を、サーバーデータキャッシュには TanStack Query/SWR を使う。"
  - "Zustand のストアは機能ドメインごとに分割する — すべてを 1 つの巨大なストアに集約しない。"
  - "Redux Toolkit の createSlice を使ってアクションとリデューサーを同じ場所にまとめる — dispatch(action) の呼び出しを直接書かない。"
  - "TanStack Query の queryKey は、クエリが依存するすべてのパラメータを含む配列として定義し、キャッシュの無効化が正確に機能するようにする。"
  - "状態をグローバルに引き上げる前に、Props Drilling が実際に問題であり、Context では解決できないことをまず確認する。"
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

# 🗃️ React 状態管理

> 状態を適切な場所で管理する。UI 状態、クライアント状態、サーバー状態を区別し、それぞれに適したツールを使う。

## 1. 基本原則

| 状態の種類 | 配置場所 | ツール |
|---|---|---|
| UI 状態（モーダル、タブ選択） | コンポーネントローカル | useState |
| 共有クライアント状態 | グローバルストア | Zustand / Redux Toolkit |
| サーバーデータキャッシュ | クエリキャッシュ | TanStack Query / SWR |

- 状態をグローバルに引き上げる前に、「この状態は本当に複数のコンポーネントで同時に必要か？」と問う。
- サーバー API レスポンスを useState+useEffect で管理すると、キャッシュ、リトライ、同期ロジックを手動で実装する必要がある — 代わりに TanStack Query を使う。

## 2. ルール

### 2-1. Zustand の基本パターン

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

### 2-2. Redux Toolkit の createSlice

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

### 2-3. サーバー状態のための TanStack Query

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

## 3. よくある間違い

- サーバー API レスポンスを Zustand/Redux に保存すると、キャッシュと再検証を手動で実装する必要がある — 代わりに TanStack Query を使う。
- `useSelector(state => state)` はルート状態全体を購読するため、あらゆる変更で再レンダリングが発生する。
- queryKey 配列から依存パラメータを省略すると、キャッシュが誤って再利用される。

## 4. チェックリスト

- [ ] UI 状態はローカル、共有クライアント状態は Zustand/RTK、サーバー状態は TanStack Query になっているか？
- [ ] Zustand で必要な状態だけを選択的に購読しているか？
- [ ] TanStack Query の queryKey はすべての依存パラメータを含んでいるか？
- [ ] Redux を使う場合、アクションとリデューサーは createSlice で同じ場所にまとめられているか？
