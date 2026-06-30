---
name: Android Kotlin/Compose 平台基础（索引）
description: 涵盖 Android 应用开发中 Kotlin 语言、Jetpack Compose 构建系统、Hilt、ProGuard 等 Android 专有事项。在搭建新的 Android 项目，或确定构建变体、DI、发布混淆时阅读。屏幕结构、状态管理、网络、权限等与 iOS 共通的模式委托给专用技能。关键词: kotlin, Activity, Fragment, ViewModel, Compose, @Composable, lifecycle, Hilt, ProGuard, R8, KSP, build variants。
rules:
  - "Android 应用使用 Kotlin + Jetpack Compose 编写。"
  - "依赖注入用 Hilt 配置，并在 Application 入口点标注 @HiltAndroidApp。"
  - "屏幕采用单 Activity + Compose NavHost 模式构建。"
  - "用构建变体（Build Variants）分离 dev、staging、prod 环境。"
  - "发布构建用 R8/ProGuard 规则进行混淆与缩减。"
  - "本文件仅涵盖 Android 专有主题，共通模式委托给专用技能。"
tags:
  - "kotlin"
  - "Activity"
  - "Fragment"
  - "ViewModel"
  - "Compose"
  - "@Composable"
  - "lifecycle"
  - "Hilt"
  - "ProGuard"
  - "R8"
  - "KSP"
  - "build variants"
---

# 🤖 Android Kotlin/Compose 平台基础

> 仅涵盖 Android 专有基础（语言、构建、DI、混淆）。在搭建新的 Android 项目，或确定 Android 专用配置时阅读。与 iOS 共通的设计模式参见 §1 索引中的其他技能。

## 1. 核心原则

- Android 应用使用 **Kotlin + Jetpack Compose** 编写。
- 依赖注入用 **Hilt** 配置，并在 Application 入口点标注 `@HiltAndroidApp`。
- 屏幕采用 **单 Activity + Compose NavHost** 模式构建。
- 用 **构建变体（Build Variants）** 分离 dev、staging、prod 环境。
- 发布构建用 **R8/ProGuard** 规则进行混淆与缩减。
- 本文件仅涵盖 Android 专有主题，共通模式委托给专用技能。

### 相关技能索引（先确认）

| 主题 | 参考技能 |
|------|-------------|
| 项目目录结构 | project-structure §3 |
| MVVM / UiState / StateFlow | mobile-state-management |
| 屏幕切换 / NavHost / 深度链接 | navigation-routing |
| Retrofit / DTO / 令牌刷新 | networking-api |
| 权限（相机/位置/通知） | permissions-privacy |
| Coroutine 作用域 / 错误处理 | async-error-handling |
| Room / DataStore / EncryptedPrefs | local-storage |
| Material 3 令牌 / 组件 | ui-design-system |
| Safe Area / WindowSizeClass | responsive-device |
| JUnit / MockK / Compose Test | testing-debugging |
| FCM / NotificationChannel | push-notifications |
| 社交登录（Google/Apple/Kakao） | auth-social-login |
| TalkBack / contentDescription | mobile-accessibility |
| Play Store 注册与签名 | android-playstore |

## 2. 规则

### 2-1. 推荐版本矩阵（2026 年基准）

| 项目 | 版本 |
|------|------|
| minSdk | 26 (Android 8.0) |
| compileSdk / targetSdk | 35 (Android 15) |
| Kotlin | 2.0+ (K2 编译器) |
| Compose BOM (Bill of Materials) | 2024.10+ |
| AGP (Android Gradle Plugin) | 8.5+ |
| Gradle | 8.9+ |
| JDK（构建用） | 17 |

> 降低 minSdk 会提高用户覆盖率，但绕行代码会激增。新项目推荐 26 及以上。

### 2-2. 必需依赖（build.gradle.kts）

```kotlin
dependencies {
    // Compose
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Lifecycle + ViewModel
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.3")

    // DI (Dependency Injection — Hilt)
    implementation("com.google.dagger:hilt-android:2.52")
    ksp("com.google.dagger:hilt-android-compiler:2.52")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // Coroutine
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
```

> 用 **KSP（Kotlin Symbol Processing）** 代替 KAPT（Kotlin Annotation Processing Tool）。KAPT 构建慢 2～3 倍，且经常与 K2 冲突。

### 2-3. Application 入口点（使用 Hilt 时必需）

```kotlin
@HiltAndroidApp
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
    }
}
```

`AndroidManifest.xml`:
```xml
<application
    android:name=".MyApplication"
    android:theme="@style/Theme.MyApp">
    <activity
        android:name=".MainActivity"
        android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>
</application>
```

### 2-4. 单 Activity + Compose NavHost 模式

```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // edge-to-edge — Safe Area 处理参见 responsive-device
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            AppTheme {              // 定义参见 ui-design-system
                AppNavHost()        // 路由定义参见 navigation-routing
            }
        }
    }
}
```

> 新项目以 **单 Activity + Compose** 为标准。Fragment/多 Activity 结构仅用于遗留维护。

### 2-5. Kotlin 语言约定（移动端专属的附加规则）

- **优先 `val`**: `var` 仅在确实需要变化时使用。
- **`data class`**: UiState、DTO、领域模型全部用 data class。
- **`sealed class/interface`**: 表达屏幕路由、一次性事件、Result 类型。参见 navigation-routing、state-management。
- **扩展函数**: 在为外部类添加行为时使用。禁止滥用全局扩展。
- **`object` 单例**: 仅用于无状态的工具/映射器。若有状态则用 Hilt `@Singleton`。
- **Null 处理**: Java interop 的平台类型必须用 `?` 接收。`!!` 在代码评审中几乎总会被 reject。

### 2-6. 构建变体（Build Variants）+ 环境分离

```kotlin
android {
    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-DEBUG"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    flavorDimensions += "env"
    productFlavors {
        create("dev")     { buildConfigField("String", "API_BASE_URL", "\"https://dev-api.example.com\"") }
        create("staging") { buildConfigField("String", "API_BASE_URL", "\"https://stg-api.example.com\"") }
        create("prod")    { buildConfigField("String", "API_BASE_URL", "\"https://api.example.com\"") }
    }
}
```

> 代码中仅通过 `BuildConfig.API_BASE_URL` 引用。禁止在源码中硬编码各环境的 URL。

### 2-7. ProGuard / R8（发布构建）

经常遗漏的 keep 规则:
```pro
# Retrofit + Gson 序列化目标 DTO (networking-api §2)
-keep class com.harness.app.data.remote.dto.** { *; }

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**

# Hilt 生成代码
-keep class * extends dagger.hilt.android.internal.managers.** { *; }
```

> 发布构建中出现 NPE（NullPointerException）/ ClassNotFound 时，90% 是因为 ProGuard 混淆了 DTO。DTO 包应全部设为 keep 对象。

### 2-8. Compose 调试工具

| 工具 | 用途 |
|------|------|
| Layout Inspector (Android Studio) | 查看可组合项树 |
| Recomposition Counts | 追踪不必要的重组 |
| `Modifier.testTag("...")` | UI 测试 + 无障碍 — testing-debugging §4 |
| `@Preview` | 无需设备查看可组合项。`showBackground`, `uiMode = UI_MODE_NIGHT_YES` |

## 3. 常见错误（Android 专有反模式）

- ❌ 使用 KAPT（支持 KSP 的库用 KSP）
- ❌ 新写 `findViewById` + XML（保持用 Compose 一致）
- ❌ 把 Activity/Fragment 注入 ViewModel（Context 用 Hilt `@ApplicationContext`）
- ❌ 新引入 AsyncTask、RxJava（用 Coroutine + Flow）
- ❌ 把 minSdk 降到 21 以下编写旧的绕行代码
- ❌ release 构建中 `Log.d` 仍存活 → 用 Timber + ReleaseTree 阻断

## 4. 检查清单

- [ ] 是否遵循 Kotlin 2.0+ / Compose / 推荐版本矩阵
- [ ] DI 是否用 Hilt 配置并标注 `@HiltAndroidApp`
- [ ] 是否为单 Activity + Compose NavHost 模式
- [ ] 是否用构建变体分离 dev、staging、prod，并仅通过 `BuildConfig` 引用 URL
- [ ] 发布构建是否加入 R8/ProGuard keep 规则（尤其是 DTO 包）
- [ ] 是否用 KSP 代替 KAPT
- [ ] release 构建中 `Log.d` 是否被阻断
