/**
 * obsidianExport.js — Obsidian Vault 변환 코어 (2026-06-12).
 *
 * [핵심 가드] 파일명과 위키링크가 같은 새니타이저를 거치는지 "전수 일치"로 검증 —
 * 불일치는 Obsidian 그래프에서 고아 링크(빈 노드)로 나타나는 가장 흔한 회귀.
 */
import { describe, it, expect } from 'vitest'
import { buildObsidianVault, sanitizeNoteName, yamlStr, extractDocMd } from '@/utils/obsidianExport'
import i18n from '@/plugins/i18n'

// 폴더명/라벨은 키 마지막 토큰으로 대체(결정적). 단 design.spec_md.*(갭 마커·홈 헤더)는
// 실제 ko 로 해석 — GAP_SUFFIX/vault 헤더가 한국어 산출이라 아래 한국어 단언이 통과한다.
i18n.global.locale.value = 'ko'
const t = (key, params) => (key.startsWith('design.spec_md') ? i18n.global.t(key, params) : key.split('.').pop())

const SPACK = {
  apis: [
    { id: 'a1', method: 'post', path: '/users/{id}', name: '회원 수정', description: '회원 정보를 수정' },
    { id: 'a2', method: 'get', path: '/items', description: '' },
  ],
  entities: [
    { id: 'e1', name: 'User', description: '회원' },
    { id: 'e2', name: 'User', description: '동명 충돌 케이스' },  // 충돌 → " (2)"
  ],
  policies: [{ id: 'p1', name: '비밀번호: 8자 이상', related_entity: 'User' }],
  api_service_rels: [{ type: 'HANDLED_BY', source_id: 'a1', target_id: 's1' }],
  entity_mapping_rels: [{ type: 'MAPS_TO', source_id: 'a1', target_id: 'e1' }],
  internal_rels: [],
  implement_rels: [{ type: 'IMPLEMENTS', source_id: 'zz-unknown', target_id: 'a1' }],  // 미등록 id → 생략
}
const DDD = {
  contexts: [{ id: 'c1', name: 'Account' }],
  aggregates: [{ id: 'g1', name: 'UserAggregate' }],
  domain_entities: [],
  domain_events: [{ id: 'ev1', name: 'UserRegistered' }],
  internal_rels: [{ type: 'BELONGS_TO', source_id: 'g1', target_id: 'c1' }],
  trigger_rels: [],
  aggregate_service_rels: [],
}
const ARCH = {
  services: [{ id: 's1', name: 'Auth Service', tech_stack: 'FastAPI' }],
  databases: [{ id: 'd1', name: 'Main DB' }],
  connections: [{ type: 'USES', source_id: 's1', target_id: 'd1' }],
}
const PRD = '# PRD\n\n### 🖥️ [Screen: User 관리]\n내용\n\n[Story 1.1] 가입'

const build = (over = {}) =>
  buildObsidianVault({ projectName: 'proj', prdMd: PRD, cpsMd: '# CPS\n내용', spack: SPACK, ddd: DDD, arch: ARCH, t, ...over })

describe('sanitizeNoteName / yamlStr', () => {
  it('Windows·위키링크 금지문자 제거 + 공백 정리', () => {
    expect(sanitizeNoteName('POST /users/{id}?x=1')).toBe('POST users {id} x=1')
    expect(sanitizeNoteName('a[b]#c^d|e:f')).toBe('a b c d e f')
    expect(sanitizeNoteName('   ')).toBe('untitled')
  })
  it('yamlStr — 콜론/따옴표 escape (frontmatter 파손 방지)', () => {
    expect(yamlStr('비밀번호: "8자"')).toBe('"비밀번호: \\"8자\\""')
  })
})

describe('extractDocMd — 조회 raw → 마크다운 본문 (JSON 덤프 회귀 가드)', () => {
  it('getPRD: prd_content 우선 + 이스케이프된 \\n 정규화', () => {
    expect(extractDocMd({ prd_content: '# PRD\\n본문', master_prd_id: 'x' })).toBe('# PRD\n본문')
  })
  it('getCPS: content > output 폴백', () => {
    expect(extractDocMd({ content: '# CPS' })).toBe('# CPS')
    expect(extractDocMd({ output: '# OUT' })).toBe('# OUT')
  })
  it('빈 raw/null → 빈 문자열 (JSON.stringify 금지)', () => {
    expect(extractDocMd(null)).toBe('')
    expect(extractDocMd({ master_prd_id: 'x' })).toBe('')
  })
})

describe('buildObsidianVault', () => {
  it('[전수 일치] 모든 [[위키링크]]가 실제 노트 파일을 가리킨다 (고아 링크 0)', () => {
    const files = build()
    const noteNames = new Set(
      files.map((f) => f.path.split('/').pop().replace(/\.md$/, '')),
    )
    const linkRe = /\[\[([^\]]+)\]\]/g
    for (const f of files) {
      let m
      while ((m = linkRe.exec(f.content)) !== null) {
        expect(noteNames.has(m[1]), `${f.path} → 고아 링크 [[${m[1]}]]`).toBe(true)
      }
    }
  })

  it('동명 노드 충돌 → " (2)" suffix 로 파일 덮어쓰기 방지', () => {
    const files = build()
    const paths = files.map((f) => f.path)
    expect(paths).toContain('folder_data/User.md')
    expect(paths).toContain('folder_data/User (2).md')
    expect(new Set(paths).size).toBe(paths.length)  // 경로 전체 유일
  })

  it('관계 → 양방향 링크 + 미등록 id 관계는 생략', () => {
    const files = build()
    const api = files.find((f) => f.path === 'folder_api/POST users {id}.md')
    expect(api.content).toContain('[[User]]')          // MAPS_TO
    expect(api.content).toContain('[[Auth Service]]')  // HANDLED_BY
    const entity = files.find((f) => f.path === 'folder_data/User.md')
    expect(entity.content).toContain('[[POST users {id}]]')  // 역방향
    expect(api.content).not.toContain('zz-unknown')    // 미등록 id 생략
  })

  it('빈 설명 노드 → ⚠ 보완 안내 / 설명 있는 노드는 본문 유지', () => {
    const files = build()
    const emptyApi = files.find((f) => f.path === 'folder_api/GET items.md')
    expect(emptyApi.content).toContain('⚠ empty_node_warn')
    const namedApi = files.find((f) => f.path === 'folder_api/POST users {id}.md')
    expect(namedApi.content).toContain('회원 정보를 수정')
  })

  it('PRD Screen 추출 + 이름 언급 매칭 링크 (Screen "User 관리" → [[User]])', () => {
    const files = build()
    const screen = files.find((f) => f.path.startsWith('folder_screen/'))
    expect(screen).toBeTruthy()
    expect(screen.content).toContain('[[User]]')
  })

  it('frontmatter — api 는 method/path 포함, 값은 항상 quoted', () => {
    const files = build()
    const api = files.find((f) => f.path === 'folder_api/POST users {id}.md')
    expect(api.content).toContain('method: "POST"')
    expect(api.content).toContain('path: "/users/{id}"')
    const policy = files.find((f) => f.path.startsWith('folder_policy/'))
    expect(policy.content).toContain('type: "policy"')
  })

  it('홈(MOC) + README 포함, PRD/CPS 노트 생성', () => {
    const files = build()
    const paths = files.map((f) => f.path)
    expect(paths).toContain('home_title.md')
    expect(paths).toContain('README.md')
    expect(paths).toContain('folder_plan/PRD.md')
    expect(paths).toContain('folder_plan/CPS.md')
    const readme = files.find((f) => f.path === 'README.md')
    expect(readme.content).toContain('readme_note')  // 단방향 스냅샷 고지
  })

  it('빈 데이터 → README + 홈 2개만 (호출부의 no-data 가드 계약)', () => {
    const files = buildObsidianVault({ projectName: 'p', t })
    expect(files.length).toBe(2)
  })
})

describe('buildObsidianVault — 설계 갭 ⚠ 마커 (세 경로 통일)', () => {
  const noteFor = (files, frag) => files.find((f) => f.path.includes(frag))

  it('빈 request/response body API 노트에 ⚠ 미정(요청스펙·응답스펙) 주입', () => {
    const files = buildObsidianVault({
      projectName: 'p', t,
      spack: { apis: [{ id: 'a1', method: 'post', path: '/u', description: '설명 있음', request_body: { fields: [] }, response_body: { fields: [] } }] },
    })
    const api = noteFor(files, 'folder_api/')
    expect(api.content).toContain('⚠️ 미정(요청스펙·응답스펙)')
    // 설명이 있어도(emptyWarn 미발동) 스펙 갭은 별도로 잡힌다 — 핵심 회귀 가드
    expect(api.content).toContain('설명 있음')
  })

  it('attributes 없는 Entity 노트에 ⚠ 미정(속성) / 있으면 없음', () => {
    const empty = buildObsidianVault({ projectName: 'p', t, spack: { entities: [{ id: 'e1', name: 'AiAccount' }] } })
    expect(noteFor(empty, 'folder_data/').content).toContain('⚠️ 미정(속성)')
    const filled = buildObsidianVault({ projectName: 'p', t, spack: { entities: [{ id: 'e1', name: 'AiAccount', attributes: [{ name: 'id' }] }] } })
    expect(noteFor(filled, 'folder_data/').content).not.toContain('미정(속성)')
  })

  it('홈(MOC)에 "미정 N건" 요약 — spec md 헤더와 동일 / 갭 0 이면 없음', () => {
    const withGaps = buildObsidianVault({
      projectName: 'p', t,
      spack: { apis: [{ id: 'a1', method: 'post', path: '/u', request_body: { fields: [] }, response_body: { fields: [] } }], entities: [{ id: 'e1', name: 'X' }] },
    })
    expect(noteFor(withGaps, 'home_title.md').content).toMatch(/미정 \d+건/)
    const noGaps = buildObsidianVault({
      projectName: 'p', t,
      spack: { entities: [{ id: 'e1', name: 'X', attributes: [{ name: 'a' }] }] },
    })
    expect(noteFor(noGaps, 'home_title.md').content).not.toContain('미정')
  })

  it('Aggregate(DDD) 노트엔 스펙 갭 마커 없음 — invariants 오탐 방지', () => {
    const files = buildObsidianVault({ projectName: 'p', t, ddd: { aggregates: [{ id: 'g1', name: 'Agg' }] } })
    const agg = noteFor(files, 'folder_domain/')
    expect(agg.content).not.toContain('미정(속성)')
  })
})

describe('buildObsidianVault — entity 속성 테이블 (ERD parseAttrs 재활용)', () => {
  const noteFor = (files, frag) => files.find((f) => f.path.includes(frag))

  it('attributes → 속성 테이블 (필드/타입/필수/제약 + required ✓)', () => {
    const files = buildObsidianVault({
      projectName: 'p', t,
      spack: { entities: [{ id: 'e1', name: 'User', attributes: [
        { name: 'id', type: 'uuid', required: true },
        { name: 'email', type: 'string', constraint: 'unique' },
      ] }] },
    })
    const entity = noteFor(files, 'folder_data/')
    expect(entity.content).toContain('## section_attrs')
    expect(entity.content).toContain('| attr_field | attr_type | attr_required | attr_constraint |')
    expect(entity.content).toContain('| id | uuid | ✓ |')   // required → ✓
    expect(entity.content).toContain('| email | string |')
    expect(entity.content).toContain('unique')              // constraint
    expect(entity.content).not.toContain('미정(속성)')        // 속성 있으니 갭 없음
  })

  it('attributes 없으면 속성 테이블 미생성 (미정 마커만)', () => {
    const files = buildObsidianVault({ projectName: 'p', t, spack: { entities: [{ id: 'e1', name: 'Empty' }] } })
    const entity = noteFor(files, 'folder_data/')
    expect(entity.content).not.toContain('## section_attrs')
    expect(entity.content).toContain('미정(속성)')
  })

  it('JSON string attributes 도 파싱 (parseAttrs 흡수)', () => {
    const files = buildObsidianVault({
      projectName: 'p', t,
      spack: { entities: [{ id: 'e1', name: 'X', attributes: '[{"name":"id","type":"uuid"}]' }] },
    })
    expect(noteFor(files, 'folder_data/').content).toContain('| id | uuid |')
  })

  it('DomainEntity(DDD) 노트도 속성 테이블 생성', () => {
    const files = buildObsidianVault({
      projectName: 'p', t,
      ddd: { domain_entities: [{ id: 'de1', name: 'Order', attributes: [{ name: 'total', type: 'int' }] }] },
    })
    expect(noteFor(files, 'folder_domain/').content).toContain('| total | int |')
  })

  it('md 셀 파이프(|) 이스케이프 — 표 깨짐 방지', () => {
    const files = buildObsidianVault({
      projectName: 'p', t,
      spack: { entities: [{ id: 'e1', name: 'X', attributes: [{ name: 'a|b', type: 'enum(x|y)' }] }] },
    })
    expect(noteFor(files, 'folder_data/').content).toContain('a\\|b')
    expect(noteFor(files, 'folder_data/').content).toContain('enum(x\\|y)')
  })
})
