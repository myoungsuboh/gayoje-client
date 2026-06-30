/**
 * plugins/router.js
 *
 * Vue Router configuration using unplugin-vue-router for auto-routing.
 */

import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { isSafeInternalPath } from '@/utils/safeRedirect'
import { enforceUserDataIsolationSync } from '@/utils/userIsolation'
import { TEAM_FEATURE_ENABLED } from '@/config/features'

// re-export 로 기존 import 경로 유지 (`@/plugins/router` → safeRedirectFromQuery)
export { safeRedirectFromQuery } from '@/utils/safeRedirect'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // [2026-06-12] 페이지 이동 시 스크롤 최상단으로 (뒤로가기는 위치 복원).
  // 푸터(페이지 맨 아래)에서 약관 링크를 누르면 새 페이지도 하단부터 보여
  // "아무 일도 안 일어난" 것처럼 보이던 문제의 한 축.
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0 }
  },
})

// 인증 없이 접근 가능한 경로 (인트로 / 로그인 / 회원가입 / OAuth 콜백 등).
// /auth/callback 은 토큰 없이 진입 → 페이지가 query 의 token 을 저장 → /plan 으로 이동.
// /forgot-password, /reset-password 는 비로그인 사용자가 비밀번호 잃었을 때 접근하는 경로.
// [2026-05-18] '/' 인트로(랜딩) 화면 — 비로그인·로그인 사용자 모두 접근.
//                /home 은 로그인 사용자 전용 데시보드 (auth required).
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/auth/callback',
  // [2026-05-18] 법적 페이지 — 비로그인 사용자도 약관 확인 후 가입 가능해야 함.
  // 전자상거래법 / 개인정보보호법 의무.
  '/legal/terms',
  '/legal/refund-policy',
  '/legal/privacy-policy',
  // [2026-06-12 fix] 자동결제 약관이 나중에 추가되며 공개 목록에 누락 — 비로그인이
  // /legal/auto-billing 진입 시 /login 으로 튕겼다. 결제 전 고지 의무 문서라 공개 필수.
  '/legal/auto-billing',
  // [2026-06-12] 가격 페이지 공개 — Paddle 도메인 승인(기본 결제 링크가 이
  // 페이지를 가리킴 — 심사관이 로그인 벽에 막히면 승인 지연) + 마케팅 정석
  // (비로그인 방문자가 가격을 봐야 가입 전환). 결제 CTA 는 페이지가 로그인 유도.
  '/pricing',
])

// 관리자 전용 경로 — localStorage 의 user.is_admin 으로 가드.
// (BE 가 /api/admin/* 라우트에서도 다시 검증하므로 이중 안전.)
// [2026-05] /admin/pricing, /admin/revenue, /admin/inquiries 추가.
const ADMIN_PATHS = new Set([
  '/admin',
  '/admin/audit-logs',
  '/admin/pricing',
  '/admin/revenue',
  '/admin/inquiries',
  '/admin/billing',
])

const isAdminFromStorage = () => {
  try {
    const raw = localStorage.getItem('harness_user')
    if (!raw) return false
    const u = JSON.parse(raw)
    return Boolean(u && u.is_admin)
  } catch {
    return false
  }
}

// 로그인 후 복원할 deep link 보존.
// `to.fullPath` 는 query/hash 포함 — share 한 URL 그대로 복원 가능.
// open-redirect 방어: 외부 절대 URL / scheme-relative `//evil.com` / 백슬래시 변종
// 차단은 `@/utils/safeRedirect` 의 `isSafeInternalPath` 에 집중.

// 토큰 유무와 무관하게 통과 — OAuth callback (link 모드) 진입.
const ALWAYS_ACCESSIBLE = new Set(['/auth/callback'])

// 로그인 상태에서 갈 이유가 없는 "인증 진입" 페이지 — 데시보드로 보냄.
// (법적 페이지·랜딩은 로그인 여부와 무관하게 접근 가능해야 하므로 제외.)
const AUTH_ENTRY_PATHS = new Set(['/login'])

// [2026-06] OAuth 전용 전환으로 폐지된 인증 경로 — 진입 시 /login 으로 리다이렉트.
// 이메일/비번 가입·비밀번호 찾기/재설정 페이지를 삭제했으므로, 북마크·구 링크·
// 이메일 안의 reset 링크로 들어와도 로그인(=OAuth 단일 경로)으로 안내한다.
const REMOVED_AUTH_PATHS = new Set(['/signup', '/forgot-password', '/reset-password'])

router.beforeEach((to) => {
  // [2026-05 보안] 매 navigation 마다 동기 격리 재확인 — 같은 세션 내 사용자 전환
  // (다른 탭에서 로그인 등) 후의 SPA 이동에서도 이전 사용자 영속 데이터가 새지 않도록.
  enforceUserDataIsolationSync()

  // [2026-06] 폐지된 이메일 인증 경로(/signup·/forgot-password·/reset-password)는
  // OAuth 단일 경로인 /login 으로 흡수. (페이지 자체가 삭제돼 라우트도 없음)
  if (REMOVED_AUTH_PATHS.has(to.path)) return '/login'

  const token = localStorage.getItem('harness_token')

  // [2026-05] 로그인 사용자가 '/' 인트로로 진입하면 /home 데시보드로 redirect.
  //   - 비로그인: '/' 는 인트로 (마케팅) 그대로 노출.
  //   - 로그인: 인트로 볼 이유 없음 → 데시보드로.
  //   사용자: "로그인 후 / 주소로 들어가면 인트로가 나오는 버그 수정 부탁"
  if (to.path === '/' && token) return '/home'

  if (!PUBLIC_PATHS.has(to.path) && !token) {
    // 원래 가려던 path 를 redirect query 로 보존 → login 성공 후 복원.
    // /login 자체로 가는 경우는 보존 의미 없으므로 redirect 미설정.
    if (isSafeInternalPath(to.fullPath) && to.path !== '/login') {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    return '/login'
  }
  // 로그인 사용자가 /login·/signup 인증 진입 페이지로 가면 데시보드로 보냄.
  // [2026-06-12 fix] 이전엔 PUBLIC_PATHS 전체에 적용 — 법적 페이지(/legal/*)도
  // 집합에 있어 로그인 사용자가 푸터의 약관/개인정보/환불 링크를 누르면 /home
  // 으로 튕겼다(이미 /home 이면 "클릭해도 아무 반응 없음"으로 체감). 인증 진입
  // 페이지만 명시 집합으로 분리.
  if (AUTH_ENTRY_PATHS.has(to.path) && token) return '/home'
  // 관리자 전용 라우트 가드 — 비관리자는 메인 화면으로.
  if (ADMIN_PATHS.has(to.path) && !isAdminFromStorage()) return '/home'
  // [2026-06] 팀 기능 미오픈 — 직접 URL(/team) 진입 차단. 플래그 켜면 통과.
  if (to.path === '/team' && !TEAM_FEATURE_ENABLED) return '/home'
  return true
})


// ─── chunk load failure 자동 복구 ───────────────────────────────
// Vercel 재배포 후 옛 index.html 을 캐싱한 사용자가 새 chunk 해시를 못 찾으면
// "Failed to fetch dynamically imported module" 또는 MIME type 에러가 발생.
// 이 경우 같은 path 로 hard reload 해 새 index.html 을 받아오게 한다.
//
// 무한 reload 방지: sessionStorage 에 마지막 reload 경로/시각 저장,
// 5초 안에 같은 경로에서 두 번째 실패가 나면 reload 중단 (실제 버그일 수 있음).
const RELOAD_KEY = 'harness_chunk_reload'

const isChunkLoadError = (err) => {
  const msg = err?.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module')
    || msg.includes('Importing a module script failed')
    || msg.includes('error loading dynamically imported module')
  )
}

router.onError((error, to) => {
  if (!isChunkLoadError(error)) return
  try {
    const last = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || 'null')
    const now = Date.now()
    if (last && last.path === to.fullPath && now - last.at < 5000) {
      // 두 번째 실패 — reload 루프 방지
      console.error('[router] chunk load failed twice, aborting auto-reload', error)
      sessionStorage.removeItem(RELOAD_KEY)
      return
    }
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ path: to.fullPath, at: now }))
  } catch { /* ignore storage errors */ }
  // 같은 URL 로 hard reload — 새 index.html + 최신 chunk 해시
  window.location.assign(to.fullPath)
})

export default router
