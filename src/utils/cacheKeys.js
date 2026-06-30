/**
 * 앱 LS 캐시 키 + 사용자 전환/로그아웃 시 정리할 키 목록.
 *
 * [이전]
 * 동일 배열이 utils/auth.js + utils/axios.js 두 곳에 정의 (순환 import 회피 주석).
 * 신규 캐시 키 추가 시 두 곳 동시 갱신 필요 → drift 위험.
 *
 * [현재]
 * 이 모듈에 한 곳 정의. auth.js / axios.js 가 import.
 * auth.js → axios.js 단방향 의존만 있으니 이 모듈에 두면 순환 없음.
 *
 * [정책]
 * 사용자가 명시적 logout 하거나 401 refresh 실패 → 모두 정리.
 * BE 가 단일 진실원인 항목 (예: lineage truth) 도 함께 정리 — 다음 로그인 시
 * 새 fetch 가 자연스럽게 채움.
 */
export const APP_CACHE_KEYS = [
  'harness_lint_cache_v1',
  'harness_lineage_cache_v1',
  'harness_lineage_truth_v1',
  'harness_repo_meta_v1',
  'harness_project_state_v1',
  'harness_web_vitals_v1',
  // [2026-05-18 보안] jobs store 영속화 — 사용자 전환 시 다른 사용자의 batch 작업/
  // 미팅 제목이 그대로 노출되던 사고 대응. 반드시 logout 시 정리.
  'harness_jobs_state_v1',
  // [2026-05] 80%/100% 사용량 마일스톤 토스트 플래그 — 사용자별로 1회 안내.
  // 공용 PC 에서 사용자 전환 시 누설 (이전 사용자가 본 안내가 새 사용자에게 안 떠서
  // 한도 초과를 모르고 사용 후 막힘) 방지. 사용자 마다 fresh 안내.
  'harness_quota_milestone_tokens80',
  'harness_quota_milestone_tokens100',
  'harness_quota_milestone_meeting80',
  'harness_quota_milestone_meeting100',
  // [2026-06-22] 미팅 로그 신규 작성 임시 초안 — 공용 PC 사용자 전환/로그아웃 시
  // 다른 사용자에게 작성 중이던 내용이 노출되지 않도록 정리.
  'harness_meeting_draft_v1',
]
