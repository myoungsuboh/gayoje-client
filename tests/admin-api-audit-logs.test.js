/**
 * listAuditLogsApi — 감사 로그 기간(날짜 범위) 파라미터 계약.
 *
 * [회귀 가드]
 * - 날짜 미지정 시 from_date/to_date 미전송 (서버에 불필요한 빈 필터 X)
 * - fromDate/toDate → snake_case(from_date/to_date) 로 전달
 * - from 단독 / to 단독 허용
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))
vi.mock('@/utils/apiErrors', () => ({ extractError: (e, fb) => fb }))

import axios from '@/utils/axios'
import { listAuditLogsApi } from '@/utils/admin'

beforeEach(() => { axios.get.mockReset() })

describe('listAuditLogsApi — 기간 파라미터', () => {
  it('날짜 미지정 시 from_date/to_date 를 보내지 않는다', async () => {
    axios.get.mockResolvedValue({ data: { logs: [], total: 0 } })
    await listAuditLogsApi({ q: 'x', limit: 50, offset: 0 })
    const params = axios.get.mock.calls[0][1].params
    expect(params).toEqual({ q: 'x', limit: 50, offset: 0 })
    expect('from_date' in params).toBe(false)
    expect('to_date' in params).toBe(false)
  })

  it('fromDate/toDate 를 snake_case(from_date/to_date) 로 전달', async () => {
    axios.get.mockResolvedValue({ data: { logs: [], total: 0 } })
    await listAuditLogsApi({ fromDate: '2026-06-19T15:00:00.000Z', toDate: '2026-06-22T15:00:00.000Z' })
    const params = axios.get.mock.calls[0][1].params
    expect(params.from_date).toBe('2026-06-19T15:00:00.000Z')
    expect(params.to_date).toBe('2026-06-22T15:00:00.000Z')
  })

  it('from 단독 / to 단독 전달 허용', async () => {
    axios.get.mockResolvedValue({ data: { logs: [], total: 0 } })
    await listAuditLogsApi({ fromDate: '2026-06-19T15:00:00.000Z' })
    let params = axios.get.mock.calls[0][1].params
    expect(params.from_date).toBe('2026-06-19T15:00:00.000Z')
    expect('to_date' in params).toBe(false)

    axios.get.mockClear()
    await listAuditLogsApi({ toDate: '2026-06-22T15:00:00.000Z' })
    params = axios.get.mock.calls[0][1].params
    expect('from_date' in params).toBe(false)
    expect(params.to_date).toBe('2026-06-22T15:00:00.000Z')
  })

  it('에러 시 success=false + status', async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } })
    const r = await listAuditLogsApi({})
    expect(r.success).toBe(false)
    expect(r.status).toBe(500)
  })
})
