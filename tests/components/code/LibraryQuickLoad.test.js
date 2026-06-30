/**
 * LibraryQuickLoad.vue — MY LIBRARY quick-load chips (2026-06-12 삭제 버튼 추가).
 *
 * 검증:
 *  - repos 만큼 chip 렌더 + 라벨(label 없으면 owner/name)
 *  - 본문 클릭 = select(url), × 클릭 = remove(repo) (서로 안 섞임 — @click.stop)
 *  - disabled 면 두 버튼 모두 비활성
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'
import LibraryQuickLoad from '@/components/code/LibraryQuickLoad.vue'

const repos = [
  { url: 'https://github.com/me/repo-a', label: '레포 A' },
  { url: 'https://github.com/me/repo-b' },  // label 없음 → owner/name
]

const mountIt = (props = {}) =>
  mount(LibraryQuickLoad, {
    props: { repos, disabled: false, ...props },
    global: { plugins: [i18n] },
  })

describe('LibraryQuickLoad — 삭제 버튼', () => {
  it('repos 만큼 chip 렌더 + 라벨 fallback', () => {
    const w = mountIt()
    const chips = w.findAll('.lib-chip')
    expect(chips.length).toBe(2)
    expect(chips[0].find('.lib-chip__main').text()).toBe('레포 A')
    expect(chips[1].find('.lib-chip__main').text()).toBe('me / repo-b')
  })

  it('본문 클릭 → select(url) emit (remove 아님)', async () => {
    const w = mountIt()
    await w.findAll('.lib-chip__main')[0].trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['https://github.com/me/repo-a'])
    expect(w.emitted('remove')).toBeFalsy()
  })

  it('× 클릭 → remove(repo) emit (select 아님 — @click.stop)', async () => {
    const w = mountIt()
    await w.findAll('.lib-chip__del')[1].trigger('click')
    expect(w.emitted('remove')?.[0]).toEqual([repos[1]])
    expect(w.emitted('select')).toBeFalsy()
  })

  it('disabled 면 본문/× 모두 비활성', () => {
    const w = mountIt({ disabled: true })
    expect(w.find('.lib-chip__main').attributes('disabled')).toBeDefined()
    expect(w.find('.lib-chip__del').attributes('disabled')).toBeDefined()
  })

  it('repos 비면 아무것도 렌더 안 함', () => {
    const w = mountIt({ repos: [] })
    expect(w.find('.library-row').exists()).toBe(false)
  })
})
