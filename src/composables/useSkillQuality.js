import { computed, isRef } from 'vue'

// 추상적 표현 패턴 — 이런 표현이 있으면 AI가 명확히 적용하기 어려움
const VAGUE_KO = ['잘 ', '잘하', '깔끔', '올바르', '제대로 ', '적절히', '적절하게', '효율적으로', '좋게 ']
const VAGUE_EN = ['properly', 'cleanly', 'nicely', ' well ', 'well,', 'correctly', 'appropriately', 'efficiently']

function hasVague(text) {
  const lower = text.toLowerCase()
  return VAGUE_KO.some(v => text.includes(v)) || VAGUE_EN.some(v => lower.includes(v))
}

/**
 * useSkillQuality — 스킬 품질 lint 컴포저블 (클라이언트 사이드, 비용 없음)
 *
 * @param {Ref|ComputedRef} skillGetter — 평가할 스킬 객체를 담은 ref 또는 computed
 * @returns {{ warnings, score, level, hasIssues, errorCount, warningCount, infoCount }}
 *
 * level: 'good'(85+) | 'ok'(50–84) | 'poor'(<50)
 *
 * 각 항목 감점:
 *   error   -35  지시사항 없음 등 치명적 결함
 *   warning -15  개선 권장 (추상 표현, 트리거 미설정, 짧은 트리거 등)
 *   info     -5  선택적 개선 (scope 미입력 등)
 */
export function useSkillQuality(skillGetter) {
  const getSkill = () => isRef(skillGetter) ? skillGetter.value : skillGetter

  const warnings = computed(() => {
    const skill = getSkill()
    if (!skill) return []

    const result = []
    const trigger = (skill.trigger_condition || '').trim()
    // 빈 문자열 항목 필터링 — 부모가 [''] 로 초기화하는 경우 0개로 정확히 카운트
    const insts   = Array.isArray(skill.instructions)
      ? skill.instructions.filter(i => (i || '').trim())
      : []
    const scope   = (skill.scope || '').trim()

    // ── 트리거 조건 ──────────────────────────────────────────
    if (!trigger) {
      result.push({
        level: 'warning',
        field: 'trigger_condition',
        icon: '⚡',
        message: '트리거 조건이 없어요 — AI가 언제 이 스킬을 써야 할지 모릅니다',
        hint: '예: "React 컴포넌트 작성 시", "API 응답 처리 시"',
      })
    } else if (trigger.length < 10) {
      result.push({
        level: 'warning',
        field: 'trigger_condition',
        icon: '⚡',
        message: '적용 시점이 너무 짧아요 — 조금 더 구체적으로 적어주세요',
        hint: `지금: "${trigger}" → 예: "Spring Boot REST API endpoint 작성 시"`,
      })
    }

    // ── 지시사항 ─────────────────────────────────────────────
    if (insts.length === 0) {
      result.push({
        level: 'error',
        field: 'instructions',
        icon: '🚫',
        message: '지시사항이 없으면 AI가 이 스킬을 적용할 수 없어요',
        hint: '아래 입력창에 AI가 따를 지침을 1개 이상 추가해주세요',
      })
    } else if (insts.length === 1) {
      result.push({
        level: 'warning',
        field: 'instructions',
        icon: '⚡',
        message: '지시사항이 1개뿐이에요 — 2개 이상이면 더 효과적이에요',
        hint: '비슷한 규칙을 세분화하거나 관련 지침을 하나 더 추가해보세요',
      })
    }

    const vagueCount = insts.filter(hasVague).length
    if (vagueCount > 0) {
      result.push({
        level: 'warning',
        field: 'instructions',
        icon: '⚡',
        message: `모호한 표현이 ${vagueCount}개 감지됐어요 (잘, 올바르게, 적절히 등)`,
        hint: 'AI가 측정할 수 있는 기준으로 바꿔보세요 — 예: "50자 이내로", "한국어로", "JSON 형식으로"',
      })
    }

    const longCount = insts.filter(i => i.trim().length > 150).length
    if (longCount > 0) {
      result.push({
        level: 'warning',
        field: 'instructions',
        icon: '⚡',
        message: `너무 긴 지시사항이 ${longCount}개 있어요`,
        hint: '한 지시사항 = 한 가지 행동만 담으면 AI가 더 일관되게 따라요',
      })
    }

    // ── 범위 ─────────────────────────────────────────────────
    if (!scope) {
      result.push({
        level: 'info',
        field: 'scope',
        icon: '💡',
        message: '적용 범위를 설정하면 더 정밀하게 적용돼요',
        hint: '예: "Frontend", "Backend API", "Database", "전체"',
      })
    }

    return result
  })

  const score = computed(() => {
    let s = 100
    for (const w of warnings.value) {
      if (w.level === 'error')        s -= 35
      else if (w.level === 'warning') s -= 15
      else if (w.level === 'info')    s -= 5
    }
    return Math.max(0, Math.min(100, s))
  })

  // 85+ 이상이어야 good — trigger 미설정 상태(warning)에서는 최대 85점
  const level        = computed(() => score.value >= 85 ? 'good' : score.value >= 50 ? 'ok' : 'poor')
  const hasIssues    = computed(() => warnings.value.length > 0)
  const errorCount   = computed(() => warnings.value.filter(w => w.level === 'error').length)
  const warningCount = computed(() => warnings.value.filter(w => w.level === 'warning').length)
  const infoCount    = computed(() => warnings.value.filter(w => w.level === 'info').length)

  return { warnings, score, level, hasIssues, errorCount, warningCount, infoCount }
}
