---
name: iOS App Store Submission Guide (iOS App Store Submission)
description: Step-by-step deployment standard from joining the Apple Developer Program to passing App Store review. Read in order when releasing an iOS app for the first time, or when checking for certificate/provisioning/review-rejection pitfalls. Keywords: xcode, TestFlight, App Store Connect, archive, codesign, ExportOptions, Privacy Manifest, provisioning.
rules:
  - "Join the Apple Developer Program ($99/year, up to 48 hours to activate)."
  - "Register a unique Bundle ID — once registered, it cannot be changed."
  - "Create a Distribution certificate and Provisioning Profile for distribution (one certificate per team)."
  - "Verify signing settings and version/build numbers in Xcode — the build number must increase every time."
  - "Pre-check review-rejection pitfalls (permission rationale, privacy labels, Privacy Manifest)."
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

# 🍎 iOS App Store Submission Guide

> Proceed in order from Apple Developer registration to passing App Store review. Read this when deploying an iOS app for the first time or pre-checking rejection pitfalls.
>
> ⚠️ Apple rejects apps over a single small mistake. Follow the order from the start to avoid wasting time.

## 1. Core Principles
- Join the Apple Developer Program ($99/year, up to 48 hours to activate).
- Register a unique Bundle ID — once registered, it cannot be changed.
- Create a Distribution certificate and Provisioning Profile for distribution (one certificate per team).
- Verify signing settings and version/build numbers in Xcode — the build number must increase every time.
- Pre-check review-rejection pitfalls (permission rationale, privacy labels, Privacy Manifest).

## 2. Rules

### 2-1. Joining the Apple Developer Program ($99/year)
1. [developer.apple.com](https://developer.apple.com) → sign in to your account → **Enroll**
2. Choose Individual or Organization
   - Individual: published under your own name
   - Organization: requires a DUNS number, review takes 1–2 weeks
3. Pay $99 → **up to 48 hours to activate** (you must wait).

### 2-2. Registering a Bundle ID (the app's unique ID)
1. [developer.apple.com/account](https://developer.apple.com/account) → **Identifiers** → **+** → **App IDs** → **App**
2. Enter the Bundle ID in the format `com.companyname.appname` (e.g., `com.harness.digitaltwins`)
   - Once registered it **cannot be changed** → decide carefully.
3. Check the needed Capabilities: Push Notifications, Sign in with Apple, In-App Purchase → **Register**

### 2-3. Creating a Certificate
**Development Certificate** (development/device testing): Xcode → **Preferences** → **Accounts** → account → **Manage Certificates** → **+** → **Apple Development** (auto-generated, recommended).

**Distribution Certificate** (App Store submission):
1. **Keychain Access** → **Certificate Assistant** → **Request a Certificate from a Certificate Authority** → save `CertificateSigningRequest.certSigningRequest`
2. developer.apple.com → **Certificates** → **+** → **Apple Distribution** → upload the CSR → download
3. Double-click the `.cer` → it installs into Keychain automatically
> ⚠️ Only **one Distribution Certificate per team** is issued. If you already have one, use the existing one.

### 2-4. Creating a Provisioning Profile (for App Store distribution)
A file that ties together the certificate + Bundle ID + devices. Without it, installation/distribution is impossible.
1. developer.apple.com → **Profiles** → **+** → **App Store Connect**
2. Select the Bundle ID (2-2) → select the Distribution Certificate (2-3)
3. Enter a name (e.g., `Harness_AppStore`) → **Generate** → download
4. Double-click the `.mobileprovision` → Xcode registers it automatically

### 2-5. Xcode Project Settings (Signing & Capabilities)
| Item | Value |
|------|--------|
| Team | Select your Apple Developer account |
| Bundle Identifier | Exactly match the Bundle ID registered in 2-2 |
| Automatically manage signing | Uncheck (manual management recommended) |
| Provisioning Profile | Select the Profile created in 2-4 |

**Info.plist permission descriptions (instant rejection if missing)**
```xml
<!-- ✅ Recommended — specify concretely why it's needed -->
<key>NSCameraUsageDescription</key>
<string>QR 코드 스캔을 위해 카메라 접근이 필요합니다.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>프로필 사진 설정을 위해 사진첩 접근이 필요합니다.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치 기반 서비스를 제공하기 위해 위치 정보가 필요합니다.</string>
```
> ⚠️ If the description is missing or vague, it is **instantly rejected**.

### 2-6. Registering the App in App Store Connect
1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**
2. Enter: **Platforms** (iOS), **Name** (30 characters or fewer), **Primary Language** (Korean), **Bundle ID** (2-2), **SKU** (e.g., `harness-ios-001`) → **Create**

### 2-7. App Metadata (frequently rejected areas)
**Required screenshot specs**
| Device | Resolution | Required |
|------|--------|-----------|
| iPhone 6.7" (15 Pro Max) | 1290 × 2796 | **Required** |
| iPhone 6.5" (14 Plus) | 1284 × 2778 | Recommended |
| iPad Pro 12.9" | 2048 × 2732 | Required if iPad is supported |

- Minimum 1 to maximum 10 screenshots, must be **actual app screens** (marketing text alone is not allowed).
- App description: the first 3 lines matter most. Keywords go in a separate **Keywords** field (within 100 characters); do not duplicate them in the description.
- Do not mention competitor app names (e.g., "faster than KakaoTalk" → rejection).
- A **privacy policy URL** is required — an externally accessible URL (GitHub Pages / Notion OK), specifying the data collected.

### 2-8. Writing the Privacy Manifest (required since 2024)
Without it, the upload itself is rejected. Xcode → **File** → **New File** → **Privacy Manifest** → `PrivacyInfo.xcprivacy`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key><false/>  <!-- false if you don't do ad tracking -->
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

### 2-9. Build Archive & Upload
```
Xcode device selection → "Any iOS Device (arm64)" → Product menu → Archive
```
After the archive completes, **Organizer** → select the archive → **Distribute App** → **App Store Connect** → **Upload**
- ✅ Include bitcode (recommended), ✅ Upload symbols (for crash analysis) → **Upload** (takes 5–15 minutes)
> ⚠️ The build number must be increased every time. The version (1.0.0) can stay the same, but the build number (1, 2, 3…) must always increase.

### 2-10. TestFlight Beta Testing (optional, recommended)
App Store Connect → **TestFlight** → select build → **+** → add testers
- Internal testers (team members): up to 100, deployed immediately.
- External testers: up to 10,000, require Apple review (1–2 days).

### 2-11. Submitting for Review & App Icon
**Submit**: App Store Connect → app → **App Store** tab → verify metadata/screenshots → select **Build** → **Add for Review** → **Submit to App Review**

**App icon**: 1024 × 1024 px PNG (no transparent background, white background), corner rounding is handled automatically by Apple (do not round it yourself), Assets.xcassets → add to AppIcon.

**Review Notes** — be sure to write these for special features / when login is required:
```
Test account: test@example.com / password: Test1234!
This app is an industrial IoT sensor monitoring app; some features are
limited without actual hardware. You can still check the main UI in demo mode.
```

**Review duration**: 1–3 business days initially (usually 24–48 hours), resubmission is the same or faster, expedited review can be requested at [developer.apple.com/contact/app-store](https://developer.apple.com/contact/app-store).

## 3. Common Mistakes (TOP 10 frequent rejection reasons)
| Reason | Remedy |
|------|--------|
| 1. App crashes | Real-device testing before submission is mandatory |
| 2. Features can't be verified without login | Provide a demo account for review |
| 3. Insufficient permission descriptions | Make Info.plist descriptions concrete |
| 4. No privacy policy URL provided | Be sure to register one |
| 5. Screenshots differ from the actual app | Capture actual app screens |
| 6. Bypassing in-app purchase (steering to external payment) | Use only Apple IAP |
| 7. Unfinished UI (blank screens / non-working buttons) | Test the whole flow before submission |
| 8. App name/icon similar to Apple's brand | Do not use Apple's logo/name |
| 9. Missing Privacy Manifest | Add PrivacyInfo.xcprivacy |
| 10. Unclear app purpose | Explain in detail in the review notes |

## 4. Checklist
- [ ] Did you complete Apple Developer Program enrollment and activation?
- [ ] Did you create the Bundle ID, Distribution certificate, and Provisioning Profile?
- [ ] Did you verify Xcode signing settings and that the build number increases?
- [ ] Did you write concrete Info.plist permission descriptions?
- [ ] Did you add the Privacy Manifest (`PrivacyInfo.xcprivacy`)?
- [ ] Did you register actual app-screen screenshots and a privacy policy URL?
- [ ] Did you write a demo account and review notes for review?
