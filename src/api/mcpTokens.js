/**
 * MCP 전용 토큰 API client.
 *
 * - 로그인 access_token 으로 인증 (axios 인터셉터가 자동 첨부).
 * - 발급 응답의 `token` 은 평문 — 한 번만 받을 수 있으므로 즉시 모달에 표시 후 컴포넌트 state 에서 제거.
 */
import axios from '@/utils/axios'

export const issueMcpToken = async (label) => {
  const res = await axios.post('/api/mcp-tokens', { label })
  return res.data
}

export const listMcpTokens = async () => {
  const res = await axios.get('/api/mcp-tokens')
  return res.data
}

export const revokeMcpToken = async (jti) => {
  await axios.delete(`/api/mcp-tokens/${jti}`)
}
