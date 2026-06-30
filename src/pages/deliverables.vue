<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Package, Github, Download, Plus, Trash2, ExternalLink, Share2,
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, Edit3,
  X, Star, GitFork, Calendar, FileCode, Users, BookOpen, Activity,
  HelpCircle,
} from 'lucide-vue-next'
import { md } from '@/utils/markdown'
import axios from '@/utils/axios'
import { isGuideSeen } from '@/utils/guideSeen'
import { useHarnessStore, API_BASE } from '@/store/harness'
import LineageTruthDialog from '@/components/quality/LineageTruthDialog.vue'
import TruthImportExportDialog from '@/components/quality/TruthImportExportDialog.vue'
import CoverageBadgeDialog from '@/components/quality/CoverageBadgeDialog.vue'
import LineageDiffDialog from '@/components/quality/LineageDiffDialog.vue'
import LineageGraphDialog from '@/components/quality/LineageGraphDialog.vue'
import RepoFormModal from '@/components/deliverables/RepoFormModal.vue'
import HandoffSection from '@/components/deliverables/HandoffSection.vue'
import RepoDrawer from '@/components/deliverables/RepoDrawer.vue'
import RepoGrid from '@/components/deliverables/RepoGrid.vue'
import LineageSection from '@/components/deliverables/LineageSection.vue'
import DeliverablesGuideModal from '@/components/deliverables/DeliverablesGuideModal.vue'
import ReadinessChecklist from '@/components/deliverables/ReadinessChecklist.vue'
import LanguageStackCard from '@/components/deliverables/LanguageStackCard.vue'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import ProjectNotReadyCard from '@/components/common/ProjectNotReadyCard.vue'
import NotionExportDialog from '@/components/plan/NotionExportDialog.vue'
import { useNotionExport } from '@/composables/useNotionExport'
import { useProjectStore } from '@/store/project'
import { useProjectReadiness } from '@/composables/useProjectReadiness'
import { normalizeLanguages, buildCommitHeatmap, formatRelativeKr, formatBytes } from '@/utils/github'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import { useProjectRepos, ROLES, roleColor, roleLabel } from '@/composables/useProjectRepos'
import { useRepoEnrichment } from '@/composables/useRepoEnrichment'
import { useLineageQuality, TAB_TO_ITEM_TYPE } from '@/composables/useLineageQuality'
import { useLineageAnalysis, confidenceColor, confidenceLabel } from '@/composables/useLineageAnalysis'
import { useRepoLintScores } from '@/composables/useRepoLintScores'
import { langColor } from '@/utils/langColor'
import { formatNum, formatDateKr } from '@/utils/format'

const { t } = useI18n()
const { showErrorWithRetry } = useSnackbar()
const confirm = useConfirm()

const store = useHarnessStore()
const projectStore = useProjectStore()
const { dialogOpen: notionOpen, docs: notionDocs, open: openNotionExport } = useNotionExport()

// ─── State (composables) ───────────────────────────────────────
const {
  repos, isLoading, errorMsg,
  loadRepos, addRepo, deleteRepo,
  reposByRole, repoRoleByUrl,
} = useProjectRepos()

const {
  repoMetaByUrl, repoMetaLoading,
  loadRepoMeta, refreshRepoMeta, refreshAllMeta,
  topLanguagesFor, lastCommitFor, fileCountFor, locFor, commitCountFor,
} = useRepoEnrichment(repos)

// ─── Modals ────────────────────────────────────────────────────
const modalOpen = ref(false)
const modalMode = ref('add')
const modalForm = ref({ url: '', role: 'other', label: '' })

const openAddModal = () => {
  modalMode.value = 'add'
  modalForm.value = { url: '', role: 'other', label: '' }
  modalOpen.value = true
}
const openEditModal = (repo) => {
  modalMode.value = 'edit'
  modalForm.value = { url: repo.url, role: repo.role, label: repo.label || '' }
  modalOpen.value = true
}
const submitModal = async () => {
  const f = modalForm.value
  if (!f.url) return
  const result = await addRepo({ url: f.url, role: f.role, label: f.label })
  if (!result.success) return
  modalOpen.value = false
}
const handleDeleteRepo = async (repo) => {
  const ok = await confirm({
    title: t('deliverables.confirm_delete.title'),
    message: t('deliverables.confirm_delete.message', { url: repo.url }),
    confirmText: t('deliverables.confirm_delete.confirm_text'),
    variant: 'danger',
  })
  if (ok) await deleteRepo(repo.url)
}

// ─── Detail Drawer ─────────────────────────────────────────────
const drawerOpen = ref(false)
const drawerRepo = ref(null)
const drawerTab = ref('overview') // 'overview' | 'readme' | 'activity' | 'team'

const openDrawer = (repo) => {
  drawerRepo.value = repo
  drawerTab.value = 'overview'
  drawerOpen.value = true
  // 메타 안 가져왔으면 로드
  if (!repoMetaByUrl.value[repo.url]) loadRepoMeta(repo.url)
}
const closeDrawer = () => { drawerOpen.value = false; setTimeout(() => { drawerRepo.value = null }, 200) }

// ─── Per-repo lint score + KPI (composable) ────────────────────
// 도메인 로직 분리: lintByUrl / loadLintForRepo / kpi computed 는 모두
// `useRepoLintScores` 안에서 자족 — 페이지는 결과만 소비.
const { lintByUrl, loadLintForRepo, kpi } = useRepoLintScores(
  repos,
  repoMetaByUrl,
  store,
)

// 페이지 안 view 에서 쓰는 포맷 별칭 — utils/format.js 의 공용 함수.
const formatDate = formatDateKr

// ─── Drawer computed ───────────────────────────────────────────
const drawerData = computed(() => {
  if (!drawerRepo.value) return null
  return repoMetaByUrl.value[drawerRepo.value.url] || null
})

const openRepo = (url) => window.open(url, '_blank', 'noopener')

// 전체 새로고침: repos + 모든 repo의 meta
const refreshAll = async () => {
  await loadRepos(true)
  await refreshAllMeta()
}

// ─── Lineage Analysis (composable) ─────────────────────────────
const {
  lineageData, lineageSavedAt, lineageMsg, expandedItems,
  lineageActiveTab, matrixFilter, lineageElapsedSec,
  isAnalyzingLineage,
  lineageTabCounts, lineageItems, lineageHasZeroMatch,
  matrixRows, filteredMatrix, matrixCoveragePct,
  loadLineageFromCache, triggerAnalyzeLineage, toggleExpand,
  openFile: openFileBase,
} = useLineageAnalysis()

// repo meta에서 branch를 알아내야 정확한 GitHub URL 생성 가능
const openFile = (repoUrl, filePath, options = {}) => {
  const meta = repoMetaByUrl.value[repoUrl]
  return openFileBase(repoUrl, filePath, { ...options, branch: meta?.branch })
}

// Lineage 품질 측정 + 라벨링
const {
  truthByType,
  truthDialogOpen, truthDialogItem, truthDialogType,
  openTruthDialog, onTruthSaved, hasTruth,
  lineageQualityCurrent, formatPct, loadAllTruth,
} = useLineageQuality(lineageData, lineageActiveTab)

// CSV/JSON 임포트/익스포트
const truthIoOpen = ref(false)
const onTruthImported = async () => {
  await loadAllTruth() // 캐시 갱신
}

// 분석 이력 Diff
const diffDialogOpen = ref(false)

// Lineage 그래프
const graphDialogOpen = ref(false)

// Coverage 뱃지
const badgeDialogOpen = ref(false)
const badgeMetrics = computed(() => {
  // matrixCoveragePct는 useLineageAnalysis 모듈 state에서 가져옴 (LineageSection이 마운트 안 됐어도 같은 인스턴스)
  // P/R/F1은 lineageQualityCurrent.macro에서
  const q = lineageQualityCurrent.value
  return {
    lineageCoverage: lineageData.value ? matrixCoveragePct.value : null,
    precision: q?.macro?.precision != null ? Math.round(q.macro.precision * 100) : null,
    recall: q?.macro?.recall != null ? Math.round(q.macro.recall * 100) : null,
    f1: q?.macro?.f1 != null ? Math.round(q.macro.f1 * 100) : null,
    lintAvg: kpi.value.lintAvg,
  }
})

// 사용 가이드 — Plan / Design / Lint 페이지와 동일 패턴. 계정당 최초 1회 자동 표시.
const DELIVERABLES_GUIDE_SEEN_KEY = 'harness_deliverables_guide_seen_v1'
const showGuide = ref(false)
const openGuide = () => { showGuide.value = true }

// 프로젝트 진입 가드 — 미팅 로그/CPS/PRD 없으면 ProjectNotReadyCard 노출.
// (이전에 신규 프로젝트에서 GitHub repo 조회 등 403 raw 에러가 그대로 노출되던 문제 해소.)
const readiness = useProjectReadiness()

// 마운트 시 Lineage 캐시 로드 + 첫 방문 가이드(계정당 1회) + 진입 가드 체크
onMounted(() => {
  loadLineageFromCache()
  if (!isGuideSeen(DELIVERABLES_GUIDE_SEEN_KEY)) showGuide.value = true
  readiness.check()
})
watch(() => store.projectName, () => {
  loadLineageFromCache()
  readiness.check(true)
})

// 페이지 이탈 시 진행 중인 lineage 분석을 AbortController 로 취소한다.
// (store.cancelAnalyzeLineage 가 in-flight 요청을 abort.)
onBeforeUnmount(() => {
  store.cancelAnalyzeLineage()
})
</script>

<template>
  <div class="d-flex flex-column fill-height w-100 pt-0 page-root deliverables-root">
    <!-- Header -->
    <div class="pa-0 flex-shrink-0 mb-0 px-0 mt-6 w-100">
      <div class="pa-0 pb-2">
        <div class="mb-4 deliverables-headline-row">
          <div class="deliverables-headline-text">
            <h2 class="text-h4 font-weight-black text-main tracking-tight serif-text">{{ $t('deliverables.page.title') }}</h2>
            <p class="text-caption text-muted mt-2 font-weight-medium">{{ $t('deliverables.page.subtitle') }}</p>
          </div>
          <button
            type="button"
            class="deliverables-guide-btn"
            @click="openGuide"
            :title="$t('deliverables.page.guide_btn_title')"
          >
            <HelpCircle :size="14" />
            <span>{{ $t('deliverables.page.guide_btn') }}</span>
          </button>
        </div>
      </div>
      <div class="deliverables-tab-row">
        <div class="d-flex align-center py-2">
          <Package :size="14" class="mr-2 text-accent" />
          <span class="text-overline font-weight-bold tracking-widest text-muted mono-text">{{ $t('deliverables.page.final_artifacts') }}</span>
        </div>
      </div>
    </div>

    <!-- [2026-05-18] 프로젝트 진입 가드 — 미팅 로그/CPS/PRD 없으면 본문 차단 -->
    <ProjectNotReadyCard
      v-if="store.projectName && !readiness.isReady.value"
      :has-meeting-logs="readiness.hasMeetingLogs.value"
      :has-cps="readiness.hasCps.value"
      :has-prd="readiness.hasPrd.value"
      feature="Deliverables"
      @refresh="readiness.check(true)"
    />

    <div v-else class="flex-grow-1 overflow-y-auto custom-scroll w-100 pb-8 mt-4">

      <!-- ===== Block 1: HERO ===== -->
      <section class="hero-block">
        <div class="hero-content">
          <span class="hero-pill mono-text">{{ $t('deliverables.hero.pill') }}</span>
          <h2 class="hero-title serif-text">{{ store.projectName || $t('deliverables.hero.no_project') }}</h2>
          <p class="hero-desc">
            {{ $t('deliverables.hero.stats', { repoCount: kpi.repoCount, files: formatNum(kpi.totalFiles), loc: formatNum(kpi.totalLoc) }) }}<br>
            {{ $t('deliverables.hero.last_registered', { date: formatDate(kpi.lastUpdated) }) }}
          </p>
        </div>
        <div class="hero-actions">
          <span class="d-inline-flex align-center">
            <button class="hero-action-btn" :disabled="isLoading" @click="refreshAll">
              <RefreshCw :size="13" :class="{ 'rotate-anim': isLoading }" class="mr-1" />
              {{ $t('deliverables.hero.refresh_all') }}
            </button>
            <GuideTooltip target="deliv-hero-refresh" placement="bottom" :size="12" />
          </span>
          <button
            v-if="store.projectName"
            class="hero-action-btn"
            @click="openNotionExport(['cps', 'prd', 'design'])"
          >
            <Share2 :size="13" class="mr-1" />
            {{ $t('plan.notion.export_title') }}
          </button>
        </div>
      </section>

      <!-- ===== Block 2: KPI Strip ===== -->
      <section class="kpi-strip">
        <div class="kpi-card kpi-card--accent">
          <div class="kpi-icon"><Github :size="18" /></div>
          <div class="kpi-body">
            <span class="kpi-label">
              REPOSITORIES
              <GuideTooltip target="deliv-kpi-repos" placement="bottom" :size="11" />
            </span>
            <span class="kpi-value serif-text">{{ kpi.repoCount }}</span>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><FileCode :size="18" /></div>
          <div class="kpi-body">
            <span class="kpi-label">
              TOTAL FILES
              <GuideTooltip target="deliv-kpi-files" placement="bottom" :size="11" />
            </span>
            <span class="kpi-value serif-text">{{ formatNum(kpi.totalFiles) }}</span>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><Activity :size="18" /></div>
          <div class="kpi-body">
            <span class="kpi-label">
              EST. LOC
              <GuideTooltip target="deliv-kpi-loc" placement="bottom" :size="11" />
            </span>
            <span class="kpi-value serif-text">{{ formatNum(kpi.totalLoc) }}</span>
          </div>
        </div>
        <div class="kpi-card" :class="{ 'kpi-card--good': kpi.lintAvg !== null && kpi.lintAvg >= 80, 'kpi-card--mid': kpi.lintAvg !== null && kpi.lintAvg >= 60 && kpi.lintAvg < 80, 'kpi-card--bad': kpi.lintAvg !== null && kpi.lintAvg < 60 }">
          <div class="kpi-icon"><CheckCircle2 :size="18" /></div>
          <div class="kpi-body">
            <span class="kpi-label">
              AVG LINT
              <GuideTooltip target="deliv-kpi-lint" placement="bottom" :size="11" />
            </span>
            <span class="kpi-value serif-text">{{ kpi.lintAvg !== null ? `${kpi.lintAvg}%` : '—' }}</span>
            <span class="kpi-sub" v-if="kpi.lintAvg !== null">{{ $t('deliverables.kpi.lint_analyzed', { count: kpi.lintCount, total: kpi.repoCount }) }}</span>
          </div>
        </div>
      </section>

      <!-- ===== Block 2.5: Readiness Checklist ===== -->
      <!-- "이 프로젝트, 정말 인수 가능한 상태인가?" 자동 평가. KPI 다음에 두어
           사용자가 가장 먼저 "다음 액션" 을 인지하도록. -->
      <ReadinessChecklist
        :repos="repos"
        :repo-meta-by-url="repoMetaByUrl"
        :kpi="kpi"
        :has-prd="readiness.hasPrd.value"
        :lineage-coverage-pct="lineageData ? matrixCoveragePct : null"
      />

      <!-- ===== Block 3: Repo Grid ===== -->
      <RepoGrid
        :repos="repos"
        :repos-by-role="reposByRole"
        :is-loading="isLoading"
        :error-msg="errorMsg"
        :repo-meta-by-url="repoMetaByUrl"
        :repo-meta-loading="repoMetaLoading"
        :lint-by-url="lintByUrl"
        :top-languages-for="topLanguagesFor"
        :file-count-for="fileCountFor"
        :loc-for="locFor"
        :last-commit-for="lastCommitFor"
        @add="openAddModal"
        @edit="openEditModal"
        @delete="handleDeleteRepo"
        @open="openDrawer"
        @open-repo="openRepo"
      />

      <!-- ===== Block 3.5: Tech Stack ===== -->
      <!-- 인수받는 팀이 "어떤 기술 알아야 하는지" 한눈에. -->
      <LanguageStackCard
        :repos="repos"
        :repo-meta-by-url="repoMetaByUrl"
      />

      <!-- ===== Block 4: Lineage ===== -->
      <LineageSection
        :repos="repos"
        :repo-role-by-url="repoRoleByUrl"
        :open-file="openFile"
        @open-truth-io="truthIoOpen = true"
        @open-badge="badgeDialogOpen = true"
        @open-diff="diffDialogOpen = true"
        @open-graph="graphDialogOpen = true"
        @connect-repo="openAddModal"
      />


      <!-- ===== Block 5: Handoff ZIP ===== -->
      <HandoffSection :repos="repos" :lint-by-url="lintByUrl" :kpi="kpi" />
    </div>

    <!-- ===== Detail Drawer ===== -->
    <RepoDrawer
      :open="drawerOpen"
      :repo="drawerRepo"
      :data="drawerData"
      :is-loading="!!repoMetaLoading[drawerRepo?.url]"
      @close="closeDrawer"
      @refresh="refreshRepoMeta"
      @open-repo="openRepo"
    />

    <!-- Add/Edit Modal -->
    <RepoFormModal
      v-model="modalOpen"
      :mode="modalMode"
      v-model:form="modalForm"
      :is-loading="isLoading"
      @submit="submitModal"
    />

    <!-- 정답 라벨 임포트/익스포트 -->
    <TruthImportExportDialog
      v-model="truthIoOpen"
      :truth-by-type="truthByType"
      @imported="onTruthImported"
    />

    <!-- Coverage 뱃지 생성 -->
    <CoverageBadgeDialog
      v-model="badgeDialogOpen"
      :project-name="store.projectName"
      :metrics="badgeMetrics"
      :link-url="store.githubUrl || ''"
    />

    <!-- 분석 이력 Diff -->
    <LineageDiffDialog
      v-model="diffDialogOpen"
      :project-name="store.projectName"
      :current-data="lineageData"
      :current-saved-at="lineageSavedAt"
    />

    <!-- Lineage 그래프 시각화 -->
    <LineageGraphDialog v-model="graphDialogOpen" :lineage-data="lineageData" />

    <!-- Lineage Truth Labeling Dialog -->
    <LineageTruthDialog
      v-model="truthDialogOpen"
      :item="truthDialogItem"
      :item-type="truthDialogType"
      :current-matched="(truthDialogItem?.implementations || []).map(i => i.filePath).filter(Boolean)"
      :repo-urls="repos.map(r => r.url)"
      @saved="onTruthSaved"
    />

    <!-- Deliverables 사용 가이드 모달 -->
    <DeliverablesGuideModal v-model="showGuide" />

    <NotionExportDialog
      v-model="notionOpen"
      :project-name="store.projectName"
      :team-id="projectStore.activeTeamId || ''"
      :docs="notionDocs"
    />
  </div>
</template>

<style scoped>
.deliverables-root { background: var(--bg-page); }

/* 헤드라인 행 — 제목 좌측 + 가이드 버튼 우측. Plan / Design / Lint 페이지와 동일 톤. */
.deliverables-headline-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.deliverables-headline-text { min-width: 0; flex: 1; }
.deliverables-guide-btn {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 7px 14px; border-radius: 9999px; border: 1px solid var(--border-light);
  background: white; color: var(--text-main);
  font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.deliverables-guide-btn:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
@media (max-width: 600px) {
  .deliverables-headline-row { flex-wrap: wrap; }
  .deliverables-guide-btn { font-size: 0.6rem; padding: 6px 11px; }
}



/* premium-tab-row 는 deliverables-tab-row 로 대체됨 (반응형 wrap 지원) */
.mono-text { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }
.text-muted { color: var(--text-muted); }


/* ===== HERO ===== */
.hero-block {
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  padding: 32px 36px; margin-bottom: 22px;
  background: linear-gradient(135deg, #2A2421 0%, #3D2E1E 50%, #1A1208 100%);
  border-radius: 22px; color: #fff; position: relative; overflow: hidden;
}
/* 어두운 배너에서 드래그 선택 시 글자가 검정으로 묻히지 않도록 명시 */
.hero-block ::selection { background: rgba(200, 155, 106, 0.55); color: #fff; }
.hero-block ::-moz-selection { background: rgba(200, 155, 106, 0.55); color: #fff; }
.hero-block::before {
  content: ''; position: absolute; right: -80px; bottom: -80px;
  width: 280px; height: 280px; border-radius: 50%;
  background: radial-gradient(circle, rgba(200,155,106,0.35), transparent 70%);
  pointer-events: none;
}
.hero-block::after {
  content: ''; position: absolute; left: -40px; top: -40px;
  width: 160px; height: 160px; border-radius: 50%;
  background: radial-gradient(circle, rgba(140,98,57,0.25), transparent 70%);
  pointer-events: none;
}
.hero-content { z-index: 1; }
.hero-actions { z-index: 1; flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
.hero-pill {
  display: inline-block; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.14em;
  color: #C89B6A; background: rgba(200,155,106,0.15);
  padding: 5px 12px; border-radius: 9999px; margin-bottom: 12px;
}
.hero-title { font-size: 2rem; font-weight: 900; margin: 0; letter-spacing: -0.025em; line-height: 1.1; }
.hero-desc {
  font-size: 0.88rem; color: rgba(255,255,255,0.72); margin: 10px 0 0;
  line-height: 1.6;
}
.hero-action-btn {
  display: inline-flex; align-items: center; padding: 11px 18px;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  border-radius: 9999px; color: #fff;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer;
  transition: all .15s; backdrop-filter: blur(8px);
}
.hero-action-btn:hover:not(:disabled) { background: rgba(255,255,255,0.18); transform: translateY(-1px); }
.hero-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== KPI ===== */
.kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
.kpi-card {
  display: flex; align-items: center; gap: 14px;
  background: white; border: 1px solid var(--border-light); border-radius: 14px;
  padding: 16px 20px; transition: all .15s;
}
.kpi-card:hover { border-color: rgba(140,98,57,0.3); box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
.kpi-card--accent { background: linear-gradient(135deg, #FCFAEE, #F2EAD8); border-color: rgba(140,98,57,0.2); }
.kpi-card--good { border-color: rgba(91,161,96,0.3); background: rgba(91,161,96,0.04); }
.kpi-card--mid  { border-color: rgba(224,138,60,0.3); background: rgba(224,138,60,0.04); }
.kpi-card--bad  { border-color: rgba(192,57,43,0.3); background: rgba(192,57,43,0.04); }
.kpi-icon {
  width: 38px; height: 38px; flex-shrink: 0;
  border-radius: 10px; background: rgba(140,98,57,0.1); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
}
.kpi-card--good .kpi-icon { background: rgba(91,161,96,0.1); color: #2E7B33; }
.kpi-card--mid  .kpi-icon { background: rgba(224,138,60,0.1); color: #B46723; }
.kpi-card--bad  .kpi-icon { background: rgba(192,57,43,0.1); color: #A0291F; }
.kpi-body { display: flex; flex-direction: column; min-width: 0; }
.kpi-label {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.6rem; font-weight: 800;
  color: var(--text-muted); letter-spacing: 0.02em;
}
.kpi-value { font-size: 1.7rem; font-weight: 900; color: var(--text-main); line-height: 1.1; }
.kpi-sub { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.65rem; color: var(--text-muted); margin-top: 2px; }


.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

/* Tab row */
.deliverables-tab-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;
}
.deliverables-trailing { flex-shrink: 0; margin-left: 16px; margin-bottom: 4px; }

@media (max-width: 900px) {
  .deliverables-tab-row { flex-wrap: wrap; row-gap: 8px; }
  .deliverables-trailing { margin-left: 0; width: 100%; }
}

/* ===== Responsive ===== */
@media (max-width: 1024px) {
  .kpi-strip { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .hero-block { padding: 24px 24px; }
  .hero-title { font-size: 1.6rem; }
  .hero-desc { font-size: 0.82rem; }
}

@media (max-width: 600px) {
  .hero-block {
    flex-direction: column;
    align-items: flex-start;
    padding: 20px 18px;
    border-radius: 16px;
  }
  .hero-title { font-size: 1.4rem; }
  .hero-actions { width: 100%; flex-direction: column; align-items: stretch; }
  .hero-actions > span { display: flex; }
  .hero-action-btn { width: 100%; justify-content: center; }
  .kpi-strip { grid-template-columns: 1fr; }
  .kpi-card { padding: 14px 16px; }
  .kpi-value { font-size: 1.45rem; }
}
</style>
