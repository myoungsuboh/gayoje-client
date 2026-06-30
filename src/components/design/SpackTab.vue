<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Network, Box, RefreshCw, Shield, Globe, Link2 } from 'lucide-vue-next'
import { useHarnessStore, API_BASE } from '@/store/harness'
import axios from '@/utils/axios'
import DesignLineagePanel from './DesignLineagePanel.vue'

import EmptyTabState from './EmptyTabState.vue'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import { useLineageCoverage, normalizeLineageList, unlinkedNodes } from '@/composables/useDesignLineage'
import EvalScoreCard from './EvalScoreCard.vue'
import { useEvalScore, onEvalScoreRefresh } from '@/composables/useEvalScore'

import { useDesignCrossLink } from '@/composables/useDesignCrossLink'
import { fetchWithRetryIfEmpty, extractRaw, isSpackEmpty } from '@/utils/designFetch'

const store = useHarnessStore()
const crossLink = useDesignCrossLink()
const isLoading = ref(false)

// [F4 — 2026-05] Entity 카드 클릭 시 lineage panel
const lineageOpen = ref(false)
const selectedItem = ref(null)
const openLineage = (item) => {
  if (!item) return
  selectedItem.value = item
  lineageOpen.value = true
}
const hasLineage = (item) => {
  // 옛 데이터 (lineage=undefined) 또는 confidence='none' 은 클릭 disable
  const c = item?.lineage?.confidence
  return c === 'direct' || c === 'inferred'
}

// [B — 2026-05] Entity lineage 채움률
const entityList = computed(() => spackData.value.entities)
const entityCoverage = useLineageCoverage(entityList)
// [2026-05-29] 통합 카드 — API · Policy 도 같이 측정. BE 응답에 lineage_confidence
// 가 없으면 useLineageCoverage 가 total=0 으로 떨어트려 자동 숨김.
const apiList = computed(() => spackData.value.apis)
const apiCoverage = useLineageCoverage(apiList)
const policyList = computed(() => spackData.value.policies)
const policyCoverage = useLineageCoverage(policyList)
// EvalScoreCard 로 넘길 통합 lineage list — 표시 우선순위 (API → Entity → Policy)
// [2026-05-29] unlinked: PRD 미연결 노드 → 펼침 패널에서 chip 으로 강조.
const spackLineageItems = computed(() => [
  { label: 'API', coverage: apiCoverage.value, unlinked: unlinkedNodes(spackData.value.apis) },
  { label: 'Entity', coverage: entityCoverage.value, unlinked: unlinkedNodes(spackData.value.entities) },
  { label: 'Policy', coverage: policyCoverage.value, unlinked: unlinkedNodes(spackData.value.policies) },
])

const spackData = ref({ apis: [], entities: [], policies: [], internal_rels: [], implement_rels: [] })

const hasSpackData = computed(() => spackData.value.apis.length > 0 || spackData.value.entities.length > 0 || spackData.value.policies.length > 0)

import { getNodeProp } from '@/utils/nodeUtils'

/**
 * SPACK 데이터 fetch.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.expectData=false] true 면 빈 응답 시 자동 재시도 (~3회).
 *   createSpack 직후 BE consistency lag 회피용 — 평소 fetch 는 retry 없음 (지연 회피).
 */
const fetchData = async ({ expectData = false } = {}) => {
  if (!store.projectName) return
  isLoading.value = true
  try {
    const response = await fetchWithRetryIfEmpty({
      url: `${API_BASE}/getSpack`,
      params: { projectName: store.projectName },
      isEmpty: isSpackEmpty,
      maxAttempts: expectData ? 3 : 1,
    })
    const raw = extractRaw(response)
    spackData.value = {
      apis: Array.isArray(raw.apis) ? raw.apis : [],
      // BE 가 lineage 를 flat field 로 저장 → nested 복원
      entities: normalizeLineageList(raw.entities),
      policies: Array.isArray(raw.policies) ? raw.policies : [],
      internal_rels: Array.isArray(raw.internal_rels) ? raw.internal_rels : [],
      implement_rels: Array.isArray(raw.implement_rels) ? raw.implement_rels : [],
      // [2026-05-19 Phase 2] cross-jump rel — 부모 composable 에 공유
      entity_mapping_rels: Array.isArray(raw.entity_mapping_rels) ? raw.entity_mapping_rels : [],
      api_service_rels: Array.isArray(raw.api_service_rels) ? raw.api_service_rels : [],
    }
    crossLink.setSpackData(spackData.value)
  } catch (error) {
    console.error('SPACK 조회 실패:', error)
  } finally {
    isLoading.value = false
  }
}

// [2026-05-19 Phase 3] cross-jump 점프 trigger — 같은 탭 안에서 노드 강조 + scroll.
// selectedNode 변경 또는 requestedJump (재요청 포함) 모두 watcher 에서 처리.
const jumpTargetEntityId = computed(() => {
  const sel = crossLink.selectedNode.value
  return sel?.kind === 'entity' ? sel.id : null
})
const jumpTargetApiId = computed(() => {
  const sel = crossLink.selectedNode.value
  return sel?.kind === 'api' ? sel.id : null
})

watch(() => crossLink.requestedJump.value, async (jump) => {
  if (!jump || jump.tab !== 'spack') return
  // Vue 가 DOM 그릴 때까지 대기 후 scroll.
  await new Promise(r => requestAnimationFrame(r))
  const sel = `[data-spack-node="${jump.kind}:${jump.id}"]`
  const el = document.querySelector(sel)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, { immediate: true })

// cross-link chip — Entity 카드용 (DDD 측 매핑 + Service)
const chainFor = (entityId) => crossLink.entityChain.value[entityId] || null
// cross-link chip — API 카드용 (Service 매핑)
const serviceFor = (apiId) => crossLink.apiToService.value[apiId] || null

const jumpToDddAggregate = (e) => {
  e?.stopPropagation?.()
  const id = e?.currentTarget?.dataset?.targetId
  if (id) crossLink.jumpTo({ kind: 'aggregate', id, tab: 'ddd' })
}
const jumpToDddDomainEntity = (e) => {
  e?.stopPropagation?.()
  const id = e?.currentTarget?.dataset?.targetId
  if (id) crossLink.jumpTo({ kind: 'domain_entity', id, tab: 'ddd' })
}
const jumpToService = (e) => {
  e?.stopPropagation?.()
  const id = e?.currentTarget?.dataset?.targetId
  if (id) crossLink.jumpTo({ kind: 'service', id, tab: 'architecture' })
}

onMounted(() => { fetchData() })
watch(() => store.projectName, () => { fetchData() })

// [2026-05] 백그라운드 autofill 등 데이터 변경 잡이 완료되면 전역 refresh 버스로
// SPACK 내용을 재조회 — 잡을 띄운 모달/컴포넌트가 사라진 뒤 완료돼도 (탭이 마운트돼
// 있는 한) 최신 error_cases/auth 가 화면에 반영된다. 복귀 시엔 onMounted 가 커버.
const _offRefresh = onEvalScoreRefresh(() => fetchData())
onBeforeUnmount(_offRefresh)

// [Phase E — 2026-05-25] 명세 충실도 점수. 빈 그래프면 score=null 로 카드 숨김.
const projectNameForScore = computed(() => store.projectName)
const { score: evalScore, loading: evalLoading } = useEvalScore(projectNameForScore)


defineExpose({ fetchData })
</script>

<template>
  <div class="spack-root">
    <div class="spack-inner">
      <div class="d-flex align-center justify-space-between">
        <div>
          <h4 class="tab-title">{{ $t('design.spack.title') }}<span class="tab-title-en">SPACK Components</span></h4>
          <p class="tab-subtitle-text">{{ $t('design.spack.subtitle') }}</p>
        </div>
        <div class="d-flex align-center" style="gap: 12px;">
          <!-- [2026-05-29] 통합 카드 — PRD 충실도 + SPACK 노드 종류별 PRD 연결 -->
          <EvalScoreCard
            :score="evalScore"
            :loading="evalLoading"
            tab-key="spack"
            :lineage-items="spackLineageItems"
            :project-name="store.projectName"
          />
          <VBtn icon variant="text" size="small" :loading="isLoading" @click="fetchData" class="btn-icon" :aria-label="$t('design.spack.refresh_aria')" :title="$t('design.spack.refresh_title')"><RefreshCw :size="16" /></VBtn>
        </div>
      </div>
      <EmptyTabState v-if="isLoading" loading :title="$t('design.spack.loading_title')" />
      <EmptyTabState
        v-else-if="!hasSpackData"
        :icon="Network"
        :title="$t('design.spack.empty_title')"
        :subtitle="$t('design.spack.empty_subtitle')"
      />
      <div v-else class="spack-grid">
        <!-- APIs Column -->
        <div class="spack-col">
          <div class="spack-col-header spack-col-header--api">
            <Globe :size="16" /><span>API</span>
            <GuideTooltip target="spack-api" placement="bottom" :size="12" />
            <span class="spack-col-count">{{ spackData.apis.length }}</span>
          </div>
          <div class="col-scroll custom-scroll">
            <div
              v-for="item in spackData.apis"
              :key="getNodeProp(item,'id',item.identity)"
              class="node-card"
              :class="{ 'node-card--selected': jumpTargetApiId === getNodeProp(item,'id') }"
              :data-spack-node="`api:${getNodeProp(item,'id')}`"
            >
              <div class="d-flex align-center gap-2 mb-1">
                <span class="method-badge" :class="'method-' + getNodeProp(item,'method','GET').toLowerCase()">{{ getNodeProp(item,'method','GET') }}</span>
                <code class="node-path">{{ getNodeProp(item,'endpoint') || getNodeProp(item,'path') }}</code>
              </div>
              <div class="node-name">{{ getNodeProp(item,'name') || getNodeProp(item,'title') }}</div>
              <div class="node-desc">{{ getNodeProp(item,'description') || getNodeProp(item,'desc') }}</div>
              <!-- cross-link: API → ArchService -->
              <button
                v-if="serviceFor(getNodeProp(item,'id'))"
                type="button"
                class="cross-chip cross-chip--service"
                :data-target-id="serviceFor(getNodeProp(item,'id')).id"
                :title="$t('design.spack.jump_service', { name: serviceFor(getNodeProp(item,'id')).name, id: serviceFor(getNodeProp(item,'id')).id })"
                @click="jumpToService"
              >
                → 🏛️ {{ serviceFor(getNodeProp(item,'id')).name }}
                <span class="cross-chip-id mono-text">{{ serviceFor(getNodeProp(item,'id')).id }}</span>
              </button>
            </div>
            <div v-if="!spackData.apis.length" class="col-empty">{{ $t('design.spack.api_empty') }}</div>
          </div>
        </div>
        <!-- Entities Column -->
        <div class="spack-col">
          <div class="spack-col-header spack-col-header--entity">
            <Box :size="16" /><span>Entity</span>
            <GuideTooltip target="spack-entity" placement="bottom" :size="12" />
            <span class="spack-col-count">{{ spackData.entities.length }}</span>
          </div>
          <div class="col-scroll custom-scroll">
            <div
              v-for="item in spackData.entities"
              :key="getNodeProp(item,'id',item.identity)"
              class="node-card"
              :class="{
                'node-card--clickable': hasLineage(item),
                [`node-card--confidence-${item.lineage?.confidence || 'unknown'}`]: true,
                'node-card--selected': jumpTargetEntityId === getNodeProp(item,'id'),
              }"
              :data-spack-node="`entity:${getNodeProp(item,'id')}`"
              @click="hasLineage(item) && openLineage(item)"
            >
              <div class="node-card-head">
                <div class="node-name">{{ getNodeProp(item,'name') || getNodeProp(item,'title') }}</div>
                <span v-if="hasLineage(item)" class="lineage-indicator" :title="$t('design.spack.lineage_basis', { n: item.lineage.related_stories.length })">
                  <Link2 :size="12" />
                  {{ item.lineage.related_stories.length }}
                </span>
              </div>
              <div class="node-desc">{{ getNodeProp(item,'description') || getNodeProp(item,'desc') }}</div>
              <!-- cross-link: Entity → DDD Aggregate/DomainEntity → ArchService -->
              <div v-if="chainFor(getNodeProp(item,'id'))" class="cross-chip-row">
                <button
                  v-if="chainFor(getNodeProp(item,'id')).aggId"
                  type="button"
                  class="cross-chip cross-chip--aggregate"
                  :data-target-id="chainFor(getNodeProp(item,'id')).aggId"
                  :title="$t('design.spack.jump_aggregate', { name: chainFor(getNodeProp(item,'id')).aggName })"
                  @click.stop="jumpToDddAggregate"
                >
                  → 📦 {{ chainFor(getNodeProp(item,'id')).aggName }}
                  <span class="cross-chip-id mono-text">{{ chainFor(getNodeProp(item,'id')).aggId }}</span>
                </button>
                <button
                  v-else-if="chainFor(getNodeProp(item,'id')).dentId"
                  type="button"
                  class="cross-chip cross-chip--dentity"
                  :data-target-id="chainFor(getNodeProp(item,'id')).dentId"
                  :title="$t('design.spack.jump_domain_entity', { name: chainFor(getNodeProp(item,'id')).dentName })"
                  @click.stop="jumpToDddDomainEntity"
                >
                  → 🔵 {{ chainFor(getNodeProp(item,'id')).dentName }}
                </button>
                <button
                  v-if="chainFor(getNodeProp(item,'id')).svcId"
                  type="button"
                  class="cross-chip cross-chip--service"
                  :data-target-id="chainFor(getNodeProp(item,'id')).svcId"
                  :title="$t('design.spack.jump_service_named', { name: chainFor(getNodeProp(item,'id')).svcName })"
                  @click.stop="jumpToService"
                >
                  → 🏛️ {{ chainFor(getNodeProp(item,'id')).svcName }}
                </button>
              </div>
            </div>
            <div v-if="!spackData.entities.length" class="col-empty">{{ $t('design.spack.entity_empty') }}</div>
          </div>
        </div>
        <!-- Policies Column -->
        <div class="spack-col">
          <div class="spack-col-header spack-col-header--policy">
            <Shield :size="16" /><span>Policy</span>
            <GuideTooltip target="spack-policy" placement="bottom" :size="12" />
            <span class="spack-col-count">{{ spackData.policies.length }}</span>
          </div>
          <div class="col-scroll custom-scroll">
            <!-- [2026-05-28] Policy 카드 렌더링 schema 와 align — 기존 name/title/rule 은
                 BE 에 저장조차 안 되는 필드라 항상 빈 카드 노출. 실제 schema 의
                 category / description / related_entity 표시. -->
            <div v-for="item in spackData.policies" :key="getNodeProp(item,'id',item.identity)" class="node-card">
              <div class="node-card-head">
                <span
                  v-if="getNodeProp(item,'category')"
                  class="policy-category-badge"
                  :class="`policy-category-badge--${String(getNodeProp(item,'category')).toLowerCase()}`"
                >
                  {{ getNodeProp(item,'category') }}
                </span>
                <code v-if="getNodeProp(item,'id')" class="policy-id">{{ getNodeProp(item,'id') }}</code>
              </div>
              <div v-if="getNodeProp(item,'description')" class="node-desc">
                {{ getNodeProp(item,'description') }}
              </div>
              <div v-else class="policy-empty-desc">
                {{ $t('design.spack.policy_no_content') }}
              </div>
              <div v-if="getNodeProp(item,'related_entity')" class="policy-related">
                {{ $t('design.spack.policy_related') }}
                <code class="policy-related__name">{{ getNodeProp(item,'related_entity') }}</code>
              </div>
            </div>
            <div v-if="!spackData.policies.length" class="col-empty">{{ $t('design.spack.policy_empty') }}</div>
          </div>
        </div>
      </div>
    </div>
    <!-- [F4 — 2026-05] Lineage Panel -->
    <DesignLineagePanel v-model="lineageOpen" :item="selectedItem" node-type="entity" />
  </div>
</template>

<style scoped>
.spack-root { display: flex; flex-direction: column; height: 100%; animation: fadeIn 0.4s ease-out; }
.spack-inner { display: flex; flex-direction: column; height: 100%; gap: 16px; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.btn-icon :deep(.v-btn__content) { color: var(--text-muted); }
.tab-title { font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 800; color: var(--text-main); margin: 0; }
.tab-subtitle-text { font-size: 0.78rem; color: var(--text-muted); margin: 2px 0 0; }
.spack-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; flex: 1; min-height: 0; overflow: hidden; }
.col-scroll { flex: 1; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; padding: 16px; min-height: 0; }
.spack-col { display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 16px; overflow: hidden; min-height: 0; }
.spack-col-header { display: flex; align-items: center; gap: 8px; padding: 14px 18px; font-family: 'Outfit', sans-serif; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid var(--border-light); flex-shrink: 0; }
.spack-col-header--api { color: #2196F3; background: #E3F2FD; }
.spack-col-header--entity { color: #4CAF50; background: #E8F5E9; }
.spack-col-header--policy { color: #FF9800; background: #FFF3E0; }
.spack-col-count { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; background: rgba(0,0,0,0.06); padding: 2px 8px; border-radius: 9999px; font-weight: 700; }
.node-card { background: white; border: 1px solid var(--border-light); border-radius: 10px; padding: 14px 16px; transition: border-color 0.15s; flex-shrink: 0; }
.node-card:hover { border-color: var(--accent); }
.node-name { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px; }
.node-desc { font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; }
.node-path { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; color: var(--text-muted); background: var(--bg-light); padding: 1px 6px; border-radius: 4px; }
.node-rule { font-size: 0.75rem; color: #FF9800; background: #FFF3E0; border-radius: 6px; padding: 4px 8px; margin-top: 6px; }
.method-badge { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
.method-get { background: #E3F2FD; color: #1565C0; }
.method-post { background: #E8F5E9; color: #2E7D32; }
.method-put { background: #FFF3E0; color: #E65100; }
.method-delete { background: #FFEBEE; color: #C62828; }
.method-patch { background: #F3E5F5; color: #6A1B9A; }
.col-empty { padding: 24px; text-align: center; font-size: 0.78rem; color: var(--text-muted); border: 1px dashed var(--border-light); border-radius: 10px; }

/* [2026-05-28] Policy 카드 — schema (category / description / related_entity) 와 일치. */
.policy-category-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: #FFF3E0;
  color: #E65100;
  border: 1px solid #FFCC80;
}
.policy-category-badge--security {
  background: #FFEBEE; color: #C62828; border-color: #EF9A9A;
}
.policy-category-badge--performance {
  background: #E3F2FD; color: #1565C0; border-color: #90CAF9;
}
.policy-category-badge--compliance {
  background: #E8F5E9; color: #2E7D32; border-color: #A5D6A7;
}
.policy-category-badge--audit {
  background: #F3E5F5; color: #6A1B9A; border-color: #CE93D8;
}
.policy-category-badge--edgecase {
  background: #E0F7FA; color: #00838F; border-color: #80DEEA;
}
.policy-id {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-muted);
  background: var(--bg-light);
  padding: 1px 6px;
  border-radius: 4px;
}
.policy-empty-desc {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 6px 0;
}
.policy-related {
  margin-top: 8px;
  font-size: 0.72rem;
  color: var(--text-muted);
}
.policy-related__name {
  font-family: 'IBM Plex Mono', monospace;
  background: var(--bg-light);
  padding: 1px 6px;
  border-radius: 4px;
  color: #2E7D32;
}
.custom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

/* [F5 — 2026-05] confidence 시각 구분 + 클릭 가능 표시 */
.node-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.lineage-indicator {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  background: #EFF6FF;
  color: #2563EB;
  border: 1px solid #BFDBFE;
}
.node-card--clickable {
  cursor: pointer;
}

/* [2026-05-19 Phase 3] cross-jump 점프 시 강조 — 깜빡 + 외곽선. */
.node-card--selected {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  animation: cross-flash 1.4s ease-out;
}
@keyframes cross-flash {
  0%   { background: rgba(140, 98, 57, 0.18); }
  100% { background: white; }
}

/* cross-link chip — Entity → Aggregate / Aggregate → Service 점프 버튼. */
.cross-chip-row {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-top: 10px;
}
.cross-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px;
  font-size: 11px; font-weight: 600;
  border: 1px solid transparent; border-radius: 9999px;
  background: var(--bg-light);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.12s;
  font-family: 'Pretendard Variable', sans-serif;
}
.cross-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}
.cross-chip--aggregate {
  background: rgba(99, 102, 241, 0.08);
  color: #4F46E5;
  border-color: rgba(99, 102, 241, 0.25);
}
.cross-chip--aggregate:hover { background: rgba(99, 102, 241, 0.18); }
.cross-chip--dentity {
  background: rgba(59, 130, 246, 0.08);
  color: #1D4ED8;
  border-color: rgba(59, 130, 246, 0.25);
}
.cross-chip--dentity:hover { background: rgba(59, 130, 246, 0.18); }
.cross-chip--service {
  background: rgba(46, 64, 54, 0.08);
  color: #1F2D27;
  border-color: rgba(46, 64, 54, 0.22);
}
.cross-chip--service:hover { background: rgba(46, 64, 54, 0.18); }
.cross-chip-id {
  font-size: 9.5px; font-weight: 700;
  opacity: 0.6;
  padding-left: 2px;
}
.node-card--clickable:hover {
  border-color: #2563EB;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.08);
}
.node-card--confidence-direct {
  border-left: 3px solid #4CAF50;
}
.node-card--confidence-inferred {
  border-left: 3px dashed #FFB570;
}
.node-card--confidence-none,
.node-card--confidence-unknown {
  border-left: 3px dotted #D0D0D0;
  opacity: 0.85;
}
.custom-scroll::-webkit-scrollbar-thumb:hover { background: #d0d0d0; }

/* ── Mobile / narrow tablet (≤768px) ──
 * [2026-05-21] 3-col grid 가 좁은 화면에서 각 컬럼 ~100px → 한글이 글자 단위로
 * wrap 돼 사실상 읽기 불가. 모바일은 1-col 세로 스택으로 전환. 컬럼당 max-height
 * 도 풀어 내용 길이만큼 자연스럽게 늘림 (페이지 단위 스크롤).
 */
@media (max-width: 768px) {
  .spack-root, .spack-inner {
    height: auto;   /* 데스크탑 100% → 모바일은 콘텐츠 만큼 늘어남 */
  }
  /* 헤더 (제목 + Entity 배지) — 좁은 폭에서 wrap 허용 */
  .spack-inner > .d-flex.justify-space-between {
    flex-wrap: wrap;
    gap: 8px;
  }
  .spack-grid {
    grid-template-columns: 1fr;
    gap: 12px;
    overflow: visible;
    flex: 0 0 auto;
  }
  .spack-col {
    overflow: visible;
    min-height: 0;
  }
  .col-scroll {
    /* 모바일에선 자체 스크롤 X — 페이지 스크롤에 합류 (이중 스크롤 회피) */
    overflow-y: visible;
    padding: 12px;
    gap: 12px;
  }
  .spack-col-header {
    padding: 10px 14px;
    font-size: 0.7rem;
  }
  .spack-col-count { font-size: 0.66rem; padding: 1px 7px; }
  .node-card { padding: 12px 14px; }
  .node-name { font-size: 0.84rem; }
  .node-desc { font-size: 0.74rem; }
  .col-empty { padding: 16px; font-size: 0.74rem; }
}

@media (max-width: 900px) {
  .spack-inner > .d-flex.justify-space-between {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 12px;
  }
  .spack-inner > .d-flex.justify-space-between > .d-flex {
    width: 100%;
    /* [2026-06] PRD 연결 배지(좌) ↔ 새로고침(우) 양끝 정렬. grow 제거로 겹침 방지. */
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 10px;
  }
  .spack-inner > .d-flex.justify-space-between > .d-flex > :first-child { flex: 0 1 auto; min-width: 0; }
}

/* 탭 제목 영어 보조 표기 (2026-06 i18n — DddTab 와 동일 패턴) */
.tab-title-en {
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 600;
  color: var(--text-muted); margin-left: 8px; letter-spacing: 0;
}
</style>
