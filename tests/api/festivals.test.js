import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({
  default: { get: vi.fn() },
}))

import axios from '@/utils/axios'
import { fetchFestivals, fetchFestival } from '@/api/festivals'

describe('festivals API 클라이언트', () => {
  beforeEach(() => {
    axios.get.mockReset()
  })

  it('fetchFestivals: 목록 엔드포인트를 params+skipAuth 로 호출하고 data 반환', async () => {
    axios.get.mockResolvedValue({
      data: { items: [{ id: 1, title: '제29회 노들가요제' }], total: 21, limit: 100, offset: 0 },
    })
    const res = await fetchFestivals({ limit: 100 })
    expect(axios.get).toHaveBeenCalledWith('/api/v1/festivals', {
      params: { limit: 100 },
      skipAuth: true,
    })
    expect(res.total).toBe(21)
    expect(res.items[0].title).toBe('제29회 노들가요제')
  })

  it('fetchFestival: 상세 엔드포인트를 id 경로로 호출하고 data 반환', async () => {
    axios.get.mockResolvedValue({
      data: { id: 5, title: '통영가요제', venue: '강구안 문화마당' },
    })
    const res = await fetchFestival(5)
    expect(axios.get).toHaveBeenCalledWith('/api/v1/festivals/5', { skipAuth: true })
    expect(res.venue).toBe('강구안 문화마당')
  })
})
