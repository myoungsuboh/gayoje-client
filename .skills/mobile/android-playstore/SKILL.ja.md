---
name: Android Google Play Store 登録ガイド
description: Google Play Console を通じた Android アプリの登録・署名・リリースの段階別ガイド。アプリを初めてストアに公開するとき、または新しいバージョンを配布するとき、署名鍵の生成・AAB ビルド・リリーストラック・審査拒否への対応を決めるときに読む。キーワード: gradle, signing, keystore, R8, AAB, bundle, Play Console, minifyEnabled, proguard, versionCode。
rules:
  - "Play Console でデベロッパー登録（$25、1 回）を先に完了する。"
  - "リリース署名鍵（Keystore）を生成し安全にバックアップする — 紛失するとアプリの更新が永久に不可能になる。"
  - "配布成果物は APK ではなく AAB（Android App Bundle）でビルドする。"
  - "ストア掲載情報と必須アセット（アイコン・スクリーンショット）を準備する。"
  - "内部テストトラックで先に配布して検証する。"
  - "バージョンコードはアップロードごとに上げ、バージョン名は Semantic Versioning に従う。"
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

# 📦 Android Google Play Store 登録ガイド

> Android アプリを Play Store に登録・署名・リリースする全工程を整理する。アプリを初めて公開するとき、または新しいバージョンを配布するときに段階別に読む。

## 1. 中核原則

- Play Console で **デベロッパー登録（$25、1 回）** を先に完了する。
- リリース **署名鍵（Keystore）** を生成し安全にバックアップする — 紛失するとアプリの更新が永久に不可能になる。
- 配布成果物は APK ではなく **AAB（Android App Bundle）** でビルドする。
- ストア掲載情報と **必須アセット（アイコン・スクリーンショット）** を準備する。
- **内部テストトラック** で先に配布して検証する。
- バージョンコードはアップロードごとに上げ、バージョン名は Semantic Versioning に従う。

## 2. ルール

### 2-1. Google Play Console 登録（$25、1 回）

1. [play.google.com/console](https://play.google.com/console) にアクセス
2. デベロッパーアカウント登録 → **$25 の一回限りの登録料** を決済
3. 個人情報を入力 → 有効化まで **最大 48 時間** かかる
4. デベロッパー名 = Play Store に表示される公開者名

### 2-2. アプリ署名鍵（Keystore）の生成

アプリ署名鍵はアプリの身元を証明する。**一度生成したら絶対に紛失してはいけない。** 紛失すると同じアプリを更新できず、新しいアプリとして再登録する必要がある。

Android Studio で生成:
```
Build メニュー → Generate Signed Bundle/APK
→ Android App Bundle（AAB 推奨）を選択
→ Create new...
```

入力項目:
- **Key store path**: 安全な場所に保存（例: `~/keystores/harness.jks`）
- **Password**: 強力なパスワードを設定（覚えておくこと！）
- **Key alias**: アプリ名（例: `harness-key`）
- **Validity**: 25 年以上に設定（Google の要件）
- **名前/組織/国**: 入力

> ⚠️ Keystore ファイルとパスワードを **絶対に Git に上げないこと**。紛失するとアプリの更新が永久に不可能になる。別の安全な場所へのバックアップが必須。

`build.gradle` に署名設定:
```kotlin
// app/build.gradle.kts
android {
    signingConfigs {
        create("release") {
            storeFile = file("../keystores/harness.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") // 環境変数で管理
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

### 2-3. AAB ビルドの生成

Play Store は APK の代わりに **AAB（Android App Bundle）** 形式を要求する。AAB をアップロードすると、Google が端末に合った最適化された APK を自動的に生成してくれる。

```
Build メニュー → Generate Signed Bundle/APK
→ Android App Bundle を選択
→ Release を選択 → Next → Finish
```

または Gradle コマンド:
```bash
./gradlew bundleRelease
# 生成場所: app/build/outputs/bundle/release/app-release.aab
```

### 2-4. Play Console でアプリを作成

1. Play Console → **すべてのアプリ** → **アプリを作成**
2. 入力項目:
   - **アプリ名**: 最大 30 文字
   - **デフォルト言語**: 韓国語
   - **アプリまたはゲーム**: 選択
   - **有料または無料**: 選択（無料 → 有料への変更は不可）
3. **デベロッパー プログラム ポリシー** および **米国輸出法** に同意

### 2-5. ストア掲載情報の作成

必須アセット:
| 項目 | 規格 | 必須 |
|------|------|------|
| アプリアイコン | 512 × 512 px, PNG, 1MB 以下 | 必須 |
| グラフィック画像 | 1024 × 500 px | 必須 |
| スクリーンショット（スマートフォン） | 最低 2 枚, 16:9 または 9:16 | 必須 |
| スクリーンショット（タブレット） | 7 インチ, 10 インチ各々 | タブレット対応時 |

アプリの説明:
- **簡単な説明**: 80 文字以下（検索時に表示）
- **詳しい説明**: 4000 文字以下
- 競合の言及、誤解を招く表現は禁止

プライバシーポリシー URL:
- アプリがどのデータを収集するかを明示した URL が必須
- アクセス可能な外部 URL であること

### 2-6. アプリのコンテンツ設定（必須、漏らすと拒否される）

Play Console → **アプリのコンテンツ** セクションで以下の項目をすべて作成:

1. **プライバシーポリシー**: URL を入力
2. **広告**: 広告を含むかどうかを選択
3. **アプリのアクセス権**: ログインが必要な場合 → テストアカウントを提供
4. **コンテンツのレーティング**: アンケートを作成 → レーティングが自動算定（PEGI, IARC）
5. **ターゲットユーザー層**: 年齢層を設定
6. **ニュースアプリかどうか**: 該当時にチェック
7. **COVID-19 関連アプリかどうか**: 該当時にチェック

### 2-7. リリーストラックの選択と AAB アップロード

リリーストラックの種類:
| トラック | 説明 | 推奨用途 |
|------|------|-----------|
| **内部テスト** | チームメンバー最大 100 名、即時配布 | 開発中のテスト |
| **クローズドテスト（アルファ）** | 招待したユーザーのみ、Google 審査が必要 | ベータテスター |
| **オープンテスト（ベータ）** | 誰でも参加可能 | リリース前の検証 |
| **本番（プロダクション）** | 全体公開 | 正式リリース |

アップロード順序:
1. **本番** → **新しいバージョンを作成**
2. **Play アプリ署名** に同意（推奨 — Google が署名鍵を管理してくれる）
3. AAB ファイルをアップロード
4. **バージョン名**: ユーザーに見えるバージョン（例: `1.0.0`）
5. **バージョンコード**: 内部の増加番号、アップロードするたびに上げる必要がある
6. リリースノートを作成（更新内容）
7. **審査のためにリリースを保存** をクリック

### 2-8. 審査とリリース

- 初回審査: **1〜3 営業日** かかる
- 再審査: 通常はより速い（数時間 〜 1 日）

### 2-9. バージョンコード & バージョン名の管理

```kotlin
// app/build.gradle.kts
android {
    defaultConfig {
        versionCode = 5         // アップロードごとに +1 増加（内部用、ユーザーには見えない）
        versionName = "1.2.0"   // ユーザーに見えるバージョン（Semantic Versioning）
    }
}
```

**Semantic Versioning ルール:**
- `1.0.0` → 初回リリース
- `1.0.1` → バグ修正
- `1.1.0` → 新機能追加
- `2.0.0` → 大規模な変更

## 3. よくあるミス（よく拒否される理由）

| 理由 | 解決策 |
|------|--------|
| アプリがクラッシュする | 実機で十分にテストしてから提出 |
| ストア掲載情報が不完全 | すべての必須項目を埋めたか確認 |
| プライバシーポリシーがない | アクセス可能な URL を登録 |
| ログインなしでアプリを確認できない | アプリのアクセス権にテストアカウントを入力 |
| 危険な権限の使用目的が不明確 | 権限を使用する理由の説明を追加 |
| 知的財産権の侵害（アイコン、名前） | 固有のブランドを使用 |

## 4. チェックリスト

- [ ] Play Console のデベロッパー登録（$25）を完了したか
- [ ] Keystore を生成し Git ではなく安全な場所にバックアップしたか
- [ ] 成果物を APK ではなく AAB でビルドしたか
- [ ] 必須アセット（アイコン 512×512、グラフィック 1024×500、スクリーンショット 2 枚以上）を準備したか
- [ ] アプリのコンテンツ（プライバシーポリシー・コンテンツのレーティング・アプリのアクセス権など）をすべて作成したか
- [ ] 内部テストトラックで先に検証したか
- [ ] versionCode を上げ、versionName を Semantic Versioning で設定したか
