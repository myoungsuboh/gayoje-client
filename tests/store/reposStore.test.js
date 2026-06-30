/**
 * useReposStore — 캐시 정책 + CRUD + GitHub meta enrichment.
 *
 * [회귀 가드]
 * - fetchProjectRepos: 30초 캐시 hit / force=true bypass / 실패 → success=false
 * - addProjectRepo / deleteProjectRepo: 캐시 무효화 (delete entry)
 * - fetchRepoMeta: 1시간 TTL / force=true bypass / localStorage 캐시
 * - clearRepoMetaCache: url 단일 / 전체 정리
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    isCancel: () => false,
  },
}))

vi.mock('@/utils/github', () => ({
  enrichRepo: vi.fn(),
}))

import axios from '@/utils/axios'
import { enrichRepo } from '@/utils/github'
import { useReposStore } from '@/store/repos'
import { useProjectStore } from '@/store/project'


describe('useReposStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    axios.post.mockReset()
    enrichRepo.mockReset()
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  // ─── fetchProjectRepos: 캐시 정책 ─────────────────────────

  it('fetchProjectRepos — 30초 캐시 hit (force=false 두번째 호출은 axios 안 부름)', async () => {
    axios.post.mockResolvedValueOnce({
      data: { repos: [{ url: 'https://github.com/a/b' }] },
    })
    const store = useReposStore()
    const r1 = await store.fetchProjectRepos({ projectName: 'p' })
    const r2 = await store.fetchProjectRepos({ projectName: 'p' })
    expect(r1.success).toBe(true)
    expect(r1.fromCache).toBe(false)
    expect(r2.success).toBe(true)
    expect(r2.fromCache).toBe(true)
    expect(axios.post).toHaveBeenCalledTimes(1)
  })

  it('fetchProjectRepos — force=true 면 캐시 무시 + axios 재호출', async () => {
    axios.post.mockResolvedValue({ data: { repos: [] } })
    const store = useReposStore()
    await store.fetchProjectRepos({ projectName: 'p' })
    await store.fetchProjectRepos({ projectName: 'p', force: true })
    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  it('fetchProjectRepos — projectName 없으면 즉시 실패', async () => {
    const store = useReposStore()
    const r = await store.fetchProjectRepos({})
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/projectName/)
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('fetchProjectRepos — 네트워크 에러 → success=false', async () => {
    axios.post.mockRejectedValueOnce(new Error('Network down'))
    const store = useReposStore()
    const r = await store.fetchProjectRepos({ projectName: 'p' })
    expect(r.success).toBe(false)
    expect(r.error).toBe('Network down')
  })

  // ─── projectStore 와 연동 (default projectName) ────────

  it('fetchProjectRepos — projectName 미전달 시 useProjectStore 의 값 사용', async () => {
    axios.post.mockResolvedValueOnce({ data: { repos: [] } })
    const ps = useProjectStore()
    ps.projectName = 'from_store'
    const store = useReposStore()
    await store.fetchProjectRepos()
    expect(axios.post.mock.calls[0][1]).toEqual({ projectName: 'from_store' })
  })

  // ─── addProjectRepo / deleteProjectRepo: 캐시 무효화 ──

  it('addProjectRepo — 성공 후 같은 프로젝트 캐시가 무효화됨', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { repos: [{ url: 'https://github.com/a/b' }] } })  // fetch1
      .mockResolvedValueOnce({ data: { ok: true } })  // add
      .mockResolvedValueOnce({ data: { repos: [{ url: 'https://github.com/c/d' }] } })  // fetch2
    const store = useReposStore()
    await store.fetchProjectRepos({ projectName: 'p' })
    await store.addProjectRepo({ projectName: 'p', url: 'https://github.com/c/d' })
    // 캐시 무효화 검증 — 두 번째 fetch 가 axios 실제 호출
    const r = await store.fetchProjectRepos({ projectName: 'p' })
    expect(r.fromCache).toBe(false)
  })

  it('addProjectRepo — url 정규화 (trailing slash + .git 제거)', async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } })
    const store = useReposStore()
    await store.addProjectRepo({
      projectName: 'p',
      url: 'https://github.com/a/b.git/',
    })
    expect(axios.post.mock.calls[0][1].url).toBe('https://github.com/a/b')
  })

  it('deleteProjectRepo — 캐시 무효화', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { repos: [{ url: 'x' }] } })
      .mockResolvedValueOnce({ data: { ok: true } })
      .mockResolvedValueOnce({ data: { repos: [] } })
    const store = useReposStore()
    await store.fetchProjectRepos({ projectName: 'p' })
    await store.deleteProjectRepo({ projectName: 'p', url: 'https://x/y' })
    const r = await store.fetchProjectRepos({ projectName: 'p' })
    expect(r.fromCache).toBe(false)
  })

  // ─── fetchRepoMeta: TTL + localStorage 캐시 ─────────────

  it('fetchRepoMeta — 1시간 TTL 안에는 캐시 hit + localStorage 저장', async () => {
    enrichRepo.mockResolvedValueOnce({
      ok: true, name: 'b', owner: 'a', stars: 10,
    })
    const store = useReposStore()
    const r1 = await store.fetchRepoMeta({ url: 'https://github.com/a/b' })
    expect(r1.success).toBe(true)
    expect(r1.fromCache).toBe(false)
    const r2 = await store.fetchRepoMeta({ url: 'https://github.com/a/b' })
    expect(r2.fromCache).toBe(true)
    expect(enrichRepo).toHaveBeenCalledTimes(1)
    // localStorage 영속화 확인
    const raw = localStorage.getItem('harness_repo_meta_v1')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw)
    expect(parsed['https://github.com/a/b']).toBeDefined()
  })

  it('fetchRepoMeta — force=true 면 캐시 무시', async () => {
    enrichRepo.mockResolvedValue({ ok: true, stars: 1 })
    const store = useReposStore()
    await store.fetchRepoMeta({ url: 'https://github.com/a/b' })
    await store.fetchRepoMeta({ url: 'https://github.com/a/b', force: true })
    expect(enrichRepo).toHaveBeenCalledTimes(2)
  })

  it('fetchRepoMeta — enrichRepo 실패 시 success=false + error 전파', async () => {
    enrichRepo.mockResolvedValueOnce({ ok: false, error: '404', status: 404 })
    const store = useReposStore()
    const r = await store.fetchRepoMeta({ url: 'https://github.com/x/y' })
    expect(r.success).toBe(false)
    expect(r.error).toBe('404')
    expect(r.status).toBe(404)
  })

  it('clearRepoMetaCache — url 단일 / 전체 분기', async () => {
    enrichRepo.mockResolvedValue({ ok: true })
    const store = useReposStore()
    await store.fetchRepoMeta({ url: 'https://a/x' })
    await store.fetchRepoMeta({ url: 'https://a/y' })
    store.clearRepoMetaCache('https://a/x')
    expect(store.getCachedRepoMeta('https://a/x')).toBeNull()
    expect(store.getCachedRepoMeta('https://a/y')).not.toBeNull()
    store.clearRepoMetaCache()
    expect(store.getCachedRepoMeta('https://a/y')).toBeNull()
  })
})
