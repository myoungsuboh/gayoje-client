/**
 * usePricingStore — BE 동적 가격 정책 + fallback + 10분 TTL.
 *
 * [회귀 가드]
 * - fetch: 10분 캐시 hit / force bypass / 동시 호출 race / 실패 시 fallback 유지
 * - priceFinal / basePrice / discountPct / currency: BE 응답 우선, FALLBACK_META fallback
 * - priceText / priceTextLong: 0 → "무료", USD → "$X", KRW(legacy) → "₩X,XXX"
 * - refresh: force=true alias
 *
 * [2026-06 USD] BE 가 currency + 최소단위(USD 센트) 정수를 줌. $9 = 900.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/pricing', () => ({
  fetchPricingApi: vi.fn(),
}))

import { fetchPricingApi } from '@/utils/pricing'
import { usePricingStore } from '@/store/pricing'


describe('usePricingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchPricingApi.mockReset()
  })

  // ─── fetch + 캐시 ────────────────────────────────────────

  it('fetch — BE 응답을 tier 별로 map (USD 센트)', async () => {
    fetchPricingApi.mockResolvedValueOnce({
      success: true,
      data: {
        pricing: [
          { tier: 'pro', base_price: 900, discount_pct: 0, final_price: 900, currency: 'USD' },
          { tier: 'pro_plus', base_price: 1900, discount_pct: 10, final_price: 1710, currency: 'USD' },
          { tier: 'pro_max', base_price: 2900, discount_pct: 0, final_price: 2900, currency: 'USD' },
        ],
      },
    })
    const store = usePricingStore()
    const r = await store.fetch()
    expect(r.success).toBe(true)
    expect(store.isLoaded).toBe(true)
    expect(store.priceFinal('pro')).toBe(900)
    expect(store.priceFinal('pro_plus')).toBe(1710)
    expect(store.priceFinal('pro_max')).toBe(2900)
    expect(store.discountPct('pro_plus')).toBe(10)
    expect(store.currency('pro')).toBe('USD')
  })

  it('fetch — 10분 TTL 캐시 hit', async () => {
    fetchPricingApi.mockResolvedValue({
      success: true,
      data: { pricing: [{ tier: 'pro', final_price: 900, currency: 'USD' }] },
    })
    const store = usePricingStore()
    await store.fetch()
    const r2 = await store.fetch()
    expect(r2.fromCache).toBe(true)
    expect(fetchPricingApi).toHaveBeenCalledTimes(1)
  })

  it('refresh — force=true 동작 (캐시 우회)', async () => {
    fetchPricingApi.mockResolvedValue({
      success: true,
      data: { pricing: [{ tier: 'pro', final_price: 900, currency: 'USD' }] },
    })
    const store = usePricingStore()
    await store.fetch()
    await store.refresh()
    expect(fetchPricingApi).toHaveBeenCalledTimes(2)
  })

  it('fetch — BE 실패 시 isLoaded=false + error 메시지', async () => {
    fetchPricingApi.mockResolvedValueOnce({ success: false, error: 'BE down' })
    const store = usePricingStore()
    const r = await store.fetch()
    expect(r.success).toBe(false)
    expect(store.errorMsg).toBe('BE down')
    expect(store.isLoaded).toBe(false)
  })

  // ─── fallback — BE 미응답 시 FALLBACK_META(USD) 사용 ──────────

  it('priceFinal — BE 미응답 → fallback (free $0 / pro $12=1200센트)', () => {
    const store = usePricingStore()
    // fetch 안 했음 → fallback. [2026-06-24 가격 개편] TIER_META Pro $12 = 1200센트.
    expect(store.priceFinal('free')).toBe(0)
    expect(store.priceFinal('pro')).toBe(1200)   // FALLBACK_META(=TIER_META).priceMinor
    expect(store.currency('pro')).toBe('USD')
  })

  it('discountPct — BE 미응답 → 0', () => {
    const store = usePricingStore()
    expect(store.discountPct('pro_plus')).toBe(0)
  })

  // ─── 가격 문자열 포맷 ────────────────────────────────────

  it('priceText — 무료 / USD $ 표기', async () => {
    fetchPricingApi.mockResolvedValueOnce({
      success: true,
      data: {
        pricing: [
          { tier: 'free', final_price: 0, currency: 'USD' },
          { tier: 'pro', final_price: 900, currency: 'USD' },
          { tier: 'pro_max', final_price: 2900, currency: 'USD' },
        ],
      },
    })
    const store = usePricingStore()
    await store.fetch()
    expect(store.priceText('free')).toBe('무료')
    expect(store.priceText('pro')).toBe('$9')
    expect(store.priceText('pro_max')).toBe('$29')
  })

  it('priceText — KRW(legacy) 행은 ₩ 로 표기', async () => {
    fetchPricingApi.mockResolvedValueOnce({
      success: true,
      data: { pricing: [{ tier: 'pro', final_price: 9900, currency: 'KRW' }] },
    })
    const store = usePricingStore()
    await store.fetch()
    expect(store.priceText('pro')).toBe('₩9,900')
  })

  it('priceTextLong — "/ 월" 부착', async () => {
    fetchPricingApi.mockResolvedValueOnce({
      success: true,
      data: {
        pricing: [
          { tier: 'free', final_price: 0, currency: 'USD' },
          { tier: 'pro', final_price: 900, currency: 'USD' },
        ],
      },
    })
    const store = usePricingStore()
    await store.fetch()
    expect(store.priceTextLong('free')).toBe('무료')
    expect(store.priceTextLong('pro')).toBe('$9 / 월')
  })

  // ─── isLoading 가드 ───────────────────────────────────────

  it('isLoading 중 두번째 fetch 호출 — race 회피', async () => {
    let resolveOuter
    fetchPricingApi.mockImplementationOnce(() => new Promise(r => { resolveOuter = r }))
    const store = usePricingStore()
    const p1 = store.fetch({ force: true })
    const r2 = await store.fetch({ force: true })  // 두 번째 — isLoading=true 이라 즉시 실패
    expect(r2.success).toBe(false)
    expect(r2.error).toMatch(/already loading/)
    // 첫 호출 resolve
    resolveOuter({ success: true, data: { pricing: [] } })
    await p1
  })
})
