import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '@/plugins/i18n'
import {
  truthArrayFromMap,
  exportTruthToCsv,
  exportTruthToJson,
  importTruthFromCsv,
  importTruthFromJson,
} from '@/utils/lineageTruthIO'

// 에러 reason 문자열이 i18n 으로 이관됨 → jsdom 기본 locale('en') 대신 ko 고정해 한국어 단언 유지.
beforeEach(() => { i18n.global.locale.value = 'ko' })

describe('truthArrayFromMap', () => {
  it('Map 구조를 평면 배열로 변환', () => {
    const truthByType = {
      api: new Map([['api-1', ['a.ts', 'b.ts']]]),
      service: new Map([['svc-1', ['s.ts']]]),
    }
    const out = truthArrayFromMap(truthByType)
    expect(out).toHaveLength(2)
    expect(out).toContainEqual({ itemType: 'api', itemId: 'api-1', expectedFiles: ['a.ts', 'b.ts'] })
    expect(out).toContainEqual({ itemType: 'service', itemId: 'svc-1', expectedFiles: ['s.ts'] })
  })

  it('빈 입력 → 빈 배열', () => {
    expect(truthArrayFromMap({})).toEqual([])
    expect(truthArrayFromMap(null)).toEqual([])
  })
})

describe('exportTruthToCsv', () => {
  it('헤더 + 행 생성', () => {
    const csv = exportTruthToCsv([
      { itemType: 'api', itemId: 'api-1', expectedFiles: ['a.ts', 'b.ts'] },
    ])
    expect(csv).toBe('itemType,itemId,expectedFiles\napi,api-1,a.ts;b.ts')
  })

  it('쉼표/따옴표 escape (RFC 4180)', () => {
    const csv = exportTruthToCsv([
      { itemType: 'api', itemId: 'a,b', expectedFiles: ['"x".ts'] },
    ])
    expect(csv).toContain('"a,b"')
    expect(csv).toContain('"""x"".ts"')
  })

  it('빈 expectedFiles', () => {
    const csv = exportTruthToCsv([
      { itemType: 'api', itemId: 'x', expectedFiles: [] },
    ])
    expect(csv).toBe('itemType,itemId,expectedFiles\napi,x,')
  })
})

describe('exportTruthToJson', () => {
  it('pretty 출력', () => {
    const json = exportTruthToJson([{ itemType: 'api', itemId: 'a', expectedFiles: [] }])
    expect(json).toContain('\n')
    expect(JSON.parse(json)).toEqual([{ itemType: 'api', itemId: 'a', expectedFiles: [] }])
  })
})

describe('importTruthFromCsv', () => {
  it('정상 CSV', () => {
    const r = importTruthFromCsv('itemType,itemId,expectedFiles\napi,api-1,a.ts;b.ts\nservice,svc-1,s.ts')
    expect(r.items).toHaveLength(2)
    expect(r.errors).toHaveLength(0)
    expect(r.items[0]).toEqual({ itemType: 'api', itemId: 'api-1', expectedFiles: ['a.ts', 'b.ts'] })
  })

  it('CRLF 처리', () => {
    const r = importTruthFromCsv('itemType,itemId,expectedFiles\r\napi,a,x.ts')
    expect(r.items).toHaveLength(1)
  })

  it('헤더 누락 → 에러', () => {
    const r = importTruthFromCsv('a,b,c\napi,1,x')
    expect(r.errors[0].reason).toContain('헤더 누락')
    expect(r.items).toHaveLength(0)
  })

  it('알 수 없는 itemType은 skip + 에러 보고', () => {
    const r = importTruthFromCsv('itemType,itemId,expectedFiles\nfoo,a,x.ts\napi,b,y.ts')
    expect(r.items).toHaveLength(1)
    expect(r.skipped).toBe(1)
    expect(r.errors[0].reason).toContain('알 수 없는 itemType')
  })

  it('itemType/itemId 누락 시 skip', () => {
    const r = importTruthFromCsv('itemType,itemId,expectedFiles\n,a,x\napi,,y')
    expect(r.items).toHaveLength(0)
    expect(r.skipped).toBe(2)
  })

  it('quoted 필드 + 내부 따옴표', () => {
    const r = importTruthFromCsv('itemType,itemId,expectedFiles\napi,"id, with comma","""a"".ts;b.ts"')
    expect(r.items).toHaveLength(1)
    expect(r.items[0].itemId).toBe('id, with comma')
    expect(r.items[0].expectedFiles).toEqual(['"a".ts', 'b.ts'])
  })

  it('빈 expectedFiles', () => {
    const r = importTruthFromCsv('itemType,itemId,expectedFiles\napi,a,')
    expect(r.items[0].expectedFiles).toEqual([])
  })

  it('빈 입력', () => {
    expect(importTruthFromCsv('').errors[0].reason).toContain('빈')
    expect(importTruthFromCsv(null).errors[0].reason).toContain('빈')
  })
})

describe('importTruthFromJson', () => {
  it('정상 JSON', () => {
    const r = importTruthFromJson(JSON.stringify([
      { itemType: 'api', itemId: 'a', expectedFiles: ['x.ts'] },
    ]))
    expect(r.items).toHaveLength(1)
    expect(r.errors).toHaveLength(0)
  })

  it('잘못된 JSON', () => {
    const r = importTruthFromJson('{not json}')
    expect(r.errors[0].reason).toContain('파싱 실패')
  })

  it('배열 아님', () => {
    const r = importTruthFromJson('{"a":1}')
    expect(r.errors[0].reason).toContain('배열')
  })

  it('itemType normalize (대문자)', () => {
    const r = importTruthFromJson(JSON.stringify([
      { itemType: 'API', itemId: 'a', expectedFiles: [] },
    ]))
    expect(r.items[0].itemType).toBe('api')
  })

  it('expectedFiles 누락 → 빈 배열', () => {
    const r = importTruthFromJson(JSON.stringify([{ itemType: 'api', itemId: 'a' }]))
    expect(r.items[0].expectedFiles).toEqual([])
  })
})
