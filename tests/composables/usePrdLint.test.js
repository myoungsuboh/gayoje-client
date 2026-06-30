/**
 * usePrdLint — PRD raw text lint composable.
 *
 * 검증:
 * - 짧은 text (< 50 bytes) → fetch 건너뜀
 * - debounce: 빠른 변경 시 마지막 1회만 호출
 * - 정상 응답 → report 채워짐
 * - 에러 → silent fail (report=null)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

vi.mock('@/utils/axios', () => ({
  default: { post: vi.fn() },
}))

import axios from '@/utils/axios'
import { usePrdLint } from '@/composables/usePrdLint'

describe('usePrdLint', () => {
  beforeEach(() => {
    axios.post.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('짧은 text 는 fetch 건너뜀', async () => {
    const text = ref('짧음')
    usePrdLint(text)
    await vi.advanceTimersByTimeAsync(700)
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('충분히 긴 text 는 debounce 후 fetch', async () => {
    axios.post.mockResolvedValue({
      data: {
        score: 0.82,
        issues: [],
        summary: { errors: 0, warnings: 0, infos: 0, stories_found: 3, size_bytes: 1500 },
      },
    })
    const text = ref('a'.repeat(60))
    const { report } = usePrdLint(text)
    await vi.advanceTimersByTimeAsync(700)
    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(report.value.score).toBe(0.82)
  })

  it('debounce — 빠른 연속 변경은 마지막 1회만', async () => {
    axios.post.mockResolvedValue({
      data: { score: 0.5, issues: [], summary: {} },
    })
    const text = ref('a'.repeat(60))
    usePrdLint(text)
    // 3번 빠르게 변경
    text.value = 'b'.repeat(60)
    text.value = 'c'.repeat(60)
    text.value = 'd'.repeat(60)
    await vi.advanceTimersByTimeAsync(700)
    expect(axios.post).toHaveBeenCalledTimes(1)
    // 마지막 변경 내용으로 호출
    expect(axios.post.mock.calls[0][1].text).toContain('d')
  })

  it('서버 에러 — report=null + error 메시지', async () => {
    axios.post.mockRejectedValue({
      response: { status: 500, data: { detail: '서버 오류' } },
    })
    const text = ref('a'.repeat(60))
    const { report, error } = usePrdLint(text)
    await vi.advanceTimersByTimeAsync(700)
    expect(report.value).toBeNull()
    expect(error.value).toBe('서버 오류')
  })

  it('정상 → loading 토글', async () => {
    let resolveFn
    axios.post.mockReturnValue(new Promise(r => { resolveFn = r }))
    const text = ref('a'.repeat(60))
    const { loading } = usePrdLint(text)
    await vi.advanceTimersByTimeAsync(700)
    expect(loading.value).toBe(true)
    resolveFn({ data: { score: 1.0, issues: [], summary: {} } })
    await vi.runAllTimersAsync()
    await Promise.resolve()
    expect(loading.value).toBe(false)
  })
})
