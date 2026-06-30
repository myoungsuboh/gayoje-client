/**
 * useDesignCrossLink — Design 3 탭 (SPACK / DDD / Architecture) 의 cross-jump
 * 매핑 데이터 + 선택 노드 상태 공유.
 *
 * [배경 — 2026-05-19 Phase 2]
 * Phase 1 에서 BE 가 noad cross-link 관계를 응답에 노출:
 *   - SpackGraph.entity_mapping_rels  : Entity → DDD location (Agg/DomainEntity)
 *   - SpackGraph.api_service_rels     : API → ArchService
 *   - DddGraph.aggregate_service_rels : Aggregate → ArchService
 *   - ArchService.owned_aggregate_names : Service → Aggregate names (역방향)
 *
 * 이 composable 은 그 관계들을 색인(Map) 으로 변환해 FE 가 "이 노드의
 * 짝이 어디 있나" O(1) 조회 가능하게 함. 또 "탭 점프" 의 도착 신호
 * (`requestedJump`) 를 시간 타임스탬프와 함께 전달 — 같은 노드를 두 번
 * 점프해도 watcher 가 재실행되도록.
 *
 * [구조]
 *   design.vue (parent) 에서 provideDesignCrossLink() 호출 → 자식 탭에서
 *   useDesignCrossLink() inject. 탭은 fetchData() 끝나면 setSpackData /
 *   setDddData / setArchData 로 raw 데이터 주입.
 *
 *   탭이 부모 design.vue 컨텍스트 밖에서 mount 될 경우 (테스트 등) →
 *   inject 실패 시 graceful — 빈 composable 인스턴스 반환.
 */
import { ref, computed, provide, inject } from 'vue'

const SYMBOL = Symbol('design-cross-link')

const createState = () => {
  const spackData = ref({
    apis: [],
    entities: [],
    policies: [],
    entity_mapping_rels: [],
    api_service_rels: [],
  })
  const dddData = ref({
    contexts: [],
    aggregates: [],
    domain_entities: [],
    domain_events: [],
    aggregate_service_rels: [],
  })
  const archData = ref({
    services: [],
    databases: [],
  })

  // 현재 선택된 노드 — 클릭 시 chip/카드 강조용
  // shape: { kind: 'entity'|'aggregate'|'domain_entity'|'api'|'service', id }
  const selectedNode = ref(null)

  // 탭 점프 요청 — 부모가 이걸 보고 designTab 전환 + scroll into view 트리거
  // shape: { kind, id, tab: 'spack'|'ddd'|'architecture', ts }
  // ts 는 타임스탬프 — 같은 노드 재요청도 새 이벤트로 처리 가능하게.
  const requestedJump = ref(null)

  const setSpackData = (d) => { spackData.value = d || spackData.value }
  const setDddData = (d) => { dddData.value = d || dddData.value }
  const setArchData = (d) => { archData.value = d || archData.value }

  // ─── 색인 (computed) ────────────────────────────────────────

  // Entity → DDD location (Aggregate 또는 DomainEntity)
  const entityToMapping = computed(() => {
    const m = {}
    for (const rel of spackData.value.entity_mapping_rels || []) {
      if (!rel?.source_id || !rel?.target_id) continue
      m[rel.source_id] = {
        targetId: rel.target_id,
        targetName: rel.target_name || '',
        kind: rel.target_kind || 'aggregate',  // 'aggregate' | 'domain_entity'
        role: rel.role || '',
      }
    }
    return m
  })

  // API → ArchService
  const apiToService = computed(() => {
    const m = {}
    for (const rel of spackData.value.api_service_rels || []) {
      if (!rel?.source_id || !rel?.target_id) continue
      m[rel.source_id] = {
        id: rel.target_id,
        name: rel.target_name || '',
        reason: rel.reason || '',
      }
    }
    return m
  })

  // Aggregate → ArchService
  const aggregateToService = computed(() => {
    const m = {}
    for (const rel of dddData.value.aggregate_service_rels || []) {
      if (!rel?.source_id || !rel?.target_id) continue
      m[rel.source_id] = {
        id: rel.target_id,
        name: rel.target_name || '',
      }
    }
    return m
  })

  // 종합 chain: Entity → Aggregate → Service (one-shot 조회)
  const entityChain = computed(() => {
    const m = {}
    for (const [entId, mapping] of Object.entries(entityToMapping.value)) {
      const item = {
        entId,
        kind: mapping.kind,
        role: mapping.role,
      }
      if (mapping.kind === 'aggregate') {
        item.aggId = mapping.targetId
        item.aggName = mapping.targetName
        const svc = aggregateToService.value[mapping.targetId]
        if (svc) {
          item.svcId = svc.id
          item.svcName = svc.name
        }
      } else if (mapping.kind === 'domain_entity') {
        item.dentId = mapping.targetId
        item.dentName = mapping.targetName
      }
      m[entId] = item
    }
    return m
  })

  // ─── 탭 점프 ────────────────────────────────────────────────

  // 탭 전환 + 선택 노드 강조. 부모 (design.vue) 의 watcher 가 처리.
  const jumpTo = ({ kind, id, tab }) => {
    if (!kind || !id) return
    selectedNode.value = { kind, id }
    requestedJump.value = { kind, id, tab, ts: Date.now() }
  }

  const clearSelection = () => {
    selectedNode.value = null
  }

  return {
    spackData, dddData, archData,
    selectedNode, requestedJump,
    setSpackData, setDddData, setArchData,
    entityToMapping, apiToService, aggregateToService, entityChain,
    jumpTo, clearSelection,
  }
}

/** 부모 컴포넌트에서 호출 — 자식 트리에 공유. */
export const provideDesignCrossLink = () => {
  const state = createState()
  provide(SYMBOL, state)
  return state
}

/**
 * 자식 컴포넌트에서 호출 — 부모가 provide 안 했으면 graceful 빈 인스턴스.
 * 테스트/standalone 사용 시 inject 실패해도 동작.
 */
export const useDesignCrossLink = () => {
  return inject(SYMBOL, null) || createState()
}
