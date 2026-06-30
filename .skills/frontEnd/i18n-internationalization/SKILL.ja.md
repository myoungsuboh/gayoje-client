---
name: 国際化 (i18n Internationalization)
description: テキストのハードコード禁止・翻訳の分離・安定したキー命名・複数形/補間・ロケールフォーマット・fallback・言語選択の永続を扱うフロントエンド多言語の汎用標準であり、特定の言語/フレームワークに依存しない。多言語を導入・整備するとき、メッセージキー命名・フォーマット・言語切替の永続を決めるときに読む。
rules:
  - "UIテキストをコードにハードコードしない: 画面に見えるすべての文字列は翻訳カタログ(キー → 文言)から取得する。コンポーネント/テンプレートに自然言語リテラルを直接書かない。"
  - "翻訳はコードと分離する: メッセージはロケール別のリソースファイルに分離し、文言変更がコード修正に波及しないようにする。コードは「キー」だけを知る。"
  - "キーは安定的で意味ベースに: キーは翻訳文ではなく「役割」を指す。自然言語の文言そのものをキーにしない(文言が変わるとキーが壊れる)。ドメイン・画面・要素を表す階層的なキーを使う。"
  - "動的値は補間で、複数形は規則で: 文字列を直接つなぎ合わせ(concatenation)ず、名前付きの自リプレースホルダ(placeholder)で注入する。個数による単/複数の変化は言語別の複数形規則に従う。"
  - "日付・数値・通貨はロケールフォーマッタで: 直接文字列を組み立てたり一つのロケール基準で固定したりしない。ロケール別のフォーマット規則(桁区切り・通貨記号・日付表記)を適用する。"
  - "欠落はfallbackで安全に: 特定のロケールにキーがなければ既定のロケールに落とす。開発段階では欠落キーを警告で即座に表に出す。"
  - "言語選択を永続する: ユーザーが選んだ言語をストレージ(例: ローカルストレージ/クッキー/サーバー設定)に永続し、再訪時に復元する。"
  - "文書の言語属性を更新する: 言語切替時に文書ルートの言語属性(<html lang>)も更新し、アクセシビリティ・検索エンジン・ブラウザ機能が正しい言語を認識するようにする。"
tags:
  - "vue-i18n"
  - "useI18n"
  - "$t("
  - "createI18n"
  - "messages"
  - "locale"
---

# 🌐 国際化 (i18n Internationalization)

> UIに露出するすべてのテキストをコード外の翻訳カタログに分離し、安定したキーで参照し、日付・数値・通貨をロケール規則でフォーマットし、ユーザーの言語選択を永続する。多言語を導入・整備するとき、メッセージキー・フォーマット・言語切替を扱うときに読む。特定の言語/フレームワークに依存しない汎用標準である。

## 1. 中核原則
- **UIテキストをコードにハードコードしない**: 画面に見えるすべての文字列は翻訳カタログ(キー → 文言)から取得する。コンポーネント/テンプレートに自然言語リテラルを直接書かない。
- **翻訳はコードと分離する**: メッセージはロケール別のリソースファイルに分離し、文言変更がコード修正に波及しないようにする。コードは「キー」だけを知る。
- **キーは安定的で意味ベースに**: キーは翻訳文ではなく「役割」を指す。自然言語の文言そのものをキーにしない(文言が変わるとキーが壊れる)。ドメイン・画面・要素を表す階層的なキーを使う。
- **動的値は補間で、複数形は規則で**: 文字列を直接つなぎ合わせ(concatenation)ず、名前付きの自リプレースホルダ(placeholder)で注入する。個数による単/複数の変化は言語別の複数形規則に従う。
- **日付・数値・通貨はロケールフォーマッタで**: 直接文字列を組み立てたり一つのロケール基準で固定したりしない。ロケール別のフォーマット規則(桁区切り・通貨記号・日付表記)を適用する。
- **欠落はfallbackで安全に**: 特定のロケールにキーがなければ既定のロケールに落とす。開発段階では欠落キーを警告で即座に表に出す。
- **言語選択を永続する**: ユーザーが選んだ言語をストレージ(例: ローカルストレージ/クッキー/サーバー設定)に永続し、再訪時に復元する。
- **文書の言語属性を更新する**: 言語切替時に文書ルートの言語属性(`<html lang>`)も更新し、アクセシビリティ・検索エンジン・ブラウザ機能が正しい言語を認識するようにする。

## 2. ルール

### 2-1. UIテキストをハードコードしない
- 画面に見える文字列は翻訳関数/カタログを経由する。コンポーネントに自然言語リテラルを埋め込まない。

```text
// ❌ 禁止 — 自然言語を画面に直接埋め込む
render: "안녕하세요"

// ✅ 推奨 — キーで参照、文言はカタログから
render: t("user.profile.greeting")
```

### 2-2. 翻訳をロケール別リソースに分離する
- ロケールごとに別リソース(ファイル/バンドル)を置き、同じキー集合を共有する。
- コードはキーだけを知る。文言変更はリソースだけを直す。

```text
// ロケール別リソース(同じキー、異なる文言)
resource[ko]:  common.save = "저장"
resource[en]:  common.save = "Save"
```

### 2-3. キーは安定的・階層的・意味ベースに
- キーは「役割」を指す。**自然言語の文言をキーにしない**(文言が変わると壊れる)。
- `<ドメイン>.<画面>.<要素>`のような階層ネームスペースで衝突・重複を防ぐ。共通文言は共用ネームスペース(例: `common.*`)に集める。

```text
// ❌ 禁止 — 自然言語そのものがキー
t("안녕하세요")

// ✅ 推奨 — 意味ベースの階層キー
t("user.profile.greeting")     // <ドメイン>.<画面>.<要素>
t("common.save")               // 共通ネームスペース
```

### 2-4. 動的値は補間、複数形は規則で
- 文字列を直接つなぎ合わせず、**名前付きの自リプレースホルダ**で値を注入する(語順が言語ごとに異なる)。
- 個数による表現変化は**言語別の複数形規則**で処理する — コードで`if (n === 1)`分岐を作らない。

```text
// ❌ 禁止 — 文字列の連結(語順/複数形が壊れる)
"항목 " + count + "개"

// ✅ 推奨 — 補間 + 複数形規則
t("user.profile.greeting", { name })       // "안녕하세요, {name}님"
t("user.profile.itemCount", count)         // 複数形規則で単/複数を選択
```

### 2-5. 日付・数値・通貨はロケールフォーマッタで
- 直接文字列を組み立てたり一つのロケールに固定したりしない。ロケール規則(桁区切り・通貨記号・日付表記順)を適用する。
- フォーマット定義(例: `short`日付、`currency`数値)は一箇所に集めて再利用する。

```text
// ❌ 禁止 — 一つのロケール基準で手動組み立て
year + "-" + month + "-" + day
"₩" + price

// ✅ 推奨 — ロケールフォーマッタ
formatDate(value, "short")     // ko: 2026-06-17 / en: Jun 17, 2026
formatNumber(price, "currency")// ko: ₩1,234 / en: $1,234.00
```

### 2-6. 欠落キーはfallback + 開発警告で
- 現在のロケールにキーがなければ**既定のロケールにfallback**し、画面が壊れたりキー文字列がそのまま露出したりしないようにする。
- 開発段階では欠落キー/欠落fallbackを**警告で即座に表に出す**(本番では静かにfallback)。

```text
// 設定の概念
fallbackLocale = 既定のロケール
missingWarn    = (開発モードでのみ) on

// enになければ → 既定のロケール文言に、開発中は警告を出力
```

### 2-7. 言語選択の永続 + 文書lang更新
- ユーザーが選んだ言語を**永続ストレージ**(ローカルストレージ/クッキー/サーバープロフィール等)に保存し、起動時に復元する。
- 言語切替時に一箇所(状態管理/切替関数)で ① アクティブロケール変更 ② 永続保存 ③ **文書ルートlang属性更新** を一緒に行う。

```text
// ✅ 推奨 — 切替を一箇所で一貫処理
setLocale(lang):
  activeLocale = lang                 // アクティブロケール変更
  persist("locale", lang)             // 永続保存(再訪復元用)
  document.root.lang = lang           // <html lang>更新(アクセシビリティ/SEO)

// 起動時
activeLocale = persisted("locale") ?? 既定のロケール
```

## 3. よくある間違い
- **テキストハードコード** → 自然言語をコンポーネントに直接埋め込むと翻訳自体が不可能。キーで参照する。
- **自然言語をキーに使用** → 文言が変わるとキーが壊れる。意味ベースの階層キーを使う。
- **文字列連結で文を組み立て** → 語順が異なる言語で壊れる。名前付き補間を使う。
- **複数形をコード分岐で処理** → 言語ごとに複数形規則が違って間違う。複数形規則機能に任せる。
- **日付/数値/通貨を手動組み立て・単一ロケール固定** → ロケール別フォーマットが壊れる。ロケールフォーマッタを使う。
- **キーネームスペース未使用** → キー衝突・重複定義が多発する。階層ネームスペースで分離する。
- **fallback/欠落検知未設定** → キー文字列がそのまま露出したり欠落を捕まえられない。fallback + 開発警告をonにする。
- **言語選択未永続** → リロード/再訪時に言語が初期化される。永続保存後に復元する。
- **文書lang未更新** → スクリーンリーダー・検索エンジン・ブラウザ機能が誤った言語で動作する。切替時に`<html lang>`を更新する。

## 4. チェックリスト
- [ ] UIテキストをハードコードせず**翻訳カタログ**から取得しているか
- [ ] 翻訳を**ロケール別リソース**に分離しコードはキーだけを参照するか
- [ ] キーが自然言語ではなく**意味ベースの階層キー**(`<ドメイン>.<画面>.<要素>`)か
- [ ] 動的値を**名前付き補間**で注入するか(文字列連結禁止)
- [ ] 複数形を**言語別の複数形規則**で処理するか(コード分岐禁止)
- [ ] 日付・数値・通貨を**ロケールフォーマッタ**で処理するか(単一ロケール固定禁止)
- [ ] 欠落キーに**fallback**が動作し、開発モードで**欠落警告**がonになっているか
- [ ] ユーザーの言語選択を**永続**し起動時に復元するか
- [ ] 言語切替時に**文書ルートlang属性**を更新するか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: React/react-i18next・FormatJS、Angular i18n、Svelte等)に合った例を同じパターンで追加する。上記1~4の原則・ルールが標準であり、付録はその適用事例にすぎない。エラーメッセージ等のサーバー側多言語はバックエンドの入力値検証標準(validation-bean)を併せて参照する。

### Vue 3 (vue-i18n)

> 本文1~4の原則・ルールをvue-i18n 9 + Vuetify localeアダプタで実装した**コード例**だ。キー命名(本文2-3)・fallback(本文2-6)・言語切替の永続と`<html lang>`更新(本文2-7)の「なぜ」は本文を見る。ここでは`legacy: false`(Composition APIモード)初期化と実際の永続コードだけを載せる。

#### インストールおよび初期化
```bash
npm install vue-i18n@9
```

```javascript
// src/plugins/i18n.js
import { createI18n } from 'vue-i18n'
import ko from '@/locales/ko.json'
import en from '@/locales/en.json'

export const i18n = createI18n({
  legacy: false, // Composition APIモード必須
  locale: localStorage.getItem('locale') || 'ko',
  fallbackLocale: 'en',
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
  messages: { ko, en },
  datetimeFormats: {
    ko: { short: { year: 'numeric', month: '2-digit', day: '2-digit' } },
    en: { short: { year: 'numeric', month: 'short', day: '2-digit' } }
  },
  numberFormats: {
    ko: { currency: { style: 'currency', currency: 'KRW' } },
    en: { currency: { style: 'currency', currency: 'USD' } }
  }
})
```

#### メッセージファイル構造
- `src/locales/ko.json`, `src/locales/en.json`
- キーは英文ドメイン表記。**韓国語をキーに使わないこと。**

複数形は`|`で単/複数の形態を区別する。言語ごとに形態の数が異なる — 韓国語は単・複数の屈折がなく一つの形態(`"항목 {count}개"`)で十分で、英語は単数/複数が分かれるので二つの形態が必要だ。

```json
// en.json — 単数/複数が実際に異なる言語
{
  "common": { "save": "Save", "cancel": "Cancel" },
  "user": {
    "profile": {
      "title": "Profile",
      "greeting": "Hello, {name}",
      "itemCount": "1 item | {count} items"
    }
  }
}
// ko.json — 屈折がなく一つの形態で十分: "itemCount": "항목 {count}개"
```

#### Vuetify Localeアダプタ連携
```javascript
// src/plugins/vuetify.js
import { createVuetify } from 'vuetify'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { useI18n } from 'vue-i18n'
import { i18n } from './i18n'

export const vuetify = createVuetify({
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n })
  }
})
```

#### コンポーネント使用
```vue
<template>
  <VCard>
    <VCardTitle>{{ t('user.profile.title') }}</VCardTitle>
    <VCardText>
      <p>{{ t('user.profile.greeting', { name: userName }) }}</p>
      <p>{{ t('user.profile.itemCount', count) }}</p>
      <p>{{ d(new Date(), 'short') }}</p>
      <p>{{ n(1234.5, 'currency') }}</p>
      <VBtn @click="changeLocale('en')">English</VBtn>
    </VCardText>
  </VCard>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocaleStore } from '@/store/locale'

const { t, d, n } = useI18n()
const userName = ref('홍길동')
const count = ref(3)

const localeStore = useLocaleStore()
const changeLocale = (lang) => localeStore.setLocale(lang)
</script>
```

#### 言語切替 + 永続 (本文2-7 — 一箇所でロケール変更・永続・`<html lang>`更新)
```javascript
// src/store/locale.js
import { defineStore } from 'pinia'
import { i18n } from '@/plugins/i18n'

export const useLocaleStore = defineStore('locale', {
  state: () => ({ locale: localStorage.getItem('locale') || 'ko' }),
  actions: {
    setLocale(lang) {
      this.locale = lang
      i18n.global.locale.value = lang
      localStorage.setItem('locale', lang)
      document.documentElement.setAttribute('lang', lang)
    }
  }
})
```

> キー命名(`<ドメイン>.<画面>.<要素>`・`common.*`)は本文2-3、fallbackと`missingWarn`の動作は本文2-6に従う — 上の初期化コードの`fallbackLocale`/`missingWarn`設定がその実装である。
