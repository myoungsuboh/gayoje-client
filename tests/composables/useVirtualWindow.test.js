import { describe, it, expect } from 'vitest'
import { computeVisibleRange } from '@/composables/useVirtualWindow'

describe('computeVisibleRange', () => {
  it('top of list — start=0, end=visible+overscan', () => {
    const r = computeVisibleRange({
      total: 1000, scrollTop: 0, containerHeight: 400, rowHeight: 20, overscan: 5,
    })
    expect(r.start).toBe(0)
    // visible = 20, plus 2*overscan = 10 → end = 30
    expect(r.end).toBe(30)
  })

  it('middle of list — sliding window', () => {
    const r = computeVisibleRange({
      total: 1000, scrollTop: 1000, containerHeight: 400, rowHeight: 20, overscan: 5,
    })
    // floor(1000/20) = 50, minus overscan 5 → start=45
    expect(r.start).toBe(45)
    // end = 45 + 20 + 10 = 75
    expect(r.end).toBe(75)
  })

  it('near end — start clamped to maxStart so visible+overscan covers bottom', () => {
    const r = computeVisibleRange({
      total: 100, scrollTop: 1800, containerHeight: 400, rowHeight: 20, overscan: 5,
    })
    // visible = ceil(400/20) = 20. maxStart = 100-20 = 80. naturalStart = 85.
    // 빈 영역 방지 위해 start 를 maxStart 까지 끌어내림 → start=80, end=100.
    expect(r.end).toBe(100)
    expect(r.start).toBe(80)
  })

  it('empty list — both 0', () => {
    const r = computeVisibleRange({
      total: 0, scrollTop: 0, containerHeight: 400, rowHeight: 20, overscan: 5,
    })
    expect(r).toEqual({ start: 0, end: 0 })
  })

  it('container height 0 — both 0 (defensive)', () => {
    const r = computeVisibleRange({
      total: 100, scrollTop: 0, containerHeight: 0, rowHeight: 20, overscan: 5,
    })
    expect(r).toEqual({ start: 0, end: 0 })
  })

  it('overscan 0 — pure visible window', () => {
    const r = computeVisibleRange({
      total: 1000, scrollTop: 100, containerHeight: 200, rowHeight: 20, overscan: 0,
    })
    expect(r.start).toBe(5)
    expect(r.end).toBe(15)
  })

  it('small list smaller than viewport — start=0 end=total', () => {
    const r = computeVisibleRange({
      total: 5, scrollTop: 0, containerHeight: 400, rowHeight: 20, overscan: 5,
    })
    expect(r.start).toBe(0)
    expect(r.end).toBe(5)
  })

  it('scrollTop not aligned to rowHeight — floor down', () => {
    const r = computeVisibleRange({
      total: 1000, scrollTop: 23, containerHeight: 400, rowHeight: 20, overscan: 0,
    })
    // floor(23/20) = 1
    expect(r.start).toBe(1)
  })

  it('scrollTop past end is clamped via end', () => {
    const r = computeVisibleRange({
      total: 100, scrollTop: 999_999, containerHeight: 400, rowHeight: 20, overscan: 5,
    })
    // 정상 항상 start <= end <= total
    expect(r.end).toBeLessThanOrEqual(100)
    expect(r.start).toBeLessThanOrEqual(r.end)
  })
})
