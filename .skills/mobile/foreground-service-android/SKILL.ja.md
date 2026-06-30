---
name: Android Foreground Service & バックグラウンド位置情報
description: 画面が消えてもGPSトラッキングを維持するForeground Service実装の標準。Android 14+の権限・常駐通知・Doze対応・Play Storeのバックグラウンド位置情報の正当化パッケージを扱うときに読む。キーワード: ForegroundService, startForeground, NotificationChannel, START_STICKY, FOREGROUND_SERVICE, background-geolocation。
rules:
  - "画面が消えてもGPSを維持するにはForeground Serviceとして実行する。"
  - "Android 14+ではforegroundServiceType=location権限を宣言する。"
  - "リアルタイムのメトリクスを表示する常駐通知(ongoing=true)を表示する。"
  - "Doze対応として位置更新の間隔を調整し、進行中データをバックアップする。"
  - "Play Storeのバックグラウンド位置情報の正当化パッケージを提出する。"
tags:
  - "ForegroundService"
  - "startForeground"
  - "NotificationChannel"
  - "START_STICKY"
  - "FOREGROUND_SERVICE"
  - "background-geolocation"
---

# 📍 Android Foreground Service & バックグラウンド位置情報

> 画面が消えてもGPS経路を途切れなく記録するために、Foreground Service + 常駐通知パターンを適用する。ランニング/配達/現場作業などのバックグラウンド位置追跡アプリを作るときに読む。
>
> Capacitor公式の `@capacitor/geolocation` は **フォアグラウンドのみ** を保証する。ユーザーが画面を消したり別のアプリに切り替えると位置イベントが途切れる。関連スキル: 権限処理(permissions-privacy)、Play Storeリリース(android-playstore)。

## 1. 核心原則
- 画面が消えてもGPSを維持するにはForeground Serviceとして実行する。
- Android 14+では `foregroundServiceType=location` 権限を宣言する。
- リアルタイムのメトリクスを表示する常駐通知(ongoing=true)を表示する。
- Doze対応として位置更新の間隔を調整し、進行中データをバックアップする。
- Play Storeのバックグラウンド位置情報の正当化パッケージを提出する。

## 2. ルール

### 2-1. 権限マトリクス (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Android 14+ 必須: 位置情報専用のForeground Serviceタイプ -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<!-- Android 13+ 通知表示権限 -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- 画面が消えてもCPUを維持(断続的なGPSコールバック) -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

```xml
<application ...>
    <service
        android:name="com.transistorsoft.locationmanager.service.TrackingService"
        android:foregroundServiceType="location"
        android:exported="false" />
</application>
```

### 2-2. SDKバージョンの推奨
```gradle
// android/variables.gradle
minSdkVersion = 26    // Android 8 — Foreground Serviceの安定性
targetSdkVersion = 34 // Android 14 — Play Storeの最新要件
compileSdkVersion = 34
```
minSdkを22にすると旧バージョンのAndroidでForeground Serviceの動作が不安定になる。26以上を推奨。

### 2-3. プラグインの選択
| プラグイン | ライセンス | メンテナー | 備考 |
|---|---|---|---|
| **`@capacitor-community/background-geolocation`** | MIT | 活発 | **推奨 — 公式community** |
| `cordova-background-geolocation` | Cordova時代 | 非活発 | 使用禁止 |
| 直接native実装 | - | 自前 | コスト大、v1.0では非推奨 |

```bash
npm install @capacitor-community/background-geolocation
npx cap sync android
```

### 2-4. 初期設定 (TypeScript)
```typescript
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'

export async function startTracking(onLocation: (loc: any) => void) {
  // 通知権限 (Android 13+)
  await LocalNotifications.requestPermissions()

  const watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Running Crow가 러닝 경로를 기록 중입니다',
      backgroundTitle: '러닝 진행 중',
      requestPermissions: true,
      stale: false,           // キャッシュされた位置を拒否
      distanceFilter: 0       // すべての更新を受信
    },
    (location, error) => {
      if (error) { console.error(error); return }
      onLocation(location)
    }
  )
  return watcherId
}

export async function stopTracking(watcherId: string) {
  await BackgroundGeolocation.removeWatcher({ id: watcherId })
}
```

### 2-5. 常駐通知のデザイン (リアルタイムメトリクス)
通知本文にリアルタイム情報を入れると、ユーザーが通知エリアからすぐ確認でき、かつPlay Store審査時に「この通知がバックグラウンド位置情報の使用をユーザーに知らせる明確なシグナルである」ことを立証できる。
```typescript
// 5秒ごとに通知本文を更新
setInterval(async () => {
  await BackgroundGeolocation.addWatcher({
    backgroundMessage: `00:${formatTime(elapsedSec)} · ${distanceKm.toFixed(2)} km · ${pace}`,
    backgroundTitle: '러닝 진행 중',
    // ...
  }, callback)
}, 5000)
```
通知タップ時にライブランニング画面(`/run-active`)へディープリンク。

### 2-6. 省電力モード(Doze)対応
Android 6+のDozeモードでアプリが終了させられることがある。
- **Foreground ServiceはDoze免除対象** — 通知が出ている限りOSは終了させない。
- それでも保守的に: Capacitor Preferencesに5秒ごとに進行中データをバックアップ。
- 強制終了後の再起動時に `app launch` コールバックでバックアップを検査:
```typescript
const backup = await Preferences.get({ key: 'in-progress-run' })
if (backup.value) {
  // ダイアログ: 「進行中だったランニングがあります。続けますか?(00:23 · 3.2km)」
}
```

### 2-7. 権限導線UX (3段階)
```
[ユーザーが「ランニング開始」をタップ]
    ↓
[1] 自アプリの事前説明ダイアログ
    「ランニング経路を記録するために位置権限が必要です。
     次の画面で『常に許可』を選択してください。」
    ↓
[2] OSシステム権限ダイアログ
    Geolocation.requestPermissions()
    ↓
[3] 結果の分岐
    ├─ 精密+常に許可 → トラッキング開始
    ├─ 精密+使用中のみ → 「画面を消すと記録が止まります」案内 + 開始
    ├─ 大まかのみ → フォールバックダイアログ「大まかな位置では記録不可」 + 設定画面へディープリンク
    └─ 永久拒否 → 設定アプリへの誘導案内(システムダイアログを呼んでも表示されない)
```
Android 11+では **「常に許可」をアプリ内ダイアログで表示できない** — システム設定画面へ直接送る必要がある。
```typescript
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

async function openLocationSettings() {
  if (Capacitor.getPlatform() === 'android') {
    // android-intent-pluginまたはnativeブリッジでACTION_LOCATION_SOURCE_SETTINGSを開く
    await App.openSettings()  // 一般的なアプリ設定へfallback
  }
}
```

### 2-8. Play Storeバックグラウンド位置情報の正当化パッケージ (必須)
Play Console **「アプリのコンテンツ > 位置情報」** 項目で、バックグラウンド位置情報を使用する場合に次の4種の資料を提出する。

**① 使用目的テキスト** (韓国語/英語 各200文字以内)
> 「このアプリは、ユーザーがランニング/移動中に画面を消したり別のアプリを使用する場合でも、GPS経路を途切れなく記録するためにバックグラウンド位置権限を使用します。位置データはユーザー本人のランニング記録の保存以外には使用されず、外部に共有されません。」

**② ユーザー可視性スクリーンショット (3枚)**
1. **事前説明ダイアログ** — 権限要求前に自アプリが表示する説明。
2. **システム権限ダイアログ** — OSの「許可/使用中のみ/拒否」画面。
3. **Foreground Service常駐通知** — 通知エリアに常時表示される進行通知。

**③ ユーザー同意導線の短い動画** (任意、推奨) — 10〜30秒の画面録画で、権限要求から通知表示までの流れ。

**④ プライバシーポリシーURL** — 位置データの収集項目・保管期間・第三者提供の有無を明示。位置項目は別セクションで。

> ⚠️ 正当化のレビューは平均3〜7日。拒否理由の第1位は「ユーザー可視性の不足」 — 通知が一時的であったり画面上に出ていないと拒否。**必ず常駐通知 + 通知本文にユーザーが認識可能な情報**。

### 2-9. バッテリー回帰テスト
リリース前に4種の端末で1時間のランニング時のバッテリー消費率を測定。
| 端末 | 目標 | v1.0 合格ライン |
|---|---|---|
| Galaxy S22 | ≤ 6.8% | ≤ 8% |
| Pixel 6 | ≤ 7.2% | ≤ 8% |
| Galaxy Fold4 | ≤ 7.9% | ≤ 8% |
| Galaxy A24 (低スペック) | ≤ 8% | ≤ 10% |

8%を超える場合は (a) GPSサンプリング周波数の適応的強化、(b) 通知更新間隔の減速、(c) BLE心拍計のオプション化でチューニング。

## 3. よくある間違い
- ❌ Foreground Serviceなしでバックグラウンドで位置を受け取ろうとする — Android 8+で5秒後に強制終了。
- ❌ `foregroundServiceType="location"` 未指定 — Android 14+でSecurityException。
- ❌ 通知をdismissible(スワイプで消える)に設定 — Play Store拒否。**ongoing=true必須**。
- ❌ Play Storeの正当化なしでバックグラウンド位置情報をリリース — リリースがブロックされる。
- ❌ ユーザー同意導線を経ずにいきなりシステム権限ダイアログを呼ぶ — 確実に拒否。
- ❌ 位置データの外部送信(分析サーバーなど)にユーザーの別途同意なしで使用 — GDPR/PIPL違反。

## 4. チェックリスト
- [ ] Foreground Service + `foregroundServiceType="location"` を宣言したか
- [ ] 常駐通知(ongoing=true)にリアルタイムメトリクスを表示しているか
- [ ] Doze対応で進行中データを定期的にバックアップしているか
- [ ] 権限導線の3段階(事前説明 → システム → 分岐)を経ているか
- [ ] Play Storeの正当化4種の資料を提出したか
- [ ] 4種の端末のバッテリー回帰テストを通過したか
