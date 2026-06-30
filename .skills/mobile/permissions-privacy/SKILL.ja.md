---
name: モバイル権限/プライバシーのランタイム処理
description: カメラ・位置情報・通知・写真・マイクなどのランタイム権限を iOS/Android で一貫して要求・拒否処理するパターン。権限を要求する、あるいは拒否・恒久拒否の復旧フロー・マニフェスト/プライバシー宣言を決める際に読む。キーワード: ActivityCompat, requestPermissions, AVCaptureDevice, PHPhotoLibrary, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS, Info.plist, PrivacyInfo.
rules:
  - "ランタイム権限は事前説明(rationale) → システム要求の2段階で処理する。"
  - "「許可しない」と「今後表示しない(恒久拒否)」を区別し、恒久拒否は設定画面へ誘導する復旧フローを提供する。"
  - "位置情報は使用中の許可を先に取得し、バックグラウンドを段階的に要求する。"
  - "Android 13+ の通知権限と写真の部分アクセス(iOS Limited / Android Selected Photos)に対応する。"
  - "権限の理由を Info.plist · Manifest に具体的に宣言し、プライバシーフォームを実際のコードと一致させる。"
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

# 🔐 モバイル権限/プライバシーのランタイム処理

> 権限は **要求 → 許可/拒否 → 恒久拒否** の3状態マシンである。「許可しない」と「今後表示しない」を区別し、異なる UI を見せなければならない。カメラ・位置情報・通知・写真などのランタイム権限を要求する、あるいは拒否の復旧フロー・プライバシー宣言を決める際に読む。

## 1. 中核原則
- ランタイム権限は事前説明(rationale) → システム要求の2段階で処理する。
- 「許可しない」と「今後表示しない(恒久拒否)」を区別し、恒久拒否は設定画面へ誘導する復旧フローを提供する。
- 位置情報は使用中の許可を先に取得し、バックグラウンドを段階的に要求する。
- Android 13+ の通知権限と写真の部分アクセス(iOS Limited / Android Selected Photos)に対応する。
- 権限の理由を Info.plist · Manifest に具体的に宣言し、プライバシーフォームを実際のコードと一致させる。

## 2. ルール

### 2-1. 権限別キーマトリクス
| 権限 | iOS Info.plist Key | Android Manifest Permission | ランタイム必要 |
|------|---------------------|------------------------------|-------------|
| カメラ | `NSCameraUsageDescription` | `CAMERA` | ✅ |
| 写真(読み取り) | `NSPhotoLibraryUsageDescription` | `READ_MEDIA_IMAGES` (13+) | ✅ |
| 写真(保存) | `NSPhotoLibraryAddUsageDescription` | `WRITE_EXTERNAL_STORAGE` (29 未満) | ✅ |
| マイク | `NSMicrophoneUsageDescription` | `RECORD_AUDIO` | ✅ |
| 位置情報(使用中) | `NSLocationWhenInUseUsageDescription` | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | ✅ |
| 位置情報(常に) | `NSLocationAlwaysAndWhenInUseUsageDescription` | `ACCESS_BACKGROUND_LOCATION` | ✅ + 別途要求 |
| 通知 | (自動) | `POST_NOTIFICATIONS` (13+) | ✅ |
| 連絡先 | `NSContactsUsageDescription` | `READ_CONTACTS` | ✅ |
| Bluetooth | `NSBluetoothAlwaysUsageDescription` | `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` | ✅ |

> ⚠️ Info.plist の説明文が空または曖昧だと **App Store リジェクト**。「QR コードのスキャンのためにカメラが必要です」のように **なぜ** 必要かを具体的に書く。

### 2-2. 要求パターン (事前説明 → システム要求)
権限要求ダイアログが突然出ると、ユーザーは無条件に拒否する。必ず事前説明(rationale) → 要求の順で行う。

```
[機能の使用を試みる]
     ↓
[権限状態をチェック]
     ├─ 許可済み → 機能を実行
     ├─ 未決定 → 事前説明画面/シート → システム要求
     ├─ 拒否済み → 事前説明(なぜ必要か) → システム要求または設定へ案内
     └─ 恒久拒否 → 設定アプリへ移動を案内 (システム要求を呼んでも出ない)
```

### 2-3. iOS カメラ例
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
        showSettingsAlert = true   // "設定でカメラ権限をオンにしてください" + 設定アプリを開くボタン
    @unknown default: break
    }
}

// 設定アプリへジャンプ
if let url = URL(string: UIApplication.openSettingsURLString) {
    UIApplication.shared.open(url)
}
```

> iOS は「一度拒否」= 以降 `requestAccess` を呼んでもダイアログが出ない。必ず設定へ送る必要がある。

### 2-4. Android カメラ例 (Compose)
```kotlin
// Accompanist Permissions
val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

when (val status = cameraPermission.status) {
    PermissionStatus.Granted -> CameraContent()
    is PermissionStatus.Denied -> {
        val message = if (status.shouldShowRationale) {
            "QR コードのスキャンのためにカメラ権限が必要です。"     // 一度拒否
        } else {
            "カメラ権限がオフです。設定で許可してください。" // 恒久拒否の可能性
        }
        Column {
            Text(message)
            Button(onClick = { cameraPermission.launchPermissionRequest() }) {
                Text(if (status.shouldShowRationale) "権限を要求" else "設定を開く")
            }
        }
    }
}

// 設定アプリへジャンプ
val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
    data = Uri.fromParts("package", context.packageName, null)
}
context.startActivity(intent)
```

> Android 11+ では二度拒否すると自動的に「今後表示しない」扱い。`shouldShowRationale == false` ならシステムダイアログが出ない → 設定へ送る。

### 2-5. 通知権限 (Android 13+ 新規)
Android 13(API 33)から通知もランタイム権限である。

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

> アプリ起動直後に通知権限を要求すると拒否率70%以上。**ユーザーが通知の価値を認識した直後**(例: 最初のチャットメッセージを受け取った後)に要求せよ。

### 2-6. 位置情報 — 段階的要求
iOS/Android とも同じポリシー: **フォアグラウンド位置情報 → 使ってみる → バックグラウンド位置情報** の順。最初から「常に許可」を要求するとほぼ拒否される。

### 2-7. 写真 — Picker 優先 (権限回避)
- iOS 14+: 「選択した写真のみ」オプション。アプリは一部のみにアクセス。
- Android 14+: Photo Picker 使用時は権限自体が不要。**新規コードは Photo Picker 優先**。

```kotlin
// Photo Picker (権限不要)
val pickMedia = rememberLauncherForActivityResult(
    ActivityResultContracts.PickVisualMedia()
) { uri -> ... }
pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
```
```swift
// PHPickerViewController (権限不要)
var config = PHPickerConfiguration()
config.filter = .images
let picker = PHPickerViewController(configuration: config)
```

> 単純な写真選択のみ必要なら上記 Picker を使う。権限要求自体をなくすのが最善。

### 2-8. プライバシーラベル / Manifest
- iOS: **Privacy Manifest (`PrivacyInfo.xcprivacy`)** 2024年から必須。詳細は [ios-appstore SKILL](../ios-appstore/SKILL.md) を参照。
- Android: Play Console **データセーフティ(Data Safety)** フォームを記入。収集データ・共有有無・暗号化有無を明示。
- 両フォームは嘘をついてはならない(実際のコードと異なるとリジェクト/登録拒否)。

## 3. よくあるミス
- ❌ アプリ起動の最初の画面で全権限を一度に要求。
- ❌ 「一度拒否」後に同じダイアログを再表示しようとする(出ない)。
- ❌ Info.plist の説明に「必要です」の一言 → リジェクト。
- ❌ Photo Picker が可能なケースでわざわざ写真権限を要求。
- ❌ Manifest に `READ_EXTERNAL_STORAGE` を広範に宣言 → Play Console 警告。

## 4. チェックリスト
- [ ] 事前説明(rationale) → システム要求の2段階で処理したか
- [ ] 「許可しない」と恒久拒否を区別して異なる UI を見せているか
- [ ] 恒久拒否時に設定アプリへ誘導する復旧フローがあるか
- [ ] 位置情報を使用中 → バックグラウンドの段階で要求したか
- [ ] Android 13+ の通知権限、写真の部分アクセスに対応したか
- [ ] 権限の理由を Info.plist/Manifest に具体的に宣言し、プライバシーフォームをコードと一致させたか
