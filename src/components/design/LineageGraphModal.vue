<script setup>
/**
 * [D — 2026-05] Design ↔ PRD Story Lineage 그래프 시각화 모달.
 *
 * vis-network 로 DERIVED_FROM 관계 그리기. Design 노드 (Entity/Aggregate/
 * ArchService) 와 PRD Story 가 어떻게 연결됐는지 한 화면에서 분석.
 *
 * Props:
 *   modelValue: open 여부
 *   focusStoryId: 선택적 — 특정 Story 중심 (e.g. 'story_01_1')
 *
 * BE: GET /api/v2/graph/lineage (PrdTab graph modal 의 패턴 그대로)
 */
import { ref, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Link2, Table2, Loader2, ChevronDown, ChevronRight, Download } from 'lucide-vue-next'
import axios from '@/utils/axios'
import { useHarnessStore } from '@/store/harness'
import { downloadBlob } from '@/utils/download'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  focusStoryId: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'switch-view'])

const harnessStore = useHarnessStore()
const { t } = useI18n()
const tt = (key, params) => t(`design.lgraph.${key}`, params || {})

const loading = ref(false)
const error = ref('')
const selectedNode = ref(null)
const selectedEdge = ref(null)
const showAllProps = ref(false)
let _network = null
// [2026-06] 다운로드용 — loadGraph 가 가져온 lineage 그래프(nodes/edges) 보관(추적성 Excel).
const _lin = ref({ nodes: null, edges: null })
const canDownload = computed(() => !loading.value && !error.value && Array.isArray(_lin.value.nodes) && _lin.value.nodes.length > 0)

// inspector 표시용 — 우선 노출할 핵심 필드. 노드 종류별로 의미있는 필드만.
const PRIMARY_FIELDS = ['name', 'title', 'summary', 'description', 'goal', 'kind', 'tech', 'protocol']
// dump 에서 항상 숨길 필드 (이미 별도 row 로 표시 / 노이즈)
const HIDDEN_FIELDS = new Set(['id', 'project', 'updated_at', 'created_at', 'lineage_confidence', 'lineage_story_count'])

const nodePrimary = computed(() => {
  const p = selectedNode.value?.raw?.properties || {}
  const out = []
  for (const k of PRIMARY_FIELDS) {
    const v = p[k]
    if (v !== undefined && v !== null && String(v).trim()) out.push({ key: k, value: v })
  }
  return out
})

const nodeStoryCount = computed(() => {
  const p = selectedNode.value?.raw?.properties || {}
  const c = Number(p.lineage_story_count)
  return Number.isFinite(c) && c > 0 ? c : null
})

const nodeAllProps = computed(() => {
  const p = selectedNode.value?.raw?.properties || {}
  const primaryKeys = new Set(PRIMARY_FIELDS)
  return Object.entries(p)
    .filter(([k]) => !HIDDEN_FIELDS.has(k) && !primaryKeys.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
})

watch(selectedNode, () => { showAllProps.value = false })
watch(selectedEdge, () => { showAllProps.value = false })

const close = () => {
  if (_network) {
    _network.destroy()
    _network = null
  }
  selectedNode.value = null
  selectedEdge.value = null
  emit('update:modelValue', false)
}

/** Lineage → 추적성 xlsx(Elements + Traceability 2시트) 다운로드 — 그래프를 보면서 바로. */
const downloadExcel = async () => {
  if (!canDownload.value) return
  try {
    // xlsx 는 무거운 라이브러리 — 다운로드 클릭 시에만 동적 로드(초기 번들에서 분리).
    const { buildLineageWorkbook, lineageWorkbookToArrayBuffer } = await import('@/utils/lineageExcel')
    const wb = buildLineageWorkbook(_lin.value.nodes || [], _lin.value.edges || [])
    const blob = new Blob([lineageWorkbookToArrayBuffer(wb)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    downloadBlob(blob, `${harnessStore.projectName || 'lineage'}_lineage.xlsx`)
  } catch (e) {
    console.error('[Lineage] Excel 다운로드 실패:', e)
  }
}

// 노드 라벨별 색
const NODE_COLORS = {
  Entity: '#4CAF50',
  Aggregate: '#6366F1',
  ArchService: '#0EA5E9',
  API: '#ec4899',          // [2026-06-13] IMPLEMENTS lineage 표시 후 API 가 회색이던 것 → 핑크
  ArchDatabase: '#64748b', // DB(Primary RDBMS/Redis 등) — 회색 폴백 대신 슬레이트
  Story: '#fb923c',
  Epic: '#f59e0b',
}

// 엣지 confidence 별 색
const EDGE_STYLES = {
  direct: { color: '#4CAF50', dashes: false, width: 2 },
  inferred: { color: '#FFB570', dashes: [5, 5], width: 2 },
}

const loadGraph = async () => {
  loading.value = true
  error.value = ''
  selectedNode.value = null
  selectedEdge.value = null

  const project = harnessStore.projectName
  if (!project) {
    error.value = tt('err_no_project')
    loading.value = false
    return
  }

  try {
    const params = { project_name: project }
    if (props.focusStoryId) params.focus_story_id = props.focusStoryId

    const { data } = await axios.get('/api/v2/graph/lineage', { params })

    if (!data?.nodes || data.nodes.length === 0) {
      // [2026-05] BE reason 별 정확한 안내 분기
      const reason = data?.reason
      if (props.focusStoryId) {
        error.value = tt('err_focus_no_nodes', { id: props.focusStoryId })
      } else if (reason === 'no_design') {
        error.value = tt('err_no_design')
      } else if (reason === 'no_lineage') {
        error.value = tt('err_no_lineage')
      } else {
        error.value = tt('err_no_lineage_generic')
      }
      loading.value = false
      return
    }

    _lin.value = { nodes: data.nodes, edges: data.edges || [] }   // 다운로드(추적성 Excel)용 보관

    const { Network, DataSet } = await import('vis-network/standalone')

    const visNodes = new DataSet(
      data.nodes.map((n) => {
        const label = n.properties?.name || n.properties?.summary || n.id
        const isStory = n.label === 'Story' || n.label === 'Epic'
        return {
          id: n.id,
          label,
          title: `${n.label}: ${n.id}`,
          color: NODE_COLORS[n.label] || '#94a3b8',
          shape: isStory ? 'box' : 'dot',
          size: n.label === 'Story' ? 24 : 18,
          raw: n,
        }
      }),
    )

    const visEdges = new DataSet(
      data.edges.map((e, i) => {
        // [2026-06-13] IMPLEMENTS(API→Story)도 lineage 엣지 — confidence 스타일 적용.
        // (이전엔 DERIVED_FROM 만 lineage 취급해 API 엣지가 회색 + 'IMPLEMENTS' 라벨로 노이즈)
        const isLineage = e.type === 'DERIVED_FROM' || e.type === 'IMPLEMENTS'
        const confidence = e.properties?.confidence
        const style = isLineage ? (EDGE_STYLES[confidence] || EDGE_STYLES.inferred) : null
        return {
          id: `e_${i}`,
          from: e.source_id,
          to: e.target_id,
          label: isLineage ? '' : e.type,  // lineage 는 색깔로 구분, 텍스트 노이즈 제거
          arrows: 'to',
          color: style?.color || '#94a3b8',
          dashes: style?.dashes || false,
          width: style?.width || 1,
          raw: e,
        }
      }),
    )

    // [버그 수정 — 2026-05]
    // loading=true 동안엔 템플릿의 v-else (modal-body) 가 렌더되지 않아
    // #lineage-graph-container 가 DOM 에 없음. nextTick 전에 loading 해제 필수.
    loading.value = false
    await nextTick()
    const container = document.getElementById('lineage-graph-container')
    if (!container) {
      error.value = tt('err_no_container')
      return
    }

    // [추가 fix — 2026-05]
    // VDialog fullscreen transition 도중엔 컨테이너 clientHeight 가 0 이라
    // vis-network 가 캔버스 크기를 0×0 으로 만들고 아무것도 그리지 않음.
    // 컨테이너가 양수 크기를 갖출 때까지 폴링 (최대 ~1s).
    for (let i = 0; i < 20 && (container.clientHeight === 0 || container.clientWidth === 0); i++) {
      await new Promise((r) => setTimeout(r, 50))
    }

    if (_network) _network.destroy()
    _network = new Network(
      container,
      { nodes: visNodes, edges: visEdges },
      {
        // 명시적 100% — vis 가 자체 측정으로 무한 grow 하는 케이스 방지
        height: '100%',
        width: '100%',
        autoResize: true,
        physics: {
          enabled: true,
          stabilization: { iterations: 120 },
          barnesHut: { gravitationalConstant: -3000, springLength: 120 },
        },
        nodes: { font: { size: 12 }, borderWidth: 2 },
        edges: { smooth: { type: 'continuous' }, font: { size: 10, align: 'middle' } },
        interaction: { hover: true, tooltipDelay: 300 },
      },
    )

    // stabilization 끝나면 모든 노드 화면에 맞게 fit — width=0 race 대비책.
    _network.once('stabilizationIterationsDone', () => {
      try { _network.fit() } catch {}
    })

    _network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const node = visNodes.get(params.nodes[0])
        selectedNode.value = node
        selectedEdge.value = null
      } else if (params.edges.length > 0) {
        const edge = visEdges.get(params.edges[0])
        selectedEdge.value = edge
        selectedNode.value = null
      }
    })
  } catch (err) {
    error.value = tt('err_load_failed', { reason: err.message || err })
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (open) {
    loadGraph()
  } else if (_network) {
    _network.destroy()
    _network = null
  }
})
</script>

<template>
  <VDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    fullscreen
    transition="dialog-transition"
  >
    <VCard class="lineage-graph-modal">
      <div class="modal-header">
        <div class="modal-title">
          <Link2 :size="18" />
          <div class="modal-title-text">
            <div class="modal-title-main">
              <span>Lineage Graph</span>
              <span v-if="focusStoryId" class="modal-focus">— focus: {{ focusStoryId }}</span>
            </div>
            <div class="modal-title-sub">
              {{ $t('design.lgraph.title_sub') }}
            </div>
          </div>
        </div>
        <!-- [2026-06] Lineage ↔ ERD 뷰 토글 — 한 진입점에서 두 그래프 전환 -->
        <div class="view-toggle" role="tablist">
          <button type="button" class="view-toggle__btn is-active" role="tab" @click="emit('switch-view', 'lineage')"><Link2 :size="13" />Lineage</button>
          <button type="button" class="view-toggle__btn" role="tab" @click="emit('switch-view', 'erd')"><Table2 :size="13" />ERD</button>
        </div>
        <button
          v-if="canDownload"
          type="button"
          class="lg-dl-btn"
          @click="downloadExcel"
          :aria-label="tt('download_excel_aria')"
        ><Download :size="14" /><span>{{ tt('download_excel') }}</span></button>
        <button class="modal-close" @click="close"><X :size="20" /></button>
      </div>

      <div v-if="loading" class="modal-loading">
        <Loader2 class="spin" :size="32" />
        <span>{{ $t('design.lgraph.loading') }}</span>
      </div>

      <div v-else-if="error" class="modal-error">{{ error }}</div>

      <div v-else class="modal-body">
        <div id="lineage-graph-container" class="graph-area"></div>
        <div class="legend">
          <!-- ─── 인트로: 이 그래프가 뭔지 한눈에 ───────────── -->
          <div class="legend-intro">
            <div class="legend-intro-title">{{ $t('design.lgraph.intro_title') }}</div>
            <div class="legend-intro-text" v-html="$t('design.lgraph.intro_text')"></div>
          </div>

          <!-- ─── 노드 (각 동그라미/박스가 뭘 의미하는지) ─────── -->
          <div class="legend-section">
            <div class="legend-title">{{ $t('design.lgraph.node_section') }}</div>

            <div class="legend-item-detailed">
              <div class="legend-row"><span class="dot" style="background:#4CAF50"></span><strong>Entity</strong></div>
              <div class="legend-desc" v-html="$t('design.lgraph.node_entity_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row"><span class="dot" style="background:#6366F1"></span><strong>Aggregate</strong></div>
              <div class="legend-desc" v-html="$t('design.lgraph.node_aggregate_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row"><span class="dot" style="background:#0EA5E9"></span><strong>Service</strong></div>
              <div class="legend-desc" v-html="$t('design.lgraph.node_service_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row"><span class="dot" style="background:#ec4899"></span><strong>API</strong></div>
              <div class="legend-desc" v-html="$t('design.lgraph.node_api_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row"><span class="dot" style="background:#64748b"></span><strong>Database</strong></div>
              <div class="legend-desc" v-html="$t('design.lgraph.node_db_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row"><span class="box" style="background:#fb923c"></span><strong>Story</strong></div>
              <div class="legend-desc" v-html="$t('design.lgraph.node_story_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row"><span class="box" style="background:#f59e0b"></span><strong>Epic</strong></div>
              <div class="legend-desc" v-html="$t('design.lgraph.node_epic_desc')"></div>
            </div>
          </div>

          <!-- ─── 엣지 (선이 뭘 의미하는지) ───────────────── -->
          <div class="legend-section">
            <div class="legend-title">{{ $t('design.lgraph.edge_section') }}</div>

            <div class="legend-item-detailed">
              <div class="legend-row">
                <span class="edge-line" style="background:#4CAF50"></span>
                <strong>direct</strong>
                <span class="legend-badge legend-badge--ok">{{ $t('design.lgraph.badge_high') }}</span>
              </div>
              <div class="legend-desc" v-html="$t('design.lgraph.edge_direct_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row">
                <span class="edge-line dashed" style="background:#FFB570"></span>
                <strong>inferred</strong>
                <span class="legend-badge legend-badge--warn">{{ $t('design.lgraph.badge_review') }}</span>
              </div>
              <div class="legend-desc" v-html="$t('design.lgraph.edge_inferred_desc')"></div>
            </div>

            <div class="legend-item-detailed">
              <div class="legend-row">
                <span class="edge-line" style="background:#94a3b8"></span>
                <strong>CONTAINS</strong>
              </div>
              <div class="legend-desc" v-html="$t('design.lgraph.edge_contains_desc')"></div>
            </div>
          </div>

          <!-- ─── 사용법 팁 ─────────────────────────── -->
          <div class="legend-tip">
            <div class="legend-tip-title">{{ $t('design.lgraph.tip_title') }}</div>
            <ul class="legend-tip-list">
              <li v-html="$t('design.lgraph.tip1')"></li>
              <li v-html="$t('design.lgraph.tip2')"></li>
              <li v-html="$t('design.lgraph.tip3')"></li>
              <li v-html="$t('design.lgraph.tip4')"></li>
            </ul>
          </div>
        </div>

        <div v-if="selectedNode" class="inspector">
          <div class="inspector-title">{{ $t('design.lgraph.insp_node') }}</div>
          <div class="inspector-row">
            <span class="inspector-label">id:</span>
            <code>{{ selectedNode.id }}</code>
          </div>
          <div class="inspector-row">
            <span class="inspector-label">label:</span>
            <code>{{ selectedNode.raw?.label }}</code>
          </div>
          <div v-if="selectedNode.raw?.properties?.lineage_confidence" class="inspector-row">
            <span class="inspector-label">confidence:</span>
            <code>{{ selectedNode.raw.properties.lineage_confidence }}</code>
          </div>
          <div v-if="nodeStoryCount" class="inspector-row">
            <span class="inspector-label">{{ $t('design.lgraph.insp_prd_basis') }}</span>
            <code>{{ $t('design.lgraph.insp_story_linked', { n: nodeStoryCount }) }}</code>
          </div>
          <div
            v-for="row in nodePrimary"
            :key="row.key"
            class="inspector-row inspector-row--text"
          >
            <span class="inspector-label">{{ row.key }}:</span>
            <span class="inspector-value">{{ row.value }}</span>
          </div>

          <!-- 전체 속성 토글 — 나머지 raw.properties dump -->
          <button
            v-if="nodeAllProps.length"
            type="button"
            class="inspector-toggle"
            @click="showAllProps = !showAllProps"
          >
            <component :is="showAllProps ? ChevronDown : ChevronRight" :size="12" />
            <span>{{ $t('design.lgraph.insp_all_props', { n: nodeAllProps.length }) }}</span>
          </button>
          <div v-if="showAllProps" class="inspector-all-props">
            <div
              v-for="[k, v] in nodeAllProps"
              :key="k"
              class="inspector-row inspector-row--text"
            >
              <span class="inspector-label">{{ k }}:</span>
              <span class="inspector-value">{{ typeof v === 'object' ? JSON.stringify(v) : v }}</span>
            </div>
          </div>
        </div>

        <div v-if="selectedEdge" class="inspector">
          <template v-if="selectedEdge.raw?.type === 'DERIVED_FROM'">
            <div class="inspector-title">{{ $t('design.lgraph.insp_lineage_edge') }}</div>
            <div class="inspector-row">
              <span class="inspector-label">from:</span>
              <code>{{ selectedEdge.raw?.source_id }}</code>
            </div>
            <div class="inspector-row">
              <span class="inspector-label">to:</span>
              <code>{{ selectedEdge.raw?.target_id }}</code>
            </div>
            <div class="inspector-row">
              <span class="inspector-label">confidence:</span>
              <code>{{ selectedEdge.raw.properties?.confidence || '—' }}</code>
            </div>
            <div v-if="selectedEdge.raw.properties?.quote" class="inspector-row inspector-row--text">
              <span class="inspector-label">{{ $t('design.lgraph.insp_prd_quote') }}</span>
              <span class="inspector-quote">"{{ selectedEdge.raw.properties.quote }}"</span>
            </div>
          </template>
          <template v-else>
            <div class="inspector-title">{{ $t('design.lgraph.insp_edge') }}</div>
            <div class="inspector-row">
              <span class="inspector-label">type:</span>
              <code>{{ selectedEdge.raw?.type }}</code>
            </div>
            <div class="inspector-row">
              <span class="inspector-label">from:</span>
              <code>{{ selectedEdge.raw?.source_id }}</code>
            </div>
            <div class="inspector-row">
              <span class="inspector-label">to:</span>
              <code>{{ selectedEdge.raw?.target_id }}</code>
            </div>
          </template>
        </div>
      </div>
    </VCard>
  </VDialog>
</template>

<style scoped>
.lineage-graph-modal {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
  /* vis-network canvas 가 부모를 무한히 grow 시키는 flex overflow 방지 */
  overflow: hidden;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  row-gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #E5E7EB;
  background: #F9FAFB;
}
/* Lineage ↔ ERD 뷰 토글 (밝은 헤더용) */
.view-toggle { display: inline-flex; gap: 2px; background: #EFEDE6; border: 1px solid #E3D5BD; border-radius: 8px; padding: 2px; }
.view-toggle__btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px;
  border: none; background: transparent; color: #7A6A55; font-size: 12px; font-weight: 600;
  border-radius: 6px; cursor: pointer;
}
.view-toggle__btn.is-active { background: #8C6239; color: #fff; }
.view-toggle__btn:not(.is-active):hover { background: #E3D5BD; }
.lg-dl-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
  border: 1px solid #E3D5BD; background: #fff; color: #8C6239;
  font-size: 12px; font-weight: 600; border-radius: 8px; cursor: pointer;
}
.lg-dl-btn:hover { background: #FBF1DD; }
.modal-title {
  display: inline-flex;
  align-items: flex-start;
  gap: 10px;
  color: #1A1A1A;
}
.modal-title > svg { margin-top: 3px; flex-shrink: 0; }
.modal-title-text { display: flex; flex-direction: column; gap: 2px; }
.modal-title-main {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.modal-title-sub {
  font-size: 11.5px;
  font-weight: 400;
  color: #6B7280;
  line-height: 1.4;
}
.modal-focus {
  font-size: 12px;
  color: #6B7280;
  font-weight: 400;
  margin-left: 4px;
}
.modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  /* [2026-05-30] 터치 타겟 ≥40px — 모바일에서 닫기 버튼을 놓치지 않게. */
  padding: 8px;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #4B5563;
  align-self: flex-start;
}
.modal-close:hover { background: #E5E7EB; }

.modal-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #6B7280;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.modal-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #DC2626;
  padding: 20px;
  font-size: 14px;
  text-align: center;
}

.modal-body {
  flex: 1;
  /* flex item 의 default min-height: auto 는 콘텐츠가 부모를 늘리도록 허용함.
     0 으로 override 해야 vis-network canvas grow 와의 race 가 안 생김. */
  min-height: 0;
  position: relative;
  display: flex;
}
.graph-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: #FAFAFA;
}
.legend {
  width: 280px;
  border-left: 1px solid #E5E7EB;
  padding: 16px 14px;
  background: #fff;
  overflow-y: auto;
}

/* [2026-05-30] 모바일 — 280px 가로 legend 가 폰에서 그래프 영역을 다 잡아먹음.
   세로 스택으로: 그래프가 위(남는 공간), legend 는 하단 스크롤(최대 40%). */
@media (max-width: 600px) {
  .modal-body { flex-direction: column; }
  .legend {
    width: 100%;
    max-height: 40%;
    border-left: none;
    border-top: 1px solid #E5E7EB;
  }
}

/* ─── 인트로 카드 — "이 그래프는?" ─────────────────────── */
.legend-intro {
  background: linear-gradient(135deg, #f5f3ff 0%, #faf5ff 100%);
  border: 1px solid #e9d5ff;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 18px;
}
.legend-intro-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #6b21a8;
  margin-bottom: 8px;
}
.legend-intro-text {
  font-size: 11.5px;
  line-height: 1.65;
  color: #4b5563;
}
.legend-intro-text :deep(strong) {
  color: #1f2937;
  font-weight: 700;
}

.legend-section { margin-bottom: 18px; }
.legend-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6B7280;
  margin-bottom: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f3f4f6;
}

/* 기존 단순 legend-item — fallback (혹시 다른 곳에서 사용 시) */
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  margin-bottom: 6px;
}

/* 신규: 디테일한 legend item — 색 + 이름 + 설명 한 줄 */
.legend-item-detailed {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #f3f4f6;
}
.legend-item-detailed:last-child {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: #111827;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.legend-row strong { font-weight: 700; }
.legend-desc {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.55;
  padding-left: 18px;
}
.legend-desc :deep(strong) {
  color: #374151;
  font-weight: 600;
}

.legend-badge {
  display: inline-flex;
  align-items: center;
  font-size: 9.5px;
  padding: 1px 6px;
  border-radius: 9999px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.legend-badge--ok {
  background: #d1fae5;
  color: #065f46;
}
.legend-badge--warn {
  background: #fef3c7;
  color: #92400e;
}

.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
.box { display: inline-block; width: 12px; height: 9px; border-radius: 2px; }
.edge-line {
  display: inline-block;
  width: 22px; height: 3px; border-radius: 1px;
}
.edge-line.dashed {
  background: repeating-linear-gradient(90deg, #FFB570 0 4px, transparent 4px 7px) !important;
}

/* ─── 사용법 팁 박스 ─────────────────────────────── */
.legend-tip {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 4px;
}
.legend-tip-title {
  font-size: 12px;
  font-weight: 700;
  color: #92400e;
  margin-bottom: 8px;
}
.legend-tip-list {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.7;
  color: #78350f;
}
.legend-tip-list li { margin-bottom: 4px; }
.legend-tip-list :deep(strong) { color: #1f2937; font-weight: 700; }

.inspector {
  position: absolute;
  bottom: 16px;
  left: 16px;
  background: #fff;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  padding: 12px 14px;
  width: 360px;
  max-width: calc(100% - 32px);
  max-height: calc(100% - 32px);
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  font-size: 12px;
}
.inspector-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #6B7280;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #E5E7EB;
}
.inspector-row { margin: 4px 0; }
.inspector-row--text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inspector-label { color: #6B7280; margin-right: 6px; }
.inspector-row code {
  background: #F3F4F6;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: ui-monospace, 'SF Mono', monospace;
  color: #2563EB;
}
.inspector-value {
  color: #374151;
  word-break: break-word;
  white-space: pre-wrap;
}
.inspector-quote {
  display: block;
  margin-top: 4px;
  padding: 6px 8px;
  background: #FAFAFA;
  border-left: 2px solid #2563EB;
  color: #374151;
  font-style: italic;
  word-break: break-word;
}
.inspector-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid #E5E7EB;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: #4B5563;
}
.inspector-toggle:hover { background: #F9FAFB; }
.inspector-all-props {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #E5E7EB;
}
</style>
