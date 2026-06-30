---
name: Mobile Async/Error Handling Standard
description: A guide for treating Swift Concurrency (async/await, Task) and Kotlin Coroutine with the same mental model. Read when deciding work tied to the screen lifecycle — cancellation, parallel/sequential execution, error classification, retry, and converting to user messages. Keywords: coroutine, suspend, async/await, Task, Result.failure, try-catch, Throwable, Dispatchers, CoroutineExceptionHandler.
rules:
  - "Tie async work to the screen lifecycle scope so it is cancelled when the screen is left."
  - "Run independent work in parallel (async let·awaitAll) and dependent work sequentially."
  - "Perform UI updates (state mutation) on the main thread, and offload heavy work to the background."
  - "Classify errors by type — network, auth, server, etc. — and convert them into user messages."
  - "Retry transient errors with exponential backoff, but do not automatically retry mutating requests (POST/PUT/DELETE)."
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

# ⏳ Mobile Async/Error Handling Standard

> Treat Swift Concurrency and Kotlin Coroutine with the same mental model. Async calls **must be tied to the screen lifecycle** — if the user leaves the screen and a response arrives and touches the UI, it crashes or leaks. Read when deciding the scope, concurrency, error handling, and retry policy of async work.

## 1. Core Principles

- Tie async work to the screen lifecycle scope so it is cancelled when the screen is left.
- Run independent work in parallel (`async let`·`awaitAll`) and dependent work sequentially.
- Perform UI updates (state mutation) on the main thread, and offload heavy work to the background.
- Classify errors by type — network, auth, server, etc. — and convert them into user messages.
- Retry transient errors with exponential backoff, but do not automatically retry mutating requests (POST/PUT/DELETE).

## 2. Rules

### 2-1. Matching the Work Scope

| Intent | iOS | Android |
|------|-----|---------|
| Only while the screen is alive | `.task { ... }` modifier | `LaunchedEffect(key) { ... }` |
| While the ViewModel is alive | `Task { ... }` in `@MainActor class` | `viewModelScope.launch { ... }` |
| Only while the screen is visible | `.task` + `id:` or onAppear/onDisappear | `repeatOnLifecycle(STARTED)` |
| App-wide (non-cancellable, use with care) | `Task.detached` | `GlobalScope` (avoid) / Hilt Singleton + a separate Scope |

```swift
// iOS
struct HomeView: View {
    @StateObject var vm = HomeViewModel()

    var body: some View {
        List(vm.items) { ItemRow($0) }
            .task {                          // automatically cancelled when the view disappears
                await vm.fetch()
            }
            .refreshable {                   // pull to refresh
                await vm.fetch()
            }
    }
}
```

```kotlin
// Android
@Composable
fun HomeScreen(vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()  // stops collecting when STOPPED

    LaunchedEffect(Unit) { vm.fetch() }     // cancelled when the composable leaves

    PullToRefreshBox(onRefresh = { vm.fetch() }) { ... }
}
```

> ⚠️ Use **`collectAsStateWithLifecycle()`** rather than `collectAsState()`. It prevents unnecessary collection in the background.

### 2-2. Concurrent Work — Parallel vs Sequential

```swift
// iOS — async let / TaskGroup
async let users = userService.getUsers()
async let posts = postService.getPosts()
let (u, p) = try await (users, posts)   // parallel

// multiple
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

// multiple
val results = ids.map { id ->
    async { fetch(id) }
}.awaitAll()
```

> Independent calls must run in parallel. If written sequentially, screen loading becomes 2–3× slower.

### 2-3. Main Thread Rules

| Work | Execution thread |
|------|--------------|
| UI update (state mutation) | forced to **main** |
| Network/DB/image decoding | background |

```swift
// iOS
@MainActor                       // the entire ViewModel runs on main
class HomeViewModel: ObservableObject { ... }

// run heavy work in the background
let processed = await Task.detached(priority: .userInitiated) {
    heavyImageProcess(data)
}.value
self.image = processed           // automatically returns onto @MainActor
```

```kotlin
// Android
class HomeViewModel @Inject constructor(
    private val repository: ItemRepository,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {
    fun load() = viewModelScope.launch {        // main
        val items = withContext(ioDispatcher) { // switch to IO
            repository.getItems()
        }
        _state.update { it.copy(items = items) } // return to main
    }
}
```

### 2-4. Error Classification and Conversion to User Messages

Inside the ViewModel, **convert errors into user messages** and put them into state. The View does not need to know "which error" it is.

```kotlin
// common mapping
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

> Send the original error to logs/Crashlytics, and expose only the converted message in the UI.

### 2-5. Retry Policy

| Case | Policy |
|--------|------|
| Temporary network drop (GET) | exponential backoff, auto retry 2–3 times |
| 5xx server error (GET) | auto retry 1–2 times |
| 4xx (except auth) | no retry, show to the user |
| POST/PUT/DELETE | **no auto retry**. Provide a "Retry" button |

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

### 2-6. Cancellation Handling

- When the user leaves the screen → the scope above (task / viewModelScope) is cancelled automatically.
- When explicit cancellation is needed:
  - iOS: store the `Task` and call `.cancel()`. Cooperate via `try Task.checkCancellation()`.
  - Android: keep the `Job` and call `cancel()`. Inside the coroutine, check `ensureActive()` or `isActive`.

> In long loops (image processing, data transformation), check for cancellation periodically. Otherwise it won't be cancelled and keeps running.

### 2-7. The 4 States Shown to the User

Every async screen explicitly handles the following 4 states:

```
Idle / Loading / Success(data) / Error(message)
```

> Empty data (`Success([])`) also needs its own UI (`EmptyView`). "Loading finished but the screen is empty" is the most common source of user confusion.

## 3. Common Mistakes

- ❌ Creating `Task { ... }` anew inside the View `body` every time → a flood of calls on every re-render. Use the `task` modifier.
- ❌ `GlobalScope.launch` on Android → lifecycle-agnostic, a cause of leaks.
- ❌ Ignoring errors with `try?` / `runCatching { ... }.getOrNull()`.
- ❌ Calling `Thread.sleep` / `runBlocking` on the main thread → ANR.
- ❌ Manual guards like `if (view != null)` after a network response → something the scope should solve.

## 4. Checklist

- [ ] Is async work tied to the screen/ViewModel scope so it is cancelled when left?
- [ ] Are independent calls run in parallel (`async let`·`awaitAll`)?
- [ ] Are UI updates on the main thread and heavy work split off to the background (IO)?
- [ ] Is `collectAsStateWithLifecycle()` used on Android?
- [ ] Are errors classified by type and converted into user messages?
- [ ] Does GET use exponential backoff retry, while POST/PUT/DELETE disallow auto retry?
- [ ] Does the screen handle all 4 states Idle/Loading/Success/Error (including empty data)?
