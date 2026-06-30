---
name: モバイルアクセシビリティ（Accessibility, a11y）標準
description: iOS VoiceOver・Android TalkBackのユーザーが同等にアプリを使えるよう、ラベル・役割・フォーカス・タッチターゲット・動的フォントを両プラットフォームで一貫処理するガイド。画面/コンポーネントを作る、またはリリース前にアクセシビリティを検収するときに読む。キーワード: VoiceOver, TalkBack, accessibilityLabel, accessibilityHint, contentDescription, semantics, Dynamic Type, 色のコントラスト, タッチターゲット.
rules:
  - "iOS VoiceOver・Android TalkBackの両方で同等に動作するようラベルを付ける。"
  - "関連する要素はグループ化し、装飾要素はアクセシビリティツリーから隠す。"
  - "タッチターゲットは最低44pt（iOS）・48dp（Android）以上を確保する。"
  - "動的フォントサイズ設定に従うよう、固定pxの代わりにスケール単位を使う。"
  - "在庫変動のような動的変化はライブ領域で案内する。"
tags:
  - "VoiceOver"
  - "TalkBack"
  - "accessibilityLabel"
  - "accessibilityHint"
  - "contentDescription"
  - "semantics"
  - "Dynamic Type"
  - "색 대비"
  - "터치 타겟"
---

# ♿ モバイルアクセシビリティ標準

> アクセシビリティは「障害者向けの追加機能」ではなく、すべてのユーザーのUXの下限線だ。画面・コンポーネントを作る、またはリリース前にアクセシビリティを検収するときに読む。動的フォントを大きくしたユーザー、暗い場所で色が見えないユーザー、片手で使うユーザーすべてが恩恵を受ける。

## 1. 核心原則
- iOS VoiceOver・Android TalkBackの両方で同等に動作するようラベルを付ける。
- 関連する要素はグループ化し、装飾要素はアクセシビリティツリーから隠す。
- タッチターゲットは最低44pt（iOS）・48dp（Android）以上を確保する。
- 動的フォントサイズ設定に従うよう、固定pxの代わりにスケール単位を使う。
- 在庫変動のような動的変化はライブ領域で案内する。

## 2. 規則

### 2-1. iOS — ラベル/ヒント/グループ化（SwiftUI）
```swift
// ✅ ラベル/ヒント/識別子
Button(action: like) {
    Image(systemName: "heart.fill")
}
.accessibilityLabel("좋아요")                    // VoiceOver が読み上げる名前
.accessibilityHint("이 게시물을 좋아요 목록에 추가합니다")  // 追加説明（任意）
.accessibilityIdentifier("post.likeButton")     // UIテスト用 — ユーザーには見えない

// ✅ 子要素のグループ化
HStack {
    Image("avatar")
    VStack { Text("홍길동"); Text("2시간 전") }
}
.accessibilityElement(children: .combine)        // 一塊として読む
.accessibilityLabel("홍길동, 2시간 전")

// ✅ 装飾要素を隠す
Image("decorative-line").accessibilityHidden(true)
```
> `accessibilityIdentifier` はUIテストのセレクタとして使う。テスト統合はtesting-debuggingスキルを参照。

### 2-2. Android — semantics（Compose）
```kotlin
// ✅ ラベル/役割/識別子
Icon(
    imageVector = Icons.Filled.Favorite,
    contentDescription = "좋아요",                // TalkBack が読み上げる名前
    modifier = Modifier
        .clickable(onClick = ::like)
        .semantics { role = Role.Button }
        .testTag("post.likeButton")              // UIテスト用
)

// ✅ グループ化
Row(modifier = Modifier.semantics(mergeDescendants = true) {
    contentDescription = "홍길동, 2시간 전"
}) {
    Image(...); Text("홍길동"); Text("2시간 전")
}

// ✅ 動的案内（在庫アラートなど）
Text(
    text = stockMessage,
    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
)

// ✅ 装飾要素を隠す
Icon(painterResource(R.drawable.deco), contentDescription = null)
```
> `Modifier.testTag` はUIテストのセレクタ。詳しくはtesting-debuggingスキルを参照。

### 2-3. マトリクス — 同じ概念、異なるAPI
| 概念 | iOS (SwiftUI) | Android (Compose) |
|------|---------------|--------------------|
| 読み上げる名前 | `.accessibilityLabel` | `contentDescription` / `semantics { contentDescription }` |
| 追加ヒント | `.accessibilityHint` | `semantics { stateDescription }` |
| 役割 | `.accessibilityAddTraits(.isButton)` | `semantics { role = Role.Button }` |
| 子の統合 | `.accessibilityElement(children: .combine)` | `semantics(mergeDescendants = true)` |
| 隠す | `.accessibilityHidden(true)` | `contentDescription = null` + 非クリック |
| 動的領域 | `.accessibilityAddTraits(.updatesFrequently)` | `LiveRegionMode.Polite` / `Assertive` |
| テスト識別子 | `.accessibilityIdentifier` | `Modifier.testTag` |

### 2-4. 動的フォント（Dynamic Type / Font Scale）
ユーザーがシステム設定でフォントを大きくしたらアプリも従わなければならない。固定pt/sp禁止。
- iOS: `.font(.body)` のようなセマンティックフォントを使い、カスタムフォントは`UIFontMetrics`でスケーリング。
- Android: `sp` 単位を使い（`dp`ではない）、Composeは`MaterialTheme.typography.bodyLarge`を使う。

> 大きなフォントでレイアウトが崩れてはいけない。ScrollView/LazyColumnで包み、テキストが切れないようwrap。フォントスケール・レイアウト対応はresponsive-deviceスキルを参照。

### 2-5. 色のコントラストと色への依存
WCAG 2.1基準:
- 本文テキスト対背景: コントラスト4.5:1以上
- 大きなテキスト（18pt+/bold 14pt+）: 3:1以上
- 意味のあるアイコン/コントロールの境界: 3:1以上

色だけで情報を伝えない。赤/緑だけで「成功/失敗」を区別すると色覚障害のユーザーが区別不可 → アイコン/テキストラベルを併記。

> デザイントークンのコントラスト検証はui-design-systemスキルを参照。トークン段階で一度検証すれば画面ごとに気を使う必要がない。

### 2-6. タッチターゲットの最小サイズ
| プラットフォーム | 最小サイズ | 備考 |
|--------|-----------|------|
| iOS (HIG) | 44 pt × 44 pt | 視覚サイズは小さくてもhitTest領域は44pt |
| Android (Material) | 48 dp × 48 dp | `Modifier.minimumInteractiveComponentSize()` 推奨 |

```swift
// ✅ iOS
Button(action: x) { Image(systemName: "xmark") }
    .frame(minWidth: 44, minHeight: 44)
```
```kotlin
// ✅ Android
IconButton(onClick = ::close, modifier = Modifier.minimumInteractiveComponentSize()) {
    Icon(Icons.Default.Close, contentDescription = "닫기")
}
```
> 16ptのXアイコンが視覚的に小さくてもタップ領域は44/48を満たす。

### 2-7. 実機検収 — VoiceOver / TalkBack
コードレビューでは絶対に捕まえられない。リリース前に必ず実機で音声を使って一通り。
- iOS VoiceOver: 設定 → アクセシビリティ → VoiceOverをオン（サイドボタン3回）。一本指の右スワイプで移動、ダブルタップで有効化。核心シナリオ（ログイン → メイン → 決済）を最後まで進められるか確認。
- Android TalkBack: 設定 → ユーザー補助 → TalkBackをオン（音量ボタン同時押し）。右スワイプ移動、ダブルタップ有効化。同じシナリオを検収。

## 3. よくあるミス
- ❌ 意味のある画像・アイコンにラベルがない → VoiceOverが「画像」とだけ読む。
- ❌ 装飾用の区切り線/背景画像がフォーカスを受ける → 意味のない要素を聞き続ける。
- ❌ 色だけで「成功（緑）/失敗（赤）」を表示 → 色覚障害のユーザーが区別不可。
- ❌ フォントを`12pt`（iOS）・`dp`（Android）の固定単位で指定 → 動的フォント未反映。
- ❌ 16ptアイコンにパディングなしでタップ領域そのまま → 高齢者/視覚弱者がタップ失敗。
- ❌ placeholderだけで入力ラベルを代替（入力時にラベルが消える）。
- ❌ 実機VoiceOver/TalkBackテストなしでリリース。

## 4. チェックリスト
- [ ] すべての意味のある画像/アイコンに`accessibilityLabel` / `contentDescription` があるか
- [ ] 装飾画像を明示的に隠したか（`accessibilityHidden` / `contentDescription = null`）
- [ ] フォーム入力フィールドにラベルを接続したか（placeholderだけにしていないか）
- [ ] 動的フォント最大サイズでレイアウトが崩れないか
- [ ] 色のコントラスト4.5:1を検証したか（デザイントークン段階）
- [ ] 色だけで情報を伝える部分がないか
- [ ] タッチターゲット44pt / 48dpを満たすか
- [ ] VoiceOver / TalkBackで核心フローを完走できるか
- [ ] 横/縦の回転いずれでもアクセス可能か
