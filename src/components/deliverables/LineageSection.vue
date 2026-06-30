<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2, Activity, AlertTriangle, RefreshCw, ExternalLink, Edit3, Search, X, Upload, Award, GitCompare, Share2 } from 'lucide-vue-next'
import { formatRelativeKr } from '@/utils/github'
import { roleColor, roleLabel } from '@/composables/useProjectRepos'
import {
  useLineageAnalysis,
  confidenceColor,
  confidenceLabel,
  confidenceFriendly,
} from '@/composables/useLineageAnalysis'
import { useLineageQuality, TAB_TO_ITEM_TYPE } from '@/composables/useLineageQuality'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const props = defineProps({
  repos: { type: Array, required: true },
  repoRoleByUrl: { type: Object, required: true },
  openFile: { type: Function, required: true },
})

const emit = defineEmits(['open-truth-io', 'open-badge', 'open-diff', 'open-graph', 'connect-repo'])

const { t } = useI18n()

// locale 의존 라벨 배열 — 모듈 상수 대신 computed (언어 전환 시 갱신).
const lineageTabDefs = computed(() => [
  { id: 'matrix', label: t('deliverables.lineage.tabs.matrix'), special: true },
  { id: 'aggregates', label: t('deliverables.lineage.tabs.aggregates') },
  { id: 'apis', label: t('deliverables.lineage.tabs.apis') },
  { id: 'services', label: t('deliverables.lineage.tabs.services') },
  { id: 'stories', label: t('deliverables.lineage.tabs.stories') },
  { id: 'missing', label: t('deliverables.lineage.tabs.missing'), warn: true },
])

const matrixFilterDefs = computed(() => [
  { id: 'all', label: t('deliverables.lineage.matrix.filters.all') },
  { id: 'high', label: t('deliverables.lineage.matrix.filters.high') },
  { id: 'medium', label: t('deliverables.lineage.matrix.filters.medium') },
  { id: 'low', label: t('deliverables.lineage.matrix.filters.low') },
  { id: 'unverified', label: t('deliverables.lineage.matrix.filters.unverified'), warn: true },
  { id: 'missing', label: t('deliverables.lineage.matrix.filters.missing'), warn: true },
])

const confidenceFilterDefs = computed(() => [
  { id: 'all', label: t('deliverables.lineage.filter.confidence.all') },
  { id: 'high', label: t('deliverables.lineage.filter.confidence.high') },
  { id: 'medium', label: t('deliverables.lineage.filter.confidence.medium') },
  { id: 'low', label: t('deliverables.lineage.filter.confidence.low') },
  { id: 'unverified', label: t('deliverables.lineage.filter.confidence.unverified') },
  { id: 'none', label: t('deliverables.lineage.filter.confidence.none') },
])

const {
  lineageData, lineageSavedAt, lineageMsg, expandedItems,
  lineageActiveTab, matrixFilter, lineageElapsedSec,
  lineageSearch, lineageConfidenceFilter, lineageRepoFilter,
  isAnalyzingLineage,
  lineageTabCounts, lineageItems, lineageItemsTotal, lineageHasZeroMatch,
  matrixRows, filteredMatrix, matrixCoveragePct,
  // [2026-06-06 재설계] 단순 결과 카드용 Story 중심 요약.
  lineageSummary,
  // [2026-05-21] 분석 중 stage / 진행률 / ETA — 1~3분 대기 동안 사용자 안심.
  LINEAGE_STAGES, lineageCurrentStageIdx, lineageProgressPct, lineageEtaText,
  triggerAnalyzeLineage, toggleExpand,
} = useLineageAnalysis()

// [2026-06-06] 판정 상태 — 80%+ 🎉 / 50–79 🙂 / <50 ⚠️.
const statusEmoji = (pct) => (pct >= 80 ? '🎉' : pct >= 50 ? '🙂' : '⚠️')
const statusColor = (pct) => (pct >= 80 ? '#5BA160' : pct >= 50 ? '#E08A3C' : '#C0392B')

const clearFilters = () => {
  lineageSearch.value = ''
  lineageConfidenceFilter.value = 'all'
  lineageRepoFilter.value = ''
}
const hasActiveFilter = () => !!lineageSearch.value || lineageConfidenceFilter.value !== 'all' || !!lineageRepoFilter.value

const {
  truthDialogOpen, truthDialogItem, truthDialogType,
  openTruthDialog, hasTruth,
  lineageQualityCurrent, formatPct,
} = useLineageQuality(lineageData, lineageActiveTab)

// 다이얼로그를 부모에서 띄우려면 emit 필요 — 하지만 이미 useLineageQuality 내 모듈 레벨이 아니라 인스턴스라
// 부모와 자식이 다른 인스턴스를 가지면 동기화 안 됨. 일단 부모에서 LineageTruthDialog를 직접 마운트하는 형태 유지.
// LineageSection은 openTruthDialog만 호출하고, parent의 onTruthSaved 콜백은 emit으로 위임.
// → 단순화: 부모도 useLineageQuality 호출했고, 같은 모듈 함수가 아니므로 별도 인스턴스. 동기화는 lineage truthSaved 콜백을 부모가 처리.
defineExpose({ truthDialogOpen, truthDialogItem, truthDialogType })
</script>

<template>
  <section class="lineage-section">
    <div class="section-head">
      <div>
        <span class="section-pill mono-text">{{ $t('deliverables.lineage.pill') }}</span>
        <h4 class="section-title serif-text">
          {{ $t('deliverables.lineage.title') }}
          <GuideTooltip target="lineage-section" placement="bottom" :size="14" />
        </h4>
        <p class="lineage-desc">{{ $t('deliverables.lineage.desc') }}</p>
      </div>
      <div class="d-flex align-center lineage-actions">
        <span v-if="lineageSavedAt" class="lineage-stamp mono-text">
          {{ formatRelativeKr(lineageSavedAt) }}
        </span>
        <span class="d-inline-flex align-center">
          <button type="button" class="analyze-btn" :disabled="isAnalyzingLineage || !repos.length" @click="triggerAnalyzeLineage">
            <Loader2 v-if="isAnalyzingLineage" :size="14" class="rotate-anim mr-2" aria-hidden="true" />
            <Activity v-else :size="14" class="mr-2" aria-hidden="true" />
            {{ lineageData ? $t('deliverables.lineage.reanalyze') : $t('deliverables.lineage.analyze') }}
          </button>
          <GuideTooltip target="lineage-rerun" placement="bottom" :size="12" />
        </span>
      </div>
    </div>

    <p v-if="lineageMsg" class="lineage-msg" :class="{ 'lineage-msg--success': lineageMsg.startsWith('✓') }" role="status" aria-live="polite">
      {{ lineageMsg }}
    </p>

    <!-- 분석 안 됨 빈 상태 — [2026-06-06] 가치 우선 안내(미연결) / 점검 준비(연결됨) -->
    <div v-if="!lineageData && !isAnalyzingLineage" class="lineage-empty-state">
      <!-- repo 미연결: '왜·무엇을' + 결과 미리보기 + 연결 CTA -->
      <template v-if="!repos.length">
        <p class="lineage-empty-title serif-text">{{ $t('deliverables.lineage.empty.value_title') }}</p>
        <p class="lineage-empty-desc">{{ $t('deliverables.lineage.empty.value_desc') }}</p>
        <div class="lineage-preview" aria-hidden="true">
          <div class="lineage-preview-cap">{{ $t('deliverables.lineage.empty.preview_caption') }}</div>
          <div class="lineage-preview-card">
            <div class="lineage-preview-row">
              <span class="lineage-preview-verdict">🎉 75%</span>
              <span class="lineage-preview-bar"><span style="width:75%"></span></span>
            </div>
            <div class="lineage-preview-line lineage-preview-line--miss"></div>
            <div class="lineage-preview-line"></div>
            <div class="lineage-preview-line lineage-preview-line--short"></div>
          </div>
        </div>
        <button type="button" class="analyze-btn" @click="emit('connect-repo')">
          <Activity :size="14" class="mr-2" aria-hidden="true" />{{ $t('deliverables.lineage.empty.connect_repo') }}
        </button>
      </template>
      <!-- 연결됨, 분석 전: 점검 시작 -->
      <template v-else>
        <p class="lineage-empty-title serif-text">{{ $t('deliverables.lineage.empty.ready_title') }}</p>
        <p class="lineage-empty-desc">{{ $t('deliverables.lineage.empty.ready_desc') }}</p>
        <button type="button" class="analyze-btn" :disabled="isAnalyzingLineage" @click="triggerAnalyzeLineage">
          <Activity :size="14" class="mr-2" aria-hidden="true" />{{ $t('deliverables.lineage.analyze') }}
        </button>
      </template>
    </div>

    <!-- [2026-05-21] 분석 중 — stage 진행 + 진행률 + ETA 로 1~3분 대기 안심.
         design.vue 의 6분 대기 패턴과 동일한 사용자 멘탈 모델. -->
    <div v-else-if="isAnalyzingLineage && !lineageData" class="lineage-analyzing" role="status" aria-live="polite">
      <div class="lineage-analyzing__head">
        <Loader2 :size="28" class="rotate-anim lineage-analyzing__spin" aria-hidden="true" />
        <div class="lineage-analyzing__head-text">
          <p class="analyzing-title">{{ $t('deliverables.lineage.analyzing.title') }}</p>
          <p class="analyzing-desc">
            {{ $t('deliverables.lineage.analyzing.desc', { count: repos.length }) }}
          </p>
        </div>
      </div>

      <!-- 단계 진행 표시 -->
      <div class="analyzing-stages" role="list" :aria-label="$t('deliverables.lineage.analyzing.stages_aria')">
        <div
          v-for="(s, i) in LINEAGE_STAGES" :key="s.id"
          class="analyzing-stage"
          :class="{
            'analyzing-stage--done': i < lineageCurrentStageIdx,
            'analyzing-stage--active': i === lineageCurrentStageIdx,
          }"
          role="listitem"
        >
          <span class="analyzing-stage-num">{{ i + 1 }}</span>
          <span class="analyzing-stage-name">{{ s.label }}</span>
        </div>
      </div>

      <p class="analyzing-current">{{ LINEAGE_STAGES[lineageCurrentStageIdx]?.desc }}</p>

      <!-- 진행률 + ETA -->
      <div class="analyzing-progress" role="progressbar" :aria-valuenow="lineageProgressPct" aria-valuemin="0" aria-valuemax="100">
        <div class="analyzing-progress-bar">
          <div class="analyzing-progress-fill" :style="{ width: lineageProgressPct + '%' }"></div>
        </div>
        <div class="analyzing-progress-meta">
          <span class="analyzing-progress-pct">{{ lineageProgressPct }}%</span>
          <span class="analyzing-progress-eta">
            {{ LINEAGE_STAGES[lineageCurrentStageIdx]?.label }} · {{ lineageEtaText }}
          </span>
        </div>
      </div>
    </div>

    <!-- 분석 결과 -->
    <div v-else-if="lineageData" class="lineage-result">
      <!-- 매칭 0건 진단 배너 -->
      <div v-if="lineageHasZeroMatch" class="zero-match-banner" role="alert">
        <AlertTriangle :size="18" class="zero-match-icon" aria-hidden="true" />
        <div class="zero-match-body">
          <div class="zero-match-title">{{ $t('deliverables.lineage.zero_match.title') }}</div>
          <div class="zero-match-desc" v-html="$t('deliverables.lineage.zero_match.desc_html')"></div>
          <ul class="zero-match-checklist">
            <li v-html="$t('deliverables.lineage.zero_match.reason1_html')"></li>
            <li>{{ $t('deliverables.lineage.zero_match.reason2') }}</li>
            <li>{{ $t('deliverables.lineage.zero_match.reason3') }}</li>
          </ul>
          <div class="zero-match-actions">
            <button type="button" class="zero-match-btn" @click="triggerAnalyzeLineage">
              <RefreshCw :size="12" class="mr-1" aria-hidden="true" />{{ $t('deliverables.lineage.zero_match.retry') }}
            </button>
            <span class="zero-match-tip">{{ $t('deliverables.lineage.zero_match.tip') }}</span>
          </div>
        </div>
      </div>

      <!-- [2026-06-06] 단순 결과 카드 (Story 중심 "구현 점검") -->
      <div v-if="lineageSummary.hasStories" class="build-check">
        <div class="bc-headline">
          <div class="bc-verdict">
            <span class="bc-emoji" aria-hidden="true">{{ statusEmoji(lineageSummary.storyPct) }}</span>
            <span class="bc-text">{{ $t('deliverables.lineage.result.headline', { done: lineageSummary.storyImplemented, total: lineageSummary.storyTotal }) }}</span>
          </div>
          <div class="bc-pct serif-text" :style="{ color: statusColor(lineageSummary.storyPct) }">{{ lineageSummary.storyPct }}<small>%</small></div>
        </div>
        <div class="bc-bar"><div class="bc-bar-fill" :style="{ width: lineageSummary.storyPct + '%', background: statusColor(lineageSummary.storyPct) }"></div></div>

        <!-- 아직 코드에서 안 보이는 것 (먼저) -->
        <div v-if="lineageSummary.missingStories.length" class="bc-missing">
          <div class="bc-missing-head">{{ $t('deliverables.lineage.result.missing_head', { n: lineageSummary.missingStories.length }) }}</div>
          <ul class="bc-missing-list">
            <li v-for="m in lineageSummary.missingStories" :key="m.id" class="bc-missing-item">
              <span class="bc-missing-name">{{ m.name }}</span>
              <span v-if="m.hint" class="bc-missing-hint">{{ m.hint }}</span>
            </li>
          </ul>
        </div>
        <div v-else class="bc-alldone">{{ $t('deliverables.lineage.result.all_done') }}</div>

        <!-- 코드에서 확인된 시나리오 (펼침) -->
        <details v-if="lineageSummary.implementedStories.length" class="bc-impl">
          <summary>{{ $t('deliverables.lineage.result.implemented_head', { n: lineageSummary.implementedStories.length }) }}</summary>
          <ul class="bc-impl-list">
            <li v-for="s in lineageSummary.implementedStories" :key="s.id" class="bc-impl-item">
              <span class="bc-impl-name">{{ s.name || s.id }}</span>
              <span
                class="bc-impl-where mono-text"
                role="button" tabindex="0"
                :title="s.implementations[0].filePath"
                @click="openFile(s.implementations[0].repoUrl, s.implementations[0].filePath, { unverified: s.implementations[0].confidence === 'unverified' })"
                @keydown.enter.prevent="openFile(s.implementations[0].repoUrl, s.implementations[0].filePath, { unverified: s.implementations[0].confidence === 'unverified' })"
              >
                {{ s.implementations[0].filePath }}
                <small class="bc-conf">{{ confidenceFriendly(s.implementations[0].confidence) }}</small>
              </span>
            </li>
          </ul>
        </details>

        <!-- 기술 항목 1줄 요약 (안심용) -->
        <div class="bc-tech">
          {{ $t('deliverables.lineage.result.tech_rollup', {
            ax: lineageSummary.tech.apis.mapped, at: lineageSummary.tech.apis.total,
            gx: lineageSummary.tech.aggregates.mapped, gt: lineageSummary.tech.aggregates.total,
            sx: lineageSummary.tech.services.mapped, st: lineageSummary.tech.services.total }) }}
        </div>
      </div>
      <div v-else-if="!lineageHasZeroMatch" class="bc-no-story">{{ $t('deliverables.lineage.result.headline_none') }}</div>

      <!-- ▸ 고급 (개발자용) — 기존 상세 UI(요약·탭·matrix·품질·리스트) 전부 보존 -->
      <details class="lineage-advanced">
        <summary class="lineage-advanced__summary">{{ $t('deliverables.lineage.result.advanced_toggle') }}</summary>
        <div class="lineage-advanced__tools">
          <button type="button" class="iox-trigger" :aria-label="$t('deliverables.lineage.import_export_aria')" :title="$t('deliverables.lineage.import_export_aria')" @click="emit('open-truth-io')">
            <Upload :size="13" aria-hidden="true" />
          </button>
          <button type="button" class="iox-trigger" :aria-label="$t('deliverables.lineage.badge_aria')" :title="$t('deliverables.lineage.badge_aria')" :disabled="!lineageData" @click="emit('open-badge')">
            <Award :size="13" aria-hidden="true" />
          </button>
          <button type="button" class="iox-trigger" :aria-label="$t('deliverables.lineage.diff_aria')" :title="$t('deliverables.lineage.diff_title')" @click="emit('open-diff')">
            <GitCompare :size="13" aria-hidden="true" />
          </button>
          <button type="button" class="iox-trigger" :aria-label="$t('deliverables.lineage.graph_aria')" :title="$t('deliverables.lineage.graph_title')" :disabled="!lineageData" @click="emit('open-graph')">
            <Share2 :size="13" aria-hidden="true" />
          </button>
        </div>

      <!-- 요약 -->
      <div class="lineage-summary-card">
        <div class="lineage-summary-text">{{ lineageData.summary || $t('deliverables.lineage.summary.no_summary') }}</div>
        <div class="lineage-summary-stats">
          <div class="summary-stat">
            <span class="stat-num">{{ lineageData.stats?.totalImpls || 0 }}</span>
            <span class="stat-label">
              {{ $t('deliverables.lineage.summary.total_mapping') }}
              <GuideTooltip target="lineage-summary-stats" placement="bottom" :size="10" class="wv-stat-tip" />
            </span>
          </div>
          <div class="summary-stat" :class="{ 'summary-stat--warn': lineageTabCounts.missing > 0 }">
            <span class="stat-num">{{ lineageTabCounts.missing }}</span>
            <span class="stat-label">{{ $t('deliverables.lineage.summary.missing') }}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-num">{{ lineageTabCounts.aggregates }}</span>
            <span class="stat-label">{{ $t('deliverables.lineage.summary.aggregate') }}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-num">{{ lineageTabCounts.apis }}</span>
            <span class="stat-label">{{ $t('deliverables.lineage.summary.api') }}</span>
          </div>
        </div>
      </div>

      <!-- 탭 -->
      <div class="lineage-tabs" role="tablist" :aria-label="$t('deliverables.lineage.view_aria')">
        <button type="button" v-for="tab in lineageTabDefs" :key="tab.id"
          role="tab"
          :aria-selected="lineageActiveTab === tab.id"
          class="lineage-tab"
          :class="{ active: lineageActiveTab === tab.id, 'lineage-tab--warn': tab.warn && lineageTabCounts.missing > 0, 'lineage-tab--special': tab.special }"
          @click="lineageActiveTab = tab.id">
          <span>{{ tab.label }}</span>
          <span v-if="tab.id !== 'matrix'" class="lineage-tab-count">{{ lineageTabCounts[tab.id] }}</span>
          <span v-else class="lineage-tab-count">{{ matrixRows.length }}</span>
        </button>
      </div>

      <!-- Matrix 탭 -->
      <div v-if="lineageActiveTab === 'matrix'" class="matrix-wrap">
        <div class="matrix-head">
          <div class="matrix-coverage">
            <div class="coverage-label mono-text">
              {{ $t('deliverables.lineage.matrix.coverage') }}
              <GuideTooltip target="lineage-coverage" placement="bottom" :size="11" />
            </div>
            <div class="coverage-value serif-text">{{ matrixCoveragePct }}<small>%</small></div>
            <div class="coverage-bar" role="progressbar" :aria-valuenow="matrixCoveragePct" aria-valuemin="0" aria-valuemax="100">
              <div class="coverage-bar-fill" :style="{ width: matrixCoveragePct + '%' }"></div>
            </div>
            <div class="coverage-stat mono-text">
              {{ $t('deliverables.lineage.matrix.mapped_ratio', { mapped: matrixRows.length - lineageTabCounts.missing, total: matrixRows.length }) }}
            </div>
          </div>
          <div class="matrix-filters">
            <!-- 신뢰도 (확실/추정/약함/미확인/미매칭) 한 번에 풀이 — 첫 chip 옆 ⓘ. -->
            <span class="matrix-filter-tip d-inline-flex align-center">
              <GuideTooltip target="lineage-confidence" placement="bottom" :size="11" />
            </span>
            <button type="button" v-for="f in matrixFilterDefs" :key="f.id"
              class="matrix-filter-btn"
              :aria-pressed="matrixFilter === f.id"
              :class="{ active: matrixFilter === f.id, 'matrix-filter-btn--warn': f.warn }"
              @click="matrixFilter = f.id">
              {{ f.label }}
            </button>
          </div>
        </div>

        <div class="matrix-table-wrap custom-scroll">
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="matrix-th-type">TYPE</th>
                <th class="matrix-th-id">ID</th>
                <th>NAME</th>
                <th>{{ $t('deliverables.lineage.matrix.th_impl') }}</th>
                <th class="matrix-th-status text-right">STATUS</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredMatrix" :key="row.type + '-' + row.id" :class="{ 'matrix-row--missing': row.missing }">
                <td>
                  <span class="matrix-type-pill" :class="`matrix-type-pill--${row.typeShort.toLowerCase()}`">{{ row.type }}</span>
                </td>
                <td><span class="mono-text matrix-id">{{ row.id }}</span></td>
                <td>
                  <div class="matrix-name">{{ row.name || $t('deliverables.lineage.matrix.no_name') }}</div>
                  <div v-if="row.endpoint" class="matrix-endpoint mono-text">{{ row.endpoint }}</div>
                  <div v-if="row.missing && row.reason" class="matrix-reason">{{ row.reason }}</div>
                </td>
                <td>
                  <span
                    v-if="row.bestImpl"
                    class="matrix-file-link mono-text"
                    :class="{ 'matrix-file-link--unverified': row.bestImpl.confidence === 'unverified' }"
                    role="button"
                    tabindex="0"
                    :aria-label="$t('deliverables.lineage.matrix.open_aria', { path: row.bestImpl.filePath })"
                    @click="openFile(row.bestImpl.repoUrl, row.bestImpl.filePath, { unverified: row.bestImpl.confidence === 'unverified' })"
                    @keydown.enter.prevent="openFile(row.bestImpl.repoUrl, row.bestImpl.filePath, { unverified: row.bestImpl.confidence === 'unverified' })"
                    @keydown.space.prevent="openFile(row.bestImpl.repoUrl, row.bestImpl.filePath, { unverified: row.bestImpl.confidence === 'unverified' })"
                  >
                    <span class="impl-role-dot" :style="{ background: roleColor(repoRoleByUrl[row.bestImpl.repoUrl] || row.bestImpl.role) }" aria-hidden="true"></span>
                    {{ row.bestImpl.filePath }}
                    <span v-if="row.implCount > 1" class="matrix-more-count">+{{ row.implCount - 1 }}</span>
                  </span>
                  <span v-else class="text-muted matrix-no-impl">{{ $t('deliverables.lineage.matrix.no_name') }}</span>
                </td>
                <td class="text-right">
                  <span v-if="row.missing" class="status-pill status-pill--missing">{{ $t('deliverables.lineage.matrix.status_missing') }}</span>
                  <span v-else-if="row.bestImpl"
                    class="status-pill"
                    :style="{ background: confidenceColor(row.bestImpl.confidence) + '22', color: confidenceColor(row.bestImpl.confidence) }">
                    {{ confidenceLabel(row.bestImpl.confidence) }}
                  </span>
                </td>
              </tr>
              <tr v-if="!filteredMatrix.length">
                <td colspan="5" class="matrix-empty">{{ matrixFilter === 'missing' ? $t('deliverables.lineage.matrix.empty_no_missing') : $t('deliverables.lineage.matrix.empty_no_match') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Missing 탭 -->
      <div v-else-if="lineageActiveTab === 'missing'" class="lineage-list">
        <div v-for="m in lineageData.missingImpl || []" :key="m.id" class="missing-row">
          <span class="missing-type mono-text">{{ m.type }}</span>
          <div class="missing-info">
            <div class="missing-name">{{ m.name }} <small class="mono-text">{{ m.id }}</small></div>
            <div class="missing-reason">{{ m.reason }}</div>
          </div>
          <AlertTriangle :size="14" class="missing-icon" aria-hidden="true" />
        </div>
        <div v-if="!(lineageData.missingImpl || []).length" class="lineage-empty">
          {{ $t('deliverables.lineage.missing_tab.all_mapped') }}
        </div>
      </div>

      <!-- Quality Summary -->
      <div v-if="lineageQualityCurrent && TAB_TO_ITEM_TYPE[lineageActiveTab]" class="quality-summary-card">
        <div class="quality-summary-head">
          <span class="quality-pill">QUALITY</span>
          <span class="quality-summary-title">{{ $t('deliverables.lineage.quality.title', { labeled: lineageQualityCurrent.coverage.labeled, total: lineageQualityCurrent.coverage.total }) }}</span>
        </div>
        <div class="quality-metrics">
          <div class="quality-metric">
            <span class="quality-metric-label">Precision</span>
            <span class="quality-metric-value">{{ formatPct(lineageQualityCurrent.macro.precision) }}</span>
            <span class="quality-metric-sub">macro · micro {{ formatPct(lineageQualityCurrent.micro.precision) }}</span>
          </div>
          <div class="quality-metric">
            <span class="quality-metric-label">Recall</span>
            <span class="quality-metric-value">{{ formatPct(lineageQualityCurrent.macro.recall) }}</span>
            <span class="quality-metric-sub">macro · micro {{ formatPct(lineageQualityCurrent.micro.recall) }}</span>
          </div>
          <div class="quality-metric">
            <span class="quality-metric-label">F1</span>
            <span class="quality-metric-value">{{ formatPct(lineageQualityCurrent.macro.f1) }}</span>
            <span class="quality-metric-sub">TP {{ lineageQualityCurrent.micro.tp }} · FP {{ lineageQualityCurrent.micro.fp }} · FN {{ lineageQualityCurrent.micro.fn }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="TAB_TO_ITEM_TYPE[lineageActiveTab]" class="quality-summary-empty">
        {{ $t('deliverables.lineage.quality.empty') }}
      </div>

      <!-- 검색 + 필터 (matrix/missing 외 탭에만) -->
      <div v-if="lineageActiveTab !== 'matrix' && lineageActiveTab !== 'missing'" class="lineage-filterbar">
        <div class="lineage-search">
          <Search :size="14" class="lineage-search-icon" aria-hidden="true" />
          <input
            v-model="lineageSearch"
            type="search"
            class="lineage-search-input"
            :placeholder="$t('deliverables.lineage.filter.search_placeholder')"
            :aria-label="$t('deliverables.lineage.filter.search_aria')"
          />
          <button v-if="lineageSearch" type="button" class="lineage-search-clear" :aria-label="$t('deliverables.lineage.filter.search_clear_aria')" @click="lineageSearch = ''">
            <X :size="12" aria-hidden="true" />
          </button>
        </div>
        <div class="lineage-filter-group" role="group" :aria-label="$t('deliverables.lineage.filter.confidence_group_aria')">
          <button v-for="c in confidenceFilterDefs" :key="c.id"
            type="button"
            class="lineage-chip"
            :class="{ active: lineageConfidenceFilter === c.id }"
            :aria-pressed="lineageConfidenceFilter === c.id"
            @click="lineageConfidenceFilter = c.id"
          >{{ c.label }}</button>
        </div>
        <select
          v-model="lineageRepoFilter"
          class="lineage-repo-select"
          :aria-label="$t('deliverables.lineage.filter.repo_filter_aria')"
        >
          <option value="">{{ $t('deliverables.lineage.filter.all_repos') }}</option>
          <option v-for="r in repos" :key="r.url" :value="r.url">{{ r.label || r.url.replace(/^https?:\/\/github\.com\//, '') }}</option>
        </select>
        <button v-if="hasActiveFilter()" type="button" class="lineage-clear-btn" @click="clearFilters">{{ $t('deliverables.lineage.filter.clear_btn') }}</button>
        <span class="lineage-count mono-text" aria-live="polite">
          {{ $t('deliverables.lineage.filter.count', { shown: lineageItems.length, total: lineageItemsTotal }) }}
        </span>
      </div>

      <!-- 산출물 리스트 (matrix/missing 외 탭) -->
      <div v-if="lineageActiveTab !== 'matrix' && lineageActiveTab !== 'missing'" class="lineage-list">
        <div v-for="(item, idx) in lineageItems" :key="(item.id || idx) + '-' + lineageActiveTab" class="lineage-item">
          <div class="lineage-item-head-wrap">
            <button type="button" class="lineage-item-head" :aria-expanded="!!expandedItems[`${lineageActiveTab}-${item.id || idx}`]" @click="toggleExpand(`${lineageActiveTab}-${item.id || idx}`)">
              <span class="lineage-arrow-toggle" :class="{ open: expandedItems[`${lineageActiveTab}-${item.id || idx}`] }" aria-hidden="true">▶</span>
              <div class="lineage-item-title">
                <span class="item-name">{{ item.name || item.id || $t('deliverables.lineage.list.no_name') }}</span>
                <span v-if="item.id" class="mono-text item-id">{{ item.id }}</span>
                <span v-if="item.endpoint" class="mono-text item-endpoint">{{ item.endpoint }}</span>
              </div>
              <div class="lineage-item-meta">
                <span class="impl-count">{{ (item.implementations || []).length }} impl</span>
              </div>
            </button>
            <button
              type="button"
              v-if="TAB_TO_ITEM_TYPE[lineageActiveTab] && item.id"
              class="truth-edit-btn"
              :class="{ 'truth-edit-btn--labeled': hasTruth(item, lineageActiveTab) }"
              :aria-label="hasTruth(item, lineageActiveTab) ? $t('deliverables.lineage.list.label_edit_aria', { name: item.name || item.id }) : $t('deliverables.lineage.list.label_register_aria', { name: item.name || item.id })"
              :title="hasTruth(item, lineageActiveTab) ? $t('deliverables.lineage.list.label_edit_title') : $t('deliverables.lineage.list.label_register_title')"
              @click.stop="openTruthDialog(item, lineageActiveTab)"
            >
              <Edit3 :size="12" aria-hidden="true" />
            </button>
          </div>

          <transition name="expand">
            <div v-show="expandedItems[`${lineageActiveTab}-${item.id || idx}`]" class="lineage-impls">
              <div v-for="(impl, ii) in (item.implementations || [])" :key="ii" class="impl-row">
                <span class="impl-confidence" :style="{ background: confidenceColor(impl.confidence) }">
                  {{ confidenceLabel(impl.confidence) }}
                </span>
                <div
                  class="impl-info"
                  role="button"
                  tabindex="0"
                  :aria-label="$t('deliverables.lineage.list.open_aria', { path: impl.filePath })"
                  @click="openFile(impl.repoUrl, impl.filePath, { unverified: impl.confidence === 'unverified' })"
                  @keydown.enter.prevent="openFile(impl.repoUrl, impl.filePath, { unverified: impl.confidence === 'unverified' })"
                  @keydown.space.prevent="openFile(impl.repoUrl, impl.filePath, { unverified: impl.confidence === 'unverified' })"
                >
                  <div class="impl-path mono-text">
                    <span class="impl-role-dot" :style="{ background: roleColor(repoRoleByUrl[impl.repoUrl] || impl.role) }" aria-hidden="true"></span>
                    {{ impl.filePath }}
                  </div>
                  <div class="impl-reason">{{ impl.reason }}</div>
                </div>
                <button type="button" class="icon-btn" :aria-label="$t('deliverables.lineage.list.open_github_aria', { path: impl.filePath })" :title="$t('deliverables.lineage.list.open_github_aria', { path: impl.filePath })" @click="openFile(impl.repoUrl, impl.filePath, { unverified: impl.confidence === 'unverified' })">
                  <ExternalLink :size="12" aria-hidden="true" />
                </button>
              </div>
              <div v-if="!(item.implementations || []).length" class="impl-empty">
                {{ $t('deliverables.lineage.list.no_matched_file') }}
              </div>
            </div>
          </transition>
        </div>
        <div v-if="!lineageItems.length" class="lineage-empty">
          {{ $t('deliverables.lineage.list.tab_empty', { tab: lineageActiveTab }) }}
        </div>
      </div>
      </details>
    </div>
  </section>
</template>

<style scoped>
.section-pill {
  display: inline-flex; align-items: center; padding: 3px 10px;
  background: var(--bg-light); color: var(--accent);
  font-size: 0.62rem; font-weight: 800; letter-spacing: 0.08em;
  border-radius: 9999px; margin-bottom: 6px;
}
.section-title {
  /* [2026-06-06] 5개 섹션 헤더 통일: 밝은 pill + Fraunces 세리프 제목.
     display:flex(블록 레벨)라 pill 이 윗줄로 간다(이전 inline-flex 줄바꿈 버그 수정). */
  font-family: 'Fraunces', 'Outfit', serif; font-size: 1.3rem; font-weight: 700;
  color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;
}
.section-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-bottom: 16px; gap: 16px; flex-wrap: wrap;
}
.lineage-section { margin-bottom: 36px; }
.lineage-desc { font-size: 0.8rem; color: var(--text-muted); margin: 6px 0 0; line-height: 1.5; max-width: 560px; }
.lineage-actions { gap: 10px; flex-shrink: 0; }
.lineage-stamp {
  font-size: 0.7rem; color: var(--text-muted);
  background: var(--bg-light); padding: 4px 10px; border-radius: 9999px;
}
.analyze-btn {
  display: inline-flex; align-items: center; padding: 10px 22px;
  background: var(--accent); color: white; border: none; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.74rem; font-weight: 800;
  letter-spacing: 0.06em; cursor: pointer; transition: all .15s;
  text-transform: uppercase;
}
.analyze-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(140,98,57,0.3); }
.analyze-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.iox-trigger {
  width: 36px; height: 36px; border-radius: 50%;
  background: white; border: 1px solid var(--border-light);
  color: var(--accent); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.iox-trigger:hover { background: var(--accent); color: white; border-color: var(--accent); }
.lineage-msg {
  margin-top: 12px; padding: 11px 15px;
  background: rgba(140,98,57,0.06); border: 1px solid rgba(140,98,57,0.2);
  border-radius: 9px; font-size: 0.78rem; color: var(--text-main); font-weight: 600;
}
.lineage-msg--success { background: rgba(91,161,96,0.1); border-color: rgba(91,161,96,0.25); color: #2E7B33; }

.lineage-empty-state { margin-top: 18px; background: white; border: 1px dashed var(--border-light); border-radius: 16px; padding: 32px 28px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
.lineage-empty-title { font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin: 0; max-width: 560px; line-height: 1.4; }
.lineage-empty-desc { font-size: 0.9rem; color: var(--text-muted); margin: 0; max-width: 560px; line-height: 1.6; }
.lineage-empty-state .analyze-btn { margin-top: 8px; }

/* 결과 미리보기 (흐릿한 목업 — "이런 걸 보게 돼요") */
.lineage-preview { width: 100%; max-width: 440px; margin: 6px 0; opacity: 0.6; pointer-events: none; }
.lineage-preview-cap { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; }
.lineage-preview-card { background: #FFFBEB; border: 1px solid rgba(140,98,57,0.18); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px; text-align: left; }
.lineage-preview-row { display: flex; align-items: center; gap: 10px; }
.lineage-preview-verdict { font-weight: 800; color: #5BA160; font-size: 0.95rem; white-space: nowrap; }
.lineage-preview-bar { flex: 1; height: 8px; background: #E8E2D2; border-radius: 99px; overflow: hidden; }
.lineage-preview-bar > span { display: block; height: 100%; background: #5BA160; }
.lineage-preview-line { height: 10px; border-radius: 6px; background: #ECE6D8; }
.lineage-preview-line--miss { background: #FCA5A5; width: 70%; }
.lineage-preview-line--short { width: 45%; }

/* [2026-06-06] 단순 결과 카드 (Story 중심 "구현 점검") */
.build-check { margin-top: 18px; background: #FFFFFF; border: 1px solid rgba(140,98,57,0.2); border-radius: 16px; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.bc-headline { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.bc-verdict { display: flex; align-items: center; gap: 10px; min-width: 0; }
.bc-emoji { font-size: 1.4rem; }
.bc-text { font-size: 1.02rem; font-weight: 700; color: var(--text-main); line-height: 1.4; }
.bc-pct { font-size: 1.9rem; font-weight: 800; line-height: 1; white-space: nowrap; }
.bc-pct small { font-size: 1rem; margin-left: 1px; }
.bc-bar { height: 10px; background: #ECE6D8; border-radius: 99px; overflow: hidden; }
.bc-bar-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
.bc-missing { background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 12px; padding: 12px 14px; }
.bc-missing-head { font-weight: 800; font-size: 0.92rem; color: #B91C1C; margin-bottom: 8px; }
.bc-missing-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.bc-missing-item { display: flex; flex-direction: column; gap: 1px; }
.bc-missing-name { font-weight: 700; color: #7F1D1D; font-size: 0.9rem; }
.bc-missing-hint { font-size: 0.8rem; color: #9B6B6B; }
.bc-alldone { background: #F0FDF4; border: 1px solid #86EFAC; border-radius: 12px; padding: 12px 14px; font-weight: 700; color: #166534; font-size: 0.92rem; }
.bc-impl { border: 1px solid var(--border-light); border-radius: 12px; padding: 2px 0; }
.bc-impl > summary { cursor: pointer; padding: 10px 14px; font-weight: 700; font-size: 0.9rem; color: var(--text-main); }
.bc-impl-list { list-style: none; margin: 0; padding: 0 14px 10px; display: flex; flex-direction: column; gap: 8px; }
.bc-impl-item { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.bc-impl-name { font-weight: 600; color: var(--text-main); font-size: 0.88rem; }
.bc-impl-where { font-size: 0.78rem; color: var(--accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.bc-impl-where:hover { color: #6E4E2E; }
.bc-conf { color: #A89B91; margin-left: 4px; }
.bc-tech { font-size: 0.82rem; color: var(--text-muted); padding-top: 2px; }
.bc-no-story { margin-top: 18px; background: white; border: 1px dashed var(--border-light); border-radius: 16px; padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.9rem; }

/* ▸ 고급(개발자용) 접기 — 기존 상세 UI 보존 */
.lineage-advanced { margin-top: 14px; border-top: 1px solid var(--border-light); padding-top: 6px; }
.lineage-advanced__summary { cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--text-muted); padding: 8px 2px; }
.lineage-advanced__summary:hover { color: var(--accent); }
.lineage-advanced__tools { display: flex; gap: 8px; margin: 8px 0 4px; }

@media (max-width: 600px) {
  .build-check { padding: 16px; }
  .bc-headline { flex-direction: column; align-items: flex-start; gap: 6px; }
  .bc-pct { font-size: 1.6rem; }
  /* [2026-06-06] 좁은 화면: 헤더 액션(타임스탬프+분석버튼)이 제목 아래 한 줄로 깔끔히. */
  .lineage-actions { width: 100%; justify-content: flex-start; flex-wrap: wrap; }
}

/* [2026-05-21] 분석 중 카드 — stage + 진행률 + ETA. design.vue 6분 대기와 동일 톤. */
.lineage-analyzing {
  margin-top: 18px;
  padding: 28px 28px 24px;
  background: white;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: lineageAnalyzingFade 0.3s ease-out;
}
@keyframes lineageAnalyzingFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.lineage-analyzing__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.lineage-analyzing__spin { color: var(--accent); flex-shrink: 0; margin-top: 2px; }
.lineage-analyzing__head-text { flex: 1; min-width: 0; }
.analyzing-title { font-size: 1rem; font-weight: 800; color: var(--text-main); margin: 0 0 4px; }
.analyzing-desc { font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.55; }

.analyzing-stages {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.analyzing-stage {
  flex: 1 1 0;
  min-width: 120px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--bg-light, #F7F5EB);
  border: 1px solid var(--border-light);
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  opacity: 0.6;
  transition: all 0.3s;
}
.analyzing-stage-num {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: rgba(0,0,0,0.05);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.72rem;
  flex-shrink: 0;
}
.analyzing-stage-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.analyzing-stage--done {
  opacity: 0.85;
  background: rgba(46, 123, 51, 0.08);
  border-color: rgba(46, 123, 51, 0.25);
  color: #2E7B33;
}
.analyzing-stage--done .analyzing-stage-num {
  background: rgba(46, 123, 51, 0.25);
  color: #2E7B33;
}
.analyzing-stage--active {
  opacity: 1;
  background: linear-gradient(135deg, rgba(140,98,57,0.12) 0%, rgba(140,98,57,0.06) 100%);
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 2px 8px rgba(140,98,57,0.12);
}
.analyzing-stage--active .analyzing-stage-num {
  background: var(--accent);
  color: white;
}

.analyzing-current {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-main);
  line-height: 1.6;
  font-family: 'Pretendard Variable', sans-serif;
}

.analyzing-progress { margin-top: 4px; }
.analyzing-progress-bar {
  height: 6px;
  background: rgba(0,0,0,0.05);
  border-radius: 9999px;
  overflow: hidden;
  position: relative;
}
.analyzing-progress-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #D4B896 0%, #8C6239 100%);
  box-shadow: 0 0 10px rgba(140,98,57,0.3);
  transition: width 0.6s cubic-bezier(.16,1,.3,1);
  position: relative;
}
.analyzing-progress-fill::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 22px;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 100%);
  animation: lineageShimmer 1.6s ease-in-out infinite;
}
@keyframes lineageShimmer {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.9; }
}
.analyzing-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 6px;
  font-family: 'Outfit', sans-serif;
}
.analyzing-progress-pct {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: 0.04em;
}
.analyzing-progress-eta {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .lineage-analyzing { animation: none; }
  .analyzing-progress-fill,
  .analyzing-progress-fill::after { animation: none; transition: none; }
}
@media (max-width: 600px) {
  .analyzing-stages { flex-direction: column; gap: 6px; }
  .analyzing-stage { width: 100%; min-width: 0; }
  /* [2026-05-30] 모바일 터치 타겟 확대 (26→38px). */
  .icon-btn { width: 38px; height: 38px; }
}

.lineage-result { margin-top: 18px; }
.lineage-summary-card { display: grid; grid-template-columns: 1fr auto; gap: 24px; background: linear-gradient(135deg, #2A2421 0%, #3D2E1E 100%); color: white; border-radius: 16px; padding: 22px 26px; margin-bottom: 18px; }
.lineage-summary-text { font-family: 'Pretendard Variable', sans-serif; font-size: 0.95rem; font-weight: 600; line-height: 1.6; }
.lineage-summary-stats { display: flex; gap: 18px; align-items: center; }
.summary-stat { display: flex; flex-direction: column; align-items: flex-end; }
.summary-stat .stat-num { font-family: 'Outfit', sans-serif; font-size: 1.5rem; font-weight: 900; color: #fff; line-height: 1; }
.summary-stat .stat-label { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.6rem; font-weight: 700; color: rgba(255,255,255,0.6); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 3px; }
.summary-stat--warn .stat-num { color: #FFB85A; }

.lineage-tabs { display: flex; gap: 4px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 4px; }
.lineage-tab { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; background: white; border: 1px solid var(--border-light); border-radius: 9999px; font-family: 'Outfit', sans-serif; font-size: 0.76rem; font-weight: 700; color: var(--text-main); cursor: pointer; transition: all .15s; white-space: nowrap; }
.lineage-tab:hover { border-color: var(--accent); }
.lineage-tab.active { background: var(--accent); color: white; border-color: var(--accent); }
.lineage-tab--warn { border-color: rgba(224,138,60,0.4); }
.lineage-tab--warn .lineage-tab-count { background: rgba(224,138,60,0.2); color: #B46723; }
.lineage-tab.lineage-tab--warn.active { background: #E08A3C; border-color: #E08A3C; }
.lineage-tab.lineage-tab--warn.active .lineage-tab-count { background: rgba(255,255,255,0.2); color: white; }
.lineage-tab-count { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.65rem; font-weight: 800; background: var(--bg-light); padding: 1px 8px; border-radius: 9999px; color: var(--text-muted); }
.lineage-tab.active .lineage-tab-count { background: rgba(255,255,255,0.2); color: white; }
.lineage-tab--special { background: linear-gradient(135deg, var(--accent), #C89B6A); color: white; border-color: var(--accent); }
.lineage-tab--special.active { box-shadow: 0 4px 14px rgba(140,98,57,0.3); }

.lineage-filterbar {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  margin-bottom: 10px; padding: 10px 12px;
  background: var(--bg-light); border-radius: 10px;
}
.lineage-search {
  display: flex; align-items: center; gap: 6px;
  background: white; border: 1px solid var(--border-light); border-radius: 8px;
  padding: 4px 10px; min-width: 240px;
}
.lineage-search-icon { color: var(--text-muted); flex-shrink: 0; }
.lineage-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 0.82rem; color: var(--text-main); font-family: 'Pretendard Variable', sans-serif;
  padding: 4px 0;
}
.lineage-search-clear {
  width: 18px; height: 18px; border: none; background: var(--bg-light);
  border-radius: 50%; cursor: pointer; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
}
.lineage-search-clear:hover { background: var(--accent); color: white; }
.lineage-filter-group { display: flex; flex-wrap: wrap; gap: 4px; }
.lineage-chip {
  padding: 5px 12px; background: white; border: 1px solid var(--border-light);
  border-radius: 9999px; cursor: pointer; transition: all .12s;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--text-main);
}
.lineage-chip:hover { border-color: var(--accent); }
.lineage-chip.active { background: var(--accent); color: white; border-color: var(--accent); }
.lineage-repo-select {
  padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-light);
  background: white; font-size: 0.78rem; font-family: 'Pretendard Variable', sans-serif;
  color: var(--text-main); cursor: pointer; max-width: 180px;
}
.lineage-clear-btn {
  padding: 5px 12px; background: transparent; border: 1px solid rgba(192,57,43,0.3);
  border-radius: 9999px; cursor: pointer;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: #C0392B; transition: all .12s;
}
.lineage-clear-btn:hover { background: #C0392B; color: white; border-color: #C0392B; }
.lineage-count { margin-left: auto; font-size: 0.72rem; color: var(--text-muted); }

.lineage-list { display: flex; flex-direction: column; gap: 6px; background: white; border: 1px solid var(--border-light); border-radius: 12px; padding: 8px; }
.lineage-item { border-radius: 8px; transition: background .12s; }
.lineage-item:hover { background: var(--bg-light); }
.lineage-item-head-wrap { display: flex; align-items: stretch; gap: 4px; }
.lineage-item-head-wrap .lineage-item-head { flex: 1; }
.lineage-item-head { display: grid; grid-template-columns: 18px 1fr auto; gap: 12px; align-items: center; padding: 10px 14px; background: transparent; border: none; cursor: pointer; width: 100%; text-align: left; }
.lineage-arrow-toggle { display: inline-block; transition: transform .15s; font-size: 0.7rem; color: var(--text-muted); width: 12px; }
.lineage-arrow-toggle.open { transform: rotate(90deg); }
.lineage-item-title { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.item-name { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 800; color: var(--text-main); }
.item-id { font-size: 0.7rem; color: var(--text-muted); margin-left: 4px; }
.item-endpoint { font-size: 0.72rem; color: var(--accent); background: rgba(140,98,57,0.08); padding: 1px 8px; border-radius: 4px; width: max-content; margin-top: 2px; }
.impl-count { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.7rem; font-weight: 700; background: var(--bg-light); padding: 3px 10px; border-radius: 9999px; color: var(--text-muted); }
.lineage-impls { display: flex; flex-direction: column; gap: 4px; padding: 4px 14px 12px 38px; overflow: hidden; }
.impl-row { display: grid; grid-template-columns: 70px 1fr 26px; gap: 10px; align-items: center; padding: 8px 12px; background: white; border: 1px solid var(--border-light); border-radius: 8px; transition: all .12s; }
.impl-row:hover { border-color: var(--accent); }
.impl-confidence { display: inline-block; font-family: 'Outfit', sans-serif; font-size: 0.62rem; font-weight: 800; color: white; padding: 3px 8px; border-radius: 4px; text-align: center; letter-spacing: 0.04em; }
.impl-info { min-width: 0; cursor: pointer; }
.impl-path { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-main); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.impl-role-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.impl-reason { font-size: 0.7rem; color: var(--text-muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.impl-empty { font-size: 0.78rem; color: var(--text-muted); padding: 8px 12px; }

.missing-row { display: grid; grid-template-columns: 80px 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; background: rgba(224,138,60,0.04); border: 1px solid rgba(224,138,60,0.2); border-radius: 8px; margin-bottom: 4px; }
.missing-type { display: inline-block; font-size: 0.65rem; font-weight: 800; color: #B46723; background: rgba(224,138,60,0.15); padding: 3px 8px; border-radius: 4px; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; }
.missing-info { min-width: 0; }
.missing-name { font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 700; color: var(--text-main); }
.missing-name small { color: var(--text-muted); margin-left: 4px; }
.missing-reason { font-size: 0.74rem; color: var(--text-muted); margin-top: 3px; }
.missing-icon { color: #E08A3C; flex-shrink: 0; }

.lineage-empty { text-align: center; padding: 28px; font-size: 0.85rem; color: var(--text-muted); font-weight: 600; }

/* Matrix */
.matrix-wrap { background: white; border: 1px solid var(--border-light); border-radius: 14px; overflow: hidden; }
.matrix-head { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; padding: 18px 22px; background: var(--bg-light); border-bottom: 1px solid var(--border-light); }
.matrix-coverage { display: flex; align-items: center; gap: 14px; min-width: 280px; }
.coverage-label { font-size: 0.6rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.1em; }
.coverage-value { font-size: 1.8rem; font-weight: 900; color: var(--text-main); line-height: 1; }
.coverage-value small { font-size: 0.9rem; color: var(--text-muted); margin-left: 2px; }
.coverage-bar { flex-grow: 1; height: 7px; background: var(--bg-page); border: 1px solid var(--border-light); border-radius: 9999px; overflow: hidden; min-width: 80px; }
.coverage-bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #C89B6A); border-radius: 9999px; transition: width .6s ease; }
.coverage-stat { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; }
.matrix-filters { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.matrix-filter-btn { padding: 6px 14px; background: white; border: 1px solid var(--border-light); border-radius: 9999px; cursor: pointer; transition: all .12s; font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700; color: var(--text-main); }
.matrix-filter-btn:hover { border-color: var(--accent); }
.matrix-filter-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
.matrix-filter-btn--warn.active { background: #E08A3C; border-color: #E08A3C; }

.matrix-th-type { width: 90px; }
.matrix-th-id { width: 100px; }
.matrix-th-status { width: 110px; }
.matrix-table-wrap { overflow-x: auto; max-height: 600px; }
.matrix-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.matrix-table thead { position: sticky; top: 0; background: white; z-index: 1; }
.matrix-table th { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.64rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.06em; text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--border-light); }
.matrix-table th.text-right { text-align: right; }
.matrix-table td.text-right { text-align: right; }
.matrix-table td { padding: 12px 16px; border-bottom: 1px solid var(--border-light); vertical-align: top; }
.matrix-table tr:hover { background: var(--bg-light); }
.matrix-table tr:last-child td { border-bottom: none; }
.matrix-row--missing { background: rgba(224,138,60,0.04); }
.matrix-row--missing:hover { background: rgba(224,138,60,0.08); }
.matrix-type-pill { display: inline-block; font-family: 'Outfit', sans-serif; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.04em; padding: 3px 10px; border-radius: 4px; background: var(--bg-light); color: var(--text-muted); }
.matrix-type-pill--agg { background: rgba(148,96,184,0.12); color: #5E3789; }
.matrix-type-pill--api { background: rgba(140,98,57,0.12); color: var(--accent); }
.matrix-type-pill--svc { background: rgba(199,127,74,0.15); color: #875024; }
.matrix-type-pill--str { background: rgba(91,161,96,0.12); color: #2E7B33; }
.matrix-id { font-size: 0.74rem; color: var(--text-muted); }
.matrix-name { font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 700; color: var(--text-main); }
.matrix-endpoint { display: inline-block; margin-top: 4px; font-size: 0.7rem; color: var(--accent); background: rgba(140,98,57,0.08); padding: 1px 8px; border-radius: 4px; }
.matrix-reason { font-size: 0.7rem; color: #B46723; margin-top: 4px; }
.matrix-file-link { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-main); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: background .12s; max-width: 100%; }
.matrix-file-link:hover { background: rgba(140,98,57,0.08); color: var(--accent); }
.matrix-file-link--unverified { text-decoration: line-through wavy rgba(192,57,43,0.5); color: #C0392B; }
.matrix-file-link--unverified:hover { background: rgba(192,57,43,0.08); color: #A0291F; }
.matrix-more-count { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.65rem; font-weight: 700; color: var(--text-muted); background: var(--bg-light); padding: 1px 7px; border-radius: 9999px; margin-left: 6px; }
.matrix-no-impl { font-size: 1.2rem; }
.status-pill { display: inline-block; font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.04em; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; }
.status-pill--missing { background: rgba(224,138,60,0.15); color: #B46723; }
.matrix-empty { text-align: center !important; padding: 40px 20px !important; color: var(--text-muted); font-size: 0.85rem; }

/* Quality summary */
.quality-summary-card { margin-bottom: 16px; padding: 16px 20px; background: linear-gradient(135deg, rgba(46, 64, 54, 0.06) 0%, rgba(140, 98, 57, 0.04) 100%); border: 1px solid rgba(46, 64, 54, 0.18); border-radius: 14px; }
.quality-summary-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.quality-pill { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.6rem; font-weight: 800; background: var(--primary-moss); color: white; padding: 3px 10px; border-radius: 9999px; letter-spacing: 0.08em; }
.quality-summary-title { font-family: 'Outfit', sans-serif; font-size: 0.82rem; font-weight: 800; color: var(--text-main); }
.quality-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.quality-metric { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; background: white; border: 1px solid var(--border-light); border-radius: 10px; }
.quality-metric-label { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.62rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase; }
.quality-metric-value { font-family: 'Outfit', sans-serif; font-size: 1.4rem; font-weight: 900; color: var(--primary-moss); line-height: 1.1; }
.quality-metric-sub { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.62rem; color: var(--text-muted); margin-top: 2px; }
.quality-summary-empty { margin-bottom: 16px; padding: 12px 16px; background: rgba(140, 98, 57, 0.04); border: 1px dashed var(--border-light); border-radius: 10px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; }

/* truth-edit-btn */
.truth-edit-btn { flex-shrink: 0; width: 36px; min-height: 100%; align-self: stretch; border: 1px solid var(--border-light); border-left: none; background: white; color: var(--text-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; border-radius: 0 8px 8px 0; }
.truth-edit-btn:hover { background: var(--accent); color: white; border-color: var(--accent); }
.truth-edit-btn--labeled { background: rgba(46, 64, 54, 0.08); color: var(--primary-moss); border-color: rgba(46, 64, 54, 0.25); }
.truth-edit-btn--labeled:hover { background: var(--primary-moss); color: white; border-color: var(--primary-moss); }

/* Zero-match banner */
.zero-match-banner { display: flex; gap: 14px; align-items: flex-start; padding: 16px 20px; margin-bottom: 16px; background: linear-gradient(135deg, rgba(255, 165, 0, 0.06) 0%, rgba(244, 67, 54, 0.04) 100%); border: 1px solid rgba(244, 67, 54, 0.18); border-radius: 14px; }
.zero-match-icon { color: #E08A3C; flex-shrink: 0; margin-top: 2px; }
.zero-match-body { flex: 1; }
.zero-match-title { font-family: 'Outfit', sans-serif; font-size: 0.92rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px; }
.zero-match-desc { font-size: 0.8rem; color: var(--text-main); line-height: 1.5; margin-bottom: 8px; }
.zero-match-checklist { list-style: disc; padding-left: 20px; margin: 0 0 12px 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.7; }
.zero-match-checklist code { background: white; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border-light); font-size: 0.74rem; }
.zero-match-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.zero-match-btn { display: inline-flex; align-items: center; background: var(--accent); color: white; border: none; border-radius: 9999px; padding: 7px 16px; font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; transition: opacity 0.15s; }
.zero-match-btn:hover { opacity: 0.85; }
.zero-match-tip { font-size: 0.72rem; color: var(--text-muted); font-style: italic; }

/* Lineage flow nodes */
.lineage-node { font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 800; padding: 8px 14px; border-radius: 10px; background: var(--bg-light); color: var(--text-main); border: 1px solid var(--border-light); white-space: nowrap; }
.lineage-node--meeting { background: rgba(232,196,154,0.25); border-color: rgba(184,137,92,0.4); }
.lineage-node--cps { background: rgba(159,191,224,0.2); border-color: rgba(80,133,200,0.4); color: #2C5A93; }
.lineage-node--prd { background: rgba(168,212,171,0.25); border-color: rgba(91,161,96,0.45); color: #2E7B33; }
.lineage-node--spack { background: rgba(244,184,165,0.25); border-color: rgba(216,122,94,0.4); color: #984433; }
.lineage-node--ddd { background: rgba(212,168,224,0.22); border-color: rgba(148,96,184,0.4); color: #5E3789; }
.lineage-node--arch { background: rgba(240,204,138,0.3); border-color: rgba(199,127,74,0.4); color: #875024; }
.lineage-design-stack { display: flex; flex-direction: column; gap: 4px; }
.lineage-arrow { font-size: 1.1rem; color: var(--text-muted); font-weight: 900; }
.lineage-arrow--big { font-size: 1.4rem; color: var(--accent); }
.lineage-repos { display: flex; flex-direction: column; gap: 6px; }
.lineage-repo-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: white; border: 1.5px solid; border-radius: 9999px; font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 800; color: var(--text-main); }
.lineage-repo-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.expand-enter-active, .expand-leave-active { transition: opacity .15s ease, max-height .2s ease; overflow: hidden; }
.expand-enter-from, .expand-leave-to { opacity: 0; max-height: 0; }
.expand-enter-to, .expand-leave-from { opacity: 1; max-height: 600px; }

.icon-btn { width: 26px; height: 26px; border: 1px solid transparent; background: transparent; border-radius: 6px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; transition: all .12s; }
.icon-btn:hover { color: var(--accent); border-color: var(--border-light); background: var(--bg-light); }

.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
</style>
