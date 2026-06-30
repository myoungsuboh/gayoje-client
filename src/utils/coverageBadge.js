/**
 * Coverage 뱃지 생성 유틸 (shields.io 호환).
 *
 * shields.io URL 형식:
 *   https://img.shields.io/badge/{label}-{message}-{color}
 *
 * 색상 정책 (Lighthouse 스타일):
 *   >= 90 → brightgreen
 *   >= 75 → green
 *   >= 60 → yellow
 *   >= 40 → orange
 *   <  40 → red
 *   null  → lightgrey
 */

export const coverageColor = (pct) => {
  if (pct == null || Number.isNaN(pct)) return 'lightgrey'
  if (pct >= 90) return 'brightgreen'
  if (pct >= 75) return 'green'
  if (pct >= 60) return 'yellow'
  if (pct >= 40) return 'orange'
  return 'red'
}

// shields.io 인코딩: 하이픈/언더스코어/공백 처리
const encodeShield = (s) => String(s ?? '')
  .replace(/-/g, '--')
  .replace(/_/g, '__')
  .replace(/ /g, '_')

/**
 * @param {object} opts
 * @param {string} opts.label - 뱃지 왼쪽 라벨 (예: "lineage coverage")
 * @param {number|null} opts.pct - 0-100 정수 또는 null
 * @param {string} [opts.style] - 'flat' (default) | 'flat-square' | 'plastic' | 'for-the-badge'
 * @returns {string} 뱃지 이미지 URL
 */
export const buildBadgeUrl = ({ label, pct, style = 'flat' }) => {
  const color = coverageColor(pct)
  const message = pct == null ? 'unknown' : `${pct}${'%25'}` // %25 = encoded %
  const base = 'https://img.shields.io/badge'
  return `${base}/${encodeShield(label)}-${message}-${color}?style=${style}`
}

/**
 * Markdown 뱃지 스니펫 생성.
 * @param {object} opts
 * @param {string} opts.label
 * @param {number|null} opts.pct
 * @param {string} [opts.linkUrl] - 클릭 시 이동할 URL (옵션)
 * @param {string} [opts.altText] - 접근성 alt
 */
export const buildBadgeMarkdown = ({ label, pct, linkUrl, altText, style }) => {
  const imgUrl = buildBadgeUrl({ label, pct, style })
  const alt = altText || `${label}: ${pct == null ? 'unknown' : pct + '%'}`
  const img = `![${alt}](${imgUrl})`
  return linkUrl ? `[${img}](${linkUrl})` : img
}

/**
 * 종합 뱃지 세트 — 프로젝트 README에 한꺼번에 붙일 만한 묶음.
 *
 * @param {object} metrics - 각 키는 0-100 정수 또는 null
 *   { lineageCoverage, precision, recall, f1, lintAvg }
 * @param {object} [opts]
 * @param {string} [opts.linkUrl]
 * @param {string} [opts.style]
 */
export const buildBadgeSet = (metrics, opts = {}) => {
  const items = [
    { key: 'lineageCoverage', label: 'lineage coverage' },
    { key: 'precision', label: 'precision' },
    { key: 'recall', label: 'recall' },
    { key: 'f1', label: 'F1' },
    { key: 'lintAvg', label: 'lint' },
  ]
  return items
    .filter(it => metrics[it.key] != null)
    .map(it => buildBadgeMarkdown({ label: it.label, pct: metrics[it.key], ...opts }))
    .join(' ')
}
