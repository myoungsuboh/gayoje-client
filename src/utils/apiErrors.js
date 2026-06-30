/**
 * API 에러 → 사용자 친화 메시지 변환 — 모든 utils/* helper 공통.
 *
 * [이전]
 * auth.js / admin.js / skillLibrary.js / pricing.js / revenue.js 5곳에서 비슷한
 * `extractError` 가 서로 미묘하게 다르게 정의됨. detail 객체 처리 / array
 * Pydantic 에러 처리 등이 일관 안 됐고, 신규 helper 추가 시 또 재구현 위험.
 *
 * [현재]
 * 단일 함수. detail 형태별 분기:
 *   - string                                    → 그대로 (정상 BE 메시지)
 *   - { code, message, ... }                    → detail.message (구조화 응답)
 *   - [{ msg, type, loc, ... }, ...] (Pydantic) → 첫 번째 msg
 *   - 그 외                                     → fallback
 *
 * [방어선 — BE detail leak 방지]
 * BE 가 실수로 detail 에 cypher 스니펫이나 stacktrace 를 넣어도 길이 캡(200자)
 * 으로 UI 노출 제한. 사용자 메시지로 200자는 충분.
 */

const MAX_DETAIL_LEN = 200

/**
 * @param {unknown} error  axios error 또는 임의 throw 객체
 * @param {string} fallback  detail 추출 실패 시 사용할 메시지
 * @returns {string}  사용자에게 표시할 메시지 (최대 200자)
 */
export function extractError(error, fallback) {
  const detail = error?.response?.data?.detail
  let msg = fallback

  if (typeof detail === 'string') {
    msg = detail
  } else if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    // 구조화 응답 — quota/gemini error code 포함
    if (typeof detail.message === 'string') {
      msg = detail.message
    } else {
      msg = fallback
    }
  } else if (Array.isArray(detail) && detail.length > 0) {
    // Pydantic ValidationError — [{ msg, type, loc, ... }, ...]
    msg = detail[0]?.msg || fallback
  } else if (error?.message) {
    // axios / network error 등
    msg = error.message
  }

  // 길이 캡 — BE 가 실수로 stacktrace / cypher 등을 detail 에 노출해도 UI 표면 제한.
  if (typeof msg === 'string' && msg.length > MAX_DETAIL_LEN) {
    msg = msg.slice(0, MAX_DETAIL_LEN) + '…'
  }
  return typeof msg === 'string' ? msg : fallback
}
