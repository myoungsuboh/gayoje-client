/**
 * jobsStore batch chain — enqueueOne 이 현재 항목과 "다음 항목"을 함께 받는지 검증.
 *
 * [batch 파이프라이닝] BE 가 다음 회의 extract 를 선반입(prefetch)하려면 FE 가
 * 각 버전 enqueue 시 다음 entry 를 함께 넘겨야 한다. 마지막 항목은 next=null.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// 폴링은 즉시 완료로 mock — chain 이 다음 step 으로 진행되도록.
vi.mock('@/utils/asyncJob', () => ({
  pollJobUntilDone: vi.fn().mockResolvedValue({ status: 'complete' }),
  // 실제 구현과 동일 로직 — onComplete 의 prd.mode==='error' 분기가 mock 에서도 동작.
  isPrdError: (r) => r?.prd?.mode === 'error',
}))
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() }),
}))

import { useJobsStore } from '@/store/jobs'

const flush = async (cond, max = 100) => {
  for (let i = 0; i < max; i++) {
    if (cond()) return
    await new Promise(r => setTimeout(r, 0))
  }
}

describe('jobsStore — batch chain 이 enqueueOne 에 다음 항목을 전달', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('각 enqueueOne 호출이 (현재 entry, 다음 entry) 를 받고 마지막은 next=null', async () => {
    const store = useJobsStore()
    const calls = []
    const entries = [
      { version: 'V1', title: '', content: 'a' },
      { version: 'V2', title: '', content: 'b' },
      { version: 'V3', title: '', content: 'c' },
    ]

    store.runBatchChain({
      entries,
      projectName: 'proj',
      enqueueOne: async (entry, next) => {
        calls.push({ version: entry.version, next: next ? next.version : null })
        return `task-${entry.version}`
      },
      onAllComplete: () => {},
      onError: () => {},
    })

    await flush(() => calls.length === 3)

    expect(calls).toEqual([
      { version: 'V1', next: 'V2' },
      { version: 'V2', next: 'V3' },
      { version: 'V3', next: null },   // 마지막 항목 — 선반입 대상 없음
    ])
  })
})
