---
name: 构建移动端 UI 设计系统
description: 在 iOS 与 Android 上以相同名称定义颜色、排版、间距、组件令牌并打包成可复用组件的规则。在创建新页面、确定样式或令牌、或将设计师令牌一致地移植到两个平台时阅读。关键词: DesignTokens, Material3, MaterialTheme, Compose, SwiftUI, ViewModifier, 暗黑模式, 设计系统。
rules:
  - "将颜色、排版、间距定义为设计令牌，在两个平台间共享。"
  - "页面代码始终只引用语义令牌及以上层级，不直接使用原始调色板(blue500)。"
  - "维护 iOS 与 Android 共用的组件目录，不要每个页面都新建按钮。"
  - "将暗黑模式颜色一并定义为令牌。"
  - "间距统一为 4 的倍数刻度，不使用魔法数字。"
  - "尊重各平台的原生 UX 惯例(iOS HIG、Android Material)。"
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

# 🎨 构建移动端 UI 设计系统

> 当 iOS 与 Android 两个平台都使用**相同的令牌名称**(`Color.primary`、`Spacing.md`、`Typography.titleLarge`)时，一次设计变更只需一行修改即可反映到两端。在创建新页面或确定样式与令牌时阅读。

## 1. 核心原则

- 将颜色、排版、间距定义为设计令牌，在两个平台间共享。
- 页面代码始终只引用语义令牌及以上层级，不直接使用原始调色板(`blue500`)。
- 维护 iOS 与 Android 共用的组件目录，不要每个页面都新建按钮。
- 将暗黑模式颜色一并定义为令牌。
- 间距统一为 4 的倍数刻度，不使用魔法数字。
- 尊重各平台的原生 UX 惯例(iOS HIG、Android Material)。

## 2. 规则

### 2-1. 令牌层级

```
[ 기본 팔레트 ] (raw)     →   blue500 = #1E88E5
[ 의미 토큰 ] (semantic)  →   primary = blue500
[ 컴포넌트 토큰 ]         →   button.background = primary
```

页面代码**始终只引用语义令牌及以上层级**。不要在页面中直接使用原始调色板(`blue500`)。

### 2-2. 颜色

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
> Asset Catalog 中的颜色只要设置 **Appearance: Any/Dark** 两种，即可自动适配暗黑模式。

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
在页面中使用: `MaterialTheme.colorScheme.primary`(绝对禁止直接使用原始 Color)。

### 2-3. 排版

在两个平台间统一令牌名称。(推荐使用 Material 3 推荐的名称)

| 令牌 | 用途 | 示例尺寸 |
|------|------|-----------|
| `displayLarge` | 超大标题 | 57sp/57pt |
| `headlineMedium` | 页面标题 | 28 |
| `titleLarge` | 区块标题 | 22 |
| `bodyLarge` | 正文 | 16 |
| `bodyMedium` | 辅助正文 | 14 |
| `labelSmall` | 按钮/标签 | 11 |

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

### 2-4. 间距 / 圆角 / 阴影

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

> 页面代码中禁止出现 `16.dp`、`padding(20)` 之类的魔法数字。始终经由令牌。

### 2-5. 可复用组件(全局)

集中放在 `Core/DesignSystem/Components/`(iOS)、`ui/theme/components/`(Android)。

必备组件清单
- `PrimaryButton`、`SecondaryButton`、`TextButton`
- `PrimaryTextField`、`PasswordTextField`
- `LoadingView`(全屏加载)
- `EmptyView`(空状态)
- `ErrorView`(错误 + 重试按钮)
- `Avatar`、`Badge`、`Chip`

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

### 2-6. 图标

| 来源 | iOS | Android |
|------|-----|---------|
| 系统 | SF Symbols (`Image(systemName: "heart.fill")`) | Material Icons (`Icons.Filled.Favorite`) |
| 自定义 | 在 Assets.xcassets 中以 SVG/PDF 注册 | 在 drawable 中以 vector XML 注册 |

> SF Symbols 与 Material Icons 几乎无法 1:1 对应。请与设计师就**使用各平台标准图标**达成一致。强行做成相同形状会让 UI 显得别扭。

### 2-7. 暗黑模式 / Dynamic Type / 颜色对比度

- 暗黑模式: 采用上述令牌结构即可自动切换。几乎不需要逐页面额外处理。
- iOS Dynamic Type / Android Font Scale: 用户会放大系统字体大小。为避免文本在固定宽度容器中被截断，请考虑 `lineLimit` 与可滚动区域。
- 颜色对比度: 正文 4.5:1、大字 3:1 以上(WCAG AA)。在定义设计令牌时检查。

## 3. 常见错误

- ❌ 在页面中直接使用 `Color.red`、`Color(0xFFFF0000)` 之类的原始颜色。
- ❌ 每个页面都自行制作按钮 → 统一到 DesignSystem 组件。
- ❌ iOS 用 SF Symbols，Android 也插入 SVG 去模仿 SF Symbols → 各自遵循自己平台的标准。
- ❌ 未支持暗黑模式就发布 → iOS 与 Android 上用户默认使用暗黑模式的比例都非常高。

## 4. 检查清单

- [ ] 页面代码是否只引用语义令牌而非原始调色板?
- [ ] 颜色、排版、间距的令牌名称在两个平台间是否一致?
- [ ] 间距是否使用了 4 的倍数令牌且无魔法数字?
- [ ] 是否将按钮、字段等统一到共用组件目录?
- [ ] 是否将暗黑模式颜色一并定义为令牌?
- [ ] 是否遵循了各平台标准图标与 UX 惯例?
- [ ] 是否检查了颜色对比度(WCAG AA)与 Dynamic Type/Font Scale?
