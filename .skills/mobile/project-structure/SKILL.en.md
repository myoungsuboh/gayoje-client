---
name: Mobile Project Structure Design (iOS/Android Shared Mental Model)
description: A directory structure standard that arranges native iOS (SwiftUI) and Android (Compose) in parallel under the same mental model. Read this when starting a new app or deciding on folder structure / module separation, and when aligning screen/feature locations across both platforms. Keywords: build.gradle, Podfile, Package.swift, settings.gradle, AndroidManifest.xml, feature-first, layer, modularization.
rules:
  - "Arrange directories as Feature-first + layered structure."
  - "Keep iOS and Android in a parallel folder structure — make Feature names identical on both platforms."
  - "Keep the screen, state, and data layers together in a single Feature folder to preserve self-containment."
  - "The dependency direction is always Features → Core. Core does not know about Features (reverse import forbidden)."
  - "As the app grows, separate into modules per Feature."
  - "Avoid the anti-pattern of cramming shared logic into one screen or mixing it into ambiguous folders."
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

# 📱 Mobile Project Structure Design

> Build native iOS and Android separately, but keep folder names and layer depth nearly identical to maintain the same mental model. Read this when starting a new app or deciding on folder structure / module separation.

## 1. Core Principles

- Arrange directories as Feature-first + layered structure.
- Keep iOS and Android in a parallel folder structure — make Feature names identical on both platforms.
- Keep the screen, state, and data layers together in a single Feature folder to preserve self-containment.
- The dependency direction is always `Features → Core`. Core does not know about Features (reverse import forbidden).
- As the app grows, separate into modules per Feature.
- Avoid the anti-pattern of cramming shared logic into one screen or mixing it into ambiguous folders.

## 2. Rules

### 2-1. Shared Mental Model (Feature-first + Layer)

Regardless of platform, maintain the following 4 layers.

| Layer | Role | iOS Location | Android Location |
|------|------|----------|--------------|
| **App** | Entry point, global config | `App/` | `app/` root package |
| **Features** | Per-screen (Home, Detail, Login...) | `Features/<Name>/` | `ui/<name>/` |
| **Core** | Network, models, utilities | `Core/` | `data/`, `domain/`, `core/` |
| **Resources** | Images, fonts, strings | `Resources/` | `res/` |

- **Self-contained per Feature**: keep the View + ViewModel + screen-specific components a screen uses in the same folder.
- **Feature names are identical on both platforms**: iOS `Features/Home`, Android `ui/home` → both are the "Home" screen.

### 2-2. iOS (SwiftUI) Standard Directory

```
MyApp/
├── App/
│   ├── MyApp.swift              # @main, app entry point
│   ├── AppDelegate.swift        # for push/deep-link handling
│   └── RootView.swift           # top-level routing such as login branching
├── Features/
│   ├── Home/
│   │   ├── HomeView.swift
│   │   ├── HomeViewModel.swift
│   │   └── Components/          # small views used only on this screen
│   │       └── HomeBanner.swift
│   ├── Detail/
│   └── Auth/
│       ├── LoginView.swift
│       └── SignUpView.swift
├── Core/
│   ├── Network/
│   │   ├── APIClient.swift      # URLSession wrapper
│   │   ├── Endpoint.swift
│   │   └── DTO/
│   ├── Storage/
│   │   ├── KeychainStore.swift
│   │   └── UserDefaultsStore.swift
│   ├── Models/                  # domain models (pure models, not Codable)
│   ├── DesignSystem/
│   │   ├── Colors.swift
│   │   ├── Typography.swift
│   │   └── Components/          # globally reused components (PrimaryButton, etc.)
│   └── Utils/
└── Resources/
    ├── Assets.xcassets
    ├── Localizable.strings
    └── Info.plist
```

### 2-3. Android (Kotlin/Compose) Standard Directory

```
app/src/main/java/com/harness/app/
├── MyApplication.kt             # @HiltAndroidApp
├── MainActivity.kt              # entry Activity
├── ui/
│   ├── home/
│   │   ├── HomeScreen.kt
│   │   ├── HomeViewModel.kt
│   │   ├── HomeUiState.kt
│   │   └── components/          # composables used only on this screen
│   │       └── HomeBanner.kt
│   ├── detail/
│   ├── auth/
│   ├── navigation/              # NavHost, Screen sealed class
│   └── theme/
│       ├── Color.kt
│       ├── Theme.kt
│       ├── Type.kt
│       └── components/          # global reuse such as PrimaryButton
├── data/
│   ├── remote/
│   │   ├── ApiService.kt
│   │   └── dto/
│   ├── local/
│   │   ├── AppDatabase.kt       # Room
│   │   └── dao/
│   └── repository/
├── domain/
│   └── model/                   # domain models
├── di/
│   └── AppModule.kt             # Hilt module
└── core/
    └── util/
```

### 2-4. 3 Things to Follow When Laying Out a Feature Folder

1. **3-file rule**: a single screen has at least three files: `View/Screen` + `ViewModel` + `UiState (or Output)`. Don't cram everything into one file.
2. **Components subfolder**: separate small views specific to that screen into `Components/` (iOS) or `components/` (Android). When the need to use it on another screen arises, promote it to Core at that point.
3. **Test location**: mirror the same folder structure as the main code.
   - iOS: `MyAppTests/Features/Home/HomeViewModelTests.swift`
   - Android: `app/src/test/java/com/harness/app/ui/home/HomeViewModelTest.kt`

### 2-5. Modularization (When the App Grows)

A single module is enough for a small app. For medium and up (10+ screens), consider module separation.

| iOS (SPM) | Android (Gradle module) | Purpose |
|-----------|--------------------------|------|
| `App` | `:app` | entry point only |
| `FeatureHome`, `FeatureAuth` | `:feature:home`, `:feature:auth` | per-Feature separation |
| `CoreNetwork`, `CoreUI` | `:core:network`, `:core:ui` | shared |

> Separation criterion: **"If I remove this module, do the other modules still build?"** must hold for separation to be meaningful. If not, a single module is better.

## 3. Common Mistakes

- ❌ Putting everything into `Utils/` (network, DB, formatting, extensions all mixed in one folder).
- ❌ Calling URLSession/Retrofit directly inside a View → always go through ViewModel → Service/Repository.
- ❌ Doing iOS Feature-first but Android layer-first (controller/service/model) → cognitive load explodes when the two platform structures diverge.
- ❌ Overusing ambiguous folder names like `Common`, `Helper`, `Manager` → use names with clear responsibility (`Network`, `Storage`, `DesignSystem`).

## 4. Checklist

- [ ] Did you lay out directories as Feature-first + Layer structure?
- [ ] Are the iOS and Android Feature names and layer depth parallel?
- [ ] Does a single screen have the 3 files View/Screen + ViewModel + UiState?
- [ ] Is the dependency direction one-way `Features → Core`?
- [ ] Do tests mirror the same folder structure as the main code?
- [ ] Are names revealing of responsibility, without ambiguous folder names (Common/Helper/Manager)?
