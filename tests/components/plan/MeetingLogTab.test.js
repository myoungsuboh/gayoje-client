/**
 * MeetingLogTab.vue — 오케스트레이터 mount 테스트 (사이드바/배치/에디터 자식 통합).
 *
 * [범위] MeetingLogTab 이 직접 보유하는 상태/분기 + 자식 렌더 통합(full mount).
 *  1) currentStageLabel — queued / cps_running / prd_running / done 라벨 매핑
 *  2) isBatchRunning / isBatchActive — batch panel vs editor 분기
 *  3) isAnyProcessing — History 헤더 버튼 비활성화 (HistorySidebar 통합)
 *  4) 진행 알림 / 진행 카드 렌더 (MeetingLogEditor 통합)
 *
 * 에디터 내부 로직(isContentTooShort / isProcessingNewLog / save 검증)은
 * MeetingLogEditor.test.js, batch 상세 로직은 BatchPanel.test.js 에서 검증.
 *
 * [mock 정책]
 * - axios, store, snackbar, ?raw 샘플 로그: minimal mock.
 * - useUploadsStore: getter/method 만 stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { ref } from 'vue'

const vuetify = createVuetify({ components, directives })

const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(async () => ({ data: {} })),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  fetchUploads: vi.fn(),
}))

vi.mock('@/utils/axios', () => ({
  default: { post: mocks.axiosPost, get: vi.fn(async () => ({ data: {} })) },
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError }),
}))

vi.mock('@/store/harness', () => ({
  useHarnessStore: () => ({ projectName: 'proj_x' }),
  API_BASE: '',
}))

// MeetingLogEditor 가 AI 인터뷰 진입 전 토큰 한도를 보려고 Pinia usage store 를
// 쓴다. 이 테스트는 Pinia 를 깔지 않으므로 (harness 와 동일하게) mock 으로 대체.
vi.mock('@/store/usage', () => ({
  useUsageStore: () => ({
    refresh: vi.fn(async () => ({ success: true })),
    tokensPct: 0,
    tokensUsed: 0,
    tokensLimit: 100000,
    subscriptionType: 'free',
    resetAt: null,
  }),
}))

// [2026-06-12 보강 모드] 자식 InterviewDialog 가 의제(needs_input)를 autofix store 에서
// 직접 읽는다 — 이 테스트는 Pinia 를 깔지 않으므로 다른 store 처럼 module mock.
vi.mock('@/store/autofix', () => ({
  useAutofixStore: () => ({ needsInput: () => [] }),
}))

vi.mock('@/store/uploads', () => ({
  useUploadsStore: () => ({
    uploads: [],
    isEmpty: true,
    isFetching: false,
    fetchUploads: mocks.fetchUploads,
    addUpload: vi.fn(async () => ({ ok: true })),
    getUploadContent: vi.fn(async () => ({ ok: true, content: '' })),
    removeUpload: vi.fn(async () => ({ ok: true })),
  }),
}))

// ?raw imports — vitest 가 vite 와 동일 처리하지만 jsdom 안전을 위해 명시 stub.
// BatchPanel 이 로케일별 샘플(.en/.ja/.zh)도 import 하므로 모두 stub.
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.txt?raw', () => ({ default: 'sample 1' }))
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.en.txt?raw', () => ({ default: 'sample 1 en' }))
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.ja.txt?raw', () => ({ default: 'sample 1 ja' }))
vi.mock('../../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.zh.txt?raw', () => ({ default: 'sample 1 zh' }))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.txt?raw', () => ({ default: 'sample 2' }))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.en.txt?raw', () => ({ default: 'sample 2 en' }))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.ja.txt?raw', () => ({ default: 'sample 2 ja' }))
vi.mock('../../../샘플 미팅 로그/도서_대출_시스템_미팅_로그.zh.txt?raw', () => ({ default: 'sample 2 zh' }))

vi.mock('@/components/common/GuideTooltip.vue', () => ({
  default: { name: 'GuideTooltip', template: '<div class="guide-tooltip-stub"><slot/></div>' },
}))

import MeetingLogTab from '@/components/plan/MeetingLogTab.vue'
import i18n from '@/plugins/i18n'
import { saveMeetingDraft, loadMeetingDraft, hasMeetingDraft } from '@/utils/meetingDraft'

const mountTab = (props = {}) => {
  return mount(MeetingLogTab, {
    props: {
      meetingLogs: [],
      selectedLog: '',
      isLoading: false,
      projectName: 'proj_x',
      nextVersion: 'v1.1',
      batchState: { running: false, total: 0, current: 0, logs: [], error: null },
      currentJobStage: null,
      isSaving: false,
      ...props,
    },
    global: { plugins: [vuetify, i18n] },
  })
}

beforeEach(() => {
  i18n.global.locale.value = 'ko'
  Object.values(mocks).forEach(fn => fn.mockClear?.())
})

describe('MeetingLogTab — currentStageLabel 매핑', () => {
  it.each([
    ['queued', '대기 중'],
    // legacy 2-stage (BE 옛 _set_job_stage)
    ['cps_running', '핵심 정리 중 (1/2)'],
    ['prd_running', '기획서 만드는 중 (2/2)'],
    // [perf C] sub-stage — BE 가 pipeline 안에서 더 세밀히 기록
    ['cps_extract', '회의록 분석 중 (1/2 · 추출)'],
    ['cps_impact', '영향 범위 계산 중 (1/2 · 분석)'],
    ['cps_merge', 'CPS 통합 중 (1/2 · 병합)'],
    ['prd_extract', '기획서 초안 작성 중 (2/2 · 추출)'],
    ['prd_graph', '기획서 구조 분석 중 (2/2 · 분석)'],
    ['prd_merge', '기획서 통합 중 (2/2 · 병합)'],
    ['done', '마무리 중'],
  ])('currentJobStage=%s → "%s" 라벨', async (stage, expected) => {
    const wrapper = mountTab({ currentJobStage: stage })
    await flushPromises()
    expect(wrapper.vm.currentStageLabel).toBe(expected)
  })

  it('알 수 없는 stage 또는 null 이면 라벨 null', async () => {
    const wrapper = mountTab({ currentJobStage: null })
    expect(wrapper.vm.currentStageLabel).toBeNull()
  })
})

describe('MeetingLogTab — 진행 알림 렌더 (2026-05-27 onboard)', () => {
  // GitHub onboard 진입 시 회의록 탭은 isNewLogMode=true(빈 폼)인데, 이전 조건
  // `currentJobStage && !isNewLogMode` 라 진행 알림이 안 떴음. `!isBatchRunning`
  // 으로 바꿔 onboard(single job)에도 "분석 중" 표시되는지 회귀 가드.
  // 기존 로그 조회 모드(isNewLogMode=false)에서 job 진행 중이면 작은 진행 알림 행.
  // (신규 작성 모드는 큰 카드가 대체 — 아래 별도 describe 에서 검증.)
  it('조회 모드 + currentJobStage + batch 아님 → 작은 진행 알림(.saving-progress-row) 렌더', async () => {
    const wrapper = mountTab({
      currentJobStage: 'cps_extract',
      meetingLogs: [{ version: 'v1.0', meeting_content: 'x'.repeat(50) }],
      selectedLog: 'v1.0',
    })
    wrapper.vm.isNewLogMode = false  // 조회 모드 강제
    await flushPromises()
    expect(wrapper.find('.saving-progress-row').exists()).toBe(true)
    expect(wrapper.find('.saving-progress-label').text()).toContain('회의록 분석 중')
  })

  it('조회 모드 + currentJobStage 없으면 진행 알림 미렌더', async () => {
    const wrapper = mountTab({
      currentJobStage: null,
      meetingLogs: [{ version: 'v1.0', meeting_content: 'x'.repeat(50) }],
      selectedLog: 'v1.0',
    })
    wrapper.vm.isNewLogMode = false
    await flushPromises()
    expect(wrapper.find('.saving-progress-row').exists()).toBe(false)
  })

  it('batch 진행 중이면 진행 알림 미렌더 (batch UI 가 별도 표시)', async () => {
    const wrapper = mountTab({
      currentJobStage: 'cps_extract',
      meetingLogs: [{ version: 'v1.0', meeting_content: 'x'.repeat(50) }],
      selectedLog: 'v1.0',
      batchState: { running: true, total: 3, current: 1, logs: [], error: null },
    })
    wrapper.vm.isNewLogMode = false
    await flushPromises()
    expect(wrapper.find('.saving-progress-row').exists()).toBe(false)
  })
})

describe('MeetingLogTab — 신규 작성 모드 진행 중 폼 대체 (2026-05-27)', () => {
  // GitHub onboard 처럼 신규 작성 모드(isNewLogMode=true) + job 진행 중이면
  // 빈 입력 폼 대신 큰 진행 카드만 표시 (MeetingLogEditor 통합 렌더 확인).
  // isProcessingNewLog computed 단위 검증은 MeetingLogEditor.test.js 참고.
  const mountNewLogProcessing = async () => {
    const wrapper = mountTab({ currentJobStage: 'cps_extract' })
    // 신규 작성 모드 진입 (빈 폼 상태) — onboard 진입 시와 동일.
    wrapper.vm.isNewLogMode = true
    await flushPromises()
    return wrapper
  }

  it('진행 중이면 큰 진행 카드(.onboard-processing-card) 렌더', async () => {
    const wrapper = await mountNewLogProcessing()
    expect(wrapper.find('.onboard-processing-card').exists()).toBe(true)
    expect(wrapper.find('.onboard-processing-card__title').text()).toContain('회의록 분석 중')
  })

  it('진행 중이면 빈 입력 textarea 숨김 (큰 카드가 대체)', async () => {
    const wrapper = await mountNewLogProcessing()
    // VTextarea 의 premium-textarea 클래스가 사라짐
    expect(wrapper.find('.premium-textarea').exists()).toBe(false)
  })

  it('진행 중이면 작은 진행 알림(.saving-progress-row)은 중복 방지로 미렌더', async () => {
    const wrapper = await mountNewLogProcessing()
    expect(wrapper.find('.saving-progress-row').exists()).toBe(false)
  })

  it('진행 중이면 글자수 힌트(.char-count-hint) 숨김', async () => {
    const wrapper = await mountNewLogProcessing()
    expect(wrapper.find('.char-count-hint').exists()).toBe(false)
  })

  it('진행 중이면 CONSOLIDATED SUMMARY 헤더 숨김 (카드 제목이 대체)', async () => {
    const wrapper = await mountNewLogProcessing()
    expect(wrapper.text()).not.toContain('CONSOLIDATED SUMMARY')
  })

  it('job 없으면 신규 작성 폼(textarea) 정상 표시 + 카드 미렌더', async () => {
    const wrapper = mountTab({ currentJobStage: null })
    wrapper.vm.isNewLogMode = true
    await flushPromises()
    expect(wrapper.find('.onboard-processing-card').exists()).toBe(false)
    expect(wrapper.find('.premium-textarea').exists()).toBe(true)
  })
})

describe('MeetingLogTab — History 헤더 버튼 비활성화 (2026-05-27)', () => {
  // onboard/batch 진행 중엔 새 회의록 주 버튼 비활성화 (보조 액션은 메뉴 항목에서 비활성).
  it('currentJobStage 있으면 isAnyProcessing true + 주 버튼 disabled', async () => {
    const wrapper = mountTab({ currentJobStage: 'cps_extract' })
    await flushPromises()
    expect(wrapper.vm.isAnyProcessing).toBe(true)
    const primary = wrapper.find('.sidebar-header .history-primary-btn')
    expect(primary.exists()).toBe(true)
    expect(primary.attributes('disabled')).toBeDefined()
  })

  it('batch 진행 중에도 isAnyProcessing true', async () => {
    const wrapper = mountTab({
      batchState: { running: true, total: 3, current: 1, logs: [], error: null },
    })
    await flushPromises()
    expect(wrapper.vm.isAnyProcessing).toBe(true)
  })

  it('진행 없으면 isAnyProcessing false + 주 버튼 활성', async () => {
    const wrapper = mountTab({
      currentJobStage: null,
      meetingLogs: [{ version: 'v1.0', meeting_content: 'x'.repeat(50) }],
      selectedLog: 'v1.0',
    })
    wrapper.vm.isNewLogMode = false
    await flushPromises()
    expect(wrapper.vm.isAnyProcessing).toBe(false)
    // 활성 상태 — disabled 속성 없음
    const primary = wrapper.find('.sidebar-header .history-primary-btn')
    expect(primary.exists()).toBe(true)
    expect(primary.attributes('disabled')).toBeUndefined()
  })
})

describe('MeetingLogTab — 배치 상태 computed', () => {
  it('batchState.running=true 이면 isBatchRunning=true', async () => {
    const wrapper = mountTab({
      batchState: { running: true, total: 3, current: 1, logs: [], error: null },
    })
    expect(wrapper.vm.isBatchRunning).toBe(true)
  })

  it('batchState.total>0 이면 isBatchActive=true (batch panel vs editor 분기)', async () => {
    const wrapper = mountTab({
      batchState: { running: false, total: 2, current: 2, logs: [], error: null },
    })
    expect(wrapper.vm.isBatchActive).toBe(true)
  })
  // hasBackgroundFinishing / requestStopBatch 등 batch 상세 로직은 BatchPanel.vue 로
  // 분리됨 — tests/components/plan/BatchPanel.test.js 에서 검증.
})

// 입력 검증(isContentTooShort) 은 MeetingLogEditor.vue 로 분리됨 —
// tests/components/plan/MeetingLogEditor.test.js 에서 검증.
// requestStopBatch 중복 클릭 가드는 BatchPanel.vue 로 분리됨 —
// tests/components/plan/BatchPanel.test.js 에서 검증.

describe('MeetingLogTab — remoteBusy (2026-06 멀티디바이스 이중작업)', () => {
  it('remoteBusy=true → 사전 안내 배너 렌더 + 사이드바 버튼 비활성', () => {
    const wrapper = mountTab({ remoteBusy: true })
    expect(wrapper.find('.remote-busy-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('다른 기기 또는 탭에서')
    // isAnyProcessing 에 OR — HistorySidebar 가 작업 시작 버튼 비활성용으로 받음.
    const sidebar = wrapper.findComponent({ name: 'HistorySidebar' })
    expect(sidebar.props('isAnyProcessing')).toBe(true)
  })

  it('remoteBusy=false(기본) → 배너 없음 + 버튼 활성', () => {
    const wrapper = mountTab()
    expect(wrapper.find('.remote-busy-banner').exists()).toBe(false)
    const sidebar = wrapper.findComponent({ name: 'HistorySidebar' })
    expect(sidebar.props('isAnyProcessing')).toBe(false)
  })
})

describe('MeetingLogTab — 신규 작성 초안 보존/복원 (2026-06-22)', () => {
  // /plan → /profile → /plan 처럼 라우트 이동으로 컴포넌트가 unmount 됐다 다시
  // mount 돼도, 저장 안 한 신규 작성 내용(특히 AI 인터뷰 결과)이 사라지지 않게.
  beforeEach(() => { localStorage.clear() })

  it('저장 안 한 초안이 있으면(selectedLog=\'\') 마운트 시 신규 작성 모드로 복원', async () => {
    saveMeetingDraft('proj_x', '복원될 회의 초안')
    const wrapper = mountTab({
      meetingLogs: [{ version: 'v1.0', date: '2026-06-19', meeting_content: '기존 v1.0' }],
      selectedLog: '',  // plan.vue 가 초안 있으면 최신 로그 자동 선택을 건너뜀
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.element.value).toBe('복원될 회의 초안')
  })

  it('기존 로그 조회 중(selectedLog 지정)이면 초안을 복원하지 않음', async () => {
    saveMeetingDraft('proj_x', '안 보여야 할 초안')
    const wrapper = mountTab({
      meetingLogs: [{ version: 'v1.0', date: '2026-06-19', meeting_content: '기존 v1.0 내용' }],
      selectedLog: 'v1.0',
    })
    await flushPromises()
    // 조회 모드 → 마크다운 프리뷰 표시, 입력 textarea 없음.
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('.markdown-preview').exists()).toBe(true)
  })

  it('작성 중 unmount(페이지 이동) 시 초안이 localStorage 에 보존됨', async () => {
    const wrapper = mountTab({ meetingLogs: [], selectedLog: '' })  // 빈 프로젝트 → 신규 작성 모드
    await flushPromises()
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    await textarea.setValue('작성 중인 내용 — 잃으면 안 됨')
    wrapper.unmount()
    expect(loadMeetingDraft('proj_x')).toBe('작성 중인 내용 — 잃으면 안 됨')
  })

  it('이미 제출돼 처리 중(currentJobStage)이면 unmount 해도 초안으로 부활시키지 않음', async () => {
    const wrapper = mountTab({ meetingLogs: [], selectedLog: '', currentJobStage: 'cps_extract' })
    wrapper.vm.isNewLogMode = true
    wrapper.vm.editContent = '이미 제출된 내용'
    await flushPromises()
    wrapper.unmount()
    expect(hasMeetingDraft('proj_x')).toBe(false)
  })
})
