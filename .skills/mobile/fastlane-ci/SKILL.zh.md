---
name: Fastlane CI/CD
description: 基于 Fastlane 的移动端构建、签名、发布自动化标准。配置 beta/生产发布 lane，或将代码签名与商店上传接入 CI 时阅读。关键词: fastlane, ci-cd, testflight, match, gym, supply, code-signing, app-distribution.
rules:
  - "将构建、签名、截图、发布编码为 Fastlane lane，避免在 Xcode、Android Studio 中手动点击发布。"
  - "代码签名证书与配置文件通过 match(iOS)从加密的 git 仓库在团队内共享，不要将密钥仅放在个人机器上。"
  - "将 beta 发布(TestFlight、Firebase App Distribution)与生产发布的 lane 分离，并由 CI 触发。"
  - "版本号、构建号在 CI 中自动递增(increment_build_number),并与 git 标签关联。"
  - "商店凭证(API 密钥、应用密码)通过环境变量、密钥管理器注入，不提交到仓库。"
tags:
  - "fastlane"
  - "ci-cd"
  - "testflight"
  - "match"
  - "gym"
  - "supply"
  - "code-signing"
  - "app-distribution"
---

# 🚀 Fastlane CI/CD

> 将移动端构建、签名、截图、发布编码为 Fastlane lane，并在 CI 中自动化。配置 beta/生产发布，或制定代码签名与商店上传时阅读。

## 1. 核心原则
- 将构建、签名、截图、发布编码为 Fastlane lane，避免在 Xcode、Android Studio 中手动点击发布。
- 代码签名证书与配置文件通过 match(iOS)从加密的 git 仓库在团队内共享，不要将密钥仅放在个人机器上。
- 将 beta 发布(TestFlight、Firebase App Distribution)与生产发布的 lane 分离，并由 CI 触发。
- 版本号、构建号在 CI 中自动递增(increment_build_number),并与 git 标签关联。
- 商店凭证(API 密钥、应用密码)通过环境变量、密钥管理器注入，不提交到仓库。

## 2. 规则

### 2-1. Fastfile 结构 (分离 beta/生产 lane)
```ruby
# fastlane/Fastfile
platform :ios do
  desc "베타 배포 (TestFlight)"
  lane :beta do
    match(type: "appstore", readonly: true)   # 인증서 동기화
    increment_build_number(xcodeproj: "App.xcodeproj")
    build_app(scheme: "App")                    # gym
    upload_to_testflight(skip_waiting_for_build_processing: true)
  end

  desc "프로덕션 배포"
  lane :release do
    match(type: "appstore", readonly: true)
    build_app(scheme: "App")
    upload_to_app_store(submit_for_review: true, automatic_release: true)
  end
end

platform :android do
  lane :beta do
    increment_version_code
    gradle(task: "bundleRelease")
    upload_to_play_store(track: "beta")         # supply
  end
end
```

### 2-2. 代码签名 (match)
```ruby
# Matchfile — 암호화된 git 저장소에서 인증서 공유
git_url("git@github.com:org/certificates.git")
storage_mode("git")
type("appstore")
# 팀원: fastlane match appstore --readonly
```

### 2-3. CI 流水线集成 (密钥注入)
```yaml
# ❌ 금지 — 자격 증명을 Fastfile/저장소에 하드코딩
# ✅ 권장 — 환경 변수로 시크릿 주입 (저장소 커밋 금지)
env:
  MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
  APP_STORE_CONNECT_API_KEY: ${{ secrets.ASC_API_KEY }}
steps:
  - run: bundle exec fastlane ios beta
```

### 2-4. 发布轨道
| 轨道 | 工具 | 对象 |
|------|------|------|
| 内部测试 | Firebase App Distribution | QA 团队 |
| Beta | TestFlight / Play Beta | 外部测试者 |
| 生产 | App Store / Play Production | 普通用户 |
| 分阶段发布 | staged rollout | 按百分比逐步发布 |

## 3. 常见错误
- 将证书仅放在个人机器上导致团队成员无法构建 → 通过 match 共享。
- 将 beta 与生产 lane 混用导致误发布到生产 → 分离 lane。
- 手动递增构建号 → 在 CI 中自动递增。
- 将凭证提交到仓库 → 通过密钥管理器、环境变量注入。

## 4. 检查清单
- [ ] 是否将构建、签名、发布编码为 Fastlane lane
- [ ] 是否通过 match 从加密 git 仓库共享证书
- [ ] 是否分离了 beta 与生产 lane
- [ ] 是否在 CI 中自动递增版本号、构建号
- [ ] 是否通过环境变量、密钥注入商店凭证(禁止提交)
