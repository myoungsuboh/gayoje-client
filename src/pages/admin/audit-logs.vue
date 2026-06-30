<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, Search, ChevronLeft, ChevronRight, History, Loader2,
  AlertCircle, RefreshCw, Crown,
} from 'lucide-vue-next'
import { listAuditLogsApi } from '@/utils/admin'
import { verifyToken } from '@/utils/auth'

const { t } = useI18n()
const router = useRouter()

const searchInput = ref('')
const logs = ref([])
const total = ref(0)
const limit = ref(50)
const offset = ref(0)
const isLoading = ref(false)
const listError = ref('')

// ─── [2026-06-24] 기간 조회 — 프리셋 칩 + 직접선택(커스텀 범위) ──────────────
// 기본 = 오늘 포함 최근 30일. 'YYYY-MM-DD'(로컬) → BE 엔 UTC ISO 경계로 변환.
const _ymd = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const _todayYmd = () => _ymd(new Date())
const _daysAgoYmd = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return _ymd(d)
}

// 프리셋: 오늘 / 최근 7·30·90일 / 전체(필터 해제).
const PRESETS = [
  { key: 'today', days: 0 },
  { key: 'd7', days: 7 },
  { key: 'd30', days: 30 },
  { key: 'd90', days: 90 },
  { key: 'all', days: null },
]
const presetLabel = (p) => {
  if (p.key === 'today') return t('admin.audit_logs.range_today')
  if (p.key === 'all') return t('admin.audit_logs.range_all')
  return t('admin.audit_logs.range_last_days', { n: p.days })
}

const rangeMode = ref('d30')      // 활성 프리셋 키 | 'custom'
const customOpen = ref(false)     // '직접 선택' 펼침 여부
// 기본값: 오늘 포함 최근 30일.
const fromDate = ref(_daysAgoYmd(30))
const toDate = ref(_todayYmd())

// 로컬 날짜(YYYY-MM-DD)를 UTC ISO 경계로 — from=그날 00:00, to=다음날 00:00(BE '< to_date' → 끝날 포함).
const toUtcStart = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toISOString() : '')
const toUtcNextDay = (ymd) => {
  if (!ymd) return ''
  const d = new Date(`${ymd}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

const load = async () => {
  isLoading.value = true
  listError.value = ''
  const res = await listAuditLogsApi({
    q: searchInput.value.trim(),
    limit: limit.value,
    offset: offset.value,
    fromDate: toUtcStart(fromDate.value),
    toDate: toUtcNextDay(toDate.value),
  })
  isLoading.value = false
  if (!res.success) {
    listError.value = res.error
    return
  }
  logs.value = res.logs || []
  total.value = res.total || 0
}

const onSearch = () => {
  offset.value = 0
  load()
}

// 프리셋 칩 — 날짜 세팅 후 재조회. '전체'는 날짜 비워 필터 해제.
const applyPreset = (p) => {
  rangeMode.value = p.key
  customOpen.value = false
  if (p.key === 'all') {
    fromDate.value = ''
    toDate.value = ''
  } else if (p.key === 'today') {
    fromDate.value = _todayYmd()
    toDate.value = _todayYmd()
  } else {
    fromDate.value = _daysAgoYmd(p.days)
    toDate.value = _todayYmd()
  }
  onSearch()
}

// '직접 선택' — 커스텀 날짜 입력 펼침(현재 범위 유지). 날짜 변경 시 custom 모드로 재조회.
const openCustom = () => {
  customOpen.value = true
  rangeMode.value = 'custom'
}
const onCustomDateChange = () => {
  rangeMode.value = 'custom'
  onSearch()
}

const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const canPrev = computed(() => offset.value > 0)
const canNext = computed(() => offset.value + limit.value < total.value)

const goPrev = () => { if (canPrev.value) { offset.value -= limit.value; load() } }
const goNext = () => { if (canNext.value) { offset.value += limit.value; load() } }

const formatDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' }) }
  catch { return iso }
}

const actionLabel = (action) => {
  const map = {
    subscription_change: t('admin.audit_logs.action_subscription_change'),
    admin_grant: t('admin.audit_logs.action_admin_grant'),
    admin_revoke: t('admin.audit_logs.action_admin_revoke'),
  }
  return map[action] || action
}

const actionClass = (action) => {
  if (action === 'admin_grant') return 'tag--grant'
  if (action === 'admin_revoke') return 'tag--revoke'
  if (action === 'subscription_change') return 'tag--sub'
  return ''
}

const payloadSummary = (log) => {
  const p = log.payload || {}
  if (log.action === 'subscription_change') {
    const reason = p.reason ? ` · "${p.reason}"` : ''
    return `${p.from_type || '?'} → ${p.to_type || '?'}${reason}`
  }
  if (log.action === 'admin_grant' || log.action === 'admin_revoke') {
    return p.is_admin === true ? t('admin.audit_logs.payload_grant') : t('admin.audit_logs.payload_revoke')
  }
  // 알 수 없는 action — JSON dump (best-effort)
  try { return JSON.stringify(p) } catch { return '' }
}

onMounted(async () => {
  const r = await verifyToken()
  if (!r.valid || !r.user?.is_admin) {
    router.replace('/plan')
    return
  }
  load()
})
</script>

<template>
  <div class="page-root audit-page">
    <button class="back-btn" @click="router.push('/admin')">
      <ArrowLeft :size="16" />
      <span>{{ $t('admin.audit_logs.back_home') }}</span>
    </button>

    <div class="d-flex align-center mb-1">
      <History :size="20" class="mr-2 text-accent" />
      <h2 class="text-h4 font-weight-bold text-main">{{ $t('admin.audit_logs.title') }}</h2>
    </div>
    <p class="text-muted text-body-2 mb-6">{{ $t('admin.audit_logs.subtitle') }}</p>

    <!-- Toolbar -->
    <div class="audit-toolbar">
      <div class="search-wrap">
        <Search :size="14" class="search-icon" />
        <input
          v-model="searchInput"
          class="search-input"
          :placeholder="$t('admin.audit_logs.search_placeholder')"
          @keydown.enter="onSearch"
        />
      </div>
      <button class="tool-btn" @click="load" :disabled="isLoading">
        <Loader2 v-if="isLoading" :size="13" class="spin" />
        <RefreshCw v-else :size="13" />
        <span>{{ $t('common.action.refresh') }}</span>
      </button>
      <span class="total-count">{{ $t('admin.audit_logs.total', { count: total }) }}</span>
    </div>

    <!-- [2026-06-24] 기간 프리셋 칩 + 직접선택(커스텀 날짜) -->
    <div class="range-bar">
      <span class="range-label">{{ $t('admin.audit_logs.range_label') }}</span>
      <button
        v-for="p in PRESETS"
        :key="p.key"
        type="button"
        class="range-chip"
        :class="{ 'is-active': rangeMode === p.key }"
        @click="applyPreset(p)"
      >{{ presetLabel(p) }}</button>
      <button
        type="button"
        class="range-chip range-chip--custom"
        :class="{ 'is-active': rangeMode === 'custom' }"
        @click="openCustom"
      >{{ $t('admin.audit_logs.range_custom') }}</button>
      <span v-if="customOpen" class="date-range">
        <input
          type="date"
          v-model="fromDate"
          class="date-input"
          :max="toDate || undefined"
          :aria-label="$t('admin.audit_logs.date_from')"
          @change="onCustomDateChange"
        />
        <span class="date-sep">~</span>
        <input
          type="date"
          v-model="toDate"
          class="date-input"
          :min="fromDate || undefined"
          :aria-label="$t('admin.audit_logs.date_to')"
          @change="onCustomDateChange"
        />
      </span>
    </div>

    <!-- Table -->
    <div class="audit-table-wrap">
      <div v-if="listError" class="list-error">
        <AlertCircle :size="14" class="mr-2" />{{ listError }}
      </div>
      <table v-else class="audit-table">
        <thead>
          <tr>
            <th>{{ $t('admin.audit_logs.col_time') }}</th>
            <th>{{ $t('admin.audit_logs.col_action') }}</th>
            <th>{{ $t('admin.audit_logs.col_actor') }}</th>
            <th>{{ $t('admin.audit_logs.col_target') }}</th>
            <th>{{ $t('admin.audit_logs.col_detail') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!isLoading && logs.length === 0">
            <td colspan="5" class="empty-row">{{ $t('admin.audit_logs.empty') }}</td>
          </tr>
          <tr v-for="log in logs" :key="log.id">
            <td class="date-cell text-muted mono-text">{{ formatDate(log.created_at) }}</td>
            <td>
              <span class="action-tag" :class="actionClass(log.action)">{{ actionLabel(log.action) }}</span>
            </td>
            <td class="email-cell mono-text">
              <Crown :size="11" class="mr-1 text-muted" />{{ log.actor_email }}
            </td>
            <td class="email-cell mono-text">{{ log.target_email || '—' }}</td>
            <td class="payload-cell">{{ payloadSummary(log) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="total > limit" class="pagination-row">
        <button class="page-btn" :disabled="!canPrev || isLoading" @click="goPrev">
          <ChevronLeft :size="13" />{{ $t('common.guide.prev') }}
        </button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="!canNext || isLoading" @click="goNext">
          {{ $t('common.guide.next') }}<ChevronRight :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audit-page { padding: 24px var(--page-pad-x, 32px); }
.mono-text { font-family: 'IBM Plex Mono', monospace; }
.text-accent { color: var(--accent); }

.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); font-size: 0.78rem; padding: 6px 0; margin-bottom: 16px;
}
.back-btn:hover { color: var(--text-main); }

.audit-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.search-wrap {
  display: flex; align-items: center; gap: 6px;
  background: white; border: 1.5px solid var(--border-light);
  border-radius: 10px; padding: 0 10px; flex: 1; min-width: 200px;
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
}
.tool-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.total-count { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.72rem; color: var(--text-muted); }

/* [2026-06-24] 기간 프리셋 칩 + 직접선택(커스텀 날짜) */
.range-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-bottom: 18px;
}
.range-label {
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 700;
  color: var(--text-muted); margin-right: 4px;
}
.range-chip {
  padding: 6px 14px; border-radius: 9999px;
  border: 1px solid var(--border-light); background: white;
  font-family: 'Outfit', sans-serif; font-size: 0.74rem; font-weight: 700;
  color: var(--text-main); cursor: pointer; transition: all 0.15s;
}
.range-chip:hover { border-color: var(--accent); color: var(--accent); }
.range-chip.is-active {
  background: var(--accent, #8C6239); border-color: var(--accent, #8C6239); color: #fff;
}
.range-chip--custom { border-style: dashed; }
.range-chip--custom.is-active { border-style: solid; }
.date-range {
  display: inline-flex; align-items: center; gap: 6px; margin-left: 4px;
  background: white; border: 1.5px solid var(--border-light);
  border-radius: 10px; padding: 3px 8px;
}
.date-range:focus-within { border-color: var(--accent); }
.date-input {
  border: none; outline: none; background: transparent;
  font-size: 0.74rem; color: var(--text-main);
  font-family: 'IBM Plex Mono', monospace; cursor: pointer;
}
.date-sep { color: var(--text-muted); font-size: 0.74rem; }

.audit-table-wrap {
  background: white; border: 1px solid var(--border-light); border-radius: 16px;
  overflow: auto;
}
.audit-table { width: 100%; border-collapse: collapse; font-size: 0.76rem; }
.audit-table thead th {
  position: sticky; top: 0; background: var(--bg-light);
  padding: 10px 12px; text-align: left; font-family: 'Outfit', sans-serif;
  font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
}
.audit-table tbody tr { border-bottom: 1px solid var(--border-light); }
.audit-table tbody tr:hover { background: var(--bg-light); }
.audit-table td { padding: 10px 12px; vertical-align: middle; }
.date-cell { font-size: 0.68rem; white-space: nowrap; }
.email-cell { font-size: 0.7rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.payload-cell { font-size: 0.72rem; color: var(--text-main); }
.empty-row { text-align: center; padding: 24px; color: var(--text-muted); }

.action-tag {
  display: inline-flex; align-items: center;
  padding: 2px 10px; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(140, 98, 57, 0.08); color: var(--accent);
  border: 1px solid rgba(140, 98, 57, 0.2);
}
.tag--grant { background: rgba(46, 64, 54, 0.08); color: var(--primary-moss); border-color: rgba(46, 64, 54, 0.2); }
.tag--revoke { background: rgba(185, 28, 28, 0.08); color: #B91C1C; border-color: rgba(185, 28, 28, 0.25); }
.tag--sub { background: rgba(140, 98, 57, 0.1); color: var(--accent); }

.list-error { display: flex; align-items: center; padding: 16px; color: #B91C1C; font-size: 0.78rem; }

.pagination-row {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 14px; border-top: 1px solid var(--border-light); background: var(--bg-light);
}
.page-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 9999px;
  border: 1px solid var(--border-light); background: white;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--text-main); cursor: pointer;
}
.page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; color: var(--text-muted); }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spin { animation: spin 0.9s linear infinite; }
</style>
