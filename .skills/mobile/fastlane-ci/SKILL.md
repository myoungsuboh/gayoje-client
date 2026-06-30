---
name: Fastlane CI/CD
description: Fastlane 기반 모바일 빌드·서명·배포 자동화 표준. 베타·프로덕션 배포 lane을 구성하거나 코드 서명·스토어 업로드를 CI에 연동할 때 읽는다. 키워드: fastlane, ci-cd, testflight, match, gym, supply, code-signing, app-distribution.
rules:
  - "빌드·서명·스크린샷·배포를 Fastlane lane으로 코드화하고, 수동 Xcode·Android Studio 클릭 배포를 지양한다."
  - "코드 서명 인증서·프로비저닝은 match(iOS)로 암호화된 git 저장소에서 팀이 공유하고, 키를 개인 머신에만 두지 않는다."
  - "베타 배포(TestFlight·Firebase App Distribution)와 프로덕션 배포 lane을 분리하고, CI에서 트리거한다."
  - "버전·빌드 번호는 CI에서 자동 증가시키고(increment_build_number), git 태그와 연동한다."
  - "스토어 자격 증명(API 키·앱 암호)은 환경 변수·시크릿 매니저로 주입하고 저장소에 커밋하지 않는다."
tags:
  - "fastlane"
  - "ci-cd"
  - "testflight"
  - "match"
  - "gym"
  - "supply"
  - "code-signing"
  - "app-distribution"
---

# 🚀 Fastlane CI/CD

> 모바일 빌드·서명·스크린샷·배포를 Fastlane lane으로 코드화하고 CI에서 자동화한다. 베타·프로덕션 배포를 구성하거나 코드 서명·스토어 업로드를 정할 때 읽는다.

## 1. 핵심 원칙
- 빌드·서명·스크린샷·배포를 Fastlane lane으로 코드화하고, 수동 Xcode·Android Studio 클릭 배포를 지양한다.
- 코드 서명 인증서·프로비저닝은 match(iOS)로 암호화된 git 저장소에서 팀이 공유하고, 키를 개인 머신에만 두지 않는다.
- 베타 배포(TestFlight·Firebase App Distribution)와 프로덕션 배포 lane을 분리하고, CI에서 트리거한다.
- 버전·빌드 번호는 CI에서 자동 증가시키고(increment_build_number), git 태그와 연동한다.
- 스토어 자격 증명(API 키·앱 암호)은 환경 변수·시크릿 매니저로 주입하고 저장소에 커밋하지 않는다.

## 2. 규칙

### 2-1. Fastfile 구조 (베타·프로덕션 lane 분리)
```ruby
# fastlane/Fastfile
platform :ios do
  desc "베타 배포 (TestFlight)"
  lane :beta do
    match(type: "appstore", readonly: true)   # 인증서 동기화
    increment_build_number(xcodeproj: "App.xcodeproj")
    build_app(scheme: "App")                    # gym
    upload_to_testflight(skip_waiting_for_build_processing: true)
  end

  desc "프로덕션 배포"
  lane :release do
    match(type: "appstore", readonly: true)
    build_app(scheme: "App")
    upload_to_app_store(submit_for_review: true, automatic_release: true)
  end
end

platform :android do
  lane :beta do
    increment_version_code
    gradle(task: "bundleRelease")
    upload_to_play_store(track: "beta")         # supply
  end
end
```

### 2-2. 코드 서명 (match)
```ruby
# Matchfile — 암호화된 git 저장소에서 인증서 공유
git_url("git@github.com:org/certificates.git")
storage_mode("git")
type("appstore")
# 팀원: fastlane match appstore --readonly
```

### 2-3. CI 파이프라인 연동 (시크릿 주입)
```yaml
# ❌ 금지 — 자격 증명을 Fastfile/저장소에 하드코딩
# ✅ 권장 — 환경 변수로 시크릿 주입 (저장소 커밋 금지)
env:
  MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
  APP_STORE_CONNECT_API_KEY: ${{ secrets.ASC_API_KEY }}
steps:
  - run: bundle exec fastlane ios beta
```

### 2-4. 배포 트랙
| 트랙 | 도구 | 대상 |
|------|------|------|
| 내부 테스트 | Firebase App Distribution | QA 팀 |
| 베타 | TestFlight / Play Beta | 외부 테스터 |
| 프로덕션 | App Store / Play Production | 일반 사용자 |
| 단계적 출시 | staged rollout | %별 점진 배포 |

## 3. 흔한 실수
- 인증서를 개인 머신에만 두어 팀원이 빌드 못 함 → match로 공유한다.
- 베타와 프로덕션 lane을 섞어 실수로 프로덕션 배포 → lane을 분리한다.
- 빌드 번호를 수동 증가 → CI에서 자동 증가시킨다.
- 자격 증명을 저장소에 커밋 → 시크릿 매니저·환경 변수로 주입한다.

## 4. 체크리스트
- [ ] 빌드·서명·배포를 Fastlane lane으로 코드화했는가
- [ ] 인증서를 match로 암호화 git 저장소에서 공유하는가
- [ ] 베타·프로덕션 lane을 분리했는가
- [ ] 버전·빌드 번호를 CI에서 자동 증가시키는가
- [ ] 스토어 자격 증명을 환경 변수·시크릿으로 주입했는가 (커밋 금지)
