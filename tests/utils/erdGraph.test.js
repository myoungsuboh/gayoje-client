import { describe, it, expect } from 'vitest'
import { parseAttrs, parseInvariants, buildErdModel, buildNodeLabel } from '@/utils/erdGraph'
import { extractRaw } from '@/utils/designFetch'

describe('parseAttrs', () => {
  it('객체 list 를 정규화한다', () => {
    const out = parseAttrs([{ name: 'email', type: 'String', required: true }, { field: 'pw' }])
    expect(out).toEqual([
      { name: 'email', type: 'String', required: true, constraint: '' },
      { name: 'pw', type: '', required: false, constraint: '' },
    ])
  })

  it('Neo4j JSON string 직렬화도 복원한다 (오탐 방지)', () => {
    const out = parseAttrs('[{"name":"id","type":"UUID"},{"name":"age","type":"Int"}]')
    expect(out.map((a) => a.name)).toEqual(['id', 'age'])
    expect(out[0].type).toBe('UUID')
  })

  it('문자열 list 도 흡수한다', () => {
    expect(parseAttrs(['a', 'b'])).toEqual([
      { name: 'a', type: '', required: false, constraint: '' },
      { name: 'b', type: '', required: false, constraint: '' },
    ])
  })

  it('빈 값·깨진 JSON·비배열은 빈 배열', () => {
    expect(parseAttrs('')).toEqual([])
    expect(parseAttrs('not json')).toEqual([])
    expect(parseAttrs(null)).toEqual([])
    expect(parseAttrs({ name: 'x' })).toEqual([])
  })
})

describe('parseInvariants', () => {
  it('JSON string list 복원', () => {
    expect(parseInvariants('["주문 합계 ≥ 0", "상태 전이 규칙"]')).toEqual(['주문 합계 ≥ 0', '상태 전이 규칙'])
  })
  it('평문 한 줄은 단일 항목', () => {
    expect(parseInvariants('합계는 음수가 될 수 없다')).toEqual(['합계는 음수가 될 수 없다'])
  })
  it('객체 list 는 rule/description/name 추출', () => {
    expect(parseInvariants([{ rule: 'r1' }, { description: 'd2' }])).toEqual(['r1', 'd2'])
  })
})

describe('buildErdModel', () => {
  const spack = {
    entities: [
      { id: 'E-1', name: 'User', attributes: '[{"name":"email","type":"String"}]' },
      { id: 'E-2', name: 'Order', attributes: [{ name: 'total', type: 'Decimal' }] },
    ],
    entity_mapping_rels: [
      { source_id: 'E-1', target_id: 'AG-1', type: 'MAPPED_TO' },
      { source_id: 'E-2', target_id: 'GHOST', type: 'MAPPED_TO' }, // dangling → 제거
    ],
  }
  const ddd = {
    aggregates: [{ id: 'AG-1', name: 'Account', invariants: '["불변식1"]' }],
    domain_entities: [{ id: 'DE-1', name: 'Profile', attributes: [], aggregate_id: 'AG-1' }],
    internal_rels: [
      { source_id: 'DE-1', target_id: 'AG-1', type: 'PART_OF' },
      { source_id: 'DE-1', target_id: 'AG-1', type: 'BELONGS_TO' }, // PART_OF 아님 → 무시
    ],
  }

  it('Entity/Aggregate/DomainEntity 를 노드로, 종류를 표시한다', () => {
    const { nodes } = buildErdModel(spack, ddd)
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    expect(byId['E-1'].kind).toBe('Entity')
    expect(byId['AG-1'].kind).toBe('Aggregate')
    expect(byId['DE-1'].kind).toBe('DomainEntity')
    expect(byId['E-1'].attrs.map((a) => a.name)).toEqual(['email'])
    expect(byId['AG-1'].invariants).toEqual(['불변식1'])
  })

  it('양 끝이 노드인 관계만 남기고 dangling 은 제거한다', () => {
    const { edges } = buildErdModel(spack, ddd)
    expect(edges).toContainEqual({ from: 'E-1', to: 'AG-1', type: 'MAPPED_TO', dashed: true })
    expect(edges).toContainEqual({ from: 'DE-1', to: 'AG-1', type: 'PART_OF', dashed: false })
    // GHOST 타깃·BELONGS_TO 는 빠진다
    expect(edges.some((e) => e.to === 'GHOST')).toBe(false)
    expect(edges.some((e) => e.type === 'BELONGS_TO')).toBe(false)
    expect(edges.length).toBe(2)
  })

  it('중복 id 노드/중복 엣지는 한 번만', () => {
    const dup = {
      entities: [{ id: 'E-1', name: 'A' }, { id: 'E-1', name: 'B' }],
      entity_mapping_rels: [{ source_id: 'E-1', target_id: 'E-1' }], // self → 제거
    }
    const { nodes, edges } = buildErdModel(dup, {})
    expect(nodes.length).toBe(1)
    expect(nodes[0].name).toBe('A') // 먼저 등장 우선
    expect(edges.length).toBe(0)
  })

  it('빈 입력은 빈 모델', () => {
    expect(buildErdModel({}, {})).toEqual({ nodes: [], edges: [] })
    expect(buildErdModel()).toEqual({ nodes: [], edges: [] })
  })
})

describe('buildNodeLabel', () => {
  it('Entity 는 제목+구분선+속성행', () => {
    const label = buildNodeLabel({ name: 'User', kind: 'Entity', attrs: [{ name: 'id', type: 'UUID' }, { name: 'email', type: 'String' }] })
    const lines = label.split('\n')
    expect(lines[0]).toBe('User')
    expect(lines).toContain('id : UUID')
    expect(lines).toContain('email : String')
  })

  it('속성 미정이면 힌트 표시', () => {
    expect(buildNodeLabel({ name: 'X', kind: 'Entity', attrs: [] })).toContain('(속성 미정)')
  })

  it('Aggregate 는 ◇ 접두 + 불변식 개수', () => {
    const label = buildNodeLabel({ name: 'Account', kind: 'Aggregate', invariants: ['a', 'b'] })
    expect(label).toContain('◇ Account')
    expect(label).toContain('불변식 2개')
  })

  it('maxAttrs 초과 시 +N 표시', () => {
    const attrs = Array.from({ length: 10 }, (_, i) => ({ name: `a${i}`, type: 'T' }))
    const label = buildNodeLabel({ name: 'Big', kind: 'Entity', attrs }, { maxAttrs: 3 })
    expect(label).toContain('… +7')
  })

  it('opts.labels 로 힌트 문구를 주입할 수 있다 (i18n)', () => {
    const label = buildNodeLabel({ name: 'X', kind: 'Entity', attrs: [] }, { labels: { noAttrs: '(no attrs)' } })
    expect(label).toContain('(no attrs)')
  })
})

// [회귀 — ERD 빈 화면 버그] getSpack/getDDD 응답은 { result: [<obj>] } 배열 래핑.
// ErdGraphModal 이 [0] 없이 data.result 를 직접 spack 으로 쓰면 배열이 되어
// spack.entities = undefined → 노드 0 → "표시할 엔티티 없음". extractRaw 로 풀어야 정상.
describe('ERD 데이터 추출 계약 (getSpack/getDDD 배열 래핑)', () => {
  it('배열 래핑(result[0])을 풀지 않고 직접 쓰면 빈 모델 — 버그 재현', () => {
    const spackRes = { data: { result: [{ entities: [{ id: 'E-1', name: 'User' }] }] } }
    const wrong = spackRes.data.result // [{ entities }] — 배열 (ErdGraphModal 옛 버그)
    expect(buildErdModel(wrong, {}).nodes.length).toBe(0)
  })

  it('extractRaw 로 풀면 Entity + Aggregate 노드 생성 — 수정 검증', () => {
    const spackRes = { data: { result: [{ entities: [{ id: 'E-1', name: 'User' }] }] } }
    const dddRes = { data: { result: [{ aggregates: [{ id: 'AG-1', name: 'Account' }] }] } }
    const model = buildErdModel(extractRaw(spackRes), extractRaw(dddRes))
    expect(model.nodes.length).toBe(2)
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['AG-1', 'E-1'])
  })

  it('result 없이 [<obj>] 직접 반환도 extractRaw 가 흡수', () => {
    const spackRes = { data: [{ entities: [{ id: 'E-9', name: 'X' }] }] }
    expect(buildErdModel(extractRaw(spackRes), {}).nodes.length).toBe(1)
  })

  it('빈/null 응답은 extractRaw 가 {} → 빈 모델 (안전)', () => {
    expect(buildErdModel(extractRaw(null), extractRaw(undefined))).toEqual({ nodes: [], edges: [] })
    expect(buildErdModel(extractRaw({ data: {} }), {})).toEqual({ nodes: [], edges: [] })
  })
})
