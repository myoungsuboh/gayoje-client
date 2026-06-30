<script setup>
/**
 * FolderEditDialog — 폴더 생성 또는 편집 공용 다이얼로그.
 *
 * [모드 결정]
 * - props.folder == null → 생성 모드 (제목/버튼 "만들기")
 * - props.folder != null → 편집 모드 (기존 값 prefill, 버튼 "저장")
 *
 * [emit]
 * - update:modelValue: 다이얼로그 닫기
 * - saved(folder): 성공 시 부모에게 알림 (모달 갱신용)
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { FolderPlus, Folder, X, AlertCircle } from 'lucide-vue-next'
import {
  useSkillLibraryStore,
  FOLDER_COLOR_PRESETS,
  validateFolderName,
} from '@/store/skillLibrary'

const { t } = useI18n()
const { xs } = useDisplay()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** null 이면 생성, 객체면 편집. */
  folder: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const store = useSkillLibraryStore()

const isEditMode = computed(() => !!props.folder?.id)

// ─── 폼 상태 ─────────────────────────────────────────
const name = ref('')
const description = ref('')
const color = ref(FOLDER_COLOR_PRESETS[0].value)
const category = ref('')
const nameError = ref('')
const categoryError = ref('')
const submitError = ref('')
const isSaving = ref(false)

// ─── 모달 열림 시 폼 초기화 ──────────────────────────
watch(() => props.modelValue, (isOpen) => {
  if (!isOpen) return
  submitError.value = ''
  isSaving.value = false
  if (isEditMode.value) {
    name.value = props.folder.name || ''
    description.value = props.folder.description || ''
    color.value = props.folder.color || FOLDER_COLOR_PRESETS[0].value
    category.value = props.folder.category || ''
  } else {
    name.value = ''
    description.value = ''
    color.value = FOLDER_COLOR_PRESETS[0].value
    category.value = ''
  }
  nameError.value = ''
  categoryError.value = ''
})

// ─── 실시간 검증 ─────────────────────────────────────
watch(name, (v) => {
  nameError.value = v ? (validateFolderName(v) || '') : ''
})
watch(category, (v) => {
  // 카테고리는 비어있어도 OK (선택사항)
  categoryError.value = v.trim() ? (validateFolderName(v) || '') : ''
})

const canSubmit = computed(() => {
  if (!name.value.trim()) return false
  if (nameError.value) return false
  if (categoryError.value) return false
  return !isSaving.value
})

// ─── 액션 ────────────────────────────────────────────
const close = () => emit('update:modelValue', false)

const save = async () => {
  if (!canSubmit.value) return
  isSaving.value = true
  submitError.value = ''
  const payload = {
    name: name.value.trim(),
    description: description.value.trim(),
    color: color.value,
    category: category.value.trim(),
  }
  const r = isEditMode.value
    ? await store.updateFolder(props.folder.id, payload)
    : await store.createFolder(payload)
  isSaving.value = false
  if (r.success) {
    emit('saved', r.folder)
    close()
  } else {
    submitError.value = r.error || t('rule.folder.save_failed')
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="xs ? undefined : 480"
    :fullscreen="xs"
    persistent
    @update:model-value="(v) => !v && close()"
  >
    <div class="fed-modal">
      <header class="fed-header">
        <component :is="isEditMode ? Folder : FolderPlus" :size="20" class="fed-icon" />
        <h3 class="fed-title">
          {{ isEditMode ? $t('rule.folder.edit_title') : $t('rule.folder.create_title') }}
        </h3>
        <button class="fed-close" @click="close" :aria-label="$t('common.action.close')"><X :size="18" /></button>
      </header>

      <div class="fed-body">
        <!-- 이름 -->
        <label class="fed-field">
          <span class="fed-label">{{ $t('rule.folder.name_label') }} <span class="fed-required">*</span></span>
          <input
            v-model="name"
            type="text"
            class="fed-input"
            :class="{ 'fed-input--error': nameError }"
            :placeholder="$t('rule.folder.name_placeholder')"
            maxlength="50"
            @keyup.enter="save"
          />
          <span v-if="nameError" class="fed-error-text">
            <AlertCircle :size="11" class="mr-1" />{{ nameError }}
          </span>
          <span v-else class="fed-hint">
            {{ $t('rule.folder.name_hint') }}
          </span>
        </label>

        <!-- 설명 -->
        <label class="fed-field">
          <span class="fed-label">{{ $t('rule.folder.desc_label') }}</span>
          <textarea
            v-model="description"
            class="fed-textarea"
            :placeholder="$t('rule.folder.desc_placeholder')"
            rows="2"
            maxlength="500"
          ></textarea>
        </label>

        <!-- 컬러 -->
        <div class="fed-field">
          <span class="fed-label">{{ $t('rule.folder.color_label') }}</span>
          <div class="fed-color-row">
            <button
              v-for="preset in FOLDER_COLOR_PRESETS"
              :key="preset.value"
              type="button"
              class="fed-color-btn"
              :class="{ 'fed-color-btn--active': color === preset.value }"
              :style="{ background: preset.value }"
              :title="preset.label"
              @click="color = preset.value"
              :aria-label="preset.label"
            />
          </div>
        </div>

        <!-- 카테고리 -->
        <label class="fed-field">
          <span class="fed-label">{{ $t('rule.folder.category_label') }}</span>
          <input
            v-model="category"
            type="text"
            class="fed-input"
            :class="{ 'fed-input--error': categoryError }"
            :placeholder="$t('rule.folder.category_placeholder')"
            maxlength="50"
          />
          <span v-if="categoryError" class="fed-error-text">
            <AlertCircle :size="11" class="mr-1" />{{ categoryError }}
          </span>
          <span v-else class="fed-hint">
            {{ $t('rule.folder.category_hint') }}
          </span>
        </label>

        <!-- 제출 에러 -->
        <div v-if="submitError" class="fed-submit-error">
          <AlertCircle :size="14" class="mr-1" />{{ submitError }}
        </div>
      </div>

      <footer class="fed-footer">
        <button class="fed-btn-secondary" @click="close">{{ $t('common.action.cancel') }}</button>
        <button
          class="fed-btn-primary"
          :disabled="!canSubmit"
          @click="save"
        >
          <component :is="isEditMode ? Folder : FolderPlus" :size="13" class="mr-1" />
          {{ isEditMode ? $t('common.action.save') : $t('rule.folder.submit_create') }}
        </button>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.fed-modal {
  background: #fff;
  border-radius: 14px;
  font-family: 'Pretendard', sans-serif;
  overflow: hidden;
}
/* [Mobile fix] xs 에서는 fullscreen v-dialog → 모서리 둥글 X + 전체 viewport */
@media (max-width: 600px) {
  .fed-modal {
    border-radius: 0;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .fed-body { flex: 1; overflow-y: auto; }
}
.fed-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
}
.fed-icon { color: var(--accent, #8C6239); }
.fed-title { flex: 1; margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-main); }
.fed-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted, #6F665F); padding: 4px; border-radius: 6px;
}
.fed-close:hover { background: rgba(0, 0, 0, 0.04); }

.fed-body {
  padding: 18px 20px;
  display: flex; flex-direction: column;
  gap: 16px;
}
.fed-field { display: flex; flex-direction: column; gap: 4px; }
.fed-label {
  font-size: 0.78rem; font-weight: 700;
  color: var(--text-main, #2A2421);
}
.fed-required { color: #dc2626; }
.fed-input, .fed-textarea {
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--text-main, #2A2421);
  outline: none;
  transition: border-color 0.12s;
  background: white;
}
.fed-input:focus, .fed-textarea:focus { border-color: var(--accent, #8C6239); }
.fed-input--error { border-color: #dc2626; }
.fed-textarea { resize: vertical; min-height: 50px; }

.fed-hint { font-size: 0.7rem; color: var(--text-muted, #6F665F); margin-top: 2px; }
.fed-error-text {
  display: inline-flex; align-items: center;
  font-size: 0.72rem; color: #dc2626; margin-top: 2px;
}

.fed-color-row { display: flex; gap: 8px; padding: 4px 0; }
.fed-color-btn {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s;
}
.fed-color-btn:hover { transform: scale(1.1); }
.fed-color-btn--active {
  border-color: var(--accent, #8C6239);
  box-shadow: 0 0 0 2px white inset;
}

.fed-submit-error {
  display: inline-flex; align-items: center;
  background: #fef2f2; color: #b91c1c;
  font-size: 0.78rem; font-weight: 600;
  padding: 8px 10px; border-radius: 8px;
}

.fed-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: var(--bg-light, #F7F5EB);
}
.fed-btn-primary, .fed-btn-secondary {
  display: inline-flex; align-items: center;
  border: none; border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.82rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: transform 0.12s, background 0.12s;
}
.fed-btn-primary { background: var(--accent, #8C6239); color: white; }
.fed-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.fed-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.fed-btn-secondary { background: rgba(0, 0, 0, 0.05); color: var(--text-main); }
.fed-btn-secondary:hover { background: rgba(0, 0, 0, 0.08); }

.mr-1 { margin-right: 4px; }
</style>
