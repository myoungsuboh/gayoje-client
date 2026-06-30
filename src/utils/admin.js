/**
 * 관리자 API helper — backend `/api/admin/*` 엔드포인트 호출.
 *
 * 모든 라우트는 BE 에서 `Depends(get_admin_user)` 로 보호되어 있어
 * is_admin 이 아닌 사용자는 403. FE 는 진입 가드에서 미리 차단하지만,
 * 라우트 단에서도 BE 가 다시 검증해 이중 안전.
 *
 * 응답 / 에러 정규화 패턴은 `@/utils/auth.js` 와 동일 — { success, data?, error?, status? }.
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'

const AUTH_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * 사용자 목록 + 검색.
 * @param {{ q?: string, limit?: number, offset?: number }}
 * @returns 응답: { users: AdminUserRow[], total, limit, offset }
 */
export const listAdminUsersApi = async ({ q = '', limit = 50, offset = 0 } = {}) => {
  try {
    const res = await axios.get(`${AUTH_BASE}/api/admin/users`, {
      params: { q, limit, offset },
    })
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '사용자 목록을 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 사용자 상세 (구독 이력 포함).
 */
export const getAdminUserDetailApi = async (email) => {
  try {
    const res = await axios.get(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}`,
    )
    return { success: true, detail: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '사용자 정보를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 구독 변경 + 이력 기록.
 * @param {string} email
 * @param {{ type: 'free' | 'pro', reason?: string, duration_months?: number|null }} payload
 *   duration_months: 기간제 부여(개월). null = 영구. 미지정 시 BE 기본 1개월. free 면 무시.
 */
export const changeSubscriptionApi = async (email, { type, reason = '', duration_months } = {}) => {
  try {
    const res = await axios.patch(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/subscription`,
      { type, reason, duration_months },
    )
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '구독 변경에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 감사 로그 목록 (최신순).
 * @param {{ q?: string, limit?: number, offset?: number, fromDate?: string, toDate?: string }}
 *   fromDate/toDate: ISO 8601 instant (UTC). 빈 값이면 미적용. BE 는 created_at 범위로 필터
 *   (created_at >= from_date AND created_at < to_date).
 * @returns 응답: { logs: AuditLogRow[], total, limit, offset }
 */
export const listAuditLogsApi = async ({ q = '', limit = 50, offset = 0, fromDate = '', toDate = '' } = {}) => {
  try {
    const params = { q, limit, offset }
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
    const res = await axios.get(`${AUTH_BASE}/api/admin/audit-logs`, { params })
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '감사 로그를 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 사용자 사용량 카운터 수동 리셋 (admin only).
 *
 * BE: POST /api/admin/users/{email}/reset-usage
 *
 * [정책]
 * - 카운터(meeting_count / total_tokens / total_chars) 만 0 으로
 * - usage_reset_at 은 건드리지 않음 (cycle 무한 확장 abuse 방지)
 * - 새 cycle 부여하고 싶으면 등급 변경(changeSubscriptionApi) 사용
 * - 감사 로그(ACTION_USAGE_RESET) 자동 기록
 *
 * @param {string} email
 * @param {{ reason?: string }} [opts]
 * @returns { success, email, reason } 또는 { success: false, error, status }
 */
export const resetUserUsageApi = async (email, { reason = '' } = {}) => {
  try {
    const res = await axios.post(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/reset-usage`,
      { reason: reason || null },
    )
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '사용자 사용량 리셋에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}


/**
 * admin 토글.
 * @param {string} email
 * @param {boolean} is_admin
 */
export const setAdminApi = async (email, is_admin) => {
  try {
    const res = await axios.patch(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/admin`,
      { is_admin },
    )
    return { success: true, user: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '관리자 권한 변경에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 사용자 계정 정지.
 * @param {string} email
 * @param {{ reason?: string }} opts — reason 미지정 시 사용자에게 사유 노출 안 함
 */
export const suspendUserApi = async (email, { reason = '' } = {}) => {
  try {
    const res = await axios.patch(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/suspend`,
      { reason },
    )
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '계정 정지에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 사용자 계정 정지 해제.
 */
export const unsuspendUserApi = async (email) => {
  try {
    const res = await axios.patch(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/unsuspend`,
      {},
    )
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '정지 해제에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

export const getAdminStatsApi = async () => {
  try {
    const res = await axios.get(`${AUTH_BASE}/api/admin/stats`)
    return { success: true, data: res.data }
  } catch (error) {
    return { success: false, error: extractError(error, '통계 로딩 실패'), data: null }
  }
}
