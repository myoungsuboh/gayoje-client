/**
 * EvalScoreCard — fix_targets delta 배지 + [2026-06-10] '검토 완료' 버튼 제거 회귀 가드.
 *
 * [이력] 원래 이 파일은 'AI 초안 일괄 검토 완료'(markAllReviewedApi) 흐름을 검증했다.
 * 검토 UI 없이 0.5→1.0 가중치만 전환하는 고무도장이라 기능 자체를 제거(scorer 의
 * 0.5 정책 폐지와 페어) — 관련 테스트는 삭제하고, 버튼이 다시 생기지 않도록 부재를
 * 가드한다. delta 배지는 살아있는 기능이라 유지.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import i18n from '@/plugins/i18n'

const { notifyEvalScoreRefresh, showSuccess, showError } = vi.hoisted(() => ({
  notifyEvalScoreRefresh: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))
vi.mock('@/composables/useEvalScore', () => ({ notifyEvalScoreRefresh }))
vi.mock('@/composables/useSnackbar', () => ({ useSnackbar: () => ({ showSuccess, showError }) }))
vi.mock('@/composables/useDesignCrossLink', () => ({ useDesignCrossLink: () => ({ jumpTo: vi.fn() }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import EvalScoreCard from '@/components/design/EvalScoreCard.vue'

const tier = (s) => ({ score: s, weight: 0.4, sub_metrics: {} })
const score = {
  overall: 0.5,
  tier1: tier(1), tier2: tier(0.4), tier3: tier(0.5), tier4: tier(0.6),
  summary: {}, top_violation_codes: [],
  fix_targets: [
    {
      metric_key: 'api_error_cases_ratio', label: 'API 에러', tier: 2,
      missing: [{ id: 'API-01', name: '작업 생성' }], missing_total: 1, total: 3,
      fix: '...', prd_section: 'epic', delta_pct: 5,
    },
  ],
}

const mountCard = () =>
  mount(EvalScoreCard, {
    props: { score, projectName: 'proj' },
    global: {
      plugins: [createPinia(), i18n],
      stubs: { VDialog: { template: '<div><slot /></div>' } },
    },
  })

describe('EvalScoreCard — delta 배지 + 검토 버튼 제거 가드', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'ko'
    vi.clearAllMocks()
  })

  it('delta 배지 "약 +5%" 렌더', async () => {
    const w = mountCard()
    await flushPromises()
    expect(w.find('.top-action-delta').text()).toContain('+5%')
  })

  it('[2026-06-10] "AI 초안 검토 완료" 버튼은 더 이상 존재하지 않는다 (고무도장 제거)', async () => {
    const w = mountCard()
    await flushPromises()
    expect(w.find('.review-all-btn').exists()).toBe(false)
  })
})
