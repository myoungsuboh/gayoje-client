---
name: 移动端导航/路由设计
description: 用于以同一心智模型设计 iOS NavigationStack 与 Android Navigation Compose 的指南。在统一屏幕 ID·深链接·返回操作·结果传递·标签/模态结构时阅读。关键词: NavController, NavHostController, navigate, NavGraph, NavHostFragment, deepLink, NavigationStack。
rules:
  - "屏幕标识用类型(sealed class / enum)而非字符串来定义。"
  - "为每个屏幕明确设计返回操作行为。"
  - "屏幕间的结果传递用 iOS 闭包、Android SavedStateHandle 处理。"
  - "深链接注册为 Universal Link · App Link，并使 URL 格式在各平台间保持一致。"
  - "以同一心智模型设计 iOS NavigationStack 与 Android Navigation Compose。"
tags:
  - "NavController"
  - "NavHostController"
  - "navigate"
  - "NavGraph"
  - "NavHostFragment"
  - "deepLink"
  - "NavigationStack"
---

# 🧭 移动端导航/路由

> 两个平台的导航 API 不同，但「屏幕 ID 用类型管理，路由集中在一处」这一原则是相同的。在设计 iOS·Android 导航，或决定深链接·返回操作·屏幕结果传递时阅读。

## 1. 核心原则
- 屏幕标识用类型(sealed class / enum)而非字符串来定义。
- 为每个屏幕明确设计返回操作行为。
- 屏幕间的结果传递用 iOS 闭包、Android `SavedStateHandle` 处理。
- 深链接注册为 Universal Link · App Link，并使 URL 格式在各平台间保持一致。
- 以同一心智模型设计 iOS NavigationStack 与 Android Navigation Compose。

## 2. 规则

### 2-1. 屏幕 ID 用类型而非字符串
把字符串路由散落各处，一个错字就会让应用崩溃。务必用 sealed class / enum 定义。

```swift
// ✅ iOS (SwiftUI NavigationStack) — Routes.swift，所有路由在一个文件
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

// 屏幕跳转
path.append(Route.detail(itemId: "abc"))
```

```kotlin
// ✅ Android (Navigation Compose) — Screen.kt，所有路由在一个文件
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

// 屏幕跳转
navController.navigate(Screen.Detail.create("abc"))
```

### 2-2. 明确设计返回操作行为
| 情况 | iOS | Android |
|------|-----|---------|
| 普通 pop | 自动(滑动/按钮) | 系统返回键自动 |
| pop 到特定屏幕 | `path.removeLast(n)` | `popBackStack(route, inclusive)` |
| 整体重置(例如登出) | `path = NavigationPath()` | `navigate(Login) { popUpTo(0) }` |
| 拦截返回操作 | `interactiveDismissDisabled()` | `BackHandler { ... }` |

> ⚠️ 登录/登出切换必须把返回栈全部清空。否则会发生返回后看到登录前屏幕的事故。

### 2-3. 屏幕间结果传递 (从选择屏幕接收值)
```swift
// ✅ iOS — 闭包 or @Binding (父级注入回调)
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
// ✅ Android — SavedStateHandle (Compose Navigation 标准)
// 子: 保存结果
navController.previousBackStackEntry
    ?.savedStateHandle
    ?.set("selectedItem", item)
navController.popBackStack()

// 父: 接收结果
val selectedItem = navController.currentBackStackEntry
    ?.savedStateHandle
    ?.getLiveData<Item>("selectedItem")
    ?.observeAsState()
```

### 2-4. 深链接 (Universal/App Link)
让同一屏幕也能通过外部 URL 打开。

| 模式 | iOS | Android |
|------|-----|---------|
| Scheme | `myapp://detail/123` | `myapp://detail/123` |
| 网页链接 | Associated Domains (`applinks:`) | App Links (`autoVerify=true`) |
| 路由映射 | `.onOpenURL { url in path.append(Route.from(url)) }` | `composable(deepLinks = listOf(navDeepLink { uriPattern = "myapp://detail/{itemId}" }))` |

> 两个平台都保持深链接 URL 格式一致。让后端/市场团队只需了解一种格式即可。

### 2-5. 标签栏 + 栈组合 (最常见的结构)
```
RootTabView (TabView / BottomNavigation)
 ├── Tab 1: HomeNavStack    → Home → Detail → ...
 ├── Tab 2: SearchNavStack
 └── Tab 3: ProfileNavStack
```
- 每个标签各自持有自己的 NavigationStack。切换标签也保留对方标签的栈。
- 跨标签跳转(例如从通知标签「查看此帖」→ Home 标签详情屏幕)同时进行 `selectedTab` 变更 + `path.append`。
- iOS: `TabView(selection:)`、Android: `BottomNavigation` + 每个标签的嵌套 `NavHost`。

### 2-6. 模态 vs 推入 — 何时用哪个
| 情况 | 推荐 |
|------|------|
| 同一流程内(列表 → 详情) | 推入 (NavigationStack push / navigate) |
| 上下文中断(设置、撰写表单) | 模态 (sheet / Dialog) |
| 简短确认(确认/取消) | Alert |
| 选项选择 | iOS Action Sheet / Android BottomSheet |

> 把模态当推入用、把推入当模态用，会破坏返回操作的 UX。要意识到 iOS 的标准是下滑关闭模态，Android 的标准是点击 BottomSheet 的 backdrop 关闭。

## 3. 常见错误
- ❌ 在 View 内直接决定路由(`if user.isAdmin { ... navigate }`) → ViewModel 暴露路由事件，由 View 接收后 navigate。
- ❌ 在每个屏幕硬编码路由字符串。
- ❌ 登出后可通过返回操作回到上一个屏幕。
- ❌ 深链接格式因平台而异。

## 4. 检查清单
- [ ] 是否将屏幕 ID 定义为 sealed class / enum 类型
- [ ] 是否将路由集中在一个文件
- [ ] 是否在登录/登出切换时把返回栈全部清空
- [ ] 是否用 iOS 闭包 / Android SavedStateHandle 处理屏幕间结果传递
- [ ] 深链接 URL 格式在两个平台是否一致
- [ ] 推入/模态的选择是否符合上下文
