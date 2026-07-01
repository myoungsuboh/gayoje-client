/**
 * BaseGuideModal.vue — 공통 가이드 모달 shell 동작 테스트.
 *
 * 5개 가이드 모달(User/Mcp/Design/Deliverables/Lint)이 이 컴포넌트로 통합됐으므로
 * 여기의 동작(네비/finish/seen 저장/slot/단축키)이 5개 전부의 공통 동작을 보장한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'

import BaseGuideModal from '@/components/common/BaseGuideModal.vue'

const STEPS = [
  { no: '01', title: '첫 단계', subtitle: 'STEP ONE', desc: '첫 설명', tip: '첫 팁', illustration: 'a' },
  { no: '02', title: '둘째 단계', subtitle: 'STEP TWO', desc: '둘째 설명', tip: '둘째 팁', illustration: 'b' },
  { no: '03', title: '셋째 단계', subtitle: 'STEP THREE', desc: '셋째 설명', tip: '', illustration: 'c' },
]

const mountModal = (props = {}, slots = {}) =>
  mount(BaseGuideModal, {
    props: {
      modelValue: true,
      steps: STEPS,
      seenKey: 'test_guide_seen',
      pill: 'TEST GUIDE',
      headline: '테스트 가이드',
      sub: '서브 텍스트',
      ...props,
    },
    slots,
  })

beforeEach(() => {
  localStorage.clear()
})

describe('BaseGuideModal — 렌더', () => {
  it('modelValue=true 면 overlay + 첫 step 렌더', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.guide-overlay').exists()).toBe(true)
    expect(wrapper.find('.guide-headline').text()).toBe('테스트 가이드')
    expect(wrapper.find('.section-pill').text()).toBe('TEST GUIDE')
    expect(wrapper.find('.step-title').text()).toContain('첫 단계')
    expect(wrapper.find('.step-desc').text()).toBe('첫 설명')
  })

  it('modelValue=false 면 overlay 미렌더', () => {
    const wrapper = mountModal({ modelValue: false })
    expect(wrapper.find('.guide-overlay').exists()).toBe(false)
  })

  it('tip 이 빈 step 은 step-tip 미렌더', async () => {
    const wrapper = mountModal()
    // step 3 (tip 없음) 으로 이동
    wrapper.vm.goTo(2)
    await flushPromises()
    expect(wrapper.find('.step-tip').exists()).toBe(false)
  })

  it('dots 개수 = steps 개수', () => {
    const wrapper = mountModal()
    expect(wrapper.findAll('.dot').length).toBe(3)
  })
})

describe('BaseGuideModal — 네비게이션', () => {
  it('다음 버튼 → 다음 step', async () => {
    const wrapper = mountModal()
    expect(wrapper.find('.step-title').text()).toContain('첫 단계')
    // 다음 버튼 (nav-btn--primary, isLast 아니므로 "다음")
    await wrapper.find('.nav-btn--primary').trigger('click')
    expect(wrapper.find('.step-title').text()).toContain('둘째 단계')
  })

  it('첫 step 에서 이전 버튼 disabled', () => {
    const wrapper = mountModal()
    const prevBtn = wrapper.find('.nav-btn--ghost')
    expect(prevBtn.attributes('disabled')).toBeDefined()
  })

  it('dot 클릭으로 해당 step 이동', async () => {
    const wrapper = mountModal()
    await wrapper.findAll('.dot')[2].trigger('click')
    expect(wrapper.find('.step-title').text()).toContain('셋째 단계')
  })

  it('마지막 step 이면 finish 버튼(finishLabel) 노출', async () => {
    const wrapper = mountModal({ finishLabel: '완료하기' })
    wrapper.vm.goTo(2)
    await flushPromises()
    // 마지막 step — primary 버튼이 finish (finishLabel)
    expect(wrapper.find('.nav-btn--primary').text()).toContain('완료하기')
  })
})

describe('BaseGuideModal — seen 저장 (계정당 최초 1회)', () => {
  it('모달이 열리면 즉시 seen 저장 (계정 스코프 키, 미로그인 = anon)', () => {
    mountModal()
    expect(localStorage.getItem('test_guide_seen::anon')).toBe('1')
  })

  it('로그인 사용자 — email 스코프 키로 저장', () => {
    localStorage.setItem('gayoje_user', JSON.stringify({ email: 'User@Example.com ' }))
    mountModal()
    expect(localStorage.getItem('test_guide_seen::user@example.com')).toBe('1')
    expect(localStorage.getItem('test_guide_seen::anon')).toBeNull()
  })

  it('modelValue=false 로 마운트하면 seen 저장 안 함 — 열릴 때만', async () => {
    const wrapper = mountModal({ modelValue: false })
    expect(localStorage.getItem('test_guide_seen::anon')).toBeNull()
    await wrapper.setProps({ modelValue: true })
    expect(localStorage.getItem('test_guide_seen::anon')).toBe('1')
  })

  it('finish 클릭 → finish emit + 닫기', async () => {
    const wrapper = mountModal()
    wrapper.vm.goTo(2)
    await flushPromises()
    await wrapper.find('.nav-btn--primary').trigger('click')

    expect(wrapper.emitted('finish')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('X 닫기 → 닫기 emit (어떤 닫기든 다음 자동표시 없음 — seen 은 열림 시 이미 저장)', async () => {
    const wrapper = mountModal()
    await wrapper.find('.guide-close').trigger('click')

    expect(localStorage.getItem('test_guide_seen::anon')).toBe('1')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('배경(overlay) 클릭 → 닫기 emit', async () => {
    const wrapper = mountModal()
    await wrapper.find('.guide-overlay').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })

  it('다시 안보기 링크는 제거됨 (자동표시가 1회뿐이라 무의미)', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.dismiss-link').exists()).toBe(false)
  })
})

describe('BaseGuideModal — illustration slot', () => {
  it('현재 step 의 illustration 키가 slotProps 로 전달됨', async () => {
    const seen = []
    const wrapper = mountModal({}, {
      illustration: (slotProps) => {
        seen.push(slotProps.illustration)
        return h('div', { class: `illust-${slotProps.illustration}` }, slotProps.illustration)
      },
    })
    // 첫 step → illustration 'a'
    expect(wrapper.find('.illust-a').exists()).toBe(true)
    // 다음 step → 'b'
    wrapper.vm.goTo(1)
    await flushPromises()
    expect(wrapper.find('.illust-b').exists()).toBe(true)
  })
})

describe('BaseGuideModal — finishIcon', () => {
  it('finishIcon prop 으로 커스텀 아이콘 렌더 (기본 Check 대체)', async () => {
    const CustomIcon = { name: 'CustomIcon', render: () => h('span', { class: 'custom-finish-icon' }) }
    const wrapper = mountModal({ finishIcon: CustomIcon })
    wrapper.vm.goTo(2)
    await flushPromises()
    expect(wrapper.find('.custom-finish-icon').exists()).toBe(true)
  })
})

describe('BaseGuideModal — 키보드 단축키', () => {
  it('ArrowRight → 다음, ArrowLeft → 이전, Escape → 닫기', async () => {
    const wrapper = mountModal()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await flushPromises()
    expect(wrapper.find('.step-title').text()).toContain('둘째 단계')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    expect(wrapper.find('.step-title').text()).toContain('첫 단계')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })

  it('모달 다시 열리면 첫 step 으로 리셋', async () => {
    const wrapper = mountModal({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    wrapper.vm.goTo(2)
    await flushPromises()
    // 닫았다 다시 열기
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.find('.step-title').text()).toContain('첫 단계')
  })
})
