---
name: モバイルプッシュ通知 (Push Notifications)
description: iOSのAPNsとAndroidのFCMを同じメンタルモデルで扱うプッシュ通知の標準。プッシュを新たに組み込むときや、権限・トークンのライフサイクル・payload・ディープリンク・silent pushを決めるときに読む。キーワード: FCM, FirebaseMessaging, APNs, UNNotification, registerForRemoteNotifications, FirebaseMessagingService, NotificationChannel, deeplink, silent push。
rules:
  - "プッシュはiOS APNs・Android FCMを共通モデルで扱い、バックエンドの送信チャネルはFCMに一本化する。"
  - "通知権限を要求し、デバイストークンのライフサイクルをサーバーと同期する — 変更時のみ送信する。"
  - "payloadにディープリンクのパスを含め、通知タップ時に画面へ遷移させる。"
  - "Android 8.0+は通知送信の前にNotificationChannelを登録する。"
  - "データ同期はsilent pushで処理する。"
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

# 🔔 モバイルプッシュ通知

> プッシュは権限 → トークン発行 → バックエンド登録 → 受信/表示 → タップ時のルーティング、という5段階のパイプラインだ。一段階でも欠けると「なぜ通知が来ないのか」というCSが殺到する。プッシュを組み込むときやトークン・payload・ディープリンクを決めるときに読む。

## 1. 核心原則

- プッシュはiOS APNs・Android FCMを共通モデルで扱い、バックエンドの送信チャネルはFCMに一本化する。
- 通知権限を要求し、デバイストークンのライフサイクルをサーバーと同期する — 変更時のみ送信する。
- payloadにディープリンクのパスを含め、通知タップ時に画面へ遷移させる。
- Android 8.0+は通知送信の前にNotificationChannelを登録する。
- データ同期はsilent pushで処理する。

## 2. ルール

### 2-1. 権限要求 (Cross-link)

通知権限そのものの要求タイミング・拒否からの復帰フローは `permissions-privacy` スキルで扱う。

- iOS: `UNUserNotificationCenter.requestAuthorization`
- Android 13+: `POST_NOTIFICATIONS` ランタイム権限

> アプリの初回起動で尋ねず、**ユーザーが通知の価値を認識した直後**に要求せよ。

### 2-2. Firebase共通セットアップ

iOS/Androidいずれもバックエンドの送信チャネルをFCMに一本化する。両プラットフォームに個別のSDKを置かないこと。

| 項目 | iOS | Android |
|------|-----|---------|
| 設定ファイル | `GoogleService-Info.plist` | `google-services.json` |
| 配置場所 | アプリターゲットのルート、Build Phasesに含める | `app/` モジュールのルート |
| 依存関係 | `FirebaseMessaging` (SPM) | `com.google.firebase:firebase-messaging-ktx` |
| バックエンド送信キー | FirebaseコンソールのサービスアカウントJSON | 同じ |

> ⚠️ 設定ファイルは環境別(dev/staging/prod)に分離する。Build Configuration / Product Flavorごとに別ファイルを注入する。

### 2-3. iOS — APNsトークンの受信と登録

iOSはAPNsが一次チャネルで、FCMはその上でトークンをマッピングする。認証は **Auth Key(.p8)を推奨** — 期限切れなし、全アプリで共用。証明書(.p12)は1年で期限切れになるため運用負担が大きい。

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

    // APNsデバイストークン → FCM へ転送
    func application(_ app: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    // FCMトークン (最終的にバックエンドへ送る値)
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { await PushTokenRepository.shared.registerIfChanged(fcmToken) }
    }

    // フォアグラウンドでも通知を表示
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async
                                -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound]
    }
}
```

APNs payload構造:
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
        // トークン更新時に呼ばれる (アプリ再インストール、データ初期化、定期ローテーション)
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

NotificationChannel (Android 8.0+で必須):
```kotlin
val channel = NotificationChannel(
    "chat",                                  // channelId — サーバーのpayloadと一致する必要がある
    "채팅 알림",                              // ユーザーに見える名前
    NotificationManager.IMPORTANCE_HIGH
).apply { description = "새 메시지 알림" }

val nm = getSystemService(NotificationManager::class.java)
nm.createNotificationChannel(channel)
```

> ⚠️ チャネルはアプリ起動直後(例: `Application.onCreate`)に一度だけ作成する。チャネル作成前に通知を送ると、**Android 8.0+では表示そのものがされない**。

Manifest登録:
```xml
<service android:name=".AppMessagingService" android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### 2-5. トークンのライフサイクル — いつバックエンドへ送るか

| タイミング | iOS | Android | バックエンド送信 |
|------|-----|---------|-------------|
| 初回発行 | `didReceiveRegistrationToken` | `onNewToken` | ✅ |
| トークンローテーション(更新) | 同じ | `onNewToken` | ✅ |
| ログイン直後 | 直接呼び出し | 直接呼び出し | ✅ (user-tokenマッピング) |
| ログアウト | 直接呼び出し | 直接呼び出し | ✅ **unregister** |
| 起動のたび | ❌ | ❌ | 毎回送らないこと |

```kotlin
object PushTokenRepository {
    private var lastSent: String? = null
    suspend fun registerIfChanged(token: String) {
        if (token == lastSent) return
        api.registerPushToken(token)   // networking-apiスキルのTokenStore認証フローを活用
        lastSent = token
    }
    suspend fun unregister() { api.unregisterPushToken(); lastSent = null }
}
```

> 起動のたびにトークンをサーバーへ送ると、トラフィック・DB書き込みの無駄になる。**変更時のみ**送れ。

### 2-6. 通知タップ時のディープリンクルーティング

payloadの `deeplink` フィールドは `navigation-routing` スキルのRouteにパースして、一貫した画面遷移を保証する。

```swift
// iOS
func userNotificationCenter(_ center: UNUserNotificationCenter,
                            didReceive response: UNNotificationResponse) async {
    let info = response.notification.request.content.userInfo
    if let link = info["deeplink"] as? String, let url = URL(string: link) {
        await Router.shared.handle(url)        // navigation-routing のRouteへマッピング
    }
}
```

```kotlin
// Android — PendingIntent でMainActivityへdeeplinkを渡す
val intent = Intent(this, MainActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
    putExtra("deeplink", deeplink)
}
```

### 2-7. Silent / Data-only Message

サーバー状態の同期、バッジ更新、バックグラウンドプリフェッチ用途。

- **iOS**: `aps.content-available: 1` + `alert` なし → `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` が呼ばれる。**Background Modes → Remote notifications** のチェックが必須。
- **Android**: `notification` フィールドなしで `data` のみ → `onMessageReceived` がバックグラウンドでも呼ばれる。

```json
// iOS silent
{ "aps": { "content-available": 1 }, "sync": "messages" }

// Android data-only
{ "data": { "type": "sync", "target": "messages" } }
```

> iOSのsilent pushは**システムがthrottling**する。1秒に複数回送ると一部がドロップされる。重要な同期は別途ポーリングで補強する。

## 3. よくある間違い

- ❌ 起動のたびにトークンをサーバーへ毎回送信(変更がないのにトラフィックの無駄)。
- ❌ 通知権限の拒否を無視して送信だけ続ける(ユーザーは受け取れもしない)。
- ❌ AndroidでNotificationChannelを作らずに通知を送信(8.0+で無音)。
- ❌ ログアウト時のトークンunregister漏れ → 別のユーザーが同じ端末でログインしたとき、前のユーザーに通知が届く。
- ❌ APNs証明書(.p12)の更新を忘れて運用中にプッシュ停止 → Auth Key(.p8)へ切り替える。
- ❌ `onMessageReceived` / FCMコールバックでメインスレッドのネットワーク呼び出し → ANR(Application Not Responding)。
- ❌ ディープリンクを文字列比較で分岐(`if url.contains("chat")`) → Routeモデルで統一せよ。

## 4. チェックリスト

- [ ] 通知権限を適切なタイミングで要求したか
- [ ] FCM設定ファイルを環境別に分離したか
- [ ] トークンを初回発行・ローテーション・ログイン・ログアウトのタイミングのみでバックエンドと同期しているか
- [ ] Androidで通知送信の前にNotificationChannelを登録したか
- [ ] payloadのdeeplinkをRouteモデルにパースしてルーティングしているか
- [ ] silent/data-only pushでバックグラウンド同期を処理し、throttlingを補強したか
- [ ] iOSはAuth Key(.p8)認証を使っているか
