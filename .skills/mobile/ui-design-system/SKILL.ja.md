---
name: モバイルUIデザインシステムの構築
description: iOS・Androidで色・タイポグラフィ・スペーシング・コンポーネントのトークンを同じ名前で定義し、再利用コンポーネントにまとめるためのルール。新しい画面を作るときやスタイル・トークンを決めるとき、デザイナートークンを両プラットフォームへ一貫して移すときに読む。キーワード: DesignTokens, Material3, MaterialTheme, Compose, SwiftUI, ViewModifier, ダークモード, デザインシステム。
rules:
  - "色・タイポグラフィ・間隔をデザイントークンとして定義し、両プラットフォームで共有する。"
  - "画面コードは常に意味トークン以上のみを参照し、rawパレット(blue500)を直接使わない。"
  - "iOS・Android共通のコンポーネントカタログを維持し、画面ごとにボタンを新規作成しない。"
  - "ダークモードの色をトークンとして一緒に定義する。"
  - "間隔は4の倍数スケールに統一し、マジックナンバーを使わない。"
  - "各プラットフォームの標準UX慣習(iOS HIG・Android Material)を尊重する。"
tags:
  - "DesignTokens"
  - "Material3"
  - "MaterialTheme"
  - "Compose"
  - "SwiftUI"
  - "ViewModifier"
  - "다크모드"
  - "디자인 시스템"
---

# 🎨 モバイルUIデザインシステムの構築

> iOS・Androidの両プラットフォームが**同じトークン名**(`Color.primary`, `Spacing.md`, `Typography.titleLarge`)を使えば、デザイン変更が両方に1行の修正で反映される。新しい画面を作るときやスタイル・トークンを決めるときに読む。

## 1. 中核となる原則

- 色・タイポグラフィ・間隔をデザイントークンとして定義し、両プラットフォームで共有する。
- 画面コードは常に意味トークン以上のみを参照し、rawパレット(`blue500`)を直接使わない。
- iOS・Android共通のコンポーネントカタログを維持し、画面ごとにボタンを新規作成しない。
- ダークモードの色をトークンとして一緒に定義する。
- 間隔は4の倍数スケールに統一し、マジックナンバーを使わない。
- 各プラットフォームの標準UX慣習(iOS HIG・Android Material)を尊重する。

## 2. ルール

### 2-1. トークン階層

```
[ 기본 팔레트 ] (raw)     →   blue500 = #1E88E5
[ 의미 토큰 ] (semantic)  →   primary = blue500
[ 컴포넌트 토큰 ]         →   button.background = primary
```

画面コードは**常に意味トークン以上のみを参照**する。rawパレット(`blue500`)を画面で直接使わないこと。

### 2-2. 色

iOS
```swift
// Core/DesignSystem/Colors.swift
extension Color {
    // raw (Asset Catalog에 등록 후 매핑)
    static let blue500 = Color("blue500")
    static let gray900 = Color("gray900")

    // semantic
    static let primary = Color("primary")           // 라이트/다크 자동 전환
    static let surface = Color("surface")
    static let onSurface = Color("onSurface")
    static let danger = Color("danger")
}
```
> Asset Catalogの色は**Appearance: Any/Dark**の2つを設定すればダークモードに自動対応する。

Android
```kotlin
// ui/theme/Color.kt
val Blue500 = Color(0xFF1E88E5)
val Gray900 = Color(0xFF212121)

// ui/theme/Theme.kt
private val LightColors = lightColorScheme(
    primary = Blue500,
    surface = Color.White,
    onSurface = Gray900,
    error = Color(0xFFD32F2F)
)
private val DarkColors = darkColorScheme(
    primary = Blue500,
    surface = Color(0xFF121212),
    onSurface = Color.White,
    error = Color(0xFFEF5350)
)

@Composable
fun AppTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        content = content
    )
}
```

```swift
// ❌ 금지 — raw 색을 화면에서 직접 사용
Text("위험").foregroundColor(Color(0xFFFF0000))

// ✅ 권장 — 의미 토큰 경유
Text("위험").foregroundColor(.danger)
```
画面での使用: `MaterialTheme.colorScheme.primary`(rawなColorを直接使うのは厳禁)。

### 2-3. タイポグラフィ

トークン名を両プラットフォームで統一する。(Material 3の推奨名の使用を推奨)

| トークン | 用途 | 例のサイズ |
|------|------|-----------|
| `displayLarge` | 巨大ヘッドライン | 57sp/57pt |
| `headlineMedium` | ページタイトル | 28 |
| `titleLarge` | セクションタイトル | 22 |
| `bodyLarge` | 本文 | 16 |
| `bodyMedium` | 補助本文 | 14 |
| `labelSmall` | ボタン/タグ | 11 |

iOS
```swift
extension Font {
    static let titleLarge = Font.system(size: 22, weight: .semibold)
    static let bodyLarge = Font.system(size: 16, weight: .regular)
}
```

Android
```kotlin
val AppTypography = Typography(
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp)
)
```

### 2-4. スペーシング / コーナー / シャドウ

```
xs = 4  | sm = 8 | md = 16 | lg = 24 | xl = 32
```

iOS
```swift
enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
}

VStack(spacing: Spacing.md) { ... }
    .padding(Spacing.lg)
```

Android
```kotlin
object Spacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 16.dp
    val lg = 24.dp
    val xl = 32.dp
}

Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) { ... }
    .padding(Spacing.lg)
```

> 画面コードに`16.dp`や`padding(20)`のようなマジックナンバーは禁止。常にトークン経由で。

### 2-5. 再利用コンポーネント(グローバル)

`Core/DesignSystem/Components/`(iOS)、`ui/theme/components/`(Android)にまとめる。

必須コンポーネントリスト
- `PrimaryButton`, `SecondaryButton`, `TextButton`
- `PrimaryTextField`, `PasswordTextField`
- `LoadingView`(全画面ローディング)
- `EmptyView`(空の状態)
- `ErrorView`(エラー + 再試行ボタン)
- `Avatar`, `Badge`, `Chip`

iOS — PrimaryButton
```swift
struct PrimaryButton: View {
    let title: String
    var isLoading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title).font(.titleLarge).opacity(isLoading ? 0 : 1)
                if isLoading { ProgressView().tint(.white) }
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Color.primary)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
        .disabled(isLoading)
    }
}
```

Android — PrimaryButton
```kotlin
@Composable
fun PrimaryButton(
    text: String,
    isLoading: Boolean = false,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        enabled = !isLoading,
        modifier = modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        if (isLoading) CircularProgressIndicator(
            color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp
        ) else Text(text, style = MaterialTheme.typography.titleLarge)
    }
}
```

### 2-6. アイコン

| 出典 | iOS | Android |
|------|-----|---------|
| システム | SF Symbols (`Image(systemName: "heart.fill")`) | Material Icons (`Icons.Filled.Favorite`) |
| カスタム | Assets.xcassetsにSVG/PDFで登録 | drawableにvector XMLで登録 |

> SF SymbolsとMaterial Iconsは1:1のマッチングがほとんどできない。デザイナーと**各プラットフォーム標準アイコンの使用**を合意すること。無理に同じ形を作るとUIが不自然になる。

### 2-7. ダークモード / Dynamic Type / 色のコントラスト

- ダークモード: 上記のトークン構造なら自動で切り替わる。画面ごとの追加作業はほぼない。
- iOS Dynamic Type / Android Font Scale: ユーザーがシステムのフォントサイズを大きくする。固定幅コンテナでテキストが切れないよう、`lineLimit`とスクロール可能領域を考慮する。
- 色のコントラスト: 本文4.5:1、大きな文字3:1以上(WCAG AA)。デザイントークン定義時に点検する。

## 3. よくある間違い

- ❌ `Color.red`や`Color(0xFFFF0000)`のようなrawな色を画面で直接使う。
- ❌ すべての画面が自分専用のボタンを作る → DesignSystemコンポーネントに統合する。
- ❌ iOSはSF Symbols、AndroidもSF Symbolsを真似てSVGを差し込む → それぞれのプラットフォーム標準に従う。
- ❌ ダークモード未対応のままリリース → iOS・Androidともにユーザーの既定がダークである割合が非常に高い。

## 4. チェックリスト

- [ ] 画面コードがrawパレットではなく意味トークンのみを参照しているか
- [ ] 色・タイポグラフィ・間隔のトークン名が両プラットフォームで同一か
- [ ] 間隔にマジックナンバーなしで4の倍数トークンを使ったか
- [ ] ボタン・フィールドなどを共通コンポーネントカタログに統合したか
- [ ] ダークモードの色をトークンとして一緒に定義したか
- [ ] 各プラットフォーム標準アイコンとUX慣習に従ったか
- [ ] 色のコントラスト(WCAG AA)とDynamic Type/Font Scaleを点検したか
