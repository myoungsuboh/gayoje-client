import { describe, it, expect, vi, beforeEach } from 'vitest'
import { downloadText, downloadMarkdown } from '@/utils/download'

describe('downloadText', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  it('컨텐츠 비어있으면 throw', () => {
    expect(() => downloadText('', 'a.txt')).toThrow('컨텐츠가 비어있습니다')
  })

  it('파일명 없으면 throw', () => {
    expect(() => downloadText('hi', '')).toThrow('파일명이 지정되지 않았습니다')
  })

  it('정상 호출 시 anchor 생성 + click + cleanup', () => {
    // jsdom에서 실제 anchor element를 사용 (mock 대신 spy)
    const click = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag)
      if (tag === 'a') el.click = click
      return el
    })

    downloadText('hello', 'test.txt')

    expect(click).toHaveBeenCalled()
    expect(global.URL.createObjectURL).toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

describe('downloadMarkdown', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock')
    global.URL.revokeObjectURL = vi.fn()
  })

  it('확장자 없으면 .md 자동 추가', () => {
    const created = []
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      const a = { click: vi.fn(), style: {}, _download: '' }
      Object.defineProperty(a, 'download', {
        set(v) { a._download = v; created.push(v) },
        get() { return a._download },
      })
      Object.defineProperty(a, 'href', { set() {}, get() { return '' } })
      return a
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})

    downloadMarkdown('# hi', 'plan')
    expect(created[0]).toBe('plan.md')

    downloadMarkdown('# hi', 'plan.md')
    expect(created[1]).toBe('plan.md')

    vi.restoreAllMocks()
  })
})
