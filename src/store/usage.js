/**
 * Usage store — 사용자 quota 사용량 + 등급별 한도 공유.
 *
 * 여러 컴포넌트가 같은 데이터를 본다:
 *   - 헤더 미니 인디케이터 (UsageHeaderChip)
 *   - Plan 페이지 Meeting Log 폼 옆 잔여 카운터
 *   - profile 페이지 UsageCard
 *
 * [자동 새로고침]
 *   refresh({ force: true }) 를 미팅 등록/Design/Lint 직후 호출 → 모든 구독자 갱신.
 *   force=false 면 30초 캐시 (heavy traffic 방어).
 *
 * [80% 도달 1회 알림]
 *   tokensPct 또는 meetingPct 가 80 을 처음 넘으면 한 번만 toast.
 *   localStorage 에 마일스톤 기록 (재로그인까지 1회). 100% 도달 시 다른 토스트.
 *
 * [BE 응답 shape]
 *   { subscription_type, limits: {meeting_logs, summary_chars, total_tokens},
 *     usage: {meeting_logs, total_tokens, total_chars}, reset_at: null }
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchMyUsageApi } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import { getTierMeta, isPaidTier, TIER_FREE } from '@/utils/subscription'

const CACHE_TTL_MS = 30_000  // 30 초

// localStorage 키 — 80%/100% 마일스톤 토스트가 같은 세션 안에서 반복되지 않게.
// 한도 카테고리(tokens/meeting)별 + 마일스톤(80/100) 별 단일 키.
const MILESTONE_KEYS = {
  tokens80: 'gayoje_quota_milestone_tokens80',
  tokens100: 'gayoje_quota_milestone_tokens100',
  meeting80: 'gayoje_quota_milestone_meeting80',
  meeting100: 'gayoje_quota_milestone_meeting100',
  // [2026-06] 유료 등급이 메인 소진 → Lite 전환 시 1회 친절 안내 (한도 도달 경고 아님).
  liteOverflow: 'gayoje_quota_milestone_lite_overflow',
}

const safeGet = (key) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const safeSet = (key, val) => {
  try { localStorage.setItem(key, val) } catch { /* noop */ }
}

export const useUsageStore = defineStore('usage', () => {
  const data = ref(null)           // BE 응답 그대로 (subscription_type, limits, usage)
  const isLoading = ref(false)
  const fetchedAt = ref(0)
  const errorMsg = ref('')

  // ─── derived ────────────────────────────────────────────────
  const subscriptionType = computed(() => data.value?.subscription_type || TIER_FREE)
  // 2026-05: Pro 위에 Pro+/Pro Max 추가. `isPro` 는 후방호환 — 'pro' 등급만 true.
  // 컴포넌트는 새로 도입된 `isPaid` (유료 등급 통합) / `tierMeta` (라벨·색상) 를 사용.
  const isPro = computed(() => subscriptionType.value === 'pro')
  const isPaid = computed(() => isPaidTier(subscriptionType.value))
  const tierMeta = computed(() => getTierMeta(subscriptionType.value))
  const tierLabel = computed(() => tierMeta.value.label)

  const meetingUsed = computed(() => data.value?.usage?.meeting_logs ?? 0)
  const meetingLimit = computed(() => data.value?.limits?.meeting_logs ?? 5)
  const meetingRemaining = computed(() =>
    Math.max(0, meetingLimit.value - meetingUsed.value),
  )
  const meetingPct = computed(() => {
    if (!meetingLimit.value) return 0
    return Math.min(100, Math.round((meetingUsed.value / meetingLimit.value) * 100))
  })

  const tokensUsed = computed(() => data.value?.usage?.total_tokens ?? 0)
  const tokensLimit = computed(() => data.value?.limits?.total_tokens ?? 100_000)
  const tokensPct = computed(() => {
    if (!tokensLimit.value) return 0
    return Math.min(100, Math.round((tokensUsed.value / tokensLimit.value) * 100))
  })

  const summaryCharsLimit = computed(() => data.value?.limits?.summary_chars ?? 5_000)

  // [2026-06] Lite 오버플로우 — 메인(total_tokens) 소진 후 flash-lite 로 작업 지속.
  //   liteEnabled       : 주간캡 > 0 (Pro/Pro+/Max). Free 는 false (하드월).
  //   liteOverflowActive: 지금 메인 소진 상태라 Lite 모드로 동작 중.
  //   liteDailyPct      : 주간캡 대비 사용률 (넛지/진행바용).
  const liteDailyUsed = computed(() => data.value?.lite?.daily_used ?? 0)
  const liteDailyCap = computed(() => data.value?.lite?.daily_cap ?? 0)
  const liteMonthlyUsed = computed(() => data.value?.lite?.monthly_used ?? 0)
  const liteOverflowActive = computed(() => !!data.value?.lite?.overflow_active)
  const liteEnabled = computed(() => liteDailyCap.value > 0)
  const liteDailyPct = computed(() => {
    if (!liteDailyCap.value) return 0
    return Math.min(100, Math.round((liteDailyUsed.value / liteDailyCap.value) * 100))
  })
  const liteDailyResetAt = computed(() => data.value?.lite?.daily_reset_at || null)
  // 주간캡 70%+ → "사용량 많음 / 엔터프라이즈?" 넛지 (BE 와 동일 임계).
  const liteNearCap = computed(() => liteEnabled.value && liteDailyPct.value >= 70)

  // [2026-06] 토큰이 '진짜 차단' 상태인지 — BE resolve_quota_decision 의 blocked 와 동일 의미.
  //   liteEnabled(Pro/Pro+/Max): 메인 소진은 Lite 로 넘어가니 차단 아님. 주간캡 소진 시에만 차단.
  //   liteDisabled(Free): 메인 소진이 곧 하드월 차단.
  // FE 가 "업그레이드 팝업으로 막을지"를 이걸로 판정 (메인 소진≠차단). 오버플로우면 통과.
  const isTokenBlocked = computed(() =>
    liteEnabled.value ? liteDailyPct.value >= 100 : tokensPct.value >= 100,
  )

  // 한도 도달 (어느 하나라도)
  const isAnyExhausted = computed(() =>
    meetingPct.value >= 100 || tokensPct.value >= 100,
  )

  // [2026-05] 월간 reset 도입 — BE 가 reset_at (ISO datetime) 제공.
  // FE 는 "다음 reset N일 후" 안내 표시.
  const resetAt = computed(() => data.value?.reset_at || null)
  const daysUntilReset = computed(() => {
    if (!resetAt.value) return null
    const target = new Date(resetAt.value)
    if (Number.isNaN(target.getTime())) return null
    const diffMs = target.getTime() - Date.now()
    if (diffMs <= 0) return 0
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
  })
  const resetAtLabel = computed(() => {
    if (!resetAt.value) return null
    const d = new Date(resetAt.value)
    if (Number.isNaN(d.getTime())) return null
    // YYYY-MM-DD 한국어 friendly
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // [2026-06] 관리자 기간제 부여 만료일 — 유료 등급에 한해 "구독 만료: YYYY-MM-DD" 표시.
  // null 이면 만료 없음(영구 부여 / Free) → FE 는 표시 안 함.
  const subscriptionEndsAt = computed(() => data.value?.subscription_ends_at || null)
  const subscriptionEndsAtLabel = computed(() => {
    if (!subscriptionEndsAt.value) return null
    const d = new Date(subscriptionEndsAt.value)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // ─── 80%/100% 마일스톤 토스트 ──────────────────────────────
  // 마일스톤은 "처음 넘은 시점에 1회" 안내. 한 번 보여줬으면 localStorage 에 기록.
  // 사용자가 한도 reset 받으면 (admin reset_usage) FE 가 모름 → 안내 다시 안 나옴.
  // 그건 trade-off (UX 단순성).
  const checkMilestones = () => {
    const snackbar = useSnackbar()
    if (!snackbar?.showWarning && !snackbar?.showError) return

    // 등급/한도 도달 시 안내 메시지 분기.
    // [2026-05] 월간 reset 도입 — "N일 후 자동 reset" 안내 추가로 사용자 불안 ↓.
    const tier = subscriptionType.value
    const days = daysUntilReset.value
    const resetHint = days != null && days >= 0
      ? ` (${days}일 후 자동 reset)`
      : ''
    const upgradeHint = tier === 'pro_max'
      ? '관리자에게 문의해 주세요.'
      : '상위 등급으로 업그레이드하면 한도가 늘어납니다.'

    // [2026-06] 유료 등급(liteEnabled)의 AI 토큰은 메인 소진이 곧 '차단'이 아님 —
    // Lite 모델로 자동 전환돼 작업이 계속된다. 따라서 '제한됩니다/업그레이드' 경고
    // 대신, 전환 시점에 1회 친절 안내만 한다. (잘못된 한도 경고 방지.)
    if (liteEnabled.value) {
      if (liteOverflowActive.value && !safeGet(MILESTONE_KEYS.liteOverflow)) {
        safeSet(MILESTONE_KEYS.liteOverflow, '1')
        snackbar.showInfo?.(
          '메인 토큰을 다 써서 지금부터 Lite 모델로 작업해요. 작업은 그대로 계속할 수 있어요.',
          { timeout: 7000 },
        )
      }
    } else {
      // Free — 메인 소진이 실제 하드월. 기존 80%/100% 경고 유지.
      if (tokensPct.value >= 100 && !safeGet(MILESTONE_KEYS.tokens100)) {
        safeSet(MILESTONE_KEYS.tokens100, '1')
        safeSet(MILESTONE_KEYS.tokens80, '1')
        snackbar.showError?.(
          `AI 토큰 사용 한도에 도달했습니다${resetHint}. ${upgradeHint}`,
          { timeout: 8000 },
        )
      } else if (tokensPct.value >= 80 && tokensPct.value < 100 && !safeGet(MILESTONE_KEYS.tokens80)) {
        safeSet(MILESTONE_KEYS.tokens80, '1')
        snackbar.showWarning?.(
          `AI 토큰 사용량이 80% 를 넘었습니다 (현재 ${tokensPct.value}%). 한도 도달 시 사용이 제한됩니다${resetHint}.`,
          { timeout: 6000 },
        )
      }
    }

    // 미팅 로그 — 등급 무관 실제 한도 (오버플로우 없음). 기존 80%/100% 경고 유지.
    const m = meetingPct.value
    if (m >= 100 && !safeGet(MILESTONE_KEYS.meeting100)) {
      safeSet(MILESTONE_KEYS.meeting100, '1')
      safeSet(MILESTONE_KEYS.meeting80, '1')
      snackbar.showError?.(
        `미팅 로그 사용 한도에 도달했습니다${resetHint}. ${upgradeHint}`,
        { timeout: 8000 },
      )
    } else if (m >= 80 && m < 100 && !safeGet(MILESTONE_KEYS.meeting80)) {
      safeSet(MILESTONE_KEYS.meeting80, '1')
      snackbar.showWarning?.(
        `미팅 로그 사용량이 80% 를 넘었습니다 (현재 ${m}%). 한도 도달 시 사용이 제한됩니다${resetHint}.`,
        { timeout: 6000 },
      )
    }
  }

  // 등급 업그레이드 / admin reset 시 마일스톤 플래그 정리해야 안내 다시 받을 수 있음.
  // 단순화 차원에서 새 데이터의 사용량이 이전 보다 줄어들면 (reset 추정) 마일스톤 리셋.
  let _lastMeetingUsed = 0
  let _lastTokensUsed = 0
  const maybeClearMilestonesOnReset = () => {
    const curMeet = meetingUsed.value
    const curTok = tokensUsed.value
    if (curMeet < _lastMeetingUsed) {
      safeSet(MILESTONE_KEYS.meeting80, '')
      safeSet(MILESTONE_KEYS.meeting100, '')
    }
    if (curTok < _lastTokensUsed) {
      safeSet(MILESTONE_KEYS.tokens80, '')
      safeSet(MILESTONE_KEYS.tokens100, '')
      // [2026-06] 월간 reset 추정 시 Lite 전환 안내도 초기화 — 다음 cycle 에 다시 안내.
      safeSet(MILESTONE_KEYS.liteOverflow, '')
    }
    _lastMeetingUsed = curMeet
    _lastTokensUsed = curTok
  }

  // ─── actions ────────────────────────────────────────────────
  /**
   * 사용량 새로고침. force=true 면 캐시 무시.
   * 미팅 등록/Design/Lint 직후 호출 (force=true).
   */
  const refresh = async ({ force = false, silent = false } = {}) => {
    if (!force && data.value && Date.now() - fetchedAt.value < CACHE_TTL_MS) {
      return { success: true, fromCache: true }
    }
    if (isLoading.value) return { success: false, error: 'already loading' }
    isLoading.value = true
    errorMsg.value = ''
    const result = await fetchMyUsageApi()
    isLoading.value = false
    if (result.success) {
      data.value = result.data
      fetchedAt.value = Date.now()
      maybeClearMilestonesOnReset()
      if (!silent) checkMilestones()
      return { success: true }
    }
    errorMsg.value = result.error || '사용량을 불러오지 못했습니다.'
    return { success: false, error: errorMsg.value }
  }

  /** 로그아웃 / 세션 정리 시 호출 — 다음 사용자에게 누설 방지. */
  const reset = () => {
    data.value = null
    fetchedAt.value = 0
    errorMsg.value = ''
    _lastMeetingUsed = 0
    _lastTokensUsed = 0
  }

  return {
    // state
    data, isLoading, errorMsg,
    // derived
    subscriptionType, isPro, isPaid, tierMeta, tierLabel,
    meetingUsed, meetingLimit, meetingRemaining, meetingPct,
    tokensUsed, tokensLimit, tokensPct,
    summaryCharsLimit,
    isAnyExhausted,
    // [2026-06] Lite 오버플로우
    liteDailyUsed, liteDailyCap, liteMonthlyUsed, liteOverflowActive,
    liteEnabled, liteDailyPct, liteDailyResetAt, liteNearCap, isTokenBlocked,
    // [2026-05] 월간 reset
    resetAt, daysUntilReset, resetAtLabel,
    // [2026-06] 관리자 기간제 부여 만료일
    subscriptionEndsAt, subscriptionEndsAtLabel,
    // actions
    refresh, reset,
  }
})
