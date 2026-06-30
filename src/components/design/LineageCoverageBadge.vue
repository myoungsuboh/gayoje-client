<script setup>
/**
 * [B — 2026-05] Lineage 채움률 배지.
 *
 * Spack/DDD/Architecture 탭 상단에 표시. PRD 와 연결된 노드 비율을 한눈에 보여줌.
 * "핵심 기능 (PRD ↔ design 추적성)" 가시성 ↑.
 *
 * Props:
 *   coverage: { total, direct, inferred, none, coverage_pct }
 *   label:    표시 라벨 (e.g. 'Entity', 'Aggregate', 'Service')
 */
import { computed } from 'vue'
import { Link2 } from 'lucide-vue-next'
import { formatCoverageTooltip } from '@/composables/useDesignLineage'

const props = defineProps({
  coverage: { type: Object, required: true },
  label: { type: String, default: '' },
})

const tooltip = computed(() => formatCoverageTooltip(props.coverage))

// coverage_pct 색상 — 80+ 녹색, 50+ 주황, 그 외 회색
const pctColor = computed(() => {
  const p = props.coverage?.coverage_pct ?? 0
  if (p >= 80) return '#4CAF50'
  if (p >= 50) return '#E08A3C'
  return '#8A817C'
})

// 빈 데이터 (total=0) 면 배지 숨김
const isVisible = computed(() => (props.coverage?.total ?? 0) > 0)
</script>

<template>
  <div v-if="isVisible" class="lineage-coverage-badge" :title="tooltip">
    <Link2 :size="12" />
    <span class="coverage-label">{{ $t('design.coverage_badge.label', { label }) }}</span>
    <span class="coverage-pct" :style="{ color: pctColor }">
      {{ coverage.coverage_pct }}%
    </span>
    <span class="coverage-detail">
      <span v-if="coverage.direct" class="dot dot--direct" />
      {{ coverage.direct }}
      <span class="sep">·</span>
      <span v-if="coverage.inferred" class="dot dot--inferred" />
      {{ coverage.inferred }}
      <span class="sep">·</span>
      <span class="dot dot--none" />
      {{ coverage.none }}
    </span>
  </div>
</template>

<style scoped>
.lineage-coverage-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 11px;
  color: #4B5563;
  cursor: help;
}
.coverage-label {
  font-weight: 500;
}
.coverage-pct {
  font-weight: 700;
  font-size: 13px;
}
.coverage-detail {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #6B7280;
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 2px;
}
.dot--direct { background: #4CAF50; }
.dot--inferred { background: #FFB570; }
.dot--none { background: #D0D0D0; }
.sep { color: #D1D5DB; padding: 0 1px; }
</style>
