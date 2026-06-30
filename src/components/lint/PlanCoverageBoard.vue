<script setup>
/**
 * PlanCoverageBoard — 04 코드 점검 페이지의 "기획 항목 구현 현황" 보드.
 *
 * [2026-06-24 신설 — 죽은 체크리스트 내보내기(SpecCoverageSection) 대체]
 * 이전 섹션은 빈 체크리스트 .md 를 만들어 외부 AI 도구에 복붙해 확인하라는,
 * 결과가 제품으로 돌아오지 않는 막다른 기능이었다. 이제 RUN LINT 가 이미
 * 계산한 "기획 항목 구현율" 카테고리(cases[4]) 를 그대로 받아, 화면·Story 별로
 * ✅구현/❌누락 + file:line 근거를 인-앱에서 즉시 보여준다(A). 누락분은 한 번에
 * AI 수정 지시로 복사(B). 외부 도구로 확인을 떠넘기지 않고 페이지에서 끝낸다.
 *
 * 데이터 출처: lint 결과의 기획 case (BE evaluator 가 항상 index 4 로 조립).
 *   rule: 'screen:…' | 'story:…' | 'plan:empty'
 *   description: 표시 라벨,  applied: 구현 여부,  evidence: [{file,line,snippet,kind}]
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ClipboardCheck, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  Github, ExternalLink, Copy, PartyPopper,
} from 'lucide-vue-next'
import { buildGithubBlobLink } from '@/utils/github'
import { copyToClipboard } from '@/utils/exportDoc'
import { useSnackbar } from '@/composables/useSnackbar'

const { t } = useI18n()
const { showSuccess, showError } = useSnackbar() ?? {}

const props = defineProps({
  // lint 결과의 기획 case ({ title, convergence, rules }) — 없으면 렌더 안 함(상위 v-if).
  planCase: { type: Object, default: null },
  githubUrl: { type: String, default: '' },
})

const rules = computed(() => props.planCase?.rules || [])

// BE 가 기획 항목이 0개일 때 넣는 placeholder. 이 경우 안내만 띄운다.
const isEmpty = computed(() =>
  rules.value.length === 0 ||
  (rules.value.length === 1 && rules.value[0].rule === 'plan:empty'))

const toItem = (r) => ({
  key: r.rule,
  label: r.description || r.rule,
  applied: !!r.applied,
  evidence: Array.isArray(r.evidence) ? r.evidence : [],
})

const groups = computed(() => {
  if (isEmpty.value) return []
  const screen = [], story = []
  for (const r of rules.value) {
    const it = toItem(r)
    if (String(r.rule).startsWith('screen:')) screen.push(it)
    else story.push(it)   // story: 및 기타 기획 항목
  }
  return [
    { key: 'screen', label: t('lint.coverage.group_screen'), items: screen },
    { key: 'story', label: t('lint.coverage.group_story'), items: story },
  ].filter(g => g.items.length)
})

const total = computed(() => (isEmpty.value ? 0 : rules.value.length))
const doneCount = computed(() => (isEmpty.value ? 0 : rules.value.filter(r => r.applied).length))
const missing = computed(() => total.value - doneCount.value)
const percent = computed(() => (total.value ? Math.round((doneCount.value / total.value) * 100) : 0))

// ── 근거 펼침 (LintComplianceTable 과 동일 패턴) ──
const expanded = ref(new Set())
const isExpanded = (key) => expanded.value.has(key)
const toggle = (it) => {
  if (!it.evidence.length) return
  const next = new Set(expanded.value)
  if (next.has(it.key)) next.delete(it.key); else next.add(it.key)
  expanded.value = next
}
const blobLink = (ev) => buildGithubBlobLink(props.githubUrl, ev.file, ev.line)

// ── (B) 누락 항목 → AI 수정 지시 복사 ──
const buildFixPrompt = () => {
  const lines = [t('lint.coverage.fix_prompt_header'), '']
  for (const g of groups.value) {
    const miss = g.items.filter(it => !it.applied)
    if (!miss.length) continue
    lines.push(`## ${g.label} (${miss.length})`)
    for (const it of miss) lines.push(`- ${it.label}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}
const copyMissing = async () => {
  const ok = await copyToClipboard(buildFixPrompt())
  if (ok) showSuccess?.(t('lint.coverage.copied'))
  else showError?.(t('lint.coverage.copy_failed'))
}
</script>

<template>
  <section class="pcb" :aria-label="t('lint.coverage.section_title')">
    <div class="pcb__head">
      <ClipboardCheck :size="16" class="pcb__head-icon" />
      <div>
        <h3 class="pcb__title">{{ t('lint.coverage.section_title') }}</h3>
        <p class="pcb__sub">{{ t('lint.coverage.subtitle') }}</p>
      </div>
    </div>

    <!-- 기획 항목 없음 -->
    <p v-if="isEmpty" class="pcb__empty">{{ t('lint.coverage.empty') }}</p>

    <template v-else>
      <!-- 진행 현황 -->
      <div class="pcb__progress">
        <div class="pcb__progress-top">
          <span class="pcb__progress-text">{{ t('lint.coverage.progress', { done: doneCount, total }) }}</span>
          <span class="pcb__counts">
            <span class="pcb__count pcb__count--done"><CheckCircle2 :size="13" />{{ doneCount }}</span>
            <span class="pcb__count pcb__count--miss"><XCircle :size="13" />{{ missing }}</span>
            <span class="pcb__pct mono">{{ percent }}%</span>
          </span>
        </div>
        <div class="pcb__bar"><div class="pcb__bar-fill" :style="{ width: percent + '%' }"></div></div>
      </div>

      <!-- 그룹별 항목 -->
      <div v-for="g in groups" :key="g.key" class="pcb__group">
        <div class="pcb__group-label">{{ g.label }} <span class="pcb__group-count">{{ g.items.length }}</span></div>
        <ul class="pcb__list">
          <li v-for="it in g.items" :key="it.key" class="pcb__item" :class="{ 'pcb__item--miss': !it.applied }">
            <div
              class="pcb__row"
              :class="{ 'pcb__row--clickable': it.evidence.length > 0 }"
              :role="it.evidence.length > 0 ? 'button' : undefined"
              :tabindex="it.evidence.length > 0 ? 0 : -1"
              :aria-expanded="it.evidence.length > 0 ? isExpanded(it.key) : undefined"
              :aria-label="it.evidence.length > 0 ? t('lint.coverage.evidence_aria', { label: it.label, n: it.evidence.length }) : undefined"
              @click="toggle(it)"
              @keydown.enter.prevent="toggle(it)"
              @keydown.space.prevent="toggle(it)"
            >
              <component :is="it.applied ? CheckCircle2 : XCircle" :size="15"
                class="pcb__status" :class="it.applied ? 'pcb__status--done' : 'pcb__status--miss'" />
              <span class="pcb__label">{{ it.label }}</span>
              <span class="pcb__tail">
                <span class="pcb__badge" :class="it.applied ? 'pcb__badge--done' : 'pcb__badge--miss'">
                  {{ it.applied ? t('lint.coverage.done_label') : t('lint.coverage.missing_label') }}
                </span>
                <span
                  v-if="it.evidence.length > 0" class="pcb__ev-toggle"
                  :title="t('lint.coverage.evidence_toggle', { n: it.evidence.length })"
                >
                  <component :is="isExpanded(it.key) ? ChevronDown : ChevronRight" :size="13" />
                  {{ t('lint.coverage.evidence_toggle', { n: it.evidence.length }) }}
                </span>
              </span>
            </div>
            <!-- 근거 file:line -->
            <div v-if="isExpanded(it.key) && it.evidence.length > 0" class="pcb__evidence">
              <template v-for="(ev, idx) in it.evidence" :key="ev.file + ':' + ev.line + ':' + idx">
                <a v-if="blobLink(ev)" :href="blobLink(ev)" target="_blank" rel="noopener noreferrer"
                  class="pcb__ev-link mono" @click.stop>
                  <Github :size="11" />{{ ev.file }}<span v-if="ev.line">:{{ ev.line }}</span><ExternalLink :size="10" />
                </a>
                <span v-else class="pcb__ev-plain mono">{{ ev.file }}<span v-if="ev.line">:{{ ev.line }}</span></span>
              </template>
            </div>
          </li>
        </ul>
      </div>

      <!-- 액션 / 완료 -->
      <div class="pcb__foot">
        <button v-if="missing > 0" type="button" class="pcb__copy-btn" @click="copyMissing">
          <Copy :size="13" /> {{ t('lint.coverage.copy_missing', { n: missing }) }}
        </button>
        <p v-else class="pcb__done-msg"><PartyPopper :size="14" />{{ t('lint.coverage.all_done') }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.mono { font-family: 'IBM Plex Mono', monospace; }
.pcb { margin-bottom: 24px; padding: 22px 24px; border: 1px solid var(--border-light); border-radius: 16px; background: #fff; }
.pcb__head { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 16px; }
.pcb__head-icon { color: var(--accent, #8C6239); margin-top: 2px; flex-shrink: 0; }
.pcb__title { font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin: 0; }
.pcb__sub { font-size: 0.78rem; color: var(--text-muted); margin: 3px 0 0; line-height: 1.5; max-width: 640px; }
.pcb__empty { margin: 4px 0 0; padding: 16px 18px; background: #fafbfc; border: 1px dashed var(--border-light); border-radius: 12px; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; }

/* 진행 현황 */
.pcb__progress { margin-bottom: 18px; }
.pcb__progress-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.pcb__progress-text { font-size: 0.84rem; font-weight: 800; color: var(--text-main); }
.pcb__counts { display: inline-flex; align-items: center; gap: 8px; }
.pcb__count { display: inline-flex; align-items: center; gap: 3px; font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 9999px; }
.pcb__count--done { color: var(--primary-moss, #2E4036); background: rgba(46,64,54,0.08); }
.pcb__count--miss { color: var(--accent, #8C6239); background: rgba(140,98,57,0.08); }
.pcb__pct { font-size: 0.72rem; font-weight: 800; color: var(--text-muted); }
.pcb__bar { height: 7px; background: rgba(0,0,0,0.05); border-radius: 9999px; overflow: hidden; }
.pcb__bar-fill { height: 100%; background: var(--primary-moss, #2E4036); border-radius: 9999px; transition: width 0.8s ease; }

/* 그룹 */
.pcb__group { margin-bottom: 14px; }
.pcb__group-label { font-family: 'Outfit', sans-serif; font-size: 0.64rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 6px; }
.pcb__group-count { color: var(--accent); }
.pcb__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.pcb__item { border: 1px solid var(--border-light); border-radius: 10px; overflow: hidden; background: #fff; }
.pcb__item--miss { background: rgba(140,98,57,0.025); }
.pcb__row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
.pcb__row--clickable { cursor: pointer; }
.pcb__row--clickable:hover { background: #fafbfc; }
.pcb__status { flex-shrink: 0; }
.pcb__status--done { color: var(--primary-moss, #2E4036); }
.pcb__status--miss { color: var(--accent, #8C6239); }
.pcb__label { flex: 1; min-width: 0; font-size: 0.84rem; font-weight: 600; color: var(--text-main); line-height: 1.4; word-break: break-word; }
.pcb__tail { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pcb__badge { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 9999px; white-space: nowrap; }
.pcb__badge--done { color: #fff; background: var(--primary-moss, #2E4036); }
.pcb__badge--miss { color: #fff; background: var(--accent, #8C6239); }
.pcb__ev-toggle { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; border: none; background: transparent; color: var(--text-muted); font-size: 0.66rem; font-weight: 600; font-family: inherit; cursor: pointer; }
.pcb__ev-toggle:hover { color: var(--accent); }
.pcb__evidence { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 12px 39px; }
.pcb__ev-link { display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; font-weight: 600; color: var(--text-main); text-decoration: none; padding: 3px 9px; border: 1px solid var(--border-light); border-radius: 6px; background: #fff; transition: all 0.15s; max-width: 100%; word-break: break-all; }
.pcb__ev-link:hover { color: var(--accent); border-color: var(--accent); background: rgba(140,98,57,0.04); }
.pcb__ev-plain { font-size: 0.72rem; color: var(--text-muted); padding: 3px 6px; word-break: break-all; }

/* 액션 / 완료 */
.pcb__foot { margin-top: 4px; }
.pcb__copy-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9999px; border: 1px solid var(--accent, #8C6239); background: var(--accent, #8C6239); color: #FCFAEE; font-size: 0.76rem; font-weight: 700; font-family: inherit; cursor: pointer; transition: opacity 0.15s; }
.pcb__copy-btn:hover { opacity: 0.88; }
.pcb__done-msg { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-size: 0.82rem; font-weight: 700; color: var(--primary-moss, #2E4036); }

@media (max-width: 600px) {
  .pcb { padding: 18px 16px; }
  .pcb__row { flex-wrap: wrap; gap: 8px; }
  .pcb__label { flex-basis: 100%; order: 2; }
  .pcb__status { order: 1; }
  .pcb__tail { order: 1; margin-left: auto; }
  .pcb__evidence { padding-left: 14px; }
  .pcb__copy-btn { width: 100%; justify-content: center; }
}
</style>
