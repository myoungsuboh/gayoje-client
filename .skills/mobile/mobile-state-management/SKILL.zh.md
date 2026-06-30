---
name: 移动端状态管理标准
description: 用于以同一心智模型处理 SwiftUI 的 @Published/@Observable 与 Android Compose 的 StateFlow 的指南。统一 UiState 单一对象、单向数据流、屏幕旋转/重组的存活规则。在设计屏幕的 ViewModel·状态结构，或处理旋转、一次性事件、全局状态时阅读。关键词: ViewModel, StateFlow, LiveData, MutableStateFlow, @State, ObservableObject, @Observable, remember, Combine, UiState, UDF。
rules:
  - "将屏幕状态建模为 UiState 单一对象。"
  - "遵守单向数据流(事件 → 状态 → 视图)。"
  - "iOS 用 @Observable/@Published、Android 用 StateFlow 暴露状态。"
  - "为旋转·进程终止应用状态存活规则。"
  - "明确区分加载·成功·错误状态。"
tags:
  - "ViewModel"
  - "StateFlow"
  - "LiveData"
  - "MutableStateFlow"
  - "@State"
  - "ObservableObject"
  - "@Observable"
  - "remember"
  - "Combine"
  - "UiState"
  - "UDF"
---

# 🔄 移动端状态管理标准

> **一个屏幕 = 一个 UiState 对象**。不要把多个 `@Published` / `StateFlow` 散落在单个屏幕上。在设计屏幕的 ViewModel·状态结构，或处理旋转、一次性事件、全局状态时阅读。

## 1. 核心原则
- 将屏幕状态建模为 UiState 单一对象。
- 遵守单向数据流(事件 → 状态 → 视图)。
- iOS 用 `@Observable`/`@Published`、Android 用 `StateFlow` 暴露状态。
- 为旋转·进程终止应用状态存活规则。
- 明确区分加载·成功·错误状态。

## 2. 规则

### 2-1. 单向数据流 (UDF)
```
[ View ] ── Intent/Action ──> [ ViewModel ] ── update ──> [ UiState ]
   ▲                                                            │
   └──────────────── observe ──────────────────────────────────┘
```
- View 只**读取**状态，变化通过**事件(方法调用)**通知 ViewModel。
- 只有 ViewModel 修改 UiState。
- 绝不在 View 内放置可变的业务状态(UI 专用临时状态除外，例如文本框焦点)。

### 2-2. 将 UiState 建模为一整块
```swift
// ✅ iOS
struct HomeUiState {
    var items: [Item] = []
    var isLoading: Bool = false
    var errorMessage: String? = nil
    var selectedFilter: Filter = .all
}

@MainActor
class HomeViewModel: ObservableObject {
    @Published private(set) var state = HomeUiState()

    func fetch() async {
        state.isLoading = true
        defer { state.isLoading = false }
        do {
            state.items = try await service.getItems()
        } catch {
            state.errorMessage = "데이터를 불러오지 못했습니다."
        }
    }

    func onFilterChanged(_ filter: Filter) {
        state.selectedFilter = filter
    }
}
```

```kotlin
// ✅ Android
data class HomeUiState(
    val items: List<Item> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val selectedFilter: Filter = Filter.ALL
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: ItemRepository
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    fun fetch() = viewModelScope.launch {
        _state.update { it.copy(isLoading = true) }
        runCatching { repository.getItems() }
            .onSuccess { items -> _state.update { it.copy(items = items, isLoading = false) } }
            .onFailure { _state.update { it.copy(errorMessage = "데이터를 불러오지 못했습니다.", isLoading = false) } }
    }

    fun onFilterChanged(filter: Filter) {
        _state.update { it.copy(selectedFilter = filter) }
    }
}
```

### 2-3. 区分 View 中状态的种类
| 分类 | iOS | Android | 示例 |
|------|-----|---------|------|
| **业务状态** (ViewModel 拥有) | `@Published`, `@Observable` | `StateFlow` | items, user, errorMessage |
| **UI 临时状态** (View 本地) | `@State` | `remember { mutableStateOf(...) }` | 文本框正在输入的值、展开/折叠 |
| **父↔子双向** | `@Binding` | `value + onValueChange` 回调 | 切换开关 |
| **应用全局状态** | `@EnvironmentObject` | Hilt `@Singleton` + StateFlow | 登录用户、深色模式设置 |

> ⚠️ 把业务状态放在 View `@State` 中，旋转·重组时会消失。绝对禁止。

### 2-4. 状态存活规则 (应对旋转·进程终止)
**iOS**
- `@StateObject`: 在视图生命周期内保持(在一个视图中只创建一次)。
- `@ObservedObject`: 由外部注入。父级被重建时会一起消失。
- 如果应用可能在后台被终止 → 立即把重要状态保存到 `UserDefaults`/Keychain。

**Android**
- `ViewModel`: 在屏幕旋转中存活。**无法在进程终止中存活。**
- 把 `SavedStateHandle` 注入到 ViewModel，即使进程死亡也能恢复:
  ```kotlin
  class DetailViewModel @Inject constructor(
      private val savedState: SavedStateHandle
  ) : ViewModel() {
      var draft: String
          get() = savedState["draft"] ?: ""
          set(value) { savedState["draft"] = value }
  }
  ```
- Compose 的 `rememberSaveable`: 在旋转·进程终止两种情况下都存活的 UI 本地状态。

### 2-5. 一次性事件 (Snackbar、Toast、导航命令)
若作为状态保留，旋转时会再次触发的问题就会出现。通过单独的通道传递。

```swift
// ✅ iOS
@Published var toast: String? = nil  // View 显示后将其重置为 nil
```

```kotlin
// ✅ Android — SharedFlow (不会重新发射)
private val _events = MutableSharedFlow<UiEvent>()
val events: SharedFlow<UiEvent> = _events.asSharedFlow()

sealed class UiEvent {
    data class ShowToast(val message: String) : UiEvent()
    object NavigateBack : UiEvent()
}

// View
LaunchedEffect(Unit) {
    viewModel.events.collect { event ->
        when (event) {
            is UiEvent.ShowToast -> snackbarHostState.showSnackbar(event.message)
            UiEvent.NavigateBack -> navController.popBackStack()
        }
    }
}
```

### 2-6. 全局状态 (登录、主题、用户设置)
- **禁止滥用**: 仅限确实需要多个屏幕同时查看的内容。
- 候选: 登录会话、当前用户资料、主题模式、推送令牌。
- iOS: 在 `MyApp.swift` 中一次性注入 `@EnvironmentObject AppState`。
- Android: Hilt `@Singleton class AppStateRepository` + 暴露 `StateFlow`。

## 3. 常见错误
- ❌ 在 View 主体中直接做异步调用(`Task { await api.fetch() }` 放在 body 内) → 抽取到 ViewModel 方法。
- ❌ 向 ViewModel 注入 Context/UIViewController → 无法测试。
- ❌ 对外暴露 `MutableStateFlow` → 必须用 `.asStateFlow()` 设为只读。
- ❌ 屏幕旋转时重新加载数据 → 用 `init { fetch() }` 只加载一次，或用 `if state.items.isEmpty()` 守卫。
- ❌ 把业务状态放在 View `@State` 中 → 旋转·重组时丢失。

## 4. 检查清单
- [ ] 是否将屏幕状态建模为 UiState 单一对象
- [ ] 是否遵守单向数据流(事件 → 状态 → 视图)
- [ ] 是否将状态以只读方式(`.asStateFlow()` / `private(set)`)暴露
- [ ] 是否明确区分加载·成功·错误状态
- [ ] 是否应用了应对旋转·进程终止的存活规则(SavedStateHandle/rememberSaveable 等)
- [ ] 是否将一次性事件通过单独通道(SharedFlow 等)而非状态处理
- [ ] 是否只保留确实必要的全局状态
