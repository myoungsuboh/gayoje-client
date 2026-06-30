/**
 * 팀 API client — 팀 CRUD / 멤버 관리 / 초대.
 * axios 인터셉터가 Bearer 토큰 자동 첨부.
 */
import axios from '@/utils/axios'

// ─── 팀 CRUD ──────────────────────────────────────────────────

export const createTeam = async (name) => {
  const res = await axios.post('/api/teams', { name })
  return res.data
}

export const listMyTeams = async () => {
  const res = await axios.get('/api/teams')
  return res.data
}

export const getTeam = async (teamId) => {
  const res = await axios.get(`/api/teams/${teamId}`)
  return res.data
}

export const updateTeam = async (teamId, name) => {
  const res = await axios.patch(`/api/teams/${teamId}`, { name })
  return res.data
}

export const deleteTeam = async (teamId) => {
  await axios.delete(`/api/teams/${teamId}`)
}

// ─── 팀 프로젝트 ──────────────────────────────────────────────

export const listTeamProjects = async (teamId) => {
  const res = await axios.get(`/api/teams/${teamId}/projects`)
  return res.data
}

// ─── 멤버 ────────────────────────────────────────────────────

export const changeMemberRole = async (teamId, email, role) => {
  const res = await axios.patch(`/api/teams/${teamId}/members/${encodeURIComponent(email)}`, { role })
  return res.data
}

export const removeMember = async (teamId, email) => {
  await axios.delete(`/api/teams/${teamId}/members/${encodeURIComponent(email)}`)
}

// ─── 초대 ────────────────────────────────────────────────────

export const createInvite = async (teamId, email, role = 'member') => {
  const res = await axios.post(`/api/teams/${teamId}/invites`, { email, role })
  return res.data
}

export const listPendingInvites = async (teamId) => {
  const res = await axios.get(`/api/teams/${teamId}/invites`)
  return res.data
}

export const cancelInvite = async (teamId, token) => {
  await axios.delete(`/api/teams/${teamId}/invites/${token}`)
}

export const getInviteInfo = async (token) => {
  const res = await axios.get(`/api/invites/${token}`)
  return res.data
}

export const acceptInvite = async (token) => {
  const res = await axios.post(`/api/invites/${token}/accept`)
  return res.data
}

export const declineInvite = async (token) => {
  const res = await axios.post(`/api/invites/${token}/decline`)
  return res.data
}
