import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({
  default: { patch: vi.fn(), post: vi.fn(), get: vi.fn() },
}))
vi.mock('@/utils/apiErrors', () => ({ extractError: (e, fb) => fb }))

import axios from '@/utils/axios'
import {
  suspendUserApi,
  unsuspendUserApi,
} from '@/utils/admin'

beforeEach(() => {
  axios.patch.mockReset()
  axios.post.mockReset()
})

describe('suspendUserApi', () => {
  it('PATCH 정상 호출 + reason 전달', async () => {
    axios.patch.mockResolvedValue({ data: { user: { email: 'u@x.com', is_suspended: true } } })
    const r = await suspendUserApi('u@x.com', { reason: 'abuse' })
    expect(r.success).toBe(true)
    expect(r.user.is_suspended).toBe(true)
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/u%40x.com/suspend'),
      { reason: 'abuse' },
    )
  })
  it('에러 시 success=false + error 메시지', async () => {
    axios.patch.mockRejectedValue({ response: { status: 400 } })
    const r = await suspendUserApi('u@x.com', { reason: '' })
    expect(r.success).toBe(false)
    expect(r.status).toBe(400)
  })
})

describe('unsuspendUserApi', () => {
  it('PATCH 정상 호출', async () => {
    axios.patch.mockResolvedValue({ data: { user: { email: 'u@x.com', is_suspended: false } } })
    const r = await unsuspendUserApi('u@x.com')
    expect(r.success).toBe(true)
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/u%40x.com/unsuspend'),
      {},
    )
  })
})
