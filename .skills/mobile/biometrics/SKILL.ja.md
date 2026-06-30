---
name: 生体認証 (Biometrics)
description: 指紋・Face ID 生体認証、セキュアな鍵ストレージ、フォールバック処理の標準。モバイルで生体認証を追加したり、トークン・鍵を Keychain/Keystore で保護するときに読む。キーワード: biometric, fingerprint, face-id, keychain, keystore, secure-enclave, BiometricPrompt, LocalAuthentication。
rules:
  - "生体認証は BiometricPrompt(Android)·LocalAuthentication(iOS) の OS 標準 API を使い、自前実装しない。"
  - "生体データは絶対にアプリ・サーバーへ送信しない — OS の Secure Enclave·TEE にのみ留まり、アプリは成功/失敗の結果だけを受け取る。"
  - "機密クレデンシャル(トークン・鍵)は Keychain(iOS)·Keystore(Android) に保存し、生体認証でアクセスを保護する。"
  - "生体認証の失敗・未登録・ハードウェア不在時には PIN・パスワードのフォールバックを必ず提供する。"
  - "生体登録の変更(指紋追加など)時に保存済みの鍵を無効化するポリシー(invalidatedByBiometricEnrollment / .biometryCurrentSet)を適用する。"
tags:
  - "biometric"
  - "fingerprint"
  - "face-id"
  - "keychain"
  - "keystore"
  - "secure-enclave"
  - "BiometricPrompt"
  - "LocalAuthentication"
  - "biometricprompt"
  - "localauthentication"
---

# 🔏 生体認証 (Biometrics)

> 生体データは OS のセキュア領域にのみ置き、アプリは成功/失敗の結果だけを受け取る。モバイルに指紋・Face ID を追加したり、機密クレデンシャルを生体で保護するときに読む。

## 1. 核心原則
- 生体認証は **BiometricPrompt(Android)·LocalAuthentication(iOS)** の OS 標準 API を使い、自前実装しない。
- 生体データは絶対にアプリ・サーバーへ送信しない — OS の **Secure Enclave·TEE** にのみ留まり、アプリは成功/失敗の結果だけを受け取る。
- 機密クレデンシャル(トークン・鍵)は **Keychain(iOS)·Keystore(Android)** に保存し、生体認証でアクセスを保護する。
- 生体認証の失敗・未登録・ハードウェア不在時には **PIN・パスワードのフォールバック**を必ず提供する。
- 生体登録の変更(指紋追加など)時に保存済みの鍵を無効化するポリシー(`invalidatedByBiometricEnrollment` / `.biometryCurrentSet`)を適用する。

## 2. ルール

### 2-1. アーキテクチャ — 生体データは OS のみに
```
生体データ(指紋・顔) → OS Secure Enclave/TEE にのみ存在
アプリは「認証成功/失敗」の結果だけを受信 → 生体 raw データへアクセス不可
```

### 2-2. Android — BiometricPrompt
```kotlin
val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("로그인")
    .setSubtitle("지문으로 인증하세요")
    .setNegativeButtonText("비밀번호 사용")  // フォールバック
    .build()

biometricPrompt.authenticate(promptInfo)
// onAuthenticationSucceeded → Keystore の鍵でトークンを復号
```

### 2-3. iOS — LocalAuthentication
```swift
let context = LAContext()
context.localizedFallbackTitle = "비밀번호 사용"  // フォールバック
context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
    localizedReason: "로그인 인증") { success, error in
    if success { /* Keychain トークンへアクセス */ }
}
```

### 2-4. セキュアストレージ + 生体保護
```swift
// iOS Keychain — 生体認証が必要なアクセス制御
let access = SecAccessControlCreateWithFlags(
    nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    .biometryCurrentSet,   // 生体変更時に無効化
    nil)
```

### 2-5. フォールバックチェーン
```
生体認証を試行
  → 成功: 進入
  → 失敗(認識されない): 再試行
  → ハードウェアなし/未登録: PIN・パスワード画面
  → ロック(複数回失敗): 端末パスコードを要求
```

## 3. よくあるミス
- ❌ 生体認証を自前実装 → OS 標準 API(BiometricPrompt/LocalAuthentication)を使うべき。
- ❌ 生体 raw データをアプリ・サーバーへ送信 → アプリは成功/失敗の結果だけを受け取るべき。
- ❌ フォールバック未提供 → ハードウェア不在・未登録・ロック時に進入不可。
- ❌ 生体変更の無効化ポリシー欠落 → 指紋追加後も既存の鍵でアクセス可能。

## 4. チェックリスト
- [ ] OS 標準 API(BiometricPrompt/LocalAuthentication)を使ったか
- [ ] 生体 raw データをアプリ・サーバーへ送信していないか
- [ ] トークン・鍵を Keychain/Keystore に保存し生体で保護したか
- [ ] PIN・パスワードのフォールバックチェーンを提供したか
- [ ] 生体登録の変更時に鍵の無効化ポリシーを適用したか
