<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PlusCircle, GitBranch, Loader, Sparkles, FolderOpen } from 'lucide-vue-next'
import { useConfirm } from '@/composables/useConfirm'
import { useSnackbar } from '@/composables/useSnackbar'
import { useSkillLibraryStore } from '@/store/skillLibrary'
import { useSkillRegistry } from '@/composables/useSkillRegistry'
import { useProjectStack } from '@/composables/useProjectStack'

// Skill Library 통합 — 모달 + 다이얼로그 4종 (lazy import 아닌 모듈 로딩 시점).
import SkillLibraryModal from '@/components/rule/SkillLibraryModal.vue'
import FolderEditDialog from '@/components/rule/FolderEditDialog.vue'
import FolderDeleteDialog from '@/components/rule/FolderDeleteDialog.vue'
import SkillEditDialog from '@/components/rule/SkillEditDialog.vue'
import ImportConflictDialog from '@/components/rule/ImportConflictDialog.vue'

// 추출 컴포넌트 — 좌측 스킬 목록 패널 (검색 + 다중선택 + 일괄 삭제)
import SkillListPanel from '@/components/plan/rule/SkillListPanel.vue'
// 추출 컴포넌트 — AI 자동 추천 다이얼로그 (2단계 UI)
import AiRecommendationDialog from '@/components/plan/rule/AiRecommendationDialog.vue'
// 추출 컴포넌트 — 우측 편집 패널 (기본정보 / 지시사항 / 태그 / 적용서비스)
import SkillEditorPanel from '@/components/plan/rule/SkillEditorPanel.vue'

const { t } = useI18n()
const confirm = useConfirm()
const { showSuccess, showError, showInfo } = useSnackbar()
const skillLibraryStore = useSkillLibraryStore()

// -----------------------------------------------------------------
// Props
// -----------------------------------------------------------------
const props = defineProps({
  projectName: { type: String, default: '' },
})

// -----------------------------------------------------------------
// 스킬 레지스트리 데이터 + CRUD / 기본스킬 동기화 / AI 추천 로직
// -----------------------------------------------------------------
// 상태 + API 오케스트레이션은 useSkillRegistry 컴포저블로 분리 (2026-05-27).
// 이 컴포넌트는 Skill Library 다이얼로그 wiring + 템플릿만 담당.
const {
  PRIORITIES, CATEGORY_MAP, priorityColor,
  STACK_ONLY_CATEGORIES, STACK_LABELS,
  skills, selectedId,
  isLoading, isSaving, isDeleting, isCheckingId, successMsg, errorMsg,
  isSelectMode, selectedSkillIds, isDeletingBulk,
  aiDialog, aiCategories, aiAutoStackCategories, isAiRecommending, isAiRegistering, aiRecommendations,
  aiSelectedIds, aiError, aiExcludedCount, aiSourceMode, aiSelectedLibraryFolderIds,
  selectedSkill, aiLibraryFolders,
  fetchAllSkills, saveSkill, deleteSkill, checkDuplicateId,
  requestAiRecommendation, cancelAiRecommendation, registerSelectedAiSkills, switchAiToLibrary,
  openAiDialog, toggleAiSelection,
  toggleSelectMode, toggleSelectAll, deleteBulkSkills,
  selectSkill, addSkill, cancelSkill,
} = useSkillRegistry(() => props.projectName)

// [C1] STEP 1 — 코딩 규칙의 기준이 되는 프로젝트 스택(FE/BE/DB)을 architecture 에서 읽어옴.
const { techStack, hasArchitecture, fetchStack: fetchProjectStack } = useProjectStack()
watch(() => props.projectName, (n) => { if (n) fetchProjectStack(n) }, { immediate: true })

// -----------------------------------------------------------------
// Skill Library 통합 (2026-05)
// -----------------------------------------------------------------
// 모달 + 4 다이얼로그 mount 상태 + 부모 emit 핸들러.
// emit-callback 패턴 — SkillLibraryModal 의 8 emit 을 받아 적절한 다이얼로그 열기.

const showLibraryModal = ref(false)
const folderEditState = ref({ open: false, folder: null })
const folderDeleteState = ref({ open: false, folder: null })
const skillEditState = ref({ open: false, skill: null, folderId: '' })
const importConflictState = ref({
  open: false,
  librarySkillIds: [],
  conflictingIds: [],
})

const openLibrary = () => { showLibraryModal.value = true }

// ── 폴더 CRUD 핸들러 ────────────────────────────────────────
const onRequestFolderCreate = () => {
  folderEditState.value = { open: true, folder: null }
}
const onRequestFolderEdit = (folder) => {
  folderEditState.value = { open: true, folder }
}
const onRequestFolderDelete = (folder) => {
  folderDeleteState.value = { open: true, folder }
}
const onFolderSaved = () => {
  showSuccess(t('rule.tab.folder_saved'))
}
const onFolderDeleted = (result) => {
  if (result?.mode === 'cascade') {
    showSuccess(t('rule.tab.folder_deleted_cascade', { count: result.deleted_skill_count ?? 0 }))
  } else if (result?.mode === 'moved') {
    showSuccess(t('rule.tab.folder_deleted_moved', { count: result.moved_skill_count ?? 0 }))
  } else {
    showSuccess(t('rule.tab.folder_deleted'))
  }
}

// ── 스킬 CRUD 핸들러 ────────────────────────────────────────
const onRequestSkillCreate = ({ folderId }) => {
  skillEditState.value = { open: true, skill: null, folderId }
}
const onRequestSkillEdit = (skill) => {
  skillEditState.value = { open: true, skill, folderId: skill.folder_id }
}
const onRequestSkillDelete = async (skill) => {
  const ok = await confirm({
    title: t('rule.tab.skill_delete_title'),
    message: t('rule.tab.skill_delete_message', { name: skill.name }),
    confirmText: t('common.action.delete'),
    variant: 'danger',
  })
  if (!ok) return
  const r = await skillLibraryStore.deleteSkill(skill.id)
  if (r.success) showSuccess(t('rule.tab.skill_deleted'))
  else showError(r.error || t('rule.tab.skill_delete_failed'))
}
const onSkillSaved = () => {
  showSuccess(t('rule.tab.skill_saved'))
}

// ── Import (프로젝트 → 라이브러리) ──────────────────────────
const onRequestImportFromProject = async ({ folderId }) => {
  const pName = props.projectName || 'harness'
  if (!pName) {
    showError(t('rule.tab.import_select_project'))
    return
  }
  if (!skills.value || skills.value.length === 0) {
    showInfo(t('rule.tab.import_no_skills'))
    return
  }
  // 전체 스킬 일괄 import. 추후 다중선택 다이얼로그로 확장 가능.
  const skillIds = skills.value.map(s => s.id)
  const r = await skillLibraryStore.importFromProject({
    project_name: pName,
    skill_ids: skillIds,
    folder_id: folderId,
  })
  if (r.success) {
    showSuccess(t('rule.tab.import_done', { count: r.data?.imported?.length ?? 0 }))
  } else {
    showError(r.error || t('rule.tab.import_failed'))
  }
}

// ── Export (라이브러리 → 프로젝트) ──────────────────────────
const onRequestExportToProject = async ({ skillIds }) => {
  const pName = props.projectName || 'harness'
  if (!pName) {
    showError(t('rule.tab.export_select_project'))
    return
  }
  if (!skillIds || skillIds.length === 0) return

  // 1. 충돌 사전 검사
  const check = await skillLibraryStore.checkExportConflicts({
    project_name: pName,
    skill_ids: skillIds,
  })
  if (!check.success) {
    showError(check.error || t('rule.tab.export_conflict_check_failed'))
    return
  }

  // 2. 충돌 없으면 바로 skip 전략 (실제로 skip 할 게 없음)으로 export
  if (check.conflictingIds.length === 0) {
    const r = await skillLibraryStore.exportToProject({
      project_name: pName,
      library_skill_ids: skillIds,
      conflict_strategy: 'skip',
    })
    if (r.success) {
      showSuccess(t('rule.tab.export_done', { count: r.data?.imported_ids?.length ?? 0 }))
      await fetchAllSkills()  // 현재 프로젝트 스킬 리스트 갱신
    } else {
      showError(r.error || t('rule.tab.export_failed'))
    }
    return
  }

  // 3. 충돌 있으면 다이얼로그 — 사용자 정책 선택 후 export
  importConflictState.value = {
    open: true,
    librarySkillIds: skillIds,
    conflictingIds: check.conflictingIds,
  }
}
const onImportConflictDone = async (result) => {
  showSuccess(
    t('rule.tab.conflict_done', { imported: result?.imported_ids?.length ?? 0 }) +
    (result?.skipped_ids?.length ? t('rule.tab.conflict_skipped', { count: result.skipped_ids.length }) : '') +
    (result?.renamed?.length ? t('rule.tab.conflict_renamed', { count: result.renamed.length }) : ''),
  )
  await fetchAllSkills()  // 현재 프로젝트 스킬 리스트 갱신
}

</script>

<template>
  <div class="rg-root h-100 d-flex flex-column overflow-hidden">

    <!-- ── 헤더 ── -->
    <div class="rg-header d-flex align-center justify-space-between px-6 py-4">
      <div>
        <div class="d-flex align-center gap-2 mb-1">
          <GitBranch :size="20" class="text-accent" />
          <span class="rg-title">{{ $t('rule.tab.title') }}</span>
        </div>
        <p class="rg-desc">{{ $t('rule.tab.desc') }}</p>
      </div>
    </div>

    <!-- ── [C3] STEP 흐름: 스택(1) → AI 초안(2) → 직접 추가(3). 흩어진 헤더 버튼을 순서로 묶음.
         잘 작동하는 2패널(목록/편집) CRUD 는 아래에 그대로 보존. 버튼/핸들러/VMenu 는 재사용. ── -->
    <div class="rg-steps">
      <!-- STEP 1 · 기술 스택 (C1, architecture 에서) — 규칙의 기준 -->
      <div class="rg-step">
        <span class="rg-step-num">1</span>
        <div class="rg-step-main">
          <span class="rg-step-title">{{ $t('rule.stack.label') }}</span>
          <div class="rg-step-stack">
            <template v-if="techStack.length">
              <span v-for="t in techStack" :key="t" class="rg-stack-chip">{{ t }}</span>
            </template>
            <span v-else class="rg-stack-empty">{{ hasArchitecture ? $t('rule.stack.unset') : $t('rule.stack.no_design') }}</span>
          </div>
        </div>
      </div>

      <!-- STEP 2 · AI 에게 맡기기 -->
      <div class="rg-step">
        <span class="rg-step-num">2</span>
        <div class="rg-step-main">
          <span class="rg-step-title">{{ $t('rule.step.s2_title') }}</span>
          <span class="rg-step-desc">{{ $t('rule.step.s2_desc') }}</span>
        </div>
        <VBtn
          variant="flat" color="accent" height="36"
          class="rounded-pill px-4 font-bold text-sm rg-step-cta"
          elevation="0"
          @click="openAiDialog(techStack)"
          :title="$t('rule.tab.btn_ai_reco_title')"
        >
          <Sparkles :size="14" class="mr-2" />{{ $t('rule.tab.btn_ai_reco') }}
        </VBtn>
      </div>

      <!-- STEP 3 · 직접 만들기 (새 규칙 · 내 라이브러리) -->
      <div class="rg-step">
        <span class="rg-step-num">3</span>
        <div class="rg-step-main">
          <span class="rg-step-title">{{ $t('rule.step.s3_title') }}</span>
          <span class="rg-step-desc">{{ $t('rule.step.s3_desc') }}</span>
        </div>
        <div class="rg-step-actions">
          <VBtn
            variant="tonal" color="accent" height="36"
            class="rounded-pill px-4 font-bold text-sm"
            elevation="0"
            @click="addSkill"
            :title="$t('rule.tab.btn_new_skill_title')"
          >
            <PlusCircle :size="14" class="mr-2" />{{ $t('rule.tab.btn_new_skill') }}
          </VBtn>
          <VBtn
            variant="tonal" color="accent" height="36"
            class="rounded-pill px-4 font-bold text-sm"
            elevation="0"
            @click="openLibrary"
            :title="$t('rule.tab.btn_library_title')"
          >
            <FolderOpen :size="14" class="mr-2" />{{ $t('rule.tab.btn_library') }}
          </VBtn>
          <!-- [2026-06-13] '기본 규칙'(카테고리 일괄 추가) 제거 — AI 자동 추천이
               같은 카탈로그에서 PRD 기반으로 필요한 것만 골라주는 상위 호환이라 중복.
               CATEGORY_MAP 은 AI 추천의 카테고리 필터가 계속 사용. -->
        </div>
      </div>
    </div>

    <!-- 알림 -->
    <div v-if="successMsg" class="msg-bar success-bar">✓ {{ successMsg }}</div>
    <div v-if="errorMsg" class="msg-bar error-bar">✕ {{ errorMsg }}</div>

    <!-- 로딩 -->
    <div v-if="isLoading" class="flex-grow-1 d-flex flex-column align-center justify-center">
      <Loader :size="28" class="spinning mb-3" style="color: var(--accent);" />
      <p class="text-sm text-muted">{{ $t('common.label.loading') }}</p>
    </div>

    <!-- ── 2-패널 본문 ── -->
    <div v-else class="rg-body d-flex flex-grow-1 overflow-hidden">

      <!-- 좌측: 스킬 목록 (SkillListPanel 추출 컴포넌트) -->
      <SkillListPanel
        :skills="skills"
        :selected-id="selectedId"
        :is-select-mode="isSelectMode"
        :selected-skill-ids="selectedSkillIds"
        :priority-color="priorityColor"
        :is-deleting-bulk="isDeletingBulk"
        :is-loading="isLoading"
        @select="selectSkill"
        @toggle-select-mode="toggleSelectMode"
        @toggle-select-all="toggleSelectAll"
        @delete-bulk="deleteBulkSkills"
        @add-skill="addSkill"
      />

      <!-- 우측: 편집 패널 (SkillEditorPanel 추출 컴포넌트) -->
      <SkillEditorPanel
        v-if="selectedSkill"
        :skill="selectedSkill"
        :is-saving="isSaving"
        :is-deleting="isDeleting"
        :is-checking-id="isCheckingId"
        :priorities="PRIORITIES"
        :priority-color="priorityColor"
        @save="saveSkill"
        @delete="deleteSkill"
        @cancel="cancelSkill"
        @check-duplicate-id="checkDuplicateId"
      />

      <!-- 선택 없음 -->
      <div v-else class="flex-grow-1 d-flex flex-column align-center justify-center opacity-30">
        <GitBranch :size="44" class="mb-3" />
        <p class="font-bold">{{ $t('rule.tab.empty_select_skill') }}</p>
      </div>
    </div>

    <!-- ── AI 자동 추천 다이얼로그 (AiRecommendationDialog 추출 컴포넌트) ── -->
    <AiRecommendationDialog
      v-model="aiDialog"
      v-model:ai-source-mode="aiSourceMode"
      v-model:ai-categories="aiCategories"
      v-model:ai-selected-library-folder-ids="aiSelectedLibraryFolderIds"
      v-model:ai-selected-ids="aiSelectedIds"
      v-model:ai-recommendations="aiRecommendations"
      :ai-auto-stack-categories="aiAutoStackCategories"
      :ai-excluded-count="aiExcludedCount"
      :ai-error="aiError"
      :is-ai-recommending="isAiRecommending"
      :is-ai-registering="isAiRegistering"
      :category-map="CATEGORY_MAP"
      :stack-only-categories="STACK_ONLY_CATEGORIES"
      :stack-labels="STACK_LABELS"
      :library-folders="aiLibraryFolders"
      @recommend="requestAiRecommendation"
      @cancel-recommend="cancelAiRecommendation"
      @toggle-selection="toggleAiSelection"
      @register="registerSelectedAiSkills"
      @switch-to-library="switchAiToLibrary"
    />

    <!-- ───── Skill Library 모달 + 부속 다이얼로그 4종 (FE-4 통합) ───── -->
    <SkillLibraryModal
      v-model="showLibraryModal"
      :project-name="projectName"
      :current-project-skill-ids="skills.map(s => s.id)"
      @request-folder-create="onRequestFolderCreate"
      @request-folder-edit="onRequestFolderEdit"
      @request-folder-delete="onRequestFolderDelete"
      @request-skill-create="onRequestSkillCreate"
      @request-skill-edit="onRequestSkillEdit"
      @request-skill-delete="onRequestSkillDelete"
      @request-import-from-project="onRequestImportFromProject"
      @request-export-to-project="onRequestExportToProject"
    />
    <FolderEditDialog
      v-model="folderEditState.open"
      :folder="folderEditState.folder"
      @saved="onFolderSaved"
    />
    <FolderDeleteDialog
      v-model="folderDeleteState.open"
      :folder="folderDeleteState.folder"
      @deleted="onFolderDeleted"
    />
    <SkillEditDialog
      v-model="skillEditState.open"
      :skill="skillEditState.skill"
      :folder-id="skillEditState.folderId"
      @saved="onSkillSaved"
    />
    <ImportConflictDialog
      v-model="importConflictState.open"
      :library-skill-ids="importConflictState.librarySkillIds"
      :conflicting-ids="importConflictState.conflictingIds"
      :project-name="projectName"
      @done="onImportConflictDone"
    />
  </div>
</template>

<style scoped>
/* [FE-4c] 드래그 시각 효과 (parent 에 유지 — drag interaction 은 SkillLibraryModal 쪽) */
.rg-skill-row--dragging { opacity: 0.4; }

/* 레이아웃 */
.rg-root { background: var(--bg-page); }
.rg-header {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.rg-body { overflow: hidden; min-height: 0; }
/* flex 자식이 내부 overflow-y-auto 로 스크롤하려면 min-height:0 이 필수
   (기본 min-height:auto = 콘텐츠 높이라 줄어들지 못해 스크롤이 안 걸림) */
.rg-body > :deep(.skill-list),
.rg-body > :deep(.editor-panel) { min-height: 0; }

/* [2026-06-12] 데스크탑 내부 스크롤 복원 — 앱 셸의 % 높이 체인이 v-main(height:auto)
   에서 끊겨 스킬이 많아지면 rg-body 가 콘텐츠 높이만큼 늘어나 html 전체가 스크롤됐다.
   뷰포트 기반 상한을 걸어 좌측 목록(.skill-list-body)·우측 편집(.editor-panel)의
   overflow-y:auto 가 실제로 동작하도록 한다. 모바일(≤600px)은 페이지 스크롤 설계 유지. */
@media (min-width: 601px) {
  .rg-body {
    max-height: calc(100dvh - 120px);
    min-height: 380px;
  }
}

/* 헤더 */
.rg-title { font-size: 1rem; font-weight: 800; color: var(--text-main); }
.rg-desc  { font-size: 0.73rem; color: var(--text-muted); }
.rg-badge {
  font-size: 0.58rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 20px;
  background: rgba(140,98,57,0.1); color: var(--accent);
}
/* 버튼 */
.btn-icon { color: var(--text-muted) !important; }
.btn-icon:hover { color: var(--accent) !important; background: rgba(140,98,57,0.08) !important; }

/* [C3] 모바일 — 헤더는 title 만 남음(액션바 제거). 본문 세로 스택.
   [2026-06-13] 스킬이 많을 때 페이지 전체가 늘어나 스크롤이 불편하던 문제 수정:
   rg-body 를 페이지 스크롤(overflow:auto)에서 내부 스크롤로 바꾸고, 좌/우 패널을
   각각 vh 로 가둬 카드 안에서만 스크롤되게 한다(목록·편집 독립 스크롤). vh 기반이라
   상위 높이 체인(h-100)이 모바일에서 안 잡혀도 동작. */
@media (max-width: 600px) {
  .rg-header { padding-left: 10px !important; padding-right: 10px !important; }
  .rg-body {
    flex-direction: column !important;
    overflow-y: auto !important;   /* 두 카드 사이는 페이지가 스크롤 (패널 잘림 방지) */
    gap: 10px;
  }
  /* 좌측 목록: 상단 절반에 가두고 내부(skill-list-body)에서 스크롤 */
  .rg-body > :deep(.skill-list) {
    width: 100% !important;
    flex: none !important;
    max-height: 50dvh;
    border-right: none;
    border-bottom: 1px solid var(--border-light);
  }
  /* 우측 편집: 카드 안에서 스크롤 (내부 overflow-y-auto 가 동작하도록 캡) */
  .rg-body > :deep(.editor-panel) {
    flex: none !important;
    max-height: 75dvh;
  }
  /* 우측 빈 상태 (스킬 미선택) — 모바일에선 작은 hint 만 */
  .rg-body > div:last-child {
    width: 100% !important;
    min-height: 160px;
  }
}

/* 알림 */
.msg-bar { text-align: center; font-size: 0.8rem; font-weight: 700; padding: 8px 20px; flex-shrink: 0; }
.success-bar { background: rgba(34,197,94,0.12); color: #16a34a; }
.error-bar   { background: rgba(239,68,68,0.12);  color: #dc2626; }

/* 로딩 — .spinning 회전은 전역(App.vue)으로 통합됨 */

/* 카테고리 메뉴 */

/* [C3] STEP 흐름 (1 스택 / 2 AI / 3 직접) — 헤더의 흩어진 버튼을 순서로 묶음 */
.rg-steps {
  display: flex; flex-direction: column;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.rg-step {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 24px;
}
.rg-step + .rg-step { border-top: 1px solid rgba(0,0,0,0.04); }
.rg-step-num {
  flex-shrink: 0;
  width: 22px; height: 22px; border-radius: 9999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent); color: #fff;
  font-size: 0.72rem; font-weight: 800;
}
.rg-step-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rg-step-title { font-size: 0.78rem; font-weight: 800; color: var(--text-main); }
.rg-step-desc { font-size: 0.68rem; color: var(--text-muted); line-height: 1.4; }
.rg-step-stack { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rg-step-cta { flex-shrink: 0; }
.rg-step-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; flex-shrink: 0; }

/* STEP 1 스택 칩 (C1 — STEP 흐름 안에서 계속 사용) */
.rg-stack-chip {
  font-size: 0.7rem; font-weight: 700;
  padding: 2px 10px; border-radius: 9999px;
  background: rgba(140,98,57,0.1); color: var(--accent);
}
.rg-stack-empty { font-size: 0.7rem; color: var(--text-dim, #a89b91); font-style: italic; }

@media (max-width: 600px) {
  .rg-step { flex-wrap: wrap; padding: 10px; gap: 8px 10px; }
  .rg-step-actions { width: 100%; justify-content: flex-start; }
  .rg-step-cta { width: 100%; }
}

</style>
