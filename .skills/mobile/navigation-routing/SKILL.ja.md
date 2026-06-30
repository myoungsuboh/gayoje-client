---
name: モバイルナビゲーション/ルーティング設計
description: iOS NavigationStackとAndroid Navigation Composeを同じメンタルモデルで設計するためのガイド。画面ID・ディープリンク・戻る操作・結果受け渡し・タブ/モーダル構造を統一するときに読む。キーワード: NavController, NavHostController, navigate, NavGraph, NavHostFragment, deepLink, NavigationStack。
rules:
  - "画面識別は文字列ではなく型(sealed class / enum)で定義する。"
  - "戻る操作を画面ごとに明示的に設計する。"
  - "画面間の結果受け渡しはiOSクロージャ、AndroidはSavedStateHandleで処理する。"
  - "ディープリンクはUniversal Link · App Linkとして登録し、URLフォーマットをプラットフォーム間で同一に保つ。"
  - "iOS NavigationStackとAndroid Navigation Composeを同じメンタルモデルで設計する。"
tags:
  - "NavController"
  - "NavHostController"
  - "navigate"
  - "NavGraph"
  - "NavHostFragment"
  - "deepLink"
  - "NavigationStack"
---

# 🧭 モバイルナビゲーション/ルーティング

> 2つのプラットフォームのナビゲーションAPIは異なるが、「画面IDは型で管理し、ルートは一箇所に集める」という原則は同じだ。iOS・Androidのナビゲーションを設計したり、ディープリンク・戻る操作・画面の結果受け渡しを決めるときに読む。

## 1. コア原則
- 画面識別は文字列ではなく型(sealed class / enum)で定義する。
- 戻る操作を画面ごとに明示的に設計する。
- 画面間の結果受け渡しはiOSクロージャ、Androidは`SavedStateHandle`で処理する。
- ディープリンクはUniversal Link · App Linkとして登録し、URLフォーマットをプラットフォーム間で同一に保つ。
- iOS NavigationStackとAndroid Navigation Composeを同じメンタルモデルで設計する。

## 2. ルール

### 2-1. 画面IDは文字列ではなく型で
文字列ルートを至る所にばらまくと、たった一文字のタイプミスでアプリが死ぬ。必ずsealed class / enumで定義する。

```swift
// ✅ iOS (SwiftUI NavigationStack) — Routes.swift、1ファイルにすべてのルート
enum Route: Hashable {
    case home
    case detail(itemId: String)
    case profile(userId: String)
    case settings
}

NavigationStack(path: $path) {
    HomeView()
        .navigationDestination(for: Route.self) { route in
            switch route {
            case .home: HomeView()
            case .detail(let id): DetailView(itemId: id)
            case .profile(let id): ProfileView(userId: id)
            case .settings: SettingsView()
            }
        }
}

// 画面遷移
path.append(Route.detail(itemId: "abc"))
```

```kotlin
// ✅ Android (Navigation Compose) — Screen.kt、1ファイルにすべてのルート
sealed class Screen(val route: String) {
    object Home : Screen("home")
    data class Detail(val itemId: String) : Screen("detail/{itemId}") {
        companion object {
            const val ROUTE = "detail/{itemId}"
            fun create(itemId: String) = "detail/$itemId"
        }
    }
    object Settings : Screen("settings")
}

NavHost(navController, startDestination = Screen.Home.route) {
    composable(Screen.Home.route) { HomeScreen(navController) }
    composable(
        route = Screen.Detail.ROUTE,
        arguments = listOf(navArgument("itemId") { type = NavType.StringType })
    ) {
        val id = it.arguments?.getString("itemId") ?: return@composable
        DetailScreen(itemId = id)
    }
}

// 画面遷移
navController.navigate(Screen.Detail.create("abc"))
```

### 2-2. 戻る操作は明示的に設計
| 状況 | iOS | Android |
|------|-----|---------|
| 通常のpop | 自動(スワイプ/ボタン) | システムバックボタン自動 |
| 特定の画面までpop | `path.removeLast(n)` | `popBackStack(route, inclusive)` |
| 全体リセット(例: ログアウト) | `path = NavigationPath()` | `navigate(Login) { popUpTo(0) }` |
| 戻る操作の横取り | `interactiveDismissDisabled()` | `BackHandler { ... }` |

> ⚠️ ログイン/ログアウトの遷移は必ずバックスタックを全部空にしなければならない。さもないと戻ってログイン前の画面が見える事故が起きる。

### 2-3. 画面間の結果受け渡し (選択画面から値を受け取る)
```swift
// ✅ iOS — クロージャ or @Binding (親がコールバックを注入)
struct PickerView: View {
    let onSelected: (Item) -> Void

    var body: some View {
        List(items) { item in
            Button(item.name) {
                onSelected(item)
                dismiss()
            }
        }
    }
}
```

```kotlin
// ✅ Android — SavedStateHandle (Compose Navigation標準)
// 子: 結果を保存
navController.previousBackStackEntry
    ?.savedStateHandle
    ?.set("selectedItem", item)
navController.popBackStack()

// 親: 結果を受信
val selectedItem = navController.currentBackStackEntry
    ?.savedStateHandle
    ?.getLiveData<Item>("selectedItem")
    ?.observeAsState()
```

### 2-4. ディープリンク (Universal/App Link)
同じ画面を外部URLからも開けるようにする。

| パターン | iOS | Android |
|------|-----|---------|
| スキーム | `myapp://detail/123` | `myapp://detail/123` |
| ウェブリンク | Associated Domains (`applinks:`) | App Links (`autoVerify=true`) |
| ルートマッピング | `.onOpenURL { url in path.append(Route.from(url)) }` | `composable(deepLinks = listOf(navDeepLink { uriPattern = "myapp://detail/{itemId}" }))` |

> 両プラットフォームともディープリンクURLフォーマットは同一に保つ。バックエンド/マーケティングチームが1つのフォーマットだけ知っていれば済むように。

### 2-5. タブバー + スタックの組み合わせ (最もよくある構造)
```
RootTabView (TabView / BottomNavigation)
 ├── Tab 1: HomeNavStack    → Home → Detail → ...
 ├── Tab 2: SearchNavStack
 └── Tab 3: ProfileNavStack
```
- 各タブは自分のNavigationStackを別々に持つ。タブを切り替えても相手のタブのスタックは保存する。
- タブ間のジャンプ(例: 通知タブから「この投稿を見る」→ Homeタブの詳細画面)は`selectedTab`変更 + `path.append`を一緒に行う。
- iOS: `TabView(selection:)`、Android: `BottomNavigation` + タブごとのnested `NavHost`。

### 2-6. モーダル vs プッシュ — いつどちらを使うか
| 状況 | 推奨 |
|------|------|
| 同じフロー内(一覧 → 詳細) | プッシュ (NavigationStack push / navigate) |
| コンテキストの断絶(設定、作成フォーム) | モーダル (sheet / Dialog) |
| 短い確認(確認/キャンセル) | Alert |
| オプション選択 | iOS Action Sheet / Android BottomSheet |

> モーダルをプッシュのように、プッシュをモーダルのように使うと戻る操作のUXが壊れる。iOSはスワイプダウンでモーダルを閉じるのが標準、AndroidはBottomSheetのbackdropタップで閉じるのが標準であることを意識する。

## 3. よくあるミス
- ❌ View内で直接ルートを決定(`if user.isAdmin { ... navigate }`) → ViewModelがルーティングイベントを公開し、Viewが受け取ってnavigateする。
- ❌ ルート文字列を画面ごとにハードコーディング。
- ❌ ログアウト時に戻る操作で前の画面に復帰できる。
- ❌ ディープリンクフォーマットがプラットフォームごとに異なる。

## 4. チェックリスト
- [ ] 画面IDをsealed class / enum型で定義したか
- [ ] ルートを1ファイルに集めたか
- [ ] ログイン/ログアウト遷移時にバックスタックを全部空にしたか
- [ ] 画面間の結果受け渡しをiOSクロージャ / Android SavedStateHandleで処理したか
- [ ] ディープリンクURLフォーマットが両プラットフォームで同一か
- [ ] プッシュ/モーダルの選択がコンテキストに合っているか
