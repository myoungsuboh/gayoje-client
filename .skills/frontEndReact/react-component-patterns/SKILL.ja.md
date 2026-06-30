---
name: React コンポーネントパターン
description: React アプリケーションのコンポーネント設計パターン — コンポジション、Custom Hook の抽出、制御/非制御コンポーネントの分離、再利用可能な UI コンポーネント構造。新しいコンポーネントを設計する際や既存のものをリファクタリングする際に読むこと。Keywords: React.FC, props, composition, children, forwardRef, compound-component, controlled, uncontrolled.
rules:
  - "コンポーネントは単一責任を持つ — UI ロジックとビジネスロジックを分離し、ビジネスロジックは Custom Hook に抽出する。"
  - "共通 UI は variant、size、state を props として公開する安定した props インターフェースで設計する。"
  - "children コンポジションを優先する。Props Drilling が 2 階層を超える場合は Context または状態管理ライブラリを検討する。"
  - "制御（value+onChange）と非制御（defaultValue+ref）のコンポーネントパターンを混在させない。"
  - "forwardRef は DOM への直接アクセスが必要なライブラリレベルのコンポーネントにのみ使用し、一般的なコンポーネントには使わない。"
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

# ⚛️ React コンポーネントパターン

> 再利用可能で保守しやすい React コンポーネントを設計する。UI ロジックとビジネスロジックを分離し、コンポジション優先の原則に従う。

## 1. 基本原則

- 単一責任 — コンポーネントはレンダリングか状態/イベントロジックのどちらか一方を担い、両方を担わない。
- 再利用性を確保するため、共通 UI は安定した props インターフェースで設計する。
- children コンポジションを優先し、Props Drilling が深くなったら Context へ移行する。
- 制御と非制御のコンポーネントパターンを混在させない。

## 2. ルール

### 2-1. コンポジション優先

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

### 2-2. ロジックを Custom Hook に抽出する

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

### 2-3. 制御コンポーネントと非制御コンポーネント

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

## 3. よくある間違い

- コンポーネントファイルが約 200 行を超えたら分割のシグナル — ロジックを Custom Hook に、サブ UI を別コンポーネントに抽出する。
- 配列のインデックスを `key` に使うと再レンダリング時に状態が誤って再利用される — 一意の ID を使う。
- コンポーネントの中に別のコンポーネントを定義すると、レンダリングごとに新しい参照が生成され、パフォーマンスが低下する。

## 4. チェックリスト

- [ ] ビジネスロジックは Custom Hook に抽出されているか？
- [ ] Props Drilling は 2 階層以下か？（それ以上なら Context/状態管理を検討）
- [ ] リスト項目に一意の `key` 値を使っているか？
- [ ] 制御/非制御パターンを一貫して選択しているか？
