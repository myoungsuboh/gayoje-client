---
name: 生物识别认证 (Biometrics)
description: 指纹·Face ID 生物识别认证、安全密钥存储、回退处理的标准。在移动端接入生物识别认证,或用 Keychain/Keystore 保护令牌·密钥时阅读。关键词: biometric, fingerprint, face-id, keychain, keystore, secure-enclave, BiometricPrompt, LocalAuthentication。
rules:
  - "生物识别认证使用 BiometricPrompt(Android)·LocalAuthentication(iOS) 的 OS 标准 API,不要自行实现。"
  - "绝不把生物识别数据传输到应用·服务器 — 它只停留在 OS 的 Secure Enclave·TEE 中,应用只接收成功/失败结果。"
  - "敏感凭据(令牌·密钥)存储在 Keychain(iOS)·Keystore(Android),并用生物识别认证保护访问。"
  - "在生物识别失败·未注册·硬件缺失时,必须提供 PIN·密码回退。"
  - "在生物识别注册变更(如新增指纹)时,应用使已存密钥失效的策略(invalidatedByBiometricEnrollment / .biometryCurrentSet)。"
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

# 🔏 生物识别认证 (Biometrics)

> 生物识别数据只留在 OS 的安全区域,应用只接收成功/失败结果。在移动端接入指纹·Face ID,或用生物识别保护敏感凭据时阅读。

## 1. 核心原则
- 生物识别认证使用 **BiometricPrompt(Android)·LocalAuthentication(iOS)** 的 OS 标准 API,不要自行实现。
- 绝不把生物识别数据传输到应用·服务器 — 它只停留在 OS 的 **Secure Enclave·TEE** 中,应用只接收成功/失败结果。
- 敏感凭据(令牌·密钥)存储在 **Keychain(iOS)·Keystore(Android)**,并用生物识别认证保护访问。
- 在生物识别失败·未注册·硬件缺失时,必须提供 **PIN·密码回退**。
- 在生物识别注册变更(如新增指纹)时,应用使已存密钥失效的策略(`invalidatedByBiometricEnrollment` / `.biometryCurrentSet`)。

## 2. 规则

### 2-1. 架构 — 生物识别数据只在 OS 内
```
生物识别数据(指纹·人脸) → 仅存在于 OS Secure Enclave/TEE
应用只接收"认证成功/失败"结果 → 无法访问生物识别 raw 数据
```

### 2-2. Android — BiometricPrompt
```kotlin
val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("로그인")
    .setSubtitle("지문으로 인증하세요")
    .setNegativeButtonText("비밀번호 사용")  // 回退
    .build()

biometricPrompt.authenticate(promptInfo)
// onAuthenticationSucceeded → 用 Keystore 密钥解密令牌
```

### 2-3. iOS — LocalAuthentication
```swift
let context = LAContext()
context.localizedFallbackTitle = "비밀번호 사용"  // 回退
context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
    localizedReason: "로그인 인증") { success, error in
    if success { /* 访问 Keychain 令牌 */ }
}
```

### 2-4. 安全存储 + 生物识别保护
```swift
// iOS Keychain — 需要生物识别认证的访问控制
let access = SecAccessControlCreateWithFlags(
    nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    .biometryCurrentSet,   // 生物识别变更时失效
    nil)
```

### 2-5. 回退链
```
尝试生物识别认证
  → 成功: 进入
  → 失败(未识别): 重试
  → 无硬件/未注册: PIN·密码界面
  → 锁定(多次失败): 要求设备密码
```

## 3. 常见错误
- ❌ 自行实现生物识别认证 → 必须使用 OS 标准 API(BiometricPrompt/LocalAuthentication)。
- ❌ 把生物识别 raw 数据传输到应用·服务器 → 应用只应接收成功/失败结果。
- ❌ 不提供回退 → 硬件缺失·未注册·锁定时无法进入。
- ❌ 缺失生物识别变更失效策略 → 新增指纹后仍可用旧密钥访问。

## 4. 检查清单
- [ ] 是否使用了 OS 标准 API(BiometricPrompt/LocalAuthentication)?
- [ ] 是否未把生物识别 raw 数据传输到应用·服务器?
- [ ] 是否把令牌·密钥存储在 Keychain/Keystore 并用生物识别保护?
- [ ] 是否提供了 PIN·密码回退链?
- [ ] 是否在生物识别注册变更时应用了密钥失效策略?
