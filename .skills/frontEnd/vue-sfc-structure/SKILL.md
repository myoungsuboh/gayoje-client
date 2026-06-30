---
name: Vue SFC 파일 구조 및 작성 규칙 (Vue SFC Structure)
description: Vue 3 단일 파일 컴포넌트(.vue)의 블록 순서, 함수 작성 방식, 스크립트 내부 정렬 표준입니다. 모든 .vue 파일이 동일한 골격으로 읽히도록 강제하며 신규 작성·리팩토링 시 읽습니다. 키워드 SFC, script setup, arrow function, 라이프사이클, TDZ, 정렬 순서.
rules:
  - "블록 순서는 <script setup> → <template> → <style> 로 고정한다."
  - "함수는 function 키워드 대신 arrow function(const name = (args) => {})으로 선언한다."
  - "라이프사이클 훅은 <script setup>의 가장 마지막에 모은다."
  - "script 내부는 imports → props/emits → state → 헬퍼 → computed → watch → defineExpose → 라이프사이클 순서로 정렬한다."
  - "const arrow function은 호이스팅되지 않으므로 즉시 실행되는 곳에서 호출되는 헬퍼는 선언이 먼저 와야 한다(TDZ 주의)."
tags:
  - "<script setup>"
  - "<template>"
  - "<style scoped>"
  - "defineProps"
  - "defineEmits"
  - "defineExpose"
---

# 🧩 Vue SFC 구조 표준

> Vue 3 단일 파일 컴포넌트(.vue)의 블록 순서, 함수 작성 방식, script 내부 정렬을 정의한다. 신규 `.vue` 파일을 작성하거나 기존 파일을 리팩토링할 때 읽는다. 모든 `.vue` 파일은 아래 규칙을 따른다.

## 1. 핵심 원칙
- 블록 순서는 `<script setup>` → `<template>` → `<style>` 로 고정한다.
- 함수는 `function` 키워드 대신 arrow function(`const name = (args) => {}`)으로 선언한다.
- 라이프사이클 훅은 `<script setup>`의 가장 마지막에 모은다.
- script 내부는 imports → props/emits → state → 헬퍼 → computed → watch → defineExpose → 라이프사이클 순서로 정렬한다.
- `const` arrow function은 호이스팅되지 않으므로 즉시 실행되는 곳에서 호출되는 헬퍼는 선언이 먼저 와야 한다(TDZ 주의).

## 2. 규칙

### 2-1. 블록 순서: script → template → style

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

- `<script setup>` 이 항상 **맨 위**.
- 그 다음 `<template>`.
- `<style>` 가 있으면 **맨 아래** (scoped 권장).
- 위치가 뒤바뀐 파일은 표준 위반 — 즉시 재정렬.

### 2-2. 함수 선언 — `function` 키워드 금지, arrow function 사용

```js
// ❌ 금지
function meta(id) { ... }
async function submitLogin(run) { ... }

// ✅ 권장
const meta = (id) => { ... }
const submitLogin = async (run) => { ... }
```

- 모든 함수는 `const name = (args) => { ... }` 형태로 작성.
- async 함수도 동일: `const fn = async () => { ... }`.
- 단일 표현식 함수는 중괄호 생략 가능: `const groupCount = (key) => endpoints.filter(...).length`.

### 2-3. 라이프사이클 훅은 `<script setup>` 최하단

`onMounted`, `onBeforeMount`, `onUnmounted`, `onBeforeUnmount`, `onUpdated`, `onBeforeUpdate`, `onActivated`, `onDeactivated`, `onErrorCaptured` 는 **무조건 script 섹션의 가장 마지막**에 위치한다.

```js
<script setup>
// ... 다른 모든 코드 ...

// ─────────── 라이프사이클 ───────────
onMounted(() => {
  timer = setInterval(() => { tick.value++ }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>
```

`defineExpose` 도 라이프사이클보다는 위에 두되, 일반 로직과는 구분되게 (라이프사이클 바로 위) 배치한다.

### 2-4. `<script setup>` 내부 정렬 표준

다음 순서를 엄수한다.

```
1. imports                      (vue → router/store → 컴포넌트 → 유틸 → 같은 도메인 모듈 순)
2. defineProps / defineEmits
3. State (ref · reactive · 일반 let 변수)
4. 헬퍼/이벤트 핸들러 (arrow functions)
5. computed
6. watch
7. defineExpose                  (있을 때만)
8. ─── 라이프사이클 ───
```

> **이유**: 위에서 아래로 읽으면 의존성이 자연스럽게 흐른다. 위쪽 변수만으로 아래쪽 로직이 이해된다.

### 2-5. TDZ(Temporal Dead Zone) 주의

`function` 선언은 호이스팅 되지만 `const` arrow function 은 호이스팅 되지 않는다. 따라서 즉시 실행되는 reactive API 안에서 호출되는 헬퍼는 **반드시 선언이 먼저** 와야 한다.

```js
// ❌ 잘못 — watch immediate 가 stringifyPayload 를 호출하는 시점에 TDZ
watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)

const stringifyPayload = (val) => JSON.stringify(val, null, 2)
```

```js
// ✅ 올바름 — 헬퍼를 먼저 선언
const stringifyPayload = (val) => JSON.stringify(val, null, 2)

watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)
```

따라서 2-4번 정렬 표준에서 **"헬퍼 → computed → watch"** 순서가 강제된다. 일반 이벤트 핸들러는 템플릿에서 호출되는 시점에야 평가되므로 컴포지션 순서 상관없지만, 가독성을 위해 동일하게 헬퍼 영역에 모은다.

### 2-6. 완성 예시

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

// ─────────── 헬퍼 (computed/watch 보다 먼저) ───────────
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

// ─────────── 라이프사이클 (최하단) ───────────
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

## 3. 흔한 실수
- ❌ `function` 키워드로 함수 선언 → arrow function(`const fn = () => {}`)으로.
- ❌ 블록 순서 뒤바뀜(`<template>` 먼저) → `script → template → style` 고정.
- ❌ 라이프사이클 훅을 곳곳에 산재 → `<script setup>` 최하단에 모은다.
- ❌ `const` arrow를 immediate watch보다 늦게 선언(TDZ) → 헬퍼를 먼저 선언한다.
- ❌ 거대 단일 컴포넌트 → 책임 단위로 분리한다.

## 4. 체크리스트 (PR 제출 전)

- [ ] `<script setup>` → `<template>` → `<style>` 순서인가?
- [ ] `function` 키워드로 선언된 함수가 0개인가? (`grep -n "^function\|^\s*function " src/**/*.vue`)
- [ ] 모든 `onXxx` 라이프사이클 훅이 `</script>` 바로 위에 모여있는가?
- [ ] 헬퍼 → computed → watch 순서가 지켜져 있는가? (immediate watch 의 TDZ 위반 없는가?)
- [ ] `defineExpose` 가 있다면 라이프사이클 바로 위에 있는가?
