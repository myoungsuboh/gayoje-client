---
name: 移动端权限/隐私运行时处理
description: 在 iOS/Android 上一致地请求和处理拒绝相机·定位·通知·照片·麦克风等运行时权限的模式。当请求权限,或制定拒绝·永久拒绝的恢复流程·清单/隐私声明时阅读。关键词: ActivityCompat, requestPermissions, AVCaptureDevice, PHPhotoLibrary, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS, Info.plist, PrivacyInfo.
rules:
  - "运行时权限分两步处理: 事前说明(rationale) → 系统请求。"
  - "区分「不允许」与「不再询问(永久拒绝)」,对永久拒绝提供引导至设置界面的恢复流程。"
  - "定位先获取使用期间的许可,再分阶段请求后台。"
  - "应对 Android 13+ 通知权限与照片部分访问(iOS Limited / Android Selected Photos)。"
  - "在 Info.plist · Manifest 中具体声明权限理由,并使隐私表单与实际代码一致。"
tags:
  - "ActivityCompat"
  - "requestPermissions"
  - "AVCaptureDevice"
  - "PHPhotoLibrary"
  - "ACCESS_FINE_LOCATION"
  - "POST_NOTIFICATIONS"
  - "Info.plist"
  - "PrivacyInfo"
---

# 🔐 移动端权限/隐私运行时处理

> 权限是 **请求 → 允许/拒绝 → 永久拒绝** 的三状态机。必须区分「不允许」与「不再询问」并展示不同的 UI。当请求相机·定位·通知·照片等运行时权限,或制定拒绝恢复流程·隐私声明时阅读。

## 1. 核心原则
- 运行时权限分两步处理: 事前说明(rationale) → 系统请求。
- 区分「不允许」与「不再询问(永久拒绝)」,对永久拒绝提供引导至设置界面的恢复流程。
- 定位先获取使用期间的许可,再分阶段请求后台。
- 应对 Android 13+ 通知权限与照片部分访问(iOS Limited / Android Selected Photos)。
- 在 Info.plist · Manifest 中具体声明权限理由,并使隐私表单与实际代码一致。

## 2. 规则

### 2-1. 各权限的键矩阵
| 权限 | iOS Info.plist Key | Android Manifest Permission | 需运行时 |
|------|---------------------|------------------------------|-------------|
| 相机 | `NSCameraUsageDescription` | `CAMERA` | ✅ |
| 照片(读取) | `NSPhotoLibraryUsageDescription` | `READ_MEDIA_IMAGES` (13+) | ✅ |
| 照片(保存) | `NSPhotoLibraryAddUsageDescription` | `WRITE_EXTERNAL_STORAGE` (29 以下) | ✅ |
| 麦克风 | `NSMicrophoneUsageDescription` | `RECORD_AUDIO` | ✅ |
| 定位(使用期间) | `NSLocationWhenInUseUsageDescription` | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | ✅ |
| 定位(始终) | `NSLocationAlwaysAndWhenInUseUsageDescription` | `ACCESS_BACKGROUND_LOCATION` | ✅ + 单独请求 |
| 通知 | (自动) | `POST_NOTIFICATIONS` (13+) | ✅ |
| 联系人 | `NSContactsUsageDescription` | `READ_CONTACTS` | ✅ |
| 蓝牙 | `NSBluetoothAlwaysUsageDescription` | `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` | ✅ |

> ⚠️ 若 Info.plist 说明文字为空或含糊,会被 **App Store 拒审**。要像「需要相机以扫描二维码」这样具体写明 **为什么** 需要。

### 2-2. 请求模式 (事前说明 → 系统请求)
权限请求对话框若突然弹出,用户会无条件拒绝。务必按事前说明(rationale) → 请求的顺序进行。

```
[尝试使用功能]
     ↓
[检查权限状态]
     ├─ 已授予 → 执行功能
     ├─ 未决定 → 事前说明界面/弹层 → 系统请求
     ├─ 已拒绝 → 事前说明(为何需要) → 系统请求或引导至设置
     └─ 永久拒绝 → 引导前往设置应用 (即使调用系统请求也不显示)
```

### 2-3. iOS 相机示例
```swift
import AVFoundation

enum CameraPermission {
    static func check() -> AVAuthorizationStatus {
        AVCaptureDevice.authorizationStatus(for: .video)
    }
    static func request() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .video)
    }
}

// ViewModel
@MainActor
func tapScanButton() async {
    switch CameraPermission.check() {
    case .authorized:
        startScanner()
    case .notDetermined:
        if await CameraPermission.request() { startScanner() }
    case .denied, .restricted:
        showSettingsAlert = true   // "请在设置中开启相机权限" + 打开设置应用的按钮
    @unknown default: break
    }
}

// 跳转到设置应用
if let url = URL(string: UIApplication.openSettingsURLString) {
    UIApplication.shared.open(url)
}
```

> iOS 上「拒绝一次」= 此后即使调用 `requestAccess` 对话框也不显示。必须将用户引导至设置。

### 2-4. Android 相机示例 (Compose)
```kotlin
// Accompanist Permissions
val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

when (val status = cameraPermission.status) {
    PermissionStatus.Granted -> CameraContent()
    is PermissionStatus.Denied -> {
        val message = if (status.shouldShowRationale) {
            "需要相机权限以扫描二维码。"     // 拒绝一次
        } else {
            "相机权限已关闭。请在设置中允许。" // 可能永久拒绝
        }
        Column {
            Text(message)
            Button(onClick = { cameraPermission.launchPermissionRequest() }) {
                Text(if (status.shouldShowRationale) "请求权限" else "打开设置")
            }
        }
    }
}

// 跳转到设置应用
val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
    data = Uri.fromParts("package", context.packageName, null)
}
context.startActivity(intent)
```

> Android 11+ 上拒绝两次会自动按「不再询问」处理。当 `shouldShowRationale == false` 时系统对话框不显示 → 将用户引导至设置。

### 2-5. 通知权限 (Android 13+ 新增)
从 Android 13(API 33)起,通知也是运行时权限。

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```
```kotlin
val notif = rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)
LaunchedEffect(Unit) { if (!notif.status.isGranted) notif.launchPermissionRequest() }
```
```swift
let center = UNUserNotificationCenter.current()
let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
```

> 应用一启动就请求通知权限,拒绝率超过70%。应在 **用户认识到通知价值的紧接之后**(例如收到第一条聊天消息后)请求。

### 2-6. 定位 — 分阶段请求
iOS/Android 都采用相同策略: **前台定位 → 实际使用 → 后台定位** 的顺序。一开始就请求「始终允许」几乎都会被拒绝。

### 2-7. 照片 — Picker 优先 (规避权限)
- iOS 14+: 「仅选定的照片」选项。应用仅访问一部分。
- Android 14+: 使用 Photo Picker 时本身无需权限。**新代码优先使用 Photo Picker**。

```kotlin
// Photo Picker (无需权限)
val pickMedia = rememberLauncherForActivityResult(
    ActivityResultContracts.PickVisualMedia()
) { uri -> ... }
pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
```
```swift
// PHPickerViewController (无需权限)
var config = PHPickerConfiguration()
config.filter = .images
let picker = PHPickerViewController(configuration: config)
```

> 若只需简单的照片选择,使用上面的 Picker。彻底消除权限请求本身才是上策。

### 2-8. 隐私标签 / Manifest
- iOS: **Privacy Manifest (`PrivacyInfo.xcprivacy`)** 自 2024 年起必填。详情参见 [ios-appstore SKILL](../ios-appstore/SKILL.md)。
- Android: 填写 Play Console **数据安全(Data Safety)** 表单。明示收集的数据·是否共享·是否加密。
- 两个表单都不能撒谎(与实际代码不符则拒审/拒绝上架)。

## 3. 常见错误
- ❌ 在应用启动的第一个界面一次性请求所有权限。
- ❌ 「拒绝一次」后试图再次弹出同一对话框(不会显示)。
- ❌ Info.plist 说明里只有「需要」一句话 → 拒审。
- ❌ 在 Photo Picker 可用的场景里仍然请求照片权限。
- ❌ 在 Manifest 中宽泛声明 `READ_EXTERNAL_STORAGE` → Play Console 警告。

## 4. 检查清单
- [ ] 是否分两步处理: 事前说明(rationale) → 系统请求
- [ ] 是否区分「不允许」与永久拒绝并展示不同 UI
- [ ] 永久拒绝时是否有引导至设置应用的恢复流程
- [ ] 是否按使用期间 → 后台的阶段请求定位
- [ ] 是否应对 Android 13+ 通知权限、照片部分访问
- [ ] 是否在 Info.plist/Manifest 中具体声明权限理由并使隐私表单与代码一致
