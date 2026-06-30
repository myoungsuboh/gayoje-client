/**
 * useUsageStore 단위 테스트 — quota 응답 매핑 + reset_at 파생값.
 *
 * [회귀 가드]
 * BE BUG 1 (auth_routes /me/usage 가 reset_at 을 None 으로 하드코딩하던) 픽스
 * 직후 FE 가 reset_at 을 store derived 로 정확히 노출하는지 검증.
 *
 * UsageCard.vue 가 store 기반으로 리팩토링됐으므로, 카드의 표시는 사실상 store
 * 의 derived 만 검증하면 모두 커버됨 (drift 위험 제거).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/auth', () => ({
  fetchMyUsageApi: vi.fn(),
}))

// useSnackbar 는 mount 없는 환경에서 inject 없이 호출되면 throw — 안전한 stub 제공.
// [2026-06] 마일스톤 토스트 검증용으로 안정적 singleton spy 노출 (showInfo 포함).
const _snack = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
}))
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => _snack,
}))

import { fetchMyUsageApi } from '@/utils/auth'
import { useUsageStore } from '@/store/usage'

const mkResponse = ({
  subscription_type = 'pro',
  meeting_logs = 0,
  total_tokens = 0,
  total_chars = 0,
  meeting_limit = 100,
  tokens_limit = 5_000_000,
  summary_limit = 50_000,
  reset_at = null,
  lite = undefined,
} = {}) => ({
  success: true,
  data: {
    subscription_type,
    limits: {
      meeting_logs: meeting_limit,
      summary_chars: summary_limit,
      total_tokens: tokens_limit,
    },
    usage: {
      meeting_logs,
      total_tokens,
      total_chars,
    },
    reset_at,
    ...(lite ? { lite } : {}),
  },
})


describe('useUsageStore — quota 응답 매핑', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMyUsageApi.mockReset()
    _snack.showError.mockClear()
    _snack.showWarning.mockClear()
    _snack.showInfo.mockClear()
    // localStorage 마일스톤 키 청소 — 테스트 간 누설 방지
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  it('정상 응답 — 등급/사용량/한도/reset_at 모두 derived 로 노출', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'pro_plus',
      meeting_logs: 42,
      total_tokens: 1_234_567,
      meeting_limit: 200,
      tokens_limit: 10_000_000,
      reset_at: '2026-06-17T00:00:00.000000000Z',
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })

    expect(store.subscriptionType).toBe('pro_plus')
    expect(store.isPaid).toBe(true)
    expect(store.meetingUsed).toBe(42)
    expect(store.meetingLimit).toBe(200)
    expect(store.meetingPct).toBe(21)   // round(42/200*100) = 21
    expect(store.tokensUsed).toBe(1_234_567)
    expect(store.tokensLimit).toBe(10_000_000)
    expect(store.tokensPct).toBe(12)    // round(1234567/10000000*100) = 12
    expect(store.summaryCharsLimit).toBe(50_000)
    expect(store.resetAt).toBe('2026-06-17T00:00:00.000000000Z')
    // daysUntilReset / resetAtLabel — 시간 의존적, 형식만 검증
    expect(store.resetAtLabel).toBe('2026-06-17')
  })

  it('[BUG 1 회귀] reset_at 이 null 이면 derived 도 null — 옛 BE 호환', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({ reset_at: null }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.resetAt).toBeNull()
    expect(store.daysUntilReset).toBeNull()
    expect(store.resetAtLabel).toBeNull()
  })

  it('reset_at 이 과거면 daysUntilReset === 0', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      reset_at: '2020-01-01T00:00:00.000Z',  // 충분히 과거
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.daysUntilReset).toBe(0)
  })

  it('알 수 없는 등급 — subscriptionType 노출하되 isPaid=false (보수적 fallback)', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'enterprise',
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.subscriptionType).toBe('enterprise')
    expect(store.isPaid).toBe(false)
  })

  it('isAnyExhausted — 미팅 한도 100% 도달 시 true', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      meeting_logs: 5, meeting_limit: 5,
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.meetingPct).toBe(100)
    expect(store.isAnyExhausted).toBe(true)
  })

  it('reset() — 사용자 전환 시 모든 state 정리', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({ meeting_logs: 3 }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.data).not.toBeNull()
    store.reset()
    expect(store.data).toBeNull()
    expect(store.meetingUsed).toBe(0)
  })

  it('refresh 캐시 — force=false 면 두번째 호출은 fetch 안 함', async () => {
    fetchMyUsageApi.mockResolvedValue(mkResponse({ meeting_logs: 1 }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    await store.refresh({ silent: true })   // 캐시 hit
    expect(fetchMyUsageApi).toHaveBeenCalledTimes(1)
  })

  it('refresh 캐시 — force=true 면 항상 fetch', async () => {
    fetchMyUsageApi.mockResolvedValue(mkResponse({ meeting_logs: 1 }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    await store.refresh({ force: true, silent: true })
    expect(fetchMyUsageApi).toHaveBeenCalledTimes(2)
  })

  // ─── [2026-06] Lite 오버플로우 derived ──────────────────────────
  it('lite 섹션 없으면 (구 BE) 안전 기본값 — liteEnabled=false', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({ subscription_type: 'pro' }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.liteEnabled).toBe(false)
    expect(store.liteOverflowActive).toBe(false)
    expect(store.liteDailyUsed).toBe(0)
    expect(store.liteDailyPct).toBe(0)
  })

  it('lite 오버플로우 활성 — daily 사용/캡/pct + 넛지(70%+) 노출', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'pro',
      lite: {
        daily_used: 400_000,
        daily_cap: 500_000,
        monthly_used: 1_200_000,
        overflow_active: true,
        daily_reset_at: '2026-06-09T00:00:00.000000000Z',
      },
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.liteEnabled).toBe(true)
    expect(store.liteOverflowActive).toBe(true)
    expect(store.liteDailyUsed).toBe(400_000)
    expect(store.liteDailyCap).toBe(500_000)
    expect(store.liteDailyPct).toBe(80)        // 400k/500k
    expect(store.liteNearCap).toBe(true)        // 80% ≥ 70%
    expect(store.liteDailyResetAt).toBe('2026-06-09T00:00:00.000000000Z')
  })

  it('[isTokenBlocked] Free 메인 소진 → 차단(true)', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'free', total_tokens: 1_000_000, tokens_limit: 1_000_000,
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.isTokenBlocked).toBe(true)
  })

  it('[isTokenBlocked] 유료 메인 소진 + 일일캡 여유 → 차단 아님(오버플로우)', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'pro_plus', total_tokens: 6_000_000, tokens_limit: 6_000_000,
      lite: { daily_used: 200_000, daily_cap: 1_400_000, monthly_used: 0, overflow_active: true },
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.isTokenBlocked).toBe(false)   // ← 버그였던 지점: 메인 소진≠차단
  })

  it('[isTokenBlocked] 유료 일일캡까지 소진 → 차단(true)', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'pro', total_tokens: 3_000_000, tokens_limit: 3_000_000,
      lite: { daily_used: 500_000, daily_cap: 500_000, monthly_used: 0, overflow_active: true },
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.isTokenBlocked).toBe(true)
  })

  it('lite 캡 미달(<70%)이면 넛지 없음', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'pro_plus',
      lite: { daily_used: 100_000, daily_cap: 1_400_000, monthly_used: 0, overflow_active: true },
    }))
    const store = useUsageStore()
    await store.refresh({ force: true, silent: true })
    expect(store.liteNearCap).toBe(false)
  })

  // ─── [2026-06] 마일스톤 토스트 — 오버플로우 유저 오경고 방지 ───────
  it('유료 오버플로우 — 메인 100% 여도 "한도 도달" 에러 대신 Lite 전환 info', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'pro',
      total_tokens: 3_000_000,
      tokens_limit: 3_000_000,   // 메인 100%
      meeting_logs: 0, meeting_limit: 50,  // 미팅은 0% (간섭 방지)
      lite: { daily_used: 50_000, daily_cap: 500_000, monthly_used: 50_000, overflow_active: true },
    }))
    const store = useUsageStore()
    await store.refresh({ force: true })   // 非silent → checkMilestones 실행
    // 잘못된 "AI 토큰 한도 도달/업그레이드" 에러가 뜨면 안 됨
    expect(_snack.showError).not.toHaveBeenCalled()
    // 대신 친절한 Lite 전환 안내 1회
    expect(_snack.showInfo).toHaveBeenCalledTimes(1)
    expect(_snack.showInfo.mock.calls[0][0]).toContain('Lite')
  })

  it('Free — 메인 토큰 100% 면 기존대로 "한도 도달" 에러 (실제 하드월)', async () => {
    fetchMyUsageApi.mockResolvedValueOnce(mkResponse({
      subscription_type: 'free',
      total_tokens: 1_000_000,
      tokens_limit: 1_000_000,
      meeting_logs: 0, meeting_limit: 5,
      // lite 없음 → liteEnabled=false
    }))
    const store = useUsageStore()
    await store.refresh({ force: true })
    expect(_snack.showError).toHaveBeenCalledTimes(1)
    expect(_snack.showInfo).not.toHaveBeenCalled()
  })
})
