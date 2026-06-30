---
name: Mobile Navigation/Routing Design
description: A guide for designing iOS NavigationStack and Android Navigation Compose with the same mental model. Read it when unifying screen IDs, deep links, back navigation, result passing, and tab/modal structure. Keywords: NavController, NavHostController, navigate, NavGraph, NavHostFragment, deepLink, NavigationStack.
rules:
  - "Define screen identity as types (sealed class / enum) instead of strings."
  - "Explicitly design the back-navigation behavior for each screen."
  - "Handle result passing between screens via iOS closures and Android SavedStateHandle."
  - "Register deep links as Universal Links · App Links and keep the URL format identical across platforms."
  - "Design iOS NavigationStack and Android Navigation Compose with the same mental model."
tags:
  - "NavController"
  - "NavHostController"
  - "navigate"
  - "NavGraph"
  - "NavHostFragment"
  - "deepLink"
  - "NavigationStack"
---

# 🧭 Mobile Navigation/Routing

> The navigation APIs of the two platforms differ, but the principle "manage screen IDs as types and gather routes in one place" is the same. Read this when designing iOS/Android navigation or deciding on deep links, back navigation, and screen result passing.

## 1. Core Principles
- Define screen identity as types (sealed class / enum) instead of strings.
- Explicitly design the back-navigation behavior for each screen.
- Handle result passing between screens via iOS closures and Android `SavedStateHandle`.
- Register deep links as Universal Links · App Links and keep the URL format identical across platforms.
- Design iOS NavigationStack and Android Navigation Compose with the same mental model.

## 2. Rules

### 2-1. Screen IDs as Types, Not Strings
Scattering string routes everywhere means a single typo kills the app. Always define them as a sealed class / enum.

```swift
// ✅ iOS (SwiftUI NavigationStack) — Routes.swift, all routes in one file
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

// Navigation
path.append(Route.detail(itemId: "abc"))
```

```kotlin
// ✅ Android (Navigation Compose) — Screen.kt, all routes in one file
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

// Navigation
navController.navigate(Screen.Detail.create("abc"))
```

### 2-2. Design Back-Navigation Behavior Explicitly
| Situation | iOS | Android |
|------|-----|---------|
| Normal pop | automatic (swipe/button) | system back button automatic |
| Pop to a specific screen | `path.removeLast(n)` | `popBackStack(route, inclusive)` |
| Full reset (e.g., logout) | `path = NavigationPath()` | `navigate(Login) { popUpTo(0) }` |
| Intercept back navigation | `interactiveDismissDisabled()` | `BackHandler { ... }` |

> ⚠️ Login/logout transitions must clear the entire back stack. Otherwise you get the accident of going back and seeing a pre-login screen.

### 2-3. Passing Results Between Screens (receiving a value from a picker screen)
```swift
// ✅ iOS — closure or @Binding (parent injects callback)
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
// ✅ Android — SavedStateHandle (Compose Navigation standard)
// Child: save the result
navController.previousBackStackEntry
    ?.savedStateHandle
    ?.set("selectedItem", item)
navController.popBackStack()

// Parent: receive the result
val selectedItem = navController.currentBackStackEntry
    ?.savedStateHandle
    ?.getLiveData<Item>("selectedItem")
    ?.observeAsState()
```

### 2-4. Deep Links (Universal/App Link)
Allow the same screen to be opened via an external URL.

| Pattern | iOS | Android |
|------|-----|---------|
| Scheme | `myapp://detail/123` | `myapp://detail/123` |
| Web link | Associated Domains (`applinks:`) | App Links (`autoVerify=true`) |
| Route mapping | `.onOpenURL { url in path.append(Route.from(url)) }` | `composable(deepLinks = listOf(navDeepLink { uriPattern = "myapp://detail/{itemId}" }))` |

> Keep the deep link URL format identical on both platforms. So the backend/marketing team only needs to know one format.

### 2-5. Tab Bar + Stack Combination (the most common structure)
```
RootTabView (TabView / BottomNavigation)
 ├── Tab 1: HomeNavStack    → Home → Detail → ...
 ├── Tab 2: SearchNavStack
 └── Tab 3: ProfileNavStack
```
- Each tab has its own NavigationStack. Switching tabs preserves the other tab's stack.
- A jump across tabs (e.g., from the notifications tab "view this post" → Home tab detail screen) does both `selectedTab` change + `path.append`.
- iOS: `TabView(selection:)`, Android: `BottomNavigation` + per-tab nested `NavHost`.

### 2-6. Modal vs Push — When to Use Which
| Situation | Recommended |
|------|------|
| Within the same flow (list → detail) | push (NavigationStack push / navigate) |
| Context break (settings, compose form) | modal (sheet / Dialog) |
| Short confirmation (OK/Cancel) | Alert |
| Option selection | iOS Action Sheet / Android BottomSheet |

> Using a modal like a push, or a push like a modal, breaks the back-navigation UX. Be aware that on iOS the standard is dismissing a modal by swiping down, and on Android the standard is dismissing a BottomSheet by tapping its backdrop.

## 3. Common Mistakes
- ❌ Deciding routes directly inside the View (`if user.isAdmin { ... navigate }`) → the ViewModel exposes a routing event and the View receives it and navigates.
- ❌ Hardcoding route strings in each screen.
- ❌ Being able to return to the previous screen via back navigation after logout.
- ❌ Deep link format differing per platform.

## 4. Checklist
- [ ] Did you define screen IDs as sealed class / enum types?
- [ ] Did you gather routes in one file?
- [ ] Did you clear the entire back stack on login/logout transitions?
- [ ] Did you handle result passing between screens via iOS closures / Android SavedStateHandle?
- [ ] Is the deep link URL format identical on both platforms?
- [ ] Does the push/modal choice fit the context?
