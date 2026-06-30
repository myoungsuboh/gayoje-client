<script setup>
/**
 * CardCollapseToggle — 프로필 카드 헤더의 접기/펼치기 chevron 버튼.
 *
 * 카드별 스타일이 제각각이라 카드를 공통 래퍼로 감싸지 않고(외형 회귀 방지),
 * 이 작은 토글만 공유한다. 부모는 헤더에 이 버튼을 얹고 body 를 v-show 로 감춘다.
 *   <div class="...-header" @click="collapsed = !collapsed">
 *     ...title... <기존 액션버튼 @click.stop> <CardCollapseToggle v-model:collapsed="collapsed" />
 *   </div>
 *   <div v-show="!collapsed"> ...body... </div>
 *
 * 접근성: 자체가 <button>(키보드 포커스/Enter·Space) + aria-expanded.
 * 헤더 클릭(마우스 편의)과 중복 토글되지 않도록 @click.stop.
 */
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  size: { type: Number, default: 16 },
})
const emit = defineEmits(['update:collapsed'])
</script>

<template>
  <button
    type="button"
    class="card-collapse-toggle"
    :class="{ 'is-collapsed': props.collapsed }"
    :aria-expanded="!props.collapsed"
    :aria-label="props.collapsed ? $t('common.action.expand') : $t('common.action.collapse')"
    @click.stop="emit('update:collapsed', !props.collapsed)"
  >
    <ChevronDown :size="props.size" />
  </button>
</template>

<style scoped>
.card-collapse-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.card-collapse-toggle:hover {
  color: var(--accent);
  background: rgba(140, 98, 57, 0.08);
}
.card-collapse-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.card-collapse-toggle :deep(svg) {
  transition: transform 0.2s ease;
}
/* 펼침=아래 화살표, 접힘=오른쪽 화살표(-90°) */
.card-collapse-toggle.is-collapsed :deep(svg) {
  transform: rotate(-90deg);
}
</style>
