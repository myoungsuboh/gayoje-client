/**
 * guides 네임스페이스(가이드 툴팁) 일관성 회귀 테스트.
 *
 * GuideTooltip 의 target key → i18n `guides.<id>.title|desc` 로 렌더되므로 entry
 * 형식/패리티가 깨지면 UI 가 silent 하게 안 뜬다. 부팅 시 안 잡혀서 vitest 로 가드.
 * (콘텐츠는 src/locales/{ko,en}/guides.json — 2026-06-05 guides.js 에서 i18n 분리)
 */
import { describe, it, expect } from 'vitest'
import ko from '@/locales/ko/guides.json'
import en from '@/locales/en/guides.json'
import { GUIDE_GIFS } from '@/utils/guides'

describe('guides 네임스페이스 메타데이터', () => {
  it('ko↔en 키 집합이 동일 (패리티)', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort())
  })

  it('모든 entry 가 title + desc 를 가진다 (ko & en)', () => {
    for (const [locale, dict] of [['ko', ko], ['en', en]]) {
      for (const [key, g] of Object.entries(dict)) {
        expect(g.title, `${locale}.${key}: title`).toBeTypeOf('string')
        expect(g.title.length, `${locale}.${key}: title 길이`).toBeGreaterThan(0)
        expect(g.desc, `${locale}.${key}: desc`).toBeTypeOf('string')
        expect(g.desc.length, `${locale}.${key}: desc 길이`).toBeGreaterThan(0)
      }
    }
  })

  it('ko title 은 24자 이내 (popover 헤더 공간 제약)', () => {
    for (const [key, g] of Object.entries(ko)) {
      expect(g.title.length, `ko.${key}: title 24자 이내`).toBeLessThanOrEqual(24)
    }
  })

  it('en title 은 40자 이내 (popover 헤더 sanity)', () => {
    for (const [key, g] of Object.entries(en)) {
      expect(g.title.length, `en.${key}: title 40자 이내`).toBeLessThanOrEqual(40)
    }
  })

  it('target key 는 kebab-case (소문자 + 하이픈)', () => {
    for (const key of Object.keys(ko)) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('필수 가이드 keys 가 존재 (UI 가 wire-up 한 target)', () => {
    const required = [
      'meeting-log-template',
      'meeting-log-audio',
      'run-lint',
      'design-latest-update',
      'vibe-coding-package',
    ]
    for (const k of required) {
      expect(Object.keys(ko), `required key (ko): ${k}`).toContain(k)
      expect(Object.keys(en), `required key (en): ${k}`).toContain(k)
    }
  })

  it('GUIDE_GIFS 경로는 /guides/*.webm|mp4 형식', () => {
    for (const [key, path] of Object.entries(GUIDE_GIFS)) {
      expect(path, `${key}: gif 경로`).toMatch(/^\/guides\/.+\.(webm|mp4)$/)
    }
  })
})
