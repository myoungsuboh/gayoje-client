/**
 * Inquiry API helpers — 사용자 문의 + admin 관리 (2026-05).
 *
 * BE 라우트:
 *   POST   /api/inquiries              — 사용자 문의 작성
 *   GET    /api/inquiries/me           — 내 문의 목록
 *   GET    /api/admin/inquiries        — admin 리스트 (status/q/limit/offset)
 *   GET    /api/admin/inquiries/stats  — admin 상태별 카운트
 *   GET    /api/admin/inquiries/{id}   — admin 상세
 *   PATCH  /api/admin/inquiries/{id}   — admin 답변/상태
 */
import axios from '@/utils/axios'
import i18n from '@/plugins/i18n'

// 비컴포넌트(util)에서 번역 — axios.js 와 동일 패턴. 카테고리/상태 라벨은 getter 로
// 정의해 템플릿 접근 시 현재 로케일로 평가(로케일 전환에 반응).
const t = (key, params) => i18n.global.t(key, params)

const extractError = (error, fallback) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail?.message) return detail.message
  return fallback
}

// ===== 카테고리/상태 메타 (FE 표시용, BE 와 동기화) =====

export const INQUIRY_CATEGORIES = [
  { value: 'general', get label() { return t('contact.category.general.label') }, get desc() { return t('contact.category.general.desc') } },
  { value: 'bug', get label() { return t('contact.category.bug.label') }, get desc() { return t('contact.category.bug.desc') } },
  { value: 'feature', get label() { return t('contact.category.feature.label') }, get desc() { return t('contact.category.feature.desc') } },
  { value: 'billing', get label() { return t('contact.category.billing.label') }, get desc() { return t('contact.category.billing.desc') } },
  { value: 'other', get label() { return t('contact.category.other.label') }, get desc() { return t('contact.category.other.desc') } },
]

export const INQUIRY_STATUSES = {
  open: { get label() { return t('contact.status.open') }, color: '#0ea5e9' },               // 파랑
  in_progress: { get label() { return t('contact.status.in_progress') }, color: '#f59e0b' }, // 주황
  resolved: { get label() { return t('contact.status.resolved') }, color: '#10b981' },       // 녹색
  closed: { get label() { return t('contact.status.closed') }, color: '#6b7280' },           // 회색
}

export const getCategoryLabel = (cat) =>
  INQUIRY_CATEGORIES.find(c => c.value === cat)?.label || cat

export const getStatusMeta = (status) =>
  INQUIRY_STATUSES[status] || { label: status, color: '#6b7280' }


// ===== 사용자 API =====

/**
 * 문의 작성.
 * @param {{ category, subject, body }} payload
 */
export const createInquiryApi = async ({ category, subject, body }) => {
  try {
    const res = await axios.post('/api/inquiries', { category, subject, body })
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('contact.error.create')),
      status: error?.response?.status,
    }
  }
}

/** 내 문의 목록 + 답변. */
export const fetchMyInquiriesApi = async () => {
  try {
    const res = await axios.get('/api/inquiries/me')
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('contact.error.fetch_list')),
      status: error?.response?.status,
    }
  }
}


// ===== Admin API =====

/** admin 리스트 — status/q/limit/offset 필터. */
export const fetchAdminInquiriesApi = async ({
  status = '', q = '', limit = 50, offset = 0,
} = {}) => {
  try {
    const res = await axios.get('/api/admin/inquiries', {
      params: { status, q, limit, offset },
    })
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('contact.error.fetch_list')),
    }
  }
}

/** admin 상태별 카운트. */
export const fetchAdminInquiryStatsApi = async () => {
  try {
    const res = await axios.get('/api/admin/inquiries/stats')
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('contact.error.fetch_stats')),
    }
  }
}

/** admin 상세. */
export const fetchAdminInquiryApi = async (id) => {
  try {
    const res = await axios.get(`/api/admin/inquiries/${id}`)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('contact.error.fetch_detail')),
    }
  }
}

/** admin 답변/상태 갱신. force_email=true 면 답변 변경 없이도 답변 메일 재발송.
 *  응답 data.email_status: 'sent' | 'failed' | 'disabled' | null(발송 시도 안 함). */
export const updateAdminInquiryApi = async (id, { status, admin_reply, force_email } = {}) => {
  try {
    const body = {}
    if (status !== undefined) body.status = status
    if (admin_reply !== undefined) body.admin_reply = admin_reply
    if (force_email !== undefined) body.force_email = force_email
    const res = await axios.patch(`/api/admin/inquiries/${id}`, body)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('contact.error.update')),
    }
  }
}

/**
 * 답변 템플릿 변수 치환 — {이름}/{제목} 을 해당 값으로 1회 치환.
 * BE _apply_template 과 동일 로직(단일 패스 — 이중 치환 방지). 미리보기 표시용.
 */
export const applyReplyTemplate = (template, { name, subject } = {}) => {
  const map = { '{이름}': name || '', '{제목}': subject || '' }
  return String(template || '').replace(/\{이름\}|\{제목\}/g, (m) => (m in map ? map[m] : m))
}

/**
 * admin 일괄 회신 — 여러 문의에 개인화 답변 + 상태 일괄 적용.
 * @param {string[]} ids  대상 문의 id (1~50)
 * @param {string} replyTemplate  {이름}/{제목} 변수 지원 답변 템플릿
 * @param {string} status  적용 상태 (기본 resolved)
 * @returns {{success, data?: {total, updated, sent, email_enabled, failed[]}, error?}}
 */
export const bulkReplyApi = async (ids, replyTemplate, status = 'resolved') => {
  try {
    // 일괄 발송은 BE 가 병렬 처리하지만 안전하게 타임아웃 여유.
    const res = await axios.post(
      '/api/admin/inquiries/bulk-reply',
      { ids, reply_template: replyTemplate, status },
      { timeout: 60000 },
    )
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('contact.error.update')),
    }
  }
}
