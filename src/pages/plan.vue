<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import MeetingLogTab from '@/components/plan/MeetingLogTab.vue'
import NotionImportDialog from '@/components/plan/NotionImportDialog.vue'
import NotionExportDialog from '@/components/plan/NotionExportDialog.vue'
import { useNotionExport } from '@/composables/useNotionExport'
import { useProjectStore } from '@/store/project'
import CpsTab from '@/components/plan/CpsTab.vue'
import PrdTab from '@/components/plan/PrdTab.vue'
import RuleGeneratorTab from '@/components/plan/RuleGeneratorTab.vue'
import UserGuideModal from '@/components/plan/UserGuideModal.vue'
import McpGuideModal from '@/components/plan/McpGuideModal.vue'
import BackgroundProcessingNotice from '@/components/plan/BackgroundProcessingNotice.vue'
import SubTabRow from '@/components/common/SubTabRow.vue'
import ReviewModeToggle from '@/components/plan/ReviewModeToggle.vue'
import { notifyEvalScoreRefresh } from '@/composables/useEvalScore'
import MeetingQuotaNote from '@/components/plan/MeetingQuotaNote.vue'
import EmptyProjectCard from '@/components/plan/EmptyProjectCard.vue'
import AiDraftNotice from '@/components/common/AiDraftNotice.vue'
import { HelpCircle, Loader2, Sparkles } from 'lucide-vue-next'
import axios from '@/utils/axios'
import { updateMeApi } from '@/utils/auth'
import { isGuideSeen } from '@/utils/guideSeen'
import { extractTaskId, isPrdError } from '@/utils/asyncJob'
import { extractError } from '@/utils/apiErrors'
import { useHarnessStore, API_BASE } from '@/store/harness'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import { useUsageStore } from '@/store/usage'
import { useJobsStore } from '@/store/jobs'
import { useAutofixStore } from '@/store/autofix'
import { compareVersionsDesc, computeNextVersion } from '@/utils/version'
import { useProjectReadiness } from '@/composables/useProjectReadiness'
import { SAMPLE_MEETING_LOG } from '@/utils/sampleMeetingLog'
import { hasMeetingDraft, clearMeetingDraft } from '@/utils/meetingDraft'

const { t } = useI18n()
const { showSuccess, showError, showWarning } = useSnackbar()
const confirm = useConfirm()
const store = useHarnessStore()
const projectStore = useProjectStore()
const { dialogOpen: notionOpen, docs: notionDocs, open: openNotionExport } = useNotionExport()
const usageStore = useUsageStore()
const jobsStore = useJobsStore()
// 다른 페이지(Design / Lint / Deliverables) 의 진입 가드용 readiness 캐시 — 미팅 로그
// 저장 / 배치 완료 / 로그 삭제 시 invalidate 호출해 stale 캐시 방지.
const readiness = useProjectReadiness()
const subTab = ref('log')

// ─── [편집 가드 — 2026-06] 편집 중 탭/스텝 이동 시 '저장 안 된 변경' confirm ──────
// CpsTab/PrdTab 이 편집 상태를 @update:editing 으로 올려준다 (섹션/전체 마크다운 + 노드 편집).
const cpsEditing = ref(false)
const prdEditing = ref(false)
const isDocEditing = computed(() => cpsEditing.value || prdEditing.value)

// 앱 디자인 confirm 모달 — promise 로 [나가기]/[계속 편집] 응답을 회수.
const editGuardOpen = ref(false)
let _editGuardResolve = null
const confirmLeaveEdit = () => new Promise((resolve) => {
  _editGuardResolve = resolve
  editGuardOpen.value = true
})
const resolveEditGuard = (leave) => {
  editGuardOpen.value = false
  const r = _editGuardResolve
  _editGuardResolve = null
  r?.(leave)
}

// 서브탭 전환 가드 — 편집 중이면 confirm 후 [나가기] 일 때만 전환.
const requestSubTab = async (v) => {
  if (v === subTab.value) return
  if (isDocEditing.value && !(await confirmLeaveEdit())) return
  subTab.value = v
}

// 상위 스텝/뒤로가기/직접 URL 이동 가드 — /plan 이탈 전체를 포착.
onBeforeRouteLeave(async () => {
  if (!isDocEditing.value) return true
  return await confirmLeaveEdit()
})

// 새로고침/탭 닫기 — 브라우저 기본 경고 (문구 커스텀 불가).
const _editBeforeUnload = (e) => {
  if (isDocEditing.value) { e.preventDefault(); e.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', _editBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', _editBeforeUnload))

const route = useRoute()
const router = useRouter()
const prdTabRef = ref(null)

// [2026-05] 신규 사용자 샘플 체험 — /plan?sample=1 진입 시 샘플 회의록을 에디터에
// 미리 채워 "복사·붙여넣기" 없이 바로 저장만 누르면 첫 결과물을 볼 수 있게 한다.
// MeetingLogTab 으로 내려보내고, 빈 프로젝트일 때만 적용된다 (기존 내용 보호).
const presetDraft = ref('')
// 샘플 모드 — 샘플이 에디터에 채워진 동안 true. 저장 성공 시 false 로 전환.
const sampleMode = ref(false)
const _consumeSampleQuery = () => {
  if (route.query.sample == null) return
  if (!store.projectName) store.setProjectName(t('plan.sample_name'))
  subTab.value = 'log'
  presetDraft.value = SAMPLE_MEETING_LOG
  sampleMode.value = true
  // 쿼리 제거 — 새로고침/뒤로가기 시 재적용 방지 (다른 쿼리는 보존).
  const { sample, ...rest } = route.query
  router.replace({ query: rest })
}
onMounted(_consumeSampleQuery)

const _consumeAnchorQuery = async () => {
  const tab = route.query.tab
  const anchor = route.query.anchor
  // [2026-06-06] 완성도 가이드 — 섹션 지정 점프(epic/nfr/screen/overview). 없으면 epic.
  const section = route.query.section
  if (tab && typeof tab === 'string') subTab.value = tab
  if (anchor && typeof anchor === 'string' && subTab.value === 'prd') {
    const sec = (typeof section === 'string' && section) ? section : 'epic'
    // [2026-06 fix] design 페이지에서 막 진입하면 prdSections 가 비어 PrdTab(ref) 자체가
    // 안 뜬다 → 기존 640ms 폴링이 만료돼 scrollAndHighlight 가 영영 호출 안 되고 PRD
    // 기본(Overview)에 머물던 원인. 먼저 PRD 로드를 보장하고, 폴링 예산도 ~4s 로 늘린다.
    try { await ensureLoaded('prd', store.projectName) } catch {}
    for (let i = 0; i < 40; i++) {
      await nextTick()
      if (prdTabRef.value?.scrollAndHighlight) {
        prdTabRef.value.scrollAndHighlight(anchor, sec)
        router.replace({ query: {} })
        return
      }
      await new Promise(r => setTimeout(r, 100))
    }
  }
}
onMounted(_consumeAnchorQuery)
watch(() => route.query, _consumeAnchorQuery)

const GUIDE_SEEN_KEY = 'harness_plan_guide_seen_v1'
const showGuide = ref(false)
const openGuide = () => { showGuide.value = true }
const showMcpGuide = ref(false)
const openMcpGuide = () => { showMcpGuide.value = true }

// 계정당 최초 1회만 자동 표시 — 이후엔 가이드 버튼으로만.
onMounted(() => {
  if (!isGuideSeen(GUIDE_SEEN_KEY)) setTimeout(() => { showGuide.value = true }, 300)
})

onMounted(() => {
  // [2026-05-18 보안] 현재 user.email 전달 — 다른 사용자의 영속화 state 가 있으면
  // store 가 즉시 reset 한 후 핸들러 wire. attachBatchHandlers 안에서 assertOwner.
  let currentEmail = ''
  try {
    const u = JSON.parse(localStorage.getItem('harness_user') || '{}')
    currentEmail = u?.email || ''
  } catch {}

  jobsStore.attachBatchHandlers({
    userEmail: currentEmail,
    projectName: store.projectName,
    enqueueOne: async (entry, nextEntry) => {
      const { taskId } = await enqueueMeetingPost(entry.content, entry.version, nextEntry)
      return taskId
    },
    onAllComplete: async () => {
      await fetchMeetingLogs(store.projectName)
      invalidateCache(['cps', 'prd'])
      if (subTab.value === 'cps') await ensureLoaded('cps', store.projectName)
      else if (subTab.value === 'prd') await ensureLoaded('prd', store.projectName)
      usageStore.refresh({ force: true })
      readiness.invalidate()
      showSuccess(t('plan.toast.batch_all_complete'), { timeout: 6000 })
    },
    onError: (err) => { showError(t('plan.toast.batch_error', { err: extractError(err, t('plan.err.unknown')) })) },
  })
})

const selectedLog = ref('')
const currentJobStage = computed(() => jobsStore.activeJobs?.[0]?.stage || null)
// 회의록 → CPS/PRD 가 백그라운드에서 처리 중인지 — CPS/PRD 빈 상태 위에
// "지금 어디까지 됐는지" 알림 표시. batch chain (V1→V2→V3) 또는 단일 postMeeting
// 작업 어느 쪽이든 활성이면 true.
const isBackgroundProcessing = computed(() =>
  jobsStore.batchState?.running || (jobsStore.activeJobs?.length || 0) > 0,
)
const activeJobsView = computed(() => jobsStore.activeJobs || [])

// [2026-06 멀티디바이스 이중작업] 다른 기기/탭에서 이 프로젝트를 처리 중인지 —
// 배치는 브라우저 주도라 다른 기기는 진행 상태를 모른다. getProjectBusy 를
// 폴링해 배너 + 버튼 비활성. 로컬 작업 중이면 서버 busy 는 자기 잡이라 미표시.
// 실제 차단은 BE enqueue 의 409 PROJECT_BUSY — 이건 사전 안내용.
const remoteBusy = ref(false)
// [2026-06-10 lost-update UX 가드] PRD 'AI로 보완하기' 진행/승인대기 중 — 그 사이
// 회의록을 처리하면 PRD 가 바뀌어 보완 diff 적용이 409 로 취소된다. 데이터는
// optimistic lock 이 지키고, 여기선 충돌 자체를 미리 줄이도록 처리 진입을 안내·차단.
const autofixStore = useAutofixStore()
const autofixBusy = computed(() =>
  !!store.projectName
  && (autofixStore.isAutofixing(store.projectName) || !!autofixStore.pendingDiff(store.projectName)),
)
const REMOTE_BUSY_POLL_MS = 20_000
let remoteBusyTimer = null
const checkRemoteBusy = async () => {
  if (isBackgroundProcessing.value) {
    remoteBusy.value = false
    return
  }
  if (!store.projectName) return
  try {
    const { data } = await axios.get(`${API_BASE}/getProjectBusy`, {
      params: { projectName: store.projectName },
      timeout: 8000,
    })
    const body = data?.result ?? data
    remoteBusy.value = !!body?.busy
  } catch {
    // 표시용 — 조회 실패는 무시 (차단은 BE 409 가 담당).
  }
}
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') checkRemoteBusy()
}
// 프로젝트 전환 시 이전 프로젝트의 busy 가 다음 폴링(최대 20s)까지 잔존하지 않게
// 즉시 리셋 + 재확인.
watch(() => store.projectName, () => {
  remoteBusy.value = false
  checkRemoteBusy()
})
onMounted(() => {
  checkRemoteBusy()
  remoteBusyTimer = setInterval(checkRemoteBusy, REMOTE_BUSY_POLL_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  if (remoteBusyTimer) clearInterval(remoteBusyTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
const activeStep = ref(0)
const isLogsLoading = ref(false)
const isSaving = ref(false)
const logsError = ref(null)
const meetingLogs = ref([])

const fetchMeetingLogs = async (projectName, autoSelect = true) => {
  if (!projectName || !projectName.trim()) {
    meetingLogs.value = []
    if (autoSelect) selectedLog.value = ''
    return
  }
  isLogsLoading.value = true
  logsError.value = null
  try {
    const response = await axios.get(`${API_BASE}/getMeetingVersions`, { params: { projectName }, timeout: 300000 })
    if (response?.data && Array.isArray(response.data.result)) {
      const validLogs = response.data.result.filter(log => log && typeof log.version === 'string')
      // 자연 정렬 — V10 이 V3 뒤에, v1.10 이 v1.2 뒤에 오도록.
      validLogs.sort((a, b) => compareVersionsDesc(a.version, b.version))
      meetingLogs.value = validLogs
    } else {
      meetingLogs.value = []
    }
    if (autoSelect && meetingLogs.value.length > 0) {
      // [2026-06-22] 저장 안 한 신규 작성 초안이 있으면 최신 로그 자동 선택을 건너뛴다 —
      // MeetingLogTab 이 selectedLog='' 를 보고 작성 중이던 초안을 신규 작성 모드로
      // 복원하도록. (프로필 등 타 페이지 다녀와도 작성 내용 유지.)
      if (hasMeetingDraft(projectName)) {
        selectedLog.value = ''
      } else {
        selectedLog.value = meetingLogs.value[0].version
        fetchLogDetail(projectName, selectedLog.value)
      }
    } else if (autoSelect) {
      selectedLog.value = ''
    }
  } catch (err) {
    meetingLogs.value = []
    logsError.value = t('plan.toast.logs_fetch_fail')
  } finally {
    isLogsLoading.value = false
  }
}

const fetchLogDetail = async (projectName, version) => {
  if (!projectName || !version) return
  const idx = meetingLogs.value.findIndex(l => l.version === version)
  if (idx >= 0 && meetingLogs.value[idx]?.meeting_content) return
  isLogsLoading.value = true
  try {
    const response = await axios.get(`${API_BASE}/getMeetingLogs`, { params: { projectName, version }, timeout: 300000 })
    if (response?.data && Array.isArray(response.data.result)) {
      const detail = response.data.result[0]
      if (detail && detail.meeting_content) {
        // [버그픽스 2026-05-21] 객체 mutation 대신 array element 교체 — 일부 케이스에서
        // 자식 컴포넌트의 computed/v-html 이 mutation 을 못 감지하던 문제 (V9 빈 내용 버그).
        const curIdx = meetingLogs.value.findIndex(l => l.version === version)
        if (curIdx >= 0) {
          meetingLogs.value.splice(curIdx, 1, { ...meetingLogs.value[curIdx], ...detail })
        } else {
          meetingLogs.value.push(detail)
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch log detail:', err)
  } finally {
    isLogsLoading.value = false
  }
}

// [Phase 3.6 — 2026-05] PRD 가 재생성된 후 후속 안내.
// BE 가 PRD 재합성 시점에 Project.design_source_stale=true 마킹하므로
// Design 페이지에 가면 노란 배너가 뜨지만, 사용자가 Design 페이지로 가야
// 보이므로 Plan 화면에서도 별도 안내 토스트로 행동 유도.
// success 토스트와 분리 — 후속 액션이라는 의미를 시각적으로 분리.
const notifyDesignNeedsUpdate = (version) => {
  showSuccess?.(
    t('plan.toast.design_needs_update', { version }),
    { timeout: 9000 },
  )
}

const enqueueMeetingPost = async (content, versionOverride, nextEntry = null) => {
  if (!content?.trim()) throw new Error(t('plan.err.content_empty'))
  const version = versionOverride || nextVersion.value
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const projectName = store.projectName
  const payload = {
    version, date, meeting_content: content, project_name: projectName,
    previous_cps_id: `doc_cps_${projectName}_${version.replace('.', '_')}`,
  }
  // [batch 파이프라이닝] 다음 항목이 있으면 BE 가 이번 버전 merge 도는 동안 다음 버전
  // extract 를 선반입(prefetch)하도록 전달 → 처리 시간 단축 (품질 동일). /cps(검수) 경로는
  // BE 가 next_meeting 을 읽지 않으므로 무해. previous_cps_id 는 K+1 의 실제 job 과
  // 동일하게 파생 → 캐시 일치.
  if (nextEntry?.content && nextEntry?.version) {
    const nv = String(nextEntry.version)
    payload.next_meeting = {
      content: nextEntry.content,
      version: nextEntry.version,
      previous_cps_id: `doc_cps_${projectName}_${nv.replace('.', '_')}`,
    }
  }
  const me = (() => { try { return JSON.parse(localStorage.getItem('harness_user') || '{}') } catch { return {} } })()
  const autoProgress = me?.auto_progress !== false
  const endpoint = autoProgress ? '/postMeeting' : '/cps'
  const response = await axios.post(`${API_BASE}${endpoint}`, payload, { timeout: 300000 })
  const taskId = extractTaskId(response.data)
  return { taskId, version, autoProgress, response }
}

const saveMeetingLog = async (newContent) => {
  if (!newContent.trim()) { showWarning(t('plan.toast.content_required')); return }
  isLogsLoading.value = true
  isSaving.value = true
  store.isRegisteringLog = true
  try {
    const { taskId, version, autoProgress } = await enqueueMeetingPost(newContent)
    const projectName = store.projectName
    // [2026-06-22] enqueue 성공 = 내용이 BE 로 커밋됨 → 로컬 임시 초안 제거.
    // (처리 중 페이지 이동 후 돌아와도 이미 제출한 내용이 '미저장 초안'으로 되살아나지 않게.)
    clearMeetingDraft(projectName)
    // [2026-05-25 fix] 업로드 직후 미팅 로그 카운터 즉시 갱신 (BE 가 enqueue
    // 시점에 quota.meeting_logs 증가). 이전엔 onComplete (BE 비동기 처리 끝)
    // 까지 기다려야 \"0/50\" → \"1/50\" 반영되던 버그.
    usageStore.refresh({ force: true, silent: true })
    if (taskId) {
      jobsStore.startJob({
        taskId, label: t('plan.job.meeting_label', { version }), projectName, kind: 'postMeeting',
        onComplete: async (jobResult) => {
          await fetchMeetingLogs(projectName)
          invalidateCache(['cps', 'prd'])
          if (subTab.value === 'cps') await ensureLoaded('cps', projectName)
          else if (subTab.value === 'prd') await ensureLoaded('prd', projectName)
          usageStore.refresh({ force: true })
          readiness.invalidate()
          notifyEvalScoreRefresh()

          // [2026-05-25] CPS 추출 모드 별 사용자 안내.
          // BE 응답: jobResult.cps.extraction_mode = 'strict' | 'lenient' | 'skip'
          const extractMode = jobResult?.cps?.extraction_mode || 'strict'
          const extractWarn = jobResult?.cps?.extraction_warning
          if (extractMode === 'lenient') {
            showWarning(
              t('plan.toast.extract_lenient', { version }),
              { timeout: 9000 },
            )
          } else if (extractMode === 'skip') {
            showSuccess(
              t('plan.toast.extract_skip', { version }),
              { timeout: 8000 },
            )
            return  // strict 성공 메시지 중복 방지
          }

          // [2026-06] BE 가 PRD 를 prd.mode='error' 로 강등(CPS 는 저장)한 경우 표면화 —
          // 이걸 놓치면 '완료 토스트 + 빈/낡은 PRD' 무음 누락이 된다. 성공 토스트 대신 경고.
          if (isPrdError(jobResult)) {
            showWarning(t('plan.toast.prd_error', { version }), { timeout: 10000 })
            return
          }

          if (autoProgress) {
            showSuccess(t('plan.toast.meeting_complete_auto', { version }), { timeout: 6000 })
            notifyDesignNeedsUpdate(version)
          } else {
            showSuccess(t('plan.toast.meeting_complete_review', { version }), { timeout: 8000 })
          }
        },
        onError: (err) => showError(t('plan.toast.meeting_error', { version, err: extractError(err, t('plan.err.unknown')) })),
      })
      sampleMode.value = false
      showSuccess(t('plan.toast.meeting_saved_bg', { version }), { timeout: 4000 })
      return
    }
    sampleMode.value = false
    if (autoProgress) showSuccess(t('plan.toast.saved_ok'))
    else showSuccess(t('plan.toast.cps_ready_review'), { timeout: 8000 })
    await fetchMeetingLogs(projectName)
    invalidateCache(['cps', 'prd'])
    if (subTab.value === 'cps') await ensureLoaded('cps', projectName)
    else if (subTab.value === 'prd') await ensureLoaded('prd', projectName)
    usageStore.refresh({ force: true })
    readiness.invalidate()
  } catch (error) {
    const status = error?.response?.status
    const detail = error?.response?.data?.detail
    // 402 — axios interceptor 가 UpgradePromptDialog 를 이미 띄움. 중복 토스트 방지.
    if (status === 402) return
    if (detail && (status === 400 || status === 409)) {
      const msg = typeof detail === 'string' ? detail : (detail?.message || t('plan.err.bad_request'))
      showWarning(msg, { timeout: 10000 })
    } else {
      showError(extractError(error, t('plan.toast.save_fail')))
    }
  } finally {
    isLogsLoading.value = false
    isSaving.value = false
    store.isRegisteringLog = false
  }
}

const isGeneratingPrd = ref(false)
const triggerPrdGeneration = async () => {
  if (isGeneratingPrd.value) return
  const projectName = store.projectName
  if (!projectName) { showWarning?.(t('plan.toast.no_project')); return }
  const latestVersion = meetingLogs.value?.[0]?.version
  if (!latestVersion) { showWarning?.(t('plan.toast.no_logs')); return }
  isGeneratingPrd.value = true
  try {
    await axios.post(`${API_BASE}/createPRD`, { project_name: projectName, version: latestVersion }, { timeout: 300000 })
    // [fix] PRD 생성 직후 캐시 무효화 + 즉시 fetch — 안 그러면 PRD 탭은 "데이터 없음" 으로 계속 표시.
    invalidateCache(['prd'])
    await fetchPrd(projectName)
    usageStore.refresh({ force: true })
    readiness.invalidate()
    showSuccess(t('plan.toast.prd_done'), { timeout: 6000 })
    // [Phase 3.6] PRD 재합성 → design 도 옛 PRD 기준이라 stale.
    notifyDesignNeedsUpdate(latestVersion)
  } catch (error) {
    console.error('[plan/createPRD] failed:', error?.response?.data || error)
    showError?.(t('plan.toast.prd_fail', { code: error?.response?.status || error?.message || 'unknown' }))
  } finally {
    isGeneratingPrd.value = false
  }
}

// ─── Notion import ─────────────────────────────────────────────
// MeetingLogTab 의 BookOpen 버튼 → 이 다이얼로그 오픈 → import 성공 시 jobsStore 연동.
// 토큰 만료/미연결은 자동 unlink 후 profile 페이지로 안내.
const showNotionDialog = ref(false)
const openNotionDialog = () => {
  if (!store.projectName) {
    showWarning(t('plan.toast.no_project_select'))
    return
  }
  showNotionDialog.value = true
}
const onNotionImported = ({ taskId, version }) => {
  if (!taskId) return
  const projectName = store.projectName
  // 자동 모드(autoProgress=true) 가정 — Notion import 는 post_meeting 호출이라 CPS+PRD 체인.
  jobsStore.startJob({
    taskId,
    label: t('plan.job.notion_label', { version }),
    projectName,
    kind: 'postMeeting',
    onComplete: async () => {
      await fetchMeetingLogs(projectName)
      usageStore.refresh({ force: true })
      showSuccess(t('plan.toast.notion_done', { version }), { timeout: 6000 })
      // [Phase 3.6] Notion import 는 postMeeting (autoProgress=true 가정) → PRD 까지 생성
      // → design 도 stale.
      notifyDesignNeedsUpdate(version)
    },
    onError: (err) => showError(t('plan.toast.meeting_error', { version, err: extractError(err, t('plan.err.unknown')) })),
  })
}
const onNotionDisconnected = () => {
  showWarning(t('plan.toast.notion_disconnected'), { timeout: 6000 })
  // replace — /plan 을 history 에 남기지 않아서 사용자가 /profile 에서 노션 연결
  // 후 '돌아가기' 누를 때 /plan(연결되지 않은 상태로 dialog 열려 있던 곳)이 아니라
  // 그 이전 화면으로 돌아가게 함 (UX 회귀 #28).
  router.replace({ path: '/profile' })
}

const autoProgressFlag = ref(true)
const readAutoProgressFromStorage = () => {
  try { const me = JSON.parse(localStorage.getItem('harness_user') || '{}'); autoProgressFlag.value = me?.auto_progress !== false }
  catch { autoProgressFlag.value = true }
}
readAutoProgressFromStorage()
const isReviewMode = computed(() => !autoProgressFlag.value)
const isTogglingReviewMode = ref(false)
const toggleReviewMode = async () => {
  if (isTogglingReviewMode.value) return
  // [2026-06] 회의록 처리 중 모드 전환 차단 (UI disabled 와 이중 방어). endpoint 는
  // enqueue 시점 모드로 확정되므로, 처리 중 토글하면 job 결과(CPS만/CPS+PRD)와 UI
  // 모드가 어긋나 PRD 생성 게이트가 사라지는 race 를 막는다.
  if (isBackgroundProcessing.value || store.isRegisteringLog) {
    showWarning(t('plan.review.title_busy'))
    return
  }
  const next = !autoProgressFlag.value
  isTogglingReviewMode.value = true
  try {
    const result = await updateMeApi({ auto_progress: next })
    if (result.success) {
      autoProgressFlag.value = next
      try { const me = JSON.parse(localStorage.getItem('harness_user') || '{}'); me.auto_progress = next; localStorage.setItem('harness_user', JSON.stringify(me)) } catch {}
      showSuccess(next ? t('plan.toast.auto_mode_on') : t('plan.toast.auto_mode_off'))
    } else {
      showError(result.error || t('plan.toast.mode_change_fail'))
    }
  } finally {
    isTogglingReviewMode.value = false
  }
}

const deleteMeetingLog = async (version, options = {}) => {
  const { silent = false, skipConfirm = false } = options
  if (!skipConfirm) {
    const ok = await confirm({
      title: t('plan.confirm.delete_title'),
      message: t('plan.confirm.delete_message', { version }),
      confirmText: t('common.action.delete'), variant: 'danger',
    })
    if (!ok) return false
  }
  if (!silent) isLogsLoading.value = true
  try {
    await axios.post(`${API_BASE}/deleteMeeting`, { project_name: store.projectName, version }, { timeout: 300000 })
    if (!silent) showSuccess(t('plan.toast.delete_done', { version }))
    if (!silent) await fetchMeetingLogs(store.projectName)
    // 미팅 로그 삭제로 CPS/PRD 마스터가 재구성되거나 모두 비어졌을 수 있음 — readiness 재조회.
    readiness.invalidate()
    return true
  } catch (err) {
    // 백엔드가 422/500 으로 사유(detail)를 문자열로 담아 보내면 그대로 노출 — 사용자가
    // "잠시 후 다시 시도" 같은 실제 안내를 볼 수 있게. detail 이 객체(구조화된
    // gemini/quota 에러)인 경우는 axios 인터셉터가 이미 전용 토스트를 띄우므로
    // generic 메시지로 폴백.
    const detail = err?.response?.data?.detail
    if (!silent) {
      // [2026-06] detail 이 구조화 객체(예: 409 PROJECT_BUSY)면 message 를 노출 —
      // "다른 기기에서 처리 중" 안내가 generic 삭제 실패로 묻히지 않게.
      const msg = typeof detail === 'string' && detail
        ? detail
        : (detail && typeof detail === 'object' && detail.message) || t('plan.toast.delete_fail')
      showError(msg)
    }
    return false
  } finally {
    if (!silent) isLogsLoading.value = false
  }
}

const cpsList = ref([])
const isCpsLoading = ref(false)
const cpsError = ref(null)
const isPrdLoading = ref(false)
const prdError = ref(null)

// [2026-05-19] 403/404 는 "프로젝트 삭제 직후" / "신규 프로젝트 + 데이터 없음"
// 정상 흐름 → 에러 배너 안 띄움. 빈 상태 가이드 (empty-cps) 가 자동으로 노출
// 되며 사용자에게 "회의록부터 등록하세요" 친근 안내. 500/네트워크 등 진짜
// 장애만 에러 배너로 표시.
const _isExpectedEmpty = (err) => {
  const s = err?.response?.status
  return s === 403 || s === 404
}

const fetchCps = async (projectName) => {
  if (!projectName?.trim()) { cpsList.value = []; return }
  isCpsLoading.value = true; cpsError.value = null
  try {
    const response = await axios.get(`${API_BASE}/getCPS`, { params: { projectName }, timeout: 300000 })
    const raw = response?.data?.result
    cpsList.value = Array.isArray(raw) ? raw : []
    // [debug] BE 응답이 빈 배열이거나 예상과 다른 형식이면 콘솔에 기록 — DevTools 에서 확인.
    if (cpsList.value.length === 0) {
      console.warn(`[plan/getCPS] empty result for "${projectName}". raw response:`, response?.data)
    }
  } catch (err) {
    cpsList.value = []
    if (_isExpectedEmpty(err)) {
      // 빈 상태 가이드가 노출 — 사용자 입장 "데이터 없음" 흐름.
      console.info(`[plan/getCPS] no data for "${projectName}" (status=${err?.response?.status})`)
    } else {
      cpsError.value = t('plan.err.cps_fetch', { code: err?.response?.status || err?.code || err?.message || 'unknown' })
      console.error(`[plan/getCPS] failed for "${projectName}":`, err?.response?.data || err)
    }
  } finally {
    isCpsLoading.value = false
  }
}

const fetchPrd = async (projectName) => {
  if (!projectName?.trim()) { prdSections.value = []; return }
  isPrdLoading.value = true; prdError.value = null
  try {
    // [2026-06-01] cache-bust — autofix/편집 저장 직후 재조회가 게이트웨이/브라우저
    // 캐시의 옛 body 를 돌려줘 "저장했는데 안 바뀜"처럼 보이던 문제 차단. _t 로 매 요청
    // URL 을 유니크하게 + no-cache 헤더. (rawContent 갱신 → usePrdLint 점수도 자동 재계산)
    const response = await axios.get(`${API_BASE}/getPRD`, {
      params: { projectName, _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache' },
      timeout: 300000,
    })
    const raw = response?.data?.result
    prdSections.value = Array.isArray(raw) ? raw : []
    if (prdSections.value.length === 0) {
      console.warn(`[plan/getPRD] empty result for "${projectName}". raw response:`, response?.data)
    }
  } catch (err) {
    prdSections.value = []
    if (_isExpectedEmpty(err)) {
      console.info(`[plan/getPRD] no data for "${projectName}" (status=${err?.response?.status})`)
    } else {
      prdError.value = t('plan.err.prd_fetch', { code: err?.response?.status || err?.code || err?.message || 'unknown' })
      console.error(`[plan/getPRD] failed for "${projectName}":`, err?.response?.data || err)
    }
  } finally {
    isPrdLoading.value = false
  }
}

// 빈 상태 / 에러 상태에서 사용자가 수동 재시도. 캐시 비우고 강제 fetch.
const retryFetch = async (kind) => {
  const name = store.projectName
  if (!name) return
  invalidateCache([kind])
  await ensureLoaded(kind, name)
}

const isRebuildingMaster = ref(false)
const rebuildMaster = async () => {
  const name = store.projectName
  if (!name || isRebuildingMaster.value) return
  isRebuildingMaster.value = true
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  try {
    await axios.get(`${base}/api/v2/pipelines/rebuild_master`, {
      params: { project_name: name },
      timeout: 300000,
    })
    showSuccess(t('plan.toast.rebuild_done'))
    invalidateCache(['cps', 'prd'])
    await Promise.all([fetchCps(name), fetchPrd(name)])
  } catch (err) {
    // [2026-05-26] BE detail 우선 노출 — generic 메시지로 falling through 하면
    // 사용자가 "재시도" 무한 반복. detail 이 BE 의 명확한 안내 (예: 데이터 손상 의심)
    // 을 사용자에게 그대로 전달. detail 길면 timeout 도 연장 (10초).
    const detail = err?.response?.data?.detail
    const status = err?.response?.status
    if (detail) {
      // BE 가 명시 detail 보냄 — 그대로 + 충분한 표시 시간
      showError(detail, { timeout: 12000 })
    } else if (status === 504 || err?.code === 'ECONNABORTED') {
      showError(t('plan.toast.rebuild_timeout'))
    } else if (status >= 500) {
      showError(t('plan.toast.server_error', { status }))
    } else {
      showError(t('plan.toast.rebuild_fail'))
    }
  } finally {
    isRebuildingMaster.value = false
  }
}

const _loadedFor = { logs: null, cps: null, prd: null }
const invalidateCache = (kinds = ['logs', 'cps', 'prd']) => { for (const k of kinds) _loadedFor[k] = null }
const ensureLoaded = async (kind, projectName) => {
  if (!projectName || _loadedFor[kind] === projectName) return
  _loadedFor[kind] = projectName
  try {
    if (kind === 'logs') await fetchMeetingLogs(projectName)
    else if (kind === 'cps') await fetchCps(projectName)
    else if (kind === 'prd') await fetchPrd(projectName)
  } catch (e) { _loadedFor[kind] = null; throw e }
}

watch(() => store.projectName, async (newVal, oldVal) => {
  if (newVal !== oldVal) invalidateCache()
  if (!newVal) return
  await Promise.all([ensureLoaded('logs', newVal), ensureLoaded('cps', newVal), ensureLoaded('prd', newVal)])
}, { immediate: true })

// [2026-05-18] 배치 진행 중 per-item 완료 즉시 UI 반영.
// 이전엔 onAllComplete (배치 전체 끝) 에서만 refresh — 18건 배치라면 마지막 항목
// 끝날 때까지 History/CPS/PRD 빈 채로 사용자가 한참 기다림.
// 이제 batchState.logs 의 'done' 개수가 증가할 때마다 자동 refresh → V3 완료 즉시
// History 에 v1.3 추가 + CPS 탭 데이터 갱신.
const _batchDoneCount = computed(
  () => (jobsStore.batchState.logs || []).filter(l => l.status === 'done').length,
)
watch(_batchDoneCount, async (next, prev) => {
  if (next <= prev) return
  const name = store.projectName
  if (!name) return
  await fetchMeetingLogs(name, false)
  invalidateCache(['cps', 'prd'])
  if (subTab.value === 'cps') await ensureLoaded('cps', name)
  else if (subTab.value === 'prd') await ensureLoaded('prd', name)
  // [2026-05-25 fix] batch 진행 중 미팅 로그 카운터가 \"0/50\" 으로 머무르던
  // 버그 — 각 step done 마다 usage refresh + design 점수 갱신.
  usageStore.refresh({ force: true, silent: true })
  notifyEvalScoreRefresh()
})

watch(() => subTab.value, (newTab) => {
  const name = store.projectName
  if (!name) return
  const kind = newTab === 'log' ? 'logs' : newTab === 'cps' ? 'cps' : newTab === 'prd' ? 'prd' : null
  if (kind) ensureLoaded(kind, name)
})

watch(() => selectedLog.value, (newVer) => {
  if (newVer) fetchLogDetail(store.projectName, newVer)
})

const currentCps = computed(() => cpsList.value.length > 0 ? cpsList.value[0] : null)
const nextVersion = computed(() => {
  const logs = meetingLogs.value
  if (!Array.isArray(logs) || logs.length === 0) return 'v1.1'
  // logs 는 compareVersionsDesc 로 정렬돼 있으므로 [0] 이 최신.
  return computeNextVersion(logs[0]?.version)
})

const batchState = computed(() => jobsStore.batchState)
const resetBatch = () => jobsStore.resetBatch()
const stopBatch = () => jobsStore.stopBatch()
// [중지 — 2026-06-01] 진행 알림(BackgroundProcessingNotice)의 "중지" — 단일 잡과
// (혹시 모를) 배치를 함께 멈추고 화면을 즉시 풀어준다. BE 가 이미 만든 결과는
// 새로고침/재진입 시 자동 반영된다.
const stopActiveJobs = () => {
  if (jobsStore.batchState?.running) jobsStore.stopBatch()
  jobsStore.stopAllActiveJobs()
  showSuccess(t('plan.toast.jobs_stopped'), { timeout: 6000 })
}

const runBatch = (entries, startIndex = 0) => {
  jobsStore.runBatchChain({
    entries, startIndex, baseVersion: nextVersion.value, projectName: store.projectName,
    enqueueOne: async (entry, nextEntry) => {
      // [2026-05-21] 콜리전 사전 정리 — V10 의 이전 실패 시 Meeting_Log 만 부분 저장된 채
      // CPS/PRD 가 못 만들어진 상태에서 같은 V10 을 다시 처리하면 gateway 의
      // meeting_log_exists 가드(409) 에 막힘. 사용자가 entries 를 명시 선택해
      // startBatch 한 상황이므로 충돌 시 silent 삭제 후 재시도.
      // [2026-06] 단, 자동 부여 버전(autoVersion — 무버전 문서에 파서가 번호를 붙인 것)은
      // 사용자가 고른 식별자가 아니므로 충돌해도 기존 미팅을 silent 삭제하지 않는다 —
      // 그 경우 409 로 시끄럽게 실패하는 쪽이 데이터 파괴보다 안전.
      if (entry.version && !entry.autoVersion && meetingLogs.value.some(l => l.version === entry.version)) {
        try {
          await deleteMeetingLog(entry.version, { silent: true, skipConfirm: true })
          await fetchMeetingLogs(store.projectName, false)
        } catch (e) { console.warn('[batch] pre-cleanup failed for', entry.version, e) }
      }
      // nextEntry: BE 가 다음 버전 extract 를 선반입(prefetch)하도록 전달 (batch 파이프라이닝).
      const { taskId } = await enqueueMeetingPost(entry.content, entry.version, nextEntry)
      return taskId
    },
    onAllComplete: async () => {
      await fetchMeetingLogs(store.projectName)
      invalidateCache(['cps', 'prd'])
      if (subTab.value === 'cps') await ensureLoaded('cps', store.projectName)
      else if (subTab.value === 'prd') await ensureLoaded('prd', store.projectName)
      usageStore.refresh({ force: true })
      readiness.invalidate()
      showSuccess(t('plan.toast.batch_complete'), { timeout: 6000 })
    },
    onError: async (err) => {
      // [2026-05-21] 배치 중간 에러 시에도 meetingLogs refresh — 성공한 V1~V9 가
      // UI list 에 누락된 상태로 남으면 사용자가 V9 클릭 시 stale 데이터 보게 됨.
      try { await fetchMeetingLogs(store.projectName, false) } catch {}
      invalidateCache(['cps', 'prd'])
      // BE 의 친절한 다중줄 안내(권장 조치 3가지 포함) 를 충분히 읽도록 토스트 timeout 확장.
      showError(t('plan.toast.batch_error', { err: extractError(err, t('plan.err.unknown')) }), { timeout: 15000 })
    },
  })
}

const retryBatch = async () => {
  const { errorIndex, entries } = jobsStore.batchState
  if (errorIndex == null || !entries?.length) return
  const projectName = store.projectName
  await fetchMeetingLogs(projectName, false)
  // entries[errorIndex].version 이 BE 에 실제 저장된 version 문자열. 이전 코드는
  // baseVersion('v1.X') 에서 계산했지만 batch entries 는 'V10' 형식이라 매치 안 됨.
  // runBatch 의 enqueueOne 도 pre-cleanup 하지만 여기서 한 번 더 정리해두면
  // 큐가 비기 전 race 가능성도 줄여줌.
  const expectedVersion = entries[errorIndex]?.version
  if (expectedVersion && meetingLogs.value.some(l => l.version === expectedVersion)) {
    isLogsLoading.value = true
    let deleted = false
    try {
      deleted = await deleteMeetingLog(expectedVersion, { silent: true, skipConfirm: true })
      if (deleted) await fetchMeetingLogs(projectName, false)
    } finally {
      isLogsLoading.value = false
    }
    if (!deleted) {
      showError(t('plan.toast.partial_delete_fail', { version: expectedVersion }))
      return
    }
  }
  runBatch(entries, errorIndex)
}

const prdSections = ref([])
const addPrdSection = () => prdSections.value.push({ title: `${prdSections.value.length + 1}. New Section`, content: '' })
const removePrdSection = index => prdSections.value.splice(index, 1)

const tabs = computed(() => [
  { value: 'log', title: t('plan.tab.log'), subtitle: 'Meeting Log' },
  { value: 'cps', title: t('plan.tab.cps'), subtitle: 'CPS', guide: 'cps-tab' },
  { value: 'prd', title: t('plan.tab.prd'), subtitle: 'PRD', guide: 'prd-tab' },
  { value: 'eslint', title: t('plan.tab.eslint'), subtitle: 'Rule Generator', guide: 'rule-generator-tab' },
])
</script>

<template>
  <div class="d-flex flex-column fill-height w-100 pt-0 page-root">
    <div class="flex-shrink-0 mb-0 px-0 mt-6 w-100">
      <div class="pa-0 pb-2">
        <div class="mb-4 plan-headline-row">
          <div class="plan-headline-text">
            <h2 class="text-h4 font-weight-black text-main tracking-tight serif-text">{{ $t('plan.headline') }}</h2>
            <p class="text-caption text-muted mt-2 font-weight-medium" v-html="$t('plan.sub')"></p>
          </div>
          <div class="plan-guide-btn-group">
            <button type="button" class="plan-guide-btn plan-guide-btn--mcp" @click="openMcpGuide" :title="$t('plan.mcp_title')">
              <Sparkles :size="14" /><span>{{ $t('plan.mcp_btn') }}</span>
              <span class="plan-guide-new-pill">NEW</span>
            </button>
            <button type="button" class="plan-guide-btn" @click="openGuide" :title="$t('plan.guide_title')">
              <HelpCircle :size="14" /><span>{{ $t('plan.guide_btn') }}</span>
            </button>
          </div>
        </div>
      </div>

      <EmptyProjectCard v-if="!store.projectName" />

      <div v-else class="d-flex align-center justify-space-between flex-wrap mb-4" style="gap: 8px;">
        <SubTabRow
          :model-value="subTab"
          :tabs="tabs"
          :disabled="store.isRegisteringLog"
          @update:model-value="requestSubTab"
        />
        <div class="d-flex align-center justify-end" style="gap: 12px; flex-wrap: wrap; margin-left: auto;">
          <ReviewModeToggle
            :is-review-mode="isReviewMode"
            :is-toggling="isTogglingReviewMode"
            :disabled="isBackgroundProcessing || store.isRegisteringLog"
            @toggle="toggleReviewMode"
          />
          <MeetingQuotaNote
            v-if="subTab === 'log' && usageStore.data"
            :meeting-used="usageStore.meetingUsed"
            :meeting-limit="usageStore.meetingLimit"
            :meeting-remaining="usageStore.meetingRemaining"
            :meeting-pct="usageStore.meetingPct"
            :days-until-reset="usageStore.daysUntilReset"
            :tier-label="usageStore.tierLabel"
          />
        </div>
      </div>
    </div>

    <div v-if="store.projectName" class="flex-grow-1 overflow-hidden position-relative w-100 d-flex flex-column">
      <div class="fill-height w-100 position-relative d-flex flex-column flex-grow-1">
        <div v-if="subTab === 'log'" class="fill-height w-100 h-100 fade-in d-flex flex-column">
          <!-- 샘플 체험 토큰 소모 안내 — 저장 전까지 노출 -->
          <div v-if="sampleMode" class="sample-token-notice">
            {{ $t('plan.sample_notice') }}
            <button type="button" class="sample-token-notice__close" :aria-label="$t('common.action.close')" @click="sampleMode = false">×</button>
          </div>
          <MeetingLogTab class="flex-grow-1 min-h-0"
            :meeting-logs="meetingLogs" :selected-log="selectedLog"
            :is-loading="isLogsLoading" :next-version="nextVersion"
            :project-name="store.projectName" :batch-state="batchState"
            :current-job-stage="currentJobStage"
            :is-saving="isSaving"
            :preset-draft="presetDraft"
            :remote-busy="remoteBusy"
            :autofix-busy="autofixBusy"
            @update:selected-log="selectedLog = $event"
            @fetch-detail="(v) => fetchLogDetail(store.projectName, v)"
            @save="saveMeetingLog" @search="fetchMeetingLogs" @delete="deleteMeetingLog"
            @batch="runBatch" @retry-batch="retryBatch" @reset-batch="resetBatch"
            @stop-batch="stopBatch"
            @open-notion="openNotionDialog"
          />
        </div>

        <div v-if="subTab === 'cps'" class="fill-height w-100 h-100 fade-in">
          <div v-if="isReviewMode && currentCps" class="review-gate-banner">
            <span class="review-gate-text">{{ $t('plan.review_gate') }}</span>
            <button class="review-gate-cta" :disabled="isGeneratingPrd" @click="triggerPrdGeneration">
              <Loader2 v-if="isGeneratingPrd" :size="13" class="mr-1 spin" />
              {{ isGeneratingPrd ? $t('plan.generating_prd') : $t('plan.generate_prd') }}
            </button>
          </div>
          <VProgressLinear v-if="isCpsLoading" indeterminate color="accent" class="mb-4" />
          <VAlert v-else-if="cpsError" type="error" variant="tonal" class="mb-4">{{ cpsError }}</VAlert>
          <template v-else-if="currentCps">
            <AiDraftNotice :label="$t('plan.cps_ai_label')" dismissible storage-key="harness_aidraft_dismissed_cps" :version="currentCps?.last_updated" />
            <CpsTab :cps="currentCps" :editable="isReviewMode" :project-name="store.projectName" :remote-busy="remoteBusy" @navigate="requestSubTab($event)" @saved="fetchCps(store.projectName)" @update:editing="cpsEditing = $event" />
          </template>
          <div v-else class="fill-height d-flex flex-column align-center justify-center mt-10 empty-cps">
            <!-- [2026-05-21] 백그라운드 처리 중이면 진행 상황 우선 노출 — 사용자가
                 [다시 시도] 를 무의미하게 반복하지 않게. batch chain (V1→V2→V3) 진행 시
                 각 V 의 status 까지 시각화. -->
            <BackgroundProcessingNotice
              v-if="isBackgroundProcessing"
              :batch-state="batchState"
              :active-jobs="activeJobsView"
              @focus-log="subTab = 'log'"
              @stop="stopActiveJobs"
            />
            <template v-else>
              <VIcon icon="mdi-file-search-outline" size="x-large" color="muted" class="mb-4 empty-cps-icon" />
              <div class="text-h6 font-weight-bold mb-2">{{ $t('plan.empty_cps.title') }}</div>
              <p v-if="meetingLogs.length > 0" class="text-caption text-muted mb-1" style="max-width:520px;text-align:center;line-height:1.7;">
                <span v-html="$t('plan.empty_cps.has_logs', { count: meetingLogs.length })" /><br />
                <span v-html="$t('plan.recover_hint')" />
              </p>
              <p v-else class="text-caption text-muted mb-1" style="max-width:520px;text-align:center;line-height:1.7;">
                <span v-html="$t('plan.empty_cps.no_logs_hint')" /><br />
                {{ $t('plan.empty_cps.auto_create') }}
              </p>
              <div class="d-flex mt-4 flex-wrap justify-center" style="gap: 8px;">
                <!-- [2026-05-19] 회의록 없을 때 primary CTA — 직접 이동 -->
                <VBtn
                  v-if="meetingLogs.length === 0"
                  color="accent"
                  @click="subTab = 'log'"
                >
                  <VIcon size="14" class="mr-2">mdi-arrow-right</VIcon>
                  {{ $t('plan.go_log') }}
                </VBtn>
                <VBtn variant="outlined" color="accent" :loading="isCpsLoading" @click="retryFetch('cps')">
                  <VIcon size="14" class="mr-2">mdi-refresh</VIcon>
                  {{ $t('common.action.retry') }}
                </VBtn>
                <VBtn
                  v-if="meetingLogs.length > 0"
                  variant="tonal" color="warning"
                  :loading="isRebuildingMaster"
                  @click="rebuildMaster"
                >
                  <VIcon size="14" class="mr-2">mdi-wrench</VIcon>
                  {{ $t('plan.rebuild_master') }}
                </VBtn>
              </div>
            </template>
          </div>
        </div>

        <div v-if="subTab === 'prd'" class="fill-height w-100 h-100 fade-in">
          <VProgressLinear v-if="isPrdLoading" indeterminate color="accent" class="mb-4" />
          <VAlert v-else-if="prdError" type="error" variant="tonal" class="mb-4">{{ prdError }}</VAlert>
          <template v-else-if="prdSections && prdSections.length > 0">
            <AiDraftNotice :label="$t('plan.prd_ai_label')" dismissible storage-key="harness_aidraft_dismissed_prd" :version="prdSections?.[0]?.last_updated" />
            <PrdTab
              ref="prdTabRef"
              :prd-sections="prdSections" :editable="isReviewMode" :project-name="store.projectName"
              :remote-busy="remoteBusy"
              @add-section="addPrdSection" @remove-section="removePrdSection" @saved="fetchPrd(store.projectName)"
              @go-to-log="requestSubTab('log')"
              @update:editing="prdEditing = $event"
            />
          </template>
          <div v-else class="fill-height d-flex flex-column align-center justify-center mt-10 empty-cps">
            <!-- [2026-05-21] 백그라운드 처리 중이면 PRD 도 곧 따라옴. 알림 우선. -->
            <BackgroundProcessingNotice
              v-if="isBackgroundProcessing"
              :batch-state="batchState"
              :active-jobs="activeJobsView"
              @focus-log="subTab = 'log'"
              @stop="stopActiveJobs"
            />
            <template v-else>
              <VIcon icon="mdi-text-box-search-outline" size="x-large" color="muted" class="mb-4 empty-cps-icon" />
              <div class="text-h6 font-weight-bold mb-2">{{ $t('plan.empty_prd.title') }}</div>
              <p v-if="isReviewMode" class="text-caption text-muted mb-1" style="max-width:520px;text-align:center;line-height:1.7;">
                <span v-html="$t('plan.empty_prd.review_hint')" /><br />
                <span v-if="currentCps">{{ $t('plan.empty_prd.go_cps') }}</span>
                <span v-else>{{ $t('plan.empty_prd.need_cps') }}</span>
              </p>
              <p v-else-if="currentCps" class="text-caption text-muted mb-1" style="max-width:520px;text-align:center;line-height:1.7;">
                <span v-html="$t('plan.empty_prd.auto_no_prd')" /><br />
                <span v-html="$t('plan.recover_hint')" />
              </p>
              <p v-else class="text-caption text-muted mb-1" style="max-width:520px;text-align:center;line-height:1.7;">
                <span v-html="$t('plan.empty_prd.auto_hint')" /><br />
                <span v-html="$t('plan.recover_hint')" />
              </p>
            <div class="d-flex mt-4 flex-wrap justify-center" style="gap: 8px;">
              <!-- [2026-05-19] 회의록 없을 때 primary CTA — 직접 이동 -->
              <VBtn
                v-if="meetingLogs.length === 0"
                color="accent"
                @click="subTab = 'log'"
              >
                <VIcon size="14" class="mr-2">mdi-arrow-right</VIcon>
                {{ $t('plan.go_log') }}
              </VBtn>
              <VBtn variant="outlined" color="accent" :loading="isPrdLoading" @click="retryFetch('prd')">
                <VIcon size="14" class="mr-2">mdi-refresh</VIcon>
                {{ $t('common.action.retry') }}
              </VBtn>
              <VBtn
                v-if="meetingLogs.length > 0 && !currentCps"
                variant="tonal" color="warning"
                :loading="isRebuildingMaster"
                @click="rebuildMaster"
              >
                <VIcon size="14" class="mr-2">mdi-wrench</VIcon>
                {{ $t('plan.rebuild_master') }}
              </VBtn>
              <VBtn
                v-if="currentCps"
                color="accent"
                :loading="isGeneratingPrd"
                @click="triggerPrdGeneration"
              >
                {{ $t('plan.generate_prd_btn') }}
                <VIcon size="14" class="ml-2">mdi-arrow-right</VIcon>
              </VBtn>
            </div>
            </template>
          </div>
        </div>

        <div v-if="subTab === 'eslint'" class="fill-height w-100 h-100 fade-in">
          <RuleGeneratorTab :project-name="store.projectName" />
        </div>
      </div>
    </div>

    <UserGuideModal v-model="showGuide" />
    <McpGuideModal v-model="showMcpGuide" />
    <NotionImportDialog
      v-model="showNotionDialog"
      :project-name="store.projectName"
      :next-version="nextVersion"
      @imported="onNotionImported"
      @notion-disconnected="onNotionDisconnected"
    />

    <NotionExportDialog
      v-model="notionOpen"
      :project-name="store.projectName"
      :team-id="projectStore.activeTeamId || ''"
      :docs="notionDocs"
    />

    <!-- [편집 가드] 편집 중 탭/스텝 이동 시 저장 안 된 변경 confirm -->
    <VDialog v-model="editGuardOpen" max-width="420" persistent>
      <VCard rounded="lg" class="pa-2">
        <VCardTitle class="text-subtitle-1 font-weight-bold">{{ $t('plan.edit_guard.title') }}</VCardTitle>
        <VCardText class="text-body-2 text-medium-emphasis">{{ $t('plan.edit_guard.body') }}</VCardText>
        <VCardActions class="justify-end">
          <VBtn variant="text" @click="resolveEditGuard(false)">{{ $t('plan.edit_guard.stay') }}</VBtn>
          <VBtn color="warning" variant="flat" @click="resolveEditGuard(true)">{{ $t('plan.edit_guard.leave') }}</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.sample-token-notice {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 10px; padding: 9px 14px; margin: 12px 20px 0;
  font-size: 0.78rem; font-weight: 600; color: #78350f; flex-shrink: 0;
}
.sample-token-notice__close {
  flex-shrink: 0; background: transparent; border: none;
  font-size: 1rem; color: #92400e; cursor: pointer; line-height: 1; padding: 2px 4px;
}
.sample-token-notice__close:hover { color: #78350f; }

.review-gate-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: linear-gradient(90deg, #fff7e6, #fff1d4); border: 1px solid #f5c878;
  border-radius: 10px; padding: 10px 14px; margin: 0 0 12px; font-size: 0.78rem;
}
.review-gate-text { color: #6b4f08; font-weight: 600; }
.review-gate-cta {
  display: inline-flex; align-items: center;
  background: linear-gradient(90deg, #d97706, #b45309); color: #fff;
  font-weight: 700; font-size: 0.74rem; padding: 6px 14px;
  border-radius: 9999px; border: none; cursor: pointer; transition: transform 0.15s ease, opacity 0.15s ease;
}
.review-gate-cta:hover:not(:disabled) { transform: translateY(-1px); }
.review-gate-cta:disabled { opacity: 0.6; cursor: not-allowed; }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.plan-headline-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.plan-headline-text { min-width: 0; flex: 1; }
.plan-guide-btn-group { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
.plan-guide-btn {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 7px 14px; border-radius: 9999px; border: 1px solid var(--border-light);
  background: white; color: var(--text-main);
  font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.plan-guide-btn:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.plan-guide-btn--mcp {
  border-color: transparent;
  background: linear-gradient(white, white) padding-box, linear-gradient(135deg, #7c3aed, #4f46e5) border-box;
  border: 1px solid transparent; color: #4f46e5;
}
.plan-guide-btn--mcp:hover { color: #4f46e5; }
.plan-guide-new-pill { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 4px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; font-size: 0.55rem; font-weight: 800; letter-spacing: 0.06em; }
@media (max-width: 600px) {
  .plan-headline-row { flex-wrap: wrap; }
  .plan-guide-btn-group { width: 100%; }
  .plan-guide-btn { font-size: 0.6rem; padding: 6px 11px; }

  /* 모바일: 탭 콘텐츠 영역의 고정 높이/overflow 해제 → 페이지 스크롤으로 흘려보냄
     (2026-06-05). 데스크탑은 overflow-hidden + fill-height 로 패널 내부 스크롤을
     쓰지만, 모바일에선 회의록 리스트·BatchPanel START 버튼이 잘려 보이던 문제. */
  .flex-grow-1.overflow-hidden { overflow: visible !important; flex: 0 0 auto !important; }
  .fill-height, .h-100 { height: auto !important; }
  .min-h-0 { min-height: 0 !important; }
}

/* v-html 삽입 <strong> 스타일 — scoped CSS 는 동적 삽입 요소에 적용 안 됨 */
.empty-cps :deep(strong) { font-weight: 700; }

/* CPS / PRD 빈 상태 — 재시도 버튼 + 안내 */
.empty-cps { color: var(--text-main, #2A2421); }
.empty-cps strong { color: var(--text-main, #2A2421); font-weight: 700; }
.empty-cps-icon { opacity: 0.35; }
</style>
