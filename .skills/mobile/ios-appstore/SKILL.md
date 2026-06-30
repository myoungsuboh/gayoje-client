---
name: iOS App Store 등록 가이드 (iOS App Store Submission)
description: Apple Developer 가입부터 App Store 심사 통과까지 단계별 배포 표준. iOS 앱을 처음 출시하거나 인증서·프로비저닝·심사 리젝 함정을 점검할 때 순서대로 읽는다. 키워드: xcode, TestFlight, App Store Connect, archive, codesign, ExportOptions, Privacy Manifest, provisioning.
rules:
  - "Apple Developer Program에 가입한다(연 $99, 활성화까지 최대 48시간)."
  - "고유 Bundle ID를 등록한다 — 한번 등록하면 변경 불가."
  - "배포용 Distribution 인증서와 Provisioning Profile을 생성한다(인증서는 팀당 1개)."
  - "Xcode에서 서명 설정과 버전·빌드 번호를 확인한다 — 빌드 번호는 매번 증가."
  - "심사 리젝 함정(권한 사유·개인정보 라벨·Privacy Manifest)을 사전 점검한다."
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

# 🍎 iOS App Store 등록 가이드

> Apple Developer 등록부터 App Store 심사 통과까지 순서대로 진행한다. iOS 앱을 처음 배포하거나 리젝 함정을 사전 점검할 때 읽는다.
>
> ⚠️ Apple은 작은 실수 하나로 앱을 리젝(Reject)한다. 처음부터 순서대로 따라가야 시간 낭비가 없다.

## 1. 핵심 원칙
- Apple Developer Program에 가입한다(연 $99, 활성화까지 최대 48시간).
- 고유 Bundle ID를 등록한다 — 한번 등록하면 변경 불가.
- 배포용 Distribution 인증서와 Provisioning Profile을 생성한다(인증서는 팀당 1개).
- Xcode에서 서명 설정과 버전·빌드 번호를 확인한다 — 빌드 번호는 매번 증가.
- 심사 리젝 함정(권한 사유·개인정보 라벨·Privacy Manifest)을 사전 점검한다.

## 2. 규칙

### 2-1. Apple Developer Program 가입 (연 $99)
1. [developer.apple.com](https://developer.apple.com) → 계정 로그인 → **Enroll**
2. 개인(Individual) 또는 회사(Organization) 선택
   - 개인: 본인 이름으로 게시됨
   - 회사: DUNS 번호 필요, 심사 1~2주 소요
3. $99 결제 → **활성화까지 최대 48시간 소요**(기다려야 함).

### 2-2. Bundle ID 등록 (앱의 고유 ID)
1. [developer.apple.com/account](https://developer.apple.com/account) → **Identifiers** → **+** → **App IDs** → **App**
2. Bundle ID 입력: `com.회사명.앱이름` 형식 (예: `com.harness.digitaltwins`)
   - 한번 등록하면 **변경 불가** → 신중하게 결정.
3. 필요한 Capabilities 체크: Push Notifications, Sign in with Apple, In-App Purchase → **Register**

### 2-3. 인증서(Certificate) 생성
**Development Certificate** (개발/기기 테스트): Xcode → **Preferences** → **Accounts** → 계정 → **Manage Certificates** → **+** → **Apple Development** (자동 생성, 권장).

**Distribution Certificate** (App Store 제출):
1. **키체인 접근** → **인증서 지원** → **인증 기관에서 인증서 요청** → `CertificateSigningRequest.certSigningRequest` 저장
2. developer.apple.com → **Certificates** → **+** → **Apple Distribution** → CSR 업로드 → 다운로드
3. `.cer` 더블클릭 → 키체인 자동 설치
> ⚠️ Distribution Certificate는 **팀당 1개**만 발급. 이미 있으면 기존 것 사용.

### 2-4. Provisioning Profile 생성 (App Store 배포용)
인증서 + Bundle ID + 기기를 묶는 파일. 없으면 설치/배포 불가.
1. developer.apple.com → **Profiles** → **+** → **App Store Connect**
2. Bundle ID 선택(2-2) → Distribution Certificate 선택(2-3)
3. 이름 입력(예: `Harness_AppStore`) → **Generate** → 다운로드
4. `.mobileprovision` 더블클릭 → Xcode 자동 등록

### 2-5. Xcode 프로젝트 설정 (Signing & Capabilities)
| 항목 | 설정값 |
|------|--------|
| Team | Apple Developer 계정 선택 |
| Bundle Identifier | 2-2에서 등록한 Bundle ID와 정확히 일치 |
| Automatically manage signing | 체크 해제 (수동 관리 권장) |
| Provisioning Profile | 2-4에서 만든 Profile 선택 |

**Info.plist 권한 설명 (없으면 즉시 리젝)**
```xml
<!-- ✅ 권장 — 왜 필요한지 구체적으로 -->
<key>NSCameraUsageDescription</key>
<string>QR 코드 스캔을 위해 카메라 접근이 필요합니다.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>프로필 사진 설정을 위해 사진첩 접근이 필요합니다.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치 기반 서비스를 제공하기 위해 위치 정보가 필요합니다.</string>
```
> ⚠️ 설명이 없거나 모호하면 **즉시 리젝**.

### 2-6. App Store Connect 앱 등록
1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**
2. 입력: **Platforms**(iOS), **Name**(30자 이하), **Primary Language**(Korean), **Bundle ID**(2-2), **SKU**(예: `harness-ios-001`) → **Create**

### 2-7. 앱 메타데이터 (자주 리젝되는 부분)
**필수 스크린샷 규격**
| 기기 | 해상도 | 필수 여부 |
|------|--------|-----------|
| iPhone 6.7" (15 Pro Max) | 1290 × 2796 | **필수** |
| iPhone 6.5" (14 Plus) | 1284 × 2778 | 권장 |
| iPad Pro 12.9" | 2048 × 2732 | iPad 지원 시 필수 |

- 스크린샷 최소 1장~최대 10장, **실제 앱 화면**이어야 함(마케팅 텍스트만은 불가).
- 앱 설명: 첫 3줄이 가장 중요. 키워드는 별도 **Keywords** 필드(100자 이내), 설명 중복 입력 금지.
- 경쟁사 앱 이름 언급 금지(예: "카카오톡보다 빠른" → 리젝).
- **개인정보 처리방침 URL** 필수 — 외부 접근 가능 URL(GitHub Pages·Notion 가능), 수집 데이터 명시.

### 2-8. Privacy Manifest 작성 (2024년부터 필수)
없으면 업로드 자체가 거부된다. Xcode → **File** → **New File** → **Privacy Manifest** → `PrivacyInfo.xcprivacy`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key><false/>  <!-- 광고 추적 안 하면 false -->
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

### 2-9. 빌드 아카이브 & 업로드
```
Xcode 기기 선택 → "Any iOS Device (arm64)" → Product 메뉴 → Archive
```
Archive 완료 후 **Organizer** → Archive 선택 → **Distribute App** → **App Store Connect** → **Upload**
- ✅ Include bitcode(권장), ✅ Upload symbols(크래시 분석용) → **Upload** (5~15분 소요)
> ⚠️ 빌드 번호는 매번 올려야 한다. 버전(1.0.0)은 같아도 되지만 빌드 번호(1, 2, 3…)는 항상 증가.

### 2-10. TestFlight 베타 테스트 (선택, 권장)
App Store Connect → **TestFlight** → 빌드 선택 → **+** → 테스터 추가
- 내부 테스터(팀원): 최대 100명, 즉시 배포.
- 외부 테스터: 최대 10,000명, Apple 심사 필요(1~2일).

### 2-11. 심사 제출 & 앱 아이콘
**제출**: App Store Connect → 앱 → **App Store** 탭 → 메타데이터·스크린샷 확인 → **Build** 선택 → **Add for Review** → **Submit to App Review**

**앱 아이콘**: 1024 × 1024 px PNG(투명 배경 불가, 흰 배경), 모서리 둥글기는 Apple이 자동 처리(직접 둥글게 금지), Assets.xcassets → AppIcon 추가.

**심사 노트(Review Notes)** — 특수 기능·로그인 필요 시 반드시 작성:
```
테스트 계정: test@example.com / password: Test1234!
이 앱은 산업용 IoT 센서 모니터링 앱으로, 실제 하드웨어 없이는
일부 기능이 제한됩니다. 데모 모드로도 주요 UI를 확인하실 수 있습니다.
```

**심사 소요**: 최초 1~3 영업일(보통 24~48시간), 재제출은 동일/더 빠름, 긴급 심사는 [developer.apple.com/contact/app-store](https://developer.apple.com/contact/app-store)에서 요청.

## 3. 흔한 실수 (자주 리젝되는 사유 TOP 10)
| 사유 | 대처법 |
|------|--------|
| 1. 앱이 크래시됨 | 제출 전 실기기 테스트 필수 |
| 2. 로그인 없이 기능 확인 불가 | 심사용 데모 계정 제공 |
| 3. 권한 설명 불충분 | Info.plist 설명 구체적으로 |
| 4. 개인정보처리방침 URL 미제공 | 반드시 등록 |
| 5. 스크린샷이 실제 앱과 다름 | 실제 앱 화면 캡처 |
| 6. 인앱 결제 우회(외부 결제 유도) | Apple IAP만 사용 |
| 7. 미완성 UI(빈 화면·버튼 미작동) | 전체 플로우 테스트 후 제출 |
| 8. 앱 이름/아이콘이 Apple 브랜드와 유사 | 애플 로고/이름 사용 금지 |
| 9. Privacy Manifest 누락 | PrivacyInfo.xcprivacy 추가 |
| 10. 앱 목적 불명확 | 심사 노트에 상세 설명 |

## 4. 체크리스트
- [ ] Apple Developer Program 가입·활성화를 마쳤는가
- [ ] Bundle ID·Distribution 인증서·Provisioning Profile을 생성했는가
- [ ] Xcode 서명 설정과 빌드 번호 증가를 확인했는가
- [ ] Info.plist 권한 설명을 구체적으로 작성했는가
- [ ] Privacy Manifest(`PrivacyInfo.xcprivacy`)를 추가했는가
- [ ] 실제 앱 화면 스크린샷·개인정보 처리방침 URL을 등록했는가
- [ ] 심사용 데모 계정·심사 노트를 작성했는가
