import { describe, it, expect } from 'vitest'
import { resolveDesignJump, resolvePrdJump, resolveGapJump } from '@/utils/evalJump'

describe('resolveDesignJump', () => {
  it('api_* → spack/api, raw id (no prefix)', () => {
    expect(resolveDesignJump('api_error_cases_ratio', { id: 'API-01', name: '작업 생성' }))
      .toEqual({ tab: 'spack', kind: 'api', id: 'API-01' })
    expect(resolveDesignJump('api_auth_specified_ratio', { id: 'API-12' }))
      .toEqual({ tab: 'spack', kind: 'api', id: 'API-12' })
  })

  it('entity_* → spack/entity', () => {
    expect(resolveDesignJump('entity_attributes_present_ratio', { id: 'Entity-03' }))
      .toEqual({ tab: 'spack', kind: 'entity', id: 'Entity-03' })
    expect(resolveDesignJump('entity_story_mapped_ratio', { id: 'Entity-09' }))
      .toEqual({ tab: 'spack', kind: 'entity', id: 'Entity-09' })
  })

  it('aggregate_* → ddd/aggregate', () => {
    expect(resolveDesignJump('aggregate_invariants_ratio', { id: 'Order-Agg' }))
      .toEqual({ tab: 'ddd', kind: 'aggregate', id: 'Order-Agg' })
  })

  it('screen_* → null (설계 노드 점프 미지원)', () => {
    expect(resolveDesignJump('screen_story_mapped_ratio', { id: 'Screen-01' })).toBeNull()
  })

  it('id 없거나 플레이스홀더면 null', () => {
    expect(resolveDesignJump('api_error_cases_ratio', { id: '?' })).toBeNull()
    expect(resolveDesignJump('api_error_cases_ratio', {})).toBeNull()
    expect(resolveDesignJump('', { id: 'API-01' })).toBeNull()
  })
})

describe('resolvePrdJump', () => {
  it('prdSection → /plan?tab=prd&section + anchor(노드명)', () => {
    expect(resolvePrdJump({ prdSection: 'nfr' }, { id: 'API-01', name: '로그인' }))
      .toEqual({ path: '/plan', query: { tab: 'prd', section: 'nfr', anchor: '로그인' } })
  })

  it('이름 없으면 id 를 anchor 로', () => {
    expect(resolvePrdJump({ prdSection: 'screen' }, { id: 'Screen-01' }))
      .toEqual({ path: '/plan', query: { tab: 'prd', section: 'screen', anchor: 'Screen-01' } })
  })

  it('section 없으면 null', () => {
    expect(resolvePrdJump({}, { id: 'API-01' })).toBeNull()
    expect(resolvePrdJump({ prdSection: '' }, { id: 'API-01' })).toBeNull()
  })
})

describe('resolveGapJump', () => {
  it('설계 노드 우선 (api → design)', () => {
    const j = resolveGapJump('api_error_cases_ratio', { id: 'API-01' }, { prdSection: 'epic' })
    expect(j).toEqual({ mode: 'design', tab: 'spack', kind: 'api', id: 'API-01' })
  })

  it('설계 점프 불가하면 PRD 폴백 (screen → prd)', () => {
    const j = resolveGapJump('screen_story_mapped_ratio', { id: 'Screen-01', name: '목록' }, { prdSection: 'screen' })
    expect(j).toEqual({ mode: 'prd', path: '/plan', query: { tab: 'prd', section: 'screen', anchor: '목록' } })
  })

  it('둘 다 불가하면 null', () => {
    expect(resolveGapJump('screen_story_mapped_ratio', { id: 'Screen-01' }, {})).toBeNull()
  })
})
