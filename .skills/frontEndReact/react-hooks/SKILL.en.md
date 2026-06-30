---
name: React Hooks Patterns
description: Correct usage rules and common pitfalls of React Hooks (useState, useEffect, useCallback, useMemo, useRef, Custom Hooks) — covers missing dependency arrays, infinite loops, memory leaks, and stale closures. Read when writing or reviewing Hook usage. Keywords: useState, useEffect, useCallback, useMemo, useRef, dependency-array, cleanup, stale-closure.
rules:
  - "Never omit values from the useEffect dependency array — enable the ESLint exhaustive-deps rule to catch omissions."
  - "When subscribing to events, timers, or external sources in useEffect, always return a cleanup function to prevent memory leaks."
  - "Stabilize function references with useCallback and object/array references with useMemo when passing them to child components or as dependencies."
  - "Always prefix Custom Hook names with 'use'."
  - "Call Hooks only at the top level of a component — never inside conditionals or loops."
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

# 🪝 React Hooks Patterns

> Rules and common pitfalls of React Hooks. Dependency arrays, stale closures, and memory leaks are the most frequent problem areas.

## 1. Core Principles

- Never omit values from the useEffect dependency array — enable `eslint-plugin-react-hooks` `exhaustive-deps`.
- Prevent memory leaks with cleanup functions.
- Suppress unnecessary re-renders caused by unstable references (functions, objects) using `useCallback` and `useMemo`.

## 2. Rules

### 2-1. useEffect Dependency Array

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

### 2-2. Cleanup to Prevent Memory Leaks

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

### 2-3. Stabilize References with useCallback

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

### 2-4. Stale Closure Pattern

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

## 3. Common Mistakes

- Using `[]` as the dependency array to "run only once on mount" while referencing props/state inside → stale closure.
- Passing an `async` function directly as the useEffect callback causes a warning — use an async IIFE inside instead.
- Changing a `useRef` value does not trigger a re-render — use `useState` when the value needs to be reflected in the UI.

## 4. Checklist

- [ ] Are all referenced values included in the useEffect dependency array?
- [ ] Is a cleanup function returned for subscriptions, timers, and event listeners?
- [ ] Are functions passed to children stabilized with useCallback?
- [ ] Do Custom Hook names start with 'use'?
- [ ] Are Hooks called only at the top level, outside conditionals and loops?
