---
name: Mobile Permission/Privacy Runtime Handling
description: Patterns for requesting and handling denial of runtime permissions (camera, location, notifications, photos, microphone, etc.) consistently across iOS/Android. Read this when requesting permissions or when deciding on denial / permanent-denial recovery flows and manifest/privacy declarations. Keywords: ActivityCompat, requestPermissions, AVCaptureDevice, PHPhotoLibrary, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS, Info.plist, PrivacyInfo.
rules:
  - "Handle runtime permissions in two steps: rationale (pre-prompt) → system request."
  - "Distinguish 'Don't Allow' from 'Don't ask again' (permanent denial), and provide a recovery flow that guides permanent-denial cases to the Settings screen."
  - "For location, get when-in-use permission first and request background incrementally."
  - "Handle the Android 13+ notification permission and partial photo access (iOS Limited / Android Selected Photos)."
  - "Declare the permission rationale concretely in Info.plist · Manifest, and keep the privacy form consistent with the actual code."
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

# 🔐 Mobile Permission/Privacy Runtime Handling

> A permission is a 3-state machine: **request → allow/deny → permanently denied**. You must distinguish "Don't Allow" from "Don't ask again" and show different UI. Read this when requesting runtime permissions such as camera, location, notifications, photos, or when deciding on denial recovery flows and privacy declarations.

## 1. Core Principles
- Handle runtime permissions in two steps: rationale (pre-prompt) → system request.
- Distinguish "Don't Allow" from "Don't ask again" (permanent denial), and provide a recovery flow that guides permanent-denial cases to the Settings screen.
- For location, get when-in-use permission first and request background incrementally.
- Handle the Android 13+ notification permission and partial photo access (iOS Limited / Android Selected Photos).
- Declare the permission rationale concretely in Info.plist · Manifest, and keep the privacy form consistent with the actual code.

## 2. Rules

### 2-1. Per-Permission Key Matrix
| Permission | iOS Info.plist Key | Android Manifest Permission | Runtime Required |
|------|---------------------|------------------------------|-------------|
| Camera | `NSCameraUsageDescription` | `CAMERA` | ✅ |
| Photos (read) | `NSPhotoLibraryUsageDescription` | `READ_MEDIA_IMAGES` (13+) | ✅ |
| Photos (save) | `NSPhotoLibraryAddUsageDescription` | `WRITE_EXTERNAL_STORAGE` (below 29) | ✅ |
| Microphone | `NSMicrophoneUsageDescription` | `RECORD_AUDIO` | ✅ |
| Location (when in use) | `NSLocationWhenInUseUsageDescription` | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | ✅ |
| Location (always) | `NSLocationAlwaysAndWhenInUseUsageDescription` | `ACCESS_BACKGROUND_LOCATION` | ✅ + separate request |
| Notifications | (automatic) | `POST_NOTIFICATIONS` (13+) | ✅ |
| Contacts | `NSContactsUsageDescription` | `READ_CONTACTS` | ✅ |
| Bluetooth | `NSBluetoothAlwaysUsageDescription` | `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` | ✅ |

> ⚠️ If the Info.plist description text is empty or vague, it gets **App Store rejected**. Write **why** it's needed concretely, like "The camera is needed to scan QR codes."

### 2-2. Request Pattern (rationale → system request)
If the permission dialog pops up out of nowhere, users will deny it unconditionally. Always go rationale → request, in that order.

```
[Attempt to use feature]
     ↓
[Check permission status]
     ├─ Granted → run feature
     ├─ Not determined → rationale screen/sheet → system request
     ├─ Denied → rationale (why it's needed) → system request or guide to Settings
     └─ Permanently denied → guide to Settings app (system request won't show even if called)
```

### 2-3. iOS Camera Example
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
        showSettingsAlert = true   // "Please enable camera permission in Settings" + button to open Settings app
    @unknown default: break
    }
}

// Jump to the Settings app
if let url = URL(string: UIApplication.openSettingsURLString) {
    UIApplication.shared.open(url)
}
```

> On iOS, "denied once" = the dialog won't appear even if you call `requestAccess` afterward. You must send the user to Settings.

### 2-4. Android Camera Example (Compose)
```kotlin
// Accompanist Permissions
val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

when (val status = cameraPermission.status) {
    PermissionStatus.Granted -> CameraContent()
    is PermissionStatus.Denied -> {
        val message = if (status.shouldShowRationale) {
            "Camera permission is needed to scan QR codes."     // denied once
        } else {
            "Camera permission is off. Please allow it in Settings." // possible permanent denial
        }
        Column {
            Text(message)
            Button(onClick = { cameraPermission.launchPermissionRequest() }) {
                Text(if (status.shouldShowRationale) "Request Permission" else "Open Settings")
            }
        }
    }
}

// Jump to the Settings app
val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
    data = Uri.fromParts("package", context.packageName, null)
}
context.startActivity(intent)
```

> On Android 11+, denying twice is automatically treated as "Don't ask again". When `shouldShowRationale == false`, the system dialog won't appear → send the user to Settings.

### 2-5. Notification Permission (new in Android 13+)
Starting from Android 13 (API 33), notifications are also a runtime permission.

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

> Requesting notification permission right when the app starts yields a denial rate over 70%. Request it **right after the user recognizes the value of notifications** (e.g., after receiving the first chat message).

### 2-6. Location — Incremental Request
iOS/Android share the same policy: **foreground location → let them try it → background location**, in that order. Requesting "Always Allow" from the start gets almost always denied.

### 2-7. Photos — Picker First (avoid the permission)
- iOS 14+: the "Selected Photos only" option. The app accesses only a subset.
- Android 14+: using the Photo Picker requires no permission at all. **For new code, prefer the Photo Picker**.

```kotlin
// Photo Picker (no permission needed)
val pickMedia = rememberLauncherForActivityResult(
    ActivityResultContracts.PickVisualMedia()
) { uri -> ... }
pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
```
```swift
// PHPickerViewController (no permission needed)
var config = PHPickerConfiguration()
config.filter = .images
let picker = PHPickerViewController(configuration: config)
```

> If you only need simple photo selection, use the Picker above. Eliminating the permission request altogether is best.

### 2-8. Privacy Label / Manifest
- iOS: **Privacy Manifest (`PrivacyInfo.xcprivacy`)** required since 2024. See [ios-appstore SKILL](../ios-appstore/SKILL.md) for details.
- Android: fill out the Play Console **Data Safety** form. Declare collected data, whether it's shared, and whether it's encrypted.
- The two forms must not lie (rejection/registration refusal if they differ from the actual code).

## 3. Common Mistakes
- ❌ Requesting all permissions at once on the app's first screen.
- ❌ Trying to re-show the same dialog after "denied once" (it won't appear).
- ❌ A one-word "is needed" in the Info.plist description → rejection.
- ❌ Requesting photo permission anyway in cases where the Photo Picker is possible.
- ❌ Declaring `READ_EXTERNAL_STORAGE` broadly in the Manifest → Play Console warning.

## 4. Checklist
- [ ] Did you handle it in two steps: rationale → system request?
- [ ] Do you distinguish "Don't Allow" from permanent denial and show different UI?
- [ ] Is there a recovery flow that guides to the Settings app on permanent denial?
- [ ] Did you request location in stages: when in use → background?
- [ ] Did you handle the Android 13+ notification permission and partial photo access?
- [ ] Did you declare the permission rationale concretely in Info.plist/Manifest and keep the privacy form consistent with the code?
