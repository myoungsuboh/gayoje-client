import { describe, it, expect, beforeEach } from 'vitest'
import { rateMetric, VITALS_THRESHOLDS, getVitalsHistory, clearVitalsHistory } from '@/utils/webVitals'

describe('rateMetric', () => {
  it('LCP 등급', () => {
    expect(rateMetric('LCP', 2000)).toBe('good')
    expect(rateMetric('LCP', 3000)).toBe('needs-improvement')
    expect(rateMetric('LCP', 5000)).toBe('poor')
  })

  it('CLS 등급', () => {
    expect(rateMetric('CLS', 0.05)).toBe('good')
    expect(rateMetric('CLS', 0.15)).toBe('needs-improvement')
    expect(rateMetric('CLS', 0.4)).toBe('poor')
  })

  it('INP 등급', () => {
    expect(rateMetric('INP', 100)).toBe('good')
    expect(rateMetric('INP', 300)).toBe('needs-improvement')
    expect(rateMetric('INP', 800)).toBe('poor')
  })

  it('경계값 — good 임계값에 정확히 일치', () => {
    expect(rateMetric('LCP', 2500)).toBe('good')
    expect(rateMetric('LCP', 2501)).toBe('needs-improvement')
  })

  it('알 수 없는 지표 → unknown', () => {
    expect(rateMetric('UNKNOWN', 100)).toBe('unknown')
  })

  it('null/undefined → unknown', () => {
    expect(rateMetric('LCP', null)).toBe('unknown')
    expect(rateMetric('LCP', undefined)).toBe('unknown')
  })
})

describe('VITALS_THRESHOLDS', () => {
  it('5개 지표 모두 정의', () => {
    expect(VITALS_THRESHOLDS).toHaveProperty('LCP')
    expect(VITALS_THRESHOLDS).toHaveProperty('FCP')
    expect(VITALS_THRESHOLDS).toHaveProperty('CLS')
    expect(VITALS_THRESHOLDS).toHaveProperty('INP')
    expect(VITALS_THRESHOLDS).toHaveProperty('TTFB')
  })

  it('good < needs', () => {
    for (const [, t] of Object.entries(VITALS_THRESHOLDS)) {
      expect(t.good).toBeLessThan(t.needs)
    }
  })
})

describe('history storage', () => {
  beforeEach(() => {
    clearVitalsHistory()
  })

  it('clearVitalsHistory 후 빈 배열', () => {
    expect(getVitalsHistory()).toEqual([])
  })
})
