/**
 * Admin Billing API helpers — 사용자별 결제 조회 / 환불 / 강제 종료.
 *
 * BE 라우트:
 *   GET  /api/admin/billing/users/{email}            — 사용자 구독 + 결제 이력
 *   GET  /api/admin/billing/payments/{payment_id}    — 결제 상세 (raw_response 포함)
 *   POST /api/admin/billing/refund                   — 환불 (admin 재량)
 *   POST /api/admin/billing/terminate                — 구독 강제 종료
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'

const wrap = async (fn, fallbackMsg) => {
  try {
    const res = await fn()
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, fallbackMsg),
      status: error?.response?.status,
    }
  }
}

export const fetchUserBillingApi = (email) =>
  wrap(
    () => axios.get(`/api/admin/billing/users/${encodeURIComponent(email)}`),
    '사용자 결제 정보를 가져오지 못했습니다.',
  )

export const fetchPaymentDetailApi = (paymentId) =>
  wrap(
    () => axios.get(`/api/admin/billing/payments/${encodeURIComponent(paymentId)}`),
    '결제 상세를 가져오지 못했습니다.',
  )

/**
 * @param {{payment_id: string, refund_amount: number, reason: string, downgrade_to_free?: boolean}} body
 */
export const refundPaymentApi = (body) =>
  wrap(
    () => axios.post('/api/admin/billing/refund', body),
    '환불 처리에 실패했습니다.',
  )

export const terminateSubscriptionApi = (email, reason) =>
  wrap(
    () => axios.post('/api/admin/billing/terminate', { email, reason }),
    '구독 종료에 실패했습니다.',
  )

/**
 * [2026-05-18] 결제의 환불 이력 (RefundRecord 노드 list).
 * @param {string} paymentId
 * @returns {Promise<{ success: boolean, data?: Array<{id, amount, reason, created_at}>, error?: string }>}
 */
export const fetchPaymentRefundsApi = (paymentId) =>
  wrap(
    () => axios.get(`/api/admin/billing/payments/${encodeURIComponent(paymentId)}/refunds`),
    '환불 이력을 가져오지 못했습니다.',
  )
