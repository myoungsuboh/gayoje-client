/**
 * LintRunPanel.vue — MY LIBRARY chip 삭제 버튼 (2026-06-12).
 *
 * 검증: 본문 클릭 = apply-preset(url), × 클릭 = remove-library(repo) (안 섞임).
 * (run/goto-code 등 기존 동작은 페이지 통합에서 커버 — 여기선 신규 삭제 UI 만.)
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'

vi.mock('@/components/common/GuideTooltip.vue', () => ({
  default: { name: 'GuideTooltip', template: '<span class="guide-tooltip-stub"/>' },
}))

import LintRunPanel from '@/components/lint/LintRunPanel.vue'

const repos = [
  { url: 'https://github.com/me/repo-a', label: '레포 A' },
  { url: 'https://github.com/me/repo-b' },
]

const mountIt = (props = {}) =>
  mount(LintRunPanel, {
    props: { libraryRepos: repos, libraryIsEmpty: false, ...props },
    global: { plugins: [i18n] },
  })

describe('LintRunPanel — MY LIBRARY 삭제 버튼', () => {
  it('chip 렌더 + 라벨 fallback', () => {
    const w = mountIt()
    const chips = w.findAll('.lib-chip')
    expect(chips.length).toBe(2)
    expect(chips[1].find('.lib-chip__main').text()).toBe('me / repo-b')
  })

  it('본문 클릭 → apply-preset(url) (remove-library 아님)', async () => {
    const w = mountIt()
    await w.findAll('.lib-chip__main')[0].trigger('click')
    expect(w.emitted('apply-preset')?.[0]).toEqual(['https://github.com/me/repo-a'])
    expect(w.emitted('remove-library')).toBeFalsy()
  })

  it('× 클릭 → remove-library(repo) (apply-preset 아님 — @click.stop)', async () => {
    const w = mountIt()
    await w.findAll('.lib-chip__del')[1].trigger('click')
    expect(w.emitted('remove-library')?.[0]).toEqual([repos[1]])
    expect(w.emitted('apply-preset')).toBeFalsy()
  })

  it('libraryIsEmpty=true 면 라이브러리 행 숨김', () => {
    const w = mountIt({ libraryIsEmpty: true })
    expect(w.find('.lib-chip').exists()).toBe(false)
  })

  it('isLinting 이면 chip 버튼 비활성', () => {
    const w = mountIt({ isLinting: true })
    expect(w.find('.lib-chip__main').attributes('disabled')).toBeDefined()
    expect(w.find('.lib-chip__del').attributes('disabled')).toBeDefined()
  })
})
