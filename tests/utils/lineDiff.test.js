import { describe, it, expect } from 'vitest'
import { diffLines, diffStats } from '@/utils/lineDiff'

describe('diffLines', () => {
  it('identical text → all same', () => {
    const rows = diffLines('a\nb\nc', 'a\nb\nc')
    expect(rows.every(r => r.type === 'same')).toBe(true)
    expect(rows.length).toBe(3)
  })

  it('insertion in middle', () => {
    const rows = diffLines('a\nc', 'a\nb\nc')
    expect(rows.map(r => `${r.type}:${r.text}`)).toEqual([
      'same:a', 'added:b', 'same:c'
    ])
  })

  it('deletion in middle', () => {
    const rows = diffLines('a\nb\nc', 'a\nc')
    expect(rows.map(r => `${r.type}:${r.text}`)).toEqual([
      'same:a', 'removed:b', 'same:c'
    ])
  })

  it('replacement', () => {
    const rows = diffLines('a\nB\nc', 'a\nX\nc')
    // LCS 가 a, c 보존하고 B → X 를 remove + add 로 분리.
    expect(rows.filter(r => r.type === 'same').map(r => r.text)).toEqual(['a', 'c'])
    expect(rows.filter(r => r.type === 'removed').map(r => r.text)).toEqual(['B'])
    expect(rows.filter(r => r.type === 'added').map(r => r.text)).toEqual(['X'])
  })

  it('empty old → new lines are added', () => {
    const rows = diffLines('', 'x\ny')
    const added = rows.filter(r => r.type === 'added').map(r => r.text)
    expect(added).toContain('x')
    expect(added).toContain('y')
    // 빈 문자열의 split 은 [''] 라 한 라인이 removed 로 나옴 — 정상.
    expect(rows.some(r => r.type === 'same')).toBe(false)
  })

  it('empty new → all removed', () => {
    const rows = diffLines('x\ny', '')
    expect(rows.some(r => r.type === 'removed')).toBe(true)
  })

  it('handles null/undefined inputs gracefully', () => {
    expect(() => diffLines(null, 'a')).not.toThrow()
    expect(() => diffLines(undefined, undefined)).not.toThrow()
  })

  it('handles multi-line markdown summaries', () => {
    const oldMd = '## CPS\n\n### Problem\n- **[PRB-01] 옛 요약**\n\n### Solution\n- `[RES-01] 옛 해결책`'
    const newMd = '## CPS\n\n### Problem\n- **[PRB-01] 새 요약**\n\n### Solution\n- `[RES-01] 새 해결책`'
    const rows = diffLines(oldMd, newMd)
    const removed = rows.filter(r => r.type === 'removed').map(r => r.text)
    const added = rows.filter(r => r.type === 'added').map(r => r.text)
    expect(removed.some(t => t.includes('옛 요약'))).toBe(true)
    expect(added.some(t => t.includes('새 요약'))).toBe(true)
    expect(removed.some(t => t.includes('옛 해결책'))).toBe(true)
    expect(added.some(t => t.includes('새 해결책'))).toBe(true)
  })
})

describe('diffStats', () => {
  it('counts each type', () => {
    const rows = [
      { type: 'same', text: 'a' },
      { type: 'added', text: 'b' },
      { type: 'added', text: 'c' },
      { type: 'removed', text: 'd' },
      { type: 'same', text: 'e' },
    ]
    expect(diffStats(rows)).toEqual({ added: 2, removed: 1, same: 2 })
  })

  it('empty input', () => {
    expect(diffStats([])).toEqual({ added: 0, removed: 0, same: 0 })
  })
})
