/**
 * InterviewDialog.vue — AI 인터뷰 (스트리밍 버전) 2026-05-29.
 *
 * 검증:
 *  - 열리면 첫 질문을 SSE 스트리밍으로 fetch (history 빈 상태)
 *  - token 이벤트 → 말풍선에 누적
 *  - done 이벤트 → suggestions/coverage 반영
 *  - phase=done + meeting_content → @complete emit + 닫힘
 *  - 예시 답변(suggestion) 클릭 = 전송
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const vuetify = createVuetify({ components, directives })
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.visualViewport = globalThis.visualViewport || {
  width: 1024, height: 768, addEventListener() {}, removeEventListener() {},
}

// VDialog stub
const VDialogStub = {
  props: ['modelValue'], emits: ['update:modelValue'],
  template: '<div class="v-dialog-stub"><slot /></div>',
}

// SSE 응답 헬퍼 — fetch 를 SSE 스트림처럼 동작시킴
function makeSseResponse(events) {
  const body = events
    .map(e => `data: ${JSON.stringify(e)}\n\n`)
    .join('')
  const encoder = new TextEncoder()
  const bytes = encoder.encode(body)
  let offset = 0
  const readable = new ReadableStream({
    pull(controller) {
      if (offset < bytes.length) {
        controller.enqueue(bytes.slice(offset, offset + 64))
        offset += 64
      } else {
        controller.close()
      }
    },
  })
  return { ok: true, status: 200, body: readable, json: async () => ({}) }
}

const fetchMock = vi.fn()
globalThis.fetch = fetchMock

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

// [2026-06] restart 가 window.confirm → 전역 ConfirmDialog(useConfirm) 로 전환됨. 항상 '확인'.
vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => () => Promise.resolve(true),
}))

// [2026-06-12 보강 모드] needs_input 의제 — 실제 store 는 setter 를 노출하지 않으므로
// (runAutofix 결과로만 채워짐) 테스트에서 제어 가능한 module mock 으로 대체.
const autofixMocks = vi.hoisted(() => ({ needsInput: vi.fn(() => []) }))
vi.mock('@/store/autofix', () => ({
  useAutofixStore: () => ({ needsInput: autofixMocks.needsInput }),
}))

import InterviewDialog from '@/components/plan/InterviewDialog.vue'
import { useProjectStore } from '@/store/project'
import i18n from '@/plugins/i18n'

// 컴포넌트와 같은 pinia 인스턴스를 공유 — 테스트에서 store(프로젝트 전환 등) 조작용.
let pinia

const mountDialog = (props = {}) =>
  mount(InterviewDialog, {
    props: { modelValue: false, ...props },
    global: { plugins: [pinia, vuetify, i18n], stubs: { VDialog: VDialogStub } },
  })

// 영속화 키 — 사용자(anon)::팀(personal)::프로젝트(__default__) 스코프.
const PERSIST_KEY = 'harness_interview_v1::anon::personal::__default__'

describe('InterviewDialog (AI 인터뷰 — 스트리밍)', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    fetchMock.mockReset()
    localStorage.clear()
    i18n.global.locale.value = 'ko'  // jsdom navigator.language='en' → 한국어 기준 고정
    autofixMocks.needsInput.mockReturnValue([])
  })

  it('열리면 첫 질문을 SSE 스트리밍으로 가져온다', async () => {
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '무엇을 ' },
      { type: 'token', text: '만들고 싶으세요?' },
      { type: 'done', phase: 'ask', assistant_message: '무엇을 만들고 싶으세요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/interview/turn/stream')
    expect(wrapper.text()).toContain('만들고 싶으세요?')
  })

  it('[B-1] tool 이벤트(자료 조회) 후 답변 토큰이 정상 렌더된다', async () => {
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'tool', tool: 'meetings' },
      { type: 'token', text: '회의록 보니 결제 정책이 있네요 — 환불 기준은요?' },
      { type: 'done', phase: 'ask', assistant_message: '회의록 보니 결제 정책이 있네요 — 환불 기준은요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 알 수 없는 이벤트로 죽지 않고, 도구 조회 뒤 답변이 그대로 표시된다.
    expect(wrapper.text()).toContain('환불 기준은요?')
    // 스트림 종료 후 상태 표시는 해제 (자료 확인 문구 잔류 없음)
    expect(wrapper.text()).not.toContain('프로젝트 자료 확인 중')
  })

  it('[B-1] 토큰 없이 done 만 오면 assistant_message 로 버블 백필 (빈 응답 방지)', async () => {
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'tool', tool: 'prd' },
      { type: 'done', phase: 'ask', assistant_message: '조금 더 알려주시겠어요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(wrapper.text()).toContain('조금 더 알려주시겠어요?')
  })

  it('답변 전송 시 history 가 누적되어 다음 SSE 호출', async () => {
    fetchMock
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: 'Q1?' },
        { type: 'done', phase: 'ask', assistant_message: 'Q1?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: 'Q2?' },
        { type: 'done', phase: 'ask', assistant_message: 'Q2?', suggestions: [], coverage: ['정의'], meeting_content: '' },
      ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await wrapper.find('textarea').setValue('할 일 관리 앱')
    await wrapper.find('.interview-input__send').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body2.history).toEqual([
      { role: 'assistant', content: 'Q1?' },
      { role: 'user', content: '할 일 관리 앱' },
    ])
  })

  it('예시 답변 클릭 = 전송', async () => {
    fetchMock
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: '누가 쓰나요?' },
        { type: 'done', phase: 'ask', assistant_message: '누가 쓰나요?', suggestions: ['일반 사용자'], coverage: [], meeting_content: '' },
      ]))
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: '다음?' },
        { type: 'done', phase: 'ask', assistant_message: '다음?', suggestions: [], coverage: [], meeting_content: '' },
      ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await wrapper.find('.suggest-chip').trigger('click')
    await flushPromises()

    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body2.history.at(-1)).toEqual({ role: 'user', content: '일반 사용자' })
  })

  it('보완 인터뷰 — existingContent 를 요청 본문에 함께 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '결제는 어떻게 하나요?' },
      { type: 'done', phase: 'ask', assistant_message: '결제는 어떻게 하나요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))

    const wrapper = mountDialog({ existingContent: '# 프로젝트 개요\n중고거래 앱' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.existing_content).toBe('# 프로젝트 개요\n중고거래 앱')
    // 보완 모드 헤더 문구
    expect(wrapper.text()).toContain('AI로 빈 곳 채우기')
  })

  it('[보강 모드] needs_input 의제를 agenda 로 동봉 + 헤더가 "보강 중: {프로젝트}"', async () => {
    const projectStore = useProjectStore()
    projectStore.setProjectName('projA')
    autofixMocks.needsInput.mockReturnValue([
      { topic: '인증', question: '로그인 방식은 무엇으로 할까요?' },
      { topic: '', question: '성능 목표 수치가 있나요?' },
    ])
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '로그인 방식부터 정할까요?' },
      { type: 'done', phase: 'ask', assistant_message: '로그인 방식부터 정할까요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.agenda).toEqual([
      '인증 — 로그인 방식은 무엇으로 할까요?',
      '성능 목표 수치가 있나요?',          // topic 비면 question 만
    ])
    expect(wrapper.text()).toContain('보강 중: projA')
  })

  it('[보강 모드] 의제 칩 렌더 + 클릭 시 "이것부터" 발화 전송 (Phase 3)', async () => {
    const projectStore = useProjectStore()
    projectStore.setProjectName('projA')
    autofixMocks.needsInput.mockReturnValue([
      { topic: '인증', question: '로그인 방식은 무엇으로 할까요?' },
      { topic: '', question: '성능 목표 수치가 있나요?' },
    ])
    fetchMock
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: '어떤 것부터 채울까요?' },
        { type: 'done', phase: 'ask', assistant_message: '어떤 것부터 채울까요?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: '로그인은 이메일로 갈까요?' },
        { type: 'done', phase: 'ask', assistant_message: '로그인은 이메일로 갈까요?', suggestions: [], coverage: [], meeting_content: '' },
      ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 칩 렌더 — topic 이 있으면 topic, 비면 question 앞부분
    const chips = wrapper.findAll('.interview-agenda__chip')
    expect(chips.length).toBe(2)
    expect(chips[0].text()).toBe('인증')
    expect(chips[1].text()).toContain('성능 목표')
    expect(wrapper.text()).toContain('채울 항목 2개')

    // 클릭 = 해당 주제부터 채우자는 사용자 발화 전송
    await chips[0].trigger('click')
    await flushPromises()
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body2.history.at(-1)).toEqual({ role: 'user', content: "'인증'부터 채우고 싶어요" })
  })

  it('[보강 모드] 의제 없으면 agenda 빈 배열 + 기존 신규 헤더 유지', async () => {
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '무엇을 만들고 싶으세요?' },
      { type: 'done', phase: 'ask', assistant_message: '무엇을 만들고 싶으세요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.agenda).toEqual([])
    expect(wrapper.text()).toContain('AI와 대화로 시작하기')
  })

  it('phase=done + meeting_content → @complete emit', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '정리했어요!' },
      { type: 'done', phase: 'done', assistant_message: '정리했어요!', suggestions: [], coverage: [], meeting_content: '# 프로젝트 개요\n할 일 앱' },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect(wrapper.emitted('complete')).toBeTruthy()
    expect(wrapper.emitted('complete')[0][0]).toContain('프로젝트 개요')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    vi.useRealTimers()
  })

  it('[T2/T3] done 이벤트의 readiness/next_focus → 진행바 % + 집중 차원 한글 라벨 렌더', async () => {
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '데이터는 무엇을 다루나요?' },
      {
        type: 'done', phase: 'ask', assistant_message: '데이터는 무엇을 다루나요?',
        suggestions: [], coverage: ['정의'], meeting_content: '',
        readiness: 0.4, scores: { goal: 1.0 }, next_focus: 'data',
      },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('준비도')
    expect(text).toContain('40%')               // readiness 0.4 → 40%
    expect(text).toContain('지금 여쭤보는 것')
    expect(text).toContain('데이터')             // next_focus 'data' → 한글 라벨
    // 진행바 fill 너비가 40%
    expect(wrapper.find('.interview-progress__fill').attributes('style')).toContain('40%')
  })

  it('[i18n] locale=en 이면 UI가 영어로 렌더된다', async () => {
    i18n.global.locale.value = 'en'
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: 'What do you want to build?' },
      {
        type: 'done', phase: 'ask', assistant_message: 'What do you want to build?',
        suggestions: [], coverage: [], meeting_content: '', readiness: 0.2, next_focus: 'goal',
      },
    ]))
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Readiness')               // 준비도 → Readiness
    expect(text).toContain('Currently asking about')  // 지금 여쭤보는 것
    expect(text).toContain('Goal')                    // next_focus 'goal' → dim 라벨
    i18n.global.locale.value = 'ko'                   // 복구
  })

  it('[T2] done 턴(phase=done)에선 집중 차원 힌트를 숨긴다', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '정리할게요!' },
      {
        type: 'done', phase: 'done', assistant_message: '정리할게요!',
        suggestions: [], coverage: [], meeting_content: '# 개요',
        readiness: 1.0, next_focus: null,
      },
    ]))
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.text()).not.toContain('지금 여쭤보는 것')
    vi.useRealTimers()
  })

  it('[영속화] 턴이 끝나면 대화가 localStorage 에 저장된다', async () => {
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '무엇을 만들고 싶으세요?' },
      { type: 'done', phase: 'ask', assistant_message: '무엇을 만들고 싶으세요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY))
    expect(saved.messages).toEqual([
      { role: 'assistant', content: '무엇을 만들고 싶으세요?' },
    ])
  })

  it('[복원] 재마운트 후 열면 저장된 대화를 fetch 없이 복원한다', async () => {
    // 1차: 대화 한 번 진행 → localStorage 에 [Q1, U1, Q2] 저장
    fetchMock
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: 'Q1?' },
        { type: 'done', phase: 'ask', assistant_message: 'Q1?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: 'Q2?' },
        { type: 'done', phase: 'ask', assistant_message: 'Q2?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
    const w1 = mountDialog()
    await w1.setProps({ modelValue: true })
    await flushPromises()
    await w1.find('textarea').setValue('할 일 관리 앱')
    await w1.find('.interview-input__send').trigger('click')
    await flushPromises()
    w1.unmount()

    // 2차: 새 컴포넌트(페이지 이동 후 재마운트 가정) — 열면 복원, 새 fetch 없음
    fetchMock.mockReset()
    const w2 = mountDialog()
    await w2.setProps({ modelValue: true })
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    const text = w2.text()
    expect(text).toContain('Q1?')
    expect(text).toContain('할 일 관리 앱')
    expect(text).toContain('Q2?')
    expect(text).toContain('이전 대화를 이어가고 있어요')
  })

  it('[복원] 마지막이 사용자 메시지면 AI 응답을 자동으로 이어받는다', async () => {
    // 응답 받기 전 중단된 상태를 직접 주입 (마지막이 user)
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      messages: [
        { role: 'assistant', content: 'Q1?' },
        { role: 'user', content: '중고거래 앱' },
      ],
      suggestions: [], coverage: [], readiness: 0.2, nextFocus: '', draft: '',
      savedAt: Date.now(),
    }))
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: '누가 쓰나요?' },
      { type: 'done', phase: 'ask', assistant_message: '누가 쓰나요?', suggestions: [], coverage: [], meeting_content: '' },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 끊긴 턴을 이어받아 history 끝이 사용자 발화로 전송됨
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.history).toEqual([
      { role: 'assistant', content: 'Q1?' },
      { role: 'user', content: '중고거래 앱' },
    ])
    expect(wrapper.text()).toContain('누가 쓰나요?')
  })

  it('[영속화] 스트리밍 도중 이탈 시 잘린 AI 말풍선은 저장하지 않는다', async () => {
    // 첫 토큰 일부만 흘리고 멈춘 보류 스트림 — done 이 오지 않아 loading 유지
    let pull
    const readable = new ReadableStream({
      pull(controller) {
        if (!pull) {
          pull = true
          controller.enqueue(new TextEncoder().encode('data: {"type":"token","text":"그러면 결제는"}\n\n'))
        }
        // 이후로는 닫지 않음 → 스트리밍 진행 중 상태 유지
      },
    })
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: readable, json: async () => ({}) })

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    // 부분 토큰이 화면엔 보이지만(스트리밍 중)
    expect(wrapper.text()).toContain('그러면 결제는')
    // 언마운트(페이지 이동) — 미완성 AI 말풍선은 저장에서 제외 → 첫 턴이라 저장본 없음
    wrapper.unmount()
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()
  })

  it('[새로 시작] 저장본을 지우고 첫 질문을 다시 요청한다', async () => {
    fetchMock
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: '첫 질문?' },
        { type: 'done', phase: 'ask', assistant_message: '첫 질문?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: '새 첫 질문?' },
        { type: 'done', phase: 'ask', assistant_message: '새 첫 질문?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull()

    await wrapper.find('.interview-head__restart').trigger('click')
    await flushPromises()

    // 새 첫 질문을 위한 호출 — history 비어 있음
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body2.history).toEqual([])
    expect(wrapper.text()).toContain('새 첫 질문?')
  })

  it('[격리] 프로젝트 전환 시 이전 키로 저장하고 새 컨텍스트로 재시작한다', async () => {
    const projectStore = useProjectStore()
    projectStore.setProjectName('projA')
    fetchMock
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: 'A의 질문?' },
        { type: 'done', phase: 'ask', assistant_message: 'A의 질문?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: 'B의 질문?' },
        { type: 'done', phase: 'ask', assistant_message: 'B의 질문?', suggestions: [], coverage: [], meeting_content: '' },
      ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.text()).toContain('A의 질문?')

    // 같은 마운트에서 프로젝트 전환 (plan 페이지는 리마운트 없음)
    projectStore.setProjectName('projB')
    await flushPromises()

    // A의 대화는 A의 키에 저장되고, 화면은 B의 첫 질문으로 재시작
    const savedA = JSON.parse(localStorage.getItem('harness_interview_v1::anon::personal::projA'))
    expect(savedA.messages).toEqual([{ role: 'assistant', content: 'A의 질문?' }])
    expect(wrapper.text()).not.toContain('A의 질문?')
    expect(wrapper.text()).toContain('B의 질문?')
    // B의 첫 턴 요청은 빈 history + project_name=projB
    const bodyB = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(bodyB.project_name).toBe('projB')
    expect(bodyB.history).toEqual([])
  })

  it('[격리] 키에 사용자·팀이 포함된다 + 팀 컨텍스트면 team_id 를 BE 로 보낸다', async () => {
    const projectStore = useProjectStore()
    projectStore.ownerEmail = 'User@Example.com'
    projectStore.setProjectContext('teamProj', 'team-42', '우리팀')
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'token', text: 'Q?' },
      { type: 'done', phase: 'ask', assistant_message: 'Q?', suggestions: [], coverage: [], meeting_content: '' },
    ]))

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.team_id).toBe('team-42')
    const saved = localStorage.getItem('harness_interview_v1::user@example.com::team-42::teamProj')
    expect(JSON.parse(saved).messages).toEqual([{ role: 'assistant', content: 'Q?' }])
  })

  it('[격리] 대화 없는 채로 전환해도 이전 프로젝트 저장본을 지우지 않는다', async () => {
    const projectStore = useProjectStore()
    // projA 에 기존 저장본이 있는 상태
    localStorage.setItem('harness_interview_v1::anon::personal::projA', JSON.stringify({
      messages: [{ role: 'assistant', content: '예전 질문?' }],
      suggestions: [], coverage: [], readiness: 0, nextFocus: '', draft: '',
      savedAt: Date.now(),
    }))
    projectStore.setProjectName('projA')
    const wrapper = mountDialog()  // 모달은 안 연다 — 메모리 대화 없음
    await flushPromises()
    projectStore.setProjectName('projB')  // 전환
    await flushPromises()

    // projA 저장본은 그대로 (빈 메모리 persist 가 삭제로 이어지면 안 됨)
    const savedA = JSON.parse(localStorage.getItem('harness_interview_v1::anon::personal::projA'))
    expect(savedA.messages[0].content).toBe('예전 질문?')
    wrapper.unmount()
  })

  it('[쿼터] 402 여도 대화를 보존한다 — 업그레이드 후 이어가기', async () => {
    fetchMock
      .mockResolvedValueOnce(makeSseResponse([
        { type: 'token', text: 'Q1?' },
        { type: 'done', phase: 'ask', assistant_message: 'Q1?', suggestions: [], coverage: [], meeting_content: '' },
      ]))
      .mockResolvedValueOnce({
        ok: false, status: 402,
        json: async () => ({ detail: { code: 'QUOTA_EXCEEDED', message: '한도 초과' } }),
      })

    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    await wrapper.find('textarea').setValue('내 답변')
    await wrapper.find('.interview-input__send').trigger('click')
    await flushPromises()

    // 모달은 닫히지만 대화는 저장돼 있다 (마지막 = 사용자 발화 → 복원 시 자동 이어받기)
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY))
    expect(saved.messages).toEqual([
      { role: 'assistant', content: 'Q1?' },
      { role: 'user', content: '내 답변' },
    ])
  })

  it('[완료] phase=done 이면 저장본을 폐기한다', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(makeSseResponse([
      { type: 'done', phase: 'done', assistant_message: '정리했어요!', suggestions: [], coverage: [], meeting_content: '# 개요' },
    ]))
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()
    vi.useRealTimers()
  })

  it('finalizing=true 면 "정리 중", 아니면 "생각 중" 표시', async () => {
    // 다이얼로그 첫 호출은 막아두고(보류 promise) 로딩 버블 문구만 검증.
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 기본: 생각 중
    expect(wrapper.text()).toContain('생각 중')
    // 합성 단계: 정리 중
    wrapper.vm.finalizing = true
    await flushPromises()
    expect(wrapper.text()).toContain('정리 중')
  })
})
