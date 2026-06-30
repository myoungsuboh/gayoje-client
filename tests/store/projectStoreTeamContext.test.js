/**
 * [Phase F] useProjectStore — 팀 작업 컨텍스트 (activeTeamId / activeTeamName).
 *
 * [회귀 가드 — 보안 핵심]
 * - setProjectContext(name, teamId, teamName): 팀 컨텍스트 set + axios 미러 동기화
 * - setProjectName: "개인 프로젝트 선택" → 남아있던 팀 컨텍스트 자동 해제
 *   (팀 컨텍스트 누수로 개인 호출에 team_id 가 새는 것 차단 — 가장 중요)
 * - deleteProject: 팀 컨텍스트면 team_id 동봉, 개인이면 미동봉
 * - resetAll / 사용자 전환(assertOwner): 팀 컨텍스트 클리어
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const setTeamContextMock = vi.fn()

vi.mock('@/utils/axios', () => ({
  default: {
    delete: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  },
  setTeamContext: (...args) => setTeamContextMock(...args),
}))

import axios from '@/utils/axios'
import { useProjectStore } from '@/store/project'


describe('useProjectStore — 팀 컨텍스트 (Phase F)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    axios.delete.mockReset()
    setTeamContextMock.mockReset()
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  // ─── 초기 상태 ──────────────────────────────────────────

  it('초기값 — activeTeamId / activeTeamName 빈 문자열 (개인 컨텍스트)', () => {
    const store = useProjectStore()
    expect(store.activeTeamId).toBe('')
    expect(store.activeTeamName).toBe('')
  })

  // ─── setProjectContext ──────────────────────────────────

  it('setProjectContext — 팀 프로젝트 선택 시 id/name set + axios 미러 동기화', () => {
    const store = useProjectStore()
    store.setProjectContext('proj-a', 'team-1', 'Team A')
    expect(store.projectName).toBe('proj-a')
    expect(store.activeTeamId).toBe('team-1')
    expect(store.activeTeamName).toBe('Team A')
    expect(setTeamContextMock).toHaveBeenLastCalledWith('team-1')
  })

  it('setProjectContext — teamId 없으면 개인 컨텍스트로 해제 (name 무시)', () => {
    const store = useProjectStore()
    store.setProjectContext('proj-a', 'team-1', 'Team A')
    store.setProjectContext('personal-x', '', 'ignored')
    expect(store.projectName).toBe('personal-x')
    expect(store.activeTeamId).toBe('')
    expect(store.activeTeamName).toBe('')
    expect(setTeamContextMock).toHaveBeenLastCalledWith('')
  })

  // ─── 보안 핵심: setProjectName 이 팀 컨텍스트 누수 차단 ──

  it('setProjectName — 팀 컨텍스트 활성 중 개인 프로젝트 선택 시 팀 컨텍스트 해제', () => {
    const store = useProjectStore()
    store.setProjectContext('team-proj', 'team-1', 'Team A')
    expect(store.activeTeamId).toBe('team-1')

    // 사용자가 ProjectLookup / MyProjectsModal 로 개인 프로젝트 선택.
    store.setProjectName('my-personal')
    expect(store.projectName).toBe('my-personal')
    expect(store.activeTeamId).toBe('')        // 누수 차단
    expect(store.activeTeamName).toBe('')
    expect(setTeamContextMock).toHaveBeenLastCalledWith('')
  })

  it('setProjectName — 이미 개인 컨텍스트면 setTeamContext 불필요 호출 안 함', () => {
    const store = useProjectStore()
    setTeamContextMock.mockReset()
    store.setProjectName('p1')
    // 팀 컨텍스트가 애초에 없었으므로 미러 재동기화 불필요.
    expect(setTeamContextMock).not.toHaveBeenCalled()
  })

  // ─── deleteProject 팀/개인 분기 ─────────────────────────

  it('deleteProject — 팀 컨텍스트면 team_id 동봉', async () => {
    axios.delete.mockResolvedValueOnce({ data: { ok: true } })
    const store = useProjectStore()
    store.setProjectContext('team-proj', 'team-9', 'Team Nine')
    await store.deleteProject()
    const call = axios.delete.mock.calls[0]
    expect(call[1].data.projectName).toBe('team-proj')
    expect(call[1].data.team_id).toBe('team-9')
  })

  it('deleteProject — 개인 프로젝트면 team_id 미동봉', async () => {
    axios.delete.mockResolvedValueOnce({ data: { ok: true } })
    const store = useProjectStore()
    store.setProjectName('personal')
    await store.deleteProject()
    const call = axios.delete.mock.calls[0]
    expect(call[1].data.projectName).toBe('personal')
    expect(call[1].data.team_id).toBeUndefined()
  })

  // ─── reset / 사용자 전환 격리 ───────────────────────────

  it('resetAll — 팀 컨텍스트 클리어 + axios 미러 초기화', () => {
    const store = useProjectStore()
    store.setProjectContext('team-proj', 'team-1', 'Team A')
    store.resetAll()
    expect(store.activeTeamId).toBe('')
    expect(store.activeTeamName).toBe('')
    expect(store.projectName).toBe('')
    expect(setTeamContextMock).toHaveBeenLastCalledWith('')
  })

  it('assertOwner — 다른 사용자 로그인 시 팀 컨텍스트도 격리(클리어)', () => {
    const store = useProjectStore()
    store.assertOwner('alice@example.com')        // 첫 소유자 등록
    store.setProjectContext('team-proj', 'team-1', 'Team A')
    store.assertOwner('bob@example.com')          // 사용자 전환
    expect(store.activeTeamId).toBe('')
    expect(store.activeTeamName).toBe('')
    expect(store.projectName).toBe('')
    expect(setTeamContextMock).toHaveBeenLastCalledWith('')
  })

  // ─── setActiveTeamId 직접 ───────────────────────────────

  it('setActiveTeamId — id 없이 호출 시 name 도 비움', () => {
    const store = useProjectStore()
    store.setActiveTeamId('team-1', 'Team A')
    expect(store.activeTeamId).toBe('team-1')
    expect(store.activeTeamName).toBe('Team A')
    store.setActiveTeamId('', 'ignored')
    expect(store.activeTeamId).toBe('')
    expect(store.activeTeamName).toBe('')
  })
})
