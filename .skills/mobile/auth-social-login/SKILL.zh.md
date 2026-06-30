---
name: 移动端社交登录 (Social Login)
description: 在 iOS/Android 上一致地实现 Sign in with Apple·Google Sign-In·Kakao 登录的标准。在统一 ID 令牌 → 后端验证 → 兑换自有 JWT 的流程和 URL scheme 配置时阅读。关键词: social login, GoogleSignIn, AppleIDProvider, oauth, FirebaseAuth, AuthCredential, IdToken, Credential Manager, Kakao。
rules:
  - "社交登录接收 Provider 的 ID 令牌并在后端做签名验证 — 把供应商令牌直接用于我们的 API 认证会破坏安全性·过期·刷新。"
  - "验证后兑换为自有 JWT(access + refresh)来管理应用会话。"
  - "把 Apple·Google·Kakao 登录抽象为统一流程(与 Provider 无关)。"
  - "按平台分别注册 URL scheme 与重定向配置。"
  - "Android 上的 Apple 登录没有原生 SDK,需经由 Firebase Auth。"
tags:
  - "social login"
  - "GoogleSignIn"
  - "AppleIDProvider"
  - "oauth"
  - "FirebaseAuth"
  - "AuthCredential"
  - "IdToken"
  - "Credential Manager"
  - "카카오"
---

# 🔐 移动端社交登录

> 由我们的后端验证供应商 ID 令牌并签发我们的 JWT。在新接入社交登录或确定 Apple/Google/Kakao 流程·URL scheme 时阅读。

## 1. 核心原则
- 社交登录接收 Provider 的 ID 令牌并在**后端做签名验证** — 把供应商令牌直接用于我们的 API 认证会破坏安全性·过期·刷新。
- 验证后**兑换为自有 JWT(access + refresh)**来管理应用会话。
- 把 Apple·Google·Kakao 登录抽象为**统一流程**(与 Provider 无关)。
- 按平台分别注册 URL scheme 与重定向配置。
- Android 上的 Apple 登录没有原生 SDK,需**经由 Firebase Auth**。

## 2. 规则

### 2-1. 统一流程(与 Provider 无关)
```
[用户点按社交按钮]
        ↓
[Provider SDK 登录 → 获取 ID 令牌 / authorization code]
        ↓
[调用后端 /auth/social — 发送 { provider, idToken }]
        ↓
[后端: 用供应商公钥验证 ID 令牌签名 → 匹配/创建用户]
        ↓
[响应自有 JWT (access + refresh)]
        ↓
[客户端: 存入 TokenStore → 后续用于 API 认证]
```
> 自有 JWT 的保存·刷新直接沿用 networking-api 技能的 TokenStore 模式(自动附加认证令牌 + 刷新)。

### 2-2. Provider 矩阵
| Provider | iOS | Android | 备注 |
|----------|-----|---------|------|
| Sign in with Apple | `AuthenticationServices` 框架(系统自带) | Firebase Auth `OAuthProvider("apple.com")` | **App Store 指南**: 提供其他社交登录时必须提供 |
| Google Sign-In | `GoogleSignIn` SDK (`GIDSignIn`) | **Credential Manager API**(新推荐),旧版 GoogleSignIn 已 deprecated | Android 建议迁移到 Credential Manager |
| Kakao 登录 | Kakao iOS SDK (`KakaoSDKUser`) | Kakao Android SDK (`UserApiClient`) | 韩国市场实际上必备 |

> ⚠️ App Store 指南 4.8: 若应用提供其他第三方社交登录(Google/Kakao/Facebook 等),则也必须**在同等位置提供 Sign in with Apple**。缺失会被拒绝。

### 2-3. Sign in with Apple
iOS — 用 `AuthenticationServices` 获取 ID 令牌:
```swift
import AuthenticationServices

final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate {
    func start() {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization auth: ASAuthorization) {
        guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else { return }
        Task { try await AuthRepository.signInSocial(provider: "apple", idToken: idToken) }
    }
}
```
Android — 由于没有原生 Apple SDK,通过 Firebase Auth OAuthProvider 走 Web OAuth:
```kotlin
val provider = OAuthProvider.newBuilder("apple.com")
    .setScopes(listOf("email", "name"))
    .build()
Firebase.auth.startActivityForSignInWithProvider(activity, provider)
    .addOnSuccessListener { result ->
        val idToken = result.credential?.let { (it as OAuthCredential).idToken }
        // 发送到后端
    }
```

### 2-4. Google Sign-In
iOS — `GIDSignIn`(必须在 `Info.plist` 注册 reversed client ID 的 URL scheme):
```swift
import GoogleSignIn

GIDSignIn.sharedInstance.signIn(withPresenting: presentingVC) { result, error in
    guard let idToken = result?.user.idToken?.tokenString else { return }
    Task { try await AuthRepository.signInSocial(provider: "google", idToken: idToken) }
}
```
```kotlin
// ❌ 禁止 — 旧版 GoogleSignIn 客户端已于2025年 deprecated,禁止新采用
// ✅ 推荐 — Android 新项目使用 Credential Manager API
val credentialManager = CredentialManager.create(context)
val option = GetGoogleIdOption.Builder()
    .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
    .setFilterByAuthorizedAccounts(false)
    .build()
val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

val response = credentialManager.getCredential(activity, request)
val idToken = (response.credential as GoogleIdTokenCredential).idToken
// 发送到后端
```

### 2-5. Kakao 登录
iOS:
```swift
import KakaoSDKUser

if UserApi.isKakaoTalkLoginAvailable() {
    UserApi.shared.loginWithKakaoTalk { token, error in
        guard let idToken = token?.idToken else { return }
        Task { try await AuthRepository.signInSocial(provider: "kakao", idToken: idToken) }
    }
} else {
    UserApi.shared.loginWithKakaoAccount { token, _ in /* same */ }
}
```
```kotlin
UserApiClient.instance.loginWithKakaoTalk(context) { token, error ->
    val idToken = token?.idToken ?: return@loginWithKakaoTalk
    // 发送到后端
}
```
> 在 `AndroidManifest.xml` 注册 `AuthCodeHandlerActivity` Intent Filter,在 `Info.plist` 注册 `kakao{APP_KEY}` URL scheme。

### 2-6. URL Scheme / Universal Link / Intent Filter
| 平台 | 配置位置 | 用途 |
|--------|-----------|------|
| iOS | `Info.plist` → `CFBundleURLTypes` | Kakao/Google OAuth 回调 |
| iOS | Associated Domains → `applinks:` | Universal Link(未安装应用时回退到 Web) |
| Android | `AndroidManifest.xml` → `<intent-filter>` with `<data>` | OAuth 回调 + 深链 |
| Android | App Links (`autoVerify="true"`) | 无需用户选择直接进入应用 |

> URL scheme(`myapp://`)可能被其他应用拦截。支付·登录这类安全路径要用 **Universal Link / App Links**。

### 2-7. 首次登录(注册) vs 再次登录的分支
在后端响应中放一个 `isNewUser` 标志,由客户端分支。
```swift
let response = try await AuthRepository.signInSocial(provider: "apple", idToken: idToken)
TokenStore.shared.save(response.accessToken, response.refreshToken)

if response.isNewUser {
    router.navigate(.onboarding(profile: response.profileHint))   // 昵称/条款同意
} else {
    router.navigate(.home)
}
```
> Apple **仅在首次登录时返回邮箱/姓名**,之后不再返回。后端必须永久保存首次响应。

## 3. 常见错误
- ❌ 把 Apple/Google 的 ID 令牌直接用于我们 API 的 `Authorization` 头 → 供应商过期·密钥轮换时立刻故障
- ❌ 在后端跳过 ID 令牌签名验证而只信任 `email` → 用伪造令牌可任意盗取账户
- ❌ 把 OAuth client secret 放进应用二进制(反编译即泄露)— secret 只能放后端
- ❌ 只提供 Kakao/Google 而缺失 Apple 登录 → iOS App Store 被拒
- ❌ 登出时只调用 provider SDK 的 `signOut()` 而漏掉清理自有 TokenStore
- ❌ 没有 `isNewUser` 分支而总是直接进入首页 → 漏掉未同意条款的用户
- ❌ 在 Android 新项目采用旧版 GoogleSignIn(已 deprecated)

## 4. 检查清单
- [ ] ID 令牌是否在后端做签名验证并兑换为自有 JWT?
- [ ] 提供其他社交登录时是否同等提供 Sign in with Apple?
- [ ] Android 新代码是否用 Credential Manager API 编写?
- [ ] 是否把 OAuth client secret 从应用二进制中排除?
- [ ] 是否按平台注册了 URL scheme/Universal Link/Intent Filter?
- [ ] 是否把 Apple 首次响应(邮箱/姓名)永久保存在后端?
- [ ] 是否用 `isNewUser` 区分注册/再次登录?
- [ ] 登出时是否同时清理了 provider SDK 与自有 TokenStore?
