---
name: モバイルプロジェクト構造設計 (iOS/Android 共通メンタルモデル)
description: ネイティブ iOS(SwiftUI)と Android(Compose)を同じメンタルモデルで平行に揃えるディレクトリ構造の標準。新しいアプリを始める、あるいはフォルダ構造・モジュール分離を決める際、画面・機能の位置を両プラットフォームで一致させる際に読む。キーワード: build.gradle, Podfile, Package.swift, settings.gradle, AndroidManifest.xml, feature-first, layer, モジュール化.
rules:
  - "ディレクトリは機能優先(Feature-first) + レイヤー構造で揃える。"
  - "iOS と Android を平行なフォルダ構造で維持する — Feature 名を両プラットフォームで同一に合わせる。"
  - "一つの Feature フォルダに画面・状態・データ層を一緒に置き、自己完結性を保つ。"
  - "依存方向は常に Features → Core。Core は Feature を知らない(逆方向の import 禁止)。"
  - "アプリが大きくなったら Feature 単位でモジュールを分離する。"
  - "共通ロジックを一画面に詰め込んだり、曖昧なフォルダに混ぜたりするアンチパターンを避ける。"
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

# 📱 モバイルプロジェクト構造設計

> ネイティブ iOS と Android を別々に作るが、フォルダ名と階層の深さをほぼ同一に揃え、同じメンタルモデルを維持する。新しいアプリを始める、あるいはフォルダ構造・モジュール分離を決める際に読む。

## 1. 中核原則

- ディレクトリは機能優先(Feature-first) + レイヤー構造で揃える。
- iOS と Android を平行なフォルダ構造で維持する — Feature 名を両プラットフォームで同一に合わせる。
- 一つの Feature フォルダに画面・状態・データ層を一緒に置き、自己完結性を保つ。
- 依存方向は常に `Features → Core`。Core は Feature を知らない(逆方向の import 禁止)。
- アプリが大きくなったら Feature 単位でモジュールを分離する。
- 共通ロジックを一画面に詰め込んだり、曖昧なフォルダに混ぜたりするアンチパターンを避ける。

## 2. ルール

### 2-1. 共通メンタルモデル (Feature-first + Layer)

プラットフォームに関係なく、次の4層を維持する。

| 層 | 役割 | iOS 位置 | Android 位置 |
|------|------|----------|--------------|
| **App** | エントリポイント、グローバル設定 | `App/` | `app/` ルートパッケージ |
| **Features** | 画面単位 (Home, Detail, Login...) | `Features/<Name>/` | `ui/<name>/` |
| **Core** | ネットワーク、モデル、ユーティリティ | `Core/` | `data/`, `domain/`, `core/` |
| **Resources** | 画像、フォント、文字列 | `Resources/` | `res/` |

- **Feature 単位で自己完結**: 一画面が使う View + ViewModel + 画面専用コンポーネントは同じフォルダに置く。
- **両プラットフォームの Feature 名は同一**: iOS `Features/Home`、Android `ui/home` → どちらも「Home」画面。

### 2-2. iOS (SwiftUI) 標準ディレクトリ

```
MyApp/
├── App/
│   ├── MyApp.swift              # @main, アプリのエントリポイント
│   ├── AppDelegate.swift        # プッシュ・ディープリンク処理時
│   └── RootView.swift           # ログイン分岐など最上位ルーティング
├── Features/
│   ├── Home/
│   │   ├── HomeView.swift
│   │   ├── HomeViewModel.swift
│   │   └── Components/          # この画面でのみ使う小さなビュー
│   │       └── HomeBanner.swift
│   ├── Detail/
│   └── Auth/
│       ├── LoginView.swift
│       └── SignUpView.swift
├── Core/
│   ├── Network/
│   │   ├── APIClient.swift      # URLSession ラッパー
│   │   ├── Endpoint.swift
│   │   └── DTO/
│   ├── Storage/
│   │   ├── KeychainStore.swift
│   │   └── UserDefaultsStore.swift
│   ├── Models/                  # ドメインモデル (Codable ではない純粋モデル)
│   ├── DesignSystem/
│   │   ├── Colors.swift
│   │   ├── Typography.swift
│   │   └── Components/          # グローバル再利用コンポーネント (PrimaryButton など)
│   └── Utils/
└── Resources/
    ├── Assets.xcassets
    ├── Localizable.strings
    └── Info.plist
```

### 2-3. Android (Kotlin/Compose) 標準ディレクトリ

```
app/src/main/java/com/harness/app/
├── MyApplication.kt             # @HiltAndroidApp
├── MainActivity.kt              # エントリ Activity
├── ui/
│   ├── home/
│   │   ├── HomeScreen.kt
│   │   ├── HomeViewModel.kt
│   │   ├── HomeUiState.kt
│   │   └── components/          # この画面でのみ使うコンポーザブル
│   │       └── HomeBanner.kt
│   ├── detail/
│   ├── auth/
│   ├── navigation/              # NavHost, Screen sealed class
│   └── theme/
│       ├── Color.kt
│       ├── Theme.kt
│       ├── Type.kt
│       └── components/          # PrimaryButton などグローバル再利用
├── data/
│   ├── remote/
│   │   ├── ApiService.kt
│   │   └── dto/
│   ├── local/
│   │   ├── AppDatabase.kt       # Room
│   │   └── dao/
│   └── repository/
├── domain/
│   └── model/                   # ドメインモデル
├── di/
│   └── AppModule.kt             # Hilt モジュール
└── core/
    └── util/
```

### 2-4. Feature フォルダを切る際に守るべき3つ

1. **3ファイルルール**: 一つの画面は最低 `View/Screen` + `ViewModel` + `UiState(または Output)` の3ファイルを持つ。一ファイルに全部詰め込まないこと。
2. **Components サブフォルダ**: その画面専用の小さなビューは `Components/`(iOS)または `components/`(Android)に分離。他の画面で使う必要が出たら、その時 Core へ昇格。
3. **テスト位置**: 本体と同じフォルダ構造をミラーリング。
   - iOS: `MyAppTests/Features/Home/HomeViewModelTests.swift`
   - Android: `app/src/test/java/com/harness/app/ui/home/HomeViewModelTest.kt`

### 2-5. モジュール化 (アプリが大きくなったとき)

小さなアプリは単一モジュールで十分。中規模以上(画面10個以上)ならモジュール分離を検討する。

| iOS (SPM) | Android (Gradle module) | 目的 |
|-----------|--------------------------|------|
| `App` | `:app` | エントリポイントのみ |
| `FeatureHome`, `FeatureAuth` | `:feature:home`, `:feature:auth` | Feature 別分離 |
| `CoreNetwork`, `CoreUI` | `:core:network`, `:core:ui` | 共通 |

> 分離基準: **「このモジュールを外しても他のモジュールはビルドできるか?」** が成り立って初めて分離の意味がある。できないなら単一モジュールが良い。

## 3. よくあるミス

- ❌ `Utils/` に全部入れる(ネットワーク、DB、フォーマット、拡張が一フォルダに混在)。
- ❌ View の中で直接 URLSession/Retrofit を呼ぶ → 必ず ViewModel → Service/Repository を経由。
- ❌ iOS は Feature-first なのに Android は layer-first(controller/service/model)で切る → 両プラットフォームの構造がずれると認知負荷が爆増。
- ❌ `Common`、`Helper`、`Manager` のような曖昧なフォルダ名の乱用 → 責任を明確にした名前に(`Network`、`Storage`、`DesignSystem`)。

## 4. チェックリスト

- [ ] ディレクトリを Feature-first + Layer 構造で切ったか
- [ ] iOS と Android の Feature 名・階層の深さが平行か
- [ ] 一画面が View/Screen + ViewModel + UiState の3ファイルを備えているか
- [ ] 依存方向が `Features → Core` 単方向か
- [ ] テストが本体と同じフォルダ構造をミラーリングしているか
- [ ] 曖昧なフォルダ名(Common/Helper/Manager)なしに責任が表れる名前か
