<script setup>
/**
 * BatchPanel — 샘플/업로드 미팅 로그 순차(batch) 처리 패널.
 *
 * [2026-05-27 리팩토링] MeetingLogTab(1926줄)에서 batch 영역을 분리.
 * batch 는 "회의록 입력/조회"와 독립된 기능(샘플 N건 → CPS+PRD 순차 생성)이라 별도화.
 *
 * Props:
 *   batchState        — jobsStore.batchState { running, total, current, logs[], error, errorIndex, cancelled, cancelRequested }
 *   meetingLogs       — 기존 미팅 로그 (existingVersionSet — "이미 존재 · 덮어씀" 표시용)
 *   currentStageLabel — 현재 진행 단계 라벨 (running 시 chip 표시)
 *
 * Emits:
 *   batch       — (entries[]) 선택된 로그 순차 처리 시작
 *   retry-batch — 실패 지점부터 재시도
 *   reset-batch — 배치 상태 초기화
 *   stop-batch  — 진행 중 중지 요청
 *   close       — 패널 닫기 (부모가 showBatchPanel=false)
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, History, FileText, Loader2, X, Layers, CheckCircle2, XCircle } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import { useUploadsStore } from '@/store/uploads'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import { formatRelativeTime } from '@/utils/format'

const { t, locale } = useI18n()
const confirm = useConfirm()

import { parseLogEntries as splitMeetingLogs } from '@/utils/meetingSplit'
// [2026-06-24 다국어] 샘플 미팅 로그 본문도 로케일별로 분리 — UI locale 에 맞는 파일 로드.
// ko 는 원본(파일 제목 줄 포함), en/ja/zh 는 파일 제목 줄 제거(파서 firstLine 기준 호환).
import log1RawKo from '../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.txt?raw'
import log1RawEn from '../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.en.txt?raw'
import log1RawJa from '../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.ja.txt?raw'
import log1RawZh from '../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.zh.txt?raw'
import log2RawKo from '../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.txt?raw'
import log2RawEn from '../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.en.txt?raw'
import log2RawJa from '../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.ja.txt?raw'
import log2RawZh from '../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.zh.txt?raw'

const SAMPLE_RAWS = {
  'meeting-room': { ko: log1RawKo, en: log1RawEn, ja: log1RawJa, zh: log1RawZh },
  library: { ko: log2RawKo, en: log2RawEn, ja: log2RawJa, zh: log2RawZh },
}
// 현재 UI locale 에 맞는 샘플 본문 — 미지원 로케일은 영어로 폴백.
const rawForLocale = (id) => {
  const set = SAMPLE_RAWS[id] || {}
  return set[locale.value] || set.en || set.ko
}

const SAMPLE_DEFS = [
  // [2026-06-11] 무인 해양플랜트·생일 펀딩 샘플 제거 — 비전문가에게 도메인이 무거워
  // "이런 걸 넣어야 하나" 오해를 줬다. 누구나 아는 간단한 시스템(회의실 예약)으로 교체.
  // [2026-06-24] AI 계정관리 샘플 제거 — 동일 이유(누구나 아는 도서 대출로 교체).
  { id: 'meeting-room', labelKey: 'plan.batch.sample_meeting_room', rawFn: () => rawForLocale('meeting-room'), filename: '회의실_예약_시스템_미팅_로그.txt' },
  { id: 'library', labelKey: 'plan.batch.sample_library', rawFn: () => rawForLocale('library'), filename: '도서_대출_시스템_미팅_로그.txt' },
]
const SAMPLES = computed(() => SAMPLE_DEFS.map(s => ({ ...s, label: t(s.labelKey) })))

const props = defineProps({
  batchState: {
    type: Object,
    default: () => ({ running: false, total: 0, current: 0, logs: [], error: null }),
  },
  meetingLogs: {
    type: Array,
    default: () => [],
  },
  currentStageLabel: {
    type: String,
    default: null,
  },
})
const emit = defineEmits(['batch', 'retry-batch', 'reset-batch', 'stop-batch', 'close'])

// ─── 파싱 ─────────────────────────────────────────────────────
const parsedLogs = ref([])
const selectedSampleName = ref('')
const selectedSampleId = ref('')    // label 대신 id 로 활성 상태 추적 (locale 변경에 안정적)
const fileInputRef = ref(null)

// [2026-06 양식 자유화] 분할은 순수 유틸(테스트 됨)로 — `[미팅 로그` 하드 필터로 자유 양식
// 문서가 "0건 감지" 무음 탈락하던 구 파서 대체. 제목 없으면 여기서 기본 제목 채움.
// reserved: 프로젝트 기존 버전 — 무버전 문서의 자동 부여가 기존 미팅로그를 모르고
// 덮어쓰지 않도록 (max+1)부터. 문서에 명시된 버전은 의도적 덮어쓰기로 유지(태그 표시).
const parseLogEntries = (rawText) =>
  splitMeetingLogs(rawText, {
    reserved: (props.meetingLogs || []).map((l) => l?.version).filter(Boolean),
  }).map((e, i) => ({
    ...e,
    title: e.title ?? t('plan.batch.default_log_title', { n: i + 1 }),
  }))

// ─── 선택 (체크박스) ──────────────────────────────────────────
const selectedIndices = ref(new Set())
const initSelectAll = () => {
  selectedIndices.value = new Set(parsedLogs.value.map(l => l.index))
}
const toggleOne = (idx) => {
  const s = new Set(selectedIndices.value)
  if (s.has(idx)) s.delete(idx); else s.add(idx)
  selectedIndices.value = s
}
const isAllSelected = computed(() =>
  parsedLogs.value.length > 0 && selectedIndices.value.size === parsedLogs.value.length
)
const isNoneSelected = computed(() => selectedIndices.value.size === 0)
const toggleAll = () => {
  if (isAllSelected.value) selectedIndices.value = new Set()
  else initSelectAll()
}
const selectedCount = computed(() => selectedIndices.value.size)
const selectedEntries = computed(() =>
  parsedLogs.value
    .filter(l => selectedIndices.value.has(l.index))
    // autoVersion: 자동 부여 표시 — plan.vue 의 배치 pre-cleanup 이 자동 버전 충돌 시
    // 기존 미팅을 silent 삭제하지 않도록 (명시 버전만 의도적 교체로 삭제 허용).
    .map(l => ({ version: l.version, title: l.title, content: l.content, autoVersion: l.autoVersion === true }))
)

// 파싱된 entry 중 DB 에 이미 존재하는 version — "덮어씀" 안내용.
const existingVersionSet = computed(() => {
  const set = new Set()
  for (const l of (props.meetingLogs || [])) if (l?.version) set.add(l.version)
  return set
})

const selectSample = (sample) => {
  parsedLogs.value = parseLogEntries(sample.rawFn())
  selectedSampleName.value = sample.label
  selectedSampleId.value = sample.id
  initSelectAll()
}

// ─── 업로드 히스토리 (사용자별 영속) ──────────────────────────
const uploadsStore = useUploadsStore()
const { showSuccess: snackSuccess, showError: snackError } = useSnackbar()
const showUploadsPanel = ref(false)

const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    const content = e.target.result
    parsedLogs.value = parseLogEntries(content)
    selectedSampleName.value = file.name
    initSelectAll()
    // 백엔드 영속화 (best-effort)
    const result = await uploadsStore.addUpload({ filename: file.name, content })
    if (result.success) {
      snackSuccess(t('plan.batch.upload_saved', { name: file.name }))
    } else if (result.status === 422) {
      snackError(result.error || t('plan.batch.upload_save_fail'))
    }
  }
  reader.readAsText(file, 'utf-8')
  event.target.value = ''
}

const selectUpload = async (upload) => {
  const result = await uploadsStore.getUploadContent(upload.id)
  if (!result.success) {
    snackError(result.error || t('plan.batch.content_fetch_fail'))
    return
  }
  parsedLogs.value = parseLogEntries(result.content)
  selectedSampleName.value = upload.filename
  initSelectAll()
  showUploadsPanel.value = false
}

const removeUpload = async (upload, event) => {
  event.stopPropagation()
  const result = await uploadsStore.removeUpload(upload.id)
  if (result.success) {
    snackSuccess(t('plan.batch.upload_deleted', { name: upload.filename }))
  } else {
    snackError(result.error || t('plan.batch.delete_fail'))
  }
}

// [2026-06 공통화] 상대시간 표시는 utils/format.formatRelativeTime 로 통합(NotionPageList 와 공통).
const formatUploadDate = (ms) => formatRelativeTime(ms, { t, locale: locale.value, keyPrefix: 'plan.batch' })

const formatUploadSize = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// 마운트(= 패널 열림) 시 업로드 목록 1회 fetch (store 30초 캐시).
onMounted(() => {
  uploadsStore.fetchUploads()
})

// ─── 진행 상태 ────────────────────────────────────────────────
const startBatch = () => {
  if (!selectedEntries.value.length) return
  emit('batch', selectedEntries.value)
}

const batchDoneCount = computed(() =>
  props.batchState.logs.filter(l => l.status === 'done').length
)

const isBatchActive = computed(() =>
  props.batchState.running || props.batchState.total > 0
)

// ─── 경과/예상 시간 (FE-only — batchState 엔 시간 정보가 없어 여기서 추적) ──────
// running 시작 시점을 기록하고 매초 _now 갱신. 완료 항목 평균으로 남은 시간 추정.
const _startedAt = ref(0)
const _now = ref(0)
let _ticker = null
const _stopTicker = () => { if (_ticker) { clearInterval(_ticker); _ticker = null } }
const _startTicker = () => {
  _startedAt.value = Date.now()
  _now.value = Date.now()
  _stopTicker()
  _ticker = setInterval(() => { _now.value = Date.now() }, 1000)
}
watch(() => props.batchState.running, (running) => {
  if (running) _startTicker()
  else { _now.value = Date.now(); _stopTicker() }
}, { immediate: true })
onBeforeUnmount(_stopTicker)

const elapsedMs = computed(() => (_startedAt.value ? Math.max(0, _now.value - _startedAt.value) : 0))
const progressPct = computed(() => {
  const total = props.batchState.total
  return total ? Math.round((batchDoneCount.value / total) * 100) : 0
})
const _fmtClock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const elapsedText = computed(() => _fmtClock(elapsedMs.value))
// 남은 시간: 완료 1건 이상일 때 평균 기반 추정(분 단위, 최소 1분 — 초 단위 출렁임 완화).
const etaText = computed(() => {
  const total = props.batchState.total
  const done = batchDoneCount.value
  if (!total || done >= total) return ''
  if (!done || !_startedAt.value) return t('plan.batch.eta_calculating')
  const remainMs = (elapsedMs.value / done) * (total - done)
  return t('plan.batch.eta', { n: Math.max(1, Math.ceil(remainMs / 60000)) })
})

const failedSourceVersion = computed(() => {
  const i = props.batchState.errorIndex
  if (i == null) return ''
  const log = props.batchState.logs?.[i]
  return log?.sourceVersion || `V${i + 1}`
})

const requestStopBatch = async () => {
  if (!props.batchState?.running) return
  if (props.batchState.cancelRequested) return  // 이미 중지 요청됨 — 중복 방지
  // [2026-06 UX] window.confirm → 전역 ConfirmDialog (디자인 통일·모바일 UX)
  const ok = await confirm({ message: t('plan.batch.stop_confirm'), variant: 'danger' })
  if (ok) emit('stop-batch')
}

const hasBackgroundFinishing = computed(() => {
  if (!props.batchState?.cancelled) return false
  return (props.batchState.logs || []).some(l => l.status === 'running')
})

// 닫기 — 파싱 결과 비우고 부모에 close + 상태 초기화.
const onClose = () => {
  parsedLogs.value = []
  emit('reset-batch')
  emit('close')
}
</script>

<template>
  <div class="batch-panel bg-card border-light d-flex flex-column flex-grow-1">
    <!-- Header -->
    <div class="batch-panel-header d-flex align-center justify-space-between mb-6 flex-shrink-0">
      <div class="d-flex align-center batch-panel-title-row">
        <div class="pill-badge px-3 py-1 mr-3" style="background: var(--accent); color: white; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;">BATCH</div>
        <h4 class="batch-panel-title text-h5 font-black text-main tracking-tight serif-text">{{ $t('plan.batch.title') }}</h4>
      </div>
      <span v-if="batchState.running" class="d-inline-flex align-center">
        <button
          class="discard-btn discard-btn--danger"
          :disabled="batchState.cancelRequested"
          @click="requestStopBatch"
        >
          {{ batchState.cancelRequested ? $t('plan.batch.stopping') : $t('plan.batch.stop') }}
        </button>
        <GuideTooltip target="meeting-log-batch-stop" placement="bottom" />
      </span>
      <button v-else class="discard-btn batch-panel-close" @click="onClose" :aria-label="$t('plan.batch.close')">
        <X :size="14" class="batch-panel-close-icon" />
        <span class="batch-panel-close-label">{{ $t('plan.batch.close') }}</span>
      </button>
    </div>

    <!-- Setup: 배치 미실행 상태 -->
    <template v-if="!isBatchActive">
      <p class="text-caption text-muted batch-description mb-5" v-html="$t('plan.batch.description_html')">
      </p>

      <!-- 샘플 선택 -->
      <div class="batch-section-label mb-2">{{ $t('plan.batch.sample_select_label') }}</div>
      <div class="sample-btn-row mb-2">
        <button
          v-for="s in SAMPLES" :key="s.id"
          class="sample-btn"
          :class="{ 'sample-btn--active': selectedSampleId === s.id }"
          @click="selectSample(s)"
        >{{ s.label }}</button>
        <button class="sample-btn" @click="fileInputRef.click()">
          <Download :size="12" class="mr-1" />{{ $t('plan.batch.upload_btn') }}
        </button>
        <input ref="fileInputRef" type="file" accept=".txt" style="display: none" @change="handleFileUpload" />
        <button
          v-if="!uploadsStore.isEmpty"
          class="sample-btn sample-btn--history"
          :class="{ 'sample-btn--active': showUploadsPanel }"
          @click="showUploadsPanel = !showUploadsPanel"
        >
          <History :size="12" class="mr-1" />
          {{ $t('plan.batch.my_uploads', { count: uploadsStore.uploads.length }) }}
        </button>
      </div>

      <!-- 내 업로드 히스토리 패널 -->
      <div v-if="showUploadsPanel && !uploadsStore.isEmpty" class="upload-history-panel mb-4">
        <div class="upload-history-list">
          <div
            v-for="upload in uploadsStore.uploads"
            :key="upload.id"
            class="upload-history-item"
            role="button"
            tabindex="0"
            :title="`${upload.filename} (${formatUploadSize(upload.size)})`"
            @click="selectUpload(upload)"
            @keydown.enter="selectUpload(upload)"
          >
            <div class="upload-history-info">
              <FileText :size="12" class="upload-history-icon" />
              <span class="upload-history-filename">{{ upload.filename }}</span>
            </div>
            <div class="upload-history-meta">
              <span class="upload-history-size">{{ formatUploadSize(upload.size) }}</span>
              <span class="upload-history-date">{{ formatUploadDate(upload.uploaded_at) }}</span>
              <button
                class="upload-history-delete"
                :aria-label="$t('plan.batch.delete_aria')"
                @click="removeUpload(upload, $event)"
              >
                <X :size="11" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="showUploadsPanel && uploadsStore.isFetching" class="text-caption text-muted text-center pa-3">
        <Loader2 :size="14" class="rotate-anim mr-1" style="vertical-align:middle" />
        {{ $t('plan.batch.loading') }}
      </div>
      <div class="mb-2"></div>

      <!-- 파싱 결과 -->
      <div v-if="parsedLogs.length > 0" class="batch-preview mb-6">
        <div class="batch-preview-head">
          <!-- [2026-06] 헤더: '이름 — N 감지 · M 선택' 한 줄이 모바일·다국어에서 밀려
               줄바꿈됐다. 대시(—) 제거 후 이름/카운트를 명시적 2줄로 분리. -->
          <span class="batch-section-label batch-preview-label">
            <span class="batch-preview-label__name">{{ selectedSampleName }}</span>
            <span class="batch-preview-label__count">{{ $t('plan.batch.detected_selected', { detected: parsedLogs.length, selected: selectedCount }) }}</span>
          </span>
          <button class="sample-btn batch-toggle-btn" @click="toggleAll">
            {{ isAllSelected ? $t('plan.batch.deselect_all') : $t('plan.batch.select_all') }}
          </button>
        </div>
        <div class="batch-log-list custom-scroll">
          <label
            v-for="log in parsedLogs" :key="log.index"
            class="batch-log-item batch-log-item--selectable"
            :class="{ 'batch-log-item--unselected': !selectedIndices.has(log.index) }"
            style="cursor: pointer"
          >
            <input
              type="checkbox"
              :checked="selectedIndices.has(log.index)"
              class="batch-log-checkbox"
              @change="toggleOne(log.index)"
            />
            <span class="batch-log-ver mono-text">{{ log.version }}</span>
            <span class="batch-log-title">{{ log.title }}</span>
            <span
              v-if="existingVersionSet.has(log.version)"
              class="batch-log-exists-tag"
              :title="$t('plan.batch.exists_tag_title')"
            >{{ $t('plan.batch.exists_tag') }}</span>
          </label>
        </div>
      </div>

      <!-- 시작 버튼 -->
      <div class="batch-footer d-flex align-center gap-3 flex-shrink-0 mt-auto">
        <button class="archive-btn" :disabled="isNoneSelected" @click="startBatch">
          <Layers :size="14" class="mr-2" />
          {{ $t('plan.batch.start_btn', { count: selectedCount }) }}
        </button>
        <span v-if="!parsedLogs.length" class="text-caption text-muted batch-footer__hint">{{ $t('plan.batch.hint_select_file') }}</span>
        <span v-else-if="isNoneSelected" class="text-caption text-muted batch-footer__hint">{{ $t('plan.batch.hint_select_log') }}</span>
      </div>
    </template>

    <!-- Progress: 배치 실행 중 / 완료 -->
    <template v-else>
      <div class="batch-progress-head flex-shrink-0">
        <!-- 1행: 상태 아이콘 + 텍스트 + (데스크탑) % -->
        <div class="batch-progress-head__main">
          <Loader2 v-if="batchState.running" :size="16" class="rotate-anim text-accent batch-progress-head__icon" />
          <XCircle v-else-if="batchState.error" :size="16" style="color: #ef4444" class="batch-progress-head__icon" />
          <XCircle v-else-if="batchState.cancelled" :size="16" style="color: var(--text-muted, #94a3b8)" class="batch-progress-head__icon" />
          <CheckCircle2 v-else :size="16" style="color: var(--primary-moss)" class="batch-progress-head__icon" />
          <span class="batch-progress-head__label">
            <template v-if="batchState.running">
              {{ $t('plan.batch.progress_running', { current: batchState.current, total: batchState.total }) }}
            </template>
            <template v-else-if="batchState.error">
              {{ $t('plan.batch.progress_error', { err: batchState.error }) }}
            </template>
            <template v-else-if="batchState.cancelled">
              <template v-if="hasBackgroundFinishing">
                {{ $t('plan.batch.progress_cancelled_bg') }}
              </template>
              <template v-else>
                {{ $t('plan.batch.progress_cancelled', { done: batchDoneCount }) }}
              </template>
            </template>
            <template v-else>
              {{ $t('plan.batch.progress_done', { done: batchDoneCount }) }}
            </template>
          </span>
        </div>
        <!-- 2행: 현재 단계 칩 (실행 중에만, 자체 행이라 줄바꿈 자유) -->
        <div v-if="batchState.running && currentStageLabel" class="batch-progress-head__stage">
          <span class="batch-stage-chip">{{ currentStageLabel }}</span>
        </div>
      </div>

      <!-- 진행 바 -->
      <div class="batch-progress-bar mb-2 flex-shrink-0">
        <div
          class="batch-progress-fill"
          :style="{ width: progressPct + '%' }"
          :class="{ 'batch-progress-fill--error': batchState.error }"
        ></div>
      </div>

      <!-- 진행 메타: 진행률 % · 경과 · 예상 남은 시간 (끝나는 시점 가늠용) -->
      <div v-if="batchState.running" class="batch-progress-meta mb-5 flex-shrink-0">
        <strong class="batch-progress-pct">{{ progressPct }}%</strong>
        <span class="batch-progress-dot">·</span>
        <span>{{ $t('plan.batch.elapsed', { time: elapsedText }) }}</span>
        <span class="batch-progress-dot">·</span>
        <span class="batch-progress-eta">{{ etaText || $t('plan.batch.eta_calculating') }}</span>
      </div>
      <div
        v-else-if="!batchState.error && !batchState.cancelled && batchDoneCount > 0 && elapsedMs > 0"
        class="batch-progress-meta mb-5 flex-shrink-0"
      >
        <strong class="batch-progress-pct">{{ progressPct }}%</strong>
        <span class="batch-progress-dot">·</span>
        <span>{{ $t('plan.batch.total_elapsed', { time: elapsedText }) }}</span>
      </div>

      <!-- 로그별 상태 -->
      <div class="batch-log-list batch-log-list--progress custom-scroll flex-grow-1">
        <div
          v-for="(log, i) in batchState.logs"
          :key="i"
          class="batch-log-item"
          :class="{
            'batch-log-item--done': log.status === 'done',
            'batch-log-item--running': log.status === 'running',
            'batch-log-item--error': log.status === 'error',
            'batch-log-item--cancelled': log.status === 'cancelled',
          }"
        >
          <CheckCircle2 v-if="log.status === 'done'" :size="13" style="color: var(--primary-moss); flex-shrink: 0" />
          <Loader2 v-else-if="log.status === 'running'" :size="13" class="rotate-anim text-accent flex-shrink-0" />
          <XCircle v-else-if="log.status === 'error'" :size="13" style="color: #ef4444; flex-shrink: 0" />
          <XCircle v-else-if="log.status === 'cancelled'" :size="13" style="color: var(--text-muted, #94a3b8); flex-shrink: 0; opacity: 0.6" />
          <span v-else class="batch-log-dot flex-shrink-0"></span>
          <span class="batch-log-ver mono-text">{{ log.sourceVersion || `V${i + 1}` }}</span>
          <span v-if="log.title" class="batch-log-title">{{ log.title }}</span>
          <span
            class="batch-log-status-text"
            :class="{
              'batch-log-status-text--done': log.status === 'done',
              'batch-log-status-text--running': log.status === 'running',
              'batch-log-status-text--error': log.status === 'error',
            }"
          >
            {{
              log.status === 'done' ? $t('plan.batch.status_done')
              : log.status === 'running'
                ? (batchState.cancelled ? $t('plan.batch.status_bg_finishing') : $t('plan.batch.status_running'))
              : log.status === 'error' ? $t('plan.batch.status_error')
              : log.status === 'cancelled' ? $t('plan.batch.status_cancelled')
              : $t('plan.batch.status_queued')
            }}
          </span>
          <span
            v-if="log.status === 'done' && log.extractionMode === 'lenient'"
            class="extract-badge extract-badge--lenient"
            :title="$t('plan.batch.badge_lenient_title')"
          >
            {{ $t('plan.batch.badge_lenient') }}
          </span>
          <span
            v-else-if="log.status === 'done' && log.extractionMode === 'skip'"
            class="extract-badge extract-badge--skip"
            :title="$t('plan.batch.badge_skip_title')"
          >
            {{ $t('plan.batch.badge_skip') }}
          </span>
        </div>
      </div>

      <!-- 완료 후 액션 -->
      <div v-if="!batchState.running" class="d-flex justify-end align-center mt-5 flex-shrink-0" style="gap: 12px">
        <template v-if="batchState.error && batchState.errorIndex != null">
          <span class="text-caption text-muted" style="font-family: 'Pretendard Variable', sans-serif">
            {{ $t('plan.batch.retry_hint', { version: failedSourceVersion }) }}
          </span>
          <button class="discard-btn" @click="onClose">{{ $t('plan.batch.cancel') }}</button>
          <button class="archive-btn" @click="emit('retry-batch')">
            <Loader2 :size="14" class="mr-2" />
            {{ $t('plan.batch.retry_btn', { version: failedSourceVersion }) }}
          </button>
        </template>
        <button v-else class="archive-btn" @click="onClose">{{ $t('plan.batch.confirm_done') }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.batch-panel {
  border-radius: 16px;
  min-width: 0;
  height: 100%;
  padding: 32px 36px;
  overflow: hidden;
}

@media (max-width: 900px) {
  .batch-panel { padding: 24px 24px; }
}

@media (max-width: 600px) {
  /* 모바일: 고정 높이 해제 + overflow 허용 → 페이지 스크롤 전환. */
  .batch-panel {
    padding: 18px 16px;
    border-radius: 12px;
    height: auto !important;
    overflow: visible !important;
    flex-grow: 0 !important;
  }
  .batch-log-list {
    max-height: 40vh !important;
    overflow-y: auto !important;
    flex: 0 0 auto !important;
  }
  .batch-footer {
    /* [2026-05-30] 모바일에선 sticky 해제 — bottom:0 sticky 가 스크롤 중
       샘플 칩/미리보기 행 위로 겹쳐 하단이 잘려 보이던 문제. 페이지 흐름상
       자연스럽게 마지막에 배치. (배치 로그 리스트는 자체 inner-scroll 보유.) */
    position: static !important;
    z-index: auto;
    background: var(--bg-card, #fff);
    padding: 14px 0 4px !important;
    margin-top: 14px !important;
    border-top: 1px solid var(--border-light);
  }
}

@media (max-width: 600px) {
  .batch-panel-header {
    flex-wrap: nowrap;
    gap: 8px;
    margin-bottom: 16px !important;
  }
  .batch-panel-title-row { min-width: 0; flex: 1; }
  .batch-panel-header .pill-badge {
    padding: 3px 7px !important;
    font-size: 0.5rem !important;
    margin-right: 8px !important;
  }
  .batch-panel-title {
    font-size: 0.92rem !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .batch-panel-header .discard-btn {
    flex-shrink: 0;
    padding: 5px 10px;
    font-size: 0.68rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}
/* 닫기 아이콘은 데스크탑 숨김 / 모바일만 표시 */
.batch-panel-close-icon { display: none; }
@media (max-width: 600px) {
  .batch-panel-close-icon { display: inline-flex; }
}

.batch-section-label {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

/* ── 파싱 결과 헤더 (이름/카운트 2줄 + 전체선택 토글) ── */
.batch-preview-head {
  display: flex;
  align-items: flex-start;       /* 라벨이 2줄이어도 토글은 상단 정렬 유지 */
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.batch-preview-label {
  display: flex;
  flex-direction: column;        /* 이름 줄 / 카운트 줄 분리 (대시 제거) */
  gap: 2px;
  min-width: 0;                  /* 긴 이름이 토글을 밀어내지 않도록 */
  flex: 1 1 auto;
}
.batch-preview-label__name {
  color: var(--text-main);
  word-break: break-word;        /* 다국어 긴 이름도 줄바꿈 (오버플로 방지) */
  line-height: 1.35;
}
.batch-preview-label__count {
  font-weight: 700;
  opacity: 0.7;
  line-height: 1.35;
}
.batch-toggle-btn {
  flex: 0 0 auto;                /* 토글은 줄지 않음 — 라벨이 먼저 줄바꿈 */
  padding: 5px 12px;
  font-size: 0.7rem;
}

/* ── 진행 상태 헤더 ── */
.batch-progress-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}
.batch-progress-head__main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.batch-progress-head__icon { flex-shrink: 0; }
.batch-progress-head__label {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--text-main);
  min-width: 0;
  flex: 1;
}
.batch-progress-head__stage {
  /* 단계 칩 전용 행 — 줄바꿈 걱정 없이 전체 폭 사용 */
  padding-left: 26px;
}

.batch-stage-chip {
  display: inline-block;
  padding: 3px 11px;
  border-radius: 9999px;
  background: rgba(140, 98, 57, 0.1);
  color: var(--accent, #8C6239);
  font-family: 'Outfit', sans-serif;
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  line-height: 1.4;
  word-break: keep-all;
}

.batch-description {
  line-height: 1.8;
  font-family: 'Pretendard Variable', sans-serif;
}
@media (max-width: 600px) {
  .batch-description {
    line-height: 1.55;
    font-size: 0.78rem;
  }
}

.sample-btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 600px) {
  .sample-btn-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .sample-btn-row .sample-btn {
    width: 100%;
    justify-content: center;
    text-align: center;
    padding: 9px 10px;
  }
  .sample-btn { padding: 6px 12px; font-size: 0.68rem; }
}

.sample-btn {
  display: inline-flex;
  align-items: center;
  /* [2026-06] 줄바꿈된 버튼 텍스트를 가운데 정렬 (좌측 정렬 시 2줄째가 비뚤어 보임). */
  justify-content: center;
  padding: 7px 16px;
  border-radius: 9999px;
  border: 1.5px solid var(--border-light);
  background: white;
  color: var(--text-main);
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  flex: 0 1 auto;
  white-space: normal;
  text-align: center;
  line-height: 1.3;
  max-width: 100%;
}
.sample-btn:hover { border-color: var(--accent); color: var(--accent); }
.sample-btn--active { background: var(--accent) !important; border-color: var(--accent) !important; color: white !important; }
.sample-btn--history {
  border-color: rgba(46, 64, 54, 0.3);
  color: var(--primary-moss);
}
.sample-btn--history:hover {
  border-color: var(--primary-moss);
  color: var(--primary-moss);
  background: rgba(46, 64, 54, 0.06);
}
.sample-btn--history.sample-btn--active {
  background: var(--primary-moss) !important;
  border-color: var(--primary-moss) !important;
  color: white !important;
}

/* ── Upload history panel ── */
.upload-history-panel {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-page);
  overflow: hidden;
}
.upload-history-list {
  max-height: 220px;
  overflow-y: auto;
}
.upload-history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 0.15s;
  gap: 12px;
}
.upload-history-item:last-child { border-bottom: none; }
.upload-history-item:hover { background: rgba(46, 64, 54, 0.05); }
.upload-history-item:focus-visible {
  outline: 2px solid var(--primary-moss);
  outline-offset: -2px;
  background: rgba(46, 64, 54, 0.05);
}
.upload-history-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.upload-history-icon { color: var(--text-muted); flex-shrink: 0; }
.upload-history-filename {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.upload-history-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.upload-history-size,
.upload-history-date {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--text-muted);
}
.upload-history-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.upload-history-delete:hover { background: #fdecea; color: #c62828; border-color: #ef9a9a; }

.batch-preview {
  background: #fafbfc;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  padding: 4px;
}

.batch-log-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
}
.batch-log-list::-webkit-scrollbar { width: 3px; }
.batch-log-list::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

.batch-log-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  transition: background 0.12s;
}
.batch-log-item:hover { background: rgba(0,0,0,0.03); }
.batch-log-item--running { background: rgba(140,98,57,0.06); }
.batch-log-item--done { opacity: 0.55; }
.batch-log-item--error { background: rgba(239,68,68,0.06); }
.batch-log-item--cancelled { opacity: 0.45; }
.batch-log-item--selectable { user-select: none; }
.batch-log-item--unselected { opacity: 0.4; }
.batch-log-item--unselected:hover { opacity: 0.7; }
.batch-log-checkbox {
  width: 14px; height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

.batch-log-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--border-light); flex-shrink: 0;
}

.batch-log-ver {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.68rem; font-weight: 700;
  color: var(--accent); min-width: 34px; flex-shrink: 0;
}

.batch-log-title {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.76rem; font-weight: 600;
  color: var(--text-main);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1 1 auto; min-width: 0;
}

.batch-log-status-text {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.62rem; color: var(--text-muted);
  margin-left: auto; flex-shrink: 0;
}
.batch-log-status-text--done { color: var(--primary-moss); font-weight: 700; }
.batch-log-status-text--running { color: var(--accent); font-weight: 700; }
.batch-log-status-text--error { color: #ef4444; font-weight: 700; }

.extract-badge {
  flex-shrink: 0;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 0.6rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
}
.extract-badge--lenient {
  background: #FEF3C7;
  color: #92400E;
  border: 1px solid #FBBF24;
}
.extract-badge--skip {
  background: #F3F4F6;
  color: #6B7280;
  border: 1px solid #D1D5DB;
}

.batch-log-exists-tag {
  margin-left: auto; flex-shrink: 0;
  /* [2026-06] 다국어 긴 라벨('Already exists · overwrite' 등)이 행을 밀어 제목을
     0폭으로 짓누르지 않도록 폭 상한 + 말줄임 (전체 문구는 title 툴팁으로 제공). */
  max-width: 60%;
  overflow: hidden; text-overflow: ellipsis;
  padding: 2px 8px; border-radius: 9999px;
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.6rem; font-weight: 700; letter-spacing: 0.02em;
  white-space: nowrap;
}

.batch-progress-bar {
  height: 6px; background: var(--border-light);
  border-radius: 9999px; overflow: hidden;
}
.batch-progress-fill {
  height: 100%; background: var(--primary-moss);
  border-radius: 9999px; transition: width 0.5s ease;
}
.batch-progress-fill--error { background: #ef4444; }

/* 진행 메타 행 (#221) — 진행률 % · 경과 · 예상 남은 시간. */
.batch-progress-meta {
  display: flex; align-items: center; flex-wrap: wrap; gap: 7px;
  font-size: 0.74rem; color: var(--text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}
.batch-progress-pct { color: var(--accent, #8C6239); font-weight: 800; font-size: 0.82rem; }
.batch-progress-dot { opacity: 0.4; }
.batch-progress-eta { color: var(--text-main); font-weight: 600; }

/* ── 모바일 진행 뷰 최적화 ── */
@media (max-width: 600px) {
  .batch-progress-head { gap: 6px; margin-bottom: 12px; }
  .batch-progress-head__main { gap: 8px; }
  .batch-progress-head__label {
    font-size: 0.74rem;
    /* 긴 라벨(오류 메시지 등)이 밀려나지 않도록 줄임표 처리 */
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .batch-progress-head__stage { padding-left: 24px; }
  .batch-stage-chip {
    display: block;
    width: fit-content;
    max-width: 100%;
    font-size: 0.68rem;
    white-space: normal;
  }
  /* 메타 행 — 모바일에서도 한눈에 (% 강조 유지) */
  .batch-progress-meta { font-size: 0.72rem; gap: 6px; }
  /* 진행 바 — 모바일에서 더 두껍게 (시각 확인 쉽게) */
  .batch-progress-bar { height: 8px; }
  /* 항목 행 — 터치 타깃 확대 + 행 구분선 (진행 리스트에만) */
  .batch-log-list--progress .batch-log-item {
    padding: 11px 8px;
    gap: 8px;
    border-bottom: 1px solid var(--border-light);
    border-radius: 0;
  }
  .batch-log-list--progress .batch-log-item:last-child { border-bottom: none; }
  .batch-log-ver { font-size: 0.72rem; min-width: 30px; }
  .batch-log-title { font-size: 0.78rem; }
  .batch-log-status-text { font-size: 0.64rem; }
  /* 진행 리스트는 카드 톤으로 감싸 가독성 향상 */
  .batch-log-list--progress {
    background: var(--bg-page, #fafbfc);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 2px 8px;
  }
}

.batch-footer__hint {
  font-family: 'Pretendard Variable', sans-serif;
}
@media (max-width: 600px) {
  .batch-footer {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }
  .batch-footer .archive-btn {
    padding: 10px 18px;
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    width: 100%;
    justify-content: center;
  }
  .batch-footer__hint {
    text-align: center;
    font-size: 0.7rem;
  }
}

/* ── 공유 버튼 (MeetingLogTab 와 동일 — 컴포넌트 독립성 위해 복제) ── */
.pill-badge {
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
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
.discard-btn:hover { background: var(--bg-light); color: var(--text-main); }
.discard-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.discard-btn--danger { color: #ef4444; }
.discard-btn--danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.08); color: #dc2626; }
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
.archive-btn:hover { opacity: 0.85; transform: translateY(-1px); }
.archive-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* spin/rotate-anim 회전은 전역(App.vue)으로 통합됨 */
</style>
