<script setup>
/**
 * PrdFidelityBadge — 원본 회의록 ↔ PRD 정밀 대조(2단계 LLM) 검증.
 *
 * [왜 온디맨드인가] 1단계(토큰 비교)는 자동 조회했지만 잡담·날짜까지 누락으로 세어 노이즈가
 * 컸다. 2단계는 LLM 이 '제품적으로 중요한' 내용만 정밀 판정 — 대신 토큰을 쓰므로 사용자가
 * '대조 검증'을 누를 때만 호출한다. 결과도 수백 칩이 아니라 핵심 누락/환각만 보여준다.
 *
 * 부모(PrdTab)에 'ai-fix' 를 emit — 누락을 'AI 로 보완하기'로 바로 채우게 연결.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileSearch, Loader2, CheckCircle2, AlertTriangle, Sparkles, RotateCw } from 'lucide-vue-next'
import { usePrdFidelity } from '@/composables/usePrdFidelity'

const props = defineProps({
  // 보완 진행 중이면 '보완하기' 버튼 비활성(부모의 fixing 상태).
  fixing: { type: Boolean, default: false },
})
const emit = defineEmits(['ai-fix'])

const { t } = useI18n()
const { report, loading, error, run } = usePrdFidelity()

const done = computed(() => report.value !== null)
const avail = computed(() => !!report.value?.available)
const pct = computed(() => report.value?.coverage_pct ?? 0)
const missing = computed(() => report.value?.missing ?? [])
const hall = computed(() => report.value?.hallucination ?? [])
const summary = computed(() => report.value?.summary ?? '')
const clean = computed(() => avail.value && !missing.value.length && !hall.value.length)

function pctColor(p) {
  if (p >= 80) return '#4CAF50'
  if (p >= 50) return '#E08A3C'
  return '#E55353'
}
const sevLabel = (s) => t(`prd.fidelity.sev_${s || 'medium'}`)
const SECTION = computed(() => ({
  overview: t('prd.lint_badge.section_overview'),
  epic: t('prd.lint_badge.section_epic'),
  screen: t('prd.lint_badge.section_screen'),
  nfr: t('prd.lint_badge.section_nfr'),
}))
</script>

<template>
  <div class="prd-fid">
    <!-- 검증 전: 진입 버튼 -->
    <button v-if="!done && !loading" type="button" class="prd-fid__run" @click="run">
      <FileSearch :size="13" /> {{ t('prd.fidelity.run') }}
    </button>

    <!-- 진행 중 -->
    <div v-else-if="loading" class="prd-fid__loading">
      <Loader2 :size="13" class="spin" /> {{ t('prd.fidelity.checking') }}
    </div>

    <!-- 결과 -->
    <template v-else>
      <div v-if="!avail" class="prd-fid__na">
        <span>{{ t('prd.fidelity.unavailable') }}</span>
        <button type="button" class="prd-fid__recheck" @click="run"><RotateCw :size="11" /> {{ t('prd.fidelity.recheck') }}</button>
      </div>
      <template v-else>
        <div class="prd-fid__head">
          <FileSearch :size="13" />
          <span class="prd-fid__label">{{ t('prd.fidelity.label') }}</span>
          <strong class="prd-fid__pct" :style="{ color: pctColor(pct) }">{{ pct }}%</strong>
          <button type="button" class="prd-fid__recheck" @click="run"><RotateCw :size="11" /> {{ t('prd.fidelity.recheck') }}</button>
        </div>
        <p v-if="summary" class="prd-fid__summary">{{ summary }}</p>

        <p v-if="clean" class="prd-fid__clean"><CheckCircle2 :size="14" /> {{ t('prd.fidelity.all_reflected') }}</p>
        <template v-else>
          <div v-if="missing.length" class="prd-fid__group">
            <div class="prd-fid__group-label">{{ t('prd.fidelity.missing_title', { n: missing.length }) }}</div>
            <ul class="prd-fid__list">
              <li v-for="(m,i) in missing" :key="'m'+i" class="prd-fid__item">
                <span class="prd-fid__sev" :class="`prd-fid__sev--${m.severity}`">{{ sevLabel(m.severity) }}</span>
                <span v-if="m.section && SECTION[m.section]" class="prd-fid__sec">{{ SECTION[m.section] }}</span>
                <span class="prd-fid__point">{{ m.point }}</span>
              </li>
            </ul>
            <button type="button" class="prd-fid__fix" :disabled="fixing" @click="emit('ai-fix')">
              <Sparkles :size="12" /> {{ fixing ? t('prd.lint_badge.ai_fixing') : t('prd.fidelity.fix_cta') }}
            </button>
          </div>
          <div v-if="hall.length" class="prd-fid__group">
            <div class="prd-fid__group-label prd-fid__group-label--hall">
              <AlertTriangle :size="12" /> {{ t('prd.fidelity.hall_title', { n: hall.length }) }}
            </div>
            <ul class="prd-fid__list">
              <li v-for="(h,i) in hall" :key="'h'+i" class="prd-fid__item">
                <span class="prd-fid__sev" :class="`prd-fid__sev--${h.severity}`">{{ sevLabel(h.severity) }}</span>
                <span class="prd-fid__point">{{ h.point }}</span>
              </li>
            </ul>
          </div>
        </template>
      </template>
    </template>

    <div v-if="error" class="prd-fid__err">
      <span>{{ t('prd.fidelity.error') }}</span>
      <button type="button" class="prd-fid__recheck" @click="run"><RotateCw :size="11" /> {{ t('prd.fidelity.recheck') }}</button>
    </div>
  </div>
</template>

<style scoped>
.prd-fid { display: flex; flex-direction: column; gap: 7px; padding: 8px 11px; background: #FBF7EC; border: 1px solid rgba(140, 98, 57, 0.22); border-radius: 8px; font-size: 11px; color: #5A4632; max-width: 100%; }
.prd-fid__run, .prd-fid__recheck, .prd-fid__fix {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: inherit; cursor: pointer; transition: background .15s, opacity .15s;
}
.prd-fid__run {
  align-self: flex-start;
  padding: 5px 12px; border-radius: 9999px;
  background: rgba(140, 98, 57, 0.1); border: 1px solid rgba(140, 98, 57, 0.28);
  color: #6E4E2E; font-size: 11px; font-weight: 700;
}
.prd-fid__run:hover { background: rgba(140, 98, 57, 0.18); }
.prd-fid__loading { display: inline-flex; align-items: center; gap: 6px; opacity: 0.75; }
.prd-fid__na { display: flex; align-items: center; gap: 8px; color: #8a817c; flex-wrap: wrap; }
.prd-fid__head { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.prd-fid__label { font-weight: 700; }
.prd-fid__pct { font-weight: 800; font-size: 14px; font-variant-numeric: tabular-nums; }
.prd-fid__recheck {
  margin-left: auto; padding: 2px 8px; border-radius: 9999px;
  background: transparent; border: 1px solid rgba(140, 98, 57, 0.25);
  color: #8a6d4b; font-size: 10px; font-weight: 600;
}
.prd-fid__recheck:hover { background: rgba(140, 98, 57, 0.1); }
.prd-fid__summary { margin: 0; font-size: 10.5px; line-height: 1.5; color: #6b5a3f; }
.prd-fid__clean { display: flex; align-items: center; gap: 5px; color: #3F7A3F; margin: 0; font-weight: 600; }
.prd-fid__group { display: flex; flex-direction: column; gap: 5px; }
.prd-fid__group-label { font-size: 10.5px; font-weight: 700; color: #9A5320; }
.prd-fid__group-label--hall { display: inline-flex; align-items: center; gap: 4px; color: #B23B3B; }
.prd-fid__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.prd-fid__item { display: flex; align-items: baseline; gap: 7px; line-height: 1.45; }
.prd-fid__sev { flex-shrink: 0; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 9999px; }
.prd-fid__sev--high { background: #FDE2E2; color: #B23B3B; }
.prd-fid__sev--medium { background: #FBEDD9; color: #9A5320; }
.prd-fid__sev--low { background: #ECECEC; color: #6B6B6B; }
.prd-fid__sec { flex-shrink: 0; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: #2A2421; color: #FCFAEE; }
.prd-fid__point { color: #4a3f33; font-size: 11px; }
.prd-fid__fix {
  align-self: flex-start; margin-top: 2px;
  padding: 5px 12px; border-radius: 9999px;
  background: #8C6239; border: none; color: #fff; font-size: 10.5px; font-weight: 700;
}
.prd-fid__fix:hover:not(:disabled) { background: #6E4E2E; }
.prd-fid__fix:disabled { opacity: 0.6; cursor: default; }
.prd-fid__err { display: flex; align-items: center; gap: 8px; color: #B23B3B; flex-wrap: wrap; }
.spin { animation: prd-fid-spin 0.9s linear infinite; }
@keyframes prd-fid-spin { to { transform: rotate(360deg); } }
</style>
