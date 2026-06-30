<script setup>
/**
 * EvalAutofillCta — '완성도 끌어올리기' 단일 CTA (AI 보완).
 * EvalScoreCard 모달에서 분리 (2026-06 리팩토링).
 *
 * [2026-06-10 2단계 제거] 기존 'AI 초안 검토 완료'(markAllReviewed) 버튼은 검토 UI
 * 없이 내용을 안 본 채 0.5→1.0 가중치만 일괄 전환하는 고무도장이었다 — 사용자가
 * "거짓말 같다"고 느끼는 의미 불명의 두 번째 클릭. scorer 의 0.5 정책 폐지(채워진
 * 명세는 바로 1.0)와 함께 버튼을 제거하고 채우기 한 번으로 완결.
 *
 * props: projectName(액션 대상), overallPct(진행 안내 문구)
 * emit: close (autofill enqueue/중복 시 모달 닫기 — 부모 dialogOpen=false)
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Sparkles } from 'lucide-vue-next'
import axios from '@/utils/axios'
import { extractTaskId } from '@/utils/asyncJob'
import { notifyEvalScoreRefresh } from '@/composables/useEvalScore'
import { useSnackbar } from '@/composables/useSnackbar'
import { useJobsStore } from '@/store/jobs'
import { extractError } from '@/utils/apiErrors'

const props = defineProps({
  projectName: { type: String, default: '' },
  overallPct: { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

const { t } = useI18n()
const tt = (key, params) => t(`design.eval.${key}`, params || {})
const { showSuccess, showError } = useSnackbar()
const jobsStore = useJobsStore()
const autofilling = ref(false)

// [2026-05 백그라운드 전환] autofill 은 N개 병렬 LLM 이라 수십 초~수 분. 모달에 묶어두지
// 않고 enqueue 후 jobsStore 백그라운드 잡으로 넘기고 모달을 닫는다(emit close).
async function autofillApiSpecs() {
  if (!props.projectName || autofilling.value) return
  // 같은 프로젝트 autofill 잡이 이미 도는 중이면 중복 차단(동시 저장 레이스 방지).
  if (jobsStore.activeJobs.some(j => j.kind === 'autofill' && j.projectName === props.projectName)) {
    showSuccess(tt('autofill_dupe'), { timeout: 6000 })
    emit('close')
    return
  }
  autofilling.value = true
  try {
    const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
    const enqueueRes = await axios.post(
      `${v2Base}/api/v2/pipelines/autofill_api_specs`,
      { project_name: props.projectName },
      { timeout: 15_000 },
    )
    const taskId = extractTaskId(enqueueRes.data)
    if (!taskId) throw new Error(tt('autofill_enqueue_fail'))

    jobsStore.startJob({
      taskId,
      label: tt('autofill_job_label'),
      projectName: props.projectName,
      kind: 'autofill',
      onComplete: (finalInfo) => {
        const data = finalInfo?.result ?? {}
        const meta = data?.meta ?? {}
        const generated = meta.generatedCount ?? meta.generated_count ?? null
        const failed = meta.failedCount ?? 0
        // [2026-06-12 연결 채우기] 잡이 error/auth 에 더해 PRD 연결(스토리 추적)도
        // 채운다 — 연결만 채워진 경우(generated 0)도 성공으로 안내해야 한다.
        const linked = meta.linkSavedCount ?? 0
        notifyEvalScoreRefresh()
        // 전부 실패(quota/일시오류)면 거짓 성공 대신 재시도 안내.
        if (generated === 0 && linked === 0 && failed > 0) {
          showError(tt('autofill_all_failed'), { timeout: 9000 })
          return
        }
        if (generated === 0 && linked === 0 && failed === 0) {
          showSuccess(tt('autofill_none'), { timeout: 7000 })
          return
        }
        let base
        if (generated === 0 && linked > 0) {
          base = tt('autofill_linked_only', { n: linked })
        } else {
          base = generated != null
            ? tt('autofill_success_n', { n: generated })
            : tt('autofill_success_generic')
          if (linked > 0) base += tt('autofill_linked_tail', { n: linked })
        }
        const tail = failed > 0 ? tt('autofill_partial_tail', { n: failed }) : ''
        showSuccess(base + tail, { timeout: 9000 })
      },
      onError: (err) => {
        // detail 이 {code,message}/Pydantic array 일 수 있어 extractError 로 파싱.
        const reason = extractError(err, tt('reason_default'))
        showError(tt('autofill_error', { reason }))
      },
    })

    // 사용자를 풀어준다 — 모달 닫고 "백그라운드 진행 중" 안내.
    emit('close')
    showSuccess(tt('autofill_bg_running'), { timeout: 7000 })
  } catch (e) {
    const reason = extractError(e, tt('reason_default'))
    showError(tt('autofill_start_fail', { reason }))
  } finally {
    autofilling.value = false
  }
}

</script>

<template>
  <!-- API 에러·인증 AI 자동 보완 CTA — 클릭 시 백그라운드 잡으로 실행하고 모달을 닫는다.
       [2026-06-10] 채워진 명세는 완성도에 바로 반영(0.5 정책 폐지) — 버튼 하나로 완결. -->
  <div class="autofill-cta">
    <div class="assist-head">{{ $t('design.eval.assist_head') }}</div>
    <p class="assist-progress" v-html="$t('design.eval.assist_progress', { pct: overallPct })"></p>
    <div class="assist-single">
      <div class="assist-step-title">{{ $t('design.eval.assist_step1') }}</div>
      <button
        class="autofill-btn"
        type="button"
        :disabled="autofilling"
        @click="autofillApiSpecs"
      >
        <Sparkles :size="14" :class="{ 'autofill-spark': autofilling }" />
        {{ autofilling ? $t('design.eval.autofill_btn_sending') : $t('design.eval.autofill_btn') }}
      </button>
    </div>
    <p class="assist-rest" v-html="$t('design.eval.assist_rest')"></p>
    <p class="autofill-hint" v-html="$t('design.eval.autofill_hint')"></p>
  </div>
</template>

<style scoped>
/* ── EvalScoreCard 원본(L1545-1645)을 1:1 이동. 한 줄도 변경하지 않음. ── */
/* [2026-05-29] API 에러·인증 AI 자동 보완 CTA */
.autofill-cta {
  background: linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%);
  border: 1px solid #C7D2FE;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 14px;
}
.autofill-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: linear-gradient(135deg, #6366F1, #4F46E5);
  color: #fff; border: none; border-radius: 8px;
  font-family: inherit; font-size: 12px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s, transform 0.15s;
}
.autofill-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
.autofill-btn:disabled { opacity: 0.6; cursor: not-allowed; }
/* [2026-06-10] 단일 CTA 가이드 패널 — 2단계('검토 완료' 고무도장) 제거로 간소화. */
.assist-head {
  font-weight: 800;
  font-size: 12.5px;
  color: #3730A3;
  margin-bottom: 4px;
}
.assist-progress {
  font-size: 11px;
  color: #4338CA;
  margin: 0 0 10px;
  line-height: 1.5;
}
.assist-progress :deep(strong) { font-weight: 800; color: #3730A3; }
.assist-single {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0 0 8px;
}
.assist-step-title {
  font-size: 11px;
  font-weight: 600;
  color: #312E81;
  line-height: 1.4;
}
.assist-rest {
  font-size: 10.5px;
  color: #4338CA;
  margin: 0 0 2px;
  line-height: 1.5;
}
.assist-rest :deep(strong) { font-weight: 700; }
.autofill-hint { font-size: 10.5px; color: #4338CA; margin: 8px 0 0; line-height: 1.5; }
.autofill-hint :deep(strong) { font-weight: 700; }

/* autofill 버튼 스파크 — enqueue(백그라운드 전송) 동안 펄스 애니메이션 */
.autofill-spark { color: #6366F1; animation: autofill-pulse 1.2s ease-in-out infinite; }
@keyframes autofill-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.18); }
}
@media (prefers-reduced-motion: reduce) {
  .autofill-spark { animation: none; }
}
</style>
