/**
 * format 유틸 단위 테스트 — formatNum / formatDateKr.
 */
import { describe, it, expect } from 'vitest'
import { formatNum, formatDateKr, formatCurrency, splitPriceText } from '@/utils/format'

describe('formatNum', () => {
  it('null/undefined → 대시', () => {
    expect(formatNum(null)).toBe('—')
    expect(formatNum(undefined)).toBe('—')
  })

  it('0 은 0 — falsy 지만 숫자라 그대로', () => {
    expect(formatNum(0)).toBe('0')
  })

  it('1000 미만 → 그대로 문자열', () => {
    expect(formatNum(42)).toBe('42')
    expect(formatNum(999)).toBe('999')
  })

  it('1000 ~ 999_999 → K 축약', () => {
    expect(formatNum(1000)).toBe('1.0K')
    expect(formatNum(1234)).toBe('1.2K')
    expect(formatNum(999_999)).toBe('1000.0K')
  })

  it('1_000_000 이상 → M 축약', () => {
    expect(formatNum(1_000_000)).toBe('1.0M')
    expect(formatNum(2_500_000)).toBe('2.5M')
  })
})

describe('formatCurrency', () => {
  it('null/undefined → 대시', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
  })

  it('USD 센트 → 달러. 정수면 소수점 없음', () => {
    expect(formatCurrency(900, 'USD')).toBe('$9')
    expect(formatCurrency(1900, 'USD')).toBe('$19')
    expect(formatCurrency(2900, 'USD')).toBe('$29')
    expect(formatCurrency(0, 'USD')).toBe('$0')
  })

  it('USD 센트 있으면 2자리', () => {
    expect(formatCurrency(1710, 'USD')).toBe('$17.10')
    expect(formatCurrency(2175, 'USD')).toBe('$21.75')
  })

  it('기본 통화는 USD', () => {
    expect(formatCurrency(900)).toBe('$9')
  })

  it('KRW → 원 그대로 (legacy)', () => {
    expect(formatCurrency(9900, 'KRW')).toBe('₩9,900')
    expect(formatCurrency(0, 'KRW')).toBe('₩0')
  })
})

describe('splitPriceText', () => {
  it('null/undefined → 메인=대시, 소수부=빈문자열', () => {
    expect(splitPriceText(null)).toEqual({ main: '—', fraction: '' })
    expect(splitPriceText(undefined)).toEqual({ main: '—', fraction: '' })
  })

  it('$9.99 → 메인 "$9", 소수부 ".99" (좌측 자릿수 효과를 살리는 분리)', () => {
    expect(splitPriceText('$9.99')).toEqual({ main: '$9', fraction: '.99' })
    expect(splitPriceText('$19.99')).toEqual({ main: '$19', fraction: '.99' })
    expect(splitPriceText('$29.99')).toEqual({ main: '$29', fraction: '.99' })
  })

  it('센트가 한 자리(.5)여도 분리', () => {
    expect(splitPriceText('$9.5')).toEqual({ main: '$9', fraction: '.5' })
  })

  it('소수가 없으면 통째로 main — 분리하지 않음', () => {
    expect(splitPriceText('$19')).toEqual({ main: '$19', fraction: '' })
    expect(splitPriceText('₩9,900')).toEqual({ main: '₩9,900', fraction: '' })
    expect(splitPriceText('무료')).toEqual({ main: '무료', fraction: '' })
    expect(splitPriceText('Free')).toEqual({ main: 'Free', fraction: '' })
  })

  it('단위 접미사(예: " / 월")가 붙어 있으면 main 에 보존 + 소수만 분리', () => {
    expect(splitPriceText('$9.99 / mo')).toEqual({ main: '$9 / mo', fraction: '.99' })
  })
})

describe('가격 개편 2026-06-24 — USD $12/$24/$36 + KRW 표시 정합', () => {
  it('USD 신규 가격은 정수 달러로 표시 (소수점 없음)', () => {
    expect(formatCurrency(1200, 'USD')).toBe('$12')    // Pro 월
    expect(formatCurrency(2400, 'USD')).toBe('$24')    // Pro+ 월
    expect(formatCurrency(3600, 'USD')).toBe('$36')    // Pro Max 월
    expect(formatCurrency(12000, 'USD')).toBe('$120')  // Pro 연
    expect(formatCurrency(36000, 'USD')).toBe('$360')  // Pro Max 연
  })

  it('KRW 신규 가격은 ₩ 천단위 구분', () => {
    expect(formatCurrency(18000, 'KRW')).toBe('₩18,000')    // Pro 월
    expect(formatCurrency(36000, 'KRW')).toBe('₩36,000')    // Pro+ 월
    expect(formatCurrency(54000, 'KRW')).toBe('₩54,000')    // Pro Max 월
    expect(formatCurrency(180000, 'KRW')).toBe('₩180,000')  // Pro 연
    expect(formatCurrency(540000, 'KRW')).toBe('₩540,000')  // Pro Max 연
  })

  it('연간 월환산(연/12)·strike(월×12)이 통화별로 정상 — PricePreview raw 경로', () => {
    // KRW: 연 180,000/12 = 15,000(월환산), 월 18,000×12 = 216,000(strike)
    expect(formatCurrency(Math.round(180000 / 12), 'KRW')).toBe('₩15,000')
    expect(formatCurrency(18000 * 12, 'KRW')).toBe('₩216,000')
    // USD: 연 12,000센트/12 = 1,000센트 = $10, 월 1,200×12 = 14,400 = $144
    expect(formatCurrency(Math.round(12000 / 12), 'USD')).toBe('$10')
    expect(formatCurrency(1200 * 12, 'USD')).toBe('$144')
  })

  it('splitPriceText 가 신규 가격을 통째로 main 으로 (소수부 없음)', () => {
    expect(splitPriceText('$12')).toEqual({ main: '$12', fraction: '' })
    expect(splitPriceText('₩18,000')).toEqual({ main: '₩18,000', fraction: '' })
    expect(splitPriceText('₩180,000')).toEqual({ main: '₩180,000', fraction: '' })
  })
})

describe('formatDateKr', () => {
  it('null/0 → 대시', () => {
    expect(formatDateKr(null)).toBe('—')
    expect(formatDateKr(0)).toBe('—')
    expect(formatDateKr(undefined)).toBe('—')
  })

  it('ms epoch → 한국 로케일 문자열 (YY/MM/DD HH:MM 포함)', () => {
    // 2024-06-15 14:30:00 UTC — TZ 가 다를 수 있으므로 단순 비non-empty + 숫자 패턴만 검사.
    const out = formatDateKr(1718461800000)
    expect(out).toMatch(/\d/)
    expect(out).not.toBe('—')
  })
})
