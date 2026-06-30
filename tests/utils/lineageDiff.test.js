import { describe, it, expect } from 'vitest'
import { diffLineage } from '@/utils/lineageDiff'

const mk = (id, files = []) => ({
  id,
  name: id,
  implementations: files.map(f => ({ filePath: f, confidence: 'high', repoUrl: 'r' })),
})

describe('diffLineage', () => {
  it('둘 다 빈 결과', () => {
    const r = diffLineage({}, {})
    expect(r.summary.addedCount).toBe(0)
    expect(r.summary.removedCount).toBe(0)
    expect(r.summary.changedCount).toBe(0)
  })

  it('산출물 추가 감지', () => {
    const a = { apis: [mk('api-1', ['a.ts'])] }
    const b = { apis: [mk('api-1', ['a.ts']), mk('api-2', ['b.ts'])] }
    const r = diffLineage(a, b)
    expect(r.added.apis).toHaveLength(1)
    expect(r.added.apis[0].id).toBe('api-2')
    expect(r.summary.addedCount).toBe(1)
    expect(r.summary.implsAdded).toBe(1)
  })

  it('산출물 제거 감지', () => {
    const a = { apis: [mk('api-1', ['a.ts', 'b.ts'])] }
    const b = { apis: [] }
    const r = diffLineage(a, b)
    expect(r.removed.apis).toHaveLength(1)
    expect(r.summary.removedCount).toBe(1)
    expect(r.summary.implsRemoved).toBe(2)
  })

  it('implementation 변경 감지 (파일 추가)', () => {
    const a = { apis: [mk('api-1', ['a.ts'])] }
    const b = { apis: [mk('api-1', ['a.ts', 'b.ts'])] }
    const r = diffLineage(a, b)
    expect(r.changed.apis).toHaveLength(1)
    expect(r.changed.apis[0].addedFiles).toEqual(['b.ts'])
    expect(r.changed.apis[0].removedFiles).toEqual([])
    expect(r.summary.implsAdded).toBe(1)
  })

  it('implementation 변경 감지 (파일 제거)', () => {
    const a = { apis: [mk('api-1', ['a.ts', 'b.ts'])] }
    const b = { apis: [mk('api-1', ['a.ts'])] }
    const r = diffLineage(a, b)
    expect(r.changed.apis[0].removedFiles).toEqual(['b.ts'])
    expect(r.summary.implsRemoved).toBe(1)
  })

  it('unchanged 카운트', () => {
    const a = { apis: [mk('api-1', ['a.ts'])] }
    const b = { apis: [mk('api-1', ['a.ts'])] }
    const r = diffLineage(a, b)
    expect(r.summary.unchangedCount).toBe(1)
    expect(r.summary.changedCount).toBe(0)
  })

  it('대소문자/슬래시 정규화 후 비교', () => {
    const a = { apis: [mk('api-1', ['SRC/A.ts'])] }
    const b = { apis: [mk('api-1', ['src/a.ts'])] }
    const r = diffLineage(a, b)
    expect(r.summary.unchangedCount).toBe(1)
  })

  it('각 카테고리 동시에 처리', () => {
    const a = {
      apis: [mk('api-1', ['a.ts'])],
      services: [mk('svc-1', ['s.ts'])],
    }
    const b = {
      apis: [mk('api-2', ['x.ts'])],
      services: [mk('svc-1', ['s.ts', 's2.ts'])],
    }
    const r = diffLineage(a, b)
    expect(r.added.apis).toHaveLength(1)
    expect(r.removed.apis).toHaveLength(1)
    expect(r.changed.services).toHaveLength(1)
    expect(r.summary.totalA).toBe(2)
    expect(r.summary.totalB).toBe(2)
  })

  it('null/undefined 입력 안전', () => {
    const r = diffLineage(null, { apis: [mk('api-1', ['a.ts'])] })
    expect(r.summary.addedCount).toBe(1)
    expect(r.summary.removedCount).toBe(0)
  })

  it('id 없으면 name으로 매칭', () => {
    const a = { apis: [{ name: 'X', implementations: [{ filePath: 'a.ts' }] }] }
    const b = { apis: [{ name: 'X', implementations: [{ filePath: 'a.ts', 'b.ts': '' }] }] }
    const r = diffLineage(a, b)
    expect(r.removed.apis).toHaveLength(0)
    expect(r.added.apis).toHaveLength(0)
  })
})
