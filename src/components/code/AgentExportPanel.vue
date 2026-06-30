<script setup>
/**
 * AgentExportPanel — 설계 명세를 'AI 코딩 도구(Cursor·Claude Code)' 입력으로 변환.
 *
 * [왜 — 페르소나]
 * B2C 타겟 = "AI로 직접 만들어보고 싶은데 진짜 개발은 못 하는" 사람(바이브 코딩 관심층).
 * 이들의 진짜 막힘은 코드가 아니라 "뭘 어떻게 만들지 모른다"이다. Harness 가 이미
 * 뽑아둔 명세(PRD·SPACK·DDD·Architecture)를 그들의 AI 도구가 바로 먹을 수 있는
 * 형태로 내보내 그 빈칸을 메운다. → Harness = "Cursor 켜기 전 기획소".
 *
 * [무엇을 만드나]
 *  · CLAUDE.md      — Claude Code 가 프로젝트 열 때 자동으로 읽는 컨텍스트.
 *  · .cursorrules   — Cursor 프로젝트 규칙.
 *  · spec/*.md      — 원본 명세 (prd / architecture / ddd / spack).
 *  · START_PROMPT   — 붙여넣으면 바로 시작되는 첫 지시문.
 *
 * 백엔드 변경 없음 — HandoffSection 과 동일한 get{PRD,Spack,DDD,Architecture} 재사용.
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Download, Loader2, FileCode2 } from 'lucide-vue-next'
import axios from '@/utils/axios'
import { downloadBlob } from '@/utils/download'
import { useHarnessStore, API_BASE } from '@/store/harness'
import { extractRaw } from '@/utils/designFetch'
import { extractDocMd } from '@/utils/obsidianExport'
import { designGraphToMarkdown, collectTechStack } from '@/utils/designMarkdown'
// [2026-06-13 가드③] 번들 문서 빌더는 순수 유틸(agentBundle.js)로 추출 — 골든 테스트로 회귀 차단.
import {
  buildAgentContextMd, buildCursorRules, buildBuildPlanMd, buildLlmsTxt, buildStartPrompt, buildImplementationStatus, planIsMeaningful,
} from '@/utils/agentBundle'

const { t, locale } = useI18n()
const store = useHarnessStore()
const hasProject = computed(() => !!store.projectName)

const busy = ref(false)
const msg = ref('')
const msgOk = ref(false)

const flash = (text, ok = false) => {
  msg.value = text
  msgOk.value = ok
  setTimeout(() => { msg.value = '' }, 5000)
}

// [2026-06-13 fix] 기존 fetchMd 는 res.data?.md||content 폴백만 가져, getPRD
// ({result:[{prd_content}]})·설계 3종(그래프 JSON)이 전부 null → spec/ 폴더가
// 통째로 비어 나가던 실버그. 이제 extractRaw 로 result[0] 을 꺼내, PRD 는
// extractDocMd(prd_content), 설계 3종은 designGraphToMarkdown 으로 사람·LLM 이
// 읽는 마크다운으로 변환한다. (HandoffSection·obsidian export 와 동일 계약 공유.)
const fetchRaw = async (path) => {
  try {
    const res = await axios.get(`${API_BASE}/${path}`, {
      params: { projectName: store.projectName },
      timeout: 30000,
    })
    if (typeof res.data === 'string') return res.data
    return extractRaw(res)
  } catch { return {} }
}

// 4개 명세를 병렬로 가져와 마크다운으로 변환 (없으면 빈 문자열 → spec/ 에서 제외).
const fetchSpecs = async () => {
  const [prdRaw, archRaw, dddRaw, spackRaw] = await Promise.all([
    fetchRaw('getPRD'),
    fetchRaw('getArchitecture'),
    fetchRaw('getDDD'),
    fetchRaw('getSpack'),
  ])
  // [2026-06-13] 담당서비스 갭은 multiService(arch.services>1) 게이트 — spack 변환에 arch 개수 주입.
  const archServiceCount = (typeof archRaw === 'string' ? null : archRaw?.services?.length) || 0
  return {
    prd: typeof prdRaw === 'string' ? prdRaw : extractDocMd(prdRaw),
    architecture: designGraphToMarkdown(t, 'arch', archRaw),
    ddd: designGraphToMarkdown(t, 'ddd', dddRaw),
    spack: designGraphToMarkdown(t, 'spack', spackRaw, { archServiceCount }),
    // [A2] 역할(R1) 자동 주입용 — arch 그래프의 tech_stack. 없으면 빈 배열.
    techStack: typeof archRaw === 'string' ? [] : collectTechStack(archRaw),
  }
}

// 복붙용 첫 지시문 — name 폴백만 컴포넌트가 처리, 본문은 agentBundle 공유.
const startPrompt = computed(() => buildStartPrompt(t, store.projectName || t('code.agent_export.default_project_name')))

// 회의록/PRD → AI 빌드 플랜 (POST /api/v2/interview/build_plan).
// 실패·쿼터초과·네트워크 오류 시 null 반환 → 번들 생성은 계속 (회귀 없음).
const fetchBuildPlan = async (meetingText) => {
  const text = (meetingText || '').trim()
  if (!text) return null
  try {
    const res = await axios.post(
      '/api/v2/interview/build_plan',
      // project_name 을 함께 보내면 BE 가 설계 그래프(DDD/SPACK/Arch)를 읽어 플랜 품질↑.
      { meeting_content: text.slice(0, 18000), project_name: store.projectName || '' },
      { timeout: 60000 },
    )
    return res.data || null
  } catch { return null }
}

const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(startPrompt.value)
    flash(t('code.agent_export.toast.copy_ok'), true)
  } catch {
    flash(t('code.agent_export.toast.copy_fail'))
  }
}

const downloadBundle = async () => {
  if (!hasProject.value) { flash(t('code.agent_export.toast.no_project')); return }
  busy.value = true
  msg.value = t('code.agent_export.toast.bundling')
  msgOk.value = false
  try {
    const specs = await fetchSpecs()
    const anySpec = specs.prd || specs.architecture || specs.ddd || specs.spack

    // [2026-06] delta-aware — 기존 코드를 import 해 lineage(설계↔코드 매핑)가 있으면
    // "기존 구현 위에 강화(enhance)" 모드. 없으면 기존 greenfield. (best-effort: 실패=greenfield)
    let lineage = null
    try {
      const lr = await store.fetchLastLineage({ projectName: store.projectName })
      if (lr?.success && lr.data) lineage = lr.data
    } catch { /* lineage 없음 → greenfield */ }
    const hasImpl = !!lineage && ['stories', 'aggregates', 'apis', 'services']
      .some((k) => (lineage[k] || []).some((it) => (it.implementations || []).length))
    const mode = hasImpl ? 'enhance' : 'greenfield'
    const repoUrl = hasImpl
      ? (['stories', 'aggregates', 'apis', 'services']
        .flatMap((k) => lineage[k] || [])
        .flatMap((it) => it.implementations || [])
        .map((im) => im.repoUrl).find(Boolean) || '')
      : ''

    // 명세가 있으면 AI 빌드 플랜을 함께 생성 (실패해도 번들은 계속 만든다).
    let plan = null
    if (anySpec) {
      msg.value = t('code.agent_export.toast.plan_generating')
      plan = await fetchBuildPlan(specs.prd || specs.spack || specs.ddd || specs.architecture)
    }
    const hasPlan = planIsMeaningful(plan)

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const planArg = hasPlan ? plan : null
    const projName = store.projectName || 'Project'
    // 번들 문서의 생성 시각 — 사용자 locale 형식으로(ko 는 기존과 동일, en/ja/zh 는 '오후' 같은 한글 누수 방지).
    const docStamp = new Date().toLocaleString({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[locale.value] || 'en-US')
    zip.file('CLAUDE.md', buildAgentContextMd(t, projName, specs, planArg, 'claude', docStamp, mode))
    // [A3] AGENTS.md — Cursor 신버전·Codex·Windsurf 가 읽는 표준(내용은 CLAUDE.md 와 동일).
    zip.file('AGENTS.md', buildAgentContextMd(t, projName, specs, planArg, 'agents', docStamp, mode))
    zip.file('.cursorrules', buildCursorRules(t, store.projectName, specs.techStack))
    // enhance 모드면 STATUS.md + enhance START_PROMPT. greenfield 면 기존 그대로.
    if (mode === 'enhance') {
      zip.file('IMPLEMENTATION_STATUS.md', buildImplementationStatus(t, lineage, { repoUrl, stamp: docStamp }))
    }
    const startTxt = mode === 'enhance'
      ? buildStartPrompt(t, projName, 'enhance')
      : (hasPlan && plan.start_prompt ? plan.start_prompt : startPrompt.value)
    zip.file('START_PROMPT.txt', startTxt)
    // [A3] llms.txt — LLM 진입점 표준 인덱스.
    zip.file('llms.txt', buildLlmsTxt(t, specs, store.projectName, hasPlan))
    if (hasPlan) zip.file('BUILD_PLAN.md', buildBuildPlanMd(t, plan, store.projectName))

    const specFolder = zip.folder('spec')
    if (specs.prd) specFolder.file('prd.md', specs.prd)
    if (specs.architecture) specFolder.file('architecture.md', specs.architecture)
    if (specs.ddd) specFolder.file('ddd.md', specs.ddd)
    if (specs.spack) specFolder.file('spack.md', specs.spack)
    if (!anySpec) {
      specFolder.file(
        'README.md',
        t('code.bundle.spec_readme_empty') + '\n',
      )
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const safe = (store.projectName || 'project').replace(/[^a-z0-9_-]/gi, '_')
    const filename = `${safe}_agent-bundle_${stamp}.zip`
    downloadBlob(blob, filename)
    flash(
      hasPlan ? t('code.agent_export.toast.download_ok_plan', { filename })
        : anySpec ? t('code.agent_export.toast.download_ok', { filename })
          : t('code.agent_export.toast.download_ok_no_spec', { filename }),
      true,
    )
  } catch (e) {
    flash(t('code.agent_export.toast.bundle_fail', { error: e.message }))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ax">
    <div class="ax-head">
      <span class="ax-icon"><FileCode2 :size="16" aria-hidden="true" /></span>
      <div>
        <strong class="ax-title">{{ $t('code.agent_export.title') }}</strong>
        <p class="ax-desc">{{ $t('code.agent_export.desc') }}</p>
      </div>
    </div>

    <div class="ax-actions">
      <button type="button" class="ax-btn ax-btn--primary" :disabled="busy" @click="downloadBundle">
        <Loader2 v-if="busy" :size="15" class="ax-spin" aria-hidden="true" />
        <Download v-else :size="15" aria-hidden="true" />
        {{ $t('code.agent_export.download_btn') }}
      </button>
      <button type="button" class="ax-btn ax-btn--ghost" @click="copyPrompt">
        <Copy :size="15" aria-hidden="true" />
        {{ $t('code.agent_export.copy_prompt_btn') }}
      </button>
    </div>

    <ul class="ax-includes">
      <li v-html="$t('code.agent_export.includes.rules')"></li>
      <li v-html="$t('code.agent_export.includes.plan')"></li>
      <li v-html="$t('code.agent_export.includes.spec')"></li>
      <li v-html="$t('code.agent_export.includes.prompt')"></li>
    </ul>

    <p v-if="!hasProject" class="ax-warn">{{ $t('code.agent_export.no_project_warn') }}</p>

    <p v-if="msg" class="ax-msg" :class="{ 'ax-msg--ok': msgOk }" role="status" aria-live="polite">
      {{ msg }}
    </p>
  </div>
</template>

<style scoped>
.ax {
  margin-top: 12px;
  padding: 14px;
  background: rgba(140, 98, 57, 0.05);
  border: 1px solid rgba(140, 98, 57, 0.16);
  border-radius: 10px;
}
.ax-head { display: flex; gap: 10px; align-items: flex-start; }
.ax-icon {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(140, 98, 57, 0.12); color: var(--accent, #8C6239);
}
.ax-title { font-size: 0.82rem; font-weight: 800; color: var(--text-main, #2A2421); }
.ax-desc { margin: 2px 0 0; font-size: 0.72rem; line-height: 1.45; color: var(--text-muted, #6F665F); }
.ax-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ax-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 9999px;
  font-family: inherit; font-size: 0.74rem; font-weight: 800;
  cursor: pointer; border: 1px solid transparent; transition: all .15s;
}
.ax-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ax-btn--primary { background: var(--accent, #8C6239); color: #fff; }
.ax-btn--primary:hover:not(:disabled) { background: #6E4E2E; transform: translateY(-1px); }
.ax-btn--ghost { background: #fff; color: var(--accent, #8C6239); border-color: rgba(140, 98, 57, 0.3); }
.ax-btn--ghost:hover { background: rgba(140, 98, 57, 0.08); }
.ax-includes {
  margin: 12px 0 0; padding-left: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.ax-includes li { font-size: 0.7rem; line-height: 1.5; color: var(--text-muted, #6F665F); }
.ax-includes code {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.66rem;
  background: rgba(0, 0, 0, 0.05); padding: 1px 4px; border-radius: 4px; color: var(--text-main, #2A2421);
}
.ax-warn { margin: 10px 0 0; font-size: 0.7rem; color: #B46723; }
.ax-msg {
  margin: 10px 0 0; padding: 8px 11px; border-radius: 7px;
  background: rgba(0, 0, 0, 0.04); font-size: 0.72rem; font-weight: 600; color: var(--text-main, #2A2421);
}
.ax-msg--ok { background: rgba(91, 161, 96, 0.12); color: #2E7B33; }
.ax-spin { animation: ax-spin .8s linear infinite; }
@keyframes ax-spin { to { transform: rotate(360deg); } }
</style>
