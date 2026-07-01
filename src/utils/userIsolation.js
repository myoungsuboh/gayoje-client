/**
 * 동기(sync) 사용자 데이터 격리 — 공용 PC / 사용자 전환 시 이전 사용자 데이터 노출 차단.
 *
 * [기존 문제 — race condition]
 * project / jobs store 는 pinia-plugin-persistedstate 로 localStorage 에서
 * *동기적으로* hydrate 된다. 반면 소유자 검증(_assertPiniaOwnership)은
 * `await import('@/store/...')` 기반 **비동기**라, 페이지 reload 직후
 * "hydrate 완료 → 컴포넌트 onMounted 에서 fetch → 그 다음에야 비동기 검증" 순서가
 * 되어 수십 ms 동안 *이전 사용자의 projectName 으로 API 가 호출*될 수 있었다.
 * (BE ownership guard 가 403 을 주지만, 그 사이 화면/캐시에 이전 사용자 흔적 노출.)
 *
 * [해결]
 * persisted store 가 hydrate 되기 *전에*, 그리고 매 navigation 마다 **완전 동기로**
 * localStorage 를 검사한다. 영속 상태에 박힌 ownerEmail 이 현재 로그인 사용자와
 * 다르면 해당 키 + 앱 캐시를 즉시 제거 → 이후 hydration 은 깨끗한 상태에서 시작.
 * 비동기 import 가 끼어들 틈이 없으므로 레이스가 원천 차단된다.
 */
import { APP_CACHE_KEYS } from '@/utils/cacheKeys'

const USER_KEY = 'gayoje_user'

// ownerEmail 을 영속화하는 user-scoped store 키들.
// 신규 user-scoped persisted store 추가 시 여기에 반드시 등록.
export const OWNER_SCOPED_STORE_KEYS = [
  'gayoje_project_state_v1',
  'gayoje_jobs_state_v1',
]

const _currentEmail = () => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return ''
    const u = JSON.parse(raw)
    return (u?.email || '').toLowerCase().trim()
  } catch {
    return ''
  }
}

/**
 * persisted store JSON 에 박힌 ownerEmail 을 읽음.
 * @returns {string|null} '' = 소유자 미기록(legacy), null = 키 없음/파싱실패
 */
const _storedOwner = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    return (obj?.ownerEmail || '').toLowerCase().trim()
  } catch {
    return null
  }
}

/**
 * 현재 로그인 사용자와 영속 상태의 소유자가 다르면 user-scoped 영속 키 + 앱 캐시를
 * localStorage 에서 즉시(동기) 제거한다.
 *
 * - 비로그인 상태(gayoje_user 없음)면 판단 불가 → no-op (logout 시 clearSession 이 정리).
 * - 소유자 미기록(legacy, ownerEmail='') 데이터는 mismatch 로 보지 않음
 *   (store 의 assertOwner 가 현재 사용자를 소유자로 채택하는 기존 동작과 일치).
 *
 * @returns {boolean} 스크럽 수행 여부
 */
export const enforceUserDataIsolationSync = () => {
  const email = _currentEmail()
  if (!email) return false

  let mismatched = false
  for (const key of OWNER_SCOPED_STORE_KEYS) {
    const owner = _storedOwner(key)
    if (owner && owner !== email) {
      mismatched = true
      break
    }
  }
  if (!mismatched) return false

  const toRemove = new Set([...OWNER_SCOPED_STORE_KEYS, ...APP_CACHE_KEYS])
  for (const k of toRemove) localStorage.removeItem(k)
  return true
}
