---
name: React Component Patterns
description: Component design patterns for React applications — Composition, Custom Hook extraction, controlled/uncontrolled component separation, and reusable UI component structure. Read when designing new components or refactoring existing ones. Keywords: React.FC, props, composition, children, forwardRef, compound-component, controlled, uncontrolled.
rules:
  - "A component has a single responsibility — separate UI logic from business logic, and extract business logic into Custom Hooks."
  - "Design common UI with a stable props interface exposing variant, size, and state as props."
  - "Prefer children composition; if Props Drilling exceeds 2 levels, consider Context or a state management library."
  - "Do not mix controlled (value+onChange) and uncontrolled (defaultValue+ref) component patterns."
  - "Use forwardRef only for library-level components that require direct DOM access, not for general components."
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

# ⚛️ React Component Patterns

> Design React components that are reusable and maintainable. Separate UI logic from business logic and follow composition-first principles.

## 1. Core Principles

- Single responsibility — a component either handles rendering or state/event logic, not both.
- Design common UI with a stable props interface to ensure reusability.
- Prefer children composition; escalate to Context when Props Drilling becomes deep.
- Do not mix controlled and uncontrolled component patterns.

## 2. Rules

### 2-1. Composition First

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

### 2-2. Extract Logic into Custom Hooks

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

### 2-3. Controlled vs Uncontrolled Components

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

## 3. Common Mistakes

- When a component file exceeds ~200 lines, it's a signal to split — extract logic into a Custom Hook and sub-UI into separate components.
- Using array index as `key` causes incorrect state reuse on re-renders — use unique IDs.
- Defining a component inside another component creates a new reference on every render, causing performance degradation.

## 4. Checklist

- [ ] Is business logic extracted into a Custom Hook?
- [ ] Is Props Drilling 2 levels or less? (if more, consider Context/state management)
- [ ] Are unique `key` values used for list items?
- [ ] Is the controlled/uncontrolled pattern chosen consistently?
