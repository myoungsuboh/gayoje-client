---
name: Vue SFC File Structure & Authoring Rules (Vue SFC Structure)
description: Standards for the block order, function authoring style, and in-script ordering of Vue 3 Single File Components (.vue). Enforces that every .vue file reads with the same skeleton; read it when authoring new components or refactoring. Keywords SFC, script setup, arrow function, lifecycle, TDZ, ordering.
rules:
  - "Fix the block order as <script setup> → <template> → <style>."
  - "Declare functions as arrow functions (const name = (args) => {}) instead of using the function keyword."
  - "Group lifecycle hooks at the very end of <script setup>."
  - "Order the script internals as imports → props/emits → state → helpers → computed → watch → defineExpose → lifecycle."
  - "Since const arrow functions are not hoisted, helpers called from code that runs immediately must be declared first (watch out for the TDZ)."
tags:
  - "<script setup>"
  - "<template>"
  - "<style scoped>"
  - "defineProps"
  - "defineEmits"
  - "defineExpose"
---

# 🧩 Vue SFC Structure Standard

> Defines the block order, function authoring style, and in-script ordering of Vue 3 Single File Components (.vue). Read it when authoring a new `.vue` file or refactoring an existing one. Every `.vue` file follows the rules below.

## 1. Core Principles
- Fix the block order as `<script setup>` → `<template>` → `<style>`.
- Declare functions as arrow functions (`const name = (args) => {}`) instead of using the `function` keyword.
- Group lifecycle hooks at the very end of `<script setup>`.
- Order the script internals as imports → props/emits → state → helpers → computed → watch → defineExpose → lifecycle.
- Since `const` arrow functions are not hoisted, helpers called from code that runs immediately must be declared first (watch out for the TDZ).

## 2. Rules

### 2-1. Block Order: script → template → style

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

- `<script setup>` always comes **first**.
- Then `<template>`.
- If a `<style>` exists, it comes **last** (scoped recommended).
- A file with the order swapped violates the standard — reorder it immediately.

### 2-2. Function Declarations — no `function` keyword, use arrow functions

```js
// ❌ Forbidden
function meta(id) { ... }
async function submitLogin(run) { ... }

// ✅ Recommended
const meta = (id) => { ... }
const submitLogin = async (run) => { ... }
```

- Write every function in the form `const name = (args) => { ... }`.
- Async functions are the same: `const fn = async () => { ... }`.
- Single-expression functions may omit the braces: `const groupCount = (key) => endpoints.filter(...).length`.

### 2-3. Lifecycle Hooks at the Bottom of `<script setup>`

`onMounted`, `onBeforeMount`, `onUnmounted`, `onBeforeUnmount`, `onUpdated`, `onBeforeUpdate`, `onActivated`, `onDeactivated`, `onErrorCaptured` must **always** be placed at the very end of the script section.

```js
<script setup>
// ... all other code ...

// ─────────── lifecycle ───────────
onMounted(() => {
  timer = setInterval(() => { tick.value++ }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>
```

Place `defineExpose` above the lifecycle as well, but separated from the general logic (immediately above the lifecycle).

### 2-4. In-`<script setup>` Ordering Standard

Strictly follow this order.

```
1. imports                      (vue → router/store → components → utils → same-domain modules)
2. defineProps / defineEmits
3. State (ref · reactive · plain let variables)
4. helpers / event handlers (arrow functions)
5. computed
6. watch
7. defineExpose                  (only when present)
8. ─── lifecycle ───
```

> **Why**: reading top to bottom lets dependencies flow naturally. The logic below is understood using only the variables above it.

### 2-5. Watch Out for the TDZ (Temporal Dead Zone)

`function` declarations are hoisted, but `const` arrow functions are not. Therefore a helper called inside a reactive API that runs immediately must **always** be declared first.

```js
// ❌ Wrong — TDZ at the moment the immediate watch calls stringifyPayload
watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)

const stringifyPayload = (val) => JSON.stringify(val, null, 2)
```

```js
// ✅ Correct — declare the helper first
const stringifyPayload = (val) => JSON.stringify(val, null, 2)

watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)
```

This is why the **"helpers → computed → watch"** order is enforced in the §2-4 ordering standard. General event handlers are only evaluated when called from the template, so their composition order does not matter, but for readability they are grouped together in the helper area as well.

### 2-6. Complete Example

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

// ─────────── helpers (before computed/watch) ───────────
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

// ─────────── lifecycle (bottom) ───────────
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

## 3. Common Mistakes
- ❌ Declaring functions with the `function` keyword → use arrow functions (`const fn = () => {}`).
- ❌ Block order swapped (`<template>` first) → fix to `script → template → style`.
- ❌ Lifecycle hooks scattered everywhere → group them at the bottom of `<script setup>`.
- ❌ Declaring a `const` arrow later than an immediate watch (TDZ) → declare the helper first.
- ❌ A huge single component → split it by unit of responsibility.

## 4. Checklist (before submitting a PR)

- [ ] Is the order `<script setup>` → `<template>` → `<style>`?
- [ ] Are there 0 functions declared with the `function` keyword? (`grep -n "^function\|^\s*function " src/**/*.vue`)
- [ ] Are all `onXxx` lifecycle hooks grouped right above `</script>`?
- [ ] Is the helpers → computed → watch order observed? (Any TDZ violation with an immediate watch?)
- [ ] If `defineExpose` is present, is it right above the lifecycle?
