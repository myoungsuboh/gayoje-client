/**
 * NotionPageList.vue — Notion 가져오기 좌측 검색/리스트 (NotionImportDialog 에서 분리, 2026-05-27).
 *
 * notion store 를 mock 하여 렌더 + select emit + clearSearch(store.search) 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const vuetify = createVuetify({ components, directives })

const storeMock = vi.hoisted(() => ({
  results: [
    { id: 'p1', title: '페이지 1', last_edited_time: new Date().toISOString() },
    { id: 'p2', title: '페이지 2', last_edited_time: null },
  ],
  isSearching: false,
  isEmpty: false,
  searchError: null,
  selectedPageId: '',
  hasMore: true,
  isLoadingMore: false,
  search: vi.fn(),
  loadMore: vi.fn(),
}))

vi.mock('@/store/notion', () => ({
  useNotionStore: () => storeMock,
}))

vi.mock('@/utils/notion', () => ({
  notionErrorMessage: (code) => `err:${code}`,
}))

import NotionPageList from '@/components/plan/NotionPageList.vue'
import i18n from '@/plugins/i18n'

const mountList = (props = {}) =>
  mount(NotionPageList, {
    props: { active: true, ...props },
    global: { plugins: [vuetify] },
  })

beforeEach(() => {
  i18n.global.locale.value = 'ko'
  storeMock.search.mockClear()
  storeMock.loadMore.mockClear()
  storeMock.isSearching = false
  storeMock.searchError = null
  storeMock.results = [
    { id: 'p1', title: '페이지 1', last_edited_time: new Date().toISOString() },
    { id: 'p2', title: '페이지 2', last_edited_time: null },
  ]
})

describe('NotionPageList — 렌더 + 상호작용', () => {
  it('results 만큼 .notion-page-item 렌더', () => {
    const wrapper = mountList()
    expect(wrapper.findAll('.notion-page-item').length).toBe(2)
  })

  it('페이지 클릭 → select emit (page 객체)', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.notion-page-item')[0].trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0][0].id).toBe('p1')
  })

  it('검색어 입력 후 clear 버튼 → store.search("") 호출', async () => {
    const wrapper = mountList()
    const input = wrapper.find('.notion-search-input')
    await input.setValue('foo')
    // clear 버튼은 searchInput 있을 때만 렌더
    const clearBtn = wrapper.find('.notion-search-clear')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')
    expect(storeMock.search).toHaveBeenCalledWith('')
  })

  it('isSearching=true 면 검색 중 표시 + 리스트 미렌더', () => {
    storeMock.isSearching = true
    const wrapper = mountList()
    expect(wrapper.find('.notion-page-list').exists()).toBe(false)
    expect(wrapper.text()).toContain('검색 중')
  })
})
