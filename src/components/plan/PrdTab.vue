<script setup>
import { computed, ref, nextTick, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Layout, Shield, Package, Eye, Edit3, Save, X as IconX, Loader2, Zap, Download, FileDown, Copy, Check } from 'lucide-vue-next'
import { md } from '@/utils/markdown'
import { useDocMdExport } from '@/composables/useDocMdExport'
import { useDocStaleDismiss } from '@/composables/useDocStaleDismiss'
import axios from '@/utils/axios'
import { T_PIPELINE_MS } from '@/utils/timeouts'
import { useHarnessStore } from '@/store/harness'
import { useAutofixStore } from '@/store/autofix'
import { useSnackbar } from '@/composables/useSnackbar'
import { extractError } from '@/utils/apiErrors'
import { usePrdLint } from '@/composables/usePrdLint'
import { requestInterviewOpen } from '@/composables/useInterviewEntry'
import PrdLintBadge from './PrdLintBadge.vue'
import { notifyEvalScoreRefresh } from '@/composables/useEvalScore'
import ResynthDiffModal from './ResynthDiffModal.vue'
import PrdNodeEditor from './PrdNodeEditor.vue'
// markdown_stale 배너 — design·CpsTab·PrdTab 공유 공통 컴포넌트 (harness#364 통합).
// title/subtitle prop + #actions slot 으로 재합성·편집·해제 버튼을 host 가 직접 제어.
import StaleBanner from '@/components/common/StaleBanner.vue'

const { t, locale } = useI18n()
const harnessStore = useHarnessStore()
const autofixStore = useAutofixStore()
const { showSuccess, showError, showWarning } = useSnackbar() ?? {}

const props = defineProps({
  prdSections: { type: Array, required: true },
  // [2026-05 검수 게이트 Phase 2.4] 편집 모드 허용 여부 (auto_progress=false 시 true).
  editable: { type: Boolean, default: false },
  // 편집 저장 시 PATCH /api/v2/prd 호출에 필요.
  projectName: { type: String, default: '' },
  // [2026-06-11 멀티디바이스] 다른 기기/탭에서 master 쓰기 작업 진행 중 — 편집/보완을
  // 사전 차단해 곧 충돌(409)할 작업으로 시간·토큰을 낭비하지 않게. 데이터 자체는
  // client_updated_at 낙관적 잠금이 지킨다(이건 안내용 1차 가드).
  remoteBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['saved', 'go-to-log', 'update:editing'])

// ─── [2026-05] 편집 모드 ────────────────────────────────────
const isEditing = ref(false)
const editContent = ref('')
// [2026-06] 편집 범위 — 'section'(활성 탭 섹션만, 기본) | 'full'(섹션 분할 실패 fallback).
// CPS 와 동일하게 현재 탭 섹션만 textarea 에 띄우고, 저장 시 나머지 섹션은 보존한다.
const editScope = ref('section')
const isSaving = ref(false)
// 편집 시작 시점 PRD last_updated — 저장 PATCH 의 optimistic lock 용.
const editBaseUpdatedAt = ref(null)

// [편집 가드 — 2026-06] 편집 상태를 부모로 올림 — plan.vue 가 탭/스텝 이동 confirm 에 사용.
// 전체/섹션 마크다운 편집(isEditing) + 검수모드 PRD 그래프 노드 인라인 편집(PrdNodeEditor 가
// @update:editing 으로 올려줌)을 합산. CpsTab 의 isAnyEditing(편집||노드편집) 과 동일 패턴 —
// #420 에서 범위 밖이던 PrdNodeEditor 를 가드에 편입.
const nodeEditing = ref(false)
const isAnyEditing = computed(() => isEditing.value || nodeEditing.value)
watch(isAnyEditing, (v) => emit('update:editing', v), { immediate: true })
onBeforeUnmount(() => emit('update:editing', false))

const startEdit = () => {
  // [2026-06] CPS 와 동일하게 '활성 섹션만' 편집 — 전체 PRD 를 한 textarea 에 쏟지 않고
  // 현재 탭 섹션 텍스트만 띄운다. 저장 시 replaceActiveSection 으로 나머지 섹션 보존.
  const sectionText = splitSections.value[activeSection.value]
  if (sectionText && sectionText.trim()) {
    editScope.value = 'section'
    editContent.value = sectionText
  } else {
    // 섹션 분할 실패/빈 섹션 — 전체 markdown 편집 fallback (안전).
    editScope.value = 'full'
    const data = props.prdSections?.[0]
    editContent.value = (data?.prd_content || data?.output || data?.content || '').replace(/\\n/g, '\n')
  }
  // [2026-06-10 lost-update 가드] 편집 시작 시점 PRD 버전 캡처 — 저장 시
  // client_updated_at 으로 보내 다른 기기/백그라운드 변경 덮어쓰기 차단.
  editBaseUpdatedAt.value = prdData.value?.last_updated ?? null
  isEditing.value = true
}
const cancelEdit = () => {
  isEditing.value = false
  editContent.value = ''
  editScope.value = 'section'
}
const saveEdit = async () => {
  if (!props.projectName) {
    showError?.(t('prd.tab.toast.no_project'))
    return
  }
  if (!editContent.value.trim()) {
    showError?.(t('prd.tab.toast.content_empty'))
    return
  }
  // [2026-06] 섹션 편집이면 나머지 섹션 보존하며 병합, 전체 편집(fallback)이면 그대로.
  let finalContent = editContent.value
  if (editScope.value === 'section') {
    const merged = replaceActiveSection(activeSection.value, editContent.value)
    if (merged != null) finalContent = merged
  }
  // 길이 한도/큰 삭제 가드는 실제 저장될 '전체 문서'(finalContent) 기준 — 섹션 편집도 정확.
  if (finalContent.length > 500_000) {
    showError?.(t('prd.tab.toast.content_too_large'))
    return
  }
  // [2026-05-26] 큰 삭제 confirm — 사용자 실수 방지.
  // 원본 대비 50% 이상 줄어들면 명시 확인 (AI Agent 사고 같은 우발적 wipe 위험 완화).
  const oldContent = (props.prdSections?.[0]?.prd_content
    || props.prdSections?.[0]?.output
    || props.prdSections?.[0]?.content
    || '').replace(/\\n/g, '\n')
  const oldLen = oldContent.length
  const newLen = finalContent.length
  if (oldLen > 1000 && newLen < oldLen * 0.5) {
    const lostPct = Math.round((1 - newLen / oldLen) * 100)
    const ok = window.confirm(
      t('prd.tab.toast.large_delete_confirm', { pct: lostPct, deleted: oldLen - newLen }),
    )
    if (!ok) return
  }
  isSaving.value = true
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    await axios.patch(`${base}/api/v2/prd`, {
      project_name: props.projectName,
      content: finalContent,
      // [2026-06-10] 편집 시작 시점 스냅샷 — 그 사이 변경 시 BE 409 (덮어쓰기 차단).
      ...(editBaseUpdatedAt.value != null
        ? { client_updated_at: editBaseUpdatedAt.value }
        : {}),
    })
    showSuccess?.(t('prd.tab.toast.save_ok'))
    isEditing.value = false
    editScope.value = 'section'
    emit('saved')
    // [h — 2026-05-25] PRD 변경 → SPACK/DDD/Arch 그래프 stale.
    // 즉시 점수 다시 측정해 사용자에게 변동 표시.
    notifyEvalScoreRefresh()
  } catch (err) {
    console.error('PRD 저장 실패:', err)
    if (err?.response?.status === 409) {
      showError?.(t('prd.tab.toast.save_conflict'), { timeout: 9000 })
    } else {
      showError?.(t('prd.tab.toast.save_fail'))
    }
  } finally {
    isSaving.value = false
  }
}
// PRD 그래프 노드 ID 기반 인라인 수정(검수 모드)은 PrdNodeEditor.vue 로 분리.

// ─── [2026-05 Phase 3.5a] markdown_stale dismiss ───────────────
// [2026-06 공통화] stale 배너 dismiss(POST → 성공토스트 → saved) 는 useDocStaleDismiss 로 추출.
const { isDismissingStale, dismissStale } = useDocStaleDismiss({
  endpoint: '/api/v2/prd/markdown-stale/dismiss',
  getProjectName: () => props.projectName,
  onOk: () => showSuccess?.(t('prd.tab.toast.dismiss_ok')),
  onFail: () => showError?.(t('prd.tab.toast.dismiss_fail')),
  onSaved: () => emit('saved'),
})

// ─── [2026-05 Phase 3.5b/c] LLM 기반 PRD 재합성 + diff preview ──
const isResynthesizing = ref(false)
const isApplyingResynth = ref(false)
const showDiffModal = ref(false)
const resyncOldMd = ref('')
const resyncNewMd = ref('')

// [2026-05-26] 수동 "AI 로 정리" 버튼 제거 — BE 자동화 path (post_meeting / lazy /
// admin) 로 대체. 사용자 노출 0, 항상 깔끔한 PRD 유지.

// [2026-06-10 lost-update 가드] 보완/재합성 시작 시점의 PRD last_updated 스냅샷.
// 적용(PATCH) 시 client_updated_at 으로 보내 — 그 사이 미팅 처리·다른 기기 편집으로
// PRD 가 바뀌었으면 BE optimistic lock(409)이 덮어쓰기 유실을 차단한다.
const resyncBaseUpdatedAt = ref(null)

const resynthesizeMarkdown = async () => {
  if (!props.projectName) return
  // [2026-06-11 멀티디바이스] 곧 바뀔 PRD 기준 재합성은 적용 시점에 409 — 사전 차단.
  if (props.remoteBusy) {
    showWarning?.(t('prd.tab.toast.remote_busy'))
    return
  }
  isResynthesizing.value = true
  // 요청 직전 캡처 — 서버가 읽는 PRD 버전과 같거나 더 이전(보수적 = 안전한 방향).
  resyncBaseUpdatedAt.value = prdData.value?.last_updated ?? null
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    const { data } = await axios.post(
      `${base}/api/v2/prd/resynthesize`,
      { project_name: props.projectName },
      // [2026-06-10] 60s → T_PIPELINE_MS: autofix 와 같은 PRD 전체 LLM 재작성 계열 —
      // 실측 70~90s 로 60s 초과 가능 (autofix 타임아웃 실사고와 동일 패턴).
      { timeout: T_PIPELINE_MS }
    )
    resyncOldMd.value = data?.current_markdown
      || (prdData.value?.prd_content || prdData.value?.output || prdData.value?.content || '').replace(/\\n/g, '\n')
    resyncNewMd.value = data?.markdown || ''
    // [2026-06-10] 재합성은 서버본 기준 diff — 응답의 last_updated(서버가 읽은 정확한
    // 버전)가 있으면 요청 전 캡처(클라 화면 기준)보다 우선. 거짓 409 방지.
    resyncBaseUpdatedAt.value = data?.last_updated ?? resyncBaseUpdatedAt.value
    isAutofixPreview.value = false
    showDiffModal.value = true
  } catch (err) {
    console.error('PRD 재합성 실패:', err)
    const detail = err?.response?.data?.detail
    const geminiCoded = !!(detail && typeof detail === 'object'
      && typeof detail.code === 'string' && detail.code.startsWith('gemini_'))
    if (err?.response?.status === 404) {
      showError?.(t('prd.tab.toast.resynth_not_found'))
    } else if (err?.response?.status === 429 || err?.response?.status === 402 || geminiCoded) {
      // 429(Gemini quota 포함)·402·gemini 계열은 전역 인터셉터가 정확히 안내 — 중복/오안내 방지.
    } else {
      showError?.(extractError(err, t('prd.tab.toast.resynth_fail')))
    }
  } finally {
    isResynthesizing.value = false
  }
}

const applyResynth = async (newMd) => {
  if (!newMd || !props.projectName) return
  // [2026-06-11 멀티디바이스] 적용 직전 1차 가드 — 어차피 409 날 PATCH 사전 안내.
  if (props.remoteBusy) {
    showWarning?.(t('prd.tab.toast.remote_busy'))
    return
  }
  isApplyingResynth.value = true
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    await axios.patch(`${base}/api/v2/prd`, {
      project_name: props.projectName,
      content: newMd,
      // [2026-06-10] 보완 시작 시점 스냅샷 — 그 사이 PRD 변경 시 BE 가 409.
      // null(legacy/스냅샷 실패)이면 미포함 → 기존 동작(검사 skip).
      ...(resyncBaseUpdatedAt.value != null
        ? { client_updated_at: resyncBaseUpdatedAt.value }
        : {}),
    })
    showSuccess?.(isAutofixPreview.value ? t('prd.tab.toast.resynth_apply_autofix_ok') : t('prd.tab.toast.resynth_apply_ok'))
    if (isAutofixPreview.value) autofixStore.clearPending(props.projectName)
    showDiffModal.value = false
    isAutofixPreview.value = false
    emit('saved')
  } catch (err) {
    console.error('PRD 재합성 적용 실패:', err)
    if (err?.response?.status === 409) {
      // [2026-06-10] 보완 도중 PRD 가 변경됨(미팅 처리·다른 기기 편집) — 덮어쓰면
      // 그 변경이 유실되므로 적용을 취소하고 최신본 기준 재보완을 안내.
      showError?.(t('prd.tab.toast.apply_conflict'), { timeout: 9000 })
      if (isAutofixPreview.value) autofixStore.clearPending(props.projectName)
      showDiffModal.value = false
      isAutofixPreview.value = false
      emit('saved')  // 부모 refetch → 최신 PRD 로 갱신
    } else {
      showError?.(t('prd.tab.toast.resynth_apply_fail'))
    }
  } finally {
    isApplyingResynth.value = false
  }
}

const cancelResynth = () => {
  if (isAutofixPreview.value) autofixStore.clearPending(props.projectName)
  showDiffModal.value = false
  resyncOldMd.value = ''
  resyncNewMd.value = ''
  isAutofixPreview.value = false
}

// ─── [2026-05] PRD lint AI 자동 보완 (하이브리드) ───────────────────
// 배지의 "AI로 보완하기" → AI가 기존 맥락(CPS/Screens)으로 자동 보완 → diff preview.
// 근거가 없어 못 채운 항목은 needs_input 으로 와서, 회의록 탭의 AI 인터뷰로 안내.
// [2026-06-01] 진행 상태는 store 가 소유 — 탭/페이지 전환에도 유지(컴포넌트 unmount 무관).
const isAutofixing = computed(() => autofixStore.isAutofixing(props.projectName))
const autofixNeedsInput = ref([])   // [{ topic, question }] — store.needsInput 미러 (watch)
// diff 모달이 autofix(보완)로 열렸는지 — 제목 문구 구분용.
const isAutofixPreview = ref(false)

const runAutofix = async () => {
  if (!props.projectName) {
    showError?.(t('prd.tab.toast.no_project'))
    return
  }
  // [2026-06-11 멀티디바이스] 다른 기기 작업 중 — 보완안이 곧 바뀔 PRD 기준이 되고
  // 적용 시점엔 409 라 LLM 1~2분 + 토큰만 낭비. 시작 전에 안내하고 차단.
  if (props.remoteBusy) {
    showWarning?.(t('prd.tab.toast.remote_busy'))
    return
  }
  // [2026-06-01] 진행/결과를 store 가 소유 → 탭/페이지 전환에도 유지. store 가 중복(이미
  // 도는 중) 차단까지 담당. 결과(diff)는 watch(pendingDiff) 가 모달로 재노출한다.
  // [2026-06-10] baseUpdatedAt — 보완 시작 시점 PRD 버전. 적용 시 optimistic lock 용.
  const res = await autofixStore.runAutofix(props.projectName, rawContent.value, {
    baseUpdatedAt: prdData.value?.last_updated ?? null,
  })

  if (res.duplicate) {
    showWarning?.(t('prd.tab.toast.autofix_duplicate'))
    return
  }
  if (res.error) {
    const err = res.error
    const status = err?.response?.status
    const detail = err?.response?.data?.detail
    // 429(Gemini quota 포함)·402·gemini 계열은 전역 axios 인터셉터가 정확히 안내(예: "AI
    // 사용량 한도…") → 여기서 "너무 자주 요청했습니다" 같은 오안내를 덧대지 않는다.
    const geminiCoded = !!(detail && typeof detail === 'object'
      && typeof detail.code === 'string' && detail.code.startsWith('gemini_'))
    if (status === 429 || status === 402 || geminiCoded) {
      // 인터셉터 토스트가 정답 — 추가 안내 없음.
    } else if (status === 404) {
      showError?.(t('prd.tab.toast.autofix_no_prd'))
    } else if (err?.code === 'ECONNABORTED') {
      // timeout — 전역 인터셉터는 silent 처리하므로 여기서 안내. axios 원문
      // ("timeout of 90000ms exceeded") 영어 노출 방지.
      showError?.(t('prd.tab.toast.autofix_timeout'))
    } else {
      console.error('PRD autofix 실패:', err)
      showError?.(extractError(err, t('prd.tab.toast.autofix_fail')))
    }
    return
  }
  // 성공 — diff 가 있으면 watcher 가 모달을 띄운다. 변경 없음/needs_input 만 토스트.
  if (res.changed) {
    // diff 모달은 watch(pendingDiff) 가 처리 (전환 후 재진입에도 복원).
  } else if (res.needsInput && res.needsInput.length > 0) {
    showWarning?.(t('prd.tab.toast.autofix_needs_input'))
  } else {
    showSuccess?.(t('prd.tab.toast.autofix_enough'))
  }
}

// 자동 보완 적용 후 점수가 다시 측정되도록 — diff 적용 path 와 공유.
const dismissNeedsInput = () => {
  autofixNeedsInput.value = []
  autofixStore.clearNeedsInput(props.projectName)
  // [2026-06] BE 영속값도 함께 해제 — 안 지우면 새로고침/다른 기기에서 다시 뜸.
  // best-effort: 실패해도 로컬 dismiss 는 유지 (다음 새로고침 때 재노출되는 정도).
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  axios.post(`${base}/api/v2/prd/autofix/needs-input/dismiss`, {
    project_name: props.projectName,
  }).catch((err) => console.warn('autofix needs dismiss 동기화 실패:', err))
}
// [2026-06-12 보강 모드] 탭 전환 + 인터뷰 모달 자동 오픈 — 이전엔 토스트로
// "인터뷰 버튼을 눌러주세요"만 안내해 비전공자가 길을 잃었다. needs_input 의제는
// autofixStore 가 단일 소스라 InterviewDialog 가 직접 읽는다(여기서 안 들고 감).
const goToInterview = () => {
  requestInterviewOpen()
  emit('go-to-log')
}

// [2026-06-01] store 의 autofix 결과를 화면에 반영 — 탭/페이지 전환으로 PrdTab 이 다시
// mount 돼도 immediate watcher 가 진행 중이던 diff / needs_input 을 복원한다.
watch(
  () => autofixStore.pendingDiff(props.projectName),
  (diff) => {
    if (diff && diff.newMd) {
      resyncOldMd.value = diff.oldMd
      resyncNewMd.value = diff.newMd
      // 보완 시작 시점 PRD 버전 복원 — 탭 전환 후 재진입해도 optimistic lock 유지.
      resyncBaseUpdatedAt.value = diff.baseUpdatedAt ?? null
      isAutofixPreview.value = true
      showDiffModal.value = true
    }
  },
  { immediate: true },
)
watch(
  () => autofixStore.needsInput(props.projectName),
  (ni) => { autofixNeedsInput.value = Array.isArray(ni) ? ni : [] },
  { immediate: true },
)

const prdData = computed(() => props.prdSections?.[0] || null)

// [2026-06] BE 영속값으로 '인터뷰 필요' 안내 동기화 — 새로고침/다른 기기에서도 유지.
// - 배열 아님(undefined): 구버전 BE/로딩 — 판단 불가, no-op (배포 순서 안전)
// - 비어 있지 않음: 복원 (store 가 진행 중/이미 있음/dismiss 됨을 걸러 최신 행동 보호)
// - 빈 배열: BE 가 비웠음(인터뷰 merge 자동 소멸/다른 기기 dismiss) — 세션 패널도 내림
watch(
  () => prdData.value?.autofix_needs_input,
  (items) => {
    if (!Array.isArray(items)) return
    if (items.length > 0) autofixStore.restoreNeedsInput(props.projectName, items)
    else autofixStore.syncNeedsCleared(props.projectName)
  },
  { immediate: true },
)

const rawContent = computed(() => {
  const s = prdData.value?.prd_content || prdData.value?.output || prdData.value?.content || ''
  return s.replace(/\\n/g, '\n')
})

// [B 단계 — 2026-05-25] PRD 충실도 lint (LLM 미사용, ~10ms).
// rawContent 변경 시 자동 debounce 600ms 후 호출.
const { report: prdLintReport, loading: prdLintLoading } = usePrdLint(rawContent)

const downloadPdf = () => {
  if (!rawContent.value) return
  const title = t('prd.tab.pdf_doc_title', { name: props.projectName || 'PRD' })
  const bodyHtml = md.render(rawContent.value)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!DOCTYPE html>
<html lang="${locale.value}">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Pretendard Variable','Noto Sans KR','Apple SD Gothic Neo',sans-serif;max-width:860px;margin:0 auto;padding:48px 40px;color:#1a1a1a;line-height:1.75;font-size:14px}
  h1{font-size:1.8rem;font-weight:800;margin:0 0 24px}
  h2{font-size:1.35rem;font-weight:700;margin:2rem 0 .8rem;border-bottom:1.5px solid #e5e5e5;padding-bottom:6px}
  h3{font-size:1.1rem;font-weight:600;margin:1.5rem 0 .5rem}
  h4,h5,h6{font-size:1rem;font-weight:600;margin:1rem 0 .4rem}
  p{margin:0 0 .8rem}
  ul,ol{padding-left:1.5em;margin:0 0 .8rem}
  li{margin:.2rem 0}
  code{background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:.87em;font-family:'Menlo','Consolas',monospace}
  pre{background:#f3f4f6;padding:14px 16px;border-radius:6px;overflow-x:auto;margin:0 0 .8rem}
  pre code{background:none;padding:0}
  table{border-collapse:collapse;width:100%;margin:.8rem 0}
  th,td{border:1px solid #d5d5d5;padding:7px 12px;text-align:left;vertical-align:top}
  th{background:#f8f8f8;font-weight:600}
  blockquote{border-left:3px solid #c8c8c8;padding:0 0 0 14px;color:#555;margin:0 0 .8rem}
  hr{border:none;border-top:1px solid #e5e5e5;margin:1.5rem 0}
  @page{margin:18mm 16mm}
  @media print{body{padding:0}}
</style>
</head>
<body>${bodyHtml}</body>
</html>`)
  w.document.close()
  w.print()
}

// [2026-06 공통화] 복사·MD 다운로드(2초 체크 피드백 포함)는 useDocMdExport 로 추출
// (CpsTab/PrdTab 공통 로직). PDF 다운로드는 PRD 전용이라 위 downloadPdf 그대로 유지.
const { mdCopied, downloadMd, copyMd } = useDocMdExport(
  () => rawContent.value,
  {
    filenameLabel: 'PRD',
    getProjectName: () => props.projectName,
    onDownloadOk: () => showSuccess?.(t('prd.tab.toast.download_md_ok')),
    onCopyFail: () => showError?.(t('prd.tab.toast.copy_fail')),
  },
)

// [2026-06-24] Overview 의 "Success Metrics:" 하위 항목 nesting.
// prd_extract 템플릿상 Success Metrics 는 단일 불릿이지만, LLM 이 여러 지표로 펼치면
// (a) 들여쓴 하위 불릿 또는 (b) 같은 레벨 불릿으로 생성된다. 둘 다 같은 레벨 점(•)으로
// 떠서 "Success Metrics 에 포함된 내용"인지 안 보였다 (사장님 지적). → AC 의 `- [ ]`→4칸
// 치환과 동일한 메커니즘으로, 라벨 다음의 하위 불릿 마커를 4칸 들여쓰기로 치환해 점을
// 없애고 부모 li 의 continuation 으로 묶는다(`<li>Success Metrics:<br>지표1<br>지표2</li>`).
// 종료 신호: 빈 줄 / 불릿 아님(헤더·산문) / 같은-얕은 레벨의 형제 라벨(Role·다른 굵은 라벨).
// 라벨 줄: “- **Success Metrics**:” 단독(끝-앵커). 끝-앵커가 있어야 (a) 인라인 본문형
// (“- **Success Metrics**: a, b” → 묶을 하위 없음) 과 (b) 산문형(“- **Success Metrics** is our
// north star”) 을 라벨로 오인해 뒷 리스트를 흡수하는 false-positive 를 막는다.
const _SM_LABEL_RE = /^([ \t]*)[-*+][ \t]+\*\*\s*Success Metrics\s*\*\*\s*:?\s*$/i
const _SM_BULLET_RE = /^([ \t]*)[-*+][ \t]+(.*)$/
// 형제(=종료) 라벨: Role(굵게/백틱/대괄호 어느 형태든) 또는 다른 Overview 굵은 라벨.
// (?:\*\*\s*)? 로 **Role**·**[Role A]** 같은 굵은 Role 도 형제로 인식(흡수 방지).
const _SM_SIBLING_RE = /^(?:\*\*\s*(?:Product\s+Vision|Success Metrics|핵심 가치|주요 목표)\s*\*\*|`|(?:\*\*\s*)?\[?\s*Role\b)/i
// 코드펜스 토글 — 펜스 내부 사용자 코드/예시의 불릿 마커를 건드리지 않도록.
const _SM_FENCE_RE = /^[ \t]*(?:```|~~~)/
// 탭/스페이스 혼합 들여쓰기 폭 비교용 — 탭을 공백 4칸으로 환산.
const _smIndentWidth = (s) => (s || '').replace(/\t/g, '    ').match(/^ */)[0].length
const nestSuccessMetrics = (txt) => {
  // 빠른 통과: 라벨이 없으면 그대로. (_SM_LABEL_RE 는 줄-앵커라 전체 텍스트엔 못 씀 —
  // PRD 는 보통 "## 🚀 PRD:" 타이틀로 시작하므로 라벨이 첫 줄이 아니다.)
  if (!txt.includes('Success Metrics')) return txt
  const lines = txt.split('\n')
  const out = []
  let i = 0
  let inFence = false
  while (i < lines.length) {
    const line = lines[i]
    if (_SM_FENCE_RE.test(line)) { inFence = !inFence; out.push(line); i++; continue }
    const lm = inFence ? null : line.match(_SM_LABEL_RE)
    if (!lm) { out.push(line); i++; continue }
    out.push(line)                          // 라벨 줄은 그대로 유지
    const labelIndent = _smIndentWidth(lm[1])
    i++
    while (i < lines.length) {
      const sub = lines[i]
      if (_SM_FENCE_RE.test(sub)) break      // 펜스 시작 = 블록 종료(펜스는 바깥 루프가 처리)
      if (sub.trim() === '') break           // 빈 줄 = 블록 종료
      const bm = sub.match(_SM_BULLET_RE)
      if (!bm) {
        // 불릿 아님: 이미 들여쓴 continuation(예: AC 체크박스 치환 `- [ ]`→`    기준` 으로
        // 마커가 먼저 제거된 줄)이면 SM 하위로 흡수하고 계속. 비-들여쓰기 산문/헤더는 종료.
        if (/^[ \t]+\S/.test(sub)) { out.push(sub); i++; continue }
        break
      }
      const subIndent = _smIndentWidth(bm[1])
      // 같은/얕은 레벨의 형제 라벨(Role 등)이면 종료 — 더 들여쓴 하위는 무조건 포함.
      if (subIndent <= labelIndent && _SM_SIBLING_RE.test(bm[2].trim())) break
      out.push('    ' + bm[2])               // 마커 제거 → 4칸 continuation (AC 와 동일)
      i++
    }
  }
  return out.join('\n')
}

// ── Improve readability of raw text ──
const improveText = (txt) => {
  // [2026-05] LLM 이 "이 Story 는 다른 화면으로 이동" 표기를 HTML 주석으로 emit 한
  // 케이스 (markdown.html=false 라서 깨진 텍스트로 노출). 멀티라인 매치로 통째로
  // 잡아 plain text 한 줄로 변환. 빈 주석은 삭제.
  //
  // italic/이모지 같은 장식은 markdown-it emphasis 규칙(시작 `*` 뒤 공백/구두점이면
  // 미매치)과 마찰. 단순 plain text 로 두는 게 가장 안전 + bullet 안에 자연스럽게
  // 들어감. 시각 구분이 필요하면 DOM 사후 처리로 별도 대응.
  txt = txt.replace(/<!--([\s\S]*?)-->/g, (_m, inner) => {
    const cleaned = inner.trim().replace(/\s+/g, ' ')
    return cleaned ? cleaned : ''
  })

  // [2026-06] Acceptance Criteria 항목이 GFM 체크박스(`- [ ]`)로 생성되는데, 공용 markdown-it 에
  // task-list 플러그인이 없어 화면엔 literal `[]` 로 보였다(HTML 이 `[`·`]` 사이 공백을 접음).
  // 게다가 이 항목들은 "Acceptance Criteria:" 에 종속된 내용인데도 같은 레벨의 불릿(•)으로 떠서
  // 형제처럼 보였다. → 불릿 머리의 task 마커( [ ] / [x] / [] )를 통째로 4칸 들여쓰기로 치환해
  // 점(불릿)을 없애고 AC 의 하위(continuation)로 묶는다. md-it 이 들여쓴 줄을 부모 li 의
  // continuation 으로 렌더 → `<li>Acceptance Criteria:<br>기준1<br>기준2</li>` (점 없음).
  // `[Screen: …]`·`[API]` 처럼 내용 있는 bracket 은 미매치(마커는 빈칸/x/공백뿐).
  txt = txt.replace(/^[ \t]*[-*+][ \t]+\[[ xX]?\][ \t]*/gm, '    ')

  // [2026-06-24] "Success Metrics:" 하위 지표도 AC 와 동일하게 라벨 하위로 묶기(점 제거).
  // AC 마커 치환 직후·placeholder 정리 전에 수행 — 이 시점엔 "**Success Metrics**" 라벨이
  // 온전하고, 마커를 4칸 들여쓰기로 바꿔두면 아래 line-break 강제 정규식이 평평하게
  // 풀어버리지 못한다(AC 가 살아남는 것과 같은 이유).
  txt = nestSuccessMetrics(txt)

  // [2026-05-19] LLM 이 prompt template 의 placeholder 를 그대로 emit 한 케이스
  // 정리. 서버 측 `strip_template_placeholders` 의 사후 동기화 — 이미 저장된 옛
  // PRD 도 깨끗하게 보이게 한다. 두 패턴:
  //   1) `[...예:...]` bracket placeholder (단/멀티 라인 모두)
  //   2) `{한글-only}` curly placeholder (`{에픽명}`, `{스토리 내용}` 등)
  // 모두 '미정' 으로 대체. 정상 bracket/Story id 는 미매치 ("예:" 가 있어야 매치,
  // curly 는 한글-only 조건).
  txt = txt.replace(/\[[^\[\]]*예\s*:[^\[\]]*\]/g, '미정')
  txt = txt.replace(/\{[가-힣\s]{1,40}\}/g, '미정')

  // Collapse newlines inside [Screen: ...] or similar bracketed blocks to prevent breaking
  txt = txt.replace(/\[([^\]]+)\]/g, (match, content) => {
    return '[' + content.replace(/\s*\n\s*/g, ' - ') + ']'
  })

  // Bold labels
  txt = txt.replace(/(\[(?:정량적|정성적|핵심 가치|주요 목표)\])/g, '\n\n**$1** ')
  // Double newline before numbered lists
  txt = txt.replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2')
  // 고립된 구분선(--, ---)·내용 없는 빈 불릿 줄 제거 — PRD 머리말의 `---` separator 와
  // 빈 마커가 본문 맨 위에 "--"·빈 점(•)으로 노출되던 문제 해소(섹션은 #### 헤더로 구분).
  txt = txt.replace(/^[ \t]*-{2,}[ \t]*$/gm, '')
  txt = txt.replace(/^[ \t]*[-·•][ \t]*$/gm, '')
  // Deduplicate long repeats
  txt = txt.replace(/(.{20,})([\s\n]+\1){1,}/g, '$1')
  // Force line breaks before bullet-like patterns inside paragraphs (한글 bullet: ·, -, •)
  txt = txt.replace(/([^\n])(\n?)([-·•]\s)/g, (match, p1, p2, p3, offset, string) => {
    const lastNewline = string.lastIndexOf('\n', offset)
    const lineStart = string.substring(lastNewline + 1, offset)
    if (lineStart.trim().startsWith('#')) return match
    return `${p1}\n\n${p3}`
  })
  // Force line breaks before Korean label patterns like "통합 비전:", "목표:"
  txt = txt.replace(/([.다요함])(\s*)([가-힣]+\s*비전|[가-힣]+\s*목표)\s*:/g, '$1\n\n$3:')
  // 구분선·빈 불릿 제거로 생긴 과잉 빈 줄 정리 + 선행 공백 제거 (본문 맨 위 깔끔하게)
  txt = txt.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')
  return txt
}

// ── Split content into 4 major sections ──
// [2026-06] 섹션 경계(offset) 단일화 — 렌더용 분할(splitSections)과 편집 저장 시
// '활성 섹션만 교체'(replaceActiveSection)가 같은 규칙을 쓰도록 위치 계산을 한 곳에 둔다.
// ranges[key] = { start, end } | null (해당 섹션 미검출).
const sectionRanges = computed(() => {
  const text = rawContent.value
  const ranges = { overview: null, epic: null, screen: null, nfr: null }
  if (!text) return ranges

  // [2026-05-25 hotfix] prd_extract.md 와 prd_merge.md 의 출력 헤더 형식 차이로
  // FE 가 섹션 split 실패하던 버그. 양쪽 alias 모두 매칭하도록 regex 확장.
  //   prd_extract: \"Overview & Roles\" / \"Epics & User Stories\" / \"Non-Functional\" / \"Open Questions\"
  //   prd_merge:   \"Product Overview\" / \"Epic & User Story Map\" / \"Screen Architecture\" / \"Global Non-Functional Requirements\"
  const sectionHeaders = [
    { key: 'overview', pattern: /^#+\s*1\.\s*(Product\s+)?Overview(\s*&\s*Roles)?/im },
    { key: 'epic',     pattern: /^#+\s*2\.\s*Epics?\s*&\s*(User\s+)?Story?(?:s)?(\s*Map)?/im },
    { key: 'screen',   pattern: /^#+\s*3\.\s*Screen\s*Architecture/im },
    // nfr 은 3번 (prd_extract) 또는 4번 (prd_merge) 위치 가능 — section 번호 무시
    { key: 'nfr',      pattern: /^#+\s*[34]\.\s*(Global\s+)?Non-?Functional/im },
  ]

  let positions = sectionHeaders.map(h => {
    const match = text.match(h.pattern)
    return { key: h.key, index: match ? match.index : -1 }
  }).filter(p => p.index >= 0).sort((a, b) => a.index - b.index)

  // [i18n — 2026-06] 영어 단어 기반 매칭은 LLM 이 섹션 헤더를 번역(ZH/JA)하면 깨진다.
  // 그 경우 숫자 앵커(`### 1..4`)로 fallback — master PRD 는 항상 1=overview·2=epic·
  // 3=screen·4=nfr 순서로 출력한다(CpsTab.parseCpsSections 와 동일한 견고 패턴).
  // 임계값 < 4: 2개만 영어이고 2개가 번역되면 positions.length === 2 가 되어
  // fallback 이 억제되고 epic/screen 섹션이 빈칸이 된다 → 4개 모두 잡혔을 때만 사용.
  if (positions.length < 4) {
    const NUM_KEY = { 1: 'overview', 2: 'epic', 3: 'screen', 4: 'nfr' }
    const numRe = /^#+\s*([1-4])\.\s+/gm
    const seen = new Set()
    const numbered = []
    let nm
    while ((nm = numRe.exec(text)) !== null) {
      const key = NUM_KEY[nm[1]]
      if (key && !seen.has(key)) {
        seen.add(key)
        numbered.push({ key, index: nm.index })
      }
    }
    if (numbered.length > positions.length) {
      positions = numbered.sort((a, b) => a.index - b.index)
    }
  }

  if (positions.length === 0) {
    ranges.overview = { start: 0, end: text.length }
    return ranges
  }

  positions.forEach((pos, i) => {
    const start = pos.index
    const end = i < positions.length - 1 ? positions[i + 1].index : text.length
    ranges[pos.key] = { start, end }
  })

  // overview 는 첫 섹션 앞 prefix(타이틀·blueprint 인트로)를 흡수.
  // 첫 섹션이 overview 면 [0, 둘째 섹션 시작), overview 미검출이고 prefix 가 있으면 [0, 첫 섹션 시작).
  if (positions[0].key === 'overview') {
    ranges.overview = { start: 0, end: positions.length > 1 ? positions[1].index : text.length }
  } else if (positions[0].index > 0) {
    ranges.overview = { start: 0, end: positions[0].index }
  }

  return ranges
})

const splitSections = computed(() => {
  const text = rawContent.value
  const ranges = sectionRanges.value
  const result = { overview: '', epic: '', screen: '', nfr: '' }
  ;['overview', 'epic', 'screen', 'nfr'].forEach((k) => {
    if (ranges[k]) result[k] = text.substring(ranges[k].start, ranges[k].end)
  })
  return result
})

// [2026-06] 활성 섹션만 교체 → 나머지 섹션 보존하며 전체 문서 재구성 (CpsTab.replaceCpsSection 패턴).
// 섹션 경계를 모르면(미검출) null 반환 → 호출부가 전체 편집(full) 로 fallback.
const replaceActiveSection = (key, newText) => {
  const text = rawContent.value
  const r = sectionRanges.value[key]
  if (!r) return null
  // 끝 공백 정리 + 다음 섹션 헤더와 빈 줄 1개 확보(헤더 글루 방지). 마지막 섹션이면 줄바꿈 1개.
  const isLast = r.end >= text.length
  const normalized = newText.replace(/\s+$/, '') + (isLast ? '\n' : '\n\n')
  return text.slice(0, r.start) + normalized + text.slice(r.end)
}

const renderSection = (key) => {
  const sectionText = splitSections.value[key]
  if (!sectionText) return `<p class="text-muted">${t('prd.tab.section_empty')}</p>`
  return md.render(improveText(sectionText))
}

// [2026-05-19] 좌측 메뉴 선택 시 우측에 해당 항목만 노출 (페이징).
// 긴 스크롤 해소. 미선택 시 전체 노출 (기존 동작 보존).
//
// 분할 로직: 섹션 텍스트를 sub-item 헤더 (#### 📦 Epic / #### 🖥️ Screen) 기준
// 으로 split 한 뒤 selectedItem 이 가리키는 블록만 추려 다시 render.
//
// 정확 매칭이 어려운 케이스 (regex miss / selectedItem 이 anchor 형식 등) 는
// graceful fallback — 전체 렌더로 떨어짐. 깨지지 않게.
const renderFilteredSection = (key) => {
  const sectionText = splitSections.value[key]
  if (!sectionText) return `<p class="text-muted">${t('prd.tab.section_empty')}</p>`

  // 필터링 안 함 — 전체 렌더 (기본 또는 NFR/overview 같은 단일 블록 섹션).
  if (!selectedItem.value || (key !== 'epic' && key !== 'screen')) {
    return md.render(improveText(sectionText))
  }

  // sub-item 헤더 패턴
  // [i18n] 화면 헤더: 대괄호 폼 '[Screen: …]' + 무괄호 폼 'Screen: …'(비-ko 모델이 [] 떨군 케이스).
  // [normalize-우선] 무괄호 'Screen:' 라벨의 다국어 번역형(画面:/界面:/屏幕:/화면:/スクリーン:)도
  // 헤더로 인식 — parsedScreens 정규식과 동일 접두 셋(미일치 시 필터가 전체 렌더로 fallback).
  const headerRe = key === 'epic'
    ? /^####\s*📦\s*.+$/gm
    : /^####\s*🖥️?\s*(?:\[.+?\]|(?:Screen|화면|画面|界面|屏幕|スクリーン)\s*[:：].+)$/gim

  // 헤더 위치 수집
  const positions = []
  let m
  while ((m = headerRe.exec(sectionText)) !== null) {
    positions.push({ start: m.index, header: m[0] })
  }
  if (positions.length === 0) {
    // sub-item 안 잡힘 — fallback
    return md.render(improveText(sectionText))
  }

  // 섹션 H3 (### 2. ...) 헤더는 별도 보존 — 첫 sub-item 헤더 전까지.
  const sectionHeaderText = sectionText.substring(0, positions[0].start)

  // 각 sub-item 의 [start, end) 범위 구하기
  const items = positions.map((p, i) => {
    const end = i < positions.length - 1 ? positions[i + 1].start : sectionText.length
    return { header: p.header, block: sectionText.substring(p.start, end) }
  })

  // selectedItem 매칭: Epic 의 경우 "Epic 1" / "[E01]" / "Epic 1: 도메인" 등 다양.
  // Screen 의 경우 rawMatch ("Screen: 화면명") 또는 화면명 자체.
  // 헤더 텍스트 안에 substring 으로 포함되면 매치.
  const matched = items.find((item) => item.header.includes(selectedItem.value))
  if (!matched) {
    // 매칭 실패 — 안전하게 전체 렌더 (검색 처음 진입 시 외부 호출 대비)
    return md.render(improveText(sectionText))
  }

  // 섹션 헤더 + 매칭된 sub-item 만 렌더
  return md.render(improveText(sectionHeaderText + matched.block))
}

const clearSelection = () => {
  selectedItem.value = null
}

// [2026-05-19] NFR 카테고리도 필터링 — selectedItem 이 카테고리 title 일 때
// 그 카드만 노출. selectedItem 미설정이면 전체 (기존 동작 보존).
const filteredNfr = computed(() => {
  if (!selectedItem.value) return parsedNfr.value
  const match = parsedNfr.value.filter(cat => cat.title === selectedItem.value)
  return match.length > 0 ? match : parsedNfr.value  // 매칭 실패 시 graceful 전체
})


// ── Parse sidebar items ──
const parsedEpics = computed(() => {
  // prd_extract 프롬프트가 emit 하는 표준 형식: "#### 📦 Epic 1: 도메인명".
  // 옛 형식 "#### 📦 [E01] 제목" 도 호환 (브래킷 우선).
  const epics = []
  rawContent.value.split('\n').forEach(line => {
    // [i18n] 'Epic' 단어는 ja/zh 에서 번역될 수 있다(エピック/史诗). parsedScreens 가 🖥️
    // 이모지로 앵커하듯, Epic 도 📦 이모지 + 숫자로 앵커 — 'Epic' 단어 의존 제거.
    // id 는 헤더에 나타난 그대로 캡처(정규화 X) — 필터가 header.includes(id) 로 매칭하므로
    // 'エピック 1' 같은 번역형도 헤더와 일치해야 클릭 필터가 동작한다. (구분자 ':'·전각 '：' 허용)
    const m = line.match(/^####\s*📦\s*(?:\[([^\]]+)\]|([^:：\n]*?\d+))\s*[:：.]?\s*(.*)$/)
    if (m) {
      const id = (m[1] || m[2] || '').trim()
      const title = m[3].trim()
      if (id) epics.push({ id, title })
    }
  })
  return epics
})

const parsedScreens = computed(() => {
  const screens = []
  // #{2,4} — prdScreens.js 의 extractScreenNames 와 동일한 헤딩 레벨 허용 범위.
  // [i18n] 대괄호 폼 '🖥️ [Screen: 이름]' 또는 무괄호 폼 '🖥️ Screen: 이름' 둘 다 수용 —
  // 비-ko 생성에서 모델이 대괄호를 떨군 PRD(이미 생성된 옛 산출물 포함)도 "No items" 없이 표시.
  // [normalize-우선] 무괄호 폼의 'Screen:' 라벨도 ja/zh/ko 로 번역될 수 있어(画面:/界面:/屏幕:/
  // 화면:/スクリーン:) 다국어 접두를 alternation 에 모두 포함 — 안 그러면 번역된 무괄호 헤더가
  // 통째로 누락된다. (대괄호 폼은 m[1] 캡처 후 아래 strip 으로 동일하게 정규화.)
  // prdScreens.js SCREEN_RE 와 동일 정의 — 두 파일 쌍으로 함께 유지.
  const regex = /#{2,4}\s*🖥️?\s*(?:\[([^\]]+)\]|(?:Screen|화면|画面|界面|屏幕|スクリーン)\s*[:：]\s*([^\[\]\n]+))/gi
  let m
  while ((m = regex.exec(rawContent.value)) !== null) {
    const raw = m[1] != null ? m[1] : m[2]
    let name = raw.replace(/\n/g, ' ')
    // [i18n] 'Screen:' 라벨이 다국어로 번역된 변형('画面:'·'界面:' 등)까지 접두 제거.
    name = name.replace(/^(?:Screen|화면|画面|界面|屏幕|スクリーン)\s*[:：]\s*/i, '')
    screens.push({ name: name.trim(), rawMatch: raw })
  }
  return screens
})

// ── NFR Parser: group by label into separate cards ──
const parsedNfr = computed(() => {
  const text = splitSections.value.nfr
  if (!text) return []

  const lines = text.split(/\r?\n/)
  // Use a map to group items by their label (which becomes the card title)
  const categoryMap = new Map()

  const normalizeLabel = (s) =>
    s.replace(/[\s\[\]\(\)\-_:·•]/g, '').toLowerCase()

  const stripBracket = (s) =>
    s.replace(/^\[([^\]]+)\]\s*[:：]?\s*/g, '$1: ').trim()

  lines.forEach(line => {
    const trimmed = line.trimEnd()

    // Bullet or numbered list items (leading spaces OK)
    const bm = trimmed.match(/^\s*[-*•]\s+(.+)/) ||
               trimmed.match(/^\s*\d+[.)]\s+(.+)/)

    if (bm) {
      const raw = stripBracket(bm[1].trim())
      // [i18n] 라벨/내용 구분자는 ASCII ':' 뿐 아니라 전각 '：'(일·중 일반 표기) 도 허용 —
      // 안 그러면 ja/zh NFR 이 라벨 분리 실패해 전부 한 카드로 뭉치고 한국어 기본 라벨이 샌다.
      const cIdx = raw.indexOf(':')
      const fIdx = raw.indexOf('：')
      const colonIdx = cIdx < 0 ? fIdx : (fIdx < 0 ? cIdx : Math.min(cIdx, fIdx))
      // 기본 라벨은 locale 화 (하드코딩 '일반 (General)' 이 비-ko UI 로 누출되던 것 차단).
      let labelName = t('prd.tab.nfr_general')
      let content = raw

      if (colonIdx > 0 && colonIdx < 45) {
        labelName = raw.substring(0, colonIdx).trim().replace(/\*\*/g, '')
        content = raw.substring(colonIdx + 1).trim()
      }

      // Group by normalized label name
      const catKey = normalizeLabel(labelName)
      
      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, { title: labelName, items: [] })
      }
      
      const cat = categoryMap.get(catKey)
      
      // Prevent exact duplicate contents
      if (content && !cat.items.some(i => normalizeLabel(i.content) === normalizeLabel(content))) {
        cat.items.push({ content })
      }
    }
  })

  // Convert map to array
  return Array.from(categoryMap.values()).filter(c => c.items.length > 0)
})

// ── Navigation state ──
const activeSection = ref('overview')
const selectedItem = ref(null)
const mobileNavOpen = ref(false)

// [F1 — 2026-05 design lineage 연계, CpsTab 의 DOM walk 패턴 따름]
// 렌더된 DOM 을 walk 해서 Story 토큰을 가진 요소에 data-prd-anchor 부여.
// HTML regex 주입은 markdown-it 변형으로 매치 실패 가능 → DOM walk 가 안정적.
//
// design lineage 가 'Story-XX.Y' (zero-pad) 형태를 쓰므로 PRD 표기
// '[Story 1.1]' / 'Story 1.1' / '[Story-1.1]' 모두 같은 anchor 값 'Story-01.1' 로.
const _STORY_ANCHOR_RE = /Story[-\s]?(\d+)[.\-_](\d+)/i

const annotatePrdAnchors = () => {
  const container = document.querySelector('.prd-viewer-body')
  if (!container) return
  // h2-h6 포함: PRD 가 '##### ✨ Story 2.1: 제목' 형태의 heading 으로 스토리를 표기하면
  // strong/li 에 잡히지 않아 anchor 미생성 → design lineage 점프 실패하던 버그 수정.
  const candidates = container.querySelectorAll('strong, code, li, p, span, em, h2, h3, h4, h5, h6')
  for (const el of candidates) {
    if (el.hasAttribute('data-prd-anchor')) continue
    const text = (el.textContent || '').trim()
    const m = text.match(_STORY_ANCHOR_RE)
    if (!m) continue
    const isInline = ['STRONG', 'CODE', 'SPAN', 'EM'].includes(el.tagName)
    if (!isInline) {
      // li/p/heading 안에 inline 매치되는 자식이 있으면 그쪽이 처리.
      const innerMatch = el.querySelector('strong, code, span, em')
      if (innerMatch && (innerMatch.textContent || '').match(_STORY_ANCHOR_RE)) continue
    }
    const anchor = `Story-${String(m[1]).padStart(2, '0')}.${m[2]}`
    el.setAttribute('data-prd-anchor', anchor)
  }
}

watch([activeSection, () => splitSections.value], async () => {
  await nextTick()
  annotatePrdAnchors()
}, { immediate: true, flush: 'post' })

const sectionTabs = [
  { key: 'overview', label: 'Overview',  icon: Eye,     num: '1' },
  { key: 'epic',     label: 'Epic & Story', icon: Package, num: '2' },
  { key: 'screen',   label: 'Screens',  icon: Layout,  num: '3' },
  { key: 'nfr',      label: 'NFR',      icon: Shield,  num: '4' },
]

// 편집 중 활성 섹션 탭(라벨/번호) — 편집 스코프 배너 표시용.
const activeSectionTab = computed(() => sectionTabs.find(s => s.key === activeSection.value))

const switchSection = (key) => {
  // [2026-06] 편집 중에는 탭 이동 차단 — 활성 섹션만 편집 중이라 다른 섹션으로 옮기면
  // 편집 내용이 유실되거나 엉뚱한 섹션에 저장된다. 저장/취소 후 이동 가능.
  if (isEditing.value) return
  activeSection.value = key
  selectedItem.value = null
  mobileNavOpen.value = false
}

// [2026-06 fix] design lineage 의 'PRD에서 보기' 는 searchText 로 Story 앵커
// ('Story-02.1') 를 넘긴다. 그러나 epic 섹션의 필터(renderFilteredSection)는 Epic
// 헤더('#### 📦 Epic 2: …') 기준이라 Story 앵커로는 매칭이 안 돼 필터가 전체로
// fallback → 필터 바는 'Story-02.1만 보기 중' 인데 모든 Epic 이 노출되는 버그.
// 해당 Story 를 품은 Epic 의 id 를 찾아 그 Epic 으로 필터하고, 스크롤·하이라이트는
// Story 앵커로 한다. 못 찾으면 null → 호출부가 기존(전체) 동작 유지.
const findEpicIdForStory = (storyAnchor) => {
  const sectionText = splitSections.value.epic
  if (!sectionText) return null
  const headerRe = /^####\s*📦\s*.+$/gm
  const positions = []
  let hm
  while ((hm = headerRe.exec(sectionText)) !== null) {
    positions.push({ start: hm.index, header: hm[0] })
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start
    const end = i < positions.length - 1 ? positions[i + 1].start : sectionText.length
    const block = sectionText.substring(start, end)
    const storyRe = new RegExp(_STORY_ANCHOR_RE.source, 'gi')
    let sm
    while ((sm = storyRe.exec(block)) !== null) {
      const norm = `Story-${String(sm[1]).padStart(2, '0')}.${sm[2]}`
      if (norm === storyAnchor) {
        // parsedEpics 와 동일한 id 추출 규칙 — 필터가 header.includes(id) 로 매칭.
        // (i18n: 'Epic' 단어 의존 제거 — 📦 + 숫자 앵커, 번역형 'エピック 1'/'史诗 1' 수용.)
        const m = positions[i].header.match(/^####\s*📦\s*(?:\[([^\]]+)\]|([^:：\n]*?\d+))/)
        return m ? (m[1] || m[2] || '').trim() : null
      }
    }
  }
  return null
}

const scrollAndHighlight = (searchText, section) => {
  // [2026-06] 편집 중 좌측 항목 클릭으로 섹션이 바뀌면 편집 내용이 유실 — 차단.
  if (isEditing.value) return
  activeSection.value = section
  mobileNavOpen.value = false

  // searchText 는 재시도 루프 내에서 변하지 않으므로 루프 밖에서 한 번만 파싱.
  // _STORY_ANCHOR_RE 재사용 — 상수와 inline 정규식이 따로 발전하는 divergence 방지.
  const _storyM = String(searchText).match(_STORY_ANCHOR_RE)

  // Story 앵커로 epic 진입 시: 필터는 부모 Epic 으로(그래야 섹션이 실제로 좁혀짐),
  // 스크롤·하이라이트는 아래 tryScroll 이 searchText(Story 앵커)로 수행.
  // 부모 Epic 을 못 찾으면 searchText 그대로 → renderFilteredSection 이 전체 fallback.
  if (_storyM && section === 'epic') {
    selectedItem.value = findEpicIdForStory(searchText) || searchText
  } else {
    selectedItem.value = searchText
  }

  // [2026-06 fix] 섹션 전환 직후엔 watch 의 annotatePrdAnchors 가 아직 안 돌았거나
  // 해당 섹션 DOM 이 막 렌더되는 중이라 anchor 매칭이 실패할 수 있다. 진입 시점마다
  // 직접 annotate 하고, 못 찾으면 짧게 재시도(최대 ~1.2s)해 콘텐츠 렌더를 기다린다.
  let attempts = 0
  const tryScroll = () => {
    const container = document.querySelector('.prd-viewer-body')
    if (!container) {
      if (attempts++ < 12) setTimeout(tryScroll, 100)
      return
    }
    annotatePrdAnchors()
    container.querySelectorAll('.prd-hl').forEach(el => el.classList.remove('prd-hl'))

    // [F1 — 2026-05] anchor 정확 매칭 우선. design lineage 가 'Story-01.1' 같은
    // 정규화 ID 로 호출하면 inject 된 data-prd-anchor 와 정확히 매치.
    const anchorCandidates = container.querySelectorAll('[data-prd-anchor]')
    for (const el of anchorCandidates) {
      if (el.getAttribute('data-prd-anchor') === searchText) {
        const target = el.closest('li, p, h1, h2, h3, h4, h5, h6') || el
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.classList.add('prd-hl')
        return
      }
    }

    // Fallback: 옛 호출 (epic.id, screen.rawMatch 등) 호환 위해 substring 매칭.
    // Story ID 계열은 정규화 비교 — txt.includes('Story 2.1') 는 'Story 2.10'·'Story 2.11'
    // 에 false-positive 로 매칭되므로, 텍스트 내 Story 토큰을 추출·정규화해 searchText
    // 와 동등 비교한다.
    const elements = container.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,strong,code')
    for (let el of elements) {
      const txt = el.textContent || ''
      let matched = txt.includes(searchText)
      if (!matched && _storyM) {
        const m = txt.match(_STORY_ANCHOR_RE)
        matched = !!(m && `Story-${String(m[1]).padStart(2, '0')}.${m[2]}` === searchText)
      }
      if (matched) {
        const target = el.closest('li, p, h1, h2, h3, h4, h5, h6') || el
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.classList.add('prd-hl')
        return
      }
    }

    // 아직 콘텐츠가 안 그려졌을 수 있음 (다른 페이지에서 막 진입) → 재시도.
    if (attempts++ < 12) setTimeout(tryScroll, 100)
  }
  nextTick(tryScroll)
}

// [F2 — 2026-05] 외부 (design 페이지) 에서 호출 가능하도록 expose.
// design 의 Lineage Panel → "PRD 에서 Story-01.1 보기" 버튼이 router 로 이동 후
// 이 컴포넌트가 마운트되면 query/hash 를 보고 scrollAndHighlight 호출.
defineExpose({ scrollAndHighlight })

const scrollToNfrCard = (index, title) => {
  // [2026-06] 편집 중에는 섹션 이동 차단 (switchSection 과 동일 정책).
  if (isEditing.value) return
  activeSection.value = 'nfr'
  selectedItem.value = title
  mobileNavOpen.value = false
  nextTick(() => {
    const el = document.getElementById('nfr-card-' + index)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Add a subtle flash effect
      el.classList.remove('nfr-flash')
      void el.offsetWidth // trigger reflow
      el.classList.add('nfr-flash')
    }
  })
}

</script>

<template>
  <div class="prd-root">
    <!-- Mobile Section Toggle -->
    <button class="mobile-nav-toggle" @click="mobileNavOpen = !mobileNavOpen">
      <FileText :size="14" class="mr-2" />
      {{ sectionTabs.find(t => t.key === activeSection)?.label || 'PRD' }}
      <VIcon :icon="mobileNavOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" class="ml-1" />
    </button>

    <!-- Left Navigation Panel -->
    <aside class="nav-panel" :class="{ 'nav-panel--open': mobileNavOpen }">
      <div class="nav-header">
        <FileText :size="14" class="text-accent mr-2" />
        <span class="nav-doc-id">{{ prdData?.master_prd_id || 'PRD' }}</span>
      </div>

      <!-- Sub-items for active section -->
      <div class="nav-items custom-scroll">
        <template v-if="activeSection === 'epic' && parsedEpics.length > 0">
          <div
            v-for="(epic, idx) in parsedEpics" :key="'e'+idx"
            class="nav-item" :class="{ 'nav-item--active': selectedItem === epic.id }"
            @click="scrollAndHighlight(epic.id, 'epic')"
          >
            <span class="nav-item-id">{{ epic.id }}</span>
            <span class="nav-item-text">{{ epic.title }}</span>
          </div>
        </template>
        <template v-else-if="activeSection === 'screen' && parsedScreens.length > 0">
          <div
            v-for="(screen, idx) in parsedScreens" :key="'s'+idx"
            class="nav-item" :class="{ 'nav-item--active': selectedItem === screen.rawMatch }"
            @click="scrollAndHighlight(screen.rawMatch, 'screen')"
          >
            <VIcon icon="mdi-monitor" size="13" class="nav-item-icon" />
            <span class="nav-item-text">{{ screen.name }}</span>
          </div>
        </template>
        <template v-else-if="activeSection === 'nfr' && parsedNfr.length > 0">
          <div
            v-for="(cat, idx) in parsedNfr" :key="'nfr'+idx"
            class="nav-item" :class="{ 'nav-item--active': selectedItem === cat.title }"
            @click="scrollToNfrCard(idx, cat.title)"
          >
            <Shield size="13" class="nav-item-icon text-accent" />
            <span class="nav-item-text">{{ cat.title }}</span>
          </div>
        </template>
        <div v-else-if="activeSection === 'overview'" class="nav-hint">
          {{ $t('prd.tab.nav_overview_hint') }}
        </div>
        <div v-else-if="activeSection === 'nfr'" class="nav-hint">
          {{ $t('prd.tab.nav_nfr_hint') }}
        </div>
        <div v-else class="nav-hint">{{ $t('prd.tab.nav_empty') }}</div>
      </div>

      <!-- [2026-05 Phase 3.3] 검수 모드 노드 인라인 수정 (분리: PrdNodeEditor.vue) -->
      <PrdNodeEditor
        v-if="editable"
        :project-name="projectName"
        :editable="editable"
        @saved="$emit('saved')"
        @update:editing="nodeEditing = $event"
      />
    </aside>

    <!-- Main Viewer -->
    <main class="viewer-panel" v-if="prdData">
      <!-- Section Header Bar -->
      <div class="viewer-topbar">
        <div class="viewer-topbar-tabs">
          <button
            v-for="tab in sectionTabs" :key="'vt'+tab.key"
            class="vtab"
            :class="{ 'vtab--active': activeSection === tab.key }"
            :disabled="isEditing"
            :title="isEditing ? $t('prd.tab.tab_locked') : ''"
            @click="switchSection(tab.key)"
          >
            {{ tab.num }}. {{ tab.label }}
          </button>
        </div>
        <div class="viewer-badge-area">
          <!-- [B 단계 — 2026-05-25] PRD 충실도 배지 (lint 점수)
               [2026-05-26 layout] 탭 영역 침범 회피 위해 별도 줄로 이동 — 아래 viewer-lint-row 참조. -->
          <button
            v-if="!isEditing && rawContent"
            class="prd-pdf-btn"
            @click="copyMd"
            :title="$t('prd.tab.copy_title')"
            type="button"
          >
            <component :is="mdCopied ? Check : Copy" :size="13" class="mr-1" />{{ mdCopied ? $t('common.action.copied') : $t('common.action.copy') }}
          </button>
          <button
            v-if="!isEditing && rawContent"
            class="prd-pdf-btn"
            @click="downloadMd"
            :title="$t('prd.tab.download_md_title')"
            type="button"
          >
            <FileDown :size="13" class="mr-1" />MD
          </button>
          <button
            v-if="!isEditing && rawContent"
            class="prd-pdf-btn"
            @click="downloadPdf"
            :title="$t('prd.tab.download_pdf_title')"
            type="button"
          >
            <Download :size="13" class="mr-1" />PDF
          </button>
          <!-- [2026-05 검수 게이트] 편집 토글 — editable=true 일 때만 -->
          <button
            v-if="editable && !isEditing"
            class="prd-edit-btn"
            :disabled="remoteBusy"
            @click="startEdit"
            :title="remoteBusy ? $t('prd.tab.toast.remote_busy') : $t('prd.tab.edit_title')"
            type="button"
          >
            <Edit3 :size="13" class="mr-1" />{{ $t('common.action.edit') }}
          </button>
          <template v-else-if="isEditing">
            <button
              class="prd-edit-btn prd-edit-btn--save"
              :disabled="isSaving"
              @click="saveEdit"
              type="button"
            >
              <Loader2 v-if="isSaving" :size="13" class="mr-1 spinning" />
              <Save v-else :size="13" class="mr-1" />
              {{ isSaving ? $t('prd.tab.saving') : $t('common.action.save') }}
            </button>
            <button
              class="prd-edit-btn prd-edit-btn--cancel"
              :disabled="isSaving"
              @click="cancelEdit"
              type="button"
            >
              <IconX :size="13" class="mr-1" />{{ $t('common.action.cancel') }}
            </button>
          </template>
          <template v-else>
            <VIcon icon="mdi-shield-check" size="14" color="success" class="mr-1" />
            <span class="viewer-badge">VERIFIED</span>
          </template>
        </div>
      </div>

      <!-- [2026-05-26] PRD 충실도 — 탭 침범 회피 위해 별도 줄. 좌측 정렬, 풀폭 사용 가능.
           [2026-05-28] '보러가기' 클릭 시 해당 탭으로 자동 점프 — 사용자가 어디를 손볼지 한 번에 안내. -->
      <div v-if="prdLintReport || prdLintLoading" class="viewer-lint-row">
        <PrdLintBadge
          :report="prdLintReport"
          :loading="prdLintLoading"
          :fixing="isAutofixing"
          :needs-input-count="autofixNeedsInput.length"
          @jump-to-section="switchSection"
          @ai-fix="runAutofix"
          @go-interview="goToInterview"
        />
      </div>

      <!-- [2026-06-08] '원본 회의록과 대조 검증' 버튼 제거 — 비전문가에겐 내부 QA 클러터.
           충실도 배지 + 'AI로 보완하기'가 같은 보완 경로를 이미 제공(PrdFidelityBadge 의
           @ai-fix 도 runAutofix 였음). 정밀 대조 능력(usePrdFidelity/BE)은 추후 생성
           파이프라인에 녹일 수 있게 보존. -->

<!-- [2026-05] AI가 근거 부족으로 못 채운 항목 — 회의록 탭 AI 인터뷰로 안내 (하이브리드) -->
      <div v-if="autofixNeedsInput.length" class="autofix-needs">
        <div class="autofix-needs__head">
          <span class="autofix-needs__title">{{ $t('prd.tab.autofix.title', { count: autofixNeedsInput.length }) }}</span>
          <button type="button" class="autofix-needs__close" :aria-label="$t('prd.tab.autofix.close_aria')" @click="dismissNeedsInput">✕</button>
        </div>
        <p class="autofix-needs__desc" v-html="$t('prd.tab.autofix.desc_html')"></p>
        <ul class="autofix-needs__list">
          <li v-for="(n, i) in autofixNeedsInput" :key="i">
            <strong>{{ n.topic }}</strong> — {{ n.question }}
          </li>
        </ul>
        <button type="button" class="autofix-needs__cta" @click="goToInterview">
          {{ $t('prd.tab.autofix.cta') }}
        </button>
      </div>

      <!-- [Phase 3.5a] markdown_stale banner (공통 StaleBanner — 2026-06 인라인 마이그레이션) -->
      <StaleBanner
        v-if="prdData?.markdown_stale && !isEditing"
        :title="$t('prd.tab.stale_title')"
        :subtitle="$t('prd.tab.stale_sub')"
      >
        <template #actions>
          <button
            class="stale-banner__btn stale-banner__btn--primary"
            type="button"
            :disabled="isResynthesizing"
            @click="resynthesizeMarkdown"
            :title="$t('prd.tab.resynth_title')"
          >
            <Loader2 v-if="isResynthesizing" :size="11" class="spinning mr-1" />
            <Zap v-else :size="11" class="mr-1" />
            {{ isResynthesizing ? $t('prd.tab.resynth_running') : $t('prd.tab.resynth_btn') }}
          </button>
          <button
            v-if="editable"
            class="stale-banner__btn"
            type="button"
            :disabled="isResynthesizing"
            @click="startEdit"
          >
            <Edit3 :size="11" class="mr-1" />{{ $t('prd.tab.manual_edit_btn') }}
          </button>
          <button
            class="stale-banner__btn"
            type="button"
            :disabled="isDismissingStale || isResynthesizing"
            @click="dismissStale"
          >
            <Loader2 v-if="isDismissingStale" :size="11" class="spinning mr-1" />
            {{ $t('prd.tab.dismiss_btn') }}
          </button>
        </template>
      </StaleBanner>

      <!-- Content -->
      <div class="prd-viewer-body custom-scroll">
        <!-- [2026-05-19] 필터 활성 표시 + 해제 버튼 — 좌측에서 선택한 항목만
             표시 중일 때만 노출. 사용자가 전체로 돌아가는 명확한 경로 제공. -->
        <div
          v-if="!isEditing && selectedItem && (activeSection === 'epic' || activeSection === 'screen' || activeSection === 'nfr')"
          class="prd-filter-bar"
        >
          <span class="prd-filter-bar__label">
            <Eye :size="12" class="mr-1" />
            {{ $t('prd.tab.filter_view_only', { label: selectedItem }) }}
          </span>
          <button type="button" class="prd-filter-bar__clear" @click="clearSelection">
            {{ $t('prd.tab.filter_view_all') }}
          </button>
        </div>
        <!-- [2026-06] 편집 모드 — CPS 와 동일하게 '활성 섹션만' 편집. 저장 시 나머지 섹션 보존. -->
        <template v-if="isEditing">
          <div class="prd-edit-scope" :class="{ 'prd-edit-scope--full': editScope === 'full' }">
            <Edit3 :size="12" class="mr-1" />
            <template v-if="editScope === 'section' && activeSectionTab">
              <span>{{ $t('prd.tab.edit_scope.editing') }} <strong>{{ $t('prd.tab.edit_scope.section_label', { num: activeSectionTab.num, title: activeSectionTab.label }) }}</strong></span>
              <span class="prd-edit-scope__hint">{{ $t('prd.tab.edit_scope.section_hint') }}</span>
            </template>
            <template v-else>
              <span>{{ $t('prd.tab.edit_scope.editing') }} <strong>{{ $t('prd.tab.edit_scope.full_label') }}</strong></span>
              <span class="prd-edit-scope__hint">{{ $t('prd.tab.edit_scope.full_hint') }}</span>
            </template>
          </div>
          <textarea
            v-model="editContent"
            class="prd-edit-textarea"
            :placeholder="editScope === 'section' ? $t('prd.tab.edit_scope.placeholder_section') : $t('prd.tab.editor_placeholder')"
            spellcheck="false"
          />
        </template>
        <!-- 편집 모드 아닐 때만 기존 section 렌더링 -->
        <template v-else>
        <!-- NFR: card layout if parsed, otherwise raw markdown fallback -->
        <template v-if="activeSection === 'nfr'">
          <div v-if="parsedNfr.length > 0" class="nfr-root">
            <div class="nfr-page-header">
              <div class="nfr-page-title">
                <Shield :size="20" color="var(--accent)" />
                <span>Global Non-Functional Requirements</span>
              </div>
              <div class="nfr-page-meta">
                <span class="nfr-badge-count">{{ $t('prd.tab.nfr_category_count', { count: parsedNfr.length }) }}</span>
                <span class="nfr-badge-count">{{ $t('prd.tab.nfr_item_count', { count: parsedNfr.reduce((a, c) => a + c.items.length, 0) }) }}</span>
              </div>
            </div>
            <!-- filteredNfr: selectedItem 있으면 그 카테고리만, 없으면 전체. -->
            <div class="nfr-grid full-width">
              <div class="nfr-card" v-for="(cat, ci) in filteredNfr" :key="ci" :id="'nfr-card-' + ci">
                <div class="nfr-card-header">
                  <span class="nfr-card-idx">{{ String(ci + 1).padStart(2, '0') }}</span>
                  <span class="nfr-card-title-text">{{ cat.title }}</span>
                  <span class="nfr-item-count">{{ $t('prd.tab.nfr_card_merged', { count: cat.items.length }) }}</span>
                </div>
                <div class="nfr-items">
                  <div class="nfr-item" v-for="(item, ii) in cat.items" :key="ii">
                    <div class="nfr-item-contents">
                      <div class="nfr-item-content">
                        <span class="nfr-merge-dot">·</span>
                        {{ item.content }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Fallback: raw markdown when parsing fails -->
          <div v-else class="markdown-content" v-html="renderSection('nfr')"></div>
        </template>
        <!-- Other sections: markdown — epic/screen 은 selectedItem 으로 필터링 -->
        <div v-else class="markdown-content" v-html="renderFilteredSection(activeSection)"></div>
        </template>
      </div>
    </main>

    <!-- Empty State -->
    <main v-else class="viewer-panel d-flex flex-column align-center justify-center">
      <VIcon icon="mdi-text-box-search-outline" size="64" color="muted" class="mb-4" />
      <div class="text-h6 font-weight-bold">{{ $t('prd.tab.empty_title') }}</div>
      <p class="text-caption text-muted">{{ $t('prd.tab.empty_hint') }}</p>
    </main>

    <!-- [Phase 3.5c] 재합성 결과 diff 미리보기 -->
    <ResynthDiffModal
      :open="showDiffModal"
      kind="prd"
      :title-override="isAutofixPreview ? $t('prd.tab.resynth_title_override') : ''"
      :old-markdown="resyncOldMd"
      :new-markdown="resyncNewMd"
      :applying="isApplyingResynth"
      @apply="applyResynth"
      @cancel="cancelResynth"
    />
  </div>
</template>

<style scoped>
/* [2026-05 검수 게이트] 편집 토글 + textarea (CpsTab 과 동일 패턴) */
.prd-pdf-btn {
  display: inline-flex; align-items: center;
  padding: 5px 11px;
  margin-right: 6px;
  border-radius: 9999px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  background: var(--bg-light, #fafafa);
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--text-muted); cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.prd-pdf-btn:hover {
  border-color: var(--accent, #8C6239);
  color: var(--accent, #8C6239);
}
.prd-edit-btn {
  display: inline-flex; align-items: center;
  padding: 5px 12px;
  margin-right: 6px;
  border-radius: 9999px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  background: var(--bg-light, #fafafa);
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--text-main); cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.prd-edit-btn:hover:not(:disabled) {
  border-color: var(--accent, #8C6239);
  color: var(--accent, #8C6239);
}
.prd-edit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.prd-edit-btn--save {
  background: var(--accent, #8C6239); color: #fff; border-color: var(--accent, #8C6239);
}
.prd-edit-btn--save:hover:not(:disabled) {
  background: #6f4d2d; color: #fff; border-color: #6f4d2d;
}
.prd-edit-btn--cancel {
  color: #c0362c; border-color: #f5c8c4; background: #fff5f4;
}
.prd-edit-btn--cancel:hover:not(:disabled) {
  border-color: #c0362c; color: #c0362c; background: #ffe6e3;
}

.prd-edit-textarea {
  width: 100%; height: 100%;
  min-height: 500px;
  padding: 16px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px;
  background: #fcfbf8;
  font-family: 'Fira Code', 'Menlo', 'Consolas', monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text-main);
  resize: vertical;
  outline: none;
}
.prd-edit-textarea:focus {
  border-color: var(--accent, #8C6239);
  box-shadow: 0 0 0 3px rgba(140, 98, 57, 0.1);
}

/* [2026-06] 편집 스코프 배너 — 어떤 섹션을 편집 중인지 + 저장 시 보존 안내 (CPS edit-scope-banner 패턴). */
.prd-edit-scope {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 6px 12px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.06);
  border: 1px solid rgba(140, 98, 57, 0.2);
  color: var(--text-main, #111);
  font-size: 0.78rem; font-weight: 600;
}
.prd-edit-scope strong { font-weight: 800; color: var(--accent, #8C6239); }
.prd-edit-scope__hint { font-size: 0.68rem; color: var(--text-muted, #888); font-weight: 500; }
.prd-edit-scope--full {
  background: #fff3cd; border-color: #ffd54f; color: #6b4f00;
}
.prd-edit-scope--full strong { color: #6b4f00; }

/* Stale Banner 스타일은 공통 컴포넌트 StaleBanner.vue 로 이전 (버튼 클래스는
   StaleBanner 가 :deep 로 제공 — slot 버튼에 .stale-banner__btn 그대로 사용). */

/* ==============================
   Root Layout (responsive)
   ============================== */
.prd-root {
  display: flex; width: 100%; height: 100%; gap: 16px;
  padding: 12px 0; animation: fadeIn 0.4s ease-out;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.mobile-nav-toggle { display: none; }

/* ==============================
   Nav Panel
   ============================== */
.nav-section-name {
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 700;
  color: var(--text-main); margin-left: auto;
}
.nav-panel {
  width: 260px; flex-shrink: 0; background: var(--bg-card);
  border: 1px solid var(--border-light); border-radius: 14px;
  display: flex; flex-direction: column; overflow: hidden;
}
.nav-header {
  display: flex; align-items: center; padding: 14px 16px;
  border-bottom: 1px solid var(--border-light); flex-shrink: 0;
}
.nav-doc-id {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.65rem; font-weight: 600;
  color: var(--accent); background: rgba(140,98,57,0.08); padding: 2px 8px; border-radius: 4px;
}

/* Sub-items */
.nav-items {
  flex: 1; overflow-y: auto; padding: 8px; min-height: 0;
}
.nav-item {
  display: flex; align-items: flex-start; padding: 8px 10px; border-radius: 8px;
  cursor: pointer; transition: all 0.15s; gap: 8px; margin-bottom: 2px;
}
.nav-item:hover { background: var(--bg-light); }
.nav-item--active { background: var(--accent) !important; }
.nav-item--active .nav-item-id,
.nav-item--active .nav-item-text,
.nav-item--active .nav-item-icon { color: white !important; }
.nav-item-id {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.58rem; font-weight: 700;
  color: var(--accent); background: rgba(140,98,57,0.08); padding: 2px 6px;
  border-radius: 4px; white-space: nowrap; flex-shrink: 0; line-height: 1.5;
}
.nav-item--active .nav-item-id { background: rgba(255,255,255,0.2); }
.nav-item-icon { color: var(--accent); flex-shrink: 0; margin-top: 2px; }
.nav-item-text {
  font-family: 'Pretendard Variable', sans-serif; font-size: 0.75rem;
  font-weight: 600; color: var(--text-main); line-height: 1.4;
}
.nav-hint {
  text-align: center; padding: 20px 8px; font-size: 0.72rem;
  color: var(--text-muted); font-family: 'Pretendard Variable', sans-serif; line-height: 1.6;
}

/* ==============================
   Viewer Panel
   ============================== */
.viewer-panel {
  flex: 1; min-width: 0; background: white;
  border: 1px solid var(--border-light); border-radius: 14px;
  display: flex; flex-direction: column; overflow: hidden;
}
.viewer-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; border-bottom: 1px solid var(--border-light); flex-shrink: 0;
  overflow-x: auto;
}
.viewer-topbar-tabs { display: flex; gap: 0; }
.vtab {
  padding: 12px 16px; border: none; background: transparent; cursor: pointer;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 600;
  color: var(--text-muted); border-bottom: 2px solid transparent;
  white-space: nowrap; transition: all 0.15s;
}
.vtab:hover:not(:disabled) { color: var(--text-main); }
.vtab--active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 800; }
/* [2026-06] 편집 중 탭 잠금 — 비활성 탭은 흐리게, 활성 탭(편집 대상)은 그대로 강조 유지. */
.vtab:disabled { cursor: not-allowed; opacity: 0.4; }
.vtab--active:disabled { opacity: 1; }
.viewer-badge-area { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

/* [2026-05-26] PRD 충실도 별도 줄 — 탭 영역 침범 회피 */
.viewer-lint-row {
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-light);
  background: rgba(140, 98, 57, 0.03);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
/* [2026-05] AI 자동 보완 — needs_input(인터뷰 안내) 패널 */
.autofix-needs {
  margin: 10px 20px;
  padding: 12px 14px;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  border-radius: 10px;
  flex-shrink: 0;
}
.autofix-needs__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.autofix-needs__title { font-size: 0.82rem; font-weight: 800; color: #92400E; }
.autofix-needs__close {
  border: none; background: transparent; color: #B45309; cursor: pointer;
  font-size: 0.8rem; line-height: 1; padding: 4px;
}
.autofix-needs__desc { font-size: 0.76rem; color: #6F665F; line-height: 1.6; margin: 0 0 8px; }
.autofix-needs__desc strong { color: #92400E; }
.autofix-needs__list { margin: 0 0 10px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.autofix-needs__list li { font-size: 0.78rem; color: #4B5563; line-height: 1.5; }
.autofix-needs__list strong { color: #1F2937; font-weight: 700; }
.autofix-needs__cta {
  display: inline-flex; align-items: center;
  padding: 7px 14px; border-radius: 8px;
  background: var(--accent, #8C6239); color: #fff; border: none;
  font-family: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s;
}
.autofix-needs__cta:hover { background: #6E4E2E; }
.viewer-badge {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.58rem; font-weight: 700; color: #2E7D32;
}

/* Content */
.prd-viewer-body { flex: 1; overflow-y: auto; padding: 32px 36px; text-align: left; }

/* [2026-05-19] 좌측 메뉴에서 항목 선택했을 때 상단 sticky 필터 표시. */
.prd-filter-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 0 16px;
  padding: 8px 14px;
  background: rgba(140, 98, 57, 0.08);
  border: 1px solid rgba(140, 98, 57, 0.22);
  border-radius: 10px;
  font-size: 0.78rem;
}
.prd-filter-bar__label {
  display: inline-flex; align-items: center;
  color: var(--accent, #8C6239);
  font-weight: 700;
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.prd-filter-bar__clear {
  background: white;
  border: 1px solid rgba(140, 98, 57, 0.3);
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent, #8C6239);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 10px;
  transition: all 0.15s;
}
.prd-filter-bar__clear:hover {
  background: var(--accent, #8C6239);
  color: white;
  border-color: var(--accent, #8C6239);
}

/* ==============================
   Markdown Styles
   ============================== */
.markdown-content :deep(h1), .markdown-content :deep(h2),
.markdown-content :deep(h3), .markdown-content :deep(h4) {
  margin-top: 28px; margin-bottom: 16px; font-family: 'Outfit', sans-serif !important;
  font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;
  word-break: keep-all;
}
.markdown-content :deep(h1) { font-size: 1.65rem; line-height: 1.3; }
.markdown-content :deep(h2) { font-size: 1.4rem; border-bottom: 2px solid var(--border-light); padding-bottom: 8px; }
.markdown-content :deep(h3) { font-size: 1.15rem; color: var(--accent); }
.markdown-content :deep(h4) { font-size: 1rem; }
.markdown-content :deep(p) {
  margin-bottom: 18px; line-height: 2; color: #444;
  text-align: left !important; word-break: keep-all;
}
.markdown-content :deep(ul), .markdown-content :deep(ol) {
  padding-left: 24px; margin-bottom: 24px; color: #444;
}
.markdown-content :deep(li) { margin-bottom: 10px; line-height: 1.7; }
.markdown-content :deep(strong) { color: var(--text-main); font-weight: 800; }
.markdown-content :deep(code) {
  font-family: 'IBM Plex Mono', monospace; background-color: #fcf8f2;
  padding: 2px 6px; border-radius: 4px; font-size: 0.85em;
  color: var(--accent); border: 1px solid var(--border-light);
}
.markdown-content :deep(hr) {
  border: none; border-top: 1px solid var(--border-light); margin: 28px 0;
}

/* Scrollbar */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

/* Highlight */
:global(.prd-hl) {
  background-color: rgba(255, 235, 59, 0.25) !important;
  border-radius: 8px; box-shadow: 0 0 0 8px rgba(255, 235, 59, 0.25);
  transition: all 0.3s ease;
}

/* ==============================
   Responsive: Tablet (≤1024px)
   ============================== */
@media (max-width: 1024px) {
  .nav-panel { width: 220px; }
  .prd-viewer-body { padding: 24px 20px; }
  .vtab { padding: 10px 12px; font-size: 0.68rem; }
}

/* ==============================
   Responsive: Mobile (≤768px)
   ============================== */
@media (max-width: 768px) {
  .prd-root { flex-direction: column; gap: 0; }

  .mobile-nav-toggle {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 10px 16px; border: 1px solid var(--border-light);
    border-radius: 10px; background: var(--bg-card); cursor: pointer;
    font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 700;
    color: var(--text-main); margin-bottom: 8px;
  }

  .nav-panel {
    width: 100%; display: none; border-radius: 10px; margin-bottom: 8px;
    max-height: 50vh;
  }
  .nav-panel--open { display: flex; }

  .nav-section-tabs { flex-direction: row; flex-wrap: wrap; }
  .nav-stab { flex: 1; min-width: 0; justify-content: center; padding: 8px 6px; font-size: 0.65rem; }
  .nav-stab-label { display: none; }
  .nav-stab-icon { display: none; }
  .nav-stab-num { width: auto; height: auto; border-radius: 4px; padding: 2px 8px; font-size: 0.65rem; }

  /* section 탭은 항상 노출 — 모바일에서 섹션 전환 수단 */
  .viewer-topbar {
    flex-wrap: wrap;
    padding: 0 10px;
  }
  .viewer-topbar-tabs {
    flex: 1 1 100%;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .viewer-topbar-tabs::-webkit-scrollbar { display: none; }
  .vtab { padding: 8px 10px; font-size: 0.67rem; white-space: nowrap; }
  .viewer-badge-area {
    width: 100%;
    padding: 4px 0 7px;
    border-top: 1px solid var(--border-light);
    justify-content: flex-end;
  }
  .prd-viewer-body { padding: 16px; }


  /* [2026-05-21] 모바일 markdown 헤딩 축소 — h1 큰 제목 ('Master PRD 조감도'
     같은 emoji + 다단어 제목) 이 2줄로 wrap 되며 너무 두꺼웠음. */
  .markdown-content :deep(h1) { font-size: 1.35rem; margin-top: 18px; margin-bottom: 12px; }
  .markdown-content :deep(h2) { font-size: 1.15rem; margin-top: 22px; padding-bottom: 6px; }
  .markdown-content :deep(h3) { font-size: 1rem; margin-top: 18px; margin-bottom: 10px; }
  .markdown-content :deep(h4) { font-size: 0.9rem; margin-top: 16px; }
  .markdown-content :deep(p) { line-height: 1.7; margin-bottom: 14px; }
  .markdown-content :deep(li) { margin-bottom: 6px; }
}

/* ==============================
   NFR Cards
   ============================== */
.nfr-root {
  padding: 24px 28px;
  display: flex; flex-direction: column; gap: 24px;
}
.nfr-page-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 16px; border-bottom: 2px solid var(--border-light);
}
.nfr-page-title {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Outfit', sans-serif; font-size: 1.1rem; font-weight: 800;
  color: var(--text-main);
}
.nfr-page-meta {
  display: flex; gap: 8px;
}
.nfr-badge-count {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.65rem; font-weight: 700;
  background: rgba(140,98,57,0.1); color: var(--accent);
  padding: 4px 12px; border-radius: 99px; letter-spacing: 0.02em;
}
.nfr-empty { color: var(--text-muted); font-size: 0.85rem; padding: 20px; }

.nfr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}
.nfr-grid.full-width {
  display: flex;
  flex-direction: column;
}
.nfr-card {
  background: white; border: 1px solid var(--border-light); border-radius: 12px;
  overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  transition: all 0.2s ease; display: flex; flex-direction: column;
}
.nfr-card:hover {
  box-shadow: 0 8px 24px rgba(140,98,57,0.08); transform: translateY(-3px);
  border-color: rgba(140,98,57,0.3);
}
.nfr-card-header {
  display: flex; align-items: center; gap: 10px; padding: 14px 18px;
  background: linear-gradient(135deg, rgba(140,98,57,0.08) 0%, rgba(140,98,57,0.02) 100%);
  border-bottom: 1px solid var(--border-light);
}
.nfr-card-idx {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.65rem; font-weight: 700;
  color: white; background: var(--accent);
  padding: 3px 8px; border-radius: 6px; flex-shrink: 0;
}
.nfr-card-title-text {
  font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 700;
  color: var(--text-main); flex: 1;
}
.nfr-item-count {
  font-size: 0.7rem; font-weight: 600; color: var(--text-muted);
  background: rgba(0,0,0,0.05); padding: 2px 8px; border-radius: 10px;
}
.nfr-items {
  display: flex; flex-direction: column; flex: 1;
}
.nfr-item {
  display: flex; flex-direction: column; gap: 6px; padding: 14px 18px;
  border-bottom: 1px dashed var(--border-light);
  transition: background 0.15s;
}
.nfr-item:last-child { border-bottom: none; }
.nfr-item:hover { background: rgba(140,98,57,0.02); }
.nfr-item-label-row {
  display: inline-flex;
}
.nfr-item-label {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.68rem; font-weight: 700;
  color: var(--accent); text-transform: uppercase; letter-spacing: 0.03em;
  background: rgba(140,98,57,0.08); padding: 2px 8px; border-radius: 4px;
}
.nfr-item-contents {
  display: flex; flex-direction: column; gap: 4px; padding-left: 4px;
}
.nfr-item-content {
  font-size: 0.82rem; color: var(--text-main); line-height: 1.6;
  font-family: 'Pretendard Variable', sans-serif; display: flex; gap: 6px;
}
.nfr-item-content--merged {
  color: #475569;
}
.nfr-merge-dot {
  color: var(--accent); font-weight: bold; opacity: 0.6;
}
.nfr-item-no-label {
  color: var(--text-muted); font-style: italic;
}

@keyframes nfrFlash {
  0% { box-shadow: 0 0 0 0 rgba(140, 98, 57, 0.4); border-color: var(--accent); }
  50% { box-shadow: 0 0 0 8px rgba(140, 98, 57, 0); border-color: var(--border-light); }
  100% { box-shadow: 0 0 0 0 rgba(140, 98, 57, 0); }
}
.nfr-flash {
  animation: nfrFlash 1.5s ease-out;
}

/* [2026-06] NFR 모바일 오버라이드 — ⚠️ base .nfr-* 정의 '뒤'에 두어야 한다.
   @media 는 specificity 를 올리지 않으므로, 파일에서 더 뒤에 오는 규칙이 이긴다.
   이전엔 이 블록이 base 보다 앞서 있어 base(align-items:center / padding 24px 등)에
   덮여 모바일에서 중앙정렬·과한 여백이 그대로였다(버그). */
@media (max-width: 768px) {
  .nfr-root { padding: 12px 0; gap: 14px; }
  .nfr-page-header {
    flex-direction: column; align-items: flex-start;
    gap: 8px; padding: 0 2px 12px; text-align: left;
  }
  .nfr-page-title { font-size: 1rem; }
  .nfr-page-meta { justify-content: flex-start; flex-wrap: wrap; }

  .nfr-card-header { flex-wrap: wrap; padding: 12px 12px; gap: 8px; }
  .nfr-card-idx { order: 1; }
  .nfr-item-count { order: 2; margin-left: auto; }
  .nfr-card-title-text { order: 3; flex: 1 1 100%; font-size: 0.9rem; line-height: 1.4; }
  .nfr-item { padding: 12px 12px; }
  .nfr-item-contents { padding-left: 0; }
}
</style>
