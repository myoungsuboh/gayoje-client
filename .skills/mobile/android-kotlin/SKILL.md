---
name: Android Kotlin/Compose 플랫폼 기본 (인덱스)
description: Android 앱 개발의 Kotlin 언어/Jetpack Compose 빌드 시스템/Hilt/ProGuard 등 Android-only 사항을 다룬다. 새 Android 프로젝트를 세팅하거나 빌드 변형·DI·릴리즈 난독화를 정할 때 읽는다. 화면 구조·상태관리·네트워킹·권한 등 iOS와 공통되는 패턴은 전용 스킬로 위임한다. 키워드: kotlin, Activity, Fragment, ViewModel, Compose, @Composable, lifecycle, Hilt, ProGuard, R8, KSP, build variants.
rules:
  - "Android 앱은 Kotlin + Jetpack Compose로 작성한다."
  - "의존성 주입은 Hilt로 구성하고 Application 진입점에 @HiltAndroidApp을 단다."
  - "화면은 단일 Activity + Compose NavHost 패턴으로 구성한다."
  - "빌드 변형(Build Variants)으로 dev·staging·prod 환경을 분리한다."
  - "릴리즈 빌드는 R8/ProGuard 규칙으로 난독화·축소한다."
  - "이 파일은 Android-only 토픽만 다루며, 공통 패턴은 전용 스킬로 위임한다."
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

# 🤖 Android Kotlin/Compose 플랫폼 기본

> Android 고유 기초(언어·빌드·DI·난독화)만 다룬다. 새 Android 프로젝트를 세팅하거나 Android 전용 설정을 정할 때 읽는다. iOS와 공통되는 설계 패턴은 §1 인덱스의 다른 스킬을 본다.

## 1. 핵심 원칙

- Android 앱은 **Kotlin + Jetpack Compose**로 작성한다.
- 의존성 주입은 **Hilt**로 구성하고 Application 진입점에 `@HiltAndroidApp`을 단다.
- 화면은 **단일 Activity + Compose NavHost** 패턴으로 구성한다.
- **빌드 변형(Build Variants)**으로 dev·staging·prod 환경을 분리한다.
- 릴리즈 빌드는 **R8/ProGuard** 규칙으로 난독화·축소한다.
- 이 파일은 Android-only 토픽만 다루며, 공통 패턴은 전용 스킬로 위임한다.

### 관련 스킬 인덱스 (먼저 확인)

| 주제 | 참고할 스킬 |
|------|-------------|
| 프로젝트 디렉토리 구조 | project-structure §3 |
| MVVM / UiState / StateFlow | mobile-state-management |
| 화면 전환 / NavHost / 딥링크 | navigation-routing |
| Retrofit / DTO / 토큰 갱신 | networking-api |
| 권한 (카메라/위치/알림) | permissions-privacy |
| Coroutine 스코프 / 에러 처리 | async-error-handling |
| Room / DataStore / EncryptedPrefs | local-storage |
| Material 3 토큰 / 컴포넌트 | ui-design-system |
| Safe Area / WindowSizeClass | responsive-device |
| JUnit / MockK / Compose Test | testing-debugging |
| FCM / NotificationChannel | push-notifications |
| 소셜 로그인 (Google/Apple/Kakao) | auth-social-login |
| TalkBack / contentDescription | mobile-accessibility |
| Play Store 등록·서명 | android-playstore |

## 2. 규칙

### 2-1. 권장 버전 매트릭스 (2026 기준)

| 항목 | 버전 |
|------|------|
| minSdk | 26 (Android 8.0) |
| compileSdk / targetSdk | 35 (Android 15) |
| Kotlin | 2.0+ (K2 컴파일러) |
| Compose BOM (Bill of Materials) | 2024.10+ |
| AGP (Android Gradle Plugin) | 8.5+ |
| Gradle | 8.9+ |
| JDK (빌드용) | 17 |

> minSdk를 낮추면 사용자 커버리지는 올라가지만 우회 코드가 폭증한다. 신규 프로젝트는 26 이상 권장.

### 2-2. 필수 의존성 (build.gradle.kts)

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

> KAPT(Kotlin Annotation Processing Tool) 대신 **KSP(Kotlin Symbol Processing)** 사용. KAPT는 빌드가 2~3배 느리고 K2와 충돌이 잦다.

### 2-3. Application 진입점 (Hilt 사용 시 필수)

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

### 2-4. 단일 Activity + Compose NavHost 패턴

```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // edge-to-edge — Safe Area 처리는 responsive-device 참고
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            AppTheme {              // 정의는 ui-design-system 참고
                AppNavHost()        // 라우트 정의는 navigation-routing 참고
            }
        }
    }
}
```

> 신규 프로젝트는 **단일 Activity + Compose**가 표준. Fragment/다중 Activity 구조는 레거시 유지보수 때만.

### 2-5. Kotlin 언어 컨벤션 (모바일 한정 추가 룰)

- **`val` 우선**: `var`는 정말 변해야 할 때만.
- **`data class`**: UiState, DTO, 도메인 모델은 전부 data class.
- **`sealed class/interface`**: 화면 라우트, 일회성 이벤트, Result 타입 표현. navigation-routing, state-management 참고.
- **확장 함수**: 외부 클래스에 동작 추가 시 사용. 무분별한 전역 확장 금지.
- **`object` 싱글톤**: stateless 유틸/매퍼만. 상태가 있으면 Hilt `@Singleton`으로.
- **Null 처리**: Java interop 플랫폼 타입은 반드시 `?`로 받기. `!!`는 코드리뷰에서 거의 항상 reject.

### 2-6. 빌드 변형(Build Variants) + 환경 분리

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

> 코드에서는 `BuildConfig.API_BASE_URL`로만 참조. 환경별 URL을 소스에 하드코딩 금지.

### 2-7. ProGuard / R8 (릴리즈 빌드)

자주 빠뜨리는 keep 룰:
```pro
# Retrofit + Gson 직렬화 대상 DTO (networking-api §2)
-keep class com.harness.app.data.remote.dto.** { *; }

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**

# Hilt 생성 코드
-keep class * extends dagger.hilt.android.internal.managers.** { *; }
```

> 릴리즈 빌드에서 NPE(NullPointerException) / ClassNotFound가 나면 90%는 ProGuard가 DTO를 난독화해서. DTO 패키지는 전부 keep 대상.

### 2-8. Compose 디버그 도구

| 도구 | 용도 |
|------|------|
| Layout Inspector (Android Studio) | 컴포저블 트리 확인 |
| Recomposition Counts | 불필요한 재구성 추적 |
| `Modifier.testTag("...")` | UI 테스트 + 접근성 — testing-debugging §4 |
| `@Preview` | 디바이스 없이 컴포저블 확인. `showBackground`, `uiMode = UI_MODE_NIGHT_YES` |

## 3. 흔한 실수 (Android-specific 안티패턴)

- ❌ KAPT 사용 (KSP 가능한 라이브러리는 KSP로)
- ❌ `findViewById` + XML 신규 작성 (Compose로 일관)
- ❌ Activity/Fragment를 ViewModel에 주입 (Context는 Hilt `@ApplicationContext`로)
- ❌ AsyncTask, RxJava 신규 도입 (Coroutine + Flow)
- ❌ minSdk를 21 이하로 낮춰 옛 우회 코드 작성
- ❌ release 빌드에 `Log.d`가 살아있음 → Timber + ReleaseTree로 차단

## 4. 체크리스트

- [ ] Kotlin 2.0+ / Compose / 권장 버전 매트릭스를 따랐는가
- [ ] DI는 Hilt로 구성하고 `@HiltAndroidApp`을 달았는가
- [ ] 단일 Activity + Compose NavHost 패턴인가
- [ ] dev·staging·prod를 빌드 변형으로 분리하고 URL을 `BuildConfig`로만 참조하는가
- [ ] 릴리즈 빌드에 R8/ProGuard keep 룰(특히 DTO 패키지)을 넣었는가
- [ ] KAPT 대신 KSP를 쓰는가
- [ ] release 빌드에서 `Log.d`가 차단되는가
