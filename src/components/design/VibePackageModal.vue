<script setup>
/**
 * VibePackageModal.vue — 바이브 코딩 시작 패키지 다운로드 모달 (2026-06-13 추출).
 *
 * [배경] 모달·생성 로직이 ArchitectureTab 내부에 있어, 전역 CTA 가 어느 탭에서
 * 눌려도 Architecture 탭으로 강제 전환해야 열 수 있었다 ("굳이 Architecture 에서만
 * 받게 한다" 피드백). 패키지 생성은 전부 API 호출(큐 createMD + 스킬 조회)이라
 * 탭 데이터 의존이 없음 → 페이지 레벨 컴포넌트로 분리, SPACK/DDD 어디서든 탭 전환
 * 없이 바로 받는다.
 *
 * [설계 존재 게이트] 이전 archRef.hasArchData 게이트 대체 — 모달이 열릴 때
 * getArchitecture 1회로 확인, 없으면 다운로드 비활성 + '최신 업데이트' 안내.
 * 확인 실패(null)는 막지 않음 — 생성 단계의 EMPTY_SPECS 가드가 후방 방어.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, FileText, Sparkles, Package, Bot, Download, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-vue-next'
import { useHarnessStore, API_BASE } from '@/store/harness'
import axios from '@/utils/axios'
import { downloadBlob } from '@/utils/download'
import { extractTaskId, pollJobUntilDone } from '@/utils/asyncJob'
import { useSnackbar } from '@/composables/useSnackbar'
import { useEvalScore } from '@/composables/useEvalScore'
import { extractRaw } from '@/utils/designFetch'
import { buildStartGuide, addSkillsToZip, buildAgentBootstrap, AGENT_TOOLS } from '@/utils/designExport'
import { buildImplementationStatus } from '@/utils/agentBundle'
import { MD_DOC_KEYS, parseMdStage, mdSignalBand } from '@/utils/mdProgress'
import VibeNextStepsModal from '@/components/design/VibeNextStepsModal.vue'
import { isInAppBrowser, openInExternalBrowser } from '@/utils/inAppBrowser'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const isOpen = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })

const { showError, showWarning } = useSnackbar()
const { t, locale } = useI18n()
const store = useHarnessStore()

const inAppDownload = isInAppBrowser()
const inAppCopied = ref(false)
const openDownloadInExternal = async () => {
  const url = window.location.href
  if (openInExternalBrowser(url)) return
  try { await navigator.clipboard.writeText(url); inAppCopied.value = true } catch { inAppCopied.value = false }
}

// [2026-06-13] 설계 존재 확인 — null=미확인(안내 미표시·다운로드 허용), true/false.
const hasDesign = ref(null)
const checkDesignExists = async () => {
  if (!store.projectName) { hasDesign.value = false; return }
  try {
    const res = await axios.get(`${API_BASE}/getArchitecture`, {
      params: { projectName: store.projectName },
    })
    const raw = extractRaw(res)
    hasDesign.value = (raw?.services?.length > 0) || (raw?.databases?.length > 0)
  } catch {
    hasDesign.value = null  // 조회 실패 — 막지 않음 (EMPTY_SPECS 가 후방 방어)
  }
}

const isMdLoading = ref(false)
const isPdfLoading = ref(false)
// [2026-06 Option B] 사용자가 쓸 AI 도구 선택 — 0_START_HERE.md 의 사용법이 맞춤 렌더된다.
// 어떤 선택이든 AGENTS.md+CLAUDE.md 는 항상 포함되므로 자동 로드는 늘 동작(잘못 골라도 안전).
const selectedTool = ref('claude')
// [i18n 2026-06-25] label 은 locale 별이라 reactive computed 로 — AGENT_TOOLS 는 autoFile 만 보유.
const agentToolOptions = computed(() => Object.keys(AGENT_TOOLS).map((id) => ({ id, label: t(`design.vibe.tools.${id}.label`) })))

// [2026-05-29] MD 패키지 생성 진행률 — design '최신 업데이트' 패턴 차용.
// 기존엔 버튼 spinner 만이라 "멈춘 듯" 보였음 → 단계 pill + 진행바(%) 로 "지금 어디쯤"
// 시각화.
// [2026-06-03] 경과시간·"약 N분 남음" ETA 표기는 제거 — 추정치일 뿐인데 사용자가
// "그 시간만 기다리면 끝난다" 로 오해하고, 실제론 더 걸리거나 실패할 수 있어 혼란/불신을
// 키웠음. 진행은 % 만으로 표현 (시간 약속 X). elapsed 는 % · 단계 계산 내부용으로만 유지.
// [2026-06 실시간 신호] BE create_md 가 emit_stage 로 실제 구간을 보고하게 됨 —
// 수집 / 문서 생성(병렬 4건, 완료 목록 누적) / 조립 3단계 + 문서별 체크(✓)가 전부
// 실제 이벤트 기반. 165초 한 구간 동안 % 만 기어가 "98% 에서 멈춘 듯" 답답하던 문제
// 해소. elapsed 추정은 구버전 BE(신호 없음) 폴백으로만 유지.
const MD_STAGES = computed(() => [
  { name: t('design.arch.md_stage.collecting.name'), icon: '📋', desc: t('design.arch.md_stage.collecting.desc'), tip: t('design.arch.md_stage.collecting.tip') },
  { name: t('design.arch.md_stage.generating.name'), icon: '🤖', desc: t('design.arch.md_stage.generating.desc'), tip: t('design.arch.md_stage.generating.tip') },
  { name: t('design.arch.md_stage.assembling.name'), icon: '📦', desc: t('design.arch.md_stage.assembling.desc'), tip: t('design.arch.md_stage.assembling.tip') },
])
// elapsed 폴백용 추정 — 수집은 실제 1초 미만이지만 신호 없는 구버전 BE 만 쓰는 값.
const MD_STAGE_DURATIONS = [15, 160, 5]
const MD_TOTAL_ESTIMATE = MD_STAGE_DURATIONS.reduce((a, b) => a + b, 0)
const mdElapsedSec = ref(0)
let mdElapsedTimer = null

// BE stage 신호 (폴링 onProgress 로 갱신) → 파싱. null 이면 elapsed 폴백.
const mdJobStage = ref('')
const mdSignal = computed(() => parseMdStage(mdJobStage.value))

// 누적 구간 기반 폴백 — 단계 수가 바뀌어도 안전 (마지막 단계로 클램프).
const mdCurrentStageIdx = computed(() => {
  if (mdSignal.value) return mdSignal.value.idx
  const e = mdElapsedSec.value
  let acc = 0
  for (let i = 0; i < MD_STAGE_DURATIONS.length; i++) {
    acc += MD_STAGE_DURATIONS[i]
    if (e < acc) return i
  }
  return MD_STAGE_DURATIONS.length - 1
})
const mdCurrentStage = computed(() => MD_STAGES.value[mdCurrentStageIdx.value])

// 문서별 실시간 체크 — 신호가 있고 문서 생성 단계 이후일 때만 (없으면 미표시).
const mdDocs = computed(() => {
  const sig = mdSignal.value
  if (!sig || sig.idx < 1) return null
  return MD_DOC_KEYS.map((k) => ({
    key: k,
    label: t(`design.arch.md_docs.${k}`),
    done: sig.names.includes(k),
  }))
})

// 마지막 1개(통상 SPACK — 4종 중 입력·출력이 가장 커 LLM wall-time 최장)만 남은 채
// 30초 이상 경과하면 안심 힌트 — '이것만 체크가 안 되네? 버그인가?' 불안 방지.
const mdLastDocSlow = computed(() => {
  const sig = mdSignal.value
  if (!sig || sig.idx !== 1 || sig.done !== MD_DOC_KEYS.length - 1) return null
  if (mdElapsedSec.value - _mdBandStartSec.value < 30) return null
  const k = MD_DOC_KEYS.find((key) => !sig.names.includes(key))
  return k ? t(`design.arch.md_docs.${k}`) : null
})

// ─── 진행률 % ────────────────────────────────────────────────
// 신호 기반: 밴드 [floor, ceil] 안에서 시간 점근(지수) — 신호 도착 시 floor 로 점프,
// 신호 사이에도 ceil 을 향해 항상 전진 (plan 페이지 _STAGE_BANDS 패턴).
// 폴백(구버전 BE): 기존 elapsed 선형 + 추정 초과 시 75초당 +1 로 99 까지 기어가기.
const _MD_BAND_TAU_S = 30
const _mdBandStartSec = ref(0)
watch(() => mdSignalBand(mdSignal.value)?.[0], () => { _mdBandStartSec.value = mdElapsedSec.value })

const _mdRawPct = computed(() => {
  const band = mdSignalBand(mdSignal.value)
  if (band) {
    const [floor, ceil] = band
    const inBand = Math.max(0, mdElapsedSec.value - _mdBandStartSec.value)
    const base = floor + (ceil - floor) * (1 - Math.exp(-inBand / _MD_BAND_TAU_S))
    // [2026-06] 밴드 ceil 도달 후 % 가 완전히 멈춰 보이던 문제(실사용: SPACK 장기
    // 생성 중 89% 고정 → "퍼센트가 차지도 않아" 보고) — 120초 초과분부터 60초당
    // +1 초저속 크롤. 다음 신호의 floor(+3 간격)와 겹치지 않게 +2 상한.
    const crawl = Math.min(2, Math.floor(Math.max(0, inBand - 120) / 60))
    return Math.min(99, Math.round(base) + crawl)
  }
  const e = mdElapsedSec.value
  if (e <= 0) return 3
  // 플로어 3 — 시작 직후(e=1~6s) round 가 0~2 를 반환해 3%→0% 로 '역행'하던 결함 방지.
  if (e < MD_TOTAL_ESTIMATE) return Math.max(3, Math.min(94, Math.round((e / MD_TOTAL_ESTIMATE) * 100)))
  return Math.min(99, 95 + Math.floor((e - MD_TOTAL_ESTIMATE) / 75))
})
// 단조 증가 가드 — 신호/폴백 전환·밴드 경계에서 % 가 뒤로 가지 않게 (watcher 분리:
// computed 안에서 ref 변경 금지, MeetingLogEditor 와 동일 패턴).
const _mdMaxPct = ref(0)
watch(_mdRawPct, (v) => { if (v > _mdMaxPct.value) _mdMaxPct.value = v }, { immediate: true })
const mdProgressPct = computed(() => _mdMaxPct.value)

// 추정치 초과 = 평소보다 오래 걸리는 중 — 새로고침 방지 안심 문구 노출 조건.
const mdTakingLong = computed(() => mdElapsedSec.value >= MD_TOTAL_ESTIMATE)
const startMdElapsed = () => {
  mdElapsedSec.value = 0
  mdJobStage.value = ''
  _mdBandStartSec.value = 0
  _mdMaxPct.value = 0
  if (mdElapsedTimer) clearInterval(mdElapsedTimer)
  mdElapsedTimer = setInterval(() => { mdElapsedSec.value++ }, 1000)
}
const stopMdElapsed = () => {
  if (mdElapsedTimer) clearInterval(mdElapsedTimer)
  mdElapsedTimer = null
}
onBeforeUnmount(stopMdElapsed)

// [2026-05-26] createMD 를 v2 비동기 큐 패턴으로 호출. sync route (Caddy 305s
// 안에 LLM × 3 못 끝나면 Network Error) 우회. 응답 정규화: { spack_md, ddd_md,
// arch_md, project_name } 으로 sync 응답과 동일 형태 반환.
//
// [API_BASE 함정] API_BASE = '/api/gateway' (gateway_compat prefix). v2 라우트는
// VITE_API_BASE_URL 사용 필수 — 잘못 prefix 붙이면 _DISPATCH 미등록 → 410.
const _createMdViaQueue = async (project, { signal } = {}) => {
  const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
  const enqueueRes = await axios.post(
    `${v2Base}/api/v2/pipelines/create_md`,
    { project_name: project },
    { timeout: 15_000, signal },  // enqueue 자체는 빠름 (Redis push)
  )
  const taskId = extractTaskId(enqueueRes.data)
  if (!taskId) throw new Error('createMD 작업 등록 실패 — task_id 누락.')
  const info = await pollJobUntilDone(taskId, {
    intervalMs: 2000,
    // [2026-05-29] worker job_timeout 은 실제 1200초(20분). 기존 10분 폴링은
    // worker 가 아직 도는데 FE 가 먼저 포기 → 거짓 실패 토스트 원인이었음.
    // worker 와 동일 20분으로 맞춰 장시간 job(통합 가이드 LLM 포함)도 끝까지 대기.
    maxWaitMs: 20 * 60 * 1000,
    // [2026-06] BE 의 md:* stage 신호 — 3단계/문서별 체크 실시간 표시의 입력.
    onProgress: (i) => { if (i?.stage) mdJobStage.value = i.stage },
  })
  return info?.result || {}
}

const downloadMdFromWebhook = async () => {
  if (!store.projectName || isMdLoading.value || hasDesign.value === false) return
  isMdLoading.value = true
  startMdElapsed()
  try {
    const project = store.projectName

    const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
    // [2026-05-29] MD 생성(수분)과 병렬로 skill 조회 + trigger 자동 채우기.
    // skill 묶음 준비가 MD wall-time 에 흡수돼 추가 대기가 없음.
    const skillsPromise = (async () => {
      // [2026-06] getAllSkillDetail — instructions(규칙 본문)·trigger 포함 전체.
      // 이전엔 getAllSkill(요약)을 써서 zip 의 skills/*.md 에 규칙 본문이 빠져
      // 빈 껍데기가 됐음. 상세 엔드포인트로 받아 규칙이 실제로 담기게 한다.
      const skillRes = await axios.get(`${API_BASE}/getAllSkillDetail`, {
        params: { projectName: project },
      }).catch(() => null)
      const skillRaw = skillRes?.data?.result ?? skillRes?.data ?? []
      let list = (Array.isArray(skillRaw) ? skillRaw : (skillRaw?.skills ?? []))
        .filter(item => item && (item.id || item.ID))
        .map(item => ({
          id: item.id || item.ID || '',
          name: item.name || item.스킬명 || '',
          scope: item.scope || '',
          priority: item.priority || '',
          trigger_condition: item.trigger_condition || '',
          instructions: Array.isArray(item.instructions) ? item.instructions : [],
          tags: Array.isArray(item.tags) ? item.tags : [],
        }))
      // [2026-05-29] trigger 가 빈 skill 은 다운로드 직전에 자동 생성(BE 병렬 LLM).
      // 사용자가 trigger 를 손으로 안 적어도 AI 가 채워 zip 에 포함. BE 미배포/실패
      // 시엔 조용히 건너뛰고 기존(빈) trigger 로 진행 (graceful — 다운로드는 계속).
      const hasEmptyTrigger = list.some(s => !s.trigger_condition || !s.trigger_condition.trim())
      if (list.length > 0 && hasEmptyTrigger) {
        try {
          const fillRes = await axios.post(
            `${v2Base}/api/v2/pipelines/fill_skill_triggers`,
            {
              project_name: project,
              skills: list.map(s => ({
                id: s.id, name: s.name, scope: s.scope,
                trigger_condition: s.trigger_condition,
                instructions: s.instructions, tags: s.tags,
              })),
            },
            { timeout: 120_000 },
          )
          const filled = fillRes?.data?.skills || []
          const tmap = new Map(
            filled
              .filter(f => f.generated && f.trigger_condition)
              .map(f => [f.id, f.trigger_condition]),
          )
          if (tmap.size) {
            list = list.map(s => (tmap.has(s.id) ? { ...s, trigger_condition: tmap.get(s.id) } : s))
          }
        } catch (e) {
          console.warn('skill trigger 자동 채우기 건너뜀:', e?.message || e)
        }
      }
      return list
    })()

    const [mdData, skillList] = await Promise.all([
      _createMdViaQueue(project),
      skillsPromise,
    ])
    // [2026-06] 완료 신호 강제 동기화 — 마지막 문서(통상 SPACK)는 4/4 → assembling →
    // job done 이 폴링 1틱(2초) 안에 몰려, 폴링이 마지막 신호를 놓치면 'SPACK 체크가
    // 끝내 안 된 채 닫혔다'로 보였다. result 수신 = 4종 전부 완료이므로 직접 반영.
    mdJobStage.value = 'md:assembling'

    // [2026-05-26] job result 는 평탄 dict ({ spack_md, ddd_md, arch_md, ... }).
    const data = mdData || {}
    const hasSkills = skillList.length > 0
    const archFiles = [
      { content: data?.spack_md, name: '1_spack.md' },
      { content: data?.ddd_md,   name: '2_ddd.md' },
      { content: data?.arch_md,  name: '3_architecture.md' },
    ]
    const hasAny = archFiles.some(f => f.content)
    // [2026-06] 명세 md(spack/ddd/arch)가 전부 비면 스킬이 있어도 중단 — 이전엔 스킬만
    // 들어 있으면 통과해 '명세 없는 빈 깡통' 패키지가 무경고로 나갔다 (실사용: 스킬
    // 46개+가이드만 든 zip — 에이전트가 Phase 1 부터 읽을 파일이 없어 진행 불가).
    if (!hasAny) throw new Error('EMPTY_SPECS')

    const orchestratorContent = data?.orchestrator_md
    const hasOrch = !!orchestratorContent
    // [P1 — '루프의 시대'] 그래프 기반 전수 대조 체크리스트 (BE 결정적 생성, 없으면 생략).
    const checklistContent = data?.checklist_md
    const hasChecklist = !!checklistContent
    const tool = selectedTool.value

    // [2026-06 #2] 모든 산출물(가이드 + 명세 + 스킬)을 단일 zip 으로 묶어 1회 다운로드.
    // 이전: skills.zip 따로 + MD 4개를 a.click() 으로 연쇄 다운로드 → Chrome 다중
    // 다운로드 차단 / Safari·모바일·인앱브라우저 누락으로 '일부 파일만 받아지는' 문제.
    // 단일 zip 은 모든 환경에서 안정적이다.
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    // [2026-06-19] zip 루트에 파일을 바로 둔다. OS 가 압축 해제 시 zip 이름({project}_vibe)
    // 폴더를 자동 생성하므로, 내부에 {project}/ 폴더를 또 만들면 이중 폴더(한 뎁스 더)가 되어
    // 가이드대로 `cd {project}` 했을 때 한 단계 더 들어가야 하는 불편이 생긴다 → 폴더 없이 루트 사용.
    const root = zip

    // [2026-06] delta-aware — 기존 코드를 import 해 lineage(설계↔코드 매핑)가 있으면
    // "기존 구현 위에 강화(enhance)" 모드 + IMPLEMENTATION_STATUS.md 동봉. 없으면 greenfield.
    let lineage = null
    try {
      const lr = await store.fetchLastLineage({ projectName: project })
      if (lr?.success && lr.data) lineage = lr.data
    } catch { /* lineage 없음 → greenfield */ }
    const _kinds = ['stories', 'aggregates', 'apis', 'services']
    const hasImpl = !!lineage && _kinds.some((k) => (lineage[k] || []).some((it) => (it.implementations || []).length))
    const mode = hasImpl ? 'enhance' : 'greenfield'
    if (mode === 'enhance') {
      const repoUrl = _kinds.flatMap((k) => lineage[k] || [])
        .flatMap((it) => it.implementations || [])
        .map((im) => im.repoUrl).find(Boolean) || ''
      root.file('IMPLEMENTATION_STATUS.md', buildImplementationStatus(t, lineage, { repoUrl, stamp: new Date().toLocaleString({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[locale.value] || 'en-US') }))
    }

    // [2026-06 Option B] 자동 로드 부트스트랩 — 사용자가 긴 프롬프트를 붙여넣지 않아도
    // 도구가 폴더를 열 때 자동으로 읽는다. (Claude Code→CLAUDE.md, Cursor·Codex·
    // Antigravity·Windsurf→AGENTS.md) 둘 다 넣어 어떤 도구든 커버.
    const bootstrap = buildAgentBootstrap(t, project, hasSkills, hasOrch, hasChecklist, mode)
    root.file('AGENTS.md', bootstrap)
    root.file('CLAUDE.md', bootstrap)
    // 사람용 시작 가이드 — 선택한 도구 맞춤. 오케스트레이터 유무와 무관하게 항상 포함.
    root.file('0_START_HERE.md', buildStartGuide(t, project, hasSkills, tool, hasChecklist))
    // 에이전트 마스터 워크플로우 (BE 생성 성공 시) — AGENTS.md 가 이걸 권위로 가리킴.
    if (hasOrch) root.file('00-ORCHESTRATOR.md', orchestratorContent)
    // 전수 대조 체크리스트 — Phase 6(완료 보증 루프)의 기준 문서.
    if (hasChecklist) root.file('IMPLEMENTATION-CHECKLIST.md', checklistContent)

    for (const f of archFiles) {
      if (f.content) root.file(f.name, f.content)
    }
    if (hasSkills) addSkillsToZip(root.folder('skills'), skillList, t)  // skills/{category}/*.md (zip 루트 기준)

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    downloadBlob(zipBlob, `${project}_vibe.zip`)

    // 4종 전부 ✓ + 100% 를 잠깐 보여주고 닫는다 — 완료를 눈으로 확인시키는 마무리.
    // (이전엔 완료 즉시 오버레이가 닫혀 마지막 ✓ 를 볼 수 없었다)
    _mdMaxPct.value = 100
    await new Promise((r) => setTimeout(r, 1200))

    // [D4] 받자마자 "이제 뭐?" 공백을 메움 — 패키지 모달을 닫고 3단계(압축→폴더 열기→'시작해줘') 안내.
    isOpen.value = false
    showNextSteps.value = true

    // [2026-06-03] orchestrator(통합 가이드) 생성만 실패한 경우 — 위에서 이미 로컬
    // START_HERE 가이드로 대체해 다운로드는 정상 완료됐다. 사용자가 "왜 00-ORCHESTRATOR
    // 가 아니라 START_HERE 지?" 를 의아해하지 않도록 안심 메시지로 명확히 알린다.
    if (data?.diagnostic?.orchestrator_failed) {
      showWarning(t('design.arch.toast.orchestrator_degraded'))
    }
  } catch (error) {
    console.error('MD 생성 실패:', error)
    const status = error?.response?.status
    const detail = error?.response?.data?.detail
    const msg = error?.message || ''
    if (status === 503) {
      showError(t('design.toast.queue_unavailable'))
    } else if (status === 429) {
      showError(t('design.toast.rate_limited'))
    } else if (status === 422) {
      showError(detail || t('design.toast.md_failed_fallback'))
    } else if (msg === 'EMPTY_SPECS') {
      showError(t('design.arch.toast.md_empty_specs'))
    } else if (msg.includes('시간 안에 완료되지')) {
      showError(t('design.arch.toast.md_timeout'))
    } else {
      // [2026-05-29] worker job 실패(Gemini quota/5xx 등)는 실제 원인 메시지를
      // 그대로 노출 — "MD 파일 생성에 실패했습니다"만 뜨면 원인 파악 불가했음.
      const reason = detail || (msg && msg.length < 140 ? msg : '')
      showError(reason ? t('design.arch.toast.md_failed_msg', { reason }) : t('design.arch.toast.md_failed_final'))
    }
  } finally {
    isMdLoading.value = false
    stopMdElapsed()
  }
}

const downloadDesignPdf = async () => {
  if (!store.projectName || isPdfLoading.value || hasDesign.value === false) return
  isPdfLoading.value = true
  try {
    const project = store.projectName
    // [2026-05-26] sync createMD → v2 비동기 큐. 동일 응답 형태 반환.
    const data = await _createMdViaQueue(project)
    const sections = [
      { label: t('design.pdf.section_spack'), content: data?.spack_md },
      { label: t('design.pdf.section_ddd'),   content: data?.ddd_md },
      { label: t('design.pdf.section_arch'),  content: data?.arch_md },
    ].filter(s => s.content)
    if (!sections.length) throw new Error('문서 내용이 없습니다.')

    const { md } = await import('@/utils/markdown')
    const bodyHtml = sections.map(s =>
      `<section><h1>${s.label}</h1>${md.render(s.content)}</section>`
    ).join('<div class="section-break"></div>')

    const title = `${project} — ${t('design.pdf.title')}`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Pretendard Variable','Noto Sans KR','Apple SD Gothic Neo',sans-serif;max-width:860px;margin:0 auto;padding:48px 40px;color:#1a1a1a;line-height:1.75;font-size:14px}
  h1{font-size:1.8rem;font-weight:800;margin:0 0 24px}
  h2{font-size:1.35rem;font-weight:700;margin:2rem 0 .8rem;border-bottom:1.5px solid #e5e5e5;padding-bottom:6px}
  h3{font-size:1.1rem;font-weight:600;margin:1.5rem 0 .5rem}
  h4,h5,h6{font-size:1rem;font-weight:600;margin:1rem 0 .4rem}
  p{margin:0 0 .8rem}
  ul,ol{padding-left:1.5em;margin:0 0 .8rem}
  li{margin:.2rem 0}
  code{background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:.87em;font-family:'Menlo','Consolas',monospace}
  pre{background:#f3f4f6;padding:14px 16px;border-radius:6px;overflow-x:auto;margin:0 0 .8rem}
  pre code{background:none;padding:0}
  table{border-collapse:collapse;width:100%;margin:.8rem 0}
  th,td{border:1px solid #d5d5d5;padding:7px 12px;text-align:left;vertical-align:top}
  th{background:#f8f8f8;font-weight:600}
  blockquote{border-left:3px solid #c8c8c8;padding:0 0 0 14px;color:#555;margin:0 0 .8rem}
  hr{border:none;border-top:1px solid #e5e5e5;margin:1.5rem 0}
  section{margin-bottom:48px}
  .section-break{border-top:2px solid #e5e5e5;margin:40px 0}
  @page{margin:18mm 16mm}
  @media print{body{padding:0}.section-break{page-break-before:always;border:none;margin:0}}

@media (max-width: 900px) {
  .arch-header {
    flex-direction: column;
    align-items: flex-start !important;
    padding: 16px;
    gap: 12px;
  }
  .header-actions {
    width: 100%;
    /* [2026-05-30] 모바일: 액션 버튼(바이브 패키지·새로고침)을 우측 정렬해
       시선 흐름을 깔끔하게. 완성도 카드는 한 줄 가득 차지하도록 분리. */
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
  .header-actions > :first-child { flex: 1 1 100%; }
}

</style>
</head>
<body>${bodyHtml}</body>
</html>`)
    w.document.close()
    w.print()
  } catch (e) {
    console.error('PDF 생성 실패:', e)
    const status = e?.response?.status
    const detail = e?.response?.data?.detail
    const msg = e?.message || ''
    if (status === 503) {
      showError(t('design.toast.queue_unavailable'))
    } else if (status === 429) {
      showError(t('design.toast.rate_limited'))
    } else if (status === 422) {
      showError(detail || t('design.toast.pdf_failed_fallback'))
    } else if (msg.includes('시간 안에 완료되지')) {
      showError(t('design.toast.pdf_timeout'))
    } else {
      showError(t('design.toast.pdf_failed_fallback'))
    }
  } finally {
    isPdfLoading.value = false
  }
}

const isSkillCheckLoading = ref(false)
const hasSkillsInProject = ref(null) // null=미확인, true/false=확인됨
const skillCount = ref(0)            // [④] vibe.zip 에 포함되는 코딩 규칙 수 (Plan↔Design 연결 명시)
const showNextSteps = ref(false)     // [D4] 다운로드 직후 '다음 단계 3딸깍' 안내 모달

const prepareOnOpen = async () => {
  if (hasSkillsInProject.value !== null) return
  isSkillCheckLoading.value = true
  try {
    const res = await axios.get(`${API_BASE}/getAllSkill`, {
      params: { projectName: store.projectName }
    }).catch(() => null)
    const raw = res?.data?.result ?? res?.data ?? []
    const list = (Array.isArray(raw) ? raw : (raw?.skills ?? []))
    const valid = list.filter(i => i && (i.id || i.ID))
    skillCount.value = valid.length
    hasSkillsInProject.value = valid.length > 0
  } finally {
    isSkillCheckLoading.value = false
  }
}


// [2026-06-04] 완성도 % (0~100). 낮으면 다운로드는 허용하되 경고로 인지시킴.
// [2026-06-13] 페이지 상시 mount 컴포넌트라 즉시 fetch 금지 — 열렸을 때만 조회.
// (열림 && projectName) 을 computed 로 추적하면 한 줄로: 닫힘→'' (no-op),
// 열림→이름(fetch), 열린 채 프로젝트 전환→새 이름 재조회. (ref+수동주입 방식은
// 열린 채 전환 시 ''로만 리셋돼 점수가 영구 공백으로 남던 회귀가 있었음.)
const evalProjectName = computed(() => (props.modelValue ? store.projectName : ''))
const { score: evalScore } = useEvalScore(evalProjectName)
const evalScorePct = computed(() =>
  evalScore.value ? Math.round((evalScore.value.overall ?? 0) * 100) : null,
)

// 모달이 열릴 때 스킬 확인(캐시) + 설계 존재 확인 + 완성도 조회 시작.
watch(() => props.modelValue, (open) => {
  if (!open) return
  prepareOnOpen()
  checkDesignExists()
  // (eval 점수는 evalProjectName computed 가 열림+이름을 추적해 자동 조회)
})
// 프로젝트 전환 시 캐시 무효화 — 다른 프로젝트의 스킬/설계 상태가 남지 않게.
// 열린 채 전환되면 새 프로젝트 기준으로 즉시 재확인 (닫혀 있으면 다음 열림에 확인).
watch(() => store.projectName, () => {
  hasSkillsInProject.value = null
  skillCount.value = 0
  hasDesign.value = null
  if (props.modelValue) {
    prepareOnOpen()
    checkDesignExists()
  }
})
</script>

<template>
  <div>
  <!-- 바이브 코딩 시작 패키지 안내 다이얼로그 -->
  <VDialog v-model="isOpen" max-width="640" role="dialog" aria-label="바이브 코딩 시작 패키지 안내">
    <div class="vibe-modal">
      <div class="vibe-modal-head">
        <div class="d-flex align-center gap-2">
          <div class="vibe-modal-icon"><Sparkles :size="20" /></div>
          <div>
            <h3 class="vibe-modal-title">{{ $t('design.arch.vibe_modal_title') }}</h3>
            <p class="vibe-modal-sub">{{ $t('design.arch.vibe_modal_sub') }}</p>
          </div>
        </div>
        <button class="modal-close-btn" @click="isOpen = false" aria-label="닫기"><X :size="18" /></button>
      </div>

      <div class="vibe-modal-body">

        <!-- 로딩 중 -->
        <div v-if="isSkillCheckLoading" class="vibe-skill-checking">
          <VProgressCircular indeterminate size="18" color="var(--accent)" />
          <span>{{ $t('design.arch.vibe_checking') }}</span>
        </div>

        <template v-else>
          <!-- [2026-06-13] 설계 미생성 — 다운로드 비활성 + '최신 업데이트' 안내.
               (이전 archRef.hasArchData 게이트의 대체 — 모달이 페이지 레벨로 분리됨) -->
          <div v-if="hasDesign === false" class="vibe-completeness-warn vibe-completeness-warn--low">
            <AlertTriangle :size="16" class="vibe-completeness-warn__icon" />
            <div class="vibe-completeness-warn__text">
              <strong>{{ $t('design.arch.vibe_no_design_title') }}</strong>
              <span>{{ $t('design.arch.vibe_no_design_body') }}</span>
            </div>
          </div>
          <!-- 버전 배지 -->
          <div v-if="hasSkillsInProject !== null" class="vibe-version-badge" :class="hasSkillsInProject ? 'vibe-version-badge--full' : 'vibe-version-badge--lite'">
            <span v-if="hasSkillsInProject">{{ $t('design.arch.vibe_full_pkg') }}</span>
            <span v-else>{{ $t('design.arch.vibe_lite_pkg') }}</span>
          </div>

          <p class="vibe-intro" v-html="$t('design.arch.vibe_intro')"></p>

          <details class="vibe-faq">
            <summary class="vibe-faq-summary">
              <ChevronRight :size="13" class="vibe-faq-chev" />
              <span>{{ $t('design.arch.vibe_faq1_title') }}</span>
            </summary>
            <div class="vibe-faq-body">
              <p v-html="$t('design.arch.vibe_faq1_body')"></p>
            </div>
          </details>

          <details class="vibe-faq">
            <summary class="vibe-faq-summary">
              <ChevronRight :size="13" class="vibe-faq-chev" />
              <span>{{ $t('design.arch.vibe_faq2_title') }}</span>
            </summary>
            <div class="vibe-faq-body">
              <p v-html="$t('design.arch.vibe_faq2_body')"></p>
              <div class="vibe-tool-grid">
                <a href="https://claude.com/code" target="_blank" rel="noopener" class="vibe-tool">
                  <strong>Claude Code</strong>
                  <span>{{ $t('design.arch.vibe_tool_claude') }}</span>
                </a>
                <a href="https://cursor.com" target="_blank" rel="noopener" class="vibe-tool">
                  <strong>Cursor</strong>
                  <span>{{ $t('design.arch.vibe_tool_cursor') }}</span>
                </a>
                <a href="https://github.com/features/copilot" target="_blank" rel="noopener" class="vibe-tool">
                  <strong>GitHub Copilot Chat</strong>
                  <span>{{ $t('design.arch.vibe_tool_copilot') }}</span>
                </a>
                <a href="https://codeium.com/windsurf" target="_blank" rel="noopener" class="vibe-tool">
                  <strong>Windsurf</strong>
                  <span>{{ $t('design.arch.vibe_tool_windsurf') }}</span>
                </a>
              </div>
            </div>
          </details>

          <div class="vibe-pkg-list">
            <div class="vibe-pkg-item vibe-pkg-item--guide">
              <Bot :size="16" />
              <div>
                <div class="vibe-pkg-name"><code>AGENTS.md</code> · <code>CLAUDE.md</code></div>
                <div class="vibe-pkg-desc">{{ $t('design.arch.vibe_pkg_autoload') }}</div>
              </div>
            </div>
            <div class="vibe-pkg-item vibe-pkg-item--guide">
              <Bot :size="16" />
              <div>
                <div class="vibe-pkg-name"><code>00-ORCHESTRATOR.md</code></div>
                <div class="vibe-pkg-desc">{{ $t('design.arch.vibe_pkg_orchestrator') }}</div>
              </div>
            </div>
            <div v-if="hasSkillsInProject === true" class="vibe-pkg-item vibe-pkg-item--highlight">
              <Package :size="16" />
              <div>
                <div class="vibe-pkg-name">
                  <code>skills/</code>
                  <span class="vibe-pkg-required">{{ $t('design.arch.vibe_pkg_skills_label') }}</span>
                  <span v-if="skillCount" class="vibe-pkg-count">{{ $t('design.arch.vibe_pkg_skills_count', { count: skillCount }) }}</span>
                </div>
                <div class="vibe-pkg-desc" v-html="$t('design.arch.vibe_pkg_skills_desc')"></div>
              </div>
            </div>
            <div class="vibe-pkg-item">
              <FileText :size="16" />
              <div>
                <div class="vibe-pkg-name"><code>1_spack.md</code></div>
                <div class="vibe-pkg-desc">{{ $t('design.arch.vibe_pkg_spack') }}</div>
              </div>
            </div>
            <div class="vibe-pkg-item">
              <FileText :size="16" />
              <div>
                <div class="vibe-pkg-name"><code>2_ddd.md</code></div>
                <div class="vibe-pkg-desc">{{ $t('design.arch.vibe_pkg_ddd') }}</div>
              </div>
            </div>
            <div class="vibe-pkg-item vibe-pkg-item--final">
              <FileText :size="16" />
              <div>
                <div class="vibe-pkg-name"><code>3_architecture.md</code></div>
                <div class="vibe-pkg-desc">{{ $t('design.arch.vibe_pkg_arch') }}</div>
              </div>
            </div>
          </div>

          <!-- [2026-06-04] 완성도 낮으면 다운로드는 허용하되 경고로 인지시킴.
               ('받을 순 있지만 비어있는 항목이 있어 결과가 부정확할 수 있다') -->
          <div
            v-if="evalScorePct !== null && evalScorePct < 80"
            class="vibe-completeness-warn"
            :class="evalScorePct < 50 ? 'vibe-completeness-warn--low' : 'vibe-completeness-warn--mid'"
          >
            <AlertTriangle :size="16" class="vibe-completeness-warn__icon" />
            <div class="vibe-completeness-warn__text">
              <strong>{{ $t('design.arch.vibe_low_completeness_title', { pct: evalScorePct }) }}</strong>
              <span>{{ evalScorePct < 50 ? $t('design.arch.vibe_low_completeness_low') : $t('design.arch.vibe_low_completeness_mid') }}</span>
            </div>
          </div>

          <!-- [2026-06 #3] 인앱브라우저는 다운로드가 차단될 수 있어 외부 브라우저로 유도 -->
          <div v-if="inAppDownload" class="vibe-inapp-warn">
            <AlertTriangle :size="16" class="vibe-inapp-warn__icon" />
            <div class="vibe-inapp-warn__text">
              <span>{{ $t('design.arch.inapp_warn') }}</span>
              <button type="button" class="vibe-inapp-warn__btn" @click="openDownloadInExternal">
                {{ $t('design.arch.inapp_open') }}
              </button>
              <span v-if="inAppCopied" class="vibe-inapp-warn__copied">{{ $t('design.arch.inapp_copied') }}</span>
            </div>
          </div>

          <!-- [Option B] 어떤 AI 도구로 만들지 선택 → 0_START_HERE.md 사용법이 맞춤 생성됨.
               어떤 선택이든 AGENTS.md+CLAUDE.md 가 함께 들어가 자동 인식은 항상 동작. -->
          <div class="vibe-tool-pick">
            <div class="vibe-tool-pick__q">{{ $t('design.arch.tool_q') }}</div>
            <div class="vibe-tool-pick__opts">
              <button
                v-for="opt in agentToolOptions"
                :key="opt.id"
                type="button"
                class="vibe-tool-opt"
                :class="{ 'vibe-tool-opt--on': selectedTool === opt.id }"
                :aria-pressed="selectedTool === opt.id"
                @click="selectedTool = opt.id"
              >
                <span class="vibe-tool-opt__radio" aria-hidden="true"></span>
                <span class="vibe-tool-opt__label">{{ $t('design.arch.tool_' + opt.id) }}</span>
              </button>
            </div>
            <p class="vibe-tool-pick__hint">{{ $t('design.arch.tool_hint') }}</p>
          </div>

          <div class="vibe-dl-section">
            <VBtn
              class="vibe-dl-btn"
              :loading="isMdLoading"
              :disabled="isMdLoading || isPdfLoading || hasDesign === false"
              @click="downloadMdFromWebhook"
            >
              <Download :size="15" class="mr-2" />
              {{ $t('design.arch.vibe_dl_btn') }}
            </VBtn>
            <VBtn
              class="vibe-dl-btn vibe-dl-btn--pdf"
              :loading="isPdfLoading"
              :disabled="isMdLoading || isPdfLoading || hasDesign === false"
              @click="downloadDesignPdf"
            >
              <FileText :size="15" class="mr-2" />
              {{ $t('design.arch.vibe_dl_pdf') }}
            </VBtn>
            <p class="vibe-dl-hint">{{ $t('design.arch.vibe_dl_hint') }}</p>
          </div>
        </template>
      </div>
    </div>
  </VDialog>

  <!-- [D4] 다운로드 직후 다음 단계 3딸깍 안내 -->
  <VibeNextStepsModal v-model="showNextSteps" :project="store.projectName" :tool="selectedTool" />

  <!-- [2026-05-29] MD 패키지 생성 진행률 오버레이 — design '최신 업데이트' 패턴.
       단계 pill + 진행바(%) 로 "지금 어디쯤" 시각화. (시간/ETA 표기는 2026-06-03 제거) -->
  <VOverlay
    v-model="isMdLoading"
    persistent
    class="align-center justify-center md-overlay"
    no-click-animation
  >
    <div class="md-card custom-scroll" role="status" aria-live="polite">
      <div class="md-head">
        <div class="md-spinner"><RefreshCw :size="30" class="spin" /></div>
        <div class="md-head-text">
          <h3 class="md-title">{{ $t('design.arch.loading_title') }}</h3>
          <div class="md-elapsed">
            {{ mdCurrentStage.icon }} {{ mdCurrentStage.name }}
          </div>
        </div>
      </div>

      <div class="md-stages">
        <div
          v-for="(s, i) in MD_STAGES"
          :key="s.name"
          class="md-stage-pill"
          :class="{
            'md-stage-pill--done': i < mdCurrentStageIdx,
            'md-stage-pill--active': i === mdCurrentStageIdx,
          }"
        >
          <span class="md-stage-num">{{ i + 1 }}</span>
          <span class="md-stage-name">{{ s.name }}</span>
        </div>
      </div>

      <!-- [2026-06] 문서별 실시간 체크 — BE 신호(md:docs 누적 완료 목록) 기반.
           병렬 LLM 4건의 완료 시점이 흩어져 30~60초마다 ✓ 가 채워진다. -->
      <ul v-if="mdDocs" class="md-docs">
        <li
          v-for="d in mdDocs"
          :key="d.key"
          class="md-doc"
          :class="{ 'md-doc--done': d.done }"
        >
          <span class="md-doc-mark">{{ d.done ? '✓' : '⋯' }}</span>
          <span class="md-doc-label">{{ d.label }}</span>
        </li>
      </ul>
      <p v-if="mdLastDocSlow" class="md-docs-hint">
        💡 {{ $t('design.arch.md_docs.last_doc_hint', { doc: mdLastDocSlow }) }}
      </p>

      <div
        class="md-progress"
        role="progressbar"
        :aria-valuenow="mdProgressPct"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="md-progress-bar">
          <div class="md-progress-fill" :style="{ width: mdProgressPct + '%' }"></div>
        </div>
        <div class="md-progress-meta">
          <span class="md-progress-pct">{{ mdProgressPct }}%</span>
        </div>
      </div>

      <p class="md-stage-desc">{{ mdCurrentStage.desc }}</p>
      <p class="md-stage-tip">💡 {{ mdCurrentStage.tip }}</p>
      <!-- [2026-06] 추정 초과 시 안심 문구 — 95% 부근 정체가 고장이 아님을 알림 -->
      <p v-if="mdTakingLong" class="md-long-note">⏳ {{ $t('design.arch.md_stage.long_note') }}</p>
    </div>
  </VOverlay>
  </div>
</template>

<style scoped>
/* ── 닫기 버튼 (ArchitectureTab 공용 스타일에서 복사) ── */
.modal-close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 8px;
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: background .15s, color .15s;
}
.modal-close-btn:hover,
.modal-close-btn:focus-visible { background: var(--bg-light); color: var(--text-main); }

/* ── Vibe Modal ── */
.vibe-modal {
  background: var(--bg-card); border-radius: 16px;
  border: 1px solid var(--border-light); overflow: hidden;
}
.vibe-modal-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 20px 22px 16px; border-bottom: 1px solid var(--border-light);
}
.vibe-modal-icon {
  width: 38px; height: 38px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(124,58,237,.15), rgba(79,70,229,.15));
  display: flex; align-items: center; justify-content: center;
  color: #a78bfa; flex-shrink: 0;
}
.vibe-modal-title { font-size: 1rem; font-weight: 700; color: var(--text-main); margin: 0 0 2px; }
.vibe-modal-sub   { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.vibe-modal-body  { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto; }

/* version badge */
.vibe-version-badge {
  display: inline-flex; align-items: center;
  font-size: 0.72rem; font-weight: 600; border-radius: 6px; padding: 4px 10px; letter-spacing: .02em;
}
.vibe-version-badge--full { background: rgba(124,58,237,.12); color: #a78bfa; border: 1px solid rgba(124,58,237,.25); }
.vibe-version-badge--lite { background: rgba(99,102,241,.08); color: #818cf8; border: 1px solid rgba(99,102,241,.2); }

.vibe-intro { font-size: 0.83rem; color: var(--text-dim); line-height: 1.65; margin: 0; }
.vibe-intro code { background: rgba(255,255,255,.07); border-radius: 4px; padding: 1px 5px; font-size: 0.8rem; }

/* skill checking */
.vibe-skill-checking { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-muted); padding: 8px 0; }

/* FAQ accordion */
.vibe-faq { border: 1px solid var(--border-light); border-radius: 8px; overflow: hidden; }
.vibe-faq-summary {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px; cursor: pointer;
  font-size: 0.8rem; font-weight: 500; color: var(--text-dim);
  list-style: none; user-select: none;
  background: var(--bg-light);
  transition: background .15s;
}
.vibe-faq-summary::-webkit-details-marker { display: none; }
.vibe-faq-summary:hover { background: var(--bg-light); }
details[open] .vibe-faq-chev { transform: rotate(90deg); }
.vibe-faq-chev { transition: transform .2s; color: var(--text-muted); flex-shrink: 0; }
.vibe-faq-body { padding: 12px 14px; font-size: 0.8rem; color: var(--text-dim); line-height: 1.6; border-top: 1px solid var(--border-light); }
.vibe-faq-body p { margin: 0; }

/* tool grid */
.vibe-tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.vibe-tool {
  display: flex; flex-direction: column; gap: 3px;
  background: var(--bg-card); border: 1px solid var(--border-light);
  border-radius: 8px; padding: 10px 12px;
  text-decoration: none; transition: border-color .15s, background .15s;
}
.vibe-tool:hover { border-color: var(--accent); background: var(--bg-light); }
.vibe-tool strong { font-size: 0.8rem; color: var(--text-main); }
.vibe-tool span   { font-size: 0.72rem; color: var(--text-muted); }

/* pkg list */
.vibe-pkg-list { display: flex; flex-direction: column; gap: 6px; }
.vibe-pkg-item {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--bg-light); border: 1px solid var(--border-light);
  border-radius: 8px; padding: 10px 12px;
  color: var(--text-muted);
  transition: border-color .15s;
}
.vibe-pkg-item--guide    { border-left: 3px solid #a78bfa; }
.vibe-pkg-item--highlight { border-left: 3px solid #f59e0b; background: rgba(245,158,11,.04); }
.vibe-pkg-item--final    { border-left: 3px solid #10b981; }
.vibe-pkg-name { font-size: 0.8rem; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
.vibe-pkg-name code { font-size: 0.78rem; }
.vibe-pkg-desc { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
.vibe-pkg-required { font-size: 0.65rem; font-weight: 700; background: rgba(245,158,11,.15); color: #f59e0b; border-radius: 4px; padding: 1px 6px; }
.vibe-pkg-count { font-size: 0.65rem; font-weight: 700; background: rgba(124,58,237,.12); color: #a78bfa; border-radius: 4px; padding: 1px 6px; }

/* dl section */
/* [2026-06-04] 완성도 낮음 경고 — 다운로드 위에 인지시킴 */
.vibe-completeness-warn {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 11px 14px; border-radius: 10px; margin-top: 4px;
}
.vibe-completeness-warn--mid {
  background: rgba(234, 179, 8, 0.09);
  border: 1px solid rgba(234, 179, 8, 0.4);
  color: #92400e;
}
.vibe-completeness-warn--low {
  background: rgba(244, 67, 54, 0.08);
  border: 1px solid rgba(244, 67, 54, 0.4);
  color: #b91c1c;
}
.vibe-completeness-warn__icon { flex-shrink: 0; margin-top: 1px; }
.vibe-completeness-warn__text { display: flex; flex-direction: column; gap: 2px; }
.vibe-completeness-warn__text strong { font-size: 0.82rem; font-weight: 800; }
.vibe-completeness-warn__text span { font-size: 0.76rem; line-height: 1.55; opacity: 0.95; word-break: keep-all; }

/* [#3] 인앱브라우저 다운로드 안내 */
.vibe-inapp-warn {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 11px 14px; border-radius: 10px; margin-top: 4px;
  background: rgba(255, 167, 38, 0.09);
  border: 1px solid rgba(255, 167, 38, 0.4);
  color: #92400e;
}
.vibe-inapp-warn__icon { flex-shrink: 0; margin-top: 1px; }
.vibe-inapp-warn__text { display: flex; flex-direction: column; gap: 6px; }
.vibe-inapp-warn__text > span { font-size: 0.76rem; line-height: 1.55; word-break: keep-all; }
.vibe-inapp-warn__btn {
  align-self: flex-start; padding: 6px 12px; border-radius: 8px; border: none;
  background: #8C6239; color: #fff; font-size: 0.74rem; font-weight: 700; cursor: pointer;
}
.vibe-inapp-warn__btn:hover { background: #6B4A2A; }
.vibe-inapp-warn__copied { font-size: 0.7rem; opacity: 0.8; }

/* [Option B] AI 도구 선택 */
.vibe-tool-pick { margin-top: 6px; }
.vibe-tool-pick__q { font-size: 0.86rem; font-weight: 800; color: var(--text-main, #2A2421); margin-bottom: 8px; }
.vibe-tool-pick__opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.vibe-tool-opt {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 10px; cursor: pointer; text-align: left;
  border: 1.5px solid rgba(140, 98, 57, 0.2); background: #fff;
  font-size: 0.8rem; font-weight: 600; color: #3a342f; transition: all 0.15s;
}
.vibe-tool-opt:hover { border-color: rgba(140, 98, 57, 0.5); background: #fffdf7; }
.vibe-tool-opt--on { border-color: #8C6239; background: rgba(140, 98, 57, 0.08); color: #6B4A2A; }
.vibe-tool-opt__radio {
  width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid rgba(140, 98, 57, 0.4); position: relative;
}
.vibe-tool-opt--on .vibe-tool-opt__radio { border-color: #8C6239; }
.vibe-tool-opt--on .vibe-tool-opt__radio::after {
  content: ''; position: absolute; inset: 2px; border-radius: 50%; background: #8C6239;
}
.vibe-tool-pick__hint { font-size: 0.72rem; color: var(--text-muted, #8A817C); margin: 8px 0 0; line-height: 1.5; word-break: keep-all; }
@media (max-width: 480px) { .vibe-tool-pick__opts { grid-template-columns: 1fr; } }

.vibe-dl-section { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 4px; }
.vibe-dl-btn {
  background: linear-gradient(135deg, #7c3aed, #4f46e5) !important;
  color: #fff !important; font-weight: 600 !important;
  height: 40px !important; padding: 0 24px !important; border-radius: 10px !important;
  box-shadow: 0 2px 10px rgba(124,58,237,.3) !important;
  transition: opacity .2s, transform .15s;
}
.vibe-dl-btn:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
.vibe-dl-btn--pdf {
  background: linear-gradient(135deg, #2e4036, #1a2b20) !important;
  box-shadow: 0 2px 10px rgba(46,64,54,.3) !important;
  margin-top: 8px !important;
}
.vibe-dl-hint { font-size: 0.72rem; color: var(--text-muted); text-align: center; margin: 0; }

/* ============================================================
   [2026-05-29] MD 패키지 생성 진행률 오버레이 (design '최신 업데이트' 패턴)
   ============================================================ */
.md-overlay :deep(.v-overlay__content) { background: transparent !important; width: min(560px, 92vw); }
.md-overlay :deep(.v-overlay__scrim) { background: rgba(0,0,0,0.8) !important; backdrop-filter: blur(8px); }
.md-card {
  background: linear-gradient(135deg, #1F1A14 0%, #14110D 100%);
  border-radius: 20px;
  padding: 28px;
  color: #F5EEE3;
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}
.md-head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.md-spinner {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: #F5EEE3;
}
.md-head-text { flex: 1; min-width: 0; }
.md-title { font-family: 'Outfit', sans-serif; font-size: 1.12rem; font-weight: 800; margin: 0; line-height: 1.2; }
.md-elapsed { font-size: 0.85rem; opacity: 0.8; margin-top: 4px; font-weight: 600; }
.md-stages { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.md-stage-pill {
  flex: 1; display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
  font-family: 'Outfit', sans-serif; font-size: 0.74rem; font-weight: 700;
  opacity: 0.5; transition: all 0.3s;
}
.md-stage-num {
  width: 18px; height: 18px; border-radius: 50%;
  background: rgba(255,255,255,0.15);
  display: flex; align-items: center; justify-content: center; font-size: 0.65rem;
  flex-shrink: 0;
}
.md-stage-pill--done { opacity: 0.7; background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.3); }
.md-stage-pill--done .md-stage-num { background: rgba(34,197,94,0.4); }
.md-stage-pill--active {
  opacity: 1;
  background: linear-gradient(135deg, rgba(140,98,57,0.3) 0%, rgba(140,98,57,0.15) 100%);
  border-color: rgba(212,184,150,0.5); box-shadow: 0 0 16px rgba(140,98,57,0.2);
}
.md-stage-pill--active .md-stage-num { background: linear-gradient(135deg, #D4B896 0%, #8C6239 100%); }
/* [2026-06] 문서별 실시간 체크 — 2열 그리드, ✓ 완료 시 초록 톤 */
.md-docs {
  display: grid; grid-template-columns: 1fr 1fr; gap: 5px 10px;
  list-style: none; margin: 0 0 4px; padding: 0;
}
.md-doc {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 10px; border-radius: 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  font-size: 0.74rem; font-weight: 600; opacity: 0.6;
  transition: all 0.3s;
}
.md-doc--done {
  opacity: 1;
  background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.3);
}
.md-doc-mark {
  width: 16px; height: 16px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 9999px; font-size: 0.66rem; font-weight: 800;
  background: rgba(255,255,255,0.1);
}
.md-doc--done .md-doc-mark { background: rgba(34,197,94,0.45); color: #fff; }
.md-doc-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-docs-hint { margin: 4px 2px 0; font-size: 0.7rem; font-weight: 500; opacity: 0.78; }
.md-progress { margin: 10px 0 14px; }
.md-progress-bar { height: 5px; background: rgba(255,255,255,0.08); border-radius: 9999px; overflow: hidden; position: relative; }
.md-progress-fill {
  height: 100%; border-radius: 9999px;
  background: linear-gradient(90deg, #D4B896 0%, #8C6239 100%);
  box-shadow: 0 0 12px rgba(212,184,150,0.5);
  transition: width 0.6s cubic-bezier(.16,1,.3,1); position: relative;
}
.md-progress-fill::after {
  content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 24px;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 100%);
  animation: md-shimmer 1.6s ease-in-out infinite;
}
@keyframes md-shimmer { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
.md-progress-meta { display: flex; justify-content: center; align-items: baseline; margin-top: 6px; font-family: 'Outfit', sans-serif; }
.md-progress-pct { font-size: 0.8rem; font-weight: 800; color: #D4B896; letter-spacing: 0.04em; }
.md-stage-desc { font-size: 0.88rem; margin: 6px 0 4px; opacity: 0.92; line-height: 1.4; }
.md-stage-tip { font-size: 0.78rem; margin: 0; opacity: 0.65; line-height: 1.5; font-style: italic; }
.md-long-note {
  margin: 10px 0 0; padding: 9px 12px;
  background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); border-radius: 8px;
  font-size: 0.76rem; line-height: 1.55; color: #b45309; word-break: keep-all;
}
.spin { animation: md-spin 1s linear infinite; }
@keyframes md-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 600px) {
  .md-card { padding: 20px; }
  .md-stages { flex-direction: column; gap: 6px; }
  .md-stage-pill { width: 100%; }
  .md-docs { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .md-progress-fill::after { animation: none; }
  .md-progress-fill { transition: none; }
  .spin { animation: none; }
}

</style>
