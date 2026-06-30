/**
 * Open-redirect 방어 헬퍼.
 *
 * 로그인 후 `?redirect=<path>` query 로 복원할 경로를 검증한다.
 * 외부 URL / scheme-relative `//evil.com` / 백슬래시 변종을 모두 차단하고,
 * 안전한 내부 경로(앞 슬래시 + 추가 슬래시/백슬래시 아님)만 그대로 반환.
 * 부적합한 입력은 `DEFAULT_REDIRECT` 로 fallback.
 *
 * router.js 의 `beforeEach` 와 login.vue 양쪽이 같은 규칙을 공유해야
 * localStorage 조작 / 외부 URL 주입을 일관되게 차단할 수 있다.
 *
 * [2026-05-18] default 진입점을 `/plan` → `/home` 으로 통일 — Hero + 7-step
 * 워크플로우 + 진행 중 프로젝트 카드가 있는 메인 화면이 로그인 직후 첫 화면.
 */

const _isSafeInternalPath = (p) => {
  return typeof p === 'string'
    && p.startsWith('/')
    && !p.startsWith('//')
    && !p.startsWith('/\\')
}

export const isSafeInternalPath = _isSafeInternalPath

// 단일 출처 — router / login / 다른 redirect helper 가 같은 default 를 본다.
export const DEFAULT_REDIRECT = '/home'

export const safeRedirectFromQuery = (raw) => {
  return _isSafeInternalPath(raw) ? raw : DEFAULT_REDIRECT
}
