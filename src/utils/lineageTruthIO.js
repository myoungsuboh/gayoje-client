/**
 * Lineage 정답 라벨 CSV/JSON 직렬화 유틸.
 *
 * 포맷:
 *   CSV (3 columns, header 필수):
 *     itemType,itemId,expectedFiles
 *     api,api-001,"src/auth/A.ts;src/auth/B.ts"
 *     service,svc-1,src/users/UserSvc.ts
 *
 *   JSON (배열):
 *     [{ itemType, itemId, expectedFiles: [string] }, ...]
 *
 * 정책:
 *   - CSV expectedFiles는 세미콜론(;) 구분 — 쉼표는 경로/이름에 등장 가능
 *   - 따옴표 escape는 RFC 4180: 따옴표 내 따옴표는 ""로 두 번
 *   - itemType은 lowercase로 정규화
 *   - 중복 itemType+itemId는 마지막 값으로 덮어씀
 */
import i18n from '@/plugins/i18n'

// 비컴포넌트(util)에서 번역 — axios.js · glossary.js 와 동일 패턴.
const t = (key, params) => i18n.global.t(key, params)

const ITEM_TYPES = ['api', 'service', 'aggregate', 'story']

const isValidType = (t) => ITEM_TYPES.includes(String(t || '').toLowerCase())

// ─── Export ──────────────────────────────────────────────────
export const truthArrayFromMap = (truthByType) => {
  const out = []
  for (const [itemType, map] of Object.entries(truthByType || {})) {
    if (!map || typeof map.entries !== 'function') continue
    for (const [itemId, expectedFiles] of map.entries()) {
      out.push({ itemType, itemId: String(itemId), expectedFiles: Array.isArray(expectedFiles) ? expectedFiles : [] })
    }
  }
  return out
}

const csvEscapeCell = (value) => {
  const s = String(value ?? '')
  // 쉼표/따옴표/줄바꿈 포함 시 quoted + 내부 따옴표 escape
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export const exportTruthToCsv = (items) => {
  const header = 'itemType,itemId,expectedFiles'
  const rows = (items || []).map(item => {
    const files = (item.expectedFiles || []).join(';')
    return [csvEscapeCell(item.itemType), csvEscapeCell(item.itemId), csvEscapeCell(files)].join(',')
  })
  return [header, ...rows].join('\n')
}

export const exportTruthToJson = (items, { pretty = true } = {}) => {
  return JSON.stringify(items || [], null, pretty ? 2 : 0)
}

// ─── Import (parse) ──────────────────────────────────────────

// RFC 4180 single-line parser (multiline quoted fields not supported — simplification)
const parseCsvLine = (line) => {
  const cells = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else { inQuote = false }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
  }
  cells.push(cur)
  return cells
}

/**
 * CSV → 정답 라벨 배열 + 진단 리포트.
 * 반환: { items, errors: [{line, reason}], skipped: number }
 */
export const importTruthFromCsv = (csvText) => {
  const errors = []
  const items = []
  let skipped = 0

  if (!csvText || typeof csvText !== 'string') {
    return { items, errors: [{ line: 0, reason: t('quality.truth_io.reason_empty_csv') }], skipped: 0 }
  }

  const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter(l => l.length > 0)
  if (lines.length === 0) return { items, errors: [{ line: 0, reason: t('quality.truth_io.reason_no_content') }], skipped: 0 }

  // 헤더 검사
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const idxType = header.indexOf('itemtype')
  const idxId   = header.indexOf('itemid')
  const idxFiles = header.indexOf('expectedfiles')
  if (idxType < 0 || idxId < 0 || idxFiles < 0) {
    return { items, errors: [{ line: 1, reason: t('quality.truth_io.reason_header_missing') }], skipped: 0 }
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const itemType = (cells[idxType] || '').trim().toLowerCase()
    const itemId   = (cells[idxId] || '').trim()
    const filesRaw = (cells[idxFiles] || '').trim()

    if (!itemType || !itemId) {
      errors.push({ line: i + 1, reason: t('quality.truth_io.reason_type_id_missing') })
      skipped++
      continue
    }
    if (!isValidType(itemType)) {
      errors.push({ line: i + 1, reason: t('quality.truth_io.reason_unknown_type', { type: itemType }) })
      skipped++
      continue
    }
    const expectedFiles = filesRaw
      ? filesRaw.split(';').map(s => s.trim()).filter(Boolean)
      : []

    items.push({ itemType, itemId, expectedFiles })
  }

  return { items, errors, skipped }
}

/**
 * JSON → 정답 라벨 배열 (검증 포함).
 */
export const importTruthFromJson = (jsonText) => {
  const errors = []
  const items = []
  let skipped = 0

  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    return { items, errors: [{ line: 0, reason: t('quality.truth_io.reason_json_parse_failed', { message: e.message }) }], skipped: 0 }
  }
  if (!Array.isArray(parsed)) {
    return { items, errors: [{ line: 0, reason: t('quality.truth_io.reason_not_array') }], skipped: 0 }
  }

  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i] || {}
    const itemType = String(entry.itemType || '').toLowerCase()
    const itemId   = entry.itemId == null ? '' : String(entry.itemId)
    if (!itemType || !itemId) {
      errors.push({ line: i + 1, reason: t('quality.truth_io.reason_type_id_missing') })
      skipped++
      continue
    }
    if (!isValidType(itemType)) {
      errors.push({ line: i + 1, reason: t('quality.truth_io.reason_unknown_type', { type: itemType }) })
      skipped++
      continue
    }
    const expectedFiles = Array.isArray(entry.expectedFiles)
      ? entry.expectedFiles.map(s => String(s).trim()).filter(Boolean)
      : []
    items.push({ itemType, itemId, expectedFiles })
  }

  return { items, errors, skipped }
}
