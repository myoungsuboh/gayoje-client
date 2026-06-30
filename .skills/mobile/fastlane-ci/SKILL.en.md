---
name: Fastlane CI/CD
description: Standards for Fastlane-based mobile build, signing, and release automation. Read this when configuring beta/production release lanes or wiring code signing and store upload into CI. Keywords: fastlane, ci-cd, testflight, match, gym, supply, code-signing, app-distribution.
rules:
  - "Codify build, signing, screenshots, and release as Fastlane lanes, and avoid manual click-based deploys from Xcode/Android Studio."
  - "Share code signing certificates and provisioning across the team via match (iOS) from an encrypted git repository, and don't keep keys only on individual machines."
  - "Separate beta release lanes (TestFlight, Firebase App Distribution) from production release lanes, and trigger them from CI."
  - "Auto-increment version/build numbers in CI (increment_build_number) and link them to git tags."
  - "Inject store credentials (API keys, app passwords) via environment variables / secret managers and never commit them to the repository."
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

> Codify mobile build, signing, screenshots, and release as Fastlane lanes and automate them in CI. Read this when configuring beta/production releases or defining code signing and store upload.

## 1. Core Principles
- Codify build, signing, screenshots, and release as Fastlane lanes, and avoid manual click-based deploys from Xcode/Android Studio.
- Share code signing certificates and provisioning across the team via match (iOS) from an encrypted git repository, and don't keep keys only on individual machines.
- Separate beta release lanes (TestFlight, Firebase App Distribution) from production release lanes, and trigger them from CI.
- Auto-increment version/build numbers in CI (increment_build_number) and link them to git tags.
- Inject store credentials (API keys, app passwords) via environment variables / secret managers and never commit them to the repository.

## 2. Rules

### 2-1. Fastfile Structure (separate beta/production lanes)
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

### 2-2. Code Signing (match)
```ruby
# Matchfile — 암호화된 git 저장소에서 인증서 공유
git_url("git@github.com:org/certificates.git")
storage_mode("git")
type("appstore")
# 팀원: fastlane match appstore --readonly
```

### 2-3. CI Pipeline Integration (secret injection)
```yaml
# ❌ 금지 — 자격 증명을 Fastfile/저장소에 하드코딩
# ✅ 권장 — 환경 변수로 시크릿 주입 (저장소 커밋 금지)
env:
  MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
  APP_STORE_CONNECT_API_KEY: ${{ secrets.ASC_API_KEY }}
steps:
  - run: bundle exec fastlane ios beta
```

### 2-4. Release Tracks
| Track | Tool | Audience |
|------|------|------|
| Internal testing | Firebase App Distribution | QA team |
| Beta | TestFlight / Play Beta | External testers |
| Production | App Store / Play Production | General users |
| Staged rollout | staged rollout | Gradual rollout by percentage |

## 3. Common Mistakes
- Keeping certificates only on individual machines so teammates can't build → share via match.
- Mixing beta and production lanes and accidentally deploying to production → separate the lanes.
- Manually incrementing build numbers → auto-increment in CI.
- Committing credentials to the repository → inject via secret managers / environment variables.

## 4. Checklist
- [ ] Did you codify build, signing, and release as Fastlane lanes?
- [ ] Do you share certificates via match from an encrypted git repository?
- [ ] Did you separate beta and production lanes?
- [ ] Do you auto-increment version/build numbers in CI?
- [ ] Did you inject store credentials via environment variables / secrets (no commits)?
