/**
 * PrdNodeEditor.vue — 검수 모드 PRD 그래프 노드 인라인 수정 (PrdTab 에서 분리, 2026-05-27).
 *
 * PrdTab.test.js 에서 옮겨온 노드 수정 로직 검증:
 *  - editable gate: editable=false 면 fetchGraphNodes(axios.get) noop, true 면 호출
 *  - saveEditNode: 빈/2KB 초과 summary 거부, 성공 시 axios.patch + emit('saved')
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import i18n from '@/plugins/i18n'

const vuetify = createVuetify({ components, directives })

// jsdom navigator.language 는 'en' → i18n 마이그레이션 후 한국어 단언이 깨지지 않도록 ko 고정.
beforeEach(() => { i18n.global.locale.value = 'ko' })

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  axiosGet: vi.fn(async () => ({ data: { nodes: [] } })),
  axiosPatch: vi.fn(async () => ({ data: {} })),
}))

vi.mock('@/utils/axios', () => ({
  default: { get: mocks.axiosGet, patch: mocks.axiosPatch },
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError }),
}))

import PrdNodeEditor from '@/components/plan/PrdNodeEditor.vue'

const mountEditor = (props = {}) =>
  mount(PrdNodeEditor, {
    props: { projectName: 'proj_x', editable: true, ...props },
    global: { plugins: [vuetify, i18n] },
  })

beforeEach(() => {
  Object.values(mocks).forEach(fn => fn.mockClear?.())
  mocks.axiosGet.mockImplementation(async () => ({ data: { nodes: [] } }))
  mocks.axiosPatch.mockImplementation(async () => ({ data: {} }))
})

describe('PrdNodeEditor — editable gate', () => {
  it('editable=false 면 mount 시 fetchGraphNodes(axios.get) 호출 안 함', async () => {
    mountEditor({ editable: false })
    await flushPromises()
    expect(mocks.axiosGet).not.toHaveBeenCalled()
  })

  it('editable=true 면 mount 시 /api/v2/prd/nodes 조회', async () => {
    mountEditor({ editable: true })
    await flushPromises()
    expect(mocks.axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/prd/nodes'),
      expect.objectContaining({ params: { project_name: 'proj_x' } }),
    )
  })

  it('projectName 없으면 조회 안 함', async () => {
    mountEditor({ editable: true, projectName: '' })
    await flushPromises()
    expect(mocks.axiosGet).not.toHaveBeenCalled()
  })
})

describe('PrdNodeEditor — saveEditNode 방어 케이스', () => {
  const fakeNode = { id: 'N1', label: 'Story-1', summary: 'old' }

  it('summary 2KB 초과면 거부 + axios.patch 미호출', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    const vm = wrapper.vm
    vm.startEditNode(fakeNode)
    vm.editingNodeSummary = 'x'.repeat(2001)
    await vm.saveEditNode(fakeNode)
    expect(mocks.showError).toHaveBeenCalledWith(expect.stringContaining('2KB'))
    expect(mocks.axiosPatch).not.toHaveBeenCalled()
  })

  it('빈 summary 면 거부 + axios.patch 미호출', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    const vm = wrapper.vm
    vm.startEditNode(fakeNode)
    vm.editingNodeSummary = '   '
    await vm.saveEditNode(fakeNode)
    expect(mocks.showError).toHaveBeenCalledWith(expect.stringContaining('비어'))
    expect(mocks.axiosPatch).not.toHaveBeenCalled()
  })

  it('정상 summary 면 axios.patch 호출 + saved emit', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    const vm = wrapper.vm
    vm.startEditNode(fakeNode)
    vm.editingNodeSummary = '수정된 요약 내용'
    await vm.saveEditNode(fakeNode)
    await flushPromises()
    expect(mocks.axiosPatch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/prd/nodes/N1'),
      expect.objectContaining({ project_name: 'proj_x', summary: '수정된 요약 내용' }),
    )
    expect(wrapper.emitted('saved')).toBeTruthy()
  })
})

describe('PrdNodeEditor — 편집 가드 신호(update:editing)', () => {
  const fakeNode = { id: 'N1', label: 'Story-1', summary: 'old' }
  const lastEditing = (wrapper) => {
    const ev = wrapper.emitted('update:editing')
    return ev ? ev[ev.length - 1][0] : undefined
  }

  it('mount 시 false, 노드 편집 시작하면 true, 취소하면 false', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    // immediate watch — 초기엔 편집 중 아님.
    expect(lastEditing(wrapper)).toBe(false)

    wrapper.vm.startEditNode(fakeNode)
    await flushPromises()
    expect(lastEditing(wrapper)).toBe(true)   // 부모 가드가 켜져야 함

    wrapper.vm.cancelEditNode()
    await flushPromises()
    expect(lastEditing(wrapper)).toBe(false)
  })

  it('저장 성공 시 편집 신호 해제(false)', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    wrapper.vm.startEditNode(fakeNode)
    await flushPromises()
    expect(lastEditing(wrapper)).toBe(true)

    wrapper.vm.editingNodeSummary = '수정된 요약'
    await wrapper.vm.saveEditNode(fakeNode)
    await flushPromises()
    expect(lastEditing(wrapper)).toBe(false)
  })

  it('편집 중 unmount 되면 명시적으로 false 방출(잔류 가드 방지)', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    wrapper.vm.startEditNode(fakeNode)
    await flushPromises()
    wrapper.unmount()
    expect(lastEditing(wrapper)).toBe(false)
  })
})
