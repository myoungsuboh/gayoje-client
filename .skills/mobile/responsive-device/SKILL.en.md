---
name: Mobile Responsive / Device Compatibility Design
description: A responsive standard for making one codebase not break from iPhone SE to iPad Pro, from small Android to foldables and tablets. Read it when laying out a new screen or deciding Safe Area, rotation, keyboard, notch, dark mode, font scale, or when checking device compatibility before release. Keywords: WindowMetrics, sizeClass, GeometryReader, BoxWithConstraints, Configuration, Safe Area, edge-to-edge, Dynamic Type.
rules:
  - "Decide the supported device range first, then design the layout — 'support every device' is effectively impossible."
  - "Avoid the notch, punch-hole, and gesture areas with Safe Area."
  - "Handle avoidance so the keyboard doesn't cover input fields."
  - "Branch small phones vs. tablets/foldables by screen size (sizeClass/WindowSizeClass)."
  - "Respond to rotation and dark-mode changes."
  - "Don't ignore the user's font scale (Dynamic Type / Font Scale)."
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

# 📐 Mobile Responsive / Device Compatibility Design

> 99% of "but it worked on my phone..." is one of Safe Area / screen size / keyboard / font scale. Read this when laying out a new screen or deciding rotation, dark mode, or device compatibility.

## 1. Core Principles

- Decide the supported device range first, then design the layout — "support every device" is effectively impossible.
- Avoid the notch, punch-hole, and gesture areas with Safe Area.
- Handle avoidance so the keyboard doesn't cover input fields.
- Branch small phones vs. tablets/foldables by screen size (sizeClass/WindowSizeClass).
- Respond to rotation and dark-mode changes.
- Don't ignore the user's font scale (Dynamic Type / Font Scale).

## 2. Rules

### 2-1. Decide the Supported Range First

Nail it down in the document's first line. Explicitly exclude what you don't support.

```
iOS  : iOS 16.0+ / iPhone SE 2 ~ iPhone 15 Pro Max / iPad mini ~ iPad Pro 12.9"
Android: API 26+ (Android 8.0) / 5.0" ~ 7.0" / Foldable Galaxy Z Fold(주요만)
방향: 세로 고정 (또는 세로+가로)
다크모드: 지원
```

### 2-2. Safe Area (Notch / Punch-hole / Gesture Areas)

The key concept that prevents content from being obscured at the screen edges.

```swift
// iOS — default: drawn inside SafeArea (OK in most cases)
VStack { ... }

// Background to the edges, content inside SafeArea
ZStack {
    Color.surface.ignoresSafeArea()
    VStack { ... }   // inside the safe area
}

// Ignore only a specific edge (e.g., image filling up to the top)
.ignoresSafeArea(edges: .top)
```

```kotlin
// Android (Compose) — enable edge-to-edge (MainActivity)
WindowCompat.setDecorFitsSystemWindows(window, false)

// Apply insets to content
Box(
    Modifier
        .fillMaxSize()
        .background(MaterialTheme.colorScheme.surface)
        .windowInsetsPadding(WindowInsets.systemBars)
) { ... }

// Only some areas go to the edge (e.g., header image)
Image(... , modifier = Modifier.fillMaxWidth())
```

> ⚠️ Never place interactive areas (buttons, text fields) outside the safe area.

### 2-3. Keyboard Avoidance

```swift
// iOS — SwiftUI avoids the keyboard automatically by default. When needed:
.scrollDismissesKeyboard(.interactively)
.ignoresSafeArea(.keyboard)  // when you want to ignore the keyboard
```

```kotlin
// Android — the Activity in AndroidManifest.xml:
android:windowSoftInputMode="adjustResize"

// Compose
Modifier
    .imePadding()              // pad by the keyboard height
    .verticalScroll(rememberScrollState())
```

### 2-4. Screen-Size Branching (Small Phone vs. Tablet/Foldable)

| Category | iOS | Android |
|----------|-----|---------|
| Small phone | compact width | < 600dp width |
| Regular phone | regular height + compact width | 600 ~ 840dp |
| Tablet / unfolded foldable | regular/regular | ≥ 840dp |

```swift
// iOS — SizeClass
@Environment(\.horizontalSizeClass) var hSize

var body: some View {
    if hSize == .regular {
        HStack { Sidebar(); Detail() }      // tablet: two-pane
    } else {
        NavigationStack { ListView() }      // phone: one-pane
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

> When supporting tablets, always provide a two-pane layout. Just enlarging the phone UI will get your App Store/Play Store reviews destroyed.

### 2-5. Orientation

```xml
<!-- iOS — if portrait-locked, leave only Portrait in Info.plist -->
<key>UISupportedInterfaceOrientations</key>
<array><string>UIInterfaceOrientationPortrait</string></array>
```
When supporting landscape, branch with `@Environment(\.verticalSizeClass)`.

```xml
<!-- Android — AndroidManifest.xml -->
<activity ... android:screenOrientation="portrait" />
```
When allowing rotation: note that the ViewModel survives rotation but `remember { ... }` disappears (always use `rememberSaveable`).

### 2-6. Font Scale / Accessibility

- iOS Dynamic Type: the user can enlarge fonts up to 310%.
- Android Font Scale: the user sets 1.3x ~ 2.0x.

Handling principles:
- Fixed-height container + text → clipping occurs. Instead specify only a minimum, like `Modifier.heightIn(min = 48.dp)` / `.frame(minHeight: 48)`.
- Forcing one line (`lineLimit(1)`) with caution. Korean font-size variance is large.
- iOS: you can set an upper bound with `.dynamicTypeSize(.large ... .accessibility3)`.
- Android: ignoring `fontScale` is not recommended (accessibility-score penalty).

### 2-7. Dark Mode (Things to Mind Beyond Visual Design)

- Images: for monochrome icons, use SF Symbols / Material Icons (auto-tint). Register full-color images separately for light/dark.
- Status-bar / navigation-bar color: automatic on iOS; on Android specify explicitly via `WindowCompat.getInsetsController(...).isAppearanceLightStatusBars`.
- Screenshots (for App Store submission): you can also provide separate dark-mode screenshots.

### 2-8. Device Check Matrix (Required Before Release)

| Category | Test at least one of each |
|----------|-------------------|
| iOS small | iPhone SE (4.7") |
| iOS large | iPhone 15 Pro Max |
| iOS tablet | iPad (if supported) |
| Android small | Pixel 4a / Galaxy A series |
| Android large | Pixel 8 Pro / Galaxy S series |
| Android foldable | Galaxy Z Fold (if supported) |
| Dark mode | Toggle through every screen once |
| Max system font | iOS Dynamic Type Max / Android 2.0x |

## 3. Common Mistakes

- ❌ Copying the Figma mockup's pixel coordinates as-is (assuming 390 width) → breaks on small/large phones.
- ❌ Not testing landscape/portrait rotation → data disappears or layout goes haywire on rotation.
- ❌ The input field gets covered when the keyboard comes up.
- ❌ On a tablet, the phone UI shows tiny in the center (a reason for App Store rejection).
- ❌ A screen with a white background + white text that's invisible in dark mode.

## 4. Checklist

- [ ] Did you state the supported device/OS/orientation/dark-mode range in the document's first line?
- [ ] Did you keep input elements inside the Safe Area and avoid edge obstruction?
- [ ] Did you handle avoidance so the keyboard doesn't cover input fields?
- [ ] Did you branch small phones and tablets/foldables by screen size (two-pane for tablets)?
- [ ] Do the layout and state survive rotation/dark-mode changes?
- [ ] Does text not get clipped at the maximum system font scale?
- [ ] Did you run the device check matrix once before release?
