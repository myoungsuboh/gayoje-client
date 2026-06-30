---
name: 모바일 프로젝트 구조 설계 (iOS/Android 공통 멘탈 모델)
description: 네이티브 iOS(SwiftUI)와 Android(Compose)를 같은 멘탈 모델로 평행하게 잡는 디렉토리 구조 표준. 새 앱을 시작하거나 폴더 구조·모듈 분리를 정할 때, 화면·기능 위치를 양 플랫폼에서 일치시킬 때 읽는다. 키워드: build.gradle, Podfile, Package.swift, settings.gradle, AndroidManifest.xml, feature-first, layer, 모듈화.
rules:
  - "디렉토리는 기능 우선(Feature-first) + 레이어 구조로 잡는다."
  - "iOS와 Android를 평행한 폴더 구조로 유지한다 — Feature 이름을 양 플랫폼에서 동일하게 맞춘다."
  - "한 Feature 폴더에 화면·상태·데이터 계층을 함께 둬 자기 완결성을 지킨다."
  - "의존 방향은 항상 Features → Core. Core는 Feature를 모른다(역방향 import 금지)."
  - "앱이 커지면 Feature 단위로 모듈을 분리한다."
  - "공통 로직을 한 화면에 몰아넣거나 모호한 폴더에 섞는 안티패턴을 피한다."
tags:
  - "build.gradle"
  - "Podfile"
  - "Package.swift"
  - "settings.gradle"
  - "AndroidManifest.xml"
  - "feature-first"
  - "layer"
  - "모듈화"
---

# 📱 모바일 프로젝트 구조 설계

> 네이티브 iOS와 Android를 따로 만들되, 폴더 이름과 계층 깊이를 거의 동일하게 맞춰 같은 멘탈 모델을 유지한다. 새 앱을 시작하거나 폴더 구조·모듈 분리를 정할 때 읽는다.

## 1. 핵심 원칙

- 디렉토리는 기능 우선(Feature-first) + 레이어 구조로 잡는다.
- iOS와 Android를 평행한 폴더 구조로 유지한다 — Feature 이름을 양 플랫폼에서 동일하게 맞춘다.
- 한 Feature 폴더에 화면·상태·데이터 계층을 함께 둬 자기 완결성을 지킨다.
- 의존 방향은 항상 `Features → Core`. Core는 Feature를 모른다(역방향 import 금지).
- 앱이 커지면 Feature 단위로 모듈을 분리한다.
- 공통 로직을 한 화면에 몰아넣거나 모호한 폴더에 섞는 안티패턴을 피한다.

## 2. 규칙

### 2-1. 공통 멘탈 모델 (Feature-first + Layer)

플랫폼과 무관하게 다음 4 계층을 유지한다.

| 계층 | 역할 | iOS 위치 | Android 위치 |
|------|------|----------|--------------|
| **App** | 진입점, 전역 설정 | `App/` | `app/` 루트 패키지 |
| **Features** | 화면 단위 (Home, Detail, Login...) | `Features/<Name>/` | `ui/<name>/` |
| **Core** | 네트워크, 모델, 유틸 | `Core/` | `data/`, `domain/`, `core/` |
| **Resources** | 이미지, 폰트, 문자열 | `Resources/` | `res/` |

- **Feature 단위로 자기 완결**: 한 화면이 쓰는 View + ViewModel + 화면 전용 컴포넌트는 같은 폴더에 둔다.
- **양 플랫폼의 Feature 이름은 동일**: iOS `Features/Home`, Android `ui/home` → 둘 다 "Home" 화면.

### 2-2. iOS (SwiftUI) 표준 디렉토리

```
MyApp/
├── App/
│   ├── MyApp.swift              # @main, 앱 진입점
│   ├── AppDelegate.swift        # 푸시·딥링크 처리 시
│   └── RootView.swift           # 로그인 분기 등 최상단 라우팅
├── Features/
│   ├── Home/
│   │   ├── HomeView.swift
│   │   ├── HomeViewModel.swift
│   │   └── Components/          # 이 화면에서만 쓰는 작은 뷰
│   │       └── HomeBanner.swift
│   ├── Detail/
│   └── Auth/
│       ├── LoginView.swift
│       └── SignUpView.swift
├── Core/
│   ├── Network/
│   │   ├── APIClient.swift      # URLSession 래퍼
│   │   ├── Endpoint.swift
│   │   └── DTO/
│   ├── Storage/
│   │   ├── KeychainStore.swift
│   │   └── UserDefaultsStore.swift
│   ├── Models/                  # 도메인 모델 (Codable이 아닌 순수 모델)
│   ├── DesignSystem/
│   │   ├── Colors.swift
│   │   ├── Typography.swift
│   │   └── Components/          # 전역 재사용 컴포넌트 (PrimaryButton 등)
│   └── Utils/
└── Resources/
    ├── Assets.xcassets
    ├── Localizable.strings
    └── Info.plist
```

### 2-3. Android (Kotlin/Compose) 표준 디렉토리

```
app/src/main/java/com/harness/app/
├── MyApplication.kt             # @HiltAndroidApp
├── MainActivity.kt              # 진입 Activity
├── ui/
│   ├── home/
│   │   ├── HomeScreen.kt
│   │   ├── HomeViewModel.kt
│   │   ├── HomeUiState.kt
│   │   └── components/          # 이 화면에서만 쓰는 컴포저블
│   │       └── HomeBanner.kt
│   ├── detail/
│   ├── auth/
│   ├── navigation/              # NavHost, Screen sealed class
│   └── theme/
│       ├── Color.kt
│       ├── Theme.kt
│       ├── Type.kt
│       └── components/          # PrimaryButton 등 전역 재사용
├── data/
│   ├── remote/
│   │   ├── ApiService.kt
│   │   └── dto/
│   ├── local/
│   │   ├── AppDatabase.kt       # Room
│   │   └── dao/
│   └── repository/
├── domain/
│   └── model/                   # 도메인 모델
├── di/
│   └── AppModule.kt             # Hilt 모듈
└── core/
    └── util/
```

### 2-4. Feature 폴더 짤 때 지켜야 할 3가지

1. **3 파일 룰**: 하나의 화면은 최소 `View/Screen` + `ViewModel` + `UiState(또는 Output)` 세 파일을 가진다. 한 파일에 다 몰지 말 것.
2. **Components 하위 폴더**: 그 화면 전용 작은 뷰는 `Components/`(iOS) 또는 `components/`(Android)로 분리. 다른 화면에서 쓸 일이 생기면 그때 Core로 승격.
3. **테스트 위치**: 본체와 같은 폴더 구조를 미러링.
   - iOS: `MyAppTests/Features/Home/HomeViewModelTests.swift`
   - Android: `app/src/test/java/com/harness/app/ui/home/HomeViewModelTest.kt`

### 2-5. 모듈화 (앱이 커질 때)

작은 앱은 단일 모듈로 충분. 중간 이상(화면 10개 이상)이면 모듈 분리를 검토한다.

| iOS (SPM) | Android (Gradle module) | 목적 |
|-----------|--------------------------|------|
| `App` | `:app` | 진입점만 |
| `FeatureHome`, `FeatureAuth` | `:feature:home`, `:feature:auth` | Feature별 분리 |
| `CoreNetwork`, `CoreUI` | `:core:network`, `:core:ui` | 공통 |

> 분리 기준: **"이 모듈 빼도 다른 모듈은 빌드 되는가?"** 가 되어야 분리 의미가 있다. 안 되면 단일 모듈이 낫다.

## 3. 흔한 실수

- ❌ `Utils/`에 모든 걸 다 넣는다 (네트워크, DB, 포맷팅, 익스텐션이 한 폴더에 섞임).
- ❌ View 안에서 직접 URLSession/Retrofit 호출 → 반드시 ViewModel → Service/Repository 경유.
- ❌ iOS는 Feature-first인데 Android는 layer-first(controller/service/model)로 잡기 → 두 플랫폼 구조가 어긋나면 인지 부하 폭증.
- ❌ `Common`, `Helper`, `Manager` 같은 모호한 폴더명 남발 → 책임을 명확히 한 이름으로(`Network`, `Storage`, `DesignSystem`).

## 4. 체크리스트

- [ ] 디렉토리를 Feature-first + Layer 구조로 잡았는가
- [ ] iOS와 Android의 Feature 이름·계층 깊이가 평행한가
- [ ] 한 화면이 View/Screen + ViewModel + UiState 3파일을 갖췄는가
- [ ] 의존 방향이 `Features → Core` 단방향인가
- [ ] 테스트가 본체와 같은 폴더 구조를 미러링하는가
- [ ] 모호한 폴더명(Common/Helper/Manager) 없이 책임이 드러나는 이름인가
