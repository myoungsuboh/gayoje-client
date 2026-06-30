/**
 * Paddle (Merchant of Record) 결제 — 클라이언트 체크아웃 래퍼.
 *
 * [상태] 샌드박스 컷오버 (2026-06-10). VITE_PADDLE_CLIENT_TOKEN 설정 전엔 비활성(게이트).
 *   토큰 + price ID 는 env 주입 — 계약: docs/paddle-activation-runbook.md.
 *   설계: docs/payments-go-live-checklist.md, docs/pricing-final.md.
 *
 * [API 근거] Paddle Billing v2 (client-side token):
 *   - Paddle.Environment.set('sandbox')                    — sandbox 시, Initialize 전 필수
 *   - Paddle.Initialize({ token, eventCallback })          — 필수 초기화 (1회)
 *   - Paddle.Checkout.open({ items:[{priceId,quantity}], customer, customData })
 *   client-side token 은 프론트 노출 안전.
 *   docs: https://developer.paddle.com/paddlejs/methods/paddle-initialize
 *         https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/
 *
 * [entitlement] 결제 성공의 진실원천은 BE 웹훅(subscription.*)이다.
 *   FE 는 체크아웃을 "열기만" 하고, checkout.completed 후 usage 스토어를
 *   폴링(waitForEntitlementChange)해 등급 반영을 확인한다.
 */

const PADDLE_SDK_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js'

// 환경변수는 호출 시점에 읽는다 (테스트에서 stubEnv 가능하도록).
export const getPaddleToken = () => import.meta.env.VITE_PADDLE_CLIENT_TOKEN || ''
// 'sandbox' | 'production' — 미설정 시 production.
export const getPaddleEnv = () => import.meta.env.VITE_PADDLE_ENV || 'production'
/** 결제 활성 여부 — 토큰 없으면 비활성(게이트). (cf. pricing.vue 의 isTossConfigured 패턴) */
export const isPaddleConfigured = () => !!getPaddleToken()

// SDK 동적 로드 — 싱글톤 캐시.
let _sdkPromise = null
export const loadPaddleSdk = () => {
  if (_sdkPromise) return _sdkPromise
  _sdkPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Paddle SDK: window 없음'))
      return
    }
    if (window.Paddle) {
      resolve(window.Paddle)
      return
    }
    const script = document.createElement('script')
    script.src = PADDLE_SDK_URL
    script.async = true
    script.onload = () =>
      window.Paddle ? resolve(window.Paddle) : reject(new Error('Paddle SDK 로드 실패'))
    script.onerror = () => reject(new Error('Paddle SDK 스크립트 로드 실패'))
    document.head.appendChild(script)
  })
  return _sdkPromise
}

// 체크아웃 이벤트 핸들러 — 화면(pricing.vue)이 설정/해제. eventCallback 클로저가 항상 최신 참조를 호출.
// Initialize 는 1회뿐이라 콜백을 직접 바꿀 수 없음 → 간접 디스패치.
let _eventHandler = null
/** Paddle 이벤트(checkout.completed 등) 수신 핸들러 등록. null 로 해제. */
export const setPaddleEventHandler = (fn) => { _eventHandler = fn }

let _initialized = false
/** SDK 로드 + Paddle.Initialize (1회). 미설정 시 throw. */
export const initPaddle = async () => {
  if (!isPaddleConfigured()) {
    throw new Error('Paddle 미설정 (VITE_PADDLE_CLIENT_TOKEN 없음)')
  }
  const Paddle = await loadPaddleSdk()
  if (!_initialized) {
    // [v2] sandbox 는 Initialize 파라미터가 아니라 Environment.set 으로 — 반드시 Initialize 전에.
    // (environment 파라미터는 Paddle.js v2 에 존재하지 않음 — 넣어도 무시되어 production 으로 붙는다.)
    if (getPaddleEnv() === 'sandbox') Paddle.Environment.set('sandbox')
    Paddle.Initialize({
      token: getPaddleToken(),
      eventCallback: (ev) => {
        try { _eventHandler?.(ev) } catch { /* 핸들러 오류가 SDK 를 깨지 않게 */ }
      },
    })
    _initialized = true
  }
  return Paddle
}

/**
 * 체크아웃 오버레이 열기 (구독 또는 단건 팩 공용 — Paddle priceId 단위).
 * @param {object} opts
 * @param {string} opts.priceId   Paddle Price ID (구독 티어 또는 팩) — 필수
 * @param {number} [opts.quantity=1]
 * @param {string} [opts.email]   고객 이메일 프리필
 * @param {object} [opts.customData]  BE 웹훅이 식별에 쓸 메타 (예: {user_id, pack_type})
 * @returns {Promise<void>}
 */
export const openCheckout = async ({ priceId, quantity = 1, email, customData } = {}) => {
  if (!priceId) throw new Error('openCheckout: priceId 필수')
  const Paddle = await initPaddle()
  Paddle.Checkout.open({
    items: [{ priceId, quantity }],
    ...(email ? { customer: { email } } : {}),
    ...(customData ? { customData } : {}),
    settings: {
      // [2026-06] 주문요약 높이 축소 → 스크롤 완화. 'VAT 번호 추가'(B2B 세금ID) 행 숨김 —
      // B2C 위주라 거의 안 쓰고 높이만 차지한다. 할인 행(showAddDiscounts)은 쿠폰 코드
      // 입력에 쓰이므로 유지. (오버레이 내부 레이아웃은 Paddle 소관 — 더 줄이려면 inline 전환.)
      showAddTaxId: false,
    },
  })
}

/**
 * 티어/주기 → Paddle Price ID.
 * Price ID(pri_xxx)는 가맹점 승인 후 Paddle 대시보드에서 상품 생성 시 발급 → env 주입.
 * ⚠️ Vite는 정적 `import.meta.env.VITE_*`만 빌드 시 치환한다. 동적 키(`import.meta.env[k]`)는
 *    프로덕션에서 미치환 → 반드시 정적 접근으로 나열할 것.
 */
const priceIdMap = () => ({
  pro: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_PRO_M || '',
    yearly: import.meta.env.VITE_PADDLE_PRICE_PRO_Y || '',
  },
  pro_plus: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_PROPLUS_M || '',
    yearly: import.meta.env.VITE_PADDLE_PRICE_PROPLUS_Y || '',
  },
  pro_max: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_PROMAX_M || '',
    yearly: import.meta.env.VITE_PADDLE_PRICE_PROMAX_Y || '',
  },
})

/** 티어+주기('monthly'|'yearly')의 Paddle Price ID. 미설정이면 ''. */
export const getTierPriceId = (tier, cycle = 'monthly') => priceIdMap()[tier]?.[cycle] || ''

/** 저장된 price ID → 주기('monthly'|'yearly'). env 가격표에서 역추적, 미상이면 ''.
 *  기존 구독자의 '등급 변경'이 화면 토글과 무관하게 현재 주기를 유지하도록 쓰인다. */
export const getCycleForPriceId = (priceId) => {
  if (!priceId) return ''
  const map = priceIdMap()
  for (const tier of Object.keys(map)) {
    for (const cycle of Object.keys(map[tier])) {
      if (map[tier][cycle] && map[tier][cycle] === priceId) return cycle
    }
  }
  return ''
}

/**
 * 현지화 가격 미리보기 — Paddle 이 구매자 위치(IP)로 산정한 '실제 청구' 금액/통화.
 * 가격 페이지의 표시가를 체크아웃 청구액과 일치시키는 용도 (KR=₩ override / 그 외=$ 자동).
 * 체크아웃과 '동일한' Price ID 를 그대로 미리보므로 표시=청구가 구조적으로 보장된다.
 *
 * [API] Paddle.PricePreview({ items:[{priceId,quantity}] })
 *   → res.data.currencyCode,
 *     res.data.details.lineItems[].{ price.id, totals.total(최소단위 문자열), formattedTotals.total }
 *   docs: https://developer.paddle.com/paddlejs/methods/paddle-pricepreview
 *
 * @param {string[]} priceIds  미리볼 Paddle Price ID 목록
 * @returns {Promise<Record<string,{rawMinor:number,currency:string,formatted:string}>|null>}
 *   priceId → { rawMinor(최소단위 정수: USD 센트/KRW 원), currency(ISO), formatted(Paddle 현지화 문자열) }.
 *   미설정/미지원/실패 시 null — 호출자는 기존(BE PricingConfig=USD) 표시로 폴백한다.
 */
export const previewPrices = async (priceIds = []) => {
  const ids = [...new Set((priceIds || []).filter(Boolean))]
  if (!ids.length || !isPaddleConfigured()) return null
  let Paddle
  try { Paddle = await initPaddle() } catch { return null }
  if (typeof Paddle?.PricePreview !== 'function') return null
  try {
    const res = await Paddle.PricePreview({ items: ids.map((priceId) => ({ priceId, quantity: 1 })) })
    const lineItems = res?.data?.details?.lineItems
    const currencyCode = res?.data?.currencyCode || ''
    if (!Array.isArray(lineItems) || !lineItems.length) return null
    const out = {}
    for (const li of lineItems) {
      const id = li?.price?.id
      // totals.total = 세금포함 총액(최소단위 문자열). 통화는 응답 공통(currencyCode) 우선.
      const rawMinor = Number(li?.totals?.total)
      const currency = currencyCode || li?.price?.unitPrice?.currencyCode || ''
      if (!id || !currency || !Number.isFinite(rawMinor)) continue
      out[id] = { rawMinor, currency, formatted: li?.formattedTotals?.total || '' }
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

/**
 * 구독 티어 체크아웃 — 티어/주기로 priceId 해석 후 오버레이 오픈.
 * @param {{tier:string, cycle?:'monthly'|'yearly', email?:string, customData?:object}} opts
 */
export const openTierCheckout = async ({ tier, cycle = 'monthly', email, customData } = {}) => {
  const priceId = getTierPriceId(tier, cycle)
  if (!priceId) throw new Error(`Paddle price ID 미설정: ${tier}/${cycle}`)
  return openCheckout({ priceId, email, customData })
}

/**
 * 결제 후 entitlement(등급) 반영 대기 — getTier 를 주기 호출해 fromTier 와 달라지면 반환.
 * 진실원천(BE 웹훅)은 비동기라 결제 직후 반영까지 수 초 걸림. 기본 10회 × 3초 = 최대 ~30초.
 * 끝까지 안 바뀌면 null — 호출자가 "반영 지연" 안내.
 * @param {() => Promise<string>} getTier  현재 등급 조회 (보통 usage 스토어 강제 refresh)
 * @param {{fromTier?:string, tries?:number, intervalMs?:number}} opts
 * @returns {Promise<string|null>} 바뀐 등급 또는 null
 */
export const waitForEntitlementChange = async (getTier, { fromTier, tries = 10, intervalMs = 3000 } = {}) => {
  for (let i = 0; i < tries; i++) {
    let tier = null
    try { tier = await getTier() } catch { /* 일시 오류는 다음 시도에서 재확인 */ }
    if (tier && tier !== fromTier) return tier
    if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return null
}

/** 테스트 전용 — 싱글톤 상태 리셋. */
export const _resetPaddleForTest = () => {
  _sdkPromise = null
  _initialized = false
  _eventHandler = null
}
