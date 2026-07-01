/**
 * enforceUserDataIsolationSync — 공용 PC 사용자 전환 격리 (race 차단) 회귀 가드.
 *
 * 핵심 시나리오: 사용자 A 의 영속 store(projectName 등)가 남아있는 브라우저에서
 * 사용자 B 가 로그인 → reload/navigation 시, hydration *전에* A 의 데이터가
 * 동기로 제거되어야 한다.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { enforceUserDataIsolationSync, OWNER_SCOPED_STORE_KEYS } from '@/utils/userIsolation'
import { APP_CACHE_KEYS } from '@/utils/cacheKeys'

const setUser = (email) =>
  localStorage.setItem('gayoje_user', JSON.stringify({ email }))

const setProjectState = (ownerEmail, projectName = 'P') =>
  localStorage.setItem(
    'gayoje_project_state_v1',
    JSON.stringify({ ownerEmail, projectName }),
  )

describe('enforceUserDataIsolationSync', () => {
  beforeEach(() => localStorage.clear())

  it('소유자가 다르면 user-scoped 영속 키를 제거하고 true 반환', () => {
    setUser('b@example.com')
    setProjectState('a@example.com', 'A-secret-project')
    localStorage.setItem('gayoje_lint_cache_v1', '{"x":1}')

    const scrubbed = enforceUserDataIsolationSync()

    expect(scrubbed).toBe(true)
    expect(localStorage.getItem('gayoje_project_state_v1')).toBeNull()
    // 앱 캐시도 함께 제거
    expect(localStorage.getItem('gayoje_lint_cache_v1')).toBeNull()
  })

  it('소유자가 같으면 아무것도 제거하지 않고 false 반환', () => {
    setUser('a@example.com')
    setProjectState('a@example.com', 'A-project')

    const scrubbed = enforceUserDataIsolationSync()

    expect(scrubbed).toBe(false)
    expect(localStorage.getItem('gayoje_project_state_v1')).not.toBeNull()
  })

  it('대소문자/공백 차이는 동일 사용자로 취급', () => {
    setUser('A@Example.com ')
    setProjectState('a@example.com')

    expect(enforceUserDataIsolationSync()).toBe(false)
    expect(localStorage.getItem('gayoje_project_state_v1')).not.toBeNull()
  })

  it('비로그인(gayoje_user 없음)이면 no-op', () => {
    setProjectState('a@example.com')

    expect(enforceUserDataIsolationSync()).toBe(false)
    expect(localStorage.getItem('gayoje_project_state_v1')).not.toBeNull()
  })

  it('소유자 미기록(legacy ownerEmail="")은 mismatch 로 보지 않음', () => {
    setUser('b@example.com')
    setProjectState('')

    expect(enforceUserDataIsolationSync()).toBe(false)
    expect(localStorage.getItem('gayoje_project_state_v1')).not.toBeNull()
  })

  it('OWNER_SCOPED_STORE_KEYS 는 APP_CACHE_KEYS 에도 포함돼 logout 시 함께 정리된다', () => {
    // drift 방지: 영속 store 키가 캐시 정리 목록에서 빠지면 logout 누락 위험.
    for (const k of OWNER_SCOPED_STORE_KEYS) {
      expect(APP_CACHE_KEYS).toContain(k)
    }
  })
})
