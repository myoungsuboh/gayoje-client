<script setup>
/**
 * [B 단계 — 2026-05-25] PRD raw text 충실도 배지.
 *
 * EvalScoreCard 와 같은 디자인 톤. score + 가장 시급한 issue 1개 표시.
 *
 * [2026-05-28] 사용자 피드백 ('어디를 손볼지 모르겠다') 반영:
 *   - issue 의 detail.target_section 으로 어느 탭(Overview/Epic & Story/Screens/NFR)
 *     으로 안내할지 표시 + '👆 보러가기' 클릭 시 부모(PrdTab) 에 jump 이벤트.
 *   - hint 가 길어도 ellipsis 안 되도록 줄바꿈 허용. 핵심 문구 한 줄 + 예시 한 줄.
 *
 * Props:
 *   report: { score, issues[{code,severity,message,hint,detail}], summary }
 *   loading: boolean
 * Emits:
 *   jump-to-section: (sectionKey: 'overview' | 'epic' | 'screen' | 'nfr')
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileCheck2, ArrowRight, Sparkles, Loader2 } from 'lucide-vue-next'

const { t } = useI18n()

const props = defineProps({
  report: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  // [2026-05] AI 자동 보완 진행 중 — 버튼 spinner.
  fixing: { type: Boolean, default: false },
  // [2026-06-10] 직전 보완에서 AI 가 근거 부족으로 질문(needs_input)으로 넘긴 항목 수.
  // >0 이면 재보완해도 같은 질문만 돌아오므로, '보완하기' 대신 '인터뷰로 채우기' CTA 로
  // 전환해 반복 클릭 루프('보완이 안 되네?')를 끊는다.
  needsInputCount: { type: Number, default: 0 },
})
const emit = defineEmits(['jump-to-section', 'ai-fix', 'go-interview'])

const SECTION_LABEL = computed(() => ({
  overview: t('prd.lint_badge.section_overview'),
  epic: t('prd.lint_badge.section_epic'),
  screen: t('prd.lint_badge.section_screen'),
  nfr: t('prd.lint_badge.section_nfr'),
}))

function pctColor(pct) {
  if (pct == null) return '#8A817C'
  if (pct >= 80) return '#4CAF50'
  if (pct >= 50) return '#E08A3C'
  return '#E55353'
}

const scorePct = computed(() =>
  props.report ? Math.round((props.report.score ?? 0) * 100) : 0,
)

// 가장 시급한 issue — error 먼저, 그 다음 warning.
const topIssue = computed(() => {
  if (!props.report?.issues?.length) return null
  const errors = props.report.issues.filter(i => i.severity === 'error')
  if (errors.length) return errors[0]
  const warnings = props.report.issues.filter(i => i.severity === 'warning')
  if (warnings.length) return warnings[0]
  return props.report.issues[0]
})

const issueCount = computed(() => {
  if (!props.report?.summary) return null
  const s = props.report.summary
  return { err: s.errors ?? 0, warn: s.warnings ?? 0, info: s.infos ?? 0 }
})

// [2026-06-10 기대치 관리] '충분' 판정 — 95%+ 이고 error/warning 0 (잔여는 선택
// 보강 INFO 뿐). 100% 가 아니라는 이유로 '보완이 안 되네?' 하고 이탈하지 않도록,
// 이 상태에선 시급 이슈 박스 대신 "지금도 충분" 안내를 보여준다. 보완/인터뷰
// 버튼은 유지 — 더 올리고 싶은 사용자의 경로는 막지 않는다.
const isSufficient = computed(() => {
  const r = props.report
  if (!r?.summary) return false
  return (r.score ?? 0) >= 0.95 && !(r.summary.errors ?? 0) && !(r.summary.warnings ?? 0)
})

// issue 분류 — AI 자동 보완 가능 vs 직접 작성 필요.
// 아래 코드는 "사람의 전략·기술 판단"이 필요해, 근거가 없으면 BE autofix 가 지어내지 않고
// needs_input(질문)으로만 넘기는 항목(= 보완 불가): 제품 비전(Overview)·성능 수치(NFR)·인증 방식.
//   · STORY_TOO_ABSTRACT 도 기존 Story 재작성이 필요한데 autofix 는 기존 문장을 바꾸지 않으므로 manual.
//   · PRD_TOO_SHORT 는 본문 자체가 빈약 → 사람이 채워야 함.
// (주의) PRD_NO_STORY 는 manual 이 아니다 — autofix 가 비어 있는 Story 섹션을 채운다
//   (prd_autofix.md 규칙 2-(a) + harness-server test_autofix_fills_stories 로 검증됨).
const MANUAL_CODES = new Set([
  'PRD_NO_OVERVIEW', 'PRD_NO_NFR', 'PRD_NO_AUTH', 'PRD_TOO_SHORT', 'STORY_TOO_ABSTRACT',
])
const _issues = computed(() => props.report?.issues ?? [])
const autofixableIssues = computed(() => _issues.value.filter((i) => !MANUAL_CODES.has(i.code)))
const manualIssues = computed(() => _issues.value.filter((i) => MANUAL_CODES.has(i.code)))
// AI 로 더 채울 수 있는 게 있을 때만 '보완하기' 노출 — 직접 작성 항목만 남으면 숨겨
// 사용자가 효과 없는 버튼을 반복해서 누르지 않게 한다.
const hasAutofixable = computed(() => autofixableIssues.value.length > 0)
// 직접 작성해야 하는 항목 라벨(섹션 기준 중복 제거).
const manualLabels = computed(() => {
  const seen = new Set()
  for (const i of manualIssues.value) {
    const key = i.detail?.target_section
    const label = key ? SECTION_LABEL.value[key] : null
    if (label) seen.add(label)
  }
  return [...seen]
})

// 안내할 탭 key + label
const topIssueSection = computed(() => {
  const key = topIssue.value?.detail?.target_section
  if (!key || !SECTION_LABEL.value[key]) return null
  return { key, label: SECTION_LABEL.value[key] }
})

const tooltip = computed(() => {
  if (!props.report) return ''
  const lines = [
    t('prd.lint_badge.tooltip_score', { pct: scorePct.value }),
    t('prd.lint_badge.tooltip_counts', {
      err: issueCount.value?.err ?? 0,
      warn: issueCount.value?.warn ?? 0,
      info: issueCount.value?.info ?? 0,
    }),
    t('prd.lint_badge.tooltip_stories', { count: props.report.summary?.stories_found ?? 0 }),
  ]
  if (topIssue.value) {
    lines.push('')
    lines.push(t('prd.lint_badge.tooltip_top_issue', { message: topIssue.value.message }))
    if (topIssue.value.hint) lines.push(t('prd.lint_badge.tooltip_hint', { hint: topIssue.value.hint }))
  }
  return lines.join('\n')
})

function handleJump() {
  if (topIssueSection.value) {
    emit('jump-to-section', topIssueSection.value.key)
  }
}
</script>

<template>
  <div v-if="loading" class="prd-lint-badge prd-lint-badge--loading">
    <FileCheck2 :size="12" />
    <span>{{ $t('prd.lint_badge.loading') }}</span>
  </div>
  <div v-else-if="report" class="prd-lint-badge" :title="tooltip">
    <div class="prd-lint-badge__head">
      <FileCheck2 :size="12" />
      <span class="card-label">{{ $t('prd.lint_badge.label') }}</span>
      <span class="score-pct" :style="{ color: pctColor(scorePct) }">
        {{ scorePct }}%
      </span>
      <!-- [2026-06-10] 95%+ & 잔여 INFO 뿐 — '지금도 충분' 안심 태그 -->
      <span v-if="isSufficient" class="sufficient-tag">✓ {{ $t('prd.lint_badge.sufficient_tag') }}</span>
      <span v-if="issueCount" class="issue-counts">
        <span v-if="issueCount.err" class="ic ic--err">●{{ issueCount.err }}</span>
        <span v-if="issueCount.warn" class="ic ic--warn">●{{ issueCount.warn }}</span>
        <span v-if="issueCount.info" class="ic ic--info">●{{ issueCount.info }}</span>
      </span>
      <!-- [2026-06-10] AI 가 질문으로 넘긴 항목이 남아 있으면 재보완 대신 인터뷰 유도 -->
      <button
        v-if="needsInputCount > 0 && !fixing"
        type="button"
        class="ai-fix-btn ai-fix-btn--interview"
        :title="$t('prd.lint_badge.interview_fix_title')"
        @click="emit('go-interview')"
      >
        💬 {{ $t('prd.lint_badge.interview_fix', { count: needsInputCount }) }}
      </button>
      <button
        v-else-if="hasAutofixable"
        type="button"
        class="ai-fix-btn"
        :disabled="fixing"
        :title="$t('prd.lint_badge.ai_fix_title')"
        @click="emit('ai-fix')"
      >
        <Loader2 v-if="fixing" :size="11" class="ai-fix-spin" />
        <Sparkles v-else :size="11" />
        {{ fixing ? $t('prd.lint_badge.ai_fixing') : $t('prd.lint_badge.ai_fix') }}
      </button>
    </div>
    <!-- [2026-06-10] 충분 상태 — 시급 이슈 박스 대신 안심 안내 (남은 건 선택 보강) -->
    <div v-if="isSufficient && issueCount?.info" class="sufficient-note">
      🎉 {{ $t('prd.lint_badge.sufficient_note', { count: issueCount.info }) }}
    </div>
    <div v-else-if="topIssue" class="top-issue-row" :class="`top-issue-row--${topIssue.severity}`">
      <span class="top-issue__icon">💡</span>
      <div class="top-issue__body">
        <div class="top-issue__title">
          <span v-if="topIssueSection" class="top-issue__section-tag">
            {{ topIssueSection.label }}
          </span>
          <span class="top-issue__msg">{{ topIssue.message }}</span>
        </div>
        <div v-if="topIssue.hint" class="top-issue__hint">{{ topIssue.hint }}</div>
      </div>
      <button
        v-if="topIssueSection"
        type="button"
        class="top-issue__jump"
        :title="$t('prd.lint_badge.jump_title', { label: topIssueSection.label })"
        @click="handleJump"
      >
        {{ $t('prd.lint_badge.jump') }} <ArrowRight :size="11" />
      </button>
    </div>
    <!-- AI 가 못 채우는 항목 안내 — 직접 작성해야 한다고 알려 헛클릭 방지 -->
    <div v-if="manualLabels.length" class="manual-notice">
      <span class="manual-notice__icon">✍️</span>
      <span>{{ $t('prd.lint_badge.manual_notice', { items: manualLabels.join(', ') }) }}</span>
    </div>
  </div>
</template>

<style scoped>
.prd-lint-badge {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 10px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 11px;
  color: #4B5563;
  width: 100%;
  max-width: 100%;
}
.prd-lint-badge--loading {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  opacity: 0.6;
}
.prd-lint-badge__head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: help;
  flex-wrap: wrap;
}
.card-label { font-weight: 500; }
.score-pct {
  font-weight: 700;
  font-size: 13px;
}
.issue-counts {
  display: inline-flex;
  gap: 6px;
}
.ic {
  font-size: 10px;
  font-weight: 600;
}
.ic--err  { color: #C53030; }
.ic--warn { color: #E08A3C; }
.ic--info { color: #6B7280; }

/* [2026-05] AI 자동 보완 버튼 — 문제 나열 대신 한 번에 해결 진입점 */
.ai-fix-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #8C6239;
  color: #fff;
  border: none;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}
.ai-fix-btn:hover:not(:disabled) { background: #6E4E2E; }
.ai-fix-btn:disabled { opacity: 0.7; cursor: default; }
/* [2026-06-10] 인터뷰 유도 변형 — 보완(브라운)과 구분되는 보조 톤 */
.ai-fix-btn--interview { background: #4F46E5; }
.ai-fix-btn--interview:hover:not(:disabled) { background: #4338CA; }

/* [2026-06-10] '충분' 상태 — 95%+ & 잔여 INFO 뿐일 때 안심 표시 */
.sufficient-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  background: #ECFDF5;
  color: #047857;
  border: 1px solid #6EE7B7;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.sufficient-note {
  padding: 6px 8px;
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
  border-radius: 4px;
  font-size: 10.5px;
  line-height: 1.5;
  color: #166534;
}
.ai-fix-spin { animation: prd-lint-spin 0.9s linear infinite; }
@keyframes prd-lint-spin { to { transform: rotate(360deg); } }

/* [2026-05-28] 이슈 상세 — 한 줄 truncate 대신 2줄 구조로 변경.
   타이틀(섹션 태그 + 메시지) 한 줄, 힌트(예시 포함) 한 줄. 우측 '보러가기'. */
.top-issue-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 4px;
  line-height: 1.45;
}
.top-issue-row--error { border-color: #FCA5A5; background: #FEF2F2; }
.top-issue-row--warning { border-color: #FDE68A; background: #FFFBEB; }
.top-issue-row--info { background: #F9FAFB; }
.top-issue__icon { flex-shrink: 0; }
.top-issue__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.top-issue__title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.top-issue__section-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: #1F2937;
  color: #FFFFFF;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.top-issue__msg {
  font-size: 11px;
  font-weight: 600;
  color: #1F2937;
}
.top-issue-row--error .top-issue__msg { color: #991B1B; }
.top-issue-row--warning .top-issue__msg { color: #92400E; }
.top-issue__hint {
  font-size: 10.5px;
  color: #4B5563;
}
.top-issue__jump {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: #FFFFFF;
  border: 1px solid #D1D5DB;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  color: #1F2937;
  cursor: pointer;
  transition: all 0.15s;
}
.top-issue__jump:hover {
  background: #1F2937;
  color: #FFFFFF;
  border-color: #1F2937;
}

/* AI 자동 보완 불가 항목 안내 — 직접 작성 유도 */
.manual-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  background: #FBF7EC;
  border: 1px solid rgba(140, 98, 57, 0.25);
  border-radius: 4px;
  font-size: 10.5px;
  line-height: 1.45;
  color: #6B5A3F;
}
.manual-notice__icon { flex-shrink: 0; }
</style>
