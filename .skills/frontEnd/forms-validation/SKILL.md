---
name: 폼 검증 (Forms Validation)
description: 클라이언트 폼 검증의 범용 표준 — 복잡도별 도구 선택, 동기·비동기 검증, 디바운스, 제출 중 비활성화, 서버 422 필드 매핑, 메시지 i18n. 특정 프레임워크에 무관하다. 폼 검증을 추가·정비하거나 비동기 중복 체크·서버 검증 오류 표시·검증 메시지 다국어화를 구현할 때, 검증 도구를 고를 때 읽는다. 키워드: form validation, client-side, sync, async, debounce, submit, 422, field error, i18n, schema, cross-field. (서버측 입력 검증은 validation-bean 참조)
rules:
  - "클라이언트 검증은 UX 보조다: 빠른 피드백으로 사용자를 돕는 용도일 뿐, 보안·정합성의 근거가 아니다. 실제 강제는 반드시 서버에서 한다 (validation-bean 참조)."
  - "복잡도에 맞는 도구를 고른다: 필드 몇 개의 정적 규칙이면 프레임워크 내장 규칙으로 충분하고, 다단계·필드 간 상호 의존·비동기가 얽히면 스키마 기반 폼 라이브러리를 쓴다. 작은 폼에 무거운 도구를 끌어오지 않는다."
  - "제약은 선언적 스키마로: 필수·길이·범위·형식 같은 제약을 핸들러 코드에 흩뿌리지 말고 입력 모델/스키마에 선언해 한곳에서 읽히게 한다."
  - "실시간 피드백 + 비동기는 빈도 제어: 동기 규칙은 입력 즉시 피드백을 주되, 서버를 때리는 비동기 검증(중복 체크 등)은 포커스 아웃 시점이나 디바운스로 호출을 줄인다."
  - "제출 흐름을 잠근다: 제출 중에는 버튼을 비활성/로딩 상태로 두어 중복 제출을 막고, 검증을 통과한 값만 보낸다."
  - "서버 검증 오류를 필드로 되돌린다: 서버가 돌려준 필드별 검증 오류(예: 4xx/422)는 해당 입력 옆에 매핑해 보여 준다. 토스트/알림 한 줄로 뭉뚱그리지 않는다."
  - "메시지는 i18n 카탈로그로: 검증 문구를 하드코딩하지 말고 메시지 키로 분리해 다국어·문구 변경에 대응한다."
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

# ✅ 폼 검증 (Forms Validation)

> 폼 복잡도에 맞는 검증 도구를 고르고, 실시간(동기)·비동기 검증과 i18n 메시지를 일관되게 다루며, 제출 흐름과 서버 검증 오류 표시를 표준화한다. 폼 검증을 추가·정비하거나 서버 검증 오류 표시를 다룰 때 읽는다. 특정 프레임워크/검증 라이브러리에 종속되지 않는 범용 표준이다. (클라이언트 검증은 UX 보조일 뿐이며, 실제 강제는 서버에서 한다 — 서버측 입력 검증은 `validation-bean` 참조.)

## 1. 핵심 원칙
- **클라이언트 검증은 UX 보조다**: 빠른 피드백으로 사용자를 돕는 용도일 뿐, 보안·정합성의 근거가 아니다. 실제 강제는 반드시 서버에서 한다 (`validation-bean` 참조).
- **복잡도에 맞는 도구를 고른다**: 필드 몇 개의 정적 규칙이면 프레임워크 내장 규칙으로 충분하고, 다단계·필드 간 상호 의존·비동기가 얽히면 스키마 기반 폼 라이브러리를 쓴다. 작은 폼에 무거운 도구를 끌어오지 않는다.
- **제약은 선언적 스키마로**: 필수·길이·범위·형식 같은 제약을 핸들러 코드에 흩뿌리지 말고 입력 모델/스키마에 선언해 한곳에서 읽히게 한다.
- **실시간 피드백 + 비동기는 빈도 제어**: 동기 규칙은 입력 즉시 피드백을 주되, 서버를 때리는 비동기 검증(중복 체크 등)은 포커스 아웃 시점이나 디바운스로 호출을 줄인다.
- **제출 흐름을 잠근다**: 제출 중에는 버튼을 비활성/로딩 상태로 두어 중복 제출을 막고, 검증을 통과한 값만 보낸다.
- **서버 검증 오류를 필드로 되돌린다**: 서버가 돌려준 필드별 검증 오류(예: 4xx/422)는 해당 입력 옆에 매핑해 보여 준다. 토스트/알림 한 줄로 뭉뚱그리지 않는다.
- **메시지는 i18n 카탈로그로**: 검증 문구를 하드코딩하지 말고 메시지 키로 분리해 다국어·문구 변경에 대응한다.

## 2. 규칙

### 2-1. 복잡도에 맞는 도구를 고른다
폼 규모에 비해 과한/모자란 도구를 쓰지 않는다.

| 폼 복잡도 | 권장 접근 |
|---|---|
| 필드 1~3개, 정적 규칙 | 프레임워크 내장 검증 규칙(선언적 rule 목록) |
| 다단계 · 필드 간 상호 의존 · 비동기 | 스키마 기반 폼 라이브러리 + 검증 스키마 |

```text
// ❌ 금지 — 작은 폼에 무거운 폼 라이브러리/스키마를 끌어옴
//          또는 복잡한 폼을 내장 rule 배열로 우겨넣어 cross-field가 꼬임

// ✅ 권장 — 복잡도에 맞춰 선택
간단:  field.rules = [required, emailFormat]
복잡:  form = useForm({ schema })   // 스키마로 cross-field·비동기까지 표현
```

### 2-2. 제약은 선언적으로, 핸들러에 흩뿌리지 않는다
입력 모델/스키마에 제약을 선언하고, 제출 핸들러 본문에 즉석 `if`-검증을 늘어놓지 않는다.

```text
// ❌ 금지 — 제출 핸들러에 즉석 if-검증이 흩어짐
onSubmit():
  if email is empty:        showError('필수')
  if not isEmail(email):    showError('형식')
  if password.length < 8:   showError('짧음')
  ...

// ✅ 권장 — 스키마에 제약 선언, 검증은 한 곳에서
schema:
  email:    required, email
  password: required, minLength 8
onSubmit(validatedValues): send(validatedValues)
```

### 2-3. 동기 검증은 실시간 피드백
정적 규칙은 입력/포커스 아웃 시 즉시 피드백을 준다. 제출 버튼을 눌러야만 오류가 보이게 두지 않는다.

```text
// ❌ 금지 — 제출 시점에만 검증, 그 전엔 아무 표시 없음
onSubmit(): if (!valid) showAllErrors()

// ✅ 권장 — 입력하는 동안 해당 필드 오류를 바로 표시
field.onInput → validate(field) → showFieldError(field)
```

### 2-4. 비동기 검증은 디바운스/blur로 빈도 제어
서버를 호출하는 검증(중복 체크 등)은 매 keystroke마다 보내지 말고, 포커스 아웃 시점이나 디바운스(예: 300ms) 후에 한 번 보낸다.

```text
// ❌ 금지 — 글자 하나 칠 때마다 서버 호출
field.onInput → await api.check(value)   // 요청 폭주

// ✅ 권장 — 디바운스 후 1회, 또는 blur 시점에 호출
field.onInput → debounce(300ms, () => api.check(value))
field.onBlur  → api.check(value)
```

### 2-5. 제출 중에는 잠그고, 통과한 값만 보낸다
제출이 진행되는 동안 버튼을 비활성/로딩으로 두어 중복 제출을 막고, 검증 통과 여부를 확인한 뒤에만 전송한다.

```text
// ❌ 금지 — 검증 결과와 무관하게, 연타 가능한 채로 전송
button.onClick → api.post(values)        // 더블 클릭 시 중복 생성

// ✅ 권장 — 진행 중 비활성 + 통과한 값만
onSubmit():
  if submitting: return
  if (!await validateAll()): return
  submitting = true
  try { await api.post(values) } finally { submitting = false }
button.disabled = submitting || !valid
```

### 2-6. 서버 검증 오류(422)는 필드별로 매핑
서버가 필드별 사유를 담아 4xx/422로 돌려주면, 각 사유를 해당 입력 옆 오류로 매핑한다. 알림 한 줄로 뭉뚱그리지 않는다.

```text
// ❌ 금지 — 서버 검증 오류를 토스트 한 줄로만
catch (e): toast('입력이 올바르지 않습니다')   // 어느 필드인지 모름

// ✅ 권장 — 필드별 사유를 해당 입력에 매핑
catch (e):
  if e.status == 422:
    for (field, messages) in e.body.errors:
      setFieldError(field, messages[0])
```

### 2-7. 검증 메시지는 i18n 키로
문구를 하드코딩하지 말고 메시지 키로 작성한다. 상세는 i18n 스킬(예: `i18n-internationalization`)을 참고한다.

```text
// ❌ 금지 — 문구 하드코딩
required: () => '필수 입력입니다'

// ✅ 권장 — 메시지 키 + 카탈로그
required: () => t('validation.required')

catalog.ko: validation.required = 필수 입력입니다
catalog.en: validation.required = This field is required
```

### 2-8. 파일 검증은 전용 스킬을 따른다
파일 입력의 확장자/크기/개수 검증은 폼 검증과 별개 주제다. 파일 업로드 스킬(예: `file-upload`)을 cross-link로 따른다.

## 3. 흔한 실수
- **제출 후에만 검증** → 입력 중 피드백이 없어 사용자가 끝까지 친 뒤에야 오류를 안다. 동기 규칙은 실시간으로.
- **모든 필드를 수동(watch/onChange)으로 검증** → 선언적 규칙/스키마를 두고도 직접 if-검증을 늘어놓아 누락·중복이 생긴다.
- **메시지 하드코딩** → 다국어·문구 변경이 코드 수정으로 번진다. i18n 키로 분리한다.
- **비동기 검증을 keystroke마다 호출** → 디바운스/blur 없이 서버에 요청을 폭주시킨다.
- **서버 422를 토스트로만** → 어느 필드가 왜 틀렸는지 안 보인다. 필드별로 매핑한다.
- **제출 잠금 누락** → 진행 중 버튼을 막지 않아 더블 클릭으로 중복 생성된다.
- **플랫폼 기본 검증만 의존** → 브라우저/프레임워크 기본 필수 표시만 쓰면 커스텀 메시지·i18n이 불가능하다.
- **클라이언트 검증을 보안으로 착각** → 클라이언트만 믿고 서버 검증을 생략한다. 실제 강제는 서버에서(`validation-bean`).

## 4. 체크리스트
- [ ] 폼 복잡도에 맞춰 내장 규칙/스키마 기반 라이브러리를 선택했는가
- [ ] 제약을 입력 모델/스키마에 **선언적으로** 정의하고 핸들러에 if-검증을 흩뿌리지 않았는가
- [ ] 동기 검증으로 **실시간 피드백**을 제공하는가 (제출 후에만 검증하지 않음)
- [ ] 비동기(서버) 검증을 **디바운스/blur**로 호출 빈도를 제어하는가
- [ ] 제출 중 버튼을 **비활성/로딩**으로 두어 중복 제출을 막는가
- [ ] 서버 검증 오류(4xx/422)를 **필드별 오류로 매핑**하는가 (토스트 한 줄로 뭉치지 않음)
- [ ] 검증 메시지를 **i18n 키**로 작성하는가 (문구 하드코딩 없음)
- [ ] 파일 검증은 `file-upload` 스킬을 cross-link로 따르는가
- [ ] 클라이언트 검증을 보조로 두고 실제 강제는 서버에서 하는가 (`validation-bean`)

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React Hook Form + zod/yup, Angular Reactive Forms, Svelte 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vue 3 (Vuetify rules / VeeValidate + zod)

본문 §2-1 도구 선택을 Vue 스택에 매핑한 것이다: **간단(1~3 필드, 정적 룰)=Vuetify `rules` prop**, **복잡(다단계·cross-field·비동기)=VeeValidate 4 + zod**. 메시지는 `t('validation.*')` 키(§2-7), 비동기 검증은 `useDebounceFn`/`@blur`(§2-4)로 제어한다.

#### Vuetify `rules` (간단 폼)
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

#### VeeValidate 4 + zod (복잡 폼)
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

// ⚠️ 스키마를 computed 로 — 메시지 t() 를 setup 시점에 한 번 굳히면 언어 전환 시 갱신 안 됨.
//    computed 면 locale 변경마다 새 스키마로 재평가되어 메시지가 따라간다.
const schema = computed(() => toTypedSchema(z.object({
  email: z.string().min(1, t('validation.required')).email(t('validation.email')),
  password: z.string().min(8, t('validation.minLength', { n: 8 }))
})))

const { handleSubmit, errors, isSubmitting, setFieldError } = useForm({ validationSchema: schema })
const { value: email, handleBlur: emailBlur } = useField('email', undefined, {
  validateOnValueUpdate: false
})
const { value: password } = useField('password')

// 비동기 검증(서버 중복 체크): blur/디바운스로 호출 (본문 §2-4). onSubmit 전용 아님.
const checkEmailUnique = async (value) => {
  if (!value) return
  const { data } = await api.get('/users/check', { params: { email: value } })
  setFieldError('email', data.available ? undefined : t('validation.emailTaken'))
}
const debouncedCheck = useDebounceFn(checkEmailUnique, 300)
// 템플릿: @blur="() => { emailBlur(); checkEmailUnique(email) }", @input="debouncedCheck(email)"

const onSubmit = handleSubmit(async (values) => {
  await checkEmailUnique(values.email)   // 제출 직전 최종 확인
  if (errors.value.email) return         // 중복이면 중단
  await api.post('/users', values)
})
</script>
```

> 비동기 검증은 매 keystroke가 아니라 `@blur` 또는 디바운스(300ms) 후 호출한다(본문 §2-4). 같은 `checkEmailUnique` 를 blur·디바운스·제출 직전에 재사용해 결과를 `setFieldError('email', …)` 한 곳으로 모은다.

#### 서버 422 매핑 (§2-6)

제출 중 `:loading="isSubmitting"`로 더블 클릭을 막고, 서버 422 응답은 필드별 에러로 매핑한다.

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

#### i18n 카탈로그 (§2-7)

검증 메시지는 `t('validation.*')` 키로 작성한다(상세 `i18n-internationalization`). 파일 검증(확장자/크기)은 `file-upload` 스킬을 따른다.

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
