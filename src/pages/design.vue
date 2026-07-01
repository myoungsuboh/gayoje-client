<script setup>
import { ref, watch, onMounted, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { RefreshCw, Sparkles, FolderOpen, ArrowUpRight, Link2, HelpCircle, Share2, MoreHorizontal } from 'lucide-vue-next'
import { useDisplay } from 'vuetify'
import SubTabRow from '@/components/common/SubTabRow.vue'
import { useHarnessStore, API_BASE } from '@/store/harness'
import NotionExportDialog from '@/components/plan/NotionExportDialog.vue'
import { useNotionExport } from '@/composables/useNotionExport'
import { useProjectStore } from '@/store/project'
import axios from '@/utils/axios'
import { extractTaskId, pollJobUntilDone } from '@/utils/asyncJob'
import { isGuideSeen } from '@/utils/guideSeen'
import { extractRaw, isSpackEmpty, isDddEmpty, isArchitectureEmpty } from '@/utils/designFetch'
import { useSnackbar } from '@/composables/useSnackbar'

const { showSuccess, showWarning, showError } = useSnackbar()

import SpackTab from '@/components/design/SpackTab.vue'
import DddTab from '@/components/design/DddTab.vue'
import ArchitectureTab from '@/components/design/ArchitectureTab.vue'
import DesignProgressOverlay from '@/components/design/DesignProgressOverlay.vue'
import DesignStaleModal from '@/components/design/DesignStaleModal.vue'
import DesignImpactDetail from '@/components/design/DesignImpactDetail.vue'
import AiDraftNotice from '@/components/common/AiDraftNotice.vue'
import LineageGraphModal from '@/components/design/LineageGraphModal.vue'
import ErdGraphModal from '@/components/design/ErdGraphModal.vue'
import DesignGuideModal from '@/components/design/DesignGuideModal.vue'
import VibePackageModal from '@/components/design/VibePackageModal.vue'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import ProjectNotReadyCard from '@/components/common/ProjectNotReadyCard.vue'
import StaleBanner from '@/components/common/StaleBanner.vue'
import { useProjectReadiness } from '@/composables/useProjectReadiness'
import { provideDesignCrossLink } from '@/composables/useDesignCrossLink'
// [2026-06] design 성공 시 완성도 점수 재조회 — 디자인은 SPACK/DDD/Arch 를 새로
// 만들고 그 직후 빈 API 를 자동 채우므로(BE design_pipeline_job 의 inline autofill)
// 점수가 바뀐다. 같은 탭에 머물러 EvalScoreCard 가 remount 안 될 때도 % 가 갱신되도록.
import { notifyEvalScoreRefresh } from '@/composables/useEvalScore'
// [2026-05 Phase 6] 다운로드용 순수 헬퍼는 utils 로 분리 (테스트 가능 + 컴포넌트 슬림화).

const store = useHarnessStore()
const projectStore = useProjectStore()
const { dialogOpen: notionOpen, docs: notionDocs, open: openNotionExport } = useNotionExport()
const designTab = ref('spack')

// [2026-05-19 Phase 2] cross-jump 매핑 공유 — 자식 탭에 inject.
// 자식 탭이 fetchData 후 setSpackData/setDddData/setArchData 호출.
// requestedJump 변경되면 watcher 가 탭 전환.
const crossLink = provideDesignCrossLink()
watch(() => crossLink.requestedJump.value, (jump) => {
  if (!jump?.tab) return
  if (designTab.value !== jump.tab) designTab.value = jump.tab
})
const isUpdating = ref(false)
// [2026-06 리팩토링] 설계 생성 진행 단계 마커 — 폴링(onProgress)이 set,
// DesignProgressOverlay 로 prop 전달. (진행 표시 로직 자체는 컴포넌트로 분리)
const jobStage = ref('')
const { xs } = useDisplay()
const { t } = useI18n()

// [D — 2026-05] 그래프 모달 — Lineage(관계 추적) 진입점. ERD 는 모달 안 토글로 전환.
const isLineageGraphOpen = ref(false)
const openLineageGraph = () => { isLineageGraphOpen.value = true }

// [2026-06] ERD 뷰 — 별도 상단 버튼 대신 그래프 모달 헤더의 [Lineage|ERD] 토글로 진입.
const isErdGraphOpen = ref(false)
// 두 모달이 같은 헤더 토글을 공유 — 한쪽을 닫고 다른쪽을 열어 뷰를 전환(검증된 렌더 경로 보존).
const switchGraphView = (v) => {
  if (v === 'erd') { isLineageGraphOpen.value = false; isErdGraphOpen.value = true }
  else { isErdGraphOpen.value = false; isLineageGraphOpen.value = true }
}

// 사용 가이드 — Plan 페이지와 동일 패턴. 계정당 최초 1회 자동 표시, 이후엔 헬프 버튼으로 수동.
const DESIGN_GUIDE_SEEN_KEY = 'gayoje_design_guide_seen_v1'
const showGuide = ref(false)
const openGuide = () => { showGuide.value = true }

// 프로젝트 진입 가드 — 미팅 로그 / CPS / PRD 가 갖춰지지 않았으면 페이지 본문 대신
// ProjectNotReadyCard 노출. 신규 프로젝트 + 빈 상태에서 빈 그리드 / 403 raw 에러
// 노출하던 문제 해소.
const readiness = useProjectReadiness()


const isPulsing = ref(false)


// [2026-05-26] createMD 를 v2 비동기 큐 패턴으로 호출. sync route (Caddy 305s
// 안에 LLM × 3 못 끝나면 Network Error) 우회. 응답 정규화: { spack_md, ddd_md,
// arch_md, project_name } 으로 sync 응답과 동일 형태 반환.
//
// [API_BASE 함정] API_BASE = '/api/gateway' (gateway_compat prefix). v2 라우트는
// VITE_API_BASE_URL 사용 필수 — 잘못 prefix 붙이면 _DISPATCH 미등록 → 410.



/* removed duplicate crossLink */

/**
 * Architecture 데이터 fetch.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.expectData=false] true 면 빈 응답 시 자동 재시도 (~3회).
 *   createSpack 직후 BE consistency lag 회피용.
 */

const jumpTargetServiceId = computed(() => {
  const sel = crossLink.selectedNode.value
  return sel?.kind === 'service' ? sel.id : null
})

watch(() => crossLink.requestedJump.value, async (jump) => {
  if (!jump || jump.tab !== 'architecture') return
  await new Promise(r => requestAnimationFrame(r))
  const sel = `[data-arch-node="${jump.kind}:${jump.id}"]`
  const el = document.querySelector(sel)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, { immediate: true })

/* removed duplicate isPulsing */





// [Phase 3.6 — 2026-05] Design source-stale 알림.
// PRD 가 갱신됐는데 (미팅 로그 등록 / Epic·Story 수정 / PRD markdown 편집)
// Design (SPACK/DDD/Arch) 은 옛 PRD 기준 → "최신 업데이트" 유도 배너 표시.
// BE 의 (:Project {name}).design_source_stale 플래그를 읽어 v-if 분기.
const designSourceStale = ref(false)
const isDismissingDesignStale = ref(false)

// [2026-06-01] PRD 변경 시 "설계도 다시 만들기" 안내 모달.
// 배너(StaleBanner)는 상단에 조용히 떠서 놓치기 쉬움 → design 진입 시 한 번 더 또렷한
// 모달로 알린다. 단 같은 변경(design_source_stale_at)엔 1회만(localStorage 기억) →
// 페이지를 드나들 때마다 반복 팝업하지 않게. 새 PRD 변경(새 _at)이면 다시 뜬다.
const showDesignStaleModal = ref(false)
const designStaleAt = ref(null)

// [B — 2026-06] 그래프 임팩트 분석.
// flat boolean(stale)만으로는 "무엇이 왜 바뀌어야 하는지" 알 수 없음 → BE 가
// DERIVED_FROM 엣지를 역순회해 돌려주는 'design 재생성 이후 수정된 Epic/Story →
// 영향받는 설계 노드(API/화면/엔티티 등)' 를 받아 배너에 펼쳐 보여준다.
const designImpact = ref({ changed_nodes: [], total_affected_design_count: 0 })
const impactExpanded = ref(false)
// 영향받는 설계 노드가 1개라도 있으면 "정밀 모드" — 그래프 추적 결과 노출.
const hasImpactDetail = computed(() => (designImpact.value?.changed_nodes?.length || 0) > 0)
// [2026-06 리팩토링] impact 상세 렌더 + prdNodeLabelKo/summarizeCascade/tierLabel 은
// DesignImpactDetail.vue 로 이동. designImpact/impactExpanded 상태와 fetchDesignImpact 는 여기 유지.
const _designStaleSeenKey = () => `gayoje_design_stale_seen_${store.projectName || ''}`
const _markDesignStaleSeen = () => {
  try {
    if (designStaleAt.value != null) {
      localStorage.setItem(_designStaleSeenKey(), String(designStaleAt.value))
    }
  } catch { /* localStorage 차단 환경 — 무시 */ }
}
const closeDesignStaleModal = () => {
  _markDesignStaleSeen()          // 같은 변경엔 다시 안 뜨게
  showDesignStaleModal.value = false
}
// "지금 다시 만들기" — 기존 재생성 흐름(handleLatestUpdate) 그대로 재사용 + 모달 닫기.
const regenerateFromStaleModal = () => {
  _markDesignStaleSeen()
  showDesignStaleModal.value = false
  handleLatestUpdate()
}
const _maybeOpenDesignStaleModal = () => {
  // 가이드 모달 동시 노출 / 재생성 진행 중 / 빈생성 노티스 중엔 보류 (배너와 동일 맥락).
  if (showGuide.value || isUpdating.value || emptyGenNotice.value) return
  if (!designSourceStale.value || designStaleAt.value == null) return
  let seen = ''
  try { seen = localStorage.getItem(_designStaleSeenKey()) || '' } catch { /* 무시 */ }
  if (String(designStaleAt.value) !== seen) showDesignStaleModal.value = true
}

// [2026-05-27 #2] 최신 업데이트 결과 진단 노출.
// BE 가 diagnostic.empty_generation + layer 별 카운트를 돌려주는데 이전엔 FE 가
// 버려서 "왜 SPACK/DDD 가 비었는지" 알 수 없었음. 빈 생성이면 이 노티스로 원인
// (PRD Epic·Story 부족 / auto_cleanup 결과) 을 표시하고 재생성을 유도.
// null 이면 노티스 숨김. { title, subtitle } 형태.
const emptyGenNotice = ref(null)
const dismissEmptyGenNotice = () => { emptyGenNotice.value = null }

// [2026-06-04] 바이브 코딩 CTA 상태:
//   - 데이터 없음(미준비)         → 버튼 자체를 숨김 (v-if)
//   - 데이터 있으나 옛 PRD 기준(stale) 또는 빈 layer → 버튼 보이되 평범 (먼저 '최신 업데이트')
//   - 데이터가 최신(현재 PRD 반영) → 버튼 테두리가 은은히 빛남 → "지금 진행하세요" 신호
const isDesignLatest = computed(
  () => readiness.isReady.value && !designSourceStale.value && !emptyGenNotice.value && !isUpdating.value,
)

// diagnostic 의 layer 별 카운트를 짧은 한 줄 요약으로.
const formatDesignCounts = (diag) => {
  const s = diag.spack || {}
  const d = diag.ddd || {}
  const a = diag.architecture || {}
  return (
    `SPACK API ${s.api_count ?? 0}·Entity ${s.entity_count ?? 0}·Policy ${s.policy_count ?? 0}` +
    ` / DDD Aggregate ${d.aggregate_count ?? 0}` +
    ` / Arch Service ${a.service_count ?? 0}`
  )
}

// auto_cleanup 상태를 사람-친화 문구로 (빈 생성 원인 진단 보조).
const formatAutoCleanupHint = (autoCleanup) => {
  if (!autoCleanup) return ''
  if (autoCleanup.applied) return t('design.toast.cleanup_hint_applied')
  if (autoCleanup.attempted) return t('design.toast.cleanup_hint_attempted')
  return ''
}

const fetchDesignStaleStatus = async () => {
  if (!store.projectName || !store.projectName.trim()) {
    designSourceStale.value = false
    return
  }
  try {
    // v2 라우트는 axios baseURL (VITE_API_BASE_URL) 로 직접 — API_BASE(/api/gateway)
    // 를 붙이면 /api/gateway/api/v2/... 이중 prefix 로 gateway compat 이 거부.
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    const { data } = await axios.get(`${base}/api/v2/design/source-stale`, {
      params: { project_name: store.projectName },
    })
    designSourceStale.value = !!data?.design_source_stale
    designStaleAt.value = data?.design_source_stale_at ?? null
    // stale 이면 진입 시 1회 모달로 또렷하게 안내 (배너는 그대로 영구 리마인더).
    _maybeOpenDesignStaleModal()
    // stale 일 때만 impact 상세 조회 — 평상시 불필요한 그래프 순회 회피.
    if (designSourceStale.value) fetchDesignImpact()
    else designImpact.value = { changed_nodes: [], total_affected_design_count: 0 }
  } catch (err) {
    // 권한/네트워크 실패 — 배너만 안 띄우고 silent. 사용자 경험엔 다른 에러로 충분히 전달됨.
    console.warn('[design] stale status fetch 실패:', err?.message || err)
    designSourceStale.value = false
  }
}

// [B — 2026-06] 영향받는 설계 노드 조회. 실패해도 배너 자체는 유지 (best-effort 보강).
const fetchDesignImpact = async () => {
  if (!store.projectName || !store.projectName.trim()) return
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    const { data } = await axios.get(`${base}/api/v2/design/impact`, {
      params: { project_name: store.projectName },
    })
    designImpact.value = {
      changed_nodes: Array.isArray(data?.changed_nodes) ? data.changed_nodes : [],
      total_affected_design_count: data?.total_affected_design_count ?? 0,
    }
  } catch (err) {
    // impact 는 부가 정보 — 실패 시 기존 flat 배너로 fallback (graceful degradation).
    console.warn('[design] impact fetch 실패:', err?.message || err)
    designImpact.value = { changed_nodes: [], total_affected_design_count: 0 }
  }
}

const dismissDesignStale = async () => {
  if (!store.projectName || isDismissingDesignStale.value) return
  isDismissingDesignStale.value = true
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    await axios.post(`${base}/api/v2/design/source-stale/dismiss`, {
      project_name: store.projectName,
    })
    designSourceStale.value = false
    showSuccess?.(t('design.toast.dismiss_success'), { timeout: 3000 })
  } catch (err) {
    console.error('[design] stale dismiss 실패:', err)
    showError?.(t('design.toast.dismiss_error'))
  } finally {
    isDismissingDesignStale.value = false
  }
}

onMounted(() => {
  if (!isGuideSeen(DESIGN_GUIDE_SEEN_KEY)) showGuide.value = true
  // force=true — Plan 페이지에서 미팅 로그/CPS/PRD 생성 후 돌아올 때
  // stale 캐시가 false 를 반환하는 문제 방지. Design 진입 시 항상 fresh 조회.
  readiness.check(true)
  fetchDesignStaleStatus()
})
watch(() => store.projectName, () => {
  readiness.check(true)
  fetchDesignStaleStatus()
})

// [2026-06 리팩토링] 진행 오버레이(단계/진행률/ETA/가이드 + 경과 타이머)는
// DesignProgressOverlay 컴포넌트로 분리. 여기선 jobStage(위에서 선언)만 폴링이 set 하고
// isUpdating/isCancelling 과 함께 prop 으로 넘긴다.

const spackRef = ref(null)
const dddRef = ref(null)
const archRef = ref(null)

// [2026-06-03 → 2026-06-13] 디자인 페이지 전역 '바이브 코딩 패키지' CTA.
// 이전엔 모달이 ArchitectureTab 안에 있어 Architecture 로 탭 전환 후에만 열렸음
// ("굳이 Architecture 에서만 받게 한다" 피드백) → 모달을 VibePackageModal 로 분리해
// SPACK/DDD 어디서든 탭 전환 없이 바로 연다. 설계 미생성 가드는 모달이 자체 확인.
const isVibePackageOpen = ref(false)
const openVibePackage = () => {
  if (!store.projectName || !readiness.isReady.value) return
  isVibePackageOpen.value = true
}

// [중지 기능 — 2026-05-18, 2026-05-27 비동기 큐 대응]
// 사용자가 LLM 체인을 도중에 중지할 수 있도록 AbortController + task_id 보관.
// [2026-05-27] 비동기 큐 전환 후엔 abort 만으로 worker 가 안 멈춤 (HTTP 연결과 분리).
//   1) abort() → pollJobUntilDone 가 signal 로 폴링 즉시 중단 (overlay 닫힘)
//   2) cancelJob API → BE 가 Redis cancel flag set → worker(design_pipeline_job)가
//      stage 사이마다 감지해 최종 Neo4j commit 전에 graceful 종료 (기존 데이터 보존)
const updateAbortController = ref(null)
const isCancelling = ref(false)
const currentTaskId = ref(null)  // 진행 중 작업 task_id — 중지 시 worker 취소 신호용

const handleCancelUpdate = () => {
  if (!isUpdating.value || !updateAbortController.value) return
  if (isCancelling.value) return  // 이미 abort 진행 중 — 중복 클릭 방지
  if (!window.confirm(t('design.cancel_confirm'))) return
  isCancelling.value = true
  // (1) FE 폴링 중단 — pollJobUntilDone 가 signal.aborted 로 즉시 CanceledError.
  updateAbortController.value.abort()
  // (2) worker 취소 신호 — abort 는 폴링만 멈추므로 worker 는 별도로 멈춰야 한다.
  //     best-effort: 실패해도 폴링은 이미 멈췄고, flag 없으면 worker 가 끝까지 돌 뿐.
  const tid = currentTaskId.value
  if (tid) {
    axios.post(`${API_BASE}/cancelJob`, {}, { params: { task_id: tid }, timeout: 10_000 })
      .catch(err => console.warn('[design] cancelJob 실패(무시):', err?.message || err))
  }
}

// [2026-06-10 불필요 재생성 게이트] 설계(SPACK)가 이미 존재하는지 가벼운 조회.
// 실패(권한/네트워크)는 false — 게이트 없이 진행하는 보수적 fallback.
const _hasExistingSpack = async () => {
  try {
    const { data } = await axios.get(`${API_BASE}/getSpack`, {
      params: { projectName: store.projectName },
      timeout: 15_000,
      _silent: true,
    })
    const inner = data?.result
    const d = Array.isArray(inner) ? inner[0] : inner
    return !!(d?.apis?.length || d?.entities?.length || d?.policies?.length)
  } catch {
    return false
  }
}

// [2026-06 버그수정] 설계 '완성도' 판정 — SPACK·DDD·Architecture 3레이어가 모두 채워졌는지.
// PRD 미변경(stale=false)은 '신선도' 신호일 뿐 완성도와 별개다 — BE 가 빈 레이어 생성에도
// design_source_stale=false 로 reset(의도적 디커플)하므로, SPACK 만 있고 DDD/Arch 가 빈
// 불완전 설계도 stale=false 가 된다. 그걸 '이미 최신'으로 오판해 보완 재생성을 막던 버그가
// 있어, 재생성 게이트는 _hasExistingSpack(SPACK 만) 대신 이 함수로 판정한다.
// 빈 응답 판정은 각 탭과 동일한 정규 헬퍼(isSpackEmpty/isDddEmpty/isArchitectureEmpty) 재사용.
// 실패(권한/네트워크)는 false → 보수적으로 게이트 없이 진행(= 재생성 허용).
const _isDesignComplete = async () => {
  try {
    const params = { projectName: store.projectName }
    const opts = { params, timeout: 15_000, _silent: true }
    const [s, d, a] = await Promise.all([
      axios.get(`${API_BASE}/getSpack`, opts),
      axios.get(`${API_BASE}/getDDD`, opts),
      axios.get(`${API_BASE}/getArchitecture`, opts),
    ])
    return (
      !isSpackEmpty(extractRaw(s)) &&
      !isDddEmpty(extractRaw(d)) &&
      !isArchitectureEmpty(extractRaw(a))
    )
  } catch {
    return false
  }
}

// [2026-06] Notion 공유 가드 — 설계(SPACK) 존재 여부. SPACK 은 design 파이프라인의
// 첫 산출물이라 'SPACK 있음 = 공유할 설계 있음' 지표. 진입/프로젝트 전환 시 1회 조회
// (watch immediate), 재생성 성공 후엔 crossLink 의 갱신 데이터가 OR 로 즉시 반영된다.
const hasExistingDesign = ref(false)
const refreshDesignExistence = async () => {
  hasExistingDesign.value = store.projectName ? await _hasExistingSpack() : false
}
const hasDesignData = computed(() => {
  if (hasExistingDesign.value) return true
  const s = crossLink.spackData.value || {}
  const d = crossLink.dddData.value || {}
  const a = crossLink.archData.value || {}
  return !!(
    s.apis?.length || s.entities?.length || s.policies?.length ||
    d.contexts?.length || d.aggregates?.length || d.domain_entities?.length || d.domain_events?.length ||
    a.services?.length || a.databases?.length
  )
})
watch(() => store.projectName, refreshDesignExistence, { immediate: true })

// 게이트 검사(getSpack 조회) 동안의 재진입 차단 — isUpdating 가드와 set 사이에
// 생긴 비동기 갭에서 더블클릭 시 잡이 두 번 enqueue 되는 것 방지.
let _gateChecking = false

const handleLatestUpdate = async () => {
  if (isUpdating.value || _gateChecking) return
  // [2026-05] 프로젝트 미선택 시 BE 호출 막기 — 빈 projectName 으로 호출 시
  // BE 가 400/404 응답 후 사용자에게 어색한 에러 메시지 노출되는 문제 해결.
  if (!store.projectName || !store.projectName.trim()) {
    showError(t('design.toast.no_project'))
    return
  }
  // [2026-06-10 불필요 재생성 게이트] PRD 미변경(stale=false) + 설계가 '완성'(3레이어 모두)
  // 이면 전체 3-LLM 재생성(수 분 + AI 사용량)이 같은 결과를 다시 만들 뿐 — 사용자 확인 후 진행.
  // [2026-06 버그수정] 이전엔 _hasExistingSpack(SPACK 존재만) 으로 게이트해서, SPACK 만 있고
  // DDD/Arch 가 빈 '불완전' 설계도 stale=false 면 "이미 최신(fresh_regen_confirm)"으로 막혔다.
  // (stale=신선도≠완성도 — BE 디커플) → _isDesignComplete(3레이어 모두 채워짐)으로 판정.
  // 불완전이면 게이트 없이 바로 재생성해 보완한다. 첫 생성(설계 없음)도 게이트 없이 바로.
  _gateChecking = true
  try {
    if (!designSourceStale.value && (await _isDesignComplete())) {
      if (!window.confirm(t('design.fresh_regen_confirm'))) return
    }
  } finally {
    _gateChecking = false
  }
  isUpdating.value = true
  isCancelling.value = false
  jobStage.value = ''  // 새 실행 — 단계 마커 초기화(원본 startElapsed 가 하던 것).
                       // 경과 타이머는 DesignProgressOverlay 가 isUpdating watch 로 시작.
  const controller = new AbortController()
  updateAbortController.value = controller
  try {
    // [2026-05-26 비동기 큐 전환] 이전: POST /createSpack sync — Caddy 305s timeout
    // 안에 Spack+DDD+Arch 3 LLM 못 끝나면 "Network Error". 이후: POST
    // /api/v2/pipelines/design (enqueue + task_id) → pollJobUntilDone (20분 한계).
    // worker job_timeout (1200s) 안에서 stage 별로 처리 + 재시도 → robust.
    //
    // [2026-05-26 hotfix] API_BASE 는 '/api/gateway' prefix (gateway_compat 라우터용).
    // v2 라우트는 root /api/v2/* 라 VITE_API_BASE_URL (보통 '') 사용 필수 —
    // 잘못 API_BASE 쓰면 /api/gateway/api/v2/* 가 되어 _DISPATCH 미등록 → 410 Gone.
    const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
    const enqueueRes = await axios.post(
      `${v2Base}/api/v2/pipelines/design`,
      { project_name: store.projectName },
      { timeout: 15_000, signal: controller.signal },  // enqueue 자체는 빠름 (Redis push)
    )
    const taskId = extractTaskId(enqueueRes.data)
    if (!taskId) {
      throw new Error(t('design.toast.update_enqueue_failed'))
    }
    currentTaskId.value = taskId  // 중지 시 cancelJob 으로 worker 취소
    const info = await pollJobUntilDone(taskId, {
      intervalMs: 2000,
      maxWaitMs: 20 * 60 * 1000,  // 20분 — Spack/DDD/Arch 3 stage sequential, 대형 PRD 대응
      signal: controller.signal,  // [2026-05-27] 중지 시 폴링 즉시 중단 (overlay 닫힘)
      // [progress fix] BE 가 보내는 실제 단계로 진행바 갱신 (design:spack/ddd/architecture/saving)
      onProgress: (i) => { if (i?.stage) jobStage.value = i.stage },
    })
    // 비동기 응답을 기존 sync 응답 형태로 정규화 (result.data 구조 보존).
    const response = { data: { result: 'success', ...(info?.result || {}) } }
    if (response.data && response.data.result === 'cancelled') {
      showWarning?.(t('design.toast.update_cancelled'), { timeout: 5000 })
      return
    }
    // [2026-05-28] 누더기+거대 PRD fail-fast — BE 가 10분 매달리지 않고 즉시 안내.
    // 이전엔 design 이 Architecture 단계에서 멈췄다 10분 timeout 으로 crash 했음.
    if (response.data && response.data.result === 'precheck_failed') {
      showError(
        response.data.message || t('design.toast.precheck_failed_fallback'),
        { timeout: 15000 },
      )
      return
    }
    if (response.data && response.data.result === 'success') {
      // [2026-05-27 #2/#3] layer 별 빈 생성 여부 — BE diagnostic.empty_generation.
      // 하나라도 비면 설계 불완전 → emptyGenNotice 로 원인 안내.
      const diag = response.data.diagnostic || {}
      const emptyGen = diag.empty_generation || {}
      const designIncomplete = !!(emptyGen.spack || emptyGen.ddd || emptyGen.architecture)
      const autoCleanup = diag.auto_cleanup || {}
      // [2026-06-01 stale 디커플] 재생성 성공 = 최신 PRD 기준으로 다시 만든 것이므로
      // '옛 PRD 기준'(StaleBanner)은 무조건 해제. 불완전(빈 layer)은 완성도≠최신성이라
      // emptyGenNotice 로만 안내. BE 도 성공 시 design_source_stale=false 로 reset
      // (둘이 일치). 이전엔 불완전 시 stale 유지 → 막 재생성해도 배너가 안 사라지는
      // 모순이 있었음.
      designSourceStale.value = false
      // 재생성 = 최신 PRD 반영 → 영향 추적 결과도 더 이상 유효하지 않으므로 비움.
      designImpact.value = { changed_nodes: [], total_affected_design_count: 0 }
      impactExpanded.value = false
      if (designIncomplete) {
        const emptyLayers = [
          emptyGen.spack && 'SPACK',
          emptyGen.ddd && 'DDD',
          emptyGen.architecture && 'Architecture',
        ].filter(Boolean).join(' · ')
        emptyGenNotice.value = {
          title: t('design.toast.incomplete_notice_title', { layers: emptyLayers }),
          subtitle: t('design.toast.incomplete_notice_subtitle', {
            counts: formatDesignCounts(diag),
            hint: formatAutoCleanupHint(autoCleanup),
          }),
        }
      } else {
        emptyGenNotice.value = null
      }
      // readiness 강제 갱신 — ProjectNotReadyCard 가 보이던 상태(첫 생성 직후)에서
      // 최신 업데이트를 눌렀을 때 content div 가 v-else 로 렌더 안 돼 archRef 가
      // null 이던 문제 해소. 갱신 완료 후 nextTick 에서 DOM 이 업데이트됨.
      await readiness.check(true)
      // [2026-05] BE 가 응답에 top-level health 포함 — cross-stage 정합성 위반 여부.
      // has_errors=true 면 사용자에게 "설계는 완료됐지만 명세 정합성 위반 있음" 안내.
      // top_violation_codes 가 있으면 어느 카테고리 깨졌는지 짧게 표시.
      const health = response.data.health || {}
      // autoCleanup 은 위 #2/#3 블록에서 이미 diag.auto_cleanup 으로 추출됨.
      const designTab_ = 'architecture'
      // 사용자가 어디 탭에 있든, 결과 fetch 후 Architecture 로 이동.
      // 이유: 다음 액션 (= 바이브 코딩 패키지 다운로드) 이 Architecture 탭에 있음.
      // 자동 이동 + CTA pulse 로 "이제 여기서 받으세요" 무언의 안내.
      designTab.value = designTab_
      await nextTick()
      // [2026-05-21 fix] createSpack BE 가 'success' 보낸 직후 GET 호출 시 빈 응답
      // 받는 케이스 (Neo4j commit ↔ index visibility 짧은 lag) — 사용자가 "최신
      // 업데이트 끝났는데 빈 화면" 답답함. expectData:true 로 빈 응답 시 자동 재시도
      // (3회, 800ms 간격). 추가로 SPACK/DDD 도 일괄 refetch — v-if 로 unmount 된
      // 상태라 ref 호출 못 하지만, 다음 탭 진입 시 onMounted 가 fetch 하므로 BE
      // 데이터가 그때까지 visible 하면 빈 화면 없음. cross-link composable 의 데이터도
      // 신선 유지. 일괄 refetch 의 직접 효과는 archRef 의 expectData 재시도가 핵심.
      if (archRef.value) {
        await archRef.value.fetchData({ expectData: true })
      }
      // mount 된 다른 탭이 있으면 (이론상 v-if/else-if 라 0개지만 방어적) 함께 재호출.
      if (spackRef.value) await spackRef.value.fetchData({ expectData: true })
      if (dddRef.value) await dddRef.value.fetchData({ expectData: true })
      // [2026-06] 완성도 점수 강제 재조회 — design 이 SPACK/DDD/Arch 재생성 + inline
      // autofill 로 점수를 바꿨다. 같은 탭에 머물러 EvalScoreCard 가 remount 안 돼도
      // % 가 즉시 갱신되도록 refresh 버스를 emit (BE eval-score 는 DB 기준 ~100ms).
      notifyEvalScoreRefresh()
      // auto_cleanup 결과를 메시지 prefix 로 — 사용자에게 무엇이 일어났는지 명시.
      // applied=true: "PRD 자동 정리 (N%↓) + " prefix.
      // attempted=true & applied=false: "PRD 자동 정리 시도 실패 — " warning.
      const cleanupAppliedPrefix = autoCleanup.applied
        ? t('design.toast.cleanup_applied_prefix', { pct: autoCleanup.reduction_pct ?? 0 })
        : ''
      const cleanupFailWarning = (autoCleanup.attempted && !autoCleanup.applied)
        ? t('design.toast.cleanup_fail_warning')
        : ''

      if (designIncomplete) {
        // [2026-05-27 #2] 빈 생성 — 가장 우선 안내. 카운트 + 원인 + 다음 행동.
        // 헤더의 노티스 배너(emptyGenNotice)가 영구적으로 같은 내용을 보여줌.
        const emptyLayers = [
          emptyGen.spack && 'SPACK',
          emptyGen.ddd && 'DDD',
          emptyGen.architecture && 'Architecture',
        ].filter(Boolean).join('·')
        showWarning?.(
          t('design.toast.incomplete_layers', {
            layers: emptyLayers,
            counts: formatDesignCounts(diag),
            hint: formatAutoCleanupHint(autoCleanup),
          }),
          { timeout: 12000 },
        )
      } else if (health.has_errors) {
        // BE 는 top_violation_codes 를 [{code, count}, ...] 객체 배열로 보냄.
        // 이전 호환 위해 string 도 허용.
        const top = (health.top_violation_codes || [])[0]
        const topCode = typeof top === 'string' ? top : (top?.code || '')
        const codeHint = topCode ? ` (예: ${topCode})` : ''
        showWarning?.(
          cleanupFailWarning +
          t('design.toast.has_errors', { count: health.total_errors, code_hint: codeHint }),
          { timeout: 10000 },
        )
      } else if (cleanupFailWarning) {
        // cleanup 실패만 단독으로 warning — design 자체는 무사.
        showWarning?.(
          cleanupFailWarning + t('design.toast.design_complete_with_cleanup_fail'),
          { timeout: 9000 },
        )
      } else if (health.has_warnings) {
        showSuccess(
          cleanupAppliedPrefix +
          t('design.toast.design_complete_with_warnings', { count: health.total_warnings }),
          { timeout: 7000 },
        )
      } else {
        showSuccess(
          cleanupAppliedPrefix + t('design.toast.design_complete'),
          { timeout: 7000 },
        )
      }
    } else {
      throw new Error(t('design.toast.update_error'))
    }
  } catch (error) {
    // 사용자 abort 는 정상 동작 — 에러 토스트 대신 안내 토스트.
    // axios 는 abort 시 CanceledError (name) / 'ERR_CANCELED' (code) 로 표시.
    const isAbort = axios.isCancel?.(error) || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError'
    if (isAbort) {
      showWarning?.(t('design.toast.update_cancelled'), { timeout: 5000 })
      return
    }
    console.error('업데이트 실패:', error)
    const status = error?.response?.status
    const detail = error?.response?.data?.detail
    const msg = error?.message || ''
    // pollJobUntilDone 의 가시적 에러 — 사용자 행동 가이드까지 포함.
    if (status === 503) {
      showError(t('design.toast.queue_unavailable'), { timeout: 10000 })
    } else if (status === 429) {
      showError(t('design.toast.rate_limited'))
    } else if (status === 422) {
      showError(detail || t('design.toast.update_failed_fallback'), { timeout: 12000 })
    } else if (msg.includes('시간 안에 완료되지')) {
      showError(t('design.toast.update_timeout'), { timeout: 15000 })
    } else if (msg.includes('작업을 찾을 수 없')) {
      showError(t('design.toast.update_not_found'))
    } else {
      showError(t('design.toast.update_failed_msg', { msg: msg || t('design.toast.update_unknown_error') }))
    }
  } finally {
    isUpdating.value = false
    isCancelling.value = false
    updateAbortController.value = null
    currentTaskId.value = null
    // 경과 타이머는 DesignProgressOverlay 가 isUpdating=false 를 watch 해 정지.
  }
}
</script>

<template>
  <div class="design-root custom-scroll page-root">
    <!-- 설계 생성 진행 오버레이 — DesignProgressOverlay 로 분리 (2026-06 리팩토링).
         isUpdating/jobStage/isCancelling 을 넘기고 중지는 cancel emit 으로 받는다.
         (VOverlay teleport + :deep 스타일도 컴포넌트 scope 로 1:1 이동) -->
    <DesignProgressOverlay
      :is-updating="isUpdating"
      :job-stage="jobStage"
      :is-cancelling="isCancelling"
      @cancel="handleCancelUpdate"
    />

    <!-- Header -->
    <div class="design-header">
      <div class="mb-4 design-headline-row">
        <div class="design-headline-text">
          <h2 class="text-h4 font-weight-black text-main tracking-tight serif-text">{{ $t('design.headline.title') }}</h2>
          <p class="text-caption text-muted mt-2 font-weight-medium">{{ $t('design.headline.desc') }}</p>
        </div>
        <div class="design-headline-actions">
          <!-- [2026-06-03] 전역 바이브 코딩 패키지 CTA — '사용 가이드' 왼쪽에 배치.
               [2026-06-04] 데이터(설계) 없으면 숨김(v-if), 데이터가 최신이면 테두리가
               은은히 빛나 "다음 스텝(바이브 코딩)으로 진행하세요" 를 유도. -->
          <button
            v-if="store.projectName && readiness.isReady.value"
            type="button"
            class="design-vibe-btn"
            :class="{ 'design-vibe-btn--ready': isDesignLatest }"
            @click="openVibePackage"
            :title="$t('design.vibe_cta_title')"
          >
            <Sparkles :size="14" />
            <span>{{ $t('design.arch.vibe_btn') }}</span>
          </button>
          <button
            type="button"
            class="design-guide-btn"
            @click="openGuide"
            title="Design 페이지 사용 가이드 다시 보기"
          >
            <HelpCircle :size="14" />
            <span>{{ $t('design.headline.guide_btn') }}</span>
          </button>
        </div>
      </div>

      <!-- [Phase 3.6] PRD 가 갱신된 후 Design 이 아직 옛 PRD 기준일 때 노란 배너.
           "최신 업데이트로 다시 생성" 클릭 시 handleLatestUpdate() 가 createSpack 호출,
           성공 시 BE 트랜잭션이 stale=false 자동 reset (BE-4) → 배너 사라짐. -->
      <!-- [2026-05-27 #2] 빈 생성 노티스 — 최신 업데이트 후 SPACK/DDD/Arch 중
           일부가 생성되지 않았을 때 원인 + 재생성 유도. generic stale 배너보다
           구체적이라 함께 뜨면 emptyGenNotice 우선 (아래 generic 은 suppress). -->
      <StaleBanner
        v-if="emptyGenNotice && store.projectName && !isUpdating"
        :title="emptyGenNotice.title"
        :subtitle="emptyGenNotice.subtitle"
      >
        <template #actions>
          <button
            class="stale-banner__btn stale-banner__btn--primary"
            type="button"
            :disabled="!store.projectName"
            @click="handleLatestUpdate"
            title="PRD 기준으로 SPACK · DDD · Architecture 를 다시 생성"
          >
            <RefreshCw :size="11" class="mr-1" />{{ $t('design.action.regen') }}
          </button>
          <button
            class="stale-banner__btn"
            type="button"
            @click="dismissEmptyGenNotice"
            title="이 안내만 닫기"
          >
            {{ $t('design.action.close') }}
          </button>
        </template>
      </StaleBanner>

      <StaleBanner
        v-if="designSourceStale && store.projectName && !isUpdating && !emptyGenNotice"
        :title="$t('design.stale.prd_changed_title')"
        :subtitle="hasImpactDetail
          ? $t('design.stale.prd_changed_subtitle_impact', { changed: designImpact.changed_nodes.length, affected: designImpact.total_affected_design_count })
          : $t('design.stale.prd_changed_subtitle_generic')"
      >
        <!-- [B — 2026-06] 그래프 임팩트 상세 — 어떤 기획 변경이 어떤 설계에 영향 주는지.
             DERIVED_FROM 엣지가 추적된 경우에만 노출 (없으면 기존 flat 배너 그대로). -->
        <template v-if="hasImpactDetail" #detail>
          <DesignImpactDetail
            :changed-nodes="designImpact.changed_nodes"
            :expanded="impactExpanded"
            @toggle="impactExpanded = !impactExpanded"
          />
        </template>
        <template #actions>
          <button
            class="stale-banner__btn stale-banner__btn--primary"
            type="button"
            :disabled="!store.projectName"
            @click="handleLatestUpdate"
            title="현재 PRD 기준으로 SPACK · DDD · Architecture 를 다시 생성"
          >
            <RefreshCw :size="11" class="mr-1" />{{ $t('design.action.regen_full') }}
          </button>
          <button
            class="stale-banner__btn"
            type="button"
            :disabled="isDismissingDesignStale"
            @click="dismissDesignStale"
            title="알림만 닫기 — Design 은 재생성되지 않음"
          >
            {{ $t('design.action.ignore') }}
          </button>
        </template>
      </StaleBanner>

      <!-- [2026-06-01] PRD 변경 → 설계도 재생성 유도 모달 (UI: DesignStaleModal 로 분리).
           열기 조건/seen 기억/재생성 로직은 여기(design.vue)에 유지하고 표시만 위임. -->
      <DesignStaleModal
        v-model="showDesignStaleModal"
        :project-name="store.projectName"
        @later="closeDesignStaleModal"
        @regenerate="regenerateFromStaleModal"
      />

                  <SubTabRow
        v-model="designTab"
        :tabs="[
          { value: 'spack', title: $t('design.tabs.spack'), subtitle: 'SPACK', guide: 'spack-tab' },
          { value: 'ddd', title: $t('design.tabs.ddd'), subtitle: 'DDD', guide: 'ddd-tab' },
          { value: 'architecture', title: $t('design.tabs.architecture'), subtitle: 'Architecture', guide: 'architecture-tab' },
        ]"
      >
        <template #trailing>
          <!-- [D — 2026-05] Lineage Graph 모달 진입 — PRD ↔ Design 전체 추적성 시각화 -->
          <!-- [2026-06] 모바일 정리: 데스크톱은 3버튼 그대로, 모바일(xs)에선 '최신 업데이트'만
               노출하고 Lineage·Notion 은 ⋯ 메뉴로 접어 툴바 혼잡 해소.
               [2026-06] 데스크톱 버튼 순서: Lineage → Notion → 최신 업데이트(최우측·핵심 액션, 사용자 요청). -->
          <span v-if="!xs" class="d-inline-flex align-center action-group">
            <button
              class="action-btn action-btn--lineage"
              @click="openLineageGraph"
              :disabled="!store.projectName"
              :title="!store.projectName ? $t('design.empty_project.title') : '전체 PRD ↔ Design lineage 그래프 보기'"
            >
              <Link2 :size="14" class="action-btn__icon" />
              <span class="action-btn__label">Lineage Graph</span>
            </button>
            <GuideTooltip target="lineage-graph" placement="bottom" />
          </span>
          <!-- [2026-06] ERD 는 그래프 모달 안 [Lineage|ERD] 토글로 진입 (상단 버튼 제거) -->
          <span v-if="store.projectName && !xs" class="d-inline-flex align-center action-group">
            <button
              class="action-btn"
              :disabled="!hasDesignData"
              :title="hasDesignData ? $t('plan.notion.export_title') : $t('plan.notion.no_design_data')"
              @click="openNotionExport(['design'])"
            >
              <Share2 :size="14" class="action-btn__icon" />
              <span class="action-btn__label">Notion</span>
            </button>
            <GuideTooltip target="design-notion" placement="bottom" />
          </span>
          <!-- [2026-05] projectName 없으면 버튼 disabled — 클릭해도 동작 X.
               (handleLatestUpdate 안에서도 가드, 이중 안전.) 모바일에서도 항상 노출(핵심 액션). -->
          <span class="d-inline-flex align-center action-group">
            <button
              class="action-btn action-btn--update"
              @click="handleLatestUpdate"
              :disabled="isUpdating || !store.projectName"
              :title="!store.projectName ? $t('design.empty_project.title') : (isUpdating ? $t('design.action.updating') : $t('design.action.update'))"
            >
              <RefreshCw :size="14" :class="['action-btn__icon', { 'spin': isUpdating }]" />
              <span class="action-btn__label">{{ isUpdating ? $t('design.action.updating') : $t('design.action.update') }}</span>
            </button>
            <GuideTooltip target="design-latest-update" placement="bottom" />
          </span>

          <!-- [모바일 전용] Lineage·Notion 을 ⋯ 더보기 메뉴로 (HISTORY 메뉴와 동일 패턴) -->
          <v-menu v-if="xs" location="bottom end">
            <template #activator="{ props }">
              <button
                class="action-btn action-btn--more"
                v-bind="props"
                :title="$t('common.action.more')"
                :aria-label="$t('common.action.more')"
              >
                <MoreHorizontal :size="16" class="action-btn__icon" />
              </button>
            </template>
            <v-list density="compact" min-width="184" class="design-more-list">
              <v-list-item :disabled="!store.projectName" @click="openLineageGraph">
                <template #prepend><Link2 :size="16" class="mr-2" /></template>
                <v-list-item-title>Lineage Graph</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="store.projectName" :disabled="!hasDesignData" @click="openNotionExport(['design'])">
                <template #prepend><Share2 :size="16" class="mr-2" /></template>
                <v-list-item-title>Notion</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>
      </SubTabRow>
    </div>

    <!-- [D — 2026-05] 그래프 모달 — Lineage/ERD 헤더 토글로 상호 전환 -->
    <LineageGraphModal v-model="isLineageGraphOpen" @switch-view="switchGraphView" />

    <!-- [2026-06] ERD (데이터 구조) 모달 — 같은 토글 공유 -->
    <ErdGraphModal v-model="isErdGraphOpen" @switch-view="switchGraphView" />

    <!-- Design 사용 가이드 모달 (SPACK / DDD / Architecture 설명) -->
    <DesignGuideModal v-model="showGuide" />

    <!-- 바이브 코딩 시작 패키지 — 어느 서브탭에서든 탭 전환 없이 (2026-06-13 분리) -->
    <VibePackageModal v-model="isVibePackageOpen" />

    <NotionExportDialog
      v-model="notionOpen"
      :project-name="store.projectName"
      :team-id="projectStore.activeTeamId || ''"
      :docs="notionDocs"
    />

    <!-- [2026-05] 프로젝트 미선택 시 빈 상태 카드 — Content 영역 가림 -->
    <div v-if="!store.projectName" class="empty-project-card">
      <div class="empty-project-icon">
        <FolderOpen :size="36" />
      </div>
      <h2 class="empty-project-title">{{ $t('design.empty_project.title') }}</h2>
      <p class="empty-project-desc">{{ $t('design.empty_project.desc') }}</p>
      <div class="empty-project-hints">
        <div class="empty-hint">
          <ArrowUpRight :size="14" class="mr-1" />
          {{ $t('design.empty_project.hint_header') }}
        </div>
        <div class="empty-hint">
          <ArrowUpRight :size="14" class="mr-1" />
          {{ $t('design.empty_project.hint_plan') }}
        </div>
      </div>
    </div>

    <!-- [2026-05-18] 프로젝트는 선택됐지만 미팅 로그/CPS/PRD 가 아직 없는 상태 가드 -->
    <ProjectNotReadyCard
      v-else-if="!readiness.isReady.value"
      :has-meeting-logs="readiness.hasMeetingLogs.value"
      :has-cps="readiness.hasCps.value"
      :has-prd="readiness.hasPrd.value"
      feature="Design"
      @refresh="readiness.check(true)"
    />

    <!-- Content -->
    <div v-else class="design-content">
      <AiDraftNotice :label="$t('design.ai_draft_label')" dismissible storage-key="gayoje_aidraft_dismissed_design" />
      <SpackTab v-if="designTab === 'spack'" ref="spackRef" />
      <DddTab v-else-if="designTab === 'ddd'" ref="dddRef" />
      <ArchitectureTab v-else-if="designTab === 'architecture'" ref="archRef" />
    </div>
  </div>


  <!-- 바이브 코딩 시작 패키지 안내 다이얼로그 -->
    
</template>

<style scoped>
/* [2026-06 리팩토링] impact 상세 스타일은 DesignImpactDetail.vue 로 1:1 이동. */

/* [2026-06 리팩토링] design-stale-modal 스타일은 DesignStaleModal.vue 로 1:1 이동. */

/* Layout */
.design-root { display: flex; flex-direction: column; height: 100%; width: 100%; }
.design-header { flex-shrink: 0; padding-top: 24px; margin-bottom: 0; }
.design-content { flex: 1; overflow: hidden; padding: 24px 0 32px; }

/* 헤드라인 행: 제목 좌측 + 가이드 버튼 우측 — Plan 페이지와 동일 톤. */
.design-headline-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.design-headline-text { min-width: 0; flex: 1; }
.design-guide-btn {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 7px 14px; border-radius: 9999px; border: 1px solid var(--border-light);
  background: white; color: var(--text-main);
  font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.design-guide-btn:hover {
  border-color: var(--accent); color: var(--accent); transform: translateY(-1px);
}
/* 헤드라인 우측 액션 묶음 — [바이브 패키지][사용 가이드] */
.design-headline-actions { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
.design-vibe-btn {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 7px 14px; border-radius: 9999px; border: none;
  background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff;
  font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.15s; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(124,58,237,.3);
}
.design-vibe-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(124,58,237,.45); }
.design-vibe-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
/* [2026-06-04] 데이터 최신 상태 — 테두리가 은은하게 빛나며 다음 스텝 유도 */
.design-vibe-btn--ready {
  box-shadow: 0 0 0 1px rgba(167,139,250,.7), 0 0 10px 1px rgba(124,58,237,.45);
  animation: design-vibe-glow 2.2s ease-in-out infinite;
}
@keyframes design-vibe-glow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(167,139,250,.55), 0 0 8px 1px rgba(124,58,237,.35); }
  50%      { box-shadow: 0 0 0 1.5px rgba(167,139,250,.95), 0 0 16px 3px rgba(124,58,237,.65); }
}
@media (prefers-reduced-motion: reduce) {
  .design-vibe-btn--ready { animation: none; box-shadow: 0 0 0 1.5px rgba(167,139,250,.9), 0 0 12px 2px rgba(124,58,237,.5); }
}
@media (max-width: 600px) {
  .design-headline-row { flex-wrap: wrap; gap: 10px; }
  .design-guide-btn { font-size: 0.6rem; padding: 6px 11px; }
  .design-vibe-btn { font-size: 0.6rem; padding: 6px 11px; }
  /* [2026-05-21] 모바일에서 '시스템 그리기' 가 text-h4 (≈2.125rem) 라
     2줄로 wrap 됨. 1줄로 자연스럽게 맞도록 축소. */
  .design-headline-text :deep(.text-h4) {
    font-size: 1.4rem !important;
    line-height: 1.2;
  }
}

/* Action button — '최신 업데이트' / 'Lineage Graph'
 * [2026-05-21] 모바일에서도 텍스트 라벨 유지 (icon-only 모드 폐기).
 * 사용자가 아이콘만으론 버튼 의미를 인지 못 한다는 보고. CSS 만으로 컴팩트하게.
 */
.action-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 22px; border-radius: 9999px;
  border: none; background: var(--text-main); color: white;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1;
}
.action-btn__icon { flex-shrink: 0; }
.action-btn__label { white-space: nowrap; }
.action-btn:hover { opacity: 0.85; transform: translateY(-1px); }
.action-btn--update { background: var(--accent) !important; box-shadow: 0 4px 12px rgba(140,98,57,0.2) !important; }
.action-btn--lineage { background: #2563EB !important; box-shadow: 0 4px 12px rgba(37,99,235,0.2) !important; }
.action-btn--vibe { background: linear-gradient(135deg, #7c3aed, #4f46e5) !important; box-shadow: 0 4px 12px rgba(124,58,237,0.28) !important; }
.action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
/* [2026-06] 모바일 ⋯ 더보기 — 아이콘 전용 중립(ghost) 스타일로 '최신 업데이트'와 위계 구분 */
.action-btn--more {
  padding: 10px 12px !important;
  background: transparent !important;
  color: var(--text-main) !important;
  border: 1px solid var(--border-light, rgba(0,0,0,0.14)) !important;
  box-shadow: none !important;
}
.action-btn--more:hover { background: rgba(0,0,0,0.04) !important; transform: translateY(-1px); }

@media (max-width: 1200px) {
  .action-btn { padding: 9px 18px; font-size: 0.66rem; gap: 6px; }
}
@media (max-width: 600px) {
  .action-btn {
    padding: 7px 13px;
    font-size: 0.6rem;
    letter-spacing: 0.03em;
    gap: 5px;
  }
}

/* [2026-05-30] 액션 버튼 정렬 — 데스크톱은 우측 정렬, 모바일은 두 버튼을
   동일 너비로 가득 채워 균형있게. (기존: trailing-area 의 justify-content:stretch
   가 flex 에서 무효라 좌측 쏠림 발생.) ⓘ 가이드 아이콘은 버튼에 바짝 붙임. */
.action-group { display: inline-flex; align-items: center; gap: 2px; }
@media (max-width: 600px) {
  .action-group { flex: 1 1 0; min-width: 0; }
  .action-group .action-btn { flex: 1; justify-content: center; min-width: 0; }
  .action-group .action-btn__label { overflow: hidden; text-overflow: ellipsis; }
}

/* [2026-06 리팩토링] 진행 오버레이 스타일(.update-* / .stage-pill* / .guide-step*)은
   DesignProgressOverlay.vue 로 1:1 이동. 아래 .spin/@keyframes 는 action-btn 등도 써서 유지. */

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* [2026-05] 프로젝트 미선택 빈 상태 카드 — Plan 페이지와 동일 패턴 */
.empty-project-card {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 56px 24px;
  margin: 40px auto;
  max-width: 560px;
  background: linear-gradient(180deg, #fff 0%, var(--bg-light, #F7F5EB) 100%);
  border: 1.5px dashed var(--accent, #8C6239);
  border-radius: 16px;
  text-align: center;
}
.empty-project-icon {
  display: inline-flex;
  width: 80px; height: 80px;
  align-items: center; justify-content: center;
  background: linear-gradient(135deg, #C77F4A 0%, #8C6239 100%);
  color: white;
  border-radius: 20px;
  margin-bottom: 18px;
  box-shadow: 0 6px 18px rgba(140, 98, 57, 0.18);
}
.empty-project-title {
  font-size: 1.25rem; font-weight: 800;
  color: var(--text-main, #2A2421);
  margin: 0 0 10px;
  letter-spacing: -0.01em;
}
.empty-project-desc {
  font-size: 0.85rem; color: var(--text-muted, #6F665F);
  margin: 0 0 22px; line-height: 1.7;
}
.empty-project-hints {
  display: flex; flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  width: 100%; max-width: 100%; box-sizing: border-box;
  padding: 14px 20px;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border-light, rgba(140, 98, 57, 0.12));
}
.empty-hint {
  display: flex; align-items: flex-start; width: 100%;
  font-size: 0.78rem;
  color: var(--text-main, #2A2421);
  line-height: 1.5;
  text-align: left;
}
.empty-hint strong { color: var(--accent, #8C6239); font-weight: 800; }
.empty-hint .mr-1 { margin-right: 4px; margin-top: 2px; flex-shrink: 0; color: var(--accent, #8C6239); }
@media (max-width: 600px) {
  .empty-project-card { padding: 32px 18px; margin: 24px auto; }
  .empty-project-icon { width: 64px; height: 64px; }
  .empty-project-title { font-size: 1.05rem; }
  .empty-hint { font-size: 0.7rem; }
}

/* 명세 충실도 컴포넌트 우측 정렬 및 모바일 대응 */
.design-score-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  padding-right: 24px;
}
@media (max-width: 600px) {
  .design-score-container {
    padding-right: 12px;
    margin-top: 8px;
  }
}

/* 명세 충실도 및 바이브 코딩 액션 영역 스타일링 */
.design-top-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
@media (max-width: 960px) {
  .design-headline-row {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .design-top-actions {
    justify-content: flex-start;
    gap: 12px;
  }
}

.vibe-cta {
  background: linear-gradient(135deg, #7c3aed, #4f46e5) !important;
  color: #fff !important;
  font-size: 0.78rem !important;
  font-weight: 600 !important;
  letter-spacing: 0.01em;
  height: 32px !important;
  padding: 0 14px !important;
  border-radius: 8px !important;
  box-shadow: 0 2px 8px rgba(124,58,237,.35) !important;
  transition: opacity .2s, transform .15s, box-shadow .2s;
}
.vibe-cta:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(124,58,237,.45) !important; }
.vibe-cta:disabled { opacity: .4 !important; }

/* pulse animation */
@keyframes vibe-pulse {
  0%,100% { box-shadow: 0 2px 8px rgba(124,58,237,.35); }
  50%      { box-shadow: 0 0 0 8px rgba(124,58,237,.15), 0 4px 16px rgba(124,58,237,.5); }
}
.vibe-cta--pulse { animation: vibe-pulse 1s ease-in-out 3; }

/* ── States ── */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: 48px;
}

/* ── Diagram ── */
.arch-diagram {
  flex: 1; overflow-y: auto; padding: 24px;
  display: flex; flex-direction: column; gap: 0;
}

/* ── Layer ── */
.layer { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 14px; padding: 18px 20px; }
.layer-tag {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  border-radius: 6px; padding: 4px 10px; margin-bottom: 16px;
}
.layer-tag--service { background: rgba(99,102,241,.08); color: #818cf8; border: 1px solid rgba(99,102,241,.2); }
.layer-tag--db      { background: rgba(16,185,129,.08); color: #34d399; border: 1px solid rgba(16,185,129,.2); }
.layer-tag-en { font-size: 0.65rem; opacity: .7; margin-left: 4px; }
.layer-count { background: rgba(255,255,255,.12); border-radius: 4px; padding: 1px 6px; font-size: 0.72rem; }

/* ── Node Grid ── */
.node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }

/* ── Node Card ── */
.node-card {
  background: var(--bg-light);
  border: 1.5px solid var(--border-light);
  border-radius: 10px; padding: 14px;
  transition: border-color .2s, box-shadow .2s, transform .15s;
  position: relative;
}
.node-card--service { border-left: 3px solid #6366f1; }
.node-card--db      { border-left: 3px solid #10b981; }
.node-card--clickable { cursor: pointer; }
.node-card--clickable:hover { border-color: var(--accent); box-shadow: 0 4px 16px rgba(0,0,0,.12); transform: translateY(-2px); }

/* [2026-05-21] SPACK/DDD 에서 cross-link 로 선택된 service — 은은한 pulse glow.
   사용자가 "이 서비스가 방금 클릭된 노드에 매핑됐다" 를 즉각 인지하게.
   2.4s 주기로 자연스러운 호흡감, accent 색 (브랜드 컬러) 으로 통일. */
.node-card--selected {
  position: relative;
  border-color: var(--accent, #8C6239) !important;
  animation: archSelectedPulse 2.4s ease-in-out infinite;
  z-index: 1;
}
.node-card--selected::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  border: 1.5px solid rgba(140, 98, 57, 0.35);
  animation: archSelectedBorderFlow 2.4s ease-in-out infinite;
}
@keyframes archSelectedPulse {
  0%, 100% {
    box-shadow:
      0 0 0 2px rgba(140, 98, 57, 0.28),
      0 0 14px 1px rgba(140, 98, 57, 0.18);
  }
  50% {
    box-shadow:
      0 0 0 3px rgba(140, 98, 57, 0.42),
      0 0 22px 3px rgba(140, 98, 57, 0.32);
  }
}
@keyframes archSelectedBorderFlow {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
/* 사용자가 모션 감도 낮춤 설정 시 — 정적 ring 으로만 표시 */
@media (prefers-reduced-motion: reduce) {
  .node-card--selected { animation: none; box-shadow: 0 0 0 2px rgba(140, 98, 57, 0.42); }
  .node-card--selected::after { animation: none; opacity: 0.8; }
}

/* confidence tint */
.node-card--confidence-direct   { background: rgba(16,185,129,.04); }
.node-card--confidence-inferred { background: rgba(245,158,11,.04); }

.node-card-top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
.node-icon { flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.node-icon--service { background: rgba(99,102,241,.12); color: #818cf8; }
.node-icon--db      { background: rgba(16,185,129,.12); color: #34d399; }
.node-meta { flex: 1; min-width: 0; }
.node-name { font-size: 0.85rem; font-weight: 600; color: var(--text-main); line-height: 1.3; }
.node-id   { font-size: 0.68rem; color: var(--text-muted); font-family: monospace; margin-top: 2px; }
.node-tech {
  font-size: 0.65rem; font-weight: 600; background: rgba(99,102,241,.1); color: #818cf8;
  border-radius: 4px; padding: 2px 6px; white-space: nowrap; flex-shrink: 0;
}
.node-tech--db { background: rgba(16,185,129,.1); color: #34d399; }
.node-desc { font-size: 0.78rem; color: var(--text-dim); line-height: 1.5; margin: 0; }

/* lineage indicator */
.lineage-indicator {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 0.65rem; color: var(--accent); font-weight: 600;
  background: rgba(124,58,237,.1); border-radius: 4px; padding: 1px 5px;
  margin-left: 4px; vertical-align: middle;
}

/* cross-link chip row */
.cross-chip-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; align-items: center; }
.cross-chip-label { font-size: 0.65rem; color: var(--text-muted); }
.cross-chip--ghost {
  font-size: 0.65rem; border: 1px dashed var(--border-light); border-radius: 4px;
  padding: 1px 6px; color: var(--text-muted);
}

/* conn count badge */
.node-conn-count {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 8px; font-size: 0.68rem; color: #f59e0b;
  background: rgba(245,158,11,.08); border-radius: 4px; padding: 2px 7px;
  cursor: pointer;
}
.node-conn-count:hover { background: rgba(245,158,11,.16); }

/* ── Connector Belt ── */
.conn-belt {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 32px; color: var(--text-muted);
}
.conn-belt-line { flex: 1; height: 1px; background: var(--border-light); }
.conn-belt-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;
}
.conn-spacer { height: 16px; }

/* ── Connection Section ── */
.conn-section { margin-top: 20px; }
.conn-section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.conn-section-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.8rem; font-weight: 600; color: var(--text-main);
}
.conn-section-en { font-size: 0.68rem; color: var(--text-muted); font-weight: 400; }
.conn-section-count {
  font-size: 0.72rem; background: rgba(245,158,11,.1); color: #f59e0b;
  border-radius: 4px; padding: 2px 8px; font-weight: 600;
}

/* ── Connection Table ── */
.conn-table { width: 100%; border: 1px solid var(--border-light); border-radius: 8px; overflow: hidden; font-size: 0.78rem; }
.conn-thead {
  display: grid; grid-template-columns: 1.4fr .3fr 1.4fr .8fr .7fr 1.6fr;
  background: var(--bg-card); padding: 8px 12px;
  font-size: 0.7rem; font-weight: 600; color: var(--text-muted); letter-spacing: .04em; text-transform: uppercase;
}
.conn-trow {
  display: grid; grid-template-columns: 1.4fr .3fr 1.4fr .8fr .7fr 1.6fr;
  padding: 8px 12px; align-items: start;
  border-top: 1px solid var(--border-light);
  transition: background .15s;
}
.conn-trow:hover { background: var(--bg-light); }
.ct-id { display: flex; flex-direction: column; gap: 1px; }
.ct-name { font-weight: 500; color: var(--text-main); }
.ct-raw-id { font-size: 0.65rem; color: var(--text-muted); font-family: monospace; }
.ct-id--from .ct-name { color: #818cf8; }
.ct-id--to   .ct-name { color: #34d399; }
.ct-arrow { color: var(--text-muted); display: flex; align-items: center; padding-top: 2px; }
.ct-type  { color: #f59e0b; font-weight: 500; }
.ct-proto { font-family: monospace; font-size: 0.72rem; color: var(--text-dim); }
/* [D-2] Connection auth 배지 — enum 별 색 */
.ct-auth { font-size: 0.7rem; font-weight: 500; padding: 2px 6px; border-radius: 4px; }
.ct-auth--none   { color: var(--text-dim); }
.ct-auth--mTLS   { color: #2F855A; background: #C6F6D5; }
.ct-auth--bearer { color: #2B6CB0; background: #BEE3F8; }
.ct-auth--basic  { color: #B7791F; background: #FAF089; }
.ct-auth--\"api-key\" { color: #6B46C1; background: #E9D8FD; }
.ct-desc  { color: var(--text-dim); }

/* ── Modals (shared) ──
 * [2026-05-21] 모달 사이즈/responsive 를 순수 CSS 로 관리.
 * 이전엔 Vuetify useDisplay()의 xs 로 fullscreen 토글 → 모바일에서 압축/투명
 * 문제 발생. CSS @media 기반으로 더 견고 + 백드롭은 VDialog 의 기본 scrim 활용.
 */
.arch-modal-card {
  background: var(--bg-card); border-radius: 14px;
  border: 1px solid var(--border-light); overflow: hidden;
  width: 100%;
  max-height: 85vh;
  min-height: 320px;
  display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}
.arch-modal-card--conn {
  /* 모달 본문이 너무 작아 보이지 않도록 살짝 더 큰 min-height */
  min-height: 360px;
}
.arch-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  gap: 12px;
  background: var(--bg-card);
}
.arch-modal-header-title {
  display: flex; align-items: center; gap: 10px;
  min-width: 0; flex: 1;
}
.arch-modal-title-block { min-width: 0; flex: 1; }
.arch-modal-title { font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0; line-height: 1.3; }
.arch-modal-subtitle {
  font-size: 0.82rem; color: var(--text-dim); margin: 2px 0 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.arch-modal-body  {
  padding: 18px 20px;
  overflow-y: auto;
  flex: 1 1 0;
  min-height: 200px;  /* prevent collapse */
  -webkit-overflow-scrolling: touch;
}

.conn-count-badge {
  display: inline-block;
  padding: 4px 10px;
  margin-bottom: 12px;
  background: rgba(245, 158, 11, 0.1);
  color: #B45309;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 600;
}
.conn-count-badge strong { font-weight: 800; }

/* Desktop / tablet: 6열 테이블 */
.conn-table-wrap { display: block; }
/* Mobile: 세로 카드 리스트 (기본 hidden, @media 에서 show) */
.conn-card-list { display: none; list-style: none; padding: 0; margin: 0; }

.modal-close-btn {
  background: none; border: 1px solid transparent; cursor: pointer;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center;
  border-radius: 8px; padding: 6px;
  flex-shrink: 0;
  transition: background .15s, color .15s, border-color .15s;
}
.modal-close-btn:hover,
.modal-close-btn:focus-visible {
  background: var(--bg-light); color: var(--text-main);
  border-color: var(--border-light);
  outline: none;
}

/* ── Connection card (mobile only) ── */
.conn-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
  display: flex; flex-direction: column;
  gap: 6px;
}
.conn-card:last-child { margin-bottom: 0; }
.conn-card-endpoint {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 12px;
  background: var(--bg-light);
  border-radius: 8px;
  border-left: 3px solid transparent;
}
.conn-card-endpoint--from { border-left-color: #818cf8; }
.conn-card-endpoint--to   { border-left-color: #34d399; }
.conn-card-endpoint--self { background: rgba(245, 158, 11, 0.08); }
.conn-card-role {
  font-size: 0.65rem; font-weight: 700; color: var(--text-muted);
  letter-spacing: 0.06em; text-transform: uppercase;
}
.conn-card-name {
  font-size: 0.88rem; font-weight: 700; color: var(--text-main);
  line-height: 1.35;
  word-break: keep-all;
}
.conn-card-id {
  font-size: 0.7rem; color: var(--text-muted);
  font-family: 'IBM Plex Mono', monospace;
}
.conn-card-arrow {
  display: flex; justify-content: center;
  color: var(--text-muted);
  padding: 2px 0;
}
.conn-card-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin-top: 4px;
}
.conn-card-type {
  font-size: 0.72rem; font-weight: 600;
  color: #f59e0b;
  padding: 3px 9px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 9999px;
}
.conn-card-proto {
  font-size: 0.7rem; font-family: 'IBM Plex Mono', monospace;
  color: var(--text-main); font-weight: 600;
  padding: 3px 8px;
  background: var(--bg-light);
  border-radius: 6px;
  border: 1px solid var(--border-light);
}
.conn-card-desc {
  font-size: 0.78rem; color: var(--text-dim); line-height: 1.55;
  margin: 4px 0 0;
  word-break: keep-all;
}
.conn-card-empty {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* ── Mobile responsive: 모달 ── */
@media (max-width: 600px) {
  /* 모달이 화면을 거의 채우도록 — 백드롭은 VDialog 기본 scrim 사용 */
  .arch-modal-card {
    max-height: 92vh;
    min-height: 92vh;
    border-radius: 12px 12px 0 0;
  }
  .arch-modal-header { padding: 14px 16px; }
  .arch-modal-body { padding: 16px; min-height: 280px; }
  .arch-modal-title { font-size: 0.92rem; }
  .arch-modal-subtitle { font-size: 0.78rem; }

  /* 테이블 숨기고 카드 리스트로 전환 */
  .conn-table-wrap { display: none; }
  .conn-card-list  { display: block; }
}

/* ── Mobile responsive: 페이지 레이아웃 ── */
@media (max-width: 768px) {
  /* 데스크탑 height:100% → 모바일은 콘텐츠 만큼 늘어남 (페이지 스크롤 사용) */
  .arch-root { height: auto; }
  .arch-diagram {
    overflow-y: visible;
    padding: 14px;
    flex: 0 0 auto;
  }
  .arch-header {
    padding: 14px 16px 12px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .header-actions {
    flex-wrap: wrap;
    width: 100%;
    gap: 6px;
  }
  .layer { padding: 14px 14px; border-radius: 12px; }
  .layer-tag { font-size: 0.66rem; padding: 3px 8px; }
  .node-grid { gap: 8px; }
  .node-card { padding: 12px; }
  /* vibe-cta — 모바일에서 가로 폭 유연하게 (텍스트 + 아이콘 유지) */

}

.vibe-modal {
  background: var(--bg-card); border-radius: 16px;
  border: 1px solid var(--border-light); overflow: hidden;
}
.vibe-modal-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 20px 22px 16px; border-bottom: 1px solid var(--border-light);
}
.vibe-modal-icon {
  width: 38px; height: 38px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(124,58,237,.15), rgba(79,70,229,.15));
  display: flex; align-items: center; justify-content: center;
  color: #a78bfa; flex-shrink: 0;
}
.vibe-modal-title { font-size: 1rem; font-weight: 700; color: var(--text-main); margin: 0 0 2px; }
.vibe-modal-sub   { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.vibe-modal-body  { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto; }

/* version badge */
.vibe-version-badge {
  display: inline-flex; align-items: center;
  font-size: 0.72rem; font-weight: 600; border-radius: 6px; padding: 4px 10px; letter-spacing: .02em;
}
.vibe-version-badge--full { background: rgba(124,58,237,.12); color: #a78bfa; border: 1px solid rgba(124,58,237,.25); }
.vibe-version-badge--lite { background: rgba(99,102,241,.08); color: #818cf8; border: 1px solid rgba(99,102,241,.2); }

.vibe-intro { font-size: 0.83rem; color: var(--text-dim); line-height: 1.65; margin: 0; }
.vibe-intro code { background: rgba(255,255,255,.07); border-radius: 4px; padding: 1px 5px; font-size: 0.8rem; }

/* skill checking */
.vibe-skill-checking { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-muted); padding: 8px 0; }

/* FAQ accordion */
.vibe-faq { border: 1px solid var(--border-light); border-radius: 8px; overflow: hidden; }
.vibe-faq-summary {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px; cursor: pointer;
  font-size: 0.8rem; font-weight: 500; color: var(--text-dim);
  list-style: none; user-select: none;
  background: var(--bg-light);
  transition: background .15s;
}
.vibe-faq-summary::-webkit-details-marker { display: none; }
.vibe-faq-summary:hover { background: var(--bg-light); }
details[open] .vibe-faq-chev { transform: rotate(90deg); }
.vibe-faq-chev { transition: transform .2s; color: var(--text-muted); flex-shrink: 0; }
.vibe-faq-body { padding: 12px 14px; font-size: 0.8rem; color: var(--text-dim); line-height: 1.6; border-top: 1px solid var(--border-light); }
.vibe-faq-body p { margin: 0; }

/* tool grid */
.vibe-tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.vibe-tool {
  display: flex; flex-direction: column; gap: 3px;
  background: var(--bg-card); border: 1px solid var(--border-light);
  border-radius: 8px; padding: 10px 12px;
  text-decoration: none; transition: border-color .15s, background .15s;
}
.vibe-tool:hover { border-color: var(--accent); background: var(--bg-light); }
.vibe-tool strong { font-size: 0.8rem; color: var(--text-main); }
.vibe-tool span   { font-size: 0.72rem; color: var(--text-muted); }

/* pkg list */
.vibe-pkg-list { display: flex; flex-direction: column; gap: 6px; }
.vibe-pkg-item {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--bg-light); border: 1px solid var(--border-light);
  border-radius: 8px; padding: 10px 12px;
  color: var(--text-muted);
  transition: border-color .15s;
}
.vibe-pkg-item--guide    { border-left: 3px solid #a78bfa; }
.vibe-pkg-item--highlight { border-left: 3px solid #f59e0b; background: rgba(245,158,11,.04); }
.vibe-pkg-item--final    { border-left: 3px solid #10b981; }
.vibe-pkg-name { font-size: 0.8rem; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
.vibe-pkg-name code { font-size: 0.78rem; }
.vibe-pkg-desc { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
.vibe-pkg-required { font-size: 0.65rem; font-weight: 700; background: rgba(245,158,11,.15); color: #f59e0b; border-radius: 4px; padding: 1px 6px; }

/* dl section */
.vibe-dl-section { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 4px; }
.vibe-dl-btn {
  background: linear-gradient(135deg, #7c3aed, #4f46e5) !important;
  color: #fff !important; font-weight: 600 !important;
  height: 40px !important; padding: 0 24px !important; border-radius: 10px !important;
  box-shadow: 0 2px 10px rgba(124,58,237,.3) !important;
  transition: opacity .2s, transform .15s;
}
.vibe-dl-btn:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
.vibe-dl-btn--pdf {
  background: linear-gradient(135deg, #2e4036, #1a2b20) !important;
  box-shadow: 0 2px 10px rgba(46,64,54,.3) !important;
  margin-top: 8px !important;
}
.vibe-dl-hint { font-size: 0.72rem; color: var(--text-muted); text-align: center; margin: 0; }
</style>
