/**
 * useLocalizedPricing — Paddle PricePreview 기반 '현지화 가격' 공용 조회.
 *
 * [왜] 표시 가격을 '실제 청구액'과 일치시킨다. 한국 사용자는 ₩(USD price 의 KR override),
 *   그 외는 $ — Paddle 이 구매자 IP로 통화·금액을 산정한다. 체크아웃과 '동일한' Price ID 를
 *   미리보므로 표시=청구가 구조적으로 보장된다. 미설정/실패/지연 시엔 호출부가 기존
 *   (BE PricingConfig=USD) 표시로 폴백 → 회귀 없음.
 *
 * [공유] 통화는 세션 내 IP로 고정이라 PricePreview 를 세션당 1회만 호출하고 모듈 스코프에
 *   캐시한다. 가격 페이지·업그레이드 모달 등 여러 화면이 같은 결과를 즉시 공유 → 통화 일관성.
 *
 * 구조: previewFor(tier, cycle) → { rawMinor(최소단위 정수: USD 센트/KRW 원), currency } | null
 */
import { ref } from 'vue'
import { isPaddleConfigured, getTierPriceId, previewPrices } from '@/utils/paddle'
import { TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX } from '@/utils/subscription'

const PAID_TIERS = [TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]
const CYCLES = ['monthly', 'yearly']

// 모듈 스코프(싱글톤) — 세션당 1회 로드. 통화는 IP 고정이라 캐시 안전.
const _preview = ref(null)   // { 'pro:monthly': { rawMinor, currency }, ... } | null
let _inflight = null
let _attempted = false

const _doLoad = async (timeoutMs) => {
  if (!isPaddleConfigured()) return
  const entries = []
  for (const tier of PAID_TIERS) {
    for (const cycle of CYCLES) {
      const priceId = getTierPriceId(tier, cycle)
      if (priceId) entries.push({ tier, cycle, priceId })
    }
  }
  if (!entries.length) return
  // SDK 로드/네트워크 지연이 화면을 오래 잡지 않게 타임아웃 가드(이후 USD 폴백).
  const previews = await Promise.race([
    previewPrices(entries.map((e) => e.priceId)),
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]).catch(() => null)
  if (!previews) return
  const map = {}
  for (const e of entries) {
    const p = previews[e.priceId]
    if (p) map[`${e.tier}:${e.cycle}`] = { rawMinor: p.rawMinor, currency: p.currency }
  }
  // 요청 항목이 '모두' 채워질 때만 채택 — 통화 혼용(일부 ₩/일부 $) 방지.
  if (Object.keys(map).length === entries.length) _preview.value = map
}

export function useLocalizedPricing() {
  // 세션 1회 로드(공유). 성공 시 캐시 즉시 반환, 실패 시 재시도 안 함(폴백 유지).
  const ensureLoaded = async ({ timeoutMs = 3000 } = {}) => {
    if (_preview.value || _attempted) return
    if (!_inflight) _inflight = _doLoad(timeoutMs).finally(() => { _attempted = true; _inflight = null })
    await _inflight
  }
  // 해당 tier:cycle 의 현지화 금액/통화. 미가용이면 null → 호출부가 폴백.
  const previewFor = (tier, cycle) => _preview.value?.[`${tier}:${cycle}`] || null
  return { ensureLoaded, previewFor, preview: _preview }
}

/** 테스트 전용 — 모듈 캐시 리셋. */
export const _resetLocalizedPricingForTest = () => {
  _preview.value = null
  _inflight = null
  _attempted = false
}
