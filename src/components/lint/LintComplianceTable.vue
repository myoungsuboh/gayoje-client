<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CheckCircle2, XCircle, ChevronDown, ChevronRight,
  Cpu, Sparkles, MinusCircle, Github, ExternalLink,
} from 'lucide-vue-next'
import { buildGithubBlobLink } from '@/utils/github'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const { t } = useI18n()

const props = defineProps({
  ruleItems: { type: Array, default: () => [] },
  passCount: { type: Number, default: 0 },
  failCount: { type: Number, default: 0 },
  currentCaseStats: { type: Object, default: () => ({ det: 0, llm: 0, fb: 0, total: 0 }) },
  githubUrl: { type: String, default: '' },
  caseKey: { type: String, default: '' },
})

const detectionMeta = computed(() => ({
  deterministic: { label: t('lint.table.method.deterministic_label'), cls: 'method-det', icon: Cpu, title: t('lint.table.method.deterministic_title') },
  llm: { label: t('lint.table.method.llm_label'), cls: 'method-llm', icon: Sparkles, title: t('lint.table.method.llm_title') },
  fallback: { label: t('lint.table.method.fallback_label'), cls: 'method-fb', icon: MinusCircle, title: t('lint.table.method.fallback_title') },
}))
const methodMeta = (m) => detectionMeta.value[m] || detectionMeta.value.fallback

const expandedEvidence = ref(new Set())
const isEvidenceExpanded = (rule) => expandedEvidence.value.has(rule.id)
const toggleEvidence = (rule) => {
  if (!rule.evidence || rule.evidence.length === 0) return
  const next = new Set(expandedEvidence.value)
  if (next.has(rule.id)) next.delete(rule.id); else next.add(rule.id)
  expandedEvidence.value = next
}

watch(() => props.caseKey, () => { expandedEvidence.value = new Set() })

const blobLink = (ev) => buildGithubBlobLink(props.githubUrl, ev.file, ev.line)
</script>

<template>
  <div class="compliance-card">
    <div class="compliance-header">
      <div>
        <span class="section-pill section-pill--block mb-2">{{ $t('lint.table.pill') }}</span>
        <h4 class="section-title serif-text">
          {{ $t('lint.table.title') }}
          <GuideTooltip target="lint-compliance-report" placement="bottom" :size="13" />
        </h4>
      </div>
      <div class="compliance-summary">
        <span class="summary-pass"><CheckCircle2 :size="14" class="mr-1" />{{ $t('lint.table.pass', { n: passCount }) }}</span>
        <span class="summary-fail"><XCircle :size="14" class="mr-1" />{{ $t('lint.table.fail', { n: failCount }) }}</span>
        <GuideTooltip target="lint-pass-fail" placement="bottom" :size="11" />
      </div>
    </div>
    <div class="detection-stats">
      <span class="d-inline-flex align-center">
        <span class="detection-stat-chip method-det" :title="detectionMeta.deterministic.title">
          <Cpu :size="12" class="mr-1" />{{ $t('lint.table.stat_deterministic', { n: currentCaseStats.det }) }}
        </span>
        <GuideTooltip target="lint-method-deterministic" placement="bottom" :size="11" />
      </span>
      <span class="d-inline-flex align-center">
        <span class="detection-stat-chip method-llm" :title="detectionMeta.llm.title">
          <Sparkles :size="12" class="mr-1" />{{ $t('lint.table.stat_llm', { n: currentCaseStats.llm }) }}
        </span>
        <GuideTooltip target="lint-method-llm" placement="bottom" :size="11" />
      </span>
      <span class="d-inline-flex align-center">
        <span class="detection-stat-chip method-fb" :title="detectionMeta.fallback.title">
          <MinusCircle :size="12" class="mr-1" />{{ $t('lint.table.stat_fallback', { n: currentCaseStats.fb }) }}
        </span>
        <GuideTooltip target="lint-method-fallback" placement="bottom" :size="11" />
      </span>
    </div>
    <div class="table-wrap custom-scroll">
      <table class="compliance-table">
        <thead>
          <tr>
            <th></th><th>{{ $t('lint.table.th_constraint') }}</th><th>{{ $t('lint.table.th_description') }}</th>
            <th class="text-center">{{ $t('lint.table.th_method') }}</th><th class="text-center">{{ $t('lint.table.th_status') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="rule in ruleItems" :key="rule.id">
            <tr
              class="rule-row"
              :class="{ 'rule-row--clickable': rule.evidence && rule.evidence.length > 0 }"
              :tabindex="rule.evidence && rule.evidence.length > 0 ? 0 : -1"
              :role="rule.evidence && rule.evidence.length > 0 ? 'button' : undefined"
              :aria-expanded="rule.evidence && rule.evidence.length > 0 ? isEvidenceExpanded(rule) : undefined"
              :aria-label="rule.evidence && rule.evidence.length > 0 ? $t('lint.table.row_aria_label', { title: rule.title || rule.id }) : undefined"
              @click="toggleEvidence(rule)"
              @keydown.enter.prevent="rule.evidence && rule.evidence.length > 0 && toggleEvidence(rule)"
              @keydown.space.prevent="rule.evidence && rule.evidence.length > 0 && toggleEvidence(rule)"
            >
              <td class="rule-expand-cell">
                <component v-if="rule.evidence && rule.evidence.length > 0" :is="isEvidenceExpanded(rule) ? ChevronDown : ChevronRight" :size="14" class="rule-expand-icon" />
              </td>
              <td>
                <span class="rule-id mono-text">{{ rule.rule }}</span>
                <span v-if="rule.evidence && rule.evidence.length > 0" class="rule-evidence-count mono-text" :title="$t('lint.table.evidence_count_title', { n: rule.evidence.length })">{{ $t('lint.table.evidence_count', { n: rule.evidence.length }) }}</span>
              </td>
              <td class="rule-desc">{{ rule.description }}</td>
              <td class="text-center">
                <span class="rule-method-badge" :class="methodMeta(rule.detectionMethod).cls" :title="methodMeta(rule.detectionMethod).title">
                  <component :is="methodMeta(rule.detectionMethod).icon" :size="11" class="mr-1" />
                  {{ methodMeta(rule.detectionMethod).label }}
                </span>
              </td>
              <td class="text-center">
                <span class="rule-status" :class="rule.applied ? 'rule-status--pass' : 'rule-status--fail'">
                  <component :is="rule.applied ? CheckCircle2 : XCircle" :size="12" class="mr-1" />
                  {{ rule.applied ? $t('lint.table.status_pass') : $t('lint.table.status_fail') }}
                </span>
              </td>
            </tr>
            <tr v-if="isEvidenceExpanded(rule) && rule.evidence && rule.evidence.length > 0" class="evidence-row">
              <td></td>
              <td colspan="4" class="evidence-cell">
                <div class="evidence-list">
                  <div v-for="(ev, idx) in rule.evidence" :key="ev.file + ':' + ev.line + ':' + idx" class="evidence-item">
                    <div class="evidence-item-header">
                      <span class="evidence-kind mono-text">{{ ev.kind || $t('lint.table.evidence_kind_default') }}</span>
                      <a v-if="blobLink(ev)" :href="blobLink(ev)" target="_blank" rel="noopener noreferrer" class="evidence-link mono-text" :title="$t('lint.table.evidence_link_title', { target: ev.file + (ev.line ? ':' + ev.line : '') })" @click.stop>
                        <Github :size="11" class="mr-1" />
                        {{ ev.file }}<span v-if="ev.line">:{{ ev.line }}</span>
                        <ExternalLink :size="10" class="ml-1" />
                      </a>
                      <span v-else class="evidence-file-plain mono-text">{{ ev.file }}<span v-if="ev.line">:{{ ev.line }}</span></span>
                    </div>
                    <pre v-if="ev.snippet" class="evidence-snippet mono-text"><code>{{ ev.snippet }}</code></pre>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="ruleItems.length === 0">
            <td colspan="5" class="text-center compliance-empty-cell">{{ $t('lint.table.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }
.section-pill { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.6rem; font-weight: 700; background: var(--accent); color: white; padding: 3px 12px; border-radius: 9999px; letter-spacing: 0.08em; }
.section-pill--block { display: inline-block; }
.section-title { font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin: 0; }
.compliance-card { background: white; border: 1px solid var(--border-light); border-radius: 16px; overflow: hidden; margin-bottom: 24px; }
.compliance-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--border-light); flex-wrap: wrap; gap: 12px; }
.compliance-summary { display: flex; gap: 12px; align-items: center; }
.summary-pass { display: inline-flex; align-items: center; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.7rem; font-weight: 700; color: var(--primary-moss); background: rgba(46,64,54,0.06); padding: 4px 12px; border-radius: 9999px; }
.summary-fail { display: inline-flex; align-items: center; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.7rem; font-weight: 700; color: var(--accent); background: rgba(140,98,57,0.06); padding: 4px 12px; border-radius: 9999px; }
.detection-stats { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 24px; background: #fafbfc; border-bottom: 1px solid var(--border-light); }
.detection-stat-chip { display: inline-flex; align-items: center; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.66rem; font-weight: 700; padding: 4px 11px; border-radius: 9999px; letter-spacing: 0.02em; cursor: help; }
.method-det { color: var(--primary-moss, #2E4036); background: rgba(46, 64, 54, 0.08); border: 1px solid rgba(46, 64, 54, 0.18); }
.method-llm { color: #1976D2; background: rgba(33, 150, 243, 0.08); border: 1px solid rgba(33, 150, 243, 0.20); }
.method-fb { color: var(--text-muted); background: #f3f4f5; border: 1px solid var(--border-light); }
.table-wrap { overflow-x: auto; }
.compliance-table { width: 100%; border-collapse: collapse; min-width: 500px; }
.compliance-table th { font-family: 'Outfit', sans-serif; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); padding: 12px 24px; background: #fafbfc; border-bottom: 1px solid var(--border-light); text-align: left; }
.compliance-empty-cell { padding: 24px; color: var(--text-muted); }
.rule-row td { padding: 14px 24px; border-bottom: 1px solid var(--border-light); }
.rule-row:last-child td { border-bottom: none; }
.rule-row:hover { background: #fafbfc; }
.rule-expand-cell { width: 28px; padding-right: 0 !important; }
.rule-expand-icon { color: var(--text-muted); vertical-align: middle; }
.rule-row--clickable { cursor: pointer; }
.rule-row--clickable:hover .rule-expand-icon { color: var(--accent); }
.rule-id { font-size: 0.72rem; font-weight: 700; color: var(--accent); background: rgba(140,98,57,0.06); padding: 3px 10px; border-radius: 6px; }
.rule-evidence-count { font-size: 0.66rem; font-weight: 600; color: var(--text-muted); margin-left: 6px; }
.rule-desc { font-family: 'Pretendard Variable', sans-serif; font-size: 0.82rem; font-weight: 600; color: var(--text-main); }
.rule-method-badge { display: inline-flex; align-items: center; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.6rem; font-weight: 700; padding: 3px 9px; border-radius: 9999px; letter-spacing: 0.04em; white-space: nowrap; }
.rule-status { display: inline-flex; align-items: center; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.62rem; font-weight: 700; padding: 4px 12px; border-radius: 9999px; letter-spacing: 0.05em; }
.rule-status--pass { background: var(--primary-moss); color: white; }
.rule-status--fail { background: var(--accent); color: white; }
.evidence-row td { padding: 0 !important; }
.evidence-cell { background: #fafbfc !important; border-top: none !important; border-bottom: 1px solid var(--border-light) !important; padding: 14px 24px 18px !important; }
.evidence-list { display: flex; flex-direction: column; gap: 12px; }
.evidence-item { background: white; border: 1px solid var(--border-light); border-radius: 8px; padding: 10px 14px; }
.evidence-item-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.evidence-kind { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); background: rgba(140, 98, 57, 0.08); padding: 2px 8px; border-radius: 4px; }
.evidence-link { display: inline-flex; align-items: center; font-size: 0.74rem; font-weight: 600; color: var(--text-main); text-decoration: none; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border-light); background: white; transition: all 0.15s; }
.evidence-link:hover { color: var(--accent); border-color: var(--accent); background: rgba(140, 98, 57, 0.04); }
.evidence-file-plain { font-size: 0.74rem; color: var(--text-muted); padding: 2px 6px; }
.evidence-snippet { margin: 0; padding: 8px 12px; background: #1e2127; color: #d4d7dd; border-radius: 6px; font-size: 0.72rem; line-height: 1.55; white-space: pre-wrap; word-break: break-all; overflow-x: auto; }
.evidence-snippet code { font-family: inherit; color: inherit; }
.custom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
@media (max-width: 768px) {
  .compliance-header { flex-direction: column; padding: 16px 18px; }
  .compliance-table th, .rule-row td { padding: 10px 14px; }
  .detection-stats { padding: 10px 14px; gap: 6px; }
  .detection-stat-chip { font-size: 0.6rem; padding: 3px 9px; }
  .evidence-cell { padding: 10px 14px 14px !important; }
  .evidence-item { padding: 8px 12px; }
}
@media (max-width: 600px) {
  .compliance-table th:nth-child(3), .compliance-table td:nth-child(3),
  .compliance-table th:nth-child(4), .compliance-table td:nth-child(4) { display: none; }
  .rule-expand-cell { width: 24px; padding-left: 10px !important; padding-right: 0 !important; }
  .evidence-link { font-size: 0.68rem; padding: 2px 6px; word-break: break-all; max-width: 100%; }
  .evidence-item-header { gap: 6px; }
  .evidence-snippet { font-size: 0.66rem; padding: 6px 10px; }
  .evidence-kind { font-size: 0.55rem; padding: 1px 6px; }
}
</style>
