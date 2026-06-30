<script setup>
/**
 * PrdNodeEditor — 검수 모드(editable) 에서 PRD 그래프 노드(Epic/Story)의 summary 를
 * ID 기반으로 인라인 수정하는 패널 (PrdTab 에서 분리, 2026-05-27).
 *
 * /api/v2/prd/nodes 로 노드 목록을 받아 표시하고, PATCH 로 개별 summary 저장.
 * 저장 성공 시 'saved' emit → 부모가 SPACK/DDD 점수 재측정 등 후속 처리.
 */
import { watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Edit3, Save, Loader2, X as IconX } from 'lucide-vue-next'
import { useSnackbar } from '@/composables/useSnackbar'
import { useGraphNodeEdit } from '@/composables/useGraphNodeEdit'

const { t } = useI18n()
const { showSuccess, showError } = useSnackbar() ?? {}

const props = defineProps({
  projectName: { type: String, default: '' },
  editable: { type: Boolean, default: false },
})
const emit = defineEmits(['saved', 'update:editing'])

// [2026-06 공통화] 노드 조회/인라인 summary 수정 CRUD 는 useGraphNodeEdit 로 추출
// (CpsTab 인라인 노드편집과 공통). 외형(template/CSS)은 이 컴포넌트가 그대로 보유.
const {
  graphNodes,
  isLoadingNodes,
  editingNodeId,
  editingNodeSummary,
  isSavingNode,
  startEditNode,
  cancelEditNode,
  saveEditNode,
} = useGraphNodeEdit({
  getProjectName: () => props.projectName,
  getEditable: () => props.editable,
  nodesPath: '/api/v2/prd/nodes',
  onSummaryEmpty: () => showError?.(t('prd.node_editor.summary_empty')),
  onSummaryTooLarge: () => showError?.(t('prd.node_editor.summary_too_large')),
  onSaveOk: (node) => showSuccess?.(t('prd.node_editor.save_ok', { label: node.label })),
  onSaveFail: () => showError?.(t('prd.node_editor.save_fail')),
  onSaved: () => emit('saved'),
  logLabel: 'PRD nodes',
})

// [편집 가드 — 2026-06] 노드 인라인 편집 중(editingNodeId 설정됨) 상태를 부모로 올린다.
// CpsTab 의 인라인 노드편집(isAnyEditing)과 동일 패턴 — plan.vue 가 탭/스텝 이동 시
// '저장 안 된 변경' confirm 을 띄우는 데 사용. PrdNodeEditor 는 별도 컴포넌트라 #420 범위
// 밖이었던 PRD 그래프 노드 편집을 이 신호로 가드에 편입.
watch(() => editingNodeId.value != null, (v) => emit('update:editing', v), { immediate: true })
// 편집 중 컴포넌트가 unmount(탭 전환 등)되면 watch 가 false 를 못 쏘므로 명시 해제.
onBeforeUnmount(() => emit('update:editing', false))
</script>

<template>
  <div class="graph-edit-panel">
    <div class="d-flex align-center mb-2">
      <VIcon icon="mdi-graph-outline" size="small" color="accent" class="mr-1" />
      <span class="graph-edit-title">Graph ({{ graphNodes.length }})</span>
      <VSpacer />
      <span class="graph-edit-mode">{{ $t('prd.node_editor.edit_mode') }}</span>
    </div>
    <p v-if="!isLoadingNodes && graphNodes.length === 0" class="graph-empty">
      {{ $t('prd.node_editor.empty') }}
    </p>
    <Loader2 v-if="isLoadingNodes" :size="14" class="spinning text-muted" />
    <div v-for="node in graphNodes" :key="node.id" class="graph-node-row">
      <div class="d-flex align-center mb-1">
        <span class="graph-node-pill" :class="{ 'graph-node-pill--story': node.label === 'Story' }">
          {{ node.label }}
        </span>
        <span class="graph-node-id mono-text">{{ node.id }}</span>
        <VSpacer />
        <button
          v-if="editingNodeId !== node.id"
          class="graph-edit-btn"
          type="button"
          @click="startEditNode(node)"
        >
          <Edit3 :size="11" />
        </button>
      </div>
      <textarea
        v-if="editingNodeId === node.id"
        v-model="editingNodeSummary"
        class="graph-node-textarea"
        rows="3"
        :disabled="isSavingNode"
        spellcheck="false"
      />
      <div v-else class="graph-node-summary">{{ node.summary }}</div>
      <div v-if="editingNodeId === node.id" class="d-flex gap-2 mt-1">
        <button
          class="graph-save-btn"
          type="button"
          :disabled="isSavingNode"
          @click="saveEditNode(node)"
        >
          <Loader2 v-if="isSavingNode" :size="11" class="spinning mr-1" />
          <Save v-else :size="11" class="mr-1" />
          {{ $t('common.action.save') }}
        </button>
        <button
          class="graph-cancel-btn"
          type="button"
          :disabled="isSavingNode"
          @click="cancelEditNode"
        >
          <IconX :size="11" class="mr-1" />{{ $t('common.action.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-edit-panel {
  flex-shrink: 0;
  padding: 12px 14px;
  border-top: 1px dashed var(--border-light, rgba(0,0,0,0.12));
  background: #fffaf3;
  max-height: 320px;
  overflow-y: auto;
}
.graph-edit-title {
  font-family: 'Outfit', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-main);
}
.graph-edit-mode {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--accent);
  background: rgba(140,98,57,0.08);
  padding: 1px 6px;
  border-radius: 4px;
}
.graph-empty {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin: 0;
  padding: 4px 0;
}
.graph-node-row {
  padding: 6px 0;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.graph-node-row:last-child { border-bottom: none; }
.graph-node-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #fff3e0;
  color: #8C6239;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  margin-right: 6px;
}
.graph-node-pill--story {
  background: #fce4ec;
  color: #c2185b;
}
.graph-node-id {
  font-size: 0.62rem;
  color: var(--text-muted, #888);
  font-family: 'IBM Plex Mono', monospace;
}
.graph-node-summary {
  font-size: 0.72rem;
  color: var(--text-main);
  line-height: 1.45;
  padding-left: 2px;
  word-break: break-word;
}
.graph-node-textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--accent, #8C6239);
  border-radius: 4px;
  background: #fff;
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--text-main);
  outline: none;
  resize: vertical;
}
.graph-edit-btn,
.graph-save-btn,
.graph-cancel-btn {
  display: inline-flex; align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  background: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--text-main);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.graph-edit-btn:hover:not(:disabled) {
  border-color: var(--accent, #8C6239); color: var(--accent, #8C6239);
}
.graph-save-btn {
  background: var(--accent, #8C6239); color: #fff; border-color: var(--accent, #8C6239);
}
.graph-save-btn:hover:not(:disabled) { background: #6f4d2d; }
.graph-cancel-btn {
  color: #c0362c; border-color: #f5c8c4; background: #fff5f4;
}
.graph-cancel-btn:hover:not(:disabled) {
  border-color: #c0362c; background: #ffe6e3;
}
.graph-edit-btn:disabled,
.graph-save-btn:disabled,
.graph-cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }

@media (max-width: 600px) {
  .graph-edit-panel { padding: 10px 12px; max-height: 250px; }
}
</style>
