/**
 * [B — 2026-05] design lineage 공용 헬퍼.
 *
 * 각 탭 (Spack/DDD/Architecture) 이 노드 list 에서 lineage 채움률을 계산할 때
 * 공유. 같은 로직을 3곳 복붙 방지 + BE 의 _compute_lineage_coverage 와 동일 계산
 * 결과 보장.
 */
import { computed } from 'vue'
import { getNodeProp } from '@/utils/nodeUtils'
import i18n from '@/plugins/i18n'

/**
 * 노드 list (entities / aggregates / services) 에서 lineage.confidence 분포 계산.
 *
 * Returns: ref-friendly computed value
 *   { total, direct, inferred, none, coverage_pct }
 */
export const useLineageCoverage = (itemsRef) => {
  return computed(() => {
    const items = itemsRef.value || []
    const total = items.length
    if (total === 0) {
      return { total: 0, direct: 0, inferred: 0, none: 0, coverage_pct: 0 }
    }
    const counts = { direct: 0, inferred: 0, none: 0 }
    for (const it of items) {
      // BE 가 Neo4j 저장 시 lineage.confidence 를 flat `lineage_confidence` 로 펴서
      // 저장 (design_pipeline.py _flatten_for_neo4j). GET 응답엔 flat 만 옴.
      // nested 구조도 fallback 으로 유지 — 다른 곳에서 객체째 넘기는 경우.
      let c = it?.lineage_confidence ?? it?.lineage?.confidence
      if (c !== 'direct' && c !== 'inferred') c = 'none'
      counts[c]++
    }
    const covered = counts.direct + counts.inferred
    return {
      total,
      ...counts,
      coverage_pct: Math.round((covered / total) * 100),
    }
  })
}

/**
 * BE 가 Neo4j 에 저장하면서 `lineage` 객체를 flat field
 * (`lineage_confidence`, `lineage_story_count`) 로 펴버리는데 (design_pipeline.py
 * `_flatten_for_neo4j`), 화면 컴포넌트는 nested `lineage.{confidence,related_stories}`
 * 를 기대함. 이 헬퍼가 fetchData 응답 array 의 각 항목을 nested 구조로 복원.
 *
 * related_stories 의 detail (story_id/quote) 은 flat 응답에 없어서 placeholder
 * 객체로 length 만 맞춤. Panel 은 placeholder 감지해서 "상세 미제공" 안내.
 */
export const normalizeLineageItem = (item) => {
  if (!item || typeof item !== 'object') return item
  // 이미 nested lineage.confidence 가 있으면 그대로
  if (item.lineage && typeof item.lineage === 'object' && item.lineage.confidence) {
    return item
  }
  const confidence = item.lineage_confidence || 'none'
  const count = Number(item.lineage_story_count) || 0
  return {
    ...item,
    lineage: {
      confidence,
      related_stories: count > 0 ? Array.from({ length: count }, () => ({})) : [],
    },
  }
}

/**
 * Array 전체를 normalizeLineageItem 으로 매핑. fetchData 에서 사용.
 */
export const normalizeLineageList = (list) =>
  Array.isArray(list) ? list.map(normalizeLineageItem) : []

/**
 * [2026-05-29] PRD 와 연결 안 된 노드만 추출 — confidence 가 direct/inferred 가
 * 아닌 (= none 으로 떨어지는) 노드. EvalScoreCard 펼침 패널의 "미연결 노드 chip"
 * 용. useLineageCoverage 의 none 집계와 정확히 같은 기준이라 숫자가 일치.
 *
 * @param {Array} list  노드 배열 (entities / aggregates / services 등)
 * @returns {Array<{id: string, name: string}>}
 */
export const unlinkedNodes = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((it) => {
      const c = it?.lineage_confidence ?? it?.lineage?.confidence
      return c !== 'direct' && c !== 'inferred'
    })
    .map((it) => ({
      id: getNodeProp(it, 'id') || '',
      name: getNodeProp(it, 'name') || getNodeProp(it, 'title') || '(이름 없음)',
    }))

/**
 * lineage indicator 의 hover tooltip 텍스트 생성.
 */
export const formatCoverageTooltip = (coverage) => {
  const t = i18n.global.t
  if (!coverage || coverage.total === 0) return t('enums.coverage.no_data')
  const parts = []
  if (coverage.direct) parts.push(t('enums.coverage.direct', { count: coverage.direct }))
  if (coverage.inferred) parts.push(t('enums.coverage.inferred', { count: coverage.inferred }))
  if (coverage.none) parts.push(t('enums.coverage.none', { count: coverage.none }))
  return parts.join(' · ') + ` / ${t('enums.coverage.total', { count: coverage.total })}`
}
