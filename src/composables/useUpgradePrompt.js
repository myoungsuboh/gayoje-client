/**
 * useUpgradePrompt — quota 한도 초과 또는 Pro 안내 모달 글로벌 상태.
 *
 * App.vue 에서 단일 UpgradePromptDialog 가 이 state 를 구독해 렌더.
 * 호출 지점:
 *   - axios response interceptor: 402 + detail.code === 'QUOTA_EXCEEDED' 자동 트리거
 *   - UsageCard 의 'Pro 알아보기' 버튼: 수동 트리거 (info 모드)
 *
 * 상태 구조:
 *   - mode: 'exceeded' | 'info'
 *     · 'exceeded': 실제 차단됨. 빨간 톤 + "한도 도달".
 *     · 'info': 임의 안내. Pro 혜택 + 문의 안내.
 *   - detail: BE QuotaExceeded.to_dict() shape 또는 null
 *       { code, limit_type, current, limit, subscription_type, message, upgrade_url, reset_at }
 */
import { reactive } from 'vue'

const state = reactive({
  show: false,
  mode: 'info',        // 'exceeded' | 'info'
  detail: null,        // BE 응답 detail 또는 null
})

/**
 * 한도 초과 모달 표시 (axios interceptor 에서 호출).
 * @param {object} detail BE 응답의 error.response.data.detail
 */
const showQuotaExceeded = (detail) => {
  state.mode = 'exceeded'
  state.detail = detail || null
  state.show = true
}

/**
 * Pro 안내 모달 (UsageCard 버튼 등에서 호출). 차단 X.
 */
const showUpgradeInfo = () => {
  state.mode = 'info'
  state.detail = null
  state.show = true
}

const close = () => {
  state.show = false
}

export const useUpgradePrompt = () => ({
  state,
  showQuotaExceeded,
  showUpgradeInfo,
  close,
})
