---
name: 分析イベントトラッキング (Analytics Event Tracking)
description: 一貫したイベント命名・単一ラッパー・PII マスキング・同意後の収集・環境分離を扱う、プロダクトメトリクス(コンバージョン率・funnel)イベントトラッキングの汎用標準であり、特定の言語/フレームワーク/分析ベンダーに依存しない。分析ツールを導入する、またはイベントを新規に定義・送信するとき、個人情報マスキング・同意(opt-out)・デバウンシングを決めるときに読む。エラー収集は error-monitoring を見る。
rules:
  - "イベントはカタログで管理する: イベント名と属性を自由形式でばら撒かず、object_action(snake_case・過去形)のような単一ルールで統一して文書(カタログ)で管理する。同じ行動が複数の名前で記録されると分析そのものが不可能になる。"
  - "コア指標から定義する: すべてを追跡しようとせず、運用上の意思決定に使われるコンバージョン・funnel のコアイベントを先に定義する。測定目的のないイベントはノイズだ。"
  - "収集はユーザー同意が前提だ: 同意(opt-out/opt-in)状態を確認する前にはトラッキングを開始しない。同意は分析の前提条件であって付加機能ではない。"
  - "個人情報(PII)は送らない: 分析ツールは PII の保管場所ではない。メール・電話・住所・座標・平文の識別子などは送信経路から除去するか、結合リスクのない形(ハッシュ化・分析専用 ID)でのみ送る。"
  - "ベンダーは単一ラッパーの背後に隠す: 分析 SDK を画面・ドメインコードから直接呼ばず、共通ラッパー(track/init/setOptOut など)を通してのみ呼ぶ。ツール交換が 1 ファイルの修正で済むようにし、マスキング・同意チェックを一箇所に集める。"
  - "高頻度イベントは減らして送る: スクロール・ドラッグ・移動・入力のように短い間隔で押し寄せるイベントはデバウンシング/スロットリングでまとめてトラフィックとコストを制御する。"
  - "環境を分離する: 開発イベントが運用ダッシュボードを汚染しないよう、分析キー/エンドポイントを環境(dev/prod)別に分離する。"
tags:
  - "gtag"
  - "ga4"
  - "analytics"
  - "mixpanel"
  - "track("
  - "trackEvent"
  - "datalayer"
---

# 📊 分析イベントトラッキング (Analytics Event Tracking)

> 運用上の意思決定に必要なユーザー行動メトリクス(DAU/MAU・コンバージョン率・funnel)を、一貫した名前で定義し単一の入口を通して記録する。個人情報は送信前に除去し、ユーザーの同意を得た後にのみ収集し、特定の分析ベンダーに依存しないよう抽象化する。分析ツールを導入する、またはイベントを定義・送信するときに読む。特定の言語/フレームワーク/ベンダーに依存しない汎用標準である。(エラーは `error-monitoring`、ユーザー行動は分析 — トラックが異なる。)

## 1. コア原則
- **イベントはカタログで管理する**: イベント名と属性を自由形式でばら撒かず、`object_action`(snake_case・過去形)のような単一ルールで統一して文書(カタログ)で管理する。同じ行動が複数の名前で記録されると分析そのものが不可能になる。
- **コア指標から定義する**: すべてを追跡しようとせず、運用上の意思決定に使われるコンバージョン・funnel のコアイベントを先に定義する。測定目的のないイベントはノイズだ。
- **収集はユーザー同意が前提だ**: 同意(opt-out/opt-in)状態を確認する前にはトラッキングを開始しない。同意は分析の前提条件であって付加機能ではない。
- **個人情報(PII)は送らない**: 分析ツールは PII の保管場所ではない。メール・電話・住所・座標・平文の識別子などは送信経路から除去するか、結合リスクのない形(ハッシュ化・分析専用 ID)でのみ送る。
- **ベンダーは単一ラッパーの背後に隠す**: 分析 SDK を画面・ドメインコードから直接呼ばず、共通ラッパー(`track`/`init`/`setOptOut` など)を通してのみ呼ぶ。ツール交換が 1 ファイルの修正で済むようにし、マスキング・同意チェックを一箇所に集める。
- **高頻度イベントは減らして送る**: スクロール・ドラッグ・移動・入力のように短い間隔で押し寄せるイベントはデバウンシング/スロットリングでまとめてトラフィックとコストを制御する。
- **環境を分離する**: 開発イベントが運用ダッシュボードを汚染しないよう、分析キー/エンドポイントを環境(dev/prod)別に分離する。

## 2. ルール

### 2-1. イベント名は単一ルールで統一しカタログ化する
- `object_action`(snake_case・過去形)のような一つのルールを定めてすべてのイベントに適用し、名前・属性・意味をカタログ文書で管理する。
- subject の欠落、大文字小文字の混用、特殊文字、即興の命名を禁止する。

```text
규칙: [Subject]_[Action]_[Object?]   // snake_case + 과거형, 언어 통일

// ❌ 금지 — subject 누락 · 표기 혼용 · 특수문자 · 자유 형식
track("signup")
track("inviteFriend")
track("course_complete!")

// ✅ 권장 — 객체_동작 과거형, 속성은 정해진 키로
track("user_signed_up", { method })
track("friend_invitation_sent", { to_user_id_hashed })
```

### 2-2. トラッキングは単一ラッパーを通してのみ呼ぶ (ベンダー依存の遮断)
- 分析 SDK を画面/ドメインコードから直接呼ばず、共通ラッパー(`init`/`track`/`setOptOut`)を置きそこからのみ SDK を呼ぶ。
- 初期化の有無・同意の有無のチェックと PII マスキングをラッパー一箇所に集める — 呼び出し側は「何を送るか」だけ気にする。

```text
// ❌ 금지 — 화면 코드가 벤더 SDK를 직접 호출 (교체·마스킹·동의 검사가 흩어짐)
vendorSdk.logEvent("user_signed_up", { email })   // PII까지 그대로 전송

// ✅ 권장 — 공통 래퍼 경유, 마스킹·동의 검사는 래퍼 내부에서 일괄
module analytics:
  state initialized, optedOut
  init():            if no key: return; vendorSdk.init(key, { collectIp: false }); initialized = true
  track(name, props):if not initialized or optedOut: return; vendorSdk.logEvent(name, sanitize(props))
  setOptOut(out):    optedOut = out; vendorSdk.setOptOut(out)

// 호출부
analytics.track("user_signed_up", { method })
```

### 2-3. PII は送信前に除去する (ラッパー内部の sanitize)
- 機密属性(メール・電話・パスワード・トークン・住所・座標など)はラッパーの単一の精製ステップでフィルタリングしてから送信する。
- ユーザー識別が必要なら平文 ID ではなくハッシュ化/分析専用 ID で送る。

```text
// ✅ 권장 — 금지 키를 단일 지점에서 제거 후 전송
FORBIDDEN = [email, phone, password, token, lat, lng, address, ...]
sanitize(props): props에서 키 이름이 FORBIDDEN을 포함하는 항목을 제거해 반환

track(name, props): vendorSdk.logEvent(name, sanitize(props))
```

### 2-4. 同意(opt-out/opt-in)後にのみ収集する
- アプリ起動時に同意状態を先に確認し、未決定のユーザーには(一度だけ)同意 UI を表示する。
- 同意を得る前には分析の初期化(`init`)と送信(`track`)を行わない(GDPR/PIPL など個人情報規制の遵守)。

```text
// ✅ 권장 — 동의가 트래킹의 선결 조건
on app start:
  consent = readConsent()
  if consent is undecided: showConsentDialogOnce()
  if consent is granted:   analytics.init()    // 동의 전에는 init/track 금지
```

### 2-5. 高頻度イベントはデバウンシングする
- スクロール・ドラッグ・地図の移動・連続する入力のように短い間隔で連続発生するイベントはデバウンシング/スロットリングでまとめて一度だけ送る。
- 発生のたびに送信するとトラフィック・コストが急増し分析にもノイズになる。

```text
// ❌ 금지 — 매 발생마다 전송
onMove(() => track("map_panned", { zoom }))

// ✅ 권장 — 일정 시간 묶어 한 번 전송
trackPan = debounce((zoom) => track("map_panned", { zoom }), 2000ms)
onMove(() => trackPan(currentZoom))
```

### 2-6. 環境(dev/prod)別のキーを分離する
- 分析キー/エンドポイントを環境変数で分離し、開発中に発生したイベントが運用ダッシュボードを汚染しないようにする。
- 運用/開発キーを共有するとデータの信頼性が崩れる。

```text
// ✅ 권장 — 환경별로 다른 키 주입 (코드에 하드코딩 금지)
key = env.ANALYTICS_KEY        // dev 환경엔 dev 키, prod 환경엔 prod 키
analytics.init(key)
```

## 3. よくあるミス
- **PII をイベント属性として送信** → メール・電話・座標・平文 user_id をそのまま送る。分析ツールは PII の保管場所ではない。ラッパーで除去し識別子はハッシュ化する。
- **同意なしでトラッキング開始** → 同意状態の確認前に init/track を呼ぶ。個人情報規制違反。
- **イベント名の自由形式** → 同じ行動が複数の名前で記録され分析時にカテゴリが爆発する。単一ルール + カタログでまとめる。
- **高頻度イベントを毎回送信** → スクロール・移動・キー入力のたびに送信してトラフィック・コストが急増する。デバウンシングする。
- **運用/開発キー共有** → 開発イベントが運用ダッシュボードを汚染しデータの信頼性が崩れる。環境別に分離する。
- **ベンダー SDK を画面コードから直接呼ぶ** → ツール交換・マスキング・同意チェックがあちこちに散らばる。単一ラッパーの背後に隠す。

## 4. チェックリスト
- [ ] イベント名が単一ルール(`object_action`・snake_case・過去形)に従いカタログとして文書化されているか
- [ ] コンバージョン・funnel のコアイベントを優先して定義したか
- [ ] トラッキングを画面/ドメインコードから直接呼ばず単一ラッパーを経由するか
- [ ] PII マスキング(sanitize)を単一ラッパーで処理し、識別子はハッシュ化/分析専用 ID で送るか
- [ ] 同意(opt-out/opt-in)確認後にのみ init/track するか
- [ ] 高頻度イベントをデバウンシング/スロットリングするか
- [ ] dev/prod の分析キーを分離したか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: React/Next.js、Vue 3、モバイル/ネイティブ、サーバーサイドトラッキングなど)に合った例を同じパターンで追加する。上記 1〜4 の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Vue 3 (Vite) + Amplitude

> 本文 1〜4 の原則・ルールを Vite 環境変数 + Amplitude SDK で実装した**コード例**である。命名規則(本文 2-1)・同意(本文 2-4)・デバウンシング(本文 2-5)・環境分離(本文 2-6)の「なぜ」は本文を見る。ここでは単一ラッパー(`src/lib/analytics.js`)がベンダー依存と PII マスキングを一箇所で処理する実コードのみを載せる。

#### ツール選択 (ベンダー比較 — 参考)

| ツール | 無料枠 | 強み |
|---|---|---|
| Amplitude | 月 10M | 無料枠が大きい、学習が速い (推奨デフォルト) |
| Mixpanel | 月 1M | funnel/cohort 分析が最強 |
| GA4 | 無制限(サンプリング) | 無料、広告連携 |
| PostHog(セルフホスト) | 無制限 | オープンソース、データ主権 |

#### 統合ラッパー (本文 2-2・2-3 — ベンダー依存の遮断 + PII マスキング)

```js
// src/lib/analytics.js
import amplitude from 'amplitude-js'
let initialized = false, optedOut = false

export function initAnalytics() {
  const key = import.meta.env.VITE_AMPLITUDE_API_KEY  // dev/prod 키 분리 (본문 2-6)
  if (!key) return
  amplitude.getInstance().init(key, null, { trackingOptions: { ipAddress: false } })
  initialized = true
}
export function track(name, props = {}) {
  if (!initialized || optedOut) return
  amplitude.getInstance().logEvent(name, sanitize(props))
}
export function setOptOut(out) { optedOut = out; amplitude.getInstance().setOptOut(out) }

// 민감 키 자동 제거 (sanitize)
const FORBIDDEN = ['email', 'phone', 'password', 'token', 'lat', 'lng', 'address']
function sanitize(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !FORBIDDEN.some(f => k.toLowerCase().includes(f)))
  )
}

// 호출부: 이름은 객체_동작 과거형(본문 2-1)
track('user_signed_up', { method: 'kakao' })
```

#### デバウンシング (本文 2-5)

```js
import { debounce } from 'lodash-es'
const trackPan = debounce((zoom) => track('map_panned', { zoom }), 2000)
map.on('moveend', () => trackPan(map.getZoom()))
```
