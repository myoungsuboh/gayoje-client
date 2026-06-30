---
name: モバイル レスポンシブ/デバイス互換設計
description: iPhone SEからiPad Pro、小型Androidからフォルダブルやタブレットまでをひとつのコードでくずれないようにするレスポンシブ標準。新しい画面を組むときや、Safe Area・回転・キーボード・ノッチ・ダークモード・フォントスケールを決めるとき、リリース前のデバイス互換を点検するときに読む。キーワード: WindowMetrics, sizeClass, GeometryReader, BoxWithConstraints, Configuration, Safe Area, edge-to-edge, Dynamic Type。
rules:
  - "対応デバイスの範囲を先に決めてからレイアウトを設計する — 「全デバイス対応」は事実上無理。"
  - "ノッチ・パンチホール・ジェスチャー領域はSafe Areaで回避する。"
  - "キーボードが入力フィールドを隠さないように回避処理する。"
  - "小型フォンとタブレット・フォルダブルは画面サイズ(sizeClass/WindowSizeClass)で分岐する。"
  - "回転とダークモードの変化に対応する。"
  - "ユーザーのフォントスケール(Dynamic Type / Font Scale)を無視しない。"
tags:
  - "WindowMetrics"
  - "sizeClass"
  - "GeometryReader"
  - "BoxWithConstraints"
  - "Configuration"
  - "Safe Area"
  - "edge-to-edge"
  - "Dynamic Type"
---

# 📐 モバイル レスポンシブ/デバイス互換設計

> 「自分のスマホでは動いたのに…」の99%は、Safe Area / 画面サイズ / キーボード / フォントスケールのいずれかだ。新しい画面を組むときや、回転・ダークモード・デバイス互換を決めるときに読む。

## 1. 核心原則

- 対応デバイスの範囲を先に決めてからレイアウトを設計する — 「全デバイス対応」は事実上無理。
- ノッチ・パンチホール・ジェスチャー領域はSafe Areaで回避する。
- キーボードが入力フィールドを隠さないように回避処理する。
- 小型フォンとタブレット・フォルダブルは画面サイズ(sizeClass/WindowSizeClass)で分岐する。
- 回転とダークモードの変化に対応する。
- ユーザーのフォントスケール(Dynamic Type / Font Scale)を無視しない。

## 2. ルール

### 2-1. 対応範囲をまず決める

ドキュメントの先頭行に明記せよ。対応しないものは明示的に除外せよ。

```
iOS  : iOS 16.0+ / iPhone SE 2 ~ iPhone 15 Pro Max / iPad mini ~ iPad Pro 12.9"
Android: API 26+ (Android 8.0) / 5.0" ~ 7.0" / Foldable Galaxy Z Fold(주요만)
방향: 세로 고정 (또는 세로+가로)
다크모드: 지원
```

### 2-2. Safe Area (ノッチ/パンチホール/ジェスチャー領域)

画面の端でコンテンツが隠れる事故を防ぐ核心概念。

```swift
// iOS — デフォルト: SafeArea内に描画される (大半のケースでOK)
VStack { ... }

// 背景は端まで、コンテンツはSafeArea内に
ZStack {
    Color.surface.ignoresSafeArea()
    VStack { ... }   // safe area 内
}

// 特定の方向だけ無視 (例: 上部まで画像をいっぱいに)
.ignoresSafeArea(edges: .top)
```

```kotlin
// Android (Compose) — edge-to-edge を有効化 (MainActivity)
WindowCompat.setDecorFitsSystemWindows(window, false)

// コンテンツにはinsetを適用
Box(
    Modifier
        .fillMaxSize()
        .background(MaterialTheme.colorScheme.surface)
        .windowInsetsPadding(WindowInsets.systemBars)
) { ... }

// 一部の領域だけ端まで (例: ヘッダー画像)
Image(... , modifier = Modifier.fillMaxWidth())
```

> ⚠️ 入力可能な領域(ボタン、テキストフィールド)は絶対にsafe areaの外に置かないこと。

### 2-3. キーボード回避

```swift
// iOS — SwiftUIはデフォルトでキーボードを自動回避。必要に応じて:
.scrollDismissesKeyboard(.interactively)
.ignoresSafeArea(.keyboard)  // キーボードを無視したいとき
```

```kotlin
// Android — AndroidManifest.xml のActivity:
android:windowSoftInputMode="adjustResize"

// Compose
Modifier
    .imePadding()              // キーボード分だけパディング
    .verticalScroll(rememberScrollState())
```

### 2-4. 画面サイズ分岐 (小型フォン vs タブレット/フォルダブル)

| カテゴリ | iOS | Android |
|----------|-----|---------|
| 小型フォン | compact width | < 600dp width |
| 一般フォン | regular height + compact width | 600 ~ 840dp |
| タブレット/フォルダブル展開 | regular/regular | ≥ 840dp |

```swift
// iOS — SizeClass
@Environment(\.horizontalSizeClass) var hSize

var body: some View {
    if hSize == .regular {
        HStack { Sidebar(); Detail() }      // タブレット: 2カラム
    } else {
        NavigationStack { ListView() }      // フォン: 1カラム
    }
}
```

```kotlin
// Android — WindowSizeClass
val windowSizeClass = calculateWindowSizeClass(activity)

when (windowSizeClass.widthSizeClass) {
    WindowWidthSizeClass.Compact -> PhoneLayout()
    WindowWidthSizeClass.Medium,
    WindowWidthSizeClass.Expanded -> TabletLayout()
}
```

> タブレット対応時は必ず2カラムレイアウトを提供する。フォンUIをそのまま拡大すると、App Store/Play Storeのレビューがボロボロになる。

### 2-5. 回転(Orientation)

```xml
<!-- iOS — 縦固定ならInfo.plistでPortraitのみ残す -->
<key>UISupportedInterfaceOrientations</key>
<array><string>UIInterfaceOrientationPortrait</string></array>
```
横対応時は `@Environment(\.verticalSizeClass)` で分岐。

```xml
<!-- Android — AndroidManifest.xml -->
<activity ... android:screenOrientation="portrait" />
```
回転を許可する場合: ViewModelは回転で生存するが `remember { ... }` は消える点に注意 (必ず `rememberSaveable`)。

### 2-6. フォントスケール / アクセシビリティ

- iOS Dynamic Type: ユーザーはフォントを最大310%まで拡大できる。
- Android Font Scale: ユーザーは1.3x ~ 2.0x まで設定する。

対応原則:
- 固定高さコンテナ + テキスト → 切れが発生する。代わりに `Modifier.heightIn(min = 48.dp)` / `.frame(minHeight: 48)` のように最小だけ指定する。
- 1行強制(`lineLimit(1)`)は慎重に。韓国語はフォントサイズの変動が大きい。
- iOS: `.dynamicTypeSize(.large ... .accessibility3)` で上限を設定できる。
- Android: `fontScale` の無視は推奨しない (アクセシビリティ評価の減点)。

### 2-7. ダークモード (視覚デザイン以外に気をつけること)

- 画像: 単色アイコンならSF Symbols / Material Icons (自動tint)。フルカラー画像はライト/ダークを別々に登録する。
- ステータスバー/ナビゲーションバーの色: iOSは自動、Androidは `WindowCompat.getInsetsController(...).isAppearanceLightStatusBars` で明示する。
- スクリーンショット(アプリストア提出用): ダークモードのスクリーンショットも別途提供できる。

### 2-8. デバイスチェックマトリクス (リリース前必須)

| カテゴリ | 最低1台ずつテスト |
|----------|-------------------|
| iOS 小型 | iPhone SE (4.7") |
| iOS 大型 | iPhone 15 Pro Max |
| iOS タブレット | iPad (対応時) |
| Android 小型 | Pixel 4a / Galaxy A シリーズ |
| Android 大型 | Pixel 8 Pro / Galaxy S シリーズ |
| Android フォルダブル | Galaxy Z Fold (対応時) |
| ダークモード | 全画面をトグルしながら1回 |
| システムフォント最大 | iOS Dynamic Type Max / Android 2.0x |

## 3. よくある間違い

- ❌ Figmaデザインのピクセル座標をそのまま移植 (390幅を仮定) → 小型/大型フォンで崩れる。
- ❌ 横/縦回転を未テスト → 回転時にデータが消えたりレイアウトが暴走する。
- ❌ キーボードが上がると入力欄が隠れる。
- ❌ タブレットでフォンUIが中央に小さく表示されるだけ (アプリストアreject理由)。
- ❌ ダークモードで白背景 + 白文字で見えない画面が存在する。

## 4. チェックリスト

- [ ] 対応デバイス・OS・方向・ダークモードの範囲をドキュメントの先頭行に明記したか
- [ ] 入力要素をSafe Area内に置き、端での隠れを回避したか
- [ ] キーボードが入力フィールドを隠さないように回避処理したか
- [ ] 小型フォンとタブレット/フォルダブルを画面サイズで分岐したか (タブレットは2カラム)
- [ ] 回転・ダークモードの変化でレイアウトと状態が生き残るか
- [ ] システムフォント最大スケールでテキストが切れないか
- [ ] デバイスチェックマトリクスをリリース前に1回回したか
