/**
 * jobsStore 단일 잡 중지(stopJob / stopAllActiveJobs) — 2026-06-01.
 *
 * 사용자가 헤더 칩/진행 알림에서 "중지" 하면
 *   (1) UI 가 즉시 idle (activeJobs 비움),
 *   (2) poll 의 AbortSignal 이 끊겨 CanceledError 로 종료 → onError(실패 토스트)는
 *       호출되지 않아야 한다(사용자 의도적 중지는 실패가 아님).
 *
 * poll 을 "abort 전엔 pending, abort 되면 CanceledError reject" 로 mock 해서
 * stopJob 의 signal 전파까지 검증한다(별도 파일 — batch 테스트의 즉시 resolve mock 과 분리).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/asyncJob', () => ({
  pollJobUntilDone: vi.fn((taskId, opts = {}) => new Promise((_resolve, reject) => {
    const sig = opts.signal
    const fail = () => {
      const e = new Error('cancelled by user')
      e.name = 'CanceledError'
      reject(e)
    }
    if (sig) {
      if (sig.aborted) return fail()
      sig.addEventListener('abort', fail)
    }
    // signal 이 abort 되기 전엔 영원히 pending — 실 worker 가 도는 상황 모사.
  })),
}))
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() }),
}))

import { useJobsStore } from '@/store/jobs'

const tick = () => new Promise(r => setTimeout(r, 0))

describe('jobsStore — 단일 잡 중지', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stopJob 은 활성 잡을 즉시 비워 UI 를 idle 로 만든다', () => {
    const store = useJobsStore()
    store.startJob({ taskId: 't1', label: 'API 채우기', kind: 'postMeeting' })
    expect(store.activeCount).toBe(1)

    store.stopJob('t1')
    expect(store.activeCount).toBe(0)
    expect(store.hasActive).toBe(false)
  })

  it('중지된 잡은 onError(실패 토스트)를 호출하지 않는다', async () => {
    const store = useJobsStore()
    const onError = vi.fn()
    store.startJob({ taskId: 't2', label: 'x', kind: 'postMeeting', onError })

    store.stopJob('t2')
    // abort → poll 이 CanceledError reject → catch 가 microtask 로 처리될 시간 확보
    await tick()
    await tick()

    expect(onError).not.toHaveBeenCalled()
    expect(store.activeCount).toBe(0)
  })

  it('stopAllActiveJobs 는 모든 활성 단일 잡을 한 번에 비운다', () => {
    const store = useJobsStore()
    store.startJob({ taskId: 'a', kind: 'postMeeting' })
    store.startJob({ taskId: 'b', kind: 'autofill' })
    expect(store.activeCount).toBe(2)

    store.stopAllActiveJobs()
    expect(store.activeCount).toBe(0)
  })

  it('존재하지 않는 taskId 로 stopJob 해도 안전(no-op)', () => {
    const store = useJobsStore()
    expect(() => store.stopJob('nope')).not.toThrow()
    expect(() => store.stopJob(undefined)).not.toThrow()
    expect(store.activeCount).toBe(0)
  })
})
