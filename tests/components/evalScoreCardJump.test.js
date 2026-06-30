import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import i18n from '@/plugins/i18n'

const jumpTo = vi.fn()
const push = vi.fn()
vi.mock('@/composables/useDesignCrossLink', () => ({
  useDesignCrossLink: () => ({ jumpTo }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('@/composables/useEvalScore', () => ({ notifyEvalScoreRefresh: vi.fn() }))

import EvalScoreCard from '@/components/design/EvalScoreCard.vue'

const tier = (s) => ({ score: s, weight: 0.4, sub_metrics: {} })
const score = {
  overall: 0.4,
  tier1: tier(1), tier2: tier(0.3), tier3: tier(0.5), tier4: tier(0.6),
  summary: {}, top_violation_codes: [],
  fix_targets: [
    {
      metric_key: 'api_error_cases_ratio', label: 'API 에러', tier: 2,
      missing: [{ id: 'API-01', name: '작업 생성' }], missing_total: 1, total: 3,
      fix: '에러 응답을 추가하세요', prd_section: 'epic', delta_pct: 5,
    },
    {
      metric_key: 'screen_story_mapped_ratio', label: '화면 매핑', tier: 2,
      missing: [{ id: 'Screen-01', name: '목록' }], missing_total: 1, total: 2,
      fix: '스토리에 연결하세요', prd_section: 'screen', delta_pct: 3,
    },
  ],
}

const mountCard = () =>
  mount(EvalScoreCard, {
    props: { score, projectName: 'p' },
    global: {
      plugins: [createPinia(), i18n],
      stubs: { VDialog: { template: '<div><slot /></div>' } },
    },
  })

describe('EvalScoreCard gap → jump', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'ko'
    jumpTo.mockClear()
    push.mockClear()
  })

  it('API 누락 칩 클릭 → crossLink.jumpTo(설계 노드, raw id)', async () => {
    const w = mountCard()
    await flushPromises()
    const chips = w.findAll('.missing-chip--clickable')
    expect(chips.length).toBeGreaterThanOrEqual(2)
    await chips[0].trigger('click')
    expect(jumpTo).toHaveBeenCalledWith({ tab: 'spack', kind: 'api', id: 'API-01' })
    expect(push).not.toHaveBeenCalled()
  })

  it('화면(설계 점프 불가) 칩 클릭 → PRD 폴백 router.push', async () => {
    const w = mountCard()
    await flushPromises()
    const chips = w.findAll('.missing-chip--clickable')
    await chips[1].trigger('click')
    expect(push).toHaveBeenCalledWith({
      path: '/plan',
      query: { tab: 'prd', section: 'screen', anchor: '목록' },
    })
  })

  it('항목 PRD 링크 클릭 → 섹션만으로 router.push', async () => {
    const w = mountCard()
    await flushPromises()
    const link = w.findAll('.ta-jump-link')[0]
    await link.trigger('click')
    expect(push).toHaveBeenCalledWith({
      path: '/plan',
      query: { tab: 'prd', section: 'epic' },
    })
  })
})
