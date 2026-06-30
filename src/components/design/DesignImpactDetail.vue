<script setup>
/**
 * DesignImpactDetail — PRD 변경 영향(impact) 상세 렌더 (2026-06 리팩토링).
 * design.vue 의 StaleBanner #detail 슬롯 안에서 '수정된 Epic/Story → 영향받는 설계
 * 노드(API/DDD/Arch/화면/이벤트/API chain)' 를 펼쳐 보여주던 큰 블록을 분리.
 * 상태(designImpact/impactExpanded)·조회(fetchDesignImpact)·재생성 로직은 design.vue 에
 * 그대로 두고, 여기선 렌더 + 펼침 토글만 담당.
 *
 * props: changedNodes(= designImpact.changed_nodes), expanded(= impactExpanded)
 * emit: toggle (부모가 impactExpanded 를 토글)
 */
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

defineProps({
  changedNodes: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle'])

const { t } = useI18n()

const prdNodeLabelKo = (label) => {
  const key = `design.node_label.${label}`
  const val = t(key)
  return val !== key ? val : (label || t('design.node_label.fallback'))
}
// cascade 요약: 설계 직접 영향 + DDD + Arch + Screen + API chain 레이어 수 포함.
const summarizeCascade = (node) => {
  const parts = []
  const layers = node.impact_layers || {}
  const designCounts = {}
  for (const d of layers.design || []) {
    const key = `design.node_label.${d.label}`
    const tv = t(key)
    const ko = tv !== key ? tv : (d.label || t('design.node_label.etc'))
    designCounts[ko] = (designCounts[ko] || 0) + 1
  }
  parts.push(...Object.entries(designCounts).map(([k, v]) => `${k} ${v}`))
  if (layers.ddd?.length) parts.push(`${t('design.impact.ddd')} ${layers.ddd.length}`)
  if (layers.arch?.length) parts.push(`${t('design.impact.arch')} ${layers.arch.length}`)
  if (layers.events?.length) parts.push(`${t('design.impact.events')} ${layers.events.length}`)
  if (layers.screens?.length) parts.push(`${t('design.impact.screens')} ${layers.screens.length}`)
  if (layers.api_chain?.length) parts.push(`${t('design.impact.api_chain')} ${layers.api_chain.length}`)
  return parts.length ? parts.join(' · ') : t('design.impact.none')
}
const tierLabel = (tier) => t(`enums.tier.${tier}`)
</script>

<template>
  <button
    type="button"
    class="impact-toggle"
    :aria-expanded="expanded"
    @click="emit('toggle')"
  >
    <component :is="expanded ? ChevronDown : ChevronRight" :size="12" />
    {{ $t('design.impact.expand') }}
  </button>
  <ul v-if="expanded" class="impact-list">
    <li v-for="n in changedNodes" :key="n.node_id" class="impact-item">
      <div class="impact-item__header">
        <span class="impact-item__node">
          {{ prdNodeLabelKo(n.node_label) }}
          <span class="impact-item__summary">{{ n.summary || n.node_id }}</span>
        </span>
        <span class="impact-item__arrow">→</span>
        <span class="impact-item__affected">{{ summarizeCascade(n) }}</span>
      </div>
      <template v-if="n.impact_layers?.design?.length || n.impact_layers?.screens?.length || n.impact_layers?.events?.length">
        <ul class="impact-layers">
          <li v-if="n.impact_layers?.design?.length" class="impact-layer">
            <span class="impact-layer__label">{{ $t('design.impact.design_label') }}</span>
            <ul class="impact-nodes">
              <li
                v-for="d in n.impact_layers.design" :key="d.id"
                class="impact-node"
                :class="'impact-node--' + d.tier"
                :title="[d.quote, d.label === 'API' && d.error_cases ? '에러케이스: ' + d.error_cases : ''].filter(Boolean).join('\n') || undefined"
              >
                <span class="impact-node__tier">{{ tierLabel(d.tier) }}</span>
                <span class="impact-node__id">{{ d.id }}</span>
                <span v-if="d.label === 'API' && d.error_cases" class="impact-node__err">⚠</span>
              </li>
            </ul>
          </li>
          <li v-if="n.impact_layers.ddd?.length" class="impact-layer impact-layer--cascade">
            <span class="impact-layer__label">{{ $t('design.impact.ddd') }}<sup>{{ $t('enums.confidence.inferred') }}</sup></span>
            <span class="impact-layer__ids">{{ n.impact_layers.ddd.map(x => x.id).join(' · ') }}</span>
          </li>
          <li v-if="n.impact_layers.arch?.length" class="impact-layer impact-layer--cascade">
            <span class="impact-layer__label">{{ $t('design.impact.arch') }}<sup>{{ $t('enums.confidence.inferred') }}</sup></span>
            <span class="impact-layer__ids">{{ n.impact_layers.arch.map(x => x.id).join(' · ') }}</span>
          </li>
          <li v-if="n.impact_layers.events?.length" class="impact-layer impact-layer--cascade">
            <span class="impact-layer__label">{{ $t('design.impact.events') }}<sup>{{ $t('enums.confidence.inferred') }}</sup></span>
            <span class="impact-layer__ids">{{ n.impact_layers.events.map(x => x.id).join(' · ') }}</span>
          </li>
          <li v-if="n.impact_layers.screens?.length" class="impact-layer">
            <span class="impact-layer__label">{{ $t('design.impact.screens') }}</span>
            <ul class="impact-nodes">
              <li
                v-for="s in n.impact_layers.screens" :key="s.id"
                class="impact-node impact-node--confirmed"
              >
                <span class="impact-node__tier">{{ $t('enums.confidence.direct') }}</span>
                <span class="impact-node__id">{{ s.name || s.id }}</span>
              </li>
            </ul>
          </li>
          <li v-if="n.impact_layers.api_chain?.length" class="impact-layer impact-layer--cascade">
            <span class="impact-layer__label">{{ $t('design.impact.api_chain') }}<sup>{{ $t('enums.confidence.inferred') }}</sup></span>
            <ul class="impact-nodes">
              <li
                v-for="p in n.impact_layers.api_chain" :key="p.id"
                class="impact-node impact-node--review"
              >
                <span class="impact-node__tier">{{ $t('enums.confidence.inferred') }}</span>
                <span class="impact-node__id">{{ p.method }} {{ p.endpoint }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </template>
    </li>
  </ul>
</template>

<style scoped>
/* ── design.vue 원본(L887-979)을 1:1 이동. 한 줄도 변경하지 않음. ── */
/* ═══════ [B — 2026-06] 그래프 임팩트 상세 (StaleBanner #detail 슬롯) ═══════ */
.impact-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  background: none;
  border: none;
  color: #8a6d1f;
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.impact-toggle:hover { color: #6b4f00; text-decoration: underline; }
.impact-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.impact-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.7rem;
  line-height: 1.35;
}
.impact-item__header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 6px;
}
.impact-item__node { font-weight: 700; color: #6b4f00; }
.impact-item__summary {
  font-weight: 500;
  color: #8a6d1f;
  margin-left: 3px;
}
.impact-item__arrow { color: #b8860b; font-weight: 700; }
.impact-item__affected {
  color: #6b4f00;
  background: #fff3cd;
  border-radius: 6px;
  padding: 1px 6px;
  font-weight: 600;
}
.impact-layers {
  list-style: none;
  margin: 0 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.impact-layer {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.67rem;
}
.impact-layer__label {
  min-width: 26px;
  font-weight: 700;
  color: #8a6d1f;
  white-space: nowrap;
  flex-shrink: 0;
}
.impact-layer__label sup { font-size: 0.55rem; font-weight: 400; color: #b8860b; }
.impact-layer--cascade .impact-layer__label,
.impact-layer--cascade .impact-layer__ids { color: #a89060; }
.impact-nodes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
}
.impact-node { display: inline-flex; align-items: center; gap: 3px; cursor: default; }
.impact-node__tier {
  font-size: 0.58rem;
  font-weight: 700;
  padding: 0 3px;
  border-radius: 3px;
}
.impact-node--confirmed .impact-node__tier { background: #d4edda; color: #155724; }
.impact-node--review .impact-node__tier { background: #fff3cd; color: #856404; }
.impact-node__id { color: #5a4a2a; font-size: 0.67rem; }
.impact-node__err { font-size: 0.6rem; color: #b45309; line-height: 1; }
</style>
