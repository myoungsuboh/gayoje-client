/**
 * QuotaConfig store — BE 의 동적 등급별 한도(QuotaConfig)를 FE 의 single source.
 *
 * [배경 — 2026-06]
 * pricing 카드(UpgradePromptDialog / pricing.vue)가 `subscription.js` 의 정적
 * perks 배열을 하드코딩해 표시 → admin 이 /admin/pricing 한도 관리에서 값을 바꿔도
 * 카드 수치가 옛 값으로 남아 실제 한도와 불일치하던 문제. 이제 공개 엔드포인트
 * `GET /api/quota-config` 를 FE 가 직접 조회해 카드 perks 를 동적 생성한다.
 *
 * [흐름]
 * 1. App.vue 부팅 시 `useQuotaConfigStore().fetch()` 1회.
 * 2. useTierPerks 컴포저블이 `store.limits(tier)` 로 등급별 한도 조회 → perks 생성.
 * 3. admin 이 한도 수정하면 `store.refresh()` 호출 → 카드 즉시 반영.
 *
 * [Fallback]
 * BE 호출 실패 시 subscription.js TIER_META.limits 기본값 사용 (카드가 빈 채로
 * 남지 않도록).
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchPublicQuotaConfigApi } from '@/utils/quotaConfig'
import { TIER_META } from '@/utils/subscription'

export const useQuotaConfigStore = defineStore('quotaConfig', () => {
  // config[tier] = { meeting_logs, summary_chars, total_tokens, library_skills, max_projects }
  const config = ref({})
  const isLoading = ref(false)
  const errorMsg = ref('')
  const fetchedAt = ref(0)

  const isLoaded = computed(() => Object.keys(config.value).length > 0)

  /** 공개 한도 조회 + state 채움. 캐시 10분 (한도는 자주 안 바뀜). */
  const fetch = async ({ force = false } = {}) => {
    const CACHE_TTL = 10 * 60 * 1000
    if (!force && isLoaded.value && Date.now() - fetchedAt.value < CACHE_TTL) {
      return { success: true, fromCache: true }
    }
    if (isLoading.value) return { success: false, error: 'already loading' }
    isLoading.value = true
    errorMsg.value = ''
    const r = await fetchPublicQuotaConfigApi()
    isLoading.value = false
    if (r.success) {
      const map = {}
      for (const q of (r.data?.quota || [])) {
        map[q.tier] = q
      }
      config.value = map
      fetchedAt.value = Date.now()
      return { success: true }
    }
    errorMsg.value = r.error || ''
    return { success: false, error: errorMsg.value }
  }

  /** admin 이 한도 수정 후 호출 — 강제 새로고침. */
  const refresh = () => fetch({ force: true })

  /** 등급별 한도. BE 미응답 시 subscription.js 정적 한도로 fallback. */
  const limits = (tier) => config.value[tier] || TIER_META[tier]?.limits || null

  return {
    config, isLoading, errorMsg, isLoaded,
    fetch, refresh, limits,
  }
})
