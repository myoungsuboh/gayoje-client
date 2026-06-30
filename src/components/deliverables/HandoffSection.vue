<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Loader2, CheckCircle2 } from 'lucide-vue-next'
import axios from '@/utils/axios'
import { downloadBlob } from '@/utils/download'
import { useHarnessStore, API_BASE } from '@/store/harness'
import { roleLabel } from '@/composables/useProjectRepos'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import { buildObsidianVault, sanitizeNoteName, extractDocMd } from '@/utils/obsidianExport'
import { designGraphToMarkdown, collectDesignGaps, buildOpenQuestionsMd } from '@/utils/designMarkdown'
import { extractRaw } from '@/utils/designFetch'
import { addSkillsToZip } from '@/utils/designExport'
// erdExcel·lineageExcel 은 xlsx(무거움) 의존 — 다운로드 시점에만 동적 import (jszip 과 동일 전략).

const { t } = useI18n()

const props = defineProps({
  repos: { type: Array, required: true },
  lintByUrl: { type: Object, required: true }, // { [url]: { score, savedAt, loaded } }
  kpi: { type: Object, required: true },        // { lintAvg, lintCount, ... }
})

const store = useHarnessStore()
const isZipping = ref(false)
const zipMessage = ref('')

// [2026-06-08] 카드를 button → div(role=button) 로 바꾸면서(ⓘ를 제목 옆에 중첩하기
// 위함; button 안 button 금지) disabled 가드를 직접 처리.
const isCardDisabled = () => isZipping.value || !props.repos.length
const onCardClick = (mode) => { if (!isCardDisabled()) downloadHandoff(mode) }

// [2026-06-22] 역할별 README — "누가 받아 무엇을 하는지(about) + 먼저 볼 것(first)
// + 실제 포함 목차(included) + 미정 N건". included 는 다운로드 시 실제 zip 에 담은
// 파일만 — 없는 산출물은 목차에서 빠져, README 와 내용물이 항상 일치한다.
const ROLE_KEY = { dev: 'dev', pm: 'pm', architect: 'architect' }
const generateReadme = (mode, ctx = {}) => {
  const { included = [], gapTotal = 0 } = ctx
  const rk = ROLE_KEY[mode] || 'dev'
  const stamp = new Date().toLocaleString('ko-KR')
  const repoLines = props.repos
    .map(r => `- **${roleLabel(r.role)}** ${r.label ? `(${r.label})` : ''}: ${r.url}`)
    .join('\n')
  const tocLines = included.map(f => `- \`${f.path}\` — ${f.label}`).join('\n')
  const lintLine = props.kpi.lintAvg !== null
    ? t('deliverables.handoff.zip.lint_value', { avg: props.kpi.lintAvg, count: props.kpi.lintCount })
    : t('deliverables.handoff.zip.no_analysis')
  const gapBlock = gapTotal > 0
    ? `\n## ${t('deliverables.handoff.zip.open_questions_title', { count: gapTotal })}\n${t('deliverables.handoff.zip.open_questions_body')}\n`
    : ''
  return `# ${store.projectName} — ${t(`deliverables.handoff.zip.role_title_${rk}`)}
> ${stamp} · ${t(`deliverables.handoff.zip.role_for_${rk}`)}

## ${t('deliverables.handoff.zip.about_title')}
${t(`deliverables.handoff.zip.about_${rk}`)}

## ${t('deliverables.handoff.zip.first_title')}
${t(`deliverables.handoff.zip.first_${rk}`)}

## ${t('deliverables.handoff.zip.contents_title')}
${tocLines}
${gapBlock}
## ${t('deliverables.handoff.zip.registered_repos', { count: props.repos.length })}
${repoLines || t('deliverables.handoff.zip.no_repos')}

## ${t('deliverables.handoff.zip.lint_compliance')}
${lintLine}

${t('deliverables.handoff.zip.note_html')}

---
🤖 Harness Engineering System
`
}

// ─── [2026-06-12] Obsidian Vault export ──────────────────────────────
// 기획·설계를 [[위키링크]] 노트 vault 로 — 변환은 obsidianExport.js (순수 함수),
// 여기는 fetch + ZIP 포장만. 저장소(repos) 없이도 동작 — 기획·설계만으로 가치가
// 있는 산출물이라 기존 3개 카드의 repos 가드를 공유하지 않는다.
const fetchRawJson = async (ep) => {
  try {
    const res = await axios.get(`${API_BASE}/${ep}`, {
      params: { projectName: store.projectName }, timeout: 30000, _silent: true,
    })
    return extractRaw(res) || {}
  } catch { return {} }
}

// [2026-06-22] PRD↔설계 추적성 그래프 — 저장된 그래프 읽기(가벼움). 무거운
// analyzeLineage(설계↔코드, 1~3분)와 다른 경로. 노드 없으면(no_design/no_lineage)
// null → 호출부가 graceful 생략(추적성 시트만 빠지고 다운로드는 계속).
const fetchLineageGraph = async () => {
  try {
    const res = await axios.get('/api/v2/graph/lineage', {
      params: { project_name: store.projectName }, timeout: 30000, _silent: true,
    })
    const data = res?.data
    if (!data?.nodes?.length) return null
    return { nodes: data.nodes, edges: data.edges || [] }
  } catch { return null }
}

// [2026-06-22] 코딩 규칙(스킬) 상세 — instructions(규칙 본문) 포함(getAllSkillDetail).
// VibePackageModal 과 동일 매핑이되, trigger 자동생성(fill_skill_triggers, LLM)은
// 핸드오프 다운로드 경로에선 생략한다(즉시성·비용) — 빈 trigger 는 그대로 둔다.
const fetchSkillDetails = async () => {
  try {
    const res = await axios.get(`${API_BASE}/getAllSkillDetail`, {
      params: { projectName: store.projectName }, _silent: true,
    }).catch(() => null)
    const raw = res?.data?.result ?? res?.data ?? []
    return (Array.isArray(raw) ? raw : (raw?.skills ?? []))
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
  } catch { return [] }
}

const downloadObsidian = async () => {
  if (isZipping.value) return
  isZipping.value = true
  zipMessage.value = t('deliverables.handoff.zip.generating', { mode: 'OBSIDIAN' })
  try {
    const [prdRaw, cpsRaw, spack, ddd, arch] = await Promise.all([
      fetchRawJson('getPRD'),
      fetchRawJson('getCPS'),
      fetchRawJson('getSpack'),
      fetchRawJson('getDDD'),
      fetchRawJson('getArchitecture'),
    ])
    // [2026-06-12 fix] getPRD/getCPS 는 { result: [{ prd_content|content }] } —
    // fetchMd 폴백으로는 JSON 덤프가 됨. extractDocMd 가 본문 + \n 정규화 담당.
    const prdMd = extractDocMd(prdRaw)
    const cpsMd = extractDocMd(cpsRaw)

    const files = buildObsidianVault({
      projectName: store.projectName, prdMd: prdMd || '', cpsMd, spack, ddd, arch, t,
    })
    // README + 홈(MOC) 2개는 항상 생성됨 — 그 외 노트가 없으면 내보낼 데이터 없음.
    if (files.length <= 2) {
      zipMessage.value = t('deliverables.handoff.zip.obsidian_no_data')
      return
    }

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const root = zip.folder(sanitizeNoteName(store.projectName))
    for (const f of files) root.file(f.path, f.content)

    const blob = await zip.generateAsync({ type: 'blob' })
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `${store.projectName}_obsidian_${stamp}.zip`
    downloadBlob(blob, filename)
    zipMessage.value = t('deliverables.handoff.zip.download_done', { filename })
  } catch (e) {
    zipMessage.value = t('deliverables.handoff.zip.generate_fail', { error: e.message })
  } finally {
    isZipping.value = false
    setTimeout(() => { zipMessage.value = '' }, 5000)
  }
}

// 파일 경로 → README 목차 라벨 i18n 키. (count 를 받는 skills/·05_lint 는 직접 push)
const FILE_LABEL_KEYS = {
  '02_plan/prd.md': 'file_prd',
  '02_plan/cps.md': 'file_cps',
  '03_design/spack.md': 'file_spack',
  '03_design/ddd.md': 'file_ddd',
  '03_design/architecture.md': 'file_arch',
  '03_design/erd.xlsx': 'file_erd',
  '06_review/open-questions.md': 'file_open_questions',
  '07_traceability/lineage.xlsx': 'file_lineage',
  '04_repos/repo-list.txt': 'file_repo_list',
}

const downloadHandoff = async (mode) => {
  isZipping.value = true
  zipMessage.value = t('deliverables.handoff.zip.generating', { mode: mode.toUpperCase() })
  try {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const included = []
    // 내용이 있을 때만 zip 에 넣고 README 목차에 등록 — README 와 실제 내용물 항상 일치.
    const add = (path, content) => {
      if (!content) return
      zip.file(path, content)
      const key = FILE_LABEL_KEYS[path]
      if (key) included.push({ path, label: t(`deliverables.handoff.zip.${key}`) })
    }

    // ── 1) 공통 명세 raw (병렬 fetch) ──
    const [prdRaw, spackRaw, dddRaw, archRaw] = await Promise.all([
      fetchRawJson('getPRD'), fetchRawJson('getSpack'), fetchRawJson('getDDD'), fetchRawJson('getArchitecture'),
    ])
    // 담당서비스 갭은 multiService(arch.services>1) 게이트 — spack 변환·갭 집계에 개수 필요.
    const archServiceCount = (archRaw?.services?.length) || 0

    // ── 2) 설계 3종 MD (전 역할) — 빈 명세엔 ⚠ 인라인 마커(AgentExportPanel·Obsidian 동일 기준) ──
    add('03_design/spack.md', designGraphToMarkdown(t, 'spack', spackRaw, { archServiceCount }))
    add('03_design/ddd.md', designGraphToMarkdown(t, 'ddd', dddRaw))
    add('03_design/architecture.md', designGraphToMarkdown(t, 'arch', archRaw))

    // ── 3) PRD (전 역할 — '무엇을 만드나') ──
    add('02_plan/prd.md', extractDocMd(prdRaw))

    // ── 4) 미정(갭) 목록 (갭>0; 전 역할 — 구현 전 확정할 의사결정 큐) ──
    const gaps = collectDesignGaps(t, spackRaw, dddRaw, archServiceCount)
    add('06_review/open-questions.md', buildOpenQuestionsMd(t, gaps))

    // ── 5) ERD xlsx (DEV·ARCHITECT — 데이터 모델; 엔티티 없으면 빈 시트 노이즈라 생략) ──
    const hasErdData = (spackRaw?.entities?.length || dddRaw?.aggregates?.length || dddRaw?.domain_entities?.length)
    if ((mode === 'dev' || mode === 'architect') && hasErdData) {
      const { buildErdWorkbook, erdWorkbookToArrayBuffer } = await import('@/utils/erdExcel')
      add('03_design/erd.xlsx', erdWorkbookToArrayBuffer(buildErdWorkbook(spackRaw, dddRaw)))
    }

    // ── 6) CPS (PM — 맥락·문제·해결, '왜') ──
    if (mode === 'pm') {
      add('02_plan/cps.md', extractDocMd(await fetchRawJson('getCPS')))
    }

    // ── 7) 추적성 Lineage xlsx (PM·ARCHITECT — 저장된 그래프, 없으면 graceful 생략) ──
    if (mode === 'pm' || mode === 'architect') {
      const lin = await fetchLineageGraph()
      if (lin) {
        const { buildLineageWorkbook, lineageWorkbookToArrayBuffer } = await import('@/utils/lineageExcel')
        add('07_traceability/lineage.xlsx', lineageWorkbookToArrayBuffer(buildLineageWorkbook(lin.nodes, lin.edges)))
      }
    }

    // ── 8) 코딩 규칙 skills/ (DEV — 사람·AI 가 따를 규칙) ──
    if (mode === 'dev') {
      const skillList = await fetchSkillDetails()
      if (skillList.length) {
        addSkillsToZip(zip.folder('skills'), skillList, t)
        included.push({ path: 'skills/', label: t('deliverables.handoff.zip.file_skills', { count: skillList.length }) })
      }
    }

    // ── 9) lint 리포트 (전 역할 — 코드 품질 베이스라인) ──
    const lintRepos = props.repos.filter(r => {
      const l = props.lintByUrl[r.url]
      return l?.score !== null && l?.score !== undefined
    })
    if (lintRepos.length) {
      const lintFolder = zip.folder('05_lint')
      for (const r of lintRepos) {
        const safeName = (r.label || r.role || 'repo').replace(/[^a-z0-9_-]/gi, '_')
        const cached = store.getCachedLint(store.projectName, r.url)
        const json = cached?.data?.result || { score: props.lintByUrl[r.url].score }
        lintFolder.file(`${safeName}.json`, JSON.stringify(json, null, 2))
      }
      included.push({ path: '05_lint/', label: t('deliverables.handoff.zip.file_lint', { count: lintRepos.length }) })
    }

    // ── 10) repo 목록 (공통) ──
    add('04_repos/repo-list.txt',
      props.repos.map(r => `[${r.role}] ${r.url} ${r.label ? `# ${r.label}` : ''}`).join('\n'))

    // ── 11) README (역할별, 실제 포함 목차·미정 건수 반영) — 맨 마지막 생성 ──
    zip.file('00_README.md', generateReadme(mode, { included, gapTotal: gaps.total }))

    const blob = await zip.generateAsync({ type: 'blob' })
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `${store.projectName}_${mode}_${stamp}.zip`
    downloadBlob(blob, filename)
    zipMessage.value = t('deliverables.handoff.zip.download_done', { filename })
  } catch (e) {
    zipMessage.value = t('deliverables.handoff.zip.generate_fail', { error: e.message })
  } finally {
    isZipping.value = false
    setTimeout(() => { zipMessage.value = '' }, 5000)
  }
}
</script>

<template>
  <section class="handoff-section">
    <span class="section-pill mono-text">{{ $t('deliverables.handoff.pill') }}</span>
    <h4 class="section-title serif-text">
      {{ $t('deliverables.handoff.title') }}
      <GuideTooltip target="handoff-zip" placement="bottom" />
    </h4>
    <p class="handoff-desc">{{ $t('deliverables.handoff.desc') }}</p>
    <p class="handoff-note">{{ $t('deliverables.handoff.note') }}</p>
    <!-- [2026-06-08 DLV-C] 저장소 없을 때 안내 — 카드만 흐릿하게 두지 않고 다음 행동 제시. -->
    <div v-if="!repos.length" class="handoff-empty" role="note">
      {{ $t('deliverables.handoff.empty_hint') }}
    </div>
    <div class="handoff-grid">
      <!-- [2026-06-08 DLV-A] 카드를 div(role=button)로 — ⓘ를 DEV/PM/ARCHITECT 제목 옆에
           중첩(button 안 button 금지 회피). ⓘ는 자체 stopPropagation 으로 카드 클릭과 분리. -->
      <div
        class="handoff-card"
        :class="{ 'handoff-card--disabled': isZipping || !repos.length }"
        role="button"
        :tabindex="(isZipping || !repos.length) ? -1 : 0"
        :aria-disabled="isZipping || !repos.length"
        :aria-label="$t('deliverables.handoff.dev_aria')"
        @click="onCardClick('dev')"
        @keydown.enter.prevent="onCardClick('dev')"
        @keydown.space.prevent="onCardClick('dev')"
      >
        <div class="handoff-mode-row">
          <span class="handoff-mode">DEV</span>
          <GuideTooltip target="deliv-handoff-dev" :size="13" />
        </div>
        <div class="handoff-content">{{ $t('deliverables.handoff.dev_content') }}</div>
        <div class="handoff-icon"><Download :size="18" aria-hidden="true" /></div>
      </div>
      <div
        class="handoff-card"
        :class="{ 'handoff-card--disabled': isZipping || !repos.length }"
        role="button"
        :tabindex="(isZipping || !repos.length) ? -1 : 0"
        :aria-disabled="isZipping || !repos.length"
        :aria-label="$t('deliverables.handoff.pm_aria')"
        @click="onCardClick('pm')"
        @keydown.enter.prevent="onCardClick('pm')"
        @keydown.space.prevent="onCardClick('pm')"
      >
        <div class="handoff-mode-row">
          <span class="handoff-mode">PM</span>
          <GuideTooltip target="deliv-handoff-pm" :size="13" />
        </div>
        <div class="handoff-content">{{ $t('deliverables.handoff.pm_content') }}</div>
        <div class="handoff-icon"><Download :size="18" aria-hidden="true" /></div>
      </div>
      <div
        class="handoff-card"
        :class="{ 'handoff-card--disabled': isZipping || !repos.length }"
        role="button"
        :tabindex="(isZipping || !repos.length) ? -1 : 0"
        :aria-disabled="isZipping || !repos.length"
        :aria-label="$t('deliverables.handoff.architect_aria')"
        @click="onCardClick('architect')"
        @keydown.enter.prevent="onCardClick('architect')"
        @keydown.space.prevent="onCardClick('architect')"
      >
        <div class="handoff-mode-row">
          <span class="handoff-mode">ARCHITECT</span>
          <GuideTooltip target="deliv-handoff-architect" :size="13" />
        </div>
        <div class="handoff-content">{{ $t('deliverables.handoff.architect_content') }}</div>
        <div class="handoff-icon"><Download :size="18" aria-hidden="true" /></div>
      </div>
      <!-- [2026-06-12] Obsidian Vault — 저장소 없이도 가능 (기획·설계만으로 가치). -->
      <div
        class="handoff-card handoff-card--obsidian"
        :class="{ 'handoff-card--disabled': isZipping }"
        role="button"
        :tabindex="isZipping ? -1 : 0"
        :aria-disabled="isZipping"
        :aria-label="$t('deliverables.handoff.obsidian_aria')"
        @click="!isZipping && downloadObsidian()"
        @keydown.enter.prevent="!isZipping && downloadObsidian()"
        @keydown.space.prevent="!isZipping && downloadObsidian()"
      >
        <div class="handoff-mode-row">
          <span class="handoff-mode">OBSIDIAN</span>
        </div>
        <div class="handoff-content">{{ $t('deliverables.handoff.obsidian_content') }}</div>
        <div class="handoff-icon"><Download :size="18" aria-hidden="true" /></div>
      </div>
    </div>
    <p v-if="zipMessage" class="zip-msg" :class="{ 'zip-msg--success': zipMessage.startsWith('✓') }" role="status" aria-live="polite">
      <Loader2 v-if="isZipping" :size="13" class="rotate-anim mr-2" aria-hidden="true" />
      <CheckCircle2 v-else-if="zipMessage.startsWith('✓')" :size="13" class="mr-2" aria-hidden="true" />
      {{ zipMessage }}
    </p>
  </section>
</template>

<style scoped>
.handoff-section {
  background: white; border: 1px solid var(--border-light); border-radius: 16px;
  padding: 24px 26px; margin-bottom: 24px;
}
.section-pill {
  display: inline-block; padding: 3px 10px;
  background: var(--bg-light); color: var(--accent);
  font-size: 0.62rem; font-weight: 800; letter-spacing: 0.08em;
  border-radius: 9999px; margin-bottom: 6px;
}
.section-title {
  font-family: 'Fraunces', 'Outfit', serif; font-size: 1.3rem; font-weight: 700;
  color: var(--text-main); margin: 0;
}
.handoff-desc { font-size: 0.8rem; color: var(--text-muted); margin: 6px 0 8px; }
.handoff-note {
  font-size: 0.74rem; color: #B46723; line-height: 1.5; margin: 0 0 16px;
  padding: 8px 12px; background: rgba(217, 119, 6, 0.07);
  border: 1px solid rgba(217, 119, 6, 0.2); border-radius: 8px;
}
/* [2026-06-12] 4번째 카드(Obsidian) — 좁아지면 자동 줄바꿈. */
.handoff-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
/* Obsidian 카드 — moss 톤으로 구분 (기획 자산 내보내기 ≠ 코드 핸드오프). */
.handoff-card--obsidian { background: linear-gradient(135deg, #F4F6F2 0%, #E3E9E1 100%); }
/* [2026-06-08] 제목(DEV/PM/ARCHITECT) + ⓘ 한 줄. ⓘ가 제목 바로 옆에. */
.handoff-mode-row { display: flex; align-items: center; gap: 2px; }
/* 저장소 없을 때 안내 박스 */
.handoff-empty {
  font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;
  padding: 12px 14px; background: var(--bg-light); border-radius: 10px;
  margin-bottom: 12px;
}
.handoff-card {
  display: flex; flex-direction: column; gap: 6px; padding: 20px 20px;
  background: linear-gradient(135deg, #FCFAEE 0%, #F2EAD8 100%);
  border: 1px solid var(--border-light); border-radius: 14px; cursor: pointer;
  transition: all .2s; position: relative; text-align: left;
}
.handoff-card:hover:not(.handoff-card--disabled) {
  transform: translateY(-2px); border-color: var(--accent);
  box-shadow: 0 10px 28px rgba(140,98,57,0.18);
}
.handoff-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.handoff-card--disabled { opacity: 0.45; cursor: not-allowed; }
.handoff-mode {
  font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 900;
  color: var(--accent); letter-spacing: 0.05em;
}
.handoff-content {
  font-family: 'Pretendard Variable', sans-serif; font-size: 0.78rem; font-weight: 600;
  color: var(--text-main); line-height: 1.5;
}
.handoff-icon { position: absolute; top: 18px; right: 18px; color: var(--text-muted); opacity: 0.5; }
.zip-msg {
  margin-top: 14px; padding: 11px 15px;
  background: var(--bg-light); border-radius: 9px;
  font-size: 0.78rem; color: var(--text-main); font-weight: 600;
  display: flex; align-items: center;
}
.zip-msg--success { background: rgba(91,161,96,0.1); color: #2E7B33; }
.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .handoff-grid { grid-template-columns: 1fr; }
}
</style>
