import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import i18n from '@/plugins/i18n'

vi.mock('@/utils/notion', () => ({
  exportToNotionApi: vi.fn(),
  notionErrorMessage: vi.fn(() => null),
}))
vi.mock('@/store/notion', () => ({
  useNotionStore: () => ({ search: vi.fn(), reset: vi.fn() }),
}))
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('vuetify', () => ({ useDisplay: () => ({ xs: false }) }))

import { exportToNotionApi } from '@/utils/notion'
import NotionExportDialog from '@/components/plan/NotionExportDialog.vue'

const mountDialog = (props = {}) =>
  mount(NotionExportDialog, {
    props: { modelValue: true, projectName: 'proj', ...props },
    global: {
      plugins: [createPinia(), i18n],
      stubs: {
        NotionPageList: { name: 'NotionPageList', template: '<div class="stub-picker" />' },
        VDialog: { template: '<div><slot /></div>' },
      },
    },
  })

describe('NotionExportDialog', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'ko'
    vi.clearAllMocks()
  })

  it('문서 체크박스 3개 렌더', () => {
    const w = mountDialog()
    expect(w.findAll('input[type="checkbox"]').length).toBe(3)
  })

  it('docs prop 으로 초기 선택 (cps 1개)', () => {
    const w = mountDialog({ docs: ['cps'] })
    const checked = w.findAll('input[type="checkbox"]').filter((c) => c.element.checked)
    expect(checked.length).toBe(1)
  })

  it('공유 클릭 → 선택 문서로 exportToNotionApi 호출', async () => {
    exportToNotionApi.mockResolvedValueOnce({
      success: true, hub_url: 'u/H', results: [{ doc: 'cps', status: 'updated', url: 'u/c' }],
    })
    const w = mountDialog({ docs: ['cps'] })
    await w.find('.nxe-primary').trigger('click')
    await flushPromises()
    expect(exportToNotionApi).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'proj', docs: ['cps'] }),
    )
  })

  it('need_parent 결과면 picker(NotionPageList) 노출', async () => {
    exportToNotionApi.mockResolvedValueOnce({
      success: true, hub_url: null, results: [{ doc: 'cps', status: 'need_parent' }],
    })
    const w = mountDialog({ docs: ['cps'] })
    await w.find('.nxe-primary').trigger('click')
    await flushPromises()
    expect(w.find('.stub-picker').exists()).toBe(true)
  })

  it('성공 시 허브 "Notion 에서 열기" 링크 표시', async () => {
    exportToNotionApi.mockResolvedValueOnce({
      success: true, hub_url: 'https://www.notion.so/H', results: [{ doc: 'cps', status: 'updated' }],
    })
    const w = mountDialog({ docs: ['cps'] })
    await w.find('.nxe-primary').trigger('click')
    await flushPromises()
    const link = w.find('a.nxe-primary--link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://www.notion.so/H')
  })

  it('picker 에서 페이지 선택 → parent_page_id 와 함께 재호출', async () => {
    exportToNotionApi
      .mockResolvedValueOnce({ success: true, hub_url: null, results: [{ doc: 'cps', status: 'need_parent' }] })
      .mockResolvedValueOnce({ success: true, hub_url: 'u/H', results: [{ doc: 'cps', status: 'created' }] })
    const w = mountDialog({ docs: ['cps'] })
    await w.find('.nxe-primary').trigger('click')
    await flushPromises()
    // picker stub 에서 select 이벤트 발생
    w.findComponent({ name: 'NotionPageList' }).vm.$emit('select', { id: 'PAGE1' })
    await flushPromises()
    expect(exportToNotionApi).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentPageId: 'PAGE1' }),
    )
  })
})
