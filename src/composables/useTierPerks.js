/**
 * useTierPerks — 등급별 perks(혜택 목록)를 동적 한도 + 동적 가격으로 생성.
 *
 * [왜]
 * 기존엔 subscription.js TIER_META.perks 에 "미팅 로그 50건" 식으로 하드코딩 →
 * admin 이 /admin/pricing 에서 한도를 바꿔도 카드가 옛 수치로 남았다. 이제
 * quotaConfig 스토어(공개 /api/quota-config)의 실제 한도 + pricing 스토어의 할인율로
 * perks 문자열을 생성하고 i18n(billing.perk.*) 으로 다국어 처리한다.
 *
 * 반환: perksFor(tier) → string[]  (카드 <li> 목록)
 */
import { useI18n } from 'vue-i18n'
import { useQuotaConfigStore } from '@/store/quotaConfig'
import { usePricingStore } from '@/store/pricing'
import { TIER_PRO_MAX } from '@/utils/subscription'

export function useTierPerks() {
  const { t, locale } = useI18n()
  const quotaStore = useQuotaConfigStore()
  const pricingStore = usePricingStore()

  /** 토큰 수 → 로케일별 축약 표기. ko: 만 단위 / en: K·M 단위. */
  const formatTokens = (n) => {
    if (n == null) return '-'
    if (locale.value === 'ko') {
      if (n >= 10_000) {
        const man = n / 10_000
        return `${Number.isInteger(man) ? man : man.toFixed(1)}만`
      }
      return n.toLocaleString('ko-KR')
    }
    if (n >= 1_000_000) {
      const m = n / 1_000_000
      return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
    }
    if (n >= 1_000) {
      const k = n / 1_000
      return `${Number.isInteger(k) ? k : k.toFixed(1)}K`
    }
    return n.toLocaleString()
  }

  /** 일반 정수 → 천단위 구분 (스킬 라이브러리 등). */
  const fmtInt = (n) => (n == null ? '-' : n.toLocaleString(locale.value === 'ko' ? 'ko-KR' : 'en-US'))

  const perksFor = (tier) => {
    const limits = quotaStore.limits(tier)
    if (!limits) return []
    const out = [
      t('billing.perk.meeting_logs', { count: fmtInt(limits.meeting_logs) }),
      t('billing.perk.tokens', { amount: formatTokens(limits.total_tokens) }),
      t('billing.perk.skills', { count: fmtInt(limits.library_skills) }),
      t('billing.perk.projects', { count: fmtInt(limits.max_projects) }),
    ]
    // [2026-06-11] Lite 주간 보너스 — 유료의 핵심 셀링 포인트(소진 후에도 계속 작업).
    // 반대로 하드월 등급(Free)엔 "소진 시 대기"를 정직하게 노출 — 업그레이드 동기의
    // 대비축. 카피는 판매 문구 개선(스펙 나열 → 성과/베네핏) 일환으로 같이 조정.
    if ((limits.lite_daily_cap ?? 0) > 0) {
      out.splice(2, 0, t('billing.perk.lite_bonus', { amount: formatTokens(limits.lite_daily_cap) }))
    } else {
      out.splice(2, 0, t('billing.perk.free_wait'))
    }
    const disc = pricingStore.discountPct(tier)
    if (disc > 0) out.push(t('billing.perk.discount', { pct: disc }))
    if (tier === TIER_PRO_MAX) out.push(t('billing.perk.beta_access'))
    return out
  }

  return { perksFor, formatTokens }
}
