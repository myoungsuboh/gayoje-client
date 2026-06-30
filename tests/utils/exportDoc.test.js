/**
 * exportDoc 유틸 — 파일명 slug + markdown 다운로드 + 클립보드 복사.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  safeFilename,
  dateStamp,
  buildDocFilename,
  downloadMarkdown,
  copyToClipboard,
} from '@/utils/exportDoc'

describe('safeFilename', () => {
  it('공백을 underscore 로 바꾸고 한글은 보존한다', () => {
    expect(safeFilename('오늘 반찬 앱')).toBe('오늘_반찬_앱')
  })
  it('경로 구분자/특수문자를 제거한다', () => {
    expect(safeFilename('a/b:c*d?e')).toBe('a_b_c_d_e')
  })
  it('빈 값이면 fallback 을 쓴다', () => {
    expect(safeFilename('', 'doc')).toBe('doc')
    expect(safeFilename('   ', 'doc')).toBe('doc')
  })
})

describe('dateStamp', () => {
  it('YYYYMMDD 형식을 반환한다', () => {
    expect(dateStamp(new Date('2026-05-31T09:00:00Z'))).toBe('20260531')
  })
})

describe('buildDocFilename', () => {
  it('프로젝트명_타입_날짜.md 를 만든다', () => {
    const f = buildDocFilename('PRD', '오늘반찬')
    expect(f).toMatch(/^오늘반찬_PRD_\d{8}\.md$/)
  })
})

describe('downloadMarkdown', () => {
  let clickSpy
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy, set href(v) {}, set download(v) {} })
  })
  afterEach(() => vi.restoreAllMocks())

  it('blob URL 을 만들고 링크 클릭으로 다운로드한다', () => {
    downloadMarkdown('# hello', 'test.md')
    expect(global.URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(global.URL.revokeObjectURL).toHaveBeenCalled()
  })
})

describe('copyToClipboard', () => {
  afterEach(() => vi.restoreAllMocks())

  it('navigator.clipboard 가 있으면 그걸 쓴다', async () => {
    const writeText = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const ok = await copyToClipboard('hi')
    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hi')
    vi.unstubAllGlobals()
  })
})
