/**
 * MeetingLogEditor.vue — 미팅 로그 본문 에디터 (MeetingLogTab 에서 분리, 2026-05-27).
 *
 * editContent/isNewLogMode 는 부모 소유(v-model) — 테스트에선 prop 으로 주입.
 * 검증: isContentTooShort / isProcessingNewLog computed, 진행 카드·알림 렌더,
 * save 검증(최소 글자수) + save/delete/start-new-log emit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'

// [2026-06-12] 인터뷰 자동 오픈 신호가 모듈 싱글톤이라, 이전 테스트의 mounted
// wrapper 가 살아 있으면 그 watcher 가 신호를 먼저 소비한다 — 테스트마다 unmount.
enableAutoUnmount(afterEach)
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const vuetify = createVuetify({ components, directives })

// jsdom 엔 ResizeObserver 없음 — VProgressCircular(로딩 스켈레톤)용 stub.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const USAGE_DEFAULTS = {
  tokensUsed: 0, tokensLimit: 100000, subscriptionType: 'free',
  isTokenBlocked: false, liteEnabled: false, liteDailyUsed: 0, liteDailyCap: 0,
}
const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(async () => ({ data: {} })),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  usageRefresh: vi.fn(async () => ({ success: true })),
  transcribeLargeAudio: vi.fn(),
  AudioChunkError: class AudioChunkError extends Error {
    constructor(code, meta = {}) { super(code); this.name = 'AudioChunkError'; this.code = code; this.meta = meta }
  },
  // usage store 값 — 테스트가 mount 후에도 바꿀 수 있도록 getter 로 노출 (쿼터 경고 검증).
  usageVals: {
    tokensUsed: 0, tokensLimit: 100000, subscriptionType: 'free',
    isTokenBlocked: false, liteEnabled: false, liteDailyUsed: 0, liteDailyCap: 0,
  },
  // [2026-06-10] Discard/양식 덮어쓰기 확인 — 전역 ConfirmDialog. 기본 '확인' 응답.
  confirm: vi.fn(async () => true),
}))

vi.mock('@/utils/axios', () => ({
  default: { post: mocks.axiosPost, get: vi.fn(async () => ({ data: {} })) },
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showWarning: mocks.showWarning,
  }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/store/harness', () => ({
  useHarnessStore: () => ({ projectName: 'proj_x' }),
  API_BASE: '',
}))

// 긴 회의 청킹 — Web Audio 가 jsdom 에 없어 모듈 자체를 mock (오케스트레이터는 별도 단위테스트).
vi.mock('@/utils/audioChunk', () => ({
  transcribeLargeAudio: mocks.transcribeLargeAudio,
  decodeAudioToMono: vi.fn(),
  AudioChunkError: mocks.AudioChunkError,
}))

// MeetingLogEditor 가 AI 인터뷰 진입 전 토큰 한도를 보려고 Pinia usage store 를
// 쓴다. 이 테스트는 Pinia 를 깔지 않으므로 (harness 와 동일하게) mock 으로 대체.
vi.mock('@/store/usage', () => ({
  // getter 로 mocks.usageVals 를 live 참조 — 테스트가 mount 후 값을 바꿔 쿼터 경고를 검증.
  useUsageStore: () => ({
    refresh: mocks.usageRefresh,
    tokensPct: 0,
    resetAt: null,
    liteDailyResetAt: null,
    get tokensUsed() { return mocks.usageVals.tokensUsed },
    get tokensLimit() { return mocks.usageVals.tokensLimit },
    get subscriptionType() { return mocks.usageVals.subscriptionType },
    get isTokenBlocked() { return mocks.usageVals.isTokenBlocked },
    get liteEnabled() { return mocks.usageVals.liteEnabled },
    get liteDailyUsed() { return mocks.usageVals.liteDailyUsed },
    get liteDailyCap() { return mocks.usageVals.liteDailyCap },
  }),
}))

// [2026-06-12 보강 모드] 자식 InterviewDialog 가 의제(needs_input)를 autofix store 에서
// 직접 읽는다 — 이 테스트는 Pinia 를 깔지 않으므로 다른 store 처럼 module mock.
vi.mock('@/store/autofix', () => ({
  useAutofixStore: () => ({ needsInput: () => [] }),
}))

vi.mock('@/utils/markdown', () => ({
  md: { render: (s) => `<p>${s}</p>` },
}))

vi.mock('@/components/common/GuideTooltip.vue', () => ({
  default: { name: 'GuideTooltip', template: '<span class="guide-tooltip-stub"/>' },
}))

import MeetingLogEditor from '@/components/plan/MeetingLogEditor.vue'
import { requestInterviewOpen, consumeInterviewOpen } from '@/composables/useInterviewEntry'

const mountEditor = (props = {}) =>
  mount(MeetingLogEditor, {
    props: {
      editContent: '',
      isNewLogMode: false,
      currentLog: null,
      nextVersion: 'v1.1',
      isLoading: false,
      isSaving: false,
      currentJobStage: null,
      isBatchRunning: false,
      currentStageLabel: null,
      ...props,
    },
    global: { plugins: [vuetify] },
  })

beforeEach(() => {
  Object.values(mocks).forEach(fn => fn.mockClear?.())
  Object.assign(mocks.usageVals, USAGE_DEFAULTS)  // 등급/토큰 값 기본으로 리셋
})

describe('MeetingLogEditor — isContentTooShort (MIN 200자)', () => {
  it('199자면 isContentTooShort=true', () => {
    const wrapper = mountEditor({ editContent: 'a'.repeat(199), isNewLogMode: true })
    expect(wrapper.vm.isContentTooShort).toBe(true)
  })

  it('200자면 isContentTooShort=false', () => {
    const wrapper = mountEditor({ editContent: 'a'.repeat(200), isNewLogMode: true })
    expect(wrapper.vm.isContentTooShort).toBe(false)
  })

  it('공백 제외 200자 이상이어야 통과 (whitespace 무시)', () => {
    const wrapper = mountEditor({ editContent: 'a'.repeat(200) + '   \n\t  '.repeat(20), isNewLogMode: true })
    expect(wrapper.vm.isContentTooShort).toBe(false)
  })

  // [2026-06-10 UX] 카운터 색: 입력 전 중립 → 미달 경고(남은 글자 안내) → 충족 ok.
  it('입력 전(0자) 카운터는 중립색 + 최소 글자 안내', () => {
    const wrapper = mountEditor({ editContent: '', isNewLogMode: true })
    expect(wrapper.find('.char-count-neutral').exists()).toBe(true)
    expect(wrapper.find('.char-count-warn').exists()).toBe(false)
    expect(wrapper.find('.char-count-guide--neutral').exists()).toBe(true)
  })

  it('입력 중 미달이면 경고색 + 남은 글자수 안내', () => {
    const wrapper = mountEditor({ editContent: 'a'.repeat(120), isNewLogMode: true })
    expect(wrapper.find('.char-count-warn').exists()).toBe(true)
    expect(wrapper.find('.char-count-guide').text()).toContain('80')
  })

  it('충족하면 ok 색 + 안내 숨김', () => {
    const wrapper = mountEditor({ editContent: 'a'.repeat(200), isNewLogMode: true })
    expect(wrapper.find('.char-count-ok').exists()).toBe(true)
    expect(wrapper.find('.char-count-guide').exists()).toBe(false)
  })
})

describe('MeetingLogEditor — isProcessingNewLog / 폼 대체', () => {
  const processingProps = { isNewLogMode: true, currentJobStage: 'cps_extract', isBatchRunning: false }

  it('신규 모드 + job + batch 아님 → isProcessingNewLog true', () => {
    const wrapper = mountEditor(processingProps)
    expect(wrapper.vm.isProcessingNewLog).toBe(true)
  })

  it('진행 중이면 큰 진행 카드(.onboard-processing-card) 렌더', () => {
    const wrapper = mountEditor({ ...processingProps, currentStageLabel: '회의록 분석 중 (1/2 · 추출)' })
    expect(wrapper.find('.onboard-processing-card').exists()).toBe(true)
    expect(wrapper.find('.onboard-processing-card__title').text()).toContain('회의록 분석 중')
  })

  it('진행 중이면 textarea / 글자수 / CONSOLIDATED SUMMARY 숨김', () => {
    const wrapper = mountEditor(processingProps)
    expect(wrapper.find('.premium-textarea').exists()).toBe(false)
    expect(wrapper.find('.char-count-hint').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('CONSOLIDATED SUMMARY')
  })

  it('진행 중이면 작은 진행 알림(.saving-progress-row)은 중복 방지로 미렌더', () => {
    const wrapper = mountEditor(processingProps)
    expect(wrapper.find('.saving-progress-row').exists()).toBe(false)
  })

  it('job 없으면 isProcessingNewLog false + textarea 표시', () => {
    const wrapper = mountEditor({ isNewLogMode: true, currentJobStage: null })
    expect(wrapper.vm.isProcessingNewLog).toBe(false)
    expect(wrapper.find('.onboard-processing-card').exists()).toBe(false)
    expect(wrapper.find('.premium-textarea').exists()).toBe(true)
  })

  it('batch 진행 중이면 isProcessingNewLog false (batch UI 가 별도)', () => {
    const wrapper = mountEditor({ isNewLogMode: true, currentJobStage: 'cps_extract', isBatchRunning: true })
    expect(wrapper.vm.isProcessingNewLog).toBe(false)
  })
})

describe('MeetingLogEditor — 조회 모드 진행 알림', () => {
  it('조회 모드 + currentJobStage + batch 아님 → .saving-progress-row 렌더', () => {
    const wrapper = mountEditor({
      isNewLogMode: false,
      currentLog: { version: 'v1.0', date: '2026-05-27', meeting_content: 'x'.repeat(50) },
      currentJobStage: 'cps_extract',
      currentStageLabel: '회의록 분석 중 (1/2 · 추출)',
    })
    expect(wrapper.find('.saving-progress-row').exists()).toBe(true)
    expect(wrapper.find('.saving-progress-label').text()).toContain('회의록 분석 중')
  })

  it('조회 모드 + currentJobStage 없으면 진행 알림 미렌더', () => {
    const wrapper = mountEditor({
      isNewLogMode: false,
      currentLog: { version: 'v1.0', meeting_content: 'x'.repeat(50) },
      currentJobStage: null,
    })
    expect(wrapper.find('.saving-progress-row').exists()).toBe(false)
  })
})

describe('MeetingLogEditor — save / delete / start-new-log emit', () => {
  it('신규 모드 + 200자 이상 → Confirm & Archive 클릭 시 save emit', async () => {
    const wrapper = mountEditor({ isNewLogMode: true, editContent: 'a'.repeat(200) })
    await wrapper.find('.archive-btn').trigger('click')
    expect(wrapper.emitted('save')).toBeTruthy()
    expect(wrapper.emitted('save')[0]).toEqual(['a'.repeat(200)])
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  // [2026-06-10 UX] 미달 시 '눌렀다가 에러' 대신 버튼 자체를 disabled + 이유 title.
  it('200자 미만이면 저장 버튼 disabled (save emit 불가)', async () => {
    const wrapper = mountEditor({ isNewLogMode: true, editContent: 'a'.repeat(50) })
    const btn = wrapper.find('.archive-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.attributes('title')).toBeTruthy()
    await btn.trigger('click')
    expect(wrapper.emitted('save')).toBeFalsy()
  })

  it('조회 모드 + currentLog → Delete 클릭 시 delete emit (version)', async () => {
    const wrapper = mountEditor({
      isNewLogMode: false,
      currentLog: { version: 'v1.0', meeting_content: 'x'.repeat(50) },
    })
    await wrapper.find('.delete-btn').trigger('click')
    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('delete')[0]).toEqual(['v1.0'])
  })

  // [2026-06-10 UX] Discard 는 작성 내용이 있으면 ConfirmDialog 확인 후 닫는다.
  it('Discard 클릭(내용 있음) → confirm 후 update:isNewLogMode false + 내용 비움', async () => {
    mocks.confirm.mockResolvedValueOnce(true)
    const wrapper = mountEditor({ isNewLogMode: true, editContent: 'abc' })
    await wrapper.find('.discard-btn').trigger('click')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:isNewLogMode')).toBeTruthy()
    expect(wrapper.emitted('update:isNewLogMode').at(-1)).toEqual([false])
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual([''])
  })

  it('Discard 확인 취소 → 모드/내용 유지', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    const wrapper = mountEditor({ isNewLogMode: true, editContent: 'abc' })
    await wrapper.find('.discard-btn').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:isNewLogMode')).toBeFalsy()
  })

  it('Discard 클릭(빈 초안) → 확인 없이 바로 닫힘', async () => {
    const wrapper = mountEditor({ isNewLogMode: true, editContent: '   ' })
    await wrapper.find('.discard-btn').trigger('click')
    await flushPromises()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:isNewLogMode').at(-1)).toEqual([false])
  })

  it('빈 상태(로그 없음 + 조회 모드) Start New Log → start-new-log emit', async () => {
    const wrapper = mountEditor({ isNewLogMode: false, currentLog: null, isLoading: false })
    await flushPromises()
    await wrapper.find('.archive-btn').trigger('click')
    expect(wrapper.emitted('start-new-log')).toBeTruthy()
  })
})

describe('MeetingLogEditor — 인터뷰 자동 오픈 신호 (2026-06-12 보강 모드)', () => {
  // 신호는 모듈 싱글톤(sticky) — 테스트 간 누수 방지로 매번 소비해 비운다.
  beforeEach(() => { consumeInterviewOpen() })
  // InterviewDialog 가 열리며 첫 질문 fetch 를 시도 — 보류 promise 로 네트워크 차단.
  beforeEach(() => { globalThis.fetch = vi.fn(() => new Promise(() => {})) })

  it('신호가 걸린 채 mount(탭 전환으로 늦게 mount) → start-new-log emit + 모달 오픈', async () => {
    requestInterviewOpen()
    const wrapper = mountEditor({ isNewLogMode: false, currentLog: null })
    await flushPromises()
    expect(wrapper.emitted('start-new-log')).toBeTruthy()
    expect(wrapper.vm.showInterview).toBe(true)
    // 신호는 소비돼 비어 있어야 한다 (다음 mount 에서 재발사 금지)
    expect(consumeInterviewOpen()).toBe(false)
  })

  it('이미 작성 모드면 start-new-log 없이 모달만 연다 (초안 보존)', async () => {
    requestInterviewOpen()
    const wrapper = mountEditor({ isNewLogMode: true, editContent: '작성 중 초안' })
    await flushPromises()
    expect(wrapper.emitted('start-new-log')).toBeFalsy()
    expect(wrapper.vm.showInterview).toBe(true)
  })

  it('mount 후 신호가 와도(같은 탭에서 CTA) 모달을 연다', async () => {
    const wrapper = mountEditor({ isNewLogMode: true })
    await flushPromises()
    expect(wrapper.vm.showInterview).toBe(false)
    requestInterviewOpen()
    await flushPromises()
    expect(wrapper.vm.showInterview).toBe(true)
  })

  it('신호 없으면 아무 일도 없다 (기존 동작 보존)', async () => {
    const wrapper = mountEditor({ isNewLogMode: false, currentLog: null })
    await flushPromises()
    expect(wrapper.emitted('start-new-log')).toBeFalsy()
    expect(wrapper.vm.showInterview).toBe(false)
  })
})

describe('MeetingLogEditor — 보완 인터뷰 되돌리기 (#5 병합 유실 안전망)', () => {
  it('초안 있는 상태에서 인터뷰 완료 → 백업 + 되돌리기 버튼 노출', async () => {
    const wrapper = mountEditor({ isNewLogMode: true, editContent: '원래 초안 내용' })
    wrapper.vm.onInterviewComplete('병합된 회의록 내용')
    await flushPromises()
    // editContent 가 병합본으로 갱신 emit
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['병합된 회의록 내용'])
    // 백업 보관 + 되돌리기 버튼 노출
    expect(wrapper.vm.preReplaceDraft).toBe('원래 초안 내용')
    expect(wrapper.find('.input-helper-btn--undo').exists()).toBe(true)
  })

  it('되돌리기 클릭 → 인터뷰 전 내용 복원 + 백업 해제', async () => {
    const wrapper = mountEditor({ isNewLogMode: true, editContent: '원래 초안 내용' })
    wrapper.vm.onInterviewComplete('병합된 회의록 내용')
    await flushPromises()
    await wrapper.find('.input-helper-btn--undo').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['원래 초안 내용'])
    expect(wrapper.vm.preReplaceDraft).toBe(null)
  })

  it('빈 상태(초안 없음)에서 인터뷰 완료 → 백업/되돌리기 없음', async () => {
    const wrapper = mountEditor({ isNewLogMode: true, editContent: '' })
    wrapper.vm.onInterviewComplete('새로 만든 회의록')
    await flushPromises()
    expect(wrapper.vm.preReplaceDraft).toBe(null)
    expect(wrapper.find('.input-helper-btn--undo').exists()).toBe(false)
  })

  it('사용자가 병합본을 직접 수정하면 되돌리기 만료', async () => {
    const wrapper = mountEditor({ isNewLogMode: true, editContent: '원래 초안 내용' })
    wrapper.vm.onInterviewComplete('병합된 회의록 내용')
    await flushPromises()
    expect(wrapper.vm.preReplaceDraft).toBe('원래 초안 내용')
    // 사용자가 직접 편집 → 백업 만료
    await wrapper.setProps({ editContent: '병합된 회의록 내용 + 사용자 수정' })
    await flushPromises()
    expect(wrapper.vm.preReplaceDraft).toBe(null)
  })
})

describe('MeetingLogEditor — 음성 전사(STT) 결과 알림', () => {
  const audioFile = () => new File(['x'], 'rec.mp3', { type: 'audio/mpeg' })
  const fakeEvent = () => ({ target: { files: [audioFile()], value: 'x' } })
  // 쿼터 경고 검증용 — 큰 파일(estTokens = size/330 가 남은 한도를 넘게).
  const bigEvent = (bytes) => ({
    target: { files: [new File([new Uint8Array(bytes)], 'rec.mp3', { type: 'audio/mpeg' })], value: 'x' },
  })

  it('정상 전사 → editContent 갱신 + 성공 토스트(경고 없음)', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: '전사된 내용' } })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(fakeEvent())
    await flushPromises()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['전사된 내용'])
    expect(mocks.showSuccess).toHaveBeenCalled()
    expect(mocks.showWarning).not.toHaveBeenCalled()
  })

  it('truncated=true → 경고 토스트로 재시도 안내(성공 토스트 없음)', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: '부분 전사', truncated: true } })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(fakeEvent())
    await flushPromises()
    // 부분 전사라도 본문은 채워 사용자가 검토 가능
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['부분 전사'])
    expect(mocks.showWarning).toHaveBeenCalled()
    expect(mocks.showSuccess).not.toHaveBeenCalled()
  })

  it('무료 등급 + 예상 사용량 > 남은 한도 → 확인 취소 시 전사 중단(axios 미호출)', async () => {
    mocks.usageVals.tokensUsed = 99990          // 남은 10 토큰
    mocks.confirm.mockResolvedValueOnce(false)  // 사용자가 '취소'
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(bigEvent(100 * 1024))  // est ≈ 310 > 10
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.axiosPost).not.toHaveBeenCalled()  // 취소 → 전사 호출 안 함
  })

  it('무료 등급 경고에서 진행 선택 → 전사 수행', async () => {
    mocks.usageVals.tokensUsed = 99990
    mocks.confirm.mockResolvedValueOnce(true)   // '계속'
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: '진행됨' } })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(bigEvent(100 * 1024))
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.axiosPost).toHaveBeenCalled()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['진행됨'])
  })

  it('유료 등급은 한도가 적어도 쿼터 경고 없이 바로 전사', async () => {
    mocks.usageVals.subscriptionType = 'pro'
    mocks.usageVals.tokensUsed = 99990
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: 'pro 전사' } })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(bigEvent(100 * 1024))
    await flushPromises()
    expect(mocks.confirm).not.toHaveBeenCalled()   // 유료는 경고 스킵
    expect(mocks.axiosPost).toHaveBeenCalled()
  })
})

describe('MeetingLogEditor — 음성 전사 안전장치 (C2/C5/C7)', () => {
  const fakeEvent = () => ({ target: { files: [new File(['x'], 'rec.mp3', { type: 'audio/mpeg' })], value: 'x' } })
  const overEvent = (mb) => ({ target: { files: [{ size: mb * 1024 * 1024, name: 'long.mp3', type: 'audio/mpeg' }], value: 'x' } })

  it('음성 전사 결과도 백업 → 되돌리기로 이전 내용 복원 (C7)', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: '전사된 내용' } })
    const wrapper = mountEditor({ isNewLogMode: true, editContent: '기존 메모' })
    await wrapper.vm.handleAudioUpload(fakeEvent())  // editContent 있으니 덮어쓰기 confirm(기본 true)
    await flushPromises()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['전사된 내용'])
    // 전사 전 내용이 백업되어 되돌리기 버튼 노출 (인터뷰 경로와 동일 메커니즘)
    expect(wrapper.vm.preReplaceDraft).toBe('기존 메모')
    expect(wrapper.find('.input-helper-btn--undo').exists()).toBe(true)
    await wrapper.find('.input-helper-btn--undo').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['기존 메모'])
  })

  it('청킹 부분 실패(chunk_failed) → 앞 전사 보존 채우고 경고 (C2)', async () => {
    mocks.usageVals.subscriptionType = 'pro'  // 쿼터 노이즈 제거
    mocks.transcribeLargeAudio.mockRejectedValueOnce(
      new mocks.AudioChunkError('chunk_failed', { partialText: '앞부분 전사', doneCount: 2, total: 5, failedIndex: 2 }),
    )
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(overEvent(40))
    await flushPromises()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['앞부분 전사'])
    expect(mocks.showWarning).toHaveBeenCalled()
  })

  it('truncated 전사 후 저장 시 confirm 게이트 — 취소하면 save 안 됨 (C5)', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: 'x'.repeat(250), truncated: true } })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(fakeEvent())
    await flushPromises()
    expect(wrapper.vm.transcriptTruncated).toBe(true)
    mocks.confirm.mockResolvedValueOnce(false)  // 저장 confirm 에서 '취소'
    await wrapper.vm.saveLog()
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalled()
    expect(wrapper.emitted('save')).toBeFalsy()
  })

  it('truncated 후 사용자가 본문 편집하면 저장 게이트 해제', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: 'y'.repeat(250), truncated: true } })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(fakeEvent())
    await flushPromises()
    expect(wrapper.vm.transcriptTruncated).toBe(true)
    // 사용자가 직접 수정 → 스냅샷과 달라져 게이트 해제
    await wrapper.setProps({ editContent: 'y'.repeat(250) + ' 사용자 보완' })
    await flushPromises()
    expect(wrapper.vm.transcriptTruncated).toBe(false)
  })

  it('전사 중 취소(CanceledError) → 취소 토스트 + 본문 미변경 (C7)', async () => {
    const cancelErr = Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' })
    mocks.axiosPost.mockRejectedValueOnce(cancelErr)
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(fakeEvent())
    await flushPromises()
    expect(mocks.showWarning).toHaveBeenCalled()       // transcript_canceled
    expect(mocks.showError).not.toHaveBeenCalled()     // 취소는 에러 아님
    expect(wrapper.emitted('update:editContent')).toBeFalsy()  // 본문 안 건드림
  })

  it('청킹 부분실패 + 앞 청크 truncated → 부분보존 + 저장 게이트 마킹 (C2+C5)', async () => {
    mocks.usageVals.subscriptionType = 'pro'
    mocks.transcribeLargeAudio.mockRejectedValueOnce(
      new mocks.AudioChunkError('chunk_failed', { partialText: '앞부분 전사', doneCount: 2, total: 5, truncated: true }),
    )
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(overEvent(40))
    await flushPromises()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['앞부분 전사'])
    expect(wrapper.vm.transcriptTruncated).toBe(true)  // truncated 보존 → C5 저장 게이트
  })

  it('28MB 초과(예: 29MB) → 청킹 경로 (단일 413 사각지대 방지, A1)', async () => {
    mocks.usageVals.subscriptionType = 'pro'
    mocks.transcribeLargeAudio.mockResolvedValueOnce({
      text: '청킹 전사', truncated: false, chunkCount: 2, totalTokens: 100,
    })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(overEvent(30))  // 29MB 임계 초과 → 청킹(옛 30MB 임계면 단일→413)
    await flushPromises()
    expect(mocks.transcribeLargeAudio).toHaveBeenCalledTimes(1)
    expect(mocks.axiosPost).not.toHaveBeenCalled()
  })
})

describe('MeetingLogEditor — 긴 회의 청킹 전사', () => {
  // 30MB 초과 파일을 size 만 가진 가짜 객체로 — 실제 바이트 적재 없이 청킹 경로 라우팅 검증.
  const overEvent = (mb) => ({
    target: { files: [{ size: mb * 1024 * 1024, name: 'long.mp3', type: 'audio/mpeg' }], value: 'x' },
  })

  it('30MB 초과 → transcribeLargeAudio 로 분할 전사 + 본문 갱신 + 청킹 완료 토스트', async () => {
    mocks.usageVals.subscriptionType = 'pro'   // 쿼터 확인 노이즈 제거
    mocks.transcribeLargeAudio.mockResolvedValueOnce({
      text: '이어붙인 긴 전사', truncated: false, chunkCount: 5, totalTokens: 500,
    })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(overEvent(40))
    await flushPromises()
    expect(mocks.transcribeLargeAudio).toHaveBeenCalledTimes(1)
    expect(mocks.axiosPost).not.toHaveBeenCalled()   // 청킹 경로는 컴포넌트가 직접 axios 안 씀
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['이어붙인 긴 전사'])
    expect(mocks.showSuccess).toHaveBeenCalled()
    expect(mocks.showWarning).not.toHaveBeenCalled()
  })

  it('청크 일부 truncated → 경고 토스트', async () => {
    mocks.usageVals.subscriptionType = 'pro'
    mocks.transcribeLargeAudio.mockResolvedValueOnce({
      text: '부분 전사', truncated: true, chunkCount: 3, totalTokens: 300,
    })
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(overEvent(40))
    await flushPromises()
    expect(wrapper.emitted('update:editContent').at(-1)).toEqual(['부분 전사'])
    expect(mocks.showWarning).toHaveBeenCalled()
    expect(mocks.showSuccess).not.toHaveBeenCalled()
  })

  it('너무 긴 녹음(too_long) → 안내 에러, 본문 미변경', async () => {
    mocks.usageVals.subscriptionType = 'pro'
    mocks.transcribeLargeAudio.mockRejectedValueOnce(new mocks.AudioChunkError('too_long'))
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(overEvent(40))
    await flushPromises()
    expect(mocks.showError).toHaveBeenCalled()
    expect(wrapper.emitted('update:editContent')).toBeFalsy()
  })

  it('원본 상한(150MB) 초과 → 거부, 전사 미호출', async () => {
    const wrapper = mountEditor({ isNewLogMode: true })
    await wrapper.vm.handleAudioUpload(overEvent(160))
    await flushPromises()
    expect(mocks.showError).toHaveBeenCalled()
    expect(mocks.transcribeLargeAudio).not.toHaveBeenCalled()
    expect(mocks.axiosPost).not.toHaveBeenCalled()
  })

  it('uploadAudioChunk: WAV blob 을 전송하고 응답을 {text,tokens,truncated} 로 파싱', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: { result: 'success', text: '청크 전사', tokens_used: 42, truncated: true },
    })
    const wrapper = mountEditor({ isNewLogMode: true })
    const blob = new Blob([new Uint8Array(10)], { type: 'audio/wav' })
    const res = await wrapper.vm.uploadAudioChunk(blob, { index: 0, total: 2 })
    expect(res).toEqual({ text: '청크 전사', tokens: 42, truncated: true })
    // FormData 로 /transcribeAudio 에 POST
    const [url, body] = mocks.axiosPost.mock.calls[0]
    expect(url).toContain('/transcribeAudio')
    expect(body).toBeInstanceOf(FormData)
  })

  it('uploadAudioChunk: 성공 아님 응답이면 throw', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'error', message: '실패' } })
    const wrapper = mountEditor({ isNewLogMode: true })
    await expect(
      wrapper.vm.uploadAudioChunk(new Blob([new Uint8Array(4)], { type: 'audio/wav' }), { index: 0, total: 1 }),
    ).rejects.toThrow()
  })

  it('uploadAudioChunk: 무음 청크(빈 텍스트)는 throw 하지 않고 빈 결과 반환', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { result: 'success', text: '' } })
    const wrapper = mountEditor({ isNewLogMode: true })
    const res = await wrapper.vm.uploadAudioChunk(new Blob([new Uint8Array(4)], { type: 'audio/wav' }), { index: 1, total: 3 })
    expect(res).toEqual({ text: '', tokens: 0, truncated: false })
  })
})
