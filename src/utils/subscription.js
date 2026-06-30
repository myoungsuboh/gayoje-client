/**
 * Subscription tier 표시 유틸 — Free / Pro / Pro+ / Pro Max.
 *
 * [정책 — 2026-05]
 * Pro 위 단계 2개 추가: Pro+ (Pro x2) / Pro Max (Pro x4).
 * 가격: $9.99 / $19.99 / $29.99 — [2026-06-11 .99 전환] 좌측 자릿수 효과로
 * 체감가 유지 + 매출 +3~11% (legacy KRW 9,900/17,900/29,900원도 .99 계열).
 * 모델은 세 유료 등급 모두 동일 (`gemini-2.5-flash`) — 차별화는 용량.
 * (단, AI 토큰은 2026-06-11 마진 재조정으로 메인 Free 1M / Pro 2M / Pro+ 4M /
 *  Pro Max 8M + 소진 후 Lite 주간캡(롤링 7일) 0/1.5M/3M/5M.
 *  BE app/core/quota.py 와 동기 — 워스트 토큰 원가 매출 대비 ~33-41%.)
 *
 * [BE 매핑]
 * subscription_type: 'free' | 'pro' | 'pro_plus' | 'pro_max'
 *
 * [차별화 요소 — UI 표기만]
 * 우선 처리 큐는 결제 시스템 도입 시 활성화. 지금은 "출시 예정" 표기만.
 */

export const TIER_FREE = 'free'
export const TIER_PRO = 'pro'
export const TIER_PRO_PLUS = 'pro_plus'
export const TIER_PRO_MAX = 'pro_max'

export const PAID_TIERS = [TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]

/** 메타데이터 — 라벨/색상/가격/등급별 한도 표시용. */
export const TIER_META = {
  [TIER_FREE]: {
    key: TIER_FREE,
    label: 'Free',
    shortLabel: 'Free',
    priceMinor: 0,
    currency: 'USD',
    priceText: '무료',
    priceTextLong: '무료 ($0)',
    color: '#6b7280',           // 회색
    gradient: 'linear-gradient(90deg, #9ca3af, #6b7280)',
    badgeBg: 'rgba(0, 0, 0, 0.06)',
    badgeColor: '#6b7280',
    limits: {
      meeting_logs: 5,
      // [2026-05] 5_000 → 10_000. 실제 회의록을 Free 에서도 잘리지 않고
      // 업로드할 수 있도록 (BE _FREE_LIMITS 와 일치).
      summary_chars: 10_000,
      total_tokens: 1_000_000,
      library_skills: 100,
      max_projects: 1,
      lite_daily_cap: 0,            // 하드월 — 소진 시 업그레이드 유도
    },
    perks: [
      '미팅 로그 5건',
      'AI 처리량(토큰) 월 100만 — 라이트 모델',
      '스킬 라이브러리 100개',
      '동시 프로젝트 1개',
    ],
  },
  [TIER_PRO]: {
    key: TIER_PRO,
    label: 'Pro',
    shortLabel: 'Pro',
    priceMinor: 1200,
    currency: 'USD',
    priceText: '$12',
    priceTextLong: '$12 / 월',
    // 2026-05: Pro 호박색 → Teal 변경 (Pro Max 의 골드 호박과 시각 충돌 해소).
    // 등급 그라데이션: Free 회색 → Pro 청록 → Pro+ 보라 → Pro Max 골드.
    color: '#0d9488',           // teal-600
    gradient: 'linear-gradient(90deg, #14b8a6, #0d9488)',  // teal-500 → teal-600
    badgeBg: 'linear-gradient(90deg, #14b8a6, #0d9488)',
    badgeColor: '#ffffff',
    limits: {
      meeting_logs: 50,
      summary_chars: 50_000,
      total_tokens: 2_000_000,
      library_skills: 1_000,
      max_projects: 3,
      lite_daily_cap: 1_500_000,    // Lite 주간(롤링 7일) 캡 — BE 와 동기
    },
    perks: [
      '미팅 로그 50건 (Free 대비 10배)',
      'AI 처리량(토큰) 월 200만 — 고성능 모델',
      '소진 후에도 라이트 모델 주 150만 보너스',
      '스킬 라이브러리 1,000개',
      '동시 프로젝트 3개',
    ],
  },
  [TIER_PRO_PLUS]: {
    key: TIER_PRO_PLUS,
    label: 'Pro+',
    shortLabel: 'Pro+',
    // [2026-06-24] 가격 개편 — USD $24/월(플랫). 실제 청구·KRW(₩36,000)는 Paddle +
    // PricePreview 가 처리. 이 값들은 store/PricePreview 미로딩 시 last-resort fallback 전용.
    priceMinor: 2400,
    currency: 'USD',
    priceText: '$24',
    priceTextLong: '$24 / 월',
    color: '#7c3aed',           // 보라색 (Pro+ 차별화)
    gradient: 'linear-gradient(90deg, #a855f7, #7c3aed)',
    badgeBg: 'linear-gradient(90deg, #a855f7, #7c3aed)',
    badgeColor: '#ffffff',
    limits: {
      meeting_logs: 100,
      summary_chars: 100_000,
      total_tokens: 4_000_000,
      library_skills: 2_000,
      max_projects: 6,
      lite_daily_cap: 3_000_000,
    },
    perks: [
      '미팅 로그 100건 (Pro 대비 2배)',
      'AI 처리량(토큰) 월 400만 (Pro 대비 2배)',
      '소진 후 라이트 모델 주 300만 (무제한 체감)',
      '스킬 라이브러리 2,000개',
      '동시 프로젝트 6개',
      '10% 단가 할인 (Pro 대비)',
    ],
  },
  [TIER_PRO_MAX]: {
    key: TIER_PRO_MAX,
    label: 'Pro Max',
    shortLabel: 'Max',
    // [2026-06-24] 가격 개편 — USD $36/월(플랫). 실제 청구·KRW(₩54,000)는 Paddle +
    // PricePreview 가 처리. 이 값들은 fallback 전용.
    priceMinor: 3600,
    currency: 'USD',
    priceText: '$36',
    priceTextLong: '$36 / 월',
    color: '#b45309',           // 골드 / 진한 호박
    gradient: 'linear-gradient(90deg, #fbbf24, #b45309)',
    badgeBg: 'linear-gradient(90deg, #fbbf24, #b45309)',
    badgeColor: '#ffffff',
    limits: {
      meeting_logs: 200,
      summary_chars: 200_000,
      total_tokens: 8_000_000,
      library_skills: 4_000,
      max_projects: 12,
      lite_daily_cap: 5_000_000,
    },
    perks: [
      '미팅 로그 200건 (Pro 대비 4배)',
      'AI 처리량(토큰) 월 800만 (Pro 대비 4배)',
      '소진 후 라이트 모델 주 500만 (무제한 체감)',
      '스킬 라이브러리 4,000개',
      '동시 프로젝트 12개',
      '25% 단가 할인 (Pro 대비)',
      '신규 기능 베타 우선 접근',
    ],
  },
}

/** 등급명 → 메타. 알 수 없는 값은 Free 로 fallback. */
export function getTierMeta(tier) {
  return TIER_META[tier] || TIER_META[TIER_FREE]
}

/** 등급명 → 사람이 읽기 좋은 라벨 (예: 'Pro+'). */
export function getTierLabel(tier) {
  return getTierMeta(tier).label
}

/** 유료 등급 여부 (Pro / Pro+ / Pro Max). */
export function isPaidTier(tier) {
  return PAID_TIERS.includes(tier)
}

/**
 * 현재 등급에서 사용자가 업그레이드 가능한 다음 등급 목록.
 * Pro Max 는 빈 배열 — 더 이상 업그레이드 단계 없음.
 */
export function getNextTiers(currentTier) {
  switch (currentTier) {
    case TIER_FREE:
      return [TIER_PRO, TIER_PRO_PLUS, TIER_PRO_MAX]
    case TIER_PRO:
      return [TIER_PRO_PLUS, TIER_PRO_MAX]
    case TIER_PRO_PLUS:
      return [TIER_PRO_MAX]
    case TIER_PRO_MAX:
    default:
      return []
  }
}
