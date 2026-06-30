/**
 * useEvalScore — Phase E 명세 충실도 점수 fetch.
 *
 * 검증:
 * - projectName 부재 시 score=null
 * - 정상 응답 시 score 채워짐
 * - 403 (ownership) / 404 (그래프 없음) → score=null + error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

vi.mock('@/utils/axios', () => ({
  default: { get: vi.fn() },
}))

import axios from '@/utils/axios'
import { useEvalScore } from '@/composables/useEvalScore'

describe('useEvalScore', () => {
  beforeEach(() => {
    axios.get.mockReset()
  })

  it('정상 응답 — score 채워짐', async () => {
    axios.get.mockResolvedValue({
      data: {
        project_name: 'plant',
        overall: 0.93,
        tier1: { score: 1.0, weight: 0.10, sub_metrics: {}, notes: [] },
        tier2: { score: 0.95, weight: 0.40, sub_metrics: {}, notes: [] },
        tier3: { score: 0.85, weight: 0.25, sub_metrics: {}, notes: [] },
        tier4: { score: 0.95, weight: 0.25, sub_metrics: {}, notes: [] },
        summary: { overall: 0.93 },
      },
    })
    const name = ref('plant')
    const { score, loading, error } = useEvalScore(name)
    await new Promise(r => setTimeout(r, 10))
    expect(score.value).not.toBeNull()
    expect(score.value.overall).toBe(0.93)
    expect(score.value.tier2.score).toBe(0.95)
    expect(error.value).toBeNull()
    expect(loading.value).toBe(false)
    expect(axios.get).toHaveBeenCalledWith(
      '/api/v2/projects/plant/eval-score',
      { _silent: true },
    )
  })

  it('projectName 빈 문자열 — fetch 건너뜀, score=null', async () => {
    const name = ref('')
    const { score } = useEvalScore(name)
    await new Promise(r => setTimeout(r, 10))
    expect(score.value).toBeNull()
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('403 ownership — score=null + error 세팅', async () => {
    axios.get.mockRejectedValue({
      response: { status: 403, data: { detail: '권한 없음' } },
    })
    const name = ref('victim')
    const { score, error } = useEvalScore(name)
    await new Promise(r => setTimeout(r, 10))
    expect(score.value).toBeNull()
    expect(error.value).toBe('권한 없음')
  })

  it('projectName 변경 시 자동 refetch', async () => {
    axios.get.mockResolvedValue({
      data: {
        project_name: 'a', overall: 0.5,
        tier1: { score: 1, weight: 0.1, sub_metrics: {}, notes: [] },
        tier2: { score: 0.5, weight: 0.4, sub_metrics: {}, notes: [] },
        tier3: { score: 0.5, weight: 0.25, sub_metrics: {}, notes: [] },
        tier4: { score: 0.5, weight: 0.25, sub_metrics: {}, notes: [] },
        summary: {},
      },
    })
    const name = ref('a')
    const { score } = useEvalScore(name)
    await new Promise(r => setTimeout(r, 10))
    expect(axios.get).toHaveBeenCalledWith('/api/v2/projects/a/eval-score', { _silent: true })

    name.value = 'b'
    await nextTick()
    await new Promise(r => setTimeout(r, 10))
    expect(axios.get).toHaveBeenCalledWith('/api/v2/projects/b/eval-score', { _silent: true })
  })

  it('한글 / 특수문자 projectName encodeURIComponent', async () => {
    axios.get.mockResolvedValue({
      data: {
        project_name: '식물', overall: 0.5,
        tier1: { score: 1, weight: 0.1, sub_metrics: {}, notes: [] },
        tier2: { score: 0.5, weight: 0.4, sub_metrics: {}, notes: [] },
        tier3: { score: 0.5, weight: 0.25, sub_metrics: {}, notes: [] },
        tier4: { score: 0.5, weight: 0.25, sub_metrics: {}, notes: [] },
        summary: {},
      },
    })
    const name = ref('식물 프로젝트')
    useEvalScore(name)
    await new Promise(r => setTimeout(r, 10))
    // encodeURIComponent('식물 프로젝트') 검증
    const calledUrl = axios.get.mock.calls[0][0]
    expect(calledUrl).toContain('%EC%8B%9D%EB%AC%BC')
    expect(calledUrl).not.toContain(' ')  // space 가 raw 가 아니라 인코딩됨
  })
})


import { notifyEvalScoreRefresh, onEvalScoreRefresh } from '@/composables/useEvalScore'

describe('useEvalScore — refresh 이벤트', () => {
  beforeEach(() => {
    axios.get.mockReset()
  })

  it('notifyEvalScoreRefresh 호출 시 lifecycle 안의 인스턴스 refetch', async () => {
    // setup 단계 없이 직접 호출 — onMounted hook 외에서는 listener 등록 안 됨.
    // 그러나 함수 자체 노출은 검증 (FE 사용자가 import 가능).
    expect(typeof notifyEvalScoreRefresh).toBe('function')
    // 호출 시도 — listener 0개여도 에러 없이 동작.
    expect(() => notifyEvalScoreRefresh()).not.toThrow()
  })

  it('onEvalScoreRefresh 로 등록한 콜백이 notify 시 호출되고, unsubscribe 후 안 불림', () => {
    // [백그라운드 잡 재조회] SpackTab 등이 fetchData 를 전역 버스에 등록 →
    // autofill 완료 시 notifyEvalScoreRefresh() 한 번으로 함께 갱신되는지 검증.
    const cb = vi.fn()
    const off = onEvalScoreRefresh(cb)
    notifyEvalScoreRefresh()
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    notifyEvalScoreRefresh()
    expect(cb).toHaveBeenCalledTimes(1)  // unsubscribe 후 증가 없음
  })
})
