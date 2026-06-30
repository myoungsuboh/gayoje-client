---
name: iOS App Store 登録ガイド (iOS App Store Submission)
description: Apple Developer加入からApp Store審査通過までの段階的なデプロイ標準。iOSアプリを初めてリリースする、または証明書・プロビジョニング・審査リジェクトの落とし穴を点検するときに順番に読む。キーワード: xcode, TestFlight, App Store Connect, archive, codesign, ExportOptions, Privacy Manifest, provisioning。
rules:
  - "Apple Developer Programに加入する(年$99、有効化まで最大48時間)。"
  - "固有のBundle IDを登録する — 一度登録すると変更不可。"
  - "配布用のDistribution証明書とProvisioning Profileを作成する(証明書はチームごとに1つ)。"
  - "Xcodeで署名設定とバージョン・ビルド番号を確認する — ビルド番号は毎回増加。"
  - "審査リジェクトの落とし穴(権限の理由・プライバシーラベル・Privacy Manifest)を事前に点検する。"
tags:
  - "xcode"
  - "TestFlight"
  - "App Store Connect"
  - "archive"
  - "codesign"
  - "ExportOptions"
  - "Privacy Manifest"
  - "provisioning"
---

# 🍎 iOS App Store 登録ガイド

> Apple Developer登録からApp Store審査通過まで順番に進める。iOSアプリを初めてデプロイする、またはリジェクトの落とし穴を事前に点検するときに読む。
>
> ⚠️ Appleは小さなミス一つでアプリをリジェクト(Reject)する。最初から順番に従わないと時間の無駄になる。

## 1. 核心原則
- Apple Developer Programに加入する(年$99、有効化まで最大48時間)。
- 固有のBundle IDを登録する — 一度登録すると変更不可。
- 配布用のDistribution証明書とProvisioning Profileを作成する(証明書はチームごとに1つ)。
- Xcodeで署名設定とバージョン・ビルド番号を確認する — ビルド番号は毎回増加。
- 審査リジェクトの落とし穴(権限の理由・プライバシーラベル・Privacy Manifest)を事前に点検する。

## 2. ルール

### 2-1. Apple Developer Program加入 (年$99)
1. [developer.apple.com](https://developer.apple.com) → アカウントにログイン → **Enroll**
2. 個人(Individual)または会社(Organization)を選択
   - 個人: 本人の名前で公開される
   - 会社: DUNS番号が必要、審査に1〜2週間かかる
3. $99決済 → **有効化まで最大48時間かかる**(待つ必要がある)。

### 2-2. Bundle ID登録 (アプリの固有ID)
1. [developer.apple.com/account](https://developer.apple.com/account) → **Identifiers** → **+** → **App IDs** → **App**
2. Bundle IDを入力: `com.会社名.アプリ名` 形式 (例: `com.harness.digitaltwins`)
   - 一度登録すると **変更不可** → 慎重に決める。
3. 必要なCapabilitiesをチェック: Push Notifications, Sign in with Apple, In-App Purchase → **Register**

### 2-3. 証明書(Certificate)作成
**Development Certificate** (開発/端末テスト): Xcode → **Preferences** → **Accounts** → アカウント → **Manage Certificates** → **+** → **Apple Development** (自動生成、推奨)。

**Distribution Certificate** (App Store提出):
1. **キーチェーンアクセス** → **証明書アシスタント** → **認証局に証明書を要求** → `CertificateSigningRequest.certSigningRequest` を保存
2. developer.apple.com → **Certificates** → **+** → **Apple Distribution** → CSRをアップロード → ダウンロード
3. `.cer` をダブルクリック → キーチェーンに自動インストール
> ⚠️ Distribution Certificateは **チームごとに1つ** のみ発行。すでにある場合は既存のものを使用。

### 2-4. Provisioning Profile作成 (App Store配布用)
証明書 + Bundle ID + 端末を束ねるファイル。なければインストール/配布不可。
1. developer.apple.com → **Profiles** → **+** → **App Store Connect**
2. Bundle IDを選択(2-2) → Distribution Certificateを選択(2-3)
3. 名前を入力(例: `Harness_AppStore`) → **Generate** → ダウンロード
4. `.mobileprovision` をダブルクリック → Xcodeが自動登録

### 2-5. Xcodeプロジェクト設定 (Signing & Capabilities)
| 項目 | 設定値 |
|------|--------|
| Team | Apple Developerアカウントを選択 |
| Bundle Identifier | 2-2で登録したBundle IDと正確に一致 |
| Automatically manage signing | チェックを外す (手動管理を推奨) |
| Provisioning Profile | 2-4で作成したProfileを選択 |

**Info.plist権限の説明 (なければ即リジェクト)**
```xml
<!-- ✅ 推奨 — なぜ必要かを具体的に -->
<key>NSCameraUsageDescription</key>
<string>QR 코드 스캔을 위해 카메라 접근이 필요합니다.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>프로필 사진 설정을 위해 사진첩 접근이 필요합니다.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치 기반 서비스를 제공하기 위해 위치 정보가 필요합니다.</string>
```
> ⚠️ 説明がなかったり曖昧だと **即リジェクト**。

### 2-6. App Store Connectアプリ登録
1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**
2. 入力: **Platforms**(iOS)、**Name**(30文字以下)、**Primary Language**(Korean)、**Bundle ID**(2-2)、**SKU**(例: `harness-ios-001`) → **Create**

### 2-7. アプリのメタデータ (よくリジェクトされる部分)
**必須スクリーンショット規格**
| 端末 | 解像度 | 必須かどうか |
|------|--------|-----------|
| iPhone 6.7" (15 Pro Max) | 1290 × 2796 | **必須** |
| iPhone 6.5" (14 Plus) | 1284 × 2778 | 推奨 |
| iPad Pro 12.9" | 2048 × 2732 | iPadサポート時は必須 |

- スクリーンショットは最小1枚〜最大10枚、**実際のアプリ画面** でなければならない(マーケティングテキストのみは不可)。
- アプリ説明: 最初の3行が最も重要。キーワードは別の **Keywords** フィールド(100文字以内)に、説明への重複入力は禁止。
- 競合アプリ名の言及禁止(例: 「カカオトークより速い」 → リジェクト)。
- **プライバシーポリシーURL** 必須 — 外部アクセス可能なURL(GitHub Pages・Notion可)、収集データを明示。

### 2-8. Privacy Manifest作成 (2024年から必須)
なければアップロード自体が拒否される。Xcode → **File** → **New File** → **Privacy Manifest** → `PrivacyInfo.xcprivacy`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key><false/>  <!-- 広告トラッキングをしないならfalse -->
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key><true/>
            <key>NSPrivacyCollectedDataTypeTracking</key><false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>CA92.1</string></array>
        </dict>
    </array>
</dict>
</plist>
```

### 2-9. ビルドのアーカイブ & アップロード
```
Xcodeで端末を選択 → "Any iOS Device (arm64)" → Productメニュー → Archive
```
アーカイブ完了後 **Organizer** → アーカイブを選択 → **Distribute App** → **App Store Connect** → **Upload**
- ✅ Include bitcode(推奨)、✅ Upload symbols(クラッシュ分析用) → **Upload** (5〜15分かかる)
> ⚠️ ビルド番号は毎回上げなければならない。バージョン(1.0.0)は同じでもよいが、ビルド番号(1, 2, 3…)は常に増加。

### 2-10. TestFlightベータテスト (任意、推奨)
App Store Connect → **TestFlight** → ビルドを選択 → **+** → テスターを追加
- 内部テスター(チームメンバー): 最大100名、即時配布。
- 外部テスター: 最大10,000名、Apple審査が必要(1〜2日)。

### 2-11. 審査提出 & アプリアイコン
**提出**: App Store Connect → アプリ → **App Store** タブ → メタデータ・スクリーンショットを確認 → **Build** を選択 → **Add for Review** → **Submit to App Review**

**アプリアイコン**: 1024 × 1024 px PNG(透明背景不可、白背景)、角の丸めはAppleが自動処理(自分で丸めるのは禁止)、Assets.xcassets → AppIconに追加。

**審査ノート(Review Notes)** — 特殊機能・ログインが必要な場合は必ず記載:
```
テストアカウント: test@example.com / password: Test1234!
このアプリは産業用IoTセンサー監視アプリで、実際のハードウェアなしでは
一部機能が制限されます。デモモードでも主要なUIをご確認いただけます。
```

**審査の所要**: 最初は1〜3営業日(通常24〜48時間)、再提出は同等/より速い、緊急審査は [developer.apple.com/contact/app-store](https://developer.apple.com/contact/app-store) でリクエスト。

## 3. よくある間違い (よくリジェクトされる理由 TOP 10)
| 理由 | 対処法 |
|------|--------|
| 1. アプリがクラッシュする | 提出前の実機テスト必須 |
| 2. ログインなしで機能を確認できない | 審査用デモアカウントを提供 |
| 3. 権限の説明が不十分 | Info.plistの説明を具体的に |
| 4. プライバシーポリシーURL未提供 | 必ず登録 |
| 5. スクリーンショットが実際のアプリと異なる | 実際のアプリ画面をキャプチャ |
| 6. アプリ内課金の回避(外部決済への誘導) | Apple IAPのみ使用 |
| 7. 未完成のUI(空画面・ボタン未動作) | 全体フローをテストしてから提出 |
| 8. アプリ名/アイコンがAppleブランドと類似 | Appleのロゴ/名前の使用禁止 |
| 9. Privacy Manifestの欠落 | PrivacyInfo.xcprivacyを追加 |
| 10. アプリの目的が不明確 | 審査ノートに詳細説明 |

## 4. チェックリスト
- [ ] Apple Developer Programの加入・有効化を終えたか
- [ ] Bundle ID・Distribution証明書・Provisioning Profileを作成したか
- [ ] Xcodeの署名設定とビルド番号の増加を確認したか
- [ ] Info.plistの権限説明を具体的に記載したか
- [ ] Privacy Manifest(`PrivacyInfo.xcprivacy`)を追加したか
- [ ] 実際のアプリ画面スクリーンショット・プライバシーポリシーURLを登録したか
- [ ] 審査用デモアカウント・審査ノートを記載したか
