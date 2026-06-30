import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

import axios from '@/utils/axios'
import {
  issueMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from '@/api/mcpTokens'

describe('mcpTokens API', () => {
  beforeEach(() => {
    axios.post.mockReset()
    axios.get.mockReset()
    axios.delete.mockReset()
  })

  it('issueMcpToken posts label and returns token payload', async () => {
    axios.post.mockResolvedValue({
      data: { token: 'tok', jti: 'j1', label: 'L', expires_at: '2026-08-16' },
    })
    const res = await issueMcpToken('노트북-Cursor')
    expect(axios.post).toHaveBeenCalledWith('/api/mcp-tokens', {
      label: '노트북-Cursor',
    })
    expect(res.token).toBe('tok')
  })

  it('listMcpTokens returns array', async () => {
    axios.get.mockResolvedValue({ data: [{ jti: 'j1' }] })
    const res = await listMcpTokens()
    expect(axios.get).toHaveBeenCalledWith('/api/mcp-tokens')
    expect(res).toHaveLength(1)
  })

  it('revokeMcpToken DELETEs by jti', async () => {
    axios.delete.mockResolvedValue({ status: 204 })
    await revokeMcpToken('j1')
    expect(axios.delete).toHaveBeenCalledWith('/api/mcp-tokens/j1')
  })
})
