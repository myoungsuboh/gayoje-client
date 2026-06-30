/**
 * paddleApi.js — BE /api/paddle/* 래퍼.
 * 구독 스냅샷 조회 + 고객포털 세션 생성. axios 모킹으로 엔드포인트/응답 계약 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import axios from '@/utils/axios'
import { fetchPaddleSubscriptionApi, createPortalSessionApi, changeSubscriptionApi } from '@/utils/paddleApi'

beforeEach(() => vi.clearAllMocks())

describe('paddleApi', () => {
  it('fetchPaddleSubscriptionApi — GET /api/paddle/subscription', async () => {
    axios.get.mockResolvedValue({ data: { subscription: { status: 'active' } } })
    const r = await fetchPaddleSubscriptionApi()
    expect(axios.get).toHaveBeenCalledWith('/api/paddle/subscription')
    expect(r).toEqual({ success: true, data: { subscription: { status: 'active' } } })
  })

  it('createPortalSessionApi — POST /api/paddle/portal-session', async () => {
    axios.post.mockResolvedValue({ data: { url: 'https://customer-portal.paddle.com/x' } })
    const r = await createPortalSessionApi()
    expect(axios.post).toHaveBeenCalledWith('/api/paddle/portal-session')
    expect(r.success).toBe(true)
    expect(r.data.url).toMatch(/^https:/)
  })

  it('실패 시 success:false + status 동봉', async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } })
    const r = await fetchPaddleSubscriptionApi()
    expect(r.success).toBe(false)
    expect(r.status).toBe(500)
    expect(typeof r.error).toBe('string')
  })

  it('changeSubscriptionApi — POST /api/paddle/change-subscription {tier,cycle}', async () => {
    axios.post.mockResolvedValue({ data: { status: 'ok', subscription_id: 'sub_1', tier: 'pro_max' } })
    const r = await changeSubscriptionApi('pro_max')
    expect(axios.post).toHaveBeenCalledWith('/api/paddle/change-subscription', { tier: 'pro_max', cycle: 'monthly' })
    expect(r.success).toBe(true)
    expect(r.data.tier).toBe('pro_max')
  })

  it('changeSubscriptionApi — 409(no_active_subscription) 시 status/error 노출로 폴백 판단 가능', async () => {
    // BE detail 문자열은 extractError 가 그대로 error 로 전달 → FE 가 분기에 사용.
    axios.post.mockRejectedValue({ response: { status: 409, data: { detail: 'no_active_subscription' } } })
    const r = await changeSubscriptionApi('pro_max')
    expect(r.success).toBe(false)
    expect(r.status).toBe(409)
    expect(r.error).toBe('no_active_subscription')
  })
})
