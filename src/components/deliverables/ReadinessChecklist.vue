<script setup>
/**
 * ReadinessChecklist — Deliverables 페이지의 "인수 준비도" 자동 체크리스트.
 *
 * "이 프로젝트, 정말 인수 가능한 상태인가?" 질문을 7개 항목으로 자동 평가.
 * 사용자에게 "다음에 뭐 해야 하는지" 즉시 보이는 액션 트리거.
 *
 * 항목 (props 로 받음):
 *   1. Repo 1개 이상 등록
 *   2. 평균 Lint ≥ 80%
 *   3. Lineage 분석 완료 + Coverage ≥ 80%
 *   4. 모든 Repo 에 README 존재
 *   5. 모든 Repo 에 LICENSE 명시
 *   6. 최근 30일 내 커밋 활성 (모든 Repo)
 *   7. PRD 존재
 *
 * 각 항목은 status: 'pass' | 'warn' | 'fail' 로 분류.
 * 전체 진행률 = pass 개수 / 7.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, AlertCircle, XCircle, Activity, ChevronDown } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const { t } = useI18n()

// 각 체크 항목별 "왜 중요한가" 설명. 사용자가 "이거 왜 보는 거지?" 의문에 즉답.
// 한 줄 또는 두 줄 — 모니터에서 한눈에 읽힐 길이. 비전공자도 이해하게 일상 비유.
// id → deliverables.readiness.checks.<key>.why 키 매핑 (id 는 dash, 키는 underscore).
const WHY_KEYS = {
  'has-repo': 'has_repo',
  'lint-avg': 'lint_avg',
  'lineage-coverage': 'lineage_coverage',
  'readme': 'readme',
  'license': 'license',
  'prd': 'prd',
}
const whyText = (id) => WHY_KEYS[id] ? t(`deliverables.readiness.checks.${WHY_KEYS[id]}.why`) : ''

// 사용자가 처음엔 깔끔하게 보고, 궁금한 항목만 펼쳐서 "왜" 를 읽을 수 있게.
// 키보드 사용자도 toggle 가능 — button 기반.
const expanded = ref(new Set())
const toggleExpand = (id) => {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

const props = defineProps({
  repos: { type: Array, required: true },
  repoMetaByUrl: { type: Object, required: true },
  kpi: { type: Object, required: true },                  // { lintAvg, lintCount }
  hasPrd: { type: Boolean, default: false },
  lineageCoveragePct: { type: Number, default: null },    // null = 미분석
})

const checks = computed(() => {
  const repos = props.repos
  const metas = props.repoMetaByUrl
  const reposLoaded = repos.length > 0 && repos.every(r => metas[r.url] && metas[r.url].ok !== false)

  // 1. Repo 1개 이상
  const hasRepo = repos.length > 0

  // 2. 평균 Lint ≥ 80%
  const lintAvg = props.kpi.lintAvg
  const lintPass = lintAvg !== null && lintAvg >= 80
  const lintPartial = lintAvg !== null && lintAvg >= 60 && lintAvg < 80

  // 3. Lineage 분석 + Coverage
  const lineagePct = props.lineageCoveragePct
  const lineagePass = lineagePct !== null && lineagePct >= 80
  const lineagePartial = lineagePct !== null && lineagePct >= 50 && lineagePct < 80

  // 4. README — 모든 Repo
  const readmeStats = repos.reduce((acc, r) => {
    const meta = metas[r.url]
    if (!meta || meta.ok === false) return acc
    acc.checked++
    if (meta.readme) acc.has++
    return acc
  }, { checked: 0, has: 0 })
  const readmeAllPass = reposLoaded && readmeStats.has === repos.length
  const readmePartial = readmeStats.has > 0 && readmeStats.has < repos.length

  // 5. LICENSE — 모든 Repo (license SPDX 가 truthy)
  const licenseStats = repos.reduce((acc, r) => {
    const meta = metas[r.url]
    if (!meta || meta.ok === false) return acc
    acc.checked++
    if (meta.meta?.license) acc.has++
    return acc
  }, { checked: 0, has: 0 })
  const licenseAllPass = reposLoaded && licenseStats.has === repos.length
  const licensePartial = licenseStats.has > 0 && licenseStats.has < repos.length

  // 6. PRD 존재
  const prdPass = props.hasPrd

  // 메시지 헬퍼
  const ratioMsg = (have, total) =>
    total === 0
      ? t('deliverables.readiness.msg.need_repo')
      : t('deliverables.readiness.msg.ratio_pass', { have, total })

  return [
    {
      id: 'has-repo',
      label: t('deliverables.readiness.checks.has_repo.label'),
      status: hasRepo ? 'pass' : 'fail',
      hint: hasRepo
        ? t('deliverables.readiness.checks.has_repo.hint_pass', { count: repos.length })
        : t('deliverables.readiness.checks.has_repo.hint_fail'),
    },
    {
      id: 'lint-avg',
      label: t('deliverables.readiness.checks.lint_avg.label'),
      status: lintPass ? 'pass' : (lintPartial ? 'warn' : 'fail'),
      hint: lintAvg === null
        ? t('deliverables.readiness.checks.lint_avg.hint_none')
        : t('deliverables.readiness.checks.lint_avg.hint_value', { avg: lintAvg, count: props.kpi.lintCount, total: repos.length }),
    },
    {
      id: 'lineage-coverage',
      label: t('deliverables.readiness.checks.lineage_coverage.label'),
      status: lineagePass ? 'pass' : (lineagePartial ? 'warn' : 'fail'),
      hint: lineagePct === null
        ? t('deliverables.readiness.checks.lineage_coverage.hint_none')
        : t('deliverables.readiness.checks.lineage_coverage.hint_value', { pct: lineagePct }),
    },
    {
      id: 'readme',
      label: t('deliverables.readiness.checks.readme.label'),
      status: readmeAllPass ? 'pass' : (readmePartial ? 'warn' : 'fail'),
      hint: ratioMsg(readmeStats.has, repos.length),
    },
    {
      id: 'license',
      label: t('deliverables.readiness.checks.license.label'),
      status: licenseAllPass ? 'pass' : (licensePartial ? 'warn' : 'fail'),
      hint: ratioMsg(licenseStats.has, repos.length),
    },
    {
      id: 'prd',
      label: t('deliverables.readiness.checks.prd.label'),
      status: prdPass ? 'pass' : 'fail',
      hint: prdPass
        ? t('deliverables.readiness.checks.prd.hint_pass')
        : t('deliverables.readiness.checks.prd.hint_fail'),
    },
  ]
})

const passCount = computed(() => checks.value.filter(c => c.status === 'pass').length)
const warnCount = computed(() => checks.value.filter(c => c.status === 'warn').length)
const totalCount = computed(() => checks.value.length)
const progressPct = computed(() => Math.round((passCount.value / totalCount.value) * 100))

const overallStatus = computed(() => {
  if (passCount.value === totalCount.value) return 'ready'
  if (passCount.value + warnCount.value === totalCount.value) return 'almost'
  return 'todo'
})

const overallLabel = computed(() => t(`deliverables.readiness.overall.${overallStatus.value}`))

const statusIcon = (status) => ({
  pass: CheckCircle2,
  warn: AlertCircle,
  fail: XCircle,
}[status])
</script>

<template>
  <section class="readiness-section">
    <div class="readiness-head">
      <div>
        <span class="section-pill mono-text">{{ $t('deliverables.readiness.pill') }}</span>
        <h4 class="section-title serif-text">
          {{ $t('deliverables.readiness.title') }}
          <GuideTooltip target="deliv-readiness" placement="bottom" :size="13" />
        </h4>
        <p class="readiness-desc">{{ $t('deliverables.readiness.desc') }}</p>
      </div>
      <div class="readiness-summary" :class="`readiness-summary--${overallStatus}`">
        <div class="readiness-num">
          <span class="readiness-num-pass">{{ passCount }}</span>
          <span class="readiness-num-total">/ {{ totalCount }}</span>
        </div>
        <div class="readiness-label">{{ overallLabel }}</div>
      </div>
    </div>

    <div class="readiness-bar" role="progressbar" :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100">
      <div class="readiness-bar-fill" :class="`readiness-bar-fill--${overallStatus}`" :style="{ width: progressPct + '%' }"></div>
    </div>

    <ul class="readiness-list">
      <li v-for="c in checks" :key="c.id" class="readiness-item" :class="`readiness-item--${c.status}`">
        <component :is="statusIcon(c.status)" :size="16" class="readiness-icon" />
        <div class="readiness-item-body">
          <div class="readiness-item-row">
            <span class="readiness-item-label">{{ c.label }}</span>
            <!-- "왜 중요한가?" 토글 — 기본은 접힌 상태로 깔끔, 궁금한 항목만 펼쳐 봄.
                 항목 status 마다 추가 인지 부하 줄이는 패턴 — 비전공자 사용자 친화. -->
            <button
              v-if="WHY_KEYS[c.id]"
              type="button"
              class="readiness-why-toggle"
              :class="{ 'readiness-why-toggle--open': expanded.has(c.id) }"
              :aria-expanded="expanded.has(c.id)"
              :aria-label="(expanded.has(c.id) ? $t('deliverables.readiness.why_collapse') : $t('deliverables.readiness.why_expand')) + c.label"
              @click="toggleExpand(c.id)"
            >
              {{ $t('deliverables.readiness.why_label') }}
              <ChevronDown :size="11" class="readiness-why-toggle-icon" />
            </button>
          </div>
          <span class="readiness-item-hint">{{ c.hint }}</span>
          <p v-if="expanded.has(c.id) && WHY_KEYS[c.id]" class="readiness-item-why">
            {{ whyText(c.id) }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.readiness-section {
  background: white; border: 1px solid var(--border-light); border-radius: 16px;
  padding: 22px 24px; margin-bottom: 24px;
}
.readiness-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; margin-bottom: 14px;
}
.section-pill {
  display: inline-block; padding: 3px 10px;
  background: var(--bg-light); color: var(--accent);
  font-size: 0.62rem; font-weight: 800; letter-spacing: 0.08em;
  border-radius: 9999px; margin-bottom: 6px;
}
.section-title {
  font-family: 'Fraunces', 'Outfit', serif; font-size: 1.3rem; font-weight: 700;
  color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;
}
.readiness-desc { font-size: 0.78rem; color: var(--text-muted); margin: 4px 0 0; }

.readiness-summary {
  display: flex; flex-direction: column; align-items: flex-end;
  padding: 8px 14px; border-radius: 12px;
  text-align: right; min-width: 110px;
}
.readiness-summary--ready { background: rgba(46, 123, 51, 0.08); }
.readiness-summary--almost { background: rgba(180, 103, 35, 0.08); }
.readiness-summary--todo { background: rgba(160, 41, 31, 0.08); }
.readiness-num {
  display: inline-flex; align-items: baseline; gap: 2px;
  font-family: 'Fraunces', serif;
}
.readiness-num-pass {
  font-size: 1.8rem; font-weight: 800; line-height: 1;
}
.readiness-summary--ready .readiness-num-pass { color: #2E7B33; }
.readiness-summary--almost .readiness-num-pass { color: #B46723; }
.readiness-summary--todo .readiness-num-pass { color: #A0291F; }
.readiness-num-total {
  font-size: 0.9rem; color: var(--text-muted); font-weight: 700;
}
.readiness-label {
  font-size: 0.7rem; font-weight: 700; margin-top: 2px;
  color: var(--text-muted);
}

.readiness-bar {
  height: 6px; background: rgba(0,0,0,0.05);
  border-radius: 9999px; overflow: hidden; margin-bottom: 18px;
}
.readiness-bar-fill {
  height: 100%; border-radius: 9999px;
  transition: width 0.6s ease;
}
.readiness-bar-fill--ready { background: linear-gradient(90deg, #2E7B33 0%, #5BA160 100%); }
.readiness-bar-fill--almost { background: linear-gradient(90deg, #B46723 0%, #E08A3C 100%); }
.readiness-bar-fill--todo { background: linear-gradient(90deg, #A0291F 0%, #C0392B 100%); }

.readiness-list {
  list-style: none; padding: 0; margin: 0;
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
}
.readiness-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--bg-light);
  transition: background 0.15s;
}
.readiness-item--pass { background: rgba(46, 123, 51, 0.06); }
.readiness-item--warn { background: rgba(180, 103, 35, 0.06); }
.readiness-item--fail { background: rgba(160, 41, 31, 0.06); }
.readiness-icon { flex-shrink: 0; margin-top: 1px; }
.readiness-item--pass .readiness-icon { color: #2E7B33; }
.readiness-item--warn .readiness-icon { color: #B46723; }
.readiness-item--fail .readiness-icon { color: #A0291F; }
.readiness-item-body {
  display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;
}
.readiness-item-row {
  display: flex; align-items: center; gap: 8px;
  justify-content: space-between;
}
.readiness-item-label {
  font-size: 0.84rem; font-weight: 700; color: var(--text-main);
  min-width: 0;
}
.readiness-item-hint {
  font-size: 0.72rem; color: var(--text-muted);
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
}

/* "왜?" 토글 — 항목 우측. 평소엔 옅게, hover/focus 시 진해짐. */
.readiness-why-toggle {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 2px 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-family: 'Outfit', sans-serif;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  border-radius: 9999px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.readiness-why-toggle:hover,
.readiness-why-toggle:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(140, 98, 57, 0.06);
}
.readiness-why-toggle-icon { transition: transform 0.2s; }
.readiness-why-toggle--open .readiness-why-toggle-icon { transform: rotate(180deg); }
.readiness-why-toggle--open {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(140, 98, 57, 0.1);
}

.readiness-item-why {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.6);
  border: 1px solid var(--border-light);
  font-size: 0.74rem;
  color: var(--text-main);
  line-height: 1.55;
  font-family: 'Pretendard Variable', sans-serif;
  font-weight: 500;
  word-break: keep-all;
  animation: readinessWhyFade 0.18s ease-out;
}
@keyframes readinessWhyFade {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .readiness-item-why { animation: none; }
}

@media (max-width: 700px) {
  .readiness-list { grid-template-columns: 1fr; }
  .readiness-head { flex-direction: column; }
  .readiness-summary { align-self: flex-start; align-items: flex-start; text-align: left; }
}
</style>
