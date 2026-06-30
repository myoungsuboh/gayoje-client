---
name: Mobile Push Notifications (Push Notifications)
description: A push notification standard for handling iOS APNs and Android FCM with the same mental model. Read it when wiring up push for the first time or deciding permissions, token lifecycle, payload, deep links, or silent push. Keywords: FCM, FirebaseMessaging, APNs, UNNotification, registerForRemoteNotifications, FirebaseMessagingService, NotificationChannel, deeplink, silent push.
rules:
  - "Handle push with a shared model across iOS APNs and Android FCM, and unify the backend sending channel on FCM."
  - "Request notification permission and sync the device token lifecycle with the server — send only when it changes."
  - "Put the deep-link path in the payload so tapping the notification navigates to the screen."
  - "On Android 8.0+, register a NotificationChannel before sending notifications."
  - "Handle data sync via silent push."
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

# 🔔 Mobile Push Notifications

> Push is a 5-stage pipeline: permission → token issuance → backend registration → receive/display → routing on tap. Miss even one stage and you get a flood of "why aren't my notifications arriving?" support tickets. Read this when wiring up push or deciding tokens, payload, or deep links.

## 1. Core Principles

- Handle push with a shared model across iOS APNs and Android FCM, and unify the backend sending channel on FCM.
- Request notification permission and sync the device token lifecycle with the server — send only when it changes.
- Put the deep-link path in the payload so tapping the notification navigates to the screen.
- On Android 8.0+, register a NotificationChannel before sending notifications.
- Handle data sync via silent push.

## 2. Rules

### 2-1. Permission Request (Cross-link)

The timing of the notification-permission request itself and the denial-recovery flow are covered in the `permissions-privacy` skill.

- iOS: `UNUserNotificationCenter.requestAuthorization`
- Android 13+: `POST_NOTIFICATIONS` runtime permission

> Don't ask on the app's first launch — request it **right after the user perceives the value of notifications**.

### 2-2. Common Firebase Setup

For both iOS/Android, unify FCM as the backend sending channel. Don't keep separate SDKs on each platform.

| Item | iOS | Android |
|------|-----|---------|
| Config file | `GoogleService-Info.plist` | `google-services.json` |
| Location | App target root, included in Build Phases | `app/` module root |
| Dependency | `FirebaseMessaging` (SPM) | `com.google.firebase:firebase-messaging-ktx` |
| Backend sending key | Firebase console service-account JSON | Same |

> ⚠️ Separate config files per environment (dev/staging/prod). Inject a different file per Build Configuration / Product Flavor.

### 2-3. iOS — Receiving and Registering the APNs Token

On iOS, APNs is the primary channel and FCM maps the token on top of it. For authentication, **Auth Key (.p8) is recommended** — never expires, shared across all apps. The certificate (.p12) expires in 1 year, an operational burden.

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

    // APNs device token → forward to FCM
    func application(_ app: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    // FCM token (the value ultimately sent to the backend)
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { await PushTokenRepository.shared.registerIfChanged(fcmToken) }
    }

    // Show notifications even in the foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async
                                -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound]
    }
}
```

APNs payload structure:
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
        // Called on token refresh (reinstall, data reset, periodic rotation)
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

NotificationChannel (required on Android 8.0+):
```kotlin
val channel = NotificationChannel(
    "chat",                                  // channelId — must match the server payload
    "채팅 알림",                              // name shown to the user
    NotificationManager.IMPORTANCE_HIGH
).apply { description = "새 메시지 알림" }

val nm = getSystemService(NotificationManager::class.java)
nm.createNotificationChannel(channel)
```

> ⚠️ Create the channel once right after app start (e.g., `Application.onCreate`). If you send a notification before creating the channel, **it won't display at all on Android 8.0+**.

Manifest registration:
```xml
<service android:name=".AppMessagingService" android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### 2-5. Token Lifecycle — When to Send to the Backend

| Moment | iOS | Android | Backend send |
|------|-----|---------|-------------|
| First issuance | `didReceiveRegistrationToken` | `onNewToken` | ✅ |
| Token rotation (refresh) | Same | `onNewToken` | ✅ |
| Right after login | Call directly | Call directly | ✅ (user-token mapping) |
| Logout | Call directly | Call directly | ✅ **unregister** |
| Every app start | ❌ | ❌ | Don't send every time |

```kotlin
object PushTokenRepository {
    private var lastSent: String? = null
    suspend fun registerIfChanged(token: String) {
        if (token == lastSent) return
        api.registerPushToken(token)   // use the networking-api skill's TokenStore auth flow
        lastSent = token
    }
    suspend fun unregister() { api.unregisterPushToken(); lastSent = null }
}
```

> Sending the token to the server on every app start wastes traffic and DB writes. Send it **only when it changes**.

### 2-6. Deep-Link Routing on Notification Tap

The payload's `deeplink` field is parsed into a Route from the `navigation-routing` skill to guarantee consistent screen navigation.

```swift
// iOS
func userNotificationCenter(_ center: UNUserNotificationCenter,
                            didReceive response: UNNotificationResponse) async {
    let info = response.notification.request.content.userInfo
    if let link = info["deeplink"] as? String, let url = URL(string: link) {
        await Router.shared.handle(url)        // map to a Route from navigation-routing
    }
}
```

```kotlin
// Android — pass the deeplink to MainActivity via a PendingIntent
val intent = Intent(this, MainActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
    putExtra("deeplink", deeplink)
}
```

### 2-7. Silent / Data-only Message

For server state sync, badge updates, and background prefetch.

- **iOS**: `aps.content-available: 1` + no `alert` → calls `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`. **Background Modes → Remote notifications** must be checked.
- **Android**: `data` only without a `notification` field → `onMessageReceived` is called even in the background.

```json
// iOS silent
{ "aps": { "content-available": 1 }, "sync": "messages" }

// Android data-only
{ "data": { "type": "sync", "target": "messages" } }
```

> iOS silent push is **throttled by the system**. Send several per second and some get dropped. Reinforce critical sync with separate polling.

## 3. Common Mistakes

- ❌ Sending the token to the server on every app start (wastes traffic with no change).
- ❌ Ignoring notification-permission denial and just keeping on sending (the user never even receives them).
- ❌ Sending notifications on Android without creating a NotificationChannel (silent on 8.0+).
- ❌ Forgetting to unregister the token on logout → when another user logs in on the same device, notifications go to the previous user.
- ❌ Forgetting to renew the APNs certificate (.p12) and push stops in production → switch to Auth Key (.p8).
- ❌ Making main-thread network calls in `onMessageReceived` / FCM callbacks → ANR (Application Not Responding).
- ❌ Branching deep links by string comparison (`if url.contains("chat")`) → unify with a Route model.

## 4. Checklist

- [ ] Did you request notification permission at an appropriate time?
- [ ] Did you separate FCM config files per environment?
- [ ] Do you sync the token with the backend only at first issuance, rotation, login, and logout?
- [ ] Did you register a NotificationChannel before sending notifications on Android?
- [ ] Do you parse the payload's deeplink into a Route model for routing?
- [ ] Do you handle background sync with silent/data-only push and reinforce throttling?
- [ ] Does iOS use Auth Key (.p8) authentication?
