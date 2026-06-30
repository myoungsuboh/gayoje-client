---
name: Android Kotlin/Compose プラットフォーム基礎（インデックス）
description: Android アプリ開発における Kotlin 言語・Jetpack Compose ビルドシステム・Hilt・ProGuard など Android 固有の事項を扱う。新しい Android プロジェクトをセットアップするとき、またはビルドバリアント・DI・リリース難読化を決めるときに読む。画面構造・状態管理・ネットワーキング・権限など iOS と共通するパターンは専用スキルに委譲する。キーワード: kotlin, Activity, Fragment, ViewModel, Compose, @Composable, lifecycle, Hilt, ProGuard, R8, KSP, build variants。
rules:
  - "Android アプリは Kotlin + Jetpack Compose で書く。"
  - "依存性注入は Hilt で構成し、Application のエントリポイントに @HiltAndroidApp を付ける。"
  - "画面は単一 Activity + Compose NavHost パターンで構成する。"
  - "ビルドバリアント（Build Variants）で dev・staging・prod 環境を分離する。"
  - "リリースビルドは R8/ProGuard ルールで難読化・縮小する。"
  - "このファイルは Android 固有のトピックのみを扱い、共通パターンは専用スキルに委譲する。"
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

# 🤖 Android Kotlin/Compose プラットフォーム基礎

> Android 固有の基礎（言語・ビルド・DI・難読化）のみを扱う。新しい Android プロジェクトをセットアップするとき、または Android 専用の設定を決めるときに読む。iOS と共通する設計パターンは §1 インデックスの他のスキルを参照する。

## 1. 中核原則

- Android アプリは **Kotlin + Jetpack Compose** で書く。
- 依存性注入は **Hilt** で構成し、Application のエントリポイントに `@HiltAndroidApp` を付ける。
- 画面は **単一 Activity + Compose NavHost** パターンで構成する。
- **ビルドバリアント（Build Variants）** で dev・staging・prod 環境を分離する。
- リリースビルドは **R8/ProGuard** ルールで難読化・縮小する。
- このファイルは Android 固有のトピックのみを扱い、共通パターンは専用スキルに委譲する。

### 関連スキルインデックス（先に確認）

| トピック | 参照するスキル |
|------|-------------|
| プロジェクトのディレクトリ構造 | project-structure §3 |
| MVVM / UiState / StateFlow | mobile-state-management |
| 画面遷移 / NavHost / ディープリンク | navigation-routing |
| Retrofit / DTO / トークン更新 | networking-api |
| 権限（カメラ/位置/通知） | permissions-privacy |
| Coroutine スコープ / エラー処理 | async-error-handling |
| Room / DataStore / EncryptedPrefs | local-storage |
| Material 3 トークン / コンポーネント | ui-design-system |
| Safe Area / WindowSizeClass | responsive-device |
| JUnit / MockK / Compose Test | testing-debugging |
| FCM / NotificationChannel | push-notifications |
| ソーシャルログイン（Google/Apple/Kakao） | auth-social-login |
| TalkBack / contentDescription | mobile-accessibility |
| Play Store 登録・署名 | android-playstore |

## 2. ルール

### 2-1. 推奨バージョンマトリクス（2026 年基準）

| 項目 | バージョン |
|------|------|
| minSdk | 26 (Android 8.0) |
| compileSdk / targetSdk | 35 (Android 15) |
| Kotlin | 2.0+ (K2 コンパイラ) |
| Compose BOM (Bill of Materials) | 2024.10+ |
| AGP (Android Gradle Plugin) | 8.5+ |
| Gradle | 8.9+ |
| JDK（ビルド用） | 17 |

> minSdk を下げるとユーザーカバレッジは上がるが、回避コードが急増する。新規プロジェクトは 26 以上を推奨。

### 2-2. 必須の依存関係（build.gradle.kts）

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

> KAPT（Kotlin Annotation Processing Tool）の代わりに **KSP（Kotlin Symbol Processing）** を使う。KAPT はビルドが 2〜3 倍遅く、K2 との衝突が頻発する。

### 2-3. Application エントリポイント（Hilt 使用時は必須）

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

### 2-4. 単一 Activity + Compose NavHost パターン

```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // edge-to-edge — Safe Area 処理は responsive-device を参照
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            AppTheme {              // 定義は ui-design-system を参照
                AppNavHost()        // ルート定義は navigation-routing を参照
            }
        }
    }
}
```

> 新規プロジェクトは **単一 Activity + Compose** が標準。Fragment/複数 Activity 構造はレガシー保守のときのみ。

### 2-5. Kotlin 言語コンベンション（モバイル限定の追加ルール）

- **`val` 優先**: `var` は本当に変わる必要があるときのみ。
- **`data class`**: UiState、DTO、ドメインモデルはすべて data class にする。
- **`sealed class/interface`**: 画面ルート、一回限りのイベント、Result 型を表現する。navigation-routing、state-management を参照。
- **拡張関数**: 外部クラスに動作を追加するときに使う。無分別なグローバル拡張は禁止。
- **`object` シングルトン**: ステートレスなユーティリティ/マッパーのみ。状態があれば Hilt `@Singleton` で。
- **Null 処理**: Java interop のプラットフォーム型は必ず `?` で受け取る。`!!` はコードレビューでほぼ常に reject される。

### 2-6. ビルドバリアント（Build Variants）+ 環境分離

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

> コードでは `BuildConfig.API_BASE_URL` でのみ参照する。環境別 URL をソースにハードコードしてはいけない。

### 2-7. ProGuard / R8（リリースビルド）

よく漏らす keep ルール:
```pro
# Retrofit + Gson シリアライズ対象 DTO (networking-api §2)
-keep class com.harness.app.data.remote.dto.** { *; }

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**

# Hilt 生成コード
-keep class * extends dagger.hilt.android.internal.managers.** { *; }
```

> リリースビルドで NPE（NullPointerException）/ ClassNotFound が出た場合、90% は ProGuard が DTO を難読化したため。DTO パッケージはすべて keep 対象にする。

### 2-8. Compose デバッグツール

| ツール | 用途 |
|------|------|
| Layout Inspector (Android Studio) | コンポーザブルツリーの確認 |
| Recomposition Counts | 不要な再コンポーズの追跡 |
| `Modifier.testTag("...")` | UI テスト + アクセシビリティ — testing-debugging §4 |
| `@Preview` | デバイスなしでコンポーザブルを確認。`showBackground`, `uiMode = UI_MODE_NIGHT_YES` |

## 3. よくあるミス（Android 固有のアンチパターン）

- ❌ KAPT の使用（KSP が可能なライブラリは KSP で）
- ❌ `findViewById` + XML を新規作成（Compose で一貫させる）
- ❌ Activity/Fragment を ViewModel に注入（Context は Hilt `@ApplicationContext` で）
- ❌ AsyncTask、RxJava の新規導入（Coroutine + Flow）
- ❌ minSdk を 21 以下に下げて古い回避コードを書く
- ❌ release ビルドに `Log.d` が残っている → Timber + ReleaseTree で遮断する

## 4. チェックリスト

- [ ] Kotlin 2.0+ / Compose / 推奨バージョンマトリクスに従ったか
- [ ] DI を Hilt で構成し `@HiltAndroidApp` を付けたか
- [ ] 単一 Activity + Compose NavHost パターンか
- [ ] dev・staging・prod をビルドバリアントで分離し、URL を `BuildConfig` でのみ参照しているか
- [ ] リリースビルドに R8/ProGuard keep ルール（特に DTO パッケージ）を入れたか
- [ ] KAPT の代わりに KSP を使っているか
- [ ] release ビルドで `Log.d` が遮断されているか
