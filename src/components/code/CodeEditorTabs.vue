<script setup>
/**
 * 에디터 탭 strip — 열린 파일들 + 활성 표시 + close 버튼.
 *
 * Props:
 *   tabs       — Array<{ id, name, icon, path }>
 *   activePath — 현재 활성 탭의 path (활성 스타일 적용용)
 *
 * Emits:
 *   switch(tab)         — 탭 클릭
 *   close(tabPath, event) — 닫기 버튼 클릭 (event 는 stopPropagation 위해)
 */
import { X } from 'lucide-vue-next'
import { getIconDot } from '@/utils/githubCode'

defineProps({
  tabs: { type: Array, default: () => [] },
  activePath: { type: String, default: '' },
})
const emit = defineEmits(['switch', 'close'])
</script>

<template>
  <div class="editor-tabs custom-scroll-x">
    <div
      v-for="tab in tabs"
      :key="tab.path"
      class="editor-tab"
      :class="{ 'editor-tab--active': activePath === tab.path }"
      @click="emit('switch', tab)"
    >
      <span class="tab-dot" :style="{ background: getIconDot(tab.icon) }" />
      <span class="tab-name">{{ tab.name }}</span>
      <button
        type="button"
        class="tab-close"
        :aria-label="$t('code.tabs.aria_close', { name: tab.name })"
        @click="emit('close', tab.path, $event)"
      >
        <X :size="10" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-card);
  overflow-x: auto;
  flex-shrink: 0;
}
.editor-tab {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  gap: 6px;
  cursor: pointer;
  border-right: 1px solid var(--border-light);
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
}
.editor-tab:hover { background: var(--bg-light); }
.editor-tab--active {
  background: white;
  border-bottom: 2px solid var(--accent);
  margin-bottom: -1px;
}

.tab-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.tab-name {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-main);
}
.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.12s;
}
.editor-tab:hover .tab-close { opacity: 1; }
.tab-close:hover { background: rgba(0, 0, 0, 0.06); }

/* horizontal scrollbar */
.custom-scroll-x::-webkit-scrollbar { height: 4px; }
.custom-scroll-x::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
</style>
