---
name: 모바일 소셜 로그인 (Social Login)
description: Sign in with Apple·Google Sign-In·카카오 로그인을 iOS/Android에서 일관되게 구현하는 표준. ID 토큰 → 백엔드 검증 → 자체 JWT 교환 흐름과 URL 스킴 설정을 통일할 때 읽는다. 키워드: social login, GoogleSignIn, AppleIDProvider, oauth, FirebaseAuth, AuthCredential, IdToken, Credential Manager, 카카오.
rules:
  - "소셜 로그인은 Provider의 ID 토큰을 받아 백엔드에서 서명 검증한다 — 공급자 토큰을 우리 API 인증에 그대로 쓰면 보안·만료·갱신이 깨진다."
  - "검증 후 자체 JWT(access + refresh)로 교환해 앱 세션을 관리한다."
  - "Apple·Google·카카오 로그인을 공통 흐름으로 추상화한다 (Provider 무관)."
  - "URL 스킴과 리다이렉트 설정을 플랫폼별로 등록한다."
  - "Android의 Apple 로그인은 네이티브 SDK가 없어 Firebase Auth를 경유한다."
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

# 🔐 모바일 소셜 로그인

> 공급자 ID 토큰을 우리 백엔드가 검증하고 우리 JWT를 발급한다. 소셜 로그인을 새로 붙이거나 Apple/Google/카카오 흐름·URL 스킴을 정할 때 읽는다.

## 1. 핵심 원칙
- 소셜 로그인은 Provider의 ID 토큰을 받아 **백엔드에서 서명 검증**한다 — 공급자 토큰을 우리 API 인증에 그대로 쓰면 보안·만료·갱신이 깨진다.
- 검증 후 **자체 JWT(access + refresh)로 교환**해 앱 세션을 관리한다.
- Apple·Google·카카오 로그인을 **공통 흐름**으로 추상화한다 (Provider 무관).
- URL 스킴과 리다이렉트 설정을 플랫폼별로 등록한다.
- Android의 Apple 로그인은 네이티브 SDK가 없어 **Firebase Auth를 경유**한다.

## 2. 규칙

### 2-1. 공통 흐름 (Provider 무관)
```
[사용자가 소셜 버튼 탭]
        ↓
[Provider SDK 로그인 → ID 토큰 / authorization code 획득]
        ↓
[백엔드 /auth/social 호출 — { provider, idToken } 전송]
        ↓
[백엔드: 공급자 공개키로 ID 토큰 서명 검증 → 사용자 매칭/생성]
        ↓
[자체 JWT (access + refresh) 응답]
        ↓
[클라이언트: TokenStore 에 저장 → 이후 API 인증]
```
> 자체 JWT 저장·갱신은 networking-api 스킬의 TokenStore 패턴(인증 토큰 자동 첨부 + 갱신)을 그대로 사용한다.

### 2-2. Provider 매트릭스
| Provider | iOS | Android | 비고 |
|----------|-----|---------|------|
| Sign in with Apple | `AuthenticationServices` 프레임워크 (기본 제공) | Firebase Auth `OAuthProvider("apple.com")` | **App Store 가이드라인**: 다른 소셜 로그인 제공 시 필수 |
| Google Sign-In | `GoogleSignIn` SDK (`GIDSignIn`) | **Credential Manager API** (신규 권장), 구버전 GoogleSignIn 은 deprecated | Android는 Credential Manager 전환 권고 |
| 카카오 로그인 | Kakao iOS SDK (`KakaoSDKUser`) | Kakao Android SDK (`UserApiClient`) | 한국 시장 사실상 필수 |

> ⚠️ App Store 가이드라인 4.8: 다른 3자 소셜 로그인(구글/카카오/페이스북 등)을 제공하는 앱이라면 **Sign in with Apple 도 동등한 위치에 제공**해야 한다. 누락 시 리젝.

### 2-3. Sign in with Apple
iOS — `AuthenticationServices`로 ID 토큰 획득:
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
Android — 네이티브 Apple SDK가 없으므로 Firebase Auth OAuthProvider로 웹 OAuth:
```kotlin
val provider = OAuthProvider.newBuilder("apple.com")
    .setScopes(listOf("email", "name"))
    .build()
Firebase.auth.startActivityForSignInWithProvider(activity, provider)
    .addOnSuccessListener { result ->
        val idToken = result.credential?.let { (it as OAuthCredential).idToken }
        // 백엔드 전송
    }
```

### 2-4. Google Sign-In
iOS — `GIDSignIn` (`Info.plist`에 reversed client ID URL 스킴 등록 필수):
```swift
import GoogleSignIn

GIDSignIn.sharedInstance.signIn(withPresenting: presentingVC) { result, error in
    guard let idToken = result?.user.idToken?.tokenString else { return }
    Task { try await AuthRepository.signInSocial(provider: "google", idToken: idToken) }
}
```
```kotlin
// ❌ 금지 — 구버전 GoogleSignIn 클라이언트는 2025년 deprecated, 신규 채택 금지
// ✅ 권장 — Android 신규 프로젝트는 Credential Manager API 사용
val credentialManager = CredentialManager.create(context)
val option = GetGoogleIdOption.Builder()
    .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
    .setFilterByAuthorizedAccounts(false)
    .build()
val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

val response = credentialManager.getCredential(activity, request)
val idToken = (response.credential as GoogleIdTokenCredential).idToken
// 백엔드 전송
```

### 2-5. 카카오 로그인
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
    // 백엔드 전송
}
```
> `AndroidManifest.xml`에 `AuthCodeHandlerActivity` Intent Filter, `Info.plist`에 `kakao{APP_KEY}` URL 스킴 등록.

### 2-6. URL 스킴 / Universal Link / Intent Filter
| 플랫폼 | 설정 위치 | 용도 |
|--------|-----------|------|
| iOS | `Info.plist` → `CFBundleURLTypes` | 카카오/구글 OAuth 콜백 |
| iOS | Associated Domains → `applinks:` | Universal Link (앱 미설치 시 웹 폴백) |
| Android | `AndroidManifest.xml` → `<intent-filter>` with `<data>` | OAuth 콜백 + 딥링크 |
| Android | App Links (`autoVerify="true"`) | 사용자 선택 없이 앱으로 직진 |

> URL 스킴(`myapp://`)은 다른 앱이 가로챌 수 있다. 결제·로그인 같은 보안 경로는 **Universal Link / App Links** 사용.

### 2-7. 첫 로그인(회원가입) vs 재로그인 분기
백엔드 응답에 `isNewUser` 플래그를 두고 클라이언트에서 분기한다.
```swift
let response = try await AuthRepository.signInSocial(provider: "apple", idToken: idToken)
TokenStore.shared.save(response.accessToken, response.refreshToken)

if response.isNewUser {
    router.navigate(.onboarding(profile: response.profileHint))   // 닉네임/약관 동의
} else {
    router.navigate(.home)
}
```
> Apple은 **첫 로그인 시에만 이메일/이름을 반환**한다. 그 뒤로는 안 줌. 백엔드에서 첫 응답을 반드시 영구 저장.

## 3. 흔한 실수
- ❌ Apple/Google ID 토큰을 우리 API의 `Authorization` 헤더에 그대로 사용 → 공급자 만료·키 회전 시 즉시 장애
- ❌ 백엔드에서 ID 토큰 서명 검증을 생략하고 `email`만 신뢰 → 위조된 토큰으로 임의 계정 탈취 가능
- ❌ OAuth client secret을 앱 바이너리에 포함 (디컴파일로 노출) — secret은 백엔드에만
- ❌ 카카오/구글만 제공하고 Apple 로그인 누락 → iOS 앱스토어 리젝
- ❌ 로그아웃 시 provider SDK의 `signOut()`만 호출하고 자체 TokenStore 정리 누락
- ❌ `isNewUser` 분기 없이 항상 홈으로 직진 → 약관 미동의 사용자 누락
- ❌ Android 신규 프로젝트에서 구버전 GoogleSignIn 채택 (deprecated)

## 4. 체크리스트
- [ ] ID 토큰을 백엔드에서 서명 검증하고 자체 JWT로 교환했는가
- [ ] 다른 소셜 로그인 제공 시 Sign in with Apple도 동등하게 제공했는가
- [ ] Android 신규 코드는 Credential Manager API로 작성했는가
- [ ] OAuth client secret을 앱 바이너리에서 제외했는가
- [ ] URL 스킴/Universal Link/Intent Filter를 플랫폼별로 등록했는가
- [ ] Apple 첫 응답(이메일/이름)을 백엔드에 영구 저장했는가
- [ ] `isNewUser`로 회원가입/재로그인을 분기했는가
- [ ] 로그아웃 시 provider SDK와 자체 TokenStore를 모두 정리했는가
