/**
 * QuotaConfig API helpers — admin 한도 조회/수정.
 *
 * BE 라우트:
 *   GET  /api/quota-config              — 공개 (인증 불필요)
 *   GET  /api/admin/quota-config        — admin 전체 조회
 *   PUT  /api/admin/quota-config/{tier} — admin 한도 수정
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'

/**
 * 공개 한도 조회 — pricing 카드(업그레이드 모달 / 요금제 페이지) 표시용. 인증 불필요.
 * 응답: { quota: [{ tier, meeting_logs, summary_chars, total_tokens, library_skills, max_projects }] }
 */
export const fetchPublicQuotaConfigApi = async () => {
  try {
    const res = await axios.get('/api/quota-config')
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '한도 정보를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

export const fetchAdminQuotaConfigApi = async () => {
  try {
    const res = await axios.get('/api/admin/quota-config')
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '한도 정보를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * admin 한도 수정.
 *
 * @param tier  'free' | 'pro' | 'pro_plus' | 'pro_max'
 * @param body  { meeting_logs, summary_chars, total_tokens, library_skills, max_projects }
 */
export const updateQuotaConfigApi = async (tier, body) => {
  try {
    const res = await axios.put(`/api/admin/quota-config/${tier}`, body)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '한도 수정에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}
