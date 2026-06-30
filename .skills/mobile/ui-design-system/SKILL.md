---
name: 모바일 UI 디자인 시스템 구축
description: iOS·Android에서 색·타이포·스페이싱·컴포넌트 토큰을 같은 이름으로 정의하고 재사용 컴포넌트로 묶는 규칙. 새 화면을 만들거나 스타일·토큰을 정할 때, 디자이너 토큰을 양 플랫폼에 일관되게 옮길 때 읽는다. 키워드: DesignTokens, Material3, MaterialTheme, Compose, SwiftUI, ViewModifier, 다크모드, 디자인 시스템.
rules:
  - "색·타이포·간격을 디자인 토큰으로 정의해 양 플랫폼에서 공유한다."
  - "화면 코드는 항상 의미 토큰 이상만 참조하고, raw 팔레트(blue500)를 직접 쓰지 않는다."
  - "iOS·Android 공통 컴포넌트 카탈로그를 유지하고 화면마다 버튼을 새로 만들지 않는다."
  - "다크 모드 색상을 토큰으로 함께 정의한다."
  - "간격은 4의 배수 스케일로 통일하고 매직넘버를 쓰지 않는다."
  - "플랫폼 기본 UX 관례(iOS HIG·Android Material)를 존중한다."
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

# 🎨 모바일 UI 디자인 시스템 구축

> iOS·Android 두 플랫폼이 **같은 토큰 이름**(`Color.primary`, `Spacing.md`, `Typography.titleLarge`)을 쓰면 디자인 변경이 양쪽에 한 줄 수정으로 반영된다. 새 화면을 만들거나 스타일·토큰을 정할 때 읽는다.

## 1. 핵심 원칙

- 색·타이포·간격을 디자인 토큰으로 정의해 양 플랫폼에서 공유한다.
- 화면 코드는 항상 의미 토큰 이상만 참조하고, raw 팔레트(`blue500`)를 직접 쓰지 않는다.
- iOS·Android 공통 컴포넌트 카탈로그를 유지하고 화면마다 버튼을 새로 만들지 않는다.
- 다크 모드 색상을 토큰으로 함께 정의한다.
- 간격은 4의 배수 스케일로 통일하고 매직넘버를 쓰지 않는다.
- 플랫폼 기본 UX 관례(iOS HIG·Android Material)를 존중한다.

## 2. 규칙

### 2-1. 토큰 계층

```
[ 기본 팔레트 ] (raw)     →   blue500 = #1E88E5
[ 의미 토큰 ] (semantic)  →   primary = blue500
[ 컴포넌트 토큰 ]         →   button.background = primary
```

화면 코드는 **항상 의미 토큰 이상만 참조**. raw 팔레트(`blue500`)를 화면에서 직접 쓰지 마라.

### 2-2. 색상

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
> Asset Catalog의 색상은 **Appearance: Any/Dark** 두 가지를 설정하면 다크모드 자동 대응.

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
화면에서 사용: `MaterialTheme.colorScheme.primary` (절대 raw Color 직접 사용 금지).

### 2-3. 타이포그래피

토큰 이름을 양 플랫폼에서 통일한다. (Material 3 권장 이름 사용 추천)

| 토큰 | 용도 | 예시 크기 |
|------|------|-----------|
| `displayLarge` | 거대 헤드라인 | 57sp/57pt |
| `headlineMedium` | 페이지 제목 | 28 |
| `titleLarge` | 섹션 제목 | 22 |
| `bodyLarge` | 본문 | 16 |
| `bodyMedium` | 보조 본문 | 14 |
| `labelSmall` | 버튼/태그 | 11 |

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

### 2-4. 스페이싱 / 코너 / 그림자

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

> 화면 코드에 `16.dp`, `padding(20)` 같은 매직넘버 금지. 항상 토큰 경유.

### 2-5. 재사용 컴포넌트 (전역)

`Core/DesignSystem/Components/` (iOS), `ui/theme/components/` (Android) 에 모은다.

필수 컴포넌트 리스트
- `PrimaryButton`, `SecondaryButton`, `TextButton`
- `PrimaryTextField`, `PasswordTextField`
- `LoadingView` (전체 화면 로딩)
- `EmptyView` (빈 상태)
- `ErrorView` (오류 + 재시도 버튼)
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

### 2-6. 아이콘

| 출처 | iOS | Android |
|------|-----|---------|
| 시스템 | SF Symbols (`Image(systemName: "heart.fill")`) | Material Icons (`Icons.Filled.Favorite`) |
| 커스텀 | Assets.xcassets에 SVG/PDF로 등록 | drawable에 vector XML로 등록 |

> SF Symbols와 Material Icons는 1:1 매칭이 거의 안 된다. 디자이너와 **각 플랫폼 표준 아이콘 사용**을 합의하라. 억지로 같은 모양 만들면 UI가 어색해진다.

### 2-7. 다크 모드 / Dynamic Type / 색 대비

- 다크모드: 위 토큰 구조면 자동 전환됨. 화면별 추가 작업 거의 없음.
- iOS Dynamic Type / Android Font Scale: 사용자가 시스템 폰트 크기를 키운다. 고정 폭 컨테이너에 텍스트가 잘리지 않도록 `lineLimit` 와 스크롤 가능 영역 고려.
- 색 대비: 본문 4.5:1, 큰 글자 3:1 이상 (WCAG AA). 디자인 토큰 정의 시 점검.

## 3. 흔한 실수

- ❌ `Color.red`, `Color(0xFFFF0000)` 같은 raw 색을 화면에서 직접 사용.
- ❌ 모든 화면이 자기만의 버튼을 직접 만들기 → DesignSystem 컴포넌트로 통합.
- ❌ iOS는 SF Symbols, Android도 SF Symbols 흉내내려 SVG 끼워넣기 → 각자 플랫폼 표준 따르라.
- ❌ 다크모드 미지원 채로 출시 → iOS·Android 모두 사용자 기본값이 다크인 비율이 매우 높음.

## 4. 체크리스트

- [ ] 화면 코드가 raw 팔레트가 아닌 의미 토큰만 참조하는가
- [ ] 색·타이포·간격 토큰 이름이 양 플랫폼에서 동일한가
- [ ] 간격에 매직넘버 없이 4의 배수 토큰을 썼는가
- [ ] 버튼·필드 등을 공통 컴포넌트 카탈로그로 통합했는가
- [ ] 다크 모드 색상을 토큰으로 함께 정의했는가
- [ ] 각 플랫폼 표준 아이콘과 UX 관례를 따랐는가
- [ ] 색 대비(WCAG AA)와 Dynamic Type/Font Scale을 점검했는가
