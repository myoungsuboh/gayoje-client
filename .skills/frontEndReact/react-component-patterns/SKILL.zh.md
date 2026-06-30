---
name: React 组件模式
description: React 应用的组件设计模式 — 组合、Custom Hook 抽取、受控/非受控组件的分离，以及可复用的 UI 组件结构。在设计新组件或重构现有组件时阅读。Keywords: React.FC, props, composition, children, forwardRef, compound-component, controlled, uncontrolled.
rules:
  - "组件应具备单一职责 — 将 UI 逻辑与业务逻辑分离，并把业务逻辑抽取到 Custom Hook 中。"
  - "用稳定的 props 接口设计通用 UI，将 variant、size 和 state 作为 props 暴露。"
  - "优先使用 children 组合；当 Props Drilling 超过 2 层时，考虑使用 Context 或状态管理库。"
  - "不要混用受控（value+onChange）与非受控（defaultValue+ref）的组件模式。"
  - "仅对需要直接访问 DOM 的库级组件使用 forwardRef，而非用于一般组件。"
tags:
  - "React.FC"
  - "props"
  - "composition"
  - "children"
  - "forwardRef"
  - "compound-component"
  - "controlled"
  - "uncontrolled"
---

# ⚛️ React 组件模式

> 设计可复用且易维护的 React 组件。将 UI 逻辑与业务逻辑分离，遵循组合优先的原则。

## 1. 核心原则

- 单一职责 — 组件要么负责渲染，要么负责状态/事件逻辑，而非两者兼顾。
- 用稳定的 props 接口设计通用 UI，以确保可复用性。
- 优先使用 children 组合；当 Props Drilling 变深时升级为 Context。
- 不要混用受控与非受控的组件模式。

## 2. 规则

### 2-1. 组合优先

```jsx
// ❌ Monolithic component — hard to reuse, complex to test
function UserCard({ user, onEdit, showAvatar, avatarSize }) { ... }

// ✅ Composition — each part as an independent component
function UserCard({ children }) {
  return <div className="user-card">{children}</div>
}
UserCard.Avatar = function Avatar({ src, size = 'md' }) { ... }
UserCard.Name = function Name({ children }) { ... }
UserCard.Actions = function Actions({ children }) { ... }

// Usage
<UserCard>
  <UserCard.Avatar src={user.avatar} size="lg" />
  <UserCard.Name>{user.name}</UserCard.Name>
  <UserCard.Actions><button onClick={onEdit}>Edit</button></UserCard.Actions>
</UserCard>
```

### 2-2. 将逻辑抽取到 Custom Hook

```jsx
// ❌ Business logic mixed into the component
function UserList() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => { fetchUsers().then(setUsers) }, [])
  // ...
}

// ✅ Separate logic into a Custom Hook
function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    fetchUsers().then(setUsers).finally(() => setLoading(false))
  }, [])
  return { users, loading }
}

function UserList() {
  const { users, loading } = useUsers()
  if (loading) return <Spinner />
  return <ul>{users.map(u => <UserItem key={u.id} user={u} />)}</ul>
}
```

### 2-3. 受控组件与非受控组件

```jsx
// ✅ Controlled — parent owns the state
function ControlledInput({ value, onChange }) {
  return <input value={value} onChange={e => onChange(e.target.value)} />
}

// ✅ Uncontrolled — DOM owns the state (suitable for form submit)
function UncontrolledInput({ defaultValue }) {
  const ref = useRef()
  return <input defaultValue={defaultValue} ref={ref} />
}
```

## 3. 常见错误

- 当组件文件超过约 200 行时，这是拆分的信号 — 将逻辑抽取到 Custom Hook，将子 UI 抽取到独立组件。
- 使用数组索引作为 `key` 会在重新渲染时导致状态被错误复用 — 应使用唯一 ID。
- 在一个组件内部定义另一个组件，会在每次渲染时生成新的引用，导致性能下降。

## 4. 检查清单

- [ ] 业务逻辑是否已抽取到 Custom Hook？
- [ ] Props Drilling 是否在 2 层以内？（若超过，考虑 Context/状态管理）
- [ ] 列表项是否使用了唯一的 `key` 值？
- [ ] 受控/非受控模式是否一致地选用？
