/**
 * useProjectStore — 현재 선택된 projectName / githubUrl / 탭 인덱스 + 삭제.
 *
 * [회귀 가드]
 * - 초기값: projectName 빈 문자열 (신규 유저 403 폭주 방지)
 * - setProjectName / setGithubUrl / setCurrentTab / setSelectedBenchmark
 * - deleteProject: 성공/실패 분기, target 기본값 = projectName.value
 * - persistedstate: pick 옵션 — 영속 대상 필드만 (현재 코드 검증)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/axios', () => ({
  default: {
    delete: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  },
}))

import axios from '@/utils/axios'
import { useProjectStore } from '@/store/project'


describe('useProjectStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    axios.delete.mockReset()
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  // ─── 초기 상태 ──────────────────────────────────────────

  it('초기값 — projectName 빈 문자열 (신규 유저 403 폭주 방지)', () => {
    const store = useProjectStore()
    expect(store.projectName).toBe('')
    expect(store.githubUrl).toBe('')
    expect(store.currentTab).toBe(0)
    expect(store.selectedBenchmarkIndex).toBe(0)
    expect(store.isRegisteringLog).toBe(false)
    expect(store.isDeletingProject).toBe(false)
  })

  // ─── setter ─────────────────────────────────────────────

  it('setProjectName 갱신', () => {
    const store = useProjectStore()
    store.setProjectName('p1')
    expect(store.projectName).toBe('p1')
  })

  it('setGithubUrl 갱신', () => {
    const store = useProjectStore()
    store.setGithubUrl('https://github.com/a/b')
    expect(store.githubUrl).toBe('https://github.com/a/b')
  })

  it('setCurrentTab + setSelectedBenchmark 갱신', () => {
    const store = useProjectStore()
    store.setCurrentTab(2)
    store.setSelectedBenchmark(3)
    expect(store.currentTab).toBe(2)
    expect(store.selectedBenchmarkIndex).toBe(3)
  })

  // ─── deleteProject ──────────────────────────────────────

  it('deleteProject — 성공', async () => {
    axios.delete.mockResolvedValueOnce({ data: { ok: true } })
    const store = useProjectStore()
    store.setProjectName('p1')
    const r = await store.deleteProject()
    expect(r.success).toBe(true)
    expect(r.target).toBe('p1')
    expect(store.isDeletingProject).toBe(false)  // finally 분기 검증
  })

  it('deleteProject — 명시 인자가 store 값보다 우선', async () => {
    axios.delete.mockResolvedValueOnce({ data: { ok: true } })
    const store = useProjectStore()
    store.setProjectName('default_name')
    const r = await store.deleteProject('explicit_name')
    expect(r.target).toBe('explicit_name')
    // axios 호출 인자 검증
    const call = axios.delete.mock.calls[0]
    expect(call[1].data.projectName).toBe('explicit_name')
  })

  it('deleteProject — 실패 시 success=false + error 메시지', async () => {
    axios.delete.mockRejectedValueOnce(new Error('Network'))
    const store = useProjectStore()
    store.setProjectName('p1')
    const r = await store.deleteProject()
    expect(r.success).toBe(false)
    expect(r.error).toBe('Network')
    expect(store.isDeletingProject).toBe(false)
  })

  it('deleteProject — 진행 중 isDeletingProject=true (state 가드)', async () => {
    let resolveDelete
    axios.delete.mockImplementationOnce(
      () => new Promise(r => { resolveDelete = r }),
    )
    const store = useProjectStore()
    store.setProjectName('p')
    const p = store.deleteProject()
    expect(store.isDeletingProject).toBe(true)
    resolveDelete({ data: {} })
    await p
    expect(store.isDeletingProject).toBe(false)
  })
})
