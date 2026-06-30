---
name: Fastlane CI/CD
description: Fastlaneベースのモバイルビルド・署名・配信自動化の標準。ベータ・本番配信のlaneを構成する、またはコード署名・ストアアップロードをCIに連携する際に読む。キーワード: fastlane, ci-cd, testflight, match, gym, supply, code-signing, app-distribution.
rules:
  - "ビルド・署名・スクリーンショット・配信をFastlaneのlaneとしてコード化し、手動のXcode・Android Studioのクリック配信を避ける。"
  - "コード署名証明書・プロビジョニングはmatch(iOS)で暗号化されたgitリポジトリからチームで共有し、鍵を個人のマシンだけに置かない。"
  - "ベータ配信(TestFlight・Firebase App Distribution)と本番配信のlaneを分離し、CIからトリガーする。"
  - "バージョン・ビルド番号はCIで自動インクリメントし(increment_build_number)、gitタグと連携する。"
  - "ストアの認証情報(APIキー・アプリパスワード)は環境変数・シークレットマネージャーで注入し、リポジトリにコミットしない。"
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

> モバイルのビルド・署名・スクリーンショット・配信をFastlaneのlaneとしてコード化し、CIで自動化する。ベータ・本番配信を構成する、またはコード署名・ストアアップロードを定める際に読む。

## 1. 中核原則
- ビルド・署名・スクリーンショット・配信をFastlaneのlaneとしてコード化し、手動のXcode・Android Studioのクリック配信を避ける。
- コード署名証明書・プロビジョニングはmatch(iOS)で暗号化されたgitリポジトリからチームで共有し、鍵を個人のマシンだけに置かない。
- ベータ配信(TestFlight・Firebase App Distribution)と本番配信のlaneを分離し、CIからトリガーする。
- バージョン・ビルド番号はCIで自動インクリメントし(increment_build_number)、gitタグと連携する。
- ストアの認証情報(APIキー・アプリパスワード)は環境変数・シークレットマネージャーで注入し、リポジトリにコミットしない。

## 2. ルール

### 2-1. Fastfile 構造 (ベータ・本番laneの分離)
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

### 2-2. コード署名 (match)
```ruby
# Matchfile — 암호화된 git 저장소에서 인증서 공유
git_url("git@github.com:org/certificates.git")
storage_mode("git")
type("appstore")
# 팀원: fastlane match appstore --readonly
```

### 2-3. CI パイプライン連携 (シークレット注入)
```yaml
# ❌ 금지 — 자격 증명을 Fastfile/저장소에 하드코딩
# ✅ 권장 — 환경 변수로 시크릿 주입 (저장소 커밋 금지)
env:
  MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
  APP_STORE_CONNECT_API_KEY: ${{ secrets.ASC_API_KEY }}
steps:
  - run: bundle exec fastlane ios beta
```

### 2-4. 配信トラック
| トラック | ツール | 対象 |
|------|------|------|
| 内部テスト | Firebase App Distribution | QAチーム |
| ベータ | TestFlight / Play Beta | 外部テスター |
| 本番 | App Store / Play Production | 一般ユーザー |
| 段階的リリース | staged rollout | %ごとの段階的配信 |

## 3. よくある失敗
- 証明書を個人のマシンだけに置いてチームメンバーがビルドできない → matchで共有する。
- ベータと本番のlaneを混在させ誤って本番配信 → laneを分離する。
- ビルド番号を手動でインクリメント → CIで自動インクリメントする。
- 認証情報をリポジトリにコミット → シークレットマネージャー・環境変数で注入する。

## 4. チェックリスト
- [ ] ビルド・署名・配信をFastlaneのlaneとしてコード化したか
- [ ] 証明書をmatchで暗号化gitリポジトリから共有しているか
- [ ] ベータ・本番のlaneを分離したか
- [ ] バージョン・ビルド番号をCIで自動インクリメントしているか
- [ ] ストアの認証情報を環境変数・シークレットで注入したか(コミット禁止)
