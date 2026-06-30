/**
 * 용어 사전 (Glossary) — 하네스에서 쓰이는 약어/전문용어를 한곳에 모아 쉬운 말로 풀이.
 *
 * [배경 — 2026-05-30 B2C 개선]
 * GuideTooltip(인라인 ⓘ)은 "그 자리에서" 짧게 설명하지만, 사용자가 ⓘ 를 못 보거나
 * "아까 그 단어가 뭐였지?" 하고 되짚을 때 한눈에 훑을 곳이 없었다. 이 사전은 헤더의
 * "용어 사전" 버튼으로 언제든 열 수 있고, 검색으로 단어를 바로 찾는다.
 *
 * [작성 원칙] (guides.js 와 동일)
 *  - 영문 약어는 한글 풀이를 항상 곁들인다.
 *  - 일상 비유(쇼핑몰·주문·회의)로 시작해 "왜 필요한지"를 먼저 말한다.
 *  - 한 항목은 2~3문장 이내. 더 깊은 설명은 인라인 가이드(GUIDES)에 맡긴다.
 *
 * [i18n — 2026-06]
 * 한글/영문 텍스트(분류 라벨·용어 이름·설명·예시)는 src/locales/{ko,en}/glossary.json
 * 으로 이관. 이 파일은 "순서/구조/약어"만 정의하고, 텍스트는 현재 locale 로 resolve.
 * group 은 사용자 여정 순서대로: 기획 → 설계 → 점검 → 산출물.
 */
import i18n from '@/plugins/i18n'

const t = (key) => i18n.global.t(key)

/**
 * @typedef {Object} GlossaryTerm
 * @property {string} id       i18n 키 식별자 (glossary.terms.<id>).
 * @property {string} term     이름 (locale 로 resolve).
 * @property {string} [abbr]   영문 약어 / 원어 (있으면 term 옆 작은 글씨). 언어 무관 리터럴.
 * @property {string} group    분류 키 (GLOSSARY_GROUPS 참고).
 * @property {string} desc     쉬운 말 풀이 (locale 로 resolve).
 * @property {string} [example] 한 줄 예시 (locale 로 resolve, 없으면 '').
 */

// 분류 — 순서/키만 고정. label/hint 는 glossary.groups.<key>.* 에서 resolve.
const GROUP_KEYS = ['plan', 'design', 'lint', 'deliver']

export const GLOSSARY_GROUPS = GROUP_KEYS.map((key) => ({
  key,
  get label() { return t(`glossary.groups.${key}.label`) },
  get hint() { return t(`glossary.groups.${key}.hint`) },
}))

// 용어 — 순서/약어/그룹만 고정. term/desc/example 은 glossary.terms.<id>.* 에서 resolve.
// abbr 은 언어 무관 약어라 리터럴 유지.
const GLOSSARY_DEFS = [
  // ─── ① 기획 ───────────────────────────────────────────────
  { id: 'meeting_log', abbr: 'Meeting Log', group: 'plan' },
  { id: 'cps', abbr: 'CPS', group: 'plan' },
  { id: 'prd', abbr: 'PRD', group: 'plan' },
  { id: 'epic', abbr: 'Epic', group: 'plan' },
  { id: 'story', abbr: 'Story', group: 'plan' },
  { id: 'acceptance_criteria', abbr: 'Acceptance Criteria', group: 'plan' },
  { id: 'nfr', abbr: 'NFR', group: 'plan' },
  { id: 'rule_generator', abbr: 'Rule Generator', group: 'plan' },

  // ─── ② 설계 ───────────────────────────────────────────────
  { id: 'spack', abbr: 'SPACK', group: 'design' },
  { id: 'api', abbr: 'API', group: 'design' },
  { id: 'entity', abbr: 'Entity', group: 'design' },
  { id: 'policy', abbr: 'Policy', group: 'design' },
  { id: 'ddd', abbr: 'DDD', group: 'design' },
  { id: 'bounded_context', abbr: 'Bounded Context', group: 'design' },
  { id: 'aggregate', abbr: 'Aggregate', group: 'design' },
  { id: 'domain_event', abbr: 'Domain Event', group: 'design' },
  { id: 'architecture', abbr: 'Architecture', group: 'design' },
  { id: 'vibe_coding', abbr: 'Vibe Coding', group: 'design' },

  // ─── ③ 점검 ───────────────────────────────────────────────
  { id: 'lint', abbr: 'Lint', group: 'lint' },
  { id: 'traceability', abbr: 'Traceability', group: 'lint' },
  { id: 'deterministic', abbr: 'Deterministic', group: 'lint' },
  { id: 'fix_agent', abbr: 'Fix Agent', group: 'lint' },

  // ─── ④ 산출물 ─────────────────────────────────────────────
  { id: 'lineage', abbr: 'Lineage', group: 'deliver' },
  { id: 'coverage', abbr: 'Coverage', group: 'deliver' },
  { id: 'handoff_zip', abbr: 'Handoff ZIP', group: 'deliver' },
  { id: 'repository', abbr: 'Repository', group: 'deliver' },
]

/**
 * 현재 locale 로 resolve 된 용어 목록. getter 로 term/desc/example 을 매번
 * 현재 언어로 읽어 locale 전환 시 자동 반영.
 * @type {GlossaryTerm[]}
 */
export const GLOSSARY = GLOSSARY_DEFS.map((d) => ({
  id: d.id,
  abbr: d.abbr,
  group: d.group,
  get term() { return t(`glossary.terms.${d.id}.name`) },
  get desc() { return t(`glossary.terms.${d.id}.desc`) },
  get example() { return t(`glossary.terms.${d.id}.example`) },
}))

/**
 * 검색어로 용어 필터. 이름(term)·약어(abbr)·설명(desc)·예시(example) 모두에서
 * 부분일치(대소문자 무시). 현재 locale 기준으로 검색.
 * @param {string} query
 * @returns {GlossaryTerm[]}
 */
export function searchGlossary(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return GLOSSARY
  return GLOSSARY.filter((term) =>
    term.term.toLowerCase().includes(q)
    || (term.abbr || '').toLowerCase().includes(q)
    || term.desc.toLowerCase().includes(q)
    || (term.example || '').toLowerCase().includes(q),
  )
}
