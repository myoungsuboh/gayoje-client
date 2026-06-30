---
name: サーバー状態・データフェッチ (Server State & Data Fetching)
description: サーバーが所有する非同期データを専用キャッシュ層(データフェッチライブラリ)で扱うスタック中立の標準 — クライアント状態との分離、ローディング/エラー/空の処理、クエリキーによるキャッシュ・重複リクエスト除去、変更後の無効化、楽観的更新+ロールバック。一覧·詳細を読み込んだり、キャッシュ·更新·同期したり、グローバル store に API レスポンスを溜め込んでいるときに読む。キーワード: server-state, data-fetching, cache, invalidation, optimistic-update, stale-while-revalidate, TanStack-Query, SWR.
rules:
  - "サーバー状態 ≠ クライアント状態 — サーバーデータは非同期·共有·キャッシュ·失効する別カテゴリだ。グローバルなクライアント store に手動でコピーせず、データフェッチ層で扱う。"
  - "すべての非同期データはローディング·エラー·空の状態を持つ — 成功だけを前提にしない。特にエラーと空の結果を常に処理する。"
  - "キャッシュはキーで識別する — クエリキー(リソース+パラメータ)でキャッシュを正規化すれば、同じデータの重複リクエストが自動的にまとまる。"
  - "stale-while-revalidate — キャッシュされた値を即座に見せ、バックグラウンドで更新する。ユーザーは空白画面の代わりに(少し古くても)即座にデータを見る。"
  - "変更後は無効化で同期 — 書き込み(mutation)成功時に関連クエリを無効化し、サーバーを真実の源(SoT)として再整合させる。ローカル配列を手で直さない。"
  - "楽観的更新はロールバックとワンセット — UI を即座に変えるには、失敗時に以前の状態へ戻せる必要がある。"
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

# 🔄 サーバー状態・データフェッチ (Server State & Data Fetching)

> サーバーが所有するデータ(一覧·詳細など)はクライアント UI 状態とは**別カテゴリ**だ — 非同期で届き、複数の画面が共有し、キャッシュされ、時間が経つと古くなる。こうしたデータを専用キャッシュ層で扱うとき、API レスポンスをグローバル store に手動で溜め込んでいるときに読む。

よくあるアンチパターンは、**サーバーデータをグローバルなクライアント store(Pinia/Redux など)に直接コピーして手で同期すること**だ。そうすると画面ごとに別々に fetch して重複リクエストが出て、一箇所で変えたデータが他と食い違い、ローディング·エラー処理が抜ける。サーバー状態は「自分が所有する状態」ではなく「サーバー状態のキャッシュ」と見るべきだ — だからキャッシュ·無効化·再検証を代わりに行うデータフェッチライブラリ(TanStack Query·SWR など)に任せる。このスキルは**サーバー状態**を扱い、フォーム入力·モーダルのような**クライアント状態**は `state-management`、HTTP クライアント自体(インターセプター·認証)は `api-standard` を見る。

## 1. 核心原則

- **サーバー状態 ≠ クライアント状態** — サーバーデータは非同期·共有·キャッシュ·失効する別カテゴリだ。グローバルなクライアント store に手動でコピーせず、データフェッチ層で扱う。
- **すべての非同期データはローディング·エラー·空の状態を持つ** — 成功だけを前提にしない。特にエラーと空の結果を常に処理する。
- **キャッシュはキーで識別する** — クエリキー(リソース+パラメータ)でキャッシュを正規化すれば、同じデータの重複リクエストが自動的にまとまる。
- **stale-while-revalidate** — キャッシュされた値を即座に見せ、バックグラウンドで更新する。ユーザーは空白画面の代わりに(少し古くても)即座にデータを見る。
- **変更後は無効化で同期** — 書き込み(mutation)成功時に関連クエリを無効化し、サーバーを真実の源(SoT)として再整合させる。ローカル配列を手で直さない。
- **楽観的更新はロールバックとワンセット** — UI を即座に変えるには、失敗時に以前の状態へ戻せる必要がある。

## 2. ルール

### 2-1. サーバー状態をグローバルなクライアント store に手動でコピーしない

```text
❌ 금지 — 화면마다 fetch해서 전역 store에 복사, 동기화도 수동
   onMounted: const r = await api.getUsers(); store.users = r   // 다른 화면도 각자 → 중복·불일치

✅ 권장 — 데이터 패칭 계층에 위임 (캐시·중복요청 제거·갱신 자동)
   const { data, isLoading, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
```

### 2-2. ローディング·エラー·空の状態をすべて処理する

```text
❌ 금지 — 성공만 가정 → 로딩 중 깨지고, 에러는 조용히 사라짐
   <div>{{ data.name }}</div>

✅ 권장 — 4갈래를 명시
   isLoading → 스켈레톤/스피너
   isError   → 에러 + 재시도 UI
   빈 결과    → "데이터 없음" 안내 (빈 배열 ≠ 에러)
   성공       → 렌더
```

### 2-3. クエリキーでキャッシュ·重複リクエストをまとめる

```text
❌ 금지 — 같은 데이터를 컴포넌트마다 따로 요청 → N번 호출
✅ 권장 — 동일 쿼리 키 → 캐시 공유 + 동시 요청 dedup → 1번만 호출
   키에 파라미터를 포함: ['user', userId]  /  ['todos', { status: 'open' }]
```

### 2-4. 変更後は無効化で同期する

```text
❌ 금지 — mutation 후 로컬 캐시를 손으로 수정 → 서버 계산 결과와 어긋남
   addTodo(t); cache.todos.push(t)   // 서버가 부여한 id·정렬·파생필드 누락

✅ 권장 — 성공 시 관련 쿼리 무효화 → 재패칭으로 진실원에 맞춤
   useMutation({ mutationFn: addTodo, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) })
```

### 2-5. 楽観的更新はロールバックを保証する

```text
✅ 권장 — 즉시 반영하되 실패 시 복원
   onMutate:  진행 중 쿼리 취소 → 이전 값 스냅샷 → 캐시에 낙관적 적용
   onError:   스냅샷으로 롤백
   onSettled: 무효화로 서버와 최종 동기화
```

### 2-6. キャッシュ寿命(staleTime/gc)を意識的に決める

```text
- staleTime: 이 시간 동안은 "신선"으로 보고 재요청 안 함 (과패칭 방지)
- 자주 안 바뀌는 데이터는 길게, 실시간성 높은 데이터는 짧게.
- 실시간이 꼭 필요하면 폴링/구독을 쓰되, 그건 `realtime-client`(WebSocket 등)를 본다.
```

## 3. よくあるミス

- ❌ サーバーデータをグローバル store にコピーして手で同期 → 重複リクエスト·画面間の不整合
- ❌ ローディング/エラー/空の状態の欠落 → ローディング中にクラッシュ、エラーが静かに埋もれる
- ❌ `useEffect`/`onMounted` で直接 fetch し、キャンセル·競合·重複を自前で扱ってバグ
- ❌ mutation 後にローカルキャッシュを手動編集 → サーバー由来データ(id·並び·合計)と食い違う
- ❌ 楽観的更新だけして失敗ロールバックをしない → UI がサーバーと永久に食い違う
- ❌ すべてのデータに staleTime 0 → 過度な再リクエスト / または無限キャッシュで永遠に古い値

> **適用のコツ**: 「このデータの真実の源はサーバーか?」を問うてサーバー状態とクライアント状態を分ける。サーバー状態はデータフェッチ層、クライアント状態は `state-management`。HTTP クライアント設定(インターセプター·トークン)は `api-standard`。

## 4. チェックリスト

- [ ] サーバーデータをグローバルなクライアント store に手動でコピーせず、データフェッチ層に任せたか
- [ ] ローディング·エラー·空の状態をすべて処理したか
- [ ] クエリキーでキャッシュ·重複リクエスト除去ができているか(パラメータをキーに含める)
- [ ] 変更(mutation)後に関連クエリを無効化してサーバーと同期したか
- [ ] 楽観的更新に失敗ロールバックがあるか
- [ ] キャッシュ寿命(staleTime など)をデータ特性に合わせて決めたか

## 付録: スタック別の例

> 以下は参考用の実装例だ。チームのスタックに合うライブラリで同じパターンを適用する。上の 1~4 の原則が標準であり、付録は適用事例にすぎない。

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
