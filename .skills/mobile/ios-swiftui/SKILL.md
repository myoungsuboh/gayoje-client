---
name: iOS SwiftUI 플랫폼 기본 (인덱스)
description: iOS 앱 개발의 Swift 언어·Xcode/SwiftPM 설정·상태 매크로·DI·Info.plist 등 iOS-only 기초 표준. 신규 iOS 프로젝트를 세팅하거나 iOS 고유 설정·컨벤션을 정할 때 읽는다. 화면 구조·상태·네트워킹·권한 등 Android 공통 패턴은 전용 스킬로 위임한다. 키워드: SwiftUI, @State, @Binding, @ObservedObject, @StateObject, @Observable, View, Combine, publisher, SPM, xcconfig.
rules:
  - "iOS 앱은 Swift + SwiftUI 로 작성한다."
  - "상태는 @Observable 매크로(iOS 17+) 기준으로 모델링하되, 한 프로젝트에서는 한 방식만 쓴다."
  - "의존성은 앱 진입점에서 주입한다."
  - "패키지는 Swift Package Manager 로 관리한다."
  - "Info.plist 권한 사유와 Capabilities 설정을 빠뜨리지 않는다."
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

# 📱 iOS SwiftUI 플랫폼 기본

> iOS 고유 기초(Swift 언어, Xcode/SwiftPM, 상태 매크로, DI, Info.plist)만 다룬다. 신규 iOS 프로젝트를 세팅하거나 iOS-only 설정·컨벤션을 정할 때 읽는다. Android와 공통되는 설계 패턴은 아래 인덱스의 다른 스킬을 본다.

## 1. 핵심 원칙
- iOS 앱은 Swift + SwiftUI 로 작성한다.
- 상태는 `@Observable` 매크로(iOS 17+) 기준으로 모델링하되, 한 프로젝트에서는 한 방식만 쓴다.
- 의존성은 앱 진입점에서 주입한다.
- 패키지는 Swift Package Manager 로 관리한다.
- Info.plist 권한 사유와 Capabilities 설정을 빠뜨리지 않는다.

### 관련 스킬 인덱스 (먼저 확인)
이 파일은 iOS-only 토픽만 다룬다. 아래 주제는 전용 스킬을 본다.

| 주제 | 참고 스킬 |
|------|-----------|
| 프로젝트 디렉토리 구조 | project-structure |
| MVVM / UiState / @Published | mobile-state-management |
| 화면 전환 / NavigationStack / 딥링크 | navigation-routing |
| URLSession / DTO / 토큰 갱신 | networking-api |
| 권한 (카메라/위치/알림) | permissions-privacy |
| Swift Concurrency / 에러 처리 | async-error-handling |
| Keychain / SwiftData / UserDefaults | local-storage |
| 디자인 토큰 / 컴포넌트 | ui-design-system |
| Safe Area / SizeClass | responsive-device |
| XCTest / XCUITest / 스냅샷 | testing-debugging |
| APNs / 알림 payload | push-notifications |
| Sign in with Apple/Google/Kakao | auth-social-login |
| VoiceOver / accessibilityLabel | mobile-accessibility |
| App Store 등록·인증서 | ios-appstore |

## 2. 규칙

### 2-1. 권장 버전 매트릭스 (2026 기준)
| 항목 | 버전 |
|------|------|
| Deployment Target (최저 지원 iOS) | iOS 16.0 (iOS 17 권장) |
| Swift | 5.10+ (Swift 6 모드는 신중 도입) |
| Xcode | 16+ |
| macOS (빌드 머신) | 14 Sonoma 이상 |
| SwiftUI 신문법 (`@Observable`) | iOS 17+ 만 사용 가능 |

> Deployment Target을 iOS 15 이하로 낮추면 `NavigationStack`, `@Observable` 등을 못 쓴다. 신규 프로젝트는 iOS 16 이상 권장.

### 2-2. 상태 매크로 — `@Published` vs `@Observable`
| 조건 | 권장 |
|------|------|
| Deployment Target iOS 17+ | `@Observable` 매크로 (신문법, 더 정밀한 갱신) |
| iOS 16 호환 필요 | `ObservableObject` + `@Published` (구문법) |

한 프로젝트 안에서는 한 가지만 사용한다. 섞으면 데이터 흐름이 헷갈린다.

```swift
// ✅ iOS 17+ (신문법)
@Observable
final class HomeViewModel {
    var state = HomeUiState()
    // @Published 불필요. 모든 var 프로퍼티가 자동 관찰됨
}

// ✅ iOS 16 호환 (구문법)
@MainActor
final class HomeViewModel: ObservableObject {
    @Published var state = HomeUiState()
}
```

### 2-3. 앱 진입점 + 의존성 주입 (DI)
iOS에는 Hilt 같은 표준 DI가 없다. 권장: 수동 생성자 주입 + 전역 상태는 EnvironmentObject.

| 방식 | 장단점 |
|------|--------|
| 생성자 주입 (수동) | 가장 단순. 소~중규모 앱에 충분 |
| EnvironmentObject | SwiftUI 표준. 전역 상태에만 사용 |
| Factory / Resolver / Needle (외부) | 대규모 앱. 컴파일 타임 안전성 |

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

### 2-4. Swift Package Manager (SPM) 표준
`Package.swift` 또는 Xcode Package Dependencies로 추가. CocoaPods/Carthage는 신규 프로젝트에서 지양.

| 용도 | 패키지 |
|------|--------|
| Snapshot 테스트 | `pointfreeco/swift-snapshot-testing` |
| 의존성 주입 | `hmlongco/Factory` (필요 시) |
| Keychain 래퍼 | `kishikawakatsumi/KeychainAccess` 또는 자체 구현 (local-storage 참고) |
| 로깅 | `apple/swift-log` |

### 2-5. Info.plist / Capabilities (자주 빠뜨림)
- **Background Modes**: 푸시(`remote-notification`), 위치(`location`), 오디오(`audio`) 등 필요 시 체크.
- **App Transport Security**: 기본값 유지(HTTPS 강제). 예외는 도메인 단위로만.
- **권한 사용 설명**: 카메라/사진/위치/마이크/연락처 모두 `NS***UsageDescription` 키 필수. 비어 있으면 앱스토어 리젝 (permissions-privacy 참고).
- **URL Scheme**: 딥링크/소셜 로그인 콜백 사용 시 (navigation-routing, auth-social-login 참고).
- **Associated Domains**: Universal Links (`applinks:example.com`) 사용 시.

### 2-6. Swift 언어 컨벤션 (iOS 한정 추가 룰)
- `let` 우선: `var`는 정말 변해야 할 때만.
- `struct` 우선: 값 타입이 기본. 참조 의미가 필요한 경우(ViewModel 등)만 `class`.
- `enum` with associated values: 화면 라우트, Result 타입, 일회성 이벤트 표현.
- `@MainActor`: ViewModel은 통째로 `@MainActor` 클래스로. UI 갱신이 자동으로 메인스레드에서 일어남.
- 옵셔널 처리: `if let` / `guard let` 권장. `force unwrap (!)` 은 코드리뷰에서 거의 항상 reject.
- `async/await`: 신규 코드에 completion handler 신규 도입 금지. 기존 콜백 API는 `withCheckedContinuation`으로 래핑 (async-error-handling 참고).

### 2-7. Build Configuration 환경 분리
`.xcconfig` 파일로 환경별 변수 주입.

```
// Config-Dev.xcconfig
API_BASE_URL = https:/$()/dev-api.example.com
```
> `//` 는 xcconfig 주석이라 URL의 `//`를 `/$()/` 로 escape 해야 한다. 모르면 빌드 후 URL이 잘린다.

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
> Xcode → Project → Configurations 에서 Debug/Release 별로 xcconfig 매핑. 환경별 URL 하드코딩 금지.

### 2-8. 디버그 도구
| 도구 | 용도 |
|------|------|
| `#Preview { ... }` (Xcode 15+) | 디바이스 없이 뷰 확인. `.preferredColorScheme(.dark)` 등 활용 |
| Xcode View Debugger | 런타임 뷰 계층 확인 |
| Instruments (Allocations, Time Profiler, Leaks) | 메모리·CPU 분석 |
| Console.app + `os_log` | 실기기 로그 수집 |
| Environment Overrides (시뮬레이터) | 다크모드/Dynamic Type/Accessibility 즉시 전환 |

```swift
// ✅ 릴리즈 빌드 로그 차단
#if DEBUG
print("debug only")
#endif
```

## 3. 흔한 실수
- ❌ `@StateObject` 와 `@ObservedObject` 혼동 (자식 뷰에 새 인스턴스 생성하려고 `@StateObject` 쓰지 말 것).
- ❌ View 안에서 `Task { await ... }` 를 매번 새로 생성 → `.task` modifier 사용 (async-error-handling 참고).
- ❌ UIKit과 SwiftUI 혼용 시 책임 경계 불명확 → 신규 화면은 SwiftUI로 일관.
- ❌ Storyboards/XIB 신규 작성 → SwiftUI로 일관.
- ❌ `DispatchQueue.main.async` 남발 → `@MainActor` / `await MainActor.run` 사용.
- ❌ Deployment Target을 너무 높여 사용자 커버리지 손실 (분기 가능하면 한두 버전 낮춰 유지).
- ❌ `print(...)` 가 릴리즈에 살아있음 → `#if DEBUG` 또는 `swift-log` 사용.

## 4. 체크리스트
- [ ] Deployment Target·Swift·Xcode 버전이 권장 매트릭스에 맞는가
- [ ] 상태 매크로(`@Observable` 또는 `@Published`)를 한 가지로 통일했는가
- [ ] 의존성을 앱 진입점에서 주입하고 전역 상태만 EnvironmentObject로 다뤘는가
- [ ] 패키지를 SPM으로 관리하고 CocoaPods/Carthage 신규 도입을 피했는가
- [ ] Info.plist 권한 사유·Capabilities·URL Scheme을 빠뜨리지 않았는가
- [ ] 환경별 URL을 xcconfig로 분리하고 하드코딩하지 않았는가
- [ ] force unwrap·릴리즈 print·Storyboard 신규 작성 같은 안티패턴이 없는가
