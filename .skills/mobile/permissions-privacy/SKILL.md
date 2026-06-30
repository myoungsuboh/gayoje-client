---
name: 모바일 권한/프라이버시 런타임 처리
description: 카메라·위치·알림·사진·마이크 등 런타임 권한을 iOS/Android에서 일관되게 요청·거부 처리하는 패턴. 권한을 요청하거나 거부·영구거부 복구 흐름·매니페스트/프라이버시 선언을 정할 때 읽는다. 키워드: ActivityCompat, requestPermissions, AVCaptureDevice, PHPhotoLibrary, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS, Info.plist, PrivacyInfo.
rules:
  - "런타임 권한은 사전 안내(rationale) → 시스템 요청의 2단계로 처리한다."
  - "'허용 안 함'과 '다시 묻지 않음(영구거부)'을 구분해, 영구거부는 설정 화면으로 유도하는 복구 흐름을 제공한다."
  - "위치는 사용 중 허용을 먼저 받고 백그라운드를 단계적으로 요청한다."
  - "Android 13+ 알림 권한과 사진 부분 접근(iOS Limited / Android Selected Photos)을 대응한다."
  - "권한 사유를 Info.plist · Manifest 에 구체적으로 선언하고, 프라이버시 폼은 실제 코드와 일치시킨다."
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

# 🔐 모바일 권한/프라이버시 런타임 처리

> 권한은 **요청 → 허용/거부 → 영구거부** 의 3-상태 머신이다. "허용 안 함"과 "다시 묻지 않음"을 구분해 다른 UI를 보여야 한다. 카메라·위치·알림·사진 등 런타임 권한을 요청하거나 거부 복구 흐름·프라이버시 선언을 정할 때 읽는다.

## 1. 핵심 원칙
- 런타임 권한은 사전 안내(rationale) → 시스템 요청의 2단계로 처리한다.
- "허용 안 함"과 "다시 묻지 않음(영구거부)"을 구분해, 영구거부는 설정 화면으로 유도하는 복구 흐름을 제공한다.
- 위치는 사용 중 허용을 먼저 받고 백그라운드를 단계적으로 요청한다.
- Android 13+ 알림 권한과 사진 부분 접근(iOS Limited / Android Selected Photos)을 대응한다.
- 권한 사유를 Info.plist · Manifest 에 구체적으로 선언하고, 프라이버시 폼은 실제 코드와 일치시킨다.

## 2. 규칙

### 2-1. 권한별 키 매트릭스
| 권한 | iOS Info.plist Key | Android Manifest Permission | 런타임 필요 |
|------|---------------------|------------------------------|-------------|
| 카메라 | `NSCameraUsageDescription` | `CAMERA` | ✅ |
| 사진(읽기) | `NSPhotoLibraryUsageDescription` | `READ_MEDIA_IMAGES` (13+) | ✅ |
| 사진(저장) | `NSPhotoLibraryAddUsageDescription` | `WRITE_EXTERNAL_STORAGE` (29 미만) | ✅ |
| 마이크 | `NSMicrophoneUsageDescription` | `RECORD_AUDIO` | ✅ |
| 위치(사용 중) | `NSLocationWhenInUseUsageDescription` | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | ✅ |
| 위치(항상) | `NSLocationAlwaysAndWhenInUseUsageDescription` | `ACCESS_BACKGROUND_LOCATION` | ✅ + 별도 요청 |
| 알림 | (자동) | `POST_NOTIFICATIONS` (13+) | ✅ |
| 연락처 | `NSContactsUsageDescription` | `READ_CONTACTS` | ✅ |
| 블루투스 | `NSBluetoothAlwaysUsageDescription` | `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` | ✅ |

> ⚠️ Info.plist 설명 문구가 비어있거나 모호하면 **앱스토어 리젝**. "QR 코드 스캔을 위해 카메라가 필요합니다"처럼 **왜** 필요한지 구체적으로 쓴다.

### 2-2. 요청 패턴 (사전 안내 → 시스템 요청)
권한 요청 다이얼로그가 갑자기 뜨면 사용자는 무조건 거부한다. 반드시 사전 안내(rationale) → 요청 순으로 한다.

```
[기능 사용 시도]
     ↓
[권한 상태 체크]
     ├─ 허용됨 → 기능 실행
     ├─ 미결정 → 사전 안내 화면/시트 → 시스템 요청
     ├─ 거부됨 → 사전 안내(왜 필요한지) → 시스템 요청 또는 설정으로 안내
     └─ 영구거부 → 설정 앱으로 이동 안내 (시스템 요청 호출해도 안 뜸)
```

### 2-3. iOS 카메라 예시
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
        showSettingsAlert = true   // "설정에서 카메라 권한을 켜주세요" + 설정 앱 열기 버튼
    @unknown default: break
    }
}

// 설정 앱으로 점프
if let url = URL(string: UIApplication.openSettingsURLString) {
    UIApplication.shared.open(url)
}
```

> iOS는 "한 번 거부" = 이후 `requestAccess` 호출해도 다이얼로그 안 뜸. 무조건 설정으로 보내야 한다.

### 2-4. Android 카메라 예시 (Compose)
```kotlin
// Accompanist Permissions
val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

when (val status = cameraPermission.status) {
    PermissionStatus.Granted -> CameraContent()
    is PermissionStatus.Denied -> {
        val message = if (status.shouldShowRationale) {
            "QR 코드 스캔을 위해 카메라 권한이 필요합니다."     // 한 번 거부
        } else {
            "카메라 권한이 꺼져 있습니다. 설정에서 허용해주세요." // 영구거부 가능성
        }
        Column {
            Text(message)
            Button(onClick = { cameraPermission.launchPermissionRequest() }) {
                Text(if (status.shouldShowRationale) "권한 요청" else "설정 열기")
            }
        }
    }
}

// 설정 앱으로 점프
val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
    data = Uri.fromParts("package", context.packageName, null)
}
context.startActivity(intent)
```

> Android 11+ 에서 두 번 거부하면 자동 "다시 묻지 않음" 처리. `shouldShowRationale == false` 면 시스템 다이얼로그가 안 뜬다 → 설정으로 보내라.

### 2-5. 알림 권한 (Android 13+ 신규)
Android 13(API 33)부터 알림도 런타임 권한이다.

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

> 앱 시작하자마자 알림 권한 요청하면 거부율 70% 이상. **사용자가 알림 가치를 인지한 직후**(예: 첫 채팅 메시지 받은 후) 요청하라.

### 2-6. 위치 — 단계별 요청
iOS/Android 모두 동일한 정책: **포그라운드 위치 → 사용해 보고 → 백그라운드 위치** 순서. 처음부터 "항상 허용"을 요청하면 거의 거부된다.

### 2-7. 사진 — Picker 우선 (권한 회피)
- iOS 14+: "선택한 사진만" 옵션. 앱은 일부에만 접근.
- Android 14+: Photo Picker 사용 시 권한 자체 불필요. **신규 코드는 Photo Picker 우선**.

```kotlin
// Photo Picker (권한 불필요)
val pickMedia = rememberLauncherForActivityResult(
    ActivityResultContracts.PickVisualMedia()
) { uri -> ... }
pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
```
```swift
// PHPickerViewController (권한 불필요)
var config = PHPickerConfiguration()
config.filter = .images
let picker = PHPickerViewController(configuration: config)
```

> 단순 사진 선택만 필요하면 위 Picker 사용. 권한 요청 자체를 없애는 게 최선.

### 2-8. 프라이버시 라벨 / Manifest
- iOS: **Privacy Manifest (`PrivacyInfo.xcprivacy`)** 2024년부터 필수. 자세한 건 [ios-appstore SKILL](../ios-appstore/SKILL.md) 참고.
- Android: Play Console **데이터 보안(Data Safety)** 폼 작성. 수집 데이터·공유 여부·암호화 여부 명시.
- 두 폼은 거짓말하면 안 됨 (실제 코드와 다르면 리젝/등록 거부).

## 3. 흔한 실수
- ❌ 앱 시작 첫 화면에서 모든 권한 한꺼번에 요청.
- ❌ "한 번 거부" 후 같은 다이얼로그를 다시 띄우려 함 (안 뜸).
- ❌ Info.plist 설명에 "필요합니다" 한 마디 → 리젝.
- ❌ Photo Picker 가 가능한 케이스에 굳이 사진 권한 요청.
- ❌ Manifest에 `READ_EXTERNAL_STORAGE` 광범위하게 선언 → Play Console 경고.

## 4. 체크리스트
- [ ] 사전 안내(rationale) → 시스템 요청의 2단계로 처리했는가
- [ ] "허용 안 함"과 영구거부를 구분해 다른 UI를 보여주는가
- [ ] 영구거부 시 설정 앱으로 유도하는 복구 흐름이 있는가
- [ ] 위치를 사용 중 → 백그라운드 단계로 요청했는가
- [ ] Android 13+ 알림 권한, 사진 부분 접근을 대응했는가
- [ ] 권한 사유를 Info.plist/Manifest에 구체적으로 선언하고 프라이버시 폼을 코드와 일치시켰는가
