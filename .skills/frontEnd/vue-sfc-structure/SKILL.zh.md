---
name: Vue SFC 文件结构及编写规则 (Vue SFC Structure)
description: Vue 3 单文件组件(.vue)的块顺序、函数编写方式、脚本内部排列标准。强制所有 .vue 文件以相同的骨架来阅读，在新建编写·重构时阅读。关键词 SFC, script setup, arrow function, 生命周期, TDZ, 排列顺序。
rules:
  - "块顺序固定为 <script setup> → <template> → <style>。"
  - "函数使用 arrow function(const name = (args) => {})声明，而非 function 关键字。"
  - "生命周期钩子集中在 <script setup> 的最末尾。"
  - "script 内部按 imports → props/emits → state → 辅助函数 → computed → watch → defineExpose → 生命周期的顺序排列。"
  - "const arrow function 不会被提升，因此在立即执行处被调用的辅助函数必须先声明(注意 TDZ)。"
tags:
  - "<script setup>"
  - "<template>"
  - "<style scoped>"
  - "defineProps"
  - "defineEmits"
  - "defineExpose"
---

# 🧩 Vue SFC 结构标准

> 定义 Vue 3 单文件组件(.vue)的块顺序、函数编写方式、script 内部排列。在新建 `.vue` 文件或重构既有文件时阅读。所有 `.vue` 文件都遵循以下规则。

## 1. 核心原则
- 块顺序固定为 `<script setup>` → `<template>` → `<style>`。
- 函数使用 arrow function(`const name = (args) => {}`)声明，而非 `function` 关键字。
- 生命周期钩子集中在 `<script setup>` 的最末尾。
- script 内部按 imports → props/emits → state → 辅助函数 → computed → watch → defineExpose → 生命周期的顺序排列。
- `const` arrow function 不会被提升，因此在立即执行处被调用的辅助函数必须先声明(注意 TDZ)。

## 2. 规则

### 2-1. 块顺序: script → template → style

```vue
<script setup>
// ...
</script>

<template>
  <!-- ... -->
</template>

<style scoped>
/* ... */
</style>
```

- `<script setup>` 始终在 **最上方**。
- 接着是 `<template>`。
- 若有 `<style>` 则在 **最下方** (推荐 scoped)。
- 顺序颠倒的文件违反标准 — 立即重新排列。

### 2-2. 函数声明 — 禁止 `function` 关键字，使用 arrow function

```js
// ❌ 禁止
function meta(id) { ... }
async function submitLogin(run) { ... }

// ✅ 推荐
const meta = (id) => { ... }
const submitLogin = async (run) => { ... }
```

- 所有函数都写成 `const name = (args) => { ... }` 的形式。
- async 函数同理: `const fn = async () => { ... }`。
- 单一表达式的函数可省略花括号: `const groupCount = (key) => endpoints.filter(...).length`。

### 2-3. 生命周期钩子位于 `<script setup>` 最下方

`onMounted`, `onBeforeMount`, `onUnmounted`, `onBeforeUnmount`, `onUpdated`, `onBeforeUpdate`, `onActivated`, `onDeactivated`, `onErrorCaptured` 必须 **一律放在 script 部分的最末尾**。

```js
<script setup>
// ... 其他所有代码 ...

// ─────────── 生命周期 ───────────
onMounted(() => {
  timer = setInterval(() => { tick.value++ }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>
```

`defineExpose` 也放在生命周期之上，但要与普通逻辑区分开(放在生命周期的正上方)。

### 2-4. `<script setup>` 内部排列标准

严格遵循以下顺序。

```
1. imports                      (vue → router/store → 组件 → 工具 → 同域模块的顺序)
2. defineProps / defineEmits
3. State (ref · reactive · 普通 let 变量)
4. 辅助函数/事件处理器 (arrow functions)
5. computed
6. watch
7. defineExpose                  (仅在存在时)
8. ─── 生命周期 ───
```

> **原因**: 自上而下阅读时依赖关系自然流动。仅凭上方的变量即可理解下方的逻辑。

### 2-5. TDZ(Temporal Dead Zone)注意

`function` 声明会被提升，但 `const` arrow function 不会被提升。因此在立即执行的 reactive API 内部被调用的辅助函数必须 **先声明**。

```js
// ❌ 错误 — 在 immediate watch 调用 stringifyPayload 的时刻处于 TDZ
watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)

const stringifyPayload = (val) => JSON.stringify(val, null, 2)
```

```js
// ✅ 正确 — 先声明辅助函数
const stringifyPayload = (val) => JSON.stringify(val, null, 2)

watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)
```

因此在 2-4 的排列标准中强制 **“辅助函数 → computed → watch”** 的顺序。普通事件处理器只在从模板中被调用时才求值，所以组合顺序无关紧要，但为了可读性同样集中放在辅助函数区域。

### 2-6. 完整示例

```vue
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { loginApi } from '@/api/authApi'

const props = defineProps({
  initialUserId: { type: String, default: '' }
})

const emit = defineEmits(['success'])

const auth = useAuthStore()
const userId = ref(props.initialUserId)
const loading = ref(false)
let pollTimer = null

// ─────────── 辅助函数 (先于 computed/watch) ───────────
const buildPayload = () => ({ userId: userId.value })

const stopPolling = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

const submit = async () => {
  loading.value = true
  try {
    const res = await loginApi(buildPayload())
    emit('success', res)
  } finally {
    loading.value = false
  }
}

// ─────────── computed ───────────
const canSubmit = computed(() => userId.value.length > 0 && !loading.value)

// ─────────── watch ───────────
watch(userId, (val) => {
  console.log('userId changed:', val)
})

// ─────────── 生命周期 (最下方) ───────────
onBeforeUnmount(() => stopPolling())
</script>

<template>
  <v-form @submit.prevent="submit">
    <v-text-field v-model="userId" label="사번" />
    <v-btn :disabled="!canSubmit" :loading="loading" @click="submit">로그인</v-btn>
  </v-form>
</template>

<style scoped>
.v-form { max-width: 320px; }
</style>
```

## 3. 常见错误
- ❌ 用 `function` 关键字声明函数 → 改用 arrow function(`const fn = () => {}`)。
- ❌ 块顺序颠倒(`<template>` 在前) → 固定为 `script → template → style`。
- ❌ 生命周期钩子散落各处 → 集中到 `<script setup>` 最下方。
- ❌ 把 `const` arrow 声明得比 immediate watch 晚(TDZ) → 先声明辅助函数。
- ❌ 巨大的单一组件 → 按职责单元拆分。

## 4. 检查清单 (提交 PR 前)

- [ ] 顺序是 `<script setup>` → `<template>` → `<style>` 吗?
- [ ] 用 `function` 关键字声明的函数为 0 个吗? (`grep -n "^function\|^\s*function " src/**/*.vue`)
- [ ] 所有 `onXxx` 生命周期钩子都集中在 `</script>` 的正上方吗?
- [ ] 是否遵守了 辅助函数 → computed → watch 的顺序? (immediate watch 是否有 TDZ 违规?)
- [ ] 若存在 `defineExpose`，它是否在生命周期的正上方?
