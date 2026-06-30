---
name: モバイルソーシャルログイン (Social Login)
description: Sign in with Apple·Google Sign-In·カカオログインを iOS/Android で一貫して実装する標準。ID トークン → バックエンド検証 → 自前 JWT への交換フローと URL スキーム設定を統一するときに読む。キーワード: social login, GoogleSignIn, AppleIDProvider, oauth, FirebaseAuth, AuthCredential, IdToken, Credential Manager, カカオ。
rules:
  - "ソーシャルログインは Provider の ID トークンを受け取り、バックエンドで署名検証する — 供給者トークンをそのまま自社 API 認証に使うとセキュリティ・有効期限・更新が壊れる。"
  - "検証後は自前 JWT(access + refresh)に交換してアプリセッションを管理する。"
  - "Apple·Google·カカオログインを共通フローに抽象化する(Provider 非依存)。"
  - "URL スキームとリダイレクト設定をプラットフォーム別に登録する。"
  - "Android の Apple ログインはネイティブ SDK がないため Firebase Auth を経由する。"
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

# 🔐 モバイルソーシャルログイン

> 供給者の ID トークンを自社バックエンドが検証し、自社 JWT を発行する。ソーシャルログインを新たに追加したり、Apple/Google/カカオのフロー・URL スキームを決めるときに読む。

## 1. 核心原則
- ソーシャルログインは Provider の ID トークンを受け取り、**バックエンドで署名検証**する — 供給者トークンをそのまま自社 API 認証に使うとセキュリティ・有効期限・更新が壊れる。
- 検証後は**自前 JWT(access + refresh)に交換**してアプリセッションを管理する。
- Apple·Google·カカオログインを**共通フロー**に抽象化する(Provider 非依存)。
- URL スキームとリダイレクト設定をプラットフォーム別に登録する。
- Android の Apple ログインはネイティブ SDK がないため **Firebase Auth を経由**する。

## 2. ルール

### 2-1. 共通フロー(Provider 非依存)
```
[ユーザーがソーシャルボタンをタップ]
        ↓
[Provider SDK ログイン → ID トークン / authorization code 取得]
        ↓
[バックエンド /auth/social 呼び出し — { provider, idToken } 送信]
        ↓
[バックエンド: 供給者の公開鍵で ID トークン署名検証 → ユーザーマッチング/作成]
        ↓
[自前 JWT (access + refresh) を応答]
        ↓
[クライアント: TokenStore に保存 → 以降の API 認証]
```
> 自前 JWT の保存・更新は networking-api スキルの TokenStore パターン(認証トークン自動付与 + 更新)をそのまま使う。

### 2-2. Provider マトリクス
| Provider | iOS | Android | 備考 |
|----------|-----|---------|------|
| Sign in with Apple | `AuthenticationServices` フレームワーク(標準提供) | Firebase Auth `OAuthProvider("apple.com")` | **App Store ガイドライン**: 他のソーシャルログイン提供時は必須 |
| Google Sign-In | `GoogleSignIn` SDK (`GIDSignIn`) | **Credential Manager API**(新たに推奨)、旧 GoogleSignIn は deprecated | Android は Credential Manager への移行を推奨 |
| カカオログイン | Kakao iOS SDK (`KakaoSDKUser`) | Kakao Android SDK (`UserApiClient`) | 韓国市場では事実上必須 |

> ⚠️ App Store ガイドライン 4.8: 他のサードパーティソーシャルログイン(Google/カカオ/Facebook など)を提供するアプリなら、**Sign in with Apple も同等の位置に提供**しなければならない。欠落するとリジェクト。

### 2-3. Sign in with Apple
iOS — `AuthenticationServices` で ID トークン取得:
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
Android — ネイティブ Apple SDK がないため Firebase Auth OAuthProvider で Web OAuth:
```kotlin
val provider = OAuthProvider.newBuilder("apple.com")
    .setScopes(listOf("email", "name"))
    .build()
Firebase.auth.startActivityForSignInWithProvider(activity, provider)
    .addOnSuccessListener { result ->
        val idToken = result.credential?.let { (it as OAuthCredential).idToken }
        // バックエンド送信
    }
```

### 2-4. Google Sign-In
iOS — `GIDSignIn`(`Info.plist` に reversed client ID URL スキーム登録必須):
```swift
import GoogleSignIn

GIDSignIn.sharedInstance.signIn(withPresenting: presentingVC) { result, error in
    guard let idToken = result?.user.idToken?.tokenString else { return }
    Task { try await AuthRepository.signInSocial(provider: "google", idToken: idToken) }
}
```
```kotlin
// ❌ 禁止 — 旧 GoogleSignIn クライアントは2025年 deprecated、新規採用禁止
// ✅ 推奨 — Android 新規プロジェクトは Credential Manager API を使用
val credentialManager = CredentialManager.create(context)
val option = GetGoogleIdOption.Builder()
    .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
    .setFilterByAuthorizedAccounts(false)
    .build()
val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

val response = credentialManager.getCredential(activity, request)
val idToken = (response.credential as GoogleIdTokenCredential).idToken
// バックエンド送信
```

### 2-5. カカオログイン
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
    // バックエンド送信
}
```
> `AndroidManifest.xml` に `AuthCodeHandlerActivity` Intent Filter、`Info.plist` に `kakao{APP_KEY}` URL スキームを登録。

### 2-6. URL スキーム / Universal Link / Intent Filter
| プラットフォーム | 設定場所 | 用途 |
|--------|-----------|------|
| iOS | `Info.plist` → `CFBundleURLTypes` | カカオ/Google OAuth コールバック |
| iOS | Associated Domains → `applinks:` | Universal Link(アプリ未インストール時の Web フォールバック) |
| Android | `AndroidManifest.xml` → `<intent-filter>` with `<data>` | OAuth コールバック + ディープリンク |
| Android | App Links (`autoVerify="true"`) | ユーザー選択なしでアプリへ直行 |

> URL スキーム(`myapp://`)は他のアプリに横取りされる可能性がある。決済・ログインのようなセキュリティ経路は **Universal Link / App Links** を使う。

### 2-7. 初回ログイン(会員登録) vs 再ログインの分岐
バックエンド応答に `isNewUser` フラグを置き、クライアントで分岐する。
```swift
let response = try await AuthRepository.signInSocial(provider: "apple", idToken: idToken)
TokenStore.shared.save(response.accessToken, response.refreshToken)

if response.isNewUser {
    router.navigate(.onboarding(profile: response.profileHint))   // ニックネーム/規約同意
} else {
    router.navigate(.home)
}
```
> Apple は**初回ログイン時のみメール/名前を返す**。その後は返さない。バックエンドで初回応答を必ず永続保存。

## 3. よくあるミス
- ❌ Apple/Google の ID トークンを自社 API の `Authorization` ヘッダーにそのまま使用 → 供給者の有効期限・鍵ローテーション時に即障害
- ❌ バックエンドで ID トークン署名検証を省略して `email` だけ信頼 → 偽造トークンで任意アカウント乗っ取り可能
- ❌ OAuth client secret をアプリバイナリに含める(逆コンパイルで露出)— secret はバックエンドのみ
- ❌ カカオ/Google だけ提供し Apple ログインを欠落 → iOS App Store リジェクト
- ❌ ログアウト時に provider SDK の `signOut()` だけ呼び、自社 TokenStore のクリーンアップを欠落
- ❌ `isNewUser` 分岐なしで常にホームへ直行 → 規約未同意ユーザーを取りこぼす
- ❌ Android 新規プロジェクトで旧 GoogleSignIn を採用(deprecated)

## 4. チェックリスト
- [ ] ID トークンをバックエンドで署名検証し自社 JWT に交換したか
- [ ] 他のソーシャルログイン提供時に Sign in with Apple も同等に提供したか
- [ ] Android 新規コードは Credential Manager API で書いたか
- [ ] OAuth client secret をアプリバイナリから除外したか
- [ ] URL スキーム/Universal Link/Intent Filter をプラットフォーム別に登録したか
- [ ] Apple の初回応答(メール/名前)をバックエンドに永続保存したか
- [ ] `isNewUser` で会員登録/再ログインを分岐したか
- [ ] ログアウト時に provider SDK と自社 TokenStore を両方クリーンアップしたか
