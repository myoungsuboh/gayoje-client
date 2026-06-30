---
name: 모바일 상태 관리 표준
description: SwiftUI의 @Published/@Observable와 Android Compose의 StateFlow를 같은 멘탈 모델로 다루기 위한 가이드. UiState 단일 객체·단방향 데이터 흐름·화면 회전/재구성 생존 규칙을 통일한다. 화면 ViewModel·상태 구조를 설계하거나 회전·일회성 이벤트·전역 상태를 다룰 때 읽는다. 키워드: ViewModel, StateFlow, LiveData, MutableStateFlow, @State, ObservableObject, @Observable, remember, Combine, UiState, UDF.
rules:
  - "화면 상태는 UiState 단일 객체로 모델링한다."
  - "단방향 데이터 흐름(이벤트 → 상태 → 뷰)을 지킨다."
  - "iOS 는 @Observable/@Published, Android 는 StateFlow 로 상태를 노출한다."
  - "회전·프로세스 종료에 대비해 상태 생존 규칙을 적용한다."
  - "로딩·성공·에러 상태를 명시적으로 구분한다."
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

# 🔄 모바일 상태 관리 표준

> **하나의 화면 = 하나의 UiState 객체**. 여러 개의 `@Published` / `StateFlow`를 화면 하나에 흩뿌리지 마라. 화면의 ViewModel·상태 구조를 설계하거나 회전·일회성 이벤트·전역 상태를 다룰 때 읽는다.

## 1. 핵심 원칙
- 화면 상태는 UiState 단일 객체로 모델링한다.
- 단방향 데이터 흐름(이벤트 → 상태 → 뷰)을 지킨다.
- iOS 는 `@Observable`/`@Published`, Android 는 `StateFlow` 로 상태를 노출한다.
- 회전·프로세스 종료에 대비해 상태 생존 규칙을 적용한다.
- 로딩·성공·에러 상태를 명시적으로 구분한다.

## 2. 규칙

### 2-1. 단방향 데이터 흐름 (UDF)
```
[ View ] ── Intent/Action ──> [ ViewModel ] ── update ──> [ UiState ]
   ▲                                                            │
   └──────────────── observe ──────────────────────────────────┘
```
- View는 상태를 **읽기만** 하고, 변화는 **이벤트(메서드 호출)** 로 ViewModel에 알린다.
- ViewModel만이 UiState를 수정한다.
- 절대 View 안에 mutable 비즈니스 상태를 두지 말 것 (UI 전용 임시 상태 제외, 예: 텍스트필드 포커스).

### 2-2. UiState 한 덩어리로 모델링
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

### 2-3. View의 상태 종류 구분
| 분류 | iOS | Android | 예시 |
|------|-----|---------|------|
| **비즈니스 상태** (ViewModel 소유) | `@Published`, `@Observable` | `StateFlow` | items, user, errorMessage |
| **UI 임시 상태** (View 로컬) | `@State` | `remember { mutableStateOf(...) }` | 텍스트필드 입력 중인 값, 펼침/접힘 |
| **부모↔자식 양방향** | `@Binding` | `value + onValueChange` 콜백 | 토글 스위치 |
| **앱 전역 상태** | `@EnvironmentObject` | Hilt `@Singleton` + StateFlow | 로그인 사용자, 다크모드 설정 |

> ⚠️ 비즈니스 상태를 View `@State`에 두면 회전·재구성 시 사라진다. 절대 금지.

### 2-4. 상태 생존 규칙 (회전·프로세스 종료 대응)
**iOS**
- `@StateObject`: 뷰 생명주기 동안 유지 (한 뷰에서 한 번만 생성).
- `@ObservedObject`: 외부에서 주입받음. 부모 재생성되면 같이 사라짐.
- 앱이 백그라운드에서 종료될 가능성 있으면 → 중요한 상태는 `UserDefaults`/Keychain에 즉시 저장.

**Android**
- `ViewModel`: 화면 회전 생존. **프로세스 종료는 생존 못 함.**
- `SavedStateHandle`을 ViewModel에 주입하면 프로세스 죽어도 복구:
  ```kotlin
  class DetailViewModel @Inject constructor(
      private val savedState: SavedStateHandle
  ) : ViewModel() {
      var draft: String
          get() = savedState["draft"] ?: ""
          set(value) { savedState["draft"] = value }
  }
  ```
- Compose의 `rememberSaveable`: 회전·프로세스 종료 모두 생존하는 UI 로컬 상태.

### 2-5. 일회성 이벤트 (스낵바, 토스트, 화면 이동 명령)
상태로 두면 회전 시 다시 발생하는 문제가 생긴다. 별도 채널로 흘려보내라.

```swift
// ✅ iOS
@Published var toast: String? = nil  // View가 표시 후 nil로 되돌림
```

```kotlin
// ✅ Android — SharedFlow (재방출 안 됨)
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

### 2-6. 전역 상태 (로그인, 테마, 사용자 설정)
- **남용 금지**: 정말로 여러 화면이 동시에 봐야 하는 것만.
- 후보: 로그인 세션, 현재 사용자 프로필, 테마 모드, 푸시 토큰.
- iOS: `@EnvironmentObject AppState` 를 `MyApp.swift`에서 한 번 주입.
- Android: Hilt `@Singleton class AppStateRepository` + `StateFlow` 노출.

## 3. 흔한 실수
- ❌ View 본문에서 비동기 호출 (`Task { await api.fetch() }`을 body 안에) → ViewModel 메서드로 빼라.
- ❌ ViewModel에 Context/UIViewController 주입 → 테스트 불가능.
- ❌ `MutableStateFlow` 를 외부에 노출 → 반드시 `.asStateFlow()` 로 read-only.
- ❌ 화면 회전 시 데이터 다시 불러오기 → `init { fetch() }` 한 번만, 또는 `if state.items.isEmpty()` 가드.
- ❌ 비즈니스 상태를 View `@State`에 두기 → 회전·재구성 시 소실.

## 4. 체크리스트
- [ ] 화면 상태를 UiState 단일 객체로 모델링했는가
- [ ] 단방향 데이터 흐름(이벤트 → 상태 → 뷰)을 지켰는가
- [ ] 상태를 read-only(`.asStateFlow()` / `private(set)`)로 노출했는가
- [ ] 로딩·성공·에러 상태를 명시적으로 구분했는가
- [ ] 회전·프로세스 종료에 대비한 생존 규칙(SavedStateHandle/rememberSaveable 등)을 적용했는가
- [ ] 일회성 이벤트를 상태가 아닌 별도 채널(SharedFlow 등)로 처리했는가
- [ ] 전역 상태를 꼭 필요한 것만 두었는가
