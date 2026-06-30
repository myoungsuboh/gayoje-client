/**
 * mdProgress — create_md 진행 신호 파서 + 진행률 밴드 (BE emit_stage 계약 검증).
 *
 * BE: app/pipelines/create_md_pipeline.py 가 emit 하는 형식과 1:1 —
 *   md:collecting / md:docs:<n>/4[:<완료목록>] / md:assembling
 */
import { describe, it, expect } from 'vitest'
import { MD_DOC_KEYS, parseMdStage, mdSignalBand } from '@/utils/mdProgress'

describe('parseMdStage — 신호 파싱', () => {
  it('md:collecting → 0단계', () => {
    expect(parseMdStage('md:collecting')).toEqual({ idx: 0, done: 0, names: [] })
  })

  it('md:docs:0/4 (목록 없음) → 1단계, 완료 0', () => {
    expect(parseMdStage('md:docs:0/4')).toEqual({ idx: 1, done: 0, names: [] })
  })

  it('md:docs:2/4:spack,ddd → 누적 완료 목록 파싱', () => {
    expect(parseMdStage('md:docs:2/4:spack,ddd')).toEqual({
      idx: 1, done: 2, names: ['spack', 'ddd'],
    })
  })

  it('md:docs:4/4:전체 → done 4 + 4종 목록', () => {
    const sig = parseMdStage(`md:docs:4/4:${MD_DOC_KEYS.join(',')}`)
    expect(sig.done).toBe(4)
    expect(sig.names).toEqual(MD_DOC_KEYS)
  })

  it('md:assembling → 2단계, 전체 완료 취급', () => {
    const sig = parseMdStage('md:assembling')
    expect(sig.idx).toBe(2)
    expect(sig.names).toEqual(MD_DOC_KEYS)
  })

  it('알 수 없는 doc 이름은 무시 (미래 BE 가 5번째 문서를 추가해도 안전)', () => {
    const sig = parseMdStage('md:docs:2/4:spack,newdoc')
    expect(sig.names).toEqual(['spack'])
  })

  it('형식 밖/빈 값 → null (elapsed 폴백 유지)', () => {
    expect(parseMdStage('')).toBeNull()
    expect(parseMdStage(null)).toBeNull()
    expect(parseMdStage('design:spack')).toBeNull()
    expect(parseMdStage('md:docs:abc/4')).toBeNull()
  })
})

describe('mdSignalBand — 진행률 밴드', () => {
  it('null 신호 → null (폴백)', () => {
    expect(mdSignalBand(null)).toBeNull()
  })

  it('수집 → [3, 9]', () => {
    expect(mdSignalBand(parseMdStage('md:collecting'))).toEqual([3, 9])
  })

  it('문서 완료 수에 따라 floor 단조 증가 (0→12 … 4→92)', () => {
    const floors = [0, 1, 2, 3, 4].map(
      (n) => mdSignalBand({ idx: 1, done: n, names: [] })[0],
    )
    expect(floors).toEqual([12, 32, 52, 72, 92])
    // 각 밴드의 ceil 은 다음 floor 이상 — 점근이 다음 점프와 자연스럽게 이어짐
    for (let n = 0; n < 4; n++) {
      const [, ceil] = mdSignalBand({ idx: 1, done: n, names: [] })
      const [nextFloor] = mdSignalBand({ idx: 1, done: n + 1, names: [] })
      expect(ceil).toBeGreaterThanOrEqual(Math.min(nextFloor, 94) - 3)
    }
  })

  it('조립 → [95, 99] (100 은 완료 시 overlay 닫힘으로 표현)', () => {
    expect(mdSignalBand(parseMdStage('md:assembling'))).toEqual([95, 99])
  })

  it('전 구간에서 ceil ≤ 99 — 끝나기 전 100% 약속 금지', () => {
    const sigs = [
      parseMdStage('md:collecting'),
      ...[0, 1, 2, 3, 4].map((n) => ({ idx: 1, done: n, names: [] })),
      parseMdStage('md:assembling'),
    ]
    sigs.forEach((s) => expect(mdSignalBand(s)[1]).toBeLessThanOrEqual(99))
  })
})
