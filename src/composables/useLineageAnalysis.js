/**
 * Lineage 분석 상태 + 액션 (모듈 레벨 shared state).
 *
 * 같은 인스턴스를 useLineageAnalysis() 호출하는 모든 컴포넌트가 공유 — 부모/자식
 * 컴포넌트 간 props 드릴링 없이 동기화 (useSnackbar와 동일 패턴).
 *
 * 책임:
 *   - 분석 데이터 + 캐시 로드
 *   - 분석 실행 (elapsed timer 포함)
 *   - 활성 탭 / 매트릭스 필터 / 펼친 아이템 상태
 *   - 파생 데이터 (탭 카운트, 매트릭스 행, zero-match 진단)
 *
 * 부수적 의존:
 *   - useHarnessStore (analyzeLineage, fetchLastLineage)
 *   - useSnackbar (실패 시 재시도 토스트)
 *   - useConfirm (unverified 파일 열기 경고)
 */
import { ref, computed } from 'vue'
import { useHarnessStore } from '@/store/harness'
import i18n from '@/plugins/i18n'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import { buildLineageSummary } from '@/utils/lineageSummary'

// ─── 모듈 레벨 state (싱글톤) ─────────────────────────────────
const lineageData = ref(null)
const lineageSavedAt = ref(null)
const lineageMsg = ref('')
const expandedItems = ref({})
const lineageActiveTab = ref('aggregates') // 'stories' | 'aggregates' | 'apis' | 'services' | 'missing'
const matrixFilter = ref('all')             // 'all' | 'high' | 'medium' | 'low' | 'unverified' | 'missing'
const lineageElapsedSec = ref(0)
let lineageElapsedTimer = null

// [2026-05 progress fix] 진행바를 "경과 시간"이 아니라 BE 가 보내는 "실제 단계"
// 기준으로 채운다. BE lineage 파이프라인이 단계 시작마다 stage 마커를 emit하고
// (lineage:fetch/trees/match/saving), analyzeLineage 의 onStage 로 전달된다.
const LINEAGE_STAGES = [
  { id: 'fetch',  label: 'Repo 파일 트리 수집',  desc: '등록된 Repo 의 파일 목록을 GitHub 에서 가져오는 중' },
  { id: 'match',  label: 'Design ↔ 코드 매핑',   desc: '산출물 이름·설명과 실제 파일 경로를 매칭 중' },
  { id: 'verify', label: '정확도 검증',           desc: '매칭 신뢰도 평가 + 환각 차단 (실제 존재 파일만)' },
]
// BE stage 마커 → FE 단계 인덱스 + 진행률(%). 단계 전환 시 진행바가 실제로 오른다.
const LINEAGE_STAGE_MAP = {
  'lineage:fetch':  { idx: 0, pct: 12 },
  'lineage:trees':  { idx: 0, pct: 38 },  // repo 트리 수집 — 가장 오래 걸리는 구간
  'lineage:match':  { idx: 1, pct: 75 },
  'lineage:saving': { idx: 2, pct: 92 },
}
const lineageJobStage = ref('')

const lineageCurrentStageIdx = computed(() => LINEAGE_STAGE_MAP[lineageJobStage.value]?.idx ?? 0)

const lineageProgressPct = computed(() => {
  const mapped = LINEAGE_STAGE_MAP[lineageJobStage.value]
  if (mapped) return mapped.pct
  // 첫 단계 신호 전 — 8% 이내에서만 살짝 (멈춰 보이지 않게)
  if (lineageElapsedSec.value <= 0) return 2
  return Math.min(8, 2 + Math.round(lineageElapsedSec.value / 4))
})

// 경과 시간 라벨 (보조 정보) — 진행바와 별개. "남은 시간"은 단계 기반에선
// 추정이 부정확해 제거하고, 실제 경과만 보조로 표시.
const lineageEtaText = computed(() => {
  const m = Math.floor(lineageElapsedSec.value / 60)
  const s = lineageElapsedSec.value % 60
  return m === 0 ? `경과 ${s}초` : `경과 ${m}분 ${s}초`
})

// ─── 분석 이력 (BE 단일 진실원) ──────────────────────────────
// 이전: localStorage 만 (디바이스 의존, 시크릿 모드 손실).
// 현재: BE `/api/v2/lineage/history` 가 LineageResult 노드 기반 최신 N 개 반환.
// 본문은 별도 endpoint `/api/v2/lineage/history/{id}` 로 lazy fetch.
import axios from '@/utils/axios'
import { T_SHORT_MS, T_DEFAULT_MS } from '@/utils/timeouts'

const MAX_HISTORY = 10

export const getLineageHistory = async (pn) => {
  if (!pn) return []
  try {
    const response = await axios.get('/api/v2/lineage/history', {
      params: { project_name: pn, limit: MAX_HISTORY },
      timeout: T_SHORT_MS,
    })
    return Array.isArray(response.data) ? response.data : []
  } catch (_) {
    return []
  }
}

// 단일 분석 본문 fetch (diff 화면용).
export const getLineageById = async (pn, lineageId) => {
  if (!pn || !lineageId) return null
  try {
    const response = await axios.get(`/api/v2/lineage/history/${encodeURIComponent(lineageId)}`, {
      params: { project_name: pn },
      timeout: T_DEFAULT_MS,
    })
    return response.data || null
  } catch (_) {
    return null
  }
}

// ─── 파생 ─────────────────────────────────────────────────────
const lineageTabCounts = computed(() => ({
  stories: lineageData.value?.stories?.length || 0,
  aggregates: lineageData.value?.aggregates?.length || 0,
  apis: lineageData.value?.apis?.length || 0,
  services: lineageData.value?.services?.length || 0,
  missing: lineageData.value?.missingImpl?.length || 0,
}))

// 산출물 리스트 검색/필터 (D)
const lineageSearch = ref('')
const lineageConfidenceFilter = ref('all') // 'all' | 'high' | 'medium' | 'low' | 'unverified' | 'none'
const lineageRepoFilter = ref('')          // '' = 모든 repo, 또는 특정 repoUrl

const matchesSearch = (item, q) => {
  if (!q) return true
  const needle = q.toLowerCase()
  const fields = [item.name, item.id, item.endpoint].filter(Boolean).map(s => String(s).toLowerCase())
  if (fields.some(f => f.includes(needle))) return true
  // implementations.filePath에서도 검색
  for (const impl of (item.implementations || [])) {
    if (String(impl.filePath || '').toLowerCase().includes(needle)) return true
  }
  return false
}

const matchesConfidence = (item, mode) => {
  if (mode === 'all') return true
  const impls = item.implementations || []
  if (mode === 'none') return impls.length === 0
  return impls.some(i => i.confidence === mode)
}

const matchesRepo = (item, repoUrl) => {
  if (!repoUrl) return true
  return (item.implementations || []).some(i => i.repoUrl === repoUrl)
}

const lineageItems = computed(() => {
  if (!lineageData.value) return []
  const raw = lineageData.value[lineageActiveTab.value] || []
  return raw.filter(item =>
    matchesSearch(item, lineageSearch.value)
    && matchesConfidence(item, lineageConfidenceFilter.value)
    && matchesRepo(item, lineageRepoFilter.value),
  )
})

const lineageItemsTotal = computed(() => {
  if (!lineageData.value) return 0
  return (lineageData.value[lineageActiveTab.value] || []).length
})

const lineageHasZeroMatch = computed(() => {
  if (!lineageData.value) return false
  const total = lineageData.value.stats?.totalImpls
  if (typeof total === 'number') return total === 0
  const all = ['stories', 'aggregates', 'apis', 'services']
    .flatMap(k => lineageData.value[k] || [])
  if (all.length === 0) return false
  return all.every(it => !(it.implementations && it.implementations.length))
})

// Spec → Impl 매트릭스 (모든 산출물을 한 표로)
const matrixRows = computed(() => {
  if (!lineageData.value) return []
  const rows = []
  const types = [
    { key: 'aggregates', label: 'Aggregate', short: 'AGG' },
    { key: 'apis',       label: 'API',       short: 'API' },
    { key: 'services',   label: 'Service',   short: 'SVC' },
    { key: 'stories',    label: 'Story',     short: 'STR' },
  ]
  const order = { high: 0, medium: 1, low: 2 }
  for (const t of types) {
    for (const item of (lineageData.value[t.key] || [])) {
      const impls = item.implementations || []
      const sorted = [...impls].sort((a, b) => (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3))
      rows.push({
        type: t.label,
        typeShort: t.short,
        id: item.id || '',
        name: item.name || '',
        endpoint: item.endpoint || '',
        bestImpl: sorted[0] || null,
        allImpls: impls,
        implCount: impls.length,
        missing: false,
      })
    }
  }
  for (const m of (lineageData.value.missingImpl || [])) {
    rows.push({
      type: (m.type || 'item').charAt(0).toUpperCase() + (m.type || 'item').slice(1),
      typeShort: (m.type || 'ITM').slice(0, 3).toUpperCase(),
      id: m.id || '', name: m.name || '', endpoint: '',
      bestImpl: null, allImpls: [], implCount: 0,
      missing: true, reason: m.reason || '',
    })
  }
  return rows
})

const filteredMatrix = computed(() => {
  if (matrixFilter.value === 'all') return matrixRows.value
  if (matrixFilter.value === 'missing') return matrixRows.value.filter(r => r.missing)
  return matrixRows.value.filter(r => !r.missing && r.bestImpl?.confidence === matrixFilter.value)
})

const matrixCoveragePct = computed(() => {
  const total = matrixRows.value.length
  if (!total) return 0
  const covered = matrixRows.value.filter(r => !r.missing).length
  return Math.round((covered / total) * 100)
})

// [2026-06-06 재설계] 비전문가용 단순 결과 카드 — Story 중심 요약(순수 util 위임).
const lineageSummary = computed(() => buildLineageSummary(lineageData.value))

// ─── 헬퍼 ─────────────────────────────────────────────────────
export const confidenceColor = (c) => ({
  high: '#5BA160', medium: '#E08A3C', low: '#8A817C', unverified: '#C0392B',
}[c] || '#8A817C')

export const confidenceLabel = (c) => {
  const t = i18n.global.t
  const key = `enums.confidence.${c}`
  const val = t(key)
  // key 를 그대로 돌려받으면 (미등록 값) 원본 표시
  return val !== key ? val : (c || '—')
}

// [2026-06-06 재설계] 단순 결과 카드 전용 평어 확신도 (고급의 confidenceLabel 과 별개).
// 비전문가용 — "정확히 찾음 / 비슷한 곳에서 찾음 / 약하게 추정 / 미확인".
export const confidenceFriendly = (c) => {
  const t = i18n.global.t
  const key = `deliverables.lineage.result.conf_${c}`
  const val = t(key)
  return val !== key ? val : (c || '—')
}

// ─── 액션 ─────────────────────────────────────────────────────
const startElapsedTimer = () => {
  lineageElapsedSec.value = 0
  lineageJobStage.value = ''  // 단계 신호 초기화 — 새 분석은 0단계부터
  if (lineageElapsedTimer) clearInterval(lineageElapsedTimer)
  lineageElapsedTimer = setInterval(() => { lineageElapsedSec.value++ }, 1000)
}

const stopElapsedTimer = () => {
  if (lineageElapsedTimer) clearInterval(lineageElapsedTimer)
  lineageElapsedTimer = null
}

export const useLineageAnalysis = () => {
  const store = useHarnessStore()
  const { showErrorWithRetry } = useSnackbar()
  const confirm = useConfirm()

  const isAnalyzingLineage = computed(() => store.isAnalyzingLineage)

  const loadLineageFromCache = async () => {
    if (!store.projectName) return
    const result = await store.fetchLastLineage({ projectName: store.projectName })
    if (result.success && result.data) {
      lineageData.value = result.data
      lineageSavedAt.value = result.savedAt || null
    } else {
      lineageData.value = null
      lineageSavedAt.value = null
    }
  }

  const triggerAnalyzeLineage = async () => {
    lineageMsg.value = '분석 중... (등록된 Repo와 Design을 종합 분석, 1~3분 소요)'
    startElapsedTimer()
    const result = await store.analyzeLineage({
      projectName: store.projectName,
      // [progress fix] BE 단계 마커를 받아 진행바를 작업량 기반으로 갱신
      onStage: (stage) => { lineageJobStage.value = stage },
    })
    stopElapsedTimer()
    if (result.success) {
      lineageData.value = result.data
      lineageSavedAt.value = result.savedAt
      // history 는 BE 의 LineageResult 노드 저장 시점에 자동 누적 — FE 측 push 불필요.
      lineageMsg.value = `✓ 분석 완료 (${lineageElapsedSec.value}초 소요)`
      setTimeout(() => { lineageMsg.value = '' }, 4000)
    } else {
      lineageMsg.value = `분석 실패: ${result.error}`
      showErrorWithRetry(`Lineage 분석 실패: ${result.error}`, triggerAnalyzeLineage)
    }
  }

  const toggleExpand = (key) => {
    expandedItems.value = { ...expandedItems.value, [key]: !expandedItems.value[key] }
  }

  // unverified 파일은 확인 다이얼로그 띄움 — 사용자에게 repo 메타(branch) 전달
  const openFile = async (repoUrl, filePath, options = {}) => {
    if (options.unverified) {
      const ok = await confirm({
        title: '⚠ 미확인 경로',
        message:
          '이 파일 경로는 AI가 추정한 것으로 실제 존재 여부가 검증되지 않았습니다.\n' +
          'GitHub에서 404가 뜰 수 있습니다.\n\n경로: ' + filePath + '\n\n계속 열까요?',
        confirmText: '열기',
        variant: 'danger',
      })
      if (!ok) return
    }
    const branch = options.branch || 'main'
    const full = `${repoUrl.replace(/\/$/, '')}/blob/${branch}/${filePath}`
    window.open(full, '_blank', 'noopener')
  }

  return {
    // state
    lineageData,
    lineageSavedAt,
    lineageMsg,
    expandedItems,
    lineageActiveTab,
    matrixFilter,
    lineageElapsedSec,
    lineageJobStage,
    isAnalyzingLineage,
    lineageSearch,
    lineageConfidenceFilter,
    lineageRepoFilter,
    // computed
    lineageTabCounts,
    lineageItems,
    lineageItemsTotal,
    lineageHasZeroMatch,
    matrixRows,
    filteredMatrix,
    matrixCoveragePct,
    lineageSummary,
    // [2026-05-21] 진행률 + ETA — 1~3분 대기 동안 stage / 남은 시간 / 진행률 노출
    LINEAGE_STAGES,
    lineageCurrentStageIdx,
    lineageProgressPct,
    lineageEtaText,
    // actions
    loadLineageFromCache,
    triggerAnalyzeLineage,
    toggleExpand,
    openFile,
  }
}
