/**
 * AiDraftNotice + OnboardingWelcome smoke — B2C 신뢰/온보딩 컴포넌트.
 *
 * 검증:
 * - AiDraftNotice: 렌더 + dismiss + localStorage 기억
 * - OnboardingWelcome: 렌더 + start emit + 닫기 시 재노출 안 함 + 샘플 복사
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'

import AiDraftNotice from '@/components/common/AiDraftNotice.vue'
import OnboardingWelcome from '@/components/home/OnboardingWelcome.vue'

// jsdom navigator.language='en' → OnboardingWelcome 가 i18n 마이그레이션된 뒤
// 한국어 단언이 깨지지 않도록 ko 고정 (EvalScoreCard.test.js 와 동일 관례).
beforeEach(() => { localStorage.clear(); i18n.global.locale.value = 'ko' })

describe('AiDraftNotice', () => {
  it('기본 문구 + label 을 렌더한다', () => {
    const w = mount(AiDraftNotice, { props: { label: '기획 문서(PRD)' } })
    expect(w.text()).toContain('검토가 필요한 초안이에요')
    expect(w.text()).toContain('기획 문서(PRD)')
  })

  it('dismissible 이면 닫기 버튼으로 숨기고 localStorage 에 기억한다', async () => {
    const w = mount(AiDraftNotice, {
      props: { dismissible: true, storageKey: 'k_test' },
    })
    expect(w.find('[role="note"]').exists()).toBe(true)
    await w.find('.ai-draft-close').trigger('click')
    expect(w.find('[role="note"]').exists()).toBe(false)
    expect(localStorage.getItem('k_test')).toBe('1')
  })

  it('이미 dismiss 된 storageKey 면 처음부터 렌더하지 않는다', () => {
    localStorage.setItem('k_seen', '1')
    const w = mount(AiDraftNotice, {
      props: { dismissible: true, storageKey: 'k_seen' },
    })
    expect(w.find('[role="note"]').exists()).toBe(false)
  })
})

describe('OnboardingWelcome', () => {
  it('5단계 안내 + CTA 를 렌더한다', () => {
    const w = mount(OnboardingWelcome)
    expect(w.text()).toContain('처음이신가요?')
    expect(w.text()).toContain('회의록 올리기')
    expect(w.findAll('.onb-step')).toHaveLength(5)
  })

  it('시작 버튼이 start 이벤트를 emit 한다', async () => {
    const w = mount(OnboardingWelcome)
    await w.find('.onb-cta').trigger('click')
    expect(w.emitted('start')).toBeTruthy()
  })

  it('닫으면 숨기고 localStorage 에 기억 → 재마운트 시 안 뜸', async () => {
    const w = mount(OnboardingWelcome)
    await w.find('.onb-close').trigger('click')
    expect(w.find('.onb-card').exists()).toBe(false)
    const w2 = mount(OnboardingWelcome)
    expect(w2.find('.onb-card').exists()).toBe(false)
  })

  it('샘플 체험 버튼이 try-sample 이벤트를 emit 한다', async () => {
    const w = mount(OnboardingWelcome)
    await w.find('.onb-ghost').trigger('click')
    expect(w.emitted('try-sample')).toBeTruthy()
  })
})
