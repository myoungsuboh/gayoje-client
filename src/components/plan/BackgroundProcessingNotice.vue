<script setup>
/**
 * 회의록 → CPS/PRD 가 백그라운드에서 생성 중일 때 빈 상태 위에 노출하는 알림.
 *
 * 이전엔 "CPS 데이터 없음 [다시 시도]" 만 보였음 — 사용자가 BE 가 처리 중인 줄
 * 모르고 새로고침을 반복했음. 이제 jobsStore.batchState 또는 activeJobs 를 읽어
 * "지금 어디까지 됐는지 + 무엇을 기다리는지" 구체적으로 표시.
 *
 * Props:
 *   batchState  — { running, total, current, logs: [{ status, sourceVersion, ... }] }
 *                 logs[i].status: 'pending' | 'running' | 'done' | 'error' | 'cancelled'
 *   activeJobs  — [{ taskId, stage, label, startedAt, kind }]
 *
 * Emits:
 *   focus-log   — "진행 상황 보기" 클릭. plan.vue 가 회의록 탭으로 전환.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2, CheckCircle2, Clock, AlertCircle, ArrowRight, MinusCircle, Square } from 'lucide-vue-next'

const props = defineProps({
  batchState: { type: Object, default: null },
  activeJobs: { type: Array, default: () => [] },
})
defineEmits(['focus-log', 'stop'])

// 우선순위: 배치 진행 중 > 단일 작업 진행 중 > 둘 다 없음 (컴포넌트 자체 미렌더)
const isBatchActive = computed(() => !!props.batchState?.running)
const hasSingleJob = computed(() => !isBatchActive.value && props.activeJobs.length > 0)
const shouldShow = computed(() => isBatchActive.value || hasSingleJob.value)

// 배치 진행 통계
const logs = computed(() => props.batchState?.logs || [])
const total = computed(() => props.batchState?.total || 0)
const doneCount = computed(() => logs.value.filter(l => l.status === 'done').length)
const progressPct = computed(() =>
  total.value ? Math.round((doneCount.value / total.value) * 100) : 0,
)
const currentLog = computed(() => logs.value.find(l => l.status === 'running'))
const currentLabel = computed(() => {
  if (!currentLog.value) return ''
  return currentLog.value.sourceVersion || `${(props.batchState?.current || 1)}번째`
})

const { t } = useI18n()

// status → icon / 라벨 (로케일 반응형)
const STATUS_META = computed(() => ({
  done:      { icon: CheckCircle2, label: t('enums.job_status.done'),      cls: 'done' },
  running:   { icon: Loader2,      label: t('enums.job_status.running'),   cls: 'running' },
  pending:   { icon: Clock,        label: t('enums.job_status.pending'),   cls: 'pending' },
  error:     { icon: AlertCircle,  label: t('enums.job_status.error'),     cls: 'error' },
  cancelled: { icon: MinusCircle,  label: t('enums.job_status.cancelled'), cls: 'cancelled' },
}))
const metaOf = (status) => STATUS_META.value[status] || STATUS_META.value.pending

// post_meeting 파이프라인 진행 단계 순서 (1-based out of 6)
const _PIPELINE_TOTAL = 6
const _PIPELINE_STEP = {
  cps_running: 1, cps_extract: 1,
  cps_impact:  2,
  cps_merge:   3,
  prd_running: 4, prd_extract: 4,
  prd_graph:   5,
  prd_merge:   6,
  done:        6, complete: 6,
}

// [2026-06 i18n] stage 라벨은 공통 plan.stage.* 재사용(MeetingLogTab 과 동일 출처).
// 없는 키는 t() 가 키 문자열을 그대로 반환 → fallback 안내로 대체.
const singleStageText = computed(() => {
  const stage = props.activeJobs[0]?.stage
  if (!stage) return t('plan.stage.running')
  const key = `plan.stage.${stage}`
  const label = t(key)
  return label === key ? t('plan.bg_notice.stage_fallback', { stage }) : label
})

const singleStep = computed(() => _PIPELINE_STEP[props.activeJobs[0]?.stage] ?? null)
const singleProgressPct = computed(() =>
  singleStep.value ? Math.round((singleStep.value / _PIPELINE_TOTAL) * 100) : 0,
)

// 작업 지연 감지 — 10초마다 경과 시간 갱신
const _WARN_MS  = 3 * 60 * 1000   // 3분: 느리다는 경고
const _STALE_MS = 8 * 60 * 1000   // 8분: worker 죽었을 가능성 높음

const _now = ref(Date.now())
let _ticker = null
onMounted(() => { _ticker = setInterval(() => { _now.value = Date.now() }, 10_000) })
onUnmounted(() => { clearInterval(_ticker) })

const _singleElapsedMs = computed(() => {
  const started = props.activeJobs[0]?.startedAt
  return started ? _now.value - started : 0
})
const singleIsWarn  = computed(() => _singleElapsedMs.value > _WARN_MS  && _singleElapsedMs.value <= _STALE_MS)
const singleIsStale = computed(() => _singleElapsedMs.value > _STALE_MS)
</script>

<template>
  <div v-if="shouldShow" class="bg-proc-notice" role="status" aria-live="polite">
    <!-- Batch 모드: 항목별 체크리스트 + 전체 진행률 -->
    <template v-if="isBatchActive">
      <div class="bg-proc-notice__head">
        <Loader2 :size="20" class="bg-proc-notice__spin" />
        <div class="bg-proc-notice__head-text">
          <strong class="bg-proc-notice__title">{{ $t('plan.bg_notice.batch_title') }}</strong>
          <i18n-t keypath="plan.bg_notice.batch_sub" tag="span" class="bg-proc-notice__sub">
            <template #label><strong>{{ currentLabel }}</strong></template>
          </i18n-t>
        </div>
        <span class="bg-proc-notice__count">{{ doneCount }} / {{ total }}</span>
      </div>

      <div class="bg-proc-notice__bar">
        <div class="bg-proc-notice__bar-fill" :style="{ width: progressPct + '%' }"></div>
      </div>

      <ul class="bg-proc-notice__steps">
        <li
          v-for="log in logs"
          :key="log.index"
          class="bg-proc-notice__step"
          :class="`bg-proc-notice__step--${metaOf(log.status).cls}`"
        >
          <component
            :is="metaOf(log.status).icon"
            :size="13"
            :class="{ 'bg-proc-notice__step-spin': log.status === 'running' }"
          />
          <span class="bg-proc-notice__step-name">{{ log.sourceVersion || `V${log.index + 1}` }}</span>
          <span class="bg-proc-notice__step-status">{{ metaOf(log.status).label }}</span>
        </li>
      </ul>

      <button type="button" class="bg-proc-notice__btn" @click="$emit('focus-log')">
        {{ $t('plan.bg_notice.view_in_log') }}
        <ArrowRight :size="13" />
      </button>
    </template>

    <!-- 단일 작업 모드 -->
    <template v-else-if="hasSingleJob">
      <div class="bg-proc-notice__head">
        <Loader2 :size="20" class="bg-proc-notice__spin" />
        <div class="bg-proc-notice__head-text">
          <strong class="bg-proc-notice__title">{{ $t('plan.bg_notice.single_title') }}</strong>
          <i18n-t keypath="plan.bg_notice.single_sub" tag="span" class="bg-proc-notice__sub">
            <template #stage><strong>{{ singleStageText }}</strong></template>
          </i18n-t>
        </div>
        <span v-if="singleStep" class="bg-proc-notice__count">{{ singleStep }} / {{ _PIPELINE_TOTAL }}</span>
      </div>
      <div v-if="singleStep" class="bg-proc-notice__bar">
        <div class="bg-proc-notice__bar-fill" :style="{ width: singleProgressPct + '%' }"></div>
      </div>
      <div v-if="singleIsStale" class="bg-proc-notice__alert bg-proc-notice__alert--stale">
        <AlertCircle :size="14" />
        {{ $t('plan.bg_notice.alert_stale') }}
      </div>
      <div v-else-if="singleIsWarn" class="bg-proc-notice__alert">
        <Clock :size="14" />
        {{ $t('plan.bg_notice.alert_warn') }}
      </div>
      <button type="button" class="bg-proc-notice__stop" @click="$emit('stop')">
        <Square :size="13" />
        {{ $t('plan.bg_notice.stop') }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.bg-proc-notice {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(560px, 92vw);
  margin: 0 auto;
  padding: 18px 20px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(140, 98, 57, 0.04) 100%);
  border: 1px solid rgba(37, 99, 235, 0.25);
  text-align: left;
  font-family: 'Pretendard Variable', sans-serif;
  animation: bgProcNoticeFade 0.3s ease-out;
}
@keyframes bgProcNoticeFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.bg-proc-notice__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.bg-proc-notice__head-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bg-proc-notice__title {
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--text-main, #1f2937);
  line-height: 1.3;
}
.bg-proc-notice__sub {
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
  word-break: keep-all;
}
.bg-proc-notice__sub strong {
  color: var(--accent, #8C6239);
  font-weight: 700;
}
.bg-proc-notice__count {
  flex-shrink: 0;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--accent, #8C6239);
  background: white;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid rgba(140, 98, 57, 0.25);
  white-space: nowrap;
}

.bg-proc-notice__spin {
  color: #2563EB;
  animation: bgProcSpin 0.9s linear infinite;
  flex-shrink: 0;
  margin-top: 2px;
}
@keyframes bgProcSpin {
  to { transform: rotate(360deg); }
}

.bg-proc-notice__bar {
  height: 5px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 9999px;
  overflow: hidden;
}
.bg-proc-notice__bar-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #2563EB 0%, #8C6239 100%);
  transition: width 0.6s cubic-bezier(.16, 1, .3, 1);
  box-shadow: 0 0 8px rgba(37, 99, 235, 0.3);
}

.bg-proc-notice__steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.bg-proc-notice__step {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 9999px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
}
.bg-proc-notice__step--done {
  background: rgba(46, 123, 51, 0.08);
  border-color: rgba(46, 123, 51, 0.25);
  color: #2E7B33;
}
.bg-proc-notice__step--running {
  background: rgba(37, 99, 235, 0.08);
  border-color: rgba(37, 99, 235, 0.35);
  color: #1d4ed8;
  font-weight: 800;
}
.bg-proc-notice__step--error {
  background: rgba(244, 67, 54, 0.08);
  border-color: rgba(244, 67, 54, 0.3);
  color: #c0392b;
}
.bg-proc-notice__step--cancelled {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);
}
.bg-proc-notice__step-name {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
}
.bg-proc-notice__step-status { opacity: 0.85; }
.bg-proc-notice__step-spin { animation: bgProcSpin 0.9s linear infinite; }

.bg-proc-notice__btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  border-radius: 9999px;
  border: 1px solid var(--accent, #8C6239);
  background: white;
  color: var(--accent, #8C6239);
  font-family: 'Outfit', sans-serif;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: all 0.15s;
}
.bg-proc-notice__btn:hover,
.bg-proc-notice__btn:focus-visible {
  background: var(--accent, #8C6239);
  color: white;
}

@media (prefers-reduced-motion: reduce) {
  .bg-proc-notice,
  .bg-proc-notice__spin,
  .bg-proc-notice__step-spin,
  .bg-proc-notice__bar-fill { animation: none; transition: none; }
}

.bg-proc-notice__alert {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 9px;
  background: rgba(234, 179, 8, 0.09);
  border: 1px solid rgba(234, 179, 8, 0.35);
  color: #92400e;
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1.5;
  word-break: keep-all;
}
.bg-proc-notice__alert--stale {
  background: rgba(244, 67, 54, 0.07);
  border-color: rgba(244, 67, 54, 0.3);
  color: #b91c1c;
}

/* 중지 버튼 — 단일 작업이 도는 동안 사용자가 즉시 빠져나올 수 있게. */
.bg-proc-notice__stop {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 9999px;
  border: 1px solid rgba(192, 57, 43, 0.4);
  background: white;
  color: #c0392b;
  font-family: 'Outfit', sans-serif;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.15s;
}
.bg-proc-notice__stop:hover,
.bg-proc-notice__stop:focus-visible {
  background: #c0392b;
  color: white;
}

@media (max-width: 600px) {
  .bg-proc-notice { padding: 14px 16px; }
  .bg-proc-notice__head { flex-wrap: wrap; }
  .bg-proc-notice__count { font-size: 0.72rem; }
}
</style>
