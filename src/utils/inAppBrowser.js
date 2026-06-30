/**
 * 인앱브라우저(WebView) 감지 + 외부 브라우저 탈출 유틸.
 *
 * [배경]
 * 구글 OAuth 는 임베디드 WebView 안에서의 인증을 차단한다.
 *   → 403: disallowed_useragent ("보안 브라우저 사용" 정책, 피싱 방지)
 * 카카오톡·네이버·인스타·페이스북 등 메신저/SNS 인앱브라우저로 우리 링크를 열고
 * "Google 으로 로그인" 을 누르면 100% 막힌다. (GitHub 도 동일 위험)
 *
 * 서버/OAuth 설정으로는 해결 불가 — 외부 브라우저(Chrome/Safari)로 열어야만 통과한다.
 * 이 유틸은 인앱브라우저를 감지해 "외부 브라우저로 열기" 를 유도한다.
 *   - Android: intent:// 스킴으로 Chrome 강제 실행 (미설치 시 기본 브라우저 fallback)
 *   - iOS: 프로그래밍적 탈출 수단이 없음 → 호출부가 안내 + URL 복사로 대응
 */

// userAgent 시그니처 → 인앱브라우저 식별자.
// 오탐 방지를 위해 "독립 브라우저"(예: 네이버 Whale, 삼성 인터넷)는 제외하고
// 명백한 메신저/SNS in-app WebView 만 매칭한다.
const IN_APP_SIGNATURES = [
  { id: 'kakaotalk', re: /KAKAOTALK/i },
  { id: 'naver', re: /NAVER\(inapp/i },
  { id: 'line', re: /\bLine\//i },
  { id: 'instagram', re: /Instagram/i },
  { id: 'facebook', re: /FBAN|FBAV|FB_IAB/i },
  { id: 'messenger', re: /\bMessenger\b/i },
  { id: 'wechat', re: /MicroMessenger/i },
  { id: 'daum', re: /DaumApps/i },
  { id: 'everytime', re: /everytimeapp/i },
  { id: 'kakaostory', re: /KAKAOSTORY/i },
  { id: 'band', re: /\bBAND\//i },
  { id: 'zalo', re: /Zalo/i },
]

const _ua = () =>
  (typeof navigator !== 'undefined' && navigator.userAgent) || ''

/**
 * 인앱브라우저 식별자 반환 (없으면 null).
 * @param {string} [ua] 검사할 userAgent (기본: navigator.userAgent)
 * @returns {string|null}
 */
export function detectInAppBrowser(ua = _ua()) {
  for (const sig of IN_APP_SIGNATURES) {
    if (sig.re.test(ua)) return sig.id
  }
  return null
}

/** 인앱브라우저 여부. */
export function isInAppBrowser(ua = _ua()) {
  return detectInAppBrowser(ua) !== null
}

export function isAndroid(ua = _ua()) {
  return /Android/i.test(ua)
}

export function isIOS(ua = _ua()) {
  return /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS 13+ 는 "Macintosh" 로 위장하지만 터치 지원 → 보조 판별
    (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
}

/**
 * 외부 브라우저(Chrome/Safari)에서 주어진 URL 을 연다.
 *
 * - Android: intent:// 로 Chrome 강제. Chrome 미설치 시 browser_fallback_url 로
 *   기본 브라우저가 열린다. 호출 즉시 현재 WebView 가 외부로 전환됨.
 * - iOS / 기타: 인앱 WebView 를 프로그래밍적으로 탈출할 표준 수단이 없음 → false.
 *   (호출부가 안내 메시지 + URL 복사 로 대응한다.)
 *
 * @param {string} [url] 절대 URL (http/https). 기본: 현재 페이지.
 * @returns {boolean} 외부 열기를 시도했으면 true, 불가하면 false
 */
export function openInExternalBrowser(url) {
  if (typeof window === 'undefined') return false
  const target = url || window.location.href
  if (!/^https?:\/\//i.test(target)) return false

  if (isAndroid()) {
    try {
      const noScheme = target.replace(/^https?:\/\//i, '')
      const fallback = encodeURIComponent(target)
      // scheme=https 로 강제, package 로 Chrome 지정, fallback 으로 안전망.
      window.location.href =
        `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;` +
        `S.browser_fallback_url=${fallback};end`
      return true
    } catch {
      return false
    }
  }
  // iOS 및 기타 — 탈출 불가
  return false
}
