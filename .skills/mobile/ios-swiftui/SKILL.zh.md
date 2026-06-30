---
name: iOS SwiftUI 平台基础（索引）
description: iOS 应用开发的 Swift 语言、Xcode/SwiftPM 配置、状态宏、DI、Info.plist 等 iOS 专属的基础标准。在搭建新的 iOS 项目或确定 iOS 专属配置与约定时阅读。屏幕结构、状态、网络、权限等与 Android 共通的模式委托给专用技能。关键词: SwiftUI, @State, @Binding, @ObservedObject, @StateObject, @Observable, View, Combine, publisher, SPM, xcconfig.
rules:
  - "iOS 应用用 Swift + SwiftUI 编写。"
  - "状态以 @Observable 宏（iOS 17+）为基准建模，但在一个项目中只用一种方式。"
  - "依赖在应用入口点注入。"
  - "包用 Swift Package Manager 管理。"
  - "不要遗漏 Info.plist 的权限理由和 Capabilities 设置。"
tags:
  - "SwiftUI"
  - "@State"
  - "@Binding"
  - "@ObservedObject"
  - "@StateObject"
  - "@Observable"
  - "View"
  - "Combine"
  - "publisher"
  - "SPM"
  - "xcconfig"
---

# 📱 iOS SwiftUI 平台基础

> 仅涵盖 iOS 专属基础（Swift 语言、Xcode/SwiftPM、状态宏、DI、Info.plist）。在搭建新的 iOS 项目或确定 iOS 专属配置与约定时阅读。与 Android 共通的设计模式见下面索引中的其他技能。

## 1. 核心原则
- iOS 应用用 Swift + SwiftUI 编写。
- 状态以 `@Observable` 宏（iOS 17+）为基准建模，但在一个项目中只用一种方式。
- 依赖在应用入口点注入。
- 包用 Swift Package Manager 管理。
- 不要遗漏 Info.plist 的权限理由和 Capabilities 设置。

### 相关技能索引（先确认）
本文件仅涵盖 iOS 专属主题。以下主题见专用技能。

| 主题 | 参考技能 |
|------|-----------|
| 项目目录结构 | project-structure |
| MVVM / UiState / @Published | mobile-state-management |
| 屏幕切换 / NavigationStack / 深度链接 | navigation-routing |
| URLSession / DTO / 令牌刷新 | networking-api |
| 权限（相机/位置/通知） | permissions-privacy |
| Swift Concurrency / 错误处理 | async-error-handling |
| Keychain / SwiftData / UserDefaults | local-storage |
| 设计令牌 / 组件 | ui-design-system |
| Safe Area / SizeClass | responsive-device |
| XCTest / XCUITest / 快照 | testing-debugging |
| APNs / 通知 payload | push-notifications |
| Sign in with Apple/Google/Kakao | auth-social-login |
| VoiceOver / accessibilityLabel | mobile-accessibility |
| App Store 上架·证书 | ios-appstore |

## 2. 规则

### 2-1. 推荐版本矩阵（2026 基准）
| 项目 | 版本 |
|------|------|
| Deployment Target（最低支持 iOS） | iOS 16.0（推荐 iOS 17） |
| Swift | 5.10+（Swift 6 模式谨慎引入） |
| Xcode | 16+ |
| macOS（构建机器） | 14 Sonoma 以上 |
| SwiftUI 新语法（`@Observable`） | 仅 iOS 17+ 可用 |

> 把 Deployment Target 降到 iOS 15 以下就用不了 `NavigationStack`、`@Observable` 等。新项目推荐 iOS 16 以上。

### 2-2. 状态宏 — `@Published` vs `@Observable`
| 条件 | 推荐 |
|------|------|
| Deployment Target iOS 17+ | `@Observable` 宏（新语法，更精确的更新） |
| 需要 iOS 16 兼容 | `ObservableObject` + `@Published`（旧语法） |

在一个项目内只用一种。混用会让数据流变得难以理解。

```swift
// ✅ iOS 17+ (新语法)
@Observable
final class HomeViewModel {
    var state = HomeUiState()
    // @Published 不需要。所有 var 属性都被自动观察
}

// ✅ iOS 16 兼容 (旧语法)
@MainActor
final class HomeViewModel: ObservableObject {
    @Published var state = HomeUiState()
}
```

### 2-3. 应用入口点 + 依赖注入（DI）
iOS 没有像 Hilt 这样的标准 DI。推荐: 手动构造器注入 + 全局状态用 EnvironmentObject。

| 方式 | 优缺点 |
|------|--------|
| 构造器注入（手动） | 最简单。对中小型应用足够 |
| EnvironmentObject | SwiftUI 标准。仅用于全局状态 |
| Factory / Resolver / Needle（外部） | 大型应用。编译期安全性 |

```swift
@main
struct MyApp: App {
    @StateObject private var appState = AppState()
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
        }
    }
}
```

### 2-4. Swift Package Manager（SPM）标准
通过 `Package.swift` 或 Xcode Package Dependencies 添加。新项目避免使用 CocoaPods/Carthage。

| 用途 | 包 |
|------|--------|
| Snapshot 测试 | `pointfreeco/swift-snapshot-testing` |
| 依赖注入 | `hmlongco/Factory`（需要时） |
| Keychain 包装 | `kishikawakatsumi/KeychainAccess` 或自行实现（参考 local-storage） |
| 日志 | `apple/swift-log` |

### 2-5. Info.plist / Capabilities（经常遗漏）
- **Background Modes**: 推送（`remote-notification`）、位置（`location`）、音频（`audio`）等按需勾选。
- **App Transport Security**: 保持默认（强制 HTTPS）。例外仅按域名设置。
- **权限使用说明**: 相机/照片/位置/麦克风/通讯录都必须有 `NS***UsageDescription` 键。为空则会被 App Store 拒绝（参考 permissions-privacy）。
- **URL Scheme**: 使用深度链接/社交登录回调时（参考 navigation-routing, auth-social-login）。
- **Associated Domains**: 使用 Universal Links（`applinks:example.com`）时。

### 2-6. Swift 语言约定（iOS 专属附加规则）
- 优先 `let`: `var` 仅在真正需要改变时使用。
- 优先 `struct`: 值类型为默认。仅在需要引用语义时（ViewModel 等）用 `class`。
- `enum` with associated values: 表达屏幕路由、Result 类型、一次性事件。
- `@MainActor`: ViewModel 整体做成 `@MainActor` 类。UI 更新会自动在主线程上发生。
- 可选值处理: 推荐 `if let` / `guard let`。`force unwrap (!)` 在代码评审中几乎总是被 reject。
- `async/await`: 新代码不要新引入 completion handler。已有的回调 API 用 `withCheckedContinuation` 包装（参考 async-error-handling）。

### 2-7. Build Configuration 环境分离
用 `.xcconfig` 文件注入按环境的变量。

```
// Config-Dev.xcconfig
API_BASE_URL = https:/$()/dev-api.example.com
```
> `//` 是 xcconfig 注释，所以必须把 URL 中的 `//` escape 成 `/$()/`。不知道的话构建后 URL 会被截断。

```xml
<!-- Info.plist -->
<key>API_BASE_URL</key>
<string>$(API_BASE_URL)</string>
```
```swift
extension Bundle {
    var apiBaseURL: String {
        (object(forInfoDictionaryKey: "API_BASE_URL") as? String) ?? ""
    }
}
```
> 在 Xcode → Project → Configurations 中按 Debug/Release 分别映射 xcconfig。禁止硬编码按环境的 URL。

### 2-8. 调试工具
| 工具 | 用途 |
|------|------|
| `#Preview { ... }`（Xcode 15+） | 无设备查看视图。活用 `.preferredColorScheme(.dark)` 等 |
| Xcode View Debugger | 查看运行时视图层级 |
| Instruments（Allocations, Time Profiler, Leaks） | 内存·CPU 分析 |
| Console.app + `os_log` | 收集真机日志 |
| Environment Overrides（模拟器） | 即时切换暗色模式/Dynamic Type/Accessibility |

```swift
// ✅ 拦截发布版构建的日志
#if DEBUG
print("debug only")
#endif
```

## 3. 常见错误
- ❌ 混淆 `@StateObject` 和 `@ObservedObject`（不要为了在子视图中创建新实例而用 `@StateObject`）。
- ❌ 在 View 内每次重新创建 `Task { await ... }` → 使用 `.task` modifier（参考 async-error-handling）。
- ❌ UIKit 与 SwiftUI 混用时职责边界不清 → 新屏幕统一用 SwiftUI。
- ❌ 新建 Storyboards/XIB → 统一用 SwiftUI。
- ❌ 滥用 `DispatchQueue.main.async` → 使用 `@MainActor` / `await MainActor.run`。
- ❌ Deployment Target 抬得太高导致用户覆盖率损失（能分支的话降一两个版本维持）。
- ❌ `print(...)` 残留到发布版 → 使用 `#if DEBUG` 或 `swift-log`。

## 4. 检查清单
- [ ] Deployment Target、Swift、Xcode 版本是否符合推荐矩阵
- [ ] 是否将状态宏（`@Observable` 或 `@Published`）统一为一种
- [ ] 是否在应用入口点注入依赖，且仅用 EnvironmentObject 处理全局状态
- [ ] 是否用 SPM 管理包并避免新引入 CocoaPods/Carthage
- [ ] 是否未遗漏 Info.plist 的权限理由、Capabilities、URL Scheme
- [ ] 是否将按环境的 URL 分离到 xcconfig 而非硬编码
- [ ] 是否没有 force unwrap、发布版 print、新建 Storyboard 之类的反模式
