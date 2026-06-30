---
name: Android Foreground Service & 백그라운드 위치
description: 화면이 꺼져도 GPS 트래킹을 유지하는 Foreground Service 구현 표준. Android 14+ 권한·영구 알림·Doze 대응·Play Store 백그라운드 위치 정당화 패키지를 다룰 때 읽는다. 키워드: ForegroundService, startForeground, NotificationChannel, START_STICKY, FOREGROUND_SERVICE, background-geolocation.
rules:
  - "화면이 꺼져도 GPS를 유지하려면 Foreground Service로 실행한다."
  - "Android 14+는 foregroundServiceType=location 권한을 선언한다."
  - "실시간 메트릭을 보여주는 영구 알림(ongoing=true)을 띄운다."
  - "Doze 모드 대응으로 위치 갱신 주기를 조정하고 진행 데이터를 백업한다."
  - "Play Store 백그라운드 위치 정당화 패키지를 제출한다."
tags:
  - "ForegroundService"
  - "startForeground"
  - "NotificationChannel"
  - "START_STICKY"
  - "FOREGROUND_SERVICE"
  - "background-geolocation"
---

# 📍 Android Foreground Service & 백그라운드 위치

> 화면이 꺼져도 GPS 경로를 끊김 없이 기록하기 위해 Foreground Service + 영구 알림 패턴을 적용한다. 러닝/배달/현장작업 등 백그라운드 위치 추적 앱을 만들 때 읽는다.
>
> Capacitor 공식 `@capacitor/geolocation`은 **포어그라운드만** 보장한다. 사용자가 화면을 끄거나 다른 앱으로 전환하면 위치 이벤트가 끊긴다. 관련 스킬: 권한 처리(permissions-privacy), Play Store 출시(android-playstore).

## 1. 핵심 원칙
- 화면이 꺼져도 GPS를 유지하려면 Foreground Service로 실행한다.
- Android 14+는 `foregroundServiceType=location` 권한을 선언한다.
- 실시간 메트릭을 보여주는 영구 알림(ongoing=true)을 띄운다.
- Doze 모드 대응으로 위치 갱신 주기를 조정하고 진행 데이터를 백업한다.
- Play Store 백그라운드 위치 정당화 패키지를 제출한다.

## 2. 규칙

### 2-1. 권한 매트릭스 (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Android 14+ 필수: 위치 전용 Foreground Service 타입 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<!-- Android 13+ 알림 표시 권한 -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- 화면 꺼져도 CPU 유지 (간헐적 GPS 콜백) -->
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

### 2-2. SDK 버전 권고
```gradle
// android/variables.gradle
minSdkVersion = 26    // Android 8 — Foreground Service 안정성
targetSdkVersion = 34 // Android 14 — Play Store 최신 요구사항
compileSdkVersion = 34
```
minSdk 22로 두면 구버전 Android에서 Foreground Service 동작이 불안정. 26 이상 권장.

### 2-3. 플러그인 선택
| 플러그인 | 라이선스 | 메인테이너 | 비고 |
|---|---|---|---|
| **`@capacitor-community/background-geolocation`** | MIT | 활발 | **권장 — 공식 community** |
| `cordova-background-geolocation` | Cordova 시대 | 비활성 | 사용 금지 |
| 직접 native 구현 | - | 자체 | 비용 큼, v1.0 권장 아님 |

```bash
npm install @capacitor-community/background-geolocation
npx cap sync android
```

### 2-4. 초기 설정 (TypeScript)
```typescript
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'

export async function startTracking(onLocation: (loc: any) => void) {
  // 알림 권한 (Android 13+)
  await LocalNotifications.requestPermissions()

  const watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Running Crow가 러닝 경로를 기록 중입니다',
      backgroundTitle: '러닝 진행 중',
      requestPermissions: true,
      stale: false,           // 캐시된 위치 거부
      distanceFilter: 0       // 모든 업데이트 수신
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

### 2-5. 영구 알림 디자인 (실시간 메트릭)
알림 본문에 실시간 정보를 넣으면 사용자가 알림 영역에서 바로 확인 가능 + Play Store 검수 시 "이 알림이 백그라운드 위치 사용을 사용자에게 알리는 명백한 신호"임을 입증할 수 있다.
```typescript
// 5초마다 알림 본문 갱신
setInterval(async () => {
  await BackgroundGeolocation.addWatcher({
    backgroundMessage: `00:${formatTime(elapsedSec)} · ${distanceKm.toFixed(2)} km · ${pace}`,
    backgroundTitle: '러닝 진행 중',
    // ...
  }, callback)
}, 5000)
```
알림 탭 시 라이브 러닝 화면(`/run-active`)으로 딥링크.

### 2-6. 절전 모드(Doze) 대응
Android 6+ Doze 모드에서 앱이 꺼질 수 있다.
- **Foreground Service는 Doze 면제 대상** — 알림이 떠 있는 한 OS가 죽이지 않는다.
- 그래도 보수적으로: Capacitor Preferences에 5초마다 진행 중 데이터 백업.
- 강제 종료 후 재시작 시 `app launch` 콜백에서 백업 검사:
```typescript
const backup = await Preferences.get({ key: 'in-progress-run' })
if (backup.value) {
  // 다이얼로그: "진행 중이던 러닝이 있습니다. 계속할까요? (00:23 · 3.2km)"
}
```

### 2-7. 권한 동선 UX (3단계)
```
[사용자가 '러닝 시작' 탭]
    ↓
[1] 우리 앱 사전 안내 다이얼로그
    "러닝 경로 기록을 위해 위치 권한이 필요합니다.
     다음 화면에서 '항상 허용'을 선택해 주세요."
    ↓
[2] OS 시스템 권한 다이얼로그
    Geolocation.requestPermissions()
    ↓
[3] 결과 분기
    ├─ 정밀+항상 허용 → 트래킹 시작
    ├─ 정밀+사용 중만 → "화면을 끄면 기록이 멈춥니다" 안내 + 시작
    ├─ 대략적만 → 폴백 다이얼로그 "대략적 위치로는 기록 불가" + 설정 화면 딥링크
    └─ 영구 거부 → 설정 앱 이동 안내 (시스템 다이얼로그 호출해도 안 뜸)
```
Android 11+ 에서는 **"항상 허용"을 앱 내 다이얼로그로 못 띄움** — 시스템 설정 화면으로 직접 보내야 한다.
```typescript
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

async function openLocationSettings() {
  if (Capacitor.getPlatform() === 'android') {
    // android-intent-plugin 또는 native 브리지로 ACTION_LOCATION_SOURCE_SETTINGS 열기
    await App.openSettings()  // 일반 앱 설정으로 fallback
  }
}
```

### 2-8. Play Store 백그라운드 위치 정당화 패키지 (필수)
Play Console **"앱 콘텐츠 > 위치"** 항목에서 백그라운드 위치 사용 시 다음 4종 자료 제출.

**① 사용 목적 텍스트** (한국어/영어 200자 이내 각각)
> "이 앱은 사용자가 러닝/이동 중 화면을 끄거나 다른 앱을 사용할 때에도 GPS 경로를 끊김 없이 기록하기 위해 백그라운드 위치 권한을 사용합니다. 위치 데이터는 사용자 본인의 러닝 기록 저장 외에는 사용되지 않으며, 외부에 공유되지 않습니다."

**② 사용자 가시성 스크린샷 (3장)**
1. **사전 안내 다이얼로그** — 권한 요청 전 우리 앱이 띄우는 설명.
2. **시스템 권한 다이얼로그** — OS의 "허용/사용 중만/거부" 화면.
3. **Foreground Service 영구 알림** — 알림 영역에 항상 노출되는 진행 알림.

**③ 사용자 동의 동선 짧은 영상** (선택, 권장) — 10~30초 화면 녹화로 권한 요청부터 알림 표시까지의 흐름.

**④ 개인정보 처리방침 URL** — 위치 데이터 수집 항목·보관 기간·제3자 제공 여부를 명시. 위치 항목은 별도 섹션으로.

> ⚠️ 정당화 검토 평균 3~7일. 거절 사유 1순위는 "사용자 가시성 부족" — 알림이 일시적이거나 화면 위에 떠 있지 않으면 거절. **반드시 영구 알림 + 알림 본문에 사용자 인지 가능한 정보**.

### 2-9. 배터리 회귀 테스트
출시 전 4종 기기에서 1시간 러닝 시 배터리 소모율 측정.
| 기기 | 목표 | v1.0 합격선 |
|---|---|---|
| Galaxy S22 | ≤ 6.8% | ≤ 8% |
| Pixel 6 | ≤ 7.2% | ≤ 8% |
| 갤럭시 폴드4 | ≤ 7.9% | ≤ 8% |
| Galaxy A24 (저사양) | ≤ 8% | ≤ 10% |

8% 초과 시 (a) GPS 샘플링 주파수 적응형 강화, (b) 알림 갱신 주기 감속, (c) BLE 심박계 옵션 처리로 튜닝.

## 3. 흔한 실수
- ❌ Foreground Service 없이 백그라운드에서 위치 받기 시도 — Android 8+에서 5초 후 강제 종료.
- ❌ `foregroundServiceType="location"` 미지정 — Android 14+에서 SecurityException.
- ❌ 알림을 dismissible(스와이프로 사라지게) 설정 — Play Store 거절. **ongoing=true 필수**.
- ❌ Play Store 정당화 없이 백그라운드 위치 출시 — 출시 차단.
- ❌ 사용자 동의 동선을 거치지 않고 곧바로 시스템 권한 다이얼로그 호출 — 무조건 거부.
- ❌ 위치 데이터 외부 송신(분석 서버 등)에 사용자 별도 동의 없이 — GDPR/PIPL 위반.

## 4. 체크리스트
- [ ] Foreground Service + `foregroundServiceType="location"`를 선언했는가
- [ ] 영구 알림(ongoing=true)에 실시간 메트릭을 표시하는가
- [ ] Doze 대응으로 진행 데이터를 주기적으로 백업하는가
- [ ] 권한 동선 3단계(사전 안내 → 시스템 → 분기)를 거치는가
- [ ] Play Store 정당화 4종 자료를 제출했는가
- [ ] 4종 기기 배터리 회귀 테스트를 통과했는가
