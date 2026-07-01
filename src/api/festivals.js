/**
 * 가요제 공개 API 클라이언트 — gayoje-server 목록/상세(읽기 전용, 인증 불요).
 *
 * baseURL 은 axios(VITE_API_BASE_URL). 응답은 camelCase(startDate/hostOrg/regionName).
 * skipAuth: 공개 GET 이라 Bearer 첨부/refresh 흐름을 타지 않음.
 */
import api from '@/utils/axios'

/** 가요제 목록 { items, total, limit, offset } */
export const fetchFestivals = async (params = {}) => {
  const { data } = await api.get('/api/v1/festivals', { params, skipAuth: true })
  return data
}

/** 가요제 상세 { id, title, hostOrg, regionName, venue, startDate, endDate, sourceUrl } */
export const fetchFestival = async (id) => {
  const { data } = await api.get(`/api/v1/festivals/${id}`, { skipAuth: true })
  return data
}
