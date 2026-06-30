<script setup>
/**
 * File Explorer aside — repo file tree 사이드바.
 *
 * [책임]
 * - tree node 렌더 (folder / file 구분)
 * - file node 클릭 / Enter / Space → emit 'select'
 *
 * [의도적으로 안 하는 것]
 * - file content fetch (page 의 selectFile 책임)
 * - cache hit / race guard (page 책임)
 * - folder.open 토글: page 의 selectFile 안에서 처리 (file.open = !file.open)
 *   → 컴포넌트는 그냥 'select' 만 emit, page 가 folder/file 구분
 * - 모바일 토글 닫기 (page 가 select 받고 mobileExplorerOpen=false)
 *
 * Props:
 *   files          — visibleFileExplorer (page 의 computed)
 *   activeFileId   — 현재 활성 파일 ID (file-node--active 표시)
 *   repoInfo       — { owner, repo } 또는 null (header 표시)
 *   isLoading      — repo loading 중 (loading spinner)
 *   isOpen         — 모바일 열림 (file-explorer--open class)
 *
 * Emits:
 *   select(file)   — file/folder node click/Enter/Space
 */
import { FileCode, FolderOpen, Folder } from 'lucide-vue-next'
import { getIconDot } from '@/utils/githubCode'

defineProps({
  files: { type: Array, default: () => [] },
  activeFileId: { type: [Number, String, null], default: null },
  repoInfo: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
  isOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const onSelect = (item) => emit('select', item)
</script>

<template>
  <aside class="file-explorer" :class="{ 'file-explorer--open': isOpen }">
    <div class="explorer-header d-flex align-center justify-space-between">
      <span class="explorer-title">Explorer</span>
      <span v-if="repoInfo" class="explorer-repo mono-text">
        {{ repoInfo.owner }}/{{ repoInfo.repo }}
      </span>
    </div>

    <!-- Loading -->
    <div
      v-if="isLoading"
      class="d-flex flex-column align-center justify-center pa-8 flex-grow-1"
    >
      <VProgressCircular indeterminate color="accent" size="24" width="2" class="mb-3" />
      <span class="text-caption text-muted">{{ $t('code.explorer.loading') }}</span>
    </div>

    <!-- Empty (no repo loaded) -->
    <div
      v-else-if="files.length === 0"
      class="d-flex flex-column align-center justify-center pa-8 flex-grow-1 opacity-30 text-center"
    >
      <VIcon icon="mdi-source-repository" size="32" color="muted" class="mb-3" />
      <span class="text-caption text-muted" v-html="$t('code.explorer.empty')" />
    </div>

    <!-- File Tree -->
    <div v-else class="explorer-body custom-scroll">
      <div
        v-for="item in files"
        :key="item.id"
        class="file-node"
        :class="{
          'file-node--active': activeFileId === item.id && item.type === 'file',
          'file-node--folder': item.type === 'folder',
        }"
        :style="{ paddingLeft: `${item.depth * 14 + 12}px` }"
        role="button"
        tabindex="0"
        :aria-pressed="activeFileId === item.id && item.type === 'file'"
        :aria-expanded="item.type === 'folder' ? item.open : undefined"
        :aria-label="$t('code.explorer.aria_node', { kind: item.type === 'folder' ? $t('code.explorer.aria_folder') : $t('code.explorer.aria_file'), name: item.name })"
        @click="onSelect(item)"
        @keydown.enter.prevent="onSelect(item)"
        @keydown.space.prevent="onSelect(item)"
      >
        <component
          :is="item.type === 'folder' ? (item.open ? FolderOpen : Folder) : FileCode"
          :size="14"
          class="file-node-icon"
        />
        <span
          v-if="item.type === 'file'"
          class="file-dot"
          :style="{ background: getIconDot(item.icon) }"
        />
        <span class="file-node-name">{{ item.name }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }

.file-explorer {
  width: 260px;
  flex-shrink: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
}
.explorer-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  gap: 8px;
}
.explorer-title {
  font-family: 'Outfit', sans-serif;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  white-space: nowrap;
}
.explorer-repo {
  font-size: 0.6rem;
  color: var(--accent);
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  min-width: 0;
}
.explorer-body { flex: 1; overflow-y: auto; padding: 6px; }

.file-node {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
  margin-bottom: 1px;
  gap: 6px;
}
.file-node:hover { background: var(--bg-light); }
.file-node--active { background: var(--accent) !important; }
.file-node--active .file-node-name,
.file-node--active .file-node-icon { color: white !important; }
.file-node-icon { color: var(--text-muted); flex-shrink: 0; }
.file-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.file-node-name {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-node--folder .file-node-name {
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  font-size: 0.64rem;
  letter-spacing: 0.04em;
}

/* Scrollbars (file-explorer 안만) */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

.opacity-30 { opacity: 0.30; }

@media (max-width: 1024px) {
  .file-explorer { width: 220px; }
}

/* [2026-05-21] 모바일 닫힘 애니메이션 — display:none/flex 토글은 transition 불가
   → max-height/opacity/transform 으로 부드럽게 슬라이드. 닫혀있어도 DOM 에는
   남지만 height 0 + overflow:hidden 으로 layout 영향 없음. */
@media (max-width: 768px) {
  .file-explorer {
    width: 100%;
    border-right: none;
    max-height: 0;
    opacity: 0;
    transform: translateY(-6px);
    overflow: hidden;
    border-bottom: 0 solid var(--border-light);
    margin-bottom: 0;
    transition:
      max-height 0.3s cubic-bezier(.16,1,.3,1),
      opacity 0.2s ease,
      transform 0.25s cubic-bezier(.16,1,.3,1),
      border-bottom-width 0.25s ease,
      margin-bottom 0.25s ease;
  }
  .file-explorer--open {
    max-height: 40vh;
    opacity: 1;
    transform: translateY(0);
    border-bottom-width: 1px;
  }
  /* 사용자가 키보드/접근성 도구로 모션 줄이기 설정 시 즉시 토글 (animation 멀미 방지). */
  @media (prefers-reduced-motion: reduce) {
    .file-explorer { transition: none; }
  }
}
</style>
