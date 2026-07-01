/**
 * 멀티탭 (cross-tab) 상태 동기화.
 *
 * [문제]
 * 한 사용자가 같은 브라우저에서 탭 A 와 탭 B 를 동시에 열고:
 *   - 탭 A 에서 logout → 탭 B 는 stale 토큰으로 작업 지속 → 401 폭주 + 보안 위험
 *   - 탭 A 에서 다른 계정으로 로그인 → 탭 B 는 옛 사용자 캐시 노출
 *   - 탭 A 에서 projectName 변경 → 탭 B 는 옛 프로젝트 컨텍스트로 mutation
 *
 * [해결]
 * `window.addEventListener('storage', ...)` 는 *다른 탭* 에서 localStorage 가
 * 변경됐을 때만 발화한다 (같은 탭에선 발화 안 함 — 의도된 동작).
 *   - gayoje_token 삭제 → /login 으로 강제 이동
 *   - gayoje_user 변경 → hard reload (사용자 전환 — 모든 in-memory state 초기화)
 *
 * [수동 정리 (해당 탭만 로컬 변경)]
 * router 에서 router.push 만으로는 다른 탭에 알릴 수 없음 → 위 키를
 * localStorage.setItem/removeItem 으로 만지는 코드(`auth.clearSession` 등) 가
 * 자연스럽게 storage 이벤트를 발화.
 */

const TOKEN_KEY = 'gayoje_token'
const REFRESH_KEY = 'gayoje_refresh_token'
const USER_KEY = 'gayoje_user'
const PROJECT_KEY = 'gayoje_project_state_v1'

let installed = false
let _router = null   // listener 가 사용하는 router — install 마다 갱신 (테스트 재진입 안전).

export const installCrossTabSync = (router) => {
  _router = router
  if (installed) return
  if (typeof window === 'undefined') return   // SSR safe
  installed = true

  window.addEventListener('storage', (e) => {
    const router = _router  // 매 발화 시 최신 reference
    if (!router) return
    // 같은 키가 동일값으로 setItem 되면 storage 이벤트가 발화하지 않음 — 이미 안전.
    // newValue=null 은 removeItem 호출. oldValue 가 있던 경우만 의미 있음.

    // (1) 로그아웃 sync — 토큰이 사라지면 즉시 /login.
    if (e.key === TOKEN_KEY && e.newValue === null && e.oldValue) {
      const path = router?.currentRoute?.value?.path || ''
      if (path !== '/login' && path !== '/signup' && path !== '/auth/callback') {
        router.push({ path: '/login', query: { reason: 'session_synced' } })
      }
      return
    }

    // (2) 사용자 전환 sync — user 가 다른 값으로 바뀌면 모든 in-memory 캐시가 stale.
    //     hard reload 가 가장 안전 (모든 store / composable 초기화).
    //     newValue 가 null (logout) 인 경우는 (1) 에서 이미 처리.
    if (e.key === USER_KEY && e.newValue && e.oldValue && e.newValue !== e.oldValue) {
      window.location.reload()
      return
    }

    // (3) Refresh token 만료/회수 sync — Sprint 8 P2.
    //     한 탭에서 logout 또는 refresh 실패로 refresh token 이 지워지면, 다른 탭의
    //     access token 도 곧 만료. silent 하게 두면 다른 탭은 401 폭주 후에야 알아챔.
    //     refresh 가 회수됐다는 신호 자체로 즉시 /login 으로 이동시켜 사용자 친화.
    if (e.key === REFRESH_KEY && e.newValue === null && e.oldValue) {
      const path = router?.currentRoute?.value?.path || ''
      if (path !== '/login' && path !== '/signup' && path !== '/auth/callback') {
        router.push({ path: '/login', query: { reason: 'session_synced' } })
      }
      return
    }

    // (3) 프로젝트 전환 sync — 한 탭에서 다른 프로젝트로 전환했을 때 다른 탭이
    //     옛 프로젝트로 mutation 호출하면 BE 가 ownership 실패로 차단해 주지만
    //     UX 가 어색 (실패한 뒤에야 깨달음). 강한 동기화는 reload 가 가장 단순.
    //     단, 같은 사용자의 자연스러운 탭간 작업 흐름까지 끊기 싫어 reload 는
    //     선택적으로 적용 — 호출자가 강제 reload 가 필요한 경우 별도로 처리.
    //     기본 정책: pinia-plugin-persistedstate 가 store 를 LS 에서 hydrate 하는
    //     시점이 다음 navigation 부터라 자연 동기화. 즉시 sync 가 필요한 화면은
    //     해당 컴포넌트가 storage 이벤트를 별도 구독.
  })
}
