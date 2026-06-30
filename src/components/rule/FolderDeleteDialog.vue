<script setup>
/**
 * FolderDeleteDialog — 폴더 삭제 시 안 스킬 처리 옵션 선택.
 *
 * - 빈 폴더: 옵션 없이 단순 확인
 * - 안 스킬 있음: cascade (모두 삭제) vs move (미분류로 이동) 선택
 * - BE 가 자기-자신 케이스 ('미분류' 폴더 삭제) 면 자동 cascade 응답 — FE 가 메시지 분기
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { AlertTriangle, X, Trash2 } from 'lucide-vue-next'
import { useSkillLibraryStore } from '@/store/skillLibrary'

const { t } = useI18n()
const { xs } = useDisplay()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  folder: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'deleted'])

const store = useSkillLibraryStore()

// 폴더 안 스킬 수
const skillCount = computed(() => {
  if (!props.folder?.id) return 0
  return store.entriesByFolderId.get(props.folder.id)?.skills.length ?? 0
})
const hasSkills = computed(() => skillCount.value > 0)

const choice = ref('move')      // 'cascade' | 'move'
const isDeleting = ref(false)
const submitError = ref('')

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    // 기본 옵션 — 안 스킬 있으면 'move' (안전), 없으면 'cascade' 단순.
    choice.value = hasSkills.value ? 'move' : 'cascade'
    submitError.value = ''
    isDeleting.value = false
  }
})

const close = () => emit('update:modelValue', false)

const confirmDelete = async () => {
  if (!props.folder?.id) return
  isDeleting.value = true
  submitError.value = ''
  const cascade = choice.value === 'cascade'
  const r = await store.deleteFolder(props.folder.id, cascade)
  isDeleting.value = false
  if (r.success) {
    emit('deleted', r.result)
    close()
  } else {
    submitError.value = r.error || t('rule.folder.delete_failed')
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="xs ? undefined : 440"
    :fullscreen="xs"
    persistent
    @update:model-value="(v) => !v && close()"
  >
    <div class="fdd-modal">
      <header class="fdd-header">
        <AlertTriangle :size="20" class="fdd-warn-icon" />
        <h3 class="fdd-title">{{ $t('rule.folder.delete_title', { name: folder?.name }) }}</h3>
        <button class="fdd-close" @click="close" :aria-label="$t('common.action.close')"><X :size="18" /></button>
      </header>

      <div class="fdd-body">
        <!-- 빈 폴더 -->
        <div v-if="!hasSkills" class="fdd-msg">
          {{ $t('rule.folder.delete_empty') }}
        </div>

        <!-- 안 스킬 있음 -->
        <template v-else>
          <p class="fdd-msg" v-html="$t('rule.folder.delete_has_skills_html', { count: skillCount })"></p>
          <div class="fdd-options">
            <label class="fdd-option" :class="{ 'fdd-option--active': choice === 'cascade' }">
              <input v-model="choice" type="radio" value="cascade" class="fdd-radio" />
              <div class="fdd-option-text">
                <strong>{{ $t('rule.folder.delete_cascade_title') }}</strong>
                <small>{{ $t('rule.folder.delete_cascade_desc', { count: skillCount }) }}</small>
              </div>
            </label>
            <label class="fdd-option" :class="{ 'fdd-option--active': choice === 'move' }">
              <input v-model="choice" type="radio" value="move" class="fdd-radio" />
              <div class="fdd-option-text">
                <strong>{{ $t('rule.folder.delete_move_title') }}</strong>
                <small>{{ $t('rule.folder.delete_move_desc') }}</small>
              </div>
            </label>
          </div>
        </template>

        <div v-if="submitError" class="fdd-submit-error">{{ submitError }}</div>
      </div>

      <footer class="fdd-footer">
        <button class="fdd-btn-secondary" @click="close" :disabled="isDeleting">{{ $t('common.action.cancel') }}</button>
        <button
          class="fdd-btn-danger"
          @click="confirmDelete"
          :disabled="isDeleting"
        >
          <Trash2 :size="13" class="mr-1" />
          {{ isDeleting ? $t('rule.folder.deleting') : $t('common.action.delete') }}
        </button>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.fdd-modal {
  background: #fff;
  border-radius: 14px;
  font-family: 'Pretendard', sans-serif;
  overflow: hidden;
}
@media (max-width: 600px) {
  .fdd-modal { border-radius: 0; min-height: 100dvh; display: flex; flex-direction: column; }
  .fdd-body { flex: 1; overflow-y: auto; }
}
.fdd-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
}
.fdd-warn-icon { color: #f59e0b; }
.fdd-title { flex: 1; margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-main); }
.fdd-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px; border-radius: 6px;
}
.fdd-close:hover { background: rgba(0, 0, 0, 0.04); }

.fdd-body {
  padding: 18px 20px;
  display: flex; flex-direction: column; gap: 14px;
}
.fdd-msg {
  font-size: 0.85rem; color: var(--text-main, #2A2421); line-height: 1.6; margin: 0;
}

.fdd-options { display: flex; flex-direction: column; gap: 8px; }
.fdd-option {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px;
  border: 1.5px solid var(--border-light, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.fdd-option:hover { border-color: var(--accent, #8C6239); }
.fdd-option--active { border-color: var(--accent, #8C6239); background: rgba(140, 98, 57, 0.04); }
.fdd-radio { margin-top: 2px; accent-color: var(--accent, #8C6239); cursor: pointer; }
.fdd-option-text { display: flex; flex-direction: column; gap: 2px; }
.fdd-option-text strong { font-size: 0.85rem; color: var(--text-main); font-weight: 700; }
.fdd-option-text small { font-size: 0.74rem; color: var(--text-muted, #6F665F); }

.fdd-submit-error {
  background: #fef2f2; color: #b91c1c;
  font-size: 0.78rem; font-weight: 600;
  padding: 8px 10px; border-radius: 8px;
}

.fdd-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: var(--bg-light, #F7F5EB);
}
.fdd-btn-secondary, .fdd-btn-danger {
  display: inline-flex; align-items: center;
  border: none; border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.82rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.fdd-btn-secondary { background: rgba(0, 0, 0, 0.05); color: var(--text-main); }
.fdd-btn-secondary:hover:not(:disabled) { background: rgba(0, 0, 0, 0.08); }
.fdd-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.fdd-btn-danger { background: #dc2626; color: white; }
.fdd-btn-danger:hover:not(:disabled) { background: #b91c1c; }
.fdd-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.mr-1 { margin-right: 4px; }
</style>
