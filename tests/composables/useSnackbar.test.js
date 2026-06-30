import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSnackbar } from '@/composables/useSnackbar'

describe('useSnackbar', () => {
  let snackbar
  beforeEach(() => {
    snackbar = useSnackbar()
    snackbar.state.show = false
    snackbar.state.actionLabel = null
    snackbar.state.actionHandler = null
  })

  it('showSuccess 호출 시 색상 success + show=true', () => {
    snackbar.showSuccess('done')
    expect(snackbar.state.show).toBe(true)
    expect(snackbar.state.color).toBe('success')
    expect(snackbar.state.message).toBe('done')
    expect(snackbar.state.actionLabel).toBeNull()
  })

  it('showError 기본 timeout 5000', () => {
    snackbar.showError('boom')
    expect(snackbar.state.color).toBe('error')
    expect(snackbar.state.timeout).toBe(5000)
  })

  it('showErrorWithRetry: actionLabel 기본 "재시도", timeout 8000', () => {
    const fn = vi.fn()
    snackbar.showErrorWithRetry('실패', fn)
    expect(snackbar.state.color).toBe('error')
    expect(snackbar.state.actionLabel).toBe('재시도')
    expect(snackbar.state.actionHandler).toBe(fn)
    expect(snackbar.state.timeout).toBe(8000)
  })

  it('triggerAction: handler 실행 + show 끔', () => {
    const fn = vi.fn()
    snackbar.showErrorWithRetry('실패', fn)
    snackbar.triggerAction()
    expect(fn).toHaveBeenCalledOnce()
    expect(snackbar.state.show).toBe(false)
  })

  it('triggerAction: handler 없으면 안전하게 종료', () => {
    snackbar.showSuccess('ok')
    expect(() => snackbar.triggerAction()).not.toThrow()
    expect(snackbar.state.show).toBe(false)
  })

  it('커스텀 actionLabel 지원', () => {
    snackbar.showErrorWithRetry('rate limit', vi.fn(), { actionLabel: '5분 후 재시도' })
    expect(snackbar.state.actionLabel).toBe('5분 후 재시도')
  })
})
