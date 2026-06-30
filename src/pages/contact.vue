<script setup>
/**
 * /contact — 사용자 문의 작성 + 내 문의 이력 + 답변 확인.
 *
 * [구조]
 * 좌측: 새 문의 작성 폼 (카테고리, 제목, 본문)
 * 우측: 내 문의 이력 (최신순) — 클릭 시 본문/답변 확장
 *
 * [Deep link]
 * /contact?id=xxx 로 진입 시 해당 문의 자동 펼침 (이메일 링크에서 옴).
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import {
  ArrowLeft, MessageSquare, Send, Loader2, AlertCircle, CheckCircle2,
  RefreshCw, ChevronDown, ChevronUp, Reply, Inbox,
} from 'lucide-vue-next'
import { useSnackbar } from '@/composables/useSnackbar'
import {
  createInquiryApi, fetchMyInquiriesApi,
  INQUIRY_CATEGORIES, getStatusMeta, getCategoryLabel,
} from '@/utils/inquiry'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { mdAndDown } = useDisplay()
const { showSuccess, showError } = useSnackbar() ?? {}

// ─── 작성 폼 ─────────────────────────────────────
const form = ref({
  category: 'general',
  subject: '',
  body: '',
})
const isSubmitting = ref(false)
const formError = ref('')

const canSubmit = computed(() => {
  return (
    form.value.category &&
    form.value.subject.trim().length > 0 &&
    form.value.body.trim().length > 0 &&
    !isSubmitting.value
  )
})

const submit = async () => {
  if (!canSubmit.value) return
  formError.value = ''
  isSubmitting.value = true
  const r = await createInquiryApi({
    category: form.value.category,
    subject: form.value.subject.trim(),
    body: form.value.body.trim(),
  })
  isSubmitting.value = false
  if (!r.success) {
    formError.value = r.error || t('contact.page.toast_submit_failed')
    if (r.status === 429) {
      formError.value = t('contact.page.toast_rate_limited')
    }
    return
  }
  showSuccess?.(t('contact.page.toast_submitted'))
  // 폼 초기화
  form.value = { category: 'general', subject: '', body: '' }
  // 목록 갱신
  await loadInquiries()
}

// ─── 내 문의 이력 ────────────────────────────────
const inquiries = ref([])
const isLoading = ref(false)
const errorMsg = ref('')
const expandedId = ref('')

const loadInquiries = async () => {
  isLoading.value = true
  errorMsg.value = ''
  const r = await fetchMyInquiriesApi()
  isLoading.value = false
  if (r.success) {
    inquiries.value = r.data?.inquiries || []
  } else {
    errorMsg.value = r.error || t('contact.page.toast_list_failed')
  }
}

const toggleExpand = (id) => {
  expandedId.value = expandedId.value === id ? '' : id
}

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

// ─── deep link (?id=xxx) ─────────────────────────
const expandDeepLink = () => {
  const id = String(route.query.id || '')
  if (id) expandedId.value = id
}

onMounted(async () => {
  await loadInquiries()
  expandDeepLink()
})

watch(() => route.query.id, () => expandDeepLink())
</script>

<template>
  <div class="contact-page">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="14" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <header class="page-header">
      <h1 class="page-title">
        <MessageSquare :size="22" class="mr-2" />{{ $t('contact.page.title') }}
      </h1>
      <p class="page-sub">
        {{ $t('contact.page.subtitle') }}
      </p>
    </header>

    <div class="contact-grid" :class="{ 'contact-grid--stack': mdAndDown }">
      <!-- ─── 좌: 작성 폼 ────────────────────────── -->
      <section class="contact-card">
        <h2 class="card-title">
          <Send :size="16" class="mr-2" />{{ $t('contact.page.new_inquiry') }}
        </h2>

        <form class="contact-form" @submit.prevent="submit">
          <!-- 카테고리 -->
          <div class="form-field">
            <label class="form-label">{{ $t('contact.page.category') }}</label>
            <div class="category-grid">
              <label
                v-for="cat in INQUIRY_CATEGORIES"
                :key="cat.value"
                class="category-radio"
                :class="{ 'category-radio--active': form.category === cat.value }"
              >
                <input
                  type="radio"
                  v-model="form.category"
                  :value="cat.value"
                  :disabled="isSubmitting"
                />
                <div class="category-content">
                  <strong>{{ cat.label }}</strong>
                  <small>{{ cat.desc }}</small>
                </div>
              </label>
            </div>
          </div>

          <!-- 제목 -->
          <div class="form-field">
            <label class="form-label">{{ $t('contact.page.subject') }} <span class="required">*</span></label>
            <input
              v-model="form.subject"
              type="text"
              class="form-input"
              :placeholder="$t('contact.page.subject_placeholder')"
              maxlength="200"
              :disabled="isSubmitting"
              required
            />
            <span class="form-hint">{{ $t('contact.page.subject_hint', { count: form.subject.length }) }}</span>
          </div>

          <!-- 본문 -->
          <div class="form-field">
            <label class="form-label">{{ $t('contact.page.body') }} <span class="required">*</span></label>
            <textarea
              v-model="form.body"
              class="form-textarea"
              :placeholder="$t('contact.page.body_placeholder')"
              rows="8"
              maxlength="5000"
              :disabled="isSubmitting"
              required
            ></textarea>
            <span class="form-hint">{{ $t('contact.page.body_hint', { count: form.body.length }) }}</span>
          </div>

          <div v-if="formError" class="form-error">
            <AlertCircle :size="14" class="mr-1" />{{ formError }}
          </div>

          <button
            type="submit"
            class="submit-btn"
            :disabled="!canSubmit"
          >
            <Loader2 v-if="isSubmitting" :size="14" class="spin mr-2" />
            <Send v-else :size="14" class="mr-2" />
            {{ isSubmitting ? $t('contact.page.submitting') : $t('contact.page.submit') }}
          </button>
        </form>
      </section>

      <!-- ─── 우: 내 문의 이력 ─────────────────────── -->
      <section class="contact-card">
        <div class="card-header-row">
          <h2 class="card-title">
            <Inbox :size="16" class="mr-2" />{{ $t('contact.page.my_inquiries') }}
            <span v-if="!isLoading" class="count-badge">{{ inquiries.length }}</span>
          </h2>
          <button class="icon-btn" @click="loadInquiries" :disabled="isLoading" :title="$t('contact.page.refresh_title')">
            <RefreshCw :size="14" :class="{ spin: isLoading }" />
          </button>
        </div>

        <!-- 로딩 -->
        <div v-if="isLoading && inquiries.length === 0" class="state-loading">
          <Loader2 :size="20" class="spin mr-2" />
          <span>{{ $t('contact.page.loading') }}</span>
        </div>
        <!-- 에러 -->
        <div v-else-if="errorMsg" class="state-error">
          <AlertCircle :size="14" class="mr-1" />{{ errorMsg }}
        </div>
        <!-- 빈 상태 -->
        <div v-else-if="inquiries.length === 0" class="state-empty">
          <Inbox :size="32" class="empty-icon" />
          <p class="empty-title">{{ $t('contact.page.empty_title') }}</p>
          <p class="empty-desc">{{ $t('contact.page.empty_desc') }}</p>
        </div>

        <!-- 목록 -->
        <ul v-else class="inquiry-list">
          <li
            v-for="inq in inquiries"
            :key="inq.id"
            class="inquiry-card"
            :class="{ 'inquiry-card--expanded': expandedId === inq.id }"
          >
            <button class="inquiry-summary" @click="toggleExpand(inq.id)">
              <div class="inquiry-summary-left">
                <span class="inquiry-cat">{{ getCategoryLabel(inq.category) || inq.category_label }}</span>
                <span class="inquiry-subject">{{ inq.subject }}</span>
              </div>
              <div class="inquiry-summary-right">
                <span
                  class="inquiry-status"
                  :style="{ background: getStatusMeta(inq.status).color }"
                >{{ getStatusMeta(inq.status).label }}</span>
                <span class="inquiry-date">{{ fmtDate(inq.created_at) }}</span>
                <component
                  :is="expandedId === inq.id ? ChevronUp : ChevronDown"
                  :size="14"
                  class="inquiry-chevron"
                />
              </div>
            </button>
            <div v-if="expandedId === inq.id" class="inquiry-detail">
              <!-- 사용자 원문 -->
              <div class="detail-section">
                <p class="detail-label">{{ $t('contact.page.detail_my_inquiry') }}</p>
                <p class="detail-body">{{ inq.body }}</p>
              </div>

              <!-- 관리자 답변 -->
              <div v-if="inq.admin_reply" class="detail-section detail-section--reply">
                <p class="detail-label">
                  <Reply :size="12" class="mr-1" />
                  {{ $t('contact.page.detail_admin_reply') }}
                  <span class="detail-reply-meta">
                    {{ fmtDate(inq.admin_replied_at) }}
                  </span>
                </p>
                <p class="detail-body detail-body--reply">{{ inq.admin_reply }}</p>
              </div>
              <div v-else class="detail-section detail-section--pending">
                <Loader2 :size="14" class="mr-2" />
                <span>{{ $t('contact.page.detail_pending') }}</span>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.contact-page {
  padding: 24px var(--page-pad-x, 32px);
  max-width: 1400px;
  margin: 0 auto;
  font-family: 'Pretendard', sans-serif;
}
@media (max-width: 600px) {
  .contact-page { padding: 16px; }
}

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

.page-header { margin-bottom: 24px; }
.page-title {
  display: flex; align-items: center;
  font-size: 1.4rem; font-weight: 800;
  color: var(--text-main, #2A2421);
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}
.page-sub {
  font-size: 0.85rem;
  color: var(--text-muted, #6F665F);
  margin: 0;
  line-height: 1.6;
}

.contact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.contact-grid--stack {
  grid-template-columns: 1fr;
}

.contact-card {
  background: #fff;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 14px;
  padding: 20px;
}

.card-title {
  display: flex; align-items: center;
  font-size: 1rem; font-weight: 800;
  color: var(--text-main, #2A2421);
  margin: 0 0 16px;
}

.card-header-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.card-header-row .card-title { margin: 0; }

.count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: 8px;
  min-width: 22px; height: 22px;
  padding: 0 7px;
  background: var(--accent, #8C6239);
  color: white;
  border-radius: 9999px;
  font-size: 0.7rem; font-weight: 700;
}

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none;
  color: var(--text-muted, #6F665F);
  padding: 6px; border-radius: 6px;
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) { background: rgba(0,0,0,0.05); }
.icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── 폼 ─── */
.contact-form { display: flex; flex-direction: column; gap: 14px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-label {
  font-size: 0.78rem; font-weight: 700;
  color: var(--text-main, #2A2421);
}
.required { color: #dc2626; }

.category-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
@media (max-width: 600px) {
  .category-grid { grid-template-columns: 1fr; }
}
.category-radio {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.category-radio:hover { border-color: var(--accent, #8C6239); }
.category-radio--active {
  border-color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.04);
}
.category-radio input { margin-top: 2px; accent-color: var(--accent, #8C6239); }
.category-content { display: flex; flex-direction: column; gap: 2px; }
.category-content strong {
  font-size: 0.82rem; color: var(--text-main, #2A2421); font-weight: 700;
}
.category-content small {
  font-size: 0.7rem; color: var(--text-muted, #6F665F);
  line-height: 1.4;
}

.form-input, .form-textarea {
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--text-main, #2A2421);
  outline: none;
  background: white;
  transition: border-color 0.12s;
}
.form-input:focus, .form-textarea:focus { border-color: var(--accent, #8C6239); }
.form-textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
.form-hint {
  font-size: 0.7rem; color: var(--text-muted, #6F665F);
  text-align: right;
}

.form-error {
  display: inline-flex; align-items: center;
  background: #fef2f2; color: #b91c1c;
  padding: 8px 12px; border-radius: 8px;
  font-size: 0.8rem;
}

.submit-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 11px 18px;
  background: linear-gradient(135deg, #C77F4A 0%, #8C6239 100%);
  color: white;
  border: none; border-radius: 10px;
  font-size: 0.88rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: transform 0.12s, box-shadow 0.12s;
}
.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(140, 98, 57, 0.25);
}
.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── 상태 표시 ─── */
.state-loading, .state-error {
  display: flex; align-items: center;
  padding: 24px; font-size: 0.85rem;
  color: var(--text-muted);
}
.state-error { background: #fef2f2; color: #b91c1c; border-radius: 8px; }
.state-empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 40px 20px;
  text-align: center;
}
.empty-icon { color: var(--text-muted, #6F665F); opacity: 0.4; margin-bottom: 10px; }
.empty-title {
  font-size: 0.9rem; font-weight: 700;
  color: var(--text-main, #2A2421);
  margin: 0 0 4px;
}
.empty-desc {
  font-size: 0.78rem; color: var(--text-muted, #6F665F);
  margin: 0; line-height: 1.5;
}

/* ─── 문의 카드 리스트 ─── */
.inquiry-list {
  list-style: none;
  padding: 0; margin: 0;
  display: flex; flex-direction: column;
  gap: 8px;
  max-height: 700px;
  overflow-y: auto;
}

.inquiry-card {
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.12s;
}
.inquiry-card--expanded { border-color: var(--accent, #8C6239); }

.inquiry-summary {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; gap: 10px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.inquiry-summary:hover { background: rgba(0,0,0,0.02); }

.inquiry-summary-left {
  display: flex; flex-direction: column; gap: 3px;
  min-width: 0; flex: 1;
}
.inquiry-cat {
  font-size: 0.65rem; color: var(--text-muted, #6F665F);
  text-transform: uppercase; letter-spacing: 0.04em;
  font-weight: 700;
}
.inquiry-subject {
  font-size: 0.85rem; color: var(--text-main, #2A2421);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inquiry-summary-right {
  display: inline-flex; align-items: center; gap: 8px;
  flex-shrink: 0;
}
.inquiry-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.65rem; font-weight: 700;
  color: white;
}
.inquiry-date {
  font-size: 0.7rem; color: var(--text-muted, #6F665F);
  font-variant-numeric: tabular-nums;
}
.inquiry-chevron { color: var(--text-muted, #6F665F); }

@media (max-width: 600px) {
  .inquiry-summary { flex-direction: column; align-items: flex-start; }
  .inquiry-summary-right { width: 100%; justify-content: space-between; }
}

.inquiry-detail {
  padding: 14px 16px;
  background: var(--bg-light, #F7F5EB);
  border-top: 1px solid var(--border-light, rgba(0,0,0,0.06));
}

.detail-section { margin-bottom: 12px; }
.detail-section:last-child { margin-bottom: 0; }
.detail-section--reply {
  padding: 10px 12px;
  background: rgba(16, 185, 129, 0.06);
  border-left: 3px solid #10b981;
  border-radius: 6px;
}
.detail-section--pending {
  display: flex; align-items: center;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.06);
  border-left: 3px solid #f59e0b;
  border-radius: 6px;
  font-size: 0.78rem;
  color: #92400e;
}
.detail-label {
  display: flex; align-items: center;
  font-size: 0.7rem; font-weight: 700;
  color: var(--text-muted, #6F665F);
  text-transform: uppercase; letter-spacing: 0.04em;
  margin: 0 0 6px;
}
.detail-reply-meta {
  margin-left: 8px;
  font-size: 0.7rem; color: var(--text-muted, #6F665F);
  font-variant-numeric: tabular-nums;
  text-transform: none; letter-spacing: 0;
  font-weight: 500;
}
.detail-body {
  font-size: 0.85rem;
  color: var(--text-main, #2A2421);
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0;
}
.detail-body--reply { color: #065f46; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.mr-1 { margin-right: 4px; }
.mr-2 { margin-right: 6px; }
</style>
