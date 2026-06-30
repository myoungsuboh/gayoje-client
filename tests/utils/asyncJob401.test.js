import { describe, it, expect, vi, beforeEach } from 'vitest'

// [2026-06-10] 폴링 401 가드 — 인터셉터의 refresh+재시도 후에도 401 이 반복되면
// (다중 탭 refresh 회전 충돌 등 세션 회복 불가) 무한 폴링 대신 세션 만료로 중단.
// 실사고: getJobStatus 401 이 3초 간격으로 682회 반복.
vi.mock('@/utils/axios', () => {
  const get = vi.fn()
  return { default: { get, isCancel: () => false } }
})

import axios from '@/utils/axios'
import { pollJobUntilDone } from '@/utils/asyncJob'

const err401 = () => {
  const e = new Error('Request failed with status code 401')
  e.response = { status: 401 }
  return e
}

describe('pollJobUntilDone — 401 연속 가드', () => {
  beforeEach(() => {
    axios.get.mockReset()
  })

  it('401 이 3연속이면 세션 만료 에러로 중단 (무한 폴링 방지)', async () => {
    axios.get.mockRejectedValue(err401())

    await expect(
      pollJobUntilDone('task-1', { intervalMs: 1 }),
    ).rejects.toThrow(/세션|session|セッション|会话/i)

    // 3회에서 끊겨야 한다 — 수백 회 헛폴링 금지.
    expect(axios.get).toHaveBeenCalledTimes(3)
  })

  it('401 이 일시적(2회)이고 회복되면 정상 완료 — streak 리셋', async () => {
    axios.get
      .mockRejectedValueOnce(err401())
      .mockRejectedValueOnce(err401())
      .mockResolvedValueOnce({
        data: { result: [{ task_id: 'task-1', status: 'complete', result: { ok: true } }] },
      })

    const info = await pollJobUntilDone('task-1', { intervalMs: 1 })

    expect(info.status).toBe('complete')
    expect(axios.get).toHaveBeenCalledTimes(3)
  })

  it('5xx 는 기존대로 재시도 (401 가드와 무관)', async () => {
    const e500 = new Error('boom')
    e500.response = { status: 500 }
    axios.get
      .mockRejectedValueOnce(e500)
      .mockResolvedValueOnce({
        data: { result: [{ task_id: 'task-1', status: 'complete', result: {} }] },
      })

    const info = await pollJobUntilDone('task-1', { intervalMs: 1 })
    expect(info.status).toBe('complete')
  })
})
