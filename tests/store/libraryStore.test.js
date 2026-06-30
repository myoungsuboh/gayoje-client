/**
 * useLibraryStore — VibeRepo CRUD + URL 정규화 + 30초 캐시.
 *
 * [회귀 가드]
 * - fetchLibrary: 30초 TTL hit / force=true bypass
 * - addRepo: 성공 후 fetch 무효화 + 재호출
 * - removeRepo: URL 정규화로 매칭 (대소문자/trailing slash/.git 변종)
 * - hasUrl: 정규화 비교
 * - isEmpty: 빈 상태 computed
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/auth', () => ({
  fetchLibraryApi: vi.fn(),
  addLibraryApi: vi.fn(),
  removeLibraryApi: vi.fn(),
}))

import { fetchLibraryApi, addLibraryApi, removeLibraryApi } from '@/utils/auth'
import { useLibraryStore } from '@/store/library'


describe('useLibraryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchLibraryApi.mockReset()
    addLibraryApi.mockReset()
    removeLibraryApi.mockReset()
  })

  // ─── fetchLibrary 캐시 ─────────────────────────────────────

  it('fetchLibrary — 30초 TTL hit', async () => {
    fetchLibraryApi.mockResolvedValue({
      success: true,
      repos: [{ url: 'https://github.com/a/b' }],
    })
    const store = useLibraryStore()
    const r1 = await store.fetchLibrary()
    const r2 = await store.fetchLibrary()
    expect(r1.success).toBe(true)
    expect(r2.fromCache).toBe(true)
    expect(fetchLibraryApi).toHaveBeenCalledTimes(1)
  })

  it('fetchLibrary — force=true 면 캐시 무시', async () => {
    fetchLibraryApi.mockResolvedValue({ success: true, repos: [] })
    const store = useLibraryStore()
    await store.fetchLibrary()
    await store.fetchLibrary({ force: true })
    expect(fetchLibraryApi).toHaveBeenCalledTimes(2)
  })

  it('fetchLibrary — 실패 시 repos 안 채움', async () => {
    fetchLibraryApi.mockResolvedValueOnce({ success: false, error: 'auth' })
    const store = useLibraryStore()
    const r = await store.fetchLibrary()
    expect(r.success).toBe(false)
    expect(store.repos).toEqual([])
  })

  // ─── addRepo: 캐시 무효화 + 자동 refetch ──────────────────

  it('addRepo — 성공 후 fetchLibrary 자동 재호출', async () => {
    addLibraryApi.mockResolvedValueOnce({ success: true })
    fetchLibraryApi.mockResolvedValueOnce({
      success: true,
      repos: [{ url: 'https://a/b' }],
    })
    const store = useLibraryStore()
    await store.addRepo({ url: 'https://a/b' })
    expect(addLibraryApi).toHaveBeenCalledTimes(1)
    expect(fetchLibraryApi).toHaveBeenCalledTimes(1)
    expect(store.repos.length).toBe(1)
  })

  it('addRepo — url 누락 시 즉시 실패 (API 호출 안 함)', async () => {
    const store = useLibraryStore()
    const r = await store.addRepo({ url: '' })
    expect(r.success).toBe(false)
    expect(addLibraryApi).not.toHaveBeenCalled()
  })

  // ─── removeRepo: URL 정규화 ────────────────────────────────

  it('removeRepo — 정규화 비교로 매칭 (trailing slash / .git / 대소문자)', async () => {
    fetchLibraryApi.mockResolvedValueOnce({
      success: true,
      repos: [
        { url: 'https://github.com/A/B' },
        { url: 'https://github.com/c/d' },
      ],
    })
    removeLibraryApi.mockResolvedValueOnce({ success: true })
    const store = useLibraryStore()
    await store.fetchLibrary()
    // trailing slash + .git + 대문자 다름 → 정규화 후 매칭되어야 함
    await store.removeRepo('https://github.com/a/b.git/')
    expect(store.repos.length).toBe(1)
    expect(store.repos[0].url).toBe('https://github.com/c/d')
  })

  it('removeRepo — 실패 시 repos 변경 없음', async () => {
    fetchLibraryApi.mockResolvedValueOnce({
      success: true, repos: [{ url: 'https://a/b' }],
    })
    removeLibraryApi.mockResolvedValueOnce({ success: false, error: 'forbidden' })
    const store = useLibraryStore()
    await store.fetchLibrary()
    await store.removeRepo('https://a/b')
    expect(store.repos.length).toBe(1)
  })

  // ─── hasUrl / isEmpty ───────────────────────────────────────

  it('hasUrl — 정규화 비교', async () => {
    fetchLibraryApi.mockResolvedValueOnce({
      success: true,
      repos: [{ url: 'https://github.com/a/b' }],
    })
    const store = useLibraryStore()
    await store.fetchLibrary()
    expect(store.hasUrl('https://github.com/A/B.git/')).toBe(true)
    expect(store.hasUrl('https://github.com/x/y')).toBe(false)
    expect(store.hasUrl('')).toBe(false)
    expect(store.hasUrl(null)).toBe(false)
  })

  it('isEmpty — 빈 / 채워진 상태', async () => {
    const store = useLibraryStore()
    expect(store.isEmpty).toBe(true)
    fetchLibraryApi.mockResolvedValueOnce({
      success: true, repos: [{ url: 'https://x/y' }],
    })
    await store.fetchLibrary()
    expect(store.isEmpty).toBe(false)
  })
})
