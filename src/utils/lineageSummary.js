/**
 * [2026-06-06] Lineage 결과 → Story 중심 "구현 점검" 요약 (순수 함수, 단위테스트 대상).
 *
 * "산출물 계보" 재설계: 비전문가용 단순 결과 카드가 쓰는 파생값. 구현 여부는
 * implementations.length 로 직접 판정 — missingImpl 의존 X (이중카운트 회피).
 */
const implementedOf = (arr) => (arr || []).filter((it) => (it.implementations || []).length > 0)

export function buildLineageSummary(data) {
  const stories = (data && data.stories) || []
  const implemented = implementedOf(stories)
  const total = stories.length

  // 미구현 story 힌트 — missingImpl(type='story')의 reason 우선, 없으면 description.
  const reasonById = {}
  for (const m of (data && data.missingImpl) || []) {
    if (String(m.type || '').toLowerCase() === 'story') reasonById[m.id] = m.reason || ''
  }
  const missingStories = stories
    .filter((s) => !(s.implementations || []).length)
    .map((s) => ({ id: s.id, name: s.name || s.id, hint: reasonById[s.id] || s.description || '' }))

  // 기술 항목 롤업 (안심용 1줄 요약).
  const tech = {}
  for (const key of ['apis', 'aggregates', 'services']) {
    const arr = (data && data[key]) || []
    tech[key] = { total: arr.length, mapped: implementedOf(arr).length }
  }

  return {
    storyTotal: total,
    storyImplemented: implemented.length,
    storyPct: total ? Math.round((implemented.length / total) * 100) : 0,
    implementedStories: implemented,
    missingStories,
    hasStories: total > 0,
    tech,
  }
}
