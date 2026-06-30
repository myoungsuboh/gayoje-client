/**
 * Auth helper — backend `/auth/*` 엔드포인트 호출 + 토큰 저장.
 *
 * 백엔드 응답 shape (app/api/auth_routes.py 참고):
 *   POST /auth/signup → { id, email, name, created_at }
 *   POST /auth/login  → { access_token, refresh_token, token_type, user }
 *   POST /auth/logout → { status: 'success', message }
 *   GET  /auth/me     → { id, email, name, created_at }
 *
 * 토큰 저장:
 *   - harness_token        : access_token (router guard 가 존재 여부만 체크)
 *   - harness_refresh_token: refresh_token (재발급용)
 *   - harness_user         : user profile JSON
 *
 * 모든 axios 호출은 공용 `@/utils/axios` 인스턴스를 사용:
 *   - request 인터셉터가 Bearer 헤더 자동 첨부 (login/signup 제외)
 *   - response 인터셉터가 401 일괄 처리 (세션 만료 시 /login 으로 자동 이동)
 */
import axios from '@/utils/axios'

// 운영(Vercel): VITE_API_BASE_URL 비워두면 same-origin('') 으로 호출 →
// vercel.json rewrites 가 Vultr 백엔드(http://158.247.196.111:8000)로 프록시.
// 로컬 dev: .env 에 VITE_API_BASE_URL=http://localhost:8000 설정.
const AUTH_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

const TOKEN_KEY = 'harness_token'
const REFRESH_KEY = 'harness_refresh_token'
const USER_KEY = 'harness_user'

// 캐시 키 단일 정의는 utils/cacheKeys.js — 신규 키 추가 시 거기 1곳만 갱신.
import { APP_CACHE_KEYS } from '@/utils/cacheKeys'
// extractError 단일 정의 — utils/apiErrors.js (Pydantic / 구조화 detail / 길이 캡 모두 처리).
import { extractError } from '@/utils/apiErrors'

/**
 * 로그아웃.
 *
 * 백엔드 /auth/logout 은 access token 의 jti 를 SQLite RevokedToken 블랙리스트에
 * 등록. body.refresh_token 이 있으면 refresh token 의 jti 도 함께 등록 →
 * 재발급 경로까지 즉시 차단 (탈취 수비).
 *
 * - 일반 사용자: backend 호출 (Bearer 는 interceptor 가 자동 첨부) → 항상 local 정리
 * - 네트워크 실패: local 정리만이라도 보장 (graceful)
 */
export const logoutApi = async () => {
  const token = localStorage.getItem(TOKEN_KEY)
  // 토큰 없음 → 로컬만 정리
  if (!token) {
    clearSession()
    return { success: true, skipped: true }
  }
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  // refresh 가 있으면 body 에 동봉, 없으면 null body (이전 동작 유지)
  const body = refreshToken ? { refresh_token: refreshToken } : null
  try {
    // axios interceptor 가 Authorization 헤더 자동 첨부
    await axios.post(`${AUTH_BASE}/auth/logout`, body)
    clearSession()
    return { success: true, syncedToServer: true }
  } catch (error) {
    // 백엔드 실패해도 클라이언트는 로그아웃 처리 (UX 우선)
    clearSession()
    return { success: true, syncedToServer: false, error: extractError(error, 'logout failed') }
  }
}

/**
 * [2026-05-18 보안] user-scoped pinia store 들의 ownership 검증/reset.
 * 모듈 import 시점이 아니라 호출 시점에 use*Store() 호출 — pinia install 후
 * (main.js 의 createApp().use(pinia)) 에 보장. 단방향 의존이라 순환 없음.
 *
 * 격리 대상:
 *   - jobs store     (batchState/_jobs 가 사용자별 데이터 — 누설 시 미팅 제목 노출)
 *   - project store  (projectName 이 사용자별 — 누설 시 BE 403 폭주)
 *
 * 신규 user-scoped persisted store 추가 시 이 두 함수에 반드시 추가.
 */
const _assertPiniaOwnership = async (email) => {
  if (!email) return
  try {
    const { useJobsStore } = await import('@/store/jobs')
    useJobsStore().assertOwner(email)
  } catch (e) { console.warn('jobs assertOwner skipped:', e) }
  try {
    const { useProjectStore } = await import('@/store/project')
    useProjectStore().assertOwner(email)
  } catch (e) { console.warn('project assertOwner skipped:', e) }
}

const _resetPiniaUserScopedStores = async () => {
  try {
    const { useJobsStore } = await import('@/store/jobs')
    useJobsStore().resetAll()
  } catch (e) { console.warn('jobs resetAll skipped:', e) }
  try {
    const { useProjectStore } = await import('@/store/project')
    useProjectStore().resetAll()
  } catch (e) { console.warn('project resetAll skipped:', e) }
}

/** access/refresh/user 를 localStorage 에 저장. */
export const saveSession = ({ accessToken, refreshToken, user }) => {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  // [2026-05-18 보안] 사용자 전환 즉시 in-memory pinia state 도 격리.
  // 영속화된 LS 만 정리하면 hydration 이 이미 끝난 store 안의 state 는 안 비워짐.
  if (user?.email) {
    _assertPiniaOwnership(user.email).catch(() => {})
  }
}

/**
 * 세션 정리 — 토큰뿐 아니라 앱 캐시(lint/lineage/truth/...) 도 함께 제거.
 * 공용 PC 에서 사용자 전환 시 이전 사용자 데이터 노출 방지.
 */
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
  for (const k of APP_CACHE_KEYS) {
    localStorage.removeItem(k)
  }
  // [2026-05-18 보안] in-memory pinia state 도 비움.
  // LS 만 정리하면 현재 페이지의 reactive ref 들이 그대로 남아 사용자 노출 가능.
  _resetPiniaUserScopedStores().catch(() => {})
}

export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY)

/**
 * 현재 access 토큰으로 /auth/me 호출 — 토큰이 여전히 유효한지 검증.
 * 401 시 false (세션 만료/로그아웃됨) — interceptor 가 알아서 redirect 처리하므로
 * 호출자는 결과만 보면 됨.
 */
export const verifyToken = async () => {
  const token = getAccessToken()
  if (!token) return { valid: false }
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/me`)
    // /auth/me 는 BE 가 항상 최신 상태(subscription_type, is_admin 포함)를 반환.
    // localStorage 의 user 를 매번 갱신해야 관리자 승격/구독 변경이 다음 요청에 반영됨.
    if (res.data) localStorage.setItem(USER_KEY, JSON.stringify(res.data))
    return { valid: true, user: res.data }
  } catch (error) {
    return { valid: false, status: error?.response?.status }
  }
}

/**
 * 내가 OWNS 한 프로젝트 목록 조회.
 * 응답: { projects: [{ name, owned_at }] }
 */
export const fetchMyProjects = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/me/projects`)
    return {
      success: true,
      projects: res.data?.projects || [],
      teams: res.data?.teams || [],
    }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '프로젝트 목록을 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 내 VibeRepo 라이브러리 목록 조회.
 * 응답: { repos: [{ url, owner_handle, label, description, is_mine, added_at, updated_at }], count }
 *   (백엔드 VibeRepoOut — id 없음, URL 이 유일 키, timestamp 는 ms)
 */
export const fetchLibraryApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/me/library`)
    return { success: true, repos: res.data?.repos || [], count: res.data?.count || 0 }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '라이브러리를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 내 VibeRepo 라이브러리에 repo 추가 (URL 기준 upsert).
 * @param {{ url: string, label?: string, description?: string, is_mine?: boolean }} payload
 * @returns 백엔드 응답 { status: 'ok', repo: VibeRepoOut }
 */
export const addLibraryApi = async ({ url, label = '', description = '', is_mine = true }) => {
  try {
    const res = await axios.post(`${AUTH_BASE}/auth/me/library`, {
      url, label, description, is_mine,
    })
    return { success: true, repo: res.data?.repo || res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '라이브러리에 추가하지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 내 VibeRepo 라이브러리에서 repo 삭제. URL 매칭 (DELETE body — path 아님).
 * @param {string} url
 */
export const removeLibraryApi = async (url) => {
  try {
    // axios DELETE 는 body 를 `data` 옵션으로 전달
    await axios.delete(`${AUTH_BASE}/auth/me/library`, { data: { url } })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '라이브러리에서 삭제하지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 내 프로필 업데이트 (name, github_username, auto_progress).
 *
 * [2026-05] auto_progress 토글 추가:
 *   true (default) — postMeeting 시 CPS+PRD 자동 체이닝
 *   false          — CPS 만 자동 생성, 사용자가 PRD/Design 명시 트리거 (검수 모드)
 *
 * @param {{ name?: string, github_username?: string, auto_progress?: boolean }} payload
 */
export const updateMeApi = async (payload) => {
  try {
    const res = await axios.patch(`${AUTH_BASE}/auth/me`, payload)
    if (res.data) localStorage.setItem(USER_KEY, JSON.stringify(res.data))
    return { success: true, user: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '프로필 업데이트에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

// ===== 미팅 로그 업로드 히스토리 =====
// 백엔드 (harness-server#4) — /auth/me/uploads CRUD
// 목록은 메타만, 본문은 단건 조회로 따로 받아옴 (payload 절약).

/**
 * 내가 업로드한 미팅 로그 목록 (최근순, 메타만 — content 미포함).
 * 응답: { uploads: [{ id, filename, size, uploaded_at }], count }
 */
export const fetchUploadsApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/me/uploads`)
    return { success: true, uploads: res.data?.uploads || [], count: res.data?.count || 0 }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '업로드 목록을 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 미팅 로그 텍스트 업로드 (본문 1MiB 상한, UTF-8 byte 기준 — 백엔드에서 강제).
 * @param {{ filename: string, content: string }} payload
 */
export const addUploadApi = async ({ filename, content }) => {
  try {
    const res = await axios.post(`${AUTH_BASE}/auth/me/uploads`, { filename, content })
    return { success: true, upload: res.data?.upload || res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '업로드 저장에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 업로드 본문 조회 (단건). 응답: { id, filename, content, size, uploaded_at }
 */
export const getUploadApi = async (uploadId) => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/me/uploads/${encodeURIComponent(uploadId)}`)
    return { success: true, upload: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '업로드를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/** 업로드 삭제. */
export const removeUploadApi = async (uploadId) => {
  try {
    await axios.delete(`${AUTH_BASE}/auth/me/uploads/${encodeURIComponent(uploadId)}`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '업로드 삭제에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

// ===== GitHub OAuth =====
// 백엔드: harness-server#5 — /auth/github/{status,login,callback,disconnect}

/**
 * 현재 사용자의 GitHub 연결 상태.
 * 응답: { linked, github_username, oauth_available }
 */
export const fetchGithubStatusApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/github/status`)
    return { success: true, status: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, 'GitHub 연결 상태를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * GitHub OAuth — **로그인 모드**.
 *
 * 인증 불필요. 사용자를 직접 BE 의 redirect 라우트로 이동시켜 GitHub authorize
 * URL 까지 자동으로 흘러가게 함.
 */
export const startGithubOAuthLogin = () => {
  window.location.href = `${AUTH_BASE}/auth/github/login`
}

/**
 * GitHub OAuth — **연결 모드 (이미 로그인된 사용자)**.
 *
 * Bearer 인증으로 BE 에 authorize URL 을 요청 → 받은 URL 로 이동.
 * GET redirect 가 아닌 POST + JSON 인 이유:
 *   - GET navigation 에서는 브라우저가 Authorization 헤더를 못 보냄
 *   - 이전 버전 (?mode=link&link_email=...) 은 인증 없이 임의 email 을
 *     state 에 넣을 수 있어 계정 탈취 취약점이었음
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 *   성공 시 window.location.href 가 이미 변경된 상태로 반환.
 */
export const startGithubOAuthLink = async () => {
  try {
    const res = await axios.post(`${AUTH_BASE}/auth/github/link`)
    const url = res.data?.url
    if (!url) return { success: false, error: 'OAuth URL 을 받지 못했습니다.' }
    window.location.href = url
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, 'GitHub 연결을 시작할 수 없습니다.'),
      status: error?.response?.status,
    }
  }
}

// ===== Quota / 사용량 =====
// 백엔드 (harness-server#PR4) — GET /auth/me/usage

/**
 * 내 quota 사용량 + 등급별 한도 조회.
 *
 * 응답 shape (backend MyUsageResponse):
 *   {
 *     subscription_type: 'free' | 'pro' | 'pro_plus' | 'pro_max',
 *     limits: { meeting_logs, summary_chars, total_tokens },
 *     usage:  { meeting_logs, total_tokens, total_chars },
 *     reset_at: <ISO datetime>    // 2026-05 월간 reset — 다음 자동 reset 시점
 *   }
 *
 * 월간 카운터 — 가입일 기준 매월 자동 reset (BE cypher 안에서 self-healing).
 * limits 안의 summary_chars 는 per-request 한도 (회의록 한 번 입력 글자수 상한,
 * 누적값 없음).
 */
export const fetchMyUsageApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/me/usage`)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '사용량을 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/** GitHub 연결 해제. */
// ===== 회원 탈퇴 (2026-05) =====
// 백엔드: DELETE /auth/me

/**
 * 회원 탈퇴 — User 노드 + Vibe Repo + 구독 이력 영구 삭제.
 *
 * BE 동작:
 *   1. audit log 기록 (User 삭제 전, 분쟁 추적)
 *   2. User + 관련 도메인 데이터 DETACH DELETE
 *   3. last_admin 이면 400 거부 (admin 0명 사태 방지)
 *   4. access token jti 블랙리스트
 *
 * FE 후속:
 *   성공 시 clearSession() + /login redirect — 호출자가 처리.
 */
export const deleteMyAccountApi = async () => {
  try {
    const res = await axios.delete(`${AUTH_BASE}/auth/me`)
    return { success: true, message: res.data?.message || '탈퇴되었습니다.' }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '회원 탈퇴에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}


// ===== Google OAuth (2026-05) =====
// 백엔드: /auth/google/{status,login,link,callback,disconnect}

/**
 * 현재 사용자의 Google 연결 상태.
 * 응답: { linked, google_email, oauth_available }
 */
export const fetchGoogleStatusApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/google/status`)
    return { success: true, status: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, 'Google 연결 상태를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * Google OAuth — 로그인 모드. 인증 불필요. window.location.href redirect.
 */
export const startGoogleOAuthLogin = () => {
  window.location.href = `${AUTH_BASE}/auth/google/login`
}

/**
 * Google OAuth — 연결 모드 (이미 로그인된 사용자).
 * Bearer 인증으로 authorize URL 받아 redirect (GitHub link 와 동일 패턴).
 */
export const startGoogleOAuthLink = async () => {
  try {
    const res = await axios.post(`${AUTH_BASE}/auth/google/link`)
    const url = res.data?.url
    if (!url) return { success: false, error: 'OAuth URL 을 받지 못했습니다.' }
    window.location.href = url
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, 'Google 연결을 시작할 수 없습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * Google 연결 해제 — OAuth-only 가입자 차단 (BE 409).
 */
export const disconnectGoogleApi = async () => {
  try {
    await axios.delete(`${AUTH_BASE}/auth/google/disconnect`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, 'Google 연결 해제에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}


// ============================================================================
// [2026-05-17] Notion OAuth — 로그인 수단 아님, 단순 연동.
// 백엔드: /auth/notion/{status,link,callback,disconnect}
// ============================================================================

/**
 * 현재 사용자의 노션 연결 상태.
 * 응답: { linked, notion_workspace_name, oauth_available }
 */
export const fetchNotionStatusApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/notion/status`)
    return { success: true, status: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '노션 연결 상태를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * [2026-05-18 pivot] Notion Internal Integration token 등록.
 * [2026-05-19] OAuth 라우트 복원 — 사용자 요청. 이 함수는 fallback 유지.
 *
 * Flow:
 * 1. 사용자가 노션 → Settings → Connections → Develop integrations 에서
 *    Internal Integration 만들고 secret token 복사
 * 2. FE 가 token 을 이 라우트로 전달
 * 3. BE 가 토큰으로 노션 API 호출 → 검증 후 저장
 *
 * @param {string} token 노션 Internal Integration secret (ntn_* 형식)
 */
export const submitNotionTokenApi = async (token) => {
  try {
    const res = await axios.post(`${AUTH_BASE}/auth/notion/token`, { token })
    return { success: true, status: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '노션 연결에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * [2026-05-19] Notion OAuth one-click 시작.
 * BE 가 authorize URL 반환 → FE 가 window.location 으로 이동.
 *
 * @returns { success, url, error, status }
 *   success=true: url 로 redirect 하면 됨
 *   503 (oauth_disabled): NOTION_OAUTH_CLIENT_ID/SECRET 미설정 — Internal Token 폴백 안내
 */
export const startNotionOAuthLinkApi = async () => {
  try {
    const res = await axios.post(`${AUTH_BASE}/auth/notion/link`)
    return { success: true, url: res.data?.url }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '노션 OAuth 연결 시작에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

export const disconnectNotionApi = async () => {
  try {
    await axios.delete(`${AUTH_BASE}/auth/notion/disconnect`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '노션 연결 해제에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}


export const disconnectGithubApi = async () => {
  try {
    await axios.delete(`${AUTH_BASE}/auth/github/disconnect`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, 'GitHub 연결 해제에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}


// ─── [Phase 3 — 2026-05-18] 활성 세션 ────────────────────────────

/**
 * 내 활성 세션 목록 조회.
 *
 * Returns:
 *   { success, sessions?, currentJti?, error? }
 *   - sessions: [{ jti, user_agent, ip, created_at, device_label, is_current }]
 *   - currentJti: 이 요청을 보낸 세션의 jti (FE 가 "이 디바이스" 표시)
 */
export const fetchActiveSessionsApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/auth/me/sessions`)
    return {
      success: true,
      sessions: res.data?.sessions || [],
      currentJti: res.data?.current_jti || null,
    }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '세션 목록 조회에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}


/**
 * 특정 활성 세션 강제 로그아웃.
 *
 * @param {string} jti — 끊을 세션의 jti
 * Returns: { success, message?, error? }
 */
export const revokeSessionApi = async (jti) => {
  try {
    const res = await axios.delete(`${AUTH_BASE}/auth/me/sessions/${encodeURIComponent(jti)}`)
    return {
      success: true,
      message: res.data?.message || '세션이 종료되었습니다.',
    }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '세션 종료에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}
