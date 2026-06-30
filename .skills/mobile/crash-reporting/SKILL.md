---
name: 크래시 리포팅 & 모니터링 (Crash Reporting)
description: 모바일 크래시 수집·심볼리케이션·ANR 추적·안정성 지표 모니터링 표준. 크래시 리포팅 SDK를 통합하거나 릴리스 안정성 기준·알림을 정할 때 읽는다. 키워드: crash, Crashlytics, Sentry, ANR, symbolication, dSYM, breadcrumb, stability, crash-free.
rules:
  - "Crashlytics·Sentry 등 크래시 리포팅 SDK를 통합하고, 릴리스마다 dSYM·mapping 파일을 업로드해 심볼리케이션을 보장한다."
  - "크래시 프리 사용자 비율(Crash-free users) 을 핵심 안정성 지표로 모니터링하고 릴리스 기준(예: 99.5%)을 설정한다."
  - "Android ANR(Application Not Responding)과 iOS Hang을 별도 추적해 UI 스레드 블로킹을 감지한다."
  - "크래시에 사용자 컨텍스트(화면·액션 breadcrumb·기기 정보)를 첨부하되 PII는 마스킹한다."
  - "치명적 크래시는 알림(Slack·PagerDuty)을 설정하고, 신규 릴리스의 크래시 급증을 자동 감지한다."
tags:
  - "crash"
  - "Crashlytics"
  - "Sentry"
  - "ANR"
  - "symbolication"
  - "dSYM"
  - "breadcrumb"
  - "stability"
  - "crash-free"
  - "crashlytics"
  - "sentry"
  - "anr"
  - "dsym"
---

# 💥 크래시 리포팅 & 모니터링

> 크래시를 수집·심볼리케이션하고 안정성 지표로 릴리스를 감시한다. 크래시 SDK를 붙이거나 ANR·안정성 기준·알림을 정할 때 읽는다.

## 1. 핵심 원칙
- **Crashlytics·Sentry** 등 크래시 리포팅 SDK를 통합하고, 릴리스마다 **dSYM·mapping 파일을 업로드**해 심볼리케이션을 보장한다.
- **크래시 프리 사용자 비율(Crash-free users)** 을 핵심 안정성 지표로 모니터링하고 릴리스 기준(예: 99.5%)을 설정한다.
- Android **ANR**(Application Not Responding)과 iOS **Hang**을 별도 추적해 UI 스레드 블로킹을 감지한다.
- 크래시에 사용자 컨텍스트(화면·액션 breadcrumb·기기 정보)를 첨부하되 **PII는 마스킹**한다.
- 치명적 크래시는 알림(Slack·PagerDuty)을 설정하고, 신규 릴리스의 크래시 급증을 자동 감지한다.

## 2. 규칙

### 2-1. 핵심 안정성 지표
| 지표 | 목표 | 의미 |
|------|------|------|
| Crash-free users | ≥ 99.5% | 크래시 미경험 사용자 비율 |
| Crash-free sessions | ≥ 99.9% | 크래시 없는 세션 비율 |
| ANR rate (Android) | < 0.47% | Play Console 나쁨 임계값 |

### 2-2. 심볼리케이션 (필수)
```bash
# iOS — dSYM 업로드 (Fastlane)
upload_symbols_to_crashlytics(dsym_path: "./App.dSYM.zip")

# Android — mapping.txt 자동 업로드 (Gradle 플러그인)
# firebase-crashlytics-gradle 플러그인이 빌드 시 자동 처리
```

### 2-3. Breadcrumb + 컨텍스트 (Sentry 예시)
```swift
SentrySDK.addBreadcrumb(Breadcrumb(level: .info, category: "ui",
    message: "장바구니 화면 진입"))

SentrySDK.configureScope { scope in
    scope.setTag(value: "premium", key: "user_tier")
    // ❌ PII 금지: 이메일·전화번호 첨부하지 않음
}
```

### 2-4. ANR 방지
```kotlin
// ❌ 금지 — 메인 스레드에서 디스크 I/O·네트워크 호출 (5초 이상 블로킹 시 ANR)
val data = File(path).readText()   // on main thread

// ✅ 권장 — 무거운 작업은 백그라운드 디스패치
withContext(Dispatchers.IO) { File(path).readText() }
```
점검 항목:
- [ ] 메인 스레드에서 디스크 I/O·네트워크 호출 금지
- [ ] 무거운 작업은 백그라운드 디스패치 (coroutine·GCD)
- [ ] StrictMode(Android) 개발 빌드 활성화
- [ ] 5초 이상 메인 스레드 블로킹 시 ANR 발생 인지

### 2-5. 릴리스 모니터링
```
신규 릴리스 배포 → 크래시 프리 비율 실시간 추적
  → 임계값 하락 시 알림 → 단계적 출시(staged rollout) 중단
```

## 3. 흔한 실수
- ❌ dSYM·mapping 미업로드 → 스택트레이스가 난독화되어 원인 추적 불가.
- ❌ 크래시에 이메일·전화번호 등 PII 첨부 → 개인정보 노출.
- ❌ ANR/Hang 미추적 → UI 멈춤이 크래시 지표에 안 잡힘.
- ❌ 릴리스 후 크래시 급증을 수동 확인 → 자동 알림·롤백 기준이 없으면 대응 지연.

## 4. 체크리스트
- [ ] 크래시 리포팅 SDK를 통합했는가
- [ ] 릴리스마다 dSYM·mapping 파일을 업로드했는가
- [ ] Crash-free users/sessions 기준을 설정하고 모니터링하는가
- [ ] ANR·Hang을 별도 추적하는가
- [ ] breadcrumb·기기 정보를 첨부하되 PII를 마스킹했는가
- [ ] 치명적 크래시·릴리스 급증 알림을 설정했는가
