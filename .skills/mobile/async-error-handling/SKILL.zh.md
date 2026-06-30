---
name: 移动端异步/错误处理标准
description: 用同一套心智模型处理 Swift Concurrency(async/await, Task)和 Kotlin Coroutine 的指南。在确定与界面生命周期绑定的任务取消、并行/串行执行、错误分类、重试、转换为用户消息时阅读。关键词: coroutine, suspend, async/await, Task, Result.failure, try-catch, Throwable, Dispatchers, CoroutineExceptionHandler。
rules:
  - "异步任务绑定到界面生命周期作用域，离开时取消。"
  - "独立任务并行执行(async let·awaitAll),有依赖的任务串行执行。"
  - "UI更新(修改 state)在主线程执行,繁重任务交给后台。"
  - "按网络·认证·服务器等类型对错误分类,并转换为用户消息。"
  - "对临时错误用指数退避重试,但变更请求(POST/PUT/DELETE)不自动重试。"
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

# ⏳ 移动端异步/错误处理标准

> 用同一套心智模型处理 Swift Concurrency 和 Kotlin Coroutine。异步调用**必须绑定到界面生命周期** — 如果用户已离开界面却收到响应去操作 UI,就会崩溃或泄漏。在确定异步任务的作用域、并发、错误、重试时阅读。

## 1. 核心原则

- 异步任务绑定到界面生命周期作用域,离开时取消。
- 独立任务并行执行(`async let`·`awaitAll`),有依赖的任务串行执行。
- UI更新(修改 state)在主线程执行,繁重任务交给后台。
- 按网络·认证·服务器等类型对错误分类,并转换为用户消息。
- 对临时错误用指数退避重试,但变更请求(POST/PUT/DELETE)不自动重试。

## 2. 规则

### 2-1. 任务作用域匹配

| 意图 | iOS | Android |
|------|-----|---------|
| 仅在界面存活期间 | `.task { ... }` modifier | `LaunchedEffect(key) { ... }` |
| 在 ViewModel 存活期间 | `Task { ... }` in `@MainActor class` | `viewModelScope.launch { ... }` |
| 仅在界面可见期间 | `.task` + `id:` 或 onAppear/onDisappear | `repeatOnLifecycle(STARTED)` |
| 全应用(不可取消,谨慎使用) | `Task.detached` | `GlobalScope`(避免)/ Hilt Singleton + 单独 Scope |

```swift
// iOS
struct HomeView: View {
    @StateObject var vm = HomeViewModel()

    var body: some View {
        List(vm.items) { ItemRow($0) }
            .task {                          // 视图消失时自动取消
                await vm.fetch()
            }
            .refreshable {                   // 下拉刷新
                await vm.fetch()
            }
    }
}
```

```kotlin
// Android
@Composable
fun HomeScreen(vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()  // STOPPED 时停止收集

    LaunchedEffect(Unit) { vm.fetch() }     // 离开可组合项时取消

    PullToRefreshBox(onRefresh = { vm.fetch() }) { ... }
}
```

> ⚠️ 要用 **`collectAsStateWithLifecycle()`** 而不是 `collectAsState()`。它能防止在后台进行不必要的收集。

### 2-2. 并发任务 — 并行 vs 串行

```swift
// iOS — async let / TaskGroup
async let users = userService.getUsers()
async let posts = postService.getPosts()
let (u, p) = try await (users, posts)   // 并行

// 多个
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

// 多个
val results = ids.map { id ->
    async { fetch(id) }
}.awaitAll()
```

> 独立的调用必须并行。若写成串行,界面加载会慢2〜3倍。

### 2-3. 主线程规则

| 任务 | 执行线程 |
|------|--------------|
| UI更新(修改 state) | 强制**主线程** |
| 网络/DB/图片解码 | 后台 |

```swift
// iOS
@MainActor                       // ViewModel 整体在主线程
class HomeViewModel: ObservableObject { ... }

// 繁重任务在后台
let processed = await Task.detached(priority: .userInitiated) {
    heavyImageProcess(data)
}.value
self.image = processed           // 自动回到 @MainActor
```

```kotlin
// Android
class HomeViewModel @Inject constructor(
    private val repository: ItemRepository,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {
    fun load() = viewModelScope.launch {        // 主线程
        val items = withContext(ioDispatcher) { // 切到 IO
            repository.getItems()
        }
        _state.update { it.copy(items = items) } // 回到主线程
    }
}
```

### 2-4. 错误分类与转换为用户消息

在 ViewModel 内把错误**转换为用户消息**再放入状态。View 不需要知道"是哪种错误"。

```kotlin
// 通用映射
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

> 把原始错误发送到日志/Crashlytics,UI 只暴露转换后的消息。

### 2-5. 重试策略

| 场景 | 策略 |
|--------|------|
| 网络临时断开 (GET) | 指数退避自动重试2〜3次 |
| 5xx 服务器错误 (GET) | 自动重试1〜2次 |
| 4xx(认证除外) | 禁止重试,向用户展示 |
| POST/PUT/DELETE | **禁止自动重试**。提供"重试"按钮 |

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

### 2-6. 取消处理

- 用户离开界面时 → 上面的作用域(task / viewModelScope)自动取消。
- 需要显式取消时:
  - iOS: 保存 `Task` 后调用 `.cancel()`。通过 `try Task.checkCancellation()` 协作取消。
  - Android: 保留 `Job` 后 `cancel()`。在协程内检查 `ensureActive()` 或 `isActive`。

> 在长循环(图片处理、数据转换)中要定期检查取消。否则不会被取消,会一直运行。

### 2-7. 展示给用户的4种状态

每个异步界面都明确处理以下4种状态:

```
Idle / Loading / Success(数据) / Error(消息)
```

> 空数据(`Success([])`)也要用单独的 UI(`EmptyView`)。"加载完了界面却空空如也"是最常见的用户困惑。

## 3. 常见错误

- ❌ 在 View 的 `body` 内每次都新建 `Task { ... }` → 每次重渲染都疯狂调用。要用 `task` modifier。
- ❌ 在 Android 用 `GlobalScope.launch` → 与生命周期无关,是泄漏的根源。
- ❌ 用 `try?` / `runCatching { ... }.getOrNull()` 忽略错误。
- ❌ 在主线程调用 `Thread.sleep` / `runBlocking` → ANR。
- ❌ 网络响应后用 `if (view != null)` 之类的手动守卫 → 这本应由作用域解决。

## 4. 检查清单

- [ ] 异步任务是否绑定到界面/ViewModel 作用域,离开时取消?
- [ ] 独立调用是否并行(`async let`·`awaitAll`)执行?
- [ ] UI更新是否在主线程,繁重任务是否分离到后台(IO)?
- [ ] Android 是否使用 `collectAsStateWithLifecycle()`?
- [ ] 是否按类型对错误分类并转换为用户消息?
- [ ] GET 是否用指数退避重试,POST/PUT/DELETE 是否禁止自动重试?
- [ ] 界面是否处理了 Idle/Loading/Success/Error 全部4种状态(含空数据)?
