---
name: Android Foreground Service 与后台定位
description: 实现即使屏幕熄灭也能保持 GPS 跟踪的 Foreground Service 标准。处理 Android 14+ 权限、常驻通知、Doze 应对、Play Store 后台定位正当性材料包时阅读。关键词: ForegroundService, startForeground, NotificationChannel, START_STICKY, FOREGROUND_SERVICE, background-geolocation。
rules:
  - "若要在屏幕熄灭时仍保持 GPS，请作为 Foreground Service 运行。"
  - "在 Android 14+ 上声明 foregroundServiceType=location 权限。"
  - "弹出展示实时指标的常驻通知(ongoing=true)。"
  - "应对 Doze 模式，调整定位更新周期并备份进行中数据。"
  - "提交 Play Store 后台定位正当性材料包。"
tags:
  - "ForegroundService"
  - "startForeground"
  - "NotificationChannel"
  - "START_STICKY"
  - "FOREGROUND_SERVICE"
  - "background-geolocation"
---

# 📍 Android Foreground Service 与后台定位

> 应用 Foreground Service + 常驻通知模式，即使屏幕熄灭也能不间断地记录 GPS 路径。在制作跑步/配送/现场作业等后台定位跟踪应用时阅读。
>
> Capacitor 官方的 `@capacitor/geolocation` 只保证 **前台** 运行。当用户熄屏或切换到其他应用时定位事件会中断。相关技能: 权限处理(permissions-privacy)、Play Store 发布(android-playstore)。

## 1. 核心原则
- 若要在屏幕熄灭时仍保持 GPS，请作为 Foreground Service 运行。
- 在 Android 14+ 上声明 `foregroundServiceType=location` 权限。
- 弹出展示实时指标的常驻通知(ongoing=true)。
- 应对 Doze 模式，调整定位更新周期并备份进行中数据。
- 提交 Play Store 后台定位正当性材料包。

## 2. 规则

### 2-1. 权限矩阵 (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Android 14+ 必需: 仅定位的 Foreground Service 类型 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<!-- Android 13+ 通知显示权限 -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- 熄屏也保持 CPU(间歇性 GPS 回调) -->
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

### 2-2. SDK 版本建议
```gradle
// android/variables.gradle
minSdkVersion = 26    // Android 8 — Foreground Service 稳定性
targetSdkVersion = 34 // Android 14 — Play Store 最新要求
compileSdkVersion = 34
```
将 minSdk 设为 22 会使旧版 Android 上的 Foreground Service 行为不稳定。建议 26 及以上。

### 2-3. 插件选择
| 插件 | 许可证 | 维护者 | 备注 |
|---|---|---|---|
| **`@capacitor-community/background-geolocation`** | MIT | 活跃 | **推荐 — 官方 community** |
| `cordova-background-geolocation` | Cordova 时代 | 不活跃 | 禁止使用 |
| 自行 native 实现 | - | 自有 | 成本大，不推荐用于 v1.0 |

```bash
npm install @capacitor-community/background-geolocation
npx cap sync android
```

### 2-4. 初始设置 (TypeScript)
```typescript
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'

export async function startTracking(onLocation: (loc: any) => void) {
  // 通知权限 (Android 13+)
  await LocalNotifications.requestPermissions()

  const watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Running Crow가 러닝 경로를 기록 중입니다',
      backgroundTitle: '러닝 진행 중',
      requestPermissions: true,
      stale: false,           // 拒绝缓存的位置
      distanceFilter: 0       // 接收所有更新
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

### 2-5. 常驻通知设计 (实时指标)
在通知正文中放入实时信息，可让用户从通知区域直接查看，同时在 Play Store 审核时能够证明"该通知是向用户告知后台定位使用的明确信号"。
```typescript
// 每 5 秒更新通知正文
setInterval(async () => {
  await BackgroundGeolocation.addWatcher({
    backgroundMessage: `00:${formatTime(elapsedSec)} · ${distanceKm.toFixed(2)} km · ${pace}`,
    backgroundTitle: '러닝 진행 중',
    // ...
  }, callback)
}, 5000)
```
点击通知时深链接到实时跑步界面(`/run-active`)。

### 2-6. 省电模式(Doze)应对
在 Android 6+ 的 Doze 模式下应用可能被终止。
- **Foreground Service 是 Doze 豁免对象** — 只要通知还在显示，OS 就不会终止它。
- 即便如此也要保守处理: 每 5 秒向 Capacitor Preferences 备份进行中数据。
- 强制终止后重启时，在 `app launch` 回调中检查备份:
```typescript
const backup = await Preferences.get({ key: 'in-progress-run' })
if (backup.value) {
  // 对话框: "有一次进行中的跑步。要继续吗?(00:23 · 3.2km)"
}
```

### 2-7. 权限流程 UX (3 步)
```
[用户点击"开始跑步"]
    ↓
[1] 本应用的预告知对话框
    "为记录跑步路径需要定位权限。
     请在下一个界面选择'始终允许'。"
    ↓
[2] OS 系统权限对话框
    Geolocation.requestPermissions()
    ↓
[3] 结果分支
    ├─ 精确+始终允许 → 开始跟踪
    ├─ 精确+仅使用期间 → "熄屏后记录会停止"提示 + 开始
    ├─ 仅大致位置 → 回退对话框"大致位置无法记录" + 深链接到设置界面
    └─ 永久拒绝 → 引导前往设置应用(即使调用系统对话框也不会弹出)
```
在 Android 11+ 上 **无法通过应用内对话框弹出"始终允许"** — 必须直接发送到系统设置界面。
```typescript
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

async function openLocationSettings() {
  if (Capacitor.getPlatform() === 'android') {
    // 通过 android-intent-plugin 或 native 桥打开 ACTION_LOCATION_SOURCE_SETTINGS
    await App.openSettings()  // 回退到常规应用设置
  }
}
```

### 2-8. Play Store 后台定位正当性材料包 (必需)
在 Play Console **"应用内容 > 位置信息"** 项中，使用后台定位时提交以下 4 种材料。

**① 使用目的文本** (韩文/英文 各 200 字以内)
> "本应用使用后台定位权限，以便在用户跑步/移动过程中熄屏或使用其他应用时也能不间断地记录 GPS 路径。位置数据仅用于保存用户本人的跑步记录，不会对外共享。"

**② 用户可见性截图 (3 张)**
1. **预告知对话框** — 权限请求前本应用弹出的说明。
2. **系统权限对话框** — OS 的"允许/仅使用期间/拒绝"界面。
3. **Foreground Service 常驻通知** — 在通知区域始终显示的进行通知。

**③ 用户同意流程短视频** (可选，推荐) — 10〜30 秒的屏幕录制，展示从权限请求到通知显示的流程。

**④ 隐私政策 URL** — 明示位置数据的收集项目、保存期限、是否提供给第三方。位置项目应作为单独章节。

> ⚠️ 正当性审查平均需 3〜7 天。拒绝理由第一位是"用户可见性不足" — 若通知是临时的或未显示在屏幕上则拒绝。**务必使用常驻通知 + 通知正文中含用户可识别的信息**。

### 2-9. 电池回归测试
发布前在 4 种设备上测量 1 小时跑步时的电池消耗率。
| 设备 | 目标 | v1.0 合格线 |
|---|---|---|
| Galaxy S22 | ≤ 6.8% | ≤ 8% |
| Pixel 6 | ≤ 7.2% | ≤ 8% |
| Galaxy Fold4 | ≤ 7.9% | ≤ 8% |
| Galaxy A24 (低配) | ≤ 8% | ≤ 10% |

超过 8% 时通过 (a) GPS 采样频率自适应增强、(b) 减慢通知更新周期、(c) 将 BLE 心率计设为可选 进行调优。

## 3. 常见错误
- ❌ 不用 Foreground Service 就尝试在后台接收位置 — 在 Android 8+ 上 5 秒后被强制终止。
- ❌ 未指定 `foregroundServiceType="location"` — 在 Android 14+ 上 SecurityException。
- ❌ 将通知设为 dismissible(可滑动消除) — Play Store 拒绝。**ongoing=true 必需**。
- ❌ 未经 Play Store 正当性即发布后台定位 — 发布被阻止。
- ❌ 不经过用户同意流程就直接调用系统权限对话框 — 必然被拒绝。
- ❌ 未经用户单独同意就将位置数据用于外部发送(分析服务器等) — 违反 GDPR/PIPL。

## 4. 检查清单
- [ ] 是否声明了 Foreground Service + `foregroundServiceType="location"`
- [ ] 常驻通知(ongoing=true)是否显示实时指标
- [ ] 是否通过 Doze 应对定期备份进行中数据
- [ ] 是否经过权限流程 3 步(预告知 → 系统 → 分支)
- [ ] 是否提交了 Play Store 正当性 4 种材料
- [ ] 是否通过了 4 种设备的电池回归测试
