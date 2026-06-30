---
name: Crash Reporting & Monitoring (Crash Reporting)
description: Standards for mobile crash collection, symbolication, ANR tracking, and stability metric monitoring. Read this when integrating a crash reporting SDK or defining release stability criteria and alerts. Keywords: crash, Crashlytics, Sentry, ANR, symbolication, dSYM, breadcrumb, stability, crash-free.
rules:
  - "Integrate a crash reporting SDK such as Crashlytics or Sentry, and upload dSYM/mapping files on every release to guarantee symbolication."
  - "Monitor the Crash-free users ratio as the core stability metric and set a release threshold (e.g., 99.5%)."
  - "Track Android ANR (Application Not Responding) and iOS Hang separately to detect UI thread blocking."
  - "Attach user context (screen, action breadcrumbs, device info) to crashes, but mask PII."
  - "Set up alerts (Slack, PagerDuty) for fatal crashes and automatically detect crash spikes in new releases."
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

# 💥 Crash Reporting & Monitoring

> Collect and symbolicate crashes, and monitor releases via stability metrics. Read this when wiring up a crash SDK or defining ANR, stability criteria, and alerts.

## 1. Core Principles
- Integrate a crash reporting SDK such as **Crashlytics or Sentry**, and **upload dSYM/mapping files** on every release to guarantee symbolication.
- Monitor the **Crash-free users ratio** as the core stability metric and set a release threshold (e.g., 99.5%).
- Track Android **ANR** (Application Not Responding) and iOS **Hang** separately to detect UI thread blocking.
- Attach user context (screen, action breadcrumbs, device info) to crashes, but **mask PII**.
- Set up alerts (Slack, PagerDuty) for fatal crashes and automatically detect crash spikes in new releases.

## 2. Rules

### 2-1. Core Stability Metrics
| Metric | Target | Meaning |
|------|------|------|
| Crash-free users | ≥ 99.5% | Ratio of users who experienced no crash |
| Crash-free sessions | ≥ 99.9% | Ratio of sessions without a crash |
| ANR rate (Android) | < 0.47% | Play Console "bad behavior" threshold |

### 2-2. Symbolication (required)
```bash
# iOS — upload dSYM (Fastlane)
upload_symbols_to_crashlytics(dsym_path: "./App.dSYM.zip")

# Android — auto-upload mapping.txt (Gradle plugin)
# The firebase-crashlytics-gradle plugin handles this automatically at build time
```

### 2-3. Breadcrumb + Context (Sentry example)
```swift
SentrySDK.addBreadcrumb(Breadcrumb(level: .info, category: "ui",
    message: "장바구니 화면 진입"))

SentrySDK.configureScope { scope in
    scope.setTag(value: "premium", key: "user_tier")
    // ❌ PII 금지: 이메일·전화번호 첨부하지 않음
}
```

### 2-4. Preventing ANR
```kotlin
// ❌ 금지 — 메인 스레드에서 디스크 I/O·네트워크 호출 (5초 이상 블로킹 시 ANR)
val data = File(path).readText()   // on main thread

// ✅ 권장 — 무거운 작업은 백그라운드 디스패치
withContext(Dispatchers.IO) { File(path).readText() }
```
Checklist:
- [ ] No disk I/O or network calls on the main thread
- [ ] Dispatch heavy work to the background (coroutine, GCD)
- [ ] Enable StrictMode (Android) in development builds
- [ ] Be aware that blocking the main thread for 5+ seconds triggers an ANR

### 2-5. Release Monitoring
```
Deploy new release → track crash-free ratio in real time
  → alert on threshold drop → halt staged rollout
```

## 3. Common Mistakes
- ❌ Not uploading dSYM/mapping → stack traces are obfuscated and the root cause can't be traced.
- ❌ Attaching PII such as email or phone number to crashes → personal data exposure.
- ❌ Not tracking ANR/Hang → UI freezes don't show up in crash metrics.
- ❌ Manually checking for crash spikes after release → without automated alerts and rollback criteria, response is delayed.

## 4. Checklist
- [ ] Did you integrate a crash reporting SDK?
- [ ] Did you upload dSYM/mapping files on every release?
- [ ] Do you set and monitor Crash-free users/sessions thresholds?
- [ ] Do you track ANR/Hang separately?
- [ ] Did you attach breadcrumbs and device info while masking PII?
- [ ] Did you set up alerts for fatal crashes and release spikes?
