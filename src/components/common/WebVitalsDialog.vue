<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Activity, Trash2 } from 'lucide-vue-next'
import { getVitalsHistory, clearVitalsHistory, rateMetric, VITALS_THRESHOLDS } from '@/utils/webVitals'
import { useConfirm } from '@/composables/useConfirm'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const confirm = useConfirm()

const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const records = ref([])
const loadRecords = () => { records.value = getVitalsHistory() }

watch(() => props.modelValue, (v) => { if (v) loadRecords() })

// [2026-05-19] 비전공자도 이해할 수 있게 — 영문 약어 옆에 한글 친근 명칭 + ⓘ 가이드.
// LCP/FCP/CLS/INP/TTFB 는 Google Core Web Vitals 정식 약어라 살리되, 한글이 앞.
// ko 명칭은 locale 로 resolve — emoji/tip 은 언어 무관 리터럴.
const METRIC_META = computed(() => ({
  LCP:  { ko: t('common.web_vitals.metric_lcp'),  tip: 'wv-lcp',  emoji: '🖼️' },
  FCP:  { ko: t('common.web_vitals.metric_fcp'),  tip: 'wv-fcp',  emoji: '✨' },
  CLS:  { ko: t('common.web_vitals.metric_cls'),  tip: 'wv-cls',  emoji: '↕️' },
  INP:  { ko: t('common.web_vitals.metric_inp'),  tip: 'wv-inp',  emoji: '👆' },
  TTFB: { ko: t('common.web_vitals.metric_ttfb'), tip: 'wv-ttfb', emoji: '📡' },
}))
const METRICS = ['LCP', 'FCP', 'CLS', 'INP', 'TTFB']

const RATING_LABEL = computed(() => ({
  good: { label: t('common.web_vitals.rating_good'), emoji: '🟢', desc: t('common.web_vitals.rating_good_desc') },
  'needs-improvement': { label: t('common.web_vitals.rating_needs_improvement'), emoji: '🟡', desc: t('common.web_vitals.rating_needs_improvement_desc') },
  poor: { label: t('common.web_vitals.rating_poor'), emoji: '🔴', desc: t('common.web_vitals.rating_poor_desc') },
  unknown: { label: t('common.web_vitals.rating_unknown'), emoji: '⚪', desc: t('common.web_vitals.rating_unknown_desc') },
}))

// 지표별 통계 (p50/p75/p95)
const percentile = (sorted, p) => {
  if (!sorted.length) return null
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

const stats = computed(() => {
  const out = {}
  for (const name of METRICS) {
    const matching = records.value.filter(r => r.name === name)
    const values = matching.map(r => r.value).sort((a, b) => a - b)
    out[name] = {
      count: values.length,
      latest: matching.length ? matching[matching.length - 1].value : null,
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p95: percentile(values, 95),
    }
  }
  return out
})

const formatValue = (name, value) => {
  if (value == null) return '—'
  if (name === 'CLS') return value.toFixed(3)
  if (value >= 1000) return `${(value / 1000).toFixed(1)}${t('common.web_vitals.seconds_suffix')}`
  return `${Math.round(value)}ms`
}

const ratingOf = (name) => {
  const s = stats.value[name]
  return s.latest != null ? rateMetric(name, s.latest) : 'unknown'
}

const ratingColor = (r) => ({
  good: '#2E7B33',
  'needs-improvement': '#B46723',
  poor: '#A0291F',
  unknown: 'var(--text-muted)',
}[r] || 'var(--text-muted)')

const goodThresholdLabel = (name) => {
  const th = VITALS_THRESHOLDS[name]
  if (name === 'CLS') return `≤ ${th.good}`
  if (th.good >= 1000) return `≤ ${(th.good / 1000).toFixed(1)}${t('common.web_vitals.seconds_suffix')}`
  return `≤ ${th.good}ms`
}

const totalRecords = computed(() => records.value.length)

const handleClear = async () => {
  const ok = await confirm({
    title: t('common.web_vitals.clear_confirm_title'),
    message: t('common.web_vitals.clear_confirm_message'),
    confirmText: t('common.action.delete'),
    variant: 'danger',
  })
  if (!ok) return
  clearVitalsHistory()
  loadRecords()
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="780" role="dialog" :aria-label="$t('common.web_vitals.dialog_aria')" @update:model-value="(v) => emit('update:modelValue', v)" @keydown.esc="isOpen = false">
    <v-card class="wv-card">
      <div class="wv-head">
        <h3 class="wv-title">
          <Activity :size="18" class="mr-2" aria-hidden="true" />
          {{ $t('common.web_vitals.title') }}
          <span class="wv-title-sub">Web Vitals</span>
        </h3>
        <button type="button" class="wv-close" :aria-label="$t('common.action.close')" @click="isOpen = false">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>

      <div class="wv-body">
        <!-- 안내 — 이 다이얼로그가 뭔지 한 줄로 -->
        <div class="wv-intro" v-html="$t('common.web_vitals.intro_html')" />

        <div v-if="!records.length" class="wv-empty">
          <p>{{ $t('common.web_vitals.empty') }}</p>
        </div>

        <template v-else>
          <!-- 데스크탑 — 테이블 (601px+) -->
          <table class="wv-table">
            <thead>
              <tr>
                <th scope="col" class="wv-col-name">{{ $t('common.web_vitals.col_metric') }}</th>
                <th scope="col">
                  <span class="d-inline-flex align-center">
                    {{ $t('common.web_vitals.col_recent') }}
                    <GuideTooltip target="wv-recent" placement="bottom" :size="11" />
                  </span>
                </th>
                <th scope="col">
                  <span class="d-inline-flex align-center">
                    {{ $t('common.web_vitals.col_typical') }}
                    <GuideTooltip target="wv-p50" placement="bottom" :size="11" />
                  </span>
                </th>
                <th scope="col">
                  <span class="d-inline-flex align-center">
                    {{ $t('common.web_vitals.col_p75') }}
                    <GuideTooltip target="wv-p75" placement="bottom" :size="11" />
                  </span>
                </th>
                <th scope="col">
                  <span class="d-inline-flex align-center">
                    {{ $t('common.web_vitals.col_p95') }}
                    <GuideTooltip target="wv-p95" placement="bottom" :size="11" />
                  </span>
                </th>
                <th scope="col">{{ $t('common.web_vitals.col_count') }}</th>
                <th scope="col">
                  <span class="d-inline-flex align-center">
                    {{ $t('common.web_vitals.col_good_threshold') }}
                    <GuideTooltip target="wv-good-threshold" placement="bottom" :size="11" />
                  </span>
                </th>
                <th scope="col">
                  <span class="d-inline-flex align-center">
                    {{ $t('common.web_vitals.col_status') }}
                    <GuideTooltip target="wv-status" placement="bottom" :size="11" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="name in METRICS" :key="name">
                <td class="wv-metric-cell">
                  <span class="wv-metric-emoji" aria-hidden="true">{{ METRIC_META[name].emoji }}</span>
                  <span class="wv-metric-ko">{{ METRIC_META[name].ko }}</span>
                  <span class="wv-metric-abbr">{{ name }}</span>
                  <GuideTooltip :target="METRIC_META[name].tip" placement="right" :size="11" />
                </td>
                <td :style="{ color: ratingColor(ratingOf(name)) }" class="mono-text wv-value">
                  {{ formatValue(name, stats[name].latest) }}
                </td>
                <td class="mono-text">{{ formatValue(name, stats[name].p50) }}</td>
                <td class="mono-text">{{ formatValue(name, stats[name].p75) }}</td>
                <td class="mono-text">{{ formatValue(name, stats[name].p95) }}</td>
                <td class="mono-text">{{ stats[name].count }}</td>
                <td class="mono-text wv-thresh">{{ goodThresholdLabel(name) }}</td>
                <td>
                  <span class="wv-badge" :class="`wv-badge--${ratingOf(name)}`">
                    {{ RATING_LABEL[ratingOf(name)].emoji }}
                    {{ RATING_LABEL[ratingOf(name)].label }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- 모바일 — 카드 (≤600px) -->
          <div class="wv-cards">
            <article
              v-for="name in METRICS"
              :key="`card-${name}`"
              class="wv-card-item"
              :class="`wv-card-item--${ratingOf(name)}`"
            >
              <header class="wv-card-head">
                <div class="wv-card-title">
                  <span class="wv-metric-emoji" aria-hidden="true">{{ METRIC_META[name].emoji }}</span>
                  <div class="d-flex flex-column">
                    <span class="wv-card-ko">
                      {{ METRIC_META[name].ko }}
                      <GuideTooltip :target="METRIC_META[name].tip" placement="bottom" :size="11" />
                    </span>
                    <span class="wv-card-abbr">{{ name }}</span>
                  </div>
                </div>
                <span class="wv-badge" :class="`wv-badge--${ratingOf(name)}`">
                  {{ RATING_LABEL[ratingOf(name)].emoji }}
                  {{ RATING_LABEL[ratingOf(name)].label }}
                </span>
              </header>
              <div class="wv-card-grid">
                <div class="wv-card-cell wv-card-cell--latest">
                  <span class="wv-card-cell-label">{{ $t('common.web_vitals.card_latest') }}</span>
                  <span class="wv-card-cell-value mono-text" :style="{ color: ratingColor(ratingOf(name)) }">
                    {{ formatValue(name, stats[name].latest) }}
                  </span>
                </div>
                <div class="wv-card-cell">
                  <span class="wv-card-cell-label">{{ $t('common.web_vitals.card_typical') }}</span>
                  <span class="wv-card-cell-value mono-text">{{ formatValue(name, stats[name].p50) }}</span>
                </div>
                <div class="wv-card-cell">
                  <span class="wv-card-cell-label">{{ $t('common.web_vitals.col_p75') }}</span>
                  <span class="wv-card-cell-value mono-text">{{ formatValue(name, stats[name].p75) }}</span>
                </div>
                <div class="wv-card-cell">
                  <span class="wv-card-cell-label">{{ $t('common.web_vitals.col_p95') }}</span>
                  <span class="wv-card-cell-value mono-text">{{ formatValue(name, stats[name].p95) }}</span>
                </div>
              </div>
              <footer class="wv-card-foot">
                <span>{{ $t('common.web_vitals.card_count', { count: stats[name].count }) }}</span>
                <span>{{ $t('common.web_vitals.card_good_threshold') }}<strong>{{ goodThresholdLabel(name) }}</strong></span>
              </footer>
            </article>
          </div>

          <!-- 읽는 법 안내 — 사용자 친화 풀이 -->
          <details class="wv-help-box">
            <summary>{{ $t('common.web_vitals.help_summary') }}</summary>
            <ul class="wv-help-list">
              <li v-html="$t('common.web_vitals.help_recent_html')" />
              <li v-html="$t('common.web_vitals.help_typical_html')" />
              <li v-html="$t('common.web_vitals.help_p75_html')" />
              <li v-html="$t('common.web_vitals.help_p95_html')" />
              <li v-html="$t('common.web_vitals.help_good_html')" />
              <li v-html="$t('common.web_vitals.help_status_html')" />
            </ul>
            <p class="wv-help-note" v-html="$t('common.web_vitals.help_note_html', { count: totalRecords })" />
          </details>

          <div class="wv-actions">
            <button type="button" class="wv-btn wv-btn--danger" @click="handleClear">
              <Trash2 :size="13" class="mr-1" aria-hidden="true" />{{ $t('common.web_vitals.clear_history') }}
            </button>
          </div>
        </template>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.wv-card { border-radius: 16px; overflow: hidden; }
.wv-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 22px;
  background: linear-gradient(135deg, #2A2421 0%, #1F2D27 100%);
  color: white;
}
.wv-title {
  font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1rem;
  margin: 0; display: inline-flex; align-items: center; gap: 6px;
}
.wv-title-sub {
  font-size: 0.65rem; font-weight: 600;
  background: rgba(255,255,255,0.15);
  padding: 2px 8px; border-radius: 9999px;
  letter-spacing: 0.06em;
}
.wv-close {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: rgba(255,255,255,0.15); color: white;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.wv-close:hover { background: rgba(255,255,255,0.3); }
.wv-body { padding: 20px 22px; }
.wv-intro {
  font-size: 0.84rem;
  color: var(--text-main);
  background: var(--bg-light);
  padding: 12px 14px;
  border-radius: 10px;
  margin-bottom: 16px;
  line-height: 1.55;
}
.wv-empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 0.85rem; }

/* ─── 테이블 (데스크탑) ─────────────────────────────────────── */
.wv-table {
  width: 100%; border-collapse: collapse;
  background: var(--bg-light); border-radius: 10px; overflow: hidden;
  font-size: 0.82rem;
}
.wv-table th, .wv-table td { padding: 10px 12px; text-align: left; vertical-align: middle; }
.wv-table thead { background: rgba(0,0,0,0.04); }
.wv-table th {
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.7rem; font-weight: 800;
  color: var(--text-muted); letter-spacing: 0.04em;
}
.wv-table tbody tr { border-top: 1px solid var(--border-light); }

.wv-metric-cell {
  display: flex; align-items: center; gap: 8px;
  font-family: 'Pretendard Variable', sans-serif;
}
.wv-metric-emoji { font-size: 1.05rem; line-height: 1; flex-shrink: 0; }
.wv-metric-ko { font-weight: 700; color: var(--text-main); font-size: 0.84rem; }
.wv-metric-abbr {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.65rem; font-weight: 700; color: var(--text-muted);
  background: rgba(0,0,0,0.05);
  padding: 1px 6px; border-radius: 4px;
}
.wv-value { font-weight: 700; }
.wv-thresh { color: var(--text-muted); font-size: 0.74rem; white-space: nowrap; }
.mono-text { font-family: 'IBM Plex Mono', monospace; }

/* ─── 상태 배지 ─────────────────────────────────────────── */
.wv-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 9999px;
  font-size: 0.72rem; font-weight: 700;
  white-space: nowrap;
  border: 1px solid transparent;
}
.wv-badge--good {
  background: #E8F5E9; color: #2E7B33;
  border-color: rgba(46, 123, 51, 0.25);
}
.wv-badge--needs-improvement {
  background: #FFF3E0; color: #B46723;
  border-color: rgba(180, 103, 35, 0.25);
}
.wv-badge--poor {
  background: #FFEBEE; color: #A0291F;
  border-color: rgba(160, 41, 31, 0.25);
}
.wv-badge--unknown {
  background: rgba(0,0,0,0.04); color: var(--text-muted);
  border-color: var(--border-light);
}

/* ─── 카드 (모바일) ─────────────────────────────────────── */
.wv-cards { display: none; }
.wv-card-item {
  background: var(--bg-light);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
}
.wv-card-item--good { border-left: 4px solid #2E7B33; }
.wv-card-item--needs-improvement { border-left: 4px solid #B46723; }
.wv-card-item--poor { border-left: 4px solid #A0291F; }
.wv-card-item--unknown { border-left: 4px solid var(--border-light); }
.wv-card-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; margin-bottom: 12px;
}
.wv-card-title {
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.wv-card-ko {
  font-weight: 700; color: var(--text-main); font-size: 0.92rem;
  display: inline-flex; align-items: center;
}
.wv-card-abbr {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.66rem; font-weight: 700; color: var(--text-muted);
  margin-top: 2px;
}
.wv-card-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  background: white;
  border-radius: 8px;
  padding: 10px;
}
.wv-card-cell {
  display: flex; flex-direction: column; gap: 2px;
}
.wv-card-cell--latest { grid-column: span 2; }
.wv-card-cell--latest .wv-card-cell-value { font-size: 1.1rem; font-weight: 800; }
.wv-card-cell-label {
  font-size: 0.66rem; color: var(--text-muted);
  letter-spacing: 0.02em;
}
.wv-card-cell-value {
  font-size: 0.88rem; font-weight: 700;
}
.wv-card-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 10px;
  font-size: 0.72rem; color: var(--text-muted);
}

/* ─── 도움말 박스 ────────────────────────────────────────── */
.wv-help-box {
  margin-top: 16px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.03);
}
.wv-help-box summary {
  padding: 10px 14px;
  font-size: 0.82rem; font-weight: 700;
  color: var(--text-main);
  cursor: pointer;
  list-style: none;
}
.wv-help-box summary::-webkit-details-marker { display: none; }
.wv-help-box summary::before {
  content: '▸ ';
  display: inline-block;
  margin-right: 4px;
  transition: transform 0.15s;
}
.wv-help-box[open] summary::before { transform: rotate(90deg); }
.wv-help-list {
  margin: 0; padding: 4px 14px 4px 32px;
  font-size: 0.78rem; line-height: 1.7; color: var(--text-main);
}
.wv-help-list li { margin-bottom: 4px; }
.wv-help-list em { color: var(--accent); font-style: normal; font-weight: 700; }
.wv-help-note {
  margin: 8px 14px 12px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  font-size: 0.74rem;
  color: var(--text-muted);
  line-height: 1.55;
}

.wv-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.wv-btn {
  display: inline-flex; align-items: center;
  padding: 8px 16px; border: none; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; transition: all .15s;
}
.wv-btn--danger { background: transparent; color: #C0392B; border: 1px solid rgba(192,57,43,0.3); }
.wv-btn--danger:hover { background: #C0392B; color: white; border-color: #C0392B; }

/* ─── 모바일 — 테이블 ↔ 카드 전환 ──────────────────────── */
@media (max-width: 700px) {
  .wv-body { padding: 16px; }
  .wv-table { display: none; }
  .wv-cards { display: block; }
  .wv-help-list { padding-left: 22px; padding-right: 12px; }
}
</style>
