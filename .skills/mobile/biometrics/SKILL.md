---
name: 생체 인증 (Biometrics)
description: 지문·페이스ID 생체 인증, 보안 키 저장소, 폴백 처리 표준. 모바일에서 생체 인증을 붙이거나 토큰·키를 Keychain/Keystore로 보호할 때 읽는다. 키워드: biometric, fingerprint, face-id, keychain, keystore, secure-enclave, BiometricPrompt, LocalAuthentication.
rules:
  - "생체 인증은 BiometricPrompt(Android)·LocalAuthentication(iOS) 의 OS 표준 API를 사용하고 자체 구현하지 않는다."
  - "생체 데이터는 절대 앱·서버로 전송하지 않는다 — OS의 Secure Enclave·TEE에만 머무르고 앱은 성공/실패 결과만 받는다."
  - "민감 자격 증명(토큰·키)은 Keychain(iOS)·Keystore(Android) 에 저장하고, 생체 인증으로 접근을 보호한다."
  - "생체 인증 실패·미등록·하드웨어 부재 시 PIN·비밀번호 폴백을 반드시 제공한다."
  - "생체 등록 변경(지문 추가 등) 시 저장된 키를 무효화하는 정책(invalidatedByBiometricEnrollment / .biometryCurrentSet)을 적용한다."
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

# 🔏 생체 인증 (Biometrics)

> 생체 데이터는 OS의 보안 영역에만 두고 앱은 성공/실패 결과만 받는다. 모바일에 지문·페이스ID를 붙이거나 민감 자격 증명을 생체로 보호할 때 읽는다.

## 1. 핵심 원칙
- 생체 인증은 **BiometricPrompt(Android)·LocalAuthentication(iOS)** 의 OS 표준 API를 사용하고 자체 구현하지 않는다.
- 생체 데이터는 절대 앱·서버로 전송하지 않는다 — OS의 **Secure Enclave·TEE**에만 머무르고 앱은 성공/실패 결과만 받는다.
- 민감 자격 증명(토큰·키)은 **Keychain(iOS)·Keystore(Android)** 에 저장하고, 생체 인증으로 접근을 보호한다.
- 생체 인증 실패·미등록·하드웨어 부재 시 **PIN·비밀번호 폴백**을 반드시 제공한다.
- 생체 등록 변경(지문 추가 등) 시 저장된 키를 무효화하는 정책(`invalidatedByBiometricEnrollment` / `.biometryCurrentSet`)을 적용한다.

## 2. 규칙

### 2-1. 아키텍처 — 생체 데이터는 OS에만
```
생체 데이터(지문·얼굴) → OS Secure Enclave/TEE 에만 존재
앱은 "인증 성공/실패" 결과만 수신 → 생체 raw 데이터 접근 불가
```

### 2-2. Android — BiometricPrompt
```kotlin
val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("로그인")
    .setSubtitle("지문으로 인증하세요")
    .setNegativeButtonText("비밀번호 사용")  // 폴백
    .build()

biometricPrompt.authenticate(promptInfo)
// onAuthenticationSucceeded → Keystore 키로 토큰 복호화
```

### 2-3. iOS — LocalAuthentication
```swift
let context = LAContext()
context.localizedFallbackTitle = "비밀번호 사용"  // 폴백
context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
    localizedReason: "로그인 인증") { success, error in
    if success { /* Keychain 토큰 접근 */ }
}
```

### 2-4. 보안 저장소 + 생체 보호
```swift
// iOS Keychain — 생체 인증 필요 접근 제어
let access = SecAccessControlCreateWithFlags(
    nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    .biometryCurrentSet,   // 생체 변경 시 무효화
    nil)
```

### 2-5. 폴백 체인
```
생체 인증 시도
  → 성공: 진입
  → 실패(인식 안 됨): 재시도
  → 하드웨어 없음/미등록: PIN·비밀번호 화면
  → 잠김(여러 번 실패): 기기 암호 요구
```

## 3. 흔한 실수
- ❌ 생체 인증을 자체 구현 → OS 표준 API(BiometricPrompt/LocalAuthentication)를 써야 한다.
- ❌ 생체 raw 데이터를 앱·서버로 전송 → 앱은 성공/실패 결과만 받아야 한다.
- ❌ 폴백 미제공 → 하드웨어 부재·미등록·잠김 시 진입 불가.
- ❌ 생체 변경 무효화 정책 누락 → 지문 추가 후에도 기존 키로 접근 가능.

## 4. 체크리스트
- [ ] OS 표준 API(BiometricPrompt/LocalAuthentication)를 사용했는가
- [ ] 생체 raw 데이터를 앱·서버로 전송하지 않는가
- [ ] 토큰·키를 Keychain/Keystore에 저장하고 생체로 보호했는가
- [ ] PIN·비밀번호 폴백 체인을 제공했는가
- [ ] 생체 등록 변경 시 키 무효화 정책을 적용했는가
