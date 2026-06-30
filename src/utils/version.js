/**
 * 미팅 로그 / CPS / PRD 버전 비교 유틸 — 단일 SoT.
 *
 * [배경 — 2026-05-18]
 * 사용자 신고: 히스토리 정렬에서 V10 이 V3 앞에 오는 버그.
 * 원인: 기존 정렬은 v#.# 패턴만 처리하고 "V10" 같은 단일 정수 패턴은 0 으로
 * 처리 → 사실상 정렬 안 됨 + 백엔드 lexicographic 순서 그대로 노출.
 *
 * 현재 시스템에서 쓰이는 버전 포맷:
 *   1) "v1.1", "v1.2", "v1.10"  — 점버전 (소문자, 두 segment)
 *   2) "V1", "V2", ..., "V10", "V14" — 정수 버전 (대문자, 배치 import 산출물)
 *
 * 비교 규칙:
 *   - 두 segment 모두 숫자로 비교 (자연 정렬)
 *   - 점버전은 (major, minor) 튜플
 *   - 정수 버전은 (0, n) 으로 처리 — 모든 점버전(v1.* 이상)보다 작게
 *     (실제로 V* 와 v1.* 가 동시 존재할 일이 거의 없지만 안정성 위해 정의)
 */

/**
 * 버전 문자열을 정렬 가능한 [major, minor] 튜플로 변환.
 *
 * @param {string} version
 * @returns {[number, number]}
 */
const parseVersion = (version) => {
  if (typeof version !== 'string') return [-1, -1]

  // v#.# 또는 V#.# 패턴 (점버전)
  const dotted = version.match(/^[vV](\d+)\.(\d+)$/)
  if (dotted) return [parseInt(dotted[1], 10), parseInt(dotted[2], 10)]

  // V# 또는 v# 패턴 (단일 정수)
  const single = version.match(/^[vV](\d+)$/)
  if (single) return [0, parseInt(single[1], 10)]

  return [-1, -1]
}

/**
 * 버전 비교 — a < b 이면 음수, a > b 이면 양수.
 *
 * @example compareVersions('V10', 'V3') > 0   // V10 이 더 큼
 * @example compareVersions('v1.10', 'v1.2') > 0
 */
export const compareVersions = (a, b) => {
  const [aMajor, aMinor] = parseVersion(a)
  const [bMajor, bMinor] = parseVersion(b)
  if (aMajor !== bMajor) return aMajor - bMajor
  return aMinor - bMinor
}

/**
 * 내림차순 정렬 (최신 → 과거).
 * 히스토리 리스트, nextVersion 계산용.
 */
export const compareVersionsDesc = (a, b) => compareVersions(b, a)

/**
 * 다음 버전 추정.
 * 점버전(v1.3) → v1.4. 정수버전(V10) → V11. 알 수 없는 입력 → 'v1.1'.
 *
 * @param {string|null|undefined} latest
 * @returns {string}
 */
export const computeNextVersion = (latest) => {
  if (typeof latest !== 'string') return 'v1.1'
  const dotted = latest.match(/^([vV])(\d+)\.(\d+)$/)
  if (dotted) {
    const prefix = dotted[1]
    const major = parseInt(dotted[2], 10)
    const minor = parseInt(dotted[3], 10)
    return `${prefix}${major}.${minor + 1}`
  }
  const single = latest.match(/^([vV])(\d+)$/)
  if (single) {
    return `${single[1]}${parseInt(single[2], 10) + 1}`
  }
  return 'v1.1'
}
