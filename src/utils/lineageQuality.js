/**
 * Lineage 매칭 품질 평가 (precision / recall / F1).
 *
 * ─── 입력 형태 ───────────────────────────────────────
 * actual (n8n analyzeLineage 결과):
 *   [{ id, name, type, implementations: [{ filePath, repoUrl, confidence }] }]
 *
 * truth (Neo4j 또는 fixture에서 조회한 정답 후보 set):
 *   [{ id, expectedFiles: ['src/auth/UserService.ts', ...] }]
 *
 * ─── 매칭 정책 ──────────────────────────────────────
 * - 파일 경로는 `normalizeFilePath`로 정규화 후 비교
 *   - 양 끝 슬래시/공백 제거
 *   - repo prefix(예: "owner/repo/") 제거 — basename 위주 비교
 *   - 대소문자 통일 (Windows 호환)
 * - 매칭 모드:
 *   - 'exact'   : 정규화 경로가 정확히 같음 (default)
 *   - 'endsWith': actual 경로가 truth 경로로 끝남 (디렉토리 기준 truth에 유리)
 *
 * ─── 지표 정의 ──────────────────────────────────────
 * 산출물 1개에 대해:
 *   TP = actual ∩ truth   (정답에 있는 매칭)
 *   FP = actual − truth   (정답에 없는데 매칭됨)
 *   FN = truth − actual   (정답인데 매칭 못 함)
 *   precision = TP / (TP + FP)
 *   recall    = TP / (TP + FN)
 *   F1        = 2·P·R / (P + R)
 *
 * 전체 점수:
 *   - macro: 산출물별 점수의 단순 평균 (작은 산출물에 동등 가중)
 *   - micro: 전체 TP/FP/FN 합산 후 계산 (큰 산출물에 가중)
 *
 * 둘 다 보고 — 분포 편향 감지에 유용.
 */

const isString = (v) => typeof v === 'string'

/**
 * 파일 경로 정규화. 비교 키로 사용.
 * 빈/null 입력은 빈 문자열 반환.
 */
export const normalizeFilePath = (path) => {
  if (!isString(path)) return ''
  return path
    .trim()
    .replace(/\\/g, '/')          // Windows backslash → forward slash
    .replace(/^\/+/, '')          // 시작 슬래시 제거
    .replace(/\/+$/, '')          // 끝 슬래시 제거
    .toLowerCase()                // 대소문자 통일
}

/**
 * actual의 파일이 truth set에 포함되는지 검사.
 * mode: 'exact' | 'endsWith'
 */
export const matchesAny = (actualPath, truthSet, mode = 'exact') => {
  const a = normalizeFilePath(actualPath)
  if (!a) return false
  if (mode === 'exact') return truthSet.has(a)
  if (mode === 'endsWith') {
    for (const t of truthSet) {
      if (a === t || a.endsWith('/' + t)) return true
    }
    return false
  }
  return false
}

/**
 * 산출물 1개에 대한 confusion 카운트 + 지표 계산.
 * actualFiles, expectedFiles는 정규화 전 raw 배열.
 */
export const evaluateItem = (actualFiles, expectedFiles, mode = 'exact') => {
  const truthSet = new Set((expectedFiles || []).map(normalizeFilePath).filter(Boolean))
  const actualSet = new Set((actualFiles || []).map(normalizeFilePath).filter(Boolean))

  let tp = 0
  let fp = 0
  for (const a of actualSet) {
    if (matchesAny(a, truthSet, mode)) tp++
    else fp++
  }
  // FN = truth 중 actual로부터 매칭되지 않은 것
  // 'endsWith' 모드에서는 truth → actual 방향도 동일 로직 필요
  let fn = 0
  for (const t of truthSet) {
    let matched = false
    for (const a of actualSet) {
      if (mode === 'exact' && a === t) { matched = true; break }
      if (mode === 'endsWith' && (a === t || a.endsWith('/' + t))) { matched = true; break }
    }
    if (!matched) fn++
  }

  const precision = tp + fp === 0 ? null : tp / (tp + fp)
  const recall    = tp + fn === 0 ? null : tp / (tp + fn)
  const f1 =
    precision !== null && recall !== null && (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : null

  return { tp, fp, fn, precision, recall, f1 }
}

/**
 * 전체 lineage 결과 평가.
 *
 * @param {Array} actual - [{ id, implementations: [{ filePath }] }]
 * @param {Array} truth  - [{ id, expectedFiles: [string] }]
 * @param {Object} options - { mode, idKey }
 * @returns {{
 *   perItem: Array<{id, ...counts, precision, recall, f1}>,
 *   macro:   {precision, recall, f1},
 *   micro:   {precision, recall, f1, tp, fp, fn},
 *   coverage: {labeled: number, total: number},  // truth가 있는 산출물 수 / 전체
 * }}
 */
export const evaluateLineage = (actual, truth, options = {}) => {
  const { mode = 'exact', idKey = 'id' } = options
  const truthMap = new Map()
  for (const t of (truth || [])) {
    if (t && t[idKey] != null) truthMap.set(String(t[idKey]), t.expectedFiles || [])
  }

  const perItem = []
  let microTp = 0, microFp = 0, microFn = 0

  for (const item of (actual || [])) {
    if (!item || item[idKey] == null) continue
    const id = String(item[idKey])
    const expected = truthMap.get(id)
    if (!expected) continue // 라벨이 없는 산출물은 평가 제외

    const actualFiles = (item.implementations || []).map(i => i?.filePath).filter(Boolean)
    const counts = evaluateItem(actualFiles, expected, mode)
    perItem.push({ id, name: item.name, ...counts })

    microTp += counts.tp
    microFp += counts.fp
    microFn += counts.fn
  }

  // Macro: perItem의 평균 (null 제외)
  const avg = (key) => {
    const vals = perItem.map(p => p[key]).filter(v => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const macro = { precision: avg('precision'), recall: avg('recall'), f1: avg('f1') }

  // Micro: 합산 후 계산
  const microP = microTp + microFp === 0 ? null : microTp / (microTp + microFp)
  const microR = microTp + microFn === 0 ? null : microTp / (microTp + microFn)
  const microF1 =
    microP !== null && microR !== null && (microP + microR) > 0
      ? (2 * microP * microR) / (microP + microR)
      : null
  const micro = { precision: microP, recall: microR, f1: microF1, tp: microTp, fp: microFp, fn: microFn }

  return {
    perItem,
    macro,
    micro,
    coverage: { labeled: perItem.length, total: (actual || []).length },
  }
}
