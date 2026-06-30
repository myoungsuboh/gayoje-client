---
name: Android Google Play Store 등록 가이드
description: Google Play Console을 통한 Android 앱 등록·서명·출시 단계별 가이드. 앱을 처음 스토어에 올리거나 새 버전을 배포할 때, 서명 키 생성·AAB 빌드·출시 트랙·심사 거부 대응을 정할 때 읽는다. 키워드: gradle, signing, keystore, R8, AAB, bundle, Play Console, minifyEnabled, proguard, versionCode.
rules:
  - "Play Console에 개발자 등록($25, 1회)을 먼저 완료한다."
  - "릴리즈 서명 키(Keystore)를 생성하고 안전하게 백업한다 — 분실 시 앱 업데이트가 영구 불가능."
  - "배포 산출물은 APK가 아닌 AAB(Android App Bundle)로 빌드한다."
  - "스토어 등록 정보와 필수 에셋(아이콘·스크린샷)을 준비한다."
  - "내부 테스트 트랙으로 먼저 배포해 검증한다."
  - "버전 코드는 업로드마다 올리고, 버전 이름은 Semantic Versioning을 따른다."
tags:
  - "gradle"
  - "signing"
  - "keystore"
  - "R8"
  - "AAB"
  - "bundle"
  - "Play Console"
  - "minifyEnabled"
  - "proguard"
  - "versionCode"
---

# 📦 Android Google Play Store 등록 가이드

> Android 앱을 Play Store에 등록·서명·출시하는 전 과정을 정리한다. 앱을 처음 올리거나 새 버전을 배포할 때 단계별로 읽는다.

## 1. 핵심 원칙

- Play Console에 **개발자 등록($25, 1회)**을 먼저 완료한다.
- 릴리즈 **서명 키(Keystore)**를 생성하고 안전하게 백업한다 — 분실 시 앱 업데이트가 영구 불가능.
- 배포 산출물은 APK가 아닌 **AAB(Android App Bundle)**로 빌드한다.
- 스토어 등록 정보와 **필수 에셋(아이콘·스크린샷)**을 준비한다.
- **내부 테스트 트랙**으로 먼저 배포해 검증한다.
- 버전 코드는 업로드마다 올리고, 버전 이름은 Semantic Versioning을 따른다.

## 2. 규칙

### 2-1. Google Play Console 등록 ($25, 1회)

1. [play.google.com/console](https://play.google.com/console) 접속
2. 개발자 계정 등록 → **$25 일회성 등록비** 결제
3. 개인 정보 입력 → 활성화까지 **최대 48시간** 소요
4. 개발자 이름 = Play Store에 표시되는 게시자 이름

### 2-2. 앱 서명 키(Keystore) 생성

앱 서명 키는 앱의 신원을 증명한다. **한번 생성하면 절대 잃어버리면 안 된다.** 잃어버리면 같은 앱을 업데이트할 수 없고 새 앱으로 재등록해야 한다.

Android Studio에서 생성:
```
Build 메뉴 → Generate Signed Bundle/APK
→ Android App Bundle (AAB 권장) 선택
→ Create new...
```

입력 항목:
- **Key store path**: 안전한 위치에 저장 (예: `~/keystores/harness.jks`)
- **Password**: 강력한 비밀번호 설정 (기억해야 함!)
- **Key alias**: 앱 이름 (예: `harness-key`)
- **Validity**: 25년 이상 설정 (Google 요구사항)
- **이름/조직/국가**: 입력

> ⚠️ Keystore 파일과 비밀번호를 **Git에 절대 올리지 말 것**. 분실 시 앱 업데이트가 영구 불가능해진다. 별도 안전 장소에 백업 필수.

`build.gradle`에 서명 설정:
```kotlin
// app/build.gradle.kts
android {
    signingConfigs {
        create("release") {
            storeFile = file("../keystores/harness.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") // 환경변수로 관리
            keyAlias = "harness-key"
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}
```

### 2-3. AAB 빌드 생성

Play Store는 APK 대신 **AAB(Android App Bundle)** 형식을 요구한다. AAB를 업로드하면 Google이 기기에 맞는 최적화된 APK를 자동으로 생성해준다.

```
Build 메뉴 → Generate Signed Bundle/APK
→ Android App Bundle 선택
→ Release 선택 → Next → Finish
```

또는 Gradle 명령어:
```bash
./gradlew bundleRelease
# 생성 위치: app/build/outputs/bundle/release/app-release.aab
```

### 2-4. Play Console에서 앱 생성

1. Play Console → **모든 앱** → **앱 만들기**
2. 입력 항목:
   - **앱 이름**: 최대 30자
   - **기본 언어**: 한국어
   - **앱 또는 게임**: 선택
   - **유료 또는 무료**: 선택 (무료 → 유료로 변경 불가)
3. **개발자 프로그램 정책** 및 **미국 수출법** 동의

### 2-5. 스토어 등록 정보 작성

필수 에셋:
| 항목 | 규격 | 필수 |
|------|------|------|
| 앱 아이콘 | 512 × 512 px, PNG, 1MB 이하 | 필수 |
| 그래픽 이미지 | 1024 × 500 px | 필수 |
| 스크린샷 (휴대전화) | 최소 2장, 16:9 또는 9:16 | 필수 |
| 스크린샷 (태블릿) | 7인치, 10인치 각각 | 태블릿 지원 시 |

앱 설명:
- **간단한 설명**: 80자 이하 (검색 시 표시)
- **자세한 설명**: 4000자 이하
- 경쟁사 언급, 오해를 유발하는 표현 금지

개인정보처리방침 URL:
- 앱이 어떤 데이터를 수집하는지 명시한 URL 필수
- 접근 가능한 외부 URL이어야 함

### 2-6. 앱 콘텐츠 설정 (필수, 놓치면 거부됨)

Play Console → **앱 콘텐츠** 섹션에서 아래 항목 모두 작성:

1. **개인정보처리방침**: URL 입력
2. **광고**: 광고 포함 여부 선택
3. **앱 액세스**: 로그인 필요 시 → 테스트 계정 제공
4. **콘텐츠 등급**: 설문 작성 → 등급 자동 산정 (PEGI, IARC)
5. **타겟 사용자층**: 연령대 설정
6. **뉴스 앱 여부**: 해당 시 체크
7. **COVID-19 관련 앱 여부**: 해당 시 체크

### 2-7. 출시 트랙 선택 및 AAB 업로드

출시 트랙 종류:
| 트랙 | 설명 | 추천 용도 |
|------|------|-----------|
| **내부 테스트** | 팀원 최대 100명, 즉시 배포 | 개발 중 테스트 |
| **비공개 테스트(알파)** | 초대한 사용자만, Google 심사 필요 | 베타 테스터 |
| **공개 테스트(베타)** | 누구나 참여 가능 | 출시 전 검증 |
| **프로덕션** | 전체 공개 | 정식 출시 |

업로드 순서:
1. **프로덕션** → **새 버전 만들기**
2. **Play 앱 서명** 동의 (권장 — Google이 서명 키 관리해줌)
3. AAB 파일 업로드
4. **버전 이름**: 사용자에게 보이는 버전 (예: `1.0.0`)
5. **버전 코드**: 내부 증가 번호, 업로드할 때마다 올려야 함
6. 출시 노트 작성 (업데이트 내용)
7. **검토를 위해 출시 저장** 클릭

### 2-8. 심사 및 출시

- 최초 심사: **1~3 영업일** 소요
- 재심사: 보통 더 빠름 (몇 시간 ~ 1일)

### 2-9. 버전 코드 & 버전 이름 관리

```kotlin
// app/build.gradle.kts
android {
    defaultConfig {
        versionCode = 5         // 업로드마다 +1 증가 (내부용, 사용자에게 안 보임)
        versionName = "1.2.0"   // 사용자에게 보이는 버전 (Semantic Versioning)
    }
}
```

**Semantic Versioning 규칙:**
- `1.0.0` → 최초 출시
- `1.0.1` → 버그 수정
- `1.1.0` → 새 기능 추가
- `2.0.0` → 대규모 변경

## 3. 흔한 실수 (자주 거부되는 사유)

| 사유 | 해결책 |
|------|--------|
| 앱이 크래시됨 | 실기기에서 충분히 테스트 후 제출 |
| 스토어 등록 정보 불완전 | 모든 필수 항목 채웠는지 확인 |
| 개인정보 정책 없음 | 접근 가능한 URL 등록 |
| 로그인 없이 앱 확인 불가 | 앱 액세스에 테스트 계정 입력 |
| 위험한 권한 사용 목적 불명확 | 권한 사용 이유 설명 추가 |
| 지식재산권 침해 (아이콘, 이름) | 고유한 브랜드 사용 |

## 4. 체크리스트

- [ ] Play Console 개발자 등록($25)을 완료했는가
- [ ] Keystore를 생성하고 Git이 아닌 안전한 곳에 백업했는가
- [ ] 산출물을 APK가 아닌 AAB로 빌드했는가
- [ ] 필수 에셋(아이콘 512×512, 그래픽 1024×500, 스크린샷 2장+)을 준비했는가
- [ ] 앱 콘텐츠(개인정보처리방침·콘텐츠 등급·앱 액세스 등)를 모두 작성했는가
- [ ] 내부 테스트 트랙으로 먼저 검증했는가
- [ ] versionCode를 올리고 versionName을 Semantic Versioning으로 설정했는가
