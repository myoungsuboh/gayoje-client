/**
 * inAppBrowser.js — 인앱브라우저(WebView) 감지 + 외부 브라우저 탈출 유틸.
 *
 * 구글 OAuth 의 disallowed_useragent(403) 회피용. 메신저/SNS in-app WebView 를
 * UA 시그니처로 식별하고, Android 는 intent:// 로 Chrome 탈출을 시도한다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  detectInAppBrowser,
  isInAppBrowser,
  isAndroid,
  isIOS,
  openInExternalBrowser,
} from '@/utils/inAppBrowser'

// 실제 단말 UA 샘플
const UA = {
  kakao: 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.5.0',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0 (iPhone; iOS 17_0; ko_KR)',
  facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/440.0.0]',
  line: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 Line/13.0.0',
  naver: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 NAVER(inapp; search; 1234; 12.0.0)',
  // 일반(독립) 브라우저 — 차단 대상 아님
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  safariIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

describe('detectInAppBrowser — UA 시그니처 매칭', () => {
  it('주요 인앱브라우저를 식별한다', () => {
    expect(detectInAppBrowser(UA.kakao)).toBe('kakaotalk')
    expect(detectInAppBrowser(UA.instagram)).toBe('instagram')
    expect(detectInAppBrowser(UA.facebook)).toBe('facebook')
    expect(detectInAppBrowser(UA.line)).toBe('line')
    expect(detectInAppBrowser(UA.naver)).toBe('naver')
  })

  it('독립 브라우저(Chrome/Safari/Desktop)는 null — 오탐 없음', () => {
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull()
    expect(detectInAppBrowser(UA.safariIOS)).toBeNull()
    expect(detectInAppBrowser(UA.desktop)).toBeNull()
  })

  it('isInAppBrowser 는 boolean 으로 래핑', () => {
    expect(isInAppBrowser(UA.kakao)).toBe(true)
    expect(isInAppBrowser(UA.chromeAndroid)).toBe(false)
  })
})

describe('isAndroid / isIOS', () => {
  it('플랫폼을 구분한다', () => {
    expect(isAndroid(UA.kakao)).toBe(true)
    expect(isAndroid(UA.safariIOS)).toBe(false)
    expect(isIOS(UA.instagram)).toBe(true)
    expect(isIOS(UA.chromeAndroid)).toBe(false)
  })
})

describe('openInExternalBrowser', () => {
  const origUA = navigator.userAgent
  const origLocation = window.location

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true })
    Object.defineProperty(window, 'location', { value: origLocation, configurable: true, writable: true })
  })

  it('Android 는 intent:// 스킴으로 Chrome 탈출을 시도하고 true 반환', () => {
    Object.defineProperty(navigator, 'userAgent', { value: UA.kakao, configurable: true })
    // jsdom location 은 href 가 read-only 라 spy 불가 → 쓰기 가능한 mock 으로 교체
    const fake = { href: 'https://harness-system.com/login' }
    Object.defineProperty(window, 'location', { value: fake, configurable: true, writable: true })

    const result = openInExternalBrowser('https://harness-system.com/login')
    expect(result).toBe(true)
    expect(fake.href).toContain('intent://harness-system.com/login')
    expect(fake.href).toContain('package=com.android.chrome')
    expect(fake.href).toContain('S.browser_fallback_url=')
  })

  it('iOS 는 프로그래밍적 탈출 불가 → false (호출부가 안내/복사로 대응)', () => {
    Object.defineProperty(navigator, 'userAgent', { value: UA.instagram, configurable: true })
    expect(openInExternalBrowser('https://harness-system.com/login')).toBe(false)
  })

  it('비-http(s) URL 은 거부', () => {
    Object.defineProperty(navigator, 'userAgent', { value: UA.kakao, configurable: true })
    expect(openInExternalBrowser('javascript:alert(1)')).toBe(false)
  })
})
