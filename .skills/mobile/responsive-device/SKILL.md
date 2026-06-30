---
name: 모바일 반응형/디바이스 호환 설계
description: iPhone SE부터 iPad Pro, 소형 안드로이드부터 폴더블·태블릿까지 한 코드로 깨지지 않게 만드는 반응형 표준. 새 화면을 잡거나 Safe Area·회전·키보드·노치·다크모드·폰트 스케일을 정할 때, 출시 전 디바이스 호환을 점검할 때 읽는다. 키워드: WindowMetrics, sizeClass, GeometryReader, BoxWithConstraints, Configuration, Safe Area, edge-to-edge, Dynamic Type.
rules:
  - "지원 기기 범위를 먼저 정하고 레이아웃을 설계한다 — '모든 기기 지원'은 사실상 무리."
  - "노치·펀치홀·제스처 영역은 Safe Area로 회피한다."
  - "키보드가 입력 필드를 가리지 않게 회피 처리한다."
  - "소형 폰과 태블릿·폴더블은 화면 크기(sizeClass/WindowSizeClass)로 분기한다."
  - "회전과 다크 모드 변화에 대응한다."
  - "사용자 폰트 스케일(Dynamic Type / Font Scale)을 무시하지 않는다."
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

# 📐 모바일 반응형/디바이스 호환 설계

> "내 폰에선 됐는데..." 의 99%는 Safe Area / 화면 크기 / 키보드 / 폰트 스케일 중 하나다. 새 화면을 잡거나 회전·다크모드·디바이스 호환을 정할 때 읽는다.

## 1. 핵심 원칙

- 지원 기기 범위를 먼저 정하고 레이아웃을 설계한다 — "모든 기기 지원"은 사실상 무리.
- 노치·펀치홀·제스처 영역은 Safe Area로 회피한다.
- 키보드가 입력 필드를 가리지 않게 회피 처리한다.
- 소형 폰과 태블릿·폴더블은 화면 크기(sizeClass/WindowSizeClass)로 분기한다.
- 회전과 다크 모드 변화에 대응한다.
- 사용자 폰트 스케일(Dynamic Type / Font Scale)을 무시하지 않는다.

## 2. 규칙

### 2-1. 지원 범위 먼저 결정

문서 첫 줄에 박아라. 지원 안 하는 건 명시적으로 빼라.

```
iOS  : iOS 16.0+ / iPhone SE 2 ~ iPhone 15 Pro Max / iPad mini ~ iPad Pro 12.9"
Android: API 26+ (Android 8.0) / 5.0" ~ 7.0" / Foldable Galaxy Z Fold(주요만)
방향: 세로 고정 (또는 세로+가로)
다크모드: 지원
```

### 2-2. Safe Area (노치/펀치홀/제스처 영역)

화면 가장자리에 콘텐츠가 가려지는 사고를 막는 핵심 개념.

```swift
// iOS — 기본: SafeArea 안에 그려짐 (대부분의 경우 OK)
VStack { ... }

// 배경은 끝까지, 콘텐츠는 SafeArea 안에
ZStack {
    Color.surface.ignoresSafeArea()
    VStack { ... }   // safe area 안
}

// 특정 방향만 무시 (예: 상단까지 이미지 가득)
.ignoresSafeArea(edges: .top)
```

```kotlin
// Android (Compose) — edge-to-edge 활성화 (MainActivity)
WindowCompat.setDecorFitsSystemWindows(window, false)

// 콘텐츠는 inset 적용
Box(
    Modifier
        .fillMaxSize()
        .background(MaterialTheme.colorScheme.surface)
        .windowInsetsPadding(WindowInsets.systemBars)
) { ... }

// 일부 영역만 가장자리까지 (예: 헤더 이미지)
Image(... , modifier = Modifier.fillMaxWidth())
```

> ⚠️ 입력 가능한 영역(버튼, 텍스트필드)은 절대 safe area 바깥에 두지 말 것.

### 2-3. 키보드 회피

```swift
// iOS — SwiftUI는 기본적으로 키보드를 자동 회피. 필요 시:
.scrollDismissesKeyboard(.interactively)
.ignoresSafeArea(.keyboard)  // 키보드 무시하고 싶을 때
```

```kotlin
// Android — AndroidManifest.xml 의 Activity:
android:windowSoftInputMode="adjustResize"

// Compose
Modifier
    .imePadding()              // 키보드만큼 패딩
    .verticalScroll(rememberScrollState())
```

### 2-4. 화면 크기 분기 (소형 폰 vs 태블릿/폴더블)

| 카테고리 | iOS | Android |
|----------|-----|---------|
| 소형 폰 | compact width | < 600dp width |
| 일반 폰 | regular height + compact width | 600 ~ 840dp |
| 태블릿/폴더블 펼침 | regular/regular | ≥ 840dp |

```swift
// iOS — SizeClass
@Environment(\.horizontalSizeClass) var hSize

var body: some View {
    if hSize == .regular {
        HStack { Sidebar(); Detail() }      // 태블릿: 2단
    } else {
        NavigationStack { ListView() }      // 폰: 1단
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

> 태블릿 지원 시 반드시 2단 레이아웃 제공. 폰 UI를 그대로 확대하면 App Store/Play Store 리뷰가 박살 난다.

### 2-5. 회전(Orientation)

```xml
<!-- iOS — 세로 고정이면 Info.plist 에서 Portrait 만 남긴다 -->
<key>UISupportedInterfaceOrientations</key>
<array><string>UIInterfaceOrientationPortrait</string></array>
```
가로 지원 시 `@Environment(\.verticalSizeClass)` 로 분기.

```xml
<!-- Android — AndroidManifest.xml -->
<activity ... android:screenOrientation="portrait" />
```
회전 허용 시: ViewModel은 회전 생존하지만 `remember { ... }` 는 사라진다는 점 유의 (반드시 `rememberSaveable`).

### 2-6. 폰트 스케일 / 접근성

- iOS Dynamic Type: 사용자가 폰트를 최대 310%까지 키울 수 있다.
- Android Font Scale: 사용자가 1.3x ~ 2.0x 까지 설정.

대응 원칙:
- 고정 높이 컨테이너 + 텍스트 → 잘림 발생. 대신 `Modifier.heightIn(min = 48.dp)` / `.frame(minHeight: 48)` 처럼 최소만 지정.
- 1줄 강제(`lineLimit(1)`)는 신중히. 한국어 폰트 크기 변동이 크다.
- iOS: `.dynamicTypeSize(.large ... .accessibility3)` 로 상한 두기 가능.
- Android: `fontScale` 무시는 권장 안 함 (접근성 평가 감점).

### 2-7. 다크모드 (시각 디자인 외에 신경 쓸 것)

- 이미지: 단색 아이콘이면 SF Symbols / Material Icons (자동 tint). 풀컬러 이미지는 라이트/다크 따로 등록.
- 상태바/네비게이션바 색: iOS는 자동, Android는 `WindowCompat.getInsetsController(...).isAppearanceLightStatusBars` 로 명시.
- 스크린샷(앱스토어 제출용): 다크모드 스크린샷도 별도 제공 가능.

### 2-8. 디바이스 체크 매트릭스 (출시 전 필수)

| 카테고리 | 최소 1대씩 테스트 |
|----------|-------------------|
| iOS 소형 | iPhone SE (4.7") |
| iOS 대형 | iPhone 15 Pro Max |
| iOS 태블릿 | iPad (지원 시) |
| Android 소형 | Pixel 4a / Galaxy A 시리즈 |
| Android 대형 | Pixel 8 Pro / Galaxy S 시리즈 |
| Android 폴더블 | Galaxy Z Fold (지원 시) |
| 다크모드 | 모든 화면 토글하면서 1회 |
| 시스템 폰트 최대 | iOS Dynamic Type Max / Android 2.0x |

## 3. 흔한 실수

- ❌ Figma 시안의 픽셀 좌표를 그대로 옮김 (390 너비 가정) → 작은/큰 폰에서 깨짐.
- ❌ 가로/세로 회전 미테스트 → 회전 시 데이터 사라지거나 레이아웃 폭주.
- ❌ 키보드 올라오면 입력창이 가려짐.
- ❌ 태블릿에서 폰 UI가 가운데 작게만 표시 (앱스토어 reject 사유).
- ❌ 다크모드에서 흰 배경 + 흰 글씨로 안 보이는 화면이 존재.

## 4. 체크리스트

- [ ] 지원 기기·OS·방향·다크모드 범위를 문서 첫 줄에 명시했는가
- [ ] 입력 요소를 Safe Area 안에 두고 가장자리 가림을 회피했는가
- [ ] 키보드가 입력 필드를 가리지 않게 회피 처리했는가
- [ ] 소형 폰과 태블릿/폴더블을 화면 크기로 분기했는가 (태블릿은 2단)
- [ ] 회전·다크모드 변화에 레이아웃과 상태가 살아남는가
- [ ] 시스템 폰트 최대 스케일에서 텍스트가 잘리지 않는가
- [ ] 디바이스 체크 매트릭스를 출시 전에 1회 돌렸는가
