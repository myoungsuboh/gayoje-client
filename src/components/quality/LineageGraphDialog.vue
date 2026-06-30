<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Copy, Check, ZoomIn, ZoomOut, RotateCw } from 'lucide-vue-next'
import { useSnackbar } from '@/composables/useSnackbar'
import { buildMermaid, buildGraphLayout, LINEAGE_CATEGORY_COLOR } from '@/utils/lineageGraph'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  lineageData: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])
const { showSuccess } = useSnackbar()

const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const view = ref('svg') // 'svg' | 'mermaid'
const zoom = ref(1)
const maxFiles = ref(3)

const layout = computed(() => buildGraphLayout(props.lineageData, { maxFilesPerItem: maxFiles.value }))
const mermaidText = computed(() => buildMermaid(props.lineageData, { maxFilesPerItem: maxFiles.value }))

// node id → coords lookup (엣지 곡선 계산용)
const nodeById = computed(() => {
  const m = new Map()
  for (const n of layout.value.nodes) m.set(n.id, n)
  return m
})

const edgePath = (e) => {
  const a = nodeById.value.get(e.from)
  const b = nodeById.value.get(e.to)
  if (!a || !b) return ''
  // 시작점: 노드 오른쪽 가장자리, 끝점: 노드 왼쪽 가장자리
  const x1 = a.x + NODE_W
  const y1 = a.y + NODE_H / 2
  const x2 = b.x
  const y2 = b.y + NODE_H / 2
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

const NODE_W = 170
const NODE_H = 32

const copied = ref(false)
const copyMermaid = async () => {
  try {
    await navigator.clipboard.writeText(mermaidText.value)
    copied.value = true
    showSuccess(t('quality.graph.mermaid_copied'))
    setTimeout(() => { copied.value = false }, 2000)
  } catch (e) {
    showSuccess(t('quality.graph.copy_failed', { message: e.message }))
  }
}

const resetZoom = () => { zoom.value = 1 }
const zoomIn = () => { zoom.value = Math.min(2.5, zoom.value + 0.2) }
const zoomOut = () => { zoom.value = Math.max(0.4, zoom.value - 0.2) }

// 카테고리 컬럼 라벨 (SVG 상단 표시)
const headerLabels = computed(() => {
  if (!layout.value.categories) return []
  return [
    ...layout.value.categories.map(c => ({ label: c.label, x: c.x, color: LINEAGE_CATEGORY_COLOR[c.key] })),
    { label: 'Files', x: layout.value.fileColumnX, color: LINEAGE_CATEGORY_COLOR.files },
  ]
})

watch(() => props.modelValue, (v) => { if (v) { zoom.value = 1; view.value = 'svg' } })
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="1100" role="dialog" :aria-label="$t('quality.graph.dialog_aria')" @update:model-value="(v) => emit('update:modelValue', v)" @keydown.esc="isOpen = false">
    <v-card class="lg-card">
      <div class="lg-head">
        <h3 class="lg-title">{{ $t('quality.graph.title') }}</h3>
        <div class="lg-head-actions">
          <button type="button" class="lg-tab" :class="{ active: view === 'svg' }" :aria-pressed="view === 'svg'" @click="view = 'svg'">{{ $t('quality.graph.tab_svg') }}</button>
          <button type="button" class="lg-tab" :class="{ active: view === 'mermaid' }" :aria-pressed="view === 'mermaid'" @click="view = 'mermaid'">{{ $t('quality.graph.tab_mermaid') }}</button>
          <button type="button" class="lg-close" :aria-label="$t('common.action.close')" @click="isOpen = false">
            <X :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="lg-body">
        <div class="lg-controls">
          <label class="lg-ctrl-label">
            {{ $t('quality.graph.files_per_node') }}
            <input type="number" v-model.number="maxFiles" min="1" max="20" class="lg-input" :aria-label="$t('quality.graph.files_per_node_aria')" />
          </label>
          <template v-if="view === 'svg'">
            <button type="button" class="lg-btn" :aria-label="$t('quality.graph.zoom_out')" @click="zoomOut"><ZoomOut :size="13" aria-hidden="true" /></button>
            <span class="lg-zoom mono-text">{{ Math.round(zoom * 100) }}%</span>
            <button type="button" class="lg-btn" :aria-label="$t('quality.graph.zoom_in')" @click="zoomIn"><ZoomIn :size="13" aria-hidden="true" /></button>
            <button type="button" class="lg-btn" :aria-label="$t('quality.graph.zoom_reset')" @click="resetZoom"><RotateCw :size="13" aria-hidden="true" /></button>
          </template>
          <button v-if="view === 'mermaid'" type="button" class="lg-btn lg-btn--primary" @click="copyMermaid">
            <Check v-if="copied" :size="12" aria-hidden="true" />
            <Copy v-else :size="12" aria-hidden="true" />
            {{ copied ? $t('common.action.copied') : $t('common.action.copy') }}
          </button>
        </div>

        <!-- SVG VIEW -->
        <div v-if="view === 'svg'" class="lg-svg-wrap custom-scroll">
          <div v-if="!layout.nodes.length" class="lg-empty">
            <p>{{ $t('quality.graph.empty') }}</p>
          </div>
          <svg v-else
            :viewBox="`0 0 ${layout.width} ${layout.height + 40}`"
            :style="{ width: `${layout.width * zoom}px`, height: `${(layout.height + 40) * zoom}px` }"
            role="img" :aria-label="$t('quality.graph.graph_aria')"
          >
            <!-- 카테고리 헤더 -->
            <g v-for="(h, i) in headerLabels" :key="i">
              <text :x="h.x + 85" y="20" text-anchor="middle"
                class="lg-col-label" :fill="h.color">{{ h.label }}</text>
            </g>

            <!-- 엣지 -->
            <g class="lg-edges" transform="translate(0, 30)">
              <path v-for="(e, i) in layout.edges" :key="`e-${i}`"
                :d="edgePath(e)"
                :stroke="e.dashed ? '#C0392B' : '#8C6239'"
                :stroke-dasharray="e.dashed ? '4 3' : ''"
                stroke-width="1.5"
                fill="none"
                opacity="0.6"
              />
            </g>

            <!-- 노드 -->
            <g class="lg-nodes" transform="translate(0, 30)">
              <g v-for="n in layout.nodes" :key="n.id" :transform="`translate(${n.x}, ${n.y})`">
                <title>{{ n.title || n.label }}</title>
                <rect :width="170" :height="32" rx="6" :fill="n.color" stroke="#2A2421" stroke-width="0.5" />
                <text x="85" y="20" text-anchor="middle" class="lg-node-text">
                  {{ n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label }}
                </text>
              </g>
            </g>
          </svg>
        </div>

        <!-- MERMAID CODE VIEW -->
        <div v-else class="lg-mermaid-wrap">
          <p class="lg-mermaid-help" v-html="$t('quality.graph.mermaid_help_html')"></p>
          <pre class="lg-mermaid-pre mono-text">{{ mermaidText }}</pre>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.lg-card { border-radius: 16px; overflow: hidden; }
.lg-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 22px;
  background: linear-gradient(135deg, #2E4036 0%, #1F2D27 100%);
  color: white;
}
.lg-title { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1rem; margin: 0; }
.lg-head-actions { display: flex; align-items: center; gap: 6px; }
.lg-tab {
  background: rgba(255,255,255,0.1); color: white; border: none;
  padding: 6px 14px; border-radius: 9999px; cursor: pointer;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.lg-tab.active { background: rgba(255,255,255,0.95); color: var(--primary-moss); }
.lg-tab:not(.active):hover { background: rgba(255,255,255,0.2); }
.lg-close {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: rgba(255,255,255,0.15); color: white;
  display: flex; align-items: center; justify-content: center; cursor: pointer; margin-left: 4px;
}
.lg-close:hover { background: rgba(255,255,255,0.3); }

.lg-body { padding: 16px 20px 22px; }
.lg-controls {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 12px; padding: 10px 12px;
  background: var(--bg-light); border-radius: 8px;
  font-size: 0.78rem;
}
.lg-ctrl-label { display: inline-flex; align-items: center; gap: 6px; font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--text-main); }
.lg-input { width: 56px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-light); font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; text-align: center; }
.lg-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: white; border: 1px solid var(--border-light); border-radius: 9999px;
  padding: 5px 11px; cursor: pointer;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--accent); transition: all .12s;
}
.lg-btn:hover { background: var(--accent); color: white; border-color: var(--accent); }
.lg-btn--primary { background: var(--accent); color: white; border-color: var(--accent); }
.lg-btn--primary:hover { opacity: 0.88; }
.lg-zoom { font-size: 0.72rem; color: var(--text-muted); min-width: 44px; text-align: center; }

.lg-svg-wrap {
  background: #FCFAEE; border: 1px solid var(--border-light); border-radius: 10px;
  overflow: auto; max-height: 540px; padding: 12px;
}
.lg-empty { padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 0.88rem; }
.lg-col-label {
  font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 12px;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.lg-node-text {
  font-family: 'Pretendard Variable', sans-serif; font-weight: 700; font-size: 11px; fill: white;
}

.lg-mermaid-wrap { display: flex; flex-direction: column; gap: 10px; }
.lg-mermaid-help { font-size: 0.8rem; color: var(--text-main); margin: 0; line-height: 1.6; }
.lg-mermaid-help code { background: var(--bg-light); padding: 1px 6px; border-radius: 4px; font-size: 0.74rem; }
.lg-mermaid-pre {
  margin: 0; padding: 14px;
  background: #2A2421; color: #FCFAEE; border-radius: 10px;
  font-size: 0.78rem; max-height: 480px; overflow: auto;
  white-space: pre; line-height: 1.5;
}

.custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
</style>
