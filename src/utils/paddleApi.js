/**
 * Paddle 연동 BE API — 구독 스냅샷 조회 + 고객포털 세션.
 *
 * 결제 실행은 paddle.js(오버레이 체크아웃), 결제 확정은 BE 웹훅.
 * 여기는 BE 가 웹훅으로 영속화한 Paddle 상태를 조회하고, 구독관리
 * (해지/재개/결제수단/영수증)를 위임할 Paddle 고객포털 진입 URL 만 받는다.
 *
 * BE 라우트 (harness-server app/api/paddle_billing_routes.py):
 *   GET  /api/paddle/subscription        — { subscription: {...} | null }
 *   POST /api/paddle/portal-session      — { url }
 *   POST /api/paddle/change-subscription — { status, subscription_id, tier }
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'

const wrap = async (fn, fallbackMsg) => {
  try {
    const res = await fn()
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, fallbackMsg),
      status: error?.response?.status,
    }
  }
}

/** 현재 사용자 Paddle 구독 스냅샷 — 없으면 data.subscription = null. */
export const fetchPaddleSubscriptionApi = () =>
  wrap(() => axios.get('/api/paddle/subscription'), '구독 정보를 가져오지 못했습니다.')

/** Paddle 고객포털 세션 URL 생성 — 새 탭으로 열어 구독관리 위임. */
export const createPortalSessionApi = () =>
  wrap(() => axios.post('/api/paddle/portal-session'), '구독 관리 페이지를 열지 못했습니다.')

/**
 * 기존 구독자의 등급 변경 — 새 체크아웃이 아니라 기존 구독의 price 를 교체(proration 즉시청구).
 *
 * [왜 체크아웃이 아닌가] Paddle 체크아웃은 완료 1회당 '새 구독' 을 만든다. 기존 구독자가
 * 업그레이드를 체크아웃으로 다시 결제하면 옛 구독이 살아있는 채 새 구독이 또 생겨 '이중청구'.
 * 그래서 기존 구독자는 이 API(BE 가 PATCH /subscriptions)로 같은 구독만 바꾼다.
 *
 * 반환: { success, data, error, status }
 *  - status === 409 (no_active_subscription): 활성 구독 없음 → 호출자는 체크아웃 오버레이로 폴백.
 */
export const changeSubscriptionApi = (tier, cycle = 'monthly') =>
  wrap(
    () => axios.post('/api/paddle/change-subscription', { tier, cycle }),
    '구독 등급 변경에 실패했습니다.',
  )
