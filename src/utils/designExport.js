/**
 * 설계 산출물 다운로드용 순수 변환 헬퍼.
 *
 * [배경 — 2026-05 Phase 6: 거대 컴포넌트 분할]
 * design.vue(2500줄+)의 script 에 인라인돼 있던 순수 함수들을 분리.
 * 모두 reactive/store 의존 없는 순수 함수 → 단위 테스트 가능 + design.vue 슬림화.
 *   - buildStartGuide: 0_START_HERE.md 본문 생성 (사용자 + AI 에이전트용 가이드)
 *   - skillToMd: skill 객체 → .md 문자열
 *   - getCategoryFromSkill / KNOWN_CATEGORIES: skill 카테고리 분류
 *   - addSkillsToZip: JSZip 인스턴스에 skill .md 들을 카테고리 폴더로 추가
 *
 * [i18n — 2026-06-25]
 * vibe 패키지 문서(0_START_HERE.md·AGENTS.md/CLAUDE.md·skills/*.md)는 사용자
 * locale(ko/en/ja/zh)로 출력된다. 빌더 내부 한국어/영어 리터럴을 전부 제거하고,
 * vue-i18n translate 함수 `t` 를 첫 인자로 주입받아 `t('design.vibe.<key>', { ... })`
 * 로 치환했다(agentBundle.js 와 동일 패턴). 결정성을 위해 t 를 store 가 아니라
 * 인자로 받는다(테스트는 locale=ko 고정 후 i18n.global.t 주입). 파일명/경로/마커/
 * 고유명사/보간 변수는 번역 대상이 아니라 메시지 안에서 원문 유지된다.
 */

/**
 * [Option B — 2026-06] 지원 AI 코딩 도구별 메타 (자동 로드 파일만 — locale 독립).
 * zip 의 AGENTS.md(Cursor·Codex·Antigravity·Windsurf) / CLAUDE.md(Claude Code) 를
 * 도구가 자동으로 읽으므로, 사용자는 "폴더 열고 한 마디"만 하면 된다.
 * label/open(사용자 안내 문구)은 locale 별이라 design.vibe.tools.* 에서 t 로 해석한다.
 */
export const AGENT_TOOLS = {
  claude: { autoFile: 'CLAUDE.md' },
  cursor: { autoFile: 'AGENTS.md' },
  antigravity: { autoFile: 'AGENTS.md' },
  other: { autoFile: 'AGENTS.md' },
}

/**
 * AGENTS.md / CLAUDE.md 본문 — 모든 도구가 자동 로드하는 에이전트 부트스트랩(지시문).
 * 사용자가 긴 프롬프트를 붙여넣지 않아도 에이전트가 무엇을 할지 즉시 알도록 한다.
 * hasOrchestrator=true 면 00-ORCHESTRATOR.md 를, 아니면 0_START_HERE.md 를 마스터 플랜으로 가리킨다.
 * hasChecklist=true 면 IMPLEMENTATION-CHECKLIST.md(그래프 기반 전수 목록) 대조 루프를 완료 조건으로 건다.
 * @param {Function} t vue-i18n translate (결정성 위해 주입)
 */
export function buildAgentBootstrap(t, project, hasSkills, hasOrchestrator, hasChecklist = false, mode = 'greenfield') {
  const enhance = mode === 'enhance'
  const entry = hasOrchestrator
    ? t('design.vibe.bootstrap.entry_orchestrator')
    : t('design.vibe.bootstrap.entry_start_here')
  // [2026-06] enhance: 기존 repo 를 가져온 프로젝트 — "처음부터 만들기"가 아니라 "기존 위에 강화".
  const enhanceBanner = enhance ? `\n${t('design.vibe.bootstrap.enhance_banner')}\n` : ''
  return `# ${t('design.vibe.bootstrap.title', { project })}

${t('design.vibe.bootstrap.intro')}
${enhanceBanner}
## ${t('design.vibe.bootstrap.h_master_plan')}
${entry}
${t('design.vibe.bootstrap.master_plan_note')}

## ${t('design.vibe.bootstrap.h_spec_files')}
${enhance ? t('design.vibe.bootstrap.spec_status') + '\n' : ''}${t('design.vibe.bootstrap.spec_spack')}
${t('design.vibe.bootstrap.spec_ddd')}
${t('design.vibe.bootstrap.spec_architecture')}
${hasSkills ? t('design.vibe.bootstrap.spec_skills') : ''}
${hasChecklist ? t('design.vibe.bootstrap.spec_checklist') : ''}

## ${t('design.vibe.bootstrap.h_hard_rules')}
${enhance ? t('design.vibe.bootstrap.rule_enhance') + '\n' : ''}${t('design.vibe.bootstrap.rule_stack')}
${t('design.vibe.bootstrap.rule_stop')}
${t('design.vibe.bootstrap.rule_no_invent')}
${hasSkills ? t('design.vibe.bootstrap.rule_skills') : ''}
${hasChecklist ? t('design.vibe.bootstrap.rule_checklist', { num: hasSkills ? '5' : '4' }) : ''}

## ${t('design.vibe.bootstrap.h_human_guide')}
${t('design.vibe.bootstrap.human_guide')}
`
}

/** 0_START_HERE.md 본문 생성. project=프로젝트명, hasSkills=skills/ 동봉, tool=선택한 AI 도구 키,
 *  hasChecklist=IMPLEMENTATION-CHECKLIST.md 동봉 여부 (Phase 6 전수 대조의 기준 문서).
 *  @param {Function} t vue-i18n translate (결정성 위해 주입) */
export function buildStartGuide(t, project, hasSkills, tool = 'other', hasChecklist = false) {
  const toolKey = AGENT_TOOLS[tool] ? tool : 'other'
  const toolMeta = AGENT_TOOLS[toolKey]
  const toolLabel = t(`design.vibe.tools.${toolKey}.label`)
  const toolOpen = t(`design.vibe.tools.${toolKey}.open`, { p: project })
  const startLine = t('design.vibe.start_line')
  // [2026-06 #2] 모든 산출물이 단일 zip({project}_vibe.zip) 으로 묶여 배포됨.
  // 압축을 풀면 {project}_vibe/ 폴더 안에 가이드·명세·skills/ 가 모두 들어 있다.
  const skillSection = hasSkills ? `\n${t('design.vibe.guide.skill_section')}\n` : ''
  const skillStep2Note = hasSkills ? t('design.vibe.guide.skill_step1_note') : ''
  const skillPromptLine = hasSkills ? `\n${t('design.vibe.guide.skill_prompt_line')}` : ''
  const skillPhaseHint = hasSkills
    ? t('design.vibe.guide.phase_hint_with_skills')
    : t('design.vibe.guide.phase_hint_no_skills')
  return `# ${t('design.vibe.guide.title', { project })}

${t('design.vibe.guide.lead')}

---

## ${t('design.vibe.guide.h_what_is_this')}

${t('design.vibe.guide.what_is_this_1')}

${t('design.vibe.guide.what_is_this_2', { project })}

${t('design.vibe.guide.what_is_this_3')}

---

## ${t('design.vibe.guide.h_what_to_do')}

### ${t('design.vibe.guide.step1_title')}
${t('design.vibe.guide.step1_body', { project })}${skillStep2Note}

### ${t('design.vibe.guide.step2_title', { tool: toolLabel })}
${toolOpen}

> ${t('design.vibe.guide.step2_note')}

### ${t('design.vibe.guide.step3_title', { start: startLine })}
${t('design.vibe.guide.step3_body', { autoFile: toolMeta.autoFile })}
\`\`\`
${startLine}
\`\`\`
> ${t('design.vibe.guide.step3_fallback_lead')}
> \`${t('design.vibe.guide.step3_fallback_prompt', { autoFile: toolMeta.autoFile, phase: skillPhaseHint })}\`${skillPromptLine}

${t('design.vibe.guide.step3_after')}

---
<!-- ============================================================ -->
<!--   👤 USERS: the guide above is for you.                      -->
<!--   🤖 AI AGENT: your instructions start immediately below.    -->
<!-- ============================================================ -->

## ${t('design.vibe.guide.h_agent_instructions')}
> ${t('design.vibe.guide.agent_intro')}

> ${t('design.vibe.guide.agent_authority')}

> ${t('design.vibe.guide.agent_env_check')}
> - ${t('design.vibe.guide.agent_env_fs')}
> - ${t('design.vibe.guide.agent_env_chat')}

${hasSkills ? `${t('design.vibe.guide.phase0_heading')}
${t('design.vibe.guide.phase0_list_index')}
${t('design.vibe.guide.phase0_list_reread')}
${t('design.vibe.guide.phase0_list_no_access')}

${t('design.vibe.guide.phase0_output_lead')}
  - ${t('design.vibe.guide.phase0_output_1')}
  - ${t('design.vibe.guide.phase0_output_2')}

${t('design.vibe.guide.phase0_warn')}
${t('design.vibe.guide.phase0_stop')}

` : ''}${t('design.vibe.guide.phase1_heading')}
${t('design.vibe.guide.phase1_lead')}
1. ${t('design.vibe.guide.phase1_file_spack')}
2. ${t('design.vibe.guide.phase1_file_ddd')}
3. ${t('design.vibe.guide.phase1_file_architecture')}

${t('design.vibe.guide.phase1_no_access')}

${t('design.vibe.guide.phase1_output_lead')}
1. ${t('design.vibe.guide.phase1_output_1')}
2. ${t('design.vibe.guide.phase1_output_2')}
3. ${t('design.vibe.guide.phase1_output_3')}
4. ${t('design.vibe.guide.phase1_output_4')}

${t('design.vibe.guide.phase1_stop')}

${t('design.vibe.guide.phase2_heading')}
- ${t('design.vibe.guide.phase2_reread')}
- ${t('design.vibe.guide.phase2_do')}
- ${t('design.vibe.guide.phase2_output')}

${t('design.vibe.guide.phase3_heading')}
- ${t('design.vibe.guide.phase3_reread')}
- ${t('design.vibe.guide.phase3_do')}${hasSkills ? '\n- ' + t('design.vibe.guide.phase3_skill') : ''}
- ${t('design.vibe.guide.phase3_output')}

${t('design.vibe.guide.phase4_heading')}
- ${t('design.vibe.guide.phase4_reread')}
- ${t('design.vibe.guide.phase4_do')}${hasSkills ? '\n- ' + t('design.vibe.guide.phase4_skill') : ''}
- ${t('design.vibe.guide.phase4_output')}

${t('design.vibe.guide.phase5_heading')}
- ${t('design.vibe.guide.phase5_reread')}
- ${t('design.vibe.guide.phase5_do')}
- ${t('design.vibe.guide.phase5_output')}

${t('design.vibe.guide.phase6_heading')}
${hasChecklist
    ? `- ${t('design.vibe.guide.phase6_checklist_open')}
- ${t('design.vibe.guide.phase6_checklist_verify')}`
    : `- ${t('design.vibe.guide.phase6_inventory_build')}
- ${t('design.vibe.guide.phase6_inventory_verify')}`}
- ${t('design.vibe.guide.phase6_opened')}
- ${t('design.vibe.guide.phase6_not_impl')}
- ${t('design.vibe.guide.phase6_repeat')}
- ${t('design.vibe.guide.phase6_output')}

${t('design.vibe.guide.h_mandatory_rules')}
1. ${t('design.vibe.guide.mr_stop')}
2. ${t('design.vibe.guide.mr_stack')}
3. ${t('design.vibe.guide.mr_no_assume')}
4. ${t('design.vibe.guide.mr_skills_lead')} ${hasSkills ? t('design.vibe.guide.mr_skills_yes') : t('design.vibe.guide.mr_skills_no')}
5. ${t('design.vibe.guide.mr_authority')}
6. ${t('design.vibe.guide.mr_reread')}
7. ${t('design.vibe.guide.mr_completion_lead')} ${hasChecklist ? t('design.vibe.guide.mr_completion_checklist') : t('design.vibe.guide.mr_completion_inventory')} ${t('design.vibe.guide.mr_completion_tail')}
8. ${t('design.vibe.guide.mr_resume_lead')} ${hasChecklist ? t('design.vibe.guide.mr_resume_checklist') : t('design.vibe.guide.mr_resume_inventory')} ${t('design.vibe.guide.mr_resume_tail')}

---

## ${t('design.vibe.guide.h_files')}

### ${t('design.vibe.guide.file_agents_title')}
${t('design.vibe.guide.file_agents_desc')}

### ${t('design.vibe.guide.file_start_here_title')}
${t('design.vibe.guide.file_start_here_desc')}
${skillSection}
### ${t('design.vibe.guide.file_spack_title')}
${t('design.vibe.guide.file_spack_desc')}

### ${t('design.vibe.guide.file_ddd_title')}
${t('design.vibe.guide.file_ddd_desc')}

### ${t('design.vibe.guide.file_arch_title')}
${t('design.vibe.guide.file_arch_desc')}
${hasChecklist ? `\n### ${t('design.vibe.guide.file_checklist_title')}\n${t('design.vibe.guide.file_checklist_desc')}\n` : ''}
---

${hasSkills ? t('design.vibe.guide.final_start_phase0') : t('design.vibe.guide.final_start_phase1')}
`
}

/** skill 객체 → frontmatter 포함 .md 문자열.
 *  @param {Function} t vue-i18n translate (결정성 위해 주입) */
export function skillToMd(t, skill) {
  const lines = [
    `---`,
    `name: ${skill.name}`,
    skill.trigger_condition ? `description: ${skill.trigger_condition}` : '',
    `---`,
    ``,
    `# ${skill.name}`,
    ``,
    `**ID:** \`${skill.id}\`  `,
    skill.scope             ? `**${t('design.vibe.skill_md.scope')}** ${skill.scope}  ` : '',
    skill.priority          ? `**${t('design.vibe.skill_md.priority')}** ${skill.priority}  ` : '',
    skill.trigger_condition ? `**${t('design.vibe.skill_md.applies_when')}** ${skill.trigger_condition}` : '',
    ``,
    `---`,
    ``,
  ].filter(l => l !== null)

  if (Array.isArray(skill.instructions) && skill.instructions.length) {
    lines.push(`## ${t('design.vibe.skill_md.instructions')}`, ``)
    skill.instructions.forEach((inst, i) => lines.push(`${i + 1}. ${inst}`))
    lines.push(``)
  }

  const visibleTags = Array.isArray(skill.tags)
    ? skill.tags.filter(tag => !(typeof tag === 'string' && tag.startsWith('cat:')))   // 내부 cat: 마커는 숨김
    : []
  if (visibleTags.length) {
    lines.push(`## ${t('design.vibe.skill_md.tags')}`, ``)
    lines.push(visibleTags.map(tag => `\`${tag}\``).join(' '), ``)
  }

  return lines.join('\n')
}

/** 알려진 카테고리 — `cat:` 마커 없는 레거시(구) 스킬 fallback 용. core 포함. */
export const KNOWN_CATEGORIES = new Set([
  'frontEnd', 'backEnd', 'db', 'mobile',
  'design', 'security', 'devops', 'testing', 'ai', 'core',
  'frontEndReact', 'backEndNode', 'backEndPython',
])

/** 폴더명 안전 정규화 — 경로구분자·Windows 무효문자·공백류 → '-', 앞뒤 '-' 정리. 빈값이면 'etc'.
 *  공백류를 [\s\u0085\u001c-\u001f\uFEFF] 로 명시하는 이유: JS \s 와 Python \s 의 유니코드 공백 정의가
 *  NEL(U+0085)·BOM(U+FEFF)·정보구분자(U+001C-1F)에서 갈린다. 양쪽에 이 합집합을 명시해 BE
 *  _normalize_category 와 바이트 단위로 일치시킨다. trim() 대신 앞뒤 '-' 제거를 쓰는 것도 두 엔진의
 *  trim/strip 공백정의 차(앞뒤 NEL/BOM)를 없애기 위함. (zip 폴더명 ↔ orchestrator 참조경로 일치 보장) */
export function normalizeCategory(raw) {
  const s = String(raw || '')
    .replace(/[\\/]+/g, '-')
    .replace(/[<>:*?"|]/g, '-')
    .replace(/[\s\u0085\u001c-\u001f\uFEFF]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'etc'
}

/** skill 의 카테고리(= zip 하위 폴더명) 추출.
 *  1순위: `cat:` 마커 태그 — 동적 폴더 카테고리("결제모듈" 등)를 그대로 보존 → 정규화.
 *  2순위(레거시): KNOWN_CATEGORIES 매칭. 둘 다 없으면 'etc'. */
export function getCategoryFromSkill(skill) {
  const marked = skill.tags?.find(t => typeof t === 'string' && t.startsWith('cat:'))
  if (marked) return normalizeCategory(marked.slice(4))
  return skill.tags?.find(t => KNOWN_CATEGORIES.has(t)) || 'etc'
}

/**
 * [#6] skill 파일 base 이름. 같은 카테고리 안에서 파일명이 겹치면 zip 에서
 * 뒤엣것이 앞엣것을 silent overwrite → 스킬 유실. id 를 suffix 로 붙여 유니크 보장.
 * BE create_md_pipeline.get_skill_path() 와 **동일 규칙**이어야 오케스트레이터가
 * 참조하는 skills/ 경로와 zip 내 실제 파일 경로가 정확히 일치한다.
 *   - 태그 있으면: `{tags[0]}-{id}`  (예: backEnd-3)
 *   - 태그 없으면: `{id}`            (예: login)
 *   id = skill.id 에서 선두 'SKL-' 제거 + 소문자.
 */
export function skillFileBase(skill) {
  const idPart = (skill.id || '').replace(/^SKL-/i, '').toLowerCase()
  const tag = skill.tags?.find(t => typeof t === 'string' && !t.startsWith('cat:'))   // cat: 마커 제외한 첫 태그
  const base = tag ? `${tag}-${idPart}` : idPart
  // 경로 구분자('/'·'\')와 Windows 무효 문자('<>:*?"|')·공백을 '-' 로 치환.
  // BE get_skill_path() 와 동일 규칙 — 두 함수가 다르면 orchestrator 경로와 zip 경로가 어긋난다.
  return base.replace(/[\\/]+/g, '-').replace(/[<>:*?"|]/g, '-').replace(/ /g, '-')
}

/** JSZip 인스턴스에 skill .md 들을 카테고리 폴더로 추가 (zip 을 변형).
 *  @param {Function} t vue-i18n translate (skillToMd 에 전달 — 인자 마지막으로 받아 호출부 churn 최소화) */
export function addSkillsToZip(zip, skillList, t) {
  if (!skillList || skillList.length === 0) return
  for (const skill of skillList) {
    const category = getCategoryFromSkill(skill)
    zip.folder(category).file(`${skillFileBase(skill)}.md`, skillToMd(t, skill))
  }
}
