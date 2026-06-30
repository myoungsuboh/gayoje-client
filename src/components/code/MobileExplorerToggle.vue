<script setup>
/**
 * 모바일에서 file explorer 토글 버튼.
 *
 * 데스크탑 (>768px) 에서는 자체 CSS 로 hidden. 모바일 viewport 에서만 노출.
 *
 * Props:
 *   open       — v-model:open (file explorer 표시 여부)
 *
 * Emits:
 *   update:open (bool)
 */
import { FolderOpen } from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const toggle = () => emit('update:open', !props.open)
</script>

<template>
  <button
    type="button"
    class="mobile-explorer-toggle"
    :aria-expanded="open"
    :aria-label="open ? $t('code.mobile_toggle.aria_close') : $t('code.mobile_toggle.aria_open')"
    @click="toggle"
  >
    <FolderOpen :size="14" class="mr-2" aria-hidden="true" />{{ $t('code.mobile_toggle.label') }}
    <VIcon :icon="open ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" class="ml-1" />
  </button>
</template>

<style scoped>
/* 데스크탑 기본: 숨김 */
.mobile-explorer-toggle { display: none; }

/* 768px 이하: 표시 */
@media (max-width: 768px) {
  .mobile-explorer-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 10px 16px;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    background: var(--bg-card);
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 8px;
  }
}
</style>
