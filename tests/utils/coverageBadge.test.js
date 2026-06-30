import { describe, it, expect } from 'vitest'
import {
  coverageColor,
  buildBadgeUrl,
  buildBadgeMarkdown,
  buildBadgeSet,
} from '@/utils/coverageBadge'

describe('coverageColor', () => {
  it('범위별 색상', () => {
    expect(coverageColor(95)).toBe('brightgreen')
    expect(coverageColor(80)).toBe('green')
    expect(coverageColor(65)).toBe('yellow')
    expect(coverageColor(45)).toBe('orange')
    expect(coverageColor(10)).toBe('red')
  })

  it('경계값', () => {
    expect(coverageColor(90)).toBe('brightgreen')
    expect(coverageColor(75)).toBe('green')
    expect(coverageColor(60)).toBe('yellow')
    expect(coverageColor(40)).toBe('orange')
    expect(coverageColor(0)).toBe('red')
  })

  it('null/NaN → lightgrey', () => {
    expect(coverageColor(null)).toBe('lightgrey')
    expect(coverageColor(NaN)).toBe('lightgrey')
  })
})

describe('buildBadgeUrl', () => {
  it('기본 URL 형식', () => {
    const url = buildBadgeUrl({ label: 'coverage', pct: 85 })
    expect(url).toBe('https://img.shields.io/badge/coverage-85%25-green?style=flat')
  })

  it('공백/하이픈 인코딩', () => {
    const url = buildBadgeUrl({ label: 'lineage coverage', pct: 70 })
    expect(url).toContain('lineage_coverage')
  })

  it('하이픈은 -- 로 escape', () => {
    const url = buildBadgeUrl({ label: 'a-b', pct: 50 })
    expect(url).toContain('a--b')
  })

  it('null pct → unknown', () => {
    const url = buildBadgeUrl({ label: 'x', pct: null })
    expect(url).toContain('unknown')
    expect(url).toContain('lightgrey')
  })

  it('style 옵션', () => {
    const url = buildBadgeUrl({ label: 'x', pct: 80, style: 'for-the-badge' })
    expect(url).toContain('style=for-the-badge')
  })
})

describe('buildBadgeMarkdown', () => {
  it('기본 마크다운 이미지', () => {
    const md = buildBadgeMarkdown({ label: 'cov', pct: 80 })
    expect(md).toMatch(/^!\[cov: 80%\]\(https:\/\/img\.shields\.io\//)
  })

  it('linkUrl 있으면 링크로 wrap', () => {
    const md = buildBadgeMarkdown({ label: 'cov', pct: 80, linkUrl: 'https://example.com' })
    expect(md).toMatch(/^\[!\[.*\]\(https:\/\/img\.shields\.io\/.+\)\]\(https:\/\/example\.com\)$/)
  })

  it('altText override', () => {
    const md = buildBadgeMarkdown({ label: 'cov', pct: 80, altText: 'Custom alt' })
    expect(md).toContain('![Custom alt]')
  })

  it('null pct', () => {
    const md = buildBadgeMarkdown({ label: 'cov', pct: null })
    expect(md).toContain('cov: unknown')
  })
})

describe('buildBadgeSet', () => {
  // 뱃지 수 = `![` 토큰 카운트 (alt에 공백 있어 split(' ')은 부정확)
  const countBadges = (md) => (md.match(/!\[/g) || []).length

  it('전체 metric 포함', () => {
    const set = buildBadgeSet({
      lineageCoverage: 85,
      precision: 92,
      recall: 78,
      f1: 84,
      lintAvg: 95,
    })
    expect(countBadges(set)).toBe(5)
    expect(set).toContain('lineage_coverage')
    expect(set).toContain('precision')
    expect(set).toContain('F1')
    expect(set).toContain('lint')
  })

  it('null인 항목은 제외', () => {
    const set = buildBadgeSet({ lineageCoverage: 80, precision: null, recall: 70, f1: null, lintAvg: null })
    expect(countBadges(set)).toBe(2)
    expect(set).toContain('lineage_coverage')
    expect(set).toContain('recall')
    expect(set).not.toContain('precision')
  })

  it('전부 null이면 빈 문자열', () => {
    expect(buildBadgeSet({ lineageCoverage: null, precision: null, recall: null, f1: null, lintAvg: null })).toBe('')
  })
})
