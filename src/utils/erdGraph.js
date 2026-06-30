/**
 * erdGraph — SPACK/DDD 설계 그래프에서 ERD(엔티티-관계) 모델을 만드는 순수 유틸.
 *
 * [2026-06] ERD 뷰의 데이터 출처는 새 BE 엔드포인트가 아니라, 이미 배포된
 * getSpack(entities + 관계) / getDDD(aggregates + domain_entities + 관계)다.
 * 여기서 vis-network 와 무관한 평면 모델 { nodes, edges } 을 만들고,
 * ErdGraphModal 이 그걸 vis DataSet 으로 매핑한다 (lineageGraph.js 와 동일 분리).
 *
 * vis 의존이 없으므로 단위 테스트가 쉽다 (tests/utils/erdGraph.test.js).
 */

/**
 * 엔티티 attributes 안전 파싱.
 * Neo4j 는 attributes 를 JSON string 으로 직렬화해 저장할 수 있고(스키마 주석),
 * 객체 list 또는 문자열 list 로 올 수도 있다 — 모두 흡수해 [{name, type, required, constraint}] 로.
 */
export function parseAttrs(raw) {
  let a = raw
  if (typeof a === 'string') {
    const s = a.trim()
    if (!s) return []
    try { a = JSON.parse(s) } catch { return [] }
  }
  if (!Array.isArray(a)) return []
  return a
    .map((x) => {
      if (x == null) return null
      if (typeof x === 'string') return { name: x.trim(), type: '', required: false, constraint: '' }
      const name = String(x.name || x.field || x['이름'] || '').trim()
      if (!name) return null
      return {
        name,
        type: String(x.type || x['타입'] || '').trim(),
        required: !!(x.required ?? x['필수']),
        constraint: String(x.constraint || x['제약'] || '').trim(),
      }
    })
    .filter(Boolean)
}

/**
 * invariants(Aggregate 불변식) 안전 파싱 — JSON string / 문자열 list / 객체 list 흡수해 [String].
 */
export function parseInvariants(raw) {
  let a = raw
  if (typeof a === 'string') {
    const s = a.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      a = parsed
    } catch {
      return [s]  // 평문 한 줄
    }
  }
  if (!Array.isArray(a)) return []
  return a
    .map((x) => (typeof x === 'string' ? x.trim() : String(x?.rule || x?.description || x?.name || '').trim()))
    .filter(Boolean)
}

/**
 * SPACK + DDD 그래프 → ERD 평면 모델.
 *
 * 노드: SPACK Entity / DDD Aggregate / DDD DomainEntity (id 로 dedup, 먼저 등장한 것 우선)
 * 엣지: 양 끝이 모두 노드일 때만 (dangling 제거)
 *   - MAPPED_TO (Entity → Aggregate|DomainEntity)  : 소속 매핑(점선)
 *   - PART_OF   (DomainEntity → Aggregate)          : 구성(실선)
 *
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildErdModel(spack = {}, ddd = {}) {
  const nodes = []
  const byId = new Map()
  const push = (node) => {
    if (!node.id || byId.has(node.id)) return
    byId.set(node.id, node)
    nodes.push(node)
  }

  for (const e of spack.entities || []) {
    push({
      id: e.id,
      name: e.name || e.id,
      kind: 'Entity',
      attrs: parseAttrs(e.attributes),
      invariants: [],
    })
  }
  for (const a of ddd.aggregates || []) {
    push({
      id: a.id,
      name: a.name || a.id,
      kind: 'Aggregate',
      attrs: [],
      invariants: parseInvariants(a.invariants),
    })
  }
  for (const de of ddd.domain_entities || []) {
    push({
      id: de.id,
      name: de.name || de.id,
      kind: 'DomainEntity',
      attrs: parseAttrs(de.attributes),
      invariants: [],
    })
  }

  const ids = new Set(byId.keys())
  const edges = []
  const seen = new Set()
  const addEdge = (from, to, type, dashed) => {
    if (!from || !to || from === to) return
    if (!ids.has(from) || !ids.has(to)) return  // dangling 제거
    const key = `${from}|${to}|${type}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from, to, type, dashed })
  }

  for (const r of spack.entity_mapping_rels || []) {
    addEdge(r.source_id, r.target_id, 'MAPPED_TO', true)
  }
  for (const r of ddd.internal_rels || []) {
    if (r.type === 'PART_OF') addEdge(r.source_id, r.target_id, 'PART_OF', false)
  }

  return { nodes, edges }
}

/**
 * 노드 → vis-network box 라벨(멀티라인 문자열). 제목 + 구분선 + 속성행.
 * 캔버스에 박히는 소수의 힌트 문구는 opts.labels 로 주입(컴포넌트가 i18n 전달, 테스트는 기본값).
 */
export function buildNodeLabel(node, opts = {}) {
  const L = {
    noAttrs: '(속성 미정)',
    noInv: '불변식 미정',
    inv: (n) => `불변식 ${n}개`,
    ...(opts.labels || {}),
  }
  const maxAttrs = opts.maxAttrs ?? 8
  const head = node.kind === 'Aggregate' ? `◇ ${node.name}` : node.name
  const sep = '─'.repeat(Math.min(Math.max(head.length, 8), 22))

  if (node.kind === 'Aggregate') {
    const inv = node.invariants || []
    return [head, sep, inv.length ? L.inv(inv.length) : L.noInv].join('\n')
  }

  const attrs = node.attrs || []
  if (!attrs.length) return [head, sep, L.noAttrs].join('\n')

  const rows = attrs.slice(0, maxAttrs).map((a) => (a.type ? `${a.name} : ${a.type}` : a.name))
  if (attrs.length > maxAttrs) rows.push(`… +${attrs.length - maxAttrs}`)
  return [head, sep, ...rows].join('\n')
}
