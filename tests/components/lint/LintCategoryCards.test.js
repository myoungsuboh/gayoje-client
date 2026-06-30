/**
 * LintCategoryCards — 카테고리 카드 렌더 (2026-06: 기획 카테고리 추가로 4→5장).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'
import LintCategoryCards from '@/components/lint/LintCategoryCards.vue'

beforeEach(() => { i18n.global.locale.value = 'ko' })

const FIVE_CASES = [
  { id: 0, title: 'SPACK 준수율', convergence: 80 },
  { id: 1, title: 'DDD 준수율', convergence: 60 },
  { id: 2, title: 'Architecture 준수율', convergence: 100 },
  { id: 3, title: 'Rule Generator 준수율', convergence: 40 },
  { id: 4, title: '기획 항목 구현율', convergence: 50 },
]

const mountCards = (cases = FIVE_CASES, selectedIndex = 0) =>
  mount(LintCategoryCards, {
    props: { cases, selectedIndex },
    global: {
      plugins: [i18n],
      stubs: { GuideTooltip: true },
    },
  })

describe('LintCategoryCards', () => {
  it('5개 케이스(기획 포함)를 모두 카드로 렌더한다', () => {
    const wrapper = mountCards()
    const cards = wrapper.findAll('.case-card')
    expect(cards).toHaveLength(5)
    expect(wrapper.text()).toContain('기획 항목 구현율')
    expect(wrapper.text()).toContain('50%')
  })

  it('카드 클릭 시 select(id) emit — 5번째(기획) 카드 선택 가능', async () => {
    const wrapper = mountCards()
    await wrapper.findAll('.case-card')[4].trigger('click')
    expect(wrapper.emitted('select')[0]).toEqual([4])
  })

  it('legacy 4개 케이스도 그대로 렌더 (옛 캐시 호환)', () => {
    const wrapper = mountCards(FIVE_CASES.slice(0, 4))
    expect(wrapper.findAll('.case-card')).toHaveLength(4)
  })
})
