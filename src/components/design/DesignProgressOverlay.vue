<script setup>
/**
 * DesignProgressOverlay — 설계(SPACK/DDD/Architecture) 생성 중 진행 오버레이.
 * design.vue 에서 분리 (2026-06 리팩토링). 6분 대기를 단계·진행률·ETA·가이드로
 * 채워 이탈을 막는다. **UI/스타일은 design.vue 원본을 1:1 그대로 옮긴 것** —
 * VOverlay teleport + `:deep(.v-overlay__*)` 도 class("update-overlay") 기반이라
 * 컴포넌트 scope 에서 동일하게 적용된다.
 *
 * 부모(design.vue)가 상태를 소유하고 props 로 전달:
 *   - isUpdating  : 오버레이 표시 (생성 시작 true → 완료/취소 false)
 *   - jobStage    : BE 폴링이 보내는 실제 단계 마커(design:spack/ddd/architecture/saving)
 *   - isCancelling: 중지 처리 중
 * 중지 버튼 → emit('cancel')(부모 handleCancelUpdate). 경과 타이머는 isUpdating watch 로 내부 관리.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { RefreshCw, Sparkles, X } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const props = defineProps({
  isUpdating: { type: Boolean, default: false },
  jobStage: { type: String, default: '' },
  isCancelling: { type: Boolean, default: false },
})
const emit = defineEmits(['cancel'])

const { t } = useI18n()

// 가이드 영역 — 한 번 본 사용자는 "다시 안보기" 로 영구 dismiss (design.vue 원본과 동일 키).
const GUIDE_DISMISS_KEY = 'harness_design_loading_guide_dismissed_v1'
const showLoadingGuide = ref(true)
try {
  if (localStorage.getItem(GUIDE_DISMISS_KEY)) showLoadingGuide.value = false
} catch {}
const dismissLoadingGuide = () => {
  try { localStorage.setItem(GUIDE_DISMISS_KEY, '1') } catch {}
  showLoadingGuide.value = false
}

const elapsedSec = ref(0)
let elapsedTimer = null
// desc/tip 은 로케일 반응형 (name/icon 은 언어 불변). step pill key 는 name 사용.
const STAGES = computed(() => [
  { name: 'SPACK', icon: '📋', desc: t('design.stage.spack.desc'), tip: t('design.stage.spack.tip') },
  { name: 'DDD',   icon: '🧩', desc: t('design.stage.ddd.desc'), tip: t('design.stage.ddd.tip') },
  { name: 'Architecture', icon: '🏗️', desc: t('design.stage.architecture.desc'), tip: t('design.stage.architecture.tip') },
])
// [2026-06-11] 단계별 '고정 %' → 단계 내 크롤로 개선.
// 기존엔 단계 진입 시 pct 가 고정돼 (spack=10, ddd=42, arch=72) 긴 단계 내내 숫자가
// 멈춰 "고장인가?" 오해를 부르고, saving(92)은 수 초라 화면에서 못 봐 72→100 으로
// 점프해 보였다 (실사용 보고). 단계 경계(start)는 BE 의 진짜 신호 그대로 쓰되,
// 단계 안에서는 est(추정 소요) 기준으로 start→end-2 선형 크롤, est 초과 후엔
// 45초당 +1 초저속 크롤(end-1 상한) — 어느 구간에서도 숫자가 완전히 멈추지 않는다.
const DESIGN_STAGE_MAP = {
  'design:spack':        { idx: 0, start: 10, end: 40, est: 100 },
  'design:ddd':          { idx: 1, start: 42, end: 70, est: 90 },
  'design:architecture': { idx: 2, start: 72, end: 90, est: 60 },
  'design:saving':       { idx: 2, start: 92, end: 98, est: 8 },
}
const currentStageIdx = computed(() => DESIGN_STAGE_MAP[props.jobStage]?.idx ?? 0)
const currentStage = computed(() => STAGES.value[currentStageIdx.value])
const elapsedMmSs = computed(() => {
  const m = Math.floor(elapsedSec.value / 60)
  const s = elapsedSec.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})
// 단계 진입 시각 — 단계 내 경과(stageElapsed) 계산용. jobStage 가 바뀔 때 리셋.
const stageStartSec = ref(0)
watch(() => props.jobStage, () => { stageStartSec.value = elapsedSec.value })
const overallProgressPct = computed(() => {
  const mapped = DESIGN_STAGE_MAP[props.jobStage]
  if (mapped) {
    const stageElapsed = Math.max(0, elapsedSec.value - stageStartSec.value)
    const { start, end, est } = mapped
    if (stageElapsed <= est) {
      // est 안: start → end-2 선형 크롤
      return Math.min(end - 2, start + Math.round(((end - 2 - start) * stageElapsed) / est))
    }
    // est 초과: 45초당 +1 초저속 크롤 (end-1 상한) — 멈춤으로 보이지 않게
    return Math.min(end - 1, end - 2 + Math.floor((stageElapsed - est) / 45))
  }
  if (elapsedSec.value <= 0) return 2
  return Math.min(8, 2 + Math.round(elapsedSec.value / 5))
})
const etaText = computed(() => {
  if (!props.jobStage) return t('design.stage.preparing')
  return t('design.stage.step_progress', { current: currentStageIdx.value + 1, total: STAGES.value.length })
})

const startElapsed = () => {
  elapsedSec.value = 0
  stageStartSec.value = 0  // 재시작 시 이전 run 의 단계 진입 시각 잔존 방지
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = setInterval(() => { elapsedSec.value++ }, 1000)
}
const stopElapsed = () => {
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = null
}
// 부모가 isUpdating 을 켜고 끌 때 경과 타이머 동기화 (원본의 startElapsed/stopElapsed 호출 대체).
// 단계 마커(jobStage) 초기화는 부모(handleLatestUpdate)가 담당.
watch(() => props.isUpdating, (on) => {
  if (on) startElapsed()
  else stopElapsed()
}, { immediate: true })
onBeforeUnmount(stopElapsed)
</script>

<template>
  <VOverlay :model-value="isUpdating" persistent class="align-center justify-center update-overlay" no-click-animation>
    <div class="update-card custom-scroll" role="status" aria-live="polite">

      <!-- 상단 — 진행 상태 -->
      <div class="update-head">
        <div class="update-spinner-container">
          <RefreshCw :size="32" class="text-white spin" />
        </div>
        <div class="update-head-text">
          <h3 class="update-title">{{ $t('design.stage.title') }}</h3>
          <div class="update-elapsed">
            {{ currentStage.icon }} {{ currentStage.name }} <span class="elapsed-time">· {{ elapsedMmSs }}</span>
          </div>
        </div>
        <!-- 중지 버튼 — 클릭 시 부모가 확인 후 abort. 이전 설계 데이터는 보존. -->
        <span class="d-inline-flex align-center">
          <button
            class="update-cancel-btn"
            :disabled="isCancelling"
            @click="emit('cancel')"
            :title="isCancelling ? $t('design.stage.cancelling_title') : $t('design.stage.cancel_title')"
          >
            <X :size="14" class="mr-1" />
            {{ isCancelling ? $t('design.stage.cancelling') : $t('design.stage.cancel') }}
          </button>
          <GuideTooltip target="design-cancel" placement="bottom" />
        </span>
      </div>

      <!-- 단계 진행 표시 -->
      <div class="update-stages">
        <div
          v-for="(s, i) in STAGES" :key="s.name"
          class="stage-pill"
          :class="{
            'stage-pill--done': i < currentStageIdx,
            'stage-pill--active': i === currentStageIdx,
          }"
        >
          <span class="stage-pill-num">{{ i + 1 }}</span>
          <span class="stage-pill-name">{{ s.name }}</span>
        </div>
      </div>

      <!-- 전체 진행률 + ETA -->
      <div class="update-progress" role="progressbar" :aria-valuenow="overallProgressPct" aria-valuemin="0" aria-valuemax="100">
        <div class="update-progress-bar">
          <div class="update-progress-fill" :style="{ width: overallProgressPct + '%' }"></div>
        </div>
        <div class="update-progress-meta">
          <span class="update-progress-pct">{{ overallProgressPct }}%</span>
          <span class="update-progress-eta">{{ etaText }}</span>
        </div>
      </div>

      <p class="update-stage-desc">{{ currentStage.desc }}</p>
      <p class="update-stage-tip">💡 {{ currentStage.tip }}</p>

      <!-- 가이드 미리보기 — "끝나면 무엇을 할 수 있는지". 영구 dismiss 가능. -->
      <div v-if="showLoadingGuide" class="update-guide">
        <div class="update-guide-head">
          <div class="d-flex align-center gap-1"><Sparkles :size="14" /> {{ $t('design.loading_guide.heading') }}</div>
          <button class="dismiss-link" @click="dismissLoadingGuide" :title="$t('design.loading_guide.dismiss_title')">
            {{ $t('design.loading_guide.dismiss') }}
          </button>
        </div>
        <div class="update-guide-steps">
          <div class="guide-step">
            <span class="guide-step-num">1</span>
            <div>
              <div class="guide-step-title">{{ $t('design.loading_guide.step1_title') }}</div>
              <div class="guide-step-desc">{{ $t('design.loading_guide.step1_desc') }}</div>
            </div>
          </div>
          <div class="guide-step">
            <span class="guide-step-num">2</span>
            <div>
              <div class="guide-step-title">{{ $t('design.loading_guide.step2_title') }}</div>
              <div class="guide-step-desc">{{ $t('design.loading_guide.step2_desc') }}</div>
            </div>
          </div>
          <div class="guide-step">
            <span class="guide-step-num">3</span>
            <div>
              <div class="guide-step-title">{{ $t('design.loading_guide.step3_title') }}</div>
              <div class="guide-step-desc">{{ $t('design.loading_guide.step3_desc') }}</div>
            </div>
          </div>
          <div class="guide-step">
            <span class="guide-step-num">4</span>
            <div>
              <div class="guide-step-title">{{ $t('design.loading_guide.step4_title') }}</div>
              <div class="guide-step-desc">{{ $t('design.loading_guide.step4_desc') }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </VOverlay>
</template>

<style scoped>
/* ── design.vue 원본(L1314-1529)을 1:1 이동. 한 줄도 변경하지 않음. ── */
/* Update Overlay — 6분 대기 가이드 학습 화면 */
.update-overlay :deep(.v-overlay__content) { background: transparent !important; width: min(620px, 92vw); }
.update-overlay :deep(.v-overlay__scrim) { background: rgba(0,0,0,0.8) !important; backdrop-filter: blur(8px); }

.update-card {
  background: linear-gradient(135deg, #1F1A14 0%, #14110D 100%);
  border-radius: 20px;
  padding: 28px;
  color: #F5EEE3;
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

/* [2026-06-26] 드래그 선택색 — 다크 카드에선 브라우저 기본 선택색이 검정 글자라 안 읽힘.
   브랜드 골드 배경 + 어두운 글자로 가독성 확보. */
.update-card :deep(::selection) { background: #D4B896; color: #14110D; }
.update-card :deep(::-moz-selection) { background: #D4B896; color: #14110D; }

.update-head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.update-spinner-container {
  width: 60px; height: 60px; border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.update-head-text { flex: 1; min-width: 0; }
.update-title { font-family: 'Outfit', sans-serif; font-size: 1.15rem; font-weight: 800; margin: 0; line-height: 1.2; }
.update-elapsed { font-size: 0.85rem; opacity: 0.8; margin-top: 4px; font-family: 'Outfit', sans-serif; font-weight: 600; }
.elapsed-time { font-family: 'IBM Plex Mono', monospace; opacity: 0.6; font-size: 0.78rem; }

/* 중지 버튼 — 진행 모달 헤더 우측. 빨간 톤으로 destructive 액션 시각화. */
.update-cancel-btn {
  display: inline-flex; align-items: center;
  padding: 8px 14px; border-radius: 9999px;
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  line-height: 1;
}
.update-cancel-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.75);
  color: #fecaca;
}
.update-cancel-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.update-stages { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.stage-pill {
  flex: 1;
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 0.74rem;
  font-weight: 700;
  opacity: 0.5;
  transition: all 0.3s;
}
.stage-pill-num {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem;
}
.stage-pill--done { opacity: 0.7; background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.3); }
.stage-pill--done .stage-pill-num { background: rgba(34,197,94,0.4); }
.stage-pill--active {
  opacity: 1;
  background: linear-gradient(135deg, rgba(140,98,57,0.3) 0%, rgba(140,98,57,0.15) 100%);
  border-color: rgba(212,184,150,0.5);
  box-shadow: 0 0 16px rgba(140,98,57,0.2);
}
.stage-pill--active .stage-pill-num { background: linear-gradient(135deg, #D4B896 0%, #8C6239 100%); }

.update-stage-desc { font-size: 0.88rem; margin: 6px 0 4px; opacity: 0.92; line-height: 1.4; }
.update-stage-tip { font-size: 0.78rem; margin: 0 0 22px; opacity: 0.65; line-height: 1.5; font-style: italic; }

/* [2026-05-21] 전체 진행률 + ETA — 6분 LLM 체인 대기를 "체감 가능한" 진행감으로.
   바 색상은 active stage pill 과 동일 톤 (#D4B896 → #8C6239) 으로 시각 일관성. */
.update-progress {
  margin: 10px 0 14px;
}
.update-progress-bar {
  height: 5px;
  background: rgba(255,255,255,0.08);
  border-radius: 9999px;
  overflow: hidden;
  position: relative;
}
.update-progress-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #D4B896 0%, #8C6239 100%);
  box-shadow: 0 0 12px rgba(212, 184, 150, 0.5);
  transition: width 0.6s cubic-bezier(.16,1,.3,1);
  position: relative;
}
/* 바 끝에 미세한 shimmer — "지금도 진행 중" 살아있음 표시. */
.update-progress-fill::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 24px;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 100%);
  animation: shimmer 1.6s ease-in-out infinite;
}
@keyframes shimmer {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.9; }
}
.update-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 6px;
  font-family: 'Outfit', sans-serif;
}
.update-progress-pct {
  font-size: 0.72rem;
  font-weight: 800;
  color: #D4B896;
  letter-spacing: 0.04em;
}
.update-progress-eta {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.7;
}
@media (prefers-reduced-motion: reduce) {
  .update-progress-fill::after { animation: none; }
  .update-progress-fill { transition: none; }
}

.update-guide {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px 18px;
}
.update-guide-head {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  font-family: 'Outfit', sans-serif; font-weight: 800;
  font-size: 0.82rem; margin-bottom: 14px;
  color: #D4B896;
}
.update-guide-head .dismiss-link {
  background: none; border: none;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255,255,255,0.45);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  padding: 4px 0;
  transition: color 0.15s;
}
.update-guide-head .dismiss-link:hover { color: rgba(255,255,255,0.85); }
.update-guide-steps { display: flex; flex-direction: column; gap: 12px; }
.guide-step { display: flex; gap: 12px; }
.guide-step-num {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, #D4B896 0%, #8C6239 100%);
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 800;
}
.guide-step-title { font-size: 0.82rem; line-height: 1.4; word-break: keep-all; }
.guide-step-title strong { color: #D4B896; }
.guide-step-desc { font-size: 0.72rem; opacity: 0.65; margin-top: 3px; line-height: 1.5; word-break: keep-all; }
.guide-step-desc code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; font-size: 0.7rem; font-family: 'IBM Plex Mono', monospace; }

@media (max-width: 600px) {
  .update-card { padding: 20px; }
  .update-stages { flex-direction: column; gap: 6px; }
  .stage-pill { width: 100%; }
  /* [모바일] 제목 1줄 유지 — 스피너·간격·버튼 축소로 공간 확보 후 nowrap. */
  .update-head { gap: 10px; }
  .update-spinner-container { width: 44px; height: 44px; }
  .update-spinner-container :deep(svg) { width: 24px; height: 24px; }
  .update-title {
    font-size: 0.96rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .update-elapsed { font-size: 0.78rem; margin-top: 2px; }
  .update-cancel-btn { padding: 7px 11px; font-size: 0.68rem; }
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
