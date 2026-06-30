import { describe, it, expect } from 'vitest'
import { buildLineageSummary } from '@/utils/lineageSummary'

const impl = (p) => ({ repoUrl: 'r', filePath: p, confidence: 'high' })

describe('buildLineageSummary', () => {
  it('빈 데이터 → 0/없음', () => {
    const s = buildLineageSummary(null)
    expect(s.storyTotal).toBe(0)
    expect(s.hasStories).toBe(false)
    expect(s.storyPct).toBe(0)
    expect(s.missingStories).toEqual([])
    expect(s.tech.apis).toEqual({ total: 0, mapped: 0 })
  })

  it('Story 3개 중 2개 구현 → pct 67, 미구현 1개(힌트 병합)', () => {
    const data = {
      stories: [
        { id: 'S1', name: '로그인', implementations: [impl('login.vue')] },
        { id: 'S2', name: '주문', implementations: [impl('order.js')] },
        { id: 'S3', name: '결제', description: '카드 결제', implementations: [] },
      ],
      missingImpl: [{ type: 'story', id: 'S3', name: '결제', reason: '매칭 파일 없음' }],
      apis: [{ id: 'A1', implementations: [impl('a.js')] }, { id: 'A2', implementations: [] }],
      aggregates: [{ id: 'G1', implementations: [impl('g.js')] }],
      services: [],
    }
    const s = buildLineageSummary(data)
    expect(s.storyTotal).toBe(3)
    expect(s.storyImplemented).toBe(2)
    expect(s.storyPct).toBe(67)
    expect(s.hasStories).toBe(true)
    expect(s.implementedStories.map((x) => x.id)).toEqual(['S1', 'S2'])
    expect(s.missingStories).toEqual([{ id: 'S3', name: '결제', hint: '매칭 파일 없음' }])
    expect(s.tech.apis).toEqual({ total: 2, mapped: 1 })
    expect(s.tech.aggregates).toEqual({ total: 1, mapped: 1 })
    expect(s.tech.services).toEqual({ total: 0, mapped: 0 })
  })

  it('missingImpl 없으면 description 을 힌트로', () => {
    const s = buildLineageSummary({ stories: [{ id: 'S1', name: 'X', description: '설명', implementations: [] }] })
    expect(s.missingStories[0].hint).toBe('설명')
  })
})
