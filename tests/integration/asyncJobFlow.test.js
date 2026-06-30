/**
 * 통합 검증: 비동기 큐 작업 enqueue → 폴링 → 완료/실패/취소 (asyncJob.js)
 *
 * 모든 무거운 파이프라인(postMeeting / createDesign / createMD ...)이 거치는 백본.
 * extractTaskId(응답 wrapper 흡수) + pollJobUntilDone(상태 머신)을 실제 모듈로 검증.
 *
 * 시나리오:
 *   1) 응답 wrapper 3종에서 task_id 추출
 *   2) queued → in_progress → complete 정상 흐름 (onProgress 매 폴링 호출)
 *   3) complete + error → throw
 *   4) result.error → throw
 *   5) 404 / 403 → 즉시 의미있는 메시지로 throw
 *   6) 일시 5xx → 재시도 후 성공
 *   7) AbortSignal → CanceledError 로 즉시 중단
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// store/harness 는 pinia 전체를 끌어오므로 API_BASE 만 가볍게 모킹.
vi.mock('@/store/harness', () => ({ API_BASE: '/api/gateway' }))

// axios 모킹 — get/post/isCancel.
vi.mock('@/utils/axios', () => {
  const mock = { get: vi.fn(), post: vi.fn(), isCancel: (e) => e?.name === 'CanceledError' }
  return { default: mock }
})

import axios from '@/utils/axios'
import { extractTaskId, pollJobUntilDone } from '@/utils/asyncJob'
import i18n from '@/plugins/i18n'
// pollJobUntilDone 의 throw 메시지가 i18n 사용 → 한국어 단언 위해 locale 고정
i18n.global.locale.value = 'ko'

// 폴링 간격을 1ms 로 줄여 실시간으로 빠르게 돌린다.
const fastOpts = (extra = {}) => ({ intervalMs: 1, maxWaitMs: 2000, ...extra })

const statusResp = (info) => ({ data: { result: info } })
const httpError = (status) => Object.assign(new Error(`http ${status}`), { response: { status } })

beforeEach(() => {
  axios.get.mockReset()
  axios.post.mockReset()
})

describe('extractTaskId — 응답 wrapper 흡수', () => {
  it('{ result: { task_id } }', () => {
    expect(extractTaskId({ result: { task_id: 'a' } })).toBe('a')
  })
  it('{ result: [{ task_id }] }', () => {
    expect(extractTaskId({ result: [{ task_id: 'b' }] })).toBe('b')
  })
  it('raw { task_id } / taskId', () => {
    expect(extractTaskId({ task_id: 'c' })).toBe('c')
    expect(extractTaskId({ taskId: 'd' })).toBe('d')
  })
  it('없으면 null', () => {
    expect(extractTaskId(null)).toBeNull()
    expect(extractTaskId({ result: {} })).toBeNull()
  })
})

describe('pollJobUntilDone — enqueue 후 폴링 흐름', () => {
  it('queued → in_progress → complete: 결과 반환 + onProgress 매번 호출', async () => {
    // enqueue 응답 (postMeeting) → task_id 추출
    axios.post.mockResolvedValueOnce({ data: { result: { task_id: 'job-1', status: 'queued' } } })
    const enqueue = await axios.post('/api/gateway/postMeeting', {})
    const taskId = extractTaskId(enqueue.data)
    expect(taskId).toBe('job-1')

    axios.get
      .mockResolvedValueOnce(statusResp({ task_id: 'job-1', status: 'queued' }))
      .mockResolvedValueOnce(statusResp({ task_id: 'job-1', status: 'in_progress' }))
      .mockResolvedValueOnce(statusResp({ task_id: 'job-1', status: 'complete', result: { ok: true } }))

    const progress = []
    const info = await pollJobUntilDone(taskId, fastOpts({ onProgress: (i) => progress.push(i.status) }))

    expect(info.status).toBe('complete')
    expect(info.result).toEqual({ ok: true })
    expect(progress).toEqual(['queued', 'in_progress', 'complete'])
    // getJobStatus 가 task_id 파라미터로 호출됐는지
    expect(axios.get).toHaveBeenCalledWith('/api/gateway/getJobStatus', expect.objectContaining({
      params: { task_id: 'job-1' },
    }))
  })

  it('complete 인데 info.error 있으면 throw', async () => {
    axios.get.mockResolvedValueOnce(statusResp({ status: 'complete', error: '쿼터를 초과했습니다' }))
    await expect(pollJobUntilDone('j', fastOpts())).rejects.toThrow('쿼터를 초과했습니다')
  })

  it('complete + result.error 있으면 throw', async () => {
    axios.get.mockResolvedValueOnce(statusResp({ status: 'complete', result: { error: '파싱 실패' } }))
    await expect(pollJobUntilDone('j', fastOpts())).rejects.toThrow('파싱 실패')
  })

  it('404 → 작업 없음 메시지로 즉시 throw (재시도 안 함)', async () => {
    axios.get.mockRejectedValueOnce(httpError(404))
    await expect(pollJobUntilDone('j', fastOpts())).rejects.toThrow('작업을 찾을 수 없거나 만료')
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('403 → 다른 사용자 작업 메시지로 즉시 throw', async () => {
    axios.get.mockRejectedValueOnce(httpError(403))
    await expect(pollJobUntilDone('j', fastOpts())).rejects.toThrow('다른 사용자의 작업')
  })

  it('일시 5xx → 다음 폴링에 재시도 후 성공', async () => {
    axios.get
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce(statusResp({ status: 'complete', result: { ok: 1 } }))
    const info = await pollJobUntilDone('j', fastOpts())
    expect(info.result).toEqual({ ok: 1 })
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('status not_found → throw', async () => {
    axios.get.mockResolvedValueOnce(statusResp({ status: 'not_found' }))
    await expect(pollJobUntilDone('j', fastOpts())).rejects.toThrow('작업을 찾을 수 없거나 만료')
  })

  it('AbortSignal 취소 → CanceledError 로 즉시 중단', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(pollJobUntilDone('j', fastOpts({ signal: ac.signal })))
      .rejects.toMatchObject({ name: 'CanceledError' })
    // aborted 면 폴링 전에 중단 — get 호출 0회
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('task_id 없으면 즉시 throw', async () => {
    await expect(pollJobUntilDone(null)).rejects.toThrow('task_id 가 없습니다')
  })
})
