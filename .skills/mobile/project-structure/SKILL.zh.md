---
name: 移动端项目结构设计 (iOS/Android 通用心智模型)
description: 将原生 iOS(SwiftUI)与 Android(Compose)以相同心智模型平行搭建的目录结构标准。当开始新应用,或制定文件夹结构·模块拆分时,以及在两个平台间对齐画面·功能位置时阅读。关键词: build.gradle, Podfile, Package.swift, settings.gradle, AndroidManifest.xml, feature-first, layer, 模块化.
rules:
  - "目录采用功能优先(Feature-first) + 分层结构搭建。"
  - "保持 iOS 与 Android 的平行文件夹结构 — 让 Feature 名称在两个平台保持一致。"
  - "在一个 Feature 文件夹中同时放置画面·状态·数据层,保持自包含性。"
  - "依赖方向始终为 Features → Core。Core 不知道 Feature(禁止反向 import)。"
  - "应用变大时按 Feature 为单位拆分模块。"
  - "避免将公共逻辑塞进单个画面或混入含糊文件夹的反模式。"
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

# 📱 移动端项目结构设计

> 分别构建原生 iOS 与 Android,但让文件夹名称与层级深度几乎一致,以维持相同的心智模型。当开始新应用,或制定文件夹结构·模块拆分时阅读。

## 1. 核心原则

- 目录采用功能优先(Feature-first) + 分层结构搭建。
- 保持 iOS 与 Android 的平行文件夹结构 — 让 Feature 名称在两个平台保持一致。
- 在一个 Feature 文件夹中同时放置画面·状态·数据层,保持自包含性。
- 依赖方向始终为 `Features → Core`。Core 不知道 Feature(禁止反向 import)。
- 应用变大时按 Feature 为单位拆分模块。
- 避免将公共逻辑塞进单个画面或混入含糊文件夹的反模式。

## 2. 规则

### 2-1. 通用心智模型 (Feature-first + Layer)

无论平台如何,维持以下 4 层。

| 层 | 角色 | iOS 位置 | Android 位置 |
|------|------|----------|--------------|
| **App** | 入口点、全局配置 | `App/` | `app/` 根包 |
| **Features** | 画面单位 (Home, Detail, Login...) | `Features/<Name>/` | `ui/<name>/` |
| **Core** | 网络、模型、工具 | `Core/` | `data/`, `domain/`, `core/` |
| **Resources** | 图片、字体、字符串 | `Resources/` | `res/` |

- **以 Feature 为单位自包含**: 将一个画面所用的 View + ViewModel + 画面专用组件放在同一文件夹。
- **两个平台的 Feature 名称一致**: iOS `Features/Home`,Android `ui/home` → 都是「Home」画面。

### 2-2. iOS (SwiftUI) 标准目录

```
MyApp/
├── App/
│   ├── MyApp.swift              # @main, 应用入口点
│   ├── AppDelegate.swift        # 推送·深链处理时
│   └── RootView.swift           # 登录分支等最顶层路由
├── Features/
│   ├── Home/
│   │   ├── HomeView.swift
│   │   ├── HomeViewModel.swift
│   │   └── Components/          # 仅在此画面使用的小视图
│   │       └── HomeBanner.swift
│   ├── Detail/
│   └── Auth/
│       ├── LoginView.swift
│       └── SignUpView.swift
├── Core/
│   ├── Network/
│   │   ├── APIClient.swift      # URLSession 封装
│   │   ├── Endpoint.swift
│   │   └── DTO/
│   ├── Storage/
│   │   ├── KeychainStore.swift
│   │   └── UserDefaultsStore.swift
│   ├── Models/                  # 领域模型 (非 Codable 的纯模型)
│   ├── DesignSystem/
│   │   ├── Colors.swift
│   │   ├── Typography.swift
│   │   └── Components/          # 全局复用组件 (PrimaryButton 等)
│   └── Utils/
└── Resources/
    ├── Assets.xcassets
    ├── Localizable.strings
    └── Info.plist
```

### 2-3. Android (Kotlin/Compose) 标准目录

```
app/src/main/java/com/harness/app/
├── MyApplication.kt             # @HiltAndroidApp
├── MainActivity.kt              # 入口 Activity
├── ui/
│   ├── home/
│   │   ├── HomeScreen.kt
│   │   ├── HomeViewModel.kt
│   │   ├── HomeUiState.kt
│   │   └── components/          # 仅在此画面使用的可组合项
│   │       └── HomeBanner.kt
│   ├── detail/
│   ├── auth/
│   ├── navigation/              # NavHost, Screen sealed class
│   └── theme/
│       ├── Color.kt
│       ├── Theme.kt
│       ├── Type.kt
│       └── components/          # PrimaryButton 等全局复用
├── data/
│   ├── remote/
│   │   ├── ApiService.kt
│   │   └── dto/
│   ├── local/
│   │   ├── AppDatabase.kt       # Room
│   │   └── dao/
│   └── repository/
├── domain/
│   └── model/                   # 领域模型
├── di/
│   └── AppModule.kt             # Hilt 模块
└── core/
    └── util/
```

### 2-4. 划分 Feature 文件夹时必须遵守的 3 点

1. **3 文件规则**: 一个画面至少拥有 `View/Screen` + `ViewModel` + `UiState(或 Output)` 三个文件。不要把所有内容塞进一个文件。
2. **Components 子文件夹**: 将该画面专用的小视图分离到 `Components/`(iOS)或 `components/`(Android)。当出现需要在其他画面使用的情况时,再将其提升到 Core。
3. **测试位置**: 镜像与主体相同的文件夹结构。
   - iOS: `MyAppTests/Features/Home/HomeViewModelTests.swift`
   - Android: `app/src/test/java/com/harness/app/ui/home/HomeViewModelTest.kt`

### 2-5. 模块化 (应用变大时)

小应用单一模块即可。中等以上(10 个以上画面)则考虑模块拆分。

| iOS (SPM) | Android (Gradle module) | 目的 |
|-----------|--------------------------|------|
| `App` | `:app` | 仅入口点 |
| `FeatureHome`, `FeatureAuth` | `:feature:home`, `:feature:auth` | 按 Feature 拆分 |
| `CoreNetwork`, `CoreUI` | `:core:network`, `:core:ui` | 公共 |

> 拆分标准: 必须满足 **「拿掉这个模块,其他模块还能构建吗?」** 拆分才有意义。若不能,单一模块更好。

## 3. 常见错误

- ❌ 把所有东西都放进 `Utils/`(网络、DB、格式化、扩展混在一个文件夹)。
- ❌ 在 View 中直接调用 URLSession/Retrofit → 必须经由 ViewModel → Service/Repository。
- ❌ iOS 用 Feature-first 而 Android 用 layer-first(controller/service/model)→ 两个平台结构错位会导致认知负荷暴增。
- ❌ 滥用 `Common`、`Helper`、`Manager` 之类含糊的文件夹名 → 改用职责明确的名称(`Network`、`Storage`、`DesignSystem`)。

## 4. 检查清单

- [ ] 是否将目录按 Feature-first + Layer 结构搭建
- [ ] iOS 与 Android 的 Feature 名称·层级深度是否平行
- [ ] 一个画面是否具备 View/Screen + ViewModel + UiState 三个文件
- [ ] 依赖方向是否为 `Features → Core` 单向
- [ ] 测试是否镜像与主体相同的文件夹结构
- [ ] 是否没有含糊的文件夹名(Common/Helper/Manager)而采用体现职责的名称
