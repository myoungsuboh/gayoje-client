/**
 * lineage / lint store 의 AbortController cancel 패턴 단위 테스트.
 *
 * [검증]
 * - cancelAnalyzeLineage / cancelLint 가 axios 호출에 abort 신호 전달
 * - cancel 된 호출은 { success: false, cancelled: true } 응답
 * - in-flight 중 두 번째 호출 시 첫 호출 자동 취소 (race 안전)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// axios 모듈을 mock — 실제 네트워크 호출 없이 signal 전달만 검증.
vi.mock('@/utils/axios', () => {
  const post = vi.fn()
  return {
    default: {
      post,
      get: vi.fn(),
      delete: vi.fn(),
      isCancel: (e) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError',
    },
  }
})

import axios from '@/utils/axios'
import { useLineageStore } from '@/store/lineage'
import { useLintStore } from '@/store/lint'

const makeCancelablePromise = (signal) => new Promise((resolve, reject) => {
  // axios 처럼 signal.abort 시 reject.
  const onAbort = () => {
    const err = new Error('canceled')
    err.code = 'ERR_CANCELED'
    err.name = 'CanceledError'
    reject(err)
  }
  if (signal) {
    if (signal.aborted) { onAbort(); return }
    signal.addEventListener('abort', onAbort)
  }
  // 결코 resolve 되지 않음 (장기 호출 시뮬레이션)
})

describe('lineage store — cancelAnalyzeLineage', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useLineageStore()
    axios.post.mockReset()
  })

  it('cancel 호출 시 abort 신호가 전달되고 cancelled 응답 반환', async () => {
    let capturedSignal = null
    axios.post.mockImplementation((url, body, opts) => {
      capturedSignal = opts?.signal
      return makeCancelablePromise(opts?.signal)
    })
    const promise = store.analyzeLineage({ projectName: 'x' })
    // 다음 tick 대기 (axios.post 호출 완료)
    await Promise.resolve()
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal.aborted).toBe(false)

    store.cancelAnalyzeLineage()
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.cancelled).toBe(true)
    expect(store.isAnalyzingLineage).toBe(false)
  })

  it('in-flight 중 두 번째 analyzeLineage 호출 — 첫 호출 자동 취소', async () => {
    const signals = []
    axios.post.mockImplementation((url, body, opts) => {
      signals.push(opts?.signal)
      return makeCancelablePromise(opts?.signal)
    })

    const firstPromise = store.analyzeLineage({ projectName: 'x' })
    await Promise.resolve()
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(false)

    const secondPromise = store.analyzeLineage({ projectName: 'x' })
    await Promise.resolve()
    expect(signals).toHaveLength(2)
    // 첫 signal 이 abort 되어야 — 두 번째 호출이 cancelAnalyzeLineage() 먼저 호출
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)

    const firstResult = await firstPromise
    expect(firstResult.cancelled).toBe(true)
    // 두번째는 그대로 진행 중 — 명시적 cancel.
    store.cancelAnalyzeLineage()
    await secondPromise
  })

  it('성공 응답에서는 cancelled 플래그 없음', async () => {
    // [2026-05-26] 비동기 큐 — enqueue (post) 가 task_id 반환 → 폴링 (get
    // getJobStatus) 가 complete + result 반환.
    axios.post.mockResolvedValueOnce({ data: { status: 'accepted', task_id: 't1' } })
    // getJobStatus 응답은 _wrap → { result: { status, result, ... } } 형태.
    axios.get.mockResolvedValueOnce({
      data: { result: { task_id: 't1', status: 'complete', result: { stats: {}, summary: 'ok' } } },
    })
    const result = await store.analyzeLineage({ projectName: 'x' })
    expect(result.success).toBe(true)
    expect(result.cancelled).toBeUndefined()
    expect(store.isAnalyzingLineage).toBe(false)
  })

  it('cancel 후 isAnalyzingLineage 가 false 로 복귀 (finally 블록)', async () => {
    axios.post.mockImplementation((url, body, opts) => makeCancelablePromise(opts?.signal))
    const promise = store.analyzeLineage({ projectName: 'x' })
    await Promise.resolve()
    expect(store.isAnalyzingLineage).toBe(true)
    store.cancelAnalyzeLineage()
    await promise
    expect(store.isAnalyzingLineage).toBe(false)
  })
})

describe('lint store — cancelLint', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useLintStore()
    axios.post.mockReset()
  })

  it('cancelLint 호출 시 abort 신호 + cancelled 응답', async () => {
    axios.post.mockImplementation((url, body, opts) => makeCancelablePromise(opts?.signal))
    const promise = store.runLint({ projectName: 'x', githubUrl: 'https://github.com/x/y', force: true })
    await Promise.resolve()
    store.cancelLint()
    const result = await promise
    expect(result.cancelled).toBe(true)
    expect(store.isLinting).toBe(false)
  })

  it('cache hit 시엔 cancel 무관 (네트워크 호출 안 함)', async () => {
    store.setCachedLint('x', 'https://github.com/x/y', {
      result: { cases: [], stats: { total_cases: 0 } },
    })
    const result = await store.runLint({ projectName: 'x', githubUrl: 'https://github.com/x/y' })
    expect(result.success).toBe(true)
    expect(result.fromCache).toBe(true)
    expect(axios.post).not.toHaveBeenCalled()
  })
})
