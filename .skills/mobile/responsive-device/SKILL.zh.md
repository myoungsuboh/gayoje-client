---
name: 移动响应式/设备兼容设计
description: 让同一套代码从 iPhone SE 到 iPad Pro、从小型 Android 到折叠屏与平板都不破版的响应式标准。在布置新画面，或确定 Safe Area、旋转、键盘、刘海、深色模式、字体缩放时，以及发布前检查设备兼容性时阅读。关键词: WindowMetrics, sizeClass, GeometryReader, BoxWithConstraints, Configuration, Safe Area, edge-to-edge, Dynamic Type。
rules:
  - "先确定支持的设备范围再设计布局——“支持所有设备”实际上做不到。"
  - "用 Safe Area 避开刘海、挖孔、手势区域。"
  - "做好避让处理，使键盘不遮挡输入框。"
  - "小型手机与平板/折叠屏按屏幕尺寸(sizeClass/WindowSizeClass)分支。"
  - "应对旋转和深色模式的变化。"
  - "不要忽略用户的字体缩放(Dynamic Type / Font Scale)。"
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

# 📐 移动响应式/设备兼容设计

> “在我手机上明明能用……”的 99% 都是 Safe Area / 屏幕尺寸 / 键盘 / 字体缩放之一。在布置新画面，或确定旋转、深色模式、设备兼容性时阅读。

## 1. 核心原则

- 先确定支持的设备范围再设计布局——“支持所有设备”实际上做不到。
- 用 Safe Area 避开刘海、挖孔、手势区域。
- 做好避让处理，使键盘不遮挡输入框。
- 小型手机与平板/折叠屏按屏幕尺寸(sizeClass/WindowSizeClass)分支。
- 应对旋转和深色模式的变化。
- 不要忽略用户的字体缩放(Dynamic Type / Font Scale)。

## 2. 规则

### 2-1. 先确定支持范围

钉死在文档第一行。不支持的要明确排除。

```
iOS  : iOS 16.0+ / iPhone SE 2 ~ iPhone 15 Pro Max / iPad mini ~ iPad Pro 12.9"
Android: API 26+ (Android 8.0) / 5.0" ~ 7.0" / Foldable Galaxy Z Fold(주요만)
방향: 세로 고정 (또는 세로+가로)
다크모드: 지원
```

### 2-2. Safe Area (刘海/挖孔/手势区域)

防止内容在屏幕边缘被遮挡的核心概念。

```swift
// iOS — 默认: 绘制在 SafeArea 内 (大多数情况 OK)
VStack { ... }

// 背景铺到边缘，内容在 SafeArea 内
ZStack {
    Color.surface.ignoresSafeArea()
    VStack { ... }   // safe area 内
}

// 只忽略特定方向 (例如: 图片铺满至顶部)
.ignoresSafeArea(edges: .top)
```

```kotlin
// Android (Compose) — 启用 edge-to-edge (MainActivity)
WindowCompat.setDecorFitsSystemWindows(window, false)

// 内容应用 inset
Box(
    Modifier
        .fillMaxSize()
        .background(MaterialTheme.colorScheme.surface)
        .windowInsetsPadding(WindowInsets.systemBars)
) { ... }

// 仅部分区域铺到边缘 (例如: 头图)
Image(... , modifier = Modifier.fillMaxWidth())
```

> ⚠️ 可交互区域(按钮、文本框)绝不要放在 safe area 之外。

### 2-3. 键盘避让

```swift
// iOS — SwiftUI 默认会自动避让键盘。需要时:
.scrollDismissesKeyboard(.interactively)
.ignoresSafeArea(.keyboard)  // 想忽略键盘时
```

```kotlin
// Android — AndroidManifest.xml 的 Activity:
android:windowSoftInputMode="adjustResize"

// Compose
Modifier
    .imePadding()              // 按键盘高度加 padding
    .verticalScroll(rememberScrollState())
```

### 2-4. 屏幕尺寸分支 (小型手机 vs 平板/折叠屏)

| 类别 | iOS | Android |
|----------|-----|---------|
| 小型手机 | compact width | < 600dp width |
| 普通手机 | regular height + compact width | 600 ~ 840dp |
| 平板/折叠屏展开 | regular/regular | ≥ 840dp |

```swift
// iOS — SizeClass
@Environment(\.horizontalSizeClass) var hSize

var body: some View {
    if hSize == .regular {
        HStack { Sidebar(); Detail() }      // 平板: 双栏
    } else {
        NavigationStack { ListView() }      // 手机: 单栏
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

> 支持平板时必须提供双栏布局。直接放大手机 UI 会让 App Store/Play Store 的评价崩盘。

### 2-5. 旋转(Orientation)

```xml
<!-- iOS — 若竖屏锁定，在 Info.plist 中只保留 Portrait -->
<key>UISupportedInterfaceOrientations</key>
<array><string>UIInterfaceOrientationPortrait</string></array>
```
支持横屏时用 `@Environment(\.verticalSizeClass)` 分支。

```xml
<!-- Android — AndroidManifest.xml -->
<activity ... android:screenOrientation="portrait" />
```
允许旋转时: 注意 ViewModel 在旋转后存活，但 `remember { ... }` 会消失 (务必用 `rememberSaveable`)。

### 2-6. 字体缩放 / 无障碍

- iOS Dynamic Type: 用户可将字体放大到最高 310%。
- Android Font Scale: 用户设置 1.3x ~ 2.0x。

应对原则:
- 固定高度容器 + 文本 → 会发生截断。改为只指定最小值，如 `Modifier.heightIn(min = 48.dp)` / `.frame(minHeight: 48)`。
- 强制单行(`lineLimit(1)`)需谨慎。韩语字体尺寸变动较大。
- iOS: 可用 `.dynamicTypeSize(.large ... .accessibility3)` 设上限。
- Android: 不建议忽略 `fontScale` (无障碍评估会扣分)。

### 2-7. 深色模式 (视觉设计之外需要留意的)

- 图片: 单色图标用 SF Symbols / Material Icons (自动 tint)。全彩图片按浅色/深色分别注册。
- 状态栏/导航栏颜色: iOS 自动，Android 用 `WindowCompat.getInsetsController(...).isAppearanceLightStatusBars` 显式设置。
- 截图(用于应用商店提交): 也可另行提供深色模式截图。

### 2-8. 设备检查矩阵 (发布前必需)

| 类别 | 各至少测试一台 |
|----------|-------------------|
| iOS 小型 | iPhone SE (4.7") |
| iOS 大型 | iPhone 15 Pro Max |
| iOS 平板 | iPad (支持时) |
| Android 小型 | Pixel 4a / Galaxy A 系列 |
| Android 大型 | Pixel 8 Pro / Galaxy S 系列 |
| Android 折叠屏 | Galaxy Z Fold (支持时) |
| 深色模式 | 逐屏切换一次 |
| 系统字体最大 | iOS Dynamic Type Max / Android 2.0x |

## 3. 常见错误

- ❌ 把 Figma 设计稿的像素坐标原样照搬 (假定 390 宽度) → 在小/大手机上破版。
- ❌ 不测试横/竖旋转 → 旋转时数据消失或布局失控。
- ❌ 键盘升起后输入框被遮挡。
- ❌ 平板上手机 UI 只在中央小小地显示 (App Store 拒审理由)。
- ❌ 存在深色模式下白底 + 白字看不见的画面。

## 4. 检查清单

- [ ] 是否在文档第一行明示了支持的设备/OS/方向/深色模式范围
- [ ] 是否把输入元素放在 Safe Area 内并避免边缘遮挡
- [ ] 是否做了避让处理使键盘不遮挡输入框
- [ ] 是否按屏幕尺寸分支了小型手机与平板/折叠屏 (平板用双栏)
- [ ] 旋转/深色模式变化时布局和状态是否存活
- [ ] 在系统字体最大缩放下文本是否不被截断
- [ ] 是否在发布前把设备检查矩阵跑了一遍
