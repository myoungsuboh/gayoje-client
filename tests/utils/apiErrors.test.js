/**
 * extractError — 5개 utils helper 가 공유하는 BE 에러 정규화.
 *
 * [회귀 가드]
 * - string detail → 그대로
 * - object detail (quota/gemini error) → message 키
 * - array detail (Pydantic) → 첫 msg
 * - error.message 폴백
 * - 길이 캡 (BE 가 stacktrace 등 노출해도 200자 제한)
 */
import { describe, it, expect } from 'vitest'
import { extractError } from '@/utils/apiErrors'


const mkAxiosError = (detail) => ({
  response: { data: { detail } },
})


describe('extractError', () => {
  it('string detail 을 그대로 반환', () => {
    const err = mkAxiosError('이미 등록된 이메일입니다.')
    expect(extractError(err, 'fallback')).toBe('이미 등록된 이메일입니다.')
  })

  it('객체 detail.message 를 반환 (quota/gemini 구조화 응답)', () => {
    const err = mkAxiosError({
      code: 'QUOTA_EXCEEDED',
      limit_type: 'total_tokens',
      message: '무료 등급의 AI 사용량 한도에 도달했습니다.',
      reset_at: '2026-06-17',
    })
    expect(extractError(err, 'fallback'))
      .toBe('무료 등급의 AI 사용량 한도에 도달했습니다.')
  })

  it('Pydantic array detail 의 첫 msg 를 반환', () => {
    const err = mkAxiosError([
      { msg: 'String should have at least 8 characters', type: 'string_too_short' },
      { msg: 'unused', type: 'string_too_short' },
    ])
    expect(extractError(err, 'fallback'))
      .toBe('String should have at least 8 characters')
  })

  it('빈 array detail → fallback', () => {
    const err = mkAxiosError([])
    expect(extractError(err, 'fallback')).toBe('fallback')
  })

  it('array 안에 msg 없으면 fallback', () => {
    const err = mkAxiosError([{ type: 'value_error' }])  // msg 누락
    expect(extractError(err, 'fallback')).toBe('fallback')
  })

  it('객체 detail 에 message 없으면 fallback', () => {
    const err = mkAxiosError({ code: 'X' })
    expect(extractError(err, 'fallback')).toBe('fallback')
  })

  it('detail 자체가 없으면 error.message 사용', () => {
    const err = { message: 'Network Error' }
    expect(extractError(err, 'fallback')).toBe('Network Error')
  })

  it('error 가 falsy 면 fallback', () => {
    expect(extractError(null, 'fallback')).toBe('fallback')
    expect(extractError(undefined, 'fallback')).toBe('fallback')
  })

  it('[방어선] 200자 초과 detail 은 잘라서 … 추가', () => {
    const long = 'a'.repeat(300)
    const err = mkAxiosError(long)
    const out = extractError(err, 'fallback')
    expect(out.length).toBe(201)  // 200 + '…'
    expect(out.endsWith('…')).toBe(true)
  })

  it('200자 이하 detail 은 그대로', () => {
    const exact = 'b'.repeat(200)
    const err = mkAxiosError(exact)
    expect(extractError(err, 'fallback')).toBe(exact)
  })
})
