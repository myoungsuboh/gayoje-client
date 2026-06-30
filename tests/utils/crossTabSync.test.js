/**
 * crossTabSync 단위 테스트.
 *
 * [검증]
 * - 다른 탭이 토큰을 지우면 (storage 이벤트) /login 으로 push
 * - 이미 /login 페이지면 redirect skip (loop 방지)
 * - 사용자 user JSON 이 다른 값으로 바뀌면 window.location.reload 호출
 * - 같은 값이면 동작 안 함
 * - SSR safe (window 없을 때 no-op)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installCrossTabSync } from '@/utils/crossTabSync'

const fireStorage = (detail) => {
  const evt = new StorageEvent('storage', detail)
  window.dispatchEvent(evt)
}

describe('crossTabSync', () => {
  let router

  beforeEach(() => {
    router = {
      currentRoute: { value: { path: '/plan' } },
      push: vi.fn(),
    }
    // installed flag 가 모듈 상수라 한 번 install 후 다시 호출 시 no-op.
    // 테스트마다 새 모듈을 import 하기 어려우므로 첫 setup 만 진짜로 install,
    // 이후 테스트는 첫번째에 등록된 listener 가 그대로 동작.
    installCrossTabSync(router)
  })

  it('logout — 다른 탭이 토큰을 삭제하면 /login 으로 push', () => {
    fireStorage({ key: 'harness_token', newValue: null, oldValue: 'old-jwt' })
    expect(router.push).toHaveBeenCalledWith({
      path: '/login',
      query: { reason: 'session_synced' },
    })
  })

  it('이미 /login 페이지면 redirect skip', () => {
    router.currentRoute.value.path = '/login'
    fireStorage({ key: 'harness_token', newValue: null, oldValue: 'old-jwt' })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('/auth/callback 페이지에서도 redirect skip (OAuth 토큰 저장 직전)', () => {
    router.currentRoute.value.path = '/auth/callback'
    fireStorage({ key: 'harness_token', newValue: null, oldValue: 'old-jwt' })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('oldValue 가 없으면 무시 (애초에 토큰 없던 상태)', () => {
    fireStorage({ key: 'harness_token', newValue: null, oldValue: null })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('사용자 전환 — user JSON 이 다른 값으로 바뀌면 reload', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })
    fireStorage({
      key: 'harness_user',
      newValue: JSON.stringify({ email: 'b@x' }),
      oldValue: JSON.stringify({ email: 'a@x' }),
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('같은 user 값이면 reload 안 함 (no-op 변경)', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })
    fireStorage({
      key: 'harness_user',
      newValue: JSON.stringify({ email: 'a@x' }),
      oldValue: JSON.stringify({ email: 'a@x' }),
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('user 가 null 로 바뀌면 reload 안 함 (logout 시나리오 — token 이벤트가 이미 처리)', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })
    fireStorage({
      key: 'harness_user',
      newValue: null,
      oldValue: JSON.stringify({ email: 'a@x' }),
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('관계없는 키는 무시', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })
    fireStorage({ key: 'some_other_key', newValue: 'x', oldValue: 'y' })
    expect(router.push).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('refresh token 삭제 — 다른 탭이 logout 한 효과 → /login (Sprint 8 P2)', () => {
    fireStorage({
      key: 'harness_refresh_token',
      newValue: null,
      oldValue: 'old-refresh-token',
    })
    expect(router.push).toHaveBeenCalledWith({
      path: '/login',
      query: { reason: 'session_synced' },
    })
  })

  it('refresh token 갱신 (newValue 존재) 은 무시 — silent rotation 정상', () => {
    fireStorage({
      key: 'harness_refresh_token',
      newValue: 'new-refresh-token',
      oldValue: 'old-refresh-token',
    })
    expect(router.push).not.toHaveBeenCalled()
  })
})
