/**
 * [Phase F] axios 요청 인터셉터 — 팀 컨텍스트(team_id) 자동 첨부 회귀 가드.
 *
 * [보안 핵심]
 * 활성 팀(setTeamContext)이 있을 때만, 그리고 프로젝트 API 경로(gateway/v2)
 * 호출에만 team_id 를 첨부한다. auth/usage 등 비-프로젝트 경로엔 첨부 금지.
 * 호출자가 이미 team_id 를 명시했으면 덮어쓰지 않는다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// useSnackbar 는 인터셉터 모듈 로드시 사용 — 가벼운 stub.
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showError: vi.fn() }),
}))

import instance, { setTeamContext } from '@/utils/axios'

// 요청 인터셉터 fulfilled 핸들러 직접 호출.
const runRequestInterceptor = (config) =>
  instance.interceptors.request.handlers[0].fulfilled({ ...config })

describe('axios team_id 자동 첨부 (Phase F)', () => {
  beforeEach(() => {
    setTeamContext('')           // 기본: 개인 컨텍스트
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  // ─── 팀 컨텍스트 활성 시 ────────────────────────────────

  it('GET + 프로젝트 경로 — params.team_id 첨부', () => {
    setTeamContext('team-1')
    const out = runRequestInterceptor({ url: '/api/v2/cps', method: 'get', params: { project_name: 'p' } })
    expect(out.params.team_id).toBe('team-1')
  })

  it('POST + gateway 경로 — body.team_id 첨부', () => {
    setTeamContext('team-2')
    const out = runRequestInterceptor({ url: '/api/gateway/postMeeting', method: 'post', data: { projectName: 'p' } })
    expect(out.data.team_id).toBe('team-2')
  })

  it('DELETE + body 없음 — team_id 만 담은 body 생성', () => {
    setTeamContext('team-3')
    const out = runRequestInterceptor({ url: '/api/v2/projects/p', method: 'delete' })
    expect(out.data.team_id).toBe('team-3')
  })

  // ─── 비-프로젝트 경로엔 첨부 금지 ───────────────────────

  it('auth 경로 — team_id 미첨부 (활성 팀 있어도)', () => {
    setTeamContext('team-1')
    const out = runRequestInterceptor({ url: '/auth/me', method: 'get', params: {} })
    expect(out.params.team_id).toBeUndefined()
  })

  it('usage 경로 — team_id 미첨부', () => {
    setTeamContext('team-1')
    const out = runRequestInterceptor({ url: '/api/usage/summary', method: 'get', params: {} })
    expect(out.params.team_id).toBeUndefined()
  })

  // ─── 개인 컨텍스트(팀 없음) ─────────────────────────────

  it('활성 팀 없음 — 프로젝트 경로라도 team_id 미첨부', () => {
    const out = runRequestInterceptor({ url: '/api/v2/cps', method: 'get', params: { project_name: 'p' } })
    expect(out.params.team_id).toBeUndefined()
  })

  // ─── 호출자 명시 우선 ───────────────────────────────────

  it('호출자가 team_id 명시 — 덮어쓰지 않음 (GET)', () => {
    setTeamContext('team-1')
    const out = runRequestInterceptor({ url: '/api/v2/cps', method: 'get', params: { team_id: 'explicit' } })
    expect(out.params.team_id).toBe('explicit')
  })

  it('호출자가 team_id 명시 — 덮어쓰지 않음 (POST body)', () => {
    setTeamContext('team-1')
    const out = runRequestInterceptor({ url: '/api/gateway/postMeeting', method: 'post', data: { team_id: 'explicit', projectName: 'p' } })
    expect(out.data.team_id).toBe('explicit')
  })
})
