import { describe, it, expect } from 'vitest'
import {
  normalizeFilePath,
  matchesAny,
  evaluateItem,
  evaluateLineage,
} from '@/utils/lineageQuality'

describe('normalizeFilePath', () => {
  it('Windows 백슬래시 → 슬래시', () => {
    expect(normalizeFilePath('src\\auth\\User.ts')).toBe('src/auth/user.ts')
  })

  it('양 끝 슬래시 + 공백 제거', () => {
    expect(normalizeFilePath('  /src/foo/  ')).toBe('src/foo')
  })

  it('대소문자 통일', () => {
    expect(normalizeFilePath('SRC/Auth.JS')).toBe('src/auth.js')
  })

  it('null/undefined/빈 → 빈 문자열', () => {
    expect(normalizeFilePath(null)).toBe('')
    expect(normalizeFilePath(undefined)).toBe('')
    expect(normalizeFilePath('')).toBe('')
    expect(normalizeFilePath(42)).toBe('')
  })
})

describe('matchesAny', () => {
  const truth = new Set(['src/auth/userservice.ts', 'src/api/loginapi.ts'])

  it('exact 모드: 정확히 일치', () => {
    expect(matchesAny('src/auth/UserService.ts', truth, 'exact')).toBe(true)
    expect(matchesAny('src/auth/Other.ts', truth, 'exact')).toBe(false)
  })

  it('endsWith 모드: 접미 일치도 허용', () => {
    expect(matchesAny('frontend/src/auth/UserService.ts', truth, 'endsWith')).toBe(true)
    expect(matchesAny('UserService.ts', truth, 'endsWith')).toBe(false) // 슬래시 경계 필요
  })

  it('exact 모드는 접미 매칭 거부', () => {
    expect(matchesAny('frontend/src/auth/UserService.ts', truth, 'exact')).toBe(false)
  })
})

describe('evaluateItem', () => {
  it('완벽 매칭: precision=1, recall=1, f1=1', () => {
    const r = evaluateItem(['a.ts', 'b.ts'], ['a.ts', 'b.ts'])
    expect(r).toEqual({ tp: 2, fp: 0, fn: 0, precision: 1, recall: 1, f1: 1 })
  })

  it('과잉 매칭: precision 하락', () => {
    const r = evaluateItem(['a.ts', 'b.ts', 'c.ts'], ['a.ts', 'b.ts'])
    expect(r.tp).toBe(2)
    expect(r.fp).toBe(1)
    expect(r.fn).toBe(0)
    expect(r.precision).toBeCloseTo(2 / 3)
    expect(r.recall).toBe(1)
  })

  it('누락 매칭: recall 하락', () => {
    const r = evaluateItem(['a.ts'], ['a.ts', 'b.ts'])
    expect(r.tp).toBe(1)
    expect(r.fp).toBe(0)
    expect(r.fn).toBe(1)
    expect(r.precision).toBe(1)
    expect(r.recall).toBe(0.5)
    expect(r.f1).toBeCloseTo(2 / 3)
  })

  it('완전 빗나감', () => {
    const r = evaluateItem(['x.ts'], ['a.ts'])
    expect(r.tp).toBe(0)
    expect(r.precision).toBe(0)
    expect(r.recall).toBe(0)
    expect(r.f1).toBeNull()
  })

  it('actual 비어있고 truth 있음 → P=null, R=0', () => {
    const r = evaluateItem([], ['a.ts'])
    expect(r.precision).toBeNull()
    expect(r.recall).toBe(0)
    expect(r.f1).toBeNull()
  })

  it('truth 비어있고 actual 있음 → P=0, R=null', () => {
    const r = evaluateItem(['a.ts'], [])
    expect(r.precision).toBe(0)
    expect(r.recall).toBeNull()
  })

  it('둘 다 비어있음 → 모두 null', () => {
    const r = evaluateItem([], [])
    expect(r.precision).toBeNull()
    expect(r.recall).toBeNull()
    expect(r.f1).toBeNull()
  })

  it('endsWith 모드에서도 정확 카운트', () => {
    const r = evaluateItem(
      ['frontend/src/auth/UserService.ts'],
      ['src/auth/UserService.ts'],
      'endsWith'
    )
    expect(r.tp).toBe(1)
    expect(r.fn).toBe(0)
    expect(r.precision).toBe(1)
    expect(r.recall).toBe(1)
  })

  it('대소문자 차이 무시', () => {
    const r = evaluateItem(['Src/Auth/User.ts'], ['src/auth/user.ts'])
    expect(r.tp).toBe(1)
  })

  it('중복 actual은 set으로 처리 (1번만 계산)', () => {
    const r = evaluateItem(['a.ts', 'a.ts'], ['a.ts'])
    expect(r.tp).toBe(1)
    expect(r.fp).toBe(0)
  })

  it('null/undefined 입력 안전', () => {
    const r = evaluateItem(null, undefined)
    expect(r).toEqual({ tp: 0, fp: 0, fn: 0, precision: null, recall: null, f1: null })
  })
})

describe('evaluateLineage', () => {
  it('라벨 없는 산출물은 평가 제외 (coverage에 반영)', () => {
    const actual = [
      { id: '1', name: 'A', implementations: [{ filePath: 'a.ts' }] },
      { id: '2', name: 'B', implementations: [{ filePath: 'b.ts' }] },
    ]
    const truth = [{ id: '1', expectedFiles: ['a.ts'] }] // 2번 산출물 라벨 없음
    const r = evaluateLineage(actual, truth)
    expect(r.perItem).toHaveLength(1)
    expect(r.coverage).toEqual({ labeled: 1, total: 2 })
  })

  it('macro vs micro: 산출물 크기 편향 감지', () => {
    const actual = [
      // 작은 산출물: 1/1 = 100%
      { id: '1', implementations: [{ filePath: 'small.ts' }] },
      // 큰 산출물: 5/10 매칭 = 50%
      {
        id: '2',
        implementations: Array.from({ length: 10 }, (_, i) => ({ filePath: `big-${i}.ts` })),
      },
    ]
    const truth = [
      { id: '1', expectedFiles: ['small.ts'] },
      { id: '2', expectedFiles: Array.from({ length: 5 }, (_, i) => `big-${i}.ts`) },
    ]
    const r = evaluateLineage(actual, truth)

    // Macro: (100% + 50%) / 2 = 75%
    expect(r.macro.precision).toBeCloseTo((1 + 0.5) / 2)
    // Micro: (1+5) TP, (0+5) FP, (0+0) FN → P = 6/11
    expect(r.micro.precision).toBeCloseTo(6 / 11)
    expect(r.micro.tp).toBe(6)
    expect(r.micro.fp).toBe(5)
    expect(r.micro.fn).toBe(0)
  })

  it('id 누락 항목은 무시', () => {
    const actual = [
      { name: 'no-id', implementations: [{ filePath: 'x.ts' }] },
      { id: '1', implementations: [{ filePath: 'a.ts' }] },
    ]
    const truth = [{ id: '1', expectedFiles: ['a.ts'] }]
    const r = evaluateLineage(actual, truth)
    expect(r.perItem).toHaveLength(1)
    expect(r.coverage.total).toBe(2)
  })

  it('빈 actual / 빈 truth → 모든 지표 null', () => {
    const r = evaluateLineage([], [])
    expect(r.perItem).toEqual([])
    expect(r.macro).toEqual({ precision: null, recall: null, f1: null })
    expect(r.micro.precision).toBeNull()
    expect(r.coverage).toEqual({ labeled: 0, total: 0 })
  })

  it('null 안전 처리', () => {
    expect(() => evaluateLineage(null, null)).not.toThrow()
    expect(() => evaluateLineage(undefined, undefined)).not.toThrow()
  })

  it('숫자 ID와 문자열 ID 호환', () => {
    const actual = [{ id: 1, implementations: [{ filePath: 'a.ts' }] }]
    const truth = [{ id: '1', expectedFiles: ['a.ts'] }]
    const r = evaluateLineage(actual, truth)
    expect(r.perItem).toHaveLength(1)
    expect(r.perItem[0].precision).toBe(1)
  })

  it('현실 시나리오: 매칭 0건 (지금 이슈와 동일)', () => {
    const actual = [
      { id: '1', name: '사용자 인증 서비스', implementations: [] },
      { id: '2', name: '주문 관리 API', implementations: [] },
    ]
    const truth = [
      { id: '1', expectedFiles: ['src/auth/UserService.ts'] },
      { id: '2', expectedFiles: ['src/api/OrderApi.ts'] },
    ]
    const r = evaluateLineage(actual, truth)
    // P는 null (actual=0이라 분모 0), R=0 (truth는 있는데 잡은 게 없음)
    expect(r.macro.precision).toBeNull()
    expect(r.macro.recall).toBe(0)
    expect(r.micro.tp).toBe(0)
    expect(r.micro.fn).toBe(2)
  })
})
