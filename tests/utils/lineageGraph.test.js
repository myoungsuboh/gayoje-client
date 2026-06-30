import { describe, it, expect } from 'vitest'
import { buildMermaid, buildGraphLayout } from '@/utils/lineageGraph'

const SAMPLE = {
  apis: [
    { id: 'api-1', name: 'POST /login', implementations: [
      { filePath: 'src/auth/AuthController.ts', confidence: 'high' },
      { filePath: 'src/auth/AuthService.ts',    confidence: 'medium' },
    ]},
    { id: 'api-2', name: 'GET /users', implementations: [
      { filePath: 'src/users/UserController.ts', confidence: 'unverified' },
    ]},
  ],
  services: [
    { id: 'svc-1', name: 'AuthSvc', implementations: [
      { filePath: 'src/auth/AuthService.ts', confidence: 'high' },
    ]},
  ],
  aggregates: [], stories: [], missingImpl: [],
}

describe('buildMermaid', () => {
  it('flowchart 헤더 + subgraph 생성', () => {
    const out = buildMermaid(SAMPLE)
    expect(out).toContain('flowchart LR')
    expect(out).toContain('subgraph API')
    expect(out).toContain('subgraph SVC')
  })

  it('산출물 노드 라벨', () => {
    const out = buildMermaid(SAMPLE)
    expect(out).toContain('POST /login')
    expect(out).toContain('AuthSvc')
  })

  it('unverified는 점선 화살표', () => {
    const out = buildMermaid(SAMPLE)
    // api-2 → UserController는 unverified
    expect(out).toMatch(/API_api_2 -\.->\s+file_/)
  })

  it('확실한 매칭은 실선 화살표', () => {
    const out = buildMermaid(SAMPLE)
    expect(out).toMatch(/API_api_1 -->\s+file_/)
  })

  it('파일 노드 중복 제거 (api-1 service-1 모두 AuthService 참조)', () => {
    const out = buildMermaid(SAMPLE)
    const authSvcMatches = out.match(/AuthService\.ts/g) || []
    // 라벨은 basename으로 한 번만 노드 정의됨 (label = "AuthService.ts")
    expect(authSvcMatches.length).toBe(1)
  })

  it('classDef 색상 정의 포함', () => {
    const out = buildMermaid(SAMPLE)
    expect(out).toContain('classDef cat_apis')
    expect(out).toContain('classDef cat_files')
    expect(out).toContain('classDef cat_unverified')
  })

  it('maxFilesPerItem 제한', () => {
    const data = { apis: [{ id: 'x', name: 'X', implementations: [
      { filePath: 'a.ts', confidence: 'high' },
      { filePath: 'b.ts', confidence: 'high' },
      { filePath: 'c.ts', confidence: 'high' },
      { filePath: 'd.ts', confidence: 'high' },
    ]}]}
    const out = buildMermaid(data, { maxFilesPerItem: 2 })
    expect(out).toContain('+2건 더')
  })

  it('빈 결과 안전 처리', () => {
    expect(buildMermaid(null)).toContain('분석 결과 없음')
    expect(buildMermaid({})).toContain('flowchart LR')
  })

  it('특수문자 sanitize (id에 . - 들어가도 OK)', () => {
    const data = { apis: [{ id: 'api.with-dash', name: 'X', implementations: [] }] }
    const out = buildMermaid(data)
    // 점/하이픈이 mermaid id로 변환 시 _로 치환됨
    expect(out).not.toMatch(/api\.with-dash/)
    expect(out).toContain('api_with_dash')
  })

  it('큰따옴표 escape (mermaid label 안전)', () => {
    const data = { apis: [{ id: 'a', name: 'use "quoted" name', implementations: [] }] }
    const out = buildMermaid(data)
    expect(out).toContain('#quot;quoted#quot;')
  })
})

describe('buildGraphLayout', () => {
  it('카테고리별 노드 + 파일 노드 생성', () => {
    const { nodes } = buildGraphLayout(SAMPLE)
    const itemNodes = nodes.filter(n => n.type === 'item')
    const fileNodes = nodes.filter(n => n.type === 'file')
    expect(itemNodes).toHaveLength(3) // api-1, api-2, svc-1
    expect(fileNodes.length).toBeGreaterThan(0)
  })

  it('파일 노드 dedup (AuthService.ts는 1개)', () => {
    const { nodes } = buildGraphLayout(SAMPLE)
    const authSvcNodes = nodes.filter(n => n.type === 'file' && n.title === 'src/auth/AuthService.ts')
    expect(authSvcNodes).toHaveLength(1)
  })

  it('unverified 카테고리 색상', () => {
    const { nodes } = buildGraphLayout(SAMPLE)
    const userCtrl = nodes.find(n => n.title === 'src/users/UserController.ts')
    expect(userCtrl.category).toBe('unverified')
  })

  it('엣지 dashed 플래그', () => {
    const { edges } = buildGraphLayout(SAMPLE)
    const dashed = edges.filter(e => e.dashed)
    expect(dashed.length).toBe(1) // api-2 → UserController만 unverified
  })

  it('canvas width/height 양수', () => {
    const { width, height } = buildGraphLayout(SAMPLE)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('빈 lineage', () => {
    const r = buildGraphLayout(null)
    expect(r.nodes).toEqual([])
    expect(r.edges).toEqual([])
  })
})
