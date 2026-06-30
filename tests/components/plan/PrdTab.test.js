/**
 * PrdTab.vue — 컴포넌트 mount 테스트.
 *
 * [범위 — Phase 1]
 * 사용자 입장에서 PRD 편집 흐름이 의도대로 동작 + 빠른 실패가 잘 일어나는지.
 *  1) saveEdit — 빈 내용 거부 + 에러 토스트 + axios.patch 미호출
 *  2) saveEdit — 500KB 초과 거부
 *  3) saveEdit — projectName 없으면 거부
 *  4) saveEdit — 성공 시 axios.patch 호출 + emit('saved') + 편집 종료
 *  5) 큰 삭제 confirm 가드
 *
 * 검수 모드 노드 인라인 수정(saveEditNode / fetchGraphNodes gate)은 PrdNodeEditor.vue 로
 * 분리됨 — tests/components/plan/PrdNodeEditor.test.js 에서 검증.
 *
 * [mock 정책]
 * - axios: get/patch/post mock — 모든 네트워크 차단.
 * - useSnackbar/useHarnessStore/usePrdLint/notifyEvalScoreRefresh: minimal mock.
 * - 자식 컴포넌트(PrdLintBadge / ResynthDiffModal) 와 Vuetify 컴포넌트: global stubs true.
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

// vi.hoisted — vi.mock 은 파일 최상단으로 hoist 되므로 외부 변수 접근 불가.
// vi.hoisted 로 끌어올린 mock 함수들만 factory 안에서 안전하게 참조 가능.
const mocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  notifyEvalScoreRefresh: vi.fn(),
  axiosPatch: vi.fn(async () => ({ data: {} })),
  axiosGet: vi.fn(async () => ({ data: { nodes: [] } })),
  axiosPost: vi.fn(async () => ({ data: {} })),
  // [2026-06-11] remoteBusy 가드 검증용 — autofix store 호출 여부 spy.
  autofixRun: vi.fn(async () => ({ changed: false, needsInput: [] })),
  // [2026-06] needs_input 영속화 복원/해제 spy.
  storeRestoreNeedsInput: vi.fn(),
  storeClearNeedsInput: vi.fn(),
  storeSyncNeedsCleared: vi.fn(),
}))

vi.mock('@/utils/axios', () => ({
  default: { patch: mocks.axiosPatch, get: mocks.axiosGet, post: mocks.axiosPost },
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showWarning: mocks.showWarning,
  }),
}))

vi.mock('@/composables/useEvalScore', () => ({
  notifyEvalScoreRefresh: mocks.notifyEvalScoreRefresh,
  useEvalScore: () => ({
    score: { value: null }, loading: { value: false }, error: { value: null },
  }),
}))

vi.mock('@/composables/usePrdLint', () => ({
  usePrdLint: () => ({ report: { value: null }, loading: { value: false } }),
}))

vi.mock('@/store/harness', () => ({
  useHarnessStore: () => ({ projectName: 'proj_x' }),
}))

// [2026-06-01] PrdTab 이 autofix 진행/결과를 store 로 소유하게 되며 추가된 의존성 —
// 다른 store 처럼 mock (실제 Pinia 없이 mount). saveEdit/delete 테스트엔 autofix idle 로 충분.
vi.mock('@/store/autofix', () => ({
  useAutofixStore: () => ({
    isAutofixing: () => false,
    pendingDiff: () => null,
    needsInput: () => [],
    runAutofix: mocks.autofixRun,
    clearPending: () => {},
    clearNeedsInput: mocks.storeClearNeedsInput,
    restoreNeedsInput: mocks.storeRestoreNeedsInput,
    syncNeedsCleared: mocks.storeSyncNeedsCleared,
  }),
}))

// 자식 컴포넌트 stub — 절대 + 상대 경로 모두 커버 (factory 안에서 외부 변수 미참조)
vi.mock('@/components/plan/PrdLintBadge.vue', () => ({
  default: { name: 'PrdLintBadge', template: '<div class="prd-lint-badge-stub"/>' },
}))
vi.mock('@/components/plan/ResynthDiffModal.vue', () => ({
  default: { name: 'ResynthDiffModal', template: '<div class="resynth-diff-modal-stub"/>' },
}))
vi.mock('./PrdLintBadge.vue', () => ({
  default: { name: 'PrdLintBadge', template: '<div class="prd-lint-badge-stub"/>' },
}))
vi.mock('./ResynthDiffModal.vue', () => ({
  default: { name: 'ResynthDiffModal', template: '<div class="resynth-diff-modal-stub"/>' },
}))

import PrdTab from '@/components/plan/PrdTab.vue'
import { consumeInterviewOpen } from '@/composables/useInterviewEntry'

const baseSection = (overrides = {}) => ({
  prd_content: '# PRD\n\n기존 내용',
  master_prd_id: 'PRD-1',
  ...overrides,
})

const mountPrdTab = (props = {}) => {
  return mount(PrdTab, {
    props: {
      prdSections: [baseSection()],
      editable: true,
      projectName: 'proj_x',
      ...props,
    },
    global: {
      // Vuetify 인스턴스 주입 — defaults / theme / display 의존성 충족.
      // vitest.config.js 의 vite-plugin-vuetify + Components resolver 가
      // VBtn/VDialog/VIcon 자동 import 처리.
      // i18n — PrdTab 이 useI18n()/$t 를 쓰므로 plugin 주입 (locale=ko 는 beforeEach 에서 고정).
      plugins: [vuetify, i18n],
    },
  })
}

beforeEach(() => {
  Object.values(mocks).forEach(fn => fn.mockClear?.())
  // 기본 동작 복원
  mocks.axiosPatch.mockImplementation(async () => ({ data: {} }))
  mocks.axiosGet.mockImplementation(async () => ({ data: { nodes: [] } }))
  mocks.axiosPost.mockImplementation(async () => ({ data: {} }))
})

describe('PrdTab — 인터뷰로 채우기 (2026-06-12 보강 모드)', () => {
  beforeEach(() => { consumeInterviewOpen() })  // 모듈 싱글톤 신호 — 테스트 간 누수 방지

  it('goToInterview → 자동 오픈 신호 + go-to-log emit (토스트 안내 폐지)', async () => {
    const wrapper = mountPrdTab()
    wrapper.vm.goToInterview()
    await flushPromises()
    expect(wrapper.emitted('go-to-log')).toBeTruthy()
    expect(consumeInterviewOpen()).toBe(true)
    // 이전 UX: "인터뷰 버튼을 눌러주세요" 토스트 — 자동 오픈으로 대체돼 더는 안 띄움
    expect(mocks.showWarning).not.toHaveBeenCalled()
  })
})

describe('PrdTab — saveEdit 방어 케이스', () => {
  it('빈 내용 저장 시 에러 토스트 + axios.patch 미호출', async () => {
    const wrapper = mountPrdTab()
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '   '  // whitespace only
    await vm.saveEdit()

    expect(mocks.showError).toHaveBeenCalledWith(expect.stringContaining('비어'))
    expect(mocks.axiosPatch).not.toHaveBeenCalled()
  })

  it('500KB 초과 시 거부 + axios.patch 미호출', async () => {
    const wrapper = mountPrdTab()
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = 'a'.repeat(500_001)
    await vm.saveEdit()

    expect(mocks.showError).toHaveBeenCalledWith(expect.stringContaining('500KB'))
    expect(mocks.axiosPatch).not.toHaveBeenCalled()
  })

  it('projectName 없으면 거부', async () => {
    const wrapper = mountPrdTab({ projectName: '' })
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '## new content\n\n충분히 채워진 PRD'
    await vm.saveEdit()

    expect(mocks.showError).toHaveBeenCalledWith(expect.stringContaining('프로젝트'))
    expect(mocks.axiosPatch).not.toHaveBeenCalled()
  })

  it('성공 시 axios.patch 호출 + saved emit + 편집 종료 + eval score refresh', async () => {
    const wrapper = mountPrdTab()
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '## new content\n\n새 PRD 내용'
    await vm.saveEdit()
    await flushPromises()

    expect(mocks.axiosPatch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/prd'),
      expect.objectContaining({ project_name: 'proj_x', content: expect.stringContaining('새 PRD') }),
    )
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(vm.isEditing).toBe(false)
    expect(mocks.showSuccess).toHaveBeenCalled()
    expect(mocks.notifyEvalScoreRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('PrdTab — 섹션 단위 편집 + 탭 잠금 (2026-06)', () => {
  // 4개 섹션이 모두 검출되는 완전한 PRD (영어 헤더 — splitSections 정상 분할).
  const fullPrd = [
    '## 🚀 PRD: Test',
    '',
    '### 1. Product Overview',
    '오버뷰 본문',
    '',
    '### 2. Epic & User Story Map',
    '에픽 본문',
    '',
    '### 3. Screen Architecture',
    '스크린 본문',
    '',
    '### 4. Global Non-Functional Requirements',
    'NFR 본문',
  ].join('\n')

  it('startEdit — 활성 탭(overview) 섹션만 textarea 에 담긴다 (전체 PRD 아님)', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: fullPrd })] })
    await flushPromises()
    const vm = wrapper.vm
    expect(vm.activeSection).toBe('overview')  // 기본 탭
    vm.startEdit()
    expect(vm.editContent).toContain('오버뷰 본문')
    expect(vm.editContent).not.toContain('에픽 본문')   // 다른 섹션은 안 담김
    expect(vm.editContent).not.toContain('NFR 본문')
  })

  it('saveEdit — overview 섹션만 교체, 나머지 섹션은 보존하며 병합 저장', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: fullPrd })] })
    await flushPromises()
    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '### 1. Product Overview\n수정된 오버뷰'
    await vm.saveEdit()
    await flushPromises()

    const sent = mocks.axiosPatch.mock.calls.at(-1)[1].content
    expect(sent).toContain('수정된 오버뷰')
    expect(sent).not.toContain('오버뷰 본문')   // 옛 내용 교체됨
    expect(sent).toContain('에픽 본문')         // 다른 섹션 전부 보존
    expect(sent).toContain('스크린 본문')
    expect(sent).toContain('NFR 본문')
  })

  it('saveEdit — 중간 섹션(epic) 편집 시 그 섹션만 교체, overview/screen/nfr 보존', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: fullPrd })] })
    await flushPromises()
    const vm = wrapper.vm
    vm.switchSection('epic')   // 편집 전이라 이동 가능
    expect(vm.activeSection).toBe('epic')
    vm.startEdit()
    expect(vm.editContent).toContain('에픽 본문')
    vm.editContent = '### 2. Epic & User Story Map\n새 에픽 내용'
    await vm.saveEdit()
    await flushPromises()

    const sent = mocks.axiosPatch.mock.calls.at(-1)[1].content
    expect(sent).toContain('오버뷰 본문')   // overview 보존
    expect(sent).toContain('새 에픽 내용')
    expect(sent).not.toContain('에픽 본문')  // 옛 epic 교체
    expect(sent).toContain('스크린 본문')
    expect(sent).toContain('NFR 본문')
  })

  it('편집 중에는 switchSection 이 차단된다 (탭 이동 불가)', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: fullPrd })] })
    await flushPromises()
    const vm = wrapper.vm
    vm.startEdit()
    expect(vm.isEditing).toBe(true)
    const before = vm.activeSection
    vm.switchSection('nfr')
    expect(vm.activeSection).toBe(before)   // 안 바뀜
    vm.scrollToNfrCard(0, 'X')
    expect(vm.activeSection).toBe(before)   // 좌측 항목 클릭도 차단
  })

  it('섹션 분할 실패(헤더 없음) PRD 는 full 스코프로 전체 편집 fallback', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: '# 헤더 없는 PRD\n\n그냥 본문' })] })
    await flushPromises()
    const vm = wrapper.vm
    vm.startEdit()
    // overview 가 전체를 커버 → editContent 에 전체가 담기고 저장도 정상.
    expect(vm.editContent).toContain('그냥 본문')
    vm.editContent = '# 새 PRD\n\n새 본문 충분히'
    await vm.saveEdit()
    await flushPromises()
    const sent = mocks.axiosPatch.mock.calls.at(-1)[1].content
    expect(sent).toContain('새 본문')
  })
})

describe('PrdTab — autofix needs_input 영속화 연동 (2026-06)', () => {
  it('getPRD 의 autofix_needs_input 으로 store 복원을 시도한다 (새로고침 생존)', async () => {
    const items = [{ topic: '모델 제휴', question: '파라미터?' }]
    mountPrdTab({ prdSections: [baseSection({ autofix_needs_input: items })] })
    await flushPromises()

    expect(mocks.storeRestoreNeedsInput).toHaveBeenCalledWith('proj_x', items)
  })

  it('필드 없음(구버전 BE/로딩) — 복원도 클리어도 안 함 (배포 순서 안전)', async () => {
    mountPrdTab()  // baseSection 에 autofix_needs_input 없음 → undefined
    await flushPromises()
    expect(mocks.storeRestoreNeedsInput).not.toHaveBeenCalled()
    expect(mocks.storeSyncNeedsCleared).not.toHaveBeenCalled()
  })

  it('빈 배열(BE 가 비움 — 인터뷰 merge/타기기 dismiss) → 세션 패널 동기화 클리어', async () => {
    mountPrdTab({ prdSections: [baseSection({ autofix_needs_input: [] })] })
    await flushPromises()
    expect(mocks.storeSyncNeedsCleared).toHaveBeenCalledWith('proj_x')
    expect(mocks.storeRestoreNeedsInput).not.toHaveBeenCalled()
  })

  it('X(dismiss)가 BE 영속값도 함께 지운다', async () => {
    const wrapper = mountPrdTab()
    await flushPromises()

    wrapper.vm.dismissNeedsInput()
    await flushPromises()

    expect(mocks.storeClearNeedsInput).toHaveBeenCalledWith('proj_x')
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/prd/autofix/needs-input/dismiss'),
      expect.objectContaining({ project_name: 'proj_x' }),
    )
  })
})

describe('PrdTab — 큰 삭제 confirm', () => {
  let originalConfirm
  beforeEach(() => { originalConfirm = global.confirm })
  afterEach(() => { global.confirm = originalConfirm })

  const longContent = '# PRD\n\n' + 'a'.repeat(2000)
  const sectionWithLongContent = { prd_content: longContent, master_prd_id: 'PRD-1' }

  it('50% 이상 삭제 + 사용자 cancel → axios.patch 미호출', async () => {
    global.confirm = vi.fn(() => false)
    const wrapper = mountPrdTab({ prdSections: [sectionWithLongContent] })
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '# PRD\n\n짧음'  // 90% 이상 삭제
    await vm.saveEdit()

    expect(global.confirm).toHaveBeenCalled()
    expect(global.confirm.mock.calls[0][0]).toContain('삭제')
    expect(mocks.axiosPatch).not.toHaveBeenCalled()
  })

  it('50% 이상 삭제 + 사용자 confirm → axios.patch 호출', async () => {
    global.confirm = vi.fn(() => true)
    const wrapper = mountPrdTab({ prdSections: [sectionWithLongContent] })
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '# PRD\n\n짧음'
    await vm.saveEdit()
    await flushPromises()

    expect(global.confirm).toHaveBeenCalled()
    expect(mocks.axiosPatch).toHaveBeenCalled()
  })

  it('작은 변경 (10% 삭제) → confirm 안 함', async () => {
    global.confirm = vi.fn(() => true)
    const wrapper = mountPrdTab({ prdSections: [sectionWithLongContent] })
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    // 원본의 90% 유지
    vm.editContent = '# PRD\n\n' + 'a'.repeat(1800)
    await vm.saveEdit()
    await flushPromises()

    expect(global.confirm).not.toHaveBeenCalled()
    expect(mocks.axiosPatch).toHaveBeenCalled()
  })

  it('원본이 짧으면 (1000자 미만) confirm 안 함 — 가드 우회 정상', async () => {
    global.confirm = vi.fn(() => true)
    const shortSection = { prd_content: '# 짧은 PRD\n\n내용', master_prd_id: 'PRD-1' }
    const wrapper = mountPrdTab({ prdSections: [shortSection] })
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '# 새 내용\n\n다른 짧은 내용'
    await vm.saveEdit()
    await flushPromises()

    expect(global.confirm).not.toHaveBeenCalled()
    expect(mocks.axiosPatch).toHaveBeenCalled()
  })
})

// ─── [2026-06-11] 낙관적 잠금 + remoteBusy 가드 (PR #290 가치 회수) ─────────

describe('PrdTab — 낙관적 잠금 (lost-update 가드)', () => {
  it('편집 시작 시점의 last_updated 를 PATCH 에 client_updated_at 으로 동봉한다', async () => {
    const wrapper = mountPrdTab({
      prdSections: [baseSection({ last_updated: 1781000000 })],
    })
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '# PRD\n\n수정된 내용'
    await vm.saveEdit()

    expect(mocks.axiosPatch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/prd'),
      expect.objectContaining({ client_updated_at: 1781000000 }),
    )
  })

  it('409 충돌 시 충돌 토스트 + 편집 내용 보존(isEditing 유지) + saved 미발생', async () => {
    mocks.axiosPatch.mockRejectedValueOnce({ response: { status: 409 } })
    const wrapper = mountPrdTab({
      prdSections: [baseSection({ last_updated: 1781000000 })],
    })
    await flushPromises()

    const vm = wrapper.vm
    vm.startEdit()
    vm.editContent = '# PRD\n\n수정된 내용'
    await vm.saveEdit()

    expect(mocks.showError).toHaveBeenCalledWith(
      expect.stringContaining('다른 곳'), expect.anything(),
    )
    expect(vm.isEditing).toBe(true)          // 사용자가 복사/병합 판단할 기회 보존
    expect(wrapper.emitted('saved')).toBeFalsy()
  })
})

describe('PrdTab — remoteBusy 가드 (멀티디바이스)', () => {
  it('remoteBusy 면 runAutofix 차단 — LLM(store) 미호출 + 경고 토스트', async () => {
    const wrapper = mountPrdTab({ remoteBusy: true })
    await flushPromises()

    await wrapper.vm.runAutofix()

    expect(mocks.autofixRun).not.toHaveBeenCalled()
    expect(mocks.showWarning).toHaveBeenCalledWith(expect.stringContaining('다른 기기'))
  })

  it('remoteBusy 면 applyResynth 차단 — patch 미호출', async () => {
    const wrapper = mountPrdTab({ remoteBusy: true })
    await flushPromises()

    await wrapper.vm.applyResynth('# 새 내용')

    expect(mocks.axiosPatch).not.toHaveBeenCalled()
    expect(mocks.showWarning).toHaveBeenCalledWith(expect.stringContaining('다른 기기'))
  })

  it('remoteBusy 면 편집 버튼 비활성 + 사유 툴팁', async () => {
    const wrapper = mountPrdTab({ remoteBusy: true })
    await flushPromises()

    const btn = wrapper.find('.prd-edit-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.attributes('title')).toContain('다른 기기')
  })
})

// ─── [2026-06-24] Overview "Success Metrics:" 하위 항목 nesting ──────────────
// 사장님 지적: Success Metrics 밑 지표들이 같은 레벨 점(•)으로 떠서 소속이 안 보임.
// Epic 의 Acceptance Criteria 처럼 라벨 하위(continuation)로 묶고 점을 없애야 한다.
describe('PrdTab — Success Metrics 하위 nesting (overview 기본 탭)', () => {
  const overview = (smBlock) => [
    '## 🚀 PRD: [proj]', '',
    '### 1. Product Overview',
    '- **Product Vision**: 회의록을 PRD 로 변환한다.',
    smBlock,
    '- `[Role A]`: 기획자',
  ].join('\n')

  const smLiOf = (wrapper) =>
    wrapper.findAll('.markdown-content li').find(li => li.text().includes('Success Metrics'))
  const roleLiOf = (wrapper) =>
    wrapper.findAll('.markdown-content li').find(li => li.text().includes('Role A'))

  it('flat 같은 레벨 불릿 → 지표가 Success Metrics li 안으로 묶이고 점 사라짐', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: overview([
      '- **Success Metrics**:',
      '- 정량적 지표: 비용 30% 절감',
      '- 정성적 지표: 만족도 NPS 50+',
    ].join('\n')) })] })
    await flushPromises()

    const smLi = smLiOf(wrapper)
    expect(smLi).toBeTruthy()
    // 지표가 라벨과 같은 li 안에 포함 (별도 형제 불릿 아님)
    expect(smLi.text()).toContain('정량적 지표')
    expect(smLi.text()).toContain('정성적 지표')
    // Role 은 별도 li 로 보존 + 지표 미포함 (형제 라벨에서 nesting 종료)
    const roleLi = roleLiOf(wrapper)
    expect(roleLi).toBeTruthy()
    expect(roleLi.text()).not.toContain('정량적')
    // 지표가 자체 top-level li 로는 뜨지 않아야 함 (점 제거 확인)
    const standalone = wrapper.findAll('.markdown-content li')
      .filter(li => /^정량적 지표/.test(li.text().trim()))
    expect(standalone.length).toBe(0)
  })

  it('들여쓴 중첩 불릿 → 동일하게 라벨 하위로 묶임', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: overview([
      '- **Success Metrics**:',
      '  - 정량적 지표: 비용 30% 절감',
      '  - 정성적 지표: 만족도 NPS 50+',
    ].join('\n')) })] })
    await flushPromises()

    const smLi = smLiOf(wrapper)
    expect(smLi).toBeTruthy()
    expect(smLi.text()).toContain('정량적 지표')
    expect(smLi.text()).toContain('정성적 지표')
    expect(roleLiOf(wrapper).text()).not.toContain('정량적')
  })

  it('인라인 단일 Success Metrics → 변형 없음 (회귀)', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: overview(
      '- **Success Metrics**: 비용 30% 절감, 만족도 NPS 50+.'
    ) })] })
    await flushPromises()

    const smLi = smLiOf(wrapper)
    expect(smLi.text()).toContain('비용 30% 절감')
    // Role 은 여전히 별도 li
    expect(roleLiOf(wrapper)).toBeTruthy()
  })

  // ── [사후 하드닝] bug-hunt 가 찾은 엣지 4건 ──────────────────────
  it('굵은 **Role** 형제는 Success Metrics 로 흡수되지 않음', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: overview([
      '- **Success Metrics**:',
      '- 정량적 지표: 비용 30% 절감',
      '- **Role B**: 개발자',
    ].join('\n')) })] })
    await flushPromises()

    const smLi = smLiOf(wrapper)
    expect(smLi.text()).toContain('정량적 지표')
    expect(smLi.text()).not.toContain('Role B')   // 굵은 Role 흡수 안 됨
    const roleBLi = wrapper.findAll('.markdown-content li').find(li => li.text().includes('Role B'))
    expect(roleBLi).toBeTruthy()
    expect(roleBLi.text()).not.toContain('정량적')
  })

  it('산문형 "Success Metrics is ..." 는 라벨로 오인되어 뒤 리스트를 흡수하지 않음', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: overview([
      '- **Success Metrics** is our north star metric',
      '- Item one',
      '- Item two',
    ].join('\n')) })] })
    await flushPromises()

    const smLi = smLiOf(wrapper)
    expect(smLi.text()).toContain('north star')
    expect(smLi.text()).not.toContain('Item one')   // 흡수 안 됨
    const itemLi = wrapper.findAll('.markdown-content li').find(li => /^Item one/.test(li.text().trim()))
    expect(itemLi).toBeTruthy()                       // 별도 불릿으로 남음
  })

  it('코드펜스 안의 불릿 마커는 보존(SM 변환 미적용)', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: overview([
      '- **Success Metrics**: 비용 절감',
      '',
      '```',
      '- **Success Metrics**:',
      '- foo',
      '```',
    ].join('\n')) })] })
    await flushPromises()

    // 펜스 내부 '- foo' 의 대시가 살아있어야(코드블록으로 literal 렌더)
    const html = wrapper.find('.markdown-content').html()
    expect(html).toContain('- foo')
  })

  it('SM 하위가 AC 체크박스(- [ ])로 먼저 변환돼도 이후 평평 지표가 묶임', async () => {
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: overview([
      '- **Success Metrics**:',
      '- [ ] 정량 전환율 5% 이상',
      '- 정성 만족도 NPS 50',
    ].join('\n')) })] })
    await flushPromises()

    const smLi = smLiOf(wrapper)
    expect(smLi.text()).toContain('정량 전환율')   // AC 치환된 줄도 SM 하위로
    expect(smLi.text()).toContain('정성 만족도')   // 그 뒤 평평 지표도 SM 하위로
  })
})

describe('PrdTab — i18n 파서 견고성 (ja/zh 산출물)', () => {
  // parsedEpics: 'Epic' 단어가 번역(エピック/史诗)돼도 📦+숫자 앵커로 잡혀야 한다.
  it('parsedEpics — 번역된 Epic 단어(エピック/史诗)도 사이드바에 표시 + id 는 헤더와 일치', async () => {
    const prd = [
      '## 🚀 PRD: [proj]', '',
      '### 2. Epic & User Story Map',
      '#### 📦 エピック 1: アカウント管理',
      '- **[Story 1.1] ログイン**',
      '#### 📦 史诗 2: 账户管理',
      '- **[Story 2.1] 登录**',
    ].join('\n')
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: prd })] })
    await flushPromises()
    const epics = wrapper.vm.parsedEpics
    expect(epics).toHaveLength(2)
    expect(epics[0].id).toBe('エピック 1')      // id 는 헤더 그대로 — header.includes(id) 필터 동작 보장
    expect(epics[0].title).toBe('アカウント管理')
    expect(epics[1].id).toBe('史诗 2')
    // 영어 'Epic' 기존 포맷도 여전히 동작 (회귀 0)
    const ko = mountPrdTab({ prdSections: [baseSection({ prd_content:
      '### 2. Epic & User Story Map\n#### 📦 Epic 1: 계정' })] })
    await flushPromises()
    expect(ko.vm.parsedEpics[0].id).toBe('Epic 1')
  })

  // parsedNfr: 전각 콜론 '：'(일·중) 으로도 라벨 분리 + 기본 라벨 locale 화.
  it('parsedNfr — 전각 콜론 ：로도 카테고리 분리 (한 카드로 뭉치지 않음)', async () => {
    const prd = [
      '## 🚀 PRD: [proj]', '',
      '### 4. Global Non-Functional Requirements',
      '- **パフォーマンス**：応答時間は200ms以内',
      '- **可用性**：99.9%',
    ].join('\n')
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: prd })] })
    await flushPromises()
    const nfr = wrapper.vm.parsedNfr
    const titles = nfr.map(c => c.title)
    expect(titles).toContain('パフォーマンス')
    expect(titles).toContain('可用性')
    // 한국어 기본 라벨 '일반 (General)' 이 잘못된 단일 카드로 새지 않음
    expect(titles).not.toContain('일반 (General)')
  })

  // parsedScreens: 무괄호 + 번역된 'Screen:' 라벨(画面:/界面:/화면:)도 화면으로 인식.
  it('parsedScreens — 무괄호 번역 라벨(画面:/界面:) 화면도 사이드바에 표시', async () => {
    const prd = [
      '## 🚀 PRD: [proj]', '',
      '### 3. Screen Architecture',
      '#### 🖥️ 画面: ダッシュボード',   // ja 무괄호 + 번역 라벨
      '#### 🖥️ 界面：仪表盘',           // zh 무괄호 + 전각 콜론
      '#### 🖥️ [Screen: Plain]',        // 대괄호 영어 (회귀 0)
    ].join('\n')
    const wrapper = mountPrdTab({ prdSections: [baseSection({ prd_content: prd })] })
    await flushPromises()
    const names = wrapper.vm.parsedScreens.map(s => s.name)
    expect(names).toContain('ダッシュボード')
    expect(names).toContain('仪表盘')
    expect(names).toContain('Plain')
  })
})
