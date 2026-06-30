---
name: モバイル非同期/エラー処理の標準
description: Swift Concurrency(async/await, Task)と Kotlin Coroutine を同じメンタルモデルで扱うためのガイド。画面ライフサイクルに紐づく処理のキャンセル・並列/逐次実行・エラー分類・リトライ・ユーザーメッセージへの変換を決めるときに読む。キーワード: coroutine, suspend, async/await, Task, Result.failure, try-catch, Throwable, Dispatchers, CoroutineExceptionHandler。
rules:
  - "非同期処理は画面ライフサイクルのスコープに紐づけ、離脱時にキャンセルする。"
  - "独立した処理は並列(async let·awaitAll)で、依存する処理は逐次で実行する。"
  - "UI更新(state変更)はメインスレッドで行い、重い処理はバックグラウンドへ送る。"
  - "エラーはネットワーク・認証・サーバーなどタイプ別に分類してユーザーメッセージに変換する。"
  - "一時的なエラーは指数バックオフでリトライするが、変更リクエスト(POST/PUT/DELETE)は自動リトライしない。"
tags:
  - "coroutine"
  - "suspend"
  - "async/await"
  - "Task"
  - "Result.failure"
  - "try-catch"
  - "Throwable"
  - "Dispatchers"
  - "CoroutineExceptionHandler"
---

# ⏳ モバイル非同期/エラー処理の標準

> Swift Concurrency と Kotlin Coroutine を同じメンタルモデルで扱う。非同期呼び出しは**必ず画面ライフサイクルに紐づけなければならない** — ユーザーが画面を離れたのに応答を受け取って UI を触ると、クラッシュまたはリークが起きる。非同期処理のスコープ・並行性・エラー・リトライを決めるときに読む。

## 1. 核心原則

- 非同期処理は画面ライフサイクルのスコープに紐づけ、離脱時にキャンセルする。
- 独立した処理は並列(`async let`·`awaitAll`)で、依存する処理は逐次で実行する。
- UI更新(state変更)はメインスレッドで行い、重い処理はバックグラウンドへ送る。
- エラーはネットワーク・認証・サーバーなどタイプ別に分類してユーザーメッセージに変換する。
- 一時的なエラーは指数バックオフでリトライするが、変更リクエスト(POST/PUT/DELETE)は自動リトライしない。

## 2. ルール

### 2-1. 処理スコープのマッチング

| 意図 | iOS | Android |
|------|-----|---------|
| 画面が生きている間だけ | `.task { ... }` modifier | `LaunchedEffect(key) { ... }` |
| ViewModel が生きている間 | `Task { ... }` in `@MainActor class` | `viewModelScope.launch { ... }` |
| 画面が表示されている間だけ | `.task` + `id:` または onAppear/onDisappear | `repeatOnLifecycle(STARTED)` |
| アプリ全域(キャンセル不可、慎重に) | `Task.detached` | `GlobalScope`(避ける)/ Hilt Singleton + 別の Scope |

```swift
// iOS
struct HomeView: View {
    @StateObject var vm = HomeViewModel()

    var body: some View {
        List(vm.items) { ItemRow($0) }
            .task {                          // ビューが消えると自動キャンセル
                await vm.fetch()
            }
            .refreshable {                   // 引っ張って更新
                await vm.fetch()
            }
    }
}
```

```kotlin
// Android
@Composable
fun HomeScreen(vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()  // STOPPED なら収集を停止

    LaunchedEffect(Unit) { vm.fetch() }     // コンポーザブルを離れるとキャンセル

    PullToRefreshBox(onRefresh = { vm.fetch() }) { ... }
}
```

> ⚠️ `collectAsState()` ではなく **`collectAsStateWithLifecycle()`** を使え。バックグラウンドでの不要な収集を防ぐ。

### 2-2. 並行処理 — 並列 vs 逐次

```swift
// iOS — async let / TaskGroup
async let users = userService.getUsers()
async let posts = postService.getPosts()
let (u, p) = try await (users, posts)   // 並列

// 複数
try await withThrowingTaskGroup(of: Item.self) { group in
    for id in ids { group.addTask { try await fetch(id) } }
    for try await item in group { result.append(item) }
}
```

```kotlin
// Android — async / awaitAll
coroutineScope {
    val users = async { userRepo.get() }
    val posts = async { postRepo.get() }
    val (u, p) = users.await() to posts.await()
}

// 複数
val results = ids.map { id ->
    async { fetch(id) }
}.awaitAll()
```

> 独立した呼び出しは必ず並列で。逐次で書くと画面ロードが2〜3倍遅くなる。

### 2-3. メインスレッドのルール

| 処理 | 実行スレッド |
|------|--------------|
| UI更新(state変更) | **メイン**強制 |
| ネットワーク/DB/画像デコード | バックグラウンド |

```swift
// iOS
@MainActor                       // ViewModel は丸ごとメイン
class HomeViewModel: ObservableObject { ... }

// 重い処理はバックグラウンドで
let processed = await Task.detached(priority: .userInitiated) {
    heavyImageProcess(data)
}.value
self.image = processed           // @MainActor 上へ自動復帰
```

```kotlin
// Android
class HomeViewModel @Inject constructor(
    private val repository: ItemRepository,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {
    fun load() = viewModelScope.launch {        // メイン
        val items = withContext(ioDispatcher) { // IO スイッチ
            repository.getItems()
        }
        _state.update { it.copy(items = items) } // メイン復帰
    }
}
```

### 2-4. エラー分類とユーザーメッセージへの変換

ViewModel の中でエラーを**ユーザーメッセージに変換**して状態に入れろ。View は「どのエラーか」を知る必要はない。

```kotlin
// 共通マッピング
fun Throwable.toUserMessage(): String = when (this) {
    is ApiError.Network -> "인터넷 연결을 확인해주세요."
    is ApiError.Unauthorized -> "로그인이 만료되었습니다. 다시 로그인해주세요."
    is ApiError.Server -> "잠시 후 다시 시도해주세요. (${this.code})"
    else -> "예상치 못한 오류가 발생했습니다."
}
```

```swift
extension Error {
    var userMessage: String {
        switch self {
        case APIError.network: "인터넷 연결을 확인해주세요."
        case APIError.unauthorized: "로그인이 만료되었습니다."
        case APIError.server(_, let m): m
        default: "예상치 못한 오류가 발생했습니다."
        }
    }
}
```

> 元のエラーはログ/Crashlytics に送り、UI には変換されたメッセージだけを表示する。

### 2-5. リトライ方針

| ケース | 方針 |
|--------|------|
| ネットワークの一時的な切断 (GET) | 指数バックオフで自動リトライ2〜3回 |
| 5xx サーバーエラー (GET) | 自動リトライ1〜2回 |
| 4xx(認証以外) | リトライ禁止、ユーザーに表示 |
| POST/PUT/DELETE | **自動リトライ禁止**。「再試行」ボタンを提供 |

```kotlin
suspend fun <T> retryWithBackoff(
    times: Int = 3,
    initialDelayMs: Long = 500,
    factor: Double = 2.0,
    block: suspend () -> T
): T {
    var delay = initialDelayMs
    repeat(times - 1) {
        try { return block() } catch (e: IOException) { delay(delay); delay = (delay * factor).toLong() }
    }
    return block()
}
```

### 2-6. キャンセル処理

- ユーザーが画面を離れると → 上記のスコープ(task / viewModelScope)が自動キャンセル。
- 明示的なキャンセルが必要な場合:
  - iOS: `Task` を保存しておき `.cancel()`。`try Task.checkCancellation()` で協調する。
  - Android: `Job` を保持して `cancel()`。コルーチン内では `ensureActive()` または `isActive` をチェック。

> 長いループ(画像処理、データ変換)では定期的にキャンセルを確認しろ。そうしないとキャンセルされず回り続ける。

### 2-7. ユーザーに見せる4つの状態

すべての非同期画面は次の4状態を明示的に処理する:

```
Idle / Loading / Success(データ) / Error(メッセージ)
```

> 空のデータ(`Success([])`)も別の UI(`EmptyView`)で。「ロードが終わったのに画面が空っぽ」が最も多いユーザーの混乱。

## 3. よくあるミス

- ❌ `Task { ... }` を View の `body` 内で毎回新しく作る → 再レンダーごとに呼び出しが殺到。`task` modifier を使う。
- ❌ Android で `GlobalScope.launch` → ライフサイクル無関係、リークの原因。
- ❌ `try?` / `runCatching { ... }.getOrNull()` でエラーを無視。
- ❌ `Thread.sleep` / `runBlocking` をメインスレッドで呼ぶ → ANR。
- ❌ ネットワーク応答後に `if (view != null)` のような手動ガード → スコープで解決すべきこと。

## 4. チェックリスト

- [ ] 非同期処理を画面/ViewModel スコープに紐づけ、離脱時にキャンセルされるか
- [ ] 独立した呼び出しを並列(`async let`·`awaitAll`)で実行したか
- [ ] UI更新はメインスレッド、重い処理はバックグラウンド(IO)に分離したか
- [ ] Android で `collectAsStateWithLifecycle()` を使っているか
- [ ] エラーをタイプ別に分類してユーザーメッセージに変換したか
- [ ] GET は指数バックオフリトライ、POST/PUT/DELETE は自動リトライを禁止したか
- [ ] 画面が Idle/Loading/Success/Error の4状態(空データを含む)をすべて処理するか
