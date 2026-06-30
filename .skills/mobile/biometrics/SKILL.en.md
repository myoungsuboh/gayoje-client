---
name: Biometric Authentication (Biometrics)
description: A standard for fingerprint·Face ID biometric authentication, secure key storage, and fallback handling. Read when adding biometric authentication on mobile or protecting tokens·keys with Keychain/Keystore. Keywords: biometric, fingerprint, face-id, keychain, keystore, secure-enclave, BiometricPrompt, LocalAuthentication.
rules:
  - "Use the OS standard APIs of BiometricPrompt(Android)·LocalAuthentication(iOS) for biometric authentication and do not roll your own."
  - "Never transmit biometric data to the app·server — it stays only in the OS's Secure Enclave·TEE, and the app receives only the success/failure result."
  - "Store sensitive credentials (tokens·keys) in Keychain(iOS)·Keystore(Android), and protect access with biometric authentication."
  - "Always provide a PIN·password fallback for biometric failure·non-enrollment·absent hardware."
  - "Apply a policy that invalidates stored keys when biometric enrollment changes (e.g. adding a fingerprint) (invalidatedByBiometricEnrollment / .biometryCurrentSet)."
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

# 🔏 Biometric Authentication (Biometrics)

> Biometric data stays only in the OS's secure region and the app receives only the success/failure result. Read when adding fingerprint·Face ID on mobile or protecting sensitive credentials with biometrics.

## 1. Core Principles
- Use the OS standard APIs of **BiometricPrompt(Android)·LocalAuthentication(iOS)** for biometric authentication and do not roll your own.
- Never transmit biometric data to the app·server — it stays only in the OS's **Secure Enclave·TEE**, and the app receives only the success/failure result.
- Store sensitive credentials (tokens·keys) in **Keychain(iOS)·Keystore(Android)**, and protect access with biometric authentication.
- Always provide a **PIN·password fallback** for biometric failure·non-enrollment·absent hardware.
- Apply a policy that invalidates stored keys when biometric enrollment changes (e.g. adding a fingerprint) (`invalidatedByBiometricEnrollment` / `.biometryCurrentSet`).

## 2. Rules

### 2-1. Architecture — Biometric Data Stays in the OS Only
```
Biometric data (fingerprint·face) → exists only in the OS Secure Enclave/TEE
The app receives only the "auth success/failure" result → cannot access raw biometric data
```

### 2-2. Android — BiometricPrompt
```kotlin
val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("로그인")
    .setSubtitle("지문으로 인증하세요")
    .setNegativeButtonText("비밀번호 사용")  // fallback
    .build()

biometricPrompt.authenticate(promptInfo)
// onAuthenticationSucceeded → decrypt token with the Keystore key
```

### 2-3. iOS — LocalAuthentication
```swift
let context = LAContext()
context.localizedFallbackTitle = "비밀번호 사용"  // fallback
context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
    localizedReason: "로그인 인증") { success, error in
    if success { /* access the Keychain token */ }
}
```

### 2-4. Secure Storage + Biometric Protection
```swift
// iOS Keychain — access control requiring biometric authentication
let access = SecAccessControlCreateWithFlags(
    nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    .biometryCurrentSet,   // invalidate on biometric change
    nil)
```

### 2-5. Fallback Chain
```
Attempt biometric authentication
  → success: enter
  → failure (not recognized): retry
  → no hardware/not enrolled: PIN·password screen
  → locked (multiple failures): require device passcode
```

## 3. Common Mistakes
- ❌ Rolling your own biometric authentication → you must use the OS standard API (BiometricPrompt/LocalAuthentication).
- ❌ Transmitting raw biometric data to the app·server → the app must receive only the success/failure result.
- ❌ No fallback → cannot enter when hardware is absent·not enrolled·locked.
- ❌ Missing the biometric-change invalidation policy → existing keys remain accessible even after a fingerprint is added.

## 4. Checklist
- [ ] Did you use the OS standard API (BiometricPrompt/LocalAuthentication)?
- [ ] Is raw biometric data not transmitted to the app·server?
- [ ] Are tokens·keys stored in Keychain/Keystore and protected by biometrics?
- [ ] Is a PIN·password fallback chain provided?
- [ ] Is a key invalidation policy applied on biometric enrollment change?
