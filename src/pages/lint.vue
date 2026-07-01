<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { HelpCircle } from 'lucide-vue-next'
import { useHarnessStore } from '@/store/harness'
import { useLibraryStore } from '@/store/library'
import { normalizeLintResponse } from '@/utils/harnessHelpers'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import { useFixAgent } from '@/composables/useFixAgent'
import LintRunPanel from '@/components/lint/LintRunPanel.vue'
import LintStatsCards from '@/components/lint/LintStatsCards.vue'
import LintCategoryCards from '@/components/lint/LintCategoryCards.vue'
import LintComplianceTable from '@/components/lint/LintComplianceTable.vue'
import LintActionBar from '@/components/lint/LintActionBar.vue'
import LintEmptyState from '@/components/lint/LintEmptyState.vue'
import LintGuideModal from '@/components/lint/LintGuideModal.vue'
import ProjectNotReadyCard from '@/components/common/ProjectNotReadyCard.vue'
import PlanCoverageBoard from '@/components/lint/PlanCoverageBoard.vue'
import { useProjectReadiness } from '@/composables/useProjectReadiness'
import { isGuideSeen } from '@/utils/guideSeen'

const { t } = useI18n()
const { showErrorWithRetry, showSuccess, showError } = useSnackbar()
const confirm = useConfirm()
const router = useRouter()
const store = useHarnessStore()
const libraryStore = useLibraryStore()

const goToCode = () => router.push('/code')

// [2026-06-12] MY LIBRARY 에서 저장된 깃 주소 삭제 — 확인 후 store.removeRepo.
// 저장소/분석 결과가 아니라 '내 라이브러리 등록'만 지운다(메시지로 안내).
const removeLibraryRepo = async (repo) => {
  const label = repo.label || repo.url.split('/').slice(-2).join(' / ')
  const ok = await confirm({
    title: t('common.library.remove_confirm_title'),
    message: t('common.library.remove_confirm_message', { label }),
    confirmText: t('common.action.delete'),
    variant: 'danger',
  })
  if (!ok) return
  const res = await libraryStore.removeRepo(repo.url)
  if (res?.success) showSuccess(t('common.library.removed'))
  else showError(res?.error || t('common.library.remove_failed'))
}

const githubUrl = computed(() => store.githubUrl || '')
const cases = ref([])
const stats = ref({ score: 0, scannedFiles: 0, rulesChecked: 0, violations: 0 })
const lintError = ref('')
const lintErrorInfo = ref(null)
const hasResult = ref(false)
const isFromCache = ref(false)
const cachedSavedAt = ref(null)

const isLinting = computed(() => store.isLinting)
const ruleItems = computed(() => cases.value[store.selectedBenchmarkIndex]?.rules || [])
// 기획 항목 카테고리 = lint cases 의 5번째(BE evaluator 가 항상 index 4 로 조립).
// legacy 4-case 캐시 응답엔 없을 수 있으므로 안전하게 폴백(null → 보드 숨김).
const planCase = computed(() => cases.value.find(c => c.id === 4) || null)
const passCount = computed(() => ruleItems.value.filter(r => r.applied).length)
const failCount = computed(() => ruleItems.value.filter(r => !r.applied).length)
const currentCaseStats = computed(() => {
  const rules = ruleItems.value
  let det = 0, llm = 0, fb = 0
  for (const r of rules) {
    if (!r.applied) { fb++; continue }
    if (r.detectionMethod === 'llm') llm++
    else det++
  }
  return { det, llm, fb, total: rules.length }
})

const cacheAgeText = computed(() => {
  if (!cachedSavedAt.value) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - cachedSavedAt.value) / 1000))
  if (diffSec < 60) return t('lint.cache_age.just_now')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return t('lint.cache_age.minutes_ago', { n: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('lint.cache_age.hours_ago', { n: diffHour })
  return t('lint.cache_age.days_ago', { n: Math.floor(diffHour / 24) })
})

const applyLintData = (raw, savedAt = null, fromCache = false) => {
  const result = normalizeLintResponse(raw)
  if (!result.ok) {
    lintErrorInfo.value = { message: result.message, githubUrl: githubUrl.value }
    hasResult.value = false
    isFromCache.value = false
    cachedSavedAt.value = null
    return
  }
  lintErrorInfo.value = null
  stats.value = result.stats
  cases.value = result.cases
  store.setSelectedBenchmark(0)
  hasResult.value = true
  isFromCache.value = fromCache
  cachedSavedAt.value = savedAt
}

const runLint = async (force = false) => {
  lintError.value = ''
  lintErrorInfo.value = null
  if (!githubUrl.value || !githubUrl.value.trim()) {
    lintError.value = t('lint.error.github_url_required')
    return
  }
  if (!store.projectName) {
    lintError.value = t('lint.error.project_name_required')
    return
  }
  if (force) hasResult.value = false
  store.autoRegisterRepo({ projectName: store.projectName, url: githubUrl.value.trim() })
  const result = await store.runLint({
    projectName: store.projectName,
    githubUrl: githubUrl.value.trim(),
    force,
  })
  if (!result.success) {
    // 사용자가 다른 페이지로 이동해 abort 된 경우는 silently 무시.
    // (현재는 onBeforeUnmount 에서 cancel 안 하지만, 동시 runLint 호출 시
    //  이전 in-flight 가 abort 되는 케이스가 store.runLint 안에 남아있음.)
    if (result.cancelled) return
    lintError.value = result.error || t('lint.error.run_failed')
    showErrorWithRetry(t('lint.error.run_failed_toast', { error: lintError.value }), () => runLint(true))
    return
  }
  applyLintData(result.data, result.savedAt, !!result.fromCache)
}

const restoreLastResult = async () => {
  if (!store.projectName || !githubUrl.value?.trim()) return false
  const cached = store.getCachedLint(store.projectName, githubUrl.value.trim())
  if (cached) { applyLintData(cached.data, cached.savedAt, true); return true }
  const fetched = await store.fetchLastLintResult({
    projectName: store.projectName,
    githubUrl: githubUrl.value.trim(),
  })
  if (fetched.success && fetched.found) { applyLintData(fetched.data, fetched.savedAt, true); return true }
  return false
}

// 사용 가이드 — Plan / Design 페이지와 동일 패턴. 계정당 최초 1회 자동 표시.
const LINT_GUIDE_SEEN_KEY = 'gayoje_lint_guide_seen_v1'
const showGuide = ref(false)
const openGuide = () => { showGuide.value = true }

// 프로젝트 진입 가드 — 미팅 로그/CPS/PRD 없으면 ProjectNotReadyCard 노출.
const readiness = useProjectReadiness()

onMounted(() => {
  restoreLastResult()
  libraryStore.fetchLibrary()
  if (!isGuideSeen(LINT_GUIDE_SEEN_KEY)) showGuide.value = true
  readiness.check()
})
watch(() => store.projectName, () => readiness.check(true))

// [백그라운드 lint — 2026-05-18]
// 이전엔 onBeforeUnmount 에서 store.cancelLint() 호출 → 다른 페이지 이동 시
// axios abort → "cancelled by user" 토스트 + 결과 사라짐 버그.
// 이제는 unmount 시 cancel 안 함 → lint 가 백그라운드에서 계속 진행되고 store
// 가 결과를 캐시. 사용자가 lint 페이지로 돌아오면 isLinting watcher 가
// 완료 감지해 자동으로 결과 fetch.
watch(() => store.isLinting, async (isNow, was) => {
  // true → false 전환 = 백그라운드 lint 완료. 캐시에서 결과 회수.
  if (was === true && isNow === false) {
    await restoreLastResult()
  }
})

const selectCase = (idx) => store.setSelectedBenchmark(idx)

const { fixSpecLoading, fixSpecMessage, fixSpecError, executeFixAgent } = useFixAgent({
  store,
  githubUrlRef: githubUrl,
  getLintResult: () => {
    if (!hasResult.value) return null
    return {
      score: stats.value.score,
      scannedFiles: stats.value.scannedFiles,
      rulesChecked: stats.value.rulesChecked,
      violations: stats.value.violations,
      cases: cases.value.map(c => ({
        title: c.title,
        convergence: c.convergence,
        rules: c.rules.map(r => ({ rule: r.rule, description: r.description, applied: r.applied })),
      })),
    }
  },
})

const showEmptyState = computed(() => !hasResult.value || (!!lintErrorInfo.value && !isLinting.value))
const emptyStateType = computed(() => {
  if (lintErrorInfo.value && !isLinting.value) return 'error'
  if (isLinting.value) return 'loading'
  return 'empty'
})
</script>

<template>
  <div class="d-flex flex-column fill-height w-100 pt-0 page-root lint-root">
    <div class="pa-0 flex-shrink-0 mb-0 px-0 mt-6 w-100">
      <div class="pa-0 pb-2">
        <div class="mb-4 lint-headline-row">
          <div class="lint-headline-text">
            <h2 class="text-h4 font-weight-black text-main tracking-tight serif-text">{{ $t('lint.title') }}</h2>
            <p class="text-caption text-muted mt-2 font-weight-medium">{{ $t('lint.page.subtitle') }} <span class="text-muted">{{ $t('lint.page.subtitle_note') }}</span></p>
          </div>
          <button
            type="button"
            class="lint-guide-btn"
            @click="openGuide"
            :title="$t('lint.page.guide_btn_title')"
          >
            <HelpCircle :size="14" />
            <span>{{ $t('lint.page.guide_btn') }}</span>
          </button>
        </div>
      </div>
      <div class="lint-tab-row">
        <div class="d-flex align-center py-2">
          <VIcon icon="mdi-shield-check-outline" class="mr-2 text-accent" size="small" />
          <span class="text-overline font-weight-bold tracking-widest text-muted mono-text">{{ $t('lint.page.rule_compliance') }}</span>
        </div>
      </div>
    </div>

    <!-- [2026-05-18] 프로젝트 진입 가드 — 미팅 로그/CPS/PRD 없으면 본문 차단 -->
    <ProjectNotReadyCard
      v-if="store.projectName && !readiness.isReady.value"
      :has-meeting-logs="readiness.hasMeetingLogs.value"
      :has-cps="readiness.hasCps.value"
      :has-prd="readiness.hasPrd.value"
      feature="Lint"
      @refresh="readiness.check(true)"
    />

    <div v-else class="flex-grow-1 overflow-y-auto custom-scroll w-100 pb-8 mt-4">
      <LintRunPanel
        :github-url="githubUrl"
        :is-linting="isLinting"
        :has-result="hasResult"
        :lint-error="lintError"
        :library-repos="libraryStore.repos"
        :library-is-empty="libraryStore.isEmpty"
        @run="runLint"
        @goto-code="goToCode"
        @apply-preset="(url) => store.setGithubUrl(url)"
        @remove-library="removeLibraryRepo"
      />

      <LintEmptyState
        v-if="showEmptyState"
        :type="emptyStateType"
        :error-info="lintErrorInfo"
        :is-linting="isLinting"
        @retry="runLint(true)"
      />

      <template v-if="hasResult">
        <LintStatsCards
          :stats="stats"
          :is-from-cache="isFromCache"
          :cache-age-text="cacheAgeText"
          :is-linting="isLinting"
          @rerun="runLint(true)"
        />
        <LintCategoryCards
          :cases="cases"
          :selected-index="store.selectedBenchmarkIndex"
          @select="selectCase"
        />
        <LintComplianceTable
          :rule-items="ruleItems"
          :pass-count="passCount"
          :fail-count="failCount"
          :current-case-stats="currentCaseStats"
          :github-url="githubUrl"
          :case-key="String(store.selectedBenchmarkIndex)"
        />
        <LintActionBar
          :fix-spec-loading="fixSpecLoading"
          :fix-spec-message="fixSpecMessage"
          :fix-spec-error="fixSpecError"
          :fail-count="failCount"
          @execute="executeFixAgent"
        />
        <PlanCoverageBoard v-if="planCase" :plan-case="planCase" :github-url="githubUrl" />
      </template>
    </div>

    <!-- Lint 사용 가이드 모달 -->
    <LintGuideModal v-model="showGuide" />
  </div>
</template>

<style scoped>
.lint-root { background: var(--bg-page); }
.lint-tab-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px; }

/* 헤드라인 행 — 제목 좌측 + 가이드 버튼 우측. Plan / Design 페이지와 동일 톤. */
.lint-headline-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.lint-headline-text { min-width: 0; flex: 1; }
.lint-guide-btn {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 7px 14px; border-radius: 9999px; border: 1px solid var(--border-light);
  background: white; color: var(--text-main);
  font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.lint-guide-btn:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
@media (max-width: 600px) {
  .lint-headline-row { flex-wrap: wrap; }
  .lint-guide-btn { font-size: 0.6rem; padding: 6px 11px; }
}
.mono-text { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }
.custom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
@media (max-width: 900px) { .lint-tab-row { flex-wrap: wrap; row-gap: 8px; } }
</style>
