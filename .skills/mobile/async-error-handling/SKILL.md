---
name: 모바일 비동기/에러 처리 표준
description: Swift Concurrency(async/await, Task)와 Kotlin Coroutine을 같은 멘탈 모델로 다루는 가이드. 화면 라이프사이클에 묶인 작업 취소·병렬/순차 실행·에러 분류·재시도·사용자 메시지 변환을 정할 때 읽는다. 키워드: coroutine, suspend, async/await, Task, Result.failure, try-catch, Throwable, Dispatchers, CoroutineExceptionHandler.
rules:
  - "비동기 작업은 화면 라이프사이클 스코프에 묶어 이탈 시 취소한다."
  - "독립 작업은 병렬(async let·awaitAll)로, 의존 작업은 순차로 실행한다."
  - "UI 갱신(state 수정)은 메인 스레드에서 수행하고, 무거운 작업은 백그라운드로 보낸다."
  - "에러는 네트워크·인증·서버 등 유형별로 분류해 사용자 메시지로 변환한다."
  - "일시 오류는 지수 백오프로 재시도하되, 변경 요청(POST/PUT/DELETE)은 자동 재시도하지 않는다."
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

# ⏳ 모바일 비동기/에러 처리 표준

> Swift Concurrency와 Kotlin Coroutine을 같은 멘탈 모델로 다룬다. 비동기 호출은 **반드시 화면 라이프사이클에 묶여야** 한다 — 사용자가 화면을 떠났는데 응답을 받아 UI를 건드리면 크래시 또는 누수가 난다. 비동기 작업의 스코프·동시성·에러·재시도를 정할 때 읽는다.

## 1. 핵심 원칙

- 비동기 작업은 화면 라이프사이클 스코프에 묶어 이탈 시 취소한다.
- 독립 작업은 병렬(`async let`·`awaitAll`)로, 의존 작업은 순차로 실행한다.
- UI 갱신(state 수정)은 메인 스레드에서 수행하고, 무거운 작업은 백그라운드로 보낸다.
- 에러는 네트워크·인증·서버 등 유형별로 분류해 사용자 메시지로 변환한다.
- 일시 오류는 지수 백오프로 재시도하되, 변경 요청(POST/PUT/DELETE)은 자동 재시도하지 않는다.

## 2. 규칙

### 2-1. 작업 스코프 매칭

| 의도 | iOS | Android |
|------|-----|---------|
| 화면이 살아있는 동안만 | `.task { ... }` modifier | `LaunchedEffect(key) { ... }` |
| ViewModel 살아있는 동안 | `Task { ... }` in `@MainActor class` | `viewModelScope.launch { ... }` |
| 화면이 보이는 동안만 | `.task` + `id:` 또는 onAppear/onDisappear | `repeatOnLifecycle(STARTED)` |
| 앱 전역(취소 불가, 신중히) | `Task.detached` | `GlobalScope` (지양) / Hilt Singleton + 별도 Scope |

```swift
// iOS
struct HomeView: View {
    @StateObject var vm = HomeViewModel()

    var body: some View {
        List(vm.items) { ItemRow($0) }
            .task {                          // 뷰가 사라지면 자동 취소
                await vm.fetch()
            }
            .refreshable {                   // 당겨서 새로고침
                await vm.fetch()
            }
    }
}
```

```kotlin
// Android
@Composable
fun HomeScreen(vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()  // STOPPED면 수집 중단

    LaunchedEffect(Unit) { vm.fetch() }     // 컴포저블 떠나면 취소

    PullToRefreshBox(onRefresh = { vm.fetch() }) { ... }
}
```

> ⚠️ `collectAsState()` 가 아닌 **`collectAsStateWithLifecycle()`** 을 써라. 백그라운드에서 불필요한 수집을 막는다.

### 2-2. 동시 작업 — 병렬 vs 순차

```swift
// iOS — async let / TaskGroup
async let users = userService.getUsers()
async let posts = postService.getPosts()
let (u, p) = try await (users, posts)   // 병렬

// 여러 개
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

// 여러 개
val results = ids.map { id ->
    async { fetch(id) }
}.awaitAll()
```

> 독립된 호출은 반드시 병렬. 순차로 짜면 화면 로딩이 2~3배 느려진다.

### 2-3. 메인 스레드 규칙

| 작업 | 실행 스레드 |
|------|--------------|
| UI 갱신 (state 수정) | **메인** 강제 |
| 네트워크/DB/이미지 디코딩 | 백그라운드 |

```swift
// iOS
@MainActor                       // ViewModel은 통째로 메인
class HomeViewModel: ObservableObject { ... }

// 무거운 작업은 백그라운드에서
let processed = await Task.detached(priority: .userInitiated) {
    heavyImageProcess(data)
}.value
self.image = processed           // @MainActor 위로 자동 복귀
```

```kotlin
// Android
class HomeViewModel @Inject constructor(
    private val repository: ItemRepository,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {
    fun load() = viewModelScope.launch {        // 메인
        val items = withContext(ioDispatcher) { // IO 스위치
            repository.getItems()
        }
        _state.update { it.copy(items = items) } // 메인 복귀
    }
}
```

### 2-4. 에러 분류와 사용자 메시지 변환

ViewModel 안에서 에러를 **사용자 메시지로 변환**해서 상태에 넣어라. View는 "어떤 에러인지" 알 필요 없음.

```kotlin
// 공통 매핑
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

> 원본 에러는 로그/Crashlytics 로 보내고, UI엔 변환된 메시지만 노출.

### 2-5. 재시도 정책

| 케이스 | 정책 |
|--------|------|
| 네트워크 일시 끊김 (GET) | 지수 백오프 자동 재시도 2~3회 |
| 5xx 서버 에러 (GET) | 자동 재시도 1~2회 |
| 4xx (인증 외) | 재시도 금지, 사용자에게 표시 |
| POST/PUT/DELETE | **자동 재시도 금지**. "다시 시도" 버튼 제공 |

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

### 2-6. 취소 처리

- 사용자가 화면을 떠나면 → 위 스코프(task / viewModelScope)가 자동 취소.
- 명시적 취소가 필요하면:
  - iOS: `Task` 를 저장했다가 `.cancel()`. `try Task.checkCancellation()` 으로 협조.
  - Android: `Job` 보관 후 `cancel()`. 코루틴 안에서는 `ensureActive()` 또는 `isActive` 체크.

> 긴 루프(이미지 처리, 데이터 변환)에서는 주기적으로 cancellation을 확인하라. 안 그러면 취소되지 않고 계속 돈다.

### 2-7. 사용자에게 보여주는 4가지 상태

모든 비동기 화면은 다음 4상태를 명시적으로 처리:

```
Idle / Loading / Success(데이터) / Error(메시지)
```

> 빈 데이터(`Success([])`) 도 별도 UI(`EmptyView`) 로. "로딩 끝났는데 화면이 텅 빔" 이 가장 흔한 사용자 혼란.

## 3. 흔한 실수

- ❌ `Task { ... }` 를 View `body` 안에서 매번 새로 만들기 → 리렌더마다 호출 폭주. `task` modifier 사용.
- ❌ Android에서 `GlobalScope.launch` → 라이프사이클 무관, 누수의 원인.
- ❌ `try?` / `runCatching { ... }.getOrNull()` 로 에러 무시.
- ❌ `Thread.sleep` / `runBlocking` 을 메인 스레드에서 호출 → ANR.
- ❌ 네트워크 응답 후 `if (view != null)` 같은 수동 가드 → 스코프로 해결할 일.

## 4. 체크리스트

- [ ] 비동기 작업을 화면/ViewModel 스코프에 묶어 이탈 시 취소되는가
- [ ] 독립 호출을 병렬(`async let`·`awaitAll`)로 실행했는가
- [ ] UI 갱신은 메인 스레드, 무거운 작업은 백그라운드(IO)로 분리했는가
- [ ] Android에서 `collectAsStateWithLifecycle()`을 사용하는가
- [ ] 에러를 유형별로 분류해 사용자 메시지로 변환했는가
- [ ] GET은 지수 백오프 재시도, POST/PUT/DELETE는 자동 재시도를 금지했는가
- [ ] 화면이 Idle/Loading/Success/Error 4상태(빈 데이터 포함)를 모두 처리하는가
