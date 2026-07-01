/**
 * EvalScoreCard.vue — PRD 완성도 모달(팝업) UX (2026-05-29).
 *
 * 변경: 헤더는 '기획서 완성도' trigger 만, 클릭 시 중앙 모달(VDialog)로 완성도 상세.
 * 기존 absolute 드롭다운 → 모달 전환. 비개발자 친화 콘텐츠.
 *
 * 검증:
 *  - 헤더 trigger: 기획서 완성도(탭 접두사 없음) + % + 탭별 항목
 *  - trigger 클릭 → 모달 콘텐츠 렌더 (점수 게이지, 보강 항목, 미연결 노드)
 *  - 영역별/위반은 '자세히 보기' 토글 후 노출
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import i18n from '@/plugins/i18n'

// jsdom navigator.language 는 'en' → i18n 마이그레이션 후 한국어 단언이 깨지지 않도록 ko 고정.
beforeEach(() => { i18n.global.locale.value = 'ko' })

// autofill 백그라운드 전환 — axios.post(enqueue) + jobsStore.startJob 모킹.
const _post = vi.fn()
vi.mock('@/utils/axios', () => ({ default: { post: (...a) => _post(...a) } }))
const _startJob = vi.fn()
let _activeJobs = []
vi.mock('@/store/jobs', () => ({
  useJobsStore: () => ({ startJob: _startJob, get activeJobs() { return _activeJobs } }),
}))

// autofill onComplete/onError 의 토스트 분기 검증을 위해 useSnackbar 스파이.
const _snack = vi.hoisted(() => ({
  showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn(),
}))
vi.mock('@/composables/useSnackbar', () => ({ useSnackbar: () => _snack }))

import EvalScoreCard from '@/components/design/EvalScoreCard.vue'

const SCORE_FIXTURE = {
  overall: 0.34,
  tier1: {
    score: 1.0,
    weight: 0.10,
    sub_metrics: {
      spack_apis_present: 1.0,
      spack_entities_present: 1.0,
      spack_policies_present: 1.0,
    },
  },
  tier2: {
    score: 0.61,
    weight: 0.40,
    sub_metrics: {
      api_error_cases_ratio: 0.0,
      api_auth_specified_ratio: 0.0,
      entity_attributes_present_ratio: 0.0,
      screen_story_mapped_ratio: 0.0,
      api_response_body_ratio: 1.0,
    },
  },
  tier3: {
    score: 0.0,
    weight: 0.25,
    sub_metrics: {
      api_story_mapped_ratio: 0.0,
      entity_lineage_direct_ratio: 0.0,
    },
  },
  tier4: {
    score: 0.0,
    weight: 0.25,
    sub_metrics: { error_score: 0.0, warning_score: 0.0 },
  },
  top_violation_codes: [
    { code: 'API_MISSING_STORY_REF', count: 24 },
    { code: 'API_ERROR_CASES_MISSING', count: 24 },
    { code: 'LINEAGE_MISSING', count: 20 },
  ],
  fix_targets: [
    {
      metric_key: 'api_error_cases_ratio',
      label: 'API 에러 응답 명시',
      tier: 2,
      missing: [
        { id: 'API-01', name: '작업 생성' },
        { id: 'API-02', name: '작업 조회' },
      ],
      missing_total: 2,
      total: 24,
      fix: "PRD Epic & Story 탭에서 이 API 의 Story 본문에 '권한 없으면 401' 같이 실패 케이스를 적으세요.",
      prd_section: 'epic',
    },
    {
      metric_key: 'entity_attributes_present_ratio',
      label: '데이터 필드 명시',
      tier: 2,
      missing: [{ id: 'ENT-01', name: 'Task' }],
      missing_total: 1,
      total: 9,
      fix: 'PRD Epic & Story 탭에서 해당 데이터를 다루는 Story 본문에 필드 목록을 적으세요.',
      prd_section: 'epic',
    },
  ],
}

// VDialog 를 가벼운 stub 으로 대체 — modelValue=true 면 slot 렌더 (Vuetify 인스턴스/
// teleport 회피). 모달 콘텐츠를 wrapper 안에서 그대로 검증 가능.
const mountOpts = {
  global: {
    // autofill 백그라운드 전환으로 useJobsStore(Pinia) 의존성 추가됨.
    plugins: [createPinia()],
    stubs: {
      VDialog: {
        name: 'VDialog',
        props: ['modelValue'],
        template: '<div class="v-dialog-stub" v-if="modelValue"><slot/></div>',
      },
    },
  },
}
const mountCard = (props) => mount(EvalScoreCard, { props, ...mountOpts })
const openModal = async (wrapper) => {
  await wrapper.find('.prd-trigger').trigger('click')
  return wrapper
}

describe('EvalScoreCard — 헤더 trigger (기획서 완성도)', () => {
  it('score 있으면 기획서 완성도 trigger + % 표시', () => {
    const w = mountCard({ score: SCORE_FIXTURE })
    expect(w.find('.prd-trigger').exists()).toBe(true)
    expect(w.text()).toContain('기획서 완성도')
    expect(w.text()).toContain('34%')
  })

  it('탭이 있어도 라벨에 탭 접두사(SPACK/DDD/Architecture)를 붙이지 않는다', () => {
    // [2026-06-24] 이 % 는 탭과 무관한 기획서 완성도 → 탭마다 다른 기능처럼 보이던 오해 제거.
    const w = mountCard({
      score: SCORE_FIXTURE,
      tabKey: 'spack',
      lineageItems: [{ label: 'Entity', coverage: { total: 9, direct: 0, inferred: 0, none: 9, coverage_pct: 0 } }],
    })
    expect(w.text()).toContain('기획서 완성도')
    expect(w.text()).not.toContain('SPACK PRD')
  })

  it('lineage 항목 % 가 trigger 에 표시', () => {
    const w = mountCard({
      score: SCORE_FIXTURE,
      tabKey: 'spack',
      lineageItems: [
        { label: 'API', coverage: { total: 24, direct: 24, inferred: 0, none: 0, coverage_pct: 100 } },
        { label: 'Entity', coverage: { total: 9, direct: 0, inferred: 0, none: 9, coverage_pct: 0 } },
      ],
    })
    const pcts = w.findAll('.prd-trigger__item-pct').map(n => n.text())
    expect(pcts).toContain('100%')
    expect(pcts).toContain('0%')
  })

  it('total=0 항목은 trigger 에서 숨김', () => {
    const w = mountCard({
      score: SCORE_FIXTURE,
      tabKey: 'spack',
      lineageItems: [
        { label: 'API', coverage: { total: 24, direct: 0, inferred: 0, none: 24, coverage_pct: 0 } },
        { label: 'Policy', coverage: { total: 0, direct: 0, inferred: 0, none: 0, coverage_pct: 0 } },
      ],
    })
    const labels = w.findAll('.prd-trigger__item-label').map(n => n.text())
    expect(labels).toContain('API')
    expect(labels).not.toContain('Policy')
  })

  it('score=null 이면 "아직 데이터 없음" (trigger 없음)', () => {
    const w = mountCard({ score: null })
    expect(w.text()).toContain('아직 데이터 없음')
    expect(w.find('.prd-trigger').exists()).toBe(false)
  })
})

describe('EvalScoreCard — 완성도 모달(팝업)', () => {
  it('trigger 클릭 시 모달 콘텐츠 렌더 (드롭다운 → 모달)', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    expect(w.find('.eval-modal__body').exists()).toBe(true)
    expect(w.text()).toContain('기획서 완성도')
  })

  it('모달 헤더에 큰 점수 게이지 + 비개발자 상태 문구', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    expect(w.find('.score-hero').exists()).toBe(true)
    // 34% → 30~50 구간 → "기초는 잡혔어요"
    expect(w.text()).toContain('기초는 잡혔어요')
  })

  it('지금 보강 항목 (fix_targets) 노출', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    const t = w.text()
    expect(t).toContain('지금 이것부터 채우면')
    expect(t).toContain('API 에러 응답 명시')
    expect(t).toContain('데이터 필드 명시')
  })

  it('구체적 항목 id+name chip 떠먹여주기', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    const t = w.text()
    expect(t).toContain('API-01')
    expect(t).toContain('작업 생성')
    expect(t).toContain('ENT-01')
    expect(t).toContain('Task')
    expect(w.findAll('.missing-chip').length).toBeGreaterThanOrEqual(3)
  })

  it('보강 항목에 N/총 카운트 + 액션 ▶', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    expect(w.findAll('.top-action-count').map(n => n.text())).toContain('2/24')
    expect(w.findAll('.top-action-fix').length).toBeGreaterThan(0)
  })

  it('미연결 8개 초과 시 "+N개 더" (fix_targets)', async () => {
    const score = {
      ...SCORE_FIXTURE,
      fix_targets: [{
        metric_key: 'api_error_cases_ratio',
        label: 'API 에러 응답 명시',
        tier: 2,
        missing: Array.from({ length: 8 }, (_, i) => ({ id: `API-0${i}`, name: `a${i}` })),
        missing_total: 12,
        total: 24,
        fix: '...',
        prd_section: 'epic',
      }],
    }
    const w = await openModal(mountCard({ score }))
    expect(w.find('.missing-chip--more').text()).toContain('+4개 더')
  })

  it('fix_targets 없으면 sub_metric fallback', async () => {
    const w = await openModal(mountCard({ score: { ...SCORE_FIXTURE, fix_targets: undefined } }))
    expect(w.findAll('.top-action-label').map(n => n.text())).toContain('API 에러 응답 명시')
  })

  it('4영역 미니 점수 (기본/내용/연결/오류)', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    expect(w.findAll('.score-mini__label').map(n => n.text())).toEqual(
      expect.arrayContaining(['기본', '내용', '연결', '오류']),
    )
  })

  it('영역별/위반 — "자세히 보기" 토글 후 Tier 부제목 + 위반 한글 노출', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    // 토글 전엔 영역별 상세 숨김 (v-show=false)
    await w.find('.adv-toggle').trigger('click')
    const t = w.text()
    expect(t).toContain('기본 항목')
    expect(t).toContain('세부 내용')
    expect(t).toContain('오류 없음')
    expect(t).toContain('어느 기능(Story)') // API_MISSING_STORY_REF 한글
    expect(w.findAll('.violation-fix').length).toBeGreaterThan(0)
  })
})

describe('EvalScoreCard 모달 — 탭별 PRD 연결 상세 (미연결 노드)', () => {
  const SPACK_LINEAGE = [{
    label: 'Entity',
    coverage: { total: 9, direct: 0, inferred: 0, none: 9, coverage_pct: 0 },
    unlinked: [{ id: 'ENT-01', name: 'Task' }, { id: 'ENT-02', name: 'Agent' }],
  }]

  it('모달에 "{탭} PRD 연결 상세" 섹션', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, tabKey: 'spack', lineageItems: SPACK_LINEAGE }))
    expect(w.find('.detail-lineage').exists()).toBe(true)
    expect(w.text()).toContain('SPACK PRD 연결 상세')
  })

  it('미연결 노드 chip (id+name)', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, tabKey: 'spack', lineageItems: SPACK_LINEAGE }))
    const t = w.text()
    expect(t).toContain('ENT-01')
    expect(t).toContain('Task')
    expect(t).toContain('ENT-02')
    expect(t).toContain('Agent')
    expect(w.findAll('.unlinked-chip').length).toBeGreaterThanOrEqual(2)
  })

  it('미연결 8개 초과 시 "+N개 더"', async () => {
    const items = [{
      label: 'Entity',
      coverage: { total: 20, direct: 0, inferred: 0, none: 20, coverage_pct: 0 },
      unlinked: Array.from({ length: 12 }, (_, i) => ({ id: `ENT-${i}`, name: `e${i}` })),
    }]
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, tabKey: 'spack', lineageItems: items }))
    expect(w.find('.unlinked-chip--more').text()).toContain('+4개 더')
  })

  it('전부 연결된 노드 종류는 "✓ 전부 PRD 와 연결됨"', async () => {
    const items = [{
      label: 'Service',
      coverage: { total: 6, direct: 6, inferred: 0, none: 0, coverage_pct: 100 },
      unlinked: [],
    }]
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, tabKey: 'architecture', lineageItems: items }))
    expect(w.find('.detail-lineage-allok').exists()).toBe(true)
  })

  it('lineage 없으면 상세 섹션 없음 (backward compat)', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    expect(w.find('.eval-modal__body').exists()).toBe(true)
    expect(w.find('.detail-lineage').exists()).toBe(false)
  })
})

describe('EvalScoreCard — PRD 연결 트리거 발견성 (코치마크 + 행동 문구)', () => {
  it('트리거에 행동 문구("자세히")가 보인다', () => {
    const w = mountCard({ score: SCORE_FIXTURE })
    const cta = w.find('.prd-trigger__cta')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('자세히')
  })

  it('첫 방문 시 코치마크 노출, 닫으면 사라지고 재마운트 시 안 뜸', async () => {
    try { localStorage.removeItem('gayoje_prd_trigger_coach_seen_v1') } catch { /* ignore */ }
    const w = mountCard({ score: SCORE_FIXTURE })
    await flushPromises()  // onMounted 가 showCoach=true 로 바꾼 뒤 렌더 반영 대기
    expect(w.find('.prd-coach').exists()).toBe(true)

    await w.find('.prd-coach__close').trigger('click')
    expect(w.find('.prd-coach').exists()).toBe(false)

    // 재마운트 — 이미 봤으므로 안 뜸
    const w2 = mountCard({ score: SCORE_FIXTURE })
    await flushPromises()
    expect(w2.find('.prd-coach').exists()).toBe(false)
  })

  it('점수 없으면(트리거 미표시) 코치마크도 안 뜸', () => {
    try { localStorage.removeItem('gayoje_prd_trigger_coach_seen_v1') } catch { /* ignore */ }
    const w = mountCard({ score: null })
    expect(w.find('.prd-coach').exists()).toBe(false)
  })
})

describe('EvalScoreCard 모달 — API 에러·인증 AI 자동 보완 버튼', () => {
  it('projectName 주면 autofill 버튼 노출', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, projectName: 'proj-x' }))
    expect(w.find('.autofill-btn').exists()).toBe(true)
    // [2026-06] design 업데이트에 autofill 이 편입돼 라벨이 '다시 채우기'(수동 재시도)로 변경.
    expect(w.find('.autofill-btn').text()).toContain('다시 채우기')
  })

  it('projectName 없으면 autofill 버튼 없음 (안전 기본값)', async () => {
    const w = await openModal(mountCard({ score: SCORE_FIXTURE }))
    expect(w.find('.autofill-btn').exists()).toBe(false)
  })

  it('클릭 시 enqueue → 백그라운드 잡 위임 → 모달 닫힘 (사용자 비차단)', async () => {
    _activeJobs = []
    _post.mockResolvedValueOnce({ data: { result: { task_id: 'task-af-1', status: 'accepted' } } })
    _startJob.mockClear()
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, projectName: 'proj-x' }))

    await w.find('.autofill-btn').trigger('click')
    await flushPromises()

    // enqueue 호출 + 백그라운드 잡 위임(autofill kind)
    expect(_post).toHaveBeenCalledTimes(1)
    expect(_post.mock.calls[0][0]).toContain('/api/v2/pipelines/autofill_api_specs')
    expect(_startJob).toHaveBeenCalledTimes(1)
    const jobArg = _startJob.mock.calls[0][0]
    expect(jobArg.taskId).toBe('task-af-1')
    expect(jobArg.kind).toBe('autofill')
    expect(typeof jobArg.onComplete).toBe('function')
    expect(typeof jobArg.onError).toBe('function')

    // 모달이 닫혀 사용자가 다른 작업 가능 (autofill 버튼이 더 이상 안 보임)
    expect(w.find('.autofill-btn').exists()).toBe(false)
  })

  it('같은 프로젝트 autofill 잡이 이미 진행 중이면 중복 enqueue 차단', async () => {
    _activeJobs = [{ kind: 'autofill', projectName: 'proj-x', taskId: 'running-1' }]
    _post.mockClear()
    _startJob.mockClear()
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, projectName: 'proj-x' }))

    await w.find('.autofill-btn').trigger('click')
    await flushPromises()

    expect(_post).not.toHaveBeenCalled()      // enqueue 안 함
    expect(_startJob).not.toHaveBeenCalled()  // 새 잡 안 만듦
    expect(w.find('.autofill-btn').exists()).toBe(false)  // 모달은 닫음
    _activeJobs = []  // 정리
  })
})

describe('EvalScoreCard — autofill onComplete 결과 분기 (2026-06-01)', () => {
  // 클릭으로 onComplete 콜백을 캡처한 뒤, 클릭 시 뜨는 "백그라운드 진행 중" 토스트
  // 흔적을 지우고 onComplete 만 단독 검증.
  async function captureOnComplete() {
    _activeJobs = []
    _post.mockResolvedValueOnce({ data: { result: { task_id: 't-af', status: 'accepted' } } })
    _startJob.mockClear()
    const w = await openModal(mountCard({ score: SCORE_FIXTURE, projectName: 'proj-x' }))
    await w.find('.autofill-btn').trigger('click')
    await flushPromises()
    const onComplete = _startJob.mock.calls[0][0].onComplete
    _snack.showSuccess.mockClear()
    _snack.showError.mockClear()
    return onComplete
  }

  it('전부 실패(generatedCount=0, failedCount>0) → 거짓 성공 대신 재시도 안내(showError)', async () => {
    const onComplete = await captureOnComplete()
    onComplete({ result: { meta: { generatedCount: 0, failedCount: 3, degradedCount: 0 }, apis: [] } })

    expect(_snack.showError).toHaveBeenCalledTimes(1)
    expect(_snack.showError.mock.calls[0][0]).toMatch(/한도|일시 오류|다시 시도/)
    expect(_snack.showSuccess).not.toHaveBeenCalled()
  })

  it('정상 생성(generatedCount>0, failedCount=0) → 성공 토스트(N건)', async () => {
    const onComplete = await captureOnComplete()
    onComplete({ result: { meta: { generatedCount: 5, failedCount: 0 }, apis: [] } })

    expect(_snack.showSuccess).toHaveBeenCalledTimes(1)
    expect(_snack.showSuccess.mock.calls[0][0]).toContain('5건')
    expect(_snack.showError).not.toHaveBeenCalled()
  })

  it('부분 성공(generated>0 + failed>0) → 성공 + 실패 꼬리 안내', async () => {
    const onComplete = await captureOnComplete()
    onComplete({ result: { meta: { generatedCount: 4, failedCount: 2 }, apis: [] } })

    expect(_snack.showSuccess).toHaveBeenCalledTimes(1)
    const msg = _snack.showSuccess.mock.calls[0][0]
    expect(msg).toContain('4건')
    expect(msg).toContain('2건')   // 실패 꼬리
    expect(_snack.showError).not.toHaveBeenCalled()
  })

  it('채울 대상 없음(generated=0, failed=0, link=0) → "보완할 항목 없음" 안내', async () => {
    const onComplete = await captureOnComplete()
    onComplete({ result: { meta: { generatedCount: 0, failedCount: 0, linkSavedCount: 0 }, apis: [] } })

    expect(_snack.showSuccess).toHaveBeenCalledTimes(1)
    expect(_snack.showSuccess.mock.calls[0][0]).toContain('보완할 항목이 없어요')
    expect(_snack.showError).not.toHaveBeenCalled()
  })

  // [2026-06-12 연결 채우기] 잡이 PRD 연결(스토리 추적)도 채운다 — linkSavedCount 분기.
  it('연결만 채움(generated=0, linkSaved>0) → "없음"이 아니라 연결 성공 안내', async () => {
    const onComplete = await captureOnComplete()
    onComplete({ result: { meta: { generatedCount: 0, failedCount: 0, linkSavedCount: 33 }, apis: [] } })

    expect(_snack.showSuccess).toHaveBeenCalledTimes(1)
    const msg = _snack.showSuccess.mock.calls[0][0]
    expect(msg).toContain('PRD 연결')
    expect(msg).toContain('33건')
    expect(_snack.showError).not.toHaveBeenCalled()
  })

  it('생성 + 연결 모두 채움 → 성공 토스트에 연결 꼬리 포함', async () => {
    const onComplete = await captureOnComplete()
    onComplete({ result: { meta: { generatedCount: 5, failedCount: 0, linkSavedCount: 12 }, apis: [] } })

    expect(_snack.showSuccess).toHaveBeenCalledTimes(1)
    const msg = _snack.showSuccess.mock.calls[0][0]
    expect(msg).toContain('5건')
    expect(msg).toContain('PRD 연결 12건')
    expect(_snack.showError).not.toHaveBeenCalled()
  })

  it('생성 실패만 있고 연결은 성공 → showError 가 아니라 연결 성공 + 실패 꼬리', async () => {
    const onComplete = await captureOnComplete()
    onComplete({ result: { meta: { generatedCount: 0, failedCount: 3, linkSavedCount: 7 }, apis: [] } })

    expect(_snack.showSuccess).toHaveBeenCalledTimes(1)
    const msg = _snack.showSuccess.mock.calls[0][0]
    expect(msg).toContain('PRD 연결')
    expect(msg).toContain('7건')
    expect(_snack.showError).not.toHaveBeenCalled()
  })
})
