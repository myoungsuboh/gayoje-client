/**
 * agentBundle.js — 코드 핸드오프 번들의 문서 빌더 (순수 함수).
 *
 * [왜 추출했나 — 2026-06-13 심층검수 가드③]
 * 이 빌더들(CLAUDE.md·AGENTS.md·.cursorrules·llms.txt·BUILD_PLAN.md)은 원래
 * AgentExportPanel.vue 컴포넌트 내부 함수라 테스트가 0건이었다. 그래서 'AGENTS.md
 * footer 에 Claude Code 잔존', 'llms.txt overview 헤딩 누수' 같은 "조립 텍스트"
 * 버그가 오직 사람 눈(더블체크)에만 의존했고 반복적으로 샜다. 순수 함수로 빼서
 * 골든 스냅샷 + 의미 단언 테스트(tests/utils/agentBundle.test.js)로 회귀를 자동
 * 차단한다. store/i18n 의존은 인자(t·name·stamp)로 받아 결정적이다.
 *
 * [i18n — 2026-06-25]
 * 번들 문서는 사용자 locale(ko/en/ja/zh)로 출력된다. 빌더 내부 한국어 리터럴을
 * 전부 제거하고, vue-i18n translate 함수 `t` 를 첫 인자로 주입받아
 * `t('code.bundle.<key>', { ... })` 로 치환했다. 결정성을 위해 t 를 store 가 아니라
 * 인자로 받는다(테스트는 locale=ko 고정 후 i18n.global.t 주입). 파일명/경로/마커/
 * 고유명사/보간 변수는 번역 대상이 아니라 메시지 안에서 원문 유지된다.
 */

/**
 * 핸드오프 작업 규칙 — 실전 지침서 프롬프트 규칙(R1/R3/R7/R8/R11) + import 실재 +
 * ⚠ 미정 대응. 에이전트 할루시네이션을 프롬프트 층에서 막는 핵심.
 * @param {Function} t vue-i18n translate
 * @returns {string[]} 10개 규칙
 */
export const buildWorkRules = (t) => [
  t('code.bundle.work_rules.r1_source_of_truth'),
  t('code.bundle.work_rules.r2_incremental'),
  t('code.bundle.work_rules.r3_summarize_before'),
  t('code.bundle.work_rules.r4_new_lib_consent'),
  t('code.bundle.work_rules.r5_import_registry'),
  t('code.bundle.work_rules.r6_undecided_stop'),
  t('code.bundle.work_rules.r7_run_verify'),
  t('code.bundle.work_rules.r8_ask_when_ambiguous'),
  t('code.bundle.work_rules.r9_assumptions_risks'),
  t('code.bundle.work_rules.r10_small_commits'),
]

/** 역할(R1) 한 줄 — tech_stack 있으면 "FastAPI 시니어", 없으면 graceful 폴백. */
export const roleLine = (t, techStack) => {
  const stack = (techStack || []).slice(0, 4).join(' · ')
  return stack
    ? t('code.bundle.role_line.with_stack', { stack })
    : t('code.bundle.role_line.no_stack')
}

/**
 * CLAUDE.md / AGENTS.md 본문. tool='claude'|'agents' 로 "누가 읽는지" 헤더·footer 만 분기.
 * @param {Function} t vue-i18n translate (결정성 위해 주입)
 * @param {string} name 프로젝트명
 * @param {Object} specs { prd, architecture, ddd, spack, techStack }
 * @param {Object|null} plan BUILD_PLAN 유무(docList 에 표기)
 * @param {'claude'|'agents'} tool
 * @param {string} stamp 생성 시각 문자열(테스트 결정성 위해 주입)
 */
export const buildAgentContextMd = (t, name, specs, plan = null, tool = 'claude', stamp = '', mode = 'greenfield') => {
  const proj = name || 'Project'
  const reader = tool === 'agents' ? t('code.bundle.context.reader_agents') : t('code.bundle.context.reader_claude')
  const coder = tool === 'agents' ? t('code.bundle.context.coder_agents') : t('code.bundle.context.coder_claude')
  const enhance = mode === 'enhance'
  const has = (k) => !!specs[k]
  const overview = specs.prd
    ? specs.prd.slice(0, 800).trim() + (specs.prd.length > 800 ? t('code.bundle.context.overview_more') : '')
    : t('code.bundle.context.overview_empty')
  const docList = [
    // [2026-06] enhance: 기존 repo 를 가져온 프로젝트 — 구현 현황을 가장 먼저.
    enhance && t('code.bundle.context.doc_status'),
    plan && t('code.bundle.context.doc_build_plan'),
    has('prd') && t('code.bundle.context.doc_prd'),
    has('architecture') && t('code.bundle.context.doc_architecture'),
    has('ddd') && t('code.bundle.context.doc_ddd'),
    has('spack') && t('code.bundle.context.doc_spack'),
  ].filter(Boolean).join('\n') || t('code.bundle.context.doc_empty')

  // enhance 모드 안내 블록 — "기존 코드 위에 강화"를 자동 로드 컨텍스트 상단에 명시.
  const enhanceNote = enhance ? `\n${t('code.bundle.context.enhance_note')}\n` : ''

  return `# ${proj}

> ${t('code.bundle.context.autoload_note', { reader })}
> ${t('code.bundle.context.gen_note', { stamp })}
${enhanceNote}
## ${t('code.bundle.context.h_role')}
${roleLine(t, specs.techStack)}

## ${t('code.bundle.context.h_what')}
${overview}

## ${t('code.bundle.context.h_specs')}
${t('code.bundle.context.specs_lead')}
${docList}

## ${t('code.bundle.context.h_rules')}
${buildWorkRules(t).map((r) => `- ${r}`).join('\n')}

---
${t('code.bundle.context.footer', { coder })}
`
}

/** .cursorrules — 역할 + 명세 우선 + WORK_RULES. plain 규칙 파일이라 굵게(**) 전체 제거. */
export const buildCursorRules = (t, name, techStack) => ([
  t('code.bundle.cursor.header', { name: name || 'Project' }),
  t('code.bundle.cursor.spec_hint'),
  ``,
  `- ${roleLine(t, techStack)}`,
  `- ${t('code.bundle.cursor.spec_first')}`,
  ...buildWorkRules(t).map((r) => `- ${r}`),
].join('\n') + '\n').replace(/\*\*/g, '')

/** BUILD_PLAN.md — AI 빌드 플랜. footer 는 도구 중립(단일 번들에 무조건 포함되므로). */
export const buildBuildPlanMd = (t, plan, name) => {
  const empty = t('code.bundle.plan.empty_item')
  const ul = (a) => (Array.isArray(a) && a.length ? a.map((x) => `- ${x}`).join('\n') : `- ${empty}`)
  const ol = (a) => (Array.isArray(a) && a.length ? a.map((x, i) => `${i + 1}. ${x}`).join('\n') : `1. ${empty}`)
  return `# ${t('code.bundle.plan.title', { name: name || 'Project' })}

> ${t('code.bundle.plan.lead1')}
> ${t('code.bundle.plan.lead2')}

## ${t('code.bundle.plan.h_stack')}
${plan.recommended_stack || t('code.bundle.plan.stack_infer')}

## ${t('code.bundle.plan.h_scope_now')}
${ul(plan.scope_now)}

## ${t('code.bundle.plan.h_scope_later')}
${ul(plan.scope_later)}

## ${t('code.bundle.plan.h_milestones')}
${ol(plan.milestones)}

## ${t('code.bundle.plan.h_acceptance')}
${ul(plan.acceptance_criteria)}

## ${t('code.bundle.plan.h_risks')}
${ul(plan.risks)}

---
${t('code.bundle.plan.footer')}
`
}

/** llms.txt — LLM 진입점 표준 인덱스(llmstxt.org). PRD 첫 실내용 줄을 overview 로. */
export const buildLlmsTxt = (t, specs, name, hasPlan) => {
  const firstLine = (specs.prd || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('---'))
  const overview = firstLine
    ? firstLine.replace(/[*`>]/g, '').replace(/^[-\s]+/, '').slice(0, 200)
    : t('code.bundle.llms.overview_empty')
  const links = [
    hasPlan && t('code.bundle.llms.link_build_plan'),
    t('code.bundle.llms.link_claude'),
    t('code.bundle.llms.link_agents'),
    specs.prd && t('code.bundle.llms.link_prd'),
    specs.architecture && t('code.bundle.llms.link_architecture'),
    specs.ddd && t('code.bundle.llms.link_ddd'),
    specs.spack && t('code.bundle.llms.link_spack'),
  ].filter(Boolean).join('\n')
  return `# ${name || 'Project'}

> ${overview}

## ${t('code.bundle.llms.h_specs')}
${links}

## ${t('code.bundle.llms.h_rules')}
- ${t('code.bundle.llms.rule_source_of_truth')}
- ${t('code.bundle.llms.rule_import_registry')}
- ${t('code.bundle.llms.rule_undecided')}
`
}

const _greenfieldStartPrompt = (t, name) => t('code.bundle.start.greenfield', { name })

// [2026-06] enhance 모드 — 기존 코드(import 된 레벨 5)를 "처음부터 재작성"이 아니라
// "그 위에 강화"하도록 지시. IMPLEMENTATION_STATUS.md 의 ✅/⬜ 를 기준으로 ⬜만 추가.
const _enhanceStartPrompt = (t, name) => t('code.bundle.start.enhance', { name })

/** 복붙용 START_PROMPT. mode='enhance' 면 기존 코드 위에 강화하는 프롬프트(import 프로젝트용). */
export const buildStartPrompt = (t, name, mode = 'greenfield') =>
  mode === 'enhance' ? _enhanceStartPrompt(t, name) : _greenfieldStartPrompt(t, name)

/**
 * IMPLEMENTATION_STATUS.md — import 된 기존 repo 의 "설계 ↔ 코드" 현황.
 * lineage(getLastLineage) 결과를 받아 ✅ 이미 구현 / ⬜ 미구현 / ⚠️ 저신뢰 / drift 로 분류.
 *
 * @param {Function} t vue-i18n translate (결정성 위해 주입)
 * @param {Object} lineage LineageResultData ({ stories, aggregates, apis, services, missingImpl, drifts, stats })
 * @param {Object} opts { repoUrl, stamp }
 * @returns {string} markdown (lineage 비면 빈 문자열 — 호출부가 번들에 안 넣음)
 */
export const buildImplementationStatus = (t, lineage, opts = {}) => {
  if (!lineage) return ''
  const { repoUrl = '', stamp = '' } = opts
  const KIND = { stories: 'Story', aggregates: 'Aggregate', apis: 'API', services: 'Service' }
  const done = []   // ✅ high/medium + verified
  const weak = []   // ⚠️ low confidence 또는 unverified
  for (const key of Object.keys(KIND)) {
    for (const item of (lineage[key] || [])) {
      const impls = item.implementations || []
      if (!impls.length) continue
      const files = impls.map((im) => im.filePath).filter(Boolean)
      const conf = (impls[0]?.confidence || '').toLowerCase()
      const verified = impls.some((im) => im.verified)
      const fileStr = files.map((f) => `\`${f}\``).join(', ') || t('code.bundle.status.file_unknown')
      const line = `- **${item.name || item.id}** (${KIND[key]}) → ${fileStr}${conf ? ` _(${conf})_` : ''}`
      if (conf === 'low' || !verified) weak.push(line)
      else done.push(line)
    }
  }
  const missing = (lineage.missingImpl || []).map(
    (m) => `- **${m.name || m.id}** (${m.type || 'spec'})${m.reason ? ` — ${m.reason}` : ` — ${t('code.bundle.status.not_found')}`}`,
  )
  const drift = (lineage.drifts || []).map(
    (d) => `- \`${d.filePath || d.file || d.name || d.id}\`${d.reason ? ` — ${d.reason}` : ''}`,
  )
  const section = (title, arr, empty) => `## ${title}\n${arr.length ? arr.join('\n') : `_(${empty})_`}\n`
  return `# ${t('code.bundle.status.title')}

> ${t('code.bundle.status.lead1')}
> ${t('code.bundle.status.lead2')}
${repoUrl ? `> ${t('code.bundle.status.repo', { repoUrl })}\n` : ''}> ${t('code.bundle.status.lead3', { stamp })}
> ${t('code.bundle.status.lead4')}

${section(t('code.bundle.status.sec_done'), done, t('code.bundle.status.empty_none'))}
${section(t('code.bundle.status.sec_missing'), missing, t('code.bundle.status.empty_missing'))}
${section(t('code.bundle.status.sec_weak'), weak, t('code.bundle.status.empty_none'))}
${section(t('code.bundle.status.sec_drift'), drift, t('code.bundle.status.empty_none'))}
---
${t('code.bundle.status.footer')}
`
}

/** 플랜이 실제로 쓸모 있는 내용을 담았는지(빈 폴백이면 번들에 안 넣음). */
export const planIsMeaningful = (p) => !!p && (
  !!(p.start_prompt && p.start_prompt.trim())
  || (Array.isArray(p.milestones) && p.milestones.length > 0)
  || !!(p.recommended_stack && p.recommended_stack.trim())
)
