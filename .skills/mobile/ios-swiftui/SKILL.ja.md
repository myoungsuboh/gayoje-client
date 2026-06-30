---
name: iOS SwiftUI プラットフォーム基礎（インデックス）
description: iOSアプリ開発のSwift言語・Xcode/SwiftPM設定・状態マクロ・DI・Info.plistなど、iOS固有の基礎標準。新規iOSプロジェクトをセットアップする、またはiOS固有の設定・規約を決めるときに読む。画面構造・状態・ネットワーキング・権限などAndroidと共通のパターンは専用スキルに委任する。キーワード: SwiftUI, @State, @Binding, @ObservedObject, @StateObject, @Observable, View, Combine, publisher, SPM, xcconfig.
rules:
  - "iOSアプリはSwift + SwiftUIで書く。"
  - "状態は@Observableマクロ（iOS 17+）を基準にモデリングするが、1つのプロジェクトでは1つの方式だけを使う。"
  - "依存性はアプリのエントリポイントで注入する。"
  - "パッケージはSwift Package Managerで管理する。"
  - "Info.plistの権限理由とCapabilities設定を漏らさない。"
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

# 📱 iOS SwiftUI プラットフォーム基礎

> iOS固有の基礎（Swift言語、Xcode/SwiftPM、状態マクロ、DI、Info.plist）のみを扱う。新規iOSプロジェクトをセットアップする、またはiOS固有の設定・規約を決めるときに読む。Androidと共通する設計パターンは下のインデックスの他スキルを見る。

## 1. 核心原則
- iOSアプリはSwift + SwiftUIで書く。
- 状態は`@Observable`マクロ（iOS 17+）を基準にモデリングするが、1つのプロジェクトでは1つの方式だけを使う。
- 依存性はアプリのエントリポイントで注入する。
- パッケージはSwift Package Managerで管理する。
- Info.plistの権限理由とCapabilities設定を漏らさない。

### 関連スキルインデックス（先に確認）
このファイルはiOS固有のトピックのみを扱う。以下のテーマは専用スキルを見る。

| テーマ | 参考スキル |
|------|-----------|
| プロジェクトのディレクトリ構造 | project-structure |
| MVVM / UiState / @Published | mobile-state-management |
| 画面遷移 / NavigationStack / ディープリンク | navigation-routing |
| URLSession / DTO / トークン更新 | networking-api |
| 権限（カメラ/位置/通知） | permissions-privacy |
| Swift Concurrency / エラー処理 | async-error-handling |
| Keychain / SwiftData / UserDefaults | local-storage |
| デザイントークン / コンポーネント | ui-design-system |
| Safe Area / SizeClass | responsive-device |
| XCTest / XCUITest / スナップショット | testing-debugging |
| APNs / 通知 payload | push-notifications |
| Sign in with Apple/Google/Kakao | auth-social-login |
| VoiceOver / accessibilityLabel | mobile-accessibility |
| App Store登録・証明書 | ios-appstore |

## 2. 規則

### 2-1. 推奨バージョンマトリクス（2026基準）
| 項目 | バージョン |
|------|------|
| Deployment Target（最低サポートiOS） | iOS 16.0（iOS 17推奨） |
| Swift | 5.10+（Swift 6モードは慎重に導入） |
| Xcode | 16+ |
| macOS（ビルドマシン） | 14 Sonoma以上 |
| SwiftUI新構文（`@Observable`） | iOS 17+のみ使用可能 |

> Deployment TargetをiOS 15以下に下げると`NavigationStack`、`@Observable`などが使えない。新規プロジェクトはiOS 16以上を推奨。

### 2-2. 状態マクロ — `@Published` vs `@Observable`
| 条件 | 推奨 |
|------|------|
| Deployment Target iOS 17+ | `@Observable`マクロ（新構文、より精密な更新） |
| iOS 16互換が必要 | `ObservableObject` + `@Published`（旧構文） |

1つのプロジェクト内では1つだけを使う。混ぜるとデータフローが分かりにくくなる。

```swift
// ✅ iOS 17+ (新構文)
@Observable
final class HomeViewModel {
    var state = HomeUiState()
    // @Published 不要。すべてのvarプロパティが自動的に監視される
}

// ✅ iOS 16互換 (旧構文)
@MainActor
final class HomeViewModel: ObservableObject {
    @Published var state = HomeUiState()
}
```

### 2-3. アプリのエントリポイント + 依存性注入（DI）
iOSにはHiltのような標準DIがない。推奨: 手動のコンストラクタ注入 + グローバル状態はEnvironmentObject。

| 方式 | 長所と短所 |
|------|--------|
| コンストラクタ注入（手動） | 最もシンプル。小〜中規模アプリに十分 |
| EnvironmentObject | SwiftUI標準。グローバル状態にのみ使用 |
| Factory / Resolver / Needle（外部） | 大規模アプリ。コンパイル時の安全性 |

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

### 2-4. Swift Package Manager（SPM）標準
`Package.swift`またはXcode Package Dependenciesで追加。CocoaPods/Carthageは新規プロジェクトでは避ける。

| 用途 | パッケージ |
|------|--------|
| Snapshotテスト | `pointfreeco/swift-snapshot-testing` |
| 依存性注入 | `hmlongco/Factory`（必要時） |
| Keychainラッパー | `kishikawakatsumi/KeychainAccess` または独自実装（local-storage参照） |
| ロギング | `apple/swift-log` |

### 2-5. Info.plist / Capabilities（よく漏らす）
- **Background Modes**: プッシュ（`remote-notification`）、位置（`location`）、オーディオ（`audio`）など必要時にチェック。
- **App Transport Security**: デフォルト維持（HTTPS強制）。例外はドメイン単位でのみ。
- **権限使用説明**: カメラ/写真/位置/マイク/連絡先すべて`NS***UsageDescription`キーが必須。空だとApp Storeリジェクト（permissions-privacy参照）。
- **URL Scheme**: ディープリンク/ソーシャルログインのコールバック使用時（navigation-routing, auth-social-login参照）。
- **Associated Domains**: Universal Links（`applinks:example.com`）使用時。

### 2-6. Swift言語の規約（iOS限定の追加ルール）
- `let`優先: `var`は本当に変わる必要があるときだけ。
- `struct`優先: 値型が基本。参照セマンティクスが必要な場合（ViewModelなど）のみ`class`。
- `enum` with associated values: 画面ルート、Result型、一回限りのイベントを表現。
- `@MainActor`: ViewModelは丸ごと`@MainActor`クラスに。UI更新が自動的にメインスレッドで起きる。
- オプショナル処理: `if let` / `guard let`を推奨。`force unwrap (!)`はコードレビューでほぼ常にreject。
- `async/await`: 新規コードにcompletion handlerを新たに導入しない。既存のコールバックAPIは`withCheckedContinuation`でラップ（async-error-handling参照）。

### 2-7. Build Configurationの環境分離
`.xcconfig`ファイルで環境別の変数を注入。

```
// Config-Dev.xcconfig
API_BASE_URL = https:/$()/dev-api.example.com
```
> `//`はxcconfigのコメントなので、URLの`//`を`/$()/`にescapeする必要がある。知らないとビルド後にURLが切れる。

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
> Xcode → Project → ConfigurationsでDebug/Release別にxcconfigをマッピング。環境別URLのハードコーディング禁止。

### 2-8. デバッグツール
| ツール | 用途 |
|------|------|
| `#Preview { ... }`（Xcode 15+） | デバイスなしでビューを確認。`.preferredColorScheme(.dark)`などを活用 |
| Xcode View Debugger | ランタイムのビュー階層を確認 |
| Instruments（Allocations, Time Profiler, Leaks） | メモリ・CPU分析 |
| Console.app + `os_log` | 実機ログの収集 |
| Environment Overrides（シミュレータ） | ダークモード/Dynamic Type/Accessibilityを即時切替 |

```swift
// ✅ リリースビルドのログ遮断
#if DEBUG
print("debug only")
#endif
```

## 3. よくあるミス
- ❌ `@StateObject`と`@ObservedObject`の混同（子ビューに新しいインスタンスを作るために`@StateObject`を使わないこと）。
- ❌ View内で`Task { await ... }`を毎回新しく生成 → `.task` modifierを使う（async-error-handling参照）。
- ❌ UIKitとSwiftUI混用時に責任の境界が不明確 → 新規画面はSwiftUIで一貫させる。
- ❌ Storyboards/XIBの新規作成 → SwiftUIで一貫させる。
- ❌ `DispatchQueue.main.async`の乱用 → `@MainActor` / `await MainActor.run`を使う。
- ❌ Deployment Targetを上げすぎてユーザーカバレッジを損失（分岐できるなら1〜2バージョン下げて維持）。
- ❌ `print(...)`がリリースに残っている → `#if DEBUG`または`swift-log`を使う。

## 4. チェックリスト
- [ ] Deployment Target・Swift・Xcodeのバージョンが推奨マトリクスに合っているか
- [ ] 状態マクロ（`@Observable`または`@Published`）を1つに統一したか
- [ ] 依存性をアプリのエントリポイントで注入し、グローバル状態のみEnvironmentObjectで扱ったか
- [ ] パッケージをSPMで管理し、CocoaPods/Carthageの新規導入を避けたか
- [ ] Info.plistの権限理由・Capabilities・URL Schemeを漏らしていないか
- [ ] 環境別URLをxcconfigで分離し、ハードコーディングしていないか
- [ ] force unwrap・リリースのprint・Storyboardの新規作成のようなアンチパターンがないか
