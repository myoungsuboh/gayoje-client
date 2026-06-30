/**
 * designMarkdown.js — 설계 그래프(JSON) → 단일 마크다운 (2026-06-13).
 *
 * 핸드오프 spec/ 빈 껍데기 버그 수정의 코어. 빈 데이터 graceful + 노드 누락 방어 +
 * connection id→이름 매핑이 회귀하지 않는지 가드한다.
 */
import { describe, it, expect } from 'vitest'
import { designGraphToMarkdown, collectTechStack, collectDesignGaps, buildOpenQuestionsMd } from '@/utils/designMarkdown'
import i18n from '@/plugins/i18n'

// [i18n 2026-06-26] 렌더 함수가 t(vue-i18n)를 첫 인자로 받게 바뀜. locale=ko 고정 +
// i18n.global.t 주입 → 한국어 산출이 기존 리터럴과 바이트 동일이라 아래 한국어 단언이
// 그대로 통과(골든 회귀 0). 갭 라벨(요청스펙 등)은 내부 키 유지 — 표시 직전 t 로 번역.
i18n.global.locale.value = 'ko'
const t = (k, p) => i18n.global.t(k, p)

describe('designGraphToMarkdown', () => {
  it('SPACK — API(method+path)·Entity·Policy 섹션 렌더', () => {
    const md = designGraphToMarkdown(t, 'spack', {
      apis: [{ id: 'a1', method: 'post', path: '/users', description: '회원 생성' }],
      entities: [{ id: 'e1', name: 'User', description: '회원' }],
      policies: [{ id: 'p1', name: '비번 8자+', related_entity: 'User' }],
    })
    expect(md).toContain('# SPACK')
    expect(md).toContain('`POST /users` — 회원 생성')
    expect(md).toContain('## 데이터 (Entity)')
    expect(md).toContain('**User** — 회원')
    expect(md).toContain('_(관련: User)_')
  })

  it('Architecture — Service(tech_stack)·Connection(id→이름 매핑)', () => {
    const md = designGraphToMarkdown(t, 'arch', {
      services: [{ id: 's1', name: 'Auth', tech_stack: 'FastAPI' }],
      databases: [{ id: 'd1', name: 'Main DB' }],
      connections: [{ type: 'USES', source_id: 's1', target_id: 'd1' }],
    })
    expect(md).toContain('**Auth** _(스택: FastAPI)_')
    expect(md).toContain('- Auth → Main DB `USES`')  // id 가 사람이 읽는 이름으로
  })

  it('DDD — context/aggregate/event 섹션', () => {
    const md = designGraphToMarkdown(t, 'ddd', {
      contexts: [{ id: 'c1', name: 'Account' }],
      domain_events: [{ id: 'v1', name: 'UserRegistered', description: '가입됨' }],
    })
    expect(md).toContain('## Bounded Context')
    expect(md).toContain('**Account**')
    expect(md).toContain('**UserRegistered** — 가입됨')
  })

  it('빈 그래프 → 빈 문자열 (spec/ 에서 제외되는 계약)', () => {
    expect(designGraphToMarkdown(t, 'spack', {})).toBe('')
    expect(designGraphToMarkdown(t, 'arch', { services: [] })).toBe('')
    expect(designGraphToMarkdown(t, 'spack', null)).toBe('')
    expect(designGraphToMarkdown(t, 'bogus', { apis: [{ name: 'x' }] })).toBe('')
  })

  it('노드 필드 누락 graceful — properties 중첩·이름만/설명없음', () => {
    const md = designGraphToMarkdown(t, 'spack', {
      entities: [
        { properties: { name: 'Nested' } },  // getNodeProp properties 폴백
        { id: 'e2' },                          // 이름 없음 → id
      ],
    })
    expect(md).toContain('**Nested**')
    expect(md).toContain('**e2**')
  })

  it('빈 섹션은 헤딩까지 생략 (노이즈 방지)', () => {
    const md = designGraphToMarkdown(t, 'spack', { apis: [{ name: 'GET x' }] })
    expect(md).toContain('## API')
    expect(md).not.toContain('## 데이터')   // entities 없음 → 헤딩 없음
    expect(md).not.toContain('## 정책')
  })
})

describe('스펙 갭 인라인 ⚠ 마커 (설계 무결성 — BE checklist 어휘 통일)', () => {
  it('request_body 빈 POST → ⚠ 요청스펙 / response_body 빈 → 응답스펙', () => {
    const md = designGraphToMarkdown(t, 'spack', {
      apis: [{ id: 'a1', method: 'post', path: '/users', request_body: { fields: [] }, response_body: { fields: [] } }],
    })
    expect(md).toContain('⚠️ 미정(요청스펙·응답스펙)')
    expect(md).toContain('추측 말고 질문')
  })

  it('request_body/response_body fields 채워지면 갭 마커 없음', () => {
    const md = designGraphToMarkdown(t, 'spack', {
      apis: [{ id: 'a1', method: 'post', path: '/users', description: '생성', request_body: { fields: [{ name: 'email' }] }, response_body: { fields: [{ name: 'id' }] } }],
    })
    expect(md).not.toContain('⚠️')
    expect(md).toContain('`POST /users` — 생성')
  })

  it('GET 은 요청스펙 갭 면제(BE 와 동일), 응답스펙만 판정', () => {
    const md = designGraphToMarkdown(t, 'spack', {
      apis: [{ id: 'a1', method: 'get', path: '/users', response_body: { fields: [{ name: 'id' }] } }],
    })
    expect(md).not.toContain('요청스펙')
  })

  it('Entity attributes 0 → ⚠ 속성 / 있으면 없음', () => {
    const empty = designGraphToMarkdown(t, 'spack', { entities: [{ id: 'e1', name: 'User' }] })
    expect(empty).toContain('⚠️ 미정(속성)')
    const filled = designGraphToMarkdown(t, 'spack', { entities: [{ id: 'e1', name: 'User', attributes: [{ name: 'email', type: 'string' }] }] })
    expect(filled).not.toContain('⚠️')
  })

  it('담당서비스 갭 = multiService(arch.services>1) 게이트 (BE create_md_pipeline 와 동일)', () => {
    const apis = [
      { id: 'a1', method: 'get', path: '/x', response_body: { fields: [{ name: 'r' }] } },
      { id: 'a2', method: 'get', path: '/y', response_body: { fields: [{ name: 'r' }] } },
    ]
    // MSA(서비스 2개) + a2 미매핑 → 담당서비스 갭 (가장 위험한 갭을 잡아야 함)
    const msa = designGraphToMarkdown(t, 'spack', { apis, api_service_rels: [{ source_id: 'a1', target_name: 'Svc' }] }, { archServiceCount: 2 })
    expect(msa).toContain('담당서비스')
    // MSA + 매핑 0 (평가자 헤드라인) → 전 API 담당서비스 갭 (이전 버그: 면제됐었음)
    const msaNoMap = designGraphToMarkdown(t, 'spack', { apis }, { archServiceCount: 2 })
    expect((msaNoMap.match(/담당서비스/g) || []).length).toBe(2)
    // 단일 서비스 → 목적지 자명 → 면제(오탐 방지). 이전 버그: 오탐했었음
    const single = designGraphToMarkdown(t, 'spack', { apis, api_service_rels: [{ source_id: 'a1', target_name: 'Svc' }] }, { archServiceCount: 1 })
    expect(single).not.toContain('담당서비스')
    // archServiceCount 미전달 → 담당서비스 갭 미판정(다른 갭은 정상)
    const noCtx = designGraphToMarkdown(t, 'spack', { apis, api_service_rels: [{ source_id: 'a1' }] })
    expect(noCtx).not.toContain('담당서비스')
  })

  it('id 없는 identity-only API → 매핑 식별에 identity 폴백(UI SpackTab 과 동일, 오탐 방지)', () => {
    const md = designGraphToMarkdown(t, 'spack', {
      apis: [{ identity: 'n1', method: 'get', path: '/x', response_body: { fields: [{ name: 'r' }] } }],
      api_service_rels: [{ source_id: 'n1', target_name: 'Svc' }],
    }, { archServiceCount: 2 })
    expect(md).not.toContain('담당서비스')  // identity 로 매핑 인식 → 갭 아님
  })

  it('상단 "미정 N건" 헤더가 ⚠ 개수 집계 / 갭 0 이면 헤더 없음', () => {
    const withGaps = designGraphToMarkdown(t, 'spack', {
      apis: [{ id: 'a1', method: 'post', path: '/u', request_body: { fields: [] }, response_body: { fields: [] } }],
      entities: [{ id: 'e1', name: 'User' }],
    })
    // 헤더 "미정 N건" == 갭 라벨 수(BE checklist·obsidian vault 와 동일 기준).
    // API 요청·응답(2) + Entity 속성(1) = 3건. (마커 줄 수 2 가 아니라 라벨 수 3)
    const headerN = Number((withGaps.match(/미정 (\d+)건/) || [])[1])
    expect(headerN).toBe(3)
    expect((withGaps.match(/⚠️ 미정\(/g) || []).length).toBe(2)  // 마커 줄: api 1, entity 1
    const noGaps = designGraphToMarkdown(t, 'spack', {
      apis: [{ id: 'a1', method: 'get', path: '/u', response_body: { fields: [{ name: 'r' }] } }],
      entities: [{ id: 'e1', name: 'User', attributes: [{ name: 'x' }] }],
    })
    expect(noGaps).not.toContain('미정')
  })

  it('Aggregate 는 attributes 가 아닌 invariants 보유 — 속성미정 오탐 없음(BE 오탐픽스 존중)', () => {
    const md = designGraphToMarkdown(t, 'ddd', { aggregates: [{ id: 'g1', name: 'UserAgg' }] })
    expect(md).not.toContain('⚠️')  // Aggregate 는 invariants — 속성갭 대상 아님
  })

  it('DDD DomainEntity attributes 0 → ⚠ 속성 (BE create_md_pipeline 일치) / Aggregate 는 면제', () => {
    const md = designGraphToMarkdown(t, 'ddd', {
      aggregates: [{ id: 'g1', name: 'Agg' }],          // invariants — 갭 없어야
      domain_entities: [{ id: 'de1', name: 'User' }],   // 속성 0 → 갭
    })
    expect(md).toContain('⚠️ 미정(속성)')
    expect(md).toMatch(/미정 1건/)  // domain_entity 1건만 (aggregate 미포함)
    const filled = designGraphToMarkdown(t, 'ddd', { domain_entities: [{ id: 'de1', name: 'User', attributes: [{ name: 'x' }] }] })
    expect(filled).not.toContain('⚠️')
  })
})

describe('collectDesignGaps / buildOpenQuestionsMd (핸드오프 open-questions 집계)', () => {
  it('API·Entity·DomainEntity 갭을 수집하고 total 을 라벨 수로 누적', () => {
    const r = collectDesignGaps(t,
      {
        apis: [{ id: 'a1', method: 'post', path: '/u', request_body: { fields: [] }, response_body: { fields: [] } }],
        entities: [{ id: 'e1', name: 'User' }],  // 속성 0 → 갭
      },
      { domain_entities: [{ id: 'de1', name: 'Order' }] },  // 속성 0 → 갭
    )
    // API 요청·응답(2) + Entity 속성(1) + DomainEntity 속성(1) = 4
    expect(r.total).toBe(4)
    expect(r.items).toHaveLength(3)
    expect(r.items.find(i => i.kind === 'API').name).toBe('POST /u')
    expect(r.items.find(i => i.kind === 'API').gaps).toEqual(['요청스펙', '응답스펙'])
    expect(r.items.find(i => i.kind === 'Entity').gaps).toEqual(['속성'])
    expect(r.items.find(i => i.kind === 'Domain Entity').name).toBe('Order')
  })

  it('total 이 designGraphToMarkdown 헤더 "미정 N건" 과 일치 (드리프트 가드)', () => {
    const spack = {
      apis: [{ id: 'a1', method: 'post', path: '/u', request_body: { fields: [] }, response_body: { fields: [] } }],
      entities: [{ id: 'e1', name: 'User' }],
    }
    const md = designGraphToMarkdown(t, 'spack', spack)
    const headerN = Number((md.match(/미정 (\d+)건/) || [])[1])
    const spackGapTotal = collectDesignGaps(t,spack, {}).items
      .filter(i => i.kind !== 'Domain Entity')
      .reduce((s, i) => s + i.gaps.length, 0)
    expect(spackGapTotal).toBe(headerN)  // 동일 헬퍼·기준 → 동일 카운트
  })

  it('갭 0 → 빈 items / buildOpenQuestionsMd 빈 문자열', () => {
    const r = collectDesignGaps(t,
      { apis: [{ id: 'a1', method: 'get', path: '/u', response_body: { fields: [{ name: 'r' }] } }], entities: [{ id: 'e1', name: 'User', attributes: [{ name: 'x' }] }] },
      {},
    )
    expect(r.total).toBe(0)
    expect(r.items).toHaveLength(0)
    expect(buildOpenQuestionsMd(t,r)).toBe('')
    expect(buildOpenQuestionsMd(t,null)).toBe('')
  })

  it('buildOpenQuestionsMd — 종류별 그룹 + total 헤더 + 항목별 라벨', () => {
    const r = collectDesignGaps(t,
      {
        apis: [{ id: 'a1', method: 'post', path: '/u', request_body: { fields: [] }, response_body: { fields: [{ name: 'id' }] } }],
        entities: [{ id: 'e1', name: 'User' }],
      },
      {},
    )
    const md = buildOpenQuestionsMd(t,r)
    expect(md).toContain('# 미정 항목 (Open Questions)')
    expect(md).toContain('**2건**')  // 요청스펙(1) + 속성(1)
    expect(md).toContain('## API')
    expect(md).toContain('- **POST /u** — 미정: 요청스펙')
    expect(md).toContain('## Entity')
    expect(md).toContain('- **User** — 미정: 속성')
  })

  it('빈/누락 raw graceful — 빈 집계', () => {
    expect(collectDesignGaps(t,{}, {}).total).toBe(0)
    expect(collectDesignGaps(t,null, null).total).toBe(0)
    expect(collectDesignGaps(t,undefined, undefined).items).toEqual([])
  })
})

describe('collectTechStack (A2 역할 주입)', () => {
  it('service·database 의 tech_stack 수집 + 구분자 분해 + 중복 제거', () => {
    const stack = collectTechStack({
      services: [{ tech_stack: 'FastAPI, Python' }, { tech_stack: 'FastAPI / Redis' }],
      databases: [{ tech_stack: 'PostgreSQL' }],
    })
    expect(stack).toEqual(['FastAPI', 'Python', 'Redis', 'PostgreSQL'])  // FastAPI 1회
  })
  it('tech_stack 없음/빈 그래프 → 빈 배열 (역할 주입 graceful skip)', () => {
    expect(collectTechStack({ services: [{ name: 'x' }] })).toEqual([])
    expect(collectTechStack({})).toEqual([])
    expect(collectTechStack(null)).toEqual([])
  })
  it('최대 6개로 캡', () => {
    const stack = collectTechStack({
      services: [{ tech_stack: 'a,b,c,d,e,f,g,h' }],
    })
    expect(stack.length).toBe(6)
  })
})
