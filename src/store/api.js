// Gateway compat dispatcher (`/api/gateway/{action}`) — 백엔드 도메인 라우트 prefix.
//
// 운영(Vercel): 기본값 '/api/gateway' (same-origin 상대 경로).
// vercel.json rewrites 가 Vultr 백엔드(http://158.247.196.111:8000)로 프록시.
// 로컬 dev: .env 에 VITE_GATEWAY_BASE=http://localhost:8000/api/gateway 설정.
export const API_BASE =
  import.meta.env.VITE_GATEWAY_BASE
  || import.meta.env.VITE_N8N_WEBHOOK_BASE
  || '/api/gateway'
