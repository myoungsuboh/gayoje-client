<script setup>
/**
 * EvalTopActions — '지금 보강하면 가장 효과적인 항목' 리스트 (2026-06 리팩토링).
 * EvalScoreCard 모달에서 분리. topActionItems 계산·점프 로직(jumpToGap/goToPrdSection)은
 * EvalScoreCard 에 그대로 두고, 여기선 렌더 + 클릭 이벤트만 위임한다.
 *
 * props: items (= topActionItems)
 * emit:
 *   - jump-gap : 누락 chip 클릭 → { key, m, item } (부모가 jumpToGap)
 *   - jump-prd : PRD 섹션 바로가기 → item (부모가 goToPrdSection)
 */
import { ArrowRight } from 'lucide-vue-next'

defineProps({
  items: { type: Array, default: () => [] },
})
const emit = defineEmits(['jump-gap', 'jump-prd'])
</script>

<template>
  <div class="top-actions">
    <div class="top-actions-head">
      {{ $t('design.eval.top_actions_head') }}
    </div>
    <ul class="top-action-list">
      <li v-for="item in items" :key="item.key" class="top-action-item">
        <div class="top-action-head-row">
          <span class="top-action-tier-tag">{{ item.tierLabel }}</span>
          <span class="top-action-label">{{ item.label }}</span>
          <span
            v-if="item.total"
            class="top-action-count"
            :title="$t('design.eval.top_action_count_title', { total: item.total, missing: item.missingTotal })"
          >{{ item.missingTotal }}/{{ item.total }}</span>
          <span
            v-if="item.delta"
            class="top-action-delta"
            :title="$t('design.eval.delta_title')"
          >{{ $t('design.eval.delta_approx', { pct: item.delta }) }}</span>
        </div>
        <!-- 구체적으로 어느 항목이 빠졌는지 — id + name chip. 클릭 → 그 노드로 이동. -->
        <div v-if="item.missing && item.missing.length" class="top-action-chips">
          <span class="top-action-chips-label">{{ $t('design.eval.target') }}</span>
          <button
            v-for="m in item.missing"
            :key="m.id"
            type="button"
            class="missing-chip missing-chip--clickable"
            :title="$t('design.eval.jump_chip_title', { id: m.id })"
            @click="emit('jump-gap', { key: item.key, m, item })"
          >
            <code class="missing-chip-id">{{ m.id }}</code>{{ m.name }}
            <ArrowRight :size="11" class="missing-chip-go" />
          </button>
          <span
            v-if="item.missingTotal > item.missing.length"
            class="missing-chip missing-chip--more"
          >{{ $t('design.eval.more_n', { n: item.missingTotal - item.missing.length }) }}</span>
        </div>
        <div v-if="item.fix" class="top-action-fix">▶ {{ item.fix }}</div>
        <div v-else-if="item.why" class="top-action-why">{{ item.why }}</div>
        <!-- 보강 지점 바로가기 — PRD 섹션(스토리/요구사항) -->
        <div v-if="item.prdSection" class="top-action-jumps">
          <button type="button" class="ta-jump-link" @click="emit('jump-prd', item)">
            {{ $t('design.eval.jump_prd') }}<ArrowRight :size="11" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* ── EvalScoreCard 원본(L899-1075)을 1:1 이동. 한 줄도 변경하지 않음. ── */
/* [2026-05-28] TOP action 패널 — 사용자가 한 번에 어디 손볼지 안내. */
.top-actions {
  background: linear-gradient(135deg, #FFFBEB 0%, #FEF9C3 100%);
  border: 1px solid #FDE68A;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 14px;
}
.top-actions-head {
  font-weight: 700;
  font-size: 11.5px;
  color: #92400E;
  margin-bottom: 8px;
}
.top-action-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.top-action-item {
  background: #FFFFFF;
  border: 1px solid #FDE68A;
  border-radius: 4px;
  padding: 8px 10px;
}
.top-action-head-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.top-action-tier-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: #1F2937;
  color: #FFFFFF;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.top-action-label {
  flex: 1;
  font-weight: 600;
  color: #1F2937;
  font-size: 11px;
}
.top-action-pct {
  font-weight: 700;
  font-size: 11px;
}
.top-action-count {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  color: #B91C1C;
  background: #FEE2E2;
  padding: 1px 6px;
  border-radius: 9999px;
}
/* [2026-06-06] 효과 배지 — '이거 채우면 약 +N%'. 사용자가 우선순위 잡게. */
.top-action-delta {
  font-size: 10px;
  font-weight: 700;
  color: #047857;
  background: #D1FAE5;
  padding: 1px 7px;
  border-radius: 9999px;
  white-space: nowrap;
}
/* [2026-05-28] 구체적 보강 대상 chip — 어느 API/Entity 가 문제인지 떠먹여주기. */
.top-action-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 4px 0 5px;
}
.top-action-chips-label {
  font-size: 9.5px;
  color: #92400E;
  font-weight: 600;
}
.missing-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: #FFFFFF;
  border: 1px solid #FBBF24;
  border-radius: 4px;
  font-size: 10px;
  color: #1F2937;
  max-width: 100%;
}
.missing-chip-id {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  color: #B45309;
  background: #FEF3C7;
  padding: 0 3px;
  border-radius: 2px;
}
.missing-chip--more {
  border-style: dashed;
  border-color: #D1D5DB;
  color: #6B7280;
  font-style: italic;
}
/* [2026-06-06] 클릭 가능한 누락 칩 — 클릭 시 해당 노드로 이동. */
.missing-chip--clickable {
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.06s;
}
.missing-chip--clickable:hover {
  background: #FEF3C7;
  border-color: #F59E0B;
  box-shadow: 0 1px 4px rgba(180, 83, 9, 0.18);
}
.missing-chip--clickable:active { transform: translateY(0.5px); }
.missing-chip--clickable:focus-visible {
  outline: 2px solid #F59E0B;
  outline-offset: 1px;
}
.missing-chip-go {
  color: #B45309;
  opacity: 0.45;
  margin-left: 1px;
  flex-shrink: 0;
}
.missing-chip--clickable:hover .missing-chip-go { opacity: 1; }
/* 항목 레벨 바로가기 링크 (PRD 보강) */
.top-action-jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.ta-jump-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: #FFFBEB;
  border: 1px solid #FCD34D;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  color: #92400E;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}
.ta-jump-link:hover {
  background: #FEF3C7;
  border-color: #F59E0B;
}
.ta-jump-link:focus-visible {
  outline: 2px solid #F59E0B;
  outline-offset: 1px;
}
.top-action-fix {
  font-size: 10.5px;
  color: #92400E;
  line-height: 1.45;
}
.top-action-why {
  font-size: 10.5px;
  color: #6B7280;
  line-height: 1.45;
  font-style: italic;
}
</style>
