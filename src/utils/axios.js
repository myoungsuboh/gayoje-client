/**
 * 공용 axios 인스턴스 — 전 호출에 자동으로 JWT Bearer 첨부 + 401 시 refresh 시도.
 *
 * [Request 인터셉터]
 *  - localStorage 의 access token 을 Authorization 헤더로 첨부
 *  - /auth/login, /auth/signup, /auth/refresh 는 인증 불필요 → 첨부 안 함
 *
 * [Response 인터셉터 — 401 흐름]
 *  1. 호출 URL 이 /auth/* (login/signup/refresh) → 그대로 reject (호출자 처리)
 *  2. 이미 /login 또는 /signup 화면 → 그대로 reject
 *  3. refresh_token 보유 → POST /auth/refresh 로 새 access 발급 후 원 요청 재실행
 *     - refresh 자체가 실패하거나 refresh token 자체가 없으면 → 세션 정리 + /login
 *     - 동시 401 폭주 시: 진행중인 refresh Promise 를 공유 (single-flight)
 *
 *  네트워크 단절 (response 없음): 토스트로 안내.
 */
import axios from 'axios'
import { useSnackbar } from '@/composables/useSnackbar'
import i18n from '@/plugins/i18n'

// 비컴포넌트(util)에서 번역 — store/lint.js · composables 와 동일 패턴.
const t = (key, params) => i18n.global.t(key, params)

const TOKEN_KEY = 'gayoje_token'
const REFRESH_KEY = 'gayoje_refresh_token'
const USER_KEY = 'gayoje_user'

// 인증이 필요 없는 엔드포인트 (Bearer 첨부 안 함 + refresh/리다이렉트 대상 제외)
const AUTH_FREE_PATHS = ['/auth/login', '/auth/signup', '/auth/refresh']

const isAuthFreePath = (url) => {
  if (!url) return false
  return AUTH_FREE_PATHS.some((p) => url.includes(p))
}

/**
 * BE GitHub 프록시 (/api/github/*) 호출인지.
 *
 * 이 경로의 401 은 두 가지 의미가 섞여있다:
 *   (a) 우리 JWT 만료 — refresh 로 해결됨
 *   (b) 사용자의 GitHub OAuth 미연결 / private repo 권한 없음 — refresh 로 안 풀림
 *
 * (b) 의 경우 axios 가 retry 후 또 401 받으면 `redirectToLogin` 으로 가는데, 그러면
 * 사용자가 로그인 페이지에서 GitHub 로그인 시도 → callback 에서 link 안 일어남
 * (email 충돌) → 결국 무한 루프. 따라서 GitHub 프록시 401 은 retry 후 호출자에게
 * 그대로 위임해 사용자 친화 안내 (프로필에서 GitHub 연결) 를 띄우게 한다.
 */
const isGithubProxyPath = (url) => {
  if (!url) return false
  return /\/api\/github(\/|\?|$)/.test(url)
}

const isOnAuthPage = () => {
  if (typeof window === 'undefined') return false
  const p = window.location.pathname || ''
  return p.startsWith('/login') || p.startsWith('/signup')
}

/**
 * [Phase F] 프로젝트 작업 API 인지 — 팀 컨텍스트(team_id) 자동 첨부 대상.
 *
 * 팀 프로젝트를 열면 project store 의 activeTeamId 가 set 되고, 그 동안의 모든
 * 프로젝트 mutation/read 호출에 team_id 를 자동 동봉해야 BE 가 팀 멤버십으로
 * 권한을 검증한다. 단, auth/usage/me 등 비-프로젝트 호출엔 첨부하면 안 되므로
 * gateway / v2 경로로 한정한다.
 */
const isProjectApiPath = (url) => {
  if (!url) return false
  return (
    url.includes('/api/gateway')
    || url.includes('/gateway/')
    || url.includes('/api/v2')
  )
}

/**
 * 활성 팀 id 미러 — project store 가 setTeamContext 로 갱신한다.
 * axios 가 store 를 직접 import 하면 순환참조(store→axios) 가 되므로, 반대로
 * store 가 이 setter 를 호출해 단방향으로 주입한다.
 */
let _activeTeamId = ''

export const setTeamContext = (teamId) => {
  _activeTeamId = teamId || ''
}

const AUTH_BASE = import.meta.env.VITE_API_BASE_URL || ''

const instance = axios.create({
  baseURL: AUTH_BASE,
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request 인터셉터 ─────────────────────────────────────────────
instance.interceptors.request.use(
  (config) => {
    // 호출자가 명시적으로 skipAuth: true 를 넘기면 무시
    if (config?.skipAuth) return config

    // 인증 미필요 경로 (login/signup/refresh) 는 첨부 안 함
    if (isAuthFreePath(config?.url)) return config

    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers = config.headers || {}
      // 사용자 명시 헤더가 있으면 덮어쓰지 않음 (e.g. logoutApi 가 별도 토큰 전달 시)
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    // [Phase F] 팀 컨텍스트 자동 첨부 — 활성 팀이 있고 프로젝트 API 호출일 때만.
    // 호출자가 이미 team_id 를 명시했으면 존중 (덮어쓰지 않음).
    if (_activeTeamId && isProjectApiPath(config?.url)) {
      const method = (config.method || 'get').toLowerCase()
      if (method === 'get') {
        config.params = config.params || {}
        if (config.params.team_id == null) config.params.team_id = _activeTeamId
      } else if (config.data && typeof config.data === 'object' && !Array.isArray(config.data)) {
        if (config.data.team_id == null) config.data.team_id = _activeTeamId
      } else if (config.data == null) {
        config.data = { team_id: _activeTeamId }
      }
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ─── Refresh 헬퍼 ────────────────────────────────────────────────
// 동시 401 폭주 시 refresh 를 1회만 수행 (single-flight). 진행 중이면 그 Promise 를 공유.
let _refreshInflight = null
let _redirecting = false

// 캐시 키 단일 정의는 utils/cacheKeys.js — auth.js 와 공유.
import { APP_CACHE_KEYS } from '@/utils/cacheKeys'

const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
  for (const k of APP_CACHE_KEYS) {
    localStorage.removeItem(k)
  }
}

const redirectToLogin = (showError) => {
  if (_redirecting) return
  _redirecting = true
  clearSession()
  showError(t('errors.session_expired'))
  setTimeout(() => {
    _redirecting = false
    window.location.assign('/login')
  }, 100)
}

/**
 * refresh token 으로 새 (access, refresh) 페어 발급.
 *
 * [2026-05 회전 (rotation) 패턴]
 * BE 가 매 /refresh 호출마다 새 refresh 도 함께 발급. 응답에서 refresh_token 도
 * 받아 localStorage 갱신해야 함. 이전 refresh 는 BE 에서 즉시 blacklist 등록되어
 * 재사용 시 401. 옛 BE (refresh_token 누락 응답) 와의 호환을 위해 응답에
 * refresh_token 이 없으면 기존 토큰 유지 (덮어쓰기 안 함).
 *
 * 성공 시 새 access token 문자열 반환. 실패 시 null.
 */
const performRefresh = async () => {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return null
  try {
    // refresh 호출 자체는 인터셉터를 거치지 않게 raw axios 사용 (재귀 방지)
    const res = await axios.post(
      `${AUTH_BASE}/auth/refresh`,
      { refresh_token: refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 },
    )
    const newAccess = res?.data?.access_token
    const newRefresh = res?.data?.refresh_token
    if (!newAccess) return null
    localStorage.setItem(TOKEN_KEY, newAccess)
    // 회전된 새 refresh 가 응답에 있으면 함께 갱신. 옛 BE 호환 — 없으면 기존 유지.
    if (newRefresh && typeof newRefresh === 'string') {
      localStorage.setItem(REFRESH_KEY, newRefresh)
    }
    return newAccess
  } catch {
    return null
  }
}

const getRefreshPromise = () => {
  if (!_refreshInflight) {
    _refreshInflight = performRefresh().finally(() => {
      // 다음 401 사이클에서는 새로 시도하도록 즉시 클리어
      _refreshInflight = null
    })
  }
  return _refreshInflight
}

// ─── Response 인터셉터 ────────────────────────────────────────────

instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { showError } = useSnackbar()
    const status = error?.response?.status
    const config = error?.config || {}
    const url = config?.url || error?.response?.config?.url || ''

    if (!error.response) {
      // [2026-05-25 fix] 모바일 LTE 화면 전환 시 inflight abort / 백그라운드
      // polling 의 일시 실패도 모두 "네트워크 연결" 토스트로 표시되던 버그.
      // 다음 케이스는 silent:
      //   1) ERR_CANCELED (명시적 abort)
      //   2) ECONNABORTED (timeout / abort)
      //   3) AxiosError 의 message 가 'canceled' / 'aborted'
      //   4) config._silent === true (백그라운드 호출이 명시적 silent 요청)
      const isSilentCase =
        error.code === 'ERR_CANCELED' ||
        error.code === 'ECONNABORTED' ||
        /cancel|abort/i.test(error.message || '') ||
        config?._silent === true
      if (!isSilentCase) {
        console.error('[Network Error]', error.message)
        showError(t('errors.network'))
      } else {
        // 토스트 생략, console 만 (디버깅 용)
        console.debug('[Network Silent]', error.code || '', error.message)
      }
      return Promise.reject(error)
    }

    // [2026-05-28] 인터셉터의 blanket console.error 가 정상 흐름까지 빨갛게 찍어 콘솔을
    // 오염시켰다: 새 프로젝트의 getCPS/getPRD 403·404(='데이터 없음', 호출부가 빈 상태로
    // 정상 처리)와 _silent 백그라운드 호출까지. 이런 예상/조용한 케이스는 console.debug 로
    // 강등하고, 진짜 서버 오류(5xx)·기타 4xx 만 console.error 로 남긴다. (사용자 토스트 등
    // 실제 에러 처리는 아래 로직이 그대로 담당 — 로그 레벨만 조정.)
    const _quietHttp = config?._silent === true || status === 403 || status === 404
    if (_quietHttp) {
      console.debug('[HTTP Error]', status, url)
    } else {
      console.error('[HTTP Error]', status, url)
    }

    // ── LLM (Gemini) 에러 분기 ──
    // BE 가 detail = {code, message, legacy_message} 로 구조화 응답.
    //   code: 'gemini_quota' | 'gemini_auth' | 'gemini_transient' | 'gemini_unknown'
    //   message: 사람 친화 한국어
    //   legacy_message: 이전 prefix 문자열 (옛 BE 와 호환)
    //
    // 옛 BE 빌드 호환: detail 이 문자열 + '[gemini_' prefix 패턴이면 그대로 매칭.
    const detail = error?.response?.data?.detail
    const geminiCode = (() => {
      if (detail && typeof detail === 'object' && typeof detail.code === 'string'
          && detail.code.startsWith('gemini_')) {
        return detail.code
      }
      if (typeof detail === 'string' && detail.startsWith('[gemini_')) {
        // legacy: [gemini_quota] ... → 'gemini_quota'
        const m = detail.match(/^\[(gemini_[a-z]+)\]/)
        return m ? m[1] : null
      }
      return null
    })()

    if (geminiCode) {
      const userMessages = {
        gemini_quota: t('errors.ai.quota'),
        gemini_auth: t('errors.ai.auth'),
        gemini_transient: t('errors.ai.transient'),
      }
      const timeoutMs = geminiCode === 'gemini_transient' ? 5000 : 6000
      showError(
        userMessages[geminiCode] || t('errors.ai.unknown'),
        { timeout: timeoutMs },
      )
      return Promise.reject(error)
    }

    // ── 402 (Payment Required) — quota 한도 초과 ──
    // BE 의 quota 가드(/postMeeting 등)가 402 + detail.code === 'QUOTA_EXCEEDED' 응답.
    // FE 는 글로벌 UpgradePromptDialog 를 띄워 한도 정보 + Pro 안내를 노출.
    // 호출자에게도 그대로 reject 위임 (개별 라우트가 추가 UX 처리 가능).
    if (status === 402 && detail && typeof detail === 'object' && detail.code === 'QUOTA_EXCEEDED') {
      try {
        // 동적 import — axios.js 가 부팅 초기에 로드되므로 composable 의 reactive 가
        // 준비된 후에 안전하게 호출.
        const { useUpgradePrompt } = await import('@/composables/useUpgradePrompt')
        const { showQuotaExceeded } = useUpgradePrompt()
        showQuotaExceeded(detail)
      } catch (e) {
        console.error('[Quota] failed to show upgrade dialog', e)
      }
      return Promise.reject(error)
    }

    // ── 429 (rate limit) — 사용자 친화 안내 후 호출부에 위임 ──
    // slowapi 가 Retry-After 헤더로 대기 초를 줌. 메시지에 노출해 클릭 자제 유도.
    if (status === 429) {
      // [2026-06] 동시요청 제한 — 무거운 작업 동시 실행 한도 초과. 전용 안내.
      if (detail && typeof detail === 'object' && detail.code === 'CONCURRENCY_LIMIT') {
        showError(t('errors.concurrency_limit'))
        return Promise.reject(error)
      }
      const retryAfter = error?.response?.headers?.['retry-after']
      const sec = parseInt(retryAfter, 10)
      const suffix = Number.isFinite(sec) && sec > 0 ? t('errors.rate_limited_retry', { sec }) : ''
      showError(t('errors.rate_limited', { suffix }))
      return Promise.reject(error)
    }

    if (status !== 401) {
      // 그 외 HTTP 에러는 호출부에 그대로 위임
      return Promise.reject(error)
    }

    // ── 401 처리 ──
    // (1) /auth/* 경로의 401: 호출자(login 화면, refresh 자체)가 처리
    if (isAuthFreePath(url)) {
      return Promise.reject(error)
    }
    // (2) 이미 로그인 화면 → 의미 없음
    if (isOnAuthPage()) {
      return Promise.reject(error)
    }
    // (3) 이미 한 번 재시도된 요청은 더 이상 refresh 시도 안 함 (무한 루프 방지)
    if (config._retry) {
      // GitHub 프록시 401 은 refresh 후에도 풀리지 않는 경우가 많다 (GitHub 미연결
      // / private repo 권한 부족). 로그인 페이지로 보내면 사용자가 GitHub 로그인
      // 시도 → email 충돌로 link 안 됨 → 무한 루프. 호출자에게 그대로 위임 →
      // code.vue 등이 "프로필에서 GitHub 연결" 안내 메시지 노출.
      if (isGithubProxyPath(url)) {
        return Promise.reject(error)
      }
      redirectToLogin(showError)
      return Promise.reject(error)
    }

    // (4) refresh 시도 — single-flight
    const newAccess = await getRefreshPromise()
    if (!newAccess) {
      redirectToLogin(showError)
      return Promise.reject(error)
    }

    // (5) 새 토큰으로 원 요청 재시도
    config._retry = true
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${newAccess}`
    return instance(config)
  },
)

export default instance
