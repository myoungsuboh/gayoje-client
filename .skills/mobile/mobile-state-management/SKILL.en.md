---
name: Mobile State Management Standards
description: A guide for handling SwiftUI's @Published/@Observable and Android Compose's StateFlow with the same mental model. Unifies the rules for a single UiState object, unidirectional data flow, and surviving screen rotation/recomposition. Read it when designing a screen's ViewModel/state structure or dealing with rotation, one-shot events, or global state. Keywords: ViewModel, StateFlow, LiveData, MutableStateFlow, @State, ObservableObject, @Observable, remember, Combine, UiState, UDF.
rules:
  - "Model screen state as a single UiState object."
  - "Maintain unidirectional data flow (event → state → view)."
  - "Expose state via @Observable/@Published on iOS and StateFlow on Android."
  - "Apply state survival rules for rotation and process termination."
  - "Explicitly distinguish loading, success, and error states."
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

# 🔄 Mobile State Management Standards

> **One screen = one UiState object**. Don't scatter multiple `@Published` / `StateFlow` across a single screen. Read this when designing a screen's ViewModel/state structure or dealing with rotation, one-shot events, or global state.

## 1. Core Principles
- Model screen state as a single UiState object.
- Maintain unidirectional data flow (event → state → view).
- Expose state via `@Observable`/`@Published` on iOS and `StateFlow` on Android.
- Apply state survival rules for rotation and process termination.
- Explicitly distinguish loading, success, and error states.

## 2. Rules

### 2-1. Unidirectional Data Flow (UDF)
```
[ View ] ── Intent/Action ──> [ ViewModel ] ── update ──> [ UiState ]
   ▲                                                            │
   └──────────────── observe ──────────────────────────────────┘
```
- The View only **reads** state and notifies the ViewModel of changes via **events (method calls)**.
- Only the ViewModel modifies the UiState.
- Never put mutable business state inside the View (excluding UI-only transient state, e.g., text field focus).

### 2-2. Model State as a Single UiState Object
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

### 2-3. Distinguish the Kinds of State in a View
| Category | iOS | Android | Examples |
|------|-----|---------|------|
| **Business state** (owned by ViewModel) | `@Published`, `@Observable` | `StateFlow` | items, user, errorMessage |
| **UI transient state** (View-local) | `@State` | `remember { mutableStateOf(...) }` | text being typed in a field, expanded/collapsed |
| **Parent↔child two-way** | `@Binding` | `value + onValueChange` callback | toggle switch |
| **App-wide global state** | `@EnvironmentObject` | Hilt `@Singleton` + StateFlow | logged-in user, dark mode setting |

> ⚠️ If you put business state in a View `@State`, it disappears on rotation/recomposition. Strictly forbidden.

### 2-4. State Survival Rules (Handling Rotation & Process Termination)
**iOS**
- `@StateObject`: persists for the view's lifecycle (created only once in a single view).
- `@ObservedObject`: injected from outside. Disappears together when the parent is recreated.
- If the app may be terminated in the background → save critical state to `UserDefaults`/Keychain immediately.

**Android**
- `ViewModel`: survives screen rotation. **Does not survive process termination.**
- Injecting `SavedStateHandle` into the ViewModel recovers state even if the process dies:
  ```kotlin
  class DetailViewModel @Inject constructor(
      private val savedState: SavedStateHandle
  ) : ViewModel() {
      var draft: String
          get() = savedState["draft"] ?: ""
          set(value) { savedState["draft"] = value }
  }
  ```
- Compose's `rememberSaveable`: UI-local state that survives both rotation and process termination.

### 2-5. One-Shot Events (snackbars, toasts, navigation commands)
Keeping them as state causes the problem of them re-firing on rotation. Send them through a separate channel.

```swift
// ✅ iOS
@Published var toast: String? = nil  // View resets it to nil after displaying
```

```kotlin
// ✅ Android — SharedFlow (not re-emitted)
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

### 2-6. Global State (login, theme, user settings)
- **Don't overuse it**: only for what truly must be seen by multiple screens at once.
- Candidates: login session, current user profile, theme mode, push token.
- iOS: inject `@EnvironmentObject AppState` once in `MyApp.swift`.
- Android: Hilt `@Singleton class AppStateRepository` exposing a `StateFlow`.

## 3. Common Mistakes
- ❌ Making async calls in the View body (`Task { await api.fetch() }` inside body) → move it into a ViewModel method.
- ❌ Injecting Context/UIViewController into the ViewModel → makes it untestable.
- ❌ Exposing `MutableStateFlow` externally → always make it read-only with `.asStateFlow()`.
- ❌ Re-fetching data on rotation → fetch only once with `init { fetch() }`, or guard with `if state.items.isEmpty()`.
- ❌ Putting business state in a View `@State` → lost on rotation/recomposition.

## 4. Checklist
- [ ] Did you model screen state as a single UiState object?
- [ ] Did you maintain unidirectional data flow (event → state → view)?
- [ ] Did you expose state as read-only (`.asStateFlow()` / `private(set)`)?
- [ ] Did you explicitly distinguish loading, success, and error states?
- [ ] Did you apply survival rules (SavedStateHandle/rememberSaveable, etc.) for rotation and process termination?
- [ ] Did you handle one-shot events via a separate channel (SharedFlow, etc.) rather than state?
- [ ] Did you keep only the truly necessary global state?
