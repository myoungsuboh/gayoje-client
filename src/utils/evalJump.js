/**
 * [완성도 가이드 어시스턴트 — 2026-06-06] 완성도 gap → 점프 대상 매핑.
 *
 * 완성도 모달의 보강 항목(fix_target)/누락 노드(missing)를 클릭하면 "정확한
 * 지점"으로 이동시키기 위한 순수 매핑 함수. 컴포넌트는 결과를 받아 실제 점프만 수행.
 *   - 설계 노드: useDesignCrossLink().jumpTo({ tab, kind, id }) — design 페이지 내부 점프.
 *   - PRD:       router.push({ path:'/plan', query:{ tab:'prd', section, anchor } }) — 크로스 페이지.
 *
 * metric_key 접두사로 노드 종류/탭 결정 (BE evals/fix_targets.py 의 metric_key 와 정합):
 *   api_*       → (spack, api)        ex) api_error_cases_ratio, api_auth_specified_ratio …
 *   entity_*    → (spack, entity)     ex) entity_attributes_present_ratio, entity_story_mapped_ratio
 *   aggregate_* → (ddd,   aggregate)  ex) aggregate_invariants_ratio
 *   screen_* 등 → 설계 점프 없음 → PRD 폴백.
 *
 * ★ missing[].id 는 그래프 원본 id(API-01, Entity-03 …) 그대로. design 탭 watcher 가
 *   `[data-spack-node="kind:id"]` 셀렉터를 만들 때 `kind:` 접두사를 붙이므로 여기선
 *   raw id 만 넘긴다(접두사 중복 금지).
 */

const DESIGN_RULES = [
  { prefix: 'api_', tab: 'spack', kind: 'api' },
  { prefix: 'entity_', tab: 'spack', kind: 'entity' },
  { prefix: 'aggregate_', tab: 'ddd', kind: 'aggregate' },
]

/**
 * 설계 노드 점프 대상. 매핑 불가(접두사 미일치 / id 없음)면 null.
 * @returns {{ tab:string, kind:string, id:string } | null}
 */
export function resolveDesignJump(metricKey, missingItem) {
  const id = missingItem && missingItem.id
  if (!metricKey || !id || id === '?') return null
  const rule = DESIGN_RULES.find(r => metricKey.startsWith(r.prefix))
  if (!rule) return null
  return { tab: rule.tab, kind: rule.kind, id }
}

/**
 * PRD 보강 점프 대상. fix_target 의 prd_section(epic/nfr/screen/overview)으로 섹션 결정,
 * 노드명(없으면 id)을 하이라이트 검색어(anchor)로. section 없으면 null.
 * @returns {{ path:string, query:object } | null}
 */
export function resolvePrdJump(item, missingItem) {
  const section = (item && item.prdSection) || ''
  if (!section) return null
  const query = { tab: 'prd', section }
  const anchor = (missingItem && (missingItem.name || missingItem.id)) || ''
  if (anchor) query.anchor = anchor
  return { path: '/plan', query }
}

/**
 * 누락 칩 클릭 시 단일 점프 결정 — 설계 노드 우선, 불가하면 PRD 폴백.
 * @returns {{mode:'design', tab, kind, id} | {mode:'prd', path, query} | null}
 */
export function resolveGapJump(metricKey, missingItem, item) {
  const design = resolveDesignJump(metricKey, missingItem)
  if (design) return { mode: 'design', ...design }
  const prd = resolvePrdJump(item, missingItem)
  if (prd) return { mode: 'prd', ...prd }
  return null
}
