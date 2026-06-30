---
name: 모바일 네비게이션/라우팅 설계
description: iOS NavigationStack과 Android Navigation Compose를 같은 멘탈 모델로 설계하기 위한 가이드. 화면 ID·딥링크·뒤로가기·결과 전달·탭/모달 구조를 통일할 때 읽는다. 키워드: NavController, NavHostController, navigate, NavGraph, NavHostFragment, deepLink, NavigationStack.
rules:
  - "화면 식별은 문자열 대신 타입(sealed class / enum)으로 정의한다."
  - "뒤로 가기 동작을 화면마다 명시적으로 설계한다."
  - "화면 간 결과 전달은 iOS 클로저, Android SavedStateHandle로 처리한다."
  - "딥링크는 Universal Link · App Link로 등록하고 URL 포맷을 플랫폼 간 동일하게 유지한다."
  - "iOS NavigationStack과 Android Navigation Compose를 같은 멘탈 모델로 설계한다."
tags:
  - "NavController"
  - "NavHostController"
  - "navigate"
  - "NavGraph"
  - "NavHostFragment"
  - "deepLink"
  - "NavigationStack"
---

# 🧭 모바일 네비게이션/라우팅

> 두 플랫폼의 네비게이션 API는 다르지만 "화면 ID는 타입으로 관리하고, 라우트는 한 곳에 모은다"는 원칙은 동일하다. iOS·Android 네비게이션을 설계하거나 딥링크·뒤로가기·화면 결과 전달을 정할 때 읽는다.

## 1. 핵심 원칙
- 화면 식별은 문자열 대신 타입(sealed class / enum)으로 정의한다.
- 뒤로 가기 동작을 화면마다 명시적으로 설계한다.
- 화면 간 결과 전달은 iOS 클로저, Android `SavedStateHandle`로 처리한다.
- 딥링크는 Universal Link · App Link로 등록하고 URL 포맷을 플랫폼 간 동일하게 유지한다.
- iOS NavigationStack과 Android Navigation Compose를 같은 멘탈 모델로 설계한다.

## 2. 규칙

### 2-1. 화면 ID는 문자열이 아니라 타입으로
문자열 라우트를 곳곳에 흩뿌리면 오타 한 글자에 앱이 죽는다. 반드시 sealed class / enum으로 정의한다.

```swift
// ✅ iOS (SwiftUI NavigationStack) — Routes.swift, 한 파일에 모든 라우트
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

// 화면 이동
path.append(Route.detail(itemId: "abc"))
```

```kotlin
// ✅ Android (Navigation Compose) — Screen.kt, 한 파일에 모든 라우트
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

// 화면 이동
navController.navigate(Screen.Detail.create("abc"))
```

### 2-2. 뒤로 가기 동작은 명시적으로 설계
| 상황 | iOS | Android |
|------|-----|---------|
| 일반 pop | 자동 (스와이프/버튼) | 시스템 백버튼 자동 |
| 특정 화면까지 pop | `path.removeLast(n)` | `popBackStack(route, inclusive)` |
| 전체 리셋 (예: 로그아웃) | `path = NavigationPath()` | `navigate(Login) { popUpTo(0) }` |
| 뒤로 가기 가로채기 | `interactiveDismissDisabled()` | `BackHandler { ... }` |

> ⚠️ 로그인/로그아웃 전환은 반드시 백스택을 전부 비워야 한다. 안 그러면 뒤로 가서 로그인 전 화면이 보이는 사고가 난다.

### 2-3. 화면 간 결과 전달 (선택 화면에서 값 받기)
```swift
// ✅ iOS — 클로저 or @Binding (부모가 콜백 주입)
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
// ✅ Android — SavedStateHandle (Compose Navigation 표준)
// 자식: 결과 저장
navController.previousBackStackEntry
    ?.savedStateHandle
    ?.set("selectedItem", item)
navController.popBackStack()

// 부모: 결과 수신
val selectedItem = navController.currentBackStackEntry
    ?.savedStateHandle
    ?.getLiveData<Item>("selectedItem")
    ?.observeAsState()
```

### 2-4. 딥링크 (Universal/App Link)
같은 화면을 외부 URL로도 열 수 있게 한다.

| 패턴 | iOS | Android |
|------|-----|---------|
| 스킴 | `myapp://detail/123` | `myapp://detail/123` |
| 웹 링크 | Associated Domains (`applinks:`) | App Links (`autoVerify=true`) |
| 라우트 매핑 | `.onOpenURL { url in path.append(Route.from(url)) }` | `composable(deepLinks = listOf(navDeepLink { uriPattern = "myapp://detail/{itemId}" }))` |

> 두 플랫폼 모두 딥링크 URL 포맷은 동일하게 유지한다. 백엔드/마케팅 팀이 한 가지 포맷만 알면 되도록.

### 2-5. 탭바 + 스택 조합 (가장 흔한 구조)
```
RootTabView (TabView / BottomNavigation)
 ├── Tab 1: HomeNavStack    → Home → Detail → ...
 ├── Tab 2: SearchNavStack
 └── Tab 3: ProfileNavStack
```
- 각 탭은 자기 NavigationStack을 따로 가진다. 탭 전환해도 상대 탭의 스택은 보존한다.
- 탭 간 점프(예: 알림 탭에서 "이 글 보기" → Home 탭 상세화면)는 `selectedTab` 변경 + `path.append`를 같이 한다.
- iOS: `TabView(selection:)`, Android: `BottomNavigation` + 탭별 nested `NavHost`.

### 2-6. 모달 vs 푸시 — 언제 어떤 걸 쓰나
| 상황 | 권장 |
|------|------|
| 같은 흐름 안 (목록 → 상세) | 푸시 (NavigationStack push / navigate) |
| 컨텍스트 끊김 (설정, 작성 폼) | 모달 (sheet / Dialog) |
| 짧은 확인 (확인/취소) | Alert |
| 옵션 선택 | iOS Action Sheet / Android BottomSheet |

> 모달을 푸시처럼, 푸시를 모달처럼 쓰면 뒤로 가기 UX가 깨진다. iOS는 스와이프 다운으로 모달 닫는 게 표준, Android는 BottomSheet의 backdrop 탭으로 닫는 게 표준임을 의식한다.

## 3. 흔한 실수
- ❌ View 안에서 직접 라우트 결정(`if user.isAdmin { ... navigate }`) → ViewModel이 라우팅 이벤트를 노출하고 View가 받아서 navigate한다.
- ❌ 라우트 문자열을 화면마다 하드코딩.
- ❌ 로그아웃 시 뒤로 가기로 이전 화면 복귀 가능.
- ❌ 딥링크 포맷이 플랫폼마다 다름.

## 4. 체크리스트
- [ ] 화면 ID를 sealed class / enum 타입으로 정의했는가
- [ ] 라우트를 한 파일에 모았는가
- [ ] 로그인/로그아웃 전환 시 백스택을 전부 비웠는가
- [ ] 화면 간 결과 전달을 iOS 클로저 / Android SavedStateHandle로 처리했는가
- [ ] 딥링크 URL 포맷이 두 플랫폼 동일한가
- [ ] 푸시/모달 선택이 컨텍스트에 맞는가
