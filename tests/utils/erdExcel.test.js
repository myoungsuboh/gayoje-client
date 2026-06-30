import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildErdWorkbook, erdWorkbookToArrayBuffer } from '@/utils/erdExcel'

describe('buildErdWorkbook — ERD → xlsx 3시트', () => {
  const wb = buildErdWorkbook(
    {
      entities: [
        { id: 'e1', name: 'User', description: '회원', attributes: [
          { name: 'id', type: 'uuid', required: true },
          { name: 'email', type: 'string', constraint: 'unique' },
        ] },
        { id: 'e2', name: 'Order', attributes: '[{"name":"total","type":"int"}]' },  // JSON string 흡수
      ],
      entity_mapping_rels: [{ source_id: 'e1', target_id: 'g1', type: 'MAPS_TO' }],
    },
    { aggregates: [{ id: 'g1', name: 'UserAgg' }] },
  )

  it('3시트(Entities/Attributes/Relations)', () => {
    expect(wb.SheetNames).toEqual(['Entities', 'Attributes', 'Relations'])
  })

  it('Entities — id/name/kind/description (Aggregate 포함)', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Entities)
    expect(rows).toContainEqual(expect.objectContaining({ name: 'User', kind: 'Entity', description: '회원' }))
    expect(rows).toContainEqual(expect.objectContaining({ name: 'UserAgg', kind: 'Aggregate' }))
  })

  it('Attributes — entity/field/type/required + JSON string 파싱', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Attributes)
    expect(rows).toContainEqual(expect.objectContaining({ entity: 'User', field: 'id', type: 'uuid', required: 'Y' }))
    expect(rows).toContainEqual(expect.objectContaining({ entity: 'User', field: 'email', constraint: 'unique' }))
    expect(rows).toContainEqual(expect.objectContaining({ entity: 'Order', field: 'total', type: 'int' }))
  })

  it('Relations — id→name 해석 + buildErdModel 의 MAPPED_TO 타입', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Relations)
    expect(rows).toContainEqual(expect.objectContaining({ source: 'User', target: 'UserAgg', type: 'MAPPED_TO' }))
  })

  it('빈 데이터도 3시트 유지 (크래시 없음)', () => {
    const empty = buildErdWorkbook({}, {})
    expect(empty.SheetNames).toEqual(['Entities', 'Attributes', 'Relations'])
  })

  it('erdWorkbookToArrayBuffer — xlsx(zip) 매직 시그니처 PK', () => {
    const bytes = new Uint8Array(erdWorkbookToArrayBuffer(wb))
    expect(bytes[0]).toBe(0x50)  // 'P'
    expect(bytes[1]).toBe(0x4B)  // 'K' — zip/xlsx
  })
})
