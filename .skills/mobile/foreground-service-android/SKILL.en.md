---
name: Android Foreground Service & Background Location
description: Standard for implementing a Foreground Service that keeps GPS tracking alive even when the screen is off. Read this when dealing with Android 14+ permissions, persistent notifications, Doze handling, and the Play Store background-location justification package. Keywords: ForegroundService, startForeground, NotificationChannel, START_STICKY, FOREGROUND_SERVICE, background-geolocation.
rules:
  - "To keep GPS alive even when the screen is off, run it as a Foreground Service."
  - "On Android 14+, declare the foregroundServiceType=location permission."
  - "Show a persistent notification (ongoing=true) that displays real-time metrics."
  - "Handle Doze mode by adjusting the location update interval and backing up progress data."
  - "Submit the Play Store background-location justification package."
tags:
  - "ForegroundService"
  - "startForeground"
  - "NotificationChannel"
  - "START_STICKY"
  - "FOREGROUND_SERVICE"
  - "background-geolocation"
---

# 📍 Android Foreground Service & Background Location

> Apply the Foreground Service + persistent notification pattern to record GPS routes seamlessly even when the screen is off. Read this when building background location-tracking apps such as running/delivery/fieldwork apps.
>
> The official Capacitor `@capacitor/geolocation` only guarantees **foreground** operation. When the user turns off the screen or switches to another app, location events stop. Related skills: permission handling (permissions-privacy), Play Store release (android-playstore).

## 1. Core Principles
- To keep GPS alive even when the screen is off, run it as a Foreground Service.
- On Android 14+, declare the `foregroundServiceType=location` permission.
- Show a persistent notification (ongoing=true) that displays real-time metrics.
- Handle Doze mode by adjusting the location update interval and backing up progress data.
- Submit the Play Store background-location justification package.

## 2. Rules

### 2-1. Permission Matrix (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Required on Android 14+: location-only Foreground Service type -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<!-- Android 13+ notification display permission -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- Keep CPU alive while screen is off (intermittent GPS callbacks) -->
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

### 2-2. SDK Version Recommendations
```gradle
// android/variables.gradle
minSdkVersion = 26    // Android 8 — Foreground Service stability
targetSdkVersion = 34 // Android 14 — latest Play Store requirement
compileSdkVersion = 34
```
Setting minSdk to 22 makes Foreground Service behavior unstable on older Android. 26 or higher is recommended.

### 2-3. Plugin Choice
| Plugin | License | Maintainer | Notes |
|---|---|---|---|
| **`@capacitor-community/background-geolocation`** | MIT | Active | **Recommended — official community** |
| `cordova-background-geolocation` | Cordova era | Inactive | Do not use |
| Direct native implementation | - | In-house | High cost, not recommended for v1.0 |

```bash
npm install @capacitor-community/background-geolocation
npx cap sync android
```

### 2-4. Initial Setup (TypeScript)
```typescript
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'

export async function startTracking(onLocation: (loc: any) => void) {
  // Notification permission (Android 13+)
  await LocalNotifications.requestPermissions()

  const watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Running Crow가 러닝 경로를 기록 중입니다',
      backgroundTitle: '러닝 진행 중',
      requestPermissions: true,
      stale: false,           // Reject cached locations
      distanceFilter: 0       // Receive all updates
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

### 2-5. Persistent Notification Design (Real-time Metrics)
Putting real-time information in the notification body lets the user check it directly from the notification area, and it lets you prove during Play Store review that "this notification is a clear signal informing the user of background location use."
```typescript
// Update the notification body every 5 seconds
setInterval(async () => {
  await BackgroundGeolocation.addWatcher({
    backgroundMessage: `00:${formatTime(elapsedSec)} · ${distanceKm.toFixed(2)} km · ${pace}`,
    backgroundTitle: '러닝 진행 중',
    // ...
  }, callback)
}, 5000)
```
Deep-link to the live running screen (`/run-active`) when the notification is tapped.

### 2-6. Power-saving Mode (Doze) Handling
On Android 6+ Doze mode, the app can be killed.
- **Foreground Service is exempt from Doze** — the OS will not kill it as long as the notification is showing.
- Even so, be conservative: back up in-progress data to Capacitor Preferences every 5 seconds.
- On restart after a force-kill, check the backup in the `app launch` callback:
```typescript
const backup = await Preferences.get({ key: 'in-progress-run' })
if (backup.value) {
  // Dialog: "You have a run in progress. Continue? (00:23 · 3.2km)"
}
```

### 2-7. Permission Flow UX (3 Steps)
```
[User taps 'Start Run']
    ↓
[1] Our app's pre-prompt dialog
    "Location permission is needed to record your running route.
     Please select 'Allow all the time' on the next screen."
    ↓
[2] OS system permission dialog
    Geolocation.requestPermissions()
    ↓
[3] Result branching
    ├─ Precise + Always allow → Start tracking
    ├─ Precise + While using only → Notice "Recording stops when the screen turns off" + start
    ├─ Approximate only → Fallback dialog "Recording impossible with approximate location" + deep-link to settings
    └─ Permanently denied → Guide to the Settings app (the system dialog won't appear even if called)
```
On Android 11+, **you cannot show "Allow all the time" via an in-app dialog** — you must send the user directly to the system settings screen.
```typescript
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

async function openLocationSettings() {
  if (Capacitor.getPlatform() === 'android') {
    // Open ACTION_LOCATION_SOURCE_SETTINGS via android-intent-plugin or a native bridge
    await App.openSettings()  // Fallback to general app settings
  }
}
```

### 2-8. Play Store Background-Location Justification Package (Required)
In the Play Console **"App content > Location"** section, submit the following 4 materials when using background location.

**① Purpose-of-use text** (within 200 characters each, Korean/English)
> "This app uses background location permission to seamlessly record GPS routes even when the user turns off the screen or uses another app while running/moving. Location data is used only to save the user's own running records and is never shared externally."

**② User-visibility screenshots (3)**
1. **Pre-prompt dialog** — the explanation our app shows before the permission request.
2. **System permission dialog** — the OS's "Allow/While using only/Deny" screen.
3. **Foreground Service persistent notification** — the progress notification always shown in the notification area.

**③ Short video of the user-consent flow** (optional, recommended) — a 10–30 second screen recording from the permission request to the notification display.

**④ Privacy policy URL** — specifying the location data collected, retention period, and whether it is provided to third parties. The location item should be in a separate section.

> ⚠️ Justification review takes 3–7 days on average. The #1 rejection reason is "insufficient user visibility" — rejection if the notification is transient or not shown on screen. **A persistent notification + user-recognizable information in the notification body is mandatory.**

### 2-9. Battery Regression Testing
Before release, measure battery drain over a 1-hour run on 4 devices.
| Device | Target | v1.0 Pass Line |
|---|---|---|
| Galaxy S22 | ≤ 6.8% | ≤ 8% |
| Pixel 6 | ≤ 7.2% | ≤ 8% |
| Galaxy Fold4 | ≤ 7.9% | ≤ 8% |
| Galaxy A24 (low-end) | ≤ 8% | ≤ 10% |

If it exceeds 8%, tune with (a) adaptive strengthening of GPS sampling frequency, (b) slowing the notification update interval, (c) making the BLE heart-rate monitor optional.

## 3. Common Mistakes
- ❌ Trying to receive location in the background without a Foreground Service — force-killed after 5 seconds on Android 8+.
- ❌ Not specifying `foregroundServiceType="location"` — SecurityException on Android 14+.
- ❌ Setting the notification as dismissible (can be swiped away) — Play Store rejection. **ongoing=true is mandatory.**
- ❌ Releasing background location without Play Store justification — release blocked.
- ❌ Calling the system permission dialog directly without going through the user-consent flow — guaranteed denial.
- ❌ Using location data for external transmission (analytics servers, etc.) without separate user consent — GDPR/PIPL violation.

## 4. Checklist
- [ ] Did you declare a Foreground Service + `foregroundServiceType="location"`?
- [ ] Does the persistent notification (ongoing=true) display real-time metrics?
- [ ] Does Doze handling periodically back up progress data?
- [ ] Do you go through the 3-step permission flow (pre-prompt → system → branching)?
- [ ] Did you submit the 4 Play Store justification materials?
- [ ] Did you pass the 4-device battery regression test?
