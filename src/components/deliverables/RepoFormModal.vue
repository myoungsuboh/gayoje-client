<script setup>
import { onMounted, computed } from 'vue'
import { Loader2, BookOpen } from 'lucide-vue-next'
import { ROLES } from '@/composables/useProjectRepos'
import { useLibraryStore } from '@/store/library'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'add' }, // 'add' | 'edit'
  form: { type: Object, required: true },  // { url, role, label }
  isLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'update:form', 'submit'])

const libraryStore = useLibraryStore()

const close = () => emit('update:modelValue', false)
const submit = () => emit('submit')

const updateField = (key, value) => {
  emit('update:form', { ...props.form, [key]: value })
}

/** 라이브러리 칩 클릭 시 — URL 채우기 + 라벨 비어있으면 라이브러리 label 도 미리 채움. */
const pickFromLibrary = (repo) => {
  const next = { ...props.form, url: repo.url }
  if (!props.form.label && repo.label) next.label = repo.label
  emit('update:form', next)
}

// 모달이 열릴 때만 라이브러리 fetch (store 가 30초 캐시).
const isAddMode = computed(() => props.mode === 'add')

onMounted(() => {
  if (isAddMode.value) libraryStore.fetchLibrary()
})

/** 라이브러리 칩의 짧은 표시명 (label 우선, 없으면 owner/repo). */
const repoChipName = (repo) => {
  if (repo.label) return repo.label
  try {
    return repo.url.split('/').slice(-2).join(' / ')
  } catch { return repo.url }
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="480"
    role="dialog"
    :aria-label="$t('deliverables.repo_form.dialog_aria')"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @keydown.esc="close"
  >
    <form class="modal-card" @submit.prevent="submit">
      <h3 class="modal-title">{{ mode === 'add' ? $t('deliverables.repo_form.title_add') : $t('deliverables.repo_form.title_edit') }}</h3>
      <div class="form-row">
        <label class="form-label" for="repo-url-input">{{ $t('deliverables.repo_form.url_label') }}</label>
        <input
          id="repo-url-input"
          :value="form.url"
          @input="updateField('url', $event.target.value)"
          type="text" placeholder="https://github.com/owner/repo"
          class="form-input mono-text"
          :readonly="mode === 'edit'"
          required
        />
      </div>

      <!-- 라이브러리에서 빠른 선택 (add 모드일 때만) -->
      <div v-if="isAddMode && !libraryStore.isEmpty" class="form-row library-row">
        <label class="form-label d-flex align-center" style="gap:4px;">
          <BookOpen :size="11" /> {{ $t('deliverables.repo_form.library_label') }}
        </label>
        <div class="library-chips">
          <button
            v-for="repo in libraryStore.repos"
            :key="repo.url"
            type="button"
            class="library-chip"
            :class="{ 'library-chip--active': form.url === repo.url }"
            :title="repo.url"
            @click="pickFromLibrary(repo)"
          >
            {{ repoChipName(repo) }}
          </button>
        </div>
      </div>

      <fieldset class="form-row" style="border:none; padding:0; margin:0 0 16px;">
        <legend class="form-label" style="margin-bottom:6px;">{{ $t('deliverables.repo_form.role_label') }}</legend>
        <div class="role-radio-grid">
          <label v-for="r in ROLES" :key="r.value" class="role-radio">
            <input
              type="radio" name="repo-role" :value="r.value"
              :checked="form.role === r.value"
              @change="updateField('role', r.value)"
            />
            <span class="role-radio-dot" :style="{ background: r.color }" aria-hidden="true"></span>
            <span>{{ r.label }}</span>
          </label>
        </div>
      </fieldset>
      <div class="form-row">
        <label class="form-label" for="repo-label-input">{{ $t('deliverables.repo_form.alias_label') }}</label>
        <input
          id="repo-label-input"
          :value="form.label"
          @input="updateField('label', $event.target.value)"
          type="text" :placeholder="$t('deliverables.repo_form.alias_placeholder')" class="form-input"
        />
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn--cancel" @click="close">{{ $t('common.action.cancel') }}</button>
        <button type="submit" class="modal-btn modal-btn--primary" :disabled="!form.url || isLoading">
          <Loader2 v-if="isLoading" :size="13" class="rotate-anim mr-2" aria-hidden="true" />{{ $t('common.action.save') }}
        </button>
      </div>
    </form>
  </VDialog>
</template>

<style scoped>
.modal-card { background: white; padding: 28px; border-radius: 16px; }
.modal-title {
  font-family: 'Outfit', sans-serif; font-size: 1.15rem; font-weight: 900;
  color: var(--text-main); margin: 0 0 22px;
}
.form-row { margin-bottom: 16px; }
.form-label {
  display: block; font-family: 'Outfit', sans-serif;
  font-size: 0.72rem; font-weight: 800; color: var(--text-main);
  letter-spacing: 0.04em; margin-bottom: 6px;
}
.form-input {
  width: 100%; padding: 10px 14px; border-radius: 10px;
  border: 1.5px solid var(--border-light); background: white;
  font-family: 'Pretendard Variable', sans-serif; font-size: 0.85rem;
  color: var(--text-main); outline: none; transition: border-color .15s;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--accent); }
.form-input[readonly] { background: var(--bg-light); color: var(--text-muted); }
.role-radio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.role-radio {
  display: flex; align-items: center; gap: 6px; padding: 8px 12px;
  border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 700;
  color: var(--text-main); transition: all .15s;
}
.role-radio:has(input:checked) { background: var(--bg-light); border-color: var(--accent); }
.role-radio input { display: none; }
.role-radio-dot { width: 8px; height: 8px; border-radius: 50%; }

/* ── Library chips ── */
.library-row { margin-bottom: 12px; }
.library-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
  max-height: 90px; overflow-y: auto;
  padding: 2px;
}
.library-chip {
  padding: 4px 12px; border-radius: 9999px;
  border: 1.5px solid rgba(46, 64, 54, 0.25);
  background: rgba(46, 64, 54, 0.05);
  color: var(--primary-moss);
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.7rem; font-weight: 700;
  cursor: pointer; transition: all .15s;
  white-space: nowrap;
  max-width: 220px; overflow: hidden; text-overflow: ellipsis;
}
.library-chip:hover {
  background: var(--primary-moss); color: white;
  border-color: var(--primary-moss);
}
.library-chip--active {
  background: var(--primary-moss); color: white;
  border-color: var(--primary-moss);
}

.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
.modal-btn {
  display: inline-flex; align-items: center; padding: 10px 22px;
  border: none; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.75rem; font-weight: 800;
  letter-spacing: 0.04em; cursor: pointer; transition: all .15s;
}
.modal-btn--cancel { background: var(--bg-light); color: var(--text-main); }
.modal-btn--primary { background: var(--accent); color: white; }
.modal-btn--primary:hover:not(:disabled) { transform: translateY(-1px); }
.modal-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }

.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
