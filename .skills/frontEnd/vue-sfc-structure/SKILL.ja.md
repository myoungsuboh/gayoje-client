---
name: Vue SFC ファイル構造および記述ルール (Vue SFC Structure)
description: Vue 3 単一ファイルコンポーネント(.vue)のブロック順序、関数の記述方式、スクリプト内部の整列標準です。すべての .vue ファイルが同一の骨格で読めるよう強制し、新規作成・リファクタリング時に読みます。キーワード SFC, script setup, arrow function, ライフサイクル, TDZ, 整列順序。
rules:
  - "ブロック順序は <script setup> → <template> → <style> に固定する。"
  - "関数は function キーワードの代わりに arrow function(const name = (args) => {})で宣言する。"
  - "ライフサイクルフックは <script setup> の最も最後にまとめる。"
  - "script 内部は imports → props/emits → state → ヘルパー → computed → watch → defineExpose → ライフサイクルの順に整列する。"
  - "const arrow function はホイスティングされないため、即時実行される箇所で呼び出されるヘルパーは宣言が先に来なければならない(TDZ 注意)。"
tags:
  - "<script setup>"
  - "<template>"
  - "<style scoped>"
  - "defineProps"
  - "defineEmits"
  - "defineExpose"
---

# 🧩 Vue SFC 構造標準

> Vue 3 単一ファイルコンポーネント(.vue)のブロック順序、関数の記述方式、script 内部の整列を定義する。新規の `.vue` ファイルを作成するか既存ファイルをリファクタリングする際に読む。すべての `.vue` ファイルは以下のルールに従う。

## 1. 核心原則
- ブロック順序は `<script setup>` → `<template>` → `<style>` に固定する。
- 関数は `function` キーワードの代わりに arrow function(`const name = (args) => {}`)で宣言する。
- ライフサイクルフックは `<script setup>` の最も最後にまとめる。
- script 内部は imports → props/emits → state → ヘルパー → computed → watch → defineExpose → ライフサイクルの順に整列する。
- `const` arrow function はホイスティングされないため、即時実行される箇所で呼び出されるヘルパーは宣言が先に来なければならない(TDZ 注意)。

## 2. ルール

### 2-1. ブロック順序: script → template → style

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

- `<script setup>` が常に **最上部**。
- 次に `<template>`。
- `<style>` があれば **最下部** (scoped 推奨)。
- 位置が入れ替わったファイルは標準違反 — 即座に再整列。

### 2-2. 関数宣言 — `function` キーワード禁止、arrow function を使用

```js
// ❌ 禁止
function meta(id) { ... }
async function submitLogin(run) { ... }

// ✅ 推奨
const meta = (id) => { ... }
const submitLogin = async (run) => { ... }
```

- すべての関数は `const name = (args) => { ... }` の形で記述。
- async 関数も同様: `const fn = async () => { ... }`。
- 単一式の関数は中括弧を省略可能: `const groupCount = (key) => endpoints.filter(...).length`。

### 2-3. ライフサイクルフックは `<script setup>` 最下部

`onMounted`, `onBeforeMount`, `onUnmounted`, `onBeforeUnmount`, `onUpdated`, `onBeforeUpdate`, `onActivated`, `onDeactivated`, `onErrorCaptured` は **必ず script セクションの最も最後** に配置する。

```js
<script setup>
// ... 他のすべてのコード ...

// ─────────── ライフサイクル ───────────
onMounted(() => {
  timer = setInterval(() => { tick.value++ }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>
```

`defineExpose` もライフサイクルより上に置くが、一般ロジックとは区別されるように(ライフサイクルのすぐ上)配置する。

### 2-4. `<script setup>` 内部整列標準

次の順序を厳守する。

```
1. imports                      (vue → router/store → コンポーネント → ユーティリティ → 同一ドメインモジュール順)
2. defineProps / defineEmits
3. State (ref · reactive · 一般的な let 変数)
4. ヘルパー/イベントハンドラ (arrow functions)
5. computed
6. watch
7. defineExpose                  (ある場合のみ)
8. ─── ライフサイクル ───
```

> **理由**: 上から下へ読むと依存関係が自然に流れる。上側の変数だけで下側のロジックが理解できる。

### 2-5. TDZ(Temporal Dead Zone)注意

`function` 宣言はホイスティングされるが `const` arrow function はホイスティングされない。したがって即時実行される reactive API の中で呼び出されるヘルパーは **必ず宣言が先** に来なければならない。

```js
// ❌ 誤り — immediate watch が stringifyPayload を呼び出す時点で TDZ
watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)

const stringifyPayload = (val) => JSON.stringify(val, null, 2)
```

```js
// ✅ 正しい — ヘルパーを先に宣言
const stringifyPayload = (val) => JSON.stringify(val, null, 2)

watch(
  () => props.payload,
  (val) => { rawJsonText.value = stringifyPayload(val) },
  { immediate: true }
)
```

したがって 2-4 番の整列標準で **「ヘルパー → computed → watch」** の順序が強制される。一般的なイベントハンドラはテンプレートから呼び出される時点で初めて評価されるためコンポジションの順序は問わないが、可読性のため同様にヘルパー領域にまとめる。

### 2-6. 完成例

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

// ─────────── ヘルパー (computed/watch より先) ───────────
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

// ─────────── ライフサイクル (最下部) ───────────
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

## 3. よくある間違い
- ❌ `function` キーワードで関数宣言 → arrow function(`const fn = () => {}`)に。
- ❌ ブロック順序が入れ替わり(`<template>` が先) → `script → template → style` に固定。
- ❌ ライフサイクルフックがあちこちに散在 → `<script setup>` 最下部にまとめる。
- ❌ `const` arrow を immediate watch より遅く宣言(TDZ) → ヘルパーを先に宣言する。
- ❌ 巨大な単一コンポーネント → 責任単位で分離する。

## 4. チェックリスト (PR 提出前)

- [ ] `<script setup>` → `<template>` → `<style>` の順序か?
- [ ] `function` キーワードで宣言された関数が 0 個か? (`grep -n "^function\|^\s*function " src/**/*.vue`)
- [ ] すべての `onXxx` ライフサイクルフックが `</script>` のすぐ上にまとまっているか?
- [ ] ヘルパー → computed → watch の順序が守られているか? (immediate watch の TDZ 違反はないか?)
- [ ] `defineExpose` があるなら、ライフサイクルのすぐ上にあるか?
