/**
 * lineageExcel — PRD→설계 추적성(Lineage)을 xlsx 2시트로.
 *
 * Lineage 의 핵심 가치는 "이 설계가 어느 PRD 문장에서 나왔나"(추적성)다.
 * 그래프를 표로 떨어뜨려 감사·리뷰에 쓴다 — 특히 inferred(검토 권장) 관계와
 * PRD 근거 인용문을 한 시트에서 일괄 검토할 수 있게.
 *   - Elements:      id · type · name (그래프 노드)
 *   - Traceability:  source · target · 관계 · confidence · PRD 근거 인용문 (엣지)
 *
 * 순수 함수(네트워크/DOM 없음): 호출부가 lineage 그래프(nodes/edges)를 주입.
 * 데이터 모양은 GET /api/v2/graph/lineage 응답 계약과 동일.
 *   node: { id, label, properties: { name|summary|title, ... } }
 *   edge: { source_id, target_id, type, properties: { confidence, quote } }
 */
import * as XLSX from 'xlsx'

const SHEETS = { elements: 'Elements', traceability: 'Traceability' }
const nodeName = (n) =>
  n?.properties?.name || n?.properties?.summary || n?.properties?.title || n?.id || ''

/**
 * lineage 그래프(nodes/edges) → xlsx 워크북 (Elements / Traceability 2시트).
 * @param {Array} [nodes]
 * @param {Array} [edges]
 * @returns {import('xlsx').WorkBook}
 */
export function buildLineageWorkbook(nodes = [], edges = []) {
  const nameById = new Map(nodes.map((n) => [n.id, nodeName(n)]))
  const typeById = new Map(nodes.map((n) => [n.id, n.label || '']))

  const elementRows = nodes.map((n) => ({ id: n.id, type: n.label || '', name: nameById.get(n.id) || '' }))
  const traceRows = edges.map((e) => ({
    source: nameById.get(e.source_id) || e.source_id,
    source_type: typeById.get(e.source_id) || '',
    target: nameById.get(e.target_id) || e.target_id,
    target_type: typeById.get(e.target_id) || '',
    relation: e.type || '',
    confidence: e.properties?.confidence || '',
    prd_quote: e.properties?.quote || '',
  }))

  // 빈 데이터여도 헤더 행은 남겨 사용자가 컬럼을 인지하게.
  const sheet = (rows, header) =>
    rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([header])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet(elementRows, ['id', 'type', 'name']), SHEETS.elements)
  XLSX.utils.book_append_sheet(
    wb,
    sheet(traceRows, ['source', 'source_type', 'target', 'target_type', 'relation', 'confidence', 'prd_quote']),
    SHEETS.traceability,
  )
  return wb
}

/** 워크북 → ArrayBuffer (브라우저 Blob/download 용). */
export function lineageWorkbookToArrayBuffer(wb) {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

export { SHEETS as LINEAGE_SHEET_NAMES }
