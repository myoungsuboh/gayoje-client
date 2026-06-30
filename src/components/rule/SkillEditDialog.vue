<script setup>
/**
 * SkillEditDialog — 라이브러리 스킬 생성/편집.
 *
 * - skill=null + folderId 주어짐 → 생성 (그 폴더 안)
 * - skill 객체 주어짐 → 편집 (folder_id 변경 시 폴더 이동도 함께)
 *
 * 기존 RuleGeneratorTab 의 스킬 폼과 거의 동일 구조 (이름/범위/우선순위/지시사항/태그).
 * 다른 점: id 는 backend 가 randomUUID 부여 — 사용자가 정할 필요 없음.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { Sparkles, Pencil, X, Plus, AlertCircle, Trash2, ChevronDown } from 'lucide-vue-next'
import { useSkillLibraryStore } from '@/store/skillLibrary'
import { useSkillQuality } from '@/composables/useSkillQuality'
import { useSkillImprove } from '@/composables/useSkillImprove'
import SkillImproveDialog from '@/components/plan/rule/SkillImproveDialog.vue'

const { t } = useI18n()
const { xs } = useDisplay()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** null 이면 생성, 객체면 편집. */
  skill: { type: Object, default: null },
  /** 생성 모드일 때 부모가 넘기는 대상 폴더. */
  folderId: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const store = useSkillLibraryStore()
const isEditMode = computed(() => !!props.skill?.id)

// ─── 폼 ──────────────────────────────────────────────
const name = ref('')
const scope = ref('')
const priority = ref('Medium')
const triggerCondition = ref('')
const instructions = ref([])
const tags = ref([])
const folderIdLocal = ref('')

const newInstruction = ref('')
const newTag = ref('')
const submitError = ref('')
const isSaving = ref(false)

watch(() => props.modelValue, (isOpen) => {
  if (!isOpen) return
  submitError.value = ''
  isSaving.value = false
  if (isEditMode.value) {
    name.value = props.skill.name || ''
    scope.value = props.skill.scope || ''
    priority.value = props.skill.priority || 'Medium'
    triggerCondition.value = props.skill.trigger_condition || ''
    instructions.value = [...(props.skill.instructions || [])]
    tags.value = [...(props.skill.tags || [])]
    folderIdLocal.value = props.skill.folder_id || ''
  } else {
    name.value = ''
    scope.value = ''
    priority.value = 'Medium'
    triggerCondition.value = ''
    instructions.value = []
    tags.value = []
    folderIdLocal.value = props.folderId
  }
  newInstruction.value = ''
  newTag.value = ''
  // AI 다듬기 상태 초기화 — 재오픈 시 이전 결과/모달 잔존 방지
  improveDialogOpen.value = false
  resetImprove()
})

const folderOptions = computed(() => store.folders)

const canSubmit = computed(() => {
  if (!name.value.trim()) return false
  if (!folderIdLocal.value) return false
  return !isSaving.value
})

const close = () => emit('update:modelValue', false)

const addInstruction = () => {
  const v = newInstruction.value.trim()
  if (!v) return
  instructions.value = [...instructions.value, v]
  newInstruction.value = ''
}
const removeInstruction = (idx) => {
  instructions.value = instructions.value.filter((_, i) => i !== idx)
}

const addTag = () => {
  const v = newTag.value.trim()
  if (!v) return
  if (tags.value.includes(v)) return
  tags.value = [...tags.value, v]
  newTag.value = ''
}
const removeTag = (tag) => { tags.value = tags.value.filter(x => x !== tag) }

const save = async () => {
  if (!canSubmit.value) return
  isSaving.value = true
  submitError.value = ''
  const payload = {
    name: name.value.trim(),
    scope: scope.value.trim(),
    priority: priority.value,
    trigger_condition: triggerCondition.value.trim(),
    instructions: instructions.value,
    tags: tags.value,
  }
  if (isEditMode.value) {
    // folder_id 가 바뀌었으면 폴더 이동
    if (folderIdLocal.value && folderIdLocal.value !== props.skill.folder_id) {
      payload.folder_id = folderIdLocal.value
    }
    const r = await store.updateSkill(props.skill.id, payload)
    isSaving.value = false
    if (r.success) { emit('saved', r.skill); close() }
    else { submitError.value = r.error || t('rule.edit_dialog.save_failed') }
  } else {
    payload.folder_id = folderIdLocal.value
    const r = await store.addSkill(payload)
    isSaving.value = false
    if (r.success) { emit('saved', r.skill); close() }
    else { submitError.value = r.error || t('rule.edit_dialog.add_failed') }
  }
}

// ─── 품질 분석 (Phase 1: 클라이언트 사이드 lint) ──────────
const skillForLint = computed(() => ({
  name: name.value,
  trigger_condition: triggerCondition.value,
  instructions: instructions.value,
  scope: scope.value,
}))
const { warnings, score, level, hasIssues, errorCount, warningCount, infoCount } = useSkillQuality(skillForLint)
// 이름이 입력된 후 패널 표시 — 빈 폼 진입 시 즉시 노출 방지
const showQuality = computed(() => name.value.trim().length >= 2)
const qualityExpanded = ref(true)

// [잔여③] AI 로 다듬기 — B3 의 useSkillImprove/SkillImproveDialog 재사용 (ref 폼에 반영)
const { isImproving, result: improveResult, error: improveError, improve, reset: resetImprove } = useSkillImprove()
const improveDialogOpen = ref(false)
const improveOriginal = ref({})

async function handleImprove() {
  improveOriginal.value = {
    name: name.value,
    trigger_condition: triggerCondition.value,
    instructions: [...instructions.value],
  }
  improveDialogOpen.value = true
  await improve({
    name: name.value,
    scope: scope.value,
    trigger_condition: triggerCondition.value,
    instructions: instructions.value,
    tags: tags.value,
  })
}

function applyImprove() {
  const r = improveResult.value
  if (!r) return
  if (r.name) name.value = r.name
  if (r.scope) scope.value = r.scope
  if (r.trigger_condition) triggerCondition.value = r.trigger_condition
  if (Array.isArray(r.instructions) && r.instructions.length) instructions.value = [...r.instructions]
  improveDialogOpen.value = false
  resetImprove()
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="xs ? undefined : 600"
    :fullscreen="xs"
    persistent
    scrollable
    @update:model-value="(v) => !v && close()"
  >
    <div class="sed-modal">
      <header class="sed-header">
        <component :is="isEditMode ? Pencil : Sparkles" :size="20" class="sed-icon" />
        <h3 class="sed-title">{{ isEditMode ? $t('rule.edit_dialog.title_edit') : $t('rule.edit_dialog.title_create') }}</h3>
        <button class="sed-close" @click="close" :aria-label="$t('common.action.close')"><X :size="18" /></button>
      </header>

      <div class="sed-body">
        <!-- 이름 + 우선순위 한 줄 -->
        <div class="sed-row">
          <label class="sed-field" style="flex: 2;">
            <span class="sed-label">{{ $t('rule.edit_dialog.name_label') }} <span class="sed-required">*</span></span>
            <input
              v-model="name"
              type="text"
              class="sed-input"
              :placeholder="$t('rule.edit_dialog.name_placeholder')"
              maxlength="200"
            />
          </label>
          <label class="sed-field" style="flex: 1;">
            <span class="sed-label">{{ $t('rule.edit_dialog.priority_label') }}</span>
            <select v-model="priority" class="sed-input">
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
        </div>

        <!-- 폴더 -->
        <label class="sed-field">
          <span class="sed-label">{{ $t('rule.edit_dialog.folder_label') }} <span class="sed-required">*</span></span>
          <select v-model="folderIdLocal" class="sed-input">
            <option value="" disabled>{{ $t('rule.edit_dialog.folder_placeholder') }}</option>
            <option v-for="f in folderOptions" :key="f.id" :value="f.id">
              {{ f.name }}
            </option>
          </select>
        </label>

        <!-- 범위 -->
        <label class="sed-field">
          <span class="sed-label">{{ $t('rule.edit_dialog.scope_label') }}</span>
          <input
            v-model="scope"
            type="text"
            class="sed-input"
            :placeholder="$t('rule.edit_dialog.scope_placeholder')"
          />
        </label>

        <!-- 트리거 조건 -->
        <label class="sed-field">
          <span class="sed-label">{{ $t('rule.edit_dialog.trigger_label') }}</span>
          <input
            v-model="triggerCondition"
            type="text"
            class="sed-input"
            :placeholder="$t('rule.edit_dialog.trigger_placeholder')"
          />
        </label>

        <!-- 지시사항 -->
        <div class="sed-field">
          <span class="sed-label">{{ $t('rule.edit_dialog.instructions_label', { count: instructions.length }) }}</span>
          <div class="sed-add-row">
            <input
              v-model="newInstruction"
              type="text"
              class="sed-input"
              :placeholder="$t('rule.edit_dialog.instruction_placeholder')"
              @keyup.enter="addInstruction"
            />
            <button type="button" class="sed-btn-secondary sed-btn-sm" @click="addInstruction">
              <Plus :size="12" />
            </button>
          </div>
          <ul v-if="instructions.length > 0" class="sed-list">
            <li v-for="(line, idx) in instructions" :key="idx" class="sed-list-item">
              <span class="sed-list-text">{{ line }}</span>
              <button
                type="button"
                class="sed-icon-btn"
                @click="removeInstruction(idx)"
                :aria-label="$t('rule.edit_dialog.instruction_remove_aria')"
              ><X :size="12" /></button>
            </li>
          </ul>
        </div>

        <!-- 품질 분석 패널 — 지시사항 바로 아래, 태그 위 -->
        <div v-if="showQuality" class="sq-panel" :class="`sq-panel--${level}`">
          <button
            type="button"
            class="sq-header"
            @click="qualityExpanded = !qualityExpanded"
            :aria-expanded="String(qualityExpanded)"
          >
            <div class="sq-header-left">
              <span class="sq-level-icon">{{ level === 'good' ? '✅' : level === 'ok' ? '🔶' : '🔴' }}</span>
              <div class="sq-header-info">
                <span class="sq-title">
                  {{ level === 'good' ? $t('rule.quality.title_good') : level === 'ok' ? $t('rule.quality.title_ok') : $t('rule.quality.title_poor') }}
                </span>
                <div class="sq-score-row">
                  <div class="sq-score-bar-wrap">
                    <div class="sq-score-bar-fill" :class="`sq-score-bar-fill--${level}`" :style="{ width: score + '%' }"></div>
                  </div>
                  <span class="sq-score-num">{{ $t('rule.quality.score_suffix', { score }) }}</span>
                </div>
              </div>
            </div>
            <div class="sq-counts" v-if="hasIssues">
              <span v-if="errorCount" class="sq-count sq-count--error">🚫 {{ errorCount }}</span>
              <span v-if="warningCount" class="sq-count sq-count--warning">⚡ {{ warningCount }}</span>
              <span v-if="infoCount" class="sq-count sq-count--info">💡 {{ infoCount }}</span>
            </div>
            <ChevronDown :size="14" class="sq-chevron" :class="{ 'sq-chevron--open': qualityExpanded }" />
          </button>

          <div v-if="qualityExpanded">
            <!-- Good 상태 메시지 -->
            <div v-if="level === 'good'" class="sq-good-msg">
              {{ $t('rule.quality.good_msg') }}
            </div>
            <!-- 이슈 목록 -->
            <ul v-else class="sq-list">
              <li
                v-for="w in warnings"
                :key="w.message"
                class="sq-item"
                :class="`sq-item--${w.level}`"
              >
                <span class="sq-item-icon">{{ w.icon }}</span>
                <div class="sq-item-body">
                  <span class="sq-item-msg">{{ w.message }}</span>
                  <span v-if="w.hint" class="sq-item-hint">{{ w.hint }}</span>
                </div>
              </li>
            </ul>
            <div class="sq-improve-row">
              <button type="button" class="sq-improve-btn" :disabled="isImproving" @click="handleImprove">
                <Sparkles :size="13" class="mr-1" />{{ isImproving ? $t('rule.improve.loading') : $t('rule.improve.button') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 태그 -->
        <div class="sed-field">
          <span class="sed-label">{{ $t('rule.edit_dialog.tags_label', { count: tags.length }) }}</span>
          <div class="sed-add-row">
            <input
              v-model="newTag"
              type="text"
              class="sed-input"
              :placeholder="$t('rule.edit_dialog.tag_placeholder')"
              @keyup.enter="addTag"
            />
            <button type="button" class="sed-btn-secondary sed-btn-sm" @click="addTag">
              <Plus :size="12" />
            </button>
          </div>
          <div v-if="tags.length > 0" class="sed-tag-row">
            <span v-for="tag in tags" :key="tag" class="sed-tag-pill">
              #{{ tag }}
              <button
                type="button"
                class="sed-tag-remove"
                @click="removeTag(tag)"
                :aria-label="$t('rule.edit_dialog.tag_remove_aria')"
              ><X :size="10" /></button>
            </span>
          </div>
        </div>

        <div v-if="submitError" class="sed-submit-error">
          <AlertCircle :size="13" class="mr-1" />{{ submitError }}
        </div>
      </div>

      <footer class="sed-footer">
        <button class="sed-btn-secondary" @click="close">{{ $t('common.action.cancel') }}</button>
        <button
          class="sed-btn-primary"
          :disabled="!canSubmit"
          @click="save"
        >
          {{ isEditMode ? $t('common.action.save') : $t('rule.edit_dialog.submit_create') }}
        </button>
      </footer>
    </div>
  </v-dialog>

  <!-- [잔여③] AI 다듬기 before/after 미리보기 (B3 재사용) -->
  <SkillImproveDialog
    v-model="improveDialogOpen"
    :original="improveOriginal"
    :result="improveResult"
    :loading="isImproving"
    :error="improveError"
    @apply="applyImprove"
  />
</template>

<style scoped>
.sed-modal {
  background: #fff;
  border-radius: 14px;
  font-family: 'Pretendard', sans-serif;
  display: flex;
  flex-direction: column;
  max-height: 86vh;
  overflow: hidden;
}
@media (max-width: 600px) {
  .sed-modal { border-radius: 0; max-height: 100dvh; min-height: 100dvh; }
  .sed-row { flex-direction: column; gap: 10px; }
}
.sed-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;
}
.sed-icon { color: var(--accent, #8C6239); }
.sed-title { flex: 1; margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-main); }
.sed-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px; border-radius: 6px;
}
.sed-close:hover { background: rgba(0, 0, 0, 0.04); }

.sed-body {
  padding: 18px 20px;
  display: flex; flex-direction: column; gap: 14px;
  overflow-y: auto;
}
.sed-row { display: flex; gap: 10px; }
.sed-field { display: flex; flex-direction: column; gap: 4px; }
.sed-label { font-size: 0.78rem; font-weight: 700; color: var(--text-main); }
.sed-required { color: #dc2626; }
.sed-input {
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.12s;
  background: white;
  color: var(--text-main);
}
.sed-input:focus { border-color: var(--accent, #8C6239); }

.sed-add-row { display: flex; gap: 6px; }
.sed-add-row .sed-input { flex: 1; }
.sed-list {
  list-style: none;
  margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 4px;
}
.sed-list-item {
  display: flex; align-items: center;
  background: var(--bg-light, #F7F5EB);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text-main);
}
.sed-list-text { flex: 1; }

.sed-tag-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.sed-tag-pill {
  display: inline-flex; align-items: center; gap: 4px;
  background: rgba(140, 98, 57, 0.1);
  color: var(--accent, #8C6239);
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 600;
}
.sed-tag-remove {
  background: transparent; border: none; cursor: pointer;
  color: var(--accent, #8C6239); padding: 0;
  display: inline-flex; align-items: center;
}
.sed-tag-remove:hover { color: #b91c1c; }

.sed-icon-btn {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted, #6F665F); padding: 2px; border-radius: 4px;
}
.sed-icon-btn:hover { color: #dc2626; background: rgba(220, 38, 38, 0.08); }

.sed-submit-error {
  display: inline-flex; align-items: center;
  background: #fef2f2; color: #b91c1c;
  font-size: 0.78rem; font-weight: 600;
  padding: 8px 10px; border-radius: 8px;
}

.sed-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: var(--bg-light, #F7F5EB);
  flex-shrink: 0;
}
.sed-btn-primary, .sed-btn-secondary {
  display: inline-flex; align-items: center;
  border: none; border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.82rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.sed-btn-primary { background: var(--accent, #8C6239); color: white; }
.sed-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.sed-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.sed-btn-secondary { background: rgba(0, 0, 0, 0.05); color: var(--text-main); }
.sed-btn-secondary:hover { background: rgba(0, 0, 0, 0.08); }
.sed-btn-sm { padding: 5px 10px; font-size: 0.72rem; }

.mr-1 { margin-right: 4px; }

/* ── 품질 분석 패널 (sq-*) ───────────────────────────────── */
.sq-panel {
  border-radius: 12px;
  border: 1px solid;
  overflow: hidden;
  font-size: 0.78rem;
}
.sq-panel--good { border-color: #86efac; background: #f0fdf4; }
.sq-panel--ok   { border-color: #fde68a; background: #fffbeb; }
.sq-panel--poor { border-color: #fca5a5; background: #fef2f2; }

.sq-header {
  width: 100%;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  background: transparent; border: none; cursor: pointer;
  text-align: left; font-family: inherit;
}
.sq-header:hover { filter: brightness(0.97); }
.sq-header-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.sq-level-icon { font-size: 1rem; flex-shrink: 0; line-height: 1; }
.sq-header-info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.sq-title { font-size: 0.78rem; font-weight: 700; color: var(--text-main); }

.sq-score-row { display: flex; align-items: center; gap: 6px; }
.sq-score-bar-wrap {
  width: 80px; height: 4px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 9999px; overflow: hidden;
}
.sq-score-bar-fill { height: 100%; border-radius: 9999px; transition: width 0.4s ease; }
.sq-score-bar-fill--good { background: #22c55e; }
.sq-score-bar-fill--ok   { background: #f59e0b; }
.sq-score-bar-fill--poor { background: #ef4444; }
.sq-score-num { font-size: 0.67rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }

.sq-counts { display: flex; gap: 4px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.sq-count {
  font-size: 0.65rem; font-weight: 600;
  padding: 2px 7px; border-radius: 9999px;
}
.sq-count--error   { background: #fee2e2; color: #dc2626; }
.sq-count--warning { background: #fef3c7; color: #d97706; }
.sq-count--info    { background: #dbeafe; color: #2563eb; }

/* [잔여③] AI 다듬기 버튼 (라이브러리 규칙 편집) */
.sq-improve-row { display: flex; justify-content: flex-end; padding: 2px 10px 10px; }
.sq-improve-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--accent, #8C6239); color: #fff;
  border: none; border-radius: 9999px;
  padding: 5px 12px; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.sq-improve-btn:hover:not(:disabled) { background: #6E4E2E; }
.sq-improve-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.sq-chevron { color: var(--text-muted); transition: transform 0.2s; flex-shrink: 0; }
.sq-chevron--open { transform: rotate(180deg); }

.sq-good-msg {
  font-size: 0.75rem; color: #166534; line-height: 1.6;
  padding: 0 12px 12px;
}

.sq-list {
  list-style: none; margin: 0;
  padding: 0 10px 10px;
  display: flex; flex-direction: column; gap: 6px;
}
.sq-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
}
.sq-item-icon { font-size: 0.85rem; flex-shrink: 0; margin-top: 1px; line-height: 1; }
.sq-item-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sq-item-msg { font-size: 0.75rem; font-weight: 600; line-height: 1.4; }
.sq-item-hint { font-size: 0.68rem; opacity: 0.72; font-style: italic; line-height: 1.4; }
.sq-item--error   { background: rgba(220, 38, 38, 0.07);  color: #991b1b; }
.sq-item--warning { background: rgba(217, 119, 6, 0.07);  color: #92400e; }
.sq-item--info    { background: rgba(59, 130, 246, 0.07); color: #1d4ed8; }
</style>
