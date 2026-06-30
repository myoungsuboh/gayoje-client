/**
 * designFetch — 빈 응답 시 재시도하는 fetch 유틸 테스트.
 *
 * 시나리오:
 *   - 1회로 성공 (retry 0회)
 *   - 빈 응답 1회 → 2회째 데이터 도착 (retry 1회)
 *   - maxAttempts 다 써도 empty → 마지막 응답 반환
 *   - axios 에러는 그대로 throw
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// axios mock 을 hoisted 로 — 모듈 로드 전에 import 가로채기.
vi.mock('@/utils/axios', () => ({
  default: { get: vi.fn() },
}))

import axios from '@/utils/axios'
import {
  fetchWithRetryIfEmpty,
  extractRaw,
  isSpackEmpty,
  isDddEmpty,
  isArchitectureEmpty,
} from '@/utils/designFetch'

describe('extractRaw', () => {
  it('response.data.result[0] 우선', () => {
    const resp = { data: { result: [{ apis: [1] }] } }
    expect(extractRaw(resp)).toEqual({ apis: [1] })
  })

  it('result 없으면 response.data[0]', () => {
    const resp = { data: [{ services: [1] }] }
    expect(extractRaw(resp)).toEqual({ services: [1] })
  })

  it('둘 다 없으면 빈 객체', () => {
    expect(extractRaw({ data: { result: [] } })).toEqual({})
    expect(extractRaw({ data: {} })).toEqual({})
    expect(extractRaw({})).toEqual({})
    expect(extractRaw(null)).toEqual({})
  })
})

describe('isXxxEmpty 판정', () => {
  it('SPACK — apis/entities/policies 중 하나라도 있으면 not empty', () => {
    expect(isSpackEmpty({ apis: [1], entities: [], policies: [] })).toBe(false)
    expect(isSpackEmpty({ apis: [], entities: [1], policies: [] })).toBe(false)
    expect(isSpackEmpty({ apis: [], entities: [], policies: [1] })).toBe(false)
    expect(isSpackEmpty({})).toBe(true)
    expect(isSpackEmpty({ apis: [], entities: [], policies: [] })).toBe(true)
  })

  it('DDD — contexts/aggregates 중 하나라도 있으면 not empty', () => {
    expect(isDddEmpty({ contexts: [1] })).toBe(false)
    expect(isDddEmpty({ aggregates: [1] })).toBe(false)
    expect(isDddEmpty({})).toBe(true)
  })

  it('Architecture — services/databases 중 하나라도 있으면 not empty', () => {
    expect(isArchitectureEmpty({ services: [1] })).toBe(false)
    expect(isArchitectureEmpty({ databases: [1] })).toBe(false)
    expect(isArchitectureEmpty({})).toBe(true)
  })
})

describe('fetchWithRetryIfEmpty', () => {
  beforeEach(() => {
    axios.get.mockReset()
  })

  it('1회 성공 → retry 없음', async () => {
    axios.get.mockResolvedValueOnce({ data: { result: [{ services: [{ id: 'A' }] }] } })
    const resp = await fetchWithRetryIfEmpty({
      url: '/api/x', params: {},
      isEmpty: isArchitectureEmpty,
      maxAttempts: 3,
      delayMs: 1,
    })
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(extractRaw(resp)).toEqual({ services: [{ id: 'A' }] })
  })

  it('빈 응답 1회 → 2회째 데이터', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { result: [{}] } })  // empty
      .mockResolvedValueOnce({ data: { result: [{ services: [1] }] } })  // data
    const resp = await fetchWithRetryIfEmpty({
      url: '/api/x', params: {},
      isEmpty: isArchitectureEmpty,
      maxAttempts: 3,
      delayMs: 1,
    })
    expect(axios.get).toHaveBeenCalledTimes(2)
    expect(extractRaw(resp).services).toEqual([1])
  })

  it('maxAttempts 다 써도 empty → 마지막 응답 반환 (throw 안 함)', async () => {
    axios.get.mockResolvedValue({ data: { result: [{}] } })
    const resp = await fetchWithRetryIfEmpty({
      url: '/api/x', params: {},
      isEmpty: isArchitectureEmpty,
      maxAttempts: 3,
      delayMs: 1,
    })
    expect(axios.get).toHaveBeenCalledTimes(3)
    expect(extractRaw(resp)).toEqual({})
  })

  it('maxAttempts=1 → retry 없음 (default 동작)', async () => {
    axios.get.mockResolvedValueOnce({ data: { result: [{}] } })
    await fetchWithRetryIfEmpty({
      url: '/api/x', params: {},
      isEmpty: isArchitectureEmpty,
      maxAttempts: 1,
      delayMs: 1,
    })
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('axios 에러는 그대로 throw', async () => {
    axios.get.mockRejectedValueOnce(new Error('network'))
    await expect(fetchWithRetryIfEmpty({
      url: '/api/x', params: {},
      isEmpty: isArchitectureEmpty,
      maxAttempts: 3,
      delayMs: 1,
    })).rejects.toThrow('network')
  })
})
