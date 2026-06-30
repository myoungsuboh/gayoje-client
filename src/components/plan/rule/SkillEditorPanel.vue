<!-- eslint-disable vue/no-mutating-props -->
<script setup>
/**
 * SkillEditorPanel
 *
 * RuleGeneratorTab 우측 편집 패널 — 스킬 4개 섹션 폼 (기본정보 / 지시사항 / 태그 / 적용서비스).
 *
 * Mutation 패턴:
 *   parent 의 `selectedSkill` (computed → object ref) 가 prop 으로 들어옴.
 *   자식이 `props.skill.instructions.push(...)`, `props.skill.tags = ...` 등
 *   직접 mutation 하면 ref 공유로 parent 에 자동 propagate.
 *   기존 동작 그대로 보존하려는 의도 — 그래서 vue/no-mutating-props 비활성화.
 */
import { ref, computed } from 'vue'
import { Trash2, Save, X, Zap, Link2, GitBranch, Sparkles } from 'lucide-vue-next'
import { useSkillQuality } from '@/composables/useSkillQuality'
import { useSkillImprove } from '@/composables/useSkillImprove'
import SkillImproveDialog from '@/components/plan/rule/SkillImproveDialog.vue'

const props = defineProps({
  skill: { type: Object, default: null },
  isSaving: { type: Boolean, default: false },
  isDeleting: { type: Boolean, default: false },
  isCheckingId: { type: Boolean, default: false },
  priorities: { type: Array, required: true },
  priorityColor: { type: Object, required: true },
})

const emit = defineEmits(['save', 'delete', 'cancel', 'check-duplicate-id'])

const newInstruction = ref('')
const newTagInput = ref('')
const hasSkill = computed(() => !!props.skill)
// 내부 cat: 마커(동적 카테고리 보존용)는 사용자에게 숨김 — 노출 시 혼란 + 실수 삭제로 export 폴더 분류가 깨진다.
const visibleTags = computed(() =>
  (props.skill?.tags || []).filter(t => !(typeof t === 'string' && t.startsWith('cat:')))
)

function addInstruction() {
  if (newInstruction.value.trim() && props.skill) {
    props.skill.instructions.push(newInstruction.value.trim())
    newInstruction.value = ''
  }
}
function removeInstruction(idx) {
  props.skill?.instructions.splice(idx, 1)
}
function addTag() {
  const tag = newTagInput.value.trim()
  // cat: 는 카테고리 분류용 내부 마커라 사용자 직접 입력 금지(getCategoryFromSkill 오작동 방지).
  if (tag && !tag.startsWith('cat:') && props.skill && !props.skill.tags.includes(tag)) {
    props.skill.tags.push(tag)
  }
  newTagInput.value = ''
}
function removeTag(tag) {
  if (props.skill) props.skill.tags = props.skill.tags.filter(t => t !== tag)
}
function onIdInput() {
  if (props.skill) props.skill.isIdChecked = false
}

// ─── 품질 분석
const qualitySkillRef = computed(() => props.skill)
const { warnings, score, level, hasIssues, errorCount, warningCount, infoCount } = useSkillQuality(qualitySkillRef)
const qualityExpanded = ref(true)
const showQualityPanel = computed(() => {
  const n = props.skill?.name?.trim() || ''
  return n.length >= 2 && n !== '새 스킬'
})

// ─── AI 로 다듬기 (improveSkill)
const { isImproving, result: improveResult, error: improveError, improve, reset: resetImprove } = useSkillImprove()
const improveDialogOpen = ref(false)
const improveOriginal = ref({})

async function handleImprove() {
  if (!props.skill) return
  // 다듬기 직전 초안 스냅샷 (before/after 비교용)
  improveOriginal.value = {
    name: props.skill.name,
    trigger_condition: props.skill.trigger_condition,
    instructions: [...(props.skill.instructions || [])],
  }
  improveDialogOpen.value = true
  await improve(props.skill)
}

function applyImprove() {
  if (!props.skill || !improveResult.value) return
  const r = improveResult.value
  // 빈 필드는 원본 유지 (BE fallback 과 동일 정책 — 사용자 입력 보존)
  if (r.name) props.skill.name = r.name
  if (r.scope) props.skill.scope = r.scope
  if (r.trigger_condition) props.skill.trigger_condition = r.trigger_condition
  if (Array.isArray(r.instructions) && r.instructions.length) {
    props.skill.instructions = [...r.instructions]
  }
  improveDialogOpen.value = false
  resetImprove()
}
</script>

<template>
  <div class="editor-panel custom-scroll flex-grow-1 overflow-y-auto" v-if="hasSkill">

    <!-- 에디터 상단 액션 -->
    <div class="panel-header-row mb-4">
      <div class="panel-title-area">
        <h2 class="skill-name-title">{{ skill.name }}</h2>
        <p class="skill-id-text">ID: {{ skill.id }}</p>
      </div>
      <div class="panel-actions">
        <VBtn v-if="skill.isNew" variant="tonal" color="warning" height="38" @click="emit('cancel')" elevation="0">
          <X :size="14" class="mr-2" />{{ $t('rule.editor.cancel') }}
        </VBtn>
        <VBtn v-else variant="tonal" color="error" height="38" @click="emit('delete')" :loading="isDeleting" elevation="0">
          <Trash2 :size="14" class="mr-2" />{{ $t('common.action.delete') }}
        </VBtn>
        <VBtn variant="flat" color="accent" height="38" @click="emit('save')" :loading="isSaving" elevation="0" class="btn-save">
          <Save :size="14" class="mr-2" />{{ $t('common.action.save') }}
        </VBtn>
      </div>
    </div>

    <!-- 품질 분석 패널 -->
    <div v-if="showQualityPanel" class="quality-panel" :class="`quality-panel--${level}`">
      <button
        type="button"
        class="quality-header"
        @click="qualityExpanded = !qualityExpanded"
        :aria-expanded="String(qualityExpanded)"
      >
        <div class="quality-header-left">
          <span class="quality-level-icon">{{ level === 'good' ? '✅' : level === 'ok' ? '🔶' : '🔴' }}</span>
          <div class="quality-header-info">
            <span class="quality-title">
              {{ level === 'good' ? $t('rule.quality.title_good') : level === 'ok' ? $t('rule.quality.title_ok') : $t('rule.quality.title_poor') }}
            </span>
            <div class="quality-score-row">
              <div class="quality-score-bar-wrap">
                <div class="quality-score-bar-fill" :class="`quality-score-bar-fill--${level}`" :style="{ width: score + '%' }"></div>
              </div>
              <span class="quality-score-num">{{ $t('rule.quality.score_suffix', { score }) }}</span>
            </div>
          </div>
        </div>
        <div class="quality-counts" v-if="hasIssues">
          <span v-if="errorCount" class="quality-count quality-count--error">🚫 {{ errorCount }}</span>
          <span v-if="warningCount" class="quality-count quality-count--warning">⚡ {{ warningCount }}</span>
          <span v-if="infoCount" class="quality-count quality-count--info">💡 {{ infoCount }}</span>
        </div>
        <span class="quality-chevron" :class="{ 'quality-chevron--open': qualityExpanded }">▾</span>
      </button>
      <div v-if="qualityExpanded">
        <div v-if="level === 'good'" class="quality-good-msg">
          {{ $t('rule.quality.good_msg') }}
        </div>
        <ul v-else class="quality-list">
          <li
            v-for="w in warnings"
            :key="w.message"
            class="quality-item"
            :class="`quality-item--${w.level}`"
          >
            <span class="quality-item-icon">{{ w.icon }}</span>
            <div class="quality-item-body">
              <span class="quality-item-msg">{{ w.message }}</span>
              <span v-if="w.hint" class="quality-item-hint">{{ w.hint }}</span>
            </div>
          </li>
        </ul>
        <!-- AI 로 다듬기 — 사용자가 대충 적어도 구체적 규칙으로 보정 -->
        <div class="quality-improve-row">
          <VBtn
            variant="flat"
            :color="level === 'good' ? 'secondary' : 'accent'"
            size="small"
            :loading="isImproving"
            @click="handleImprove"
            class="rounded-pill font-bold quality-improve-btn"
            elevation="0"
          >
            <Sparkles :size="14" class="mr-1" />{{ $t('rule.improve.button') }}
          </VBtn>
        </div>
      </div>
    </div>

    <!-- ① 기본 정보 -->
    <div class="editor-section">
      <div class="section-title">{{ $t('rule.editor.section_basic') }}</div>
      <VRow dense>
        <VCol cols="12" md="8">
          <label class="field-label">{{ $t('rule.editor.name_label') }}</label>
          <VTextField v-model="skill.name" variant="outlined" density="compact" class="pf" hide-details :placeholder="$t('rule.editor.name_placeholder')" />
        </VCol>
        <VCol cols="12" md="4">
          <label class="field-label">{{ $t('rule.editor.priority_label') }}</label>
          <VSelect v-model="skill.priority" :items="priorities" variant="outlined" density="compact" class="pf" hide-details>
            <template #selection="{ item }">
              <span class="font-bold text-sm" :style="{ color: priorityColor[item.value] }">{{ item.title }}</span>
            </template>
          </VSelect>
        </VCol>
        <VCol cols="12" md="6">
          <label class="field-label">{{ $t('rule.editor.id_label') }}</label>
          <div class="id-check-row">
            <VTextField
              v-model="skill.id"
              @input="onIdInput"
              :readonly="!skill.isNew"
              :class="{ 'pf': true, 'opacity-70': !skill.isNew, 'id-field': true }"
              :variant="skill.isNew ? 'outlined' : 'filled'"
              density="compact"
              hide-details
              :placeholder="$t('rule.editor.id_placeholder')"
            />
            <VBtn
              v-if="skill.isNew"
              variant="tonal"
              :color="skill.isIdChecked ? 'success' : 'accent'"
              height="40"
              @click="emit('check-duplicate-id')"
              :loading="isCheckingId"
              class="font-bold text-sm rounded-lg id-check-btn"
            >
              {{ skill.isIdChecked ? $t('rule.editor.id_checked') : $t('rule.editor.id_check') }}
            </VBtn>
          </div>
        </VCol>
        <VCol cols="12" md="6">
          <label class="field-label">{{ $t('rule.editor.scope_label') }}</label>
          <VTextField v-model="skill.scope" variant="outlined" density="compact" class="pf" hide-details :placeholder="$t('rule.editor.scope_placeholder')" />
        </VCol>
        <VCol cols="12">
          <label class="field-label">{{ $t('rule.editor.trigger_label') }}</label>
          <VTextField v-model="skill.trigger_condition" variant="outlined" density="compact" class="pf" hide-details :placeholder="$t('rule.editor.trigger_placeholder')" />
        </VCol>
      </VRow>
    </div>

    <!-- ② 지시사항 -->
    <div class="editor-section">
      <div class="section-title d-flex align-center justify-space-between">
        <div class="d-flex align-center gap-2">
          <Zap :size="15" class="text-accent" />{{ $t('rule.editor.section_instructions') }}
        </div>
        <span class="count-badge">{{ $t('rule.editor.count_unit', { count: skill.instructions.length }) }}</span>
      </div>

      <div v-for="(inst, idx) in skill.instructions" :key="idx" class="inst-row d-flex align-start gap-2 mb-2">
        <div class="inst-num">{{ String(idx + 1).padStart(2, '0') }}</div>
        <VTextarea
          v-model="skill.instructions[idx]"
          variant="outlined" density="compact" auto-grow rows="1"
          class="pf inst-textarea" hide-details
          :placeholder="$t('rule.editor.instruction_placeholder')"
        />
        <VBtn icon variant="text" size="small" color="error" @click="removeInstruction(idx)" class="inst-del mt-1">
          <X :size="14" />
        </VBtn>
      </div>

      <div class="d-flex gap-2 mt-3">
        <VTextField
          v-model="newInstruction"
          @keyup.enter="addInstruction"
          :placeholder="$t('rule.editor.new_instruction_placeholder')"
          variant="outlined" density="compact"
          class="pf flex-grow-1" hide-details
        />
        <VBtn variant="tonal" color="accent" height="40" @click="addInstruction" class="rounded-lg font-bold px-4">{{ $t('rule.editor.add') }}</VBtn>
      </div>
    </div>

    <!-- ③ 태그 -->
    <div class="editor-section">
      <div class="section-title">
        <Link2 :size="15" class="text-accent" />{{ $t('rule.editor.section_tags') }}
      </div>
      <p class="text-xs text-muted mb-3 neo4j-desc" v-html="$t('rule.editor.tags_desc_html')"></p>
      <div class="d-flex gap-2 mb-3">
        <VTextField
          v-model="newTagInput"
          @keyup.enter="addTag"
          :placeholder="$t('rule.editor.new_tag_placeholder')"
          variant="outlined" density="compact"
          class="pf flex-grow-1" hide-details
        />
        <VBtn variant="tonal" color="accent" height="40" @click="addTag" class="rounded-lg font-bold px-4">{{ $t('rule.editor.add') }}</VBtn>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <VChip
          v-for="tag in visibleTags" :key="tag"
          size="small" closable @click:close="removeTag(tag)"
          variant="tonal" color="accent" class="font-bold"
        >{{ tag }}</VChip>
        <span v-if="!visibleTags.length" class="text-xs text-muted opacity-50">{{ $t('rule.editor.tags_none') }}</span>
      </div>
    </div>

    <!-- ④ 적용 서비스 -->
    <div class="editor-section bg-page-dim">
      <div class="section-title">
        <GitBranch :size="15" class="text-accent" />{{ $t('rule.editor.section_applied_services') }}
      </div>
      <p class="text-xs text-muted mb-3 neo4j-desc">
        {{ $t('rule.editor.applied_services_desc') }}
      </p>
      <div class="d-flex flex-wrap gap-2">
        <VChip
          v-for="arch in skill.applied_services" :key="arch"
          size="small" variant="flat" color="rgba(140,98,57,0.15)" text-color="var(--accent)" class="font-bold border"
        >{{ arch }}</VChip>
        <span v-if="!skill.applied_services?.length" class="text-xs text-muted opacity-50">{{ $t('rule.editor.applied_services_none') }}</span>
      </div>
    </div>

    <!-- AI 다듬기 before/after 미리보기 모달 -->
    <SkillImproveDialog
      v-model="improveDialogOpen"
      :original="improveOriginal"
      :result="improveResult"
      :loading="isImproving"
      :error="improveError"
      @apply="applyImprove"
    />

  </div>
</template>

<style scoped>
/* 편집 패널 */
.editor-panel { padding: 24px 28px; }
.editor-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 14px; padding: 20px 22px; margin-bottom: 18px; }
.bg-page-dim { background: rgba(0,0,0,0.015); border: 1px dashed var(--border-light); }
.section-title { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
.count-badge { font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; background: rgba(140,98,57,0.1); color: var(--accent); font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; }

/* 필드 */
.field-label { display: block; font-size: 0.62rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
.pf :deep(.v-field) { border-radius: 10px !important; border: 1px solid var(--border-light) !important; background: var(--bg-page) !important; transition: all 0.25s ease; }
.pf :deep(.v-field--focused) { border-color: var(--accent) !important; background: #fff !important; box-shadow: 0 0 0 3px rgba(140,98,57,0.1) !important; }

/* 저장 버튼 */
.btn-save { border-radius: 8px !important; font-weight: 800; font-size: 0.82rem; padding: 0 20px; box-shadow: 0 4px 14px rgba(140,98,57,0.2) !important; }

/* 지시사항 */
.inst-num {
  width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
  background: rgba(140,98,57,0.1); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem; font-weight: 800; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  margin-top: 6px;
}
.inst-del { opacity: 0; transition: opacity 0.2s; flex-shrink: 0; }
.editor-section:hover .inst-del { opacity: 0.4; }
.inst-row { min-width: 0; }
.inst-textarea { min-width: 0; }
.inst-textarea :deep(.v-input) { min-width: 0; }

/* 스크롤 */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(140,98,57,0.2); border-radius: 10px; }
.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(140,98,57,0.4); }

/* ── 헤더 레이아웃 ───────────────────────────────────── */
.panel-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title-area {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.skill-name-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text-main);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.skill-id-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 12px;
}

/* ── ID 필드 + 중복체크 ──────────────────────────────── */
.id-check-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.id-field { flex: 1; }

/* ── 품질 분석 패널 ──────────────────────────────────────── */
.quality-panel {
  border-radius: 12px;
  border: 1px solid;
  margin-bottom: 18px;
  overflow: hidden;
  font-family: 'Pretendard', sans-serif;
}
.quality-panel--good { border-color: #86efac; background: #f0fdf4; }
.quality-panel--ok   { border-color: #fde68a; background: #fffbeb; }
.quality-panel--poor { border-color: #fca5a5; background: #fef2f2; }

.quality-header {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: transparent; border: none; cursor: pointer;
  text-align: left; font-family: inherit;
}
.quality-header:hover { filter: brightness(0.97); }
.quality-header-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.quality-level-icon { font-size: 1rem; flex-shrink: 0; line-height: 1; }
.quality-header-info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.quality-title { font-size: 0.78rem; font-weight: 700; color: var(--text-main); }

.quality-score-row { display: flex; align-items: center; gap: 6px; }
.quality-score-bar-wrap { width: 90px; height: 4px; background: rgba(0,0,0,0.08); border-radius: 9999px; overflow: hidden; }
.quality-score-bar-fill { height: 100%; border-radius: 9999px; transition: width 0.4s ease; }
.quality-score-bar-fill--good { background: #22c55e; }
.quality-score-bar-fill--ok   { background: #f59e0b; }
.quality-score-bar-fill--poor { background: #ef4444; }
.quality-score-num { font-size: 0.67rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }

.quality-counts { display: flex; gap: 5px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.quality-count { font-size: 0.65rem; font-weight: 600; padding: 2px 7px; border-radius: 9999px; }
.quality-count--error   { background: #fee2e2; color: #dc2626; }
.quality-count--warning { background: #fef3c7; color: #d97706; }
.quality-count--info    { background: #dbeafe; color: #2563eb; }

.quality-chevron { color: var(--text-muted); transition: transform 0.2s; flex-shrink: 0; font-size: 1rem; }
.quality-chevron--open { transform: rotate(180deg); display: inline-block; }

.quality-good-msg { font-size: 0.75rem; color: #166534; line-height: 1.6; padding: 0 14px 12px; }

.quality-list { list-style: none; margin: 0; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.quality-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border-radius: 8px; }
.quality-item-icon { font-size: 0.85rem; flex-shrink: 0; margin-top: 1px; line-height: 1; }
.quality-item-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.quality-item-msg { font-size: 0.75rem; font-weight: 600; line-height: 1.4; }
.quality-item-hint { font-size: 0.68rem; opacity: 0.72; font-style: italic; line-height: 1.4; }
.quality-item--error   { background: rgba(220,38,38,0.07);  color: #991b1b; }
.quality-item--warning { background: rgba(217,119,6,0.07);  color: #92400e; }
.quality-item--info    { background: rgba(59,130,246,0.07); color: #1d4ed8; }

/* AI 다듬기 버튼 */
.quality-improve-row { display: flex; justify-content: flex-end; padding: 2px 12px 12px; }
.quality-improve-btn { font-size: 0.72rem !important; letter-spacing: 0; }

/* ── 모바일 개선 ──────────────────────────────────────────── */
@media (max-width: 600px) {
  /* 패딩 축소 — 360px 화면에서 콘텐츠 영역 확보 */
  .editor-panel { padding: 16px 12px; }
  .editor-section { padding: 14px 14px; margin-bottom: 12px; }

  /* 헤더 세로 배치 */
  .panel-header-row { flex-direction: column; align-items: stretch; gap: 8px; }
  .panel-title-area { overflow: visible; }
  .skill-name-title { white-space: normal; font-size: 1.1rem; }
  .skill-id-text { font-size: 0.68rem; }
  .panel-actions { margin-left: 0; justify-content: flex-end; }

  /* ID 필드 + 중복체크 세로 쌓기 — 단어 잘림 방지 */
  .id-check-row { flex-direction: column; align-items: stretch; }
  .id-check-row :deep(.v-btn) { width: 100% !important; margin-top: 4px; }

  /* 지시사항 삭제 버튼 — hover 없는 모바일에서 항상 보이게 (터치 가능하게) */
  .inst-del { opacity: 0.45 !important; }

  /* 섹션 타이틀 줄바꾸 허용 */
  .section-title { flex-wrap: wrap; letter-spacing: 0.02em; }

  /* Neo4j 설명 텍스트 투명 — 모바일에서 공간 낙비 */
  .neo4j-desc { display: none; }

  /* 품질 패널 병목 마진 */
  .quality-panel { margin-bottom: 12px; }
}
</style>
