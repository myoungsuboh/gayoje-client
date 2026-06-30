/**
 * 용어 사전 데이터 무결성 + 검색 동작 가드.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '@/plugins/i18n'
import { GLOSSARY, GLOSSARY_GROUPS, searchGlossary } from '@/utils/glossary'

// 용어 텍스트가 i18n 으로 이관됨 → jsdom 기본 locale('en') 대신 ko 고정해 한국어 단언 유지.
beforeEach(() => { i18n.global.locale.value = 'ko' })

describe('glossary 데이터', () => {
  it('모든 항목은 term/group/desc 를 갖는다', () => {
    for (const t of GLOSSARY) {
      expect(t.term, JSON.stringify(t)).toBeTruthy()
      expect(t.desc, JSON.stringify(t)).toBeTruthy()
      expect(t.group, JSON.stringify(t)).toBeTruthy()
    }
  })

  it('모든 group 은 GLOSSARY_GROUPS 에 정의된 key 만 쓴다', () => {
    const keys = new Set(GLOSSARY_GROUPS.map((g) => g.key))
    for (const t of GLOSSARY) {
      expect(keys.has(t.group), `unknown group: ${t.group}`).toBe(true)
    }
  })

  it('핵심 B2C 약어(CPS/PRD/SPACK/DDD/Lint)가 사전에 있다', () => {
    const abbrs = GLOSSARY.map((t) => t.abbr)
    for (const must of ['CPS', 'PRD', 'SPACK', 'DDD', 'Lint']) {
      expect(abbrs).toContain(must)
    }
  })

  it('term 중복이 없다', () => {
    const seen = new Set()
    for (const t of GLOSSARY) {
      const key = `${t.term}|${t.abbr}`
      expect(seen.has(key), `dup: ${key}`).toBe(false)
      seen.add(key)
    }
  })
})

describe('searchGlossary', () => {
  it('빈 검색어는 전체를 반환', () => {
    expect(searchGlossary('')).toHaveLength(GLOSSARY.length)
    expect(searchGlossary('   ')).toHaveLength(GLOSSARY.length)
  })

  it('영문 약어로 검색된다 (대소문자 무시)', () => {
    const r = searchGlossary('prd')
    expect(r.some((t) => t.abbr === 'PRD')).toBe(true)
  })

  it('한글 용어로 검색된다', () => {
    const r = searchGlossary('기획서')
    expect(r.some((t) => t.term === '기획서')).toBe(true)
  })

  it('설명 본문 단어로도 검색된다', () => {
    const r = searchGlossary('환불')
    expect(r.length).toBeGreaterThan(0)
  })

  it('없는 단어는 빈 배열', () => {
    expect(searchGlossary('존재하지않는단어zzzz')).toHaveLength(0)
  })
})
