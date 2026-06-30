---
name: Forms Validation (Forms Validation)
description: A universal standard for client-side form validation — choosing tools by complexity, sync/async validation, debounce, disabling during submit, mapping server 422 to fields, message i18n. Framework-agnostic. Read when adding or refining form validation, implementing async duplicate checks, displaying server validation errors, or internationalizing validation messages, and when choosing a validation tool. Keywords: form validation, client-side, sync, async, debounce, submit, 422, field error, i18n, schema, cross-field. (For server-side input validation, see validation-bean)
rules:
  - "Client validation is a UX aid: it merely helps users with fast feedback and is not the basis for security or integrity. Actual enforcement must be done on the server (see validation-bean)."
  - "Choose a tool that matches the complexity: built-in framework rules suffice for static rules on a few fields, but use a schema-based form library when multi-step, cross-field interdependence, or async are involved. Do not drag a heavy tool into a small form."
  - "Constraints as a declarative schema: do not scatter constraints like required, length, range, and format across handler code; declare them in the input model/schema so they are read in one place."
  - "Real-time feedback + frequency control for async: sync rules give feedback immediately on input, but reduce calls for async validation that hits the server (duplicate checks, etc.) via the focus-out moment or debounce."
  - "Lock the submit flow: during submit, keep the button disabled/loading to prevent duplicate submission, and send only the values that passed validation."
  - "Return server validation errors to fields: per-field validation errors returned by the server (e.g., 4xx/422) are mapped and shown next to the relevant input. Do not lump them into a single toast/alert line."
  - "Messages via an i18n catalog: do not hardcode validation text; separate it into message keys to handle multilingual support and wording changes."
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

# ✅ Forms Validation (Forms Validation)

> Choose a validation tool that matches the form's complexity, handle real-time (sync)/async validation and i18n messages consistently, and standardize the submit flow and server validation error display. Read when adding or refining form validation or handling server validation error display. This is a universal standard not tied to a specific framework/validation library. (Client validation is only a UX aid; actual enforcement is done on the server — for server-side input validation, see `validation-bean`.)

## 1. Core Principles
- **Client validation is a UX aid**: it merely helps users with fast feedback and is not the basis for security or integrity. Actual enforcement must be done on the server (see `validation-bean`).
- **Choose a tool that matches the complexity**: built-in framework rules suffice for static rules on a few fields, but use a schema-based form library when multi-step, cross-field interdependence, or async are involved. Do not drag a heavy tool into a small form.
- **Constraints as a declarative schema**: do not scatter constraints like required, length, range, and format across handler code; declare them in the input model/schema so they are read in one place.
- **Real-time feedback + frequency control for async**: sync rules give feedback immediately on input, but reduce calls for async validation that hits the server (duplicate checks, etc.) via the focus-out moment or debounce.
- **Lock the submit flow**: during submit, keep the button disabled/loading to prevent duplicate submission, and send only the values that passed validation.
- **Return server validation errors to fields**: per-field validation errors returned by the server (e.g., 4xx/422) are mapped and shown next to the relevant input. Do not lump them into a single toast/alert line.
- **Messages via an i18n catalog**: do not hardcode validation text; separate it into message keys to handle multilingual support and wording changes.

## 2. Rules

### 2-1. Choose a tool that matches the complexity
Do not use a tool that is excessive/insufficient for the form's scale.

| Form complexity | Recommended approach |
|---|---|
| 1~3 fields, static rules | Framework built-in validation rules (declarative rule list) |
| Multi-step · cross-field interdependence · async | Schema-based form library + validation schema |

```text
// ❌ Forbidden — dragging a heavy form library/schema into a small form
//          or cramming a complex form into a built-in rule array, tangling cross-field

// ✅ Recommended — choose according to complexity
Simple:  field.rules = [required, emailFormat]
Complex: form = useForm({ schema })   // express cross-field/async with a schema
```

### 2-2. Constraints declaratively, not scattered across handlers
Declare constraints in the input model/schema and do not line up ad-hoc `if`-validations in the submit handler body.

```text
// ❌ Forbidden — ad-hoc if-validations scattered in the submit handler
onSubmit():
  if email is empty:        showError('required')
  if not isEmail(email):    showError('format')
  if password.length < 8:   showError('too short')
  ...

// ✅ Recommended — declare constraints in the schema, validate in one place
schema:
  email:    required, email
  password: required, minLength 8
onSubmit(validatedValues): send(validatedValues)
```

### 2-3. Sync validation gives real-time feedback
Static rules give feedback immediately on input/focus-out. Do not leave errors visible only after the submit button is pressed.

```text
// ❌ Forbidden — validates only at submit time, nothing shown before
onSubmit(): if (!valid) showAllErrors()

// ✅ Recommended — show the field error right away while typing
field.onInput → validate(field) → showFieldError(field)
```

### 2-4. Async validation controls frequency via debounce/blur
Validation that calls the server (duplicate checks, etc.) should not be sent on every keystroke; send it once at the focus-out moment or after a debounce (e.g., 300ms).

```text
// ❌ Forbidden — server call on every keystroke
field.onInput → await api.check(value)   // request flood

// ✅ Recommended — once after debounce, or call at blur
field.onInput → debounce(300ms, () => api.check(value))
field.onBlur  → api.check(value)
```

### 2-5. Lock during submit, send only the passed values
While submit is in progress, keep the button disabled/loading to prevent duplicate submission, and send only after confirming validation passed.

```text
// ❌ Forbidden — sends regardless of validation result, still clickable repeatedly
button.onClick → api.post(values)        // duplicate creation on double click

// ✅ Recommended — disabled while in progress + only passed values
onSubmit():
  if submitting: return
  if (!await validateAll()): return
  submitting = true
  try { await api.post(values) } finally { submitting = false }
button.disabled = submitting || !valid
```

### 2-6. Map server validation errors (422) per field
When the server returns 4xx/422 with per-field reasons, map each reason to an error next to the relevant input. Do not lump them into a single alert line.

```text
// ❌ Forbidden — server validation errors as a single toast line only
catch (e): toast('Input is invalid')   // which field is unknown

// ✅ Recommended — map per-field reasons to the relevant input
catch (e):
  if e.status == 422:
    for (field, messages) in e.body.errors:
      setFieldError(field, messages[0])
```

### 2-7. Validation messages as i18n keys
Do not hardcode text; write it as message keys. For details, refer to the i18n skill (e.g., `i18n-internationalization`).

```text
// ❌ Forbidden — hardcoded text
required: () => 'This field is required'

// ✅ Recommended — message key + catalog
required: () => t('validation.required')

catalog.ko: validation.required = 필수 입력입니다
catalog.en: validation.required = This field is required
```

### 2-8. File validation follows the dedicated skill
Extension/size/count validation of file inputs is a separate topic from form validation. Follow the file upload skill (e.g., `file-upload`) as a cross-link.

## 3. Common Mistakes
- **Validating only after submit** → with no feedback while typing, the user only learns of errors after typing everything. Sync rules in real time.
- **Validating all fields manually (watch/onChange)** → even with declarative rules/schema, you line up direct if-validations, causing omissions and duplication.
- **Hardcoding messages** → multilingual support and wording changes spill into code edits. Separate into i18n keys.
- **Calling async validation on every keystroke** → without debounce/blur, you flood the server with requests.
- **Server 422 as a toast only** → you cannot see which field is wrong and why. Map it per field.
- **Missing submit lock** → not blocking the button while in progress causes duplicate creation on double click.
- **Relying only on platform default validation** → using only the browser/framework default required indicator makes custom messages/i18n impossible.
- **Mistaking client validation for security** → trusting only the client and skipping server validation. Actual enforcement is on the server (`validation-bean`).

## 4. Checklist
- [ ] Did you choose built-in rules/a schema-based library according to form complexity?
- [ ] Did you define constraints **declaratively** in the input model/schema and not scatter if-validations across handlers?
- [ ] Do you provide **real-time feedback** with sync validation (not validating only after submit)?
- [ ] Do you control async (server) validation frequency via **debounce/blur**?
- [ ] Do you keep the button **disabled/loading** during submit to prevent duplicate submission?
- [ ] Do you **map server validation errors (4xx/422) to per-field errors** (not lumped into a single toast line)?
- [ ] Do you write validation messages as **i18n keys** (no hardcoded text)?
- [ ] Does file validation follow the `file-upload` skill as a cross-link?
- [ ] Do you keep client validation as an aid and do the actual enforcement on the server (`validation-bean`)?

## Appendix: Stack-specific Examples

> The following are reference implementation examples. Add examples for the stack your team uses (e.g., React Hook Form + zod/yup, Angular Reactive Forms, Svelte) following the same pattern. The principles/rules in 1~4 above are the standard; the appendix is merely an application case.

### Vue 3 (Vuetify rules / VeeValidate + zod)

This maps the tool selection in §2-1 of the main text to the Vue stack: **simple (1~3 fields, static rules) = Vuetify `rules` prop**, **complex (multi-step, cross-field, async) = VeeValidate 4 + zod**. Messages use `t('validation.*')` keys (§2-7), and async validation is controlled with `useDebounceFn`/`@blur` (§2-4).

#### Vuetify `rules` (simple form)
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

#### VeeValidate 4 + zod (complex form)
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

// ⚠️ Make the schema a computed — if you freeze the message t() once at setup time, it won't refresh on language switch.
//    With computed, it is re-evaluated as a new schema on every locale change so the messages follow.
const schema = computed(() => toTypedSchema(z.object({
  email: z.string().min(1, t('validation.required')).email(t('validation.email')),
  password: z.string().min(8, t('validation.minLength', { n: 8 }))
})))

const { handleSubmit, errors, isSubmitting, setFieldError } = useForm({ validationSchema: schema })
const { value: email, handleBlur: emailBlur } = useField('email', undefined, {
  validateOnValueUpdate: false
})
const { value: password } = useField('password')

// Async validation (server duplicate check): call at blur/debounce (main text §2-4). Not onSubmit-only.
const checkEmailUnique = async (value) => {
  if (!value) return
  const { data } = await api.get('/users/check', { params: { email: value } })
  setFieldError('email', data.available ? undefined : t('validation.emailTaken'))
}
const debouncedCheck = useDebounceFn(checkEmailUnique, 300)
// Template: @blur="() => { emailBlur(); checkEmailUnique(email) }", @input="debouncedCheck(email)"

const onSubmit = handleSubmit(async (values) => {
  await checkEmailUnique(values.email)   // final check right before submit
  if (errors.value.email) return         // stop if duplicate
  await api.post('/users', values)
})
</script>
```

> Async validation is called not on every keystroke but after `@blur` or a debounce (300ms) (main text §2-4). Reuse the same `checkEmailUnique` at blur, debounce, and right before submit to gather the result in one place with `setFieldError('email', …)`.

#### Server 422 mapping (§2-6)

Block double clicks with `:loading="isSubmitting"` during submit, and map the server 422 response to per-field errors.

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

#### i18n catalog (§2-7)

Write validation messages as `t('validation.*')` keys (details `i18n-internationalization`). File validation (extension/size) follows the `file-upload` skill.

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
