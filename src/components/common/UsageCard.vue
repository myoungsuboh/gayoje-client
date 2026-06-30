<script setup>
/**
 * UsageCard — 사용자의 quota 사용량 + 등급별 한도 표시.
 *
 * [2026-05 리팩토링]
 * 이전: 자체 fetchMyUsageApi 호출 → useUsageStore 와 별도 캐시/시점 → mutation 후
 *       헤더 chip 은 갱신됐는데 카드는 stale 한 drift 발생.
 * 이후: useUsageStore 단일 source 사용. 같은 derived (resetAt/daysUntilReset/...)
 *       를 store 가 제공하므로 두 곳 중복 정의 제거 → BE 응답 shape 변경 시
 *       store 만 수정하면 됨.
 *
 * BE: GET /auth/me/usage (store.refresh 가 호출)
 *
 * 표시 항목:
 *   1) 미팅 로그 등록: usage.meeting_logs / limits.meeting_logs (진행바)
 *   2) AI 사용량 (토큰): usage.total_tokens / limits.total_tokens (진행바)
 *   3) 회의록 한 번 입력 최대: limits.summary_chars (per-request — 진행바 없음)
 *
 * [2026-05 월간 reset] store.resetAt / daysUntilReset / resetAtLabel 사용.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { formatInt } from '@/utils/format'
import { useI18n } from 'vue-i18n'
import { Gauge, Crown, Loader2, AlertCircle, RefreshCw } from 'lucide-vue-next'
import { useUsageStore } from '@/store/usage'
import { storeToRefs } from 'pinia'
import { TIER_PRO_MAX, TIER_PRO, TIER_PRO_PLUS, TIER_META } from '@/utils/subscription'

const { t } = useI18n()

const props = defineProps({
  // 부모가 외부 새로고침 트리거 (예: 미팅 등록 직후) 시 watch.
  refreshKey: { type: Number, default: 0 },
  // false 로 설정하면 플랜 업그레이드/관리 섹션을 숨김.
  showUpgrade: { type: Boolean, default: true },
})

const store = useUsageStore()
// store 의 derived 를 그대로 노출 — 중복 정의 없음. 헤더 chip / Plan 카운터 / 본 카드 모두 동일 source.
const {
  data: usage,
  isLoading,
  errorMsg,
  subscriptionType: subscription,
  isPaid,
  tierMeta,
  meetingUsed,
  meetingLimit,
  meetingPct,
  tokensUsed,
  tokensLimit,
  tokensPct,
  summaryCharsLimit,
  resetAt,
  daysUntilReset,
  resetAtLabel,
  // [2026-06] 관리자 기간제 부여 만료일
  subscriptionEndsAtLabel,
  // [2026-06] Lite 오버플로우
  liteEnabled,
  liteOverflowActive,
  liteDailyUsed,
  liteDailyCap,
  liteDailyPct,
  liteNearCap,
} = storeToRefs(store)

// 최초 마운트 시 store 가 비어 있거나 캐시 만료면 새로고침. store TTL (30s) 이 1차 캐싱.
onMounted(() => {
  if (!usage.value) {
    store.refresh({ silent: true })
  } else {
    store.refresh({ silent: true })
  }
})

// refreshKey prop 변경 시 강제 새로고침 (미팅 등록 직후 등).
watch(() => props.refreshKey, () => {
  store.refresh({ force: true, silent: true })
})

const isMaxTier = computed(() => subscription.value === TIER_PRO_MAX)

const fmt = (n) => {
  if (n == null) return '-'
  return formatInt(n)
}

// 진행바 색상 — 80% 이상은 경고, 100% 이상은 위험.
const barColor = (pct) => {
  if (pct >= 100) return 'error'
  if (pct >= 80) return 'warning'
  return 'primary'
}

const meetingColor = computed(() => barColor(meetingPct.value))
const tokensColor = computed(() => barColor(tokensPct.value))

// [2026-06] Lite 안내 — Pro+/Max 는 '무제한', Pro 는 '소프트랜딩(주간 한도)'.
const liteHint = computed(() =>
  (subscription.value === TIER_PRO_PLUS || subscription.value === TIER_PRO_MAX)
    ? t('profile.usage.lite_hint_unlimited')
    : t('profile.usage.lite_hint_soft'),
)
// 주간 Lite 진행바 색 — 넛지(70%)부터 warning, 100% 위험.
const liteColor = computed(() => barColor(liteDailyPct.value))

// [2026-06] 플랜 섹션 — 헤더 업그레이드 버튼을 프로필로 일원화.
//   비-Max: 업그레이드 가능한 상위 등급 pill 을 '선택'하면 업그레이드 버튼이 노출 → /pricing.
//   Max: 구독 관리 진입 (모바일에선 헤더 billing 버튼을 숨겼으므로 프로필이 그 진입점).
const TIER_ORDER = ['free', TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]
const upgradeTiers = computed(() => {
  const i = TIER_ORDER.indexOf(subscription.value)
  if (i < 0) return [TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]  // 알 수 없는 등급 → 전체 유료 제안
  return TIER_ORDER.slice(i + 1)  // 현재보다 상위 등급만
})
const selectedTier = ref(null)
// 같은 pill 재클릭 시 선택 해제(토글).
const selectTier = (tier) => { selectedTier.value = selectedTier.value === tier ? null : tier }
// 등급이 바뀌면(업그레이드 완료 등) 선택 초기화.
watch(subscription, () => { selectedTier.value = null })

const emit = defineEmits(['upgrade-click'])
const onUpgrade = (tier) => emit('upgrade-click', tier)
</script>

<template>
  <section class="usage-card" :aria-label="$t('profile.usage.aria')">
    <div class="usage-card-header">
      <Gauge :size="18" class="mr-2" />
      <span class="usage-card-title">{{ $t('profile.usage.title') }}</span>
      <!-- [2026-06-22] 토큰/한도 사용량 수동 새로고침 — 다른 탭/기기에서 작업 후
           최신 사용량을 즉시 확인. 강제(force) 호출로 30s 캐시 무시. -->
      <button
        type="button"
        class="usage-refresh"
        :class="{ 'usage-refresh--spinning': isLoading }"
        :disabled="isLoading"
        :title="$t('common.action.refresh')"
        :aria-label="$t('common.action.refresh')"
        @click="store.refresh({ force: true })"
      >
        <RefreshCw :size="15" />
      </button>
      <span
        class="sub-pill"
        :class="{ 'sub-pill--paid': isPaid }"
        :style="isPaid ? { background: tierMeta.gradient } : null"
      >
        <Crown v-if="isPaid" :size="12" class="mr-1" />
        {{ tierMeta.label }}
      </span>
    </div>

    <!-- 로딩 -->
    <div v-if="isLoading" class="usage-loading">
      <Loader2 :size="16" class="spin mr-2" />
      <span>{{ $t('profile.usage.loading') }}</span>
    </div>

    <!-- 에러 -->
    <div v-else-if="errorMsg" class="usage-error">
      <AlertCircle :size="16" class="mr-2" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- 정상 -->
    <div v-else class="usage-rows">
      <!-- 1) 미팅 로그 -->
      <div class="usage-row">
        <div class="usage-row-label">
          <span class="label-text">{{ $t('profile.usage.meeting_logs') }}</span>
          <span class="label-value">
            {{ $t('profile.usage.meeting_value', { used: fmt(meetingUsed), limit: fmt(meetingLimit) }) }}
          </span>
        </div>
        <v-progress-linear
          :model-value="meetingPct"
          :color="meetingColor"
          height="6"
          rounded
        />
      </div>

      <!-- 2) AI 토큰 -->
      <div class="usage-row">
        <div class="usage-row-label">
          <span class="label-text">{{ $t('profile.usage.ai_tokens') }}</span>
          <span class="label-value">
            {{ fmt(tokensUsed) }} / {{ fmt(tokensLimit) }}
          </span>
        </div>
        <v-progress-linear
          :model-value="tokensPct"
          :color="tokensColor"
          height="6"
          rounded
        />
      </div>

      <!-- [2026-06] Lite 오버플로우 — 유료 등급(주간캡>0)만 표시. -->
      <div v-if="liteEnabled" class="usage-row lite-row">
        <div class="usage-row-label">
          <span class="label-text">
            {{ $t('profile.usage.lite_title') }}
            <span v-if="liteOverflowActive" class="lite-badge">{{ $t('profile.usage.lite_active') }}</span>
          </span>
          <!-- 주기 사용값은 오버플로우 중일 때만 — 그 전엔 '이번 주 0/cap' 이 혼란스러움. -->
          <span v-if="liteOverflowActive" class="label-value">
            {{ $t('profile.usage.lite_daily_value', { used: fmt(liteDailyUsed), cap: fmt(liteDailyCap) }) }}
          </span>
        </div>
        <!-- 주간 캡 진행바는 오버플로우 모드일 때만 (그 전엔 0이라 의미 없음) -->
        <v-progress-linear
          v-if="liteOverflowActive"
          :model-value="liteDailyPct"
          :color="liteColor"
          height="6"
          rounded
        />
        <p class="lite-hint">{{ liteHint }}</p>
        <p v-if="liteNearCap" class="lite-nudge">{{ $t('profile.usage.lite_nudge') }}</p>
      </div>

      <!-- 3) 회의록 1회 입력 한도 (per-request, 누적값 없음) -->
      <div class="usage-row">
        <div class="usage-row-label">
          <span class="label-text">{{ $t('profile.usage.summary_limit') }}</span>
          <span class="label-value">{{ $t('profile.usage.summary_value', { count: fmt(summaryCharsLimit) }) }}</span>
        </div>
      </div>

      <!-- [2026-05] 월간 reset 안내 — lifetime 정책 → monthly 전환 -->
      <p class="usage-note">
        <template v-if="daysUntilReset != null && daysUntilReset > 0">
          {{ $t('profile.usage.reset_prefix') }}
          <strong>{{ $t('profile.usage.reset_days', { days: daysUntilReset }) }}</strong>
          <span v-if="resetAtLabel" class="reset-date-detail">{{ $t('profile.usage.reset_date_detail', { label: resetAtLabel }) }}</span>.
        </template>
        <template v-else-if="daysUntilReset === 0">
          {{ $t('profile.usage.reset_today') }}
        </template>
        <template v-else>
          {{ $t('profile.usage.reset_generic') }}
        </template>
        <span v-if="!isMaxTier">{{ $t('profile.usage.higher_tier_note') }}</span>
      </p>

      <!-- [2026-06] 관리자 기간제 부여 만료일 — 유료 등급 + 만료일이 있을 때만 표시.
           영구 부여 / Free 는 subscriptionEndsAtLabel 이 null 이라 노출 안 됨. -->
      <p v-if="isPaid && subscriptionEndsAtLabel" class="sub-end-note">
        {{ $t('profile.usage.sub_ends', { label: subscriptionEndsAtLabel }) }}
      </p>

      <!-- [2026-06] 플랜 섹션 — 등급 선택 → 업그레이드 버튼 노출 → /pricing -->
      <div v-if="showUpgrade && !isMaxTier" class="plan-section">
        <p class="plan-heading">{{ $t('common.header.upgrade') }}</p>
        <p class="plan-prompt">{{ $t('profile.usage.choose_tier') }}</p>
        <div class="plan-tiers">
          <button
            v-for="tier in upgradeTiers"
            :key="tier"
            type="button"
            class="plan-tier-pill"
            :class="{ 'plan-tier-pill--selected': selectedTier === tier }"
            :style="selectedTier === tier ? { background: TIER_META[tier]?.gradient, color: '#fff', borderColor: 'transparent' } : null"
            @click="selectTier(tier)"
          >
            <Crown :size="12" class="mr-1" />{{ TIER_META[tier]?.label }}
          </button>
        </div>
        <button
          v-if="selectedTier"
          class="upgrade-cta"
          type="button"
          :style="{ background: TIER_META[selectedTier]?.gradient }"
          @click="onUpgrade(selectedTier)"
        >
          {{ $t('profile.usage.upgrade_to', { tier: TIER_META[selectedTier]?.label }) }} →
        </button>
      </div>
      <!-- Pro Max: 구독 관리 진입 (모바일에서 헤더 billing 버튼을 숨긴 대체 경로) -->
      <button
        v-else-if="showUpgrade"
        class="manage-sub-cta"
        type="button"
        @click="onUpgrade('pro_max')"
      >
        {{ $t('common.header.manage_sub') }} →
      </button>
    </div>
  </section>
</template>

<style scoped>
.usage-card {
  background: var(--surface-1, #ffffff);
  border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  padding: 24px;
}

.usage-card-header {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-main, #111827);
  margin-bottom: 20px;
}

.usage-card-title { flex: 1; }

/* [2026-06-22] 사용량 수동 새로고침 버튼 */
.usage-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-right: 8px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.usage-refresh:hover:not(:disabled) {
  color: var(--accent, #8C6239);
  border-color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.06);
}
.usage-refresh:disabled { cursor: default; opacity: 0.7; }
.usage-refresh:focus-visible { outline: 2px solid var(--accent, #8C6239); outline-offset: 2px; }
.usage-refresh--spinning :deep(svg) { animation: spin 0.9s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .usage-refresh--spinning :deep(svg) { animation: none; }
}

.sub-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted, #6b7280);
}
/* 유료 등급 — gradient 는 inline style 로 (Pro 호박 / Pro+ 보라 / Pro Max 골드). */
.sub-pill--paid {
  color: #fff;
}

.usage-loading, .usage-error {
  display: flex; align-items: center;
  color: var(--text-muted, #6b7280);
  font-size: 13px; padding: 8px 0;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.usage-rows { display: flex; flex-direction: column; gap: 18px; }

.usage-row { display: flex; flex-direction: column; gap: 7px; }

.usage-row-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
}
.label-text { color: var(--text-main, #111827); }
.label-value {
  color: var(--text-muted, #6b7280);
  font-variant-numeric: tabular-nums;
}

/* [2026-06] Lite 오버플로우 행 */
.lite-row {
  padding-top: 14px;
  border-top: 1px dashed var(--border, rgba(0, 0, 0, 0.1));
}
.lite-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
  font-size: 10px;
  font-weight: 700;
  vertical-align: middle;
}
.lite-hint {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
}
.lite-nudge {
  margin: 6px 0 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  font-size: 11.5px;
  line-height: 1.5;
}

.usage-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
}
.usage-note strong { color: var(--accent, #8C6239); font-weight: 700; }
.reset-date-detail { font-variant-numeric: tabular-nums; opacity: 0.85; }

/* [2026-06] 구독 만료일 안내 */
.sub-end-note {
  margin: -8px 0 0;
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.upgrade-cta {
  display: inline-flex; align-items: center; justify-content: center;
  margin-top: 4px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(90deg, #f59e0b, #d97706);
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.upgrade-cta:hover { transform: translateY(-1px); }

/* [2026-06] 플랜 섹션 (등급 선택 → 업그레이드) */
.plan-section { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.plan-heading { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-main, #111827); }
.plan-prompt { margin: 0; font-size: 12px; color: var(--text-muted, #6b7280); }
.plan-tiers { display: flex; flex-wrap: wrap; gap: 8px; }
.plan-tier-pill {
  display: inline-flex; align-items: center;
  padding: 6px 14px; border-radius: 999px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.14));
  background: transparent; color: var(--text-main, #111827);
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: all 0.15s ease;
}
.plan-tier-pill:hover { border-color: var(--accent, #8C6239); }
.plan-tier-pill--selected { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }
.manage-sub-cta {
  align-self: flex-start; margin-top: 4px;
  display: inline-flex; align-items: center;
  padding: 8px 14px; border-radius: 8px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.14));
  background: transparent; color: var(--text-main, #111827);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.15s ease;
}
.manage-sub-cta:hover { border-color: var(--accent, #8C6239); transform: translateY(-1px); }
</style>
