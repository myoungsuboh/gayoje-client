---
name: フォーム検証 (Forms Validation)
description: クライアントのフォーム検証に関する汎用標準 — 複雑度別のツール選択、同期・非同期検証、デバウンス、送信中の無効化、サーバー422のフィールドマッピング、メッセージのi18n。特定のフレームワークに依存しない。フォーム検証を追加・整備するとき、非同期の重複チェック・サーバー検証エラー表示・検証メッセージの多言語化を実装するとき、検証ツールを選ぶときに読む。キーワード: form validation, client-side, sync, async, debounce, submit, 422, field error, i18n, schema, cross-field。(サーバー側の入力検証はvalidation-bean参照)
rules:
  - "クライアント検証はUXの補助だ: 速いフィードバックでユーザーを助けるためのものにすぎず、セキュリティ・整合性の根拠ではない。実際の強制は必ずサーバーで行う(validation-bean参照)。"
  - "複雑度に合ったツールを選ぶ: フィールド数個の静的ルールならフレームワーク内蔵ルールで十分で、多段階・フィールド間の相互依存・非同期が絡むならスキーマベースのフォームライブラリを使う。小さなフォームに重いツールを持ち込まない。"
  - "制約は宣言的なスキーマで: 必須・長さ・範囲・形式のような制約をハンドラコードに撒き散らさず、入力モデル/スキーマに宣言して一箇所で読めるようにする。"
  - "リアルタイムフィードバック + 非同期は頻度制御: 同期ルールは入力即時にフィードバックを与えるが、サーバーを叩く非同期検証(重複チェック等)はフォーカスアウト時点やデバウンスで呼び出しを減らす。"
  - "送信フローをロックする: 送信中はボタンを無効/ロード状態にして重複送信を防ぎ、検証を通過した値だけを送る。"
  - "サーバー検証エラーをフィールドへ戻す: サーバーが返したフィールド別の検証エラー(例: 4xx/422)は該当入力の横にマッピングして見せる。トースト/通知1行で一括りにしない。"
  - "メッセージはi18nカタログで: 検証文言をハードコードせず、メッセージキーに分離して多言語・文言変更に対応する。"
tags:
  - "form validation"
  - "client-side"
  - "sync"
  - "async"
  - "debounce"
  - "submit"
  - "422"
  - "field error"
  - "i18n"
  - "schema"
  - "cross-field. (서버측 입력 검증은 validation-bean 참조)"
  - "v-model"
  - "vuelidate"
  - "zod"
  - "yup"
  - "validator"
  - "required"
---

# ✅ フォーム検証 (Forms Validation)

> フォームの複雑度に合った検証ツールを選び、リアルタイム(同期)・非同期検証とi18nメッセージを一貫して扱い、送信フローとサーバー検証エラー表示を標準化する。フォーム検証を追加・整備するとき、サーバー検証エラー表示を扱うときに読む。特定のフレームワーク/検証ライブラリに依存しない汎用標準である。(クライアント検証はUXの補助にすぎず、実際の強制はサーバーで行う — サーバー側の入力検証は`validation-bean`参照。)

## 1. 中核原則
- **クライアント検証はUXの補助だ**: 速いフィードバックでユーザーを助けるためのものにすぎず、セキュリティ・整合性の根拠ではない。実際の強制は必ずサーバーで行う(`validation-bean`参照)。
- **複雑度に合ったツールを選ぶ**: フィールド数個の静的ルールならフレームワーク内蔵ルールで十分で、多段階・フィールド間の相互依存・非同期が絡むならスキーマベースのフォームライブラリを使う。小さなフォームに重いツールを持ち込まない。
- **制約は宣言的なスキーマで**: 必須・長さ・範囲・形式のような制約をハンドラコードに撒き散らさず、入力モデル/スキーマに宣言して一箇所で読めるようにする。
- **リアルタイムフィードバック + 非同期は頻度制御**: 同期ルールは入力即時にフィードバックを与えるが、サーバーを叩く非同期検証(重複チェック等)はフォーカスアウト時点やデバウンスで呼び出しを減らす。
- **送信フローをロックする**: 送信中はボタンを無効/ロード状態にして重複送信を防ぎ、検証を通過した値だけを送る。
- **サーバー検証エラーをフィールドへ戻す**: サーバーが返したフィールド別の検証エラー(例: 4xx/422)は該当入力の横にマッピングして見せる。トースト/通知1行で一括りにしない。
- **メッセージはi18nカタログで**: 検証文言をハードコードせず、メッセージキーに分離して多言語・文言変更に対応する。

## 2. ルール

### 2-1. 複雑度に合ったツールを選ぶ
フォーム規模に対して過剰/不足なツールを使わない。

| フォーム複雑度 | 推奨アプローチ |
|---|---|
| フィールド1~3個、静的ルール | フレームワーク内蔵の検証ルール(宣言的なruleリスト) |
| 多段階 · フィールド間の相互依存 · 非同期 | スキーマベースのフォームライブラリ + 検証スキーマ |

```text
// ❌ 禁止 — 小さなフォームに重いフォームライブラリ/スキーマを持ち込む
//          または複雑なフォームを内蔵rule配列に押し込んでcross-fieldがこじれる

// ✅ 推奨 — 複雑度に合わせて選択
簡単:  field.rules = [required, emailFormat]
複雑:  form = useForm({ schema })   // スキーマでcross-field・非同期まで表現
```

### 2-2. 制約は宣言的に、ハンドラに撒き散らさない
入力モデル/スキーマに制約を宣言し、送信ハンドラ本文に即席の`if`-検証を並べない。

```text
// ❌ 禁止 — 送信ハンドラに即席のif-検証が散在
onSubmit():
  if email is empty:        showError('必須')
  if not isEmail(email):    showError('形式')
  if password.length < 8:   showError('短い')
  ...

// ✅ 推奨 — スキーマに制約を宣言、検証は一箇所で
schema:
  email:    required, email
  password: required, minLength 8
onSubmit(validatedValues): send(validatedValues)
```

### 2-3. 同期検証はリアルタイムフィードバック
静的ルールは入力/フォーカスアウト時に即時フィードバックを与える。送信ボタンを押さないとエラーが見えないままにしない。

```text
// ❌ 禁止 — 送信時点のみ検証、それ以前は何の表示もなし
onSubmit(): if (!valid) showAllErrors()

// ✅ 推奨 — 入力している間、該当フィールドのエラーをすぐ表示
field.onInput → validate(field) → showFieldError(field)
```

### 2-4. 非同期検証はデバウンス/blurで頻度制御
サーバーを呼ぶ検証(重複チェック等)はキーストロークごとに送らず、フォーカスアウト時点やデバウンス(例: 300ms)の後に一度送る。

```text
// ❌ 禁止 — 1文字打つたびにサーバー呼び出し
field.onInput → await api.check(value)   // リクエスト殺到

// ✅ 推奨 — デバウンス後に1回、またはblur時点で呼び出し
field.onInput → debounce(300ms, () => api.check(value))
field.onBlur  → api.check(value)
```

### 2-5. 送信中はロックし、通過した値だけを送る
送信が進行している間ボタンを無効/ロードにして重複送信を防ぎ、検証通過の有無を確認した後にのみ送信する。

```text
// ❌ 禁止 — 検証結果に関係なく、連打可能なまま送信
button.onClick → api.post(values)        // ダブルクリック時に重複生成

// ✅ 推奨 — 進行中は無効 + 通過した値だけ
onSubmit():
  if submitting: return
  if (!await validateAll()): return
  submitting = true
  try { await api.post(values) } finally { submitting = false }
button.disabled = submitting || !valid
```

### 2-6. サーバー検証エラー(422)はフィールド別にマッピング
サーバーがフィールド別の理由を込めて4xx/422で返したら、各理由を該当入力の横のエラーにマッピングする。通知1行で一括りにしない。

```text
// ❌ 禁止 — サーバー検証エラーをトースト1行だけで
catch (e): toast('入力が正しくありません')   // どのフィールドか分からない

// ✅ 推奨 — フィールド別の理由を該当入力にマッピング
catch (e):
  if e.status == 422:
    for (field, messages) in e.body.errors:
      setFieldError(field, messages[0])
```

### 2-7. 検証メッセージはi18nキーで
文言をハードコードせず、メッセージキーで書く。詳細はi18nスキル(例: `i18n-internationalization`)を参照する。

```text
// ❌ 禁止 — 文言ハードコード
required: () => '必須入力です'

// ✅ 推奨 — メッセージキー + カタログ
required: () => t('validation.required')

catalog.ko: validation.required = 필수 입력입니다
catalog.en: validation.required = This field is required
```

### 2-8. ファイル検証は専用スキルに従う
ファイル入力の拡張子/サイズ/個数の検証はフォーム検証とは別のトピックだ。ファイルアップロードスキル(例: `file-upload`)をcross-linkで従う。

## 3. よくある間違い
- **送信後にのみ検証** → 入力中のフィードバックがなく、ユーザーが最後まで打ってから初めてエラーを知る。同期ルールはリアルタイムで。
- **すべてのフィールドを手動(watch/onChange)で検証** → 宣言的ルール/スキーマがあるのに直接if-検証を並べ、漏れ・重複が生じる。
- **メッセージハードコード** → 多言語・文言変更がコード修正に波及する。i18nキーに分離する。
- **非同期検証をキーストロークごとに呼び出し** → デバウンス/blurなしでサーバーにリクエストを殺到させる。
- **サーバー422をトーストだけで** → どのフィールドがなぜ間違っているか見えない。フィールド別にマッピングする。
- **送信ロック漏れ** → 進行中のボタンを塞がず、ダブルクリックで重複生成される。
- **プラットフォーム既定の検証だけに依存** → ブラウザ/フレームワーク既定の必須表示だけ使うとカスタムメッセージ・i18nが不可能になる。
- **クライアント検証をセキュリティと勘違い** → クライアントだけ信じてサーバー検証を省く。実際の強制はサーバーで(`validation-bean`)。

## 4. チェックリスト
- [ ] フォーム複雑度に合わせて内蔵ルール/スキーマベースのライブラリを選択したか
- [ ] 制約を入力モデル/スキーマに**宣言的に**定義し、ハンドラにif-検証を撒き散らしていないか
- [ ] 同期検証で**リアルタイムフィードバック**を提供しているか(送信後にのみ検証しない)
- [ ] 非同期(サーバー)検証を**デバウンス/blur**で呼び出し頻度を制御しているか
- [ ] 送信中ボタンを**無効/ロード**にして重複送信を防いでいるか
- [ ] サーバー検証エラー(4xx/422)を**フィールド別エラーにマッピング**しているか(トースト1行で一括りにしない)
- [ ] 検証メッセージを**i18nキー**で書いているか(文言ハードコードなし)
- [ ] ファイル検証は`file-upload`スキルをcross-linkで従っているか
- [ ] クライアント検証を補助に置き、実際の強制はサーバーで行うか(`validation-bean`)

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: React Hook Form + zod/yup、Angular Reactive Forms、Svelte等)に合った例を同じパターンで追加する。上記1~4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Vue 3 (Vuetify rules / VeeValidate + zod)

本文§2-1のツール選択をVueスタックにマッピングしたものだ: **簡単(1~3フィールド、静的ルール)=Vuetify `rules` prop**、**複雑(多段階・cross-field・非同期)=VeeValidate 4 + zod**。メッセージは`t('validation.*')`キー(§2-7)、非同期検証は`useDebounceFn`/`@blur`(§2-4)で制御する。

#### Vuetify `rules` (簡単フォーム)
```vue
<template>
  <VForm ref="formRef" v-model="valid" @submit.prevent="onSubmit">
    <VTextField
      v-model="email"
      :label="t('user.email')"
      :rules="[required, emailFormat]"
    />
    <VBtn type="submit" :disabled="!valid">{{ t('common.save') }}</VBtn>
  </VForm>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const formRef = ref(null)
const valid = ref(false)
const email = ref('')

const required = (v) => !!v || t('validation.required')
const emailFormat = (v) => /^.+@.+\..+$/.test(v) || t('validation.email')

const onSubmit = async () => {
  const { valid: ok } = await formRef.value.validate()
  if (ok) { /* submit */ }
}
</script>
```

#### VeeValidate 4 + zod (複雑フォーム)
```bash
npm install vee-validate @vee-validate/zod zod
```

```vue
<template>
  <form @submit="onSubmit">
    <VTextField
      v-model="email"
      :label="t('user.email')"
      :error-messages="errors.email"
      @blur="emailBlur(); checkEmailUnique(email)"
      @input="debouncedCheck(email)"
    />
    <VTextField
      v-model="password"
      type="password"
      :label="t('user.password')"
      :error-messages="errors.password"
    />
    <VBtn type="submit" :loading="isSubmitting">{{ t('common.save') }}</VBtn>
  </form>
</template>

<script setup>
import { computed } from 'vue'
import { useForm, useField } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import api from '@/utils/axios'

const { t } = useI18n()

// ⚠️ スキーマをcomputedに — メッセージt()をsetup時点で一度固めると言語切替時に更新されない。
//    computedならlocale変更ごとに新スキーマで再評価され、メッセージが追従する。
const schema = computed(() => toTypedSchema(z.object({
  email: z.string().min(1, t('validation.required')).email(t('validation.email')),
  password: z.string().min(8, t('validation.minLength', { n: 8 }))
})))

const { handleSubmit, errors, isSubmitting, setFieldError } = useForm({ validationSchema: schema })
const { value: email, handleBlur: emailBlur } = useField('email', undefined, {
  validateOnValueUpdate: false
})
const { value: password } = useField('password')

// 非同期検証(サーバー重複チェック): blur/デバウンスで呼び出し(本文§2-4)。onSubmit専用ではない。
const checkEmailUnique = async (value) => {
  if (!value) return
  const { data } = await api.get('/users/check', { params: { email: value } })
  setFieldError('email', data.available ? undefined : t('validation.emailTaken'))
}
const debouncedCheck = useDebounceFn(checkEmailUnique, 300)
// テンプレート: @blur="() => { emailBlur(); checkEmailUnique(email) }", @input="debouncedCheck(email)"

const onSubmit = handleSubmit(async (values) => {
  await checkEmailUnique(values.email)   // 送信直前の最終確認
  if (errors.value.email) return         // 重複なら中断
  await api.post('/users', values)
})
</script>
```

> 非同期検証は毎キーストロークではなく`@blur`またはデバウンス(300ms)の後に呼び出す(本文§2-4)。同じ`checkEmailUnique`をblur・デバウンス・送信直前で再利用し、結果を`setFieldError('email', …)`一箇所に集める。

#### サーバー422マッピング (§2-6)

送信中`:loading="isSubmitting"`でダブルクリックを防ぎ、サーバー422レスポンスはフィールド別エラーにマッピングする。

```javascript
try {
  await api.post('/users', values)
} catch (e) {
  if (e.response?.status === 422) {
    Object.entries(e.response.data.errors).forEach(([k, msgs]) => {
      setFieldError(k, msgs[0])
    })
  }
}
```

#### i18nカタログ (§2-7)

検証メッセージは`t('validation.*')`キーで書く(詳細`i18n-internationalization`)。ファイル検証(拡張子/サイズ)は`file-upload`スキルに従う。

```json
{
  "validation": {
    "required": "필수 입력입니다",
    "email": "이메일 형식이 올바르지 않습니다",
    "minLength": "최소 {n}자 이상 입력하세요",
    "emailTaken": "이미 사용 중인 이메일입니다"
  }
}
```
