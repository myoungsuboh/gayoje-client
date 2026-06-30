---
name: iOS App Store 上架指南 (iOS App Store Submission)
description: 从加入 Apple Developer 到通过 App Store 审核的分步部署标准。首次发布 iOS 应用，或排查证书、配置文件、审核被拒陷阱时，按顺序阅读。关键词: xcode, TestFlight, App Store Connect, archive, codesign, ExportOptions, Privacy Manifest, provisioning。
rules:
  - "加入 Apple Developer Program(每年 $99，激活最长 48 小时)。"
  - "注册唯一的 Bundle ID — 一旦注册不可更改。"
  - "创建用于分发的 Distribution 证书和 Provisioning Profile(证书每团队 1 个)。"
  - "在 Xcode 中确认签名设置与版本、构建号 — 构建号每次递增。"
  - "事先排查审核被拒陷阱(权限理由、隐私标签、Privacy Manifest)。"
tags:
  - "xcode"
  - "TestFlight"
  - "App Store Connect"
  - "archive"
  - "codesign"
  - "ExportOptions"
  - "Privacy Manifest"
  - "provisioning"
---

# 🍎 iOS App Store 上架指南

> 从 Apple Developer 注册到通过 App Store 审核按顺序进行。首次部署 iOS 应用或事先排查被拒陷阱时阅读。
>
> ⚠️ Apple 会因一个小失误就拒绝(Reject)应用。从一开始就按顺序进行才不会浪费时间。

## 1. 核心原则
- 加入 Apple Developer Program(每年 $99，激活最长 48 小时)。
- 注册唯一的 Bundle ID — 一旦注册不可更改。
- 创建用于分发的 Distribution 证书和 Provisioning Profile(证书每团队 1 个)。
- 在 Xcode 中确认签名设置与版本、构建号 — 构建号每次递增。
- 事先排查审核被拒陷阱(权限理由、隐私标签、Privacy Manifest)。

## 2. 规则

### 2-1. 加入 Apple Developer Program (每年 $99)
1. [developer.apple.com](https://developer.apple.com) → 登录账户 → **Enroll**
2. 选择个人(Individual)或公司(Organization)
   - 个人: 以本人姓名发布
   - 公司: 需要 DUNS 编号，审核需 1〜2 周
3. 支付 $99 → **激活最长需 48 小时**(需要等待)。

### 2-2. 注册 Bundle ID (应用的唯一 ID)
1. [developer.apple.com/account](https://developer.apple.com/account) → **Identifiers** → **+** → **App IDs** → **App**
2. 输入 Bundle ID: `com.公司名.应用名` 格式 (例: `com.harness.digitaltwins`)
   - 一旦注册 **不可更改** → 慎重决定。
3. 勾选所需的 Capabilities: Push Notifications, Sign in with Apple, In-App Purchase → **Register**

### 2-3. 创建证书(Certificate)
**Development Certificate** (开发/设备测试): Xcode → **Preferences** → **Accounts** → 账户 → **Manage Certificates** → **+** → **Apple Development** (自动生成，推荐)。

**Distribution Certificate** (App Store 提交):
1. **钥匙串访问** → **证书助理** → **从证书颁发机构请求证书** → 保存 `CertificateSigningRequest.certSigningRequest`
2. developer.apple.com → **Certificates** → **+** → **Apple Distribution** → 上传 CSR → 下载
3. 双击 `.cer` → 自动安装到钥匙串
> ⚠️ Distribution Certificate **每团队只发放 1 个**。若已有则使用现有的。

### 2-4. 创建 Provisioning Profile (用于 App Store 分发)
将证书 + Bundle ID + 设备绑在一起的文件。没有它就无法安装/分发。
1. developer.apple.com → **Profiles** → **+** → **App Store Connect**
2. 选择 Bundle ID(2-2) → 选择 Distribution Certificate(2-3)
3. 输入名称(例: `Harness_AppStore`) → **Generate** → 下载
4. 双击 `.mobileprovision` → Xcode 自动注册

### 2-5. Xcode 项目设置 (Signing & Capabilities)
| 项目 | 设置值 |
|------|--------|
| Team | 选择 Apple Developer 账户 |
| Bundle Identifier | 与 2-2 中注册的 Bundle ID 完全一致 |
| Automatically manage signing | 取消勾选 (推荐手动管理) |
| Provisioning Profile | 选择 2-4 中创建的 Profile |

**Info.plist 权限说明 (缺失即被拒)**
```xml
<!-- ✅ 推荐 — 具体说明为何需要 -->
<key>NSCameraUsageDescription</key>
<string>QR 코드 스캔을 위해 카메라 접근이 필요합니다.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>프로필 사진 설정을 위해 사진첩 접근이 필요합니다.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치 기반 서비스를 제공하기 위해 위치 정보가 필요합니다.</string>
```
> ⚠️ 说明缺失或含糊则 **立即被拒**。

### 2-6. 在 App Store Connect 注册应用
1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**
2. 输入: **Platforms**(iOS)、**Name**(30 字以内)、**Primary Language**(Korean)、**Bundle ID**(2-2)、**SKU**(例: `harness-ios-001`) → **Create**

### 2-7. 应用元数据 (常被拒的部分)
**必需截图规格**
| 设备 | 分辨率 | 是否必需 |
|------|--------|-----------|
| iPhone 6.7" (15 Pro Max) | 1290 × 2796 | **必需** |
| iPhone 6.5" (14 Plus) | 1284 × 2778 | 推荐 |
| iPad Pro 12.9" | 2048 × 2732 | 支持 iPad 时必需 |

- 截图最少 1 张〜最多 10 张，必须是 **实际应用界面**(仅营销文字不可)。
- 应用说明: 前 3 行最重要。关键词放在单独的 **Keywords** 字段(100 字以内)，禁止在说明中重复输入。
- 禁止提及竞品应用名称(例: "比 KakaoTalk 更快" → 被拒)。
- **隐私政策 URL** 必需 — 外部可访问的 URL(GitHub Pages、Notion 可),明示收集的数据。

### 2-8. 编写 Privacy Manifest (自 2024 年起必需)
没有它则上传本身被拒。Xcode → **File** → **New File** → **Privacy Manifest** → `PrivacyInfo.xcprivacy`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key><false/>  <!-- 不做广告追踪则为 false -->
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key><true/>
            <key>NSPrivacyCollectedDataTypeTracking</key><false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>CA92.1</string></array>
        </dict>
    </array>
</dict>
</plist>
```

### 2-9. 构建归档 & 上传
```
Xcode 选择设备 → "Any iOS Device (arm64)" → Product 菜单 → Archive
```
归档完成后 **Organizer** → 选择归档 → **Distribute App** → **App Store Connect** → **Upload**
- ✅ Include bitcode(推荐)、✅ Upload symbols(用于崩溃分析) → **Upload** (需 5〜15 分钟)
> ⚠️ 构建号每次都要递增。版本(1.0.0)可以相同，但构建号(1, 2, 3…)必须始终递增。

### 2-10. TestFlight 测试版测试 (可选，推荐)
App Store Connect → **TestFlight** → 选择构建 → **+** → 添加测试者
- 内部测试者(团队成员): 最多 100 人，立即分发。
- 外部测试者: 最多 10,000 人，需 Apple 审核(1〜2 天)。

### 2-11. 提交审核 & 应用图标
**提交**: App Store Connect → 应用 → **App Store** 标签页 → 确认元数据/截图 → 选择 **Build** → **Add for Review** → **Submit to App Review**

**应用图标**: 1024 × 1024 px PNG(不可透明背景，白色背景),圆角由 Apple 自动处理(禁止自己做圆角),Assets.xcassets → 添加到 AppIcon。

**审核备注(Review Notes)** — 有特殊功能、需要登录时务必填写:
```
测试账户: test@example.com / password: Test1234!
本应用是工业 IoT 传感器监控应用，没有实际硬件时
部分功能受限。在演示模式下也可查看主要 UI。
```

**审核所需时间**: 初次 1〜3 个工作日(通常 24〜48 小时),重新提交相同/更快，加急审核可在 [developer.apple.com/contact/app-store](https://developer.apple.com/contact/app-store) 申请。

## 3. 常见错误 (常被拒的理由 TOP 10)
| 理由 | 应对法 |
|------|--------|
| 1. 应用崩溃 | 提交前必须真机测试 |
| 2. 不登录无法确认功能 | 提供审核用演示账户 |
| 3. 权限说明不充分 | Info.plist 说明要具体 |
| 4. 未提供隐私政策 URL | 务必注册 |
| 5. 截图与实际应用不符 | 截取实际应用界面 |
| 6. 绕过应用内购买(引导外部支付) | 仅使用 Apple IAP |
| 7. 未完成的 UI(空白界面、按钮不工作) | 测试整个流程后再提交 |
| 8. 应用名/图标与 Apple 品牌相似 | 禁止使用苹果 logo/名称 |
| 9. 缺少 Privacy Manifest | 添加 PrivacyInfo.xcprivacy |
| 10. 应用目的不明确 | 在审核备注中详细说明 |

## 4. 检查清单
- [ ] 是否完成 Apple Developer Program 加入与激活
- [ ] 是否创建了 Bundle ID、Distribution 证书、Provisioning Profile
- [ ] 是否确认 Xcode 签名设置与构建号递增
- [ ] 是否具体编写 Info.plist 权限说明
- [ ] 是否添加了 Privacy Manifest(`PrivacyInfo.xcprivacy`)
- [ ] 是否注册了实际应用界面截图、隐私政策 URL
- [ ] 是否编写了审核用演示账户、审核备注
