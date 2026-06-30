<script setup>
/**
 * Pricing 페이지 — 가격 비교 + Paddle(MoR) 체크아웃 + 구독 관리(고객포털).
 *
 * [흐름 — 신규 구독/업그레이드]
 *   1. plan 카드 CTA 클릭 → openTierCheckout (Paddle 오버레이 체크아웃)
 *   2. 결제 성공 → Paddle eventCallback 'checkout.completed' 수신
 *   3. 결제 확정의 진실원천은 BE 웹훅 → waitForEntitlementChange 가 등급 반영을
 *      폴링으로 감지해 안내 (반영 지연 시 새로고침 안내)
 *
 * [흐름 — 해지/재개/결제수단/영수증]
 *   "구독 관리" 버튼 → BE /api/paddle/portal-session → Paddle 고객포털 새 탭.
 *   구독현황은 BE 가 웹훅으로 영속화한 스냅샷(/api/paddle/subscription).
 *
 * [게이트] VITE_PADDLE_CLIENT_TOKEN 미설정 시 결제 비활성 — "준비 중" 안내만.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, BadgeCheck, Crown, Loader2, AlertCircle, CheckCircle2, ExternalLink,
} from 'lucide-vue-next'
import { verifyToken } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import { usePricingStore } from '@/store/pricing'
import { useQuotaConfigStore } from '@/store/quotaConfig'
import { useUsageStore } from '@/store/usage'
import { formatCurrency, splitPriceText } from '@/utils/format'
import { useTierPerks } from '@/composables/useTierPerks'
import {
  TIER_FREE, TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX,
  getTierMeta, getTierLabel, isPaidTier,
} from '@/utils/subscription'
// [2026-06] 결제는 Paddle(MoR) 오버레이 체크아웃. 토스 결제 흐름은 은퇴 완료.
import {
  isPaddleConfigured, openTierCheckout, getCycleForPriceId,
  setPaddleEventHandler, waitForEntitlementChange,
} from '@/utils/paddle'
import { fetchPaddleSubscriptionApi, createPortalSessionApi, changeSubscriptionApi } from '@/utils/paddleApi'
import { useConfirm } from '@/composables/useConfirm'
import { useLocalizedPricing } from '@/composables/useLocalizedPricing'

const { t } = useI18n()
const router = useRouter()
const confirm = useConfirm()
const quotaConfigStore = useQuotaConfigStore()
const { perksFor } = useTierPerks()
const { showSuccess, showError, showWarning } = useSnackbar() ?? {}
const pricingStore = usePricingStore()
const usageStore = useUsageStore()

const TIER_ORDER = [TIER_FREE, TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]

// 사용자 정보
const user = ref(null)
// Paddle 구독 스냅샷 — BE 가 웹훅으로 영속화한 { subscription_id, customer_id, status, price_id, current_period_end }
const paddleSub = ref(null)
const isLoading = ref(true)
const submitting = ref({})       // submitting[tier] = true
const portalLoading = ref(false)

// [2026-06] 월간/연간 결제 토글. 연간가 = 월간 final × ANNUAL_MONTHS (=2개월 무료, 16.7%↓).
// ⚠️ 표시 연간가 = Paddle 연간 price 와 반드시 일치해야 함(VITE_PADDLE_PRICE_*_Y 를 월×10 으로 설정).
// 배수는 노브 — 마진 보고 조정(11=1개월무료 등). 변경 시 Paddle 연간 price 도 같이 맞출 것.
const ANNUAL_MONTHS = 10
const billingCycle = ref('monthly')   // 'monthly' | 'yearly'
const isYearly = computed(() => billingCycle.value === 'yearly')
// 주기 코드 → 표시 라벨 (등급 변경 확인창에 '월간/연간' 명시용).
const cycleLabel = (cycle) => t(cycle === 'yearly' ? 'pricing.billing_yearly' : 'pricing.billing_monthly')

// [2026-05-18] 약관 동의 — 전자상거래법 의무. 결제 전 필수 체크.
// [2026-05-19] 자동결제 약관 추가 (2026-06 Paddle 기준으로 개정됨 — legal/auto-billing).
const agreedTerms = ref(false)
const agreedRefund = ref(false)
const agreedPrivacy = ref(false)
const agreedAutoBilling = ref(false)
const allAgreed = computed(() =>
  agreedTerms.value && agreedRefund.value && agreedPrivacy.value && agreedAutoBilling.value
)
const toggleAllAgree = () => {
  const next = !allAgreed.value
  agreedTerms.value = next
  agreedRefund.value = next
  agreedPrivacy.value = next
  agreedAutoBilling.value = next
}

// [2026-06] 약관 동의 모달 — CTA 를 항상 활성화하고, 미동의 상태로 누르면 동의 모달을
// 띄운다. (기존엔 버튼이 비활성이라 "왜 안 눌리지?" 혼란을 줌.) 모달에서 전체 동의 후
// '계속' 을 누르면 보류해 둔 tier 의 결제 흐름을 그대로 이어간다.
const agreeDialogOpen = ref(false)
const pendingTier = ref(null)
const onAgreeAndContinue = () => {
  if (!allAgreed.value) return
  agreeDialogOpen.value = false
  const tier = pendingTier.value
  pendingTier.value = null
  if (tier) handleCtaClick(tier)   // 재진입 — 이제 allAgreed 통과해 체크아웃으로
}

// [2026-06] 결제 활성 여부 — Paddle client token 설정 시. (토스 게이팅 대체)
const paddleReady = computed(() => isPaddleConfigured())

// [2026-06-24] 쿠폰 기능 제거 — Paddle Discount 로 일원화(harness 자체 쿠폰은 체크아웃에
// 미연결된 死코드였음). 쿠폰 입력/검증 UI·로직 삭제.

const userTier = computed(() => user.value?.subscription_type || TIER_FREE)

// [2026-06 이중청구 방지] 변경 가능한(=살아있는) Paddle 구독이 있는가.
// 있으면 등급 변경은 '새 체크아웃'(=새 구독 생성)이 아니라 기존 구독 price 교체로 보낸다.
// canceled(만료) 상태는 재구독(신규 체크아웃) 대상이라 제외.
const hasChangeableSub = computed(() =>
  !!paddleSub.value?.subscription_id && paddleSub.value?.status !== 'canceled'
)

// Paddle 구독 상태 라벨 — https://developer.paddle.com/concepts/subscriptions/overview 상태 집합.
const paddleStatusLabel = computed(() => {
  const s = paddleSub.value?.status
  return ({
    active: t('pricing.status_active'),
    trialing: t('pricing.status_trialing'),
    paused: t('pricing.status_paused'),
    past_due: t('pricing.status_past_due'),
    canceled: t('pricing.status_canceled'),
  })[s] || s || ''
})

// ─── [2026-06-24] 현지화 가격 미리보기 (Paddle PricePreview) ───────────────
// KR 사용자는 ₩(USD price 의 KR override), 그 외는 $ — '표시 가격'을 '실제 청구액'과
// 일치시킨다. 공용 composable 이 세션당 1회 PricePreview 로 통화/금액을 산정(업그레이드
// 모달 등과 결과 공유). 미설정/실패/지연 시엔 아래 폴백(BE PricingConfig=USD) → 회귀 없음.
const { ensureLoaded: loadPricePreview, previewFor } = useLocalizedPricing()

// 가격 표시 helper — pricingStore 우선
const tierFinalPrice = (tier) => pricingStore.isLoaded ? pricingStore.priceFinal(tier) : getTierMeta(tier).priceMinor
const tierBasePrice = (tier) => pricingStore.isLoaded ? pricingStore.basePrice(tier) : getTierMeta(tier).priceMinor
const tierDiscountPct = (tier) => pricingStore.isLoaded ? pricingStore.discountPct(tier) : 0
const tierPriceText = (tier) => pricingStore.isLoaded ? pricingStore.priceText(tier) : getTierMeta(tier).priceText
const tierCurrency = (tier) => pricingStore.isLoaded ? pricingStore.currency(tier) : (getTierMeta(tier).currency || 'USD')

// ─── 연간 표시 helper (월간 final × ANNUAL_MONTHS) ───────────────
// 표시 가격 — 월간이면 그대로, 연간이면 월×ANNUAL_MONTHS(연 총액). Free 는 항상 '무료'.
const tierDisplayPriceText = (tier) => {
  if (tier === TIER_FREE || tierFinalPrice(tier) === 0) return tierPriceText(tier)
  // 현지화 미리보기 우선 — KR=₩/그 외=$ 실제 청구액. 없으면 BE PricingConfig(USD) 폴백.
  const pv = previewFor(tier, isYearly.value ? 'yearly' : 'monthly')
  if (pv) return formatCurrency(pv.rawMinor, pv.currency)
  const minor = isYearly.value ? tierFinalPrice(tier) * ANNUAL_MONTHS : tierFinalPrice(tier)
  return formatCurrency(minor, tierCurrency(tier))
}
// 연간 모드의 strike — "월간으로 1년 냈을 때"(월×12). 절약분(2개월)을 시각적으로.
const tierYearlyStrikeText = (tier) => {
  const pvM = previewFor(tier, 'monthly')   // 월간 현지화가 × 12
  if (pvM) return formatCurrency(pvM.rawMinor * 12, pvM.currency)
  return formatCurrency(tierFinalPrice(tier) * 12, tierCurrency(tier))
}
// 연간의 월 환산 — "월 $8.33 상당".
const tierYearlyMonthlyEquivText = (tier) => {
  const pvY = previewFor(tier, 'yearly')    // 연간 현지화가 / 12
  if (pvY) return formatCurrency(Math.round(pvY.rawMinor / 12), pvY.currency)
  return formatCurrency(Math.round(tierFinalPrice(tier) * ANNUAL_MONTHS / 12), tierCurrency(tier))
}
// 연간 절약 개월 수 (12 - ANNUAL_MONTHS) — 배지 "N개월 무료".
const annualFreeMonths = 12 - ANNUAL_MONTHS

const load = async ({ silent = false } = {}) => {
  if (!silent) isLoading.value = true
  const r = await fetchPaddleSubscriptionApi()
  paddleSub.value = (r.success && r.data?.subscription) || null
  if (!silent) isLoading.value = false
}

const buttonLabel = (tier) => {
  if (tier === TIER_FREE) return userTier.value === TIER_FREE ? t('pricing.btn_current_tier') : t('pricing.btn_downgrade_auto')
  const curIndex = TIER_ORDER.indexOf(userTier.value)
  const tIndex = TIER_ORDER.indexOf(tier)
  if (tier === userTier.value) return t('pricing.btn_current_tier')
  if (tIndex > curIndex) {
    // 더 높은 등급
    if (userTier.value === TIER_FREE) return t('pricing.btn_subscribe')
    return t('pricing.btn_upgrade')
  }
  return t('pricing.btn_downgrade_next')
}

const isButtonDisabled = (tier) => {
  if (tier === TIER_FREE) return true
  if (tier === userTier.value) return true
  const curIndex = TIER_ORDER.indexOf(userTier.value)
  const tIndex = TIER_ORDER.indexOf(tier)
  // 다운그레이드 즉시 불가 — 낮은 등급 전환은 포털에서 (다음 주기 적용)
  return tIndex < curIndex
}

const handleCtaClick = async (tier) => {
  if (!isPaidTier(tier)) return

  // [2026-06-12] 비로그인 — 결제 전 로그인 필수 (custom_data.user_email 매핑).
  // 결제 의사를 보인 시점이라 redirect 로 /pricing 복귀까지 보존.
  if (!user.value?.email) {
    router.push('/login?redirect=/pricing')
    return
  }

  // [2026-06] Paddle 설정 시 — 신규/업그레이드 모두 Paddle 오버레이 체크아웃으로.
  // 결제 성공의 진실원천은 BE 웹훅(subscription.*) → 닫힌 뒤 사용량 새로고침으로 등급 확인.
  if (isPaddleConfigured()) {
    // 미동의 — 경고 토스트 대신 동의 모달을 띄우고, 동의 완료 후 이 tier 로 재진입.
    if (!allAgreed.value) {
      pendingTier.value = tier
      agreeDialogOpen.value = true
      return
    }
    // [2026-06-12 결제 사전점검] custom_data.user_email 은 BE 웹훅이 결제→사용자를
    // 매핑하는 유일한 키 — 비어 있으면 "결제는 됐는데 등급이 안 오르는" 최악의 사고.
    // 사용자 정보가 아직 안 실렸으면 체크아웃을 열지 않는다.
    if (!user.value?.email) {
      showError?.(t('pricing.toast_login_required'))
      return
    }

    // [2026-06 이중청구 방지] 기존 구독자의 등급 변경은 새 체크아웃이 아니라 기존 구독
    // price 교체(BE change-subscription → PATCH /subscriptions). 체크아웃으로 업그레이드하면
    // 옛 구독이 살아있는 채 새 구독이 또 생겨 이중청구가 난다.
    if (hasChangeableSub.value) {
      await changeExistingSubscription(tier)
      return
    }

    // 신규 구독 — Paddle 오버레이 체크아웃.
    await startCheckout(tier)
    return
  }

  // [2026-06] Paddle 미설정 시에만 여기 도달 — 결제 준비 중 안내.
  showWarning?.(t('pricing.payment_not_ready'))
}

// 신규 구독 — Paddle 오버레이 체크아웃 (활성 구독이 없을 때만).
const startCheckout = async (tier) => {
  submitting.value[tier] = true
  try {
    await openTierCheckout({
      tier,
      cycle: billingCycle.value,
      email: user.value?.email || undefined,
      customData: { user_email: user.value?.email || '' },  // 웹훅이 사용자 식별에 사용
    })
  } catch (e) {
    showError?.(e?.message || t('pricing.toast_subscribe_failed'))
  } finally {
    submitting.value[tier] = false
  }
}

// 기존 구독자의 등급 변경 — 새 구독을 만들지 않고 기존 구독 price 만 교체(즉시 비례청구).
// BE 가 409(no_active_subscription)를 주면 스냅샷이 낡은 것 → 신규 체크아웃으로 폴백.
const changeExistingSubscription = async (tier) => {
  // submitting 을 confirm 전에 켠다 — 다이얼로그 떠 있는 동안에도 버튼을 잠가
  // 빠른 재클릭으로 중복 요청/고아 confirm 이 생기지 않게 (이중청구 방어선).
  submitting.value[tier] = true
  try {
    // [2026-06] 업그레이드는 '현재 구독의 주기'를 유지한다 — 화면 토글(billingCycle)을 따르면
    // 연간 구독자가 월 토글로 업그레이드 시 월간으로 뒤집히거나, 월 사용자가 연 토글이 켜진 채
    // 업그레이드해 깜짝 연결제가 되는 사고가 난다. 토글은 '신규 구독'(startCheckout)에만 적용.
    // 저장 price_id 로 현재 주기 역추적 — 미상이면 토글로 폴백(아래 확인창이 주기를 명시).
    const currentCycle = getCycleForPriceId(paddleSub.value?.price_id) || billingCycle.value
    const ok = await confirm({
      title: t('pricing.change_confirm_title'),
      message: t('pricing.change_confirm_message', { tier: getTierLabel(tier), cycle: cycleLabel(currentCycle) }),
      confirmText: t('pricing.change_confirm_ok'),
      cancelText: t('pricing.change_confirm_cancel'),
    })
    if (!ok) return

    const r = await changeSubscriptionApi(tier, currentCycle)
    if (r.success) {
      // 등급 반영의 진실원천은 subscription.updated 웹훅 — 폴링으로 감지.
      showSuccess?.(t('pricing.change_requested'))
      applyEntitlement()
      return
    }
    // 활성 구독이 정말 없으면(스냅샷 stale) 신규 결제로 폴백.
    if (r.status === 409 && r.error === 'no_active_subscription') {
      await startCheckout(tier)
      return
    }
    if (r.status === 409 && r.error === 'already_on_target_tier') {
      showWarning?.(t('pricing.toast_already_on_tier'))
      return
    }
    showError?.(t('pricing.toast_subscribe_failed'))
  } catch (e) {
    showError?.(e?.message || t('pricing.toast_subscribe_failed'))
  } finally {
    submitting.value[tier] = false
  }
}

// ─── 체크아웃 성공 후처리 ────────────────────────────────────
// checkout.completed 는 "Paddle 결제 성공"일 뿐, 등급 반영은 BE 웹훅(진실원천)이
// 끝나야 확정. 폴링으로 반영을 감지해 확정 안내 / 지연 안내를 띄운다.
const applyEntitlement = async () => {
  const newTier = await waitForEntitlementChange(
    async () => {
      await usageStore.refresh({ force: true, silent: true })
      return usageStore.subscriptionType
    },
    { fromTier: userTier.value },
  )
  if (newTier) {
    const v = await verifyToken()           // user.subscription_type 최신화
    if (v.valid && v.user) user.value = v.user
    await load()
    showSuccess?.(t('pricing.entitlement_updated', { tier: getTierLabel(newTier) }))
  } else {
    showWarning?.(t('pricing.entitlement_pending'))
  }
}

const onPaddleEvent = (ev) => {
  if (ev?.name !== 'checkout.completed') return
  showSuccess?.(t('pricing.checkout_success'))
  applyEntitlement()
}

// ─── 구독 관리 — Paddle 고객포털 (해지/재개/결제수단/영수증 위임) ───
const openPortal = async () => {
  portalLoading.value = true
  const r = await createPortalSessionApi()
  portalLoading.value = false
  if (!r.success || !r.data?.url) {
    showError?.(r.error || t('pricing.portal_failed'))
    return
  }
  window.open(r.data.url, '_blank', 'noopener')
}

onMounted(async () => {
  // [2026-06-12] 비로그인 열람 허용 — 가격 비교/약관은 누구나, 결제 CTA 만
  // 로그인 유도. (Paddle 기본 결제 링크가 이 페이지 — 심사관 접근 보장.)
  const r = await verifyToken()
  if (r.valid && r.user) {
    user.value = r.user
    setPaddleEventHandler(onPaddleEvent)
  }
  // [2026-06-12] isLoaded 게이트 제거 — 장수 SPA 세션에서 한 번 로드되면 admin 이
  // 가격/한도를 바꿔도 영영 안 갱신되던 문제. fetch() 내부 10분 TTL 이 빈도를
  // 막아주므로, 방문 시마다 재검증해도 10분당 최대 1회 요청.
  try { await pricingStore.fetch?.() } catch {}
  // 등급별 한도(perks) 동적 표시 — 공개 quota-config 로드.
  try { await quotaConfigStore.fetch?.() } catch {}
  // [2026-06-24] 구독 스냅샷 + 현지화 가격을 카드 노출 전에 함께 확정 — KR 통화
  // 깜빡임($→₩) 방지. 미리보기는 자체 타임아웃(3s)+실패 시 USD 폴백이라 페이지를
  // 오래 잡지 않으며 load()와 병렬로 돈다. (load 는 silent — isLoading 은 여기서 제어.)
  await Promise.all([
    user.value ? load({ silent: true }) : Promise.resolve(),
    loadPricePreview(),
  ])
  isLoading.value = false
})

onUnmounted(() => setPaddleEventHandler(null))
</script>

<template>
  <div class="pricing-page page-root">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="16" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <header class="page-header">
      <h1 class="page-title">
        <BadgeCheck :size="22" class="mr-2" />{{ $t('pricing.title') }}
      </h1>
      <p class="page-sub text-muted">
        {{ $t('pricing.subtitle') }}
      </p>
    </header>

    <!-- 현재 구독 상태 — BE 가 웹훅으로 영속화한 Paddle 스냅샷 -->
    <section v-if="!isLoading && paddleSub" class="current-sub">
      <div class="current-sub-head">
        <Crown :size="16" /> {{ $t('pricing.current_sub') }}
      </div>
      <div class="current-sub-body">
        <div>
          <strong>{{ getTierLabel(userTier) }}</strong>
          <span v-if="userTier !== TIER_FREE" class="status-pill" :class="`status-pill--${paddleSub.status}`">
            {{ paddleStatusLabel }}
          </span>
        </div>
        <div v-if="paddleSub.current_period_end && userTier !== TIER_FREE" class="text-muted small">
          {{ $t('pricing.next_billing', { date: paddleSub.current_period_end?.slice(0,10) }) }}
        </div>
        <div class="current-sub-actions">
          <button class="btn-primary portal-btn" :disabled="portalLoading" @click="openPortal">
            <Loader2 v-if="portalLoading" :size="13" class="spin mr-1" />
            <ExternalLink v-else :size="13" class="mr-1" />
            {{ $t('pricing.portal_manage') }}
          </button>
          <span class="text-muted small">{{ $t('pricing.portal_hint') }}</span>
        </div>
      </div>
    </section>

    <div v-if="isLoading" class="loading-row">
      <Loader2 :size="20" class="spin mr-2" />
      <span>{{ $t('pricing.loading') }}</span>
    </div>

    <!-- [2026-06] 월간/연간 결제 토글 — 연간 = 2개월 무료 -->
    <div v-if="!isLoading" class="billing-toggle" role="tablist">
      <button
        type="button" class="billing-toggle__btn" role="tab"
        :class="{ 'is-active': !isYearly }"
        @click="billingCycle = 'monthly'"
      >{{ $t('pricing.billing_monthly') }}</button>
      <button
        type="button" class="billing-toggle__btn" role="tab"
        :class="{ 'is-active': isYearly }"
        @click="billingCycle = 'yearly'"
      >
        {{ $t('pricing.billing_yearly') }}
        <span class="billing-toggle__save">{{ $t('pricing.billing_yearly_save', { n: annualFreeMonths }) }}</span>
      </button>
    </div>

    <!-- 등급 카드 -->
    <div v-if="!isLoading" class="tier-grid">
      <div
        v-for="tier in TIER_ORDER"
        :key="tier"
        class="tier-card"
        :class="{ 'tier-card--current': tier === userTier, 'tier-card--paid': isPaidTier(tier) }"
        :style="isPaidTier(tier) ? { '--tier-color': getTierMeta(tier).color, '--tier-gradient': getTierMeta(tier).gradient } : null"
      >
        <div class="tier-header">
          <span class="tier-pill" :style="{ background: getTierMeta(tier).gradient }">
            <Crown v-if="isPaidTier(tier)" :size="11" class="mr-1" />
            {{ getTierLabel(tier) }}
          </span>
          <span v-if="tier === userTier" class="current-badge"><CheckCircle2 :size="12" /> {{ $t('pricing.current_badge') }}</span>
          <!-- [2026-06-11 판매 카피] 앵커링 배지 — 가운데 상위 등급(Pro+)으로 시선 유도 -->
          <span v-else-if="tier === TIER_PRO_PLUS" class="popular-badge">{{ $t('pricing.popular_badge') }}</span>
        </div>

        <div class="tier-price">
          <!-- 연간: '월간으로 1년'(월×12) strike → 절약 시각화. 월간: 기존 할인 strike. -->
          <template v-if="isYearly && isPaidTier(tier) && tierFinalPrice(tier) > 0">
            <span class="price-strike">{{ tierYearlyStrikeText(tier) }}</span>
          </template>
          <template v-else-if="tierDiscountPct(tier) > 0">
            <span class="price-strike">{{ formatCurrency(tierBasePrice(tier), tierCurrency(tier)) }}</span>
          </template>
          <!-- [2026-06-12] 정수부/소수부 분리 — '$9.99' 가 '$999' 로 잘못 읽히던
               이슈(사용자 피드백) 해소. 메인은 크게, '.99' 만 작게. -->
          <span class="price-amount">
            <span class="price-main">{{ splitPriceText(tierDisplayPriceText(tier)).main }}</span><span
              v-if="splitPriceText(tierDisplayPriceText(tier)).fraction"
              class="price-fraction"
            >{{ splitPriceText(tierDisplayPriceText(tier)).fraction }}</span>
          </span>
          <span class="price-unit">{{ (isYearly && isPaidTier(tier) && tierFinalPrice(tier) > 0) ? $t('pricing.price_unit_year') : $t('pricing.price_unit') }}</span>
          <span v-if="isYearly && isPaidTier(tier) && tierFinalPrice(tier) > 0" class="price-discount">{{ $t('pricing.billing_yearly_save', { n: annualFreeMonths }) }}</span>
          <span v-else-if="tierDiscountPct(tier) > 0" class="price-discount">-{{ tierDiscountPct(tier) }}%</span>
        </div>
        <!-- 연간: 월 환산 보조 표기 ("월 $8.33 상당") -->
        <p v-if="isYearly && isPaidTier(tier) && tierFinalPrice(tier) > 0" class="price-monthly-equiv">
          {{ $t('pricing.annual_monthly_equiv', { price: tierYearlyMonthlyEquivText(tier) }) }}
        </p>

        <!-- [2026-06-11 판매 카피] 페르소나 태그라인 — "누구를 위한 플랜인지" 한 줄 -->
        <p class="tier-tagline">{{ $t('pricing.tagline_' + tier) }}</p>

        <ul class="tier-perks">
          <li v-for="p in perksFor(tier)" :key="p">{{ p }}</li>
        </ul>

        <button
          class="tier-cta"
          :disabled="isButtonDisabled(tier) || submitting[tier]"
          @click="handleCtaClick(tier)"
        >
          <Loader2 v-if="submitting[tier]" :size="13" class="spin mr-1" />
          {{ buttonLabel(tier) }}
        </button>
      </div>
    </div>

    <p v-if="!paddleReady" class="warning-box">
      <AlertCircle :size="14" /> {{ $t('pricing.payment_not_ready') }}
    </p>

    <!-- 결제 이력/영수증은 Paddle 고객포털에서 — 자체 표는 토스 은퇴와 함께 제거 (2026-06). -->

    <!-- [2026-06] 인라인 약관 동의 섹션 제거 — 결제 진행 동의는 CTA 클릭 시 모달로 대체. -->

    <!-- [2026-06] 약관 동의 모달 — CTA 클릭 시 미동의면 등장. 동의 완료 후 결제 진행. -->
    <VDialog v-model="agreeDialogOpen" max-width="460">
      <div class="agree-dialog">
        <h3 class="agree-dialog-title">{{ $t('pricing.agree_title') }}</h3>
        <p class="agree-dialog-sub">{{ $t('pricing.agree_modal_sub') }}</p>
        <label class="agree-row agree-all">
          <input type="checkbox" :checked="allAgreed" @change="toggleAllAgree" />
          <span><strong>{{ $t('pricing.agree_all') }}</strong></span>
        </label>
        <div class="agree-divider"></div>
        <label class="agree-row">
          <input type="checkbox" v-model="agreedTerms" />
          <span>
            <router-link to="/legal/terms" target="_blank" class="agree-link">{{ $t('pricing.agree_link_terms') }}</router-link>
            {{ $t('pricing.agree_terms_suffix') }}
          </span>
        </label>
        <label class="agree-row">
          <input type="checkbox" v-model="agreedRefund" />
          <span>
            <router-link to="/legal/refund-policy" target="_blank" class="agree-link">{{ $t('pricing.agree_link_refund') }}</router-link>
            {{ $t('pricing.agree_refund_suffix') }}
          </span>
        </label>
        <label class="agree-row">
          <input type="checkbox" v-model="agreedPrivacy" />
          <span>
            <router-link to="/legal/privacy-policy" target="_blank" class="agree-link">{{ $t('pricing.agree_link_privacy') }}</router-link>
            {{ $t('pricing.agree_privacy_suffix') }}
          </span>
        </label>
        <label class="agree-row">
          <input type="checkbox" v-model="agreedAutoBilling" />
          <span>
            <router-link to="/legal/auto-billing" target="_blank" class="agree-link">{{ $t('pricing.agree_link_auto_billing') }}</router-link>
            {{ $t('pricing.agree_auto_billing_suffix') }}
          </span>
        </label>
        <p class="agree-note">{{ $t('pricing.agree_note') }}</p>
        <div class="agree-dialog-foot">
          <button class="coupon-cancel-btn" type="button" @click="agreeDialogOpen = false">{{ $t('common.action.cancel') }}</button>
          <button
            class="coupon-apply-btn"
            type="button"
            :disabled="!allAgreed"
            @click="onAgreeAndContinue"
          >
            {{ $t('pricing.agree_modal_continue') }}
          </button>
        </div>
      </div>
    </VDialog>
  </div>
</template>

<style scoped>
.pricing-page { padding: 24px var(--page-pad-x, 32px); max-width: 1200px; margin: 0 auto; }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  color: var(--text-main, #2A2421);
  padding: 6px 12px; border-radius: 8px;
  font-size: 0.8rem; cursor: pointer; margin-bottom: 18px;
}
.back-btn:hover { background: rgba(0,0,0,0.04); }

.page-header { margin-bottom: 24px; }
.page-title { display: flex; align-items: center; font-size: 1.5rem; font-weight: 800; margin: 0 0 6px; }
.page-sub { font-size: 0.85rem; margin: 0; line-height: 1.55; }

.loading-row { display: flex; align-items: center; padding: 24px; color: var(--text-muted); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.current-sub {
  background: var(--bg-light, #F7F5EB);
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 24px;
}
.current-sub-head { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }
.current-sub-body { display: flex; flex-direction: column; gap: 6px; }
.current-sub-body strong { font-size: 1rem; font-weight: 800; margin-right: 8px; }
.status-pill {
  display: inline-block; padding: 2px 8px; border-radius: 9999px;
  font-size: 0.7rem; font-weight: 700;
  background: #E5E7EB; color: #374151;
}
.status-pill--active { background: #DCFCE7; color: #15803D; }
.status-pill--trialing { background: #DBEAFE; color: #1D4ED8; }
.status-pill--paused { background: #FEF3C7; color: #B45309; }
.status-pill--past_due { background: #FEE2E2; color: #B91C1C; }
.status-pill--canceled { background: #E5E7EB; color: #6B7280; }
.small { font-size: 0.78rem; }
.current-sub-actions { margin-top: 8px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.portal-btn { display: inline-flex; align-items: center; }
.portal-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary {
  background: var(--accent, #8C6239); color: white; border: none;
  padding: 6px 14px; border-radius: 8px; cursor: pointer;
  font-size: 0.78rem; font-weight: 700;
}

/* [2026-06] 월간/연간 결제 토글 — 브라운 액센트 */
.billing-toggle {
  display: flex; width: fit-content; gap: 3px; margin: 0 auto 20px; padding: 3px;
  background: #F1E9DA; border: 1px solid #E3D5BD; border-radius: 9999px;
}
.billing-toggle__btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 18px; border: none; background: transparent; cursor: pointer;
  font-size: 0.82rem; font-weight: 700; color: #7A6A55; border-radius: 9999px;
  transition: background 0.15s, color 0.15s;
}
.billing-toggle__btn.is-active { background: #8C6239; color: #fff; }
.billing-toggle__btn:not(.is-active):hover { background: #E3D5BD; }
.billing-toggle__save {
  font-size: 0.68rem; font-weight: 800; padding: 1px 7px; border-radius: 9999px;
  background: #2E7D32; color: #fff;
}
.billing-toggle__btn.is-active .billing-toggle__save { background: #fff; color: #2E7D32; }
.price-monthly-equiv { margin: -6px 0 0; font-size: 0.72rem; color: var(--text-muted); }

.tier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.tier-card {
  background: white;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px;
  padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}
.tier-card--paid { border-top: 3px solid var(--tier-color, #d97706); }
.tier-card--current { box-shadow: 0 0 0 2px var(--tier-color, #2563EB) inset; }

.tier-header { display: flex; justify-content: space-between; align-items: center; }
.tier-pill {
  display: inline-flex; align-items: center;
  color: white; padding: 3px 10px; border-radius: 9999px;
  font-size: 0.7rem; font-weight: 700;
}
.current-badge {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 0.7rem; font-weight: 700; color: #15803D;
}

.tier-price { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
.price-amount {
  font-size: 1.4rem; font-weight: 800; font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: baseline;
}
.price-main { font-size: inherit; font-weight: inherit; }
/* '.99' 만 메인의 ~58% 크기로 — '$9.99' 가 '$999' 로 잘못 읽히는 사고 방지. */
.price-fraction {
  font-size: 0.58em; font-weight: 700; color: var(--text-muted);
  margin-left: 1px;
}
.price-unit { font-size: 0.8rem; color: var(--text-muted); }
.price-strike {
  font-size: 0.85rem; color: var(--text-muted); text-decoration: line-through;
  margin-right: 6px; font-variant-numeric: tabular-nums;
}
.price-discount {
  font-size: 0.7rem; font-weight: 700;
  color: var(--tier-color, #b45309);
  margin-left: 6px;
}

.tier-tagline {
  margin: 2px 0 8px; font-size: 0.78rem; line-height: 1.5;
  color: var(--text-muted); min-height: 2.5em;
  white-space: pre-line;   /* 로케일의 \n 줄바꿈 보존 — "—" 대시 대신 두 줄 */
}
.popular-badge {
  display: inline-flex; align-items: center;
  font-size: 0.68rem; font-weight: 800; letter-spacing: 0.02em;
  color: #fff; background: linear-gradient(90deg, #a855f7, #7c3aed);
  border-radius: 999px; padding: 2px 8px;
}
.tier-perks { list-style: none; padding: 0; margin: 0; font-size: 0.8rem; color: var(--text-main); }
.tier-perks li { padding: 3px 0; white-space: pre-line; }   /* 멀티라인 perks(예: Lite 보너스 2줄) */
.tier-perks li::before { content: '✓ '; color: #15803D; font-weight: bold; }

.tier-cta {
  margin-top: auto;
  background: var(--tier-gradient, linear-gradient(90deg, #8C6239, #6b4a2a));
  color: white; border: none;
  padding: 10px 14px; border-radius: 8px;
  font-size: 0.85rem; font-weight: 700; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.tier-cta:hover:not(:disabled) { transform: translateY(-1px); }
.tier-cta:disabled { opacity: 0.4; cursor: not-allowed; }

.warning-box {
  margin-top: 24px;
  display: inline-flex; align-items: center; gap: 6px;
  background: #FEF3C7; color: #B45309;
  padding: 8px 14px; border-radius: 8px;
  font-size: 0.78rem;
}

/* ─── 약관 동의 영역 (2026-05-18) ─── */
.agree-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-main);
  cursor: pointer;
  padding: 6px 0;
}
.agree-row input[type="checkbox"] {
  margin-top: 3px;
  accent-color: var(--accent, #8C6239);
  cursor: pointer;
}
.agree-all { padding-bottom: 8px; }
.agree-divider {
  height: 1px;
  background: var(--border-light, rgba(0,0,0,0.08));
  margin: 4px 0 8px;
}
.agree-link {
  color: var(--accent, #8C6239);
  text-decoration: underline;
  font-weight: 700;
}
.agree-link:hover { color: #6b4a2a; }
.agree-note {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 10px 0 0;
  line-height: 1.6;
  padding-top: 10px;
  border-top: 1px dashed var(--border-light, rgba(0,0,0,0.08));
}

/* ─── 약관 동의 모달 (2026-06) ─── */
.agree-dialog {
  background: white;
  border-radius: 14px;
  padding: 22px 24px;
}
.agree-dialog-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.05rem; font-weight: 800;
  margin: 0 0 4px;
  color: var(--text-main, #2A2421);
}
.agree-dialog-sub {
  font-size: 0.8rem;
  color: var(--text-muted, #6F665F);
  margin: 0 0 12px;
  line-height: 1.55;
}
.agree-dialog-foot {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 6px;
}

/* ─── 쿠폰 영역 (2026-05) ─── */
.coupon-section {
  margin: 28px auto 0;
  max-width: 720px;
  padding: 14px 18px;
  background: linear-gradient(135deg, rgba(140, 98, 57, 0.06) 0%, rgba(255, 215, 0, 0.05) 100%);
  border: 1px dashed rgba(140, 98, 57, 0.35);
  border-radius: 12px;
}
.coupon-cta-row, .coupon-applied-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.coupon-cta-text, .coupon-applied-text {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.86rem; color: var(--text-main, #2A2421);
}
.coupon-cta-icon, .coupon-applied-icon { font-size: 1.15rem; }
.coupon-applied-text strong {
  color: var(--accent, #8C6239);
  font-weight: 800;
}
.coupon-cta-btn {
  padding: 7px 14px;
  border-radius: 9999px;
  background: white;
  border: 1px solid var(--accent, #8C6239);
  color: var(--accent, #8C6239);
  font-family: 'Outfit', sans-serif;
  font-size: 0.74rem; font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.coupon-cta-btn:hover {
  background: var(--accent, #8C6239);
  color: white;
}
.coupon-clear-btn {
  padding: 5px 12px;
  border-radius: 9999px;
  background: transparent;
  border: 1px solid rgba(0,0,0,0.12);
  color: var(--text-muted, #6F665F);
  font-size: 0.7rem; font-weight: 600;
  cursor: pointer;
}
.coupon-clear-btn:hover { background: rgba(0,0,0,0.04); }

/* ─── 쿠폰 다이얼로그 ─── */
.coupon-dialog {
  background: white;
  border-radius: 14px;
  overflow: hidden;
  padding: 22px 24px;
}
.coupon-dialog-head { margin-bottom: 16px; }
.coupon-dialog-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.05rem; font-weight: 800;
  margin: 0 0 6px;
  color: var(--text-main, #2A2421);
}
.coupon-dialog-sub {
  font-size: 0.78rem;
  color: var(--text-muted, #6F665F);
  margin: 0;
  line-height: 1.55;
}
.coupon-dialog-body {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
}
.coupon-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 10px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.88rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: var(--bg-light, #F7F5EB);
  outline: none;
  color: var(--text-main, #2A2421);
}
.coupon-input:focus {
  border-color: var(--accent, #8C6239);
  background: white;
}
.coupon-validate-btn {
  padding: 10px 16px;
  border-radius: 10px;
  background: var(--text-main, #2A2421);
  color: white;
  border: none;
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer;
  display: inline-flex; align-items: center;
  flex-shrink: 0;
}
.coupon-validate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.coupon-result {
  display: flex; align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  margin-bottom: 14px;
  line-height: 1.5;
}
.coupon-result--ok {
  background: rgba(46, 123, 51, 0.08);
  color: #2E7B33;
  border: 1px solid rgba(46, 123, 51, 0.25);
}
.coupon-result--err {
  background: rgba(220, 38, 38, 0.07);
  color: #C0362C;
  border: 1px solid rgba(220, 38, 38, 0.2);
}
.coupon-dialog-foot {
  display: flex; justify-content: flex-end; gap: 8px;
}
.coupon-cancel-btn {
  padding: 8px 16px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  color: var(--text-muted, #6F665F);
  font-size: 0.78rem; font-weight: 600;
  cursor: pointer;
}
.coupon-cancel-btn:hover { background: rgba(0,0,0,0.04); }
.coupon-apply-btn {
  padding: 8px 18px;
  border-radius: 8px;
  background: var(--accent, #8C6239);
  color: white;
  border: none;
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem; font-weight: 800;
  cursor: pointer;
}
.coupon-apply-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.coupon-apply-btn:hover:not(:disabled) { background: #6F4D2D; }

@media (max-width: 600px) {
  .coupon-section { margin: 20px 12px 0; padding: 12px 14px; }
  .coupon-cta-row, .coupon-applied-row { flex-direction: column; align-items: stretch; }
  .coupon-cta-btn, .coupon-clear-btn { width: 100%; }
  .coupon-dialog { padding: 18px 18px; }
  .coupon-dialog-body { flex-direction: column; align-items: stretch; }
  .coupon-validate-btn { width: 100%; justify-content: center; }
}
</style>
