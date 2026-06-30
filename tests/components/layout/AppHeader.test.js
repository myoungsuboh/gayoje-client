/**
 * AppHeader — 상시 업그레이드 진입점 (2026-06).
 *
 * 배경: 이전엔 한도 초과 모달에서만 /pricing 으로 갈 수 있어 "토큰을 다 써야
 * 업그레이드 가능"처럼 느껴졌다. 헤더에 상시 "플랜 업그레이드" 버튼을 추가.
 *
 * 검증:
 * - 최상위(pro_max) 등급이 아니면 데스크탑 진입 버튼이 "플랜 업그레이드" 라벨로 노출
 * - pro_max 도 버튼을 노출하되 "구독 관리" 라벨로 전환 (해지·결제수단·영수증 경로 보장).
 *   [2026-06] 이전엔 pro_max 면 버튼을 숨겼는데, 그 결과 최상위 등급 사용자가
 *   /pricing 의 구독 관리(해지) 버튼에 도달할 수 없는 사고가 있어 항상 노출로 변경.
 * - 클릭 시 /pricing 으로 이동
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import i18n from '@/plugins/i18n'

const vuetify = createVuetify({ components, directives })

// router.push 캡처용 — useRouter mock.
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

// jobs store — 헤더가 활성 잡 표시에 사용. 최소 stub.
vi.mock('@/store/jobs', () => ({
  useJobsStore: () => ({
    hasActive: false, activeJobs: [], activeCount: 0,
    batchState: { running: false },
    stopBatch: vi.fn(), stopAllActiveJobs: vi.fn(),
  }),
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn() }),
}))

// usage store — subscriptionType 을 테스트마다 바꿔 끼운다.
let currentTier = 'free'
vi.mock('@/store/usage', () => ({
  useUsageStore: () => ({
    get subscriptionType() { return currentTier },
  }),
}))

// 자식 컴포넌트 stub — 외부 의존(usage refresh, project lookup 등) 격리.
vi.mock('@/components/common/UsageHeaderChip.vue', () => ({
  default: { name: 'UsageHeaderChip', template: '<span class="usage-chip-stub"/>' },
}))
vi.mock('@/components/common/ProjectLookup.vue', () => ({
  default: { name: 'ProjectLookup', template: '<span class="project-lookup-stub"/>' },
}))
vi.mock('@/components/layout/TeamContextBadge.vue', () => ({
  default: { name: 'TeamContextBadge', template: '<span class="team-badge-stub"/>' },
}))
vi.mock('@/components/common/GuideTooltip.vue', () => ({
  default: { name: 'GuideTooltip', template: '<span class="guide-tooltip-stub"/>' },
}))

import AppHeader from '@/components/layout/AppHeader.vue'

const mountHeader = () => mount(AppHeader, { global: { plugins: [vuetify] } })

beforeEach(() => {
  push.mockClear()
  currentTier = 'free'
})

describe('AppHeader — 상시 업그레이드 진입점', () => {
  it('free 등급이면 업그레이드 버튼을 노출한다', () => {
    currentTier = 'free'
    const w = mountHeader()
    expect(w.find('.upgrade-btn').exists()).toBe(true)
  })

  it('pro / pro_plus 등급도 업그레이드 버튼을 노출한다', () => {
    for (const tier of ['pro', 'pro_plus']) {
      currentTier = tier
      const w = mountHeader()
      expect(w.find('.upgrade-btn').exists(), `${tier} 는 버튼 노출`).toBe(true)
    }
  })

  it('pro_max(최상위) 등급이면 "구독 관리" 라벨로 버튼을 노출한다 (해지 경로 보장)', () => {
    currentTier = 'pro_max'
    const w = mountHeader()
    const btn = w.find('.upgrade-btn')
    expect(btn.exists(), 'pro_max 도 /pricing 진입 버튼은 노출돼야 함').toBe(true)
    // 라벨은 업셀이 아니라 구독 관리 — 해지/결제수단/영수증 진입로.
    expect(btn.text()).toContain(i18n.global.t('common.header.manage_sub'))
    expect(btn.text()).not.toContain(i18n.global.t('common.header.upgrade'))
  })

  it('pro_max 등급도 진입 버튼 클릭 시 /pricing 으로 이동한다', async () => {
    currentTier = 'pro_max'
    const w = mountHeader()
    await w.find('.upgrade-btn').trigger('click')
    expect(push).toHaveBeenCalledWith('/pricing')
  })

  it('업그레이드 버튼 클릭 시 /pricing 으로 이동한다', async () => {
    currentTier = 'free'
    const w = mountHeader()
    await w.find('.upgrade-btn').trigger('click')
    expect(push).toHaveBeenCalledWith('/pricing')
  })
})
