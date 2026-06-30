<script setup>
/**
 * Admin Billing — 사용자 결제 검색 + 환불 + 강제 종료.
 *
 * Flow:
 *   1. email 입력 → fetchUserBillingApi
 *   2. 사용자 구독 정보 + 결제 이력 표시
 *   3. 결제 row 의 환불 버튼 → 환불 모달 (금액 / 사유 / downgrade_to_free)
 *   4. 활성 구독 있으면 "구독 강제 종료" 버튼
 */
import { ref, computed, onMounted } from 'vue'
import { formatInt } from '@/utils/format'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, BadgeCheck, Search, Loader2, RefreshCw, AlertCircle, X,
  CreditCard, Receipt, ExternalLink, ChevronDown, ChevronRight,
} from 'lucide-vue-next'
import { verifyToken } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import {
  fetchUserBillingApi, refundPaymentApi, terminateSubscriptionApi, fetchPaymentRefundsApi,
} from '@/utils/adminBilling'
import { getTierLabel } from '@/utils/subscription'

const { t } = useI18n()
const router = useRouter()
const { showSuccess, showError } = useSnackbar() ?? {}
const { confirm } = useConfirm() ?? { confirm: async () => true }

const searchEmail = ref('')
const isSearching = ref(false)
const errorMsg = ref('')

const subscription = ref(null)
const payments = ref([])

const refundDialog = ref(null)  // { payment, refund_amount, reason, downgrade_to_free }
const isRefunding = ref(false)
const isTerminating = ref(false)

// [2026-05-18] payment id → 환불 이력 expander 상태
const refundsExpanded = ref({})   // { [paymentId]: bool }
const refundsCache = ref({})      // { [paymentId]: Array }
const refundsLoading = ref({})    // { [paymentId]: bool }

const toggleRefundHistory = async (p) => {
  if (refundsExpanded.value[p.id]) {
    refundsExpanded.value[p.id] = false
    return
  }
  refundsExpanded.value[p.id] = true
  if (refundsCache.value[p.id]) return  // 캐시 hit
  refundsLoading.value[p.id] = true
  const r = await fetchPaymentRefundsApi(p.id)
  refundsLoading.value[p.id] = false
  if (r.success) {
    refundsCache.value[p.id] = r.data || []
  } else {
    showError?.(r.error || t('admin.billing.toast_refunds_failed'))
    refundsExpanded.value[p.id] = false
  }
}

const hasRefunds = (p) => (p.refund_amount || 0) > 0

const fmt = (n) => formatInt(n || 0)

const fmtPaymentStatus = (s) => ({
  paid: t('admin.billing.status_paid'), failed: t('admin.billing.status_failed'),
  refunded: t('admin.billing.status_refunded'), partial_refund: t('admin.billing.status_partial_refund'), pending: t('admin.billing.status_pending'),
}[s] || s)

const fmtPurpose = (p) => ({
  initial: t('admin.billing.purpose_initial'), renewal: t('admin.billing.purpose_renewal'),
  upgrade_proration: t('admin.billing.purpose_upgrade'), manual: t('admin.billing.purpose_manual'),
}[p] || p)

const fmtSubStatus = (s) => ({
  active: t('admin.billing.sub_status_active'), pending_cancel: t('admin.billing.sub_status_pending_cancel'),
  past_due: t('admin.billing.sub_status_past_due'), grace: t('admin.billing.sub_status_grace'), canceled: t('admin.billing.sub_status_canceled'),
}[s] || s)

const isRefundable = (p) => (
  (p.status === 'paid' || p.status === 'partial_refund') &&
  p.refund_amount < p.amount
)

const hasActiveSub = computed(() =>
  subscription.value && subscription.value.status !== 'canceled'
)

const search = async () => {
  const email = (searchEmail.value || '').trim()
  if (!email) {
    errorMsg.value = t('admin.billing.toast_email_required')
    return
  }
  isSearching.value = true
  errorMsg.value = ''
  subscription.value = null
  payments.value = []
  const r = await fetchUserBillingApi(email)
  isSearching.value = false
  if (!r.success) {
    errorMsg.value = r.error || t('admin.billing.toast_search_failed')
    return
  }
  subscription.value = r.data?.subscription || null
  payments.value = r.data?.payments || []
}

const openRefund = (p) => {
  const remaining = p.amount - (p.refund_amount || 0)
  refundDialog.value = {
    payment: p,
    refund_amount: remaining,
    reason: '',
    downgrade_to_free: false,
  }
}

const closeRefund = () => { refundDialog.value = null }

const submitRefund = async () => {
  const d = refundDialog.value
  if (!d) return
  const amt = Math.max(0, Math.min(d.payment.amount, Number(d.refund_amount) || 0))
  const reason = (d.reason || '').trim()
  if (amt <= 0) { showError?.(t('admin.billing.toast_refund_amount_required')); return }
  if (!reason) { showError?.(t('admin.billing.toast_refund_reason_required')); return }

  const ok = await confirm({
    title: t('admin.billing.confirm_refund_title', { amount: fmt(amt) }),
    message: d.downgrade_to_free
      ? t('admin.billing.confirm_refund_downgrade')
      : t('admin.billing.confirm_refund_keep'),
    confirmText: t('admin.billing.confirm_refund_yes'),
    cancelText: t('common.action.cancel'),
    variant: 'danger',
  })
  if (!ok) return

  isRefunding.value = true
  const r = await refundPaymentApi({
    payment_id: d.payment.id,
    refund_amount: amt,
    reason,
    downgrade_to_free: d.downgrade_to_free,
  })
  isRefunding.value = false
  if (!r.success) {
    showError?.(r.error || t('admin.billing.toast_refund_failed'))
    return
  }
  showSuccess?.(t('admin.billing.toast_refund_done', { amount: fmt(amt) }))
  closeRefund()
  await search()
}

const handleTerminate = async () => {
  if (!subscription.value) return
  const reason = window.prompt(t('admin.billing.prompt_terminate_reason'), '')
  if (!reason || !reason.trim()) return

  const ok = await confirm({
    title: t('admin.billing.confirm_terminate_title'),
    message: t('admin.billing.confirm_terminate_message', { email: searchEmail.value, tier: getTierLabel(subscription.value.plan) }),
    confirmText: t('admin.billing.confirm_terminate_yes'),
    cancelText: t('common.action.cancel'),
    variant: 'danger',
  })
  if (!ok) return

  isTerminating.value = true
  const r = await terminateSubscriptionApi(searchEmail.value.trim(), reason.trim())
  isTerminating.value = false
  if (!r.success) {
    showError?.(r.error || t('admin.billing.toast_terminate_failed'))
    return
  }
  showSuccess?.(t('admin.billing.toast_terminated'))
  await search()
}

onMounted(async () => {
  const r = await verifyToken()
  if (!r.valid || !r.user?.is_admin) {
    router.replace('/plan')
    return
  }
})
</script>

<template>
  <div class="admin-billing page-root">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="16" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <header class="page-header">
      <h1 class="page-title">
        <CreditCard :size="22" class="mr-2" />{{ $t('admin.billing.title') }}
      </h1>
      <p class="page-sub text-muted">
        {{ $t('admin.billing.subtitle') }}
      </p>
    </header>

    <!-- 검색 -->
    <section class="search-bar">
      <input
        v-model="searchEmail"
        type="email"
        class="search-input"
        :placeholder="$t('admin.billing.search_placeholder')"
        @keyup.enter="search"
      />
      <button class="search-btn" :disabled="isSearching" @click="search">
        <Loader2 v-if="isSearching" :size="14" class="spin mr-1" />
        <Search v-else :size="14" class="mr-1" />
        {{ $t('admin.billing.search') }}
      </button>
    </section>

    <p v-if="errorMsg" class="error-row">
      <AlertCircle :size="14" class="mr-1" />{{ errorMsg }}
    </p>

    <!-- 구독 -->
    <section v-if="subscription" class="sub-card">
      <div class="sub-card-head">
        <BadgeCheck :size="14" /> {{ $t('admin.billing.sub_info') }}
        <button
          v-if="hasActiveSub"
          class="terminate-btn"
          :disabled="isTerminating"
          @click="handleTerminate"
        >
          <Loader2 v-if="isTerminating" :size="12" class="spin mr-1" />
          {{ $t('admin.billing.terminate') }}
        </button>
      </div>
      <div class="sub-card-body">
        <div><strong>{{ getTierLabel(subscription.plan) }}</strong>
          <span class="status-pill" :class="`status-pill--${subscription.status}`">
            {{ fmtSubStatus(subscription.status) }}
          </span>
        </div>
        <div class="text-muted small">
          {{ $t('admin.billing.sub_started', { date: subscription.started_at?.slice(0,10) || '—' }) }} ·
          {{ $t('admin.billing.sub_period_end', { date: subscription.current_period_end?.slice(0,10) || '—' }) }} ·
          {{ $t('admin.billing.sub_next_billing', { date: subscription.next_billing_at?.slice(0,10) || '—' }) }}
        </div>
        <div v-if="subscription.grace_until" class="text-muted small">
          {{ $t('admin.billing.sub_grace_until', { date: subscription.grace_until?.slice(0,16) }) }}
        </div>
      </div>
    </section>

    <!-- 결제 이력 -->
    <section v-if="payments.length > 0" class="payments-card">
      <h3 class="payments-title"><Receipt :size="14" class="mr-1" />{{ $t('admin.billing.payments_title') }}</h3>
      <div class="payments-table">
        <div class="payments-row payments-row--head">
          <span>{{ $t('admin.billing.col_date') }}</span>
          <span>{{ $t('admin.billing.col_purpose') }}</span>
          <span>{{ $t('admin.billing.col_amount') }}</span>
          <span>{{ $t('admin.billing.col_status') }}</span>
          <span>{{ $t('admin.billing.col_receipt') }}</span>
          <span></span>
        </div>
        <template v-for="p in payments" :key="p.id">
          <div class="payments-row">
            <span>{{ p.paid_at?.slice(0,10) || p.created_at?.slice(0,10) || '—' }}</span>
            <span class="text-muted">{{ fmtPurpose(p.purpose) }}</span>
            <span class="amount">
              ₩{{ fmt(p.amount) }}
              <button
                v-if="hasRefunds(p)"
                class="refund-history-toggle"
                :title="refundsExpanded[p.id] ? $t('admin.billing.refund_collapse') : $t('admin.billing.refund_expand')"
                @click="toggleRefundHistory(p)"
              >
                <ChevronDown v-if="refundsExpanded[p.id]" :size="11" />
                <ChevronRight v-else :size="11" />
                {{ $t('admin.billing.refund_amount', { amount: '₩' + fmt(p.refund_amount) }) }}
              </button>
            </span>
            <span class="status-pill" :class="`status-pill--${p.status}`">
              {{ fmtPaymentStatus(p.status) }}
            </span>
            <span>
              <a v-if="p.receipt_url" :href="p.receipt_url" target="_blank" rel="noreferrer noopener" class="receipt-link">
                <ExternalLink :size="11" /> {{ $t('admin.billing.receipt_view') }}
              </a>
              <span v-else class="text-muted">—</span>
            </span>
            <span>
              <button
                v-if="isRefundable(p)"
                class="refund-btn"
                @click="openRefund(p)"
              >{{ $t('admin.billing.refund') }}</button>
            </span>
          </div>
          <!-- 환불 이력 expander — RefundRecord 노드 list -->
          <div v-if="refundsExpanded[p.id]" class="refund-history">
            <div v-if="refundsLoading[p.id]" class="refund-history-loading">
              <Loader2 :size="13" class="spin mr-1" /> {{ $t('admin.billing.refund_history_loading') }}
            </div>
            <div v-else-if="refundsCache[p.id]?.length" class="refund-history-list">
              <div v-for="r in refundsCache[p.id]" :key="r.id" class="refund-record">
                <span class="refund-record-date">{{ r.created_at?.slice(0,16)?.replace('T',' ') || '—' }}</span>
                <span class="refund-record-amount">₩{{ fmt(r.amount) }}</span>
                <span class="refund-record-reason">{{ r.reason || '—' }}</span>
              </div>
            </div>
            <div v-else class="refund-history-empty">{{ $t('admin.billing.refund_history_empty') }}</div>
          </div>
        </template>
      </div>
    </section>

    <!-- 환불 모달 -->
    <div v-if="refundDialog" class="refund-overlay" @click.self="closeRefund">
      <div class="refund-dialog">
        <div class="refund-head">
          <h3>{{ $t('admin.billing.refund_dialog_title') }}</h3>
          <button class="refund-close" @click="closeRefund"><X :size="16" /></button>
        </div>
        <div class="refund-body">
          <div class="info-row">
            <span>{{ $t('admin.billing.info_paid_amount') }}</span>
            <strong>₩{{ fmt(refundDialog.payment.amount) }}</strong>
          </div>
          <div class="info-row">
            <span>{{ $t('admin.billing.info_already_refunded') }}</span>
            <strong>₩{{ fmt(refundDialog.payment.refund_amount || 0) }}</strong>
          </div>
          <div class="info-row">
            <span>{{ $t('admin.billing.info_refundable') }}</span>
            <strong>₩{{ fmt(refundDialog.payment.amount - (refundDialog.payment.refund_amount || 0)) }}</strong>
          </div>
          <label class="label-block">
            <span>{{ $t('admin.billing.refund_amount_label') }}</span>
            <input
              v-model.number="refundDialog.refund_amount"
              type="number"
              min="0"
              :max="refundDialog.payment.amount - (refundDialog.payment.refund_amount || 0)"
              step="100"
              class="amount-input"
            />
          </label>
          <label class="label-block">
            <span>{{ $t('admin.billing.refund_reason_label') }}</span>
            <textarea v-model="refundDialog.reason" rows="3" class="reason-input" :placeholder="$t('admin.billing.refund_reason_placeholder')"></textarea>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" v-model="refundDialog.downgrade_to_free" />
            <span>{{ $t('admin.billing.downgrade_label') }}</span>
          </label>
        </div>
        <div class="refund-actions">
          <button class="btn-secondary" @click="closeRefund">{{ $t('common.action.cancel') }}</button>
          <button class="btn-danger" :disabled="isRefunding" @click="submitRefund">
            <Loader2 v-if="isRefunding" :size="13" class="spin mr-1" />
            {{ $t('admin.billing.refund_submit') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-billing { padding: 24px var(--page-pad-x, 32px); max-width: 1100px; margin: 0 auto; }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; cursor: pointer; margin-bottom: 18px;
}
.back-btn:hover { background: rgba(0,0,0,0.04); }

.page-header { margin-bottom: 20px; }
.page-title { display: flex; align-items: center; font-size: 1.4rem; font-weight: 800; margin: 0 0 6px; }
.page-sub { font-size: 0.85rem; margin: 0; }

.search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
.search-input {
  flex: 1; padding: 8px 14px; border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px; font-size: 0.88rem;
}
.search-input:focus { border-color: var(--accent, #8C6239); outline: none; }
.search-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 8px 16px; background: var(--accent, #8C6239); color: white;
  border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.85rem;
}
.search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.error-row { color: #DC2626; font-size: 0.85rem; padding: 8px 14px; background: #FEE2E2; border-radius: 8px; display: inline-flex; align-items: center; }

.sub-card {
  background: var(--bg-light, #F7F5EB);
  border-radius: 12px; padding: 16px 20px;
  margin: 16px 0;
}
.sub-card-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 10px;
}
.sub-card-head .terminate-btn {
  margin-left: auto;
  background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA;
  padding: 4px 12px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;
  cursor: pointer; text-transform: none;
  display: inline-flex; align-items: center;
}
.sub-card-head .terminate-btn:hover { background: #FECACA; }
.sub-card-body { display: flex; flex-direction: column; gap: 4px; }
.sub-card-body strong { font-size: 1.05rem; margin-right: 8px; }
.small { font-size: 0.78rem; }

.status-pill {
  display: inline-block; padding: 2px 8px; border-radius: 9999px;
  font-size: 0.7rem; font-weight: 700;
}
.status-pill--active, .status-pill--paid { background: #DCFCE7; color: #15803D; }
.status-pill--pending_cancel { background: #FEF3C7; color: #B45309; }
.status-pill--past_due, .status-pill--grace, .status-pill--failed { background: #FEE2E2; color: #B91C1C; }
.status-pill--canceled, .status-pill--refunded { background: #E5E7EB; color: #6B7280; }
.status-pill--partial_refund { background: #FEF3C7; color: #B45309; }
.status-pill--pending { background: #DBEAFE; color: #1D4ED8; }

.payments-card {
  background: white;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px; padding: 20px;
}
.payments-title {
  display: flex; align-items: center;
  font-size: 0.95rem; font-weight: 800; margin: 0 0 14px;
}
.payments-row {
  display: grid; grid-template-columns: 100px 110px 1fr 110px 70px 80px;
  gap: 10px; padding: 10px 4px; align-items: center;
  font-size: 0.82rem;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.06));
}
.payments-row:last-child { border-bottom: 0; }
.payments-row--head {
  font-size: 0.7rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; padding-bottom: 8px;
}
.amount { font-variant-numeric: tabular-nums; }
.refund { display: block; font-size: 0.7rem; color: var(--text-muted); }
.receipt-link {
  display: inline-flex; align-items: center; gap: 3px;
  color: var(--accent, #8C6239); text-decoration: none; font-weight: 600;
}
.receipt-link:hover { text-decoration: underline; }
.refund-btn {
  background: transparent; border: 1px solid #FECACA; color: #B91C1C;
  padding: 4px 12px; border-radius: 6px; font-size: 0.72rem; font-weight: 700;
  cursor: pointer;
}
.refund-btn:hover { background: #FEE2E2; }

/* ─── 환불 이력 expander (2026-05-18) ─── */
.refund-history-toggle {
  display: inline-flex; align-items: center; gap: 3px;
  background: transparent; border: 0;
  font-size: 0.72rem; color: var(--text-muted);
  cursor: pointer; padding: 0;
  margin-left: 6px;
}
.refund-history-toggle:hover { color: var(--accent, #8C6239); text-decoration: underline; }
.refund-history {
  grid-column: 1 / -1;
  background: #F9FAFB;
  border-left: 2px solid var(--accent, #8C6239);
  margin: 4px 0;
  padding: 10px 12px 10px 28px;
  font-size: 0.78rem;
}
.refund-history-loading {
  display: inline-flex; align-items: center;
  color: var(--text-muted);
}
.refund-history-list { display: flex; flex-direction: column; gap: 4px; }
.refund-record {
  display: grid;
  grid-template-columns: 130px 100px 1fr;
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(0,0,0,0.06);
}
.refund-record:last-child { border-bottom: 0; }
.refund-record-date { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.refund-record-amount { font-variant-numeric: tabular-nums; color: #B91C1C; font-weight: 700; }
.refund-record-reason { color: var(--text-main); }
.refund-history-empty { color: var(--text-muted); padding: 4px 0; }

.refund-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px;
}
.refund-dialog {
  background: white; border-radius: 12px; width: 100%; max-width: 480px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.15);
}
.refund-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.08));
}
.refund-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.refund-close { background: transparent; border: none; cursor: pointer; padding: 4px; }
.refund-body { padding: 20px; }
.info-row {
  display: flex; justify-content: space-between;
  font-size: 0.85rem; padding: 6px 0;
}
.info-row strong { font-variant-numeric: tabular-nums; }
.label-block {
  display: block; margin-top: 12px;
}
.label-block > span {
  display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 6px;
}
.amount-input, .reason-input {
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px; padding: 8px 12px; font-size: 0.88rem;
}
.amount-input:focus, .reason-input:focus { border-color: var(--accent, #8C6239); outline: none; }
.reason-input { font-family: inherit; resize: vertical; }
.checkbox-row {
  display: flex; align-items: center; gap: 8px;
  margin-top: 14px; font-size: 0.85rem; cursor: pointer;
}
.checkbox-row input { accent-color: var(--accent, #8C6239); cursor: pointer; }

.refund-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px 20px;
}
.btn-secondary {
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
  font-size: 0.82rem; font-weight: 700;
}
.btn-danger {
  display: inline-flex; align-items: center;
  background: #B91C1C; color: white; border: none;
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
  font-size: 0.82rem; font-weight: 700;
}
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
