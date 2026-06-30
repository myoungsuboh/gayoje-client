<script setup>
/**
 * [2026-06] ERD (Entity-Relationship) 다이어그램 모달.
 *
 * 데이터 구조를 한 화면에 — SPACK Entity / DDD Aggregate / DomainEntity 를
 * 속성을 가진 박스로, 소속·구성 관계를 선으로 그린다. LineageGraphModal 의
 * vis-network 패턴을 그대로 따르되 데이터 출처가 다르다:
 *   - 새 BE 엔드포인트 없음. 이미 배포된 getSpack + getDDD 를 병렬 호출.
 *   - 평면 모델 빌드는 utils/erdGraph.js (순수·테스트됨), 여기선 vis 매핑만.
 *
 * 브랜드: 브라운 액센트(#8C6239) + 골드(#B8893F) + 크림 박스. (다크 금지)
 */
import { ref, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Table2, Link2, Loader2, X, ChevronDown, ChevronRight, Download } from 'lucide-vue-next'
import axios from '@/utils/axios'
import { API_BASE, useHarnessStore } from '@/store/harness'
import { buildErdModel, buildNodeLabel } from '@/utils/erdGraph'
import { downloadBlob } from '@/utils/download'
import { extractRaw } from '@/utils/designFetch'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'switch-view'])

const harnessStore = useHarnessStore()
const { t } = useI18n()
const tt = (key, params) => t(`design.erd.${key}`, params || {})

const loading = ref(false)
const error = ref('')
const selectedNode = ref(null)
const selectedEdge = ref(null)
const showAllAttrs = ref(false)
let _network = null
// [2026-06] 다운로드용 — loadGraph 가 가져온 원본 spack/ddd 보관(ERD Excel export).
const _erd = ref({ spack: null, ddd: null })
const canDownload = computed(() => !loading.value && !error.value && !!(_erd.value.spack || _erd.value.ddd))

// 노드 종류별 브랜드 색 (박스 배경 / 테두리)
const KIND_COLORS = {
  Entity: { background: '#FFFFFF', border: '#8C6239' },
  Aggregate: { background: '#FBF1DD', border: '#B8893F' },
  DomainEntity: { background: '#FFFFFF', border: '#A9803F' },
}

const selectedAttrs = computed(() => selectedNode.value?.raw?.attrs || [])
const selectedInvariants = computed(() => selectedNode.value?.raw?.invariants || [])

watch(selectedNode, () => { showAllAttrs.value = false })
watch(selectedEdge, () => { showAllAttrs.value = false })

const close = () => {
  if (_network) { _network.destroy(); _network = null }
  selectedNode.value = null
  selectedEdge.value = null
  emit('update:modelValue', false)
}

/** ERD → xlsx(엔티티·속성·관계 3시트) 다운로드 — 그래프를 보면서 바로 내보내기. */
const downloadExcel = async () => {
  if (!canDownload.value) return
  try {
    // xlsx 는 무거운 라이브러리 — 다운로드 클릭 시에만 동적 로드(초기 번들에서 분리).
    const { buildErdWorkbook, erdWorkbookToArrayBuffer } = await import('@/utils/erdExcel')
    const wb = buildErdWorkbook(_erd.value.spack || {}, _erd.value.ddd || {})
    const blob = new Blob([erdWorkbookToArrayBuffer(wb)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    downloadBlob(blob, `${harnessStore.projectName || 'erd'}_erd.xlsx`)
  } catch (e) {
    // 청크 로드/생성 실패(극히 드묾) — unhandled rejection 방지 + 로그.
    console.error('[ERD] Excel 다운로드 실패:', e)
  }
}

const kindLabel = (kind) => {
  if (kind === 'Entity') return tt('node_entity')
  if (kind === 'Aggregate') return tt('node_aggregate')
  if (kind === 'DomainEntity') return tt('node_domain_entity')
  return kind
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
    // 이미 배포된 조회 엔드포인트 2개를 병렬 호출 (새 BE 불필요)
    const [spackRes, dddRes] = await Promise.all([
      axios.get(`${API_BASE}/getSpack`, { params: { projectName: project } }).catch(() => null),
      axios.get(`${API_BASE}/getDDD`, { params: { projectName: project } }).catch(() => null),
    ])
    // getSpack/getDDD 는 { result: [<obj>] } (또는 [<obj>]) 배열 래핑 → extractRaw 로 [0] 추출.
    // 직접 data.result 를 쓰면 spack 이 배열이 되어 spack.entities = undefined → 노드 0 → 빈 ERD.
    const spack = extractRaw(spackRes)
    const ddd = extractRaw(dddRes)
    _erd.value = { spack, ddd }   // 다운로드(Excel)용 원본 보관

    const model = buildErdModel(spack, ddd)
    if (model.nodes.length === 0) {
      error.value = tt('err_no_design')
      loading.value = false
      return
    }

    const { Network, DataSet } = await import('vis-network/standalone')

    // i18n 힌트를 캔버스 라벨에 주입
    const labelOpts = {
      labels: {
        noAttrs: tt('label_no_attrs'),
        noInv: tt('label_no_inv'),
        inv: (n) => tt('label_inv', { n }),
      },
    }

    const visNodes = new DataSet(
      model.nodes.map((n) => {
        const c = KIND_COLORS[n.kind] || KIND_COLORS.Entity
        return {
          id: n.id,
          label: buildNodeLabel(n, labelOpts),
          shape: 'box',
          color: { background: c.background, border: c.border, highlight: { background: '#FFF7E8', border: c.border } },
          borderWidth: 2,
          margin: 10,
          widthConstraint: { minimum: 110, maximum: 240 },
          font: { color: '#4A3520', face: "'SF Mono', ui-monospace, monospace", size: 12, align: 'left', multi: false },
          raw: n,
        }
      }),
    )

    const visEdges = new DataSet(
      model.edges.map((e, i) => ({
        id: `e_${i}`,
        from: e.from,
        to: e.to,
        label: e.type === 'MAPPED_TO' ? tt('edge_mapped') : tt('edge_partof'),
        arrows: 'to',
        dashes: e.dashed,
        color: { color: '#A9803F', highlight: '#8C6239' },
        width: 2,
        font: { size: 9, color: '#9A7B45', align: 'middle', strokeWidth: 3, strokeColor: '#FBF7EF' },
        raw: e,
      })),
    )

    // loading=true 중엔 v-else(modal-body) 미렌더 → 컨테이너 없음. nextTick 전에 해제.
    loading.value = false
    await nextTick()
    const container = document.getElementById('erd-graph-container')
    if (!container) { error.value = tt('err_no_container'); return }

    // VDialog fullscreen transition 중 clientHeight=0 race → 양수 크기까지 폴링(최대 ~1s)
    for (let i = 0; i < 20 && (container.clientHeight === 0 || container.clientWidth === 0); i++) {
      await new Promise((r) => setTimeout(r, 50))
    }

    if (_network) _network.destroy()
    _network = new Network(
      container,
      { nodes: visNodes, edges: visEdges },
      {
        height: '100%',
        width: '100%',
        autoResize: true,
        physics: {
          enabled: true,
          stabilization: { iterations: 150 },
          barnesHut: { gravitationalConstant: -6000, springLength: 200, avoidOverlap: 0.6 },
        },
        nodes: { shapeProperties: { borderRadius: 6 } },
        edges: { smooth: { type: 'continuous' } },
        interaction: { hover: true, tooltipDelay: 300 },
      },
    )

    // resize() 먼저 — fullscreen transition 완료 후 컨테이너가 커진 경우 캔버스를
    // 맞춘 뒤 fit(). (autoResize 가 대부분 흡수하지만 느린 환경 대비 명시적 보강)
    _network.once('stabilizationIterationsDone', () => {
      try { _network.resize(); _network.fit() } catch {}
    })

    _network.on('click', (params) => {
      if (params.nodes.length > 0) {
        selectedNode.value = visNodes.get(params.nodes[0])
        selectedEdge.value = null
      } else if (params.edges.length > 0) {
        selectedEdge.value = visEdges.get(params.edges[0])
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
    <VCard class="erd-modal">
      <div class="modal-header">
        <div class="modal-title">
          <Table2 :size="18" />
          <div class="modal-title-text">
            <div class="modal-title-main">{{ tt('title_main') }}</div>
            <div class="modal-title-sub">{{ tt('title_sub') }}</div>
          </div>
        </div>
        <!-- [2026-06] Lineage ↔ ERD 뷰 토글 — 한 진입점에서 두 그래프 전환 -->
        <div class="view-toggle" role="tablist">
          <button type="button" class="view-toggle__btn" role="tab" @click="emit('switch-view', 'lineage')"><Link2 :size="13" />Lineage</button>
          <button type="button" class="view-toggle__btn is-active" role="tab" @click="emit('switch-view', 'erd')"><Table2 :size="13" />ERD</button>
        </div>
        <button
          v-if="canDownload"
          type="button"
          class="erd-dl-btn"
          @click="downloadExcel"
          :aria-label="tt('download_excel_aria')"
        ><Download :size="14" /><span>{{ tt('download_excel') }}</span></button>
        <button class="modal-close" @click="close" :aria-label="$t('design.action.close')"><X :size="20" /></button>
      </div>

      <div v-if="loading" class="modal-loading">
        <Loader2 class="spin" :size="32" />
        <span>{{ tt('loading') }}</span>
      </div>

      <div v-else-if="error" class="modal-error">{{ error }}</div>

      <div v-else class="modal-body">
        <div id="erd-graph-container" class="graph-area"></div>

        <div class="legend">
          <div class="legend-intro">
            <div class="legend-intro-title">{{ tt('intro_title') }}</div>
            <div class="legend-intro-text" v-html="tt('intro_text')"></div>
          </div>

          <div class="legend-section">
            <div class="legend-title">{{ tt('node_section') }}</div>
            <div class="legend-item-detailed">
              <div class="legend-row"><span class="box" style="background:#8C6239"></span><strong>{{ tt('node_entity') }}</strong></div>
              <div class="legend-desc" v-html="tt('node_entity_desc')"></div>
            </div>
            <div class="legend-item-detailed">
              <div class="legend-row"><span class="box" style="background:#B8893F"></span><strong>{{ tt('node_aggregate') }}</strong></div>
              <div class="legend-desc" v-html="tt('node_aggregate_desc')"></div>
            </div>
            <div class="legend-item-detailed">
              <div class="legend-row"><span class="box" style="background:#A9803F"></span><strong>{{ tt('node_domain_entity') }}</strong></div>
              <div class="legend-desc" v-html="tt('node_domain_entity_desc')"></div>
            </div>
          </div>

          <div class="legend-section">
            <div class="legend-title">{{ tt('edge_section') }}</div>
            <div class="legend-item-detailed">
              <div class="legend-row"><span class="edge-line dashed"></span><strong>{{ tt('edge_mapped') }}</strong></div>
              <div class="legend-desc" v-html="tt('edge_mapped_desc')"></div>
            </div>
            <div class="legend-item-detailed">
              <div class="legend-row"><span class="edge-line"></span><strong>{{ tt('edge_partof') }}</strong></div>
              <div class="legend-desc" v-html="tt('edge_partof_desc')"></div>
            </div>
          </div>

          <div class="legend-tip">
            <div class="legend-tip-title">{{ tt('tip_title') }}</div>
            <ul class="legend-tip-list">
              <li v-html="tt('tip1')"></li>
              <li v-html="tt('tip2')"></li>
              <li v-html="tt('tip3')"></li>
            </ul>
          </div>
        </div>

        <div v-if="selectedNode" class="inspector">
          <div class="inspector-title">{{ kindLabel(selectedNode.raw?.kind) }}</div>
          <div class="inspector-row inspector-row--text">
            <span class="inspector-label">{{ tt('insp_name') }}</span>
            <span class="inspector-value">{{ selectedNode.raw?.name }}</span>
          </div>
          <div class="inspector-row">
            <span class="inspector-label">id:</span>
            <code>{{ selectedNode.id }}</code>
          </div>

          <!-- Aggregate: 불변식 -->
          <template v-if="selectedNode.raw?.kind === 'Aggregate'">
            <div class="inspector-subtitle">{{ tt('insp_invariants') }}</div>
            <ul v-if="selectedInvariants.length" class="inspector-list">
              <li v-for="(inv, i) in selectedInvariants" :key="i">{{ inv }}</li>
            </ul>
            <div v-else class="inspector-empty">{{ tt('insp_no_invariants') }}</div>
          </template>

          <!-- Entity / DomainEntity: 속성 테이블 -->
          <template v-else>
            <div class="inspector-subtitle">{{ tt('insp_attrs', { n: selectedAttrs.length }) }}</div>
            <table v-if="selectedAttrs.length" class="attr-table">
              <tr v-for="(a, i) in (showAllAttrs ? selectedAttrs : selectedAttrs.slice(0, 12))" :key="i">
                <td class="attr-name">{{ a.name }}<span v-if="a.required" class="attr-req" :title="tt('attr_required')">•</span></td>
                <td class="attr-type">{{ a.type || '—' }}</td>
                <td class="attr-constraint">{{ a.constraint }}</td>
              </tr>
            </table>
            <div v-else class="inspector-empty">{{ tt('insp_no_attrs') }}</div>
            <button
              v-if="selectedAttrs.length > 12"
              type="button"
              class="inspector-toggle"
              @click="showAllAttrs = !showAllAttrs"
            >
              <component :is="showAllAttrs ? ChevronDown : ChevronRight" :size="12" />
              <span>{{ showAllAttrs ? tt('insp_collapse') : tt('insp_show_all', { n: selectedAttrs.length }) }}</span>
            </button>
          </template>
        </div>

        <div v-if="selectedEdge" class="inspector">
          <div class="inspector-title">{{ selectedEdge.raw?.type === 'MAPPED_TO' ? tt('edge_mapped') : tt('edge_partof') }}</div>
          <div class="inspector-row"><span class="inspector-label">from:</span><code>{{ selectedEdge.raw?.from }}</code></div>
          <div class="inspector-row"><span class="inspector-label">to:</span><code>{{ selectedEdge.raw?.to }}</code></div>
        </div>
      </div>
    </VCard>
  </VDialog>
</template>

<style scoped>
.erd-modal {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #FBF7EF;
  overflow: hidden;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  row-gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #E3D5BD;
  background: #8C6239;
  color: #FBF7EF;
}
/* Lineage ↔ ERD 뷰 토글 (브라운 헤더용) */
.view-toggle { display: inline-flex; gap: 2px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.25); border-radius: 8px; padding: 2px; }
.view-toggle__btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px;
  border: none; background: transparent; color: #EAD9BE; font-size: 12px; font-weight: 600;
  border-radius: 6px; cursor: pointer;
}
.view-toggle__btn.is-active { background: #FBF7EF; color: #8C6239; }
.view-toggle__btn:not(.is-active):hover { background: rgba(255,255,255,0.12); }
.erd-dl-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
  border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.12);
  color: #FBF7EF; font-size: 12px; font-weight: 600; border-radius: 8px; cursor: pointer;
}
.erd-dl-btn:hover { background: rgba(255,255,255,0.22); }
.modal-title { display: inline-flex; align-items: flex-start; gap: 10px; }
.modal-title > svg { margin-top: 3px; flex-shrink: 0; }
.modal-title-text { display: flex; flex-direction: column; gap: 2px; }
.modal-title-main { font-size: 15px; font-weight: 600; line-height: 1.3; }
.modal-title-sub { font-size: 11.5px; font-weight: 400; color: #EAD9BE; line-height: 1.4; }
.modal-close {
  background: transparent; border: none; cursor: pointer;
  padding: 8px; min-width: 40px; min-height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; color: #EAD9BE; align-self: flex-start;
}
.modal-close:hover { background: rgba(255,255,255,0.15); }

.modal-loading {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px; color: #8C6239;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.modal-error {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: #92400e; padding: 20px; font-size: 14px; text-align: center;
}

.modal-body { flex: 1; min-height: 0; position: relative; display: flex; }
.graph-area { flex: 1; min-width: 0; min-height: 0; background: #F5EFE2; }
.legend {
  width: 280px; border-left: 1px solid #E3D5BD;
  padding: 16px 14px; background: #FBF7EF; overflow-y: auto;
}

@media (max-width: 600px) {
  .modal-body { flex-direction: column; }
  .legend { width: 100%; max-height: 40%; border-left: none; border-top: 1px solid #E3D5BD; }
}

.legend-intro {
  background: #FBF1DD; border: 1px solid #E3D5BD; border-radius: 8px;
  padding: 12px 14px; margin-bottom: 18px;
}
.legend-intro-title { font-size: 12.5px; font-weight: 700; color: #6B4A2B; margin-bottom: 8px; }
.legend-intro-text { font-size: 11.5px; line-height: 1.65; color: #5F5045; }
.legend-intro-text :deep(strong) { color: #4A3520; font-weight: 700; }

.legend-section { margin-bottom: 18px; }
.legend-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  color: #9A7B45; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #ECE0CC;
}
.legend-item-detailed { margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #ECE0CC; }
.legend-item-detailed:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.legend-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #4A3520; margin-bottom: 4px; flex-wrap: wrap; }
.legend-row strong { font-weight: 700; }
.legend-desc { font-size: 11px; color: #7A6A55; line-height: 1.55; padding-left: 20px; }
.legend-desc :deep(strong) { color: #4A3520; font-weight: 600; }
.legend-desc :deep(code) { background: #F1E6D2; padding: 0 4px; border-radius: 3px; font-size: 10.5px; }

.box { display: inline-block; width: 12px; height: 9px; border-radius: 2px; }
.edge-line { display: inline-block; width: 22px; height: 3px; border-radius: 1px; background: #A9803F; }
.edge-line.dashed { background: repeating-linear-gradient(90deg, #A9803F 0 4px, transparent 4px 7px) !important; }

.legend-tip {
  background: #FBF1DD; border: 1px solid #E8D3A8; border-radius: 8px;
  padding: 12px 14px; margin-top: 4px;
}
.legend-tip-title { font-size: 12px; font-weight: 700; color: #8C6239; margin-bottom: 8px; }
.legend-tip-list { margin: 0; padding-left: 16px; font-size: 11px; line-height: 1.7; color: #6B4A2B; }
.legend-tip-list li { margin-bottom: 4px; }

.inspector {
  position: absolute; bottom: 16px; left: 16px;
  background: #FFFFFF; border: 1px solid #D9C6A6; border-radius: 8px;
  padding: 12px 14px; width: 360px; max-width: calc(100% - 32px); max-height: calc(100% - 32px);
  overflow-y: auto; box-shadow: 0 4px 12px rgba(140,98,57,0.14); font-size: 12px;
}
.inspector-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9A7B45;
  margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #ECE0CC;
}
.inspector-subtitle { font-size: 11px; font-weight: 700; color: #6B4A2B; margin: 10px 0 6px; }
.inspector-row { margin: 4px 0; }
.inspector-row--text { display: flex; flex-direction: column; gap: 2px; }
.inspector-label { color: #9A7B45; margin-right: 6px; }
.inspector-row code {
  background: #F1E6D2; padding: 1px 5px; border-radius: 3px;
  font-family: ui-monospace, 'SF Mono', monospace; color: #8C6239;
}
.inspector-value { color: #4A3520; word-break: break-word; }
.inspector-empty { color: #A08A6E; font-style: italic; padding: 2px 0; }
.inspector-list { margin: 0; padding-left: 16px; color: #4A3520; line-height: 1.55; }
.inspector-list li { margin-bottom: 3px; }

.attr-table { width: 100%; border-collapse: collapse; }
.attr-table td { padding: 3px 6px; border-bottom: 1px solid #F1E6D2; vertical-align: top; }
.attr-name { color: #4A3520; font-weight: 500; font-family: ui-monospace, 'SF Mono', monospace; }
.attr-req { color: #B8893F; margin-left: 3px; font-weight: 700; }
.attr-type { color: #8C6239; font-family: ui-monospace, 'SF Mono', monospace; white-space: nowrap; }
.attr-constraint { color: #9A7B45; font-size: 11px; }

.inspector-toggle {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 8px;
  padding: 4px 8px; background: transparent; border: 1px solid #E3D5BD;
  border-radius: 4px; cursor: pointer; font-size: 11px; color: #6B4A2B;
}
.inspector-toggle:hover { background: #FBF1DD; }
</style>
