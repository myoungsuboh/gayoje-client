<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, Search, Crown, Loader2, Github, RefreshCw, ChevronRight, ChevronLeft,
  ShieldCheck, Shield, BadgeCheck, History, X, AlertCircle, FileSearch, TrendingUp,
  MessageSquare, UserX, UserCheck,
} from 'lucide-vue-next'
import {
  listAdminUsersApi,
  getAdminUserDetailApi,
  changeSubscriptionApi,
  resetUserUsageApi,
  setAdminApi,
  suspendUserApi,
  unsuspendUserApi,
  getAdminStatsApi,
} from '@/utils/admin'
import { getCurrentUser, verifyToken } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import { useUsageStore } from '@/store/usage'
import {
  getTierLabel,
  getTierMeta,
  isPaidTier,
  TIER_FREE,
  TIER_PRO,
  TIER_PRO_PLUS,
  TIER_PRO_MAX,
} from '@/utils/subscription'

const { t } = useI18n()
const router = useRouter()
const { showSuccess, showError } = useSnackbar() ?? {}
// 본인 사용량 store — 본인 등급 변경 / 본인 사용량 리셋 시 헤더 chip / UsageCard 일관성 유지.
const usageStore = useUsageStore()

// 현재 로그인한 어드민. 본인 강등 차단 UI 처리에 사용.
const me = ref(getCurrentUser() || {})

// ─── 목록 / 검색 ────────────────────────────────────────────
const searchInput = ref('')
const users = ref([])
const total = ref(0)
const limit = ref(10)  // [2026-05-27] 페이지당 10명 — 스크롤 대신 페이지 네비. (이전 50: 전체가 한 페이지에 들어가 스크롤 발생)
const offset = ref(0)
const isLoading = ref(false)
const listError = ref('')

const load = async () => {
  isLoading.value = true
  listError.value = ''
  const res = await listAdminUsersApi({ q: searchInput.value.trim(), limit: limit.value, offset: offset.value })
  isLoading.value = false
  if (!res.success) {
    listError.value = res.error
    return
  }
  users.value = res.users || []
  total.value = res.total || 0
}

const onSearch = () => {
  offset.value = 0
  load()
}

// ─── 페이지네이션 ─────────────────────────────────────────
const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const canPrev = computed(() => offset.value > 0)
const canNext = computed(() => offset.value + limit.value < total.value)

const goPrev = () => {
  if (!canPrev.value) return
  offset.value = Math.max(0, offset.value - limit.value)
  load()
}
const goNext = () => {
  if (!canNext.value) return
  offset.value = offset.value + limit.value
  load()
}

const formatDate = (iso) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return iso }
}

// ─── 상세 패널 ──────────────────────────────────────────────
const selectedEmail = ref('')
const detail = ref(null)
const isDetailLoading = ref(false)
const detailError = ref('')

const openDetail = async (email) => {
  selectedEmail.value = email
  isDetailLoading.value = true
  detailError.value = ''
  detail.value = null
  const res = await getAdminUserDetailApi(email)
  isDetailLoading.value = false
  if (!res.success) {
    detailError.value = res.error
    return
  }
  detail.value = res.detail
}

const closeDetail = () => {
  selectedEmail.value = ''
  detail.value = null
  detailError.value = ''
}

// ─── 구독 변경 다이얼로그 ───────────────────────────────────
const subDialogOpen = ref(false)
const subDialogTarget = ref(null) // user row
const subDialogType = ref('free')
const subDialogReason = ref('')
// [2026-06] 기간제 부여 — 만료(개월). null = 무기한. 기본 1개월. type=free 면 무시.
const subDialogDuration = ref(1)
// 만료 선택지 — 1/3/6/12개월 + 무기한(null).
const SUB_DURATION_OPTIONS = [1, 3, 6, 12, null]
const subDialogSubmitting = ref(false)

// 2026-05: 4-tier 도입 — 다이얼로그가 4개 라디오 (Free / Pro / Pro+ / Pro Max).
// prefill 정책: 현재 등급 외의 가장 직관적인 다음 단계 선택.
//   - Free → Pro (가장 흔한 첫 업그레이드)
//   - Pro → Pro+ (한 단계 위)
//   - Pro+ → Pro Max (한 단계 위)
//   - Pro Max → Free (강등 시 가장 흔함)
const _suggestNextTier = (current) => {
  if (current === TIER_FREE) return TIER_PRO
  if (current === TIER_PRO) return TIER_PRO_PLUS
  if (current === TIER_PRO_PLUS) return TIER_PRO_MAX
  return TIER_FREE
}

const openSubDialog = (user) => {
  subDialogTarget.value = user
  subDialogType.value = _suggestNextTier(user.subscription_type || TIER_FREE)
  subDialogReason.value = ''
  subDialogDuration.value = 1  // 기본 1개월
  subDialogOpen.value = true
}

// 라디오 옵션 — 표시 순서 (Free → Pro → Pro+ → Pro Max).
const SUB_DIALOG_OPTIONS = [TIER_FREE, TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]

const submitSubChange = async () => {
  if (!subDialogTarget.value) return
  subDialogSubmitting.value = true
  const res = await changeSubscriptionApi(subDialogTarget.value.email, {
    type: subDialogType.value,
    reason: subDialogReason.value.trim(),
    // free 는 만료 무의미 → null. 그 외엔 선택값(무기한=null).
    duration_months: subDialogType.value === TIER_FREE ? null : subDialogDuration.value,
  })
  subDialogSubmitting.value = false
  if (!res.success) {
    showError?.(res.error || t('admin.index.toast_sub_change_failed'))
    return
  }
  showSuccess?.(t('admin.index.toast_sub_changed', { email: subDialogTarget.value.email, tier: getTierLabel(subDialogType.value) }))
  // 본인 등급을 본인이 바꿨다면 헤더 chip / UsageCard 가 stale — usage store 무효화.
  // (BE 가 등급 변경 시 usage_reset_at 도 새로 박음. 한도/등급 모두 갱신 필요.)
  const targetEmail = subDialogTarget.value.email
  subDialogOpen.value = false
  if (targetEmail.toLowerCase() === (me.value?.email || '').toLowerCase()) {
    await usageStore.refresh({ force: true })
  }
  // 목록 + 상세 갱신
  await load()
  if (selectedEmail.value === targetEmail) {
    await openDetail(targetEmail)
  }
}

// ─── 사용량 리셋 다이얼로그 ───────────────────────────────────
// admin 이 사용자 사용량 카운터를 수동 0 으로 리셋.
// 정책: usage_reset_at 은 건드리지 않음 (BE 가 cycle 유지). 즉 이 액션은
// "이번 cycle 카운터만 0" 의미. 새 cycle 부여하려면 구독 변경(submitSubChange)
// 을 사용 — 그쪽이 reset_at 갱신.
const resetUsageDialogOpen = ref(false)
const resetUsageTarget = ref(null) // user row
const resetUsageReason = ref('')
const resetUsageSubmitting = ref(false)

const openResetUsageDialog = (user) => {
  resetUsageTarget.value = user
  resetUsageReason.value = ''
  resetUsageDialogOpen.value = true
}

const submitResetUsage = async () => {
  if (!resetUsageTarget.value) return
  resetUsageSubmitting.value = true
  const targetEmail = resetUsageTarget.value.email
  const res = await resetUserUsageApi(targetEmail, {
    reason: resetUsageReason.value.trim(),
  })
  resetUsageSubmitting.value = false
  if (!res.success) {
    showError?.(res.error || t('admin.index.toast_reset_usage_failed'))
    return
  }
  showSuccess?.(t('admin.index.toast_reset_usage_done', { email: targetEmail }))
  resetUsageDialogOpen.value = false
  // 본인 리셋이면 헤더 chip / UsageCard 도 stale → store 무효화.
  if (targetEmail.toLowerCase() === (me.value?.email || '').toLowerCase()) {
    await usageStore.refresh({ force: true })
  }
  // 상세 패널 통계도 갱신
  if (selectedEmail.value === targetEmail) {
    await openDetail(targetEmail)
  }
}


// ─── admin 토글 ─────────────────────────────────────────────
const togglingEmail = ref('')

const toggleAdmin = async (user) => {
  // 본인 강등 차단 (BE 도 막지만, UX 차원에서 미리 안내)
  if (user.email.toLowerCase() === (me.value?.email || '').toLowerCase() && user.is_admin) {
    showError?.(t('admin.index.toast_self_demote_blocked'))
    return
  }
  // 결정적 액션 — 사용자 확인 (브라우저 native confirm: 의존성 없음 + 가벼움)
  const verb = user.is_admin ? t('admin.index.verb_revoke') : t('admin.index.verb_grant')
  if (!window.confirm(t('admin.index.confirm_toggle_admin', { email: user.email, verb }))) return

  togglingEmail.value = user.email
  const res = await setAdminApi(user.email, !user.is_admin)
  togglingEmail.value = ''
  if (!res.success) {
    showError?.(res.error || t('admin.index.toast_admin_toggle_failed'))
    return
  }
  showSuccess?.(res.user?.is_admin
    ? t('admin.index.toast_admin_granted', { email: user.email })
    : t('admin.index.toast_admin_revoked', { email: user.email }))
  await load()
  if (selectedEmail.value === user.email) {
    await openDetail(user.email)
  }
}

// ─── 정지 / 해제 다이얼로그 ────────────────────────────────
const suspendDialogOpen = ref(false)
const suspendDialogTarget = ref(null)
const suspendDialogReason = ref('')
const suspendDialogSubmitting = ref(false)

const openSuspendDialog = (user) => {
  if (user.email.toLowerCase() === (me.value?.email || '').toLowerCase()) {
    showError?.(t('admin.index.toast_self_suspend_blocked'))
    return
  }
  suspendDialogTarget.value = user
  suspendDialogReason.value = ''
  suspendDialogOpen.value = true
}

const submitSuspend = async () => {
  if (!suspendDialogTarget.value) return
  suspendDialogSubmitting.value = true
  const targetEmail = suspendDialogTarget.value.email
  const res = await suspendUserApi(targetEmail, {
    reason: suspendDialogReason.value.trim(),
  })
  suspendDialogSubmitting.value = false
  if (!res.success) {
    showError?.(res.error || t('admin.index.toast_suspend_failed'))
    return
  }
  showSuccess?.(t('admin.index.toast_suspended', { email: targetEmail }))
  suspendDialogOpen.value = false
  await load()
  if (selectedEmail.value === targetEmail) await openDetail(targetEmail)
}

const unsuspendDialogOpen = ref(false)
const unsuspendDialogTarget = ref(null)
const unsuspendDialogSubmitting = ref(false)

const openUnsuspendDialog = (user) => {
  unsuspendDialogTarget.value = user
  unsuspendDialogOpen.value = true
}

const submitUnsuspend = async () => {
  if (!unsuspendDialogTarget.value) return
  unsuspendDialogSubmitting.value = true
  const targetEmail = unsuspendDialogTarget.value.email
  const res = await unsuspendUserApi(targetEmail)
  unsuspendDialogSubmitting.value = false
  if (!res.success) {
    showError?.(res.error || t('admin.index.toast_unsuspend_failed'))
    return
  }
  showSuccess?.(t('admin.index.toast_unsuspended', { email: targetEmail }))
  unsuspendDialogOpen.value = false
  await load()
  if (selectedEmail.value === targetEmail) await openDetail(targetEmail)
}

// ─── 활성 사용자 지표 (DAU / WAU / MAU) ───────────────────────
const activeStats = ref({ dau: 0, wau: 0, mau: 0, total_users: 0 })
const isStatsLoading = ref(false)

const fmtKpi = (n) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (n >= 10_000)    return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K'
  return n.toLocaleString()
}

const loadStats = async () => {
  isStatsLoading.value = true
  const res = await getAdminStatsApi()
  isStatsLoading.value = false
  if (res.success && res.data) activeStats.value = res.data
}

// 진입 시 BE 로 권한 재검증 — localStorage 조작으로 가드 우회한 케이스 차단.
// /auth/me 가 최신 is_admin 을 반환하므로, false 면 /plan 으로 강제 리다이렉트.
onMounted(async () => {
  const r = await verifyToken()
  if (!r.valid || !r.user?.is_admin) {
    router.replace('/plan')
    return
  }
  me.value = r.user
  load()
  loadStats()
})
</script>

<template>
  <div class="page-root admin-page">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="16" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <div class="d-flex align-center mb-1">
      <Crown :size="20" class="mr-2 text-accent" />
      <h2 class="text-h4 font-weight-bold text-main">{{ $t('admin.index.title') }}</h2>
    </div>
    <p class="text-muted text-body-2 mb-4">{{ $t('admin.index.subtitle') }}</p>

    <!-- ── 활성 사용자 KPI (DAU / WAU / MAU) ─────────────── -->
    <div class="active-kpi-row">
      <div class="active-kpi-card">
        <span class="active-kpi-label">전체 가입자</span>
        <span class="active-kpi-value" :class="{ 'active-kpi--loading': isStatsLoading }">
          {{ isStatsLoading ? '…' : fmtKpi(activeStats.total_users) }}
        </span>
      </div>
      <div class="active-kpi-card active-kpi-card--accent">
        <span class="active-kpi-label">MAU <span class="active-kpi-period">30일</span></span>
        <span class="active-kpi-value" :class="{ 'active-kpi--loading': isStatsLoading }">
          {{ isStatsLoading ? '…' : fmtKpi(activeStats.mau) }}
        </span>
      </div>
      <div class="active-kpi-card">
        <span class="active-kpi-label">WAU <span class="active-kpi-period">7일</span></span>
        <span class="active-kpi-value" :class="{ 'active-kpi--loading': isStatsLoading }">
          {{ isStatsLoading ? '…' : fmtKpi(activeStats.wau) }}
        </span>
      </div>
      <div class="active-kpi-card">
        <span class="active-kpi-label">DAU <span class="active-kpi-period">1일</span></span>
        <span class="active-kpi-value" :class="{ 'active-kpi--loading': isStatsLoading }">
          {{ isStatsLoading ? '…' : fmtKpi(activeStats.dau) }}
        </span>
      </div>
      <div class="active-kpi-note">
        * 로그인 기준 (이메일·GitHub·Google 로그인 및 토큰 갱신 시 카운트)
      </div>
    </div>

    <!-- ── Search + Refresh ────────────────────────────── -->
    <div class="admin-toolbar">
      <div class="search-wrap">
        <Search :size="14" class="search-icon" />
        <input
          v-model="searchInput"
          class="search-input"
          :placeholder="$t('admin.index.search_placeholder')"
          @keydown.enter="onSearch"
        />
      </div>
      <button class="tool-btn" @click="load" :disabled="isLoading">
        <Loader2 v-if="isLoading" :size="13" class="spin" />
        <RefreshCw v-else :size="13" />
        <span>{{ $t('common.action.refresh') }}</span>
      </button>
      <button class="tool-btn" @click="router.push('/admin/audit-logs')" :title="$t('admin.index.audit_logs_title')">
        <FileSearch :size="13" />
        <span>{{ $t('admin.index.audit_logs') }}</span>
      </button>
      <button class="tool-btn" @click="router.push('/admin/pricing')" :title="$t('admin.pricing.section_quota')">
        <BadgeCheck :size="13" />
        <span>{{ $t('admin.pricing.section_quota') }}</span>
      </button>
      <button class="tool-btn" @click="router.push('/admin/revenue')" :title="$t('admin.index.revenue_title')">
        <TrendingUp :size="13" />
        <span>{{ $t('admin.index.revenue') }}</span>
      </button>
      <button class="tool-btn" @click="router.push('/admin/inquiries')" :title="$t('admin.index.inquiries_title')">
        <MessageSquare :size="13" />
        <span>{{ $t('admin.index.inquiries') }}</span>
      </button>
      <span class="total-count">{{ $t('admin.index.total_users', { count: total }) }}</span>
    </div>

    <div class="admin-grid">
      <!-- ── User Table ───────────────────────────────── -->
      <section class="user-table-wrap" :aria-label="$t('admin.index.user_list_aria')">
        <div v-if="listError" class="list-error">
          <AlertCircle :size="14" class="mr-2" />{{ listError }}
        </div>
        <table v-else class="user-table">
          <thead>
            <tr>
              <th>{{ $t('admin.index.col_email') }}</th>
              <th>{{ $t('admin.index.col_name') }}</th>
              <th>{{ $t('admin.index.col_github') }}</th>
              <th>{{ $t('admin.index.col_subscription') }}</th>
              <th>{{ $t('admin.index.col_token') }}</th>
              <th>{{ $t('admin.index.col_role') }}</th>
              <th>{{ $t('admin.index.col_status') }}</th>
              <th>{{ $t('admin.index.col_joined') }}</th>
              <th>{{ $t('admin.index.col_action') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!isLoading && users.length === 0">
              <td colspan="9" class="empty-row">{{ $t('admin.index.empty_users') }}</td>
            </tr>
            <tr
              v-for="u in users"
              :key="u.email"
              :class="{ 'row--selected': selectedEmail === u.email }"
              @click="openDetail(u.email)"
            >
              <td class="email-cell mono-text">{{ u.email }}</td>
              <td>{{ u.name || '—' }}</td>
              <td>
                <!-- [2026-06-24] GitHub 연동 시 Octocat 아이콘만(텍스트 제거, hover 로 username). -->
                <span v-if="u.github_username" class="gh-cell" :title="'@' + u.github_username">
                  <Github :size="14" />
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <span
                  class="sub-badge"
                  :class="{ 'sub-badge--paid': isPaidTier(u.subscription_type) }"
                  :style="isPaidTier(u.subscription_type) ? { background: getTierMeta(u.subscription_type).gradient } : null"
                >{{ getTierLabel(u.subscription_type) }}</span>
              </td>
              <td>
                <!-- [2026-05-27] 이번 cycle 토큰 사용률 (등급 한도 대비). hover 로 실수치. -->
                <div
                  v-if="u.token_pct != null"
                  class="token-cell"
                  :title="$t('admin.index.token_usage_title', { used: (u.token_used || 0).toLocaleString(), limit: (u.token_limit || 0).toLocaleString() })"
                >
                  <div class="token-bar">
                    <div
                      class="token-bar-fill"
                      :class="{
                        'token-bar-fill--warn': u.token_pct >= 80 && u.token_pct < 100,
                        'token-bar-fill--over': u.token_pct >= 100,
                      }"
                      :style="{ width: Math.min(100, u.token_pct) + '%' }"
                    ></div>
                  </div>
                  <span class="token-pct">{{ u.token_pct }}%</span>
                </div>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <span v-if="u.is_admin" class="role-badge">
                  <Crown :size="11" class="mr-1" />{{ $t('admin.index.admin_badge') }}
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <span v-if="u.is_suspended" class="status-chip status-chip--suspended"
                      :title="$t('admin.index.status_suspended_title', { at: u.suspended_at || '', reason: u.suspended_reason ? '— ' + u.suspended_reason : '' })">
                  {{ $t('admin.index.status_suspended') }}
                </span>
                <span v-else class="status-chip status-chip--active">{{ $t('admin.index.status_active') }}</span>
              </td>
              <td class="date-cell text-muted">{{ formatDate(u.created_at) }}</td>
              <td @click.stop>
                <div class="action-cell">
                  <button class="row-btn" @click="openSubDialog(u)" :title="$t('admin.index.action_subscription_title')">
                    <BadgeCheck :size="12" class="mr-1" />{{ $t('admin.index.action_subscription') }}
                  </button>
                  <button
                    v-if="!u.is_suspended"
                    class="row-btn row-btn--suspend"
                    :disabled="u.email.toLowerCase() === (me?.email || '').toLowerCase()"
                    :title="u.email.toLowerCase() === (me?.email || '').toLowerCase()
                      ? $t('admin.index.action_suspend_self_title')
                      : $t('admin.index.action_suspend_title')"
                    @click="openSuspendDialog(u)"
                  >
                    <UserX :size="12" class="mr-1" />{{ $t('admin.index.action_suspend') }}
                  </button>
                  <button
                    v-else
                    class="row-btn row-btn--unsuspend"
                    :title="$t('admin.index.action_unsuspend_title')"
                    @click="openUnsuspendDialog(u)"
                  >
                    <UserCheck :size="12" class="mr-1" />{{ $t('admin.index.action_unsuspend') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 페이지네이션 -->
        <div v-if="total > limit" class="pagination-row">
          <button class="page-btn" :disabled="!canPrev || isLoading" @click="goPrev">
            <ChevronLeft :size="13" />{{ $t('common.guide.prev') }}
          </button>
          <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button class="page-btn" :disabled="!canNext || isLoading" @click="goNext">
            {{ $t('common.guide.next') }}<ChevronRight :size="13" />
          </button>
        </div>
      </section>

      <!-- ── Detail Panel ─────────────────────────────── -->
      <aside class="detail-panel" :class="{ 'detail-panel--open': !!selectedEmail }">
        <div v-if="!selectedEmail" class="detail-empty">
          <ChevronRight :size="20" class="mb-2 text-muted" />
          <span class="text-caption text-muted">{{ $t('admin.index.detail_empty') }}</span>
        </div>
        <template v-else>
          <div class="detail-header">
            <span class="detail-title mono-text">{{ selectedEmail }}</span>
            <button class="icon-btn" @click="closeDetail" :aria-label="$t('common.action.close')"><X :size="14" /></button>
          </div>

          <div v-if="isDetailLoading" class="detail-loading">
            <Loader2 :size="20" class="spin text-muted" />
          </div>

          <div v-else-if="detailError" class="list-error">
            <AlertCircle :size="14" class="mr-2" />{{ detailError }}
          </div>

          <div v-else-if="detail" class="detail-body custom-scroll">
            <!-- 정지 상태 배너 -->
            <div v-if="detail?.user?.is_suspended" class="detail-suspended-banner">
              <AlertCircle :size="14" class="mr-1" /> {{ $t('admin.index.detail_suspended_banner') }}
              <div class="detail-suspended-meta">
                <div v-if="detail.user.suspended_at">{{ $t('admin.index.detail_suspended_at', { date: formatDate(detail.user.suspended_at) }) }}</div>
                <div v-if="detail.user.suspended_reason">{{ $t('admin.index.detail_suspended_reason', { reason: detail.user.suspended_reason }) }}</div>
                <div v-if="detail.user.suspended_by_email">{{ $t('admin.index.detail_suspended_by', { email: detail.user.suspended_by_email }) }}</div>
              </div>
            </div>
            <!-- 기본 정보 -->
            <div class="detail-section">
              <div class="detail-row"><span class="dr-label">{{ $t('admin.index.detail_name') }}</span><span class="dr-value">{{ detail.user?.name || '—' }}</span></div>
              <div class="detail-row">
                <span class="dr-label">{{ $t('admin.index.detail_subscription') }}</span>
                <span class="dr-value">
                  <span
                    class="sub-badge"
                    :class="{ 'sub-badge--paid': isPaidTier(detail.user?.subscription_type) }"
                    :style="isPaidTier(detail.user?.subscription_type) ? { background: getTierMeta(detail.user?.subscription_type).gradient } : null"
                  >
                    {{ getTierLabel(detail.user?.subscription_type) }}
                  </span>
                  <span
                    v-if="detail.user?.subscription_ends_at"
                    class="text-muted"
                    style="font-size: 0.72rem; margin-left: 6px;"
                  >{{ $t('admin.index.detail_expires', { date: (detail.user.subscription_ends_at || '').slice(0, 10) }) }}</span>
                  <button class="inline-btn" @click="openSubDialog(detail.user)">{{ $t('admin.index.detail_change') }}</button>
                </span>
              </div>
              <div class="detail-row">
                <span class="dr-label">{{ $t('admin.index.detail_role') }}</span>
                <span class="dr-value">
                  <span v-if="detail.user?.is_admin" class="role-badge"><Crown :size="11" class="mr-1" />{{ $t('admin.index.admin_badge') }}</span>
                  <span v-else class="text-muted">{{ $t('admin.index.detail_regular_user') }}</span>
                  <button class="inline-btn" @click="toggleAdmin(detail.user)">
                    {{ detail.user?.is_admin ? $t('admin.index.action_demote') : $t('admin.index.detail_grant_admin') }}
                  </button>
                </span>
              </div>
              <div class="detail-row">
                <span class="dr-label">{{ $t('admin.index.detail_github') }}</span>
                <span class="dr-value">
                  <span v-if="detail.user?.github_username">
                    <Github :size="12" class="mr-1" />@{{ detail.user.github_username }}
                    <span v-if="detail.github_linked_at" class="text-muted ml-2">({{ formatDate(detail.github_linked_at) }})</span>
                  </span>
                  <span v-else class="text-muted">{{ $t('admin.index.detail_github_unlinked') }}</span>
                </span>
              </div>
              <div class="detail-row"><span class="dr-label">{{ $t('admin.index.detail_joined') }}</span><span class="dr-value text-muted">{{ formatDate(detail.user?.created_at) }}</span></div>
            </div>

            <!-- 활동 통계 -->
            <div class="detail-section">
              <div class="section-title">
                <span>{{ $t('admin.index.detail_activity') }}</span>
                <button
                  class="inline-btn inline-btn--danger"
                  @click="openResetUsageDialog(detail.user)"
                  :disabled="resetUsageSubmitting"
                  :title="$t('admin.index.detail_reset_usage_title')"
                >
                  <RefreshCw :size="11" class="mr-1" />{{ $t('admin.index.detail_reset_usage') }}
                </button>
              </div>
              <div class="stat-grid">
                <div class="stat-card"><span class="stat-label">{{ $t('admin.index.stat_vibe_repo') }}</span><span class="stat-value">{{ detail.vibe_repo_count }}</span></div>
                <div class="stat-card"><span class="stat-label">{{ $t('admin.index.stat_meeting_logs') }}</span><span class="stat-value">{{ detail.meeting_upload_count }}</span></div>
                <div class="stat-card"><span class="stat-label">{{ $t('admin.index.stat_projects') }}</span><span class="stat-value">{{ detail.project_count }}</span></div>
              </div>
            </div>

            <!-- 구독 변경 이력 -->
            <div class="detail-section">
              <div class="section-title"><History :size="13" class="mr-1" />{{ $t('admin.index.detail_sub_history') }}</div>
              <div v-if="(detail.subscription_history || []).length === 0" class="empty-history text-muted">{{ $t('admin.index.detail_no_history') }}</div>
              <div v-else class="history-list">
                <div v-for="h in detail.subscription_history" :key="h.id" class="history-item">
                  <div class="hist-top">
                    <span
                      class="sub-badge"
                      :class="{ 'sub-badge--paid': isPaidTier(h.from_type) }"
                      :style="isPaidTier(h.from_type) ? { background: getTierMeta(h.from_type).gradient } : null"
                    >{{ getTierLabel(h.from_type) }}</span>
                    <ChevronRight :size="11" class="mx-1 text-muted" />
                    <span
                      class="sub-badge"
                      :class="{ 'sub-badge--paid': isPaidTier(h.to_type) }"
                      :style="isPaidTier(h.to_type) ? { background: getTierMeta(h.to_type).gradient } : null"
                    >{{ getTierLabel(h.to_type) }}</span>
                    <span class="hist-when text-muted ml-2">{{ formatDate(h.changed_at) }}</span>
                  </div>
                  <div v-if="h.reason" class="hist-reason text-muted">"{{ h.reason }}"</div>
                  <div v-if="h.changed_by_email" class="hist-by text-muted">{{ $t('admin.index.history_by', { email: h.changed_by_email }) }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </aside>
    </div>

    <!-- ── 구독 변경 다이얼로그 ─────────────────────────── -->
    <v-dialog v-model="subDialogOpen" max-width="440" persistent>
      <div class="sub-dialog">
        <div class="sub-dialog-header">
          <BadgeCheck :size="18" class="mr-2" />
          <span>{{ $t('admin.index.sub_dialog_title') }}</span>
        </div>
        <div class="sub-dialog-body">
          <div class="sd-target text-muted mono-text">{{ subDialogTarget?.email }}</div>
          <div class="sd-row">
            <span class="sd-label">{{ $t('admin.index.sub_dialog_tier_label') }}</span>
            <div class="sd-options">
              <label
                v-for="opt in SUB_DIALOG_OPTIONS"
                :key="opt"
                class="sd-opt"
                :class="{ 'sd-opt--active': subDialogType === opt }"
              >
                <input type="radio" v-model="subDialogType" :value="opt" />
                <span>{{ getTierLabel(opt) }}</span>
              </label>
            </div>
          </div>
          <!-- [2026-06] 기간제 만료 — Free 가 아닐 때만 (Free 는 만료 무의미). 기본 1개월. -->
          <div v-if="subDialogType !== TIER_FREE" class="sd-row">
            <span class="sd-label">{{ $t('admin.index.sub_dialog_duration_label') }}</span>
            <div class="sd-options">
              <label
                v-for="d in SUB_DURATION_OPTIONS"
                :key="d ?? 'perm'"
                class="sd-opt"
                :class="{ 'sd-opt--active': subDialogDuration === d }"
              >
                <input type="radio" v-model="subDialogDuration" :value="d" />
                <span>{{ d === null ? $t('admin.index.sub_dialog_duration_permanent') : $t('admin.index.sub_dialog_duration_months', { n: d }) }}</span>
              </label>
            </div>
          </div>
          <div class="sd-row">
            <span class="sd-label">{{ $t('admin.index.sub_dialog_reason_label') }}</span>
            <input
              v-model="subDialogReason"
              class="sd-input"
              maxlength="500"
              :placeholder="$t('admin.index.sub_dialog_reason_placeholder')"
            />
          </div>
        </div>
        <div class="sub-dialog-actions">
          <button class="sd-btn sd-btn--ghost" :disabled="subDialogSubmitting" @click="subDialogOpen = false">{{ $t('common.action.cancel') }}</button>
          <button class="sd-btn sd-btn--primary" :disabled="subDialogSubmitting" @click="submitSubChange">
            <Loader2 v-if="subDialogSubmitting" :size="13" class="mr-1 spin" />{{ $t('common.action.save') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- ── 사용량 리셋 다이얼로그 ─────────────────────────── -->
    <!-- 정책 안내: 카운터만 0, reset_at 은 유지. cycle 부여하려면 구독 변경 사용. -->
    <v-dialog v-model="resetUsageDialogOpen" max-width="460" persistent>
      <div class="sub-dialog">
        <div class="sub-dialog-header">
          <RefreshCw :size="18" class="mr-2" />
          <span>{{ $t('admin.index.reset_usage_title') }}</span>
        </div>
        <div class="sub-dialog-body">
          <div class="sd-target text-muted mono-text">{{ resetUsageTarget?.email }}</div>
          <div class="sd-policy-note">
            <AlertCircle :size="13" class="mr-1" />
            <span>
              {{ $t('admin.index.reset_usage_note', { strong: $t('admin.index.reset_usage_note_strong') }) }}
            </span>
          </div>
          <div class="sd-row">
            <span class="sd-label">{{ $t('admin.index.reset_usage_reason_label') }}</span>
            <input
              v-model="resetUsageReason"
              class="sd-input"
              maxlength="500"
              :placeholder="$t('admin.index.reset_usage_reason_placeholder')"
            />
          </div>
        </div>
        <div class="sub-dialog-actions">
          <button class="sd-btn sd-btn--ghost" :disabled="resetUsageSubmitting" @click="resetUsageDialogOpen = false">{{ $t('common.action.cancel') }}</button>
          <button class="sd-btn sd-btn--primary" :disabled="resetUsageSubmitting" @click="submitResetUsage">
            <Loader2 v-if="resetUsageSubmitting" :size="13" class="mr-1 spin" />{{ $t('admin.index.reset_usage_submit') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- ── 정지 다이얼로그 ──────────────────────────────────── -->
    <v-dialog v-model="suspendDialogOpen" max-width="440" persistent>
      <div class="sub-dialog">
        <div class="sub-dialog-header sub-dialog-header--danger">
          <UserX :size="18" class="mr-2" />
          <span>{{ $t('admin.index.suspend_dialog_title') }}</span>
        </div>
        <div class="sub-dialog-body">
          <div class="sd-target text-muted mono-text">{{ suspendDialogTarget?.email }}</div>
          <div class="sd-policy-note sd-policy-note--danger">
            <AlertCircle :size="13" class="mr-1" />
            <span>{{ $t('admin.index.suspend_dialog_note') }}</span>
          </div>
          <div class="sd-row">
            <span class="sd-label">{{ $t('admin.index.suspend_reason_label') }}</span>
            <textarea
              v-model="suspendDialogReason"
              class="sd-textarea"
              maxlength="500"
              rows="3"
              :placeholder="$t('admin.index.suspend_reason_placeholder')"
            />
          </div>
        </div>
        <div class="sub-dialog-actions">
          <button class="sd-btn sd-btn--ghost" :disabled="suspendDialogSubmitting" @click="suspendDialogOpen = false">{{ $t('common.action.cancel') }}</button>
          <button class="sd-btn sd-btn--danger" :disabled="suspendDialogSubmitting" @click="submitSuspend">
            <Loader2 v-if="suspendDialogSubmitting" :size="13" class="mr-1 spin" />{{ $t('admin.index.suspend_submit') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- ── 해제 다이얼로그 ──────────────────────────────────── -->
    <v-dialog v-model="unsuspendDialogOpen" max-width="440" persistent>
      <div class="sub-dialog">
        <div class="sub-dialog-header">
          <UserCheck :size="18" class="mr-2" />
          <span>{{ $t('admin.index.unsuspend_dialog_title') }}</span>
        </div>
        <div class="sub-dialog-body">
          <div class="sd-target text-muted mono-text">{{ unsuspendDialogTarget?.email }}</div>
          <p class="sd-confirm-text">{{ $t('admin.index.unsuspend_confirm', { email: unsuspendDialogTarget?.email }) }}</p>
          <p v-if="unsuspendDialogTarget?.suspended_reason" class="sd-hint">
            {{ $t('admin.index.unsuspend_prev_reason', { reason: unsuspendDialogTarget.suspended_reason }) }}
          </p>
        </div>
        <div class="sub-dialog-actions">
          <button class="sd-btn sd-btn--ghost" :disabled="unsuspendDialogSubmitting" @click="unsuspendDialogOpen = false">{{ $t('common.action.cancel') }}</button>
          <button class="sd-btn sd-btn--primary" :disabled="unsuspendDialogSubmitting" @click="submitUnsuspend">
            <Loader2 v-if="unsuspendDialogSubmitting" :size="13" class="mr-1 spin" />{{ $t('admin.index.unsuspend_submit') }}
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<style scoped>
.admin-page { padding: 24px var(--page-pad-x, 32px); }
.mono-text { font-family: 'IBM Plex Mono', monospace; }
.text-accent { color: var(--accent); }

.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); font-size: 0.78rem; padding: 6px 0; margin-bottom: 16px;
  transition: color 0.15s;
}
.back-btn:hover { color: var(--text-main); }

/* ── 활성 사용자 KPI ──────────────────────────────── */
.active-kpi-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.active-kpi-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 20px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #ECECEC);
  border-radius: 10px;
  min-width: 110px;
}
.active-kpi-card--accent {
  border-color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.04);
}
.active-kpi-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #8A817C);
  font-family: 'Outfit', sans-serif;
}
.active-kpi-period {
  font-size: 0.62rem;
  font-weight: 400;
  opacity: 0.75;
}
.active-kpi-value {
  font-family: 'Outfit', sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-main, #1A1A1A);
  line-height: 1;
}
.active-kpi-card--accent .active-kpi-value {
  color: var(--accent, #8C6239);
}
.active-kpi--loading { opacity: 0.4; }
.active-kpi-note {
  align-self: flex-end;
  font-size: 0.65rem;
  color: var(--text-muted, #8A817C);
  padding-bottom: 4px;
}

/* ── Toolbar ───────────────────────────────────────── */
.admin-toolbar {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 18px; flex-wrap: wrap;
}
.search-wrap {
  display: flex; align-items: center; gap: 6px;
  background: white; border: 1.5px solid var(--border-light);
  border-radius: 10px; padding: 0 10px; flex: 1; min-width: 200px;
  transition: border-color 0.15s;
}
.search-wrap:focus-within { border-color: var(--accent); }
.search-icon { color: var(--text-muted); flex-shrink: 0; }
.search-input {
  flex: 1; padding: 8px 4px; border: none; outline: none;
  font-size: 0.8rem; background: transparent; color: var(--text-main);
}
.tool-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 9999px; border: 1px solid var(--border-light);
  background: white; font-size: 0.72rem; font-weight: 700;
  font-family: 'Outfit', sans-serif; color: var(--text-main); cursor: pointer;
  transition: all 0.15s;
}
.tool-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.total-count {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.72rem; color: var(--text-muted);
}

/* ── Grid: table + side panel ────────────────────── */
.admin-grid { display: grid; grid-template-columns: 1fr 420px; gap: 16px; }
@media (max-width: 1100px) { .admin-grid { grid-template-columns: 1fr; } }

.user-table-wrap {
  background: white; border: 1px solid var(--border-light); border-radius: 16px;
  overflow: auto;
}
.user-table {
  width: 100%; border-collapse: collapse;
  font-size: 0.78rem;
}
.user-table thead th {
  position: sticky; top: 0; background: var(--bg-light);
  padding: 10px 12px; text-align: left; font-family: 'Outfit', sans-serif;
  font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
}
.user-table tbody tr {
  cursor: pointer; transition: background 0.12s;
  border-bottom: 1px solid var(--border-light);
}
.user-table tbody tr:hover { background: var(--bg-light); }
.user-table tbody tr.row--selected { background: rgba(140, 98, 57, 0.08); }
.user-table td { padding: 10px 12px; vertical-align: middle; }
.email-cell { font-size: 0.72rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date-cell { font-size: 0.68rem; white-space: nowrap; }
.gh-cell { display: inline-flex; align-items: center; font-size: 0.72rem; color: var(--text-main); }
.empty-row { text-align: center; padding: 24px; color: var(--text-muted); }

.action-cell { display: flex; gap: 6px; flex-wrap: wrap; }
.row-btn {
  display: inline-flex; align-items: center; padding: 4px 10px;
  border-radius: 9999px; border: 1px solid var(--border-light);
  background: white; font-size: 0.66rem; font-weight: 700;
  font-family: 'Outfit', sans-serif; color: var(--text-main); cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.row-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.row-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.row-btn--admin { color: var(--primary-moss); border-color: rgba(46, 64, 54, 0.25); }
.row-btn--admin:hover:not(:disabled) { background: rgba(46, 64, 54, 0.06); color: var(--primary-moss); border-color: var(--primary-moss); }
.row-btn--demote { color: #B91C1C; border-color: rgba(185, 28, 28, 0.25); }
.row-btn--demote:hover:not(:disabled) { background: rgba(185, 28, 28, 0.06); color: #B91C1C; border-color: #B91C1C; }

.list-error {
  display: flex; align-items: center; padding: 16px;
  color: #B91C1C; font-size: 0.78rem;
}

/* ── 토큰 사용률 셀 (2026-05-27) ───────────────────── */
.token-cell { display: flex; align-items: center; gap: 8px; min-width: 110px; }
.token-bar {
  flex: 1; height: 6px; border-radius: 9999px;
  background: var(--border-light, #e8e8e8); overflow: hidden;
}
.token-bar-fill {
  height: 100%; border-radius: 9999px;
  background: var(--accent, #8C6239);
  transition: width 0.3s ease;
}
.token-bar-fill--warn { background: #E8A23D; }   /* 80%+ 경고 */
.token-bar-fill--over { background: #DC2626; }   /* 100% 초과 */
.token-pct {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem;
  color: var(--text-muted); min-width: 38px; text-align: right;
}

/* ── Pagination ─────────────────────────────────── */
.pagination-row {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 14px; border-top: 1px solid var(--border-light); background: var(--bg-light);
}
.page-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 9999px;
  border: 1px solid var(--border-light); background: white;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--text-main); cursor: pointer; transition: all 0.15s;
}
.page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem;
  color: var(--text-muted);
}

/* ── Subscription / Role 뱃지 ─────────────────────── */
.sub-badge {
  display: inline-flex; align-items: center;
  padding: 2px 10px; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(140, 98, 57, 0.08); color: var(--accent);
  border: 1px solid rgba(140, 98, 57, 0.2);
}
/* 유료 등급 — gradient 는 inline style 로 (Pro 호박 / Pro+ 보라 / Pro Max 골드). */
.sub-badge--paid {
  color: #FFFFFF; border-color: transparent;
}
/* Backward compat: 이전 클래스명도 보존 (다른 곳에서 참조하는 경우). */
.sub-badge--pro {
  background: linear-gradient(135deg, #C77F4A 0%, #8C6239 100%);
  color: #FFFFFF; border-color: transparent;
}
.role-badge {
  display: inline-flex; align-items: center;
  padding: 2px 10px; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.62rem; font-weight: 700;
  background: rgba(46, 64, 54, 0.08); color: var(--primary-moss);
  border: 1px solid rgba(46, 64, 54, 0.2);
}

/* ── Detail Panel ───────────────────────────────── */
.detail-panel {
  background: white; border: 1px solid var(--border-light); border-radius: 16px;
  min-height: 200px; display: flex; flex-direction: column;
  position: sticky; top: 24px; max-height: calc(100vh - 100px);
}
.detail-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 32px; text-align: center;
}
.detail-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border-light);
}
.detail-title { font-size: 0.78rem; font-weight: 700; color: var(--text-main); }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%; border: none;
  background: transparent; color: var(--text-muted); cursor: pointer;
}
.icon-btn:hover { background: var(--bg-light); color: var(--text-main); }

.detail-loading { display: flex; justify-content: center; padding: 32px; }
.detail-body { flex: 1; overflow-y: auto; padding: 16px 18px; }
.detail-section { margin-bottom: 20px; }
.section-title {
  display: flex; align-items: center; justify-content: space-between;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-muted); margin-bottom: 10px;
}
.section-title > .inline-btn { text-transform: none; letter-spacing: 0; }
.inline-btn--danger { color: #c0362c; border-color: #f5c8c4; background: #fff5f4; }
.inline-btn--danger:hover { border-color: #c0362c; color: #c0362c; background: #ffe6e3; }
.inline-btn--danger:disabled { opacity: 0.5; cursor: not-allowed; }
.sd-policy-note {
  display: flex; align-items: flex-start; gap: 6px;
  background: #fff8e6; border: 1px solid #f5d68e; border-radius: 10px;
  padding: 10px 12px; margin-bottom: 14px;
  font-size: 0.72rem; color: #6b4f08; line-height: 1.5;
}
.sd-policy-note strong { color: #5b3d00; }
.detail-row {
  display: flex; align-items: center; padding: 6px 0;
  font-size: 0.76rem; gap: 12px;
}
.dr-label { min-width: 70px; color: var(--text-muted); font-size: 0.72rem; }
.dr-value { color: var(--text-main); display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.inline-btn {
  padding: 2px 10px; border-radius: 9999px; border: 1px solid var(--border-light);
  background: var(--bg-light); font-size: 0.62rem; font-weight: 700;
  font-family: 'Outfit', sans-serif; color: var(--text-main); cursor: pointer;
}
.inline-btn:hover { border-color: var(--accent); color: var(--accent); }

.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat-card {
  background: var(--bg-light); border: 1px solid var(--border-light);
  border-radius: 10px; padding: 10px; text-align: center;
}
.stat-label { display: block; font-size: 0.62rem; color: var(--text-muted); margin-bottom: 4px; font-family: 'Outfit', sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.stat-value { font-family: 'Outfit', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--text-main); }

.empty-history { font-size: 0.72rem; padding: 12px; text-align: center; }
/* 5건이 한 번에 보이도록 max-height + 내부 스크롤.
   item 1건당 평균 높이 ≈ 72px (top + reason + by + padding) + gap 10px → 5 × (72 + 10) ≈ 410px.
   넘치면 자체 스크롤로 패널 전체가 길어지지 않게. */
.history-list {
  display: flex; flex-direction: column; gap: 10px;
  max-height: 410px;
  overflow-y: auto;
  padding-right: 4px;  /* scrollbar 가려서 마지막 글자 가리는 현상 방지 */
}
.history-list::-webkit-scrollbar { width: 4px; }
.history-list::-webkit-scrollbar-track { background: transparent; }
.history-list::-webkit-scrollbar-thumb {
  background: rgba(140, 98, 57, 0.25); border-radius: 10px;
}
.history-list::-webkit-scrollbar-thumb:hover { background: rgba(140, 98, 57, 0.4); }
.history-item {
  background: var(--bg-light); border: 1px solid var(--border-light);
  border-radius: 10px; padding: 10px 12px;
  flex-shrink: 0;  /* flex 컨테이너 안에서 압축되지 않게 — 5건 미만일 때도 높이 안정 */
}
.hist-top { display: flex; align-items: center; flex-wrap: wrap; }
.hist-when { font-size: 0.66rem; }
.hist-reason { font-size: 0.72rem; margin-top: 4px; font-style: italic; }
.hist-by { font-size: 0.66rem; margin-top: 2px; }

/* ── Subscription Dialog ────────────────────────── */
.sub-dialog { background: white; border-radius: 16px; overflow: hidden; }
.sub-dialog-header {
  display: flex; align-items: center;
  background: var(--accent); color: white; padding: 14px 18px;
  font-family: 'Outfit', sans-serif; font-weight: 800;
}
.sub-dialog-body { padding: 18px; }
.sd-target { font-size: 0.74rem; margin-bottom: 14px; }
.sd-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.sd-label { font-size: 0.7rem; color: var(--text-muted); font-family: 'Outfit', sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.sd-options { display: flex; gap: 8px; flex-wrap: wrap; }
.sd-opt {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 9999px;
  border: 1.5px solid var(--border-light);
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 700;
  cursor: pointer; user-select: none; transition: all 0.15s;
}
.sd-opt input { display: none; }
.sd-opt--active { border-color: var(--accent); background: rgba(140, 98, 57, 0.08); color: var(--accent); }
.sd-input {
  padding: 10px 12px; border: 1.5px solid var(--border-light); border-radius: 10px;
  font-size: 0.78rem; outline: none; transition: border-color 0.15s;
}
.sd-input:focus { border-color: var(--accent); }
.sub-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 0 18px 18px; }
.sd-btn {
  padding: 8px 18px; border-radius: 9999px; font-family: 'Outfit', sans-serif;
  font-weight: 700; font-size: 0.78rem; cursor: pointer; transition: all 0.15s;
}
.sd-btn--ghost { background: transparent; border: 1px solid var(--border-light); color: var(--text-main); }
.sd-btn--primary {
  background: var(--accent); color: white; border: 1px solid var(--accent);
  display: inline-flex; align-items: center;
}
.sd-btn--primary:hover:not(:disabled) { opacity: 0.9; }
.sd-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Spin ────────────────────────────────────────── */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spin { animation: spin 0.9s linear infinite; }

/* ── Scroll ─────────────────────────────────────── */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

/* ── Status chip ────────────────────────────────── */
.status-chip {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 10px;
  font-size: 0.72rem; font-weight: 600;
  font-family: 'Outfit', sans-serif;
}
.status-chip--active {
  background: rgba(34, 197, 94, 0.12); color: rgb(34, 197, 94);
}
.status-chip--suspended {
  background: rgba(239, 68, 68, 0.14); color: rgb(239, 68, 68);
}

/* ── Row action button modifiers ────────────────── */
.row-btn--suspend { color: rgb(239, 68, 68); border-color: rgba(239, 68, 68, 0.25); }
.row-btn--suspend:hover:not(:disabled) { background: rgba(239, 68, 68, 0.06); color: rgb(239, 68, 68); border-color: rgb(239, 68, 68); }
.row-btn--unsuspend { color: var(--accent, #4f46e5); border-color: rgba(79, 70, 229, 0.25); }
.row-btn--unsuspend:hover:not(:disabled) { background: rgba(79, 70, 229, 0.06); border-color: var(--accent, #4f46e5); }

/* ── Danger dialog header ───────────────────────── */
.sub-dialog-header--danger { background: rgb(185, 28, 28); }

/* ── Danger button ──────────────────────────────── */
.sd-btn--danger {
  background: rgb(185, 28, 28); color: white; border: 1px solid rgb(185, 28, 28);
  display: inline-flex; align-items: center;
}
.sd-btn--danger:hover:not(:disabled) { opacity: 0.9; }

/* ── Danger policy note ─────────────────────────── */
.sd-policy-note--danger {
  background: #fff5f5; border-color: #fecaca; color: #7f1d1d;
}

/* ── Textarea ───────────────────────────────────── */
.sd-textarea {
  padding: 10px 12px; border: 1.5px solid var(--border-light); border-radius: 10px;
  font-size: 0.78rem; outline: none; transition: border-color 0.15s;
  resize: vertical; font-family: inherit; width: 100%; box-sizing: border-box;
}
.sd-textarea:focus { border-color: var(--accent); }

/* ── Dialog hint / confirm text ─────────────────── */
.sd-confirm-text { font-size: 0.82rem; color: var(--text-main); margin: 0 0 8px; }
.sd-hint { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 8px; }

/* ── Detail suspended banner ────────────────────── */
.detail-suspended-banner {
  display: flex; flex-direction: column;
  padding: 0.5em 0.75em;
  background: rgba(239, 68, 68, 0.10); color: rgb(239, 68, 68);
  border-radius: 6px; font-size: 0.82rem; margin-bottom: 0.75em;
}
.detail-suspended-meta { margin-top: 0.4em; font-size: 0.75rem; display: flex; flex-direction: column; gap: 2px; }

/* ── Mobile ─────────────────────────────────────── */
@media (max-width: 768px) {
  .admin-grid { grid-template-columns: 1fr; }
  .user-table thead th { font-size: 0.58rem; padding: 8px; }
  .user-table td { padding: 8px; }
  .email-cell { max-width: 120px; }
  .date-cell { display: none; }
  .detail-panel { position: static; max-height: none; }
}
</style>
