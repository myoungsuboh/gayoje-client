/**
 * 줄 단위 diff — LCS (Longest Common Subsequence) 기반.
 *
 * 외부 의존성 없이 markdown 미리보기에서 변경 라인을 +/-/= 로 표시하기 위함.
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{type: 'same'|'added'|'removed', text: string}>}
 *   text 는 newline 제외한 한 라인.
 *
 * 시간 복잡도 O(N*M) — 한 PRD/CPS markdown 은 보통 100~500 라인이라
 * 50K~250K 셀 dp 매트릭스. 브라우저 메인 thread 에서 ms 수준.
 */
export function diffLines(oldText, newText) {
  const a = (oldText ?? '').split('\n')
  const b = (newText ?? '').split('\n')
  const m = a.length
  const n = b.length

  // dp[i][j] = LCS length for a[i..m-1] vs b[j..n-1]
  // Allocate (m+1) x (n+1) — 마지막 row/col 은 0 sentinel.
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // Backtrack — common 라인은 same, 분기는 removed/added.
  const result = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: a[i] })
      i++
    } else {
      result.push({ type: 'added', text: b[j] })
      j++
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: a[i++] })
  }
  while (j < n) {
    result.push({ type: 'added', text: b[j++] })
  }
  return result
}

/**
 * diff 통계 — modal header 에 표시 ("+12 / -5 / =100").
 */
export function diffStats(rows) {
  let added = 0
  let removed = 0
  let same = 0
  for (const r of rows) {
    if (r.type === 'added') added++
    else if (r.type === 'removed') removed++
    else same++
  }
  return { added, removed, same }
}
