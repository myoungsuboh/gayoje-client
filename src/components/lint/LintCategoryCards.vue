<script setup>
import GuideTooltip from '@/components/common/GuideTooltip.vue'

defineProps({
  cases: { type: Array, required: true },
  selectedIndex: { type: Number, default: 0 },
})
defineEmits(['select'])
</script>

<template>
  <div>
    <div class="section-header">
      <span class="section-pill">VALIDATION MAP</span>
      <h4 class="section-title serif-text">
        Rule Validations by Category
        <GuideTooltip target="lint-category-cards" placement="bottom" :size="13" />
      </h4>
    </div>
    <div class="case-row">
      <div
        v-for="c in cases" :key="c.id"
        class="case-card" :class="{ 'case-card--active': selectedIndex === c.id }"
        @click="$emit('select', c.id)"
      >
        <div class="d-flex align-center justify-space-between mb-3">
          <span class="case-title">{{ c.title }}</span>
          <span class="case-pct mono-text" :class="{ 'case-pct--active': selectedIndex === c.id }">{{ c.convergence }}%</span>
        </div>
        <div class="case-bar">
          <div class="case-bar-fill" :style="{ width: c.convergence + '%' }" :class="{ 'case-bar-fill--active': selectedIndex === c.id }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }
.section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.section-pill { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.6rem; font-weight: 700; background: var(--accent); color: white; padding: 3px 12px; border-radius: 9999px; letter-spacing: 0.08em; }
.section-title { font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin: 0; }
/* [2026-06] 기획 카테고리 추가로 4→5장 — 고정 4열 대신 auto-fit: 넓은 화면 5열,
   좁아지면 자연 줄바꿈 (5번째 카드만 둘째 줄에 혼자 남는 비대칭 방지). */
.case-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 32px; }
.case-card { padding: 18px 20px; background: white; border: 1px solid var(--border-light); border-radius: 14px; cursor: pointer; transition: all 0.15s; }
.case-card:hover { border-color: var(--accent); }
.case-card--active { background: var(--accent); border-color: var(--accent); box-shadow: 0 8px 24px rgba(140,98,57,0.2); }
.case-card--active .case-title { color: white; }
.case-title { font-family: 'Pretendard Variable', sans-serif; font-size: 0.78rem; font-weight: 700; color: var(--text-main); line-height: 1.3; }
.case-pct { font-size: 0.72rem; font-weight: 800; color: var(--text-muted); background: var(--bg-light); padding: 2px 10px; border-radius: 9999px; }
.case-pct--active { background: rgba(255,255,255,0.2); color: white; }
.case-bar { height: 6px; background: rgba(0,0,0,0.05); border-radius: 9999px; overflow: hidden; }
.case-bar-fill { height: 100%; background: var(--primary-moss); border-radius: 9999px; transition: width 0.8s ease; }
.case-bar-fill--active { background: white; }
@media (max-width: 1024px) { .case-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .case-row { grid-template-columns: 1fr; } }
</style>
