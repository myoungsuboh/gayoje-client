---
name: Android Kotlin/Compose Platform Basics (Index)
description: Covers Android-only concerns of Android app development — the Kotlin language, the Jetpack Compose build system, Hilt, ProGuard, etc. Read when setting up a new Android project or deciding build variants, DI, and release obfuscation. Patterns shared with iOS such as screen structure, state management, networking, and permissions are delegated to dedicated skills. Keywords: kotlin, Activity, Fragment, ViewModel, Compose, @Composable, lifecycle, Hilt, ProGuard, R8, KSP, build variants.
rules:
  - "Write Android apps in Kotlin + Jetpack Compose."
  - "Configure dependency injection with Hilt and annotate the Application entry point with @HiltAndroidApp."
  - "Compose screens with the single Activity + Compose NavHost pattern."
  - "Separate dev, staging, and prod environments with Build Variants."
  - "Obfuscate and shrink release builds with R8/ProGuard rules."
  - "This file covers Android-only topics; shared patterns are delegated to dedicated skills."
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

# 🤖 Android Kotlin/Compose Platform Basics

> Covers only Android-specific fundamentals (language, build, DI, obfuscation). Read when setting up a new Android project or deciding Android-only configuration. For design patterns shared with iOS, see the other skills in the §1 index.

## 1. Core Principles

- Write Android apps in **Kotlin + Jetpack Compose**.
- Configure dependency injection with **Hilt** and annotate the Application entry point with `@HiltAndroidApp`.
- Compose screens with the **single Activity + Compose NavHost** pattern.
- Separate dev, staging, and prod environments with **Build Variants**.
- Obfuscate and shrink release builds with **R8/ProGuard** rules.
- This file covers Android-only topics; shared patterns are delegated to dedicated skills.

### Related Skill Index (check first)

| Topic | Skill to reference |
|------|-------------|
| Project directory structure | project-structure §3 |
| MVVM / UiState / StateFlow | mobile-state-management |
| Screen transitions / NavHost / deep links | navigation-routing |
| Retrofit / DTO / token refresh | networking-api |
| Permissions (camera/location/notifications) | permissions-privacy |
| Coroutine scopes / error handling | async-error-handling |
| Room / DataStore / EncryptedPrefs | local-storage |
| Material 3 tokens / components | ui-design-system |
| Safe Area / WindowSizeClass | responsive-device |
| JUnit / MockK / Compose Test | testing-debugging |
| FCM / NotificationChannel | push-notifications |
| Social login (Google/Apple/Kakao) | auth-social-login |
| TalkBack / contentDescription | mobile-accessibility |
| Play Store registration & signing | android-playstore |

## 2. Rules

### 2-1. Recommended Version Matrix (as of 2026)

| Item | Version |
|------|------|
| minSdk | 26 (Android 8.0) |
| compileSdk / targetSdk | 35 (Android 15) |
| Kotlin | 2.0+ (K2 compiler) |
| Compose BOM (Bill of Materials) | 2024.10+ |
| AGP (Android Gradle Plugin) | 8.5+ |
| Gradle | 8.9+ |
| JDK (for builds) | 17 |

> Lowering minSdk raises user coverage but causes workaround code to balloon. For new projects, 26 or higher is recommended.

### 2-2. Required Dependencies (build.gradle.kts)

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

> Use **KSP (Kotlin Symbol Processing)** instead of KAPT (Kotlin Annotation Processing Tool). KAPT builds 2–3x slower and frequently conflicts with K2.

### 2-3. Application Entry Point (required when using Hilt)

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

### 2-4. Single Activity + Compose NavHost Pattern

```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // edge-to-edge — see responsive-device for Safe Area handling
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            AppTheme {              // see ui-design-system for the definition
                AppNavHost()        // see navigation-routing for route definitions
            }
        }
    }
}
```

> For new projects, **single Activity + Compose** is the standard. Use Fragment/multi-Activity structures only for legacy maintenance.

### 2-5. Kotlin Language Conventions (mobile-specific extra rules)

- **Prefer `val`**: use `var` only when it truly must change.
- **`data class`**: UiState, DTOs, and domain models should all be data classes.
- **`sealed class/interface`**: express screen routes, one-off events, and Result types. See navigation-routing and state-management.
- **Extension functions**: use when adding behavior to external classes. No indiscriminate global extensions.
- **`object` singletons**: only for stateless utilities/mappers. If there is state, use a Hilt `@Singleton`.
- **Null handling**: always receive Java interop platform types with `?`. `!!` is almost always rejected in code review.

### 2-6. Build Variants + Environment Separation

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

> In code, reference only `BuildConfig.API_BASE_URL`. Never hardcode per-environment URLs in the source.

### 2-7. ProGuard / R8 (release builds)

Commonly forgotten keep rules:
```pro
# Retrofit + Gson serialization target DTOs (networking-api §2)
-keep class com.harness.app.data.remote.dto.** { *; }

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**

# Hilt generated code
-keep class * extends dagger.hilt.android.internal.managers.** { *; }
```

> When NPE (NullPointerException) / ClassNotFound occurs in release builds, 90% of the time it is because ProGuard obfuscated a DTO. Keep all DTO packages.

### 2-8. Compose Debug Tools

| Tool | Use |
|------|------|
| Layout Inspector (Android Studio) | Inspect the composable tree |
| Recomposition Counts | Track unnecessary recompositions |
| `Modifier.testTag("...")` | UI tests + accessibility — testing-debugging §4 |
| `@Preview` | Inspect composables without a device. `showBackground`, `uiMode = UI_MODE_NIGHT_YES` |

## 3. Common Mistakes (Android-specific anti-patterns)

- ❌ Using KAPT (use KSP for libraries that support KSP)
- ❌ Writing new `findViewById` + XML (be consistent with Compose)
- ❌ Injecting an Activity/Fragment into a ViewModel (use Hilt `@ApplicationContext` for Context)
- ❌ Newly adopting AsyncTask or RxJava (use Coroutine + Flow)
- ❌ Lowering minSdk to 21 or below and writing legacy workaround code
- ❌ Leaving `Log.d` alive in release builds → block it with Timber + ReleaseTree

## 4. Checklist

- [ ] Did you follow Kotlin 2.0+ / Compose / the recommended version matrix?
- [ ] Did you configure DI with Hilt and annotate `@HiltAndroidApp`?
- [ ] Is it the single Activity + Compose NavHost pattern?
- [ ] Did you separate dev, staging, and prod with build variants and reference URLs only via `BuildConfig`?
- [ ] Did you add R8/ProGuard keep rules (especially DTO packages) to the release build?
- [ ] Are you using KSP instead of KAPT?
- [ ] Is `Log.d` blocked in release builds?
