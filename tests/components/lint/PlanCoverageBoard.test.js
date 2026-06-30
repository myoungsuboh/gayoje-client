/**
 * PlanCoverageBoard.vue — 기획 항목 구현 현황 보드 (2026-06-24).
 *
 * 검증: lint 기획 case(cases[4]) → 화면/Story ✅·❌ 렌더, 진행률, 근거 토글,
 *       빈 상태, 누락분 AI 수정 지시 복사(누락만 포함 + 토스트).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'

const _snack = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock('@/composables/useSnackbar', () => ({ useSnackbar: () => _snack }))

const _copy = vi.hoisted(() => ({ fn: vi.fn(() => Promise.resolve(true)) }))
vi.mock('@/utils/exportDoc', () => ({ copyToClipboard: (...a) => _copy.fn(...a) }))

import PlanCoverageBoard from '@/components/lint/PlanCoverageBoard.vue'

beforeEach(() => {
  _snack.showSuccess.mockClear(); _snack.showError.mockClear()
  _copy.fn.mockClear(); _copy.fn.mockResolvedValue(true)
  i18n.global.locale.value = 'ko'
})

const planCase = {
  id: 4, title: '기획 항목 구현율', convergence: 50,
  rules: [
    { rule: 'screen:s1', description: '회의실 현황 및 예약', applied: true,
      evidence: [{ file: 'src/pages/Rooms.vue', line: 12, snippet: '', kind: 'route' }] },
    { rule: 'screen:s2', description: '내 예약 및 체크인', applied: false, evidence: [] },
    { rule: 'story:1.1', description: '[Story 1.1] 회의실 현황 실시간 조회', applied: true, evidence: [] },
    { rule: 'story:2.2', description: '[Story 2.2] 노쇼 이력 관리', applied: false, evidence: [] },
  ],
}

const mountIt = (props = {}) =>
  mount(PlanCoverageBoard, {
    props: { planCase, githubUrl: 'https://github.com/me/repo', ...props },
    global: { plugins: [i18n] },
  })

describe('PlanCoverageBoard', () => {
  it('항목을 화면/Story 그룹으로 ✅·❌ 렌더 + 진행률', () => {
    const w = mountIt()
    expect(w.findAll('.pcb__item')).toHaveLength(4)
    // 2/4 구현 → 50%
    expect(w.text()).toContain('4개 중 2개 구현')
    expect(w.text()).toContain('50%')
    // 미구현 항목 표시
    const missItems = w.findAll('.pcb__item--miss')
    expect(missItems).toHaveLength(2)
  })

  it('근거가 있는 항목만 토글로 file:line GitHub 링크 노출', async () => {
    const w = mountIt()
    // 근거 토글 버튼은 evidence 있는 1개 항목에만
    const toggles = w.findAll('.pcb__ev-toggle')
    expect(toggles).toHaveLength(1)
    // 펼치기 전엔 링크 없음
    expect(w.find('.pcb__ev-link').exists()).toBe(false)
    await w.find('.pcb__row--clickable').trigger('click')
    const link = w.find('.pcb__ev-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toContain('/blob/HEAD/src/pages/Rooms.vue#L12')
  })

  it('누락 복사 → 누락 항목만 담긴 지시 복사 + 성공 토스트', async () => {
    const w = mountIt()
    await w.find('.pcb__copy-btn').trigger('click')
    expect(_copy.fn).toHaveBeenCalledTimes(1)
    const payload = _copy.fn.mock.calls[0][0]
    // 누락 2건 포함, 구현된 항목은 제외
    expect(payload).toContain('내 예약 및 체크인')
    expect(payload).toContain('[Story 2.2] 노쇼 이력 관리')
    expect(payload).not.toContain('회의실 현황 및 예약')
    expect(payload).not.toContain('실시간 조회')
    expect(_snack.showSuccess).toHaveBeenCalledTimes(1)
  })

  it('복사 실패 시 에러 토스트', async () => {
    _copy.fn.mockResolvedValueOnce(false)
    const w = mountIt()
    await w.find('.pcb__copy-btn').trigger('click')
    expect(_snack.showError).toHaveBeenCalledTimes(1)
  })

  it('누락 0건이면 복사 버튼 대신 완료 메시지', () => {
    const allDone = {
      id: 4, title: '기획 항목 구현율', convergence: 100,
      rules: [{ rule: 'screen:s1', description: 'A', applied: true, evidence: [] }],
    }
    const w = mountIt({ planCase: allDone })
    expect(w.find('.pcb__copy-btn').exists()).toBe(false)
    expect(w.find('.pcb__done-msg').exists()).toBe(true)
  })

  it('plan:empty placeholder 면 빈 상태 안내', () => {
    const empty = {
      id: 4, title: '기획 항목 구현율', convergence: 0,
      rules: [{ rule: 'plan:empty', description: '기획 항목이 없습니다', applied: false, evidence: [] }],
    }
    const w = mountIt({ planCase: empty })
    expect(w.find('.pcb__empty').exists()).toBe(true)
    expect(w.find('.pcb__item').exists()).toBe(false)
  })
})
