import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildLineageWorkbook, lineageWorkbookToArrayBuffer } from '@/utils/lineageExcel'

describe('buildLineageWorkbook — Lineage → xlsx 2시트', () => {
  const wb = buildLineageWorkbook(
    [
      { id: 's1', label: 'Story', properties: { name: '회원가입' } },
      { id: 'svc1', label: 'ArchService', properties: { name: 'Auth Service' } },
      { id: 'n3', label: 'API', properties: { summary: 'POST /users' } },  // name 없으면 summary 폴백
    ],
    [
      { source_id: 'svc1', target_id: 's1', type: 'DERIVED_FROM', properties: { confidence: 'inferred', quote: '가입할 수 있다' } },
    ],
  )

  it('2시트(Elements/Traceability)', () => {
    expect(wb.SheetNames).toEqual(['Elements', 'Traceability'])
  })

  it('Elements — id/type/name (name 없으면 summary 폴백)', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Elements)
    expect(rows).toContainEqual(expect.objectContaining({ id: 's1', type: 'Story', name: '회원가입' }))
    expect(rows).toContainEqual(expect.objectContaining({ id: 'n3', type: 'API', name: 'POST /users' }))
  })

  it('Traceability — source/target name 해석 + confidence + PRD 근거 인용', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Traceability)
    expect(rows).toContainEqual(expect.objectContaining({
      source: 'Auth Service', source_type: 'ArchService',
      target: '회원가입', target_type: 'Story',
      relation: 'DERIVED_FROM', confidence: 'inferred', prd_quote: '가입할 수 있다',
    }))
  })

  it('빈 데이터도 2시트 유지', () => {
    expect(buildLineageWorkbook().SheetNames).toEqual(['Elements', 'Traceability'])
  })

  it('xlsx(zip) 매직 시그니처 PK', () => {
    const b = new Uint8Array(lineageWorkbookToArrayBuffer(wb))
    expect(b[0]).toBe(0x50)
    expect(b[1]).toBe(0x4B)
  })
})
