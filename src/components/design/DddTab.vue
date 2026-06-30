<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { GitBranch, Box, RefreshCw, Zap, Database, Link2, ChevronDown } from 'lucide-vue-next'
import { useHarnessStore, API_BASE } from '@/store/harness'
import axios from '@/utils/axios'
import DesignLineagePanel from './DesignLineagePanel.vue'


import EmptyTabState from './EmptyTabState.vue'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import { useLineageCoverage, normalizeLineageList, unlinkedNodes } from '@/composables/useDesignLineage'
import { useDesignCrossLink } from '@/composables/useDesignCrossLink'
import EvalScoreCard from './EvalScoreCard.vue'
import { useEvalScore } from '@/composables/useEvalScore'
import { fetchWithRetryIfEmpty, extractRaw, isDddEmpty } from '@/utils/designFetch'

const store = useHarnessStore()
const { t } = useI18n()
const isLoading = ref(false)

// [2026-05-30] '이 화면 읽는 법' 설명 카드 — 모바일에선 본문 앞 공간을 크게 먹어
// 기본 접힘(좁은 화면), 데스크톱은 펼침. 내용은 토글로 언제든 볼 수 있음.
const _isNarrowViewport = typeof window !== 'undefined' && window.innerWidth <= 600
const introOpen = ref(!_isNarrowViewport)

// [F4 — 2026-05] Aggregate/DomainEntity 카드 클릭 시 lineage panel
// [C — 2026-05] nodeType 인자 추가 — Aggregate / DomainEntity 둘 다 한 패널이 처리.
const lineageOpen = ref(false)
const selectedItem = ref(null)
const selectedNodeType = ref('aggregate')
const openLineage = (item, nodeType = 'aggregate') => {
  selectedItem.value = item
  selectedNodeType.value = nodeType
  lineageOpen.value = true
}
const hasLineage = (item) => {
  const c = item?.lineage?.confidence
  return c === 'direct' || c === 'inferred'
}

// [2026-05-28] invariants = 이 데이터 묶음이 "반드시 지켜야 할 규칙".
// Neo4j 가 primitive 제약으로 JSON string 직렬화할 수 있어 양쪽 케이스 모두 복원.
const aggInvariants = (agg) => {
  const raw = agg?.invariants
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw]
    } catch {
      return [raw]
    }
  }
  return []
}

// [2026-05-28] "그래서 뭘 고쳐라" — PRD(기능)와 연결 안 된 항목을 콕 집어준다.
// EvalScoreCard 떠먹여주기와 동일 컨셉: 비전공자가 "이 항목들 손봐야 하는구나" 를 즉시 인지.
const _UNLINKED_CAP = 8
const unlinkedItems = computed(() => {
  const out = []
  for (const a of dddData.value.aggregates) {
    if (!hasLineage(a)) {
      out.push({ kind: 'aggregate', label: t('design.ddd.aggregate'),
                 id: getNodeProp(a, 'id'),
                 name: getNodeProp(a, 'name') || getNodeProp(a, 'title') || t('design.ddd.unnamed') })
    }
  }
  for (const e of dddData.value.domain_entities) {
    if (!hasLineage(e)) {
      out.push({ kind: 'domain_entity', label: t('design.ddd.domain_entity_short'),
                 id: getNodeProp(e, 'id'),
                 name: getNodeProp(e, 'name') || getNodeProp(e, 'title') || t('design.ddd.unnamed') })
    }
  }
  return out
})
const unlinkedVisible = computed(() => unlinkedItems.value.slice(0, _UNLINKED_CAP))
const unlinkedOverflow = computed(() => Math.max(0, unlinkedItems.value.length - _UNLINKED_CAP))

// [B — 2026-05] Aggregate lineage 채움률
const aggregateList = computed(() => dddData.value.aggregates)
const aggregateCoverage = useLineageCoverage(aggregateList)
// [C — 2026-05] DomainEntity lineage 채움률
const domainEntityList = computed(() => dddData.value.domain_entities)
const domainEntityCoverage = useLineageCoverage(domainEntityList)
// [2026-05-29] Event lineage 도 측정 — BE 응답에 lineage 없으면 자동 숨김.
const domainEventList = computed(() => dddData.value.domain_events)
const domainEventCoverage = useLineageCoverage(domainEventList)
// EvalScoreCard 로 넘길 통합 lineage list — DDD 컨텍스트.
// [2026-05-29] PR #134 한글화 톤과 통일 — 비전공자에게 친숙한 라벨.
const dddLineageItems = computed(() => [
  { label: t('design.ddd.aggregate'), coverage: aggregateCoverage.value, unlinked: unlinkedNodes(dddData.value.aggregates) },
  { label: t('design.ddd.domain_entity'), coverage: domainEntityCoverage.value, unlinked: unlinkedNodes(dddData.value.domain_entities) },
  { label: t('design.ddd.domain_event'), coverage: domainEventCoverage.value, unlinked: unlinkedNodes(dddData.value.domain_events) },
])

const CTX_COLORS = ['#6366F1','#EC4899','#14B8A6','#F59E0B','#8B5CF6','#EF4444','#0EA5E9','#10B981']
const CTX_BG    = ['#EEF2FF','#FDF2F8','#F0FDFA','#FFFBEB','#F5F3FF','#FEF2F2','#F0F9FF','#ECFDF5']

const dddData = ref({ contexts: [], aggregates: [], domain_entities: [], domain_events: [], internal_rels: [], trigger_rels: [] })

const hasDddData = computed(() => dddData.value.contexts.length > 0 || dddData.value.aggregates.length > 0)

import { getNodeProp } from '@/utils/nodeUtils'

const contextGroups = computed(() =>
  dddData.value.contexts.map((ctx, i) => {
    const ctxId = getNodeProp(ctx, 'id')
    const aggs = dddData.value.aggregates.filter(a =>
      dddData.value.internal_rels.some(r => r.type === 'BELONGS_TO' && r.source_id === a.id && r.target_id === ctxId))
    const aggIds = aggs.map(a => a.id)
    const entities = dddData.value.domain_entities.filter(e =>
      dddData.value.internal_rels.some(r => r.type === 'PART_OF' && r.source_id === e.id && aggIds.includes(r.target_id)))
    const events = dddData.value.domain_events.filter(ev =>
      dddData.value.internal_rels.some(r => r.type === 'PUBLISHES' && r.target_id === ev.id && aggIds.includes(r.source_id)))
    return { ctx, aggs, entities, events, color: CTX_COLORS[i % CTX_COLORS.length], bg: CTX_BG[i % CTX_BG.length] }
  })
)

const crossLink = useDesignCrossLink()

/**
 * DDD 데이터 fetch.
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
      url: `${API_BASE}/getDDD`,
      params: { projectName: store.projectName },
      isEmpty: isDddEmpty,
      maxAttempts: expectData ? 3 : 1,
    })
    const raw = extractRaw(response)
    dddData.value = {
      contexts: Array.isArray(raw.contexts) ? raw.contexts : [],
      // BE 가 lineage 를 flat field 로 저장 → nested 복원
      aggregates: normalizeLineageList(raw.aggregates),
      domain_entities: normalizeLineageList(raw.domain_entities),
      domain_events: Array.isArray(raw.domain_events) ? raw.domain_events : [],
      internal_rels: Array.isArray(raw.internal_rels) ? raw.internal_rels : [],
      trigger_rels: Array.isArray(raw.trigger_rels) ? raw.trigger_rels : [],
      // [2026-05-19 Phase 2] cross-jump rel
      aggregate_service_rels: Array.isArray(raw.aggregate_service_rels) ? raw.aggregate_service_rels : [],
    }
    crossLink.setDddData(dddData.value)
  } catch (error) {
    console.error('DDD 조회 실패:', error)
  } finally {
    isLoading.value = false
  }
}

// [2026-05-19 Phase 3] cross-jump 강조 + scroll. SpackTab 동일 패턴.
const jumpTargetAggId = computed(() => {
  const sel = crossLink.selectedNode.value
  return sel?.kind === 'aggregate' ? sel.id : null
})
const jumpTargetDentId = computed(() => {
  const sel = crossLink.selectedNode.value
  return sel?.kind === 'domain_entity' ? sel.id : null
})

watch(() => crossLink.requestedJump.value, async (jump) => {
  if (!jump || jump.tab !== 'ddd') return
  await new Promise(r => requestAnimationFrame(r))
  const sel = `[data-ddd-node="${jump.kind}:${jump.id}"]`
  const el = document.querySelector(sel)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, { immediate: true })

// Aggregate → ArchService chip
const serviceForAggregate = (aggId) => crossLink.aggregateToService.value[aggId] || null

const jumpToService = (e) => {
  e?.stopPropagation?.()
  const id = e?.currentTarget?.dataset?.targetId
  if (id) crossLink.jumpTo({ kind: 'service', id, tab: 'architecture' })
}

// [2026-06] MAPPED_TO.role 품질 체크 — aggregate_root 제약 위반
const qualityViolations = ref([])
const fetchQuality = async () => {
  if (!store.projectName) return
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    const { data } = await axios.get(`${base}/api/v2/design/quality`, {
      params: { project_name: store.projectName, ...(store.teamId ? { team_id: store.teamId } : {}) },
    })
    qualityViolations.value = data?.violations ?? []
  } catch {
    qualityViolations.value = []
  }
}

onMounted(() => { fetchData(); fetchQuality() })
watch(() => store.projectName, () => { fetchData(); fetchQuality() })

// [Phase E — 2026-05-25] 명세 충실도 점수 (SpackTab 과 같은 패턴).
const projectNameForScore = computed(() => store.projectName)
const { score: evalScore, loading: evalLoading } = useEvalScore(projectNameForScore)


defineExpose({ fetchData })
</script>

<template>
  <div class="ddd-root">
    <!-- Top bar -->
    <div class="ddd-topbar">
      <div class="ddd-title-block">
        <h4 class="tab-title">
          {{ $t('design.ddd.title') }}
          <span class="tab-title-en">Domain Map</span>
          <GuideTooltip target="ddd-domain-map" placement="bottom" :size="13" />
        </h4>
        <p class="tab-subtitle-text">{{ $t('design.ddd.subtitle') }}</p>
      </div>
      <div class="ddd-topbar-right">
        <!-- [2026-05-29] 통합 카드 — PRD 충실도 + DDD 노드 종류별 PRD 연결 -->
        <span class="d-inline-flex align-center">
          <EvalScoreCard
            :score="evalScore"
            :loading="evalLoading"
            tab-key="ddd"
            :lineage-items="dddLineageItems"
            :project-name="store.projectName"
            @autofilled="fetchData"
          />
          <GuideTooltip target="ddd-lineage-badge" placement="bottom" :size="11" />
        </span>
        <VBtn icon variant="text" size="small" :loading="isLoading" @click="fetchData" class="btn-icon" :aria-label="$t('design.ddd.refresh_aria')" :title="$t('design.ddd.refresh_title')">
          <RefreshCw :size="16" />
        </VBtn>
      </div>
    </div>

    <!-- 비전공자용 안내 — 이 페이지가 뭐고, 왜 보고, 어떻게 읽는지 즉시 인지. -->
    <div v-if="hasDddData" class="ddd-intro">
      <button
        class="ddd-intro__toggle"
        type="button"
        :aria-expanded="introOpen"
        @click="introOpen = !introOpen"
      >
        <ChevronDown :size="14" class="ddd-intro__chevron" :class="{ 'ddd-intro__chevron--open': introOpen }" />
        <span>{{ $t('design.ddd.intro_toggle') }}</span>
      </button>
      <div v-show="introOpen" class="ddd-intro__content">
        <p class="ddd-intro__lead">
          <span v-html="$t('design.ddd.intro_lead_text')"></span>
          <span class="ddd-intro__why">{{ $t('design.ddd.intro_lead_why') }}</span>
        </p>
        <p class="ddd-intro__terms" v-html="$t('design.ddd.intro_terms')"></p>
        <!-- 읽는 법 — 테두리 스타일이 무슨 뜻인지 (실선/점선/점). -->
        <div class="ddd-intro__legend">
          <span class="read-key"><span class="read-line read-line--solid"></span>{{ $t('design.ddd.intro_legend_direct') }}</span>
          <span class="read-key"><span class="read-line read-line--dashed"></span>{{ $t('design.ddd.intro_legend_dashed') }}</span>
          <span class="read-key"><span class="read-line read-line--dotted"></span>{{ $t('design.ddd.intro_legend_dotted') }}</span>
        </div>
      </div>
    </div>

    <!-- 보강 안내 — PRD(기능)와 연결 안 된 항목을 콕 집어 떠먹여줌. -->
    <div v-if="hasDddData && unlinkedItems.length" class="ddd-fixguide">
      <div class="ddd-fixguide__head">
        <span class="ddd-fixguide__badge">{{ unlinkedItems.length }}</span>
        <span class="ddd-fixguide__title">{{ $t('design.ddd.fixguide_title') }}</span>
      </div>
      <p class="ddd-fixguide__desc" v-html="$t('design.ddd.fixguide_desc')"></p>
      <div class="ddd-fixguide__chips">
        <span v-for="it in unlinkedVisible" :key="`${it.kind}:${it.id}`" class="fix-chip">
          <span class="fix-chip__kind">{{ it.label }}</span>
          <span class="fix-chip__name">{{ it.name }}</span>
        </span>
        <span v-if="unlinkedOverflow" class="fix-chip fix-chip--more">{{ $t('design.ddd.unlinked_more', { n: unlinkedOverflow }) }}</span>
      </div>
    </div>

    <!-- 품질 체크 — aggregate_root 제약 위반 -->
    <div v-if="hasDddData && qualityViolations.length" class="ddd-qualguide">
      <div class="ddd-qualguide__head">
        <span class="ddd-qualguide__badge">{{ qualityViolations.length }}</span>
        <span class="ddd-qualguide__title">{{ $t('design.ddd.qualguide_title') }}</span>
      </div>
      <p class="ddd-qualguide__desc" v-html="$t('design.ddd.qualguide_desc')"></p>
      <div class="ddd-qualguide__chips">
        <span
          v-for="v in qualityViolations" :key="v.aggregate_id"
          class="qual-chip"
          :class="v.violation_type === 'missing_aggregate_root' ? 'qual-chip--missing' : 'qual-chip--multi'"
          :title="v.violation_type === 'missing_aggregate_root'
            ? $t('enums.violation_type.missing_aggregate_root.title')
            : $t('enums.violation_type.multiple_aggregate_roots.title', { count: v.root_count })"
        >
          <span class="qual-chip__kind">{{ v.violation_type === 'missing_aggregate_root'
            ? $t('enums.violation_type.missing_aggregate_root.chip')
            : $t('enums.violation_type.multiple_aggregate_roots.chip') }}</span>
          <span class="qual-chip__name">{{ v.aggregate_name }}</span>
        </span>
      </div>
    </div>

    <!-- Content -->
    <EmptyTabState v-if="isLoading" loading :title="$t('design.ddd.loading_title')" />
    <EmptyTabState
      v-else-if="!hasDddData"
      :icon="GitBranch"
      :title="$t('design.ddd.empty_title')"
      :subtitle="$t('design.ddd.empty_subtitle')"
    />
    <div v-else class="ddd-sections custom-scroll">
      <div v-for="grp in contextGroups" :key="getNodeProp(grp.ctx,'id',grp.ctx.identity)" class="ctx-section">
        <!-- Context Header -->
        <div class="ctx-header" :style="{ background: grp.color }">
          <div class="ctx-header-main">
            <span class="ctx-id">{{ getNodeProp(grp.ctx,'id') }}</span>
            <span class="ctx-name">
              {{ getNodeProp(grp.ctx,'name')||getNodeProp(grp.ctx,'title') }}
              <GuideTooltip target="ddd-bounded-context" placement="bottom" :size="11" class="ctx-tip" />
            </span>
            <span v-if="getNodeProp(grp.ctx,'description')" class="ctx-desc">
              {{ getNodeProp(grp.ctx,'description') }}
            </span>
          </div>
          <div class="ctx-stats">
            <div class="ctx-stat"><span class="ctx-stat-num">{{ grp.aggs.length }}</span><span class="ctx-stat-label">{{ $t('design.ddd.aggregate') }}</span></div>
            <div class="ctx-stat"><span class="ctx-stat-num">{{ grp.entities.length }}</span><span class="ctx-stat-label">{{ $t('design.ddd.domain_entity') }}</span></div>
            <div class="ctx-stat"><span class="ctx-stat-num">{{ grp.events.length }}</span><span class="ctx-stat-label">{{ $t('design.ddd.domain_event') }}</span></div>
          </div>
        </div>

        <!-- Context Body -->
        <div class="ctx-body">
          <!-- Aggregates -->
          <div v-if="grp.aggs.length" class="ctx-subsection">
            <div class="ctx-subsection-label" :style="{ color: grp.color }">
              <Box :size="12" />{{ $t('design.ddd.aggregate') }} <span class="subsection-en">Aggregate</span>
              <GuideTooltip target="ddd-aggregate" placement="bottom" :size="11" />
            </div>
            <div class="agg-grid">
              <div v-for="agg in grp.aggs" :key="getNodeProp(agg,'id',agg.identity)"
                class="agg-card"
                :class="{
                  'agg-card--clickable': hasLineage(agg),
                  [`agg-card--confidence-${agg.lineage?.confidence || 'unknown'}`]: true,
                  'agg-card--selected': jumpTargetAggId === getNodeProp(agg,'id'),
                }"
                :style="{ borderLeftColor: grp.color }"
                :data-ddd-node="`aggregate:${getNodeProp(agg,'id')}`"
                @click="hasLineage(agg) && openLineage(agg)">
                <div class="agg-icon" :style="{ background: grp.bg, color: grp.color }"><Box :size="14" /></div>
                <div class="agg-content">
                  <div class="agg-name">
                    {{ getNodeProp(agg,'name')||getNodeProp(agg,'title') }}
                    <span v-if="hasLineage(agg)" class="lineage-indicator">
                      <Link2 :size="11" />{{ agg.lineage.related_stories.length }}
                    </span>
                  </div>
                  <!-- 이 묶음이 무엇인지 한 줄 설명 — "뭐 하는 놈인지" 즉시 인지. -->
                  <div v-if="getNodeProp(agg,'description')" class="agg-desc">
                    {{ getNodeProp(agg,'description') }}
                  </div>
                  <!-- 지켜야 할 규칙 (invariants) — 도메인 규칙. -->
                  <div v-if="aggInvariants(agg).length" class="agg-rules">
                    <span class="agg-rules-label">{{ $t('design.ddd.invariants_label') }}</span>
                    <span v-for="(rule, ri) in aggInvariants(agg)" :key="ri" class="agg-rule">
                      {{ rule }}
                    </span>
                  </div>
                  <div class="agg-id">{{ getNodeProp(agg,'id') }}</div>
                  <!-- cross-link: Aggregate → ArchService -->
                  <button
                    v-if="serviceForAggregate(getNodeProp(agg,'id'))"
                    type="button"
                    class="cross-chip cross-chip--service"
                    :data-target-id="serviceForAggregate(getNodeProp(agg,'id')).id"
                    :title="$t('design.ddd.service_jump', { name: serviceForAggregate(getNodeProp(agg,'id')).name })"
                    @click.stop="jumpToService"
                  >
                    → 🏛️ {{ serviceForAggregate(getNodeProp(agg,'id')).name }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Entities -->
          <div v-if="grp.entities.length" class="ctx-subsection">
            <div class="ctx-subsection-label" style="color:#3B82F6">
              <Database :size="12" />{{ $t('design.ddd.domain_entity') }} <span class="subsection-en">Entity</span>
              <GuideTooltip target="ddd-entity" placement="bottom" :size="11" />
            </div>
            <div class="ent-grid">
              <div
                v-for="ent in grp.entities"
                :key="getNodeProp(ent,'id',ent.identity)"
                class="ent-card"
                :class="{
                  'ent-card--clickable': hasLineage(ent),
                  [`ent-card--confidence-${ent.lineage?.confidence || 'unknown'}`]: true,
                  'ent-card--selected': jumpTargetDentId === getNodeProp(ent,'id'),
                }"
                :data-ddd-node="`domain_entity:${getNodeProp(ent,'id')}`"
                @click="hasLineage(ent) && openLineage(ent, 'domain_entity')"
              >
                <div class="ent-card-name">
                  {{ getNodeProp(ent,'name')||getNodeProp(ent,'title') }}
                  <Link2 v-if="hasLineage(ent)" :size="10" class="ent-chip-icon" />
                </div>
                <div v-if="getNodeProp(ent,'description')" class="ent-card-desc">
                  {{ getNodeProp(ent,'description') }}
                </div>
              </div>
            </div>
          </div>

          <!-- Events -->
          <div v-if="grp.events.length" class="ctx-subsection">
            <div class="ctx-subsection-label" style="color:#F59E0B">
              <Zap :size="12" />{{ $t('design.ddd.domain_event') }} <span class="subsection-en">Event</span>
              <GuideTooltip target="ddd-event" placement="bottom" :size="11" />
            </div>
            <div class="events-grid">
              <div v-for="evt in grp.events" :key="getNodeProp(evt,'id',evt.identity)" class="evt-card">
                <div class="evt-icon"><Zap :size="13" /></div>
                <div class="evt-content">
                  <div class="evt-name">{{ getNodeProp(evt,'name')||getNodeProp(evt,'title') }}</div>
                  <div class="evt-desc">{{ getNodeProp(evt,'description')||getNodeProp(evt,'desc') }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="!grp.aggs.length && !grp.entities.length && !grp.events.length" class="ctx-empty">
            {{ $t('design.ddd.ctx_empty') }}
          </div>
        </div>
      </div>
    </div>
    <!-- [F4 — 2026-05] Lineage Panel -->
    <!-- [C — 2026-05] nodeType 동적 — Aggregate / DomainEntity 둘 다 -->
    <DesignLineagePanel v-model="lineageOpen" :item="selectedItem" :node-type="selectedNodeType" />
  </div>
</template>

<style scoped>
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.ddd-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; animation: fadeIn 0.4s ease-out; }
.ddd-topbar { display: flex; align-items: flex-start; justify-content: space-between; flex-shrink: 0; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
.ddd-title-block { min-width: 0; }
.ddd-topbar-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.tab-title { font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 800; color: var(--text-main); margin: 0; display: inline-flex; align-items: center; }
.tab-subtitle-text { font-size: 0.78rem; color: var(--text-muted); margin: 2px 0 0; }
/* board-legend 제거 (2026-06): 상단 범례 → 하단 섹션 헤더의 ⓘ 툴팁으로 이동. */

/* 비전공자용 한 줄 안내 — DDD 페이지의 큰 그림을 즉시 인지. */
.ddd-intro {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(59, 130, 246, 0.04) 50%, rgba(245, 158, 11, 0.04) 100%);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text-main);
  flex-shrink: 0;
}
.ddd-intro p { margin: 0; }
.ddd-intro__toggle {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 0; border: none; background: transparent; cursor: pointer;
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.78rem; font-weight: 800; color: var(--text-main);
}
.ddd-intro__chevron { color: var(--text-muted); transition: transform 0.2s; flex-shrink: 0; }
.ddd-intro__chevron--open { transform: rotate(180deg); }
.ddd-intro__content { margin-top: 10px; }
.ddd-intro :deep(strong) { color: var(--accent); font-weight: 700; }
.ddd-intro__lead { margin-bottom: 4px !important; }
.ddd-intro__why { color: var(--text-muted); font-weight: 500; }
.ddd-intro__terms { margin-bottom: 8px !important; }

/* 읽는 법 — 테두리 스타일 범례 */
.ddd-intro__legend {
  display: flex; flex-wrap: wrap; gap: 14px;
  padding-top: 8px; border-top: 1px dashed var(--border-light);
  font-size: 0.74rem; color: var(--text-muted);
}
.read-key { display: inline-flex; align-items: center; gap: 6px; }
.read-line { display: inline-block; width: 18px; height: 0; border-top-width: 2px; border-top-color: #6366F1; }
.read-line--solid { border-top-style: solid; }
.read-line--dashed { border-top-style: dashed; }
.read-line--dotted { border-top-style: dotted; border-top-color: #B0B0B0; }

/* 보강 안내 — PRD 미연결 항목 떠먹여주기 (EvalScoreCard 컨셉 일관). */
.ddd-fixguide {
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.ddd-fixguide__head { display: flex; align-items: center; gap: 8px; }
.ddd-fixguide__badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px;
  background: #F59E0B; color: white;
  font-size: 0.72rem; font-weight: 800; border-radius: 10px;
}
.ddd-fixguide__title { font-size: 0.86rem; font-weight: 700; color: var(--text-main); }
.ddd-fixguide__desc { font-size: 0.78rem; line-height: 1.55; color: var(--text-muted); margin: 6px 0 10px; }
.ddd-fixguide__desc :deep(strong) { color: #B45309; font-weight: 700; }
.ddd-fixguide__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.fix-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 8px;
  background: white; border: 1px solid rgba(245, 158, 11, 0.35);
  font-size: 0.74rem;
}
.fix-chip__kind {
  font-size: 0.62rem; font-weight: 700; color: #B45309;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.fix-chip__name { font-weight: 600; color: var(--text-main); }
.fix-chip--more { background: transparent; border-style: dashed; color: var(--text-muted); }

/* 품질 체크 — aggregate_root 제약 위반 */
.ddd-qualguide {
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.ddd-qualguide__head { display: flex; align-items: center; gap: 8px; }
.ddd-qualguide__badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px;
  background: #EF4444; color: white;
  font-size: 0.72rem; font-weight: 800; border-radius: 10px;
}
.ddd-qualguide__title { font-size: 0.86rem; font-weight: 700; color: var(--text-main); }
.ddd-qualguide__desc { font-size: 0.78rem; line-height: 1.55; color: var(--text-muted); margin: 6px 0 10px; }
.ddd-qualguide__desc :deep(strong) { color: #B91C1C; font-weight: 700; }
.ddd-qualguide__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.qual-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 8px;
  background: white; font-size: 0.74rem; cursor: default;
}
.qual-chip--missing { border: 1px solid rgba(239, 68, 68, 0.35); }
.qual-chip--multi { border: 1px solid rgba(245, 158, 11, 0.45); }
.qual-chip__kind {
  font-size: 0.62rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.qual-chip--missing .qual-chip__kind { color: #B91C1C; }
.qual-chip--multi .qual-chip__kind { color: #B45309; }
.qual-chip__name { font-weight: 600; color: var(--text-main); }

/* 섹션 라벨의 영어 보조 표기 */
.subsection-en {
  font-size: 0.62rem; font-weight: 600; opacity: 0.55;
  text-transform: none; letter-spacing: 0; margin-left: 2px;
}
/* 탭 제목의 영어 보조 표기 */
.tab-title-en {
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 600;
  color: var(--text-muted); margin-left: 8px; letter-spacing: 0;
}

.ctx-tip {
  /* 컨텍스트 헤더(컬러 배경) 안의 ⓘ — 흰 배경 대비 확보. */
  margin-left: 6px;
}
.ctx-tip :deep(.guide-tooltip-trigger) {
  color: rgba(255,255,255,0.75);
}
.ctx-tip :deep(.guide-tooltip-trigger:hover),
.ctx-tip :deep(.guide-tooltip-trigger:focus-visible) {
  color: #fff;
  background: rgba(255,255,255,0.18);
}
.btn-icon :deep(.v-btn__content) { color: var(--text-muted); }

/* Sections */
.ddd-sections { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; padding-right: 4px; padding-bottom: 20px; }

.ctx-section { border: 1px solid var(--border-light); border-radius: 20px; overflow: hidden; }
.ctx-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 28px; color: white; gap: 16px; flex-wrap: wrap; }
.ctx-header-main { display: flex; flex-direction: column; gap: 4px; }
.ctx-id { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; font-weight: 600; opacity: 0.85; }
.ctx-name { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 800; line-height: 1.2; }
.ctx-desc { font-size: 0.8rem; font-weight: 500; line-height: 1.45; opacity: 0.92; max-width: 540px; margin-top: 2px; }
.ctx-stats { display: flex; gap: 24px; }
.ctx-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 10px; }
.ctx-stat-num { font-family: 'IBM Plex Mono', monospace; font-size: 1.4rem; font-weight: 800; line-height: 1; }
.ctx-stat-label { font-family: 'Outfit', sans-serif; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9; }

.ctx-body { background: #FAFAFA; padding: 24px 28px; display: flex; flex-direction: column; gap: 24px; }
.ctx-subsection { display: flex; flex-direction: column; gap: 12px; }
.ctx-subsection-label { display: flex; align-items: center; gap: 6px; font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
.ctx-empty { font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 20px; border: 1px dashed var(--border-light); border-radius: 10px; }

/* Aggregates */
.agg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.agg-card { background: white; border: 1px solid var(--border-light); border-left: 4px solid; border-radius: 12px; padding: 16px; display: flex; align-items: flex-start; gap: 12px; transition: all 0.2s ease; max-width: 560px; }
.agg-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); transform: translateY(-1px); }
.agg-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.agg-name { font-family: 'Outfit', sans-serif; font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 3px; }
.agg-id { font-family: 'IBM Plex Mono', monospace; font-size: 0.62rem; color: var(--text-muted); margin-top: 6px; }
/* 묶음 한 줄 설명 — 뭐 하는 놈인지. */
.agg-desc { font-size: 0.76rem; line-height: 1.45; color: var(--text-muted); margin-bottom: 6px; }
/* 지켜야 할 규칙 (invariants) */
.agg-rules { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
.agg-rules-label { font-size: 0.6rem; font-weight: 700; color: #B45309; text-transform: uppercase; letter-spacing: 0.04em; }
.agg-rule { font-size: 0.72rem; color: #92400E; background: rgba(245, 158, 11, 0.1); border-radius: 6px; padding: 3px 8px; line-height: 1.4; }

/* Entities — 이름 + 한 줄 설명 카드 */
.ent-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.ent-card { background: white; border: 1px solid #BBDEFB; border-left: 3px solid #3B82F6; border-radius: 10px; padding: 10px 14px; transition: all 0.15s; }
.ent-card-name { display: flex; align-items: center; gap: 4px; font-family: 'Outfit', sans-serif; font-size: 0.84rem; font-weight: 700; color: #1565C0; }
.ent-card-desc { font-size: 0.74rem; line-height: 1.45; color: var(--text-muted); margin-top: 4px; }

/* Events */
.events-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px; }
.evt-card { max-width: 560px; }
.evt-card { display: flex; align-items: flex-start; gap: 12px; background: white; border: 1px solid #FFE082; border-left: 3px solid #F59E0B; border-radius: 12px; padding: 14px 16px; }
.evt-icon { color: #F59E0B; flex-shrink: 0; margin-top: 1px; }
.evt-name { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px; }
.evt-desc { font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; }

.custom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
.custom-scroll::-webkit-scrollbar-thumb:hover { background: #d0d0d0; }

/* [F5 — 2026-05] confidence 시각 구분 */
.agg-card--clickable { cursor: pointer; }
.agg-card--clickable:hover { border-color: #2563EB; }
/* [2026-05-19 Phase 3] cross-jump 강조 — 외곽선 + 짧은 flash. */
.agg-card--selected {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  animation: ddd-cross-flash 1.4s ease-out;
}
@keyframes ddd-cross-flash {
  0%   { box-shadow: 0 0 0 8px rgba(140, 98, 57, 0.25); }
  100% { box-shadow: 0 0 0 0 rgba(140, 98, 57, 0); }
}

/* cross-link chip — Aggregate → ArchService 점프 버튼. */
.cross-chip {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 6px;
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
.cross-chip--service {
  background: rgba(46, 64, 54, 0.08);
  color: #1F2D27;
  border-color: rgba(46, 64, 54, 0.22);
}
.cross-chip--service:hover { background: rgba(46, 64, 54, 0.18); }
.agg-card--confidence-direct { border-left-style: solid; }
.agg-card--confidence-inferred { border-left-style: dashed; }
.agg-card--confidence-none,
.agg-card--confidence-unknown { border-left-style: dotted; opacity: 0.85; }
.lineage-indicator {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 600;
  padding: 2px 6px; border-radius: 10px;
  background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE;
  margin-left: 8px;
}

/* [C — 2026-05] ent-card 클릭 + confidence 시각 */
.ent-card--clickable { cursor: pointer; }
.ent-card--clickable:hover { border-color: #2563EB; box-shadow: 0 4px 12px rgba(0,0,0,0.06); transform: translateY(-1px); }
.ent-card--confidence-direct { border-left-color: #4CAF50; }
.ent-card--confidence-inferred { border-left-color: #FFB570; border-left-style: dashed; }
.ent-card--confidence-none,
.ent-card--confidence-unknown { border-left-color: #D0D0D0; border-left-style: dotted; opacity: 0.9; }
.ent-card--selected {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  animation: ddd-cross-flash 1.4s ease-out;
}
.ent-chip-icon { margin-left: 4px; opacity: 0.7; }

/* ── Mobile responsive (≤768px) ──
 * [2026-05-21] 데스크탑 기준 디자인은 ctx-header 의 stats 박스 (1.4rem 숫자) 가
 * 너무 크고, 그리드도 minmax(220px) 라 모바일에서 1개씩만 들어가는데 padding 이 커
 * 컨텍스트 카드 하나가 viewport 전체를 차지. 모바일은 모든 cell 컴팩트화.
 */
@media (max-width: 768px) {
  /* root scroll 제거 — page 단위 스크롤에 합류 */
  .ddd-root { height: auto !important; }
  .ddd-sections {
    overflow-y: visible;
    flex: 0 0 auto;
    gap: 14px;
    padding-right: 0;
    padding-bottom: 16px;
  }
  .ctx-section { border-radius: 14px; }

  /* ctx-header 압축 — padding 절반, name 1.05rem, stats 한 줄 압축 */
  .ctx-header {
    padding: 14px 16px;
    gap: 10px;
  }
  .ctx-name { font-size: 1.05rem; }
  .ctx-id { font-size: 0.66rem; }
  .ctx-stats { gap: 8px; width: 100%; }
  .ctx-stat {
    flex: 1;
    padding: 6px 10px;
    gap: 1px;
  }
  .ctx-stat-num { font-size: 0.95rem; }
  .ctx-stat-label { font-size: 0.55rem; }

  /* ctx-body padding 축소 + subsection 간격 압축 */
  .ctx-body { padding: 16px; gap: 16px; }
  .ctx-subsection { gap: 8px; }
  .ctx-subsection-label { font-size: 0.65rem; }

  /* Aggregate / Event grid — 1-col 으로 강제 */
  .agg-grid { grid-template-columns: 1fr; gap: 8px; }
  .agg-card { padding: 12px; gap: 10px; }
  .agg-icon { width: 28px; height: 28px; }
  .agg-name { font-size: 0.86rem; }
  .agg-id { font-size: 0.6rem; }

  .events-grid { grid-template-columns: 1fr; gap: 8px; }
  .evt-card { padding: 12px; gap: 10px; }
  .evt-name { font-size: 0.84rem; }
  .evt-desc { font-size: 0.72rem; }

  .ent-grid { grid-template-columns: 1fr; gap: 8px; }
  .ent-card { padding: 9px 12px; }
  .ent-card-name { font-size: 0.8rem; }
  .ent-card-desc { font-size: 0.72rem; }
}

@media (max-width: 900px) {
  .ddd-topbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .ddd-topbar-right {
    width: 100%;
    /* [2026-06] PRD 연결 배지(좌) ↔ 새로고침(우) 양끝 정렬. grow 제거로 겹침 방지. */
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 10px;
  }
  .ddd-topbar-right > :first-child { flex: 0 1 auto; min-width: 0; }
  /* [2026-06] 모바일에선 색상 범례(데이터 묶음·묶음 속 데이터·일어난 사건) 숨김 — 헤더 한 줄로 정리. */
  .board-legend { display: none; }
}

</style>
