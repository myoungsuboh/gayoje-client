/**
 * LintStatsCards — 커버리지 정직화 표시 (2026-06: 점수 카드 부분검사 칩).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'
import LintStatsCards from '@/components/lint/LintStatsCards.vue'

beforeEach(() => { i18n.global.locale.value = 'ko' })

const mountCards = (stats) =>
  mount(LintStatsCards, {
    props: { stats },
    global: { plugins: [i18n], stubs: { GuideTooltip: true } },
  })

describe('LintStatsCards — 부분 검사 표시', () => {
  it('샘플 잘림이면 점수 카드에 부분검사 칩 + 경고 배너', () => {
    const wrapper = mountCards({
      score: 87, totalCodeFiles: 200, sampledFiles: 40,
      coverageTruncated: true, rulesChecked: 30, violations: 4,
    })
    const chip = wrapper.find('.stat-partial-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('부분 검사 20%')   // 40/200
    expect(wrapper.find('.meaning-banner--warn').exists()).toBe(true)
    // 파일 카드: sampled / total
    expect(wrapper.text()).toContain('40')
    expect(wrapper.text()).toContain('200')
  })

  it('전수 검사면 칩·경고 배너 없음', () => {
    const wrapper = mountCards({
      score: 87, totalCodeFiles: 30, sampledFiles: 30,
      coverageTruncated: false, rulesChecked: 30, violations: 4,
    })
    expect(wrapper.find('.stat-partial-chip').exists()).toBe(false)
    expect(wrapper.find('.meaning-banner--warn').exists()).toBe(false)
  })

  it('legacy 응답(커버리지 필드 없음)은 잘림으로 취급하지 않는다', () => {
    const wrapper = mountCards({
      score: 50, scannedFiles: 12, rulesChecked: 10, violations: 5,
    })
    expect(wrapper.find('.stat-partial-chip').exists()).toBe(false)
  })
})
