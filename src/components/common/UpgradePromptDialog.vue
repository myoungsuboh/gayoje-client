<script setup>
/**
 * UpgradePromptDialog — quota 한도 초과 또는 업그레이드 안내 글로벌 모달.
 *
 * App.vue 에서 단일 인스턴스로 마운트. useUpgradePrompt composable 의 state 구독.
 *
 * [모드별 표시 — 2026-05 4-tier 확장]
 *   - 'exceeded': 빨간 톤 + 어떤 한도가 막혔는지 + 다음 등급 카드들
 *   - 'info'   : 골드/보라 톤 + 다음 등급 카드들
 *
 * [등급별 카드 표시 정책]
 *   현재 등급 | 표시 카드
 *   ---------+--------------------------
 *   Free     | Pro / Pro+ / Pro Max (추천 = Pro+)
 *   Pro      | Pro+ / Pro Max (추천 = Pro+)
 *   Pro+     | Pro Max (추천 = Pro Max)
 *   Pro Max  | "추가 용량 문의" 단일 카드
 *
 * [현재 결제 경로]
 *   결제 시스템 미구현 → "관리자 문의" mailto. 추후 결제 모듈 연결 시
 *   각 카드의 액션을 "결제하기" 로 변경.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Crown, X, Mail, Sparkles, CreditCard } from 'lucide-vue-next'
import { formatCurrency, splitPriceText, formatInt } from '@/utils/format'
import { useUpgradePrompt } from '@/composables/useUpgradePrompt'
import { useLocalizedPricing } from '@/composables/useLocalizedPricing'
import {
  getTierMeta,
  getNextTiers,
  TIER_FREE,
  TIER_PRO,
  TIER_PRO_PLUS,
  TIER_PRO_MAX,
} from '@/utils/subscription'
import { usePricingStore } from '@/store/pricing'
import { useUsageStore } from '@/store/usage'
import { useTierPerks } from '@/composables/useTierPerks'

const { t } = useI18n()
const pricingStore = usePricingStore()
const usageStore = useUsageStore()
const { perksFor } = useTierPerks()
const router = useRouter()

const { state, close } = useUpgradePrompt()

// [2026-06-24] 현지화 가격 — 가격 페이지와 동일하게 KR=₩/그 외=$ 표시(공용 composable 공유).
// 전역 마운트라 '모달이 열릴 때만' 로드(불필요한 Paddle SDK 로드 방지). 실패 시 USD 폴백.
const { ensureLoaded: ensureLocalizedPricing, previewFor } = useLocalizedPricing()
watch(() => state.show, (show) => { if (show) ensureLocalizedPricing() }, { immediate: true })

// [2026-05-18] mailto → /pricing 페이지 이동으로 변경.
// 결제 시스템 도입 — 사용자가 직접 결제 가능.
const goToPricing = (targetTier) => {
  close()
  router.push({ path: '/pricing', query: { tier: targetTier } })
}

const isExceeded = computed(() => state.mode === 'exceeded')
const detail = computed(() => state.detail || {})

// [2026-06] 현재 등급 — exceeded 모드는 BE 402 detail.subscription_type 사용,
// info 모드(detail 없음)는 usage 스토어의 실제 등급으로 fallback.
// (이전엔 detail 없을 때 무조건 Free 로 떨어져, Pro 사용자가 '알아보기' 클릭 시
//  본인 등급인 Pro 카드가 업그레이드 옵션으로 잘못 노출되던 버그.)
const currentTier = computed(() => detail.value?.subscription_type || usageStore.subscriptionType || TIER_FREE)
const currentTierMeta = computed(() => getTierMeta(currentTier.value))
const nextTiers = computed(() => getNextTiers(currentTier.value))
const isAtMaxTier = computed(() => currentTier.value === TIER_PRO_MAX)

// 추천 등급 — 가성비 좋은 단계 강조.
// Free → Pro+ (가성비), Pro → Pro+ (한 단계 위), Pro+ → Pro Max (마지막).
const recommendedTier = computed(() => {
  if (currentTier.value === TIER_FREE) return TIER_PRO_PLUS
  if (currentTier.value === TIER_PRO) return TIER_PRO_PLUS
  if (currentTier.value === TIER_PRO_PLUS) return TIER_PRO_MAX
  return null
})

const limitTypeLabel = computed(() => {
  const lt = detail.value?.limit_type
  const keys = {
    meeting_logs: 'billing.limit_type.meeting_logs',
    summary_chars: 'billing.limit_type.summary_chars',
    total_tokens: 'billing.limit_type.total_tokens',
    library_skills: 'billing.limit_type.library_skills',
    max_projects: 'billing.limit_type.max_projects',
  }
  return keys[lt] ? t(keys[lt]) : null
})

// [2026-05] 월간 reset — BE 응답의 reset_at → "N일 후" 표시.
// max_projects 같이 reset 무관 한도는 reset_at=null 이라 표시 안 됨.
const daysUntilReset = computed(() => {
  const at = detail.value?.reset_at
  if (!at) return null
  const target = new Date(at)
  if (Number.isNaN(target.getTime())) return null
  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) return 0
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
})

const fmt = (n) => {
  if (n == null) return '-'
  return formatInt(n)
}

// 이메일 mailto — 관리자 문의 채널. 환경변수 미설정 시 default.
// [2026-06-12] 기본값을 실수신 가능한 운영 메일로 — support@ 도메인 메일은 미개설.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'kaki3010@naver.com'

const buildMailto = (targetTier) => {
  const meta = getTierMeta(targetTier)
  // [2026-05] 동적 가격 — pricingStore 가 BE 의 PricingConfig 반영. 미로드시 fallback.
  const priceLong = pricingStore.isLoaded
    ? pricingStore.priceTextLong(targetTier)
    : meta.priceTextLong
  const subject = encodeURIComponent(t('billing.mailto.upgrade_subject', { label: meta.label }))
  const body = encodeURIComponent(
    t('billing.mailto.upgrade_body', {
      label: meta.label,
      price: priceLong,
      current: currentTierMeta.value.label,
    }),
  )
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
}

// 등급 카드의 가격/할인 표시 — pricingStore 우선, 없으면 fallback.
const tierBasePrice = (tier) => {
  if (pricingStore.isLoaded) return pricingStore.basePrice(tier)
  return getTierMeta(tier).priceMinor
}
const tierFinalPrice = (tier) => {
  if (pricingStore.isLoaded) return pricingStore.priceFinal(tier)
  return getTierMeta(tier).priceMinor
}
const tierDiscountPct = (tier) => {
  if (pricingStore.isLoaded) return pricingStore.discountPct(tier)
  return 0
}
const tierPriceText = (tier) => {
  const pv = previewFor(tier, 'monthly')   // 현지화 우선 — KR=₩/그 외=$ (가격 페이지와 일치)
  if (pv) return formatCurrency(pv.rawMinor, pv.currency)
  if (pricingStore.isLoaded) return pricingStore.priceText(tier)
  return getTierMeta(tier).priceText
}
// 통화 코드 — strikethrough 정가 포맷에 사용.
const tierCurrency = (tier) => {
  if (pricingStore.isLoaded) return pricingStore.currency(tier)
  return getTierMeta(tier).currency || 'USD'
}

// Pro Max 도달 시 일반 문의 mailto
const contactMailto = computed(() => {
  const subject = encodeURIComponent(t('billing.mailto.contact_subject'))
  const body = encodeURIComponent(t('billing.mailto.contact_body'))
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
})
</script>

<template>
  <v-dialog
    :model-value="state.show"
    :max-width="nextTiers.length >= 3 ? 760 : (nextTiers.length === 2 ? 600 : 480)"
    persistent
    @update:model-value="(v) => !v && close()"
  >
    <div class="upgrade-modal" :class="{ 'upgrade-modal--exceeded': isExceeded }">
      <!-- 닫기 (스크롤 영역 밖 — 길어져도 항상 우상단 고정) -->
      <button class="upgrade-close" @click="close" :aria-label="$t('common.action.close')">
        <X :size="18" />
      </button>

      <!-- 스크롤 영역 — 카드가 많아 뷰포트를 넘기면(특히 모바일) 내부 스크롤. -->
      <div class="upgrade-scroll">
      <!-- 헤더 -->
      <div class="upgrade-header">
        <div class="upgrade-icon">
          <Crown :size="28" />
        </div>
        <h3 class="upgrade-title">
          <template v-if="isExceeded">{{ $t('billing.upgrade.title_exceeded') }}</template>
          <template v-else-if="isAtMaxTier">{{ $t('billing.upgrade.title_max') }}</template>
          <template v-else>{{ $t('billing.upgrade.title_default') }}</template>
        </h3>
        <p class="upgrade-subtitle">
          <template v-if="isExceeded && limitTypeLabel">
            {{ $t('billing.upgrade.subtitle_exceeded_type', { label: limitTypeLabel }) }}
          </template>
          <template v-else-if="isExceeded">
            {{ $t('billing.upgrade.subtitle_exceeded') }}
          </template>
          <template v-else-if="isAtMaxTier">
            {{ $t('billing.upgrade.subtitle_max') }}
          </template>
          <template v-else>
            {{ $t('billing.upgrade.subtitle_default') }}
          </template>
        </p>
      </div>

      <!-- exceeded — 현재 상태 표시 -->
      <div v-if="isExceeded && detail.limit != null" class="upgrade-stats">
        <div class="stat">
          <span class="stat-label">{{ $t('billing.upgrade.stat_current') }}</span>
          <span class="stat-value">{{ fmt(detail.current) }}</span>
        </div>
        <div class="stat-divider">/</div>
        <div class="stat">
          <span class="stat-label">{{ $t('billing.upgrade.stat_limit') }}</span>
          <span class="stat-value">{{ fmt(detail.limit) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ $t('billing.upgrade.stat_tier') }}</span>
          <span class="stat-value">{{ currentTierMeta.label }}</span>
        </div>
      </div>

      <!-- summary_chars 한도 초과 — 업그레이드 없이 해결 가능한 경우 안내 -->
      <div
        v-if="isExceeded && detail.limit_type === 'summary_chars'"
        class="upgrade-selffix"
        v-html="$t('billing.upgrade.selffix', { limit: fmt(detail.limit) })"
      ></div>

      <!-- [2026-05] 월간 reset 안내 — 한도 초과 사용자 안심 메시지 -->
      <div v-if="isExceeded && daysUntilReset != null" class="upgrade-reset-notice">
        <span v-if="daysUntilReset > 0" v-html="$t('billing.upgrade.reset_days', { days: daysUntilReset })"></span>
        <span v-else>{{ $t('billing.upgrade.reset_today') }}</span>
      </div>

      <!-- Pro Max 사용자 — 단일 안내 카드 -->
      <div v-if="isAtMaxTier" class="upgrade-max-notice">
        <Sparkles :size="20" class="mr-2" style="color: #b45309;" />
        <p>{{ $t('billing.pro_max_notice') }}</p>
      </div>

      <!-- 일반 케이스 — 다음 등급 카드들 -->
      <div
        v-else
        class="upgrade-tier-grid"
        :class="`upgrade-tier-grid--${nextTiers.length}`"
      >
        <div
          v-for="tierKey in nextTiers"
          :key="tierKey"
          class="tier-card"
          :class="{ 'tier-card--recommended': tierKey === recommendedTier }"
          :style="{ '--tier-gradient': getTierMeta(tierKey).gradient, '--tier-color': getTierMeta(tierKey).color }"
        >
          <span v-if="tierKey === recommendedTier" class="tier-recommended-badge">
            {{ $t('billing.upgrade.recommended') }}
          </span>
          <div class="tier-card-header">
            <Crown :size="14" class="mr-1" />
            <span class="tier-name">{{ getTierMeta(tierKey).label }}</span>
          </div>
          <div class="tier-price">
            <!-- 할인 적용 시 정가 strikethrough 표시 (영업 효과 ↑) -->
            <span
              v-if="tierDiscountPct(tierKey) > 0 && tierBasePrice(tierKey) > tierFinalPrice(tierKey)"
              class="tier-price-base"
            >
              {{ formatCurrency(tierBasePrice(tierKey), tierCurrency(tierKey)) }}
            </span>
            <!-- [2026-06-12] 정수부/소수부 분리 — '.99' 작게 -->
            <span class="tier-price-amount">
              <span class="tier-price-main">{{ splitPriceText(tierPriceText(tierKey)).main }}</span><span
                v-if="splitPriceText(tierPriceText(tierKey)).fraction"
                class="tier-price-fraction"
              >{{ splitPriceText(tierPriceText(tierKey)).fraction }}</span>
            </span>
            <span class="tier-price-period">{{ $t('billing.upgrade.per_month') }}</span>
            <span
              v-if="tierDiscountPct(tierKey) > 0"
              class="tier-price-discount"
            >-{{ tierDiscountPct(tierKey) }}%</span>
          </div>
          <ul class="tier-perks">
            <li v-for="p in perksFor(tierKey)" :key="p">{{ p }}</li>
          </ul>
          <button
            type="button"
            class="tier-cta"
            @click="goToPricing(tierKey)"
          >
            <CreditCard :size="12" class="mr-1" />
            {{ $t('billing.upgrade.cta_start', { label: getTierMeta(tierKey).label }) }}
          </button>
        </div>
      </div>

      <!-- 안내 -->
      <p v-if="!isAtMaxTier" class="upgrade-note">
        {{ $t('billing.upgrade.note') }}
      </p>

      <!-- 액션 -->
      <div class="upgrade-actions">
        <button class="btn-secondary" type="button" @click="close">
          {{ isAtMaxTier ? $t('common.action.close') : $t('billing.upgrade.later') }}
        </button>
        <a
          v-if="isAtMaxTier"
          :href="contactMailto"
          class="btn-primary"
        >
          <Mail :size="14" class="mr-2" />
          {{ $t('billing.upgrade.contact_admin') }}
        </a>
      </div>
      </div>
      <!-- /upgrade-scroll -->
    </div>
  </v-dialog>
</template>

<style scoped>
.upgrade-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  /* 뷰포트보다 길면 내부 스크롤 — dvh 로 모바일 주소창 변동까지 대응. */
  max-height: 90vh;
  max-height: calc(100dvh - 32px);
  overflow: hidden;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
}
/* 실제 스크롤 영역 — 닫기 버튼은 이 밖에 있어 항상 고정. */
.upgrade-scroll {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 28px 24px 24px;
}
.upgrade-modal--exceeded {
  border-top: 4px solid #dc2626;
}
.upgrade-modal:not(.upgrade-modal--exceeded) {
  border-top: 4px solid #f59e0b;
}

.upgrade-close {
  position: absolute;
  top: 12px; right: 12px;
  background: transparent; border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 6px; border-radius: 6px;
}
.upgrade-close:hover { background: rgba(0, 0, 0, 0.04); }

.upgrade-header {
  text-align: center;
  margin-bottom: 16px;
}

.upgrade-icon {
  display: inline-flex;
  align-items: center; justify-content: center;
  width: 56px; height: 56px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  border-radius: 16px;
  margin-bottom: 12px;
}

.upgrade-title {
  font-size: 18px; font-weight: 700;
  color: #111827;
  margin: 0 0 4px;
}

.upgrade-subtitle {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}

.upgrade-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 12px 0;
  padding: 12px;
  background: #fef2f2;
  border-radius: 10px;
}

/* summary_chars — 업그레이드 없이 해결 가능한 경우 self-fix 안내 */
.upgrade-selffix {
  margin: 12px 0;
  padding: 11px 14px;
  background: #f0fdf4;
  border-left: 3px solid #22c55e;
  border-radius: 8px;
  font-size: 12.5px;
  color: #14532d;
  line-height: 1.6;
}
.upgrade-selffix strong { color: #166534; font-weight: 700; }

/* [2026-05] 월간 reset 안내 — 한도 초과 사용자에게 "곧 회복" 안심 메시지 */
.upgrade-reset-notice {
  margin: 12px 0;
  padding: 12px 14px;
  background: #f0f9ff;
  border-left: 3px solid #0ea5e9;
  border-radius: 8px;
  font-size: 12.5px;
  color: #075985;
  line-height: 1.6;
}
.upgrade-reset-notice strong { color: #0c4a6e; font-weight: 700; }
.stat {
  display: flex; flex-direction: column;
  align-items: center;
  min-width: 64px;
}
.stat-label {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.stat-value {
  font-size: 18px; font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
}
.stat-divider {
  font-size: 20px; color: #d1d5db;
  align-self: center;
}

/* ─── Pro Max 안내 ─── */
.upgrade-max-notice {
  display: flex;
  align-items: flex-start;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: 10px;
  padding: 16px 18px;
  margin: 16px 0;
  font-size: 13px;
  color: #78350f;
  line-height: 1.6;
}
.upgrade-max-notice p { margin: 0; }

/* ─── Tier 카드 그리드 ─── */
.upgrade-tier-grid {
  display: grid;
  gap: 12px;
  margin: 16px 0 12px;
}
.upgrade-tier-grid--3 { grid-template-columns: repeat(3, 1fr); }
.upgrade-tier-grid--2 { grid-template-columns: repeat(2, 1fr); }
.upgrade-tier-grid--1 { grid-template-columns: 1fr; }

.tier-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 14px 14px;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.tier-card:hover {
  transform: translateY(-2px);
  border-color: var(--tier-color, #d97706);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}
.tier-card--recommended {
  border-color: var(--tier-color, #7c3aed);
  border-width: 2px;
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.12);
}

.tier-recommended-badge {
  position: absolute;
  top: -10px;
  right: 12px;
  padding: 3px 10px;
  background: var(--tier-gradient, linear-gradient(90deg, #a855f7, #7c3aed));
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border-radius: 9999px;
}

.tier-card-header {
  display: inline-flex;
  align-items: center;
  background: var(--tier-gradient, linear-gradient(90deg, #f59e0b, #d97706));
  color: #fff;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  width: fit-content;
  margin-bottom: 10px;
}
.tier-name { letter-spacing: 0.02em; }

.tier-price {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.tier-price-base {
  font-size: 12px;
  color: #9ca3af;
  text-decoration: line-through;
  margin-right: 2px;
}
.tier-price-amount {
  font-size: 22px; font-weight: 800;
  color: #111827;
  display: inline-flex; align-items: baseline;
}
.tier-price-main { font-size: inherit; font-weight: inherit; }
/* '.99' 만 메인의 ~58% — '$9.99' 가 '$999' 로 읽히는 사고 방지. */
.tier-price-fraction {
  font-size: 0.58em; font-weight: 700; color: #6b7280;
  margin-left: 1px;
}
.tier-price-period {
  font-size: 12px;
  color: #6b7280;
}
.tier-price-discount {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 6px;
  background: var(--tier-color, #d97706);
  color: #fff;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
}

.tier-perks {
  flex: 1;
  list-style: none;
  padding: 0; margin: 0 0 12px;
  font-size: 12px;
  color: #4b5563;
  line-height: 1.7;
}
.tier-perks li::before {
  content: '✓';
  color: #10b981;
  font-weight: 700;
  margin-right: 4px;
}

.tier-cta {
  display: inline-flex;
  align-items: center; justify-content: center;
  padding: 7px 10px;
  background: var(--tier-gradient, linear-gradient(90deg, #f59e0b, #d97706));
  color: #fff;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.15s ease;
}
.tier-cta:hover { transform: translateY(-1px); }

.upgrade-note {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  margin: 4px 0 16px;
  line-height: 1.5;
}

.upgrade-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-secondary, .btn-primary {
  display: inline-flex;
  align-items: center; justify-content: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
  transition: transform 0.15s ease, background 0.15s ease;
}
.btn-secondary {
  background: rgba(0, 0, 0, 0.05);
  color: #374151;
}
.btn-secondary:hover { background: rgba(0, 0, 0, 0.08); }
.btn-primary {
  background: linear-gradient(90deg, #f59e0b, #d97706);
  color: #fff;
}
.btn-primary:hover { transform: translateY(-1px); }

/* 모바일 — 카드 1열로 stack */
@media (max-width: 600px) {
  .upgrade-scroll { padding: 24px 18px 18px; }
  .upgrade-tier-grid--3,
  .upgrade-tier-grid--2 {
    grid-template-columns: 1fr;
  }
  .tier-card { padding: 14px 12px 12px; }
  .tier-price-amount { font-size: 20px; }
}
</style>
