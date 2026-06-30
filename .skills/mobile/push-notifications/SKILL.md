---
name: 모바일 푸시 알림 (Push Notifications)
description: iOS APNs와 Android FCM을 같은 멘탈 모델로 다루는 푸시 알림 표준. 푸시를 새로 붙이거나 권한·토큰 수명주기·payload·딥링크·silent push를 정할 때 읽는다. 키워드: FCM, FirebaseMessaging, APNs, UNNotification, registerForRemoteNotifications, FirebaseMessagingService, NotificationChannel, deeplink, silent push.
rules:
  - "푸시는 iOS APNs·Android FCM을 공통 모델로 다루고, 백엔드 발송 채널은 FCM으로 일원화한다."
  - "알림 권한을 요청하고 디바이스 토큰 수명주기를 서버와 동기화한다 — 변경 시에만 전송한다."
  - "payload에 딥링크 경로를 담아 알림 탭 시 화면으로 이동한다."
  - "Android 8.0+는 알림 발송 전에 NotificationChannel을 등록한다."
  - "데이터 동기화는 silent push로 처리한다."
tags:
  - "FCM"
  - "FirebaseMessaging"
  - "APNs"
  - "UNNotification"
  - "registerForRemoteNotifications"
  - "FirebaseMessagingService"
  - "NotificationChannel"
  - "deeplink"
  - "silent push"
---

# 🔔 모바일 푸시 알림

> 푸시는 권한 → 토큰 발급 → 백엔드 등록 → 수신/표시 → 탭 시 라우팅의 5단계 파이프라인이다. 한 단계라도 빠지면 "왜 알림이 안 와요" CS가 쏟아진다. 푸시를 붙이거나 토큰·payload·딥링크를 정할 때 읽는다.

## 1. 핵심 원칙

- 푸시는 iOS APNs·Android FCM을 공통 모델로 다루고, 백엔드 발송 채널은 FCM으로 일원화한다.
- 알림 권한을 요청하고 디바이스 토큰 수명주기를 서버와 동기화한다 — 변경 시에만 전송한다.
- payload에 딥링크 경로를 담아 알림 탭 시 화면으로 이동한다.
- Android 8.0+는 알림 발송 전에 NotificationChannel을 등록한다.
- 데이터 동기화는 silent push로 처리한다.

## 2. 규칙

### 2-1. 권한 요청 (Cross-link)

알림 권한 자체의 요청 시점·거부 복구 흐름은 `permissions-privacy` 스킬에서 다룬다.

- iOS: `UNUserNotificationCenter.requestAuthorization`
- Android 13+: `POST_NOTIFICATIONS` 런타임 권한

> 앱 첫 진입에서 묻지 말고 **알림 가치를 사용자가 인지한 직후** 요청하라.

### 2-2. Firebase 공통 셋업

iOS/Android 모두 FCM을 백엔드 발송 채널로 일원화한다. 양 플랫폼에 개별 SDK를 두지 말 것.

| 항목 | iOS | Android |
|------|-----|---------|
| 설정 파일 | `GoogleService-Info.plist` | `google-services.json` |
| 위치 | 앱 타깃 루트, Build Phases에 포함 | `app/` 모듈 루트 |
| 의존성 | `FirebaseMessaging` (SPM) | `com.google.firebase:firebase-messaging-ktx` |
| 백엔드 발송 키 | Firebase 콘솔 서비스 계정 JSON | 동일 |

> ⚠️ 설정 파일은 환경별(dev/staging/prod)로 분리. Build Configuration / Product Flavor마다 다른 파일 주입.

### 2-3. iOS — APNs 토큰 수신과 등록

iOS는 APNs가 1차 채널, FCM은 그 위에서 토큰을 매핑한다. 인증은 **Auth Key(.p8) 권장** — 만료 없음, 모든 앱 공용. 인증서(.p12)는 1년 만료라 운영 부담.

```swift
import UIKit
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions opts: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        app.registerForRemoteNotifications()
        return true
    }

    // APNs 디바이스 토큰 → FCM 으로 전달
    func application(_ app: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    // FCM 토큰 (최종적으로 백엔드에 보낼 값)
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { await PushTokenRepository.shared.registerIfChanged(fcmToken) }
    }

    // 포그라운드에서도 알림 표시
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async
                                -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound]
    }
}
```

APNs payload 구조:
```json
{
  "aps": {
    "alert": { "title": "새 메시지", "body": "안녕하세요" },
    "badge": 3,
    "sound": "default",
    "content-available": 1
  },
  "deeplink": "myapp://chat/42"
}
```

### 2-4. Android — FirebaseMessagingService

```kotlin
class AppMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // 토큰 갱신 시 호출 (앱 재설치, 데이터 초기화, 주기적 회전)
        CoroutineScope(Dispatchers.IO).launch {
            PushTokenRepository.registerIfChanged(token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body  = message.notification?.body  ?: message.data["body"].orEmpty()
        val deeplink = message.data["deeplink"]
        showNotification(title, body, deeplink)
    }
}
```

NotificationChannel (Android 8.0+ 필수):
```kotlin
val channel = NotificationChannel(
    "chat",                                  // channelId — 서버 payload와 일치해야 함
    "채팅 알림",                              // 사용자에게 보이는 이름
    NotificationManager.IMPORTANCE_HIGH
).apply { description = "새 메시지 알림" }

val nm = getSystemService(NotificationManager::class.java)
nm.createNotificationChannel(channel)
```

> ⚠️ 채널은 앱 시작 직후(예: `Application.onCreate`)에 한 번 생성. 채널 생성 전 알림을 보내면 **Android 8.0+에서 표시 자체가 안 됨**.

Manifest 등록:
```xml
<service android:name=".AppMessagingService" android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### 2-5. 토큰 수명주기 — 언제 백엔드에 보낼까

| 시점 | iOS | Android | 백엔드 전송 |
|------|-----|---------|-------------|
| 최초 발급 | `didReceiveRegistrationToken` | `onNewToken` | ✅ |
| 토큰 회전(갱신) | 동일 | `onNewToken` | ✅ |
| 로그인 직후 | 직접 호출 | 직접 호출 | ✅ (user-token 매핑) |
| 로그아웃 | 직접 호출 | 직접 호출 | ✅ **unregister** |
| 앱 시작마다 | ❌ | ❌ | 매번 보내지 말 것 |

```kotlin
object PushTokenRepository {
    private var lastSent: String? = null
    suspend fun registerIfChanged(token: String) {
        if (token == lastSent) return
        api.registerPushToken(token)   // networking-api 스킬의 TokenStore 인증 흐름 활용
        lastSent = token
    }
    suspend fun unregister() { api.unregisterPushToken(); lastSent = null }
}
```

> 앱 시작마다 토큰을 서버로 보내면 트래픽·DB 쓰기 낭비. **변경 시에만** 보내라.

### 2-6. 알림 탭 시 딥링크 라우팅

payload의 `deeplink` 필드는 `navigation-routing` 스킬의 Route로 파싱해서 일관된 화면 이동을 보장한다.

```swift
// iOS
func userNotificationCenter(_ center: UNUserNotificationCenter,
                            didReceive response: UNNotificationResponse) async {
    let info = response.notification.request.content.userInfo
    if let link = info["deeplink"] as? String, let url = URL(string: link) {
        await Router.shared.handle(url)        // navigation-routing 의 Route 로 매핑
    }
}
```

```kotlin
// Android — PendingIntent 로 MainActivity 에 deeplink 전달
val intent = Intent(this, MainActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
    putExtra("deeplink", deeplink)
}
```

### 2-7. Silent / Data-only Message

서버 상태 동기화, 배지 갱신, 백그라운드 프리페치 용도.

- **iOS**: `aps.content-available: 1` + `alert` 없음 → `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` 호출. **Background Modes → Remote notifications** 체크 필수.
- **Android**: `notification` 필드 없이 `data`만 → `onMessageReceived`가 백그라운드에서도 호출됨.

```json
// iOS silent
{ "aps": { "content-available": 1 }, "sync": "messages" }

// Android data-only
{ "data": { "type": "sync", "target": "messages" } }
```

> iOS silent push는 **시스템이 throttling**한다. 1초에 여러 번 보내면 일부가 드랍. 중요한 동기화는 별도 폴링으로 보강.

## 3. 흔한 실수

- ❌ 앱 시작마다 토큰을 서버에 매번 전송 (변경 없는데 트래픽 낭비).
- ❌ 알림 권한 거부를 무시하고 발송만 계속 (사용자는 받지도 못함).
- ❌ Android에서 NotificationChannel 안 만들고 알림 발송 (8.0+에서 무음).
- ❌ 로그아웃 시 토큰 unregister 누락 → 다른 사용자가 같은 기기로 로그인했을 때 이전 사용자에게 알림.
- ❌ APNs 인증서(.p12) 갱신 깜빡해서 운영 중 푸시 중단 → Auth Key(.p8)로 전환.
- ❌ `onMessageReceived` / FCM 콜백에서 메인스레드 네트워크 호출 → ANR(Application Not Responding).
- ❌ 딥링크를 문자열 비교로 분기(`if url.contains("chat")`) → Route 모델로 통일하라.

## 4. 체크리스트

- [ ] 알림 권한을 적절한 시점에 요청했는가
- [ ] FCM 설정 파일을 환경별로 분리했는가
- [ ] 토큰을 최초 발급·회전·로그인·로그아웃 시점에만 백엔드와 동기화하는가
- [ ] Android에서 알림 발송 전에 NotificationChannel을 등록했는가
- [ ] payload의 deeplink를 Route 모델로 파싱해 라우팅하는가
- [ ] silent/data-only push로 백그라운드 동기화를 처리하고 throttling을 보강했는가
- [ ] iOS는 Auth Key(.p8) 인증을 쓰는가
