---
name: クラッシュレポート & モニタリング (Crash Reporting)
description: モバイルのクラッシュ収集・シンボリケーション・ANR追跡・安定性指標モニタリングの標準。クラッシュレポートSDKを統合する、またはリリースの安定性基準・アラートを定める際に読む。キーワード: crash, Crashlytics, Sentry, ANR, symbolication, dSYM, breadcrumb, stability, crash-free.
rules:
  - "Crashlytics・SentryなどのクラッシュレポートSDKを統合し、リリースごとにdSYM・mappingファイルをアップロードしてシンボリケーションを保証する。"
  - "クラッシュフリーユーザー比率(Crash-free users)を中核の安定性指標としてモニタリングし、リリース基準(例: 99.5%)を設定する。"
  - "Android ANR(Application Not Responding)とiOS Hangを個別に追跡し、UIスレッドのブロッキングを検出する。"
  - "クラッシュにユーザーコンテキスト(画面・アクションbreadcrumb・端末情報)を添付するが、PIIはマスキングする。"
  - "致命的なクラッシュにはアラート(Slack・PagerDuty)を設定し、新規リリースのクラッシュ急増を自動検出する。"
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

# 💥 クラッシュレポート & モニタリング

> クラッシュを収集・シンボリケーションし、安定性指標でリリースを監視する。クラッシュSDKを組み込む、またはANR・安定性基準・アラートを定める際に読む。

## 1. 中核原則
- **Crashlytics・Sentry**などのクラッシュレポートSDKを統合し、リリースごとに**dSYM・mappingファイルをアップロード**してシンボリケーションを保証する。
- **クラッシュフリーユーザー比率(Crash-free users)**を中核の安定性指標としてモニタリングし、リリース基準(例: 99.5%)を設定する。
- Android **ANR**(Application Not Responding)とiOS **Hang**を個別に追跡し、UIスレッドのブロッキングを検出する。
- クラッシュにユーザーコンテキスト(画面・アクションbreadcrumb・端末情報)を添付するが、**PIIはマスキング**する。
- 致命的なクラッシュにはアラート(Slack・PagerDuty)を設定し、新規リリースのクラッシュ急増を自動検出する。

## 2. ルール

### 2-1. 中核の安定性指標
| 指標 | 目標 | 意味 |
|------|------|------|
| Crash-free users | ≥ 99.5% | クラッシュを経験していないユーザー比率 |
| Crash-free sessions | ≥ 99.9% | クラッシュのないセッション比率 |
| ANR rate (Android) | < 0.47% | Play Consoleの不良しきい値 |

### 2-2. シンボリケーション (必須)
```bash
# iOS — dSYM 업로드 (Fastlane)
upload_symbols_to_crashlytics(dsym_path: "./App.dSYM.zip")

# Android — mapping.txt 자동 업로드 (Gradle 플러그인)
# firebase-crashlytics-gradle 플러그인이 빌드 시 자동 처리
```

### 2-3. Breadcrumb + コンテキスト (Sentry の例)
```swift
SentrySDK.addBreadcrumb(Breadcrumb(level: .info, category: "ui",
    message: "장바구니 화면 진입"))

SentrySDK.configureScope { scope in
    scope.setTag(value: "premium", key: "user_tier")
    // ❌ PII 금지: 이메일·전화번호 첨부하지 않음
}
```

### 2-4. ANR 防止
```kotlin
// ❌ 금지 — 메인 스레드에서 디스크 I/O·네트워크 호출 (5초 이상 블로킹 시 ANR)
val data = File(path).readText()   // on main thread

// ✅ 권장 — 무거운 작업은 백그라운드 디스패치
withContext(Dispatchers.IO) { File(path).readText() }
```
チェック項目:
- [ ] メインスレッドでのディスクI/O・ネットワーク呼び出しを禁止する
- [ ] 重い処理はバックグラウンドにディスパッチする(coroutine・GCD)
- [ ] StrictMode(Android)を開発ビルドで有効化する
- [ ] メインスレッドを5秒以上ブロックするとANRが発生することを認識する

### 2-5. リリースモニタリング
```
신규 릴리스 배포 → 크래시 프리 비율 실시간 추적
  → 임계값 하락 시 알림 → 단계적 출시(staged rollout) 중단
```

## 3. よくある失敗
- ❌ dSYM・mapping未アップロード → スタックトレースが難読化され原因追跡が不可能。
- ❌ クラッシュにメール・電話番号などPIIを添付 → 個人情報の漏えい。
- ❌ ANR/Hang未追跡 → UIの停止がクラッシュ指標に反映されない。
- ❌ リリース後のクラッシュ急増を手動確認 → 自動アラート・ロールバック基準がないと対応が遅れる。

## 4. チェックリスト
- [ ] クラッシュレポートSDKを統合したか
- [ ] リリースごとにdSYM・mappingファイルをアップロードしたか
- [ ] Crash-free users/sessions基準を設定しモニタリングしているか
- [ ] ANR・Hangを個別に追跡しているか
- [ ] breadcrumb・端末情報を添付しつつPIIをマスキングしたか
- [ ] 致命的なクラッシュ・リリース急増のアラートを設定したか
