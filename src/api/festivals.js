/**
 * 가요제 공개 API 클라이언트 — gayoje-server 목록/상세(읽기 전용, 인증 불요).
 *
 * [데모 폴백] VITE_API_BASE_URL 이 비었거나 API 호출이 실패하면 정적 스냅샷
 * public/demo/festivals.json 을 읽는다 → 백엔드 없이 아무 폰에서나 열리는 공개 데모.
 * 스냅샷은 GET /festivals(목록) + GET /festivals/{id}(상세) 응답을 그대로 담는다:
 *   { list: { items, total, limit, offset }, detail: { "<id>": {상세}, ... } }
 * 기존 API 경로 로직은 그대로 보존(API_BASE 있으면 우선 호출, 실패 시에만 폴백).
 */
import api from '@/utils/axios'

const apiBase = () => import.meta.env.VITE_API_BASE_URL || ''
const demoUrl = () => `${import.meta.env.BASE_URL || '/'}demo/festivals.json`

let _demoCache = null
const loadDemo = async () => {
  if (!_demoCache) {
    const res = await fetch(demoUrl())
    if (!res.ok) throw new Error(`demo snapshot ${res.status}`)
    _demoCache = await res.json()
  }
  return _demoCache
}

/** 가요제 목록 { items, total, limit, offset } */
export const fetchFestivals = async (params = {}) => {
  if (apiBase()) {
    try {
      const { data } = await api.get('/api/v1/festivals', { params, skipAuth: true })
      return data
    } catch { /* 폴백으로 진행 */ }
  }
  const demo = await loadDemo()
  return demo.list
}

/** 가요제 상세 { id, title, hostOrg, regionName, venue, startDate, endDate, sourceUrl } */
export const fetchFestival = async (id) => {
  if (apiBase()) {
    try {
      const { data } = await api.get(`/api/v1/festivals/${id}`, { skipAuth: true })
      return data
    } catch { /* 폴백으로 진행 */ }
  }
  const demo = await loadDemo()
  return demo.detail?.[String(id)] ?? null
}
