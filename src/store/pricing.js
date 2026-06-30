/**
 * Pricing store — BE 의 동적 가격 (PricingConfig) 을 FE 의 single source.
 *
 * [배경 — 2026-05]
 * 기존엔 `utils/subscription.js` 의 가격 하드코딩 → 가격 변경 시 코드 수정 + 재배포 필요.
 * 이젠 BE 가 PricingConfig 노드 보유, FE 는 부팅 시 fetch.
 *
 * [통화 — 2026-06 USD]
 * BE 가 currency('USD'|'KRW') + 최소단위(USD 센트 / KRW 원) 정수를 줌.
 * 표시는 `priceText`/`priceTextLong` 가 formatCurrency 로 통화-인식 포맷.
 * (BE 미배포/legacy 행이면 currency='KRW' → ₩ 로 안전 fallback.)
 *
 * [흐름]
 * 1. App.vue 부팅 시 `usePricingStore().fetch()` 1회 호출.
 * 2. 컴포넌트가 `store.priceFinal(tier)` / `store.priceText(tier)` / `store.currency(tier)` 조회.
 * 3. admin 가격 수정 → `store.refresh()` → 모든 컴포넌트 반영.
 *
 * [BE 응답 shape]
 *   { pricing: [{ tier, base_price, discount_pct, final_price, currency, updated_at, updated_by }] }
 *
 * [Fallback]
 * BE 호출 실패 시 subscription.js 의 TIER_META 기본값(priceMinor/currency) 사용.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchPricingApi } from '@/utils/pricing'
import { TIER_META as FALLBACK_META } from '@/utils/subscription'
import { formatCurrency } from '@/utils/format'

export const usePricingStore = defineStore('pricing', () => {
  // pricing[tier] = { base_price, discount_pct, final_price, currency, updated_at, updated_by }
  const pricing = ref({})
  const isLoading = ref(false)
  const errorMsg = ref('')
  const fetchedAt = ref(0)

  const isLoaded = computed(() => Object.keys(pricing.value).length > 0)

  /**
   * BE /api/pricing 호출 + state 채움.
   * 캐시 정책: 10분 (가격은 자주 바뀌지 않음). force=true 면 캐시 무시.
   */
  const fetch = async ({ force = false } = {}) => {
    const CACHE_TTL = 10 * 60 * 1000
    if (!force && isLoaded.value && Date.now() - fetchedAt.value < CACHE_TTL) {
      return { success: true, fromCache: true }
    }
    if (isLoading.value) return { success: false, error: 'already loading' }
    isLoading.value = true
    errorMsg.value = ''
    const r = await fetchPricingApi()
    isLoading.value = false
    if (r.success) {
      const map = {}
      for (const p of (r.data?.pricing || [])) {
        map[p.tier] = p
      }
      pricing.value = map
      fetchedAt.value = Date.now()
      return { success: true }
    }
    errorMsg.value = r.error || '가격 정보를 불러오지 못했습니다.'
    return { success: false, error: errorMsg.value }
  }

  /** admin 이 가격 수정 후 호출 — 강제 새로고침. */
  const refresh = () => fetch({ force: true })

  // ─── 등급별 조회 ─────────────────────────────────────
  const _get = (tier) => pricing.value[tier] || null

  /** 통화 코드 ('USD' | 'KRW'). BE 미응답/legacy 시 fallback. */
  const currency = (tier) =>
    _get(tier)?.currency ?? FALLBACK_META[tier]?.currency ?? 'USD'

  /** 최종 가격 (할인 후, 최소 단위 정수). BE 미응답 시 FALLBACK_META 사용. */
  const priceFinal = (tier) => {
    const p = _get(tier)
    if (p) return p.final_price
    return FALLBACK_META[tier]?.priceMinor ?? 0
  }
  /** 정가 (할인 전, 최소 단위 정수). */
  const basePrice = (tier) => _get(tier)?.base_price ?? FALLBACK_META[tier]?.priceMinor ?? 0
  /** 할인율 0-100. */
  const discountPct = (tier) => _get(tier)?.discount_pct ?? 0

  /** priceText — 통화-인식 표시 문자열 ("$9" / "₩17,900"). 0 이면 '무료'. */
  const priceText = (tier) => {
    const v = priceFinal(tier)
    if (v === 0) return '무료'
    return formatCurrency(v, currency(tier))
  }
  /** priceTextLong — "$9 / 월" */
  const priceTextLong = (tier) => {
    const v = priceFinal(tier)
    if (v === 0) return '무료'
    return `${formatCurrency(v, currency(tier))} / 월`
  }

  return {
    // state
    pricing, isLoading, errorMsg, isLoaded,
    // actions
    fetch, refresh,
    // getters
    priceFinal, basePrice, discountPct, currency, priceText, priceTextLong,
  }
})
