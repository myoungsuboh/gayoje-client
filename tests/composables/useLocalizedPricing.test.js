/**
 * useLocalizedPricing — Paddle PricePreview 기반 현지화 가격 공용 조회.
 *
 * [회귀 가드]
 * - 전 티어×주기가 모두 해석될 때만 채택(부분 실패 → 전체 폴백, 통화 혼용 방지)
 * - 미설정이면 Paddle 호출 안 함 + previewFor null
 * - 세션 캐시: 두 번째 ensureLoaded 는 재호출 안 하고 결과 공유
 * - 실패 후 재시도 안 함(폴백 고정)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/paddle', () => ({
  isPaddleConfigured: vi.fn(() => true),
  getTierPriceId: vi.fn(),
  previewPrices: vi.fn(),
}))

import { isPaddleConfigured, getTierPriceId, previewPrices } from '@/utils/paddle'
import { useLocalizedPricing, _resetLocalizedPricingForTest } from '@/composables/useLocalizedPricing'

// tier:cycle → priceId (6개 전부)
const IDS = {
  'pro:monthly': 'pri_pro_m', 'pro:yearly': 'pri_pro_y',
  'pro_plus:monthly': 'pri_pp_m', 'pro_plus:yearly': 'pri_pp_y',
  'pro_max:monthly': 'pri_pm_m', 'pro_max:yearly': 'pri_pm_y',
}
// 6개 priceId 전부에 KRW 가격을 채운 previewPrices 응답.
const allKrw = () => Object.fromEntries(
  Object.values(IDS).map((id) => [id, { rawMinor: 18000, currency: 'KRW', formatted: '₩18,000' }]),
)

beforeEach(() => {
  _resetLocalizedPricingForTest()
  vi.clearAllMocks()
  isPaddleConfigured.mockReturnValue(true)
  getTierPriceId.mockImplementation((tier, cycle) => IDS[`${tier}:${cycle}`] || '')
})

describe('useLocalizedPricing', () => {
  it('전 티어×주기가 모두 해석되면 previewFor 가 현지화 값 반환', async () => {
    previewPrices.mockResolvedValue(allKrw())
    const { ensureLoaded, previewFor } = useLocalizedPricing()
    await ensureLoaded()
    expect(previewFor('pro', 'monthly')).toEqual({ rawMinor: 18000, currency: 'KRW' })
    expect(previewFor('pro_max', 'yearly')).toEqual({ rawMinor: 18000, currency: 'KRW' })
    // previewPrices 는 설정된 6개 ID로 호출
    expect(previewPrices).toHaveBeenCalledWith(Object.values(IDS))
  })

  it('일부 라인 누락이면 전체 폴백(all-or-nothing) — previewFor null', async () => {
    const partial = allKrw()
    delete partial['pri_pm_y']   // 6개 중 1개 누락
    previewPrices.mockResolvedValue(partial)
    const { ensureLoaded, previewFor } = useLocalizedPricing()
    await ensureLoaded()
    expect(previewFor('pro', 'monthly')).toBeNull()
    expect(previewFor('pro_max', 'yearly')).toBeNull()
  })

  it('previewPrices 가 null(실패)이면 previewFor null', async () => {
    previewPrices.mockResolvedValue(null)
    const { ensureLoaded, previewFor } = useLocalizedPricing()
    await ensureLoaded()
    expect(previewFor('pro', 'monthly')).toBeNull()
  })

  it('Paddle 미설정이면 호출 안 하고 previewFor null', async () => {
    isPaddleConfigured.mockReturnValue(false)
    const { ensureLoaded, previewFor } = useLocalizedPricing()
    await ensureLoaded()
    expect(previewPrices).not.toHaveBeenCalled()
    expect(previewFor('pro', 'monthly')).toBeNull()
  })

  it('세션 캐시 — 두 번째 ensureLoaded 는 재호출 안 하고 결과 공유', async () => {
    previewPrices.mockResolvedValue(allKrw())
    const a = useLocalizedPricing()
    await a.ensureLoaded()
    const b = useLocalizedPricing()
    await b.ensureLoaded()
    expect(previewPrices).toHaveBeenCalledTimes(1)
    expect(b.previewFor('pro', 'monthly')).toEqual({ rawMinor: 18000, currency: 'KRW' })
  })

  it('실패(null) 후에는 재시도 안 함 — 폴백 고정', async () => {
    previewPrices.mockResolvedValue(null)
    const { ensureLoaded } = useLocalizedPricing()
    await ensureLoaded()
    await ensureLoaded()
    expect(previewPrices).toHaveBeenCalledTimes(1)
  })
})
