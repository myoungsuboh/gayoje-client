---
name: iOS SwiftUI Platform Basics (Index)
description: iOS-only foundational standards for iOS app development — the Swift language, Xcode/SwiftPM setup, state macros, DI, Info.plist, and more. Read this when setting up a new iOS project or deciding iOS-specific configuration and conventions. Patterns common with Android — screen structure, state, networking, permissions, etc. — are delegated to dedicated skills. Keywords: SwiftUI, @State, @Binding, @ObservedObject, @StateObject, @Observable, View, Combine, publisher, SPM, xcconfig.
rules:
  - "iOS apps are written in Swift + SwiftUI."
  - "Model state on the @Observable macro (iOS 17+) as the baseline, but use only one approach per project."
  - "Inject dependencies at the app entry point."
  - "Manage packages with Swift Package Manager."
  - "Do not omit Info.plist permission rationales and Capabilities settings."
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

# 📱 iOS SwiftUI Platform Basics

> Covers only iOS-specific basics (the Swift language, Xcode/SwiftPM, state macros, DI, Info.plist). Read this when setting up a new iOS project or deciding iOS-only configuration and conventions. For design patterns shared with Android, see the other skills in the index below.

## 1. Core Principles
- iOS apps are written in Swift + SwiftUI.
- Model state on the `@Observable` macro (iOS 17+) as the baseline, but use only one approach per project.
- Inject dependencies at the app entry point.
- Manage packages with Swift Package Manager.
- Do not omit Info.plist permission rationales and Capabilities settings.

### Related Skill Index (check first)
This file covers only iOS-only topics. For the topics below, see the dedicated skill.

| Topic | Reference skill |
|------|-----------|
| Project directory structure | project-structure |
| MVVM / UiState / @Published | mobile-state-management |
| Screen transitions / NavigationStack / deep links | navigation-routing |
| URLSession / DTO / token refresh | networking-api |
| Permissions (camera/location/notifications) | permissions-privacy |
| Swift Concurrency / error handling | async-error-handling |
| Keychain / SwiftData / UserDefaults | local-storage |
| Design tokens / components | ui-design-system |
| Safe Area / SizeClass | responsive-device |
| XCTest / XCUITest / snapshots | testing-debugging |
| APNs / notification payload | push-notifications |
| Sign in with Apple/Google/Kakao | auth-social-login |
| VoiceOver / accessibilityLabel | mobile-accessibility |
| App Store registration & certificates | ios-appstore |

## 2. Rules

### 2-1. Recommended Version Matrix (as of 2026)
| Item | Version |
|------|------|
| Deployment Target (minimum supported iOS) | iOS 16.0 (iOS 17 recommended) |
| Swift | 5.10+ (adopt Swift 6 mode cautiously) |
| Xcode | 16+ |
| macOS (build machine) | 14 Sonoma or later |
| New SwiftUI syntax (`@Observable`) | usable only on iOS 17+ |

> Lowering the Deployment Target below iOS 15 means you cannot use `NavigationStack`, `@Observable`, etc. iOS 16 or higher is recommended for new projects.

### 2-2. State Macros — `@Published` vs `@Observable`
| Condition | Recommendation |
|------|------|
| Deployment Target iOS 17+ | `@Observable` macro (new syntax, more precise updates) |
| Needs iOS 16 compatibility | `ObservableObject` + `@Published` (old syntax) |

Use only one within a single project. Mixing them makes the data flow confusing.

```swift
// ✅ iOS 17+ (new syntax)
@Observable
final class HomeViewModel {
    var state = HomeUiState()
    // @Published not needed. Every var property is observed automatically
}

// ✅ iOS 16 compatible (old syntax)
@MainActor
final class HomeViewModel: ObservableObject {
    @Published var state = HomeUiState()
}
```

### 2-3. App Entry Point + Dependency Injection (DI)
iOS has no standard DI like Hilt. Recommended: manual constructor injection + EnvironmentObject for global state.

| Approach | Pros and cons |
|------|--------|
| Constructor injection (manual) | Simplest. Sufficient for small-to-medium apps |
| EnvironmentObject | SwiftUI standard. Use only for global state |
| Factory / Resolver / Needle (external) | Large apps. Compile-time safety |

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

### 2-4. Swift Package Manager (SPM) Standard
Add via `Package.swift` or Xcode Package Dependencies. Avoid CocoaPods/Carthage in new projects.

| Purpose | Package |
|------|--------|
| Snapshot testing | `pointfreeco/swift-snapshot-testing` |
| Dependency injection | `hmlongco/Factory` (when needed) |
| Keychain wrapper | `kishikawakatsumi/KeychainAccess` or a custom implementation (see local-storage) |
| Logging | `apple/swift-log` |

### 2-5. Info.plist / Capabilities (often omitted)
- **Background Modes**: check as needed for push (`remote-notification`), location (`location`), audio (`audio`), etc.
- **App Transport Security**: keep the default (enforce HTTPS). Make exceptions only per domain.
- **Permission usage descriptions**: camera/photos/location/microphone/contacts all require an `NS***UsageDescription` key. If empty, the App Store rejects the app (see permissions-privacy).
- **URL Scheme**: when using deep links / social login callbacks (see navigation-routing, auth-social-login).
- **Associated Domains**: when using Universal Links (`applinks:example.com`).

### 2-6. Swift Language Conventions (additional iOS-specific rules)
- Prefer `let`: use `var` only when something truly must change.
- Prefer `struct`: value types are the default. Use `class` only when reference semantics are needed (ViewModels, etc.).
- `enum` with associated values: represent screen routes, Result types, one-off events.
- `@MainActor`: make ViewModels entirely `@MainActor` classes. UI updates then happen on the main thread automatically.
- Optional handling: prefer `if let` / `guard let`. `force unwrap (!)` is almost always rejected in code review.
- `async/await`: do not newly introduce completion handlers in new code. Wrap existing callback APIs with `withCheckedContinuation` (see async-error-handling).

### 2-7. Build Configuration Environment Separation
Inject per-environment variables via `.xcconfig` files.

```
// Config-Dev.xcconfig
API_BASE_URL = https:/$()/dev-api.example.com
```
> `//` is an xcconfig comment, so you must escape the `//` in the URL as `/$()/`. If you don't know this, the URL gets truncated after building.

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
> Map xcconfig per Debug/Release in Xcode → Project → Configurations. Do not hardcode per-environment URLs.

### 2-8. Debug Tools
| Tool | Purpose |
|------|------|
| `#Preview { ... }` (Xcode 15+) | Check views without a device. Use `.preferredColorScheme(.dark)`, etc. |
| Xcode View Debugger | Inspect the runtime view hierarchy |
| Instruments (Allocations, Time Profiler, Leaks) | Memory/CPU analysis |
| Console.app + `os_log` | Collect logs from physical devices |
| Environment Overrides (simulator) | Instantly toggle dark mode/Dynamic Type/Accessibility |

```swift
// ✅ Block logs in release builds
#if DEBUG
print("debug only")
#endif
```

## 3. Common Mistakes
- ❌ Confusing `@StateObject` and `@ObservedObject` (don't use `@StateObject` to create a new instance in a child view).
- ❌ Creating a fresh `Task { await ... }` every time inside a View → use the `.task` modifier (see async-error-handling).
- ❌ Unclear responsibility boundaries when mixing UIKit and SwiftUI → keep new screens consistently in SwiftUI.
- ❌ Authoring new Storyboards/XIB → keep consistently in SwiftUI.
- ❌ Overusing `DispatchQueue.main.async` → use `@MainActor` / `await MainActor.run`.
- ❌ Raising the Deployment Target too high and losing user coverage (keep it one or two versions lower if you can branch).
- ❌ `print(...)` surviving into release → use `#if DEBUG` or `swift-log`.

## 4. Checklist
- [ ] Do the Deployment Target, Swift, and Xcode versions match the recommended matrix?
- [ ] Did you standardize on one state macro (`@Observable` or `@Published`)?
- [ ] Did you inject dependencies at the app entry point and handle only global state with EnvironmentObject?
- [ ] Did you manage packages with SPM and avoid newly adopting CocoaPods/Carthage?
- [ ] Did you avoid omitting Info.plist permission rationales, Capabilities, and URL Schemes?
- [ ] Did you separate per-environment URLs into xcconfig instead of hardcoding them?
- [ ] Are there no antipatterns like force unwrap, release print, or new Storyboard authoring?
