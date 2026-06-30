/**
 * 5개 가이드 모달 smoke test — BaseGuideModal 통합 후 각 모달이 실제로 렌더되고
 * 헤더/SVG/네비가 정상 동작하는지 (호출처와 동일하게 full mount).
 *
 * BaseGuideModal 자체 동작은 BaseGuideModal.test.js 가 검증하므로, 여기선
 * "각 모달이 올바른 데이터를 BaseGuideModal 에 전달하는가" 통합 지점만 확인.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

import i18n from '@/plugins/i18n'
import DesignGuideModal from '@/components/design/DesignGuideModal.vue'
import UserGuideModal from '@/components/plan/UserGuideModal.vue'
import McpGuideModal from '@/components/plan/McpGuideModal.vue'
import DeliverablesGuideModal from '@/components/deliverables/DeliverablesGuideModal.vue'
import LintGuideModal from '@/components/lint/LintGuideModal.vue'

beforeEach(() => {
  // jsdom navigator.language='en' → DesignGuideModal i18n 헤드라인을 ko 로 고정.
  i18n.global.locale.value = 'ko'
  localStorage.clear()
  routerPush.mockClear()
})

describe('가이드 모달 smoke — 헤더 + SVG 렌더', () => {
  const cases = [
    { name: 'Design', Comp: DesignGuideModal, headline: '시스템 그리기', pill: 'DESIGN GUIDE' },
    { name: 'User', Comp: UserGuideModal, headline: '회의록 정리 & 기획', pill: 'PLAN GUIDE' },
    { name: 'Mcp', Comp: McpGuideModal, headline: 'AI 코딩 에이전트와 연결하기', pill: 'MCP — NEW' },
    { name: 'Deliverables', Comp: DeliverablesGuideModal, headline: 'Final Artifacts & Handoff', pill: 'DELIVERABLES GUIDE' },
    { name: 'Lint', Comp: LintGuideModal, headline: '코드 점검', pill: 'LINT GUIDE' },
  ]

  it.each(cases)('$name 모달 — overlay + 헤드라인 + 첫 step SVG 렌더', ({ Comp, headline, pill }) => {
    const wrapper = mount(Comp, { props: { modelValue: true } })
    expect(wrapper.find('.guide-overlay').exists()).toBe(true)
    expect(wrapper.find('.guide-headline').text()).toBe(headline)
    expect(wrapper.find('.section-pill').text()).toBe(pill)
    // 첫 step 의 illustration SVG 가 slot 으로 렌더됐는지
    expect(wrapper.find('.step-illust svg').exists()).toBe(true)
  })

  it.each(cases)('$name 모달 — modelValue=false 면 미렌더', ({ Comp }) => {
    const wrapper = mount(Comp, { props: { modelValue: false } })
    expect(wrapper.find('.guide-overlay').exists()).toBe(false)
  })

  it.each(cases)('$name 모달 — 마지막 step 까지 네비 시 각 step SVG 렌더 (누락 없음)', async ({ Comp }) => {
    const wrapper = mount(Comp, { props: { modelValue: true } })
    const dots = wrapper.findAll('.dot')
    for (let i = 0; i < dots.length; i++) {
      await wrapper.findAll('.dot')[i].trigger('click')
      await flushPromises()
      // 각 step 마다 SVG 가 정확히 1개 렌더 (slot v-if/else-if 분기 정상)
      expect(wrapper.findAll('.step-illust svg').length).toBe(1)
    }
  })
})

describe('McpGuideModal — finish 시 /profile 이동 (특이 케이스)', () => {
  it('마지막 step finish 버튼: finishLabel "연결하러 가기" + 클릭 시 router.push(/profile)', async () => {
    const wrapper = mount(McpGuideModal, { props: { modelValue: true } })
    // 마지막 step (5번째 = index 4) 로 이동
    const dots = wrapper.findAll('.dot')
    await dots[dots.length - 1].trigger('click')
    await flushPromises()

    const finishBtn = wrapper.find('.nav-btn--primary')
    expect(finishBtn.text()).toContain('연결하러 가기')

    await finishBtn.trigger('click')
    await flushPromises()

    expect(routerPush).toHaveBeenCalledWith('/profile')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })
})

describe('가이드 모달 — 열림 시 seen 저장 (호출처 계약: 계정당 최초 1회 자동표시)', () => {
  it('Design: 열림 → harness_design_guide_seen_v1::anon 저장 (부모 자동표시 차단 키와 일치)', () => {
    mount(DesignGuideModal, { props: { modelValue: true } })
    expect(localStorage.getItem('harness_design_guide_seen_v1::anon')).toBe('1')
  })

  it('Lint: 열림 → harness_lint_guide_seen_v1::anon 저장 + 마지막 step 시작하기 → 닫힘', async () => {
    const wrapper = mount(LintGuideModal, { props: { modelValue: true } })
    expect(localStorage.getItem('harness_lint_guide_seen_v1::anon')).toBe('1')
    const dots = wrapper.findAll('.dot')
    await dots[dots.length - 1].trigger('click')
    await flushPromises()
    await wrapper.find('.nav-btn--primary').trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })
})
