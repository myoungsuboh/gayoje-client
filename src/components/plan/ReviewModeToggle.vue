<script setup>
import { Loader2, ShieldCheck, Wand2 } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

defineProps({
  isReviewMode: { type: Boolean, default: false },
  isToggling: { type: Boolean, default: false },
  // [2026-06] 회의록 처리 중(enqueue~job 완료) 모드 전환 차단. endpoint 는 enqueue 시점
  // 모드로 확정되는데, 처리 중 토글하면 job 결과(CPS만/CPS+PRD)와 UI 모드가 어긋나
  // PRD 생성 게이트가 사라지는 race 를 막는다. (spinner 는 isToggling 만 — 오해 방지)
  disabled: { type: Boolean, default: false },
})
defineEmits(['toggle'])
</script>

<template>
  <span class="d-inline-flex align-center">
    <button
      class="review-toggle"
      :class="{ 'review-toggle--on': isReviewMode }"
      :disabled="isToggling || disabled"
      :title="disabled
        ? $t('plan.review.title_busy')
        : (isReviewMode ? $t('plan.review.title_on') : $t('plan.review.title_off'))"
      type="button"
      @click="$emit('toggle')"
    >
      <Loader2 v-if="isToggling" :size="13" class="spin" />
      <ShieldCheck v-else-if="isReviewMode" :size="13" />
      <Wand2 v-else :size="13" />
      <span class="review-toggle__label">{{ isReviewMode ? $t('plan.review.label_on') : $t('plan.review.label_off') }}</span>
    </button>
    <GuideTooltip target="auto-mode-toggle" placement="bottom" />
  </span>
</template>

<style scoped>
.review-toggle {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-radius: 9999px; border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  background: #fff; color: var(--text-main, #111);
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.review-toggle:hover:not(:disabled) { border-color: var(--accent, #8C6239); color: var(--accent, #8C6239); }
.review-toggle:disabled { opacity: 0.6; cursor: not-allowed; }
.review-toggle--on { background: var(--accent, #8C6239); color: #fff; border-color: var(--accent, #8C6239); }
.review-toggle--on:hover:not(:disabled) { background: #6f4d2d; border-color: #6f4d2d; color: #fff; }
.spin { animation: review-toggle-spin 0.9s linear infinite; }
@keyframes review-toggle-spin { to { transform: rotate(360deg); } }
</style>
