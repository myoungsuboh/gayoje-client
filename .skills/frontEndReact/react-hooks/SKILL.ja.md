---
name: React Hooks パターン
description: React Hooks（useState, useEffect, useCallback, useMemo, useRef, Custom Hooks）の正しい使い方のルールとよくある落とし穴 — 依存配列の欠落、無限ループ、メモリリーク、stale closure を扱う。Hook の使用を書いたりレビューしたりする際に読むこと。Keywords: useState, useEffect, useCallback, useMemo, useRef, dependency-array, cleanup, stale-closure.
rules:
  - "useEffect の依存配列から値を省略しない — ESLint の exhaustive-deps ルールを有効にして漏れを検出する。"
  - "useEffect でイベント、タイマー、外部ソースを購読する際は、メモリリークを防ぐため必ず cleanup 関数を返す。"
  - "子コンポーネントに渡すときや依存として使うときは、関数の参照を useCallback で、オブジェクト/配列の参照を useMemo で安定させる。"
  - "Custom Hook の名前は必ず 'use' で始める。"
  - "Hooks はコンポーネントのトップレベルでのみ呼び出す — 条件文やループの中では決して呼ばない。"
tags:
  - "useState"
  - "useEffect"
  - "useCallback"
  - "useMemo"
  - "useRef"
  - "dependency-array"
  - "cleanup"
  - "stale-closure"
---

# 🪝 React Hooks パターン

> React Hooks のルールとよくある落とし穴。依存配列、stale closure、メモリリークが最も頻発する問題領域である。

## 1. 基本原則

- useEffect の依存配列から値を省略しない — `eslint-plugin-react-hooks` の `exhaustive-deps` を有効にする。
- cleanup 関数でメモリリークを防ぐ。
- 不安定な参照（関数、オブジェクト）による不要な再レンダリングを `useCallback` と `useMemo` で抑制する。

## 2. ルール

### 2-1. useEffect の依存配列

```jsx
// ❌ Missing dependency — won't re-run when userId changes
useEffect(() => {
  fetchUser(userId).then(setUser)
}, []) // userId missing

// ✅ Correct
useEffect(() => {
  fetchUser(userId).then(setUser)
}, [userId])
```

### 2-2. メモリリークを防ぐ cleanup

```jsx
// ❌ No cleanup — calls setState after unmount, causing warnings/bugs
useEffect(() => {
  const timer = setInterval(() => setCount(c => c + 1), 1000)
  // no cleanup
}, [])

// ✅ Return cleanup function
useEffect(() => {
  const timer = setInterval(() => setCount(c => c + 1), 1000)
  return () => clearInterval(timer)
}, [])
```

### 2-3. useCallback で参照を安定させる

```jsx
// ❌ handleSubmit gets a new reference on every render → unnecessary child re-renders
function Form({ onSubmit }) {
  const handleSubmit = () => onSubmit(data)
  return <SubmitButton onClick={handleSubmit} />
}

// ✅ Stable reference
function Form({ onSubmit }) {
  const handleSubmit = useCallback(() => onSubmit(data), [onSubmit, data])
  return <SubmitButton onClick={handleSubmit} />
}
```

### 2-4. Stale Closure パターン

```jsx
// ❌ Stale closure — count is always 0 (captured at initialization)
useEffect(() => {
  const id = setInterval(() => console.log(count), 1000)
  return () => clearInterval(id)
}, []) // missing count dependency

// ✅ Functional updater to reference the latest value
setCount(prev => prev + 1)

// Or use a ref to always hold the latest value
const countRef = useRef(count)
useEffect(() => { countRef.current = count }, [count])
```

## 3. よくある間違い

- 内部で props/state を参照しながら「マウント時に一度だけ実行」のために `[]` を依存配列に使う → stale closure。
- `async` 関数を useEffect のコールバックとして直接渡すと警告が出る — 代わりに内部で async IIFE を使う。
- `useRef` の値を変更しても再レンダリングは発生しない — 値を UI に反映する必要がある場合は `useState` を使う。

## 4. チェックリスト

- [ ] 参照しているすべての値が useEffect の依存配列に含まれているか？
- [ ] 購読、タイマー、イベントリスナーに対して cleanup 関数を返しているか？
- [ ] 子に渡す関数を useCallback で安定させているか？
- [ ] Custom Hook の名前は 'use' で始まっているか？
- [ ] Hooks は条件文やループの外、トップレベルでのみ呼び出されているか？
