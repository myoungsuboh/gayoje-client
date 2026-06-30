import { describe, it, expect } from 'vitest'
import { safeRedirectFromQuery, DEFAULT_REDIRECT } from '@/utils/safeRedirect'

describe('safeRedirectFromQuery (open-redirect 차단)', () => {
  it('정상 내부 경로는 그대로 반환', () => {
    expect(safeRedirectFromQuery('/plan')).toBe('/plan')
    expect(safeRedirectFromQuery('/home')).toBe('/home')
    expect(safeRedirectFromQuery('/lint')).toBe('/lint')
    expect(safeRedirectFromQuery('/deliverables?project=demo')).toBe('/deliverables?project=demo')
    expect(safeRedirectFromQuery('/admin/audit-logs#row-1')).toBe('/admin/audit-logs#row-1')
  })

  it('빈 값 / null / undefined 는 default redirect 로 fallback', () => {
    expect(safeRedirectFromQuery('')).toBe(DEFAULT_REDIRECT)
    expect(safeRedirectFromQuery(null)).toBe(DEFAULT_REDIRECT)
    expect(safeRedirectFromQuery(undefined)).toBe(DEFAULT_REDIRECT)
  })

  it('외부 절대 URL 차단', () => {
    expect(safeRedirectFromQuery('https://evil.com/x')).toBe(DEFAULT_REDIRECT)
    expect(safeRedirectFromQuery('http://evil.com')).toBe(DEFAULT_REDIRECT)
  })

  it('scheme-relative `//evil.com` 차단', () => {
    // browser 가 //evil.com 을 https://evil.com 으로 해석하므로 외부 redirect 가 됨
    expect(safeRedirectFromQuery('//evil.com')).toBe(DEFAULT_REDIRECT)
    expect(safeRedirectFromQuery('//evil.com/path')).toBe(DEFAULT_REDIRECT)
  })

  it('역슬래시 변종 (`/\\evil.com`) 차단', () => {
    // 일부 브라우저는 백슬래시를 슬래시로 정규화 → URL parsing 분기 우회 시도
    expect(safeRedirectFromQuery('/\\evil.com')).toBe(DEFAULT_REDIRECT)
  })

  it('비-string 입력은 default redirect 로 fallback', () => {
    expect(safeRedirectFromQuery(123)).toBe(DEFAULT_REDIRECT)
    expect(safeRedirectFromQuery({ x: 1 })).toBe(DEFAULT_REDIRECT)
    expect(safeRedirectFromQuery(['/plan'])).toBe(DEFAULT_REDIRECT)
  })

  it('상대경로 (앞 슬래시 없음) 차단', () => {
    // ../ 같은 상대경로도 차단 → SPA 라우터 의도와 다름
    expect(safeRedirectFromQuery('plan')).toBe(DEFAULT_REDIRECT)
    expect(safeRedirectFromQuery('../admin')).toBe(DEFAULT_REDIRECT)
  })

  it('[2026-05-18] DEFAULT_REDIRECT 는 /home — 로그인 후 메인 화면 진입', () => {
    expect(DEFAULT_REDIRECT).toBe('/home')
  })
})
