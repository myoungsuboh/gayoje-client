import { describe, it, expect } from 'vitest'
import { compareVersions, compareVersionsDesc, computeNextVersion } from '@/utils/version'

describe('compareVersions', () => {
  it('점버전 자연 정렬', () => {
    expect(compareVersions('v1.10', 'v1.2')).toBeGreaterThan(0)
    expect(compareVersions('v1.2', 'v1.10')).toBeLessThan(0)
    expect(compareVersions('v1.3', 'v1.3')).toBe(0)
  })

  it('정수 버전 자연 정렬 — 버그 케이스: V10 > V3', () => {
    expect(compareVersions('V10', 'V3')).toBeGreaterThan(0)
    expect(compareVersions('V3', 'V10')).toBeLessThan(0)
    expect(compareVersions('V14', 'V9')).toBeGreaterThan(0)
  })

  it('major 우선 비교', () => {
    expect(compareVersions('v2.0', 'v1.99')).toBeGreaterThan(0)
  })

  it('비정상 문자열은 -1,-1 로 처리 — 정상 버전 뒤로', () => {
    expect(compareVersions('garbage', 'V1')).toBeLessThan(0)
    expect(compareVersions('V1', 'garbage')).toBeGreaterThan(0)
  })
})

describe('compareVersionsDesc', () => {
  it('내림차순 정렬 — 최신이 앞에', () => {
    const sorted = ['V3', 'V10', 'V1', 'V14', 'V9'].sort(compareVersionsDesc)
    expect(sorted).toEqual(['V14', 'V10', 'V9', 'V3', 'V1'])
  })

  it('점버전 + 정수 버전 혼재 — 정수가 뒤로', () => {
    const sorted = ['V10', 'v1.2', 'v1.3', 'V3'].sort(compareVersionsDesc)
    // v1.* 의 major=1 → 정수 V* 의 major=0 보다 큼 → 점버전이 앞.
    expect(sorted).toEqual(['v1.3', 'v1.2', 'V10', 'V3'])
  })
})

describe('computeNextVersion', () => {
  it('점버전 → minor +1', () => {
    expect(computeNextVersion('v1.3')).toBe('v1.4')
    expect(computeNextVersion('v1.9')).toBe('v1.10')
  })

  it('정수 버전 → +1', () => {
    expect(computeNextVersion('V10')).toBe('V11')
    expect(computeNextVersion('V3')).toBe('V4')
  })

  it('null/빈/잘못된 입력 → v1.1', () => {
    expect(computeNextVersion(null)).toBe('v1.1')
    expect(computeNextVersion(undefined)).toBe('v1.1')
    expect(computeNextVersion('garbage')).toBe('v1.1')
  })
})
