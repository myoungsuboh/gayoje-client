<script setup>
/**
 * Admin 한도(Quota) 관리 — 등급별 사용 한도 설정.
 *
 * [흐름]
 *   1. 부팅 시 BE 의 QuotaConfig 4개 등급 조회.
 *   2. 카드별 한도 입력(미팅로그/회의록글자수/AI토큰/Lite캡/스킬/프로젝트).
 *   3. "저장" 클릭 시 BE 호출 → audit log + quotaConfigStore.refresh().
 *   4. 모든 FE 컴포넌트(perks)가 새 한도 즉시 반영.
 *
 * [가격 편집 제거 — 2026-06-24]
 *   결제·가격의 진실원천은 Paddle(MoR)로 이관 — admin 에서 가격을 바꿔도 실제 청구엔
 *   영향이 없어 오해를 유발하므로 '가격 편집 UI' 를 제거했다. (고객 표시가는 Paddle
 *   PricePreview, 폴백·수익 대시보드 MRR 은 PricingConfig 데이터가 계속 사용 —
 *   데이터/엔드포인트/스토어는 유지.) 라우트는 /admin/pricing 그대로.
 *
 * [보안]
 *   페이지 진입 시 verifyToken().is_admin 체크.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, BadgeCheck, Crown, Loader2, AlertCircle, RefreshCw, Save,
} from 'lucide-vue-next'
import { verifyToken } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import { fetchAdminQuotaConfigApi, updateQuotaConfigApi } from '@/utils/quotaConfig'
import { useQuotaConfigStore } from '@/store/quotaConfig'
import {
  TIER_FREE, TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX,
  getTierMeta, getTierLabel, isPaidTier,
} from '@/utils/subscription'

const { t } = useI18n()
const router = useRouter()
const { showSuccess, showError } = useSnackbar() ?? {}
const quotaConfigStore = useQuotaConfigStore()

// ─── 표시 순서: Free → Pro → Pro+ → Pro Max ─────────
const TIER_ORDER = [TIER_FREE, TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]

// ═══════════════════════════════════════════════════════
// 한도 (quota) 관리
// ═══════════════════════════════════════════════════════

const QUOTA_FIELDS = computed(() => [
  { key: 'meeting_logs',   label: t('admin.pricing.quota_meeting_logs'),   suffix: t('admin.pricing.quota_suffix_per_month'),     max: 100_000 },
  { key: 'summary_chars',  label: t('admin.pricing.quota_summary_chars'),  suffix: t('admin.pricing.quota_suffix_chars'),         max: 10_000_000 },
  { key: 'total_tokens',   label: t('admin.pricing.quota_total_tokens'),   suffix: t('admin.pricing.quota_suffix_token_per_month'), max: 10_000_000_000 },
  { key: 'lite_daily_cap', label: t('admin.pricing.quota_lite_daily_cap'), suffix: t('admin.pricing.quota_suffix_token_per_day'),   max: 10_000_000_000 },
  { key: 'library_skills', label: t('admin.pricing.quota_library_skills'), suffix: t('admin.pricing.quota_suffix_count'),         max: 1_000_000 },
  { key: 'max_projects',   label: t('admin.pricing.quota_max_projects'),   suffix: t('admin.pricing.quota_suffix_count'),         max: 10_000 },
])

const quotaItems = ref({})
const quotaDrafts = ref({})
const quotaLoading = ref(true)
const quotaError = ref('')
const quotaSubmitting = ref({})

const loadQuota = async () => {
  quotaLoading.value = true
  quotaError.value = ''
  const r = await fetchAdminQuotaConfigApi()
  quotaLoading.value = false
  if (!r.success) {
    quotaError.value = r.error || t('admin.pricing.toast_quota_load_failed')
    return
  }
  const map = {}
  const draftMap = {}
  for (const q of (r.data?.quota || [])) {
    map[q.tier] = q
    draftMap[q.tier] = {
      meeting_logs: q.meeting_logs,
      summary_chars: q.summary_chars,
      total_tokens: q.total_tokens,
      lite_daily_cap: q.lite_daily_cap ?? 0,
      library_skills: q.library_skills,
      max_projects: q.max_projects,
    }
  }
  quotaItems.value = map
  quotaDrafts.value = draftMap
}

const isQuotaDirty = (tier) => {
  const orig = quotaItems.value[tier]
  const d = quotaDrafts.value[tier]
  if (!orig || !d) return false
  return QUOTA_FIELDS.value.some((f) => Number(d[f.key]) !== Number(orig[f.key]))
}

const resetQuota = (tier) => {
  const orig = quotaItems.value[tier]
  if (!orig) return
  quotaDrafts.value[tier] = {
    meeting_logs: orig.meeting_logs,
    summary_chars: orig.summary_chars,
    total_tokens: orig.total_tokens,
    lite_daily_cap: orig.lite_daily_cap ?? 0,
    library_skills: orig.library_skills,
    max_projects: orig.max_projects,
  }
}

const saveQuota = async (tier) => {
  const d = quotaDrafts.value[tier]
  if (!d) return
  quotaSubmitting.value[tier] = true
  const body = {}
  for (const f of QUOTA_FIELDS.value) {
    body[f.key] = Math.max(0, Math.min(f.max, Number(d[f.key]) || 0))
  }
  const r = await updateQuotaConfigApi(tier, body)
  quotaSubmitting.value[tier] = false
  if (!r.success) {
    showError?.(r.error || t('admin.pricing.toast_quota_save_failed'))
    return
  }
  quotaItems.value[tier] = r.data
  quotaDrafts.value[tier] = {
    meeting_logs: r.data.meeting_logs,
    summary_chars: r.data.summary_chars,
    total_tokens: r.data.total_tokens,
    lite_daily_cap: r.data.lite_daily_cap ?? 0,
    library_skills: r.data.library_skills,
    max_projects: r.data.max_projects,
  }
  showSuccess?.(t('admin.pricing.toast_quota_saved', { tier: getTierLabel(tier) }))
  // 전역 store 강제 갱신 — pricing 카드/업그레이드 모달의 perks 가 옛 한도로 남지 않게.
  await quotaConfigStore.refresh()
}

// ─── 진입 시 권한 + 데이터 로드 ───────────────────────
onMounted(async () => {
  const r = await verifyToken()
  if (!r.valid || !r.user?.is_admin) {
    router.replace('/plan')
    return
  }
  await loadQuota()
})
</script>

<template>
  <div class="page-root pricing-admin-page">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="16" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <header class="page-header">
      <h1 class="page-title">
        <BadgeCheck :size="22" class="mr-2" />{{ $t('admin.pricing.section_quota') }}
      </h1>
      <p class="page-sub text-muted">
        {{ $t('admin.pricing.section_quota_sub') }}
      </p>
    </header>

    <!-- 로딩 / 에러 -->
    <div v-if="quotaLoading" class="pa-loading">
      <Loader2 :size="20" class="spin mr-2" />
      <span>{{ $t('admin.pricing.quota_loading') }}</span>
    </div>
    <div v-else-if="quotaError" class="pa-error">
      <AlertCircle :size="16" class="mr-2" />{{ quotaError }}
      <button class="pa-retry" @click="loadQuota"><RefreshCw :size="12" /> {{ $t('admin.pricing.retry') }}</button>
    </div>

    <!-- 한도 카드 -->
    <div v-else class="pa-grid">
      <div
        v-for="tier in TIER_ORDER"
        :key="`q-${tier}`"
        class="pa-card"
        :class="{ 'pa-card--paid': isPaidTier(tier) }"
        :style="isPaidTier(tier) ? { '--tier-gradient': getTierMeta(tier).gradient, '--tier-color': getTierMeta(tier).color } : null"
      >
        <div class="pa-card-header">
          <span class="pa-tier-pill" :style="{ background: getTierMeta(tier).gradient }">
            <Crown v-if="isPaidTier(tier)" :size="11" class="mr-1" />
            {{ getTierLabel(tier) }}
          </span>
          <span class="pa-updated text-muted" v-if="quotaItems[tier]?.updated_at">
            {{ quotaItems[tier].updated_at?.slice(0, 10) }} · {{ quotaItems[tier].updated_by }}
          </span>
        </div>

        <div class="pa-card-body">
          <label
            v-for="f in QUOTA_FIELDS"
            :key="f.key"
            class="pa-field pa-field--inline"
          >
            <span class="pa-label">
              {{ f.label }}
              <span class="pa-field-suffix text-muted">{{ f.suffix }}</span>
            </span>
            <input
              v-if="quotaDrafts[tier]"
              v-model.number="quotaDrafts[tier][f.key]"
              type="number"
              min="0"
              :max="f.max"
              step="1"
              class="pa-input"
            />
          </label>

          <div class="pa-actions">
            <button
              class="pa-btn pa-btn-secondary"
              :disabled="!isQuotaDirty(tier) || quotaSubmitting[tier]"
              @click="resetQuota(tier)"
            >{{ $t('common.action.cancel') }}</button>
            <button
              class="pa-btn pa-btn-primary"
              :disabled="!isQuotaDirty(tier) || quotaSubmitting[tier]"
              @click="saveQuota(tier)"
            >
              <Loader2 v-if="quotaSubmitting[tier]" :size="13" class="spin mr-1" />
              <Save v-else :size="13" class="mr-1" />
              {{ $t('common.action.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pricing-admin-page { padding: 24px var(--page-pad-x, 32px); max-width: 1400px; margin: 0 auto; }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  color: var(--text-main, #2A2421);
  padding: 6px 12px; border-radius: 8px;
  font-size: 0.8rem; cursor: pointer;
  margin-bottom: 18px;
}
.back-btn:hover { background: rgba(0,0,0,0.04); }

.page-header { margin-bottom: 24px; }
.page-title { display: flex; align-items: center; font-size: 1.4rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px; }
.page-sub { font-size: 0.85rem; margin: 0; line-height: 1.6; }

.pa-loading, .pa-error {
  display: flex; align-items: center;
  padding: 24px; font-size: 0.85rem;
  color: var(--text-muted);
}
.pa-error { background: #fef2f2; color: #b91c1c; border-radius: 10px; }
.pa-retry {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 4px;
  background: white; border: 1px solid #fca5a5; color: #b91c1c;
  padding: 4px 10px; border-radius: 6px;
  font-size: 0.75rem; cursor: pointer;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.pa-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.pa-card {
  background: #ffffff;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px;
  overflow: hidden;
  display: flex; flex-direction: column;
}
.pa-card--paid {
  border-top: 3px solid var(--tier-color, #d97706);
}

.pa-card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-light, #F7F5EB);
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.06));
}
.pa-tier-pill {
  display: inline-flex; align-items: center;
  background: rgba(0,0,0,0.05);
  color: #fff;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
}
.pa-updated {
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
}

.pa-card-body {
  padding: 18px 16px 16px;
  display: flex; flex-direction: column;
  gap: 14px;
}

.pa-field { display: flex; flex-direction: column; gap: 6px; }
.pa-label {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 0.78rem; font-weight: 700; color: var(--text-main);
}

.pa-input {
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.95rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  outline: none;
  background: white;
}
.pa-input:focus { border-color: var(--accent, #8C6239); }
.pa-input:disabled { background: #f3f4f6; cursor: not-allowed; }

.pa-actions { display: flex; gap: 6px; justify-content: flex-end; }
.pa-btn {
  display: inline-flex; align-items: center;
  border: none; border-radius: 8px;
  padding: 7px 14px;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.pa-btn-secondary { background: rgba(0,0,0,0.05); color: var(--text-main); }
.pa-btn-secondary:hover:not(:disabled) { background: rgba(0,0,0,0.08); }
.pa-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
.pa-btn-primary {
  background: var(--tier-gradient, linear-gradient(90deg, #14b8a6, #0d9488));
  color: white;
}
.pa-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.pa-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.pa-field--inline { gap: 4px; }
.pa-field-suffix {
  font-size: 0.7rem;
  font-weight: 500;
  margin-left: 4px;
}
</style>
