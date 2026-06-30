---
name: モバイル状態管理標準
description: SwiftUIの@Published/@ObservableとAndroid ComposeのStateFlowを同じメンタルモデルで扱うためのガイド。UiState単一オブジェクト・単方向データフロー・画面回転/再構成のサバイバルルールを統一する。画面のViewModel・状態構造を設計したり、回転・一度きりのイベント・グローバル状態を扱うときに読む。キーワード: ViewModel, StateFlow, LiveData, MutableStateFlow, @State, ObservableObject, @Observable, remember, Combine, UiState, UDF。
rules:
  - "画面状態はUiState単一オブジェクトとしてモデリングする。"
  - "単方向データフロー(イベント → 状態 → ビュー)を守る。"
  - "iOSは@Observable/@Published、AndroidはStateFlowで状態を公開する。"
  - "回転・プロセス終了に備えて状態のサバイバルルールを適用する。"
  - "ローディング・成功・エラー状態を明示的に区別する。"
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

# 🔄 モバイル状態管理標準

> **1画面 = 1つのUiStateオブジェクト**。複数の`@Published` / `StateFlow`を1つの画面にばらまかないこと。画面のViewModel・状態構造を設計したり、回転・一度きりのイベント・グローバル状態を扱うときに読む。

## 1. コア原則
- 画面状態はUiState単一オブジェクトとしてモデリングする。
- 単方向データフロー(イベント → 状態 → ビュー)を守る。
- iOSは`@Observable`/`@Published`、Androidは`StateFlow`で状態を公開する。
- 回転・プロセス終了に備えて状態のサバイバルルールを適用する。
- ローディング・成功・エラー状態を明示的に区別する。

## 2. ルール

### 2-1. 単方向データフロー (UDF)
```
[ View ] ── Intent/Action ──> [ ViewModel ] ── update ──> [ UiState ]
   ▲                                                            │
   └──────────────── observe ──────────────────────────────────┘
```
- Viewは状態を**読むだけ**で、変化は**イベント(メソッド呼び出し)**でViewModelに知らせる。
- ViewModelだけがUiStateを変更する。
- View内にmutableなビジネス状態を絶対に置かないこと(UI専用の一時状態は除く、例: テキストフィールドのフォーカス)。

### 2-2. UiStateを一塊としてモデリング
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

### 2-3. Viewの状態の種類を区別
| 分類 | iOS | Android | 例 |
|------|-----|---------|------|
| **ビジネス状態** (ViewModel所有) | `@Published`, `@Observable` | `StateFlow` | items, user, errorMessage |
| **UI一時状態** (Viewローカル) | `@State` | `remember { mutableStateOf(...) }` | テキストフィールドに入力中の値、展開/折りたたみ |
| **親↔子の双方向** | `@Binding` | `value + onValueChange` コールバック | トグルスイッチ |
| **アプリ全体のグローバル状態** | `@EnvironmentObject` | Hilt `@Singleton` + StateFlow | ログインユーザー、ダークモード設定 |

> ⚠️ ビジネス状態をView `@State`に置くと回転・再構成時に消える。絶対禁止。

### 2-4. 状態サバイバルルール (回転・プロセス終了への対応)
**iOS**
- `@StateObject`: ビューのライフサイクルの間維持される(1つのビューで一度だけ生成)。
- `@ObservedObject`: 外部から注入される。親が再生成されると一緒に消える。
- アプリがバックグラウンドで終了する可能性があれば → 重要な状態は`UserDefaults`/Keychainに即座に保存する。

**Android**
- `ViewModel`: 画面回転をサバイブ。**プロセス終了はサバイブできない。**
- `SavedStateHandle`をViewModelに注入すればプロセスが死んでも復旧できる:
  ```kotlin
  class DetailViewModel @Inject constructor(
      private val savedState: SavedStateHandle
  ) : ViewModel() {
      var draft: String
          get() = savedState["draft"] ?: ""
          set(value) { savedState["draft"] = value }
  }
  ```
- Composeの`rememberSaveable`: 回転・プロセス終了の両方をサバイブするUIローカル状態。

### 2-5. 一度きりのイベント (スナックバー、トースト、画面遷移コマンド)
状態として置くと回転時に再び発生する問題が生じる。別チャネルで流す。

```swift
// ✅ iOS
@Published var toast: String? = nil  // Viewが表示後nilに戻す
```

```kotlin
// ✅ Android — SharedFlow (再放出されない)
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

### 2-6. グローバル状態 (ログイン、テーマ、ユーザー設定)
- **乱用禁止**: 本当に複数の画面が同時に見る必要があるものだけ。
- 候補: ログインセッション、現在のユーザープロフィール、テーマモード、プッシュトークン。
- iOS: `@EnvironmentObject AppState`を`MyApp.swift`で一度だけ注入。
- Android: Hilt `@Singleton class AppStateRepository` + `StateFlow`公開。

## 3. よくあるミス
- ❌ View本体で非同期呼び出し(`Task { await api.fetch() }`をbody内に) → ViewModelメソッドに切り出す。
- ❌ ViewModelにContext/UIViewControllerを注入 → テスト不可能。
- ❌ `MutableStateFlow`を外部に公開 → 必ず`.asStateFlow()`でread-onlyに。
- ❌ 画面回転時にデータを再取得 → `init { fetch() }`で一度だけ、または`if state.items.isEmpty()`でガード。
- ❌ ビジネス状態をView `@State`に置く → 回転・再構成時に消失。

## 4. チェックリスト
- [ ] 画面状態をUiState単一オブジェクトとしてモデリングしたか
- [ ] 単方向データフロー(イベント → 状態 → ビュー)を守ったか
- [ ] 状態をread-only(`.asStateFlow()` / `private(set)`)で公開したか
- [ ] ローディング・成功・エラー状態を明示的に区別したか
- [ ] 回転・プロセス終了に備えたサバイバルルール(SavedStateHandle/rememberSaveableなど)を適用したか
- [ ] 一度きりのイベントを状態ではなく別チャネル(SharedFlowなど)で処理したか
- [ ] グローバル状態を必要なものだけに留めたか
