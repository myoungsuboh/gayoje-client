import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseGithubUrl,
  buildGithubBlobLink,
  normalizeLanguages,
  buildCommitHeatmap,
  formatRelativeKr,
  formatBytes,
  parseRateLimit,
  formatCountdown,
} from '@/utils/github'
import i18n from '@/plugins/i18n'
// formatRelativeKr / formatCountdown 이 i18n 사용 → 한국어 단언 위해 locale 고정
i18n.global.locale.value = 'ko'

// Headers-like mock helper
const mockHeaders = (obj) => ({
  get: (k) => {
    const key = Object.keys(obj).find(x => x.toLowerCase() === k.toLowerCase())
    return key ? String(obj[key]) : null
  },
})

describe('parseGithubUrl', () => {
  it('표준 https URL 파싱', () => {
    expect(parseGithubUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('말미 슬래시 제거', () => {
    expect(parseGithubUrl('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('.git 접미사 제거', () => {
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('프로토콜 없으면 https 자동 보정', () => {
    expect(parseGithubUrl('github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('경로 일부만 있으면 null', () => {
    expect(parseGithubUrl('https://github.com/owner')).toBeNull()
  })

  it('github.com 외 호스트는 null', () => {
    expect(parseGithubUrl('https://gitlab.com/owner/repo')).toBeNull()
  })

  it('빈 문자열/undefined/null 처리', () => {
    expect(parseGithubUrl('')).toBeNull()
    expect(parseGithubUrl(undefined)).toBeNull()
    expect(parseGithubUrl(null)).toBeNull()
  })

  it('공백 trim', () => {
    expect(parseGithubUrl('  https://github.com/owner/repo  ')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('잘못된 URL 형태는 null', () => {
    expect(parseGithubUrl('not a url')).toBeNull()
  })
})

describe('buildGithubBlobLink', () => {
  it('기본: owner/repo/file/line → blob/HEAD URL + #L 앵커', () => {
    const link = buildGithubBlobLink('https://github.com/myoung/harness-server', 'app/api/main.py', 42)
    expect(link).toBe('https://github.com/myoung/harness-server/blob/HEAD/app/api/main.py#L42')
  })

  it('line=0 / 누락 → #L 앵커 생략', () => {
    expect(buildGithubBlobLink('https://github.com/o/r', 'README.md', 0))
      .toBe('https://github.com/o/r/blob/HEAD/README.md')
    expect(buildGithubBlobLink('https://github.com/o/r', 'README.md'))
      .toBe('https://github.com/o/r/blob/HEAD/README.md')
  })

  it('leading slash 가 있는 file 도 정상 처리', () => {
    expect(buildGithubBlobLink('https://github.com/o/r', '/src/x.py', 1))
      .toBe('https://github.com/o/r/blob/HEAD/src/x.py#L1')
  })

  it('repoUrl 파싱 실패 → null', () => {
    expect(buildGithubBlobLink('not-a-url', 'x.py', 1)).toBeNull()
    expect(buildGithubBlobLink('', 'x.py', 1)).toBeNull()
    expect(buildGithubBlobLink(null, 'x.py', 1)).toBeNull()
  })

  it('file 누락 → null', () => {
    expect(buildGithubBlobLink('https://github.com/o/r', '', 1)).toBeNull()
    expect(buildGithubBlobLink('https://github.com/o/r', null, 1)).toBeNull()
  })

  it('path segment 인코딩 — 공백 / 한글 / & 등 인코드, slash 보존', () => {
    const link = buildGithubBlobLink(
      'https://github.com/o/r',
      'src/한글 경로/foo bar.py',
      10,
    )
    expect(link).toMatch(/^https:\/\/github\.com\/o\/r\/blob\/HEAD\//)
    expect(link).toContain('/src/')          // slash 보존
    expect(link).toContain('foo%20bar.py')   // 공백 인코딩
    expect(link).toMatch(/%[0-9A-F]{2}/i)    // 한글 인코딩
    expect(link).toMatch(/#L10$/)
  })

  it('owner/repo short form 도 파싱', () => {
    // parseGithubUrl 은 'github.com' 호스트 검증 — 짧은 형식은 null 반환.
    // buildGithubBlobLink 도 null 반환이 정상 (확실치 않은 경우 안전 default).
    expect(buildGithubBlobLink('o/r', 'x.py', 1)).toBeNull()
  })
})

describe('normalizeLanguages', () => {
  it('비율 계산 + 내림차순 정렬', () => {
    const result = normalizeLanguages({ JavaScript: 7000, TypeScript: 3000 })
    expect(result).toEqual([
      { name: 'JavaScript', bytes: 7000, percent: 70 },
      { name: 'TypeScript', bytes: 3000, percent: 30 },
    ])
  })

  it('빈 객체 → 빈 배열', () => {
    expect(normalizeLanguages({})).toEqual([])
  })

  it('null/undefined → 빈 배열', () => {
    expect(normalizeLanguages(null)).toEqual([])
    expect(normalizeLanguages(undefined)).toEqual([])
  })

  it('총합 0 → 빈 배열', () => {
    expect(normalizeLanguages({ JS: 0 })).toEqual([])
  })
})

describe('buildCommitHeatmap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('기본 90일 버킷 생성', () => {
    const result = buildCommitHeatmap([])
    expect(result).toHaveLength(90)
    expect(result[result.length - 1].count).toBe(0)
  })

  it('커밋 카운트 누적', () => {
    // buildCommitHeatmap은 로컬 자정 기준 → 마지막 버킷 날짜를 동일 방식으로 계산
    const localMidnight = new Date()
    localMidnight.setHours(0, 0, 0, 0)
    const todayKey = localMidnight.toISOString().slice(0, 10)
    const commits = [
      { date: `${todayKey}T10:00:00Z` },
      { date: `${todayKey}T11:00:00Z` },
    ]
    const result = buildCommitHeatmap(commits)
    const last = result[result.length - 1]
    expect(last.date).toBe(todayKey)
    expect(last.count).toBe(2)
  })

  it('범위 외 커밋 무시', () => {
    const result = buildCommitHeatmap([{ date: '2020-01-01T00:00:00Z' }])
    const total = result.reduce((sum, b) => sum + b.count, 0)
    expect(total).toBe(0)
  })

  it('date 없는 커밋 안전 처리', () => {
    expect(() => buildCommitHeatmap([{ date: null }, {}])).not.toThrow()
  })

  it('과거 → 현재 순으로 정렬', () => {
    const result = buildCommitHeatmap([])
    const dates = result.map(b => b.date)
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
  })
})

describe('formatRelativeKr', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('null/undefined → 대시', () => {
    expect(formatRelativeKr(null)).toBe('—')
    expect(formatRelativeKr(undefined)).toBe('—')
  })

  it('잘못된 날짜 입력 → 대시 (RangeError 방지)', () => {
    expect(formatRelativeKr('not-a-date')).toBe('—')
    expect(formatRelativeKr('')).toBe('—')
    expect(formatRelativeKr(NaN)).toBe('—')
  })

  it('ms 타임스탬프(number) 입력 처리', () => {
    expect(formatRelativeKr(new Date('2026-05-10T11:55:00Z').getTime())).toBe('5분 전')
  })

  it('미래 시간 → 방금 전', () => {
    expect(formatRelativeKr('2026-05-11T00:00:00Z')).toBe('방금 전')
  })

  it('1분 미만 → 방금 전', () => {
    expect(formatRelativeKr('2026-05-10T11:59:30Z')).toBe('방금 전')
  })

  it('분 단위', () => {
    expect(formatRelativeKr('2026-05-10T11:55:00Z')).toBe('5분 전')
  })

  it('시간 단위', () => {
    expect(formatRelativeKr('2026-05-10T09:00:00Z')).toBe('3시간 전')
  })

  it('일 단위', () => {
    expect(formatRelativeKr('2026-05-07T12:00:00Z')).toBe('3일 전')
  })

  it('개월 단위', () => {
    expect(formatRelativeKr('2026-02-10T12:00:00Z')).toBe('2개월 전')
  })

  it('년 단위', () => {
    expect(formatRelativeKr('2024-05-10T12:00:00Z')).toBe('2년 전')
  })
})

describe('formatBytes', () => {
  it('0/null/undefined → 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(undefined)).toBe('0 B')
  })

  it('B → KB → MB → GB 단위 전환', () => {
    expect(formatBytes(50)).toBe('50.0 B')
    expect(formatBytes(1500)).toBe('1.5 KB')
    expect(formatBytes(1500000)).toBe('1.4 MB')
    expect(formatBytes(2_500_000_000)).toBe('2.3 GB')
  })

  it('100 이상이면 소수점 제거', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(150 * 1024)).toBe('150 KB')
  })
})

describe('parseRateLimit', () => {
  it('null 응답 안전 처리', () => {
    expect(parseRateLimit(null)).toEqual({ isRateLimit: false, resetAt: null, remaining: null })
  })

  it('403 + remaining=0 + X-RateLimit-Reset → isRateLimit=true + 절대 시각', () => {
    const reset = Math.floor(Date.now() / 1000) + 1800 // 30분 후
    const r = parseRateLimit({
      status: 403,
      headers: mockHeaders({ 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(reset) }),
    })
    expect(r.isRateLimit).toBe(true)
    expect(r.remaining).toBe(0)
    expect(r.resetAt).toBeInstanceOf(Date)
    expect(r.resetAt.getTime()).toBe(reset * 1000)
  })

  it('Retry-After (초 단위) 폴백', () => {
    const r = parseRateLimit({
      status: 403,
      headers: mockHeaders({ 'X-RateLimit-Remaining': '0', 'Retry-After': '120' }),
    })
    expect(r.isRateLimit).toBe(true)
    expect(r.resetAt).toBeInstanceOf(Date)
  })

  it('403이지만 remaining > 0 → rate limit 아님 (다른 권한 에러)', () => {
    const r = parseRateLimit({
      status: 403,
      headers: mockHeaders({ 'X-RateLimit-Remaining': '50' }),
    })
    expect(r.isRateLimit).toBe(false)
  })

  it('200 + 헤더 있음 → isRateLimit=false', () => {
    const r = parseRateLimit({
      status: 200,
      headers: mockHeaders({ 'X-RateLimit-Remaining': '0' }),
    })
    expect(r.isRateLimit).toBe(false)
  })
})

describe('formatCountdown', () => {
  const now = new Date('2026-05-10T12:00:00Z').getTime()

  it('null/지난 시각', () => {
    expect(formatCountdown(null)).toBe('')
    expect(formatCountdown(new Date(now - 1000), now)).toBe('곧 가능')
  })

  it('초 단위 (1분 미만)', () => {
    expect(formatCountdown(new Date(now + 32 * 1000), now)).toBe('32초 후')
  })

  it('분 + 초', () => {
    expect(formatCountdown(new Date(now + (5 * 60 + 12) * 1000), now)).toBe('5분 12초 후')
  })

  it('정확히 분 단위', () => {
    expect(formatCountdown(new Date(now + 3 * 60 * 1000), now)).toBe('3분 후')
  })
})
