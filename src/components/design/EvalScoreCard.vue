<script setup>
/**
 * [Phase E — 2026-05-25] 프로젝트 명세 충실도 점수 카드.
 *
 * 4-tier 점수 (구조 / 디테일 / 추적성 / 정합성) 를 한눈에. 디자인 톤은
 * LineageCoverageBadge 와 일관.
 *
 * Props:
 *   score: BE /eval-score 응답 객체 (overall, tier1~4, summary).
 *          null 이면 카드 숨김.
 *   loading: fetch 중 여부.
 */
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Activity, Link2, X, ChevronDown } from 'lucide-vue-next'
import { useSnackbar } from '@/composables/useSnackbar'
import { useDesignCrossLink } from '@/composables/useDesignCrossLink'
import { resolveGapJump, resolvePrdJump } from '@/utils/evalJump'
import EvalTopActions from './EvalTopActions.vue'
import EvalAutofillCta from './EvalAutofillCta.vue'

const props = defineProps({
  score: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  // [2026-05-29] 통합 카드 — 탭 컨텍스트에 맞춰 PRD 연결 구획을 함께 표시.
  // tabKey: 'spack' | 'ddd' | 'architecture' — 라벨 텍스트 결정.
  // lineageItems: [{ label: 'Entity', coverage: { total, direct, inferred, none, coverage_pct } }, ...]
  //   total=0 인 항목은 자동 숨김. 모두 0 이면 lineage 구획 자체 숨김.
  tabKey: { type: String, default: '' },
  lineageItems: { type: Array, default: () => [] },
  // [2026-05-29] PRD API 자동 보완 — autofill 호출에 필요한 프로젝트명.
  projectName: { type: String, default: '' },
})

// [2026-05-29] "API 에러·인증 AI로 채우기" — 미명시 API 에 error_cases/auth 초안 생성.
// BE POST /autofill_api_specs (source=ai_draft, reviewed=false 로 저장 → 점수 0.5 반영).
// 검토 후 확정하면 1.0. BE 미배포/실패 시 친절 토스트 (다운로드는 무관).
const { t, te } = useI18n()
const { showError } = useSnackbar()
// design.eval.* 단축 헬퍼 + 존재 시에만 번역(없으면 fallback) 헬퍼.
const tt = (key, params) => t(`design.eval.${key}`, params || {})
const ttIf = (key, fallback) => (te(`design.eval.${key}`) ? t(`design.eval.${key}`) : fallback)
// [2026-06-06] 완성도 gap 클릭 → 정확한 지점 이동. 설계 노드는 crossLink(in-page),
// PRD 는 router(/plan?tab=prd&section). useRouter 는 테스트(라우터 미주입) 시 undefined
// 일 수 있어 항상 옵셔널 체이닝.
const router = useRouter()
const crossLink = useDesignCrossLink()
// [2026-06 리팩토링] autofill/markAllReviewed 로직 + 상태(autofilling/reviewingAll)는
// EvalAutofillCta.vue 로 이동.

// (autofillApiSpecs → EvalAutofillCta.vue 로 이동)

const TAB_LABELS = {
  spack: 'SPACK',
  ddd: 'DDD',
  architecture: 'Architecture',
}
const tabLabel = computed(() => TAB_LABELS[props.tabKey] || '')

// total>0 인 항목만 노출 — BE 데이터 미수신 노드 종류는 자동 숨김.
const visibleLineageItems = computed(() =>
  (props.lineageItems || []).filter(it => (it?.coverage?.total ?? 0) > 0),
)

const hasLineageSection = computed(() => visibleLineageItems.value.length > 0)

// lineage % 색상 — LineageCoverageBadge 와 동일 톤.
function lineagePctColor(pct) {
  if (pct == null) return '#8A817C'
  if (pct >= 80) return '#4CAF50'
  if (pct >= 50) return '#E08A3C'
  return '#8A817C'
}

function lineageTooltip(item) {
  const c = item?.coverage
  if (!c || c.total === 0) return ''
  const parts = []
  if (c.direct) parts.push(t('enums.coverage.direct', { count: c.direct }))
  if (c.inferred) parts.push(t('enums.coverage.inferred', { count: c.inferred }))
  if (c.none) parts.push(t('enums.coverage.none', { count: c.none }))
  return `${item.label}: ${parts.join(' · ')} / ${t('enums.coverage.total', { count: c.total })}`
}

// [2026-05-29] 펼침 패널의 미연결 노드 chip — DddTab fix-guide 와 동일 cap.
const _UNLINKED_CAP = 8
// 각 lineage item 이 들고 온 미연결 노드 리스트 [{id, name}] (각 탭에서 계산해 전달).
function unlinkedOf(item) {
  return Array.isArray(item?.unlinked) ? item.unlinked : []
}

// [2026-05-29] PRD 연결 trigger 클릭 → 중앙 모달(팝업) 오픈. 기존 absolute
// 드롭다운은 페이지 스크롤 지옥이라 VDialog 로 전환 (반응형 + 모달 내부 스크롤).
const dialogOpen = ref(false)
function openDialog() {
  if (props.score) dialogOpen.value = true
  dismissCoach()  // 한 번 열어봤으면 코치마크 더 안 띄움
}
function closeDialog() {
  dialogOpen.value = false
}

// [2026-06-06] 누락 노드 칩 클릭 → 그 노드로 점프(설계 우선, 불가하면 PRD 폴백).
// 설계 점프는 crossLink.jumpTo 가 design.vue watcher 를 통해 탭 전환+스크롤+하이라이트.
// 점프 후 모달을 닫아 사용자가 도착 지점을 볼 수 있게 한다.
function jumpToGap(metricKey, missingItem, item) {
  const j = resolveGapJump(metricKey, missingItem, item)
  if (!j) {
    showError(tt('jump_not_found'))
    return
  }
  if (j.mode === 'design') {
    crossLink.jumpTo({ tab: j.tab, kind: j.kind, id: j.id })
  } else if (router) {
    router.push({ path: j.path, query: j.query })
  }
  closeDialog()
}

// [2026-06-06] 항목 레벨 'PRD에서 보강' — 대표 섹션(epic/nfr/screen)으로 이동.
function goToPrdSection(item) {
  const prd = resolvePrdJump(item, null)
  if (!prd || !router) {
    showError(tt('jump_not_found'))
    return
  }
  router.push({ path: prd.path, query: prd.query })
  closeDialog()
}

// [2026-06-06] 'AI 초안 모두 검토 완료' — autofill 이 만든 초안(0.5 반영)을 일괄
// 확정해 완성도에 100% 반영. 성공 시 eval-score refetch(점수 즉시 상승).
// (markAllReviewed → EvalAutofillCta.vue 로 이동)

// [2026-05] 첫 방문 코치마크 — 'PRD 연결' 칩이 클릭 가능(완성도 상세 팝업)하다는
// 걸 사용자가 몰라서, 최초 1회 말풍선으로 안내하고 닫으면 영구 dismiss.
// key 는 전역(탭 무관) — SPACK/DDD/Arch 어느 탭에서든 한 번 보면 끝.
const COACH_SEEN_KEY = 'harness_prd_trigger_coach_seen_v1'
const showCoach = ref(false)
function dismissCoach() {
  if (!showCoach.value) return
  showCoach.value = false
  try { localStorage.setItem(COACH_SEEN_KEY, '1') } catch { /* ignore */ }
}
onMounted(() => {
  // 점수가 있어(트리거가 실제로 보일 때) + 아직 안 본 경우에만 노출.
  if (!props.score) return
  let seen = false
  try { seen = !!localStorage.getItem(COACH_SEEN_KEY) } catch { /* ignore */ }
  if (!seen) showCoach.value = true
})

// [2026-05-29] '영역별 자세히' 접기/펴기 — 비개발자는 기본 접힘, 필요시 펼침.
const tiersExpanded = ref(false)

// [2026-05-30] 4영역 미니 점수(기본·내용·연결·오류)도 접기 가능.
// 모달 헤더(스크롤 고정)에 있어 모바일에선 공간을 많이 먹어 본문이 좁았음 →
// 모바일 기본 접힘으로 본문 높이 확보. 데스크톱은 펼친 채 시작.
// (Vuetify useDisplay 대신 window 폭 — 테스트 마운트에서 display 주입 불필요.)
const _isNarrowViewport = typeof window !== 'undefined' && window.innerWidth <= 600
const minisOpen = ref(!_isNarrowViewport)

// [2026-05-28] 메트릭 키 → 사용자 친화 정보 (라벨 + 왜 / 어떻게).
// 기존 라벨은 LLM 도메인 용어 그대로(API error_cases, Connection auth 등) — 비기술자
// 사용자는 의미·해결 방법 모름. 각 항목에 평어체 한 줄 설명 + 보강 액션 명시.
// [2026-06-03] 메트릭 라벨/왜/어떻게 → design.eval.metric.* locale 로 이관(키 없으면 fallback).
function metricInfo(key) {
  return {
    label: ttIf(`metric.${key}.label`, key),
    why: ttIf(`metric.${key}.why`, ''),
    fix: ttIf(`metric.${key}.fix`, ''),
  }
}

function metricLabel(key) {
  return metricInfo(key).label
}

// [2026-05-28] 위반 코드 → 사용자 친화 설명 + 보강 위치.
// 기존엔 API_MISSING_STORY_REF × 24 같은 raw enum 만 노출 → 사용자는 의미 모름.
// [2026-06-03] 위반 라벨/fix → design.eval.violation.* locale. section(라우팅 힌트)만 데이터.
const _VIOLATION_SECTION = {
  API_MISSING_STORY_REF: 'epic',
  API_ERROR_CASES_MISSING: 'epic',
  API_AUTH_ERROR_CASE_MISSING: 'epic',
  API_AUTH_SPECIFIED_MISSING: 'nfr',
  API_REQUEST_BODY_MISSING: 'epic',
  API_RESPONSE_BODY_MISSING: 'epic',
  LINEAGE_MISSING: 'epic',
  ENTITY_ATTRIBUTES_MISSING: 'epic',
  POLICY_CATEGORY_MISSING: 'nfr',
  POLICY_STUB_DROPPED: 'nfr',
  SCREEN_INVALID: 'screen',
}
function violationInfo(code) {
  return {
    label: ttIf(`violation.${code}.label`, code),
    fix: ttIf(`violation.${code}.fix`, ''),
    section: _VIOLATION_SECTION[code] || '',
  }
}

// [2026-05-28] Tier 명 재작성 — "구조/디테일/추적성/정합성" 같은 추상 단어 대신
// 사용자가 무엇을 의미하는지 알 수 있는 단어 + 부제목.
// [2026-06-03] tier 라벨/부제 → design.eval.tier_meta.* locale. weight(표시 데이터)만 유지.
const _TIER_WEIGHT = { t1: '10%', t2: '40%', t3: '25%', t4: '25%' }
function tierMeta(key) {
  return { label: tt(`tier_meta.${key}.label`), sub: tt(`tier_meta.${key}.sub`), weight: _TIER_WEIGHT[key] || '' }
}

const tierDetails = computed(() => {
  if (!props.score) return []
  const tierKeys = [
    { key: 't1', tier: props.score.tier1 },
    { key: 't2', tier: props.score.tier2 },
    { key: 't3', tier: props.score.tier3 },
    { key: 't4', tier: props.score.tier4 },
  ]
  return tierKeys.map(t => ({
    ...t,
    ...tierMeta(t.key),
    metrics: Object.entries(t.tier?.sub_metrics || {})
      .map(([key, value]) => {
        const info = metricInfo(key)
        return {
          key,
          label: info.label,
          why: info.why || '',
          fix: info.fix || '',
          pct: Math.round((value || 0) * 100),
          // raw_count 형식 (errors/warnings/infos) 은 점수 아닌 카운트
          isCount: key === 'errors' || key === 'warnings' || key === 'infos',
          rawValue: value,
        }
      })
      .sort((a, b) => a.pct - b.pct),  // 낮은 순서대로 — 시급 항목 위로
    notes: t.tier?.notes || [],
  }))
})

const violationCodes = computed(() =>
  (props.score?.top_violation_codes || []).map(v => ({
    ...v,
    ...violationInfo(v.code),
  })),
)

// overall 색상 — 80+ 녹색, 50+ 주황, < 50 빨강 (위험 강조), null 회색.
function pctColor(pct) {
  if (pct == null) return '#8A817C'
  if (pct >= 80) return '#4CAF50'
  if (pct >= 50) return '#E08A3C'
  return '#E55353'
}

const tiers = computed(() => {
  if (!props.score) return []
  return [
    { key: 't1', label: tt('tier_short.t1'), score: props.score.tier1?.score ?? 0, weight: props.score.tier1?.weight ?? 0 },
    { key: 't2', label: tt('tier_short.t2'), score: props.score.tier2?.score ?? 0, weight: props.score.tier2?.weight ?? 0 },
    { key: 't3', label: tt('tier_short.t3'), score: props.score.tier3?.score ?? 0, weight: props.score.tier3?.weight ?? 0 },
    { key: 't4', label: tt('tier_short.t4'), score: props.score.tier4?.score ?? 0, weight: props.score.tier4?.weight ?? 0 },
  ]
})

const overallPct = computed(() =>
  props.score ? Math.round((props.score.overall ?? 0) * 100) : 0,
)

// [2026-05-28] 상단 액션 가이드 — 어느 Tier 가 가장 낮은지 + 사용자가 무엇을 해야
// 하는지 구체. 'contract 누락' 같은 jargon → '입력/출력 필드 부족' 같은 일상어.
const actionHint = computed(() => {
  if (!props.score) return ''
  if (overallPct.value === 0) return tt('action_hint.not_analyzed')
  if (overallPct.value < 50) return tt('action_hint.low')
  // 가장 낮은 tier 안내
  const weakest = [...tiers.value].sort((a, b) => a.score - b.score)[0]
  if (weakest.score < 0.5) {
    return tt('action_hint.weak', { label: weakest.label, hint: ttIf(`action_hint.fix_${weakest.key}`, '') })
  }
  return overallPct.value >= 80 ? tt('action_hint.ready') : ''
})

// [2026-05-28] '명세 충실도' 가 추상적이라 일반 사용자가 의미 못 잡음 → 부제목으로
// '코드 생성 준비도' 같은 결과 지향 단어 추가.
const cardLabelMain = computed(() => tt('card_main'))
const cardLabelSub = computed(() => tt('card_sub'))

// [2026-05-29] 비개발자 친화 점수 상태 — 이모지 + 평어 + 행동 유도 한 줄.
// "원숭이도 알아볼 정도로" — 숫자만 보고 막막하지 않게 지금 상태와 다음 할 일을 말로.
const scoreStatus = computed(() => {
  const p = overallPct.value
  if (p === 0) return { emoji: '⏳', text: tt('status.none.text'), hint: tt('status.none.hint'), cls: 'is-none' }
  if (p < 30) return { emoji: '🌱', text: tt('status.low.text'), hint: tt('status.low.hint'), cls: 'is-low' }
  if (p < 50) return { emoji: '🙂', text: tt('status.mid.text'), hint: tt('status.mid.hint'), cls: 'is-mid' }
  if (p < 80) return { emoji: '😀', text: tt('status.high.text'), hint: tt('status.high.hint'), cls: 'is-high' }
  return { emoji: '🎉', text: tt('status.done.text'), hint: tt('status.done.hint'), cls: 'is-done' }
})

const tooltip = computed(() => {
  if (!props.score) return ''
  const lines = [
    `${cardLabelMain.value} ${overallPct.value}%`,
    cardLabelSub.value,
    '',
    tt('tooltip.tiers_header'),
    ...tiers.value.map(t => {
      const meta = tierMeta(t.key)
      return tt('tooltip.tier_line', { label: meta.label || t.label, weight: meta.weight, pct: Math.round(t.score * 100) })
    }),
    '',
    tt('tooltip.meaning_header'),
    tt('tooltip.m1'),
    tt('tooltip.m2'),
    tt('tooltip.m3'),
    '',
    tt('tooltip.click'),
  ]
  return lines.join('\n')
})

const tierLabelByNum = (n) => ttIf(`tier_by_num.${n}`, '')

// [2026-05-28] 가장 시급한 보강 항목 — BE 가 준 fix_targets (구체적 항목 이름 포함) 우선.
// 사용자 피드백 "정확히 어딜 고쳐야하는지 진짜 떠먹여줘야" → 어느 API/Entity/화면이
// 무엇이 빠졌는지 id+name 까지 노출. fix_targets 없으면 (구버전 BE) sub_metric 기반 fallback.
const topActionItems = computed(() => {
  if (!props.score) return []
  const fixTargets = props.score.fix_targets
  if (Array.isArray(fixTargets) && fixTargets.length) {
    return fixTargets.slice(0, 4).map(ft => ({
      key: ft.metric_key,
      label: ft.label,
      fix: ft.fix,
      tierLabel: tierLabelByNum(ft.tier),
      // 빠진 개별 항목 [{id, name}] — 사용자에게 'API-01 작업 생성' chip 으로 노출.
      missing: Array.isArray(ft.missing) ? ft.missing : [],
      missingTotal: ft.missing_total ?? (ft.missing?.length || 0),
      total: ft.total ?? 0,
      prdSection: ft.prd_section || '',
      // [2026-06-06] 이 항목을 다 채우면 overall 이 약 +N% (BE 산출, 근사).
      delta: ft.delta_pct ?? 0,
      pct: ft.total ? Math.round(((ft.total - (ft.missing_total ?? 0)) / ft.total) * 100) : 0,
    }))
  }
  // ── fallback: 구버전 BE (fix_targets 미제공) — sub_metric 기반 ──
  const all = []
  tierDetails.value.forEach(t => {
    t.metrics.forEach(m => {
      if (m.isCount) return
      if (m.pct >= 80) return
      if (!m.fix) return
      all.push({
        ...m, tierLabel: t.label, missing: [], missingTotal: 0, total: 0,
      })
    })
  })
  return all.sort((a, b) => a.pct - b.pct).slice(0, 3)
})
</script>

<template>
  <div v-if="loading" class="eval-score-card eval-score-card--loading">
    <Activity :size="12" />
    <span>{{ $t('design.eval.loading') }}</span>
  </div>
  <!-- [2026-05-25] 빈 상태 카드 — score 부재 시도 표시. 사용자가 "왜 안 보이지?" 헷갈리지 않게. -->
  <div v-else-if="!score" class="eval-score-card eval-score-card--empty" :title="$t('design.eval.empty_title_attr')">
    <Activity :size="12" />
    <span class="card-label">{{ cardLabelMain }}</span>
    <span class="empty-msg">{{ $t('design.eval.empty_msg') }}</span>
  </div>
  <div v-else class="eval-score-entry">
    <!-- [2026-05-29] 헤더엔 'PRD 연결' trigger 만 — 복잡한 완성도 바 제거.
         클릭 → 완성도 상세를 중앙 팝업(VDialog)으로.
         [2026-05] 클릭 가능 어포던스 강화 — 버튼처럼 강조 + 행동 문구 + 첫 방문 코치마크. -->
    <div class="prd-trigger-wrap">
      <button
        class="prd-trigger prd-trigger--clickable"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="dialogOpen"
        :title="$t('design.eval.trigger_title')"
        @click="openDialog"
      >
        <span class="prd-trigger__head">
          <Link2 :size="13" class="prd-trigger__icon" />
          <!-- [2026-06-24] 탭 접두사(SPACK/DDD/Architecture) 제거 — 이 % 는 탭과 무관한
               기획서 완성도(모달 제목과 동일)라 탭마다 다른 기능처럼 보이던 오해를 없앤다. -->
          <span class="prd-trigger__title">{{ $t('design.eval.prd_link') }}</span>
        </span>
        <span v-if="hasLineageSection" class="prd-trigger__items">
          <span
            v-for="item in visibleLineageItems"
            :key="item.label"
            class="prd-trigger__item"
            :title="lineageTooltip(item)"
          >
            <span class="prd-trigger__item-label">{{ item.label }}</span>
            <strong
              class="prd-trigger__item-pct"
              :style="{ color: lineagePctColor(item.coverage.coverage_pct) }"
            >{{ item.coverage.coverage_pct }}%</strong>
          </span>
        </span>
        <span class="prd-trigger__cta">
          {{ $t('design.eval.cta_complete', { pct: overallPct }) }} <span class="prd-trigger__cta-action">{{ $t('design.eval.cta_detail') }}</span><ChevronDown :size="13" />
        </span>
      </button>

      <!-- 첫 방문 코치마크 — 클릭 가능함을 1회 안내, 닫으면 영구 dismiss -->
      <div v-if="showCoach" class="prd-coach" role="status">
        <span class="prd-coach__dot" />
        <span class="prd-coach__text">{{ $t('design.eval.coach') }}</span>
        <button class="prd-coach__close" type="button" :aria-label="$t('design.eval.coach_close')" @click.stop="dismissCoach">
          <X :size="13" />
        </button>
      </div>
    </div>

    <!-- [2026-05-29] 완성도 상세 — 중앙 팝업(VDialog). 반응형 + 모달 내부 스크롤.
         기존 absolute 드롭다운(페이지 스크롤 지옥) 대체. -->
    <VDialog v-model="dialogOpen" max-width="780" scrollable transition="dialog-bottom-transition">
      <div class="eval-modal" role="dialog" :aria-label="$t('design.eval.modal_aria')">
        <!-- 헤더: 큰 점수 게이지 + 비개발자 친화 상태 (스크롤 고정) -->
        <header class="eval-modal__head">
          <div class="eval-modal__head-top">
            <div class="eval-modal__title-block">
              <h2 class="eval-modal__title">{{ $t('design.eval.modal_title') }}</h2>
              <p class="eval-modal__subtitle">{{ $t('design.eval.modal_subtitle') }}</p>
            </div>
            <button class="eval-modal__close" type="button" :aria-label="$t('design.eval.close')" @click="closeDialog">
              <X :size="20" />
            </button>
          </div>

          <!-- 큰 점수 게이지 -->
          <div class="score-hero" :class="`score-hero--${scoreStatus.cls}`">
            <div class="score-hero__num" :style="{ color: pctColor(overallPct) }">
              {{ overallPct }}<span class="score-hero__unit">%</span>
            </div>
            <div class="score-hero__right">
              <div class="score-hero__status">{{ scoreStatus.emoji }} {{ scoreStatus.text }}</div>
              <div class="score-hero__track">
                <div class="score-hero__fill" :style="{ width: `${overallPct}%`, background: pctColor(overallPct) }"></div>
              </div>
              <p class="score-hero__hint">{{ scoreStatus.hint }}</p>
            </div>
          </div>

          <!-- [2026-05-30] 4영역 미니 점수 — 접기 가능. 모바일에선 기본 접혀
               본문(채울 항목) 높이를 확보. 토글 헤더에 요약 라벨 노출. -->
          <button
            class="minis-toggle"
            type="button"
            :aria-expanded="minisOpen"
            @click="minisOpen = !minisOpen"
          >
            <ChevronDown :size="13" class="minis-toggle__icon" :class="{ 'minis-toggle__icon--open': minisOpen }" />
            <span class="minis-toggle__label">{{ $t('design.eval.minis_label') }}</span>
            <span class="minis-toggle__summary">{{ $t('design.eval.minis_summary') }}</span>
          </button>

          <!-- 4영역 미니 점수 한 줄 -->
          <div v-show="minisOpen" class="score-minis">
            <div
              v-for="t in tiers"
              :key="t.key"
              class="score-mini"
              :title="`${t.label}: ${Math.round(t.score * 100)}%`"
            >
              <span class="score-mini__label">{{ t.label }}</span>
              <span class="score-mini__track">
                <span class="score-mini__fill" :style="{ width: `${Math.round(t.score * 100)}%`, background: pctColor(Math.round(t.score * 100)) }" />
              </span>
              <span class="score-mini__pct" :style="{ color: pctColor(Math.round(t.score * 100)) }">{{ Math.round(t.score * 100) }}%</span>
            </div>
          </div>
        </header>

        <!-- 본문 (스크롤 영역) -->
        <div class="eval-modal__body">
      <!-- API 에러·인증 AI 자동 보완 CTA (분리: EvalAutofillCta). 모달 닫기는 close emit. -->
      <EvalAutofillCta
        v-if="projectName"
        :project-name="projectName"
        :overall-pct="overallPct"
        @close="dialogOpen = false"
      />

      <!-- ★ 지금 보강하면 가장 효과적인 항목 (분리: EvalTopActions). 점프 로직은 부모 유지. -->
      <EvalTopActions
        v-if="topActionItems.length"
        :items="topActionItems"
        @jump-gap="p => jumpToGap(p.key, p.m, p.item)"
        @jump-prd="goToPrdSection"
      />

      <!-- [2026-05-29] 탭별 PRD 연결 상세 — 미연결 노드를 콕 집어 chip 으로.
           카드 본체의 작은 숫자 요약을 클릭하면 "어느 노드가 PRD 와 안 묶였는지" 떠먹여줌. -->
      <div v-if="hasLineageSection" class="detail-lineage">
        <div class="detail-lineage-head">{{ $t('design.eval.lineage_detail_head', { tab: tabLabel }) }}</div>
        <ul class="detail-lineage-list">
          <li v-for="item in visibleLineageItems" :key="item.label" class="detail-lineage-item">
            <div class="detail-lineage-row">
              <span class="detail-lineage-label">{{ item.label }}</span>
              <span
                class="detail-lineage-pct"
                :style="{ color: lineagePctColor(item.coverage.coverage_pct) }"
              >{{ item.coverage.coverage_pct }}%</span>
              <span class="detail-lineage-summary" v-html="$t('design.eval.lineage_summary', { total: item.coverage.total, none: item.coverage.none })"></span>
            </div>
            <div v-if="unlinkedOf(item).length" class="detail-lineage-chips">
              <span class="detail-lineage-chips-label">{{ $t('design.eval.lineage_unlinked') }}</span>
              <span
                v-for="u in unlinkedOf(item).slice(0, _UNLINKED_CAP)"
                :key="u.id"
                class="unlinked-chip"
                :title="u.name"
              >
                <code class="unlinked-chip-id">{{ u.id }}</code>{{ u.name }}
              </span>
              <span
                v-if="unlinkedOf(item).length > _UNLINKED_CAP"
                class="unlinked-chip unlinked-chip--more"
              >{{ $t('design.eval.more_n', { n: unlinkedOf(item).length - _UNLINKED_CAP }) }}</span>
            </div>
            <div v-else class="detail-lineage-allok">{{ $t('design.eval.lineage_allok') }}</div>
          </li>
        </ul>
        <div class="detail-lineage-hint">
          {{ $t('design.eval.lineage_hint') }}
        </div>
      </div>

      <!-- [2026-05-29] 고급 정보 — 비개발자는 기본 접힘, 필요할 때만 펼침 -->
      <button
        class="adv-toggle"
        type="button"
        :aria-expanded="tiersExpanded"
        @click="tiersExpanded = !tiersExpanded"
      >
        <ChevronDown :size="14" class="adv-toggle__icon" :class="{ 'adv-toggle__icon--open': tiersExpanded }" />
        <span>{{ $t('design.eval.adv_toggle') }}</span>
      </button>
      <div v-show="tiersExpanded" class="detail-advanced">
      <div class="detail-tiers-head">{{ $t('design.eval.detail_tiers_head') }}</div>
      <div v-for="t in tierDetails" :key="t.key" class="detail-tier">
        <div class="detail-tier-head">
          <div class="detail-tier-label-block">
            <span class="detail-tier-label">{{ t.label }}</span>
            <span class="detail-tier-sub">{{ t.sub }}</span>
          </div>
          <span class="detail-tier-weight">{{ $t('design.eval.tier_weight', { weight: t.weight }) }}</span>
          <span
            class="detail-tier-score"
            :style="{ color: pctColor(Math.round((t.tier?.score || 0) * 100)) }"
          >
            {{ Math.round((t.tier?.score || 0) * 100) }}%
          </span>
        </div>
        <ul v-if="t.metrics.length" class="detail-metric-list">
          <li
            v-for="m in t.metrics"
            :key="m.key"
            class="detail-metric"
            :class="{
              'detail-metric--low': !m.isCount && m.pct < 50,
              'detail-metric--ok': !m.isCount && m.pct >= 80,
            }"
            :title="m.why || ''"
          >
            <span class="metric-label">{{ m.label }}</span>
            <span v-if="m.isCount" class="metric-value">{{ Math.round(m.rawValue) }}</span>
            <template v-else>
              <span class="metric-bar-track">
                <span
                  class="metric-bar-fill"
                  :style="{ width: `${m.pct}%`, background: pctColor(m.pct) }"
                />
              </span>
              <span class="metric-pct" :style="{ color: pctColor(m.pct) }">{{ m.pct }}%</span>
            </template>
          </li>
        </ul>
        <div v-if="t.notes.length" class="detail-notes">
          <span v-for="(n, i) in t.notes" :key="i" class="detail-note">⚠️ {{ n }}</span>
        </div>
      </div>

      <!-- 위반 코드 list — 한글 풀이 + 보강 액션. -->
      <div v-if="violationCodes.length" class="detail-violations">
        <div class="detail-violations-head">
          {{ $t('design.eval.violations_head') }}
        </div>
        <ul class="violation-list">
          <li v-for="v in violationCodes" :key="v.code" class="violation-item">
            <div class="violation-row">
              <span class="violation-label">{{ v.label }}</span>
              <span class="violation-count">{{ $t('design.eval.count_suffix', { count: v.count }) }}</span>
            </div>
            <div v-if="v.fix" class="violation-fix">▶ {{ v.fix }}</div>
            <code class="violation-code-small">{{ v.code }}</code>
          </li>
        </ul>
      </div>
        </div>
        <!-- /detail-advanced -->
        </div>
        <!-- /eval-modal__body -->
      </div>
      <!-- /eval-modal -->
    </VDialog>
  </div>
</template>

<style scoped>
.eval-score-card {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 11px;
  color: #4B5563;
  cursor: help;
}
.eval-score-card--loading {
  opacity: 0.6;
}
.eval-score-card--empty {
  opacity: 0.7;
  font-style: italic;
}
.empty-msg {
  color: #9CA3AF;
  font-size: 11px;
}

/* [2026-06 리팩토링] top-actions 스타일은 EvalTopActions.vue 로 1:1 이동. */

.detail-tiers-head {
  font-weight: 700;
  font-size: 11px;
  color: #1F2937;
  margin-bottom: 8px;
}
.detail-tier {
  margin-bottom: 10px;
}
.detail-tier:last-child {
  margin-bottom: 0;
}
.detail-tier-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-weight: 600;
  color: #1F2937;
  margin-bottom: 4px;
}
.detail-tier-label-block {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.detail-tier-label {
  font-weight: 700;
  font-size: 11.5px;
}
.detail-tier-sub {
  font-weight: 400;
  font-size: 10px;
  color: #6B7280;
  line-height: 1.4;
}
.detail-tier-weight {
  font-weight: 400;
  color: #9CA3AF;
  font-size: 10px;
}
.detail-tier-score {
  font-weight: 700;
  font-size: 12px;
}
.detail-metric-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.detail-metric {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
}
.metric-label {
  flex: 1;
  color: #6B7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-bar-track {
  width: 60px;
  height: 4px;
  background: #E5E7EB;
  border-radius: 2px;
  overflow: hidden;
}
.metric-bar-fill {
  display: block;
  height: 100%;
}
.metric-pct {
  width: 32px;
  text-align: right;
  font-weight: 600;
  font-size: 10px;
}
.metric-value {
  font-weight: 600;
  color: #4B5563;
}
.detail-metric--low .metric-label {
  color: #C53030;
  font-weight: 500;
}
.detail-metric--ok .metric-label {
  color: #2F855A;
}
.detail-notes {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detail-note {
  font-size: 10px;
  color: #B45309;
}
.detail-violations {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #F3F4F6;
}
.detail-violations-head {
  font-weight: 600;
  font-size: 11px;
  color: #C53030;
  margin-bottom: 4px;
}
.violation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.violation-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  padding: 6px 8px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 4px;
}
.violation-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.violation-label {
  flex: 1;
  font-weight: 600;
  color: #991B1B;
  font-size: 11px;
}
.violation-count {
  color: #991B1B;
  font-weight: 700;
  font-size: 10.5px;
  background: #FFFFFF;
  padding: 1px 6px;
  border-radius: 3px;
}
.violation-fix {
  font-size: 10.5px;
  color: #92400E;
  line-height: 1.45;
}
.violation-code-small {
  align-self: flex-start;
  font-family: monospace;
  color: #9CA3AF;
  font-size: 9px;
  padding: 0;
  background: none;
}
.card-label {
  font-weight: 500;
}

/* [2026-05-29] 펼침 패널 — 탭별 PRD 연결 상세 (미연결 노드 강조). */
.detail-lineage {
  background: #F0F9FF;
  border: 1px solid #BAE6FD;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 14px;
}
.detail-lineage-head {
  font-weight: 700;
  font-size: 11.5px;
  color: #0C4A6E;
  margin-bottom: 8px;
}
.detail-lineage-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.detail-lineage-item {
  background: #FFFFFF;
  border: 1px solid #BAE6FD;
  border-radius: 4px;
  padding: 8px 10px;
}
.detail-lineage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.detail-lineage-label {
  font-weight: 600;
  color: #1F2937;
  font-size: 11px;
}
.detail-lineage-pct {
  font-weight: 700;
  font-size: 12px;
  min-width: 34px;
}
.detail-lineage-summary {
  font-size: 10.5px;
  color: #6B7280;
}
.detail-lineage-summary :deep(strong) { color: #B91C1C; }
.detail-lineage-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
.detail-lineage-chips-label {
  font-size: 9.5px;
  color: #0369A1;
  font-weight: 600;
}
.unlinked-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: #FFFFFF;
  border: 1px solid #FCA5A5;
  border-radius: 4px;
  font-size: 10px;
  color: #1F2937;
  max-width: 100%;
}
.unlinked-chip-id {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  color: #B91C1C;
  background: #FEE2E2;
  padding: 0 3px;
  border-radius: 2px;
}
.unlinked-chip--more {
  border-style: dashed;
  border-color: #D1D5DB;
  color: #6B7280;
  font-style: italic;
}
.detail-lineage-allok {
  font-size: 10.5px;
  color: #2F855A;
  font-weight: 500;
}
.detail-lineage-hint {
  font-size: 10px;
  color: #0369A1;
  margin-top: 8px;
  line-height: 1.45;
}


/* ============================================================
   [2026-05-29] 헤더 'PRD 연결' trigger + 완성도 모달(팝업)
   ============================================================ */
.eval-score-entry { display: inline-flex; }
.prd-trigger-wrap { position: relative; display: inline-flex; }

/* ── trigger 버튼 (헤더) ── */
.prd-trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  color: #4B5563;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
/* [2026-05] 클릭 가능 어포던스 — 회색 정보칩처럼 안 보이게 보라 accent 로 강조.
   모바일엔 hover 가 없으므로 기본 상태 자체를 "버튼답게" 만든다. */
.prd-trigger--clickable {
  background: #F5F7FF;
  border-color: #C7D2FE;
  box-shadow: 0 1px 2px rgba(79, 70, 229, 0.08);
}
.prd-trigger:hover {
  background: #EEF2FF;
  border-color: #A5B4FC;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.16);
}
.prd-trigger:active { transform: translateY(0.5px); }
/* CTA 안의 행동 문구 — "완성도 34% · 자세히 ›" */
.prd-trigger__cta-action {
  margin-left: 4px;
  padding-left: 5px;
  border-left: 1px solid rgba(79, 70, 229, 0.25);
}
.prd-trigger:focus-visible {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
}

/* ── 첫 방문 코치마크 (말풍선) ── */
.prd-coach {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 300px;
  padding: 8px 10px 8px 12px;
  background: #4F46E5;
  color: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.28);
  font-size: 11.5px;
  line-height: 1.45;
  animation: prd-coach-in 0.25s ease-out;
}
/* 말풍선 꼬리 — 트리거 쪽(위)을 가리킴 */
.prd-coach::before {
  content: '';
  position: absolute;
  top: -5px;
  right: 18px;
  width: 10px;
  height: 10px;
  background: #4F46E5;
  transform: rotate(45deg);
  border-radius: 2px;
}
.prd-coach__dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #C7D2FE;
  box-shadow: 0 0 0 0 rgba(199, 210, 254, 0.7);
  animation: prd-coach-pulse 1.6s ease-out infinite;
}
.prd-coach__text { flex: 1; }
.prd-coach__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}
.prd-coach__close:hover { background: rgba(255, 255, 255, 0.3); }
@keyframes prd-coach-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes prd-coach-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(199, 210, 254, 0.7); }
  70%  { box-shadow: 0 0 0 6px rgba(199, 210, 254, 0); }
  100% { box-shadow: 0 0 0 0 rgba(199, 210, 254, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .prd-coach { animation: none; }
  .prd-coach__dot { animation: none; }
}
@media (max-width: 600px) {
  .prd-coach { max-width: 220px; font-size: 11px; }
}

.prd-trigger__head { display: inline-flex; align-items: center; gap: 5px; }
.prd-trigger__icon { color: #6366F1; }
.prd-trigger__title { font-weight: 700; font-size: 12px; color: #374151; white-space: nowrap; }
.prd-trigger__items {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding-left: 10px;
  border-left: 1px solid #E5E7EB;
}
.prd-trigger__item { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.prd-trigger__item-label { color: #6B7280; }
.prd-trigger__item-pct { font-size: 12px; font-weight: 700; }
.prd-trigger__cta {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  margin-left: 2px;
  padding: 3px 8px 3px 10px;
  background: #EEF2FF;
  color: #4F46E5;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

/* ── 모달 ── */
.eval-modal {
  display: flex;
  flex-direction: column;
  max-height: 86vh;
  background: #FFFFFF;
  border-radius: 14px;
  overflow: hidden;
  font-family: 'Pretendard Variable', 'Noto Sans KR', sans-serif;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.3);
}
.eval-modal__head {
  flex-shrink: 0;
  padding: 20px 22px 16px;
  border-bottom: 1px solid #F0F0F0;
  background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFB 100%);
}
.eval-modal__head-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.eval-modal__title { font-size: 1.25rem; font-weight: 800; color: #1F2937; margin: 0; font-family: 'Outfit', sans-serif; }
.eval-modal__subtitle { font-size: 0.82rem; color: #6B7280; margin: 5px 0 0; line-height: 1.45; }
.eval-modal__close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: #9CA3AF;
  padding: 4px;
  border-radius: 6px;
  display: inline-flex;
  transition: background 0.15s, color 0.15s;
}
.eval-modal__close:hover { background: #F3F4F6; color: #4B5563; }

/* 큰 점수 게이지 */
.score-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 16px;
  padding: 16px 18px;
  background: #F9FAFB;
  border: 1px solid #EEF0F2;
  border-radius: 12px;
}
.score-hero__num {
  font-size: 2.7rem;
  font-weight: 800;
  line-height: 1;
  font-family: 'Outfit', sans-serif;
  min-width: 92px;
}
.score-hero__unit { font-size: 1.2rem; font-weight: 700; margin-left: 2px; }
.score-hero__right { flex: 1; min-width: 0; }
.score-hero__status { font-size: 1.02rem; font-weight: 700; color: #1F2937; margin-bottom: 7px; }
.score-hero__track { height: 9px; background: #E5E7EB; border-radius: 9999px; overflow: hidden; }
.score-hero__fill { height: 100%; border-radius: 9999px; transition: width 0.5s ease; }
.score-hero__hint { font-size: 0.83rem; color: #6B7280; margin: 9px 0 0; line-height: 1.5; }

/* 4영역 미니 점수 */
.minis-toggle {
  display: flex; align-items: center; gap: 7px;
  width: 100%; margin-top: 14px;
  padding: 8px 12px;
  background: #fafbfc; border: 1px solid var(--border-light);
  border-radius: 10px; cursor: pointer;
  font-family: 'Pretendard Variable', sans-serif;
  color: var(--text-main); transition: background 0.15s;
}
.minis-toggle:hover { background: var(--bg-light, #F7F5EB); }
.minis-toggle__icon { color: var(--text-muted); transition: transform 0.2s; flex-shrink: 0; }
.minis-toggle__icon--open { transform: rotate(180deg); }
.minis-toggle__label { font-size: 0.8rem; font-weight: 800; }
.minis-toggle__summary { font-size: 0.72rem; color: var(--text-muted); margin-left: auto; }
.score-minis { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.score-mini { flex: 1; min-width: 110px; display: flex; flex-direction: column; gap: 5px; }
.score-mini__label { font-size: 0.72rem; font-weight: 600; color: #6B7280; }
.score-mini__track { height: 5px; background: #E5E7EB; border-radius: 9999px; overflow: hidden; }
.score-mini__fill { display: block; height: 100%; }
.score-mini__pct { font-size: 0.78rem; font-weight: 700; align-self: flex-end; }

/* 본문 (스크롤 영역) */
.eval-modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 22px 22px;
  font-size: 12px;
  color: #4B5563;
}
.eval-modal__body::-webkit-scrollbar { width: 8px; }
.eval-modal__body::-webkit-scrollbar-thumb { background: #E0E0E0; border-radius: 9999px; }
.eval-modal__body::-webkit-scrollbar-thumb:hover { background: #C8C8C8; }

/* 고급 정보 토글 */
.adv-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-top: 4px;
  padding: 11px 12px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  text-align: left;
}
.adv-toggle:hover { background: #F3F4F6; }
.adv-toggle__icon { transition: transform 0.2s; flex-shrink: 0; color: #6B7280; }
.adv-toggle__icon--open { transform: rotate(180deg); }
.detail-advanced { margin-top: 12px; }

/* [2026-06 리팩토링] autofill-cta/assist/review-all 스타일은 EvalAutofillCta.vue 로 이동. */

/* 모달 반응형 — 태블릿 */
@media (max-width: 760px) {
  .eval-modal { max-height: 90vh; }
  .score-minis { gap: 8px; }
  .score-mini { min-width: calc(50% - 4px); }
}
/* 모달 반응형 — 모바일 */
@media (max-width: 600px) {
  .eval-modal { max-height: 92vh; border-radius: 12px; }
  .eval-modal__head { padding: 16px 16px 12px; }
  .eval-modal__title { font-size: 1.1rem; }
  .eval-modal__subtitle { font-size: 0.78rem; }
  .score-hero { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; margin-top: 14px; }
  .score-hero__num { font-size: 2.2rem; min-width: 0; }
  .score-hero__right { width: 100%; }
  .eval-modal__body { padding: 14px 16px 18px; }
  /* 모바일 trigger — 항목 숫자는 숨기고 핵심만 (공간 확보) */
  .prd-trigger { gap: 6px; padding: 6px 10px; }
  .prd-trigger__items { display: none; }
}
</style>
