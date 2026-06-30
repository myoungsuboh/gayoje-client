/**
 * Revenue / InfraCost API helpers (admin 전용).
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'

export const fetchRevenueSummaryApi = async () => {
  try {
    const res = await axios.get('/api/admin/revenue/summary')
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '수익 요약을 가져오지 못했습니다.'),
      status: error?.response?.status,
    }
  }
}

export const fetchRevenueMonthlyApi = async (year, month) => {
  try {
    const res = await axios.get('/api/admin/revenue/monthly', { params: { year, month } })
    return { success: true, data: res.data }
  } catch (error) {
    return { success: false, error: extractError(error, '월별 수익을 가져오지 못했습니다.') }
  }
}

export const fetchRevenueYearlyApi = async (year) => {
  try {
    const res = await axios.get('/api/admin/revenue/yearly', { params: { year } })
    return { success: true, data: res.data }
  } catch (error) {
    return { success: false, error: extractError(error, '연간 수익을 가져오지 못했습니다.') }
  }
}

/**
 * [2026-05-18] 일별 매출 (Payment 노드 기반).
 * @param {number} days 최근 N일 (1~365, default 30)
 */
export const fetchRevenueDailyApi = async (days = 30) => {
  try {
    const res = await axios.get('/api/admin/revenue/daily', { params: { days } })
    return { success: true, data: res.data }
  } catch (error) {
    return { success: false, error: extractError(error, '일별 수익을 가져오지 못했습니다.') }
  }
}

export const fetchInfraCostApi = async (year, month) => {
  try {
    const res = await axios.get('/api/admin/infra-cost', { params: { year, month } })
    return { success: true, data: res.data }
  } catch (error) {
    return { success: false, error: extractError(error, '인프라 비용을 가져오지 못했습니다.') }
  }
}

export const upsertInfraCostApi = async ({ year, month, amount_krw, note = '', items = [] }) => {
  try {
    const res = await axios.put('/api/admin/infra-cost', { year, month, amount_krw, note, items })
    return { success: true, data: res.data }
  } catch (error) {
    return { success: false, error: extractError(error, '인프라 비용 저장에 실패했습니다.') }
  }
}
