<script setup>
/**
 * MeetingLogEditor.vue — 미팅 로그 본문 에디터 (MeetingLogTab 에서 분리, 2026-05-27).
 *
 * 우측 메인 영역: 신규 작성(textarea + 양식/음성 도우미) / 기존 로그 조회(마크다운 뷰어)
 * / onboard 진행 카드 / 액션 버튼.
 *
 * editContent·isNewLogMode 는 부모(MeetingLogTab)가 소유하고 v-model 로 양방향 바인딩 —
 * batch 패널 전환 시 에디터가 unmount 돼도 입력 내용/모드가 유지되도록.
 */
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { md } from '@/utils/markdown'
import { Plus, FileText, Trash2, Loader2, Mic, FileType, MessageCircle, RotateCcw, AlertTriangle, X, Info } from 'lucide-vue-next'
import axios from '@/utils/axios'
// isCancel 은 axios 정적 함수 — @/utils/axios(인스턴스)엔 없으므로 패키지에서 직접 import.
import { isCancel } from 'axios'
import { useHarnessStore, API_BASE } from '@/store/harness'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import InterviewDialog from './InterviewDialog.vue'
import { interviewOpenRequested, consumeInterviewOpen } from '@/composables/useInterviewEntry'
import { useUsageStore } from '@/store/usage'
import { useUpgradePrompt } from '@/composables/useUpgradePrompt'
import { transcribeLargeAudio, decodeAudioToMono, AudioChunkError } from '@/utils/audioChunk'

const store = useHarnessStore()
const { showSuccess: notifySuccess, showError: notifyError, showWarning: notifyWarning } = useSnackbar()
const confirm = useConfirm()
const { t } = useI18n()
const usage = useUsageStore()
const { showQuotaExceeded } = useUpgradePrompt()

const props = defineProps({
  currentLog: {
    type: Object,
    default: null,
  },
  nextVersion: {
    type: String,
    default: 'v1.1',
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  // 저장 API 진행 중 — isLoading 은 fetch 와 혼용되므로 저장 전용 플래그로 구분
  isSaving: {
    type: Boolean,
    default: false,
  },
  // 'cps_running' / 'prd_running' / 'done' / 'queued' / null
  currentJobStage: {
    type: String,
    default: null,
  },
  isBatchRunning: {
    type: Boolean,
    default: false,
  },
  currentStageLabel: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['save', 'delete', 'start-new-log'])

// editContent / isNewLogMode 는 부모 소유 — v-model 프록시.
const editContent = defineModel('editContent', { type: String, default: '' })
const isNewLogMode = defineModel('isNewLogMode', { type: Boolean, default: false })

// [2026-06-26] 신규/리비전 작성 진입 시 잔여 회의록 카운트 최신화 — 저장 차감 안내(meeting-cost-hint)
// 의 "남은 N건"이 직전 저장 이후에도 정확하도록. (실패해도 무해 — 마지막 캐시값 사용.)
watch(isNewLogMode, (now) => { if (now) usage.refresh().catch(() => {}) }, { immediate: true })

const MIN_MEETING_CHARS = 200
// 공백 제외 글자수 — 카운터/남은 글자 힌트/저장 버튼 비활성 판정에 공유.
const charCount = computed(() => editContent.value.replace(/\s/g, '').length)
const isContentTooShort = computed(() => charCount.value < MIN_MEETING_CHARS)

// [2026-05-27] 신규 작성 모드인데 백그라운드 job 진행 중 (GitHub onboard 또는
// 저장 직후 폴링). 이 경우 빈 입력 폼(textarea/양식·음성 버튼/글자수/액션)을 숨기고
// 큰 진행 카드만 표시 — 사용자가 빈 폼에 입력해야 하나 오해하지 않도록.
// batch 는 자체 batch UI 가 표시하므로 제외.
const isProcessingNewLog = computed(
  () => isNewLogMode.value && !!props.currentJobStage && !props.isBatchRunning,
)

// ─── [2026-06-04] 진행률 % 프로그래스바 ──────────────────────────────
// 사용자 피드백: 2~6분 대기 동안 "지금 몇 %인지" 안 보여 "멈춘 거 아냐?" 하고 이탈.
// stage 를 [floor,ceil] 구간에 매핑하고, **구간 안에서도 시간 기반으로 ceil 에
// 점근(지수)** 하도록 해 바가 항상 조금씩 전진 → "멈춘 느낌" 제거. 단조 증가 보장.
//
// post_meeting 파이프라인 8 sub-stage (CPS 1/2 → PRD 2/2). 각 구간 폭은 대략적인
// 소요 비중(LLM 호출 단계가 길다). ceil 은 다음 stage 의 floor 와 맞물려 stage 전환 시
// 바가 자연스럽게 이어진다(역행 없음). done/complete 만 100%.
const _STAGE_BANDS = {
  queued:      [2, 6],
  cps_running: [6, 22],
  cps_extract: [6, 22],
  cps_impact:  [22, 34],
  cps_merge:   [34, 48],
  prd_running: [48, 66],
  prd_extract: [48, 66],
  prd_graph:   [66, 82],
  prd_merge:   [82, 96],
  in_progress: [6, 96],
  done:        [100, 100],
  complete:    [100, 100],
}
// 구간 내 점근 시정수(ms) — 작을수록 빨리 ceil 근처로. ~25s 면 1분쯤엔 ceil 의 90%+.
const _BAND_TAU_MS = 25_000

const _now = ref(Date.now())
const _stageStartedAt = ref(Date.now())
const _maxPct = ref(0)               // 단조 증가 가드 (label flicker/역순 방어)
let _progressTicker = null

// stage 가 바뀌면 구간 시작 시각 리셋 → 새 구간을 0 부터 점근.
watch(() => props.currentJobStage, (stage, prev) => {
  if (stage !== prev) _stageStartedAt.value = Date.now()
  if (!stage) _maxPct.value = 0       // 작업 끝/초기화 시 다음 작업 위해 리셋
}, { immediate: true })

// stage 가 활성인 동안(큰 카드 + 인라인 행 양쪽) 1초 ticker 가동. 끝나면 정지.
const isStageActive = computed(() => !!props.currentJobStage && !props.isBatchRunning)
watch(isStageActive, (on) => {
  if (on && !_progressTicker) {
    _now.value = Date.now()
    _progressTicker = setInterval(() => { _now.value = Date.now() }, 1000)
  } else if (!on && _progressTicker) {
    clearInterval(_progressTicker)
    _progressTicker = null
  }
}, { immediate: true })
onUnmounted(() => { if (_progressTicker) clearInterval(_progressTicker) })

// 현재 stage + 경과 시간으로 계산한 **원시 목표 %** (순수 — 부수효과 없음).
const _targetPct = computed(() => {
  const stage = props.currentJobStage
  const band = (stage && _STAGE_BANDS[stage]) || _STAGE_BANDS.in_progress
  const [floor, ceil] = band
  if (floor >= 100) return 100
  const elapsed = Math.max(0, _now.value - _stageStartedAt.value)
  // 구간 내 지수 점근 — ceil 을 절대 넘지 않고 항상 전진.
  const eased = floor + (ceil - floor) * (1 - Math.exp(-elapsed / _BAND_TAU_MS))
  return Math.min(ceil, Math.round(eased))
})
// 단조 증가 가드는 watcher 로 분리 (computed 안에서 ref 변경 금지 — 자기 무효화 방지).
// stage 활성 중에만 끌어올림 → 작업 종료(stage null) 후 0 리셋이 다시 튀지 않음.
watch([_targetPct, isStageActive], ([t, active]) => {
  if (active && t > _maxPct.value) _maxPct.value = t
}, { immediate: true })
const progressPct = computed(() => _maxPct.value)

// ─── 입력 도우미 — 양식 삽입 + 음성 업로드(STT) ──────────────────
// 신규 사용자가 "어떤 정보를 어떻게 써야 하는지" 막막해 하는 문제 해소.
// (1) 양식 삽입: dialog 스타일 마크다운 템플릿을 textarea 에 채워줘 빈칸만 채우면 되게.
// (2) 음성 업로드(STT): 회의 녹음 파일을 BE 의 transcribeAudio 로 보내 raw 전사 텍스트를 받음.
//     사용자가 받은 텍스트를 검토/수정한 뒤 기존 Confirm & Archive 흐름으로 저장.
const insertTemplate = async () => {
  if (editContent.value.trim()) {
    // [2026-06-10 UX] window.confirm → 전역 ConfirmDialog (디자인 통일 + 모바일 UX)
    const ok = await confirm({
      title: t('plan.editor.insert_template_btn'),
      message: t('plan.editor.template_overwrite_confirm'),
      confirmText: t('common.action.confirm'),
    })
    if (!ok) return
  }
  applyEditorReplacement(t('plan.editor.log_template'), 'template')
}

// 음성 업로드 진행 상태 — BE transcribeAudio 호출 동안 progress 표시 + 중복 업로드 방지.
const isTranscribing = ref(false)
const audioFileInputRef = ref(null)
// [2026-06] 전사 중 취소(abort) — 사용자가 긴 전사를 중단할 수 있게(C7).
const transcribeAbort = ref(null)
// 긴 회의 청킹 진행 상태 — { cur, total } (1-based). null 이면 단일 호출(청킹 아님).
const chunkProgress = ref(null)

// [2026-06] truncated(출력토큰 상한 절단) 전사 저장 가드(C5) — 잘린 회의록이 9초
// 스낵바만 뜨고 그대로 저장되던 문제. 채울 때 스냅샷을 찍고, 사용자가 편집/교체하면
// (아래 editContent watch) 해제. 저장 시 플래그가 살아있으면 confirm 1회 + 영속 배너.
const transcriptTruncated = ref(false)
const truncatedSnapshot = ref('')
const markTranscriptTruncated = () => {
  transcriptTruncated.value = true
  truncatedSnapshot.value = editContent.value
}

// 단일 업로드 분기 임계 — BE 한도 30MB 에서 multipart 오버헤드(boundary/헤더/projectName
// 필드, 통상 수백 B)를 뺀 여유값(29MB, 마진 ~1MB). 29MB 초과 파일이 Content-Length 30MB
// 초과로 BodySizeLimit 413 나던 사각지대(A1) 차단. 28MB 가 아니라 29MB 인 이유: 28~29MB
// 정상 파일을 불필요하게 청킹(Web Audio 디코드 의존) 경로로 보내 디코드 실패를 새로 유발하지
// 않기 위함 — 청킹은 413 이 사실상 확실한 29MB 초과에만 적용한다.
const SINGLE_UPLOAD_MAX = 29 * 1024 * 1024
// 청킹 경로의 원본 파일 상한 — 브라우저 디코드 메모리 보호용(약 1.5~3시간 분량).
const CHUNK_SOURCE_MAX = 150 * 1024 * 1024
const CHUNK_MAX_MINUTES = 180 // transcribeLargeAudio maxDurationSec 와 일치(3시간)

const textareaPlaceholder = computed(() => {
  if (!isTranscribing.value) return t('plan.editor.placeholder_default')
  if (chunkProgress.value) {
    return t('plan.editor.transcript_chunking', {
      cur: chunkProgress.value.cur,
      total: chunkProgress.value.total,
    })
  }
  return t('plan.editor.placeholder_transcribing')
})

const triggerAudioUpload = () => {
  if (isTranscribing.value) return
  audioFileInputRef.value?.click()
}

// [2026-06] 진행 중인 전사 취소 — AbortController 로 in-flight 요청 중단.
const cancelTranscribe = () => {
  transcribeAbort.value?.abort()
}
const handleAudioUpload = async (e) => {
  const file = e.target?.files?.[0]
  // 같은 파일 재선택 가능하도록 reset
  if (e.target) e.target.value = ''
  if (!file) return

  // 청킹 경로 원본 상한 — 너무 크면 브라우저 디코드가 OOM 위험. 명확히 거부.
  if (file.size > CHUNK_SOURCE_MAX) {
    notifyError(t('plan.editor.file_too_large', {
      size: (file.size / 1024 / 1024).toFixed(0),
      max: Math.round(CHUNK_SOURCE_MAX / 1024 / 1024),
    }))
    return
  }

  if (editContent.value.trim()) {
    const ok = await confirm({
      title: t('plan.editor.upload_audio_btn'),
      message: t('plan.editor.transcript_overwrite_confirm'),
      confirmText: t('common.action.confirm'),
    })
    if (!ok) return
  }

  // [2026-06] 무료 등급 쿼터 과소비 사전 경고 — 회의 1건이 월 한도를 통째로 소진할 수
  // 있다. 오디오는 ~96kbps 가정 시 대략 byte/330 토큰(가변 비트레이트라 어림치). 예상
  // 사용량이 남은 한도를 넘으면 확인을 받아 사용자가 취소(분할 업로드)할 기회를 준다.
  await usage.refresh().catch(() => {})
  if (usage.subscriptionType === 'free' && usage.tokensLimit > 0) {
    const remaining = Math.max(0, usage.tokensLimit - usage.tokensUsed)
    const estTokens = Math.round(file.size / 330)
    if (estTokens > remaining) {
      const ok = await confirm({
        title: t('plan.editor.upload_audio_btn'),
        message: t('plan.editor.transcript_quota_warn', {
          est: estTokens.toLocaleString(),
          remaining: remaining.toLocaleString(),
        }),
        confirmText: t('common.action.confirm'),
      })
      if (!ok) return
    }
  }

  isTranscribing.value = true
  transcribeAbort.value = new AbortController()
  // 새 전사 시작 — 이전 truncated 저장 가드 해제(동일 텍스트 재전사 시 stale 로 남던 문제).
  transcriptTruncated.value = false
  try {
    if (file.size > SINGLE_UPLOAD_MAX) {
      // ── 긴 회의: 클라이언트에서 분할 전사 후 이어붙임 ──
      const result = await transcribeLargeAudio(file, {
        decode: decodeAudioToMono,
        upload: uploadAudioChunk,
        onProgress: ({ index, total }) => { chunkProgress.value = { cur: index + 1, total } },
        signal: transcribeAbort.value?.signal,
      })
      // 전체가 무음/인식불가면 AudioChunkError('empty') 로 — 아래 catch 의 일관된
      // transcript_empty 분기를 타도록(generic Error 는 transcript_fail 로 이중 래핑됨).
      if (!result.text.trim()) throw new AudioChunkError('empty')
      applyEditorReplacement(result.text, 'voice')
      if (result.truncated) {
        markTranscriptTruncated()
        notifyWarning(t('plan.editor.transcript_truncated'), { timeout: 9000 })
      } else {
        notifySuccess(t('plan.editor.transcript_chunked_done', { total: result.chunkCount }), { timeout: 7000 })
      }
    } else {
      // ── 일반: 단일 업로드 ──
      const formData = new FormData()
      formData.append('file', file)
      if (store.projectName) formData.append('projectName', store.projectName)
      const response = await axios.post(`${API_BASE}/transcribeAudio`, formData, {
        // multipart 라 axios 가 자동으로 boundary 설정 — Content-Type 명시 안 함.
        timeout: 300000,  // 5분 — 30MB 음성 = 약 30-60초 transcription, 여유 둠
        signal: transcribeAbort.value?.signal,  // 취소 버튼으로 중단 가능
      })
      const data = response.data || {}
      if (data.result !== 'success' || typeof data.text !== 'string' || !data.text.trim()) {
        throw new Error(data.message || t('plan.editor.transcript_empty'))
      }
      applyEditorReplacement(data.text, 'voice')
      // 출력 토큰 상한으로 전사가 잘렸으면(긴 회의) 부분 성공 — 경고로 재시도 안내.
      // (단일 스낵바라 success+error 동시 호출 시 덮어써지므로 분기로 하나만 띄운다.)
      if (data.truncated) {
        markTranscriptTruncated()
        notifyWarning(t('plan.editor.transcript_truncated'), { timeout: 9000 })
      } else {
        const duration = data.duration_sec
          ? t('plan.editor.transcript_done_duration', { min: Math.round(data.duration_sec / 60) })
          : ''
        notifySuccess(t('plan.editor.transcript_done', { duration }), { timeout: 6000 })
      }
    }
  } catch (err) {
    // [2026-06] 사용자가 취소(abort)한 경우 — 에러 아님, 조용히 안내하고 종료.
    // isCancel: axios 취소(__CANCEL__) / 'canceled': 디코드 단계 취소(AudioChunkError) / name·code: 폴백.
    if (isCancel(err) || err?.code === 'canceled' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
      notifyWarning(t('plan.editor.transcript_canceled'), { timeout: 4000 })
      return
    }
    // 청킹 단계 오류는 code 로 사용자 메시지 매핑.
    if (err instanceof AudioChunkError) {
      if (err.code === 'too_long') {
        notifyError(t('plan.editor.transcript_too_long', { max: CHUNK_MAX_MINUTES }))
      } else if (err.code === 'decode_failed' || err.code === 'no_webaudio') {
        notifyError(t('plan.editor.transcript_decode_failed'))
      } else if (err.code === 'chunk_failed') {
        // [2026-06] 부분결과 보존 — 앞서 전사된 구간은 채우고, 이후 실패만 경고.
        // 긴 회의가 청크 1개 네트워크 오류로 통째 날아가던 문제 해소.
        applyEditorReplacement(err.meta.partialText, 'voice')
        // 보존된 앞 청크 중 truncated 가 있었으면 저장 게이트(C5)가 걸리도록 마킹.
        if (err.meta.truncated) markTranscriptTruncated()
        notifyWarning(
          t('plan.editor.transcript_partial', { done: err.meta.doneCount, total: err.meta.total }),
          { timeout: 9000 },
        )
      } else {
        notifyError(t('plan.editor.transcript_empty'))
      }
      return
    }
    const status = err?.response?.status
    const detail = err?.response?.data?.detail || err?.response?.data?.message
    const msg = detail || err?.message || t('plan.editor.transcript_error')
    if (status === 413) {
      notifyError(t('plan.editor.file_too_large_retry'))
    } else if (status === 415) {
      notifyError(t('plan.editor.file_format_error'))
    } else {
      notifyError(t('plan.editor.transcript_fail', { msg }))
    }
  } finally {
    isTranscribing.value = false
    chunkProgress.value = null
    transcribeAbort.value = null
  }
}

// 청크 1개(16kHz 모노 WAV Blob) 전사 — transcribeLargeAudio 가 청크마다 호출.
// 무음 청크는 빈 텍스트를 그대로 반환(전체 흐름은 계속). result!=='success' 만 에러.
const uploadAudioChunk = async (blob, meta) => {
  const formData = new FormData()
  formData.append('file', blob, `chunk-${meta.index + 1}.wav`)
  if (store.projectName) formData.append('projectName', store.projectName)
  const response = await axios.post(`${API_BASE}/transcribeAudio`, formData, { timeout: 300000, signal: transcribeAbort.value?.signal })
  const data = response.data || {}
  if (data.result !== 'success' || typeof data.text !== 'string') {
    throw new Error(data.message || t('plan.editor.transcript_empty'))
  }
  return { text: data.text, tokens: data.tokens_used || 0, truncated: !!data.truncated }
}

const renderedMarkdown = computed(() => {
  if (!props.currentLog?.meeting_content) return ''

  // Handle escaped newlines from API if necessary
  const content = props.currentLog.meeting_content.replace(/\\n/g, '\n')
  return md.render(content)
})

// [2026-05-29] AI 인터뷰 — 회의록 없는 사용자용 진입. 완료 시 합성된 회의록을
// editContent 에 채워 사용자가 검토 후 저장 (음성 전사 흐름과 동일).
const showInterview = ref(false)
// [2026-06] AI 인터뷰 진입 가드 — '진짜 차단'일 때만 업그레이드로 유도.
// 유료(Lite 오버플로우 가능) 등급은 메인 토큰을 다 써도 Lite 로 대화가 이어지므로
// 막으면 안 된다(버그). store.isTokenBlocked = (Free 메인 소진) 또는 (유료 주간캡 소진)
// 일 때만 true. 그 외엔 모달을 열고 BE 가 Lite 로 처리. 캐시 stale 이어도 InterviewDialog
// 의 402 가드가 최종 방어.
const openInterview = async () => {
  await usage.refresh().catch(() => {})
  if (usage.isTokenBlocked) {
    const dailyMode = usage.liteEnabled  // 유료 → 주간캡 소진 차단, Free → 메인 소진 차단
    showQuotaExceeded({
      code: 'QUOTA_EXCEEDED',
      limit_type: 'total_tokens',
      current: dailyMode ? usage.liteDailyUsed : usage.tokensUsed,
      limit: dailyMode ? usage.liteDailyCap : usage.tokensLimit,
      subscription_type: usage.subscriptionType,
      upgrade_url: '/pricing',
      reset_at: dailyMode ? usage.liteDailyResetAt : usage.resetAt,
    })
    return
  }
  showInterview.value = true
}

// [2026-06-12 보강 모드] PRD 탭 "인터뷰로 채우기" → 탭 전환 후 인터뷰 모달 자동 오픈.
// sticky 신호라 이 컴포넌트가 신호 이후에 mount 돼도(immediate) 집어간다.
// 작성 모드가 아니면 start-new-log 로 부모 셋업(선택 해제·초안 비움)을 거친다 —
// 인터뷰 결과가 editContent(신규 작성 폼)에 안착하는 기존 완료 흐름과 짝.
watch(interviewOpenRequested, async (req) => {
  if (!req) return
  consumeInterviewOpen()
  if (!isNewLogMode.value) emit('start-new-log')
  await nextTick()
  await openInterview()  // 쿼터 차단 가드 포함 — 차단 시 업그레이드 모달로 대체
}, { immediate: true })
// [#5 병합 유실 안전망] 보완 인터뷰는 기존 초안을 병합본으로 통째 교체하므로,
// AI 가 일부를 빠뜨려도 사용자가 모를 수 있다. 인터뷰 직전 내용을 1단계 백업해
// "되돌리기" 를 제공 — 사용자가 직접 수정을 시작하면(아래 watch) 백업은 만료.
const preReplaceDraft = ref(null)   // 인터뷰 전 editContent (null = 백업 없음)
const lastReplaceResult = ref(null) // 우리가 적용한 병합본 (사용자 수정 감지용)
// [2026-06] 되돌리기 출처 — 'interview' | 'voice' | 'template'. 토스트/타이틀 문구용.
const replaceSource = ref(null)

// editContent 를 통째 교체하는 입력(인터뷰/음성/양식)의 공통 처리(C7/A8) — 직전 내용을
// 1단계 백업해 '되돌리기' 를 제공하고, 우리가 넣은 값을 추적(아래 watch 가 사용자 수정 시 만료).
// 인터뷰 단독이던 백업을 음성/양식까지 확장 — 메커니즘은 동일, 호출 지점만 늘림.
const applyEditorReplacement = (content, source) => {
  const hadDraft = editContent.value.trim().length > 0
  preReplaceDraft.value = hadDraft ? editContent.value : null
  editContent.value = content
  lastReplaceResult.value = content
  replaceSource.value = source
}

const onInterviewComplete = (content) => {
  if (!content?.trim()) return
  // BE 가 기존 초안을 보존·병합한 전체 회의록을 돌려주므로 그대로 반영 (덮어쓰기 아님 = 병합본).
  applyEditorReplacement(content, 'interview')
  notifySuccess(
    preReplaceDraft.value !== null
      ? t('interview.entry.merged_with_draft')
      : t('interview.entry.merged_no_draft'),
    { timeout: 6000 },
  )
}

const undoReplace = () => {
  if (preReplaceDraft.value === null) return
  editContent.value = preReplaceDraft.value
  preReplaceDraft.value = null
  notifySuccess(
    replaceSource.value === 'interview'
      ? t('interview.entry.reverted')
      : t('plan.editor.revert_done'),
    { timeout: 4000 },
  )
}

// 사용자가 병합본을 직접 수정하기 시작하면 되돌리기는 더 이상 의미 없음 → 백업 만료.
watch(editContent, (val) => {
  if (preReplaceDraft.value !== null && val !== lastReplaceResult.value) {
    preReplaceDraft.value = null
  }
  // truncated 저장 가드 해제 — 사용자가 직접 편집하거나 양식/인터뷰/undo 로 교체하면
  // (스냅샷과 달라지면). 잘린 전사를 채우는 그 tick 에선 val === 스냅샷이라 유지된다.
  if (transcriptTruncated.value && val !== truncatedSnapshot.value) {
    transcriptTruncated.value = false
  }
})

const saveLog = async () => {
  // [2026-06-10 UX] 버튼이 미달 시 disabled 라 보통 도달하지 않음 — 안전망으로 유지.
  if (isContentTooShort.value) {
    notifyError(
      t('plan.editor.too_short', { len: charCount.value, min: MIN_MEETING_CHARS }),
      { timeout: 8000 }
    )
    return
  }
  // [2026-06] 잘린 전사(truncated)는 불완전 회의록일 수 있어 저장 전 한 번 확인(C5).
  // 스낵바를 놓쳐도 부분 전사본이 완성본처럼 저장돼 CPS/PRD 가 불완전 입력으로 도는 걸 막는다.
  if (transcriptTruncated.value) {
    const ok = await confirm({
      title: t('plan.editor.archive_btn'),
      message: t('plan.editor.transcript_truncated_save_confirm'),
      confirmText: t('common.action.confirm'),
    })
    if (!ok) return
  }
  emit('save', editContent.value)
}

const deleteLog = () => {
  if (!props.currentLog) return
  emit('delete', props.currentLog.version)
}

// [2026-06-10 UX] Discard 가 확인 없이 작성 내용을 날리던 문제 — 내용이 있으면
// 전역 ConfirmDialog 로 한 번 확인. 빈 초안은 바로 닫는다.
const discardDraft = async () => {
  if (editContent.value.trim()) {
    const ok = await confirm({
      title: t('plan.editor.discard_confirm_title'),
      message: t('plan.editor.discard_confirm_message'),
      confirmText: t('plan.editor.discard_confirm_ok'),
      variant: 'danger',
    })
    if (!ok) return
  }
  editContent.value = ''
  isNewLogMode.value = false
}
</script>

<template>
  <div class="bg-card border-light pa-10 d-flex flex-column flex-grow-1 overflow-hidden" style="border-radius: 16px; min-width: 0; height: 100%">
    <div v-if="currentLog || isNewLogMode" class="d-flex flex-column h-100 w-100">
      <div class="mb-4">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="d-flex align-center">
            <div class="pill-badge px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] mr-3" :style="{ backgroundColor: 'var(--accent)', color: 'white' }">
              {{ isNewLogMode ? nextVersion : currentLog.version }}
            </div>
            <h4 class="text-h5 font-black text-main tracking-tight serif-text">Engineering Log</h4>
          </div>

        </div>
        <div class="d-flex align-center text-[10px] font-bold text-muted uppercase tracking-widest mt-2">
          <VIcon icon="mdi-shield-check-outline" size="14" class="mr-2" />
          <span>{{ isNewLogMode ? 'Document Session' : currentLog.date + ' Revision' }} • Authority: Harness AI Engine</span>
        </div>
      </div>

      <VDivider class="mb-4" />

      <div class="editor-section d-flex flex-column flex-grow-1 overflow-hidden min-h-0">
        <!-- [2026-05-27] 진행 중(isProcessingNewLog)엔 헤더 줄 숨김 — 큰 진행 카드가
             "회의록 분석 중" 제목을 이미 표시하므로 CONSOLIDATED SUMMARY 라벨은 중복. -->
        <div v-if="!isProcessingNewLog" class="d-flex justify-space-between align-center mb-3 flex-shrink-0" style="gap: 12px; flex-wrap: wrap">
          <div class="text-overline font-weight-black text-main">CONSOLIDATED SUMMARY</div>
          <!-- 신규 로그 모드 진입 시 도우미 — 양식 삽입 + 음성 파일 STT.
               진행 중(isProcessingNewLog)엔 입력 불필요하므로 숨김. -->
          <div v-if="isNewLogMode && !isProcessingNewLog" class="d-flex align-center" style="gap: 8px; flex-wrap: wrap">
            <button
              class="input-helper-btn input-helper-btn--interview"
              :disabled="isLoading || isTranscribing"
              :title="editContent.trim()
                ? $t('interview.entry.title_fill')
                : $t('interview.entry.title_start')"
              @click="openInterview"
            >
              <MessageCircle :size="13" class="mr-1" />
              {{ editContent.trim() ? $t('interview.entry.btn_fill') : $t('interview.entry.btn_start') }}
            </button>
            <!-- [#5] 보완 인터뷰 직후에만 노출 — 병합본이 마음에 안 들면 1단계 되돌리기. -->
            <button
              v-if="preReplaceDraft !== null"
              class="input-helper-btn input-helper-btn--undo"
              :title="replaceSource === 'interview' ? $t('interview.entry.undo_title') : $t('plan.editor.revert_title')"
              @click="undoReplace"
            >
              <RotateCcw :size="13" class="mr-1" />
              {{ $t('interview.entry.undo_btn') }}
            </button>
            <!-- [2026-06-10 UX] 버튼 옆 ⓘ(GuideTooltip) 제거 — 텍스트 라벨 + title 로 충분.
                 History 헤더와 동일하게 작은 보조 타겟을 줄여 시각 잡음 정리. -->
            <button
              class="input-helper-btn"
              :disabled="isLoading || isTranscribing"
              :title="editContent.trim() ? $t('plan.editor.insert_template_title_overwrite') : $t('plan.editor.insert_template_title_empty')"
              @click="insertTemplate"
            >
              <FileType :size="13" class="mr-1" />
              {{ $t('plan.editor.insert_template_btn') }}
            </button>
            <button
              class="input-helper-btn input-helper-btn--accent"
              :disabled="isLoading || isTranscribing"
              :title="$t('plan.editor.upload_audio_title')"
              @click="triggerAudioUpload"
            >
              <Loader2 v-if="isTranscribing" :size="13" class="mr-1 rotate-anim" />
              <Mic v-else :size="13" class="mr-1" />
              {{ isTranscribing ? $t('plan.editor.transcribing') : $t('plan.editor.upload_audio_btn') }}
            </button>
            <input
              ref="audioFileInputRef"
              type="file"
              accept="audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/wave,audio/webm,audio/ogg,audio/flac,audio/x-flac,video/mp4,video/webm,.m4a,.mp3,.mp4,.wav,.webm,.ogg,.flac,.aac"
              style="display: none"
              @change="handleAudioUpload"
            />
            <!-- [2026-06] 전사 중 취소 — 진행 중일 때만 노출(C7). -->
            <button
              v-if="isTranscribing"
              class="input-helper-btn input-helper-btn--undo"
              :title="$t('plan.editor.transcript_cancel_btn')"
              @click="cancelTranscribe"
            >
              <X :size="13" class="mr-1" />
              {{ $t('plan.editor.transcript_cancel_btn') }}
            </button>
          </div>
        </div>

        <!-- [2026-05-27] 신규 작성 모드 + job 진행 중 (GitHub onboard 등):
             빈 입력 폼 대신 큰 진행 카드. 사용자가 입력할 필요 없음을 명확히. -->
        <div
          v-if="isProcessingNewLog"
          class="onboard-processing-card flex-grow-1 d-flex flex-column align-center justify-center text-center"
        >
          <Loader2 :size="34" class="rotate-anim onboard-processing-card__spin mb-4" />
          <div class="onboard-processing-card__title">
            {{ currentStageLabel || $t('plan.editor.analyzing') }}
          </div>

          <!-- [2026-06-04] 세분화 % 프로그래스바 — 대기 중 진행 상황을 명확히 -->
          <div
            class="onboard-processing-card__progress"
            role="progressbar"
            :aria-valuenow="progressPct"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="onboard-processing-card__bar">
              <div
                class="onboard-processing-card__bar-fill"
                :style="{ width: progressPct + '%' }"
              ></div>
            </div>
            <span class="onboard-processing-card__pct">{{ progressPct }}%</span>
          </div>

          <div class="onboard-processing-card__sub">
            {{ $t('plan.editor.ai_processing_desc') }}
          </div>
          <div class="onboard-processing-card__hint">
            {{ $t('plan.editor.ai_processing_hint') }}
          </div>
        </div>

        <!-- Markdown Preview (기존 로그 조회 - 읽기 전용) -->
        <div
          v-else-if="!isNewLogMode && currentLog"
          class="markdown-preview pa-8 bg-slate-50 rounded-lg custom-markdown border-light flex-grow-1 overflow-y-auto"
        >
          <!-- content async fetch 중이면 skeleton 표시 — 빈 상태로 깜빡이지 않게. -->
          <div v-if="!currentLog.meeting_content" class="d-flex align-center justify-center text-muted" style="min-height: 200px;">
            <VProgressCircular indeterminate size="20" width="2" color="muted" class="mr-2" />
            <span>{{ $t('plan.editor.log_loading') }}</span>
          </div>
          <div v-else v-html="renderedMarkdown"></div>
        </div>

        <!-- Textarea (신규 로그 작성 모드) -->
        <VTextarea
          v-else
          v-model="editContent"
          variant="outlined"
          hide-details
          class="premium-textarea flex-grow-1 overflow-hidden d-flex flex-column"
          :placeholder="textareaPlaceholder"
          :loading="isLoading || isTranscribing"
          :disabled="isLoading || isTranscribing"
        ></VTextarea>

        <!-- 글자수 안내 (신규 로그 작성 모드) — 진행 중엔 카드가 대신하므로 숨김.
             [2026-06-10 UX] 입력 전엔 중립색(잘못한 게 없는데 경고색으로 시작하지 않게),
             입력 중 미달이면 경고색 + '몇 자 남았는지' 안내. -->
        <div v-if="isNewLogMode && !isProcessingNewLog" class="char-count-hint">
          <span :class="charCount === 0 ? 'char-count-neutral' : (isContentTooShort ? 'char-count-warn' : 'char-count-ok')">
            {{ $t('plan.editor.char_count', { count: charCount, min: MIN_MEETING_CHARS }) }}
          </span>
          <span v-if="isContentTooShort" class="char-count-guide" :class="{ 'char-count-guide--neutral': charCount === 0 }">
            {{ charCount === 0
              ? $t('plan.editor.char_min_hint', { min: MIN_MEETING_CHARS })
              : $t('plan.editor.char_remaining', { n: MIN_MEETING_CHARS - charCount }) }}
          </span>
        </div>

        <!-- [2026-06] truncated 전사 영속 경고 배너 — 스낵바(9초)를 놓쳐도 저장 전까지 계속 보이게(C5). -->
        <div v-if="isNewLogMode && transcriptTruncated" class="transcript-truncated-banner">
          <AlertTriangle :size="14" class="flex-shrink-0" />
          <span>{{ $t('plan.editor.transcript_truncated_banner') }}</span>
        </div>

        <!-- 진행 상태 알림(작은 행): 기존 로그 조회 모드에서 백그라운드 job 진행 중,
             또는 동기 저장 중. 신규 작성 모드 + 진행 중(isProcessingNewLog)이면 위의
             큰 진행 카드가 대신하므로 여기선 제외 (중복 회피). -->
        <div
          v-if="!isProcessingNewLog && ((isSaving && isNewLogMode) || (currentJobStage && !isBatchRunning))"
          class="saving-progress-row flex-shrink-0"
        >
          <Loader2 :size="15" class="rotate-anim mr-2" />
          <div class="saving-progress-info">
            <span class="saving-progress-label">
              {{ currentStageLabel || $t('plan.editor.processing') }}
              <span v-if="currentJobStage" class="saving-progress-pct">{{ progressPct }}%</span>
            </span>
            <!-- [2026-06-04] 인라인 세분화 % 바 — 조회 화면에서도 진행률 가시화 -->
            <div
              v-if="currentJobStage"
              class="saving-progress-bar"
              role="progressbar"
              :aria-valuenow="progressPct"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="saving-progress-bar__fill" :style="{ width: progressPct + '%' }"></div>
            </div>
            <span class="saving-progress-hint">{{ $t('plan.editor.saving_hint') }}</span>
          </div>
        </div>

        <!-- [2026-06-26] 회의록 차감 안내 — 저장(신규/리비전 모두)이 '회의록 등록 1건'을 소비함을
             명확히. "수정·재저장은 공짜"라는 오해로 무료 한도를 모르게 소진하는 것 방지. -->
        <div
          v-if="isNewLogMode && !isProcessingNewLog"
          class="meeting-cost-hint"
          :class="{ 'meeting-cost-hint--low': usage.meetingRemaining <= 1 }"
        >
          <Info :size="13" class="meeting-cost-hint__icon flex-shrink-0" />
          <span class="meeting-cost-hint__text">{{ $t('plan.editor.meeting_cost_hint') }}</span>
          <span class="meeting-cost-hint__remaining">{{ $t('plan.editor.meeting_cost_remaining', { n: usage.meetingRemaining }) }}</span>
        </div>

        <!-- 진행 중(isProcessingNewLog)엔 입력 액션 버튼 전부 숨김 — 큰 카드만. -->
        <div v-if="!isProcessingNewLog" class="d-flex justify-end gap-3 mt-4 flex-shrink-0">
          <!-- 신규 로그 모드: 작성 취소(확인 다이얼로그) + 저장/분석 시작.
               [2026-06-10 UX] 저장 버튼은 글자수 미달 시 disabled + 이유 title —
               활성으로 보였다가 누르면 에러 나는 '사후 통보' 제거. -->
          <template v-if="isNewLogMode">
            <button class="discard-btn" :disabled="isLoading" @click="discardDraft">{{ $t('plan.editor.discard_btn') }}</button>
            <button
              class="archive-btn"
              :disabled="isLoading || isContentTooShort"
              :title="isContentTooShort ? $t('plan.editor.save_too_short_title', { min: MIN_MEETING_CHARS }) : ''"
              @click="saveLog"
            >
              <Loader2 v-if="isLoading" :size="14" class="rotate-anim mr-2" />
              <FileText v-else :size="14" class="mr-2" />
              {{ isLoading ? (currentStageLabel || $t('plan.editor.processing')) : $t('plan.editor.archive_btn') }}
            </button>
          </template>

          <!-- 기존 로그 조회 모드: Delete -->
          <button v-if="!isNewLogMode && currentLog" class="delete-btn" @click="deleteLog" :disabled="isLoading">
            <Trash2 :size="14" class="mr-2" />
            {{ $t('plan.editor.delete_btn') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="!isLoading" class="fill-height d-flex flex-column align-center justify-center opacity-40">
      <VIcon icon="mdi-file-clock-outline" size="x-large" color="muted" class="mb-4" />
      <div class="text-h6 font-weight-bold mb-4">{{ $t('plan.editor.empty_select') }}</div>
      <button class="archive-btn" @click="$emit('start-new-log')">
        <Plus :size="14" class="mr-2" />
        {{ $t('plan.editor.start_new_btn') }}
      </button>
    </div>

    <!-- [2026-05-29] AI 인터뷰 다이얼로그 — 완료 시 회의록을 editContent 로 채움 -->
    <InterviewDialog v-model="showInterview" :existing-content="editContent" @complete="onInterviewComplete" />
  </div>
</template>

<style scoped>
/* ============================
   Action Buttons
   ============================ */
.discard-btn {
  padding: 10px 24px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.discard-btn:hover {
  background: var(--bg-light);
  color: var(--text-main);
}

.discard-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 입력 도우미 버튼 — 신규 로그 모드의 양식 삽입 / 음성 업로드 */
.input-helper-btn {
  display: inline-flex;
  align-items: center;
  padding: 7px 14px;
  border-radius: 9999px;
  border: 1px solid var(--border-light);
  background: white;
  color: var(--text-main);
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.input-helper-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  /* [2026-06] translateY 제거 — 부모 editor-section(overflow-hidden) 상단 경계에서
     pill 버튼 윗 곡선이 잘리던 문제. 호버 피드백은 테두리·색 변화로 충분. */
}
.input-helper-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* 음성 업로드 — 강조 톤 (accent 보더) */
.input-helper-btn--accent {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(140, 98, 57, 0.04);
}
.input-helper-btn--accent:hover:not(:disabled) {
  background: var(--accent);
  color: white;
}
/* AI 인터뷰 — 주 진입 강조 (채워진 accent) */
.input-helper-btn--interview {
  border-color: var(--accent);
  background: var(--accent, #8C6239);
  color: white;
  font-weight: 700;
}
.input-helper-btn--interview:hover:not(:disabled) {
  filter: brightness(1.08);
  /* [버그픽스 2026-06-06] 제네릭 .input-helper-btn:hover 가 color:accent(갈색)로 덮어
     갈색 배경 위 흰 글자가 사라지던(갈색 blob) 문제 → 흰색 유지. */
  color: white;
}
.input-helper-btn--undo {
  border-color: var(--border-light);
  background: transparent;
  color: var(--text-muted);
}
.input-helper-btn--undo:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.archive-btn {
  display: inline-flex;
  align-items: center;
  padding: 12px 28px;
  border-radius: 9999px;
  border: none;
  background: var(--text-main);
  color: white;
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.archive-btn:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}

.archive-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.delete-btn {
  display: inline-flex;
  align-items: center;
  padding: 12px 28px;
  border-radius: 9999px;
  border: 1.5px solid #ef4444;
  background: transparent;
  color: #ef4444;
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delete-btn:hover {
  background: #ef4444;
  color: white;
  transform: translateY(-1px);
}

.delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

/* ============================
   Content Area
   ============================ */
.pill-badge {
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.premium-textarea :deep(.v-field) {
  border-radius: 16px !important;
  border: 1px solid var(--border-light) !important;
  background-color: white !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}

.premium-textarea :deep(.v-field--focused) {
  border-color: var(--accent) !important;
}

.premium-textarea :deep(.v-field__input) {
  font-family: 'Plus Jakarta Sans', 'Pretendard Variable', sans-serif !important;
  font-size: 0.95rem;
  line-height: 1.8;
  padding: 28px;
  color: var(--text-main);
  height: 100% !important;
  overflow-y: auto !important;
  /* 모바일에서 placeholder/내용이 잘리지 않도록 폭 보장 */
  min-width: 0 !important;
  box-sizing: border-box !important;
}

.premium-textarea :deep(.v-field__field) {
  height: 100% !important;
  min-width: 0 !important;
}

/* [2026-06-22] CONSOLIDATED SUMMARY 입력 영역이 작게(기본 ~5줄) 멈추던 문제 (web/tablet).
   VTextarea 루트(.v-input)는 flex-grow 되지만, 그 사이의 .v-input__control 이
   늘어나지 않아 하위 .v-field 의 height:100% 가 기본 줄 높이로만 해석됐다.
   control 을 세로 flex 로 채워 textarea 가 사용 가능한 높이를 전부 쓰도록 한다.
   (root 에 height:100% 를 주면 헤더/푸터 형제를 무시하고 넘치므로, flex-grow-1 클래스에 맡김.) */
.premium-textarea :deep(.v-input__control) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 모바일 — textarea / markdown-preview 의 내부 padding 축소 + 최소 높이 보장.
   ≤600 에선 plan.vue 가 세로 흐름(height:auto + 페이지 스크롤)으로 전환해 flex 채움이
   사라지므로, 화면 비율 기반 최소 높이로 "너무 작은" 입력 영역을 방지한다.
   (web/tablet 은 위 control flex 채움으로 충분 — 여기에 vh 최소높이를 강제하면
   세로 고정 레이아웃에서 저장 버튼이 잘릴 수 있어 모바일에만 적용.) */
@media (max-width: 600px) {
  .premium-textarea :deep(.v-field__input) {
    padding: 14px 12px !important;
    font-size: 0.88rem;
    line-height: 1.6;
  }
  .markdown-preview { padding: 16px !important; }
  .editor-section { min-width: 0; }
  .premium-textarea,
  .markdown-preview { min-height: 56vh; }
}

.custom-markdown :deep(h1),
.custom-markdown :deep(h2),
.custom-markdown :deep(h3) {
  margin-top: 24px;
  margin-bottom: 12px;
  color: #111;
  font-weight: 800;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.custom-markdown :deep(p) {
  margin-bottom: 16px;
  line-height: 1.8;
  color: #444;
}

.custom-markdown :deep(ul),
.custom-markdown :deep(ol) {
  margin-bottom: 16px;
  padding-left: 24px;
}

.custom-markdown :deep(li) {
  margin-bottom: 8px;
  line-height: 1.6;
}

.custom-markdown :deep(code) {
  background-color: #f6f8fa;
  padding: 0.2em 0.4em;
  border-radius: 6px;
  font-family:
    ui-monospace,
    SFMono-Regular,
    SF Mono,
    Menlo,
    Consolas,
    Liberation Mono,
    monospace;
  font-size: 85%;
}

.opacity-40 {
  opacity: 0.4;
}

/* 모바일 — Engineering Log 콘텐츠 영역 padding 축소 + 헤더 row wrap */
@media (max-width: 768px) {
  .bg-card.pa-10 { padding: 16px !important; }
  .bg-card .d-flex.align-center.justify-space-between {
    flex-wrap: wrap;
    gap: 8px;
  }
}
@media (max-width: 600px) {
  .bg-card.pa-10 { padding: 12px !important; }
}

/* .rotate-anim 회전은 전역(App.vue)으로 통합됨 */

/* ============================
   Saving / Job Progress Banner
   ============================ */
.saving-progress-row {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.07);
  border: 1px solid rgba(140, 98, 57, 0.2);
  color: var(--accent, #8C6239);
  margin-top: 16px;
}
.saving-progress-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.saving-progress-label {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.82rem;
  font-weight: 700;
}
.saving-progress-hint {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.68rem;
  color: var(--text-muted, #6b7280);
}
.saving-progress-pct {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-weight: 800;
  font-size: 0.78rem;
  color: var(--accent, #8C6239);
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}
.saving-progress-bar {
  height: 5px;
  width: 100%;
  max-width: 220px;
  background: rgba(0, 0, 0, 0.07);
  border-radius: 9999px;
  overflow: hidden;
  margin: 4px 0 2px;
}
.saving-progress-bar__fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #2563EB 0%, #8C6239 100%);
  transition: width 0.9s cubic-bezier(.16, 1, .3, 1);
}
@media (prefers-reduced-motion: reduce) {
  .saving-progress-bar__fill { transition: none; }
}

/* [2026-05-27] 신규 작성 모드 + job 진행 중 — 빈 폼 대신 표시하는 큰 진행 카드. */
.onboard-processing-card {
  gap: 4px;
  padding: 32px 24px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(140, 98, 57, 0.04) 100%);
  border: 1px solid rgba(140, 98, 57, 0.2);
  min-height: 240px;
}
.onboard-processing-card__spin {
  color: var(--accent, #8C6239);
}
.onboard-processing-card__title {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main, #1f2937);
  line-height: 1.4;
}
/* [2026-06-04] 세분화 % 프로그래스바 — 대기 중 진행 상황 가시화 */
.onboard-processing-card__progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(360px, 80vw);
  margin-top: 14px;
}
.onboard-processing-card__bar {
  flex: 1;
  height: 8px;
  background: rgba(0, 0, 0, 0.07);
  border-radius: 9999px;
  overflow: hidden;
}
.onboard-processing-card__bar-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #2563EB 0%, #8C6239 100%);
  /* width 가 1초마다 조금씩 늘어 — 부드럽게 따라가도록 transition */
  transition: width 0.9s cubic-bezier(.16, 1, .3, 1);
  box-shadow: 0 0 8px rgba(37, 99, 235, 0.3);
}
.onboard-processing-card__pct {
  flex-shrink: 0;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.86rem;
  font-weight: 800;
  color: var(--accent, #8C6239);
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .onboard-processing-card__bar-fill { transition: none; }
}
.onboard-processing-card__sub {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.86rem;
  color: var(--text-muted, #6b7280);
  line-height: 1.6;
  max-width: 460px;
  margin-top: 6px;
  word-break: keep-all;
}
.onboard-processing-card__hint {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.74rem;
  color: var(--text-muted, #9ca3af);
  margin-top: 10px;
  word-break: keep-all;
}
@media (max-width: 600px) {
  .onboard-processing-card {
    padding: 24px 16px;
    min-height: 200px;
  }
  .onboard-processing-card__title { font-size: 0.96rem; }
  .onboard-processing-card__sub { font-size: 0.8rem; }
}
@media (prefers-reduced-motion: reduce) {
  .onboard-processing-card__spin { animation: none; }
}

.char-count-hint {
  display: flex;
  align-items: baseline;   /* 줄바꿈 시 카운터·안내문 baseline 정렬 */
  flex-wrap: wrap;         /* 좁으면 안내문이 다음 줄로 */
  gap: 2px 6px;
  padding: 4px 2px;
  font-size: 0.72rem;
  line-height: 1.4;
  flex-shrink: 0;
}
.char-count-ok {
  color: var(--text-muted, #9b8fa0);
  font-weight: 500;
}
/* [2026-06-10 UX] 입력 전(0자) — 아직 잘못한 게 없으므로 경고색 대신 중립색 */
.char-count-neutral {
  color: var(--text-muted, #9b8fa0);
  font-weight: 500;
}
.char-count-warn {
  color: #c05621;
  font-weight: 700;
}
/* 카운터("0 / 200자")는 절대 단어 단위로 줄바꿈되지 않도록 고정 (이미지 1 fix) */
.char-count-ok,
.char-count-neutral,
.char-count-warn {
  flex-shrink: 0;
  white-space: nowrap;
}
.char-count-guide {
  color: #c05621;
  font-weight: 500;
  flex: 1 1 auto;
  min-width: 0;
}
.char-count-guide--neutral {
  color: var(--text-muted, #9b8fa0);
}

/* [2026-06] truncated 전사 경고 배너 — 잘린 회의록 저장 전 영속 가시화(C5). 브랜드 앰버 톤. */
.transcript-truncated-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 2px;
  padding: 8px 12px;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #8a4b1f;
  background: rgba(192, 86, 33, 0.08);
  border: 1px solid rgba(192, 86, 33, 0.28);
  border-radius: 8px;
}

/* [2026-06-26] 회의록 차감 안내 — 저장(신규/리비전) 시 '회의록 1건' 소비를 명확히.
   브랜드 브라운 틴트 + 잔여 pill, 남은 1건 이하 시 앰버로 강조. saving-progress-row 와 톤 통일. */
.meeting-cost-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 9px 14px;
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.06);
  border: 1px solid rgba(140, 98, 57, 0.18);
  font-family: 'Pretendard Variable', Pretendard, sans-serif;
  font-size: 0.74rem;
  line-height: 1.45;
}
.meeting-cost-hint__icon {
  color: var(--accent, #8C6239);
  opacity: 0.85;
}
.meeting-cost-hint__text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-muted, #6b7280);
  font-weight: 600;
  word-break: keep-all;
}
.meeting-cost-hint__remaining {
  flex-shrink: 0;
  padding: 3px 11px;
  border-radius: 9999px;
  background: rgba(140, 98, 57, 0.1);
  color: var(--accent, #8C6239);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* 남은 1건 이하 — 앰버 강조(다 써가는 신호) */
.meeting-cost-hint--low {
  background: rgba(192, 86, 33, 0.07);
  border-color: rgba(192, 86, 33, 0.28);
}
.meeting-cost-hint--low .meeting-cost-hint__icon,
.meeting-cost-hint--low .meeting-cost-hint__text {
  color: #8a4b1f;
  opacity: 1;
}
.meeting-cost-hint--low .meeting-cost-hint__remaining {
  background: rgba(192, 86, 33, 0.12);
  color: #8a4b1f;
}
@media (max-width: 600px) {
  .meeting-cost-hint { flex-wrap: wrap; gap: 6px; }
  .meeting-cost-hint__text { flex-basis: 100%; }
}
</style>
