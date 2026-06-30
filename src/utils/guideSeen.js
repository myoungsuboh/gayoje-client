/**
 * 페이지 사용 가이드 "봤음" 플래그 — 계정 단위로 최초 1회만 자동 표시.
 *
 * [2026-06] 이전에는 가이드 모달의 "다시 안보기"/완료 버튼을 눌러야만 seen 저장 →
 * X/배경 클릭으로 닫으면 페이지 진입마다 다시 떴음. 이제 모달이 열리는 순간
 * seen 으로 기록 (계정당 최초 1회). 다시 보고 싶으면 각 페이지의 가이드 버튼.
 *
 * 키는 계정 email 로 스코프 — 공용 PC 에서 다른 계정 로그인 시 그 계정의
 * 첫 방문에는 가이드가 정상적으로 1회 표시된다. APP_CACHE_KEYS 에 넣지 않아
 * 로그아웃 후 재로그인해도 다시 뜨지 않음 (계정당 1회 유지).
 */
import { getCurrentUser } from '@/utils/auth'

const scopedKey = (baseKey) => {
  const email = (getCurrentUser()?.email || '').toLowerCase().trim() || 'anon'
  return `${baseKey}::${email}`
}

export const isGuideSeen = (baseKey) => {
  try { return !!localStorage.getItem(scopedKey(baseKey)) } catch { return false }
}

export const markGuideSeen = (baseKey) => {
  try { localStorage.setItem(scopedKey(baseKey), '1') } catch { /* ignore */ }
}
