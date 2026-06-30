/**
 * Pricing API helpers — 공개 + admin 라우트.
 *
 * BE 라우트:
 *   GET  /api/pricing                — 공개 (인증 불필요)
 *   GET  /api/admin/pricing          — admin 전체 조회
 *   PUT  /api/admin/pricing/{tier}   — admin 가격 수정
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'

/**
 * 공개 가격 조회 — 누구나 호출 가능 (인증 미들웨어 미적용).
 *
 * 응답:
 *   { pricing: [
 *       { tier, base_price, discount_pct, final_price, updated_at, updated_by },
 *       ...
 *   ] }
 */
export const fetchPricingApi = async () => {
  try {
    const res = await axios.get('/api/pricing')
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '가격 정보를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * admin 가격 전체 조회. /api/pricing 과 동일 데이터지만 admin 의도 명시.
 */
export const fetchAdminPricingApi = async () => {
  try {
    const res = await axios.get('/api/admin/pricing')
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '가격 정보를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * admin 가격 수정.
 *
 * @param tier  'free' | 'pro' | 'pro_plus' | 'pro_max'
 * @param body  { base_price: int, discount_pct: int }
 */
export const updatePricingApi = async (tier, body) => {
  try {
    const res = await axios.put(`/api/admin/pricing/${tier}`, body)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '가격 수정에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}
