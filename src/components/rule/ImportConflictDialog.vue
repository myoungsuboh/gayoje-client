<script setup>
/**
 * ImportConflictDialog — 라이브러리 → 프로젝트 export 시 ID 충돌 처리.
 *
 * [사용 흐름]
 * 1. 부모(RuleGeneratorTab)가 export 시도
 * 2. 먼저 store.checkExportConflicts() 호출 → 충돌 ID 받음
 * 3. 충돌 0개면 바로 exportToProject 실행
 * 4. 충돌 있으면 이 다이얼로그 열기 → 사용자 정책 선택 → exportToProject 실행
 *
 * [정책]
 * - overwrite: 현재 프로젝트 스킬을 라이브러리 값으로 덮어쓰기
 * - skip: 충돌 스킬은 건너뛰고 나머지만 import
 * - rename: 충돌 스킬에 '-copy' suffix 부여
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { AlertTriangle, X, ArrowUp } from 'lucide-vue-next'
import { useSkillLibraryStore } from '@/store/skillLibrary'

const { t } = useI18n()
const { xs } = useDisplay()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 충돌 검사된 라이브러리 스킬 ID 리스트 (전체 export 대상). */
  librarySkillIds: { type: Array, default: () => [] },
  /** 충돌난 ID 목록 (export-시도 시 호출된 check-export-conflicts 응답). */
  conflictingIds: { type: Array, default: () => [] },
  /** 현재 프로젝트 이름. */
  projectName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'done'])

const store = useSkillLibraryStore()

const strategy = ref('skip')   // 'overwrite' | 'skip' | 'rename'
const isExporting = ref(false)
const submitError = ref('')

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    strategy.value = 'skip'
    isExporting.value = false
    submitError.value = ''
  }
})

// 충돌난 스킬의 이름 표시 (라이브러리 store 에서 조회)
const conflictingSkillNames = computed(() => {
  // export-to-project 는 library_skill_id 기준이 아닌 lib.id 기준 conflict 검사.
  // 즉 conflictingIds 는 라이브러리 스킬의 id (목적지 프로젝트의 Skill 과 같은 id).
  // 라이브러리 store 에서 그 id 로 이름 찾기.
  return props.conflictingIds
    .map(id => store.skillsById.get(id)?.name || id)
    .slice(0, 8)  // 너무 많으면 잘라서
})

const close = () => emit('update:modelValue', false)

const confirm = async () => {
  if (!props.projectName) return
  isExporting.value = true
  submitError.value = ''
  const r = await store.exportToProject({
    project_name: props.projectName,
    library_skill_ids: props.librarySkillIds,
    conflict_strategy: strategy.value,
  })
  isExporting.value = false
  if (r.success) {
    emit('done', r.data)
    close()
  } else {
    submitError.value = r.error || t('rule.import_conflict.export_failed')
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="xs ? undefined : 520"
    :fullscreen="xs"
    persistent
    @update:model-value="(v) => !v && close()"
  >
    <div class="icd-modal">
      <header class="icd-header">
        <AlertTriangle :size="20" class="icd-warn-icon" />
        <h3 class="icd-title">{{ $t('rule.import_conflict.title', { count: conflictingIds.length }) }}</h3>
        <button class="icd-close" @click="close" :aria-label="$t('common.action.close')"><X :size="18" /></button>
      </header>

      <div class="icd-body">
        <p class="icd-msg" v-html="$t('rule.import_conflict.message_html', { name: projectName })"></p>

        <!-- 충돌 ID 미리보기 -->
        <div class="icd-conflict-box">
          <span class="icd-conflict-label">{{ $t('rule.import_conflict.conflict_label') }}</span>
          <ul class="icd-conflict-list">
            <li v-for="name in conflictingSkillNames" :key="name">{{ name }}</li>
            <li v-if="conflictingIds.length > conflictingSkillNames.length" class="icd-conflict-more">
              {{ $t('rule.import_conflict.conflict_more', { count: conflictingIds.length - conflictingSkillNames.length }) }}
            </li>
          </ul>
        </div>

        <!-- 정책 선택 -->
        <div class="icd-options">
          <label class="icd-option" :class="{ 'icd-option--active': strategy === 'skip' }">
            <input v-model="strategy" type="radio" value="skip" class="icd-radio" />
            <div class="icd-option-text">
              <strong>{{ $t('rule.import_conflict.skip_title') }}</strong>
              <small>{{ $t('rule.import_conflict.skip_desc') }}</small>
            </div>
          </label>
          <label class="icd-option" :class="{ 'icd-option--active': strategy === 'overwrite' }">
            <input v-model="strategy" type="radio" value="overwrite" class="icd-radio" />
            <div class="icd-option-text">
              <strong>{{ $t('rule.import_conflict.overwrite_title') }}</strong>
              <small>{{ $t('rule.import_conflict.overwrite_desc') }}</small>
            </div>
          </label>
          <label class="icd-option" :class="{ 'icd-option--active': strategy === 'rename' }">
            <input v-model="strategy" type="radio" value="rename" class="icd-radio" />
            <div class="icd-option-text">
              <strong>{{ $t('rule.import_conflict.rename_title') }}</strong>
              <small v-html="$t('rule.import_conflict.rename_desc_html')"></small>
            </div>
          </label>
        </div>

        <div v-if="submitError" class="icd-submit-error">{{ submitError }}</div>
      </div>

      <footer class="icd-footer">
        <button class="icd-btn-secondary" @click="close" :disabled="isExporting">{{ $t('common.action.cancel') }}</button>
        <button
          class="icd-btn-primary"
          @click="confirm"
          :disabled="isExporting || !projectName"
        >
          <ArrowUp :size="13" class="mr-1" />
          {{ isExporting ? $t('rule.import_conflict.submitting') : $t('rule.import_conflict.submit') }}
        </button>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.icd-modal {
  background: #fff;
  border-radius: 14px;
  font-family: 'Pretendard', sans-serif;
  overflow: hidden;
}
@media (max-width: 600px) {
  .icd-modal { border-radius: 0; min-height: 100dvh; display: flex; flex-direction: column; }
  .icd-body { flex: 1; overflow-y: auto; }
}
.icd-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
}
.icd-warn-icon { color: #f59e0b; }
.icd-title { flex: 1; margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-main); }
.icd-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px; border-radius: 6px;
}
.icd-close:hover { background: rgba(0, 0, 0, 0.04); }

.icd-body {
  padding: 18px 20px;
  display: flex; flex-direction: column; gap: 16px;
}
.icd-msg { font-size: 0.85rem; color: var(--text-main); line-height: 1.6; margin: 0; }

.icd-conflict-box {
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 8px;
  padding: 10px 14px;
}
.icd-conflict-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  color: #92400e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.icd-conflict-list {
  list-style: disc;
  margin: 0;
  padding-left: 20px;
  font-size: 0.8rem;
  color: #78350f;
}
.icd-conflict-list li { line-height: 1.6; }
.icd-conflict-more { font-style: italic; opacity: 0.8; list-style: none; margin-left: -20px; }

.icd-options { display: flex; flex-direction: column; gap: 8px; }
.icd-option {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px;
  border: 1.5px solid var(--border-light, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.icd-option:hover { border-color: var(--accent, #8C6239); }
.icd-option--active { border-color: var(--accent, #8C6239); background: rgba(140, 98, 57, 0.04); }
.icd-radio { margin-top: 2px; accent-color: var(--accent, #8C6239); cursor: pointer; }
.icd-option-text { display: flex; flex-direction: column; gap: 2px; }
.icd-option-text strong { font-size: 0.85rem; color: var(--text-main); font-weight: 700; }
.icd-option-text small { font-size: 0.74rem; color: var(--text-muted); }
.icd-option-text code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.7rem;
}

.icd-submit-error {
  background: #fef2f2; color: #b91c1c;
  font-size: 0.78rem; font-weight: 600;
  padding: 8px 10px; border-radius: 8px;
}

.icd-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: var(--bg-light, #F7F5EB);
}
.icd-btn-primary, .icd-btn-secondary {
  display: inline-flex; align-items: center;
  border: none; border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.82rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.icd-btn-primary { background: var(--accent, #8C6239); color: white; }
.icd-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.icd-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.icd-btn-secondary { background: rgba(0, 0, 0, 0.05); color: var(--text-main); }
.icd-btn-secondary:hover:not(:disabled) { background: rgba(0, 0, 0, 0.08); }
.icd-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.mr-1 { margin-right: 4px; }
</style>
