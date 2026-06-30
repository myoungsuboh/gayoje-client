/**
 * erdExcel — ERD(엔티티·속성·관계)를 xlsx 워크북으로 (3시트).
 *
 * buildErdModel(erdGraph) 재활용 — ERD 화면과 동일 parseAttrs 정규화로
 * "화면엔 보이는데 export 엔 빠지던" 불일치를 막는다. 시트명/헤더는 영문 고정
 * (데이터 export — SQL·코드 친화, 재가공/협업용이라 i18n 불필요).
 *
 * 순수 함수(네트워크/DOM 없음): 호출부가 spack/ddd 를 fetch 해 주입, 결과 wb 를 download.
 */
import * as XLSX from 'xlsx'
import { buildErdModel } from '@/utils/erdGraph'

const SHEETS = { entities: 'Entities', attributes: 'Attributes', relations: 'Relations' }

/**
 * SPACK + DDD → xlsx 워크북 (Entities / Attributes / Relations 3시트).
 * @param {Object} [spack]
 * @param {Object} [ddd]
 * @returns {import('xlsx').WorkBook}
 */
export function buildErdWorkbook(spack = {}, ddd = {}) {
  const { nodes, edges } = buildErdModel(spack, ddd)
  const nameById = new Map(nodes.map((n) => [n.id, n.name]))

  // description 은 buildErdModel 결과에 없어 원본에서 보강 (id 매칭).
  const descById = new Map()
  for (const e of spack.entities || []) descById.set(e.id, e.description || e.desc || '')
  for (const de of ddd.domain_entities || []) descById.set(de.id, de.description || de.desc || '')

  const entityRows = nodes.map((n) => ({
    id: n.id, name: n.name, kind: n.kind, description: descById.get(n.id) || '',
  }))
  const attrRows = nodes.flatMap((n) =>
    (n.attrs || []).map((a) => ({
      entity: n.name,
      field: a.name,
      type: a.type || '',
      required: a.required ? 'Y' : '',
      constraint: a.constraint || '',
    })),
  )
  const relRows = edges.map((e) => ({
    source: nameById.get(e.from) || e.from,
    target: nameById.get(e.to) || e.to,
    type: e.type,
  }))

  // 빈 데이터여도 헤더 행은 남겨 사용자가 컬럼을 인지하게 (json_to_sheet([]) 은 헤더가 없다).
  const sheet = (rows, header) =>
    rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([header])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet(entityRows, ['id', 'name', 'kind', 'description']), SHEETS.entities)
  XLSX.utils.book_append_sheet(wb, sheet(attrRows, ['entity', 'field', 'type', 'required', 'constraint']), SHEETS.attributes)
  XLSX.utils.book_append_sheet(wb, sheet(relRows, ['source', 'target', 'type']), SHEETS.relations)
  return wb
}

/** 워크북 → ArrayBuffer (브라우저 Blob/download 용). */
export function erdWorkbookToArrayBuffer(wb) {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

export { SHEETS as ERD_SHEET_NAMES }
