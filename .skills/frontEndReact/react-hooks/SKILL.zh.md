---
name: React Hooks 模式
description: React Hooks（useState, useEffect, useCallback, useMemo, useRef, Custom Hooks）的正确用法规则与常见陷阱 — 涵盖缺失依赖数组、无限循环、内存泄漏和过期闭包。在编写或审查 Hook 用法时阅读。Keywords: useState, useEffect, useCallback, useMemo, useRef, dependency-array, cleanup, stale-closure.
rules:
  - "切勿从 useEffect 依赖数组中省略值 — 启用 ESLint 的 exhaustive-deps 规则以捕获遗漏。"
  - "在 useEffect 中订阅事件、定时器或外部源时，务必返回一个 cleanup 函数以防止内存泄漏。"
  - "当把函数传给子组件或作为依赖时，用 useCallback 稳定函数引用，用 useMemo 稳定对象/数组引用。"
  - "Custom Hook 名称务必以 'use' 作为前缀。"
  - "仅在组件的顶层调用 Hooks — 切勿在条件语句或循环内调用。"
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

# 🪝 React Hooks 模式

> React Hooks 的规则与常见陷阱。依赖数组、过期闭包和内存泄漏是最频繁出现的问题区域。

## 1. 核心原则

- 切勿从 useEffect 依赖数组中省略值 — 启用 `eslint-plugin-react-hooks` 的 `exhaustive-deps`。
- 用 cleanup 函数防止内存泄漏。
- 用 `useCallback` 和 `useMemo` 抑制由不稳定引用（函数、对象）引起的不必要重新渲染。

## 2. 规则

### 2-1. useEffect 依赖数组

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

### 2-2. 用 Cleanup 防止内存泄漏

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

### 2-3. 用 useCallback 稳定引用

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

### 2-4. 过期闭包模式

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

## 3. 常见错误

- 在内部引用 props/state 的同时，为了"仅在挂载时运行一次"而使用 `[]` 作为依赖数组 → 过期闭包。
- 将 `async` 函数直接作为 useEffect 回调传入会产生警告 — 应在内部改用 async IIFE。
- 修改 `useRef` 的值不会触发重新渲染 — 当值需要反映到 UI 时，应使用 `useState`。

## 4. 检查清单

- [ ] 所有被引用的值是否都包含在 useEffect 依赖数组中？
- [ ] 是否为订阅、定时器和事件监听器返回了 cleanup 函数？
- [ ] 传给子组件的函数是否用 useCallback 进行了稳定？
- [ ] Custom Hook 名称是否以 'use' 开头？
- [ ] Hooks 是否仅在顶层、在条件语句和循环之外被调用？
