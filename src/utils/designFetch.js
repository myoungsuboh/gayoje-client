/**
 * Design 페이지 (SPACK · DDD · Architecture) 데이터 fetch 유틸.
 *
 * [배경 — 2026-05-21]
 * createSpack 6분 LLM 체인이 끝난 직후 즉시 GET (getSpack/getDDD/getArchitecture)
 * 호출하면 BE 가 'success' 는 보냈지만 Neo4j commit/index 가 아직 visible 하지
 * 않아 빈 응답 받는 케이스 발견. 사용자는 "최신 업데이트 끝났는데 빈 화면"
 * 으로 답답함 호소.
 *
 * 대응:
 *   - 평소 fetch (탭 mount, project 변경) → 1회 호출, retry 없음 (불필요한 지연 회피)
 *   - 'expectData' 명시한 fetch (createSpack 직후) → 빈 응답 시 800ms 대기 후 재시도,
 *     최대 3회 (= 약 1.6s 추가 지연 한도)
 *
 * 동일 패턴을 SPACK·DDD·Architecture 모두 적용.
 */
import axios from '@/utils/axios'

const DEFAULT_DELAY_MS = 800

/**
 * Design GET API 의 raw payload 추출.
 *
 * BE 는 `{ result: [<obj>] }` 또는 직접 `[ <obj> ]` 형태로 반환. 둘 다 지원.
 * 빈 응답이면 빈 객체.
 */
export const extractRaw = (response) => {
  return response?.data?.result?.[0] ?? response?.data?.[0] ?? {}
}

/**
 * 빈 응답 시 재시도하는 GET fetch.
 *
 * @param {Object} opts
 * @param {string} opts.url            절대/상대 URL
 * @param {Object} opts.params         axios params
 * @param {Function} opts.isEmpty      (raw) => boolean — true 면 retry 트리거
 * @param {number} [opts.maxAttempts=1] 최대 시도 횟수 (1 = retry 없음)
 * @param {number} [opts.delayMs=800]   재시도 사이 대기
 * @returns {Promise<Object>} axios response (마지막 시도)
 */
export const fetchWithRetryIfEmpty = async ({ url, params, isEmpty, maxAttempts = 1, delayMs = DEFAULT_DELAY_MS }) => {
  let lastResp = null
  for (let i = 0; i < maxAttempts; i++) {
    lastResp = await axios.get(url, { params })
    const raw = extractRaw(lastResp)
    if (!isEmpty(raw) || i === maxAttempts - 1) return lastResp
    await new Promise(r => setTimeout(r, delayMs))
  }
  return lastResp
}

// 각 탭의 "빈 응답" 판정 — hasXxxData 와 동일 기준.
export const isSpackEmpty = (raw) =>
  !((raw.apis?.length || 0) > 0 || (raw.entities?.length || 0) > 0 || (raw.policies?.length || 0) > 0)

export const isDddEmpty = (raw) =>
  !((raw.contexts?.length || 0) > 0 || (raw.aggregates?.length || 0) > 0)

export const isArchitectureEmpty = (raw) =>
  !((raw.services?.length || 0) > 0 || (raw.databases?.length || 0) > 0)
