<script setup>
/**
 * /admin/inquiries — 사용자 문의 관리 (admin 전용).
 *
 * [좌측 패널] 리스트 + 필터 (status 탭, 검색, 페이징)
 * [우측 패널] 선택된 문의 상세 + 답변 작성 + 상태 변경
 *
 * [핵심 동작]
 * - 답변 저장 시 자동으로 상태 'resolved' 전이 (admin 명시 안 한 경우)
 * - 답변 작성 시 사용자에게 Resend 이메일 자동 발송 (BE 처리)
 * - status 필터 + 통합 검색 (subject/body/email) + 페이징
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, MessageSquare, Loader2, AlertCircle, RefreshCw, Search,
  ChevronLeft, ChevronRight, Mail, Save, Inbox, X,
} from 'lucide-vue-next'
import { verifyToken } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import {
  fetchAdminInquiriesApi, fetchAdminInquiryStatsApi,
  fetchAdminInquiryApi, updateAdminInquiryApi,
  bulkReplyApi, applyReplyTemplate,
  INQUIRY_STATUSES, getStatusMeta, getCategoryLabel,
} from '@/utils/inquiry'

const { t } = useI18n()
const router = useRouter()
const { showSuccess, showError, showWarning } = useSnackbar() ?? {}

// ─── 통계 (상단 카드) ──────────────────────────
const stats = ref({ open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 })

const loadStats = async () => {
  const r = await fetchAdminInquiryStatsApi()
  if (r.success) stats.value = r.data
}

// ─── 리스트 + 필터 ─────────────────────────────
const STATUS_FILTERS = computed(() => [
  { value: '', label: t('admin.inquiries.filter_all') },
  { value: 'open', label: t('admin.inquiries.filter_open') },
  { value: 'in_progress', label: t('admin.inquiries.filter_in_progress') },
  { value: 'resolved', label: t('admin.inquiries.filter_resolved') },
  { value: 'closed', label: t('admin.inquiries.filter_closed') },
])

const statusFilter = ref('')
const searchInput = ref('')
const inquiries = ref([])
const checkedIds = ref([])  // 일괄 회신 체크박스 선택 (현재 페이지 기준)
const total = ref(0)
const limit = ref(50)
const offset = ref(0)
const isLoading = ref(false)
const listError = ref('')

const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const canPrev = computed(() => offset.value > 0)
const canNext = computed(() => offset.value + limit.value < total.value)

const load = async () => {
  isLoading.value = true
  listError.value = ''
  const r = await fetchAdminInquiriesApi({
    status: statusFilter.value,
    q: searchInput.value.trim(),
    limit: limit.value,
    offset: offset.value,
  })
  isLoading.value = false
  if (r.success) {
    inquiries.value = r.data?.inquiries || []
    total.value = r.data?.total || 0
    // 현재 페이지에 없는 체크는 자동 제거 (페이지/필터 이동 시 stale 선택 정리)
    const pageIds = new Set(inquiries.value.map((i) => i.id))
    checkedIds.value = checkedIds.value.filter((id) => pageIds.has(id))
  } else {
    listError.value = r.error || t('admin.inquiries.toast_list_failed')
  }
}

const onFilterChange = (value) => {
  statusFilter.value = value
  offset.value = 0
  load()
}

const onSearch = () => {
  offset.value = 0
  load()
}

const goPrev = () => {
  if (!canPrev.value) return
  offset.value = Math.max(0, offset.value - limit.value)
  load()
}
const goNext = () => {
  if (!canNext.value) return
  offset.value += limit.value
  load()
}

// ─── 선택된 문의 상세 ────────────────────────────
const selectedId = ref('')
const detail = ref(null)
const isDetailLoading = ref(false)
const detailError = ref('')

const select = async (id) => {
  selectedId.value = id
  isDetailLoading.value = true
  detailError.value = ''
  const r = await fetchAdminInquiryApi(id)
  isDetailLoading.value = false
  if (r.success) {
    detail.value = r.data
    replyForm.value.admin_reply = r.data.admin_reply || ''
    replyForm.value.status = r.data.status
  } else {
    detailError.value = r.error || t('admin.inquiries.toast_detail_failed')
    detail.value = null
  }
}

const closeDetail = () => {
  selectedId.value = ''
  detail.value = null
}

// ─── 답변/상태 폼 ────────────────────────────────
const replyForm = ref({
  status: 'open',
  admin_reply: '',
})
const isSavingReply = ref(false)
const isResending = ref(false)

// [2026-06-24] 답변 저장/재발송 후 이메일 발송 결과를 토스트로 노출 — 침묵 실패 방지(C).
const notifyEmailResult = (emailStatus, fallbackMsg) => {
  if (emailStatus === 'failed') showError?.(t('admin.inquiries.toast_email_failed'))
  else if (emailStatus === 'disabled') showWarning?.(t('admin.inquiries.toast_email_disabled'))
  else if (emailStatus === 'sent') showSuccess?.(t('admin.inquiries.toast_saved_emailed'))
  else showSuccess?.(fallbackMsg)
}

const saveReply = async () => {
  if (!selectedId.value || isSavingReply.value) return
  isSavingReply.value = true
  // [2026-06-24] status 를 보내지 않는다 — BE 가 답변 저장 시 자동으로 'resolved' 전이(closed 제외).
  // FE 가 현재 상태(접수됨)를 같이 보내 자동 전이가 무력화돼 '답변 완료'로 안 바뀌던 버그(B) 수정.
  const r = await updateAdminInquiryApi(selectedId.value, {
    admin_reply: replyForm.value.admin_reply,
  })
  isSavingReply.value = false
  if (!r.success) {
    showError?.(r.error || t('admin.inquiries.toast_save_failed'))
    return
  }
  detail.value = r.data
  replyForm.value.status = r.data.status
  notifyEmailResult(r.data.email_status, t('admin.inquiries.toast_saved'))
  await Promise.all([loadStats(), load()])
}

// 답변 메일 재발송 — 저장된 답변을 그대로 다시 발송(force_email). 첫 발송 실패/비활성 복구용(D).
const resendEmail = async () => {
  if (!selectedId.value || isResending.value) return
  isResending.value = true
  const r = await updateAdminInquiryApi(selectedId.value, { force_email: true })
  isResending.value = false
  if (!r.success) {
    showError?.(r.error || t('admin.inquiries.toast_save_failed'))
    return
  }
  detail.value = r.data
  notifyEmailResult(r.data.email_status, t('admin.inquiries.toast_saved'))
}

// ─── 빠른 상태 변경 (답변 X) ────────────────────
const quickSetStatus = async (newStatus) => {
  if (!selectedId.value) return
  const r = await updateAdminInquiryApi(selectedId.value, { status: newStatus })
  if (!r.success) {
    showError?.(r.error || t('admin.inquiries.toast_status_failed'))
    return
  }
  detail.value = r.data
  replyForm.value.status = r.data.status
  await Promise.all([loadStats(), load()])
}

// ─── 일괄 회신 (체크박스 다중 선택) ──────────────
const isChecked = (id) => checkedIds.value.includes(id)
const toggleCheck = (id) => {
  const i = checkedIds.value.indexOf(id)
  if (i >= 0) checkedIds.value.splice(i, 1)
  else checkedIds.value.push(id)
}
const allOnPageChecked = computed(
  () => inquiries.value.length > 0 && inquiries.value.every((i) => checkedIds.value.includes(i.id)),
)
const toggleCheckAll = () => {
  const pageIds = inquiries.value.map((i) => i.id)
  if (allOnPageChecked.value) {
    const set = new Set(pageIds)
    checkedIds.value = checkedIds.value.filter((id) => !set.has(id))
  } else {
    const set = new Set(checkedIds.value)
    pageIds.forEach((id) => set.add(id))
    checkedIds.value = [...set]
  }
}
const clearChecks = () => { checkedIds.value = [] }

// 일괄 답변 모달
const bulkOpen = ref(false)
const bulkTemplate = ref('')
const bulkStatus = ref('resolved')
const bulkSending = ref(false)

const openBulk = () => {
  if (checkedIds.value.length === 0) return
  bulkTemplate.value = ''
  bulkStatus.value = 'resolved'
  bulkOpen.value = true
}

// 미리보기 — 선택된 첫 건에 변수 치환 (받는 사람이 보게 될 실제 문구)
const bulkPreviewTarget = computed(
  () => inquiries.value.find((i) => checkedIds.value.includes(i.id)) || null,
)
const bulkPreview = computed(() => {
  const tgt = bulkPreviewTarget.value
  if (!tgt) return ''
  return applyReplyTemplate(bulkTemplate.value, { name: tgt.user_name, subject: tgt.subject })
})
const insertVar = (token) => { bulkTemplate.value += token }

const doBulkReply = async () => {
  if (bulkSending.value || checkedIds.value.length === 0) return
  if (!bulkTemplate.value.trim()) {
    showError?.(t('admin.inquiries.bulk_empty_template'))
    return
  }
  // 발송 직전 최종 확인 — 대량 오발송 방지 (되돌릴 수 없음)
  if (!window.confirm(t('admin.inquiries.bulk_confirm', { count: checkedIds.value.length }))) return
  bulkSending.value = true
  const r = await bulkReplyApi([...checkedIds.value], bulkTemplate.value, bulkStatus.value)
  bulkSending.value = false
  if (!r.success) {
    showError?.(r.error || t('admin.inquiries.bulk_failed'))
    return
  }
  const d = r.data || {}
  if (d.email_enabled === false) {
    showSuccess?.(t('admin.inquiries.bulk_done_no_email', { updated: d.updated || 0 }))
  } else if ((d.failed || []).length > 0) {
    showError?.(t('admin.inquiries.bulk_done_partial', { sent: d.sent || 0, failed: d.failed.length }))
  } else {
    showSuccess?.(t('admin.inquiries.bulk_done', { sent: d.sent || 0 }))
  }
  bulkOpen.value = false
  clearChecks()
  await Promise.all([loadStats(), load()])
}

// ─── helpers ─────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ')
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

// ─── 권한 + 부팅 ─────────────────────────────────
onMounted(async () => {
  const r = await verifyToken()
  if (!r.valid || !r.user?.is_admin) {
    router.replace('/plan')
    return
  }
  await Promise.all([loadStats(), load()])
})
</script>

<template>
  <div class="inq-page">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="14" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <header class="page-header">
      <h1 class="page-title">
        <MessageSquare :size="22" class="mr-2" />{{ $t('admin.inquiries.title') }}
      </h1>
      <p class="page-sub">
        {{ $t('admin.inquiries.subtitle') }}
      </p>
    </header>

    <!-- 상단 통계 카드 4개 -->
    <div class="stats-row">
      <div class="stat-card stat-card--open">
        <div class="stat-label">{{ $t('admin.inquiries.stat_open') }}</div>
        <div class="stat-value">{{ stats.open }}</div>
      </div>
      <div class="stat-card stat-card--in_progress">
        <div class="stat-label">{{ $t('admin.inquiries.stat_in_progress') }}</div>
        <div class="stat-value">{{ stats.in_progress }}</div>
      </div>
      <div class="stat-card stat-card--resolved">
        <div class="stat-label">{{ $t('admin.inquiries.stat_resolved') }}</div>
        <div class="stat-value">{{ stats.resolved }}</div>
      </div>
      <div class="stat-card stat-card--closed">
        <div class="stat-label">{{ $t('admin.inquiries.stat_closed') }}</div>
        <div class="stat-value">{{ stats.closed }}</div>
      </div>
    </div>

    <!-- 필터 + 검색 -->
    <div class="toolbar">
      <div class="filter-tabs">
        <button
          v-for="f in STATUS_FILTERS"
          :key="f.value"
          class="filter-tab"
          :class="{ 'filter-tab--active': statusFilter === f.value }"
          @click="onFilterChange(f.value)"
        >
          {{ f.label }}
        </button>
      </div>
      <div class="search-box">
        <Search :size="14" class="search-icon" />
        <input
          v-model="searchInput"
          type="text"
          class="search-input"
          :placeholder="$t('admin.inquiries.search_placeholder')"
          @keydown.enter="onSearch"
        />
      </div>
      <button class="icon-btn" @click="load" :disabled="isLoading" :title="$t('admin.inquiries.refresh_title')">
        <RefreshCw :size="14" :class="{ spin: isLoading }" />
      </button>
    </div>

    <!-- 메인 그리드 (리스트 + 상세) -->
    <div class="main-grid">
      <!-- 좌: 리스트 -->
      <section class="list-pane">
        <!-- 일괄 선택 바 -->
        <div v-if="inquiries.length > 0" class="bulk-bar">
          <label class="bulk-check-all">
            <input type="checkbox" :checked="allOnPageChecked" @change="toggleCheckAll" />
            <span>{{ $t('admin.inquiries.bulk_select_all') }}</span>
          </label>
          <template v-if="checkedIds.length > 0">
            <span class="bulk-count">{{ $t('admin.inquiries.bulk_selected', { count: checkedIds.length }) }}</span>
            <button class="bulk-action-btn" @click="openBulk">
              <Mail :size="13" class="mr-1" />{{ $t('admin.inquiries.bulk_reply_btn') }}
            </button>
            <button class="bulk-clear-btn" @click="clearChecks">{{ $t('admin.inquiries.bulk_clear') }}</button>
          </template>
        </div>

        <div v-if="listError" class="list-error">
          <AlertCircle :size="14" class="mr-1" />{{ listError }}
        </div>
        <div v-else-if="isLoading && inquiries.length === 0" class="list-loading">
          <Loader2 :size="20" class="spin mr-2" />{{ $t('admin.inquiries.list_loading') }}
        </div>
        <div v-else-if="inquiries.length === 0" class="list-empty">
          <Inbox :size="28" class="empty-icon" />
          <p>{{ $t('admin.inquiries.list_empty') }}</p>
        </div>

        <ul v-else class="inq-list">
          <li
            v-for="inq in inquiries"
            :key="inq.id"
            class="inq-row"
            :class="{ 'inq-row--active': selectedId === inq.id, 'inq-row--checked': isChecked(inq.id) }"
            @click="select(inq.id)"
          >
            <div class="inq-row-top">
              <label class="inq-check" @click.stop>
                <input type="checkbox" :checked="isChecked(inq.id)" @change="toggleCheck(inq.id)" />
              </label>
              <span
                class="inq-status-pill"
                :style="{ background: getStatusMeta(inq.status).color }"
              >{{ inq.status_label }}</span>
              <span class="inq-row-cat">{{ inq.category_label }}</span>
              <span class="inq-row-date">{{ fmtDate(inq.created_at) }}</span>
            </div>
            <p class="inq-row-subject">{{ inq.subject }}</p>
            <p class="inq-row-meta">
              <Mail :size="11" class="mr-1" />{{ inq.user_email }}
            </p>
          </li>
        </ul>

        <!-- 페이징 -->
        <div v-if="total > limit" class="pagination">
          <button class="page-btn" :disabled="!canPrev || isLoading" @click="goPrev">
            <ChevronLeft :size="13" />{{ $t('common.guide.prev') }}
          </button>
          <span class="page-info">{{ $t('admin.inquiries.page_info', { current: currentPage, total: totalPages, count: total }) }}</span>
          <button class="page-btn" :disabled="!canNext || isLoading" @click="goNext">
            {{ $t('common.guide.next') }}<ChevronRight :size="13" />
          </button>
        </div>
      </section>

      <!-- 우: 상세 + 답변 -->
      <aside class="detail-pane" :class="{ 'detail-pane--open': !!selectedId }">
        <div v-if="!selectedId" class="detail-empty">
          <MessageSquare :size="20" class="mb-2 text-muted" />
          <span class="text-caption text-muted">{{ $t('admin.inquiries.detail_empty') }}</span>
        </div>
        <template v-else>
          <div class="detail-header">
            <span class="detail-id">#{{ selectedId.slice(0, 8) }}</span>
            <button class="icon-btn" @click="closeDetail" :aria-label="$t('common.action.close')"><X :size="14" /></button>
          </div>

          <div v-if="isDetailLoading" class="detail-loading">
            <Loader2 :size="20" class="spin text-muted" />
          </div>
          <div v-else-if="detailError" class="detail-error">
            <AlertCircle :size="14" class="mr-1" />{{ detailError }}
          </div>
          <div v-else-if="detail" class="detail-body">
            <!-- 메타 -->
            <div class="detail-meta-grid">
              <div class="meta-item">
                <span class="meta-label">{{ $t('admin.inquiries.meta_status') }}</span>
                <span
                  class="meta-status-pill"
                  :style="{ background: getStatusMeta(detail.status).color }"
                >{{ detail.status_label }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">{{ $t('admin.inquiries.meta_category') }}</span>
                <span class="meta-value">{{ detail.category_label }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">{{ $t('admin.inquiries.meta_user') }}</span>
                <span class="meta-value mono-text">{{ detail.user_email }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">{{ $t('admin.inquiries.meta_created') }}</span>
                <span class="meta-value">{{ fmtDate(detail.created_at) }}</span>
              </div>
            </div>

            <!-- 빠른 상태 변경 -->
            <div class="quick-status-row">
              <span class="quick-label">{{ $t('admin.inquiries.quick_status_label') }}</span>
              <button
                v-for="(meta, value) in INQUIRY_STATUSES"
                :key="value"
                class="quick-status-btn"
                :class="{ 'quick-status-btn--active': detail.status === value }"
                :style="detail.status === value ? { background: meta.color, color: 'white' } : null"
                @click="quickSetStatus(value)"
              >
                {{ meta.label }}
              </button>
            </div>

            <!-- 사용자 원문 -->
            <div class="detail-section">
              <div class="section-header">
                <span class="section-title">{{ detail.subject }}</span>
              </div>
              <p class="detail-text">{{ detail.body }}</p>
            </div>

            <!-- 답변 폼 -->
            <div class="detail-section">
              <div class="section-header">
                <span class="section-title">{{ $t('admin.inquiries.admin_reply') }}</span>
                <span v-if="detail.admin_replied_at" class="reply-meta">
                  {{ detail.admin_replied_by }} · {{ fmtDate(detail.admin_replied_at) }}
                </span>
              </div>
              <textarea
                v-model="replyForm.admin_reply"
                class="reply-textarea"
                :placeholder="$t('admin.inquiries.reply_placeholder')"
                rows="6"
                maxlength="5000"
              ></textarea>
              <span class="char-count">{{ $t('admin.inquiries.char_count', { count: replyForm.admin_reply.length }) }}</span>

              <div class="reply-actions">
                <span class="reply-hint">
                  {{ $t('admin.inquiries.reply_hint') }}
                </span>
                <button
                  v-if="detail.admin_replied_at"
                  class="reply-resend-btn"
                  :disabled="isResending || isSavingReply"
                  :title="$t('admin.inquiries.reply_resend_title')"
                  @click="resendEmail"
                >
                  <Loader2 v-if="isResending" :size="13" class="spin mr-1" />
                  <Mail v-else :size="13" class="mr-1" />
                  {{ $t('admin.inquiries.reply_resend') }}
                </button>
                <button
                  class="reply-save-btn"
                  :disabled="isSavingReply"
                  @click="saveReply"
                >
                  <Loader2 v-if="isSavingReply" :size="13" class="spin mr-1" />
                  <Save v-else :size="13" class="mr-1" />
                  {{ isSavingReply ? $t('admin.inquiries.reply_saving') : $t('admin.inquiries.reply_save') }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </aside>
    </div>

    <!-- 일괄 답변 모달 -->
    <v-dialog v-model="bulkOpen" max-width="560" persistent>
      <div class="bulk-dialog">
        <div class="bulk-dialog-header">
          <Mail :size="18" class="mr-2" />
          <span>{{ $t('admin.inquiries.bulk_modal_title', { count: checkedIds.length }) }}</span>
        </div>
        <div class="bulk-dialog-body">
          <p class="bulk-hint">{{ $t('admin.inquiries.bulk_modal_hint') }}</p>
          <!-- 변수 칩 -->
          <div class="bulk-vars">
            <span class="bulk-vars-label">{{ $t('admin.inquiries.bulk_vars_label') }}</span>
            <button type="button" class="var-chip" @click="insertVar('{이름}')">{이름}</button>
            <button type="button" class="var-chip" @click="insertVar('{제목}')">{제목}</button>
          </div>
          <textarea
            v-model="bulkTemplate"
            class="bulk-textarea"
            rows="5"
            maxlength="5000"
            :placeholder="$t('admin.inquiries.bulk_placeholder')"
          ></textarea>
          <!-- 적용 상태 -->
          <div class="bulk-status-row">
            <span class="bulk-status-label">{{ $t('admin.inquiries.bulk_status_label') }}</span>
            <select v-model="bulkStatus" class="bulk-status-select">
              <option v-for="(meta, val) in INQUIRY_STATUSES" :key="val" :value="val">{{ meta.label }}</option>
            </select>
          </div>
          <!-- 미리보기 (선택 1건에 변수 치환) -->
          <div v-if="bulkPreviewTarget" class="bulk-preview">
            <div class="bulk-preview-label">
              {{ $t('admin.inquiries.bulk_preview_label', { name: bulkPreviewTarget.user_name || bulkPreviewTarget.user_email }) }}
            </div>
            <p class="bulk-preview-text">{{ bulkPreview || $t('admin.inquiries.bulk_preview_empty') }}</p>
          </div>
        </div>
        <div class="bulk-dialog-actions">
          <button class="bulk-btn bulk-btn--ghost" :disabled="bulkSending" @click="bulkOpen = false">
            {{ $t('common.action.cancel') }}
          </button>
          <button
            class="bulk-btn bulk-btn--primary"
            :disabled="bulkSending || !bulkTemplate.trim()"
            @click="doBulkReply"
          >
            <Loader2 v-if="bulkSending" :size="13" class="spin mr-1" />
            {{ bulkSending ? $t('admin.inquiries.bulk_sending') : $t('admin.inquiries.bulk_send', { count: checkedIds.length }) }}
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<style scoped>
.inq-page {
  padding: 24px var(--page-pad-x, 32px);
  max-width: 1600px;
  margin: 0 auto;
  font-family: 'Pretendard', sans-serif;
}
@media (max-width: 600px) { .inq-page { padding: 16px; } }

.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent;
  border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  color: var(--text-main, #2A2421);
  padding: 6px 12px; border-radius: 8px;
  font-size: 0.8rem; cursor: pointer;
  margin-bottom: 18px;
  font-family: inherit;
}
.back-btn:hover { background: rgba(0,0,0,0.04); }

.page-header { margin-bottom: 20px; }
.page-title {
  display: flex; align-items: center;
  font-size: 1.4rem; font-weight: 800;
  color: var(--text-main, #2A2421);
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}
.page-sub { font-size: 0.85rem; color: var(--text-muted, #6F665F); margin: 0; line-height: 1.6; }

/* ─── 통계 ─── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}
@media (max-width: 768px) { .stats-row { grid-template-columns: 1fr 1fr; } }
.stat-card {
  background: white;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 10px;
  padding: 12px 14px;
}
.stat-card--open { border-top: 3px solid #0ea5e9; }
.stat-card--in_progress { border-top: 3px solid #f59e0b; }
.stat-card--resolved { border-top: 3px solid #10b981; }
.stat-card--closed { border-top: 3px solid #6b7280; }
.stat-label {
  font-size: 0.7rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.stat-value {
  font-size: 1.5rem; font-weight: 800;
  color: var(--text-main, #2A2421);
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}

/* ─── 툴바 ─── */
.toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.filter-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-tab {
  background: white;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  color: var(--text-main, #2A2421);
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 0.75rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: all 0.12s;
}
.filter-tab:hover { border-color: var(--accent, #8C6239); }
.filter-tab--active {
  background: var(--accent, #8C6239);
  border-color: var(--accent, #8C6239);
  color: white;
}
.search-box {
  flex: 1; min-width: 200px;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  border-radius: 8px;
  padding: 6px 10px;
  background: white;
}
.search-icon { color: var(--text-muted); flex-shrink: 0; }
.search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 0.85rem; font-family: inherit;
  min-width: 0;
}
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  color: var(--text-muted);
  padding: 6px; border-radius: 6px; cursor: pointer;
}
.icon-btn:hover:not(:disabled) { background: rgba(0,0,0,0.05); }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ─── 메인 그리드 ─── */
.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
}
@media (max-width: 1024px) {
  .main-grid { grid-template-columns: 1fr; }
  .detail-pane { display: none; }
  .detail-pane--open { display: block; }
}

.list-pane, .detail-pane {
  background: white;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px;
  padding: 14px;
  min-height: 400px;
}

.list-error, .list-loading, .list-empty {
  display: flex; align-items: center; justify-content: center;
  padding: 40px 20px;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.list-error { background: #fef2f2; color: #b91c1c; border-radius: 8px; }
.list-empty { flex-direction: column; }
.empty-icon { color: var(--text-muted); opacity: 0.4; margin-bottom: 8px; }

.inq-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.inq-row {
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.12s;
}
.inq-row:hover { border-color: var(--accent, #8C6239); background: rgba(140, 98, 57, 0.02); }
.inq-row--active { border-color: var(--accent, #8C6239); background: rgba(140, 98, 57, 0.05); }
.inq-row-top {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.7rem; color: var(--text-muted);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.inq-status-pill {
  display: inline-block; padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.62rem; font-weight: 700;
  color: white;
}
.inq-row-cat { font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.6rem; }
.inq-row-date { margin-left: auto; font-variant-numeric: tabular-nums; }
.inq-row-subject {
  font-size: 0.88rem; font-weight: 700;
  color: var(--text-main, #2A2421);
  margin: 0 0 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.inq-row-meta {
  display: inline-flex; align-items: center;
  font-size: 0.7rem; color: var(--text-muted);
  margin: 0;
}

.pagination {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin-top: 14px;
}
.page-btn {
  display: inline-flex; align-items: center;
  background: white;
  border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  padding: 6px 12px; border-radius: 8px;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.page-btn:hover:not(:disabled) { background: rgba(0,0,0,0.04); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 0.78rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }

/* ─── 상세 패널 ─── */
.detail-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.detail-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.08));
}
.detail-id {
  font-family: 'Outfit', monospace;
  font-size: 0.75rem; font-weight: 700;
  color: var(--text-muted);
}
.detail-loading { display: flex; align-items: center; padding: 30px; color: var(--text-muted); }
.detail-error {
  display: inline-flex; align-items: center;
  background: #fef2f2; color: #b91c1c;
  border-radius: 8px; padding: 10px 12px;
  font-size: 0.85rem;
}

.detail-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-light, #F7F5EB);
  border-radius: 8px;
}
.meta-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.meta-label {
  font-size: 0.65rem; font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.meta-value {
  font-size: 0.82rem;
  color: var(--text-main, #2A2421);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mono-text { font-family: 'Outfit', monospace; }
.meta-status-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 0.7rem; font-weight: 700;
  color: white;
  width: fit-content;
}

.quick-status-row {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.quick-label {
  font-size: 0.75rem; font-weight: 700;
  color: var(--text-muted);
}
.quick-status-btn {
  background: white;
  border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  color: var(--text-main, #2A2421);
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 0.7rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.quick-status-btn:hover { background: rgba(0,0,0,0.04); }

.detail-section { margin-bottom: 18px; }
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
  gap: 8px;
  flex-wrap: wrap;
}
.section-title {
  font-size: 0.95rem; font-weight: 800;
  color: var(--text-main, #2A2421);
  line-height: 1.4;
}
.reply-meta {
  font-size: 0.7rem; color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.detail-text {
  font-size: 0.85rem;
  color: var(--text-main, #2A2421);
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0;
  padding: 12px;
  background: var(--bg-light, #F7F5EB);
  border-radius: 8px;
}

.reply-textarea {
  width: 100%; box-sizing: border-box;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--text-main, #2A2421);
  outline: none;
  resize: vertical;
  min-height: 120px;
  line-height: 1.7;
}
.reply-textarea:focus { border-color: var(--accent, #8C6239); }
.char-count {
  display: block; text-align: right;
  font-size: 0.7rem; color: var(--text-muted);
  margin-top: 4px;
}

.reply-actions {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-top: 10px;
  flex-wrap: wrap;
}
.reply-hint { font-size: 0.72rem; color: var(--text-muted); flex: 1; min-width: 200px; }
.reply-save-btn {
  display: inline-flex; align-items: center;
  background: var(--accent, #8C6239);
  color: white;
  border: none; border-radius: 8px;
  padding: 9px 14px;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.reply-save-btn:hover:not(:disabled) { transform: translateY(-1px); }
.reply-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.reply-resend-btn {
  display: inline-flex; align-items: center;
  background: white; color: var(--accent, #8C6239);
  border: 1px solid var(--accent, #8C6239); border-radius: 8px;
  padding: 9px 14px;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.reply-resend-btn:hover:not(:disabled) { background: rgba(140, 98, 57, 0.06); }
.reply-resend-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.text-muted { color: var(--text-muted); }
.text-caption { font-size: 0.78rem; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.mr-1 { margin-right: 4px; }
.mr-2 { margin-right: 6px; }
.mb-2 { margin-bottom: 6px; }

/* ─── 일괄 선택 바 ─── */
.bulk-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; margin-bottom: 10px;
  background: var(--bg-light, #F7F5EB);
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 8px;
  flex-wrap: wrap;
}
.bulk-check-all {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.78rem; font-weight: 700; color: var(--text-main, #2A2421);
  cursor: pointer; user-select: none;
}
.bulk-check-all input, .inq-check input {
  width: 15px; height: 15px; cursor: pointer;
  accent-color: var(--accent, #8C6239);
}
.bulk-count {
  font-size: 0.75rem; font-weight: 700; color: var(--accent, #8C6239);
  margin-left: auto;
}
.bulk-action-btn {
  display: inline-flex; align-items: center;
  background: var(--accent, #8C6239); color: white;
  border: none; border-radius: 9999px;
  padding: 6px 14px; font-size: 0.74rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.bulk-action-btn:hover { transform: translateY(-1px); }
.bulk-clear-btn {
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  color: var(--text-muted); border-radius: 9999px;
  padding: 6px 12px; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.bulk-clear-btn:hover { background: rgba(0,0,0,0.04); }

/* ─── 행 체크박스 ─── */
.inq-check {
  display: inline-flex; align-items: center;
  margin-right: 2px; cursor: pointer;
}
.inq-row--checked {
  border-color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.06);
}

/* ─── 일괄 답변 모달 ─── */
.bulk-dialog { background: white; border-radius: 16px; overflow: hidden; }
.bulk-dialog-header {
  display: flex; align-items: center;
  background: var(--accent, #8C6239); color: white; padding: 14px 18px;
  font-weight: 800;
}
.bulk-dialog-body { padding: 18px; }
.bulk-hint {
  font-size: 0.78rem; color: var(--text-muted); line-height: 1.6;
  margin: 0 0 14px;
}
.bulk-vars { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.bulk-vars-label { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); }
.var-chip {
  background: rgba(140, 98, 57, 0.10); color: var(--accent, #8C6239);
  border: 1px solid rgba(140, 98, 57, 0.25); border-radius: 9999px;
  padding: 3px 10px; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; font-family: 'Outfit', monospace;
}
.var-chip:hover { background: rgba(140, 98, 57, 0.18); }
.bulk-textarea {
  width: 100%; box-sizing: border-box;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px; padding: 10px 12px;
  font-size: 0.85rem; font-family: inherit; line-height: 1.7;
  color: var(--text-main, #2A2421); outline: none; resize: vertical;
  min-height: 110px;
}
.bulk-textarea:focus { border-color: var(--accent, #8C6239); }
.bulk-status-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.bulk-status-label { font-size: 0.74rem; font-weight: 700; color: var(--text-muted); }
.bulk-status-select {
  border: 1px solid var(--border-light, rgba(0,0,0,0.12)); border-radius: 8px;
  padding: 6px 10px; font-size: 0.8rem; font-family: inherit;
  color: var(--text-main, #2A2421); background: white; cursor: pointer; outline: none;
}
.bulk-status-select:focus { border-color: var(--accent, #8C6239); }
.bulk-preview {
  margin-top: 14px; padding: 12px;
  background: var(--bg-light, #F7F5EB); border-radius: 8px;
  border: 1px dashed var(--border-light, rgba(0,0,0,0.15));
}
.bulk-preview-label {
  font-size: 0.7rem; font-weight: 700; color: var(--text-muted);
  margin-bottom: 6px;
}
.bulk-preview-text {
  font-size: 0.84rem; color: var(--text-main, #2A2421);
  line-height: 1.7; white-space: pre-wrap; margin: 0;
}
.bulk-dialog-actions {
  display: flex; justify-content: flex-end; gap: 8px; padding: 0 18px 18px;
}
.bulk-btn {
  display: inline-flex; align-items: center;
  padding: 9px 18px; border-radius: 9999px;
  font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit;
}
.bulk-btn--ghost { background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.12)); color: var(--text-main, #2A2421); }
.bulk-btn--primary { background: var(--accent, #8C6239); color: white; border: 1px solid var(--accent, #8C6239); }
.bulk-btn--primary:hover:not(:disabled) { opacity: 0.92; }
.bulk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
