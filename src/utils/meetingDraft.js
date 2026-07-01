/**
 * 미팅 로그 "신규 작성" 초안 로컬 보존 — 저장(분석 시작) 전 작성 중인 내용이
 * 페이지 이동(프로필 등)·새로고침으로 사라지지 않도록 localStorage 에 임시 보관.
 *
 * [배경]
 * editContent / isNewLogMode 는 MeetingLogTab 의 로컬 ref 라, /plan → /profile →
 * /plan 처럼 라우트가 바뀌면 컴포넌트가 unmount 되며 작성 내용이 통째로 사라졌다.
 * 특히 AI 인터뷰로 합성한 회의록은 토큰을 소모해 만든 결과라 유실 시 비용 낭비.
 *
 * [정책]
 * - 프로젝트별로 1건 보관 ({ [project]: { content, savedAt } }).
 * - 저장(enqueue 성공) / 명시적 작성 취소 / 신규 작성 모드 종료 시 해당 프로젝트 초안 제거.
 * - 공용 PC 사용자 전환·로그아웃 시 누설 방지를 위해 APP_CACHE_KEYS 에 등록(일괄 정리).
 * - 비정상 크기(초대형) 보호를 위해 프로젝트 수 상한(MAX_PROJECTS) 적용 — 오래된 것부터 제거.
 */

export const MEETING_DRAFT_KEY = 'gayoje_meeting_draft_v1'

// 동시에 보관할 프로젝트 초안 수 상한 (오래된 순으로 제거).
const MAX_PROJECTS = 12

const _read = () => {
  try {
    const raw = localStorage.getItem(MEETING_DRAFT_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

const _write = (map) => {
  try {
    localStorage.setItem(MEETING_DRAFT_KEY, JSON.stringify(map))
  } catch {
    /* QuotaExceeded 등 — 초안 보존은 best-effort 라 조용히 무시 */
  }
}

const _key = (project) => (project || 'harness').trim() || 'harness'

/** 프로젝트의 저장된 초안 내용 반환 (없으면 ''). */
export const loadMeetingDraft = (project) => {
  const entry = _read()[_key(project)]
  return entry && typeof entry.content === 'string' ? entry.content : ''
}

/** 해당 프로젝트에 비어있지 않은 초안이 보관돼 있는지. */
export const hasMeetingDraft = (project) => loadMeetingDraft(project).trim().length > 0

/** 초안 저장 — 내용이 비어 있으면 제거. */
export const saveMeetingDraft = (project, content) => {
  const key = _key(project)
  const map = _read()
  if (!content || !content.trim()) {
    if (map[key]) {
      delete map[key]
      _write(map)
    }
    return
  }
  map[key] = { content, savedAt: Date.now() }
  // 상한 초과 시 오래된 초안부터 제거.
  const keys = Object.keys(map)
  if (keys.length > MAX_PROJECTS) {
    keys
      .sort((a, b) => (map[a]?.savedAt || 0) - (map[b]?.savedAt || 0))
      .slice(0, keys.length - MAX_PROJECTS)
      .forEach((k) => { delete map[k] })
  }
  _write(map)
}

/** 해당 프로젝트 초안 제거 (저장/취소 완료 시). */
export const clearMeetingDraft = (project) => {
  const key = _key(project)
  const map = _read()
  if (map[key]) {
    delete map[key]
    _write(map)
  }
}
