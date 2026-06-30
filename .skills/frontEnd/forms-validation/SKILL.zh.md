---
name: 表单校验 (Forms Validation)
description: 客户端表单校验的通用标准 — 按复杂度选择工具、同步/异步校验、防抖、提交期间禁用、服务器 422 字段映射、消息 i18n。与特定框架无关。在添加或整顿表单校验时,以及实现异步重复检查、显示服务器校验错误、校验消息多语言化时,选择校验工具时阅读。关键词: form validation, client-side, sync, async, debounce, submit, 422, field error, i18n, schema, cross-field。(服务器端输入校验参见 validation-bean)
rules:
  - "客户端校验是 UX 辅助: 仅用于以快速反馈帮助用户,不是安全性、一致性的依据。实际强制必须在服务器进行(参见 validation-bean)。"
  - "选择与复杂度匹配的工具: 若是几个字段的静态规则,框架内置规则就够;若多步骤、字段间相互依赖、异步交织,则用基于 schema 的表单库。不要把重型工具拉进小表单。"
  - "约束用声明式 schema: 不要把必填、长度、范围、格式这类约束撒在处理函数代码里,而要声明在输入模型/schema 中,使其在一处可读。"
  - "实时反馈 + 异步要控频: 同步规则在输入时即时给出反馈,但敲打服务器的异步校验(重复检查等)在失焦时刻或防抖后减少调用。"
  - "锁定提交流程: 提交期间将按钮置为禁用/加载状态以防重复提交,只发送通过校验的值。"
  - "把服务器校验错误返回到字段: 服务器返回的各字段校验错误(如 4xx/422)映射到对应输入旁显示。不要用一条 toast/通知笼统概括。"
  - "消息用 i18n 目录: 不要硬编码校验文案,把它分离为消息键以应对多语言与文案变更。"
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

# ✅ 表单校验 (Forms Validation)

> 选择与表单复杂度匹配的校验工具,一致地处理实时(同步)/异步校验与 i18n 消息,并标准化提交流程与服务器校验错误的显示。在添加或整顿表单校验、处理服务器校验错误显示时阅读。它是不依赖特定框架/校验库的通用标准。(客户端校验只是 UX 辅助,实际强制在服务器进行 — 服务器端输入校验参见 `validation-bean`。)

## 1. 核心原则
- **客户端校验是 UX 辅助**: 仅用于以快速反馈帮助用户,不是安全性、一致性的依据。实际强制必须在服务器进行(参见 `validation-bean`)。
- **选择与复杂度匹配的工具**: 若是几个字段的静态规则,框架内置规则就够;若多步骤、字段间相互依赖、异步交织,则用基于 schema 的表单库。不要把重型工具拉进小表单。
- **约束用声明式 schema**: 不要把必填、长度、范围、格式这类约束撒在处理函数代码里,而要声明在输入模型/schema 中,使其在一处可读。
- **实时反馈 + 异步要控频**: 同步规则在输入时即时给出反馈,但敲打服务器的异步校验(重复检查等)在失焦时刻或防抖后减少调用。
- **锁定提交流程**: 提交期间将按钮置为禁用/加载状态以防重复提交,只发送通过校验的值。
- **把服务器校验错误返回到字段**: 服务器返回的各字段校验错误(如 4xx/422)映射到对应输入旁显示。不要用一条 toast/通知笼统概括。
- **消息用 i18n 目录**: 不要硬编码校验文案,把它分离为消息键以应对多语言与文案变更。

## 2. 规则

### 2-1. 选择与复杂度匹配的工具
不要使用对表单规模过重/过轻的工具。

| 表单复杂度 | 推荐做法 |
|---|---|
| 1~3 个字段,静态规则 | 框架内置校验规则(声明式 rule 列表) |
| 多步骤 · 字段间相互依赖 · 异步 | 基于 schema 的表单库 + 校验 schema |

```text
// ❌ 禁止 — 把重型表单库/schema 拉进小表单
//          或把复杂表单硬塞进内置 rule 数组,导致 cross-field 纠缠

// ✅ 推荐 — 按复杂度选择
简单:  field.rules = [required, emailFormat]
复杂:  form = useForm({ schema })   // 用 schema 表达 cross-field、异步
```

### 2-2. 约束要声明式,不要撒在处理函数里
在输入模型/schema 中声明约束,不要在提交处理函数主体里堆即兴的 `if`-校验。

```text
// ❌ 禁止 — 提交处理函数里散落即兴 if-校验
onSubmit():
  if email is empty:        showError('必填')
  if not isEmail(email):    showError('格式')
  if password.length < 8:   showError('过短')
  ...

// ✅ 推荐 — 在 schema 中声明约束,校验在一处
schema:
  email:    required, email
  password: required, minLength 8
onSubmit(validatedValues): send(validatedValues)
```

### 2-3. 同步校验给实时反馈
静态规则在输入/失焦时即时给出反馈。不要让错误只有按下提交按钮后才显示。

```text
// ❌ 禁止 — 仅在提交时刻校验,在那之前无任何显示
onSubmit(): if (!valid) showAllErrors()

// ✅ 推荐 — 输入过程中立即显示该字段错误
field.onInput → validate(field) → showFieldError(field)
```

### 2-4. 异步校验用防抖/blur 控频
调用服务器的校验(重复检查等)不要在每次按键时发送,而在失焦时刻或防抖(如 300ms)后发送一次。

```text
// ❌ 禁止 — 每打一个字就调用服务器
field.onInput → await api.check(value)   // 请求暴涨

// ✅ 推荐 — 防抖后一次,或在 blur 时刻调用
field.onInput → debounce(300ms, () => api.check(value))
field.onBlur  → api.check(value)
```

### 2-5. 提交期间锁定,只发送通过的值
在提交进行期间将按钮置为禁用/加载以防重复提交,确认校验通过后才发送。

```text
// ❌ 禁止 — 与校验结果无关,可连点地发送
button.onClick → api.post(values)        // 双击时重复创建

// ✅ 推荐 — 进行中禁用 + 只发通过的值
onSubmit():
  if submitting: return
  if (!await validateAll()): return
  submitting = true
  try { await api.post(values) } finally { submitting = false }
button.disabled = submitting || !valid
```

### 2-6. 服务器校验错误(422)按字段映射
当服务器以 4xx/422 携带各字段原因返回时,把每个原因映射到对应输入旁的错误。不要用一条通知笼统概括。

```text
// ❌ 禁止 — 服务器校验错误只用一条 toast
catch (e): toast('输入不正确')   // 不知道是哪个字段

// ✅ 推荐 — 把各字段原因映射到对应输入
catch (e):
  if e.status == 422:
    for (field, messages) in e.body.errors:
      setFieldError(field, messages[0])
```

### 2-7. 校验消息用 i18n 键
不要硬编码文案,用消息键编写。详情参见 i18n 技能(如 `i18n-internationalization`)。

```text
// ❌ 禁止 — 文案硬编码
required: () => '此项为必填'

// ✅ 推荐 — 消息键 + 目录
required: () => t('validation.required')

catalog.ko: validation.required = 필수 입력입니다
catalog.en: validation.required = This field is required
```

### 2-8. 文件校验遵循专用技能
文件输入的扩展名/大小/数量校验是与表单校验不同的主题。以 cross-link 遵循文件上传技能(如 `file-upload`)。

## 3. 常见错误
- **仅在提交后校验** → 输入中无反馈,用户打完全部后才知道错误。同步规则要实时。
- **手动(watch/onChange)校验每个字段** → 有声明式规则/schema 却堆直接 if-校验,产生遗漏/重复。
- **硬编码消息** → 多语言/文案变更波及为改代码。分离为 i18n 键。
- **每次按键调用异步校验** → 无防抖/blur,向服务器猛灌请求。
- **服务器 422 只用 toast** → 看不出哪个字段为什么错。按字段映射。
- **遗漏提交锁定** → 进行中不拦住按钮,双击导致重复创建。
- **只依赖平台默认校验** → 只用浏览器/框架默认必填标记,导致无法做自定义消息/i18n。
- **把客户端校验当成安全** → 只信客户端而省略服务器校验。实际强制在服务器(`validation-bean`)。

## 4. 检查清单
- [ ] 是否按表单复杂度选择了内置规则/基于 schema 的库?
- [ ] 是否在输入模型/schema 中**声明式**定义约束,而未把 if-校验撒在处理函数里?
- [ ] 是否用同步校验提供**实时反馈**(而非仅在提交后校验)?
- [ ] 是否用**防抖/blur**控制异步(服务器)校验的调用频率?
- [ ] 是否在提交期间将按钮置为**禁用/加载**以防重复提交?
- [ ] 是否把服务器校验错误(4xx/422)**映射为各字段错误**(而非用一条 toast 笼统概括)?
- [ ] 是否把校验消息写为 **i18n 键**(无硬编码文案)?
- [ ] 文件校验是否以 cross-link 遵循 `file-upload` 技能?
- [ ] 是否把客户端校验当作辅助而把实际强制放在服务器(`validation-bean`)?

## 附录: 各技术栈示例

> 以下是参考实现示例。按团队所用的技术栈(如 React Hook Form + zod/yup、Angular Reactive Forms、Svelte 等)以相同模式补充示例。上面 1~4 的原则与规则才是标准,附录只是其应用案例。

### Vue 3 (Vuetify rules / VeeValidate + zod)

这是把正文 §2-1 的工具选择映射到 Vue 技术栈: **简单(1~3 字段,静态规则)=Vuetify `rules` prop**、**复杂(多步骤·cross-field·异步)=VeeValidate 4 + zod**。消息用 `t('validation.*')` 键(§2-7),异步校验用 `useDebounceFn`/`@blur`(§2-4)控制。

#### Vuetify `rules` (简单表单)
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

#### VeeValidate 4 + zod (复杂表单)
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

// ⚠️ 把 schema 设为 computed — 若在 setup 时刻把消息 t() 固定一次,语言切换时不会刷新。
//    设为 computed 则每次 locale 变更都以新 schema 重新求值,消息随之更新。
const schema = computed(() => toTypedSchema(z.object({
  email: z.string().min(1, t('validation.required')).email(t('validation.email')),
  password: z.string().min(8, t('validation.minLength', { n: 8 }))
})))

const { handleSubmit, errors, isSubmitting, setFieldError } = useForm({ validationSchema: schema })
const { value: email, handleBlur: emailBlur } = useField('email', undefined, {
  validateOnValueUpdate: false
})
const { value: password } = useField('password')

// 异步校验(服务器重复检查): 用 blur/防抖调用(正文 §2-4)。并非仅用于 onSubmit。
const checkEmailUnique = async (value) => {
  if (!value) return
  const { data } = await api.get('/users/check', { params: { email: value } })
  setFieldError('email', data.available ? undefined : t('validation.emailTaken'))
}
const debouncedCheck = useDebounceFn(checkEmailUnique, 300)
// 模板: @blur="() => { emailBlur(); checkEmailUnique(email) }", @input="debouncedCheck(email)"

const onSubmit = handleSubmit(async (values) => {
  await checkEmailUnique(values.email)   // 提交前的最终确认
  if (errors.value.email) return         // 重复则中断
  await api.post('/users', values)
})
</script>
```

> 异步校验不在每次按键,而在 `@blur` 或防抖(300ms)后调用(正文 §2-4)。在 blur、防抖、提交前复用同一个 `checkEmailUnique`,把结果汇集到一处 `setFieldError('email', …)`。

#### 服务器 422 映射 (§2-6)

提交期间用 `:loading="isSubmitting"` 防双击,服务器 422 响应映射为各字段错误。

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

#### i18n 目录 (§2-7)

校验消息用 `t('validation.*')` 键编写(详情 `i18n-internationalization`)。文件校验(扩展名/大小)遵循 `file-upload` 技能。

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
