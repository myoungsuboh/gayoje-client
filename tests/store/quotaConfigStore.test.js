/**
 * useQuotaConfigStore — BE 동적 등급별 한도 + fallback + 10분 TTL.
 *
 * [회귀 가드 — 2026-06-12 admin 즉시 반영]
 * admin 이 /admin/pricing 에서 한도를 저장하면 saveQuota 가 store.refresh() 를
 * 호출한다. refresh 가 TTL 캐시를 강제로 우회하지 않으면 pricing 카드/업그레이드
 * 모달 perks 가 10분 동안 옛 한도로 남는다 — 그 계약을 여기서 고정.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/quotaConfig', () => ({
  fetchPublicQuotaConfigApi: vi.fn(),
}))

import { fetchPublicQuotaConfigApi } from '@/utils/quotaConfig'
import { useQuotaConfigStore } from '@/store/quotaConfig'
import { TIER_META } from '@/utils/subscription'

const okResponse = (quota) => ({ success: true, data: { quota } })
const PRO = { tier: 'pro', total_tokens: 5_000_000, lite_daily_cap: 500_000, meeting_logs: 50 }

describe('useQuotaConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchPublicQuotaConfigApi.mockReset()
  })

  it('fetch — BE 응답을 tier 별로 map + limits() 로 조회', async () => {
    fetchPublicQuotaConfigApi.mockResolvedValueOnce(okResponse([PRO]))
    const store = useQuotaConfigStore()
    const r = await store.fetch()
    expect(r.success).toBe(true)
    expect(store.isLoaded).toBe(true)
    expect(store.limits('pro').total_tokens).toBe(5_000_000)
    expect(store.limits('pro').lite_daily_cap).toBe(500_000)
  })

  it('fetch — 10분 TTL 안이면 캐시 hit (재호출 없음)', async () => {
    fetchPublicQuotaConfigApi.mockResolvedValue(okResponse([PRO]))
    const store = useQuotaConfigStore()
    await store.fetch()
    const r2 = await store.fetch()
    expect(r2.fromCache).toBe(true)
    expect(fetchPublicQuotaConfigApi).toHaveBeenCalledTimes(1)
  })

  it('refresh — TTL 캐시를 강제 우회해 최신 한도 반영 (admin 저장 직후)', async () => {
    fetchPublicQuotaConfigApi
      .mockResolvedValueOnce(okResponse([PRO]))
      .mockResolvedValueOnce(okResponse([{ ...PRO, total_tokens: 9_000_000 }]))
    const store = useQuotaConfigStore()
    await store.fetch()
    expect(store.limits('pro').total_tokens).toBe(5_000_000)

    await store.refresh()   // admin saveQuota 가 호출하는 그 경로
    expect(fetchPublicQuotaConfigApi).toHaveBeenCalledTimes(2)
    expect(store.limits('pro').total_tokens).toBe(9_000_000)
  })

  it('BE 실패 시 limits() 는 정적 TIER_META 로 fallback', async () => {
    fetchPublicQuotaConfigApi.mockResolvedValueOnce({ success: false, error: 'down' })
    const store = useQuotaConfigStore()
    const r = await store.fetch()
    expect(r.success).toBe(false)
    expect(store.limits('pro')).toEqual(TIER_META.pro?.limits || null)
  })
})
