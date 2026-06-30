/**
 * paddle.js — Paddle 클라이언트 체크아웃 래퍼 (스캐폴딩).
 *
 * 계정/샌드박스 없이도 검증 가능한 부분: 설정 게이트 + 미설정 가드 +
 * 설정 시 Paddle.Initialize/Checkout.open 호출 형태 + 싱글톤 초기화.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getPaddleToken,
  getPaddleEnv,
  isPaddleConfigured,
  initPaddle,
  openCheckout,
  getTierPriceId,
  getCycleForPriceId,
  openTierCheckout,
  setPaddleEventHandler,
  waitForEntitlementChange,
  previewPrices,
  _resetPaddleForTest,
} from '@/utils/paddle'

const setPaddleMock = () => {
  const mock = {
    Initialize: vi.fn(),
    Checkout: { open: vi.fn() },
    Environment: { set: vi.fn() },
    PricePreview: vi.fn(),
  }
  // window.Paddle 가 있으면 loadPaddleSdk 가 즉시 resolve (스크립트 주입 불필요).
  globalThis.window.Paddle = mock
  return mock
}

beforeEach(() => {
  _resetPaddleForTest()
  vi.unstubAllEnvs()
  if (globalThis.window) delete globalThis.window.Paddle
})

afterEach(() => {
  vi.unstubAllEnvs()
  if (globalThis.window) delete globalThis.window.Paddle
})

describe('paddle.js — 설정 게이트', () => {
  it('토큰 없으면 isPaddleConfigured() = false', () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', '')
    expect(isPaddleConfigured()).toBe(false)
    expect(getPaddleToken()).toBe('')
  })

  it('토큰 있으면 isPaddleConfigured() = true', () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    expect(isPaddleConfigured()).toBe(true)
    expect(getPaddleToken()).toBe('test_tok_123')
  })

  it('환경 기본값은 production, 설정 시 sandbox', () => {
    vi.stubEnv('VITE_PADDLE_ENV', '')
    expect(getPaddleEnv()).toBe('production')
    vi.stubEnv('VITE_PADDLE_ENV', 'sandbox')
    expect(getPaddleEnv()).toBe('sandbox')
  })
})

describe('paddle.js — 가드', () => {
  it('미설정 상태에서 initPaddle()은 throw', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', '')
    await expect(initPaddle()).rejects.toThrow(/미설정/)
  })

  it('priceId 없으면 openCheckout()은 throw', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    await expect(openCheckout({})).rejects.toThrow(/priceId/)
  })
})

describe('paddle.js — 환경 설정 (v2: Environment.set)', () => {
  it('sandbox 면 Initialize 전에 Paddle.Environment.set("sandbox") 호출', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    vi.stubEnv('VITE_PADDLE_ENV', 'sandbox')
    const mock = setPaddleMock()
    await initPaddle()
    expect(mock.Environment.set).toHaveBeenCalledWith('sandbox')
    // Initialize 에 environment 파라미터는 없어야 함 (v2 API 에 존재하지 않음)
    expect(mock.Initialize).toHaveBeenCalledWith(
      expect.not.objectContaining({ environment: expect.anything() })
    )
    // 호출 순서: Environment.set → Initialize
    expect(mock.Environment.set.mock.invocationCallOrder[0])
      .toBeLessThan(mock.Initialize.mock.invocationCallOrder[0])
  })

  it('production 이면 Environment.set 호출 안 함 (기본값)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'live_tok_123')
    vi.stubEnv('VITE_PADDLE_ENV', 'production')
    const mock = setPaddleMock()
    await initPaddle()
    expect(mock.Environment.set).not.toHaveBeenCalled()
  })
})

describe('paddle.js — 체크아웃 호출', () => {
  it('설정 시 Initialize + Checkout.open 을 올바른 인자로 호출', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    vi.stubEnv('VITE_PADDLE_ENV', 'sandbox')
    const mock = setPaddleMock()

    await openCheckout({
      priceId: 'pri_pro_monthly',
      email: 'u@x.com',
      customData: { user_id: 'u1' },
    })

    // [v2] environment 는 Initialize 인자가 아님 — Environment.set 별도 호출.
    expect(mock.Environment.set).toHaveBeenCalledWith('sandbox')
    expect(mock.Initialize).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'test_tok_123' })
    )
    expect(mock.Checkout.open).toHaveBeenCalledWith({
      items: [{ priceId: 'pri_pro_monthly', quantity: 1 }],
      customer: { email: 'u@x.com' },
      customData: { user_id: 'u1' },
      settings: { showAddTaxId: false },
    })
  })

  it('Initialize 는 여러 번 호출해도 1회만 (싱글톤)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()

    await openCheckout({ priceId: 'pri_a' })
    await openCheckout({ priceId: 'pri_b' })

    expect(mock.Initialize).toHaveBeenCalledTimes(1)
    expect(mock.Checkout.open).toHaveBeenCalledTimes(2)
  })

  it('email/customData 없으면 해당 키 없이 호출', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()

    await openCheckout({ priceId: 'pri_a', quantity: 2 })

    expect(mock.Checkout.open).toHaveBeenCalledWith({
      items: [{ priceId: 'pri_a', quantity: 2 }],
      settings: { showAddTaxId: false },
    })
  })
})

describe('paddle.js — 이벤트 핸들러', () => {
  it('Initialize 에 eventCallback 전달, setPaddleEventHandler 로 수신', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    const received = []
    setPaddleEventHandler((ev) => received.push(ev))
    await initPaddle()
    const cb = mock.Initialize.mock.calls[0][0].eventCallback
    expect(typeof cb).toBe('function')
    cb({ name: 'checkout.completed', data: { id: 'txn_1' } })
    expect(received).toEqual([{ name: 'checkout.completed', data: { id: 'txn_1' } }])
  })

  it('핸들러는 init 이후에 교체해도 동작 (클로저가 최신 핸들러 참조)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    await initPaddle()
    const received = []
    setPaddleEventHandler((ev) => received.push(ev.name))
    mock.Initialize.mock.calls[0][0].eventCallback({ name: 'checkout.closed' })
    expect(received).toEqual(['checkout.closed'])
  })

  it('핸들러 미설정이어도 eventCallback 은 throw 하지 않음', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    await initPaddle()
    expect(() => mock.Initialize.mock.calls[0][0].eventCallback({ name: 'x' })).not.toThrow()
  })

  it('핸들러가 throw 해도 eventCallback 은 전파하지 않음 (SDK 보호)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    setPaddleEventHandler(() => { throw new Error('boom') })
    await initPaddle()
    expect(() => mock.Initialize.mock.calls[0][0].eventCallback({ name: 'x' })).not.toThrow()
  })
})

describe('paddle.js — waitForEntitlementChange', () => {
  it('티어가 바뀌면 그 티어를 반환', async () => {
    vi.useFakeTimers()
    try {
      let tier = 'free'
      const p = waitForEntitlementChange(async () => tier, { fromTier: 'free', tries: 5, intervalMs: 1000 })
      tier = 'pro'
      await vi.advanceTimersByTimeAsync(1000)
      await expect(p).resolves.toBe('pro')
    } finally {
      vi.useRealTimers()
    }
  })

  it('즉시 바뀌어 있으면 대기 없이 반환', async () => {
    const tier = await waitForEntitlementChange(async () => 'pro_plus', { fromTier: 'free' })
    expect(tier).toBe('pro_plus')
  })

  it('tries 소진까지 안 바뀌면 null', async () => {
    vi.useFakeTimers()
    try {
      const p = waitForEntitlementChange(async () => 'free', { fromTier: 'free', tries: 3, intervalMs: 1000 })
      await vi.advanceTimersByTimeAsync(3000)
      await expect(p).resolves.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('getTier 가 throw 하면 그 시도는 건너뛰고 계속 폴링', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const p = waitForEntitlementChange(async () => {
        calls += 1
        if (calls === 1) throw new Error('일시 오류')
        return 'pro'
      }, { fromTier: 'free', tries: 3, intervalMs: 1000 })
      await vi.advanceTimersByTimeAsync(1000)
      await expect(p).resolves.toBe('pro')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('paddle.js — 티어 priceId 매핑', () => {
  it('env 미설정이면 getTierPriceId() = ""', () => {
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_M', '')
    expect(getTierPriceId('pro', 'monthly')).toBe('')
  })

  it('env 설정 시 티어/주기로 priceId 해석', () => {
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_M', 'pri_pro_m')
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_Y', 'pri_pro_y')
    vi.stubEnv('VITE_PADDLE_PRICE_PROMAX_M', 'pri_max_m')
    expect(getTierPriceId('pro', 'monthly')).toBe('pri_pro_m')
    expect(getTierPriceId('pro', 'yearly')).toBe('pri_pro_y')
    expect(getTierPriceId('pro_max', 'monthly')).toBe('pri_max_m')
    expect(getTierPriceId('pro', 'monthly')).not.toBe('pri_pro_y')
  })

  it('알 수 없는 티어/주기는 ""', () => {
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_M', 'pri_pro_m')
    expect(getTierPriceId('nope', 'monthly')).toBe('')
    expect(getTierPriceId('pro', 'weekly')).toBe('')
  })

  it('priceId 미설정 시 openTierCheckout()은 throw (게이트)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_M', '')
    await expect(openTierCheckout({ tier: 'pro', cycle: 'monthly' })).rejects.toThrow(/price ID 미설정/)
  })

  it('priceId 설정 시 openTierCheckout()은 해당 priceId로 Checkout.open', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    vi.stubEnv('VITE_PADDLE_PRICE_PROPLUS_Y', 'pri_pp_y')
    const mock = setPaddleMock()

    await openTierCheckout({ tier: 'pro_plus', cycle: 'yearly', email: 'a@b.com' })

    expect(mock.Checkout.open).toHaveBeenCalledWith({
      items: [{ priceId: 'pri_pp_y', quantity: 1 }],
      customer: { email: 'a@b.com' },
      settings: { showAddTaxId: false },
    })
  })
})

describe('paddle.js — getCycleForPriceId (주기 역추적)', () => {
  it('저장된 price ID 로 현재 주기를 역추적', () => {
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_M', 'pri_pro_m')
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_Y', 'pri_pro_y')
    vi.stubEnv('VITE_PADDLE_PRICE_PROPLUS_Y', 'pri_pp_y')
    expect(getCycleForPriceId('pri_pro_m')).toBe('monthly')
    expect(getCycleForPriceId('pri_pro_y')).toBe('yearly')
    expect(getCycleForPriceId('pri_pp_y')).toBe('yearly')
  })

  it('미상/빈 price ID 는 "" (호출자가 토글로 폴백)', () => {
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_M', 'pri_pro_m')
    expect(getCycleForPriceId('pri_unknown')).toBe('')
    expect(getCycleForPriceId('')).toBe('')
    expect(getCycleForPriceId(undefined)).toBe('')
  })
})

describe('paddle.js — previewPrices (현지화 가격 미리보기)', () => {
  // Paddle.PricePreview 응답 모양 빌더 — data.currencyCode + details.lineItems[].
  const previewResponse = (currencyCode, rows) => ({
    data: {
      currencyCode,
      details: {
        lineItems: rows.map(([id, total, formatted]) => ({
          price: { id },
          totals: { total: String(total) },
          formattedTotals: { total: formatted },
        })),
      },
    },
  })

  it('미설정(토큰 없음)이면 null — Paddle 호출 안 함', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', '')
    expect(await previewPrices(['pri_a'])).toBeNull()
  })

  it('빈/falsy ID 목록이면 null', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    expect(await previewPrices([])).toBeNull()
    expect(await previewPrices(['', null, undefined])).toBeNull()
    expect(mock.PricePreview).not.toHaveBeenCalled()
  })

  it('KRW 응답을 priceId→{rawMinor,currency,formatted} 로 파싱 + items 인자 형태', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    mock.PricePreview.mockResolvedValue(previewResponse('KRW', [
      ['pri_pro_m', 18000, '₩18,000'],
      ['pri_pro_y', 180000, '₩180,000'],
    ]))
    const out = await previewPrices(['pri_pro_m', 'pri_pro_y'])
    expect(out).toEqual({
      pri_pro_m: { rawMinor: 18000, currency: 'KRW', formatted: '₩18,000' },
      pri_pro_y: { rawMinor: 180000, currency: 'KRW', formatted: '₩180,000' },
    })
    expect(mock.PricePreview).toHaveBeenCalledWith({
      items: [
        { priceId: 'pri_pro_m', quantity: 1 },
        { priceId: 'pri_pro_y', quantity: 1 },
      ],
    })
  })

  it('USD 응답도 센트 정수로 파싱', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    mock.PricePreview.mockResolvedValue(previewResponse('USD', [['pri_pro_m', 1200, '$12.00']]))
    const out = await previewPrices(['pri_pro_m'])
    expect(out.pri_pro_m).toEqual({ rawMinor: 1200, currency: 'USD', formatted: '$12.00' })
  })

  it('중복 ID 는 디듀프해서 한 번만 요청', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    mock.PricePreview.mockResolvedValue(previewResponse('USD', [['pri_a', 1200, '$12']]))
    await previewPrices(['pri_a', 'pri_a'])
    expect(mock.PricePreview).toHaveBeenCalledWith({ items: [{ priceId: 'pri_a', quantity: 1 }] })
  })

  it('PricePreview 가 reject 하면 null (폴백)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    mock.PricePreview.mockRejectedValue(new Error('network'))
    expect(await previewPrices(['pri_a'])).toBeNull()
  })

  it('lineItems 가 비었거나 형식이 어긋나면 null', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    mock.PricePreview.mockResolvedValue({ data: { currencyCode: 'USD', details: { lineItems: [] } } })
    expect(await previewPrices(['pri_a'])).toBeNull()
    mock.PricePreview.mockResolvedValue({ data: {} })
    expect(await previewPrices(['pri_a'])).toBeNull()
  })

  it('total/통화 누락 라인은 건너뛰고 유효 라인만 채택', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    mock.PricePreview.mockResolvedValue({
      data: { currencyCode: 'KRW', details: { lineItems: [
        { price: { id: 'pri_ok' }, totals: { total: '18000' }, formattedTotals: { total: '₩18,000' } },
        { price: { id: 'pri_bad' }, totals: {} },   // total 없음 → NaN → skip
      ] } },
    })
    const out = await previewPrices(['pri_ok', 'pri_bad'])
    expect(out).toEqual({ pri_ok: { rawMinor: 18000, currency: 'KRW', formatted: '₩18,000' } })
  })

  it('SDK 에 PricePreview 가 없으면 null (구버전 가드)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    delete mock.PricePreview
    expect(await previewPrices(['pri_a'])).toBeNull()
  })
})
