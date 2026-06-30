<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2 } from 'lucide-vue-next'
import { useHarnessStore } from '@/store/harness'
import BatchPanel from '@/components/plan/BatchPanel.vue'
import HistorySidebar from '@/components/plan/HistorySidebar.vue'
import MeetingLogEditor from '@/components/plan/MeetingLogEditor.vue'
import { loadMeetingDraft, saveMeetingDraft, clearMeetingDraft, hasMeetingDraft } from '@/utils/meetingDraft'

const { t } = useI18n()
const store = useHarnessStore()

const props = defineProps({
  meetingLogs: {
    type: Array,
    default: () => [],
  },
  selectedLog: {
    type: String,
    required: true,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  projectName: {
    type: String,
    default: 'harness',
  },
  nextVersion: {
    type: String,
    default: 'v1.1',
  },
  batchState: {
    type: Object,
    default: () => ({ running: false, total: 0, current: 0, logs: [], error: null }),
  },
  // [C — 2026-05] 진행 단계 — 'cps_running' / 'prd_running' / 'done' / 'queued' / null
  currentJobStage: {
    type: String,
    default: null,
  },
  // 저장 API 진행 중 여부 — isLoading 은 fetch 와 혼용되므로 저장 전용 플래그로 구분
  isSaving: {
    type: Boolean,
    default: false,
  },
  // [2026-05] 신규 사용자 샘플 체험 — /plan?sample=1 진입 시 부모(plan.vue)가 샘플
  // 회의록 텍스트를 내려준다. 빈 프로젝트의 에디터에 미리 채워 "복사·붙여넣기" 없이
  // 바로 저장만 누르면 첫 결과물을 볼 수 있게 한다.
  presetDraft: {
    type: String,
    default: '',
  },
  // [2026-06 멀티디바이스] 다른 기기/탭에서 이 프로젝트를 처리 중 (plan.vue 가
  // getProjectBusy 폴링). true 면 배너 표시 + 처리 시작 버튼 비활성 — BE enqueue
  // 의 409 PROJECT_BUSY 를 누르기 전에 미리 안내.
  remoteBusy: {
    type: Boolean,
    default: false,
  },
  // [2026-06-10 lost-update UX 가드] PRD 'AI로 보완하기'가 진행/승인대기 중.
  // 그 사이 회의록을 처리하면 PRD 가 바뀌어 보완 diff 적용이 충돌(409)로 취소되므로,
  // 같은 게이트로 사전 안내. (데이터 자체는 PATCH optimistic lock 이 지킨다.)
  autofixBusy: {
    type: Boolean,
    default: false,
  },
})

// [2026-05-26 perf C] BE 가 sub-stage 도 기록 — FE 가 더 세밀히 표시.
const currentStageLabel = computed(() => {
  const stage = props.currentJobStage
  if (!stage) return null
  const key = `plan.stage.${stage}`
  const label = t(key)
  return label === key ? null : label
})

const emit = defineEmits(['update:selectedLog', 'save', 'search', 'delete', 'batch', 'retry-batch', 'reset-batch', 'stop-batch', 'open-notion', 'fetch-detail'])

// 배치 처리 중에는 신규 로그 생성 / Notion 가져오기를 막아 동시 진입을 방지.
const isBatchRunning = computed(() => !!props.batchState?.running)

// [2026-05-27 리팩토링] batch 활성 여부 — MeetingLogTab 은 batch panel vs editor
// 분기(v-if)에만 사용. 상세 batch UI/로직은 BatchPanel.vue 로 분리됨.
const isBatchActive = computed(
  () => !!props.batchState?.running || (props.batchState?.total || 0) > 0,
)

const currentLog = computed(() => {
  if (!Array.isArray(props.meetingLogs)) return null
  return props.meetingLogs.find(l => l.version === props.selectedLog)
})
// editContent / isNewLogMode 는 부모가 소유 — MeetingLogEditor 에 v-model 로 전달.
// batch 패널 전환 시 에디터가 unmount 돼도 입력 내용/모드가 유지되도록 여기 보관.
const editContent = ref('')
const isNewLogMode = ref(false)

// [2026-06-22] 신규 작성 초안 보존 키 — localStorage 초안은 프로젝트별로 보관.
const draftProject = computed(() => props.projectName || store.projectName || 'harness')

// [2026-05-27] batch 또는 single job (onboard/postMeeting) 진행 중 — History 헤더의
// 작업 시작 버튼들(Notion 가져오기 / 배치 / 새 로그)을 일괄 비활성화. 진행 중 새 작업
// 진입 시 동시 처리 충돌 + 사용자 혼란 방지.
const isAnyProcessing = computed(
  // [2026-06] remoteBusy: 다른 기기/탭의 작업도 동시 진입 차단 대상.
  // [2026-06-10] autofixBusy: PRD 보완 진행/승인대기 중 — 처리 시 보완 diff 무효화.
  () => isBatchRunning.value || !!props.currentJobStage || props.remoteBusy || props.autofixBusy,
)

// [버그픽스 2026-05-21] 이전엔 currentLog reference 만 watch 했음 → 같은 객체의
// meeting_content 가 async 로 채워질 때 editContent 가 stale 유지되는 문제.
// version + content 둘 다 트래킹 → 비동기 fetch 완료 시 viewer / textarea 동기화.
watch(
  () => ({ ver: currentLog.value?.version, content: currentLog.value?.meeting_content }),
  ({ ver, content }) => {
    if (ver) {
      editContent.value = content || ''
      isNewLogMode.value = false
    }
  },
  { immediate: true }
)

// Automatically enter new log mode if no logs exist
watch(
  () => props.meetingLogs,
  newLogs => {
    if (!props.isLoading && Array.isArray(newLogs) && newLogs.length === 0) {
      isNewLogMode.value = true
      // 샘플 프리셋이 내려와 있으면 비우지 않는다 (순서 무관하게 프리셋 보존).
      if (props.presetDraft && props.presetDraft.trim()) return
      // [2026-06-22] 저장 안 한 신규 작성 초안이 있으면 복원, 없으면 비운다.
      editContent.value = hasMeetingDraft(draftProject.value)
        ? loadMeetingDraft(draftProject.value)
        : ''
      emit('update:selectedLog', '')
    }
  },
  { immediate: true }
)

// [2026-06-22] 저장하지 않은 신규 작성 초안 복원.
// 기존 로그가 있는 프로젝트에서도 (예: v1.0 존재 + v1.1 작성 중) /profile 등으로
// 이동했다 돌아오면 작성 내용이 사라지던 문제 — plan.vue 가 초안이 있으면 최신 로그
// 자동 선택을 건너뛰므로(selectedLog=''), 여기서 신규 작성 모드로 되살린다.
const restoreDraftIfAny = () => {
  if (props.isLoading) return
  if (props.selectedLog) return                              // 기존 로그 조회 중이면 손대지 않음
  if (isNewLogMode.value && editContent.value.trim()) return // 이미 작성 중
  const draft = loadMeetingDraft(draftProject.value)
  if (draft && draft.trim()) {
    editContent.value = draft
    isNewLogMode.value = true
  }
}
// deps 에 selectedLog 는 넣지 않는다 — 복원 트리거는 mount/프로젝트 전환/로딩 완료면 충분.
// (startNewLog 가 selectedLog 를 '' 로 바꾸는 순간 디바운스 clear 와 겹쳐 갓 비운 초안이
//  되살아나는 엣지를 원천 차단.)
watch(
  () => [props.projectName, props.isLoading],
  restoreDraftIfAny,
  { immediate: true },
)
onMounted(restoreDraftIfAny)

// 이미 제출(enqueue)돼 분석 처리 중인 내용은 로컬 초안으로 보존하지 않는다 —
// BE 로 커밋된 내용이라, 보존하면 처리 중 페이지 이동 후 '미저장 초안'으로 부활한다.
const isCommittedOrProcessing = computed(() => !!props.currentJobStage || props.isSaving)

// 신규 작성 모드에서 입력 내용을 디바운스 저장 — 매 입력마다 쓰지 않도록 400ms.
let _draftSaveTimer = null
watch([editContent, isNewLogMode], ([content, newMode]) => {
  if (!newMode) return  // 신규 작성 모드일 때만 보존 (기존 로그 조회 내용은 저장 안 함)
  if (isCommittedOrProcessing.value) return  // 제출/처리 중이면 보존 안 함
  // 손대지 않은 샘플 프리셋은 사용자 작성물이 아니므로 초안으로 보존하지 않음.
  if (props.presetDraft && props.presetDraft.trim() && content === props.presetDraft) return
  if (_draftSaveTimer) clearTimeout(_draftSaveTimer)
  // 프로젝트 키를 스케줄 시점에 고정 — 저장 직전 프로젝트가 바뀌어도 엉뚱한 프로젝트에 저장 안 되게.
  const proj = draftProject.value
  _draftSaveTimer = setTimeout(() => {
    saveMeetingDraft(proj, content)  // 빈 내용이면 util 이 알아서 제거
  }, 400)
})

// 신규 작성 모드 종료(저장 성공/작성 취소 등) 시 초안 제거 — 다음 진입에 되살아나지 않게.
watch(isNewLogMode, (now, prev) => {
  if (prev && !now) {
    if (_draftSaveTimer) { clearTimeout(_draftSaveTimer); _draftSaveTimer = null }
    clearMeetingDraft(draftProject.value)
  }
})

// unmount(라우트 이동 등) 직전 — 디바운스 타이머가 못 돌고 사라지지 않도록 즉시 flush.
// AI 인터뷰 직후처럼 곧바로 페이지를 떠나도 작성 내용을 잃지 않는다.
onUnmounted(() => {
  if (_draftSaveTimer) { clearTimeout(_draftSaveTimer); _draftSaveTimer = null }
  if (isNewLogMode.value && editContent.value.trim() && !isCommittedOrProcessing.value) {
    saveMeetingDraft(draftProject.value, editContent.value)
  }
})

// [2026-05] 샘플 프리셋 — 빈 프로젝트일 때만 에디터에 미리 채운다. 기존 로그가
// 있는 프로젝트는 건드리지 않아 사용자가 작성 중인 내용을 덮어쓸 위험이 없다.
watch(
  () => props.presetDraft,
  draft => {
    if (draft && draft.trim() && (props.meetingLogs || []).length === 0) {
      isNewLogMode.value = true
      editContent.value = draft
    }
  },
  { immediate: true }
)

const selectLog = version => {
  // 배치 패널이 떠 있으면 에디터가 숨겨져 있어 선택만으로는 내용이 보이지 않음
  // → 자동으로 미리보기 다이얼로그를 열어 사용자가 원본을 바로 확인할 수 있게 함.
  if (showBatchPanel.value || isBatchActive.value) {
    openPreview(version)
    return
  }
  emit('update:selectedLog', version)
  isNewLogMode.value = false
}

const startNewLog = () => {
  if (store.projectName && store.projectName.trim()) {
    emit('search', store.projectName.trim(), false)
  }
  editContent.value = ''
  isNewLogMode.value = true
  emit('update:selectedLog', '')
}

// ─── Batch ────────────────────────────────────────────────────
// [2026-05-27 리팩토링] batch UI/로직(샘플 파싱·선택·업로드 히스토리·진행 표시)은
// BatchPanel.vue 로 분리됨. MeetingLogTab 은 패널 토글 상태만 보유 —
// History 버튼이 토글, BatchPanel 의 @close 가 닫음. emit('batch'/...) 는
// BatchPanel 이벤트를 부모(plan.vue)로 그대로 중계.
const showBatchPanel = ref(false)

// ─── 원본 미팅 로그 미리보기 ───────────────────────────────────
const previewVersion = ref(null)
const showPreviewDialog = ref(false)
const previewLog = computed(() => props.meetingLogs.find(l => l.version === previewVersion.value) || null)
const previewContent = computed(() => previewLog.value?.meeting_content || '')

function openPreview(version) {
  previewVersion.value = version
  showPreviewDialog.value = true
  // [버그픽스 2026-06-06] 미리보기는 '보기'일 뿐 — 작업 중인 버전(selectedLog)을 바꾸면 안 됨.
  // 이전엔 content 가 없을 때 emit('update:selectedLog')로 불러왔는데, 그 부수효과로
  // 미리보기를 누르면 그 버전으로 '전환'돼버렸다. 이제 selectedLog 를 건드리지 않는
  // 전용 fetch-detail 이벤트로 해당 버전 content 만 불러온다(plan.vue fetchLogDetail).
  if (!props.meetingLogs.find(l => l.version === version)?.meeting_content) {
    emit('fetch-detail', version)
  }
}
</script>

<template>
  <div class="meeting-log-root d-flex w-100 h-100 pt-4 pb-4" style="position: relative">
    <!-- [2026-06 멀티디바이스] 다른 기기/탭에서 처리 중 — 사전 안내 배너 -->
    <div v-if="remoteBusy" class="remote-busy-banner" role="status">
      <Loader2 :size="13" class="remote-busy-spin" />
      {{ $t('plan.remote_busy_banner') }}
    </div>
    <!-- [2026-06-10] PRD 보완 진행/승인대기 중 — 처리하면 보완 diff 가 무효화되므로 안내 -->
    <div v-else-if="autofixBusy" class="remote-busy-banner" role="status">
      <Loader2 :size="13" class="remote-busy-spin" />
      {{ $t('plan.autofix_busy_banner') }}
    </div>
    <!-- Left Sidebar: Version History (분리: HistorySidebar.vue) -->
    <HistorySidebar
      :meeting-logs="meetingLogs"
      :selected-log="selectedLog"
      :is-loading="isLoading"
      :next-version="nextVersion"
      :is-new-log-mode="isNewLogMode"
      :is-any-processing="isAnyProcessing"
      :show-batch-panel="showBatchPanel"
      @select="selectLog"
      @new-log="startNewLog"
      @open-notion="emit('open-notion')"
      @toggle-batch="showBatchPanel = !showBatchPanel"
      @preview="openPreview"
    />

    <!-- Batch Panel (분리: BatchPanel.vue) — 샘플 순차 처리 -->
    <BatchPanel
      v-if="showBatchPanel || isBatchActive"
      :batch-state="props.batchState"
      :meeting-logs="meetingLogs"
      :current-stage-label="currentStageLabel"
      @batch="(entries) => emit('batch', entries)"
      @retry-batch="emit('retry-batch')"
      @reset-batch="emit('reset-batch')"
      @stop-batch="emit('stop-batch')"
      @close="showBatchPanel = false"
    />

    <!-- Main Content Space (분리: MeetingLogEditor.vue) -->
    <MeetingLogEditor
      v-else
      v-model:edit-content="editContent"
      v-model:is-new-log-mode="isNewLogMode"
      :current-log="currentLog"
      :next-version="nextVersion"
      :is-loading="isLoading"
      :is-saving="isSaving"
      :current-job-stage="currentJobStage"
      :is-batch-running="isBatchRunning"
      :current-stage-label="currentStageLabel"
      @save="(content) => emit('save', content)"
      @delete="(version) => emit('delete', version)"
      @start-new-log="startNewLog"
    />
  </div>

  <!-- 원본 미팅 로그 미리보기 다이얼로그 -->
  <VDialog v-model="showPreviewDialog" max-width="700" scrollable>
    <VCard style="font-family: 'Pretendard Variable', sans-serif; border-radius: 16px">
      <VCardTitle class="d-flex align-center justify-space-between pa-5 pb-3" style="font-size: 0.9rem; font-weight: 700">
        <span>{{ $t('plan.preview_title', { version: previewVersion }) }}</span>
        <VBtn icon variant="text" size="small" @click="showPreviewDialog = false">
          <VIcon size="18">mdi-close</VIcon>
        </VBtn>
      </VCardTitle>
      <VDivider />
      <VCardText class="pa-0" style="max-height: 65vh">
        <div v-if="!previewContent" class="d-flex justify-center align-center pa-10">
          <VProgressCircular indeterminate color="accent" size="28" width="2" />
        </div>
        <pre v-else class="preview-pre pa-5">{{ previewContent }}</pre>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
/* [2026-06 멀티디바이스] 다른 기기/탭 처리 중 배너 — 레이아웃 무영향 오버레이 */
.remote-busy-banner {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  background: rgba(140, 98, 57, 0.95);
  color: #fff;
  font-family: 'Pretendard Variable', Pretendard, sans-serif;
  font-size: 0.74rem;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
}
.remote-busy-spin { animation: remote-busy-rotate 1s linear infinite; }
@keyframes remote-busy-rotate { to { transform: rotate(360deg); } }

/* ============================
   Meeting Log Root Layout
   ============================ */
.meeting-log-root {
  gap: 20px;
}

.preview-pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.82rem;
  line-height: 1.7;
  color: var(--text-main);
  margin: 0;
  background: transparent;
}

@media (max-width: 900px) {
  .meeting-log-root {
    flex-direction: column;
    gap: 12px;
  }
}

</style>
