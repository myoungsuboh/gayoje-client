/**
 * meetingDraft.js — 미팅 로그 신규 작성 초안 localStorage 보존 유틸 단위 테스트.
 *
 * 검증:
 *  - save/load/has/clear 기본 동작 (프로젝트별 격리)
 *  - 빈 내용 저장 시 제거
 *  - 프로젝트 키 정규화 (공백/falsy → 'harness')
 *  - 손상된 JSON / localStorage 예외에도 안전 (throw 안 함)
 *  - 프로젝트 수 상한(MAX_PROJECTS) 초과 시 오래된 것부터 제거
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  MEETING_DRAFT_KEY,
  loadMeetingDraft,
  saveMeetingDraft,
  clearMeetingDraft,
  hasMeetingDraft,
} from '@/utils/meetingDraft'

beforeEach(() => {
  localStorage.clear()
})

describe('meetingDraft — 기본 저장/조회', () => {
  it('save 후 load 로 내용 복원', () => {
    saveMeetingDraft('projA', '회의 내용 초안')
    expect(loadMeetingDraft('projA')).toBe('회의 내용 초안')
    expect(hasMeetingDraft('projA')).toBe(true)
  })

  it('프로젝트별 격리 — 다른 프로젝트 초안은 영향 없음', () => {
    saveMeetingDraft('projA', 'A 초안')
    saveMeetingDraft('projB', 'B 초안')
    expect(loadMeetingDraft('projA')).toBe('A 초안')
    expect(loadMeetingDraft('projB')).toBe('B 초안')
  })

  it('저장 안 한 프로젝트는 빈 문자열 + has=false', () => {
    expect(loadMeetingDraft('none')).toBe('')
    expect(hasMeetingDraft('none')).toBe(false)
  })

  it('clear 후 제거', () => {
    saveMeetingDraft('projA', '내용')
    clearMeetingDraft('projA')
    expect(loadMeetingDraft('projA')).toBe('')
    expect(hasMeetingDraft('projA')).toBe(false)
  })

  it('빈/공백 내용 저장 시 제거 (has=false)', () => {
    saveMeetingDraft('projA', '내용')
    saveMeetingDraft('projA', '   ')
    expect(hasMeetingDraft('projA')).toBe(false)
    expect(loadMeetingDraft('projA')).toBe('')
  })

  it('공백만 있는 초안은 hasMeetingDraft=false (load 는 저장 안 되므로 빈 문자열)', () => {
    saveMeetingDraft('projA', '\n\t ')
    expect(hasMeetingDraft('projA')).toBe(false)
  })
})

describe('meetingDraft — 프로젝트 키 정규화', () => {
  it('falsy / 공백 프로젝트명은 모두 같은 기본 키(harness)로 취급', () => {
    saveMeetingDraft('', '기본 초안')
    expect(loadMeetingDraft(undefined)).toBe('기본 초안')
    expect(loadMeetingDraft('   ')).toBe('기본 초안')
    expect(loadMeetingDraft('harness')).toBe('기본 초안')
  })
})

describe('meetingDraft — 견고성', () => {
  it('손상된 JSON 이 들어 있어도 throw 하지 않고 빈 값', () => {
    localStorage.setItem(MEETING_DRAFT_KEY, '{not valid json')
    expect(() => loadMeetingDraft('projA')).not.toThrow()
    expect(loadMeetingDraft('projA')).toBe('')
    // 이후 정상 저장 가능
    saveMeetingDraft('projA', '복구 후 초안')
    expect(loadMeetingDraft('projA')).toBe('복구 후 초안')
  })

  it('localStorage.setItem 예외(quota 등)에도 save 가 throw 하지 않음', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => saveMeetingDraft('projA', '내용')).not.toThrow()
    spy.mockRestore()
  })
})

describe('meetingDraft — 상한(MAX_PROJECTS) 초과 시 오래된 초안 제거', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('13개 저장 시 가장 오래된 1개가 제거됨', () => {
    // savedAt 이 단조 증가하도록 Date.now 를 순차 mock.
    let t = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 1000))
    for (let i = 0; i < 13; i++) saveMeetingDraft(`p${i}`, `draft ${i}`)
    // 가장 먼저 저장한 p0 가 제거, 최신 12개(p1~p12)는 유지.
    expect(hasMeetingDraft('p0')).toBe(false)
    expect(hasMeetingDraft('p1')).toBe(true)
    expect(hasMeetingDraft('p12')).toBe(true)
  })
})
