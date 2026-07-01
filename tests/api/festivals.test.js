import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/utils/axios', () => ({
  default: { get: vi.fn() },
}))

import axios from '@/utils/axios'
import { fetchFestivals, fetchFestival } from '@/api/festivals'

const DEMO = {
  list: { items: [{ id: 1, title: '데모 가요제' }], total: 1, limit: 200, offset: 0 },
  detail: { 1: { id: 1, title: '데모 가요제', venue: '데모홀' } },
}

describe('festivals API 클라이언트', () => {
  beforeEach(() => {
    axios.get.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('API_BASE 있으면 목록 API 를 params+skipAuth 로 호출', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://test')
    axios.get.mockResolvedValue({
      data: { items: [{ id: 1, title: '제29회 노들가요제' }], total: 21, limit: 100, offset: 0 },
    })
    const res = await fetchFestivals({ limit: 100 })
    expect(axios.get).toHaveBeenCalledWith('/api/v1/festivals', {
      params: { limit: 100 },
      skipAuth: true,
    })
    expect(res.total).toBe(21)
  })

  it('API_BASE 있으면 상세 API 를 id 경로로 호출', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://test')
    axios.get.mockResolvedValue({ data: { id: 5, title: '통영가요제', venue: '강구안 문화마당' } })
    const res = await fetchFestival(5)
    expect(axios.get).toHaveBeenCalledWith('/api/v1/festivals/5', { skipAuth: true })
    expect(res.venue).toBe('강구안 문화마당')
  })

  it('API_BASE 비면 데모 스냅샷(/demo/festivals.json) 폴백 — 목록·상세', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => DEMO }))
    const list = await fetchFestivals()
    expect(axios.get).not.toHaveBeenCalled()
    expect(list.items[0].title).toBe('데모 가요제')
    const detail = await fetchFestival(1)
    expect(detail.venue).toBe('데모홀')
  })

  it('API 호출 실패 시 데모 폴백', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://test')
    axios.get.mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => DEMO }))
    const list = await fetchFestivals()
    expect(list.items[0].title).toBe('데모 가요제')
  })
})
