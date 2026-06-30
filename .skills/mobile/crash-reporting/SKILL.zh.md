---
name: 崩溃报告 & 监控 (Crash Reporting)
description: 移动端崩溃收集、符号化、ANR 跟踪、稳定性指标监控的标准。集成崩溃报告 SDK，或制定发版稳定性标准与告警时阅读。关键词: crash, Crashlytics, Sentry, ANR, symbolication, dSYM, breadcrumb, stability, crash-free.
rules:
  - "集成 Crashlytics、Sentry 等崩溃报告 SDK，并在每次发版时上传 dSYM、mapping 文件以保证符号化。"
  - "将崩溃无故障用户比例(Crash-free users)作为核心稳定性指标进行监控，并设定发版标准(例如 99.5%)。"
  - "分别跟踪 Android ANR(Application Not Responding)和 iOS Hang，以检测 UI 线程阻塞。"
  - "为崩溃附加用户上下文(界面、操作 breadcrumb、设备信息),但对 PII 进行脱敏。"
  - "为致命崩溃设置告警(Slack、PagerDuty),并自动检测新版本的崩溃激增。"
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

# 💥 崩溃报告 & 监控

> 收集并符号化崩溃，通过稳定性指标监控发版。接入崩溃 SDK，或制定 ANR、稳定性标准与告警时阅读。

## 1. 核心原则
- 集成 **Crashlytics、Sentry** 等崩溃报告 SDK，并在每次发版时**上传 dSYM、mapping 文件**以保证符号化。
- 将**崩溃无故障用户比例(Crash-free users)**作为核心稳定性指标进行监控，并设定发版标准(例如 99.5%)。
- 分别跟踪 Android **ANR**(Application Not Responding)和 iOS **Hang**，以检测 UI 线程阻塞。
- 为崩溃附加用户上下文(界面、操作 breadcrumb、设备信息),但对 **PII 进行脱敏**。
- 为致命崩溃设置告警(Slack、PagerDuty),并自动检测新版本的崩溃激增。

## 2. 规则

### 2-1. 核心稳定性指标
| 指标 | 目标 | 含义 |
|------|------|------|
| Crash-free users | ≥ 99.5% | 未经历崩溃的用户比例 |
| Crash-free sessions | ≥ 99.9% | 无崩溃的会话比例 |
| ANR rate (Android) | < 0.47% | Play Console 的不良阈值 |

### 2-2. 符号化 (必需)
```bash
# iOS — dSYM 업로드 (Fastlane)
upload_symbols_to_crashlytics(dsym_path: "./App.dSYM.zip")

# Android — mapping.txt 자동 업로드 (Gradle 플러그인)
# firebase-crashlytics-gradle 플러그인이 빌드 시 자동 처리
```

### 2-3. Breadcrumb + 上下文 (Sentry 示例)
```swift
SentrySDK.addBreadcrumb(Breadcrumb(level: .info, category: "ui",
    message: "장바구니 화면 진입"))

SentrySDK.configureScope { scope in
    scope.setTag(value: "premium", key: "user_tier")
    // ❌ PII 금지: 이메일·전화번호 첨부하지 않음
}
```

### 2-4. ANR 防范
```kotlin
// ❌ 금지 — 메인 스레드에서 디스크 I/O·네트워크 호출 (5초 이상 블로킹 시 ANR)
val data = File(path).readText()   // on main thread

// ✅ 권장 — 무거운 작업은 백그라운드 디스패치
withContext(Dispatchers.IO) { File(path).readText() }
```
检查项:
- [ ] 禁止在主线程上进行磁盘 I/O、网络调用
- [ ] 将繁重任务派发到后台(coroutine、GCD)
- [ ] 在开发构建中启用 StrictMode(Android)
- [ ] 知悉主线程阻塞 5 秒以上会触发 ANR

### 2-5. 发版监控
```
신규 릴리스 배포 → 크래시 프리 비율 실시간 추적
  → 임계값 하락 시 알림 → 단계적 출시(staged rollout) 중단
```

## 3. 常见错误
- ❌ 未上传 dSYM、mapping → 堆栈跟踪被混淆，无法追踪根因。
- ❌ 向崩溃附加邮箱、电话号码等 PII → 泄露个人信息。
- ❌ 未跟踪 ANR/Hang → UI 卡死不会体现在崩溃指标中。
- ❌ 发版后手动检查崩溃激增 → 没有自动告警与回滚标准会导致响应延迟。

## 4. 检查清单
- [ ] 是否集成了崩溃报告 SDK
- [ ] 是否在每次发版时上传了 dSYM、mapping 文件
- [ ] 是否设定并监控 Crash-free users/sessions 标准
- [ ] 是否分别跟踪 ANR、Hang
- [ ] 是否在附加 breadcrumb、设备信息的同时对 PII 进行了脱敏
- [ ] 是否设置了致命崩溃、发版激增的告警
