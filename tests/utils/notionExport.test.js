import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }))

import axios from '@/utils/axios'
import { exportToNotionApi } from '@/utils/notion'

describe('exportToNotionApi', () => {
  beforeEach(() => {
    axios.post.mockReset()
  })

  it('posts snake_case body and returns hub_url + results', async () => {
    axios.post.mockResolvedValueOnce({
      data: { hub_url: 'u/H', results: [{ doc: 'cps', status: 'updated', url: 'u/C' }] },
    })
    const r = await exportToNotionApi({ projectName: 'p', docs: ['cps', 'prd'], teamId: 't' })
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/notion/export'),
      { project_name: 'p', docs: ['cps', 'prd'], team_id: 't' },
      expect.objectContaining({ timeout: 300000 }),
    )
    expect(r.success).toBe(true)
    expect(r.hub_url).toBe('u/H')
    expect(r.results[0].status).toBe('updated')
  })

  it('includes parent_page_id when provided, omits falsy team_id', async () => {
    axios.post.mockResolvedValueOnce({ data: { hub_url: 'x', results: [] } })
    await exportToNotionApi({ projectName: 'p', docs: ['cps'], parentPageId: 'PAR' })
    const body = axios.post.mock.calls.at(-1)[1]
    expect(body.parent_page_id).toBe('PAR')
    // team_id 는 항상 명시 전송(인터셉터 자동주입 방지). 개인이면 ''.
    expect(body.team_id).toBe('')
  })

  it('returns success:false when no project', async () => {
    const r = await exportToNotionApi({ projectName: '', docs: ['cps'] })
    expect(r.success).toBe(false)
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('returns success:false when no docs', async () => {
    const r = await exportToNotionApi({ projectName: 'p', docs: [] })
    expect(r.success).toBe(false)
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('maps error + status on rejection', async () => {
    axios.post.mockRejectedValueOnce({
      response: { status: 412, data: { detail: { code: 'NOTION_NOT_LINKED' } } },
    })
    const r = await exportToNotionApi({ projectName: 'p', docs: ['cps'] })
    expect(r.success).toBe(false)
    expect(r.status).toBe(412)
    expect(r.code).toBe('NOTION_NOT_LINKED')
  })
})
