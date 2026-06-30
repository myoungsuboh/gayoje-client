---
name: Building a Mobile UI Design System
description: Rules for defining color, typography, spacing, and component tokens under the same names on iOS and Android and bundling them into reusable components. Read it when creating a new screen, deciding on styles or tokens, or porting designer tokens consistently to both platforms. Keywords: DesignTokens, Material3, MaterialTheme, Compose, SwiftUI, ViewModifier, dark mode, design system.
rules:
  - "Define color, typography, and spacing as design tokens and share them across both platforms."
  - "Screen code always references only semantic tokens or above, and never uses the raw palette (blue500) directly."
  - "Maintain a shared component catalog for iOS and Android and do not build a new button on every screen."
  - "Define dark mode colors together as tokens."
  - "Unify spacing into a scale of multiples of 4 and avoid magic numbers."
  - "Respect each platform's native UX conventions (iOS HIG, Android Material)."
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

# 🎨 Building a Mobile UI Design System

> When both iOS and Android use the **same token names** (`Color.primary`, `Spacing.md`, `Typography.titleLarge`), a design change is reflected on both sides with a one-line edit. Read it when creating a new screen or deciding on styles and tokens.

## 1. Core Principles

- Define color, typography, and spacing as design tokens and share them across both platforms.
- Screen code always references only semantic tokens or above, and never uses the raw palette (`blue500`) directly.
- Maintain a shared component catalog for iOS and Android and do not build a new button on every screen.
- Define dark mode colors together as tokens.
- Unify spacing into a scale of multiples of 4 and avoid magic numbers.
- Respect each platform's native UX conventions (iOS HIG, Android Material).

## 2. Rules

### 2-1. Token Hierarchy

```
[ Base palette ] (raw)     →   blue500 = #1E88E5
[ Semantic tokens ]        →   primary = blue500
[ Component tokens ]       →   button.background = primary
```

Screen code **always references only semantic tokens or above**. Do not use the raw palette (`blue500`) directly in screens.

### 2-2. Colors

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
> Colors in the Asset Catalog respond to dark mode automatically once you set both **Appearance: Any/Dark**.

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
Use in screens: `MaterialTheme.colorScheme.primary` (never use a raw Color directly).

### 2-3. Typography

Unify token names across both platforms. (Using the Material 3 recommended names is advised.)

| Token | Use | Example size |
|------|------|-----------|
| `displayLarge` | Huge headline | 57sp/57pt |
| `headlineMedium` | Page title | 28 |
| `titleLarge` | Section title | 22 |
| `bodyLarge` | Body text | 16 |
| `bodyMedium` | Secondary body | 14 |
| `labelSmall` | Button/tag | 11 |

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

### 2-4. Spacing / Corners / Shadows

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

> No magic numbers like `16.dp` or `padding(20)` in screen code. Always go through tokens.

### 2-5. Reusable Components (global)

Collect them in `Core/DesignSystem/Components/` (iOS) and `ui/theme/components/` (Android).

Required component list
- `PrimaryButton`, `SecondaryButton`, `TextButton`
- `PrimaryTextField`, `PasswordTextField`
- `LoadingView` (full-screen loading)
- `EmptyView` (empty state)
- `ErrorView` (error + retry button)
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

### 2-6. Icons

| Source | iOS | Android |
|------|-----|---------|
| System | SF Symbols (`Image(systemName: "heart.fill")`) | Material Icons (`Icons.Filled.Favorite`) |
| Custom | Register as SVG/PDF in Assets.xcassets | Register as vector XML in drawable |

> SF Symbols and Material Icons rarely match 1:1. Agree with the designer to **use each platform's standard icons**. Forcing the same shape makes the UI feel off.

### 2-7. Dark Mode / Dynamic Type / Color Contrast

- Dark mode: with the token structure above, it switches automatically. Almost no extra per-screen work.
- iOS Dynamic Type / Android Font Scale: users increase the system font size. Consider `lineLimit` and scrollable areas so text is not clipped in fixed-width containers.
- Color contrast: at least 4.5:1 for body text and 3:1 for large text (WCAG AA). Check this when defining design tokens.

## 3. Common Mistakes

- ❌ Using raw colors like `Color.red` or `Color(0xFFFF0000)` directly in screens.
- ❌ Every screen building its own button → consolidate into DesignSystem components.
- ❌ Using SF Symbols on iOS and forcing SVGs to mimic SF Symbols on Android → follow each platform's standard.
- ❌ Shipping without dark mode support → on both iOS and Android a very high share of users default to dark.

## 4. Checklist

- [ ] Does screen code reference only semantic tokens, not the raw palette?
- [ ] Are color, typography, and spacing token names identical across both platforms?
- [ ] Does spacing use multiple-of-4 tokens with no magic numbers?
- [ ] Are buttons, fields, etc. consolidated into a shared component catalog?
- [ ] Are dark mode colors defined together as tokens?
- [ ] Do you follow each platform's standard icons and UX conventions?
- [ ] Have you checked color contrast (WCAG AA) and Dynamic Type/Font Scale?
