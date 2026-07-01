<script setup>
/**
 * /home — 로그인 사용자 개인 데시보드.
 *
 * 인트로 (/) 와 다르게 마케팅이 아닌 실용적인 작업 진입점:
 *   - 현재 프로젝트 상태 + 진행률
 *   - 5 단계 워크플로우 바로가기 카드
 *   - 비어있을 때(프로젝트 없음) 적절한 empty state
 */
import { computed, onMounted, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Mic, FileText, Layers, Code2, ShieldCheck, Package,
  ArrowRight, Plus, FolderOpen, CheckCircle2, Circle, Clock,
  Sparkles, Network, ListChecks, NotebookPen, Wand2, Lock, ArrowUpRight,
} from 'lucide-vue-next'
import axios from '@/utils/axios'
import { useHarnessStore, API_BASE } from '@/store/harness'
import { useReposStore } from '@/store/repos'
import { extractRaw, isSpackEmpty, isDddEmpty, isArchitectureEmpty } from '@/utils/designFetch'
import { useProjectReadiness } from '@/composables/useProjectReadiness'
import { fetchMyProjects } from '@/utils/auth'
import OnboardingWelcome from '@/components/home/OnboardingWelcome.vue'

const { t, locale } = useI18n()
const router = useRouter()
const store = useHarnessStore()
const reposStore = useReposStore()
const readiness = useProjectReadiness()

const isAutoSelecting = ref(false)

// 내 프로젝트 리스트 — 데시보드에서 빠르게 전환 가능.
const myProjects = ref([])  // [{ name, owned_at }]
const myTeams = ref([])     // [{ id, name, role, projects: [{ name, ... }] }]
const isLoadingProjects = ref(false)
const loadMyProjects = async () => {
  if (!localStorage.getItem('gayoje_token')) return
  isLoadingProjects.value = true
  try {
    const r = await fetchMyProjects()
    if (r.success && Array.isArray(r.projects)) {
      // owned_at desc 정렬 — 최근 만든 것이 위에.
      myProjects.value = r.projects.slice().sort((a, b) => {
        const ta = a.owned_at ? new Date(a.owned_at).getTime() || 0 : 0
        const tb = b.owned_at ? new Date(b.owned_at).getTime() || 0 : 0
        return tb - ta
      })
    }
    if (r.success && Array.isArray(r.teams)) {
      myTeams.value = r.teams
    }
  } finally {
    isLoadingProjects.value = false
  }
}
const switchProject = (name, teamId = '', teamName = '') => {
  if (!name) return
  // 같은 (이름 + 팀컨텍스트) 면 no-op. 개인/팀 동명 프로젝트 구분.
  if (name === store.projectName && (teamId || '') === (store.activeTeamId || '')) return
  // [Phase F] 프로젝트명 + 팀 컨텍스트를 함께 전환 — 개인 선택 시 팀 컨텍스트 해제.
  store.setProjectContext(name, teamId, teamName)
  // readiness + design 데이터 자동 refetch — watch(projectName) 이 트리거.
}

/** 개인/팀 동명 프로젝트를 정확히 구분해 '현재' 하이라이트. */
const isCurrent = (name, teamId = '') =>
  name === store.projectName && (teamId || '') === (store.activeTeamId || '')
const fmtOwnedAt = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const now = new Date()
    const diffMs = now - d
    const day = 24 * 60 * 60 * 1000
    if (diffMs < day) return t('home.relative.today')
    if (diffMs < 2 * day) return t('home.relative.yesterday')
    if (diffMs < 7 * day) return t('home.relative.days_ago', { n: Math.floor(diffMs / day) })
    const localeCode = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[locale.value] || 'en-US'
    return d.toLocaleDateString(localeCode, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '' }
}

// ─── 설계·인수 단계 실제 데이터 체크 ─────────────────────────────────
// readiness 컴포저블은 meeting/cps/prd 만 추적 — 설계 단계(SPACK/DDD/Arch) 와
// 인수 단계(repo 등록) 는 별도 fetch 가 필요. 데시보드 진행률에만 쓰이는
// 가벼운 보조 state.
const hasSpack = ref(false)
const hasDdd = ref(false)
const hasArch = ref(false)
const hasRepos = ref(false)
const isFetchingExtras = ref(false)

// 설계 단계 '완료' 판정 — 응답 wrapper 가 아니라 실제 콘텐츠로 본다.
// BE 는 SPACK/DDD/Arch 가 비어 있어도 `{ result: [ {apis:[],entities:[],...} ] }`
// 처럼 wrapper 1개를 항상 돌려준다. 따라서 result 배열 길이만 보면(이전 _hasResult)
// 프로젝트만 있으면 design 이 무조건 '완료' 로 잡히는 버그가 났다.
// → Design 페이지(SpackTab 등)와 동일한 isXxxEmpty 기준으로 실제 노드 유무를 확인.
const _hasContent = (resp, isEmpty) => !isEmpty(extractRaw(resp))

const fetchDesignAndRepos = async () => {
  const pn = store.projectName
  if (!pn) {
    hasSpack.value = false; hasDdd.value = false; hasArch.value = false; hasRepos.value = false
    return
  }
  isFetchingExtras.value = true
  const params = { projectName: pn }
  const results = await Promise.allSettled([
    axios.get(`${API_BASE}/getSpack`, { params, timeout: 30000 }),
    axios.get(`${API_BASE}/getDDD`, { params, timeout: 30000 }),
    axios.get(`${API_BASE}/getArchitecture`, { params, timeout: 30000 }),
    reposStore.fetchProjectRepos({ projectName: pn }).catch(() => ({ success: false })),
  ])
  hasSpack.value = results[0].status === 'fulfilled' && _hasContent(results[0].value, isSpackEmpty)
  hasDdd.value = results[1].status === 'fulfilled' && _hasContent(results[1].value, isDddEmpty)
  hasArch.value = results[2].status === 'fulfilled' && _hasContent(results[2].value, isArchitectureEmpty)
  const reposRes = results[3].status === 'fulfilled' ? results[3].value : { success: false }
  hasRepos.value = reposRes.success && Array.isArray(reposRes.repos) && reposRes.repos.length > 0
  isFetchingExtras.value = false
}

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return t('home.greeting.late_night')
  if (h < 12) return t('home.greeting.morning')
  if (h < 18) return t('home.greeting.afternoon')
  return t('home.greeting.evening')
})

const hasProject = computed(() => !!store.projectName)

// ─── 5 단계 진행 상태 ─────────────────────────────────────────────────
// 각 단계는 실제 BE 데이터 존재 여부로 판정. 이전엔 design 을 cps&&prd 로 도출
// 했으나 SPACK/DDD/Arch 가 아직 없는데도 '완료' 로 표시되던 버그 → 실제 API
// 응답 기준으로 수정.
const stageState = computed(() => ({
  meeting: readiness.hasMeetingLogs.value,
  cps: readiness.hasCps.value,
  prd: readiness.hasPrd.value,
  // 설계 — SPACK · DDD · Arch 셋 다 있을 때만 완료. (하나라도 있으면 진행 중)
  design: hasSpack.value && hasDdd.value && hasArch.value,
  designStarted: hasSpack.value || hasDdd.value || hasArch.value,
  // 인수 — repo 등록되어 인수 가능 상태.
  deliver: hasRepos.value,
}))
// ─── 다음 추천 액션 ──────────────────────────────────────────────────
const nextAction = computed(() => {
  if (!hasProject.value) return { label: t('home.next_action.create'), route: '/plan', icon: Plus }
  const s = stageState.value
  if (!s.meeting) return { label: t('home.next_action.meeting'), route: '/plan', icon: Mic }
  if (!s.cps) return { label: t('home.next_action.cps'), route: '/plan?tab=cps', icon: Sparkles }
  if (!s.prd) return { label: t('home.next_action.prd'), route: '/plan?tab=prd', icon: FileText }
  if (!s.design) return { label: t('home.next_action.design'), route: '/design', icon: Layers }
  return { label: t('home.next_action.lint'), route: '/lint', icon: ShieldCheck }
})

// ─── 5 단계 카드 ────────────────────────────────────────────────────
const STEPS = computed(() => {
  const s = stageState.value
  // design 진입 가능 기준 — PRD 완료. design 완료 기준 — SPACK·DDD·Arch 모두 완료.
  const designUnlocked = s.cps && s.prd
  // code/lint 는 design 패키지(spack/ddd/arch 다 완성) 후에야 의미 있음.
  const codeLintUnlocked = s.design
  // deliverables 는 처음부터 진입 가능 — repo 등록은 언제든.
  return [
    { id: 'plan', no: '01', label: t('common.nav.tab_plan'), en: 'Plan', desc: t('home.steps.desc_plan'), icon: Mic, route: '/plan', done: s.meeting && s.cps && s.prd, active: !s.meeting || !s.cps || !s.prd, locked: false },
    { id: 'design', no: '02', label: t('common.nav.tab_design'), en: 'Design', desc: t('home.steps.desc_design'), icon: Layers, route: '/design', done: s.design, active: designUnlocked && !s.design, locked: !designUnlocked },
    { id: 'code', no: '03', label: t('common.nav.tab_code'), en: 'Code', desc: t('home.steps.desc_code'), icon: Code2, route: '/code', done: s.deliver, active: codeLintUnlocked && !s.deliver, locked: !codeLintUnlocked },
    { id: 'lint', no: '04', label: t('common.nav.tab_lint'), en: 'Lint', desc: t('home.steps.desc_lint'), icon: ShieldCheck, route: '/lint', done: false, active: codeLintUnlocked, locked: !codeLintUnlocked },
    { id: 'deliverables', no: '05', label: t('common.nav.tab_deliverables'), en: 'Deliverables', desc: t('home.steps.desc_deliverables'), icon: Package, route: '/deliverables', done: s.deliver, active: s.design && !s.deliver, locked: !s.design },
  ]
})

// 진행률 — PROGRESS 카드. 위 5 단계(Plan~Deliverables) 워크플로우와 동일한 기준으로
// 카운팅하여 카드와 하단 '5 단계 바로가기'가 항상 일치하도록 STEPS 에서 직접 도출.
const progressPct = computed(() => {
  const done = STEPS.value.filter(s => s.done && !s.locked).length
  return Math.round((done / STEPS.value.length) * 100)
})

// ─── 강점 발견 카드 (하단 "이런 것도 할 수 있어요") ─────────────────────
// 5단계 흐름엔 안 드러나는 숨은 강점을 발견시키는 자리. 진행률·다음액션과 중복되지
// 않도록 "각 단계 속 심화 기능"만 노출. 잠금/활성은 home 이 이미 가진 stageState·
// hasArch 로만 판정(추가 fetch 없음) → A(발견)+B(현재 프로젝트 맥락) 동시 충족.
const STRENGTHS = computed(() => {
  const s = stageState.value
  return [
    { id: 'graph', icon: Network, title: t('home.strengths.graph_title'), desc: t('home.strengths.graph_desc'), route: '/design', unlocked: hasArch.value, act: t('home.strengths.act_view'), lock: t('home.strengths.lock_after_design') },
    { id: 'lint', icon: ListChecks, title: t('home.strengths.lint_title'), desc: t('home.strengths.lint_desc'), route: '/lint', unlocked: s.design, act: t('home.strengths.act_check'), lock: t('home.strengths.lock_after_design_done') },
    { id: 'obsidian', icon: NotebookPen, title: t('home.strengths.obsidian_title'), desc: t('home.strengths.obsidian_desc'), route: '/deliverables', unlocked: s.prd, act: t('home.strengths.act_export'), lock: t('home.strengths.lock_after_prd') },
    { id: 'rule', icon: Wand2, title: t('home.strengths.rule_title'), desc: t('home.strengths.rule_desc'), route: '/plan?tab=eslint', unlocked: s.prd, act: t('home.strengths.act_make'), lock: t('home.strengths.lock_after_prd') },
  ]
})
const goStrength = (item) => { if (item.unlocked) router.push(item.route) }

const goCreate = () => router.push('/plan')

// ─── 새 팀 프로젝트 생성 ──────────────────────────────────────────────
// [중요] 신규 프로젝트 이름은 보통 ProjectLookup '+ 신규' 로 입력하지만, 그 경로는
// store.setProjectName 을 호출해 팀 컨텍스트를 의도적으로 해제한다(개인 호출 누수 방지).
// 따라서 팀 프로젝트는 이름을 먼저 받아 setProjectContext(name, teamId, teamName) 로
// 프로젝트명 + 팀 컨텍스트를 원자적으로 함께 설정한 뒤 /plan 으로 이동한다.
const showTeamProjectDialog = ref(false)
const teamProjectName = ref('')
const pendingTeam = ref(null)
const teamProjectError = ref('')
const openTeamProjectDialog = (team) => {
  pendingTeam.value = team
  teamProjectName.value = ''
  teamProjectError.value = ''
  showTeamProjectDialog.value = true
}
const confirmCreateTeamProject = () => {
  const team = pendingTeam.value
  if (!team) return
  const name = (teamProjectName.value || '').trim()
  if (!name) { teamProjectError.value = t('home.team_dialog.err_empty') ; return }
  if (name.includes('::')) { teamProjectError.value = t('home.team_dialog.err_invalid_char') ; return }
  // 프로젝트명 + 팀 컨텍스트를 원자적으로 설정 — 기존 이름이면 자연히 그 프로젝트로 전환,
  // 신규 이름이면 /plan 에서 미팅 로그 저장 시 팀 프로젝트로 정식 등록(team_id 자동 첨부).
  store.setProjectContext(name, team.id, team.name)
  showTeamProjectDialog.value = false
  router.push('/plan')
}
// [2026-05] 샘플로 바로 체험 — 샘플 프로젝트를 잡고 /plan?sample=1 로 이동하면
// 에디터에 샘플 회의록이 미리 채워져 저장만 누르면 첫 결과물을 볼 수 있다.
// [2026-06-01] 실수 클릭 방지 — 이미 프로젝트가 있는 사용자는 한 번 확인 후 진행.
// 신규 사용자(프로젝트 0개)는 마찰 없이 바로 진입(온보딩 목적 그대로 유지).
const showSampleConfirm = ref(false)
const goSample = () => {
  if (myProjects.value.length > 0) {
    showSampleConfirm.value = true
    return
  }
  startSample()
}
const startSample = () => {
  showSampleConfirm.value = false
  store.setProjectName('샘플 프로젝트')
  router.push({ path: '/plan', query: { sample: '1' } })
}
const goNext = () => router.push(nextAction.value.route)
const goStep = (s) => { if (!s.locked) router.push(s.route) }

// [2026-05] 데시보드 진입 시 마지막 작업 프로젝트 자동 선택.
//   1순위: store.projectName (이전 세션에서 선택했던 것 — persisted by project store)
//   2순위: BE 의 /auth/me/projects 응답 중 owned_at 가장 최근 프로젝트
//   사용자: "마지막으로 작업했던 프로젝트를 자동으로 여기 보여 줬으면 해"
const autoSelectLastProject = async () => {
  if (!localStorage.getItem('gayoje_token')) return  // 미로그인
  isAutoSelecting.value = true
  try {
    const r = await fetchMyProjects()
    if (!r.success || !Array.isArray(r.projects)) return

    // BE에 없다고 해서 지우지 않음 — 신규 프로젝트(아직 미등록)도 지워지는 문제 방지.
    // 실제 삭제는 deleteProject 플로우가 명시적으로 setProjectName('') 호출.
    if (store.projectName) return  // 현재 선택이 있으면 그대로
    if (r.projects.length === 0) return
    // owned_at desc — 가장 최근 소유 프로젝트 (BE 가 보내는 timestamp 기준).
    // 정렬 안정성을 위해 timestamp parse 실패 시 0.
    const sorted = r.projects.slice().sort((a, b) => {
      const ta = a.owned_at ? new Date(a.owned_at).getTime() || 0 : 0
      const tb = b.owned_at ? new Date(b.owned_at).getTime() || 0 : 0
      return tb - ta
    })
    if (sorted[0]?.name) store.setProjectName(sorted[0].name)
  } finally {
    isAutoSelecting.value = false
  }
}

onMounted(async () => {
  await autoSelectLastProject()
  readiness.check()
  fetchDesignAndRepos()
  loadMyProjects()
})
watch(() => store.projectName, () => {
  readiness.check(true)
  fetchDesignAndRepos()
})
</script>

<template>
  <div class="dash-root custom-scroll">
    <div class="dash-container">
      <!-- ═══════ ONBOARDING (first-run, dismissible) ═══════ -->
      <OnboardingWelcome @start="goCreate" @try-sample="goSample" />

      <!-- 샘플 체험 확인 — 이미 프로젝트가 있는 사용자의 실수 클릭 방지 -->
      <VDialog v-model="showSampleConfirm" max-width="460">
        <div class="sample-confirm">
          <div class="sample-confirm__icon"><Sparkles :size="22" /></div>
          <h3 class="sample-confirm__title">{{ $t('home.sample_confirm.title') }}</h3>
          <p class="sample-confirm__body" v-html="$t('home.sample_confirm.body', { count: myProjects.length })"></p>
          <p class="sample-confirm__note">{{ $t('home.sample_confirm.note') }}</p>
          <div class="sample-confirm__actions">
            <button type="button" class="sample-confirm__cancel" @click="showSampleConfirm = false">
              {{ $t('common.action.cancel') }}
            </button>
            <button type="button" class="sample-confirm__go" @click="startSample">
              <Sparkles :size="14" class="mr-1" />
              {{ $t('home.sample_confirm.go') }}
            </button>
          </div>
        </div>
      </VDialog>

      <!-- 새 팀 프로젝트 — 이름 입력 (setProjectContext 로 팀 컨텍스트 함께 설정) -->
      <VDialog v-model="showTeamProjectDialog" max-width="440">
        <div class="team-proj-dialog">
          <div class="team-proj-dialog__icon"><FolderOpen :size="20" /></div>
          <h3 class="team-proj-dialog__title">{{ $t('home.team_dialog.title') }}</h3>
          <p class="team-proj-dialog__sub" v-if="pendingTeam" v-html="$t('home.team_dialog.sub', { name: pendingTeam.name })"></p>
          <input
            v-model="teamProjectName"
            type="text"
            class="team-proj-dialog__input"
            :placeholder="$t('home.team_dialog.placeholder')"
            maxlength="80"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="confirmCreateTeamProject"
            @input="teamProjectError = ''"
          />
          <p v-if="teamProjectError" class="team-proj-dialog__err">{{ teamProjectError }}</p>
          <p class="team-proj-dialog__note">{{ $t('home.team_dialog.note') }}</p>
          <div class="team-proj-dialog__actions">
            <button type="button" class="team-proj-dialog__cancel" @click="showTeamProjectDialog = false">
              {{ $t('common.action.cancel') }}
            </button>
            <button type="button" class="team-proj-dialog__go" @click="confirmCreateTeamProject">
              <Plus :size="14" class="mr-1" />
              {{ $t('home.team_dialog.go') }}
            </button>
          </div>
        </div>
      </VDialog>

      <!-- ═══════ HEADER ═══════ -->
      <header class="dash-header">
        <div class="dash-greet">
          <span class="dash-eyebrow mono">DASHBOARD</span>
          <h1 class="dash-title">
            {{ greeting }}
          </h1>
          <p class="dash-sub">
            <template v-if="hasProject">
              <FolderOpen :size="14" class="mr-1" />
              {{ $t('home.header.current_project') }} <strong>{{ store.projectName }}</strong>
            </template>
            <template v-else>{{ $t('home.header.no_project') }}</template>
          </p>
        </div>

        <button class="dash-next-cta" type="button" @click="goNext">
          <component :is="nextAction.icon" :size="16" class="mr-2" />
          <span>{{ nextAction.label }}</span>
          <ArrowRight :size="14" class="ml-2" />
        </button>
      </header>

      <!-- ═══════ PROGRESS ═══════ -->
      <section v-if="hasProject" class="dash-progress-card">
        <div class="dash-progress-head">
          <div>
            <span class="dash-progress-label mono">PROGRESS</span>
          </div>
          <div class="dash-progress-pct">
            <span class="dash-progress-num">{{ progressPct }}</span>
            <span class="dash-progress-unit">%</span>
          </div>
        </div>
        <div class="dash-progress-bar" role="progressbar" :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100">
          <span class="dash-progress-fill" :style="{ width: progressPct + '%' }"></span>
        </div>
        <div class="dash-progress-steps mono">
          <span v-for="step in STEPS" :key="step.id" :class="{ done: step.done && !step.locked }">{{ step.label }} {{ (step.done && !step.locked) ? '✓' : '·' }}</span>
        </div>
      </section>

      <!-- 자동 선택 진행 중 — 풍부한 안내 + 즉시 진입 가능 대안.
           네트워크 느림 / 신규 사용자 케이스에서 답답함 해소. -->
      <section v-else-if="isAutoSelecting" class="dash-loading-card">
        <Clock :size="22" class="dash-loading-icon" />
        <div class="dash-loading-body">
          <p class="dash-loading-text">{{ $t('home.loading.text') }}</p>
          <p class="dash-loading-sub" v-html="$t('home.loading.sub')"></p>
        </div>
        <button class="dash-loading-skip" type="button" @click="goCreate">
          <Plus :size="13" class="mr-1" />
          {{ $t('home.loading.skip') }}
        </button>
      </section>

      <!-- ═══════ NO PROJECT EMPTY STATE — 자동 선택까지 했는데도 없음 ═══════ -->
      <section v-else class="dash-empty-card">
        <Plus :size="40" class="dash-empty-icon" />
        <h2 class="dash-empty-title">{{ $t('home.empty.title') }}</h2>
        <p class="dash-empty-desc" v-html="$t('home.empty.desc')"></p>
        <button class="dash-empty-cta" type="button" @click="goCreate">
          <Mic :size="16" class="mr-2" />
          <span>{{ $t('home.empty.cta') }}</span>
          <ArrowRight :size="14" class="ml-2" />
        </button>
        <button class="dash-empty-sample" type="button" @click="goSample">
          <Sparkles :size="14" class="mr-1" />
          <span>{{ $t('home.empty.sample') }}</span>
        </button>
      </section>

      <!-- ═══════ 내 프로젝트 리스트 ═══════ -->
      <section class="dash-projects" v-if="myProjects.length > 0 || isLoadingProjects">
        <header class="dash-section-head dash-section-head--row">
          <div>
            <span class="dash-eyebrow mono">MY PROJECTS</span>
            <h2 class="dash-section-title">{{ $t('home.projects.title') }} <span class="dash-projects-count mono">{{ myProjects.length }}</span></h2>
          </div>
          <button class="dash-projects-add" type="button" @click="goCreate">
            <Plus :size="14" class="mr-1" />
            {{ $t('home.projects.add') }}
          </button>
        </header>

        <div v-if="isLoadingProjects && myProjects.length === 0" class="dash-projects-loading mono">
          <Clock :size="14" class="dash-loading-icon" />
          {{ $t('common.label.loading') }}
        </div>

        <div v-else class="dash-projects-grid">
          <article
            v-for="p in myProjects"
            :key="p.name"
            class="dash-project-card"
            :class="{ 'dash-project-card--current': isCurrent(p.name) }"
            role="button"
            tabindex="0"
            :aria-label="$t('home.projects.switch_aria', { name: p.name })"
            @click="switchProject(p.name)"
            @keydown.enter.prevent="switchProject(p.name)"
            @keydown.space.prevent="switchProject(p.name)"
          >
            <div class="dash-project-card-head">
              <FolderOpen :size="14" class="dash-project-icon" />
              <span v-if="isCurrent(p.name)" class="dash-project-current-pill mono">{{ $t('home.projects.current') }}</span>
            </div>
            <h3 class="dash-project-name">{{ p.name }}</h3>
            <p class="dash-project-meta mono">
              <span v-if="p.owned_at">{{ fmtOwnedAt(p.owned_at) }}</span>
              <span v-else>—</span>
            </p>
          </article>
        </div>
      </section>

      <!-- ═══════ 팀 프로젝트 리스트 ═══════ -->
      <template v-for="team in myTeams" :key="team.id">
        <section class="dash-projects">
          <header class="dash-section-head dash-section-head--row">
            <div>
              <span class="dash-eyebrow mono">TEAM · {{ team.name.toUpperCase() }}</span>
              <h2 class="dash-section-title">
                {{ team.name }}
                <span class="dash-projects-count mono">{{ team.projects.length }}</span>
              </h2>
            </div>
            <button class="dash-projects-add" type="button" @click="openTeamProjectDialog(team)">
              <Plus :size="14" class="mr-1" />
              {{ $t('home.team.add') }}
            </button>
          </header>
          <div v-if="team.projects.length > 0" class="dash-projects-grid">
            <article
              v-for="p in team.projects"
              :key="p.id || p.name"
              class="dash-project-card"
              :class="{ 'dash-project-card--current': isCurrent(p.name, team.id) }"
              role="button"
              tabindex="0"
              :aria-label="$t('home.team.switch_aria', { name: p.name })"
              @click="switchProject(p.name, team.id, team.name)"
              @keydown.enter.prevent="switchProject(p.name, team.id, team.name)"
              @keydown.space.prevent="switchProject(p.name, team.id, team.name)"
            >
              <div class="dash-project-card-head">
                <FolderOpen :size="14" class="dash-project-icon" />
                <span v-if="isCurrent(p.name, team.id)" class="dash-project-current-pill mono">{{ $t('home.projects.current') }}</span>
              </div>
              <h3 class="dash-project-name">{{ p.name }}</h3>
              <p class="dash-project-meta mono">
                <span v-if="p.created_at">{{ fmtOwnedAt(p.created_at) }}</span>
                <span v-else>—</span>
              </p>
            </article>
          </div>
          <div v-else class="dash-team-empty">
            <p class="dash-team-empty-text">{{ $t('home.team.empty_text') }}</p>
            <button class="dash-team-empty-cta" type="button" @click="openTeamProjectDialog(team)">
              <Plus :size="13" class="mr-1" />
              {{ $t('home.team.empty_cta', { name: team.name }) }}
            </button>
          </div>
        </section>
      </template>

      <!-- ═══════ 5 STEPS GRID ═══════ -->
      <section class="dash-steps">
        <header class="dash-section-head">
          <span class="dash-eyebrow mono">WORKFLOW</span>
          <h2 class="dash-section-title">{{ $t('home.steps.title') }}</h2>
        </header>
        <div class="dash-steps-grid">
          <article
            v-for="s in STEPS"
            :key="s.id"
            class="dash-step-card"
            :class="{
              'dash-step-card--locked': s.locked,
              'dash-step-card--active': s.active && !s.locked,
              'dash-step-card--done': s.done && !s.locked,
            }"
            :role="!s.locked ? 'button' : undefined"
            :tabindex="!s.locked ? 0 : -1"
            @click="goStep(s)"
            @keydown.enter.prevent="goStep(s)"
          >
            <div class="dash-step-top">
              <span class="dash-step-no mono">{{ s.no }}</span>
              <span class="dash-step-status">
                <CheckCircle2 v-if="s.done && !s.locked" :size="14" class="dash-step-icon-done" />
                <Clock v-else-if="s.active" :size="14" class="dash-step-icon-active" />
                <Circle v-else :size="14" class="dash-step-icon-locked" />
              </span>
            </div>
            <div class="dash-step-icon-wrap">
              <component :is="s.icon" :size="22" />
            </div>
            <h3 class="dash-step-name">
              {{ s.label }}
              <span v-if="locale !== 'en'" class="dash-step-en mono">{{ s.en }}</span>
            </h3>
            <p class="dash-step-desc">{{ s.desc }}</p>
            <div class="dash-step-foot mono">
              <span v-if="s.locked">{{ $t('home.steps.foot_locked') }}</span>
              <span v-else-if="s.done">{{ $t('home.steps.foot_done') }}</span>
              <span v-else>{{ $t('home.steps.foot_start') }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- ═══════ STRENGTHS — "이런 것도 할 수 있어요" (5단계 속 숨은 강점 발견) ═══════ -->
      <section class="dash-strengths">
        <header class="dash-section-head">
          <span class="dash-eyebrow mono">MORE</span>
          <h2 class="dash-section-title">{{ $t('home.strengths.title') }}</h2>
          <p class="dash-strengths-sub">{{ $t('home.strengths.sub') }}</p>
        </header>
        <div class="dash-strengths-grid">
          <article
            v-for="item in STRENGTHS"
            :key="item.id"
            class="dash-strength-card"
            :class="{ 'dash-strength-card--locked': !item.unlocked }"
            :role="item.unlocked ? 'button' : undefined"
            :tabindex="item.unlocked ? 0 : -1"
            @click="goStrength(item)"
            @keydown.enter.prevent="goStrength(item)"
          >
            <div class="dash-strength-icon"><component :is="item.icon" :size="20" /></div>
            <h3 class="dash-strength-title">{{ item.title }}</h3>
            <p class="dash-strength-desc">{{ item.desc }}</p>
            <div class="dash-strength-foot mono" :class="{ 'is-on': item.unlocked }">
              <component :is="item.unlocked ? ArrowUpRight : Lock" :size="13" class="mr-1" />
              {{ item.unlocked ? item.act : item.lock }}
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dash-root {
  height: 100%;
  overflow-y: auto;
  scroll-behavior: smooth;
  background: var(--bg-page, #FCFAEE);
}
.dash-root :deep(*) { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }
.dash-root .mono { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }

.dash-container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 36px 32px 80px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ═══════ HEADER ═══════ */
.dash-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 24px; flex-wrap: wrap;
}
.dash-greet { flex: 1; min-width: 280px; }
.dash-eyebrow {
  display: inline-block;
  font-size: 0.62rem; font-weight: 800;
  letter-spacing: 0.02em; text-transform: uppercase;
  color: var(--accent, #8C6239);
  margin-bottom: 8px;
}
.dash-title {
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  font-weight: 800;
  letter-spacing: -0.028em;
  color: var(--text-main, #2A2421);
  margin: 0 0 8px;
  line-height: 1.2;
}
.dash-title em {
  font-style: normal;
  color: var(--accent, #8C6239);
}
.dash-sub {
  font-size: 0.96rem;
  color: var(--text-muted, #6F665F);
  margin: 0;
  display: inline-flex; align-items: center;
}
.dash-sub strong {
  font-weight: 800; color: var(--text-main, #2A2421);
  margin-left: 4px;
}

.dash-next-cta {
  display: inline-flex; align-items: center;
  padding: 13px 22px;
  border-radius: 9999px;
  background: var(--text-main, #2A2421);
  color: white;
  border: none;
  font-family: inherit;
  font-size: 0.84rem; font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: all .2s cubic-bezier(.16,1,.3,1);
  box-shadow: 0 8px 22px -8px rgba(42, 36, 33, 0.3);
  flex-shrink: 0;
}
.dash-next-cta:hover {
  background: #000;
  transform: translateY(-2px);
  box-shadow: 0 14px 32px -8px rgba(42, 36, 33, 0.4);
}

/* ═══════ PROGRESS CARD ═══════ */
.dash-progress-card {
  background: white;
  border: 1px solid rgba(140, 98, 57, 0.1);
  border-radius: 20px;
  padding: 28px 30px;
  box-shadow: 0 4px 16px -8px rgba(140, 98, 57, 0.1);
}
.dash-progress-head {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 18px;
}
.dash-progress-label {
  display: block;
  font-size: 0.6rem; font-weight: 800;
  letter-spacing: 0.02em; text-transform: uppercase;
  color: var(--accent, #8C6239);
  margin-bottom: 6px;
}
.dash-progress-pct {
  display: inline-flex; align-items: baseline;
  font-weight: 900;
  letter-spacing: -0.04em;
}
.dash-progress-num {
  font-size: 2.4rem;
  color: var(--accent, #8C6239);
  font-variant-numeric: tabular-nums;
}
.dash-progress-unit {
  font-size: 1rem;
  color: var(--text-muted, #6F665F);
  margin-left: 2px;
}
.dash-progress-bar {
  height: 8px;
  background: rgba(140, 98, 57, 0.1);
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 14px;
}
.dash-progress-fill {
  display: block; height: 100%;
  background: linear-gradient(90deg, var(--accent, #8C6239), var(--primary-moss, #2E4036));
  border-radius: 9999px;
  transition: width .5s cubic-bezier(.16,1,.3,1);
}
.dash-progress-steps {
  display: flex; flex-wrap: wrap; gap: 14px;
  font-size: 0.7rem;
  color: var(--text-dim, #A89B91);
  letter-spacing: 0.04em;
}
.dash-progress-steps .done { color: var(--accent, #8C6239); font-weight: 700; }

/* 자동 선택 로딩 카드 — [2026-05-19] 텍스트 + 대안 액션 추가 */
.dash-loading-card {
  background: white;
  border: 1px solid rgba(140, 98, 57, 0.1);
  border-radius: 20px;
  padding: 22px 26px;
  display: flex; align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.dash-loading-icon {
  color: var(--accent, #8C6239);
  animation: dash-spin 1.4s linear infinite;
  flex-shrink: 0;
}
@keyframes dash-spin { to { transform: rotate(360deg); } }
.dash-loading-body {
  flex: 1;
  min-width: 0;
}
.dash-loading-text {
  font-size: 0.94rem;
  color: var(--text-main, #2A2421);
  margin: 0;
  font-weight: 700;
}
.dash-loading-sub {
  font-size: 0.78rem;
  color: var(--text-muted, #6F665F);
  margin: 4px 0 0;
  line-height: 1.55;
}
.dash-loading-sub strong { color: var(--accent, #8C6239); font-weight: 700; }
.dash-loading-skip {
  display: inline-flex; align-items: center;
  padding: 8px 14px;
  background: white;
  color: var(--accent, #8C6239);
  border: 1.5px solid rgba(140, 98, 57, 0.25);
  border-radius: 9px;
  font-family: inherit;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s;
}
.dash-loading-skip:hover {
  background: var(--accent, #8C6239);
  color: white;
  border-color: var(--accent, #8C6239);
}
@media (max-width: 600px) {
  .dash-loading-card { padding: 16px 18px; }
  .dash-loading-skip { width: 100%; justify-content: center; }
}

/* ═══════ EMPTY STATE CARD ═══════ */
.dash-empty-card {
  background: white;
  border: 1px dashed rgba(140, 98, 57, 0.25);
  border-radius: 20px;
  padding: 48px 32px;
  text-align: center;
  display: flex; flex-direction: column; align-items: center;
  gap: 14px;
}
.dash-empty-icon {
  width: 64px; height: 64px;
  padding: 18px;
  background: rgba(140, 98, 57, 0.08);
  color: var(--accent, #8C6239);
  border-radius: 50%;
  margin-bottom: 4px;
}
.dash-empty-title {
  font-size: 1.6rem; font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-main, #2A2421);
  margin: 0;
}
.dash-empty-desc {
  font-size: 0.96rem;
  line-height: 1.7;
  color: var(--text-muted, #6F665F);
  margin: 0;
  max-width: 480px;
}
.dash-empty-cta {
  display: inline-flex; align-items: center;
  padding: 14px 26px;
  margin-top: 8px;
  background: var(--accent, #8C6239);
  color: white;
  border: none;
  border-radius: 9999px;
  font-family: inherit;
  font-size: 0.86rem; font-weight: 800;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: all .2s cubic-bezier(.16,1,.3,1);
  box-shadow: 0 10px 24px -8px rgba(140, 98, 57, 0.4);
}
.dash-empty-cta:hover {
  background: #6E4E2E;
  transform: translateY(-2px);
  box-shadow: 0 16px 32px -8px rgba(140, 98, 57, 0.55);
}
.dash-empty-sample {
  display: inline-flex; align-items: center;
  margin-top: 10px;
  padding: 9px 18px;
  background: transparent;
  color: var(--accent, #8C6239);
  border: 1px solid rgba(140, 98, 57, 0.28);
  border-radius: 9999px;
  font-family: inherit;
  font-size: 0.82rem; font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: all .2s cubic-bezier(.16,1,.3,1);
}
.dash-empty-sample:hover {
  background: rgba(140, 98, 57, 0.06);
  border-color: rgba(140, 98, 57, 0.45);
}

/* ═══════ 샘플 체험 확인 다이얼로그 ═══════ */
.sample-confirm {
  background: #fff;
  border-radius: 18px;
  padding: 26px 26px 22px;
  text-align: center;
}
.sample-confirm__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 48px; height: 48px; border-radius: 14px;
  background: rgba(140, 98, 57, 0.1); color: var(--accent, #8C6239);
  margin-bottom: 14px;
}
.sample-confirm__title {
  font-size: 1.15rem; font-weight: 800; letter-spacing: -0.02em;
  color: var(--text-main, #2A2421); margin: 0 0 10px;
}
.sample-confirm__body {
  font-size: 0.9rem; line-height: 1.7; color: var(--text-muted, #6F665F);
  margin: 0 0 8px; word-break: keep-all;
}
.sample-confirm__body strong { color: var(--accent, #8C6239); font-weight: 700; }
.sample-confirm__note {
  font-size: 0.78rem; color: var(--text-dim, #A89B91); margin: 0 0 20px;
}
.sample-confirm__actions {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
}
.sample-confirm__cancel,
.sample-confirm__go {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 11px 22px; border-radius: 9999px;
  font-family: inherit; font-size: 0.86rem; font-weight: 800;
  cursor: pointer; transition: all .18s cubic-bezier(.16,1,.3,1);
}
.sample-confirm__cancel {
  background: #fff; color: var(--text-muted, #6F665F);
  border: 1.5px solid rgba(0, 0, 0, 0.12);
}
.sample-confirm__cancel:hover { background: rgba(0, 0, 0, 0.04); }
.sample-confirm__go {
  background: var(--accent, #8C6239); color: #fff; border: none;
  box-shadow: 0 8px 20px -8px rgba(140, 98, 57, 0.4);
}
.sample-confirm__go:hover { background: #6E4E2E; transform: translateY(-1px); }
@media (max-width: 480px) {
  .sample-confirm__cancel, .sample-confirm__go { width: 100%; }
}

/* ═══════ 새 팀 프로젝트 다이얼로그 ═══════ */
.team-proj-dialog {
  background: #fff;
  border-radius: 18px;
  padding: 26px 26px 22px;
  text-align: center;
}
.team-proj-dialog__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 48px; height: 48px; border-radius: 14px;
  background: rgba(140, 98, 57, 0.1); color: var(--accent, #8C6239);
  margin-bottom: 14px;
}
.team-proj-dialog__title {
  font-size: 1.15rem; font-weight: 800; letter-spacing: -0.02em;
  color: var(--text-main, #2A2421); margin: 0 0 8px;
}
.team-proj-dialog__sub {
  font-size: 0.86rem; color: var(--text-muted, #6F665F); margin: 0 0 16px;
}
.team-proj-dialog__sub strong { color: var(--accent, #8C6239); font-weight: 800; }
.team-proj-dialog__input {
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid rgba(140, 98, 57, 0.25);
  border-radius: 10px;
  font-family: inherit; font-size: 0.92rem; font-weight: 600;
  color: var(--text-main, #2A2421);
  background: #fff;
  outline: none;
  transition: border-color .15s;
  box-sizing: border-box;
}
.team-proj-dialog__input:focus { border-color: var(--accent, #8C6239); }
.team-proj-dialog__err {
  font-size: 0.76rem; color: #C0392B; margin: 8px 0 0; text-align: left;
}
.team-proj-dialog__note {
  font-size: 0.76rem; line-height: 1.6; color: var(--text-dim, #A89B91);
  margin: 12px 0 18px; text-align: left; word-break: keep-all;
}
.team-proj-dialog__actions {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
}
.team-proj-dialog__cancel,
.team-proj-dialog__go {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 11px 20px; border-radius: 9999px;
  font-family: inherit; font-size: 0.84rem; font-weight: 800;
  cursor: pointer; transition: all .18s cubic-bezier(.16,1,.3,1);
}
.team-proj-dialog__cancel {
  background: #fff; color: var(--text-muted, #6F665F);
  border: 1.5px solid rgba(0, 0, 0, 0.12);
}
.team-proj-dialog__cancel:hover { background: rgba(0, 0, 0, 0.04); }
.team-proj-dialog__go {
  background: var(--accent, #8C6239); color: #fff; border: none;
  box-shadow: 0 8px 20px -8px rgba(140, 98, 57, 0.4);
}
.team-proj-dialog__go:hover { background: #6E4E2E; transform: translateY(-1px); }
@media (max-width: 480px) {
  .team-proj-dialog__cancel, .team-proj-dialog__go { width: 100%; }
}

/* ═══════ SECTION HEAD ═══════ */
.dash-section-head { margin-bottom: 16px; }
.dash-section-title {
  font-size: 1.2rem; font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-main, #2A2421);
  margin: 0;
}

/* ═══════ MY PROJECTS ═══════ */
.dash-section-head--row { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.dash-projects-count {
  display: inline-block; margin-left: 6px;
  padding: 2px 9px; border-radius: 9999px;
  background: rgba(140, 98, 57, 0.1);
  color: var(--accent, #8C6239);
  font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.04em;
  vertical-align: middle;
}
.dash-projects-add {
  display: inline-flex; align-items: center;
  padding: 7px 14px; border-radius: 9999px;
  background: white; color: var(--text-main, #2A2421);
  border: 1px solid rgba(140, 98, 57, 0.18);
  font-family: inherit; font-size: 0.74rem; font-weight: 700;
  cursor: pointer;
  transition: all .18s cubic-bezier(.16,1,.3,1);
}
.dash-projects-add:hover {
  background: var(--accent, #8C6239); color: white;
  border-color: var(--accent, #8C6239);
}
.dash-projects-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 16px; font-size: 0.78rem; color: var(--text-muted, #6F665F);
}
.dash-projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.dash-project-card {
  background: white;
  border: 1px solid rgba(140, 98, 57, 0.1);
  border-radius: 14px;
  padding: 16px 18px;
  cursor: pointer;
  transition: all .2s cubic-bezier(.16,1,.3,1);
}
.dash-project-card:hover,
.dash-project-card:focus-visible {
  border-color: var(--accent, #8C6239);
  transform: translateY(-2px);
  box-shadow: 0 10px 22px -10px rgba(140, 98, 57, 0.25);
}
/* 전역 [role=button]:focus-visible 윤곽선과 합쳐져 키보드 사용자도
   마우스 hover 와 동일한 lift 피드백을 받게 — 시각/촉각 평형. */
.dash-project-card:focus-visible { outline-offset: 3px; }
.dash-project-card--current {
  border-color: var(--accent, #8C6239);
  background: linear-gradient(135deg, white 0%, rgba(140, 98, 57, 0.04) 100%);
  box-shadow: 0 6px 16px -8px rgba(140, 98, 57, 0.2);
}
.dash-project-card-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.dash-project-icon { color: var(--accent, #8C6239); }
.dash-project-current-pill {
  padding: 2px 8px; border-radius: 9999px;
  background: var(--accent, #8C6239); color: white;
  font-size: 0.58rem; font-weight: 800;
  letter-spacing: 0.06em;
}
.dash-project-name {
  font-size: 0.96rem; font-weight: 800;
  letter-spacing: -0.018em;
  color: var(--text-main, #2A2421);
  margin: 0 0 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dash-project-meta {
  font-size: 0.66rem; color: var(--text-muted, #6F665F);
  margin: 0;
  letter-spacing: 0.04em;
}

/* ═══════ TEAM EMPTY STATE ═══════ */
.dash-team-empty {
  padding: 20px 24px;
  background: rgba(140, 98, 57, 0.03);
  border: 1px dashed rgba(140, 98, 57, 0.2);
  border-radius: 14px;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.dash-team-empty-text {
  flex: 1; min-width: 0;
  font-size: 0.87rem;
  color: var(--text-muted, #6F665F);
  margin: 0;
}
.dash-team-empty-cta {
  display: inline-flex; align-items: center;
  padding: 8px 16px; border-radius: 9999px;
  background: white; color: var(--accent, #8C6239);
  border: 1.5px solid rgba(140, 98, 57, 0.3);
  font-family: inherit; font-size: 0.76rem; font-weight: 700;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: all .15s;
}
.dash-team-empty-cta:hover {
  background: var(--accent, #8C6239); color: white;
  border-color: var(--accent, #8C6239);
}

/* ═══════ STEPS GRID ═══════ */
.dash-steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.dash-step-card {
  background: white;
  border: 1px solid rgba(140, 98, 57, 0.1);
  border-radius: 18px;
  padding: 22px;
  transition: all .22s cubic-bezier(.16,1,.3,1);
  display: flex; flex-direction: column;
  min-height: 200px;
  cursor: pointer;
}
.dash-step-card:hover:not(.dash-step-card--locked),
.dash-step-card:focus-visible:not(.dash-step-card--locked) {
  border-color: var(--accent, #8C6239);
  transform: translateY(-3px);
  box-shadow: 0 12px 28px -10px rgba(140, 98, 57, 0.25);
}
.dash-step-card:focus-visible { outline-offset: 3px; }
.dash-step-card--locked {
  cursor: not-allowed;
  opacity: 0.55;
}
.dash-step-card--active {
  border-color: rgba(140, 98, 57, 0.3);
  background: linear-gradient(135deg, white 0%, rgba(140, 98, 57, 0.03) 100%);
}
.dash-step-card--done .dash-step-icon-wrap {
  background: rgba(46, 64, 54, 0.08);
  color: var(--primary-moss, #2E4036);
  border-color: rgba(46, 64, 54, 0.2);
}

.dash-step-top {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 14px;
}
.dash-step-no {
  font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text-dim, #A89B91);
}
.dash-step-card--active .dash-step-no,
.dash-step-card--done .dash-step-no { color: var(--accent, #8C6239); }

.dash-step-icon-done { color: var(--primary-moss, #2E4036); }
.dash-step-icon-active { color: var(--accent, #8C6239); }
.dash-step-icon-locked { color: var(--text-dim, #A89B91); }

.dash-step-icon-wrap {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: rgba(140, 98, 57, 0.08);
  border: 1px solid rgba(140, 98, 57, 0.18);
  color: var(--accent, #8C6239);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
}
.dash-step-name {
  font-size: 1rem; font-weight: 800;
  letter-spacing: -0.018em;
  color: var(--text-main, #2A2421);
  margin: 0 0 6px;
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
}
.dash-step-en {
  font-size: 0.6rem; font-weight: 700;
  color: var(--text-dim, #A89B91);
  letter-spacing: 0.06em;
}
.dash-step-desc {
  font-size: 0.82rem;
  line-height: 1.65;
  color: var(--text-muted, #6F665F);
  margin: 0;
  flex: 1;
}
.dash-step-foot {
  margin-top: 16px;
  font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--accent, #8C6239);
  text-transform: uppercase;
}
.dash-step-card--locked .dash-step-foot { color: var(--text-dim, #A89B91); }

/* ═══════ STRENGTHS — 강점 발견 카드 ═══════ */
.dash-strengths-sub {
  font-size: 0.86rem;
  line-height: 1.6;
  color: var(--text-muted, #6F665F);
  margin: 6px 0 0;
}
.dash-strengths-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}
.dash-strength-card {
  background: white;
  border: 1px solid rgba(140, 98, 57, 0.1);
  border-radius: 18px;
  padding: 20px 22px;
  display: flex; flex-direction: column;
  transition: all .22s cubic-bezier(.16,1,.3,1);
  cursor: pointer;
}
.dash-strength-card:hover:not(.dash-strength-card--locked),
.dash-strength-card:focus-visible:not(.dash-strength-card--locked) {
  border-color: var(--accent, #8C6239);
  transform: translateY(-3px);
  box-shadow: 0 12px 28px -10px rgba(140, 98, 57, 0.25);
}
.dash-strength-card:focus-visible { outline-offset: 3px; }
.dash-strength-card--locked { cursor: default; opacity: 0.55; }
.dash-strength-icon {
  width: 40px; height: 40px;
  border-radius: 11px;
  background: rgba(140, 98, 57, 0.08);
  border: 1px solid rgba(140, 98, 57, 0.18);
  color: var(--accent, #8C6239);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
}
.dash-strength-title {
  font-size: 1rem; font-weight: 800;
  letter-spacing: -0.018em;
  color: var(--text-main, #2A2421);
  margin: 0 0 6px;
}
.dash-strength-desc {
  font-size: 0.82rem;
  line-height: 1.65;
  color: var(--text-muted, #6F665F);
  margin: 0;
  flex: 1;
}
.dash-strength-foot {
  display: inline-flex; align-items: center;
  margin-top: 16px;
  font-size: 0.68rem; font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--text-dim, #A89B91);
}
.dash-strength-foot.is-on { color: var(--accent, #8C6239); }

@media (max-width: 768px) {
  .dash-container { padding: 24px 16px 60px; }
  .dash-header { flex-direction: column; align-items: stretch; }
  .dash-next-cta { width: 100%; justify-content: center; }
  .dash-progress-card, .dash-empty-card { padding: 24px 20px; }
  .dash-progress-head { flex-direction: column; align-items: flex-start; gap: 8px; }
  .dash-step-card { min-height: 180px; padding: 18px 20px; }
}
</style>
