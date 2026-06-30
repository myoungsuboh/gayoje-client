<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Plus, Save, Trash2, FileCode, Sparkles } from 'lucide-vue-next'
import { useHarnessStore } from '@/store/harness'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  item: { type: Object, default: null },
  itemType: { type: String, required: true },
  currentMatched: { type: Array, default: () => [] },
  // F: AI 제안 시 후보 repo 목록 제공
  repoUrls: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const store = useHarnessStore()
const { showSuccess, showError } = useSnackbar()
const confirm = useConfirm()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const expectedFiles = ref([])
const newFileInput = ref('')
const isSaving = ref(false)
const isLoading = ref(false)

// F: AI 제안
const suggestions = ref([])
const suggestLoading = ref(false)
const suggestError = ref('')

const requestSuggestions = async () => {
  if (!props.item?.id) return
  suggestLoading.value = true
  suggestError.value = ''
  const result = await store.suggestLineageTruth({
    itemType: props.itemType,
    itemId: props.item.id,
    itemName: props.item.name,
    repoUrls: props.repoUrls,
  })
  suggestLoading.value = false
  if (!result.success) {
    suggestError.value = result.error || t('quality.truth.suggest_failed')
    showError(t('quality.truth.suggest_failed_toast', { error: result.error }))
    return
  }
  if (result.enabled === false) {
    suggestError.value = t('quality.truth.suggest_disabled')
    return
  }
  suggestions.value = result.suggestions || []
  if (!suggestions.value.length) suggestError.value = t('quality.truth.suggest_empty')
}

const acceptSuggestion = (path) => {
  if (!expectedFiles.value.includes(path)) expectedFiles.value.push(path)
}

const loadExisting = async () => {
  if (!props.item?.id) return
  isLoading.value = true
  expectedFiles.value = []
  try {
    const result = await store.fetchLineageTruth({ itemType: props.itemType })
    if (result.success) {
      const found = result.items.find(row => String(row.itemId) === String(props.item.id))
      if (found) expectedFiles.value = [...(found.expectedFiles || [])]
    }
  } finally {
    isLoading.value = false
  }
}

watch(() => [props.modelValue, props.item?.id], ([open]) => {
  if (open) {
    loadExisting()
    suggestions.value = []
    suggestError.value = ''
  }
}, { immediate: false })

const addFile = () => {
  const v = newFileInput.value.trim()
  if (!v) return
  if (expectedFiles.value.includes(v)) {
    showError(t('quality.truth.path_already_added'))
    return
  }
  expectedFiles.value.push(v)
  newFileInput.value = ''
}

const addFromMatched = (path) => {
  if (expectedFiles.value.includes(path)) return
  expectedFiles.value.push(path)
}

const removeFile = (idx) => {
  expectedFiles.value.splice(idx, 1)
}

const handleSave = async () => {
  if (!props.item?.id) return
  isSaving.value = true
  const result = await store.saveLineageTruth({
    itemType: props.itemType,
    itemId: props.item.id,
    expectedFiles: expectedFiles.value,
  })
  isSaving.value = false
  if (result.success) {
    if (result.syncedToServer) {
      showSuccess(t('quality.truth.save_done', { count: expectedFiles.value.length }))
    } else {
      showSuccess(t('quality.truth.save_local_only', { error: result.error || t('quality.truth.save_local_fallback_reason') }))
    }
    emit('saved', { itemId: props.item.id, expectedFiles: expectedFiles.value })
    isOpen.value = false
  } else {
    showError(result.error || t('quality.truth.save_failed'))
  }
}

const handleDelete = async () => {
  if (!props.item?.id) return
  const ok = await confirm({
    title: t('quality.truth.delete_confirm_title'),
    message: t('quality.truth.delete_confirm_message'),
    confirmText: t('common.action.delete'),
    variant: 'danger',
  })
  if (!ok) return
  isSaving.value = true
  const result = await store.deleteLineageTruth({
    itemType: props.itemType,
    itemId: props.item.id,
  })
  isSaving.value = false
  if (result.success) {
    showSuccess(t('quality.truth.delete_done'))
    emit('saved', { itemId: props.item.id, expectedFiles: [] })
    isOpen.value = false
  } else {
    showError(result.error || t('quality.truth.delete_failed'))
  }
}
</script>

<template>
  <v-dialog v-model="isOpen" max-width="640" persistent>
    <v-card class="truth-dialog-card">
      <div class="truth-dialog-header">
        <div class="d-flex align-center">
          <FileCode :size="20" class="mr-2 text-white" />
          <h3 class="truth-dialog-title">{{ $t('quality.truth.title') }}</h3>
        </div>
        <button class="truth-close-btn" @click="isOpen = false">
          <X :size="18" />
        </button>
      </div>

      <div class="pa-6">
        <div class="truth-item-info">
          <span class="truth-item-type">{{ itemType.toUpperCase() }}</span>
          <span class="truth-item-name">{{ item?.name || item?.id || '—' }}</span>
        </div>

        <p class="truth-help-text" v-html="$t('quality.truth.help_html')"></p>

        <!-- 현재 AI가 매칭한 파일들 (참고용) -->
        <div v-if="currentMatched.length" class="matched-ref-box">
          <div class="matched-ref-label">
            {{ $t('quality.truth.matched_ref_label', { count: currentMatched.length }) }}
          </div>
          <div class="matched-ref-list">
            <button
              v-for="(path, i) in currentMatched" :key="i"
              class="matched-chip"
              :class="{ 'matched-chip--added': expectedFiles.includes(path) }"
              :disabled="expectedFiles.includes(path)"
              @click="addFromMatched(path)"
            >
              <Plus v-if="!expectedFiles.includes(path)" :size="11" class="mr-1" />
              {{ path }}
            </button>
          </div>
        </div>

        <!-- AI 제안 (F) -->
        <div class="suggest-box">
          <div class="suggest-head">
            <button type="button" class="suggest-btn" :disabled="suggestLoading || !item?.id" @click="requestSuggestions">
              <Sparkles :size="13" class="mr-1" aria-hidden="true" />
              {{ suggestLoading ? $t('quality.truth.suggest_loading') : $t('quality.truth.suggest_btn') }}
            </button>
            <span v-if="suggestError" class="suggest-error">{{ suggestError }}</span>
          </div>
          <div v-if="suggestions.length" class="suggest-list">
            <button
              v-for="(s, i) in suggestions" :key="i"
              type="button"
              class="suggest-chip"
              :class="{ 'suggest-chip--added': expectedFiles.includes(s.filePath) }"
              :disabled="expectedFiles.includes(s.filePath)"
              :title="s.reason || ''"
              @click="acceptSuggestion(s.filePath)"
            >
              <Plus v-if="!expectedFiles.includes(s.filePath)" :size="11" class="mr-1" aria-hidden="true" />
              {{ s.filePath }}
              <span v-if="s.confidence" class="suggest-conf mono-text">[{{ s.confidence }}]</span>
            </button>
          </div>
        </div>

        <!-- 정답 파일 입력 -->
        <div class="truth-input-row">
          <input
            v-model="newFileInput"
            type="text"
            :placeholder="$t('quality.truth.input_placeholder')"
            class="truth-input"
            @keyup.enter="addFile"
          />
          <button class="truth-add-btn" :disabled="!newFileInput.trim()" @click="addFile">
            <Plus :size="14" />
          </button>
        </div>

        <!-- 정답 리스트 -->
        <div class="truth-list" :class="{ 'truth-list--empty': !expectedFiles.length }">
          <div v-if="isLoading" class="truth-loading">{{ $t('quality.truth.loading') }}</div>
          <div v-else-if="!expectedFiles.length" class="truth-empty">
            {{ $t('quality.truth.empty') }}
          </div>
          <div v-for="(path, i) in expectedFiles" :key="i" class="truth-item">
            <FileCode :size="13" class="mr-2 truth-item-icon" />
            <span class="truth-item-path">{{ path }}</span>
            <button class="truth-item-remove" @click="removeFile(i)" :title="$t('quality.truth.remove_title', { path })">
              <X :size="12" />
            </button>
          </div>
        </div>

        <!-- 액션 -->
        <div class="d-flex justify-space-between align-center mt-6">
          <button class="truth-delete-btn" :disabled="isSaving || isLoading" @click="handleDelete">
            <Trash2 :size="13" class="mr-1" /> {{ $t('quality.truth.delete_label') }}
          </button>
          <div class="d-flex gap-2">
            <button class="truth-cancel-btn" :disabled="isSaving" @click="isOpen = false">{{ $t('common.action.cancel') }}</button>
            <button class="truth-save-btn" :disabled="isSaving || isLoading" @click="handleSave">
              <Save :size="13" class="mr-1" />
              {{ isSaving ? $t('quality.truth.saving') : $t('quality.truth.save_with_count', { count: expectedFiles.length }) }}
            </button>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.truth-dialog-card {
  border-radius: 16px;
  overflow: hidden;
}

.truth-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px;
  background: linear-gradient(135deg, var(--accent) 0%, #6B4A2A 100%);
}
.truth-dialog-title {
  font-family: 'Outfit', sans-serif;
  font-weight: 800; font-size: 1rem; color: white;
}
.truth-close-btn {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: rgba(255, 255, 255, 0.15); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s;
}
.truth-close-btn:hover { background: rgba(255, 255, 255, 0.3); }

.truth-item-info {
  display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
  padding: 12px 16px; background: var(--bg-light); border-radius: 10px;
}
.truth-item-type {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.62rem; font-weight: 800;
  letter-spacing: 0.08em; color: white; background: var(--accent);
  padding: 3px 10px; border-radius: 9999px;
}
.truth-item-name {
  font-family: 'Pretendard Variable', sans-serif; font-size: 0.92rem;
  font-weight: 700; color: var(--text-main);
}

.truth-help-text {
  font-size: 0.78rem; color: var(--text-muted); line-height: 1.6;
  margin-bottom: 16px;
}

.matched-ref-box {
  margin-bottom: 16px; padding: 12px 14px;
  background: rgba(33, 150, 243, 0.04);
  border: 1px solid rgba(33, 150, 243, 0.15);
  border-radius: 10px;
}
.matched-ref-label {
  font-size: 0.7rem; font-weight: 700; color: #1976D2; margin-bottom: 8px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
}
.matched-ref-list { display: flex; flex-wrap: wrap; gap: 6px; }
.matched-chip {
  display: inline-flex; align-items: center;
  font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem;
  background: white; color: #1976D2; border: 1px solid rgba(33, 150, 243, 0.3);
  padding: 4px 10px; border-radius: 9999px; cursor: pointer; transition: all 0.15s;
}
.matched-chip:hover:not(:disabled) {
  background: #1976D2; color: white;
}
.matched-chip--added {
  background: rgba(0, 0, 0, 0.04); color: var(--text-muted);
  cursor: not-allowed; opacity: 0.6;
}

.suggest-box {
  margin-bottom: 14px; padding: 10px 12px;
  background: linear-gradient(135deg, rgba(46,64,54,0.05) 0%, rgba(140,98,57,0.03) 100%);
  border: 1px solid rgba(46,64,54,0.15);
  border-radius: 10px;
}
.suggest-head { display: flex; align-items: center; gap: 10px; }
.suggest-btn {
  display: inline-flex; align-items: center;
  background: var(--primary-moss); color: white;
  border: none; border-radius: 9999px;
  padding: 6px 14px;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.05em;
  cursor: pointer; transition: opacity .15s;
}
.suggest-btn:hover:not(:disabled) { opacity: 0.88; }
.suggest-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.suggest-error { font-size: 0.72rem; color: #B46723; font-style: italic; }
.suggest-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.suggest-chip {
  display: inline-flex; align-items: center;
  font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem;
  background: white; color: var(--primary-moss);
  border: 1px solid rgba(46,64,54,0.3);
  padding: 4px 10px; border-radius: 9999px; cursor: pointer; transition: all .15s;
}
.suggest-chip:hover:not(:disabled) { background: var(--primary-moss); color: white; }
.suggest-chip--added { background: rgba(0,0,0,0.04); color: var(--text-muted); cursor: not-allowed; opacity: 0.6; }
.suggest-conf { margin-left: 4px; font-size: 0.62rem; }

.truth-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
.truth-input {
  flex: 1; border: 1.5px solid var(--border-light); border-radius: 8px;
  padding: 10px 14px; font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem;
  background: white; outline: none; transition: border-color 0.15s;
}
.truth-input:focus { border-color: var(--accent); }
.truth-add-btn {
  width: 40px; border: none; border-radius: 8px;
  background: var(--accent); color: white; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.15s;
}
.truth-add-btn:hover:not(:disabled) { opacity: 0.85; }
.truth-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.truth-list {
  border: 1px solid var(--border-light); border-radius: 10px;
  background: white; max-height: 240px; overflow-y: auto;
}
.truth-list--empty { background: #fafbfc; }
.truth-loading, .truth-empty {
  padding: 24px; text-align: center; color: var(--text-muted);
  font-size: 0.78rem; font-style: italic;
}
.truth-item {
  display: flex; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid var(--border-light);
  transition: background 0.1s;
}
.truth-item:last-child { border-bottom: none; }
.truth-item:hover { background: var(--bg-light); }
.truth-item-icon { color: var(--accent); flex-shrink: 0; }
.truth-item-path {
  flex: 1; font-family: 'IBM Plex Mono', monospace; font-size: 0.76rem;
  color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.truth-item-remove {
  width: 22px; height: 22px; border-radius: 50%; border: none;
  background: transparent; color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.truth-item-remove:hover {
  background: rgba(244, 67, 54, 0.1); color: #F44336;
}

.truth-delete-btn {
  display: inline-flex; align-items: center;
  background: transparent; border: 1px solid rgba(244, 67, 54, 0.3);
  color: #F44336; font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 700;
  padding: 8px 14px; border-radius: 9999px; cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.15s;
}
.truth-delete-btn:hover:not(:disabled) {
  background: #F44336; color: white;
}
.truth-delete-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.truth-cancel-btn, .truth-save-btn {
  font-family: 'Outfit', sans-serif; font-weight: 700;
  padding: 9px 18px; border-radius: 9999px; cursor: pointer;
  font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em;
  transition: all 0.15s;
}
.truth-cancel-btn {
  border: 1px solid var(--border-light); background: white; color: var(--text-main);
}
.truth-cancel-btn:hover:not(:disabled) { background: var(--bg-light); }
.truth-save-btn {
  display: inline-flex; align-items: center;
  border: none; background: var(--accent); color: white;
}
.truth-save-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.truth-save-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
</style>
