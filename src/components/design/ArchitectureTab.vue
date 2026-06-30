<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Layers, Server, RefreshCw, Database, ArrowDown, Zap, X, Link2 } from 'lucide-vue-next'
import { useHarnessStore, API_BASE } from '@/store/harness'
import axios from '@/utils/axios'
import DesignLineagePanel from './DesignLineagePanel.vue'
import EvalScoreCard from './EvalScoreCard.vue'
import { useEvalScore } from '@/composables/useEvalScore'
import { useLineageCoverage, normalizeLineageList, unlinkedNodes } from '@/composables/useDesignLineage'
import { useDesignCrossLink } from '@/composables/useDesignCrossLink'
import { fetchWithRetryIfEmpty, extractRaw, isArchitectureEmpty } from '@/utils/designFetch'
// [2026-06-13] 바이브 패키지 모달·생성 로직은 VibePackageModal.vue 로 분리 —
// 전역 CTA 가 어느 탭에서든 탭 전환 없이 열 수 있게 (design.vue 가 mount).
const { t } = useI18n()
const store = useHarnessStore()
const isLoading = ref(false)

const lineageOpen = ref(false)
const selectedItem = ref(null)
const selectedNodeType = ref('service')
const openLineage = (item, nodeType = 'service') => {
  selectedItem.value = item
  selectedNodeType.value = nodeType
  lineageOpen.value = true
}
const hasLineage = (item) => {
  const c = item?.lineage?.confidence
  return c === 'direct' || c === 'inferred'
}

const serviceList = computed(() => archData.value.services)
const serviceCoverage = useLineageCoverage(serviceList)
const databaseList = computed(() => archData.value.databases)
const databaseCoverage = useLineageCoverage(databaseList)
// [2026-05-29] EvalScoreCard 로 넘길 통합 lineage list — Architecture 컨텍스트.
// Connection 은 관계 자체라 lineage 측정 의미 없음 → 제외.
const archLineageItems = computed(() => [
  { label: 'Service', coverage: serviceCoverage.value, unlinked: unlinkedNodes(archData.value.services) },
  { label: 'Database', coverage: databaseCoverage.value, unlinked: unlinkedNodes(archData.value.databases) },
])

const archData = ref({ services: [], databases: [], connections: [] })
const hasArchData = computed(() => archData.value.services.length > 0 || archData.value.databases.length > 0)
import { getNodeProp } from '@/utils/nodeUtils'

// Connection Map: source_id / target_id → 사람이 읽는 이름으로 변환
const nodeNameMap = computed(() => {
  const map = new Map()
  for (const svc of archData.value.services) {
    const id = getNodeProp(svc, 'id')
    const name = getNodeProp(svc, 'name') || getNodeProp(svc, 'title')
    if (id && name) map.set(id, name)
  }
  for (const db of archData.value.databases) {
    const id = getNodeProp(db, 'id')
    const name = getNodeProp(db, 'name') || getNodeProp(db, 'title')
    if (id && name) map.set(id, name)
  }
  return map
})

const typeLabel = (type) => {
  if (!type) return '—'
  const key = `design.arch.conn_type.${type.toLowerCase().replace(/-/g, '_')}`
  const val = t(key)
  return val !== key ? val : type
}

const isConnModalOpen = ref(false)
const selectedServiceForConn = ref(null)

const openConnModal = (svc) => {
  selectedServiceForConn.value = svc
  isConnModalOpen.value = true
}

const filteredConnections = computed(() => {
  if (!selectedServiceForConn.value) return []
  const id = getNodeProp(selectedServiceForConn.value, 'id')
  return connectionsFor(id)
})

const connectionsFor = (id) => archData.value.connections.filter(c => c.source_id === id || c.target_id === id)


const crossLink = useDesignCrossLink()

/**
 * Architecture 데이터 fetch.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.expectData=false] true 면 빈 응답 시 자동 재시도 (~3회).
 *   createSpack 직후 BE consistency lag 회피용.
 */
const fetchData = async ({ expectData = false } = {}) => {
  if (!store.projectName) return
  isLoading.value = true
  try {
    const response = await fetchWithRetryIfEmpty({
      url: `${API_BASE}/getArchitecture`,
      params: { projectName: store.projectName },
      isEmpty: isArchitectureEmpty,
      maxAttempts: expectData ? 3 : 1,
    })
    const raw = extractRaw(response)
    archData.value = {
      services: normalizeLineageList(raw.services),
      databases: normalizeLineageList(raw.databases),
      connections: Array.isArray(raw.connections) ? raw.connections : [],
    }
    crossLink.setArchData(archData.value)
  } catch (error) {
    console.error('Architecture 조회 실패:', error)
  } finally {
    isLoading.value = false
  }
}

const jumpTargetServiceId = computed(() => {
  const sel = crossLink.selectedNode.value
  return sel?.kind === 'service' ? sel.id : null
})

watch(() => crossLink.requestedJump.value, async (jump) => {
  if (!jump || jump.tab !== 'architecture') return
  await new Promise(r => requestAnimationFrame(r))
  const sel = `[data-arch-node="${jump.kind}:${jump.id}"]`
  const el = document.querySelector(sel)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, { immediate: true })

onMounted(() => { fetchData() })
watch(() => store.projectName, () => { fetchData() })

// [Phase E — 2026-05-25] 명세 충실도 점수 (SpackTab/DddTab 과 같은 패턴).
const projectNameForScore = computed(() => store.projectName)
const { score: evalScore, loading: evalLoading } = useEvalScore(projectNameForScore)


defineExpose({ fetchData })
</script>

<template>
  <div class="arch-root">
    <!-- Header -->
    <div class="arch-header">
      <div>
        <h4 class="tab-title">{{ $t('design.arch.title') }}<span class="tab-title-en">System Architecture</span></h4>
        <p class="tab-subtitle-text">{{ $t('design.arch.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <!-- [2026-05-29] 통합 카드 — PRD 충실도 + Architecture 노드 종류별 PRD 연결 -->
        <EvalScoreCard
          :score="evalScore"
          :loading="evalLoading"
          tab-key="architecture"
          :lineage-items="archLineageItems"
          :project-name="store.projectName"
          @autofilled="fetchData"
        />
        <!-- [2026-06-13] 바이브 코딩 패키지 — design 페이지 헤드라인 전역 CTA 가
             VibePackageModal(페이지 레벨)을 직접 연다. 이 탭은 더 이상 관여하지 않음. -->
        <VBtn icon variant="text" size="small" :loading="isLoading" @click="fetchData" class="btn-icon" aria-label="새로고침" title="설계 데이터 새로고침">
          <RefreshCw :size="16" />
        </VBtn>
      </div>
    </div>

    <!-- Loading / Empty -->
    <div v-if="isLoading" class="empty-state"><VProgressCircular indeterminate color="accent" /></div>
    <div v-else-if="!hasArchData" class="empty-state">
      <Layers :size="56" style="opacity:0.15; color:var(--text-muted); margin-bottom:16px" />
      <p style="color:var(--text-muted); font-size:0.9rem">{{ $t('design.arch.empty') }}</p>
    </div>

    <!-- Diagram -->
    <div v-else class="arch-diagram custom-scroll">

      <!-- ① SERVICE LAYER -->
      <div class="layer layer--service">
        <div class="layer-tag layer-tag--service">
          <Server :size="13" />
          {{ $t('design.arch.service_layer') }}
          <span class="layer-tag-en">Service Layer</span>
          <span class="layer-count">{{ archData.services.length }}</span>
        </div>
        <div class="node-grid">
          <div v-for="svc in archData.services" :key="getNodeProp(svc,'id',svc.identity)"
            class="node-card node-card--service"
            :class="{
              'node-card--clickable': hasLineage(svc),
              [`node-card--confidence-${svc.lineage?.confidence || 'unknown'}`]: true,
              'node-card--selected': jumpTargetServiceId === getNodeProp(svc,'id'),
            }"
            :data-arch-node="`service:${getNodeProp(svc,'id')}`"
            @click="hasLineage(svc) && openLineage(svc, 'service')">
            <div class="node-card-top">
              <div class="node-icon node-icon--service"><Server :size="22" /></div>
              <div class="node-meta">
                <div class="node-name">
                  {{ getNodeProp(svc,'name')||getNodeProp(svc,'title') }}
                  <span v-if="hasLineage(svc)" class="lineage-indicator">
                    <Link2 :size="11" />{{ svc.lineage.related_stories.length }}
                  </span>
                </div>
                <div class="node-sub">
                  <span class="node-id">{{ getNodeProp(svc,'id') }}</span>
                  <span class="node-tech">{{ getNodeProp(svc,'tech_stack')||'Service' }}</span>
                </div>
              </div>
            </div>
            <p class="node-desc">{{ getNodeProp(svc,'description')||getNodeProp(svc,'desc') }}</p>
            <div v-if="(svc.owned_aggregate_names || []).length" class="cross-chip-row">
              <span class="cross-chip-label">📦 {{ $t('design.arch.aggregates_label') }}</span>
              <span class="cross-chip cross-chip--ghost" v-for="aggName in svc.owned_aggregate_names" :key="aggName">
                {{ aggName }}
              </span>
            </div>
            <div v-if="connectionsFor(getNodeProp(svc,'id')).length" class="node-conn-count" @click.stop="openConnModal(svc)">
              <Zap :size="11" />{{ $t('design.arch.conn_count', { n: connectionsFor(getNodeProp(svc,'id')).length }) }}
            </div>
          </div>
        </div>
      </div>

      <!-- ② CONNECTOR BELT -->
      <div class="conn-belt" v-if="archData.connections.length">
        <div class="conn-belt-line"></div>
        <div class="conn-belt-label">
          <ArrowDown :size="14" />
          <span>{{ $t('design.arch.conn_count', { n: archData.connections.length }) }}</span>
          <ArrowDown :size="14" />
        </div>
        <div class="conn-belt-line"></div>
      </div>
      <div class="conn-spacer" v-else></div>

      <!-- ③ DATA LAYER -->
      <div class="layer layer--db">
        <div class="layer-tag layer-tag--db">
          <Database :size="13" />
          {{ $t('design.arch.data_layer') }}
          <span class="layer-tag-en">Data Layer</span>
          <span class="layer-count">{{ archData.databases.length }}</span>
        </div>
        <div class="node-grid">
          <div v-for="db in archData.databases" :key="getNodeProp(db,'id',db.identity)"
            class="node-card node-card--db"
            :class="{
              'node-card--clickable': hasLineage(db),
              [`node-card--confidence-${db.lineage?.confidence || 'unknown'}`]: true,
            }"
            @click="hasLineage(db) && openLineage(db, 'database')">
            <div class="node-card-top">
              <div class="node-icon node-icon--db"><Database :size="22" /></div>
              <div class="node-meta">
                <div class="node-name">
                  {{ getNodeProp(db,'name')||getNodeProp(db,'title') }}
                  <span v-if="hasLineage(db)" class="lineage-indicator">
                    <Link2 :size="11" />{{ db.lineage.related_stories.length }}
                  </span>
                </div>
                <div class="node-sub">
                  <span class="node-id">{{ getNodeProp(db,'id') }}</span>
                  <span class="node-tech node-tech--db">{{ getNodeProp(db,'tech_stack')||'Database' }}</span>
                </div>
              </div>
            </div>
            <p class="node-desc">{{ getNodeProp(db,'description')||getNodeProp(db,'desc') }}</p>
          </div>
        </div>
      </div>

      <!-- ④ CONNECTION TABLE -->
      <div v-if="archData.connections.length" class="conn-section">
        <div class="conn-section-header">
          <div class="conn-section-title">
            <Zap :size="14" />{{ $t('design.arch.conn_section_title') }}
            <span class="conn-section-en">Connection Map</span>
          </div>
          <span class="conn-section-count">{{ archData.connections.length }}</span>
        </div>
        <!-- Desktop / Tablet: 6열 테이블 -->
        <div class="conn-table-wrap">
          <div class="conn-table">
            <div class="conn-thead">
              <span>{{ $t('design.arch.conn_header_from') }}</span><span>→</span><span>{{ $t('design.arch.conn_header_to') }}</span><span>{{ $t('design.arch.conn_header_type') }}</span><span>{{ $t('design.arch.conn_header_protocol') }}</span><span>{{ $t('design.arch.conn_header_auth') }}</span><span>{{ $t('design.arch.conn_header_desc') }}</span>
            </div>
            <div v-for="(c,i) in archData.connections" :key="i" class="conn-trow">
              <span class="ct-id ct-id--from">
                <span class="ct-name">{{ nodeNameMap.get(c.source_id) || c.source_id }}</span>
                <span v-if="nodeNameMap.has(c.source_id)" class="ct-raw-id">{{ c.source_id }}</span>
              </span>
              <span class="ct-arrow">→</span>
              <span class="ct-id ct-id--to">
                <span class="ct-name">{{ nodeNameMap.get(c.target_id) || c.target_id }}</span>
                <span v-if="nodeNameMap.has(c.target_id)" class="ct-raw-id">{{ c.target_id }}</span>
              </span>
              <span class="ct-type">{{ typeLabel(c.type) }}</span>
              <span class="ct-proto">{{ c.protocol||'—' }}</span>
              <!-- [D-2 — 2026-05-25] Connection auth (mTLS/bearer/basic/api-key/none) -->
              <span class="ct-auth" :class="`ct-auth--${c.auth || 'none'}`">
                {{ c.auth && c.auth !== 'none' ? `🔒 ${c.auth}` : '—' }}
              </span>
              <span class="ct-desc">{{ c.description||'—' }}</span>
            </div>
          </div>
        </div>
        <!-- Mobile: 세로 카드 리스트 -->
        <ul class="conn-card-list">
          <li v-for="(c,i) in archData.connections" :key="`main-card-${i}`" class="conn-card">
            <div class="conn-card-endpoint conn-card-endpoint--from">
              <span class="conn-card-role">{{ $t('design.arch.conn_header_from') }}</span>
              <span class="conn-card-name">{{ nodeNameMap.get(c.source_id) || c.source_id }}</span>
              <span v-if="nodeNameMap.has(c.source_id)" class="conn-card-id">{{ c.source_id }}</span>
            </div>
            <div class="conn-card-arrow"><ArrowDown :size="14" /></div>
            <div class="conn-card-endpoint conn-card-endpoint--to">
              <span class="conn-card-role">{{ $t('design.arch.conn_header_to') }}</span>
              <span class="conn-card-name">{{ nodeNameMap.get(c.target_id) || c.target_id }}</span>
              <span v-if="nodeNameMap.has(c.target_id)" class="conn-card-id">{{ c.target_id }}</span>
            </div>
            <div class="conn-card-meta">
              <span class="conn-card-type">{{ typeLabel(c.type) }}</span>
              <span v-if="c.protocol" class="conn-card-proto">{{ c.protocol }}</span>
            </div>
            <p v-if="c.description" class="conn-card-desc">{{ c.description }}</p>
          </li>
        </ul>
      </div>
    </div>

    <!-- Connection Modal — [2026-05-21 refactor]
         이전엔 :fullscreen=xs + 가로 스크롤 테이블이라 모바일에서 모달이 압축돼
         빈 카드만 보이는 문제. JS 기반 xs 반응성 의존 제거하고 순수 CSS @media
         로 책임 분리. 모바일은 테이블 대신 세로 카드 리스트로 가독성 ↑. -->
    <VDialog v-model="isConnModalOpen" max-width="900" scrollable>
      <div class="arch-modal-card arch-modal-card--conn">
        <div class="arch-modal-header">
          <div class="arch-modal-header-title">
            <Zap :size="18" color="var(--accent)" />
            <div class="arch-modal-title-block">
              <h3 class="arch-modal-title">{{ $t('design.arch.conn_modal_title') }}</h3>
              <p class="arch-modal-subtitle">{{ getNodeProp(selectedServiceForConn, 'name') || getNodeProp(selectedServiceForConn, 'title') }}</p>
            </div>
          </div>
          <button class="modal-close-btn" @click="isConnModalOpen = false" aria-label="닫기"><X :size="20" /></button>
        </div>
        <div class="arch-modal-body">
          <div class="conn-count-badge">
            {{ $t('design.arch.conn_total', { n: filteredConnections.length }) }}
          </div>

          <!-- Desktop / Tablet: 6열 테이블 -->
          <div class="conn-table-wrap">
            <div class="conn-table">
              <div class="conn-thead">
                <span>{{ $t('design.arch.conn_header_from') }}</span><span>→</span><span>{{ $t('design.arch.conn_header_to') }}</span><span>{{ $t('design.arch.conn_header_type') }}</span><span>{{ $t('design.arch.conn_header_protocol') }}</span><span>{{ $t('design.arch.conn_header_auth') }}</span><span>{{ $t('design.arch.conn_header_desc') }}</span>
              </div>
              <div v-for="(c,i) in filteredConnections" :key="`tbl-${i}`" class="conn-trow">
                <span class="ct-id ct-id--from" :class="{ 'font-weight-black': c.source_id === getNodeProp(selectedServiceForConn, 'id') }">
                  <span class="ct-name">{{ nodeNameMap.get(c.source_id) || c.source_id }}</span>
                  <span v-if="nodeNameMap.has(c.source_id)" class="ct-raw-id">{{ c.source_id }}</span>
                </span>
                <span class="ct-arrow">→</span>
                <span class="ct-id ct-id--to" :class="{ 'font-weight-black': c.target_id === getNodeProp(selectedServiceForConn, 'id') }">
                  <span class="ct-name">{{ nodeNameMap.get(c.target_id) || c.target_id }}</span>
                  <span v-if="nodeNameMap.has(c.target_id)" class="ct-raw-id">{{ c.target_id }}</span>
                </span>
                <span class="ct-type">{{ typeLabel(c.type) }}</span>
                <span class="ct-proto">{{ c.protocol||'—' }}</span>
                <span class="ct-auth" :class="`ct-auth--${c.auth || 'none'}`">{{ c.auth && c.auth !== 'none' ? `🔒 ${c.auth}` : '—' }}</span>
                <span class="ct-desc">{{ c.description||'—' }}</span>
              </div>
            </div>
          </div>

          <!-- Mobile: 세로 카드 리스트 (좁은 화면에서 6열 테이블 가독성 ↓ 해결) -->
          <ul class="conn-card-list">
            <li v-for="(c,i) in filteredConnections" :key="`card-${i}`" class="conn-card">
              <div class="conn-card-endpoint conn-card-endpoint--from" :class="{ 'conn-card-endpoint--self': c.source_id === getNodeProp(selectedServiceForConn, 'id') }">
                <span class="conn-card-role">{{ $t('design.arch.conn_header_from') }}</span>
                <span class="conn-card-name">{{ nodeNameMap.get(c.source_id) || c.source_id }}</span>
                <span v-if="nodeNameMap.has(c.source_id)" class="conn-card-id">{{ c.source_id }}</span>
              </div>
              <div class="conn-card-arrow"><ArrowDown :size="14" /></div>
              <div class="conn-card-endpoint conn-card-endpoint--to" :class="{ 'conn-card-endpoint--self': c.target_id === getNodeProp(selectedServiceForConn, 'id') }">
                <span class="conn-card-role">{{ $t('design.arch.conn_header_to') }}</span>
                <span class="conn-card-name">{{ nodeNameMap.get(c.target_id) || c.target_id }}</span>
                <span v-if="nodeNameMap.has(c.target_id)" class="conn-card-id">{{ c.target_id }}</span>
              </div>
              <div class="conn-card-meta">
                <span class="conn-card-type">{{ typeLabel(c.type) }}</span>
                <span v-if="c.protocol" class="conn-card-proto">{{ c.protocol }}</span>
              </div>
              <p v-if="c.description" class="conn-card-desc">{{ c.description }}</p>
            </li>
            <li v-if="!filteredConnections.length" class="conn-card-empty">
              {{ $t('design.arch.conn_empty') }}
            </li>
          </ul>
        </div>
      </div>
    </VDialog>

    <!-- Lineage Panel -->
    <DesignLineagePanel
      v-model="lineageOpen"
      :item="selectedItem"
      :node-type="selectedNodeType"
    />
  </div>
</template>

<style scoped>
.arch-root { display: flex; flex-direction: column; height: 100%; gap: 0; }

/* ── Header ── */
.arch-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 14px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.header-actions { display: flex; align-items: center; gap: 8px; }
.btn-icon { color: var(--text-muted) !important; }

/* ── States ── */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: 48px;
}

/* ── Diagram ── */
.arch-diagram {
  flex: 1; overflow-y: auto; padding: 24px;
  display: flex; flex-direction: column; gap: 0;
}

/* ── Layer ── */
.layer { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 14px; padding: 18px 20px; }
.layer-tag {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  border-radius: 6px; padding: 4px 10px; margin-bottom: 16px;
}
.layer-tag--service { background: rgba(99,102,241,.08); color: #818cf8; border: 1px solid rgba(99,102,241,.2); }
.layer-tag--db      { background: rgba(16,185,129,.08); color: #34d399; border: 1px solid rgba(16,185,129,.2); }
.layer-tag-en { font-size: 0.65rem; opacity: .7; margin-left: 4px; }
.layer-count { background: rgba(255,255,255,.12); border-radius: 4px; padding: 1px 6px; font-size: 0.72rem; }

/* ── Node Grid ── */
.node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(244px, 1fr)); gap: 12px; }

/* ── Node Card ── */
.node-card {
  background: var(--bg-light);
  border: 1.5px solid var(--border-light);
  border-radius: 10px; padding: 14px;
  transition: border-color .2s, box-shadow .2s, transform .15s;
  position: relative;
}
.node-card--service { border-left: 3px solid #6366f1; }
.node-card--db      { border-left: 3px solid #10b981; }
.node-card--clickable { cursor: pointer; }
.node-card--clickable:hover { border-color: var(--accent); box-shadow: 0 4px 16px rgba(0,0,0,.12); transform: translateY(-2px); }

/* [2026-05-21] SPACK/DDD 에서 cross-link 로 선택된 service — 은은한 pulse glow.
   사용자가 "이 서비스가 방금 클릭된 노드에 매핑됐다" 를 즉각 인지하게.
   2.4s 주기로 자연스러운 호흡감, accent 색 (브랜드 컬러) 으로 통일. */
.node-card--selected {
  position: relative;
  border-color: var(--accent, #8C6239) !important;
  animation: archSelectedPulse 2.4s ease-in-out infinite;
  z-index: 1;
}
.node-card--selected::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  border: 1.5px solid rgba(140, 98, 57, 0.35);
  animation: archSelectedBorderFlow 2.4s ease-in-out infinite;
}
@keyframes archSelectedPulse {
  0%, 100% {
    box-shadow:
      0 0 0 2px rgba(140, 98, 57, 0.28),
      0 0 14px 1px rgba(140, 98, 57, 0.18);
  }
  50% {
    box-shadow:
      0 0 0 3px rgba(140, 98, 57, 0.42),
      0 0 22px 3px rgba(140, 98, 57, 0.32);
  }
}
@keyframes archSelectedBorderFlow {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
/* 사용자가 모션 감도 낮춤 설정 시 — 정적 ring 으로만 표시 */
@media (prefers-reduced-motion: reduce) {
  .node-card--selected { animation: none; box-shadow: 0 0 0 2px rgba(140, 98, 57, 0.42); }
  .node-card--selected::after { animation: none; opacity: 0.8; }
}

/* confidence tint */
.node-card--confidence-direct   { background: rgba(16,185,129,.04); }
.node-card--confidence-inferred { background: rgba(245,158,11,.04); }

.node-card-top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
.node-icon { flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.node-icon--service { background: rgba(99,102,241,.12); color: #818cf8; }
.node-icon--db      { background: rgba(16,185,129,.12); color: #34d399; }
.node-meta { flex: 1; min-width: 0; }
/* 제목은 카드 전체 폭을 쓰고, 단어 경계에서만 줄바꿈 (긴 영문 제목이 단어 중간에서
   끊기던 문제 수정 — 기술 뱃지를 아래 서브행으로 내려 제목 가로폭 확보). */
.node-name {
  font-size: 0.85rem; font-weight: 700; color: var(--text-main); line-height: 1.35;
  overflow-wrap: break-word; word-break: keep-all;
}
/* ID + 기술스택 뱃지 한 줄 — 제목 아래. 좁으면 자연스럽게 줄바꿈. */
.node-sub { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.node-id   { font-size: 0.68rem; color: var(--text-muted); font-family: monospace; }
.node-tech {
  font-size: 0.65rem; font-weight: 600; background: rgba(99,102,241,.1); color: #818cf8;
  border-radius: 4px; padding: 2px 6px; white-space: nowrap;
}
.node-tech--db { background: rgba(16,185,129,.1); color: #34d399; }
.node-desc { font-size: 0.78rem; color: var(--text-dim); line-height: 1.5; margin: 0; }

/* lineage indicator */
.lineage-indicator {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 0.65rem; color: var(--accent); font-weight: 600;
  background: rgba(124,58,237,.1); border-radius: 4px; padding: 1px 5px;
  margin-left: 4px; vertical-align: middle;
}

/* cross-link chip row */
.cross-chip-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; align-items: center; }
.cross-chip-label { font-size: 0.65rem; color: var(--text-muted); }
.cross-chip--ghost {
  font-size: 0.65rem; border: 1px dashed var(--border-light); border-radius: 4px;
  padding: 1px 6px; color: var(--text-muted);
}

/* conn count badge */
.node-conn-count {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 8px; font-size: 0.68rem; color: #f59e0b;
  background: rgba(245,158,11,.08); border-radius: 4px; padding: 2px 7px;
  cursor: pointer;
}
.node-conn-count:hover { background: rgba(245,158,11,.16); }

/* ── Connector Belt ── */
.conn-belt {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 32px; color: var(--text-muted);
}
.conn-belt-line { flex: 1; height: 1px; background: var(--border-light); }
.conn-belt-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;
}
.conn-spacer { height: 16px; }

/* ── Connection Section ── */
.conn-section { margin-top: 20px; }
.conn-section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.conn-section-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.8rem; font-weight: 600; color: var(--text-main);
}
.conn-section-en { font-size: 0.68rem; color: var(--text-muted); font-weight: 400; }
.conn-section-count {
  font-size: 0.72rem; background: rgba(245,158,11,.1); color: #f59e0b;
  border-radius: 4px; padding: 2px 8px; font-weight: 600;
}

/* ── Connection Table ── */
.conn-table { width: 100%; border: 1px solid var(--border-light); border-radius: 8px; overflow: hidden; font-size: 0.78rem; }
.conn-thead {
  display: grid; grid-template-columns: 1.4fr .3fr 1.4fr .8fr .7fr .9fr 1.5fr;
  background: var(--bg-card); padding: 8px 12px;
  font-size: 0.7rem; font-weight: 600; color: var(--text-muted); letter-spacing: .04em; text-transform: uppercase;
}
.conn-trow {
  display: grid; grid-template-columns: 1.4fr .3fr 1.4fr .8fr .7fr .9fr 1.5fr;
  padding: 8px 12px; align-items: start;
  border-top: 1px solid var(--border-light);
  transition: background .15s;
}
.conn-trow:hover { background: var(--bg-light); }
.ct-id { display: flex; flex-direction: column; gap: 1px; }
.ct-name { font-weight: 500; color: var(--text-main); }
.ct-raw-id { font-size: 0.65rem; color: var(--text-muted); font-family: monospace; }
.ct-id--from .ct-name { color: #818cf8; }
.ct-id--to   .ct-name { color: #34d399; }
.ct-arrow { color: var(--text-muted); display: flex; align-items: center; padding-top: 2px; }
.ct-type  { color: #f59e0b; font-weight: 500; }
.ct-proto { font-family: monospace; font-size: 0.72rem; color: var(--text-dim); }
/* [D-2] Connection auth 배지 — enum 별 색. grid item 이라 기본 stretch 되어 배경이
   셀 전체를 채우므로 justify-self:start + inline-flex 로 '내용 크기' pill 로 만든다. */
.ct-auth {
  justify-self: start;
  display: inline-flex; align-items: center;
  font-size: 0.7rem; font-weight: 600;
  padding: 2px 9px; border-radius: 9999px; white-space: nowrap;
}
.ct-auth--none   { color: var(--text-dim); padding-left: 0; padding-right: 0; }
.ct-auth--mTLS   { color: #2F855A; background: #C6F6D5; }
.ct-auth--bearer { color: #2B6CB0; background: #BEE3F8; }
.ct-auth--basic  { color: #B7791F; background: #FAF089; }
.ct-auth--\"api-key\" { color: #6B46C1; background: #E9D8FD; }
.ct-desc  { color: var(--text-dim); }

/* ── Modals (shared) ──
 * [2026-05-21] 모달 사이즈/responsive 를 순수 CSS 로 관리.
 * 이전엔 Vuetify useDisplay()의 xs 로 fullscreen 토글 → 모바일에서 압축/투명
 * 문제 발생. CSS @media 기반으로 더 견고 + 백드롭은 VDialog 의 기본 scrim 활용.
 */
.arch-modal-card {
  background: var(--bg-card); border-radius: 14px;
  border: 1px solid var(--border-light); overflow: hidden;
  width: 100%;
  max-height: 85vh;
  min-height: 320px;
  display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}
.arch-modal-card--conn {
  /* 모달 본문이 너무 작아 보이지 않도록 살짝 더 큰 min-height */
  min-height: 360px;
}
.arch-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  gap: 12px;
  background: var(--bg-card);
}
.arch-modal-header-title {
  display: flex; align-items: center; gap: 10px;
  min-width: 0; flex: 1;
}
.arch-modal-title-block { min-width: 0; flex: 1; }
.arch-modal-title { font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0; line-height: 1.3; }
.arch-modal-subtitle {
  font-size: 0.82rem; color: var(--text-dim); margin: 2px 0 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.arch-modal-body  {
  padding: 18px 20px;
  overflow-y: auto;
  flex: 1 1 0;
  min-height: 200px;  /* prevent collapse */
  -webkit-overflow-scrolling: touch;
}

.conn-count-badge {
  display: inline-block;
  padding: 4px 10px;
  margin-bottom: 12px;
  background: rgba(245, 158, 11, 0.1);
  color: #B45309;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 600;
}
.conn-count-badge strong { font-weight: 800; }

/* Desktop / tablet: 6열 테이블 */
.conn-table-wrap { display: block; }
/* Mobile: 세로 카드 리스트 (기본 hidden, @media 에서 show) */
.conn-card-list { display: none; list-style: none; padding: 0; margin: 0; }

.modal-close-btn {
  background: none; border: 1px solid transparent; cursor: pointer;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center;
  border-radius: 8px; padding: 6px;
  flex-shrink: 0;
  transition: background .15s, color .15s, border-color .15s;
}
.modal-close-btn:hover,
.modal-close-btn:focus-visible {
  background: var(--bg-light); color: var(--text-main);
  border-color: var(--border-light);
  outline: none;
}

/* ── Connection card (mobile only) ── */
.conn-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
  display: flex; flex-direction: column;
  gap: 6px;
}
.conn-card:last-child { margin-bottom: 0; }
.conn-card-endpoint {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 12px;
  background: var(--bg-light);
  border-radius: 8px;
  border-left: 3px solid transparent;
}
.conn-card-endpoint--from { border-left-color: #818cf8; }
.conn-card-endpoint--to   { border-left-color: #34d399; }
.conn-card-endpoint--self { background: rgba(245, 158, 11, 0.08); }
.conn-card-role {
  font-size: 0.65rem; font-weight: 700; color: var(--text-muted);
  letter-spacing: 0.06em; text-transform: uppercase;
}
.conn-card-name {
  font-size: 0.88rem; font-weight: 700; color: var(--text-main);
  line-height: 1.35;
  word-break: keep-all;
}
.conn-card-id {
  font-size: 0.7rem; color: var(--text-muted);
  font-family: 'IBM Plex Mono', monospace;
}
.conn-card-arrow {
  display: flex; justify-content: center;
  color: var(--text-muted);
  padding: 2px 0;
}
.conn-card-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin-top: 4px;
}
.conn-card-type {
  font-size: 0.72rem; font-weight: 600;
  color: #f59e0b;
  padding: 3px 9px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 9999px;
}
.conn-card-proto {
  font-size: 0.7rem; font-family: 'IBM Plex Mono', monospace;
  color: var(--text-main); font-weight: 600;
  padding: 3px 8px;
  background: var(--bg-light);
  border-radius: 6px;
  border: 1px solid var(--border-light);
}
.conn-card-desc {
  font-size: 0.78rem; color: var(--text-dim); line-height: 1.55;
  margin: 4px 0 0;
  word-break: keep-all;
}
.conn-card-empty {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* ── Mobile responsive: 모달 ── */
@media (max-width: 600px) {
  /* 모달이 화면을 거의 채우도록 — 백드롭은 VDialog 기본 scrim 사용 */
  .arch-modal-card {
    max-height: 92vh;
    min-height: 92vh;
    border-radius: 12px 12px 0 0;
  }
  .arch-modal-header { padding: 14px 16px; }
  .arch-modal-body { padding: 16px; min-height: 280px; }
  .arch-modal-title { font-size: 0.92rem; }
  .arch-modal-subtitle { font-size: 0.78rem; }

  /* 테이블 숨기고 카드 리스트로 전환 */
  .conn-table-wrap { display: none; }
  .conn-card-list  { display: block; }
}

/* ── Mobile responsive: 페이지 레이아웃 ── */
@media (max-width: 768px) {
  /* 데스크탑 height:100% → 모바일은 콘텐츠 만큼 늘어남 (페이지 스크롤 사용) */
  .arch-root { height: auto; }
  .arch-diagram {
    overflow-y: visible;
    /* [2026-06] 가로 패딩 제거 — 카드(레이어)가 SPACK/DDD 처럼 가로폭 꽉 차게. */
    padding: 14px 0;
    flex: 0 0 auto;
  }
  .arch-header {
    padding: 14px 16px 12px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .header-actions {
    flex-wrap: wrap;
    width: 100%;
    gap: 6px;
  }
  .layer { padding: 14px 14px; border-radius: 12px; }
  .layer-tag { font-size: 0.66rem; padding: 3px 8px; }
  .node-grid { gap: 8px; }
  .node-card { padding: 12px; }
}

@media (max-width: 900px) {
  .arch-header {
    flex-direction: column;
    align-items: flex-start !important;
    /* [2026-06] 좌우 패딩 제거 — DDD(업무 지도)처럼 콘텐츠를 탭 좌측 끝에 정렬. */
    padding: 16px 0 12px;
    gap: 12px;
  }
  .header-actions {
    width: 100%;
    /* [2026-06] PRD 연결 배지(좌) ↔ 새로고침(우) 양끝 정렬 — grow 제거로 '자세히'가
       새로고침과 겹치던 문제 해소. */
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 10px;
  }
  .header-actions > :first-child { flex: 0 1 auto; min-width: 0; }
  /* [2026-06] 카드(레이어) 가로 패딩 제거 — 헤더와 동일하게 탭 좌측 끝 정렬(768~900 포함). */
  .arch-diagram { padding: 14px 0; }
}

/* 탭 제목 영어 보조 표기 (2026-06 i18n — DddTab 와 동일 패턴) */
.tab-title-en {
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 600;
  color: var(--text-muted); margin-left: 8px; letter-spacing: 0;
}
/* [2026-06] 제목/부제 — SpackTab·DddTab 와 동일 스타일. 이전엔 미정의라 h4/p 기본
   스타일(큰 글씨·검정)로 떠 SPACK/DDD 와 이질감이 있었음. */
.tab-title { font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 800; color: var(--text-main); margin: 0; }
.tab-subtitle-text { font-size: 0.78rem; color: var(--text-muted); margin: 2px 0 0; }
</style>