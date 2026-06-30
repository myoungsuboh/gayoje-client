---
name: 移动推送通知 (Push Notifications)
description: 用同一套心智模型处理 iOS APNs 与 Android FCM 的推送通知标准。在新接入推送，或确定权限、令牌生命周期、payload、深链接、silent push 时阅读。关键词: FCM, FirebaseMessaging, APNs, UNNotification, registerForRemoteNotifications, FirebaseMessagingService, NotificationChannel, deeplink, silent push。
rules:
  - "推送以 iOS APNs、Android FCM 的共通模型处理，后端发送通道统一为 FCM。"
  - "请求通知权限并将设备令牌的生命周期与服务器同步——仅在变更时发送。"
  - "在 payload 中携带深链接路径，点击通知时跳转到相应画面。"
  - "Android 8.0+ 在发送通知前注册 NotificationChannel。"
  - "数据同步通过 silent push 处理。"
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

# 🔔 移动推送通知

> 推送是一条五阶段流水线：权限 → 令牌发放 → 后端注册 → 接收/显示 → 点击时路由。哪怕缺一个阶段，都会涌来一堆“为什么收不到通知”的客服工单。在接入推送或确定令牌、payload、深链接时阅读。

## 1. 核心原则

- 推送以 iOS APNs、Android FCM 的共通模型处理，后端发送通道统一为 FCM。
- 请求通知权限并将设备令牌的生命周期与服务器同步——仅在变更时发送。
- 在 payload 中携带深链接路径，点击通知时跳转到相应画面。
- Android 8.0+ 在发送通知前注册 NotificationChannel。
- 数据同步通过 silent push 处理。

## 2. 规则

### 2-1. 权限请求 (Cross-link)

通知权限本身的请求时机、拒绝后的恢复流程，在 `permissions-privacy` 技能中处理。

- iOS: `UNUserNotificationCenter.requestAuthorization`
- Android 13+: `POST_NOTIFICATIONS` 运行时权限

> 不要在应用首次进入时询问，而要在**用户认识到通知价值之后立即**请求。

### 2-2. Firebase 共通设置

iOS/Android 均将后端发送通道统一为 FCM。不要在两个平台各放一套 SDK。

| 项目 | iOS | Android |
|------|-----|---------|
| 配置文件 | `GoogleService-Info.plist` | `google-services.json` |
| 位置 | 应用 target 根目录，包含在 Build Phases 中 | `app/` 模块根目录 |
| 依赖 | `FirebaseMessaging` (SPM) | `com.google.firebase:firebase-messaging-ktx` |
| 后端发送密钥 | Firebase 控制台服务账号 JSON | 相同 |

> ⚠️ 配置文件按环境(dev/staging/prod)分离。为每个 Build Configuration / Product Flavor 注入不同文件。

### 2-3. iOS — 接收并注册 APNs 令牌

iOS 中 APNs 是一级通道，FCM 在其上映射令牌。认证**推荐使用 Auth Key(.p8)**——永不过期，所有应用共用。证书(.p12)有效期 1 年，运维负担大。

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

    // APNs 设备令牌 → 转发给 FCM
    func application(_ app: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    // FCM 令牌 (最终发送给后端的值)
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { await PushTokenRepository.shared.registerIfChanged(fcmToken) }
    }

    // 前台也显示通知
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async
                                -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound]
    }
}
```

APNs payload 结构:
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
        // 令牌刷新时调用 (应用重装、数据重置、定期轮换)
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

NotificationChannel (Android 8.0+ 必需):
```kotlin
val channel = NotificationChannel(
    "chat",                                  // channelId — 必须与服务器 payload 一致
    "채팅 알림",                              // 展示给用户的名称
    NotificationManager.IMPORTANCE_HIGH
).apply { description = "새 메시지 알림" }

val nm = getSystemService(NotificationManager::class.java)
nm.createNotificationChannel(channel)
```

> ⚠️ 通道应在应用启动后立即(例如 `Application.onCreate`)创建一次。若在创建通道前发送通知，**在 Android 8.0+ 上将根本不显示**。

Manifest 注册:
```xml
<service android:name=".AppMessagingService" android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### 2-5. 令牌生命周期 — 何时发送给后端

| 时机 | iOS | Android | 后端发送 |
|------|-----|---------|-------------|
| 首次发放 | `didReceiveRegistrationToken` | `onNewToken` | ✅ |
| 令牌轮换(刷新) | 相同 | `onNewToken` | ✅ |
| 登录后立即 | 直接调用 | 直接调用 | ✅ (user-token 映射) |
| 登出 | 直接调用 | 直接调用 | ✅ **unregister** |
| 每次启动 | ❌ | ❌ | 不要每次都发送 |

```kotlin
object PushTokenRepository {
    private var lastSent: String? = null
    suspend fun registerIfChanged(token: String) {
        if (token == lastSent) return
        api.registerPushToken(token)   // 利用 networking-api 技能的 TokenStore 认证流程
        lastSent = token
    }
    suspend fun unregister() { api.unregisterPushToken(); lastSent = null }
}
```

> 每次启动都把令牌发往服务器会浪费流量和数据库写入。**仅在变更时**发送。

### 2-6. 点击通知时的深链接路由

payload 的 `deeplink` 字段解析为 `navigation-routing` 技能的 Route，以保证一致的画面跳转。

```swift
// iOS
func userNotificationCenter(_ center: UNUserNotificationCenter,
                            didReceive response: UNNotificationResponse) async {
    let info = response.notification.request.content.userInfo
    if let link = info["deeplink"] as? String, let url = URL(string: link) {
        await Router.shared.handle(url)        // 映射到 navigation-routing 的 Route
    }
}
```

```kotlin
// Android — 通过 PendingIntent 将 deeplink 传给 MainActivity
val intent = Intent(this, MainActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
    putExtra("deeplink", deeplink)
}
```

### 2-7. Silent / Data-only Message

用于服务器状态同步、角标更新、后台预取。

- **iOS**: `aps.content-available: 1` + 无 `alert` → 调用 `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`。**Background Modes → Remote notifications** 必须勾选。
- **Android**: 无 `notification` 字段、仅有 `data` → `onMessageReceived` 在后台也会被调用。

```json
// iOS silent
{ "aps": { "content-available": 1 }, "sync": "messages" }

// Android data-only
{ "data": { "type": "sync", "target": "messages" } }
```

> iOS 的 silent push **会被系统 throttling**。一秒内发送多次会有一部分被丢弃。重要的同步要用额外的轮询来补强。

## 3. 常见错误

- ❌ 每次启动都向服务器发送令牌(没有变更却浪费流量)。
- ❌ 忽略通知权限被拒绝仍一味发送(用户根本收不到)。
- ❌ 在 Android 上不创建 NotificationChannel 就发送通知(8.0+ 上静默)。
- ❌ 登出时遗漏令牌 unregister → 另一用户在同一设备登录时，通知发给了前一个用户。
- ❌ 忘记续期 APNs 证书(.p12)导致运营中推送中断 → 切换到 Auth Key(.p8)。
- ❌ 在 `onMessageReceived` / FCM 回调中进行主线程网络调用 → ANR(Application Not Responding)。
- ❌ 用字符串比较分支深链接(`if url.contains("chat")`) → 用 Route 模型统一。

## 4. 检查清单

- [ ] 是否在合适的时机请求了通知权限
- [ ] 是否按环境分离了 FCM 配置文件
- [ ] 是否仅在首次发放、轮换、登录、登出时与后端同步令牌
- [ ] 在 Android 上是否在发送通知前注册了 NotificationChannel
- [ ] 是否将 payload 的 deeplink 解析为 Route 模型来路由
- [ ] 是否用 silent/data-only push 处理后台同步并补强了 throttling
- [ ] iOS 是否使用 Auth Key(.p8) 认证
