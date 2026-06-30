---
name: Android Google Play Store 上架指南
description: 通过 Google Play Console 进行 Android 应用上架、签名、发布的分步指南。在首次将应用上架到商店或发布新版本时，以及确定签名密钥生成、AAB 构建、发布轨道、审核驳回应对时阅读。关键词: gradle, signing, keystore, R8, AAB, bundle, Play Console, minifyEnabled, proguard, versionCode。
rules:
  - "先在 Play Console 完成开发者注册（$25，一次性）。"
  - "生成发布签名密钥（Keystore）并安全备份 — 一旦丢失，应用更新将永久无法进行。"
  - "发布产物用 AAB（Android App Bundle）而非 APK 构建。"
  - "准备商店列表信息和必需资源（图标、截图）。"
  - "先发布到内部测试轨道进行验证。"
  - "版本代码每次上传都要提升，版本名称遵循 Semantic Versioning。"
tags:
  - "gradle"
  - "signing"
  - "keystore"
  - "R8"
  - "AAB"
  - "bundle"
  - "Play Console"
  - "minifyEnabled"
  - "proguard"
  - "versionCode"
---

# 📦 Android Google Play Store 上架指南

> 整理在 Play Store 上架、签名、发布 Android 应用的全过程。在首次上架应用或发布新版本时分步阅读。

## 1. 核心原则

- 先在 Play Console 完成 **开发者注册（$25，一次性）**。
- 生成发布 **签名密钥（Keystore）** 并安全备份 — 一旦丢失，应用更新将永久无法进行。
- 发布产物用 **AAB（Android App Bundle）** 而非 APK 构建。
- 准备商店列表信息和 **必需资源（图标、截图）**。
- 先发布到 **内部测试轨道** 进行验证。
- 版本代码每次上传都要提升，版本名称遵循 Semantic Versioning。

## 2. 规则

### 2-1. Google Play Console 注册（$25，一次性）

1. 访问 [play.google.com/console](https://play.google.com/console)
2. 注册开发者账号 → 支付 **$25 一次性注册费**
3. 填写个人信息 → 激活最多需要 **48 小时**
4. 开发者名称 = 在 Play Store 上显示的发布者名称

### 2-2. 创建应用签名密钥（Keystore）

应用签名密钥证明应用的身份。**一旦生成，绝不能丢失。** 丢失后将无法更新同一应用，必须作为新应用重新注册。

在 Android Studio 中生成:
```
Build 菜单 → Generate Signed Bundle/APK
→ 选择 Android App Bundle（推荐 AAB）
→ Create new...
```

输入项:
- **Key store path**: 保存到安全位置（例: `~/keystores/harness.jks`）
- **Password**: 设置强密码（必须记住！）
- **Key alias**: 应用名称（例: `harness-key`）
- **Validity**: 设置 25 年以上（Google 要求）
- **名称/组织/国家**: 填写

> ⚠️ **绝不要把** Keystore 文件和密码 **上传到 Git**。丢失后应用更新将永久无法进行。必须备份到单独的安全位置。

在 `build.gradle` 中配置签名:
```kotlin
// app/build.gradle.kts
android {
    signingConfigs {
        create("release") {
            storeFile = file("../keystores/harness.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") // 用环境变量管理
            keyAlias = "harness-key"
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}
```

### 2-3. 生成 AAB 构建

Play Store 要求 **AAB（Android App Bundle）** 格式而非 APK。上传 AAB 后，Google 会自动生成适配设备的优化 APK。

```
Build 菜单 → Generate Signed Bundle/APK
→ 选择 Android App Bundle
→ 选择 Release → Next → Finish
```

或 Gradle 命令:
```bash
./gradlew bundleRelease
# 生成位置: app/build/outputs/bundle/release/app-release.aab
```

### 2-4. 在 Play Console 中创建应用

1. Play Console → **所有应用** → **创建应用**
2. 输入项:
   - **应用名称**: 最多 30 字符
   - **默认语言**: 韩语
   - **应用或游戏**: 选择
   - **付费或免费**: 选择（免费 → 付费不可更改）
3. 同意 **开发者计划政策** 及 **美国出口法**

### 2-5. 填写商店列表信息

必需资源:
| 项目 | 规格 | 必需 |
|------|------|------|
| 应用图标 | 512 × 512 px, PNG, 1MB 以下 | 必需 |
| 宣传图 | 1024 × 500 px | 必需 |
| 截图（手机） | 至少 2 张, 16:9 或 9:16 | 必需 |
| 截图（平板） | 7 英寸、10 英寸各自 | 支持平板时 |

应用描述:
- **简短描述**: 80 字符以下（搜索时显示）
- **详细描述**: 4000 字符以下
- 禁止提及竞争对手、禁止引起误解的表述

隐私政策 URL:
- 必须有明示应用收集哪些数据的 URL
- 必须是可访问的外部 URL

### 2-6. 应用内容设置（必需，遗漏会被驳回）

在 Play Console → **应用内容** 部分完成以下所有项目:

1. **隐私政策**: 输入 URL
2. **广告**: 选择是否包含广告
3. **应用访问权限**: 需要登录时 → 提供测试账号
4. **内容分级**: 填写问卷 → 自动核定分级（PEGI, IARC）
5. **目标受众**: 设置年龄段
6. **是否为新闻应用**: 适用时勾选
7. **是否为 COVID-19 相关应用**: 适用时勾选

### 2-7. 选择发布轨道并上传 AAB

发布轨道类型:
| 轨道 | 说明 | 推荐用途 |
|------|------|-----------|
| **内部测试** | 团队成员最多 100 名, 即时发布 | 开发中测试 |
| **封闭测试（Alpha）** | 仅限受邀用户, 需 Google 审核 | Beta 测试者 |
| **开放测试（Beta）** | 任何人均可参与 | 发布前验证 |
| **生产环境** | 全面公开 | 正式发布 |

上传顺序:
1. **生产环境** → **创建新版本**
2. 同意 **Play 应用签名**（推荐 — Google 代为管理签名密钥）
3. 上传 AAB 文件
4. **版本名称**: 用户可见的版本（例: `1.0.0`）
5. **版本代码**: 内部递增编号, 每次上传都必须提升
6. 编写发布说明（更新内容）
7. 点击 **保存版本以供审核**

### 2-8. 审核与发布

- 首次审核: 需要 **1～3 个工作日**
- 重新审核: 通常更快（几小时 ~ 1 天）

### 2-9. 版本代码 & 版本名称管理

```kotlin
// app/build.gradle.kts
android {
    defaultConfig {
        versionCode = 5         // 每次上传 +1 递增（内部用, 用户看不到）
        versionName = "1.2.0"   // 用户可见的版本（Semantic Versioning）
    }
}
```

**Semantic Versioning 规则:**
- `1.0.0` → 首次发布
- `1.0.1` → 缺陷修复
- `1.1.0` → 新增功能
- `2.0.0` → 大规模变更

## 3. 常见错误（常被驳回的理由）

| 理由 | 解决方案 |
|------|--------|
| 应用崩溃 | 在真机上充分测试后再提交 |
| 商店列表信息不完整 | 确认所有必需项均已填写 |
| 没有隐私政策 | 注册可访问的 URL |
| 无法在不登录的情况下查看应用 | 在应用访问权限中输入测试账号 |
| 危险权限的使用目的不明确 | 补充权限使用理由的说明 |
| 侵犯知识产权（图标、名称） | 使用独有品牌 |

## 4. 检查清单

- [ ] 是否完成 Play Console 开发者注册（$25）
- [ ] 是否生成 Keystore 并备份到 Git 之外的安全位置
- [ ] 是否将产物以 AAB 而非 APK 构建
- [ ] 是否准备必需资源（图标 512×512、宣传图 1024×500、2 张以上截图）
- [ ] 是否完整填写应用内容（隐私政策、内容分级、应用访问权限等）
- [ ] 是否先在内部测试轨道验证
- [ ] 是否提升 versionCode 并用 Semantic Versioning 设置 versionName
