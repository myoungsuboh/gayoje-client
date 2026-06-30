---
name: Mobile Social Login (Social Login)
description: A standard for implementing Sign in with Apple·Google Sign-In·Kakao Login consistently across iOS/Android. Read when unifying the ID token → backend verification → own JWT exchange flow and URL scheme setup. Keywords: social login, GoogleSignIn, AppleIDProvider, oauth, FirebaseAuth, AuthCredential, IdToken, Credential Manager, Kakao.
rules:
  - "Social login takes the Provider's ID token and verifies its signature on the backend — using the provider token directly for our API auth breaks security, expiration, and refresh."
  - "After verification, exchange it for our own JWT (access + refresh) to manage the app session."
  - "Abstract Apple·Google·Kakao login into a common flow (Provider-agnostic)."
  - "Register URL schemes and redirect settings per platform."
  - "Apple login on Android has no native SDK, so it goes through Firebase Auth."
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

# 🔐 Mobile Social Login

> Our backend verifies the provider ID token and issues our JWT. Read when newly adding social login or deciding the Apple/Google/Kakao flow or URL schemes.

## 1. Core Principles
- Social login takes the Provider's ID token and **verifies its signature on the backend** — using the provider token directly for our API auth breaks security, expiration, and refresh.
- After verification, **exchange it for our own JWT (access + refresh)** to manage the app session.
- Abstract Apple·Google·Kakao login into a **common flow** (Provider-agnostic).
- Register URL schemes and redirect settings per platform.
- Apple login on Android has no native SDK, so it **goes through Firebase Auth**.

## 2. Rules

### 2-1. Common Flow (Provider-agnostic)
```
[User taps social button]
        ↓
[Provider SDK login → obtain ID token / authorization code]
        ↓
[Call backend /auth/social — send { provider, idToken }]
        ↓
[Backend: verify ID token signature with provider public key → match/create user]
        ↓
[Respond with our own JWT (access + refresh)]
        ↓
[Client: save into TokenStore → use for subsequent API auth]
```
> For saving/refreshing our own JWT, use the TokenStore pattern from the networking-api skill (auto-attach auth token + refresh) as is.

### 2-2. Provider Matrix
| Provider | iOS | Android | Notes |
|----------|-----|---------|------|
| Sign in with Apple | `AuthenticationServices` framework (built in) | Firebase Auth `OAuthProvider("apple.com")` | **App Store guideline**: required when other social logins are offered |
| Google Sign-In | `GoogleSignIn` SDK (`GIDSignIn`) | **Credential Manager API** (newly recommended), the old GoogleSignIn is deprecated | Android is advised to migrate to Credential Manager |
| Kakao Login | Kakao iOS SDK (`KakaoSDKUser`) | Kakao Android SDK (`UserApiClient`) | de facto essential in the Korean market |

> ⚠️ App Store guideline 4.8: if the app offers other third-party social logins (Google/Kakao/Facebook, etc.), it must **offer Sign in with Apple in an equivalent position** too. Omission leads to rejection.

### 2-3. Sign in with Apple
iOS — obtain the ID token with `AuthenticationServices`:
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
Android — since there is no native Apple SDK, web OAuth via Firebase Auth OAuthProvider:
```kotlin
val provider = OAuthProvider.newBuilder("apple.com")
    .setScopes(listOf("email", "name"))
    .build()
Firebase.auth.startActivityForSignInWithProvider(activity, provider)
    .addOnSuccessListener { result ->
        val idToken = result.credential?.let { (it as OAuthCredential).idToken }
        // send to backend
    }
```

### 2-4. Google Sign-In
iOS — `GIDSignIn` (must register the reversed client ID URL scheme in `Info.plist`):
```swift
import GoogleSignIn

GIDSignIn.sharedInstance.signIn(withPresenting: presentingVC) { result, error in
    guard let idToken = result?.user.idToken?.tokenString else { return }
    Task { try await AuthRepository.signInSocial(provider: "google", idToken: idToken) }
}
```
```kotlin
// ❌ Forbidden — the old GoogleSignIn client is deprecated in 2025, do not adopt for new code
// ✅ Recommended — new Android projects use the Credential Manager API
val credentialManager = CredentialManager.create(context)
val option = GetGoogleIdOption.Builder()
    .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
    .setFilterByAuthorizedAccounts(false)
    .build()
val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

val response = credentialManager.getCredential(activity, request)
val idToken = (response.credential as GoogleIdTokenCredential).idToken
// send to backend
```

### 2-5. Kakao Login
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
    // send to backend
}
```
> Register the `AuthCodeHandlerActivity` Intent Filter in `AndroidManifest.xml`, and the `kakao{APP_KEY}` URL scheme in `Info.plist`.

### 2-6. URL Scheme / Universal Link / Intent Filter
| Platform | Where to set | Purpose |
|--------|-----------|------|
| iOS | `Info.plist` → `CFBundleURLTypes` | Kakao/Google OAuth callback |
| iOS | Associated Domains → `applinks:` | Universal Link (web fallback when app not installed) |
| Android | `AndroidManifest.xml` → `<intent-filter>` with `<data>` | OAuth callback + deep link |
| Android | App Links (`autoVerify="true"`) | go straight to the app without user choice |

> URL schemes (`myapp://`) can be hijacked by other apps. For secure paths like payment·login, use **Universal Link / App Links**.

### 2-7. First Login (Sign-up) vs Re-login Branching
Put an `isNewUser` flag in the backend response and branch on the client.
```swift
let response = try await AuthRepository.signInSocial(provider: "apple", idToken: idToken)
TokenStore.shared.save(response.accessToken, response.refreshToken)

if response.isNewUser {
    router.navigate(.onboarding(profile: response.profileHint))   // nickname/terms consent
} else {
    router.navigate(.home)
}
```
> Apple **returns email/name only on the first login**. Not afterward. The backend must permanently store the first response.

## 3. Common Mistakes
- ❌ Using the Apple/Google ID token directly in our API's `Authorization` header → immediate outage on provider expiration·key rotation
- ❌ Skipping ID token signature verification on the backend and trusting only `email` → arbitrary account takeover possible with a forged token
- ❌ Including the OAuth client secret in the app binary (exposed by decompilation) — the secret belongs only on the backend
- ❌ Offering only Kakao/Google and omitting Apple login → rejection on the iOS App Store
- ❌ On logout, calling only the provider SDK's `signOut()` and missing cleanup of our own TokenStore
- ❌ Always going straight to home without `isNewUser` branching → missing users who haven't consented to the terms
- ❌ Adopting the old GoogleSignIn in a new Android project (deprecated)

## 4. Checklist
- [ ] Is the ID token signature-verified on the backend and exchanged for our own JWT?
- [ ] When other social logins are offered, is Sign in with Apple offered equivalently?
- [ ] Is new Android code written with the Credential Manager API?
- [ ] Is the OAuth client secret excluded from the app binary?
- [ ] Are URL scheme/Universal Link/Intent Filter registered per platform?
- [ ] Is Apple's first response (email/name) permanently stored on the backend?
- [ ] Is sign-up/re-login branched by `isNewUser`?
- [ ] On logout, are both the provider SDK and our own TokenStore cleaned up?
