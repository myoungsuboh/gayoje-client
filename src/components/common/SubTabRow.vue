<script setup>
/**
 * SubTabRow — 페이지 내 sub-nav 공용 컴포넌트.
 *
 * 4개 페이지(plan/design/lint/deliverables) 가 동일 패턴을 갖고 있어 추출:
 *   [Tab1 subtitle] [Tab2 subtitle] ... | (trailing slot: action btn + ProjectLookup)
 *
 * 반응형:
 *   - 1200px 이하: subtitle 폰트 축소
 *   - 900px 이하 (smAndDown): 행이 두 줄로 wrap, ProjectLookup 이 두번째 줄로 내려옴
 *   - 600px 이하 (xs): subtitle 숨김, 탭은 가로 스크롤 (v-tabs show-arrows)
 *   - center-active: 활성 탭이 우측 끝에 위치할 때 다음 탭이 잘려보이지 않도록
 *     활성 탭을 항상 가운데로 스크롤 (예: plan 의 '기획서' 활성 시 '코딩 규칙' 가시)
 *
 * Props:
 *   modelValue — 선택된 탭 value (v-model)
 *   tabs       — [{ value, title, subtitle?, disabled?, guide? }, ...]
 *                guide 는 src/utils/guides.js 의 GUIDES key — 활성 탭에 ⓘ
 *                아이콘이 붙어 hover/click 시 가이드 popover 노출.
 *   disabled   — 전체 비활성
 *
 * Slots:
 *   trailing   — 오른쪽 액션 영역 (예: 새로고침 버튼, ProjectLookup)
 */
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  tabs: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { xs } = useDisplay()
const showSubtitle = computed(() => !xs.value)

const onChange = (v) => emit('update:modelValue', v)

// trailing slot 사용 여부 — wrap 정책에서 활용 (slot 비어있으면 모바일 wrap 불필요).
import { useSlots } from 'vue'
const slots = useSlots()
const hasTrailing = computed(() => !!slots.trailing)
</script>

<template>
  <div class="sub-tab-row" :class="{ 'sub-tab-row--no-trailing': !hasTrailing }">
    <v-tabs
      :model-value="modelValue"
      bg-color="transparent"
      color="white"
      density="comfortable"
      class="premium-sub-tabs"
      :show-arrows="true"
      center-active
      height="42"
      :disabled="disabled"
      @update:model-value="onChange"
    >
      <v-tab
        v-for="t in tabs"
        :key="t.value"
        :value="t.value"
        class="text-none sub-tab-item"
        :disabled="disabled || !!t.disabled"
      >
        <span class="sub-tab-title">{{ t.title }}</span>
        <span v-if="t.subtitle && showSubtitle" class="tab-subtitle">{{ t.subtitle }}</span>
        <GuideTooltip
          v-if="t.guide && modelValue === t.value"
          :target="t.guide"
          placement="bottom"
          :size="12"
        />
      </v-tab>
    </v-tabs>

    <div v-if="$slots.trailing" class="trailing-area">
      <slot name="trailing" />
    </div>
  </div>
</template>

<style scoped>
.sub-tab-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 8px;
  flex-wrap: nowrap;
  width: 100%;
  min-width: 0;
}

.premium-sub-tabs {
  flex: 1 1 auto;
  min-width: 0;
}

.premium-sub-tabs :deep(.v-slide-group__content) {
  gap: 8px;
  padding: 4px 0;
}

.sub-tab-item {
  border-radius: 9999px !important;
  text-transform: none !important;
  letter-spacing: 0 !important;
  min-height: 34px !important;
  height: 34px !important;
  color: var(--text-muted) !important;
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1) !important;
  font-weight: 700 !important;
}

.sub-tab-item:hover {
  background-color: var(--border-light) !important;
  color: var(--text-main) !important;
}

.premium-sub-tabs .v-tab.v-tab--selected.sub-tab-item {
  background-color: var(--accent) !important;
  color: #FFFFFF !important;
  box-shadow: 0 4px 16px rgba(140, 98, 57, 0.25) !important;
}

.premium-sub-tabs .v-tab.v-tab--selected.sub-tab-item * {
  color: #FFFFFF !important;
}

.sub-tab-title {
  font-size: 0.8rem;
  font-family: 'Outfit', 'Pretendard Variable', sans-serif !important;
  letter-spacing: 0.02em;
}

.tab-subtitle {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.65rem;
  opacity: 0.4;
  margin-left: 8px;
  font-weight: 400;
  letter-spacing: 0.05em;
}

.premium-sub-tabs :deep(.v-tab__slider) {
  display: none !important;
}

.trailing-area {
  flex-shrink: 0;
  margin-left: 16px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Tablet — 폰트/간격 축소 */
@media (max-width: 1200px) {
  .tab-subtitle { font-size: 0.6rem; margin-left: 6px; }
  .sub-tab-title { font-size: 0.78rem; }
  .trailing-area { margin-left: 12px; gap: 6px; }
}

/* smAndDown — trailing slot 이 있을 때만 두 줄로 wrap. 없으면 wrap 안 함. */
@media (max-width: 900px) {
  .sub-tab-row:not(.sub-tab-row--no-trailing) {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .sub-tab-row:not(.sub-tab-row--no-trailing) .premium-sub-tabs {
    flex: 1 1 100%;
    order: 1;
  }
  .trailing-area {
    order: 2;
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
}

/* xs — 4개 탭이 좁은 폭에 모두 보이도록 패딩/폰트 축소 + 화살표 숨김 */
@media (max-width: 600px) {
  .sub-tab-title { font-size: 0.72rem; }
  .sub-tab-item {
    min-height: 32px !important;
    height: 32px !important;
    padding: 0 8px !important;
  }
  .premium-sub-tabs :deep(.v-slide-group__content) {
    gap: 4px;
  }
  /* 좌우 < > 화살표 영역 제거 — 모바일은 스와이프로 충분 */
  .premium-sub-tabs :deep(.v-slide-group__prev),
  .premium-sub-tabs :deep(.v-slide-group__next) {
    display: none !important;
  }
  .trailing-area {
    justify-content: stretch;
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
