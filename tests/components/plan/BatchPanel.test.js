/**
 * BatchPanel.vue — 샘플 순차 처리 패널 (MeetingLogTab 에서 분리, 2026-05-27).
 *
 * MeetingLogTab.test.js 에서 옮겨온 batch 로직 검증 + 분리 후 props/emits 계약.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const vuetify = createVuetify({ components, directives })

const mocks = vi.hoisted(() => ({
  fetchUploads: vi.fn(),
  addUpload: vi.fn(async () => ({ success: true })),
  getUploadContent: vi.fn(async () => ({ success: true, content: '' })),
  removeUpload: vi.fn(async () => ({ success: true })),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  confirm: vi.fn(async () => true),
}))

vi.mock('@/store/uploads', () => ({
  useUploadsStore: () => ({
    uploads: [],
    isEmpty: true,
    isFetching: false,
    fetchUploads: mocks.fetchUploads,
    addUpload: mocks.addUpload,
    getUploadContent: mocks.getUploadContent,
    removeUpload: mocks.removeUpload,
  }),
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError }),
}))

// [2026-06] requestStopBatch 가 window.confirm → 전역 ConfirmDialog(useConfirm) 로 전환됨.
vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/components/common/GuideTooltip.vue', () => ({
  default: { name: 'GuideTooltip', template: '<span class="guide-tooltip-stub"/>' },
}))

// raw 미팅 로그 import — 파싱 테스트용 (V 구분자 포함). 로케일별 파일 모두 mock.
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.txt?raw', () => ({
  default: '### [미팅 로그 V1] - 첫 회의\n내용1\n---\n### [미팅 로그 V2] - 둘째 회의\n내용2',
}))
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.en.txt?raw', () => ({
  default: '### [Meeting Log V1] - First\nbody1\n---\n### [Meeting Log V2] - Second\nbody2',
}))
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.ja.txt?raw', () => ({
  default: '### [ミーティングログ V1] - 初回\n本文1\n---\n### [ミーティングログ V2] - 二回目\n本文2',
}))
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.zh.txt?raw', () => ({
  default: '### [会议记录 V1] - 首次\n正文1\n---\n### [会议记录 V2] - 第二次\n正文2',
}))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.txt?raw', () => ({ default: '### [미팅 로그 V1] - 도서\n내용' }))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.en.txt?raw', () => ({ default: '### [Meeting Log V1] - Library\nbody' }))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.ja.txt?raw', () => ({ default: '### [ミーティングログ V1] - 図書\n本文' }))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.zh.txt?raw', () => ({ default: '### [会议记录 V1] - 图书\n正文' }))

import BatchPanel from '@/components/plan/BatchPanel.vue'
import i18n from '@/plugins/i18n'

const mountPanel = (props = {}) =>
  mount(BatchPanel, {
    props: {
      batchState: { running: false, total: 0, current: 0, logs: [], error: null },
      meetingLogs: [],
      currentStageLabel: null,
      ...props,
    },
    global: { plugins: [vuetify] },
  })

beforeEach(() => {
  i18n.global.locale.value = 'ko'
  Object.values(mocks).forEach(fn => fn.mockClear?.())
})

describe('BatchPanel — 마운트 + 기본 렌더', () => {
  it('mount 시 uploadsStore.fetchUploads 1회 호출 (패널 열림 = mount)', () => {
    mountPanel()
    expect(mocks.fetchUploads).toHaveBeenCalledTimes(1)
  })

  it('batch 미활성 시 샘플 선택 UI(.sample-btn) 렌더', () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('.sample-btn').length).toBeGreaterThanOrEqual(3)
  })

  it('batch 진행 중이면 진행 바(.batch-progress-bar) 렌더', () => {
    const wrapper = mountPanel({
      batchState: { running: true, total: 3, current: 1, logs: [{ status: 'running' }], error: null },
    })
    expect(wrapper.find('.batch-progress-bar').exists()).toBe(true)
  })
})

describe('BatchPanel — isBatchActive / batchDoneCount', () => {
  it('total>0 이면 isBatchActive=true', () => {
    const wrapper = mountPanel({ batchState: { running: false, total: 2, logs: [], error: null } })
    expect(wrapper.vm.isBatchActive).toBe(true)
  })

  it('batchDoneCount = done 상태 로그 수', () => {
    const wrapper = mountPanel({
      batchState: { running: false, total: 3, logs: [{ status: 'done' }, { status: 'done' }, { status: 'pending' }], error: null },
    })
    expect(wrapper.vm.batchDoneCount).toBe(2)
  })
})

describe('BatchPanel — hasBackgroundFinishing', () => {
  it('cancelled=true + running 로그 있으면 true', () => {
    const wrapper = mountPanel({
      batchState: { running: false, cancelled: true, total: 3, logs: [{ status: 'done' }, { status: 'running' }], error: null },
    })
    expect(wrapper.vm.hasBackgroundFinishing).toBe(true)
  })

  it('cancelled=false 면 running 있어도 false', () => {
    const wrapper = mountPanel({
      batchState: { running: true, cancelled: false, logs: [{ status: 'running' }], error: null },
    })
    expect(wrapper.vm.hasBackgroundFinishing).toBe(false)
  })
})

describe('BatchPanel — requestStopBatch 중복 클릭 가드', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('running=false 면 emit 안 함', () => {
    const wrapper = mountPanel({ batchState: { running: false, logs: [], error: null } })
    wrapper.vm.requestStopBatch()
    expect(wrapper.emitted('stop-batch')).toBeFalsy()
  })

  it('cancelRequested=true 면 중복 emit 안 함', () => {
    const wrapper = mountPanel({ batchState: { running: true, cancelRequested: true, logs: [], error: null } })
    wrapper.vm.requestStopBatch()
    expect(wrapper.emitted('stop-batch')).toBeFalsy()
  })

  it('정상 조건이면 stop-batch emit', async () => {
    const wrapper = mountPanel({ batchState: { running: true, logs: [], error: null } })
    await wrapper.vm.requestStopBatch()
    expect(wrapper.emitted('stop-batch')).toBeTruthy()
    expect(wrapper.emitted('stop-batch')).toHaveLength(1)
  })

  it('confirm 거절하면 emit 안 함', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    const wrapper = mountPanel({ batchState: { running: true, logs: [], error: null } })
    await wrapper.vm.requestStopBatch()
    expect(wrapper.emitted('stop-batch')).toBeFalsy()
  })
})

describe('BatchPanel — 샘플 파싱 + 선택 + startBatch', () => {
  it('selectSample → parseLogEntries 로 V 구분 파싱 (2건)', async () => {
    const wrapper = mountPanel()
    // 첫 샘플 클릭 (회의실 예약 시스템 — mock 에 V1/V2 2건)
    await wrapper.findAll('.sample-btn')[0].trigger('click')
    await flushPromises()
    expect(wrapper.vm.parsedLogs.length).toBe(2)
    expect(wrapper.vm.parsedLogs[0].version).toBe('V1')
    expect(wrapper.vm.selectedCount).toBe(2)  // 기본 전체 선택
  })

  it('startBatch → 선택된 entries 로 batch emit', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.sample-btn')[0].trigger('click')
    await flushPromises()
    wrapper.vm.startBatch()
    expect(wrapper.emitted('batch')).toBeTruthy()
    expect(wrapper.emitted('batch')[0][0]).toHaveLength(2)
  })

  it('locale=en → 영어 샘플 본문 파싱 (영어 제목 추출)', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = mountPanel()
    await wrapper.findAll('.sample-btn')[0].trigger('click')
    await flushPromises()
    expect(wrapper.vm.parsedLogs.length).toBe(2)
    expect(wrapper.vm.parsedLogs[0].title).toBe('First')   // en mock 의 제목
    i18n.global.locale.value = 'ko'
  })

  it('샘플 버튼 라벨이 locale 따라 번역됨 (en)', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = mountPanel()
    const labels = wrapper.findAll('.sample-btn').map(b => b.text())
    expect(labels).toContain('Meeting Room Booking')
    expect(labels).toContain('Library Book Lending')
    i18n.global.locale.value = 'ko'
  })

  it('toggleAll → 전체 해제 시 selectedCount 0', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.sample-btn')[0].trigger('click')
    await flushPromises()
    wrapper.vm.toggleAll()  // 전체 선택 상태 → 해제
    expect(wrapper.vm.selectedCount).toBe(0)
  })

  it('existingVersionSet — meetingLogs 의 version 으로 "덮어씀" 판정', async () => {
    const wrapper = mountPanel({ meetingLogs: [{ version: 'V1' }] })
    await wrapper.findAll('.sample-btn')[0].trigger('click')
    await flushPromises()
    expect(wrapper.vm.existingVersionSet.has('V1')).toBe(true)
    expect(wrapper.vm.existingVersionSet.has('V2')).toBe(false)
  })
})

describe('BatchPanel — close / reset', () => {
  it('onClose → reset-batch + close emit', () => {
    const wrapper = mountPanel()
    wrapper.vm.onClose()
    expect(wrapper.emitted('reset-batch')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
