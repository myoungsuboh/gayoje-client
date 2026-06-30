/**
 * designMarkdown.js — 설계 그래프(JSON) → 사람·LLM이 읽는 단일 마크다운 (2026-06-13).
 *
 * [배경] Code 페이지 핸드오프 번들(AgentExportPanel)의 spec/ 폴더가 비어 나가던
 * 버그 수정. getSpack/getDDD/getArchitecture 는 그래프 JSON({apis,entities,...})을
 * 반환하는데, 기존 fetchMd 는 .md|.content 폴백만 가져 전부 null 이었다.
 *
 * Design 페이지 export(경로1)는 BE create_md 큐(최대 20분 LLM)로 풍부한 md 를
 * 받지만, Code 페이지(경로2)는 "빠른 번들"이라 그 큐를 쓸 수 없다. 그래서 이미
 * 받아둔 그래프 JSON 을 클라이언트에서 경량 변환한다 (LLM 비용 0·즉시).
 *
 * 출력은 obsidianExport(노드당 개별 노트 vault)와 달리 "문서 1개"다 — spec/spack.md
 * 처럼 한 파일에 전체 섹션을 담는다. 노드 접근은 nodeUtils.getNodeProp 로 방어
 * (properties 중첩·필드 누락 허용).
 *
 * [i18n — 2026-06-26]
 * en/ja/zh 사용자의 spec/*.md·obsidian vault·open-questions 가 한국어 라벨로 나가던
 * 누락 해소. 렌더 함수(designGraphToMarkdown·GAP_SUFFIX·buildOpenQuestionsMd)가 vue-i18n
 * translate `t` 를 받아 라벨/헤더/footer 를 `design.spec_md.*` 로 현지화한다.
 * 갭 판정 헬퍼(apiGaps·entityGaps·collectDesignGaps 의 라벨)는 한국어 '내부 키'를 그대로
 * 유지하고(드리프트·테스트 계약 보존), 표시 직전에만 t 로 번역한다. ko 면 t 가 원문
 * 한국어를 반환하므로 출력은 바이트 동일(골든 회귀 0). `⚠️ 미정` 마커는 핸드오프 번들
 * 규칙(work_rules)이 참조하는 센티넬이라 전 로케일 verbatim 유지.
 */
import { getNodeProp } from '@/utils/nodeUtils'

const name = (n) => getNodeProp(n, 'name') || getNodeProp(n, 'title') || getNodeProp(n, 'id') || ''
const desc = (n) => getNodeProp(n, 'description') || getNodeProp(n, 'desc') || ''
const arr = (v) => (Array.isArray(v) ? v : [])

// 갭 라벨 내부 키(한국어 — apiGaps/entityGaps 반환값) → i18n 키 서픽스. 표시 직전 t 로 번역.
const GAP_KEY = { '요청스펙': 'request_spec', '응답스펙': 'response_spec', '담당서비스': 'owner_service', '속성': 'attributes' }
const gapLabel = (t, g) => (GAP_KEY[g] ? t(`design.spec_md.gap.${GAP_KEY[g]}`) : g)

// [2026-06-13 스펙 갭 인라인 마커] BE create_md_pipeline.py 의 IMPLEMENTATION-CHECKLIST
// 와 동일 어휘로, 빈 명세를 spec md 본문에 인라인 표시한다. 비개발자는 못 고치는
// 갭을 그대로 Cursor 에 넘겨 할루시네이션 나는 것을 막는 핵심 — 에이전트가 본문에서
// ⚠ 를 마주쳐 "지어내지 말고 질문" 하도록. (별도 _GAPS.md/eval-score fetch 불필요:
// getSpack 응답에 request_body·response_body·attributes 가 decode 되어 옴.)
// [i18n] `⚠️ 미정`(센티넬)은 verbatim, 괄호 안 라벨·뒤 안내문만 t 로 번역.
/** 갭 라벨 배열 → 인라인 마커 접미. 빈 배열이면 빈 문자열. (export — obsidian 경로 공유) */
export const GAP_SUFFIX = (t, gaps) => (gaps.length ? ` ⚠️ 미정(${gaps.map((g) => gapLabel(t, g)).join('·')}) — ${t('design.spec_md.dont_guess')}` : '')

// request_body/response_body 의 fields 수 (BE _body_field_count 와 동일 계약).
// FE 는 보통 decode 된 객체로 받지만, JSON string 폴백도 처리.
const bodyFieldCount = (node, key) => {
  let v = getNodeProp(node, key)
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { return 0 }
  }
  return v && Array.isArray(v.fields) ? v.fields.length : 0
}
const attrCount = (node) => {
  let a = getNodeProp(node, 'attributes')
  if (typeof a === 'string') {  // legacy JSON string 폴백 (bodyFieldCount 와 일관)
    try { a = JSON.parse(a) } catch { return 0 }
  }
  return Array.isArray(a) ? a.length : 0
}

// ─── 갭 판정 헬퍼 (export — designMarkdown spec md 와 obsidian vault 가 공유) ──
// 세 핸드오프 경로의 ⚠ 미정 어휘·기준을 한 곳에서 관리해 드리프트 방지.
// [i18n] 반환 라벨은 한국어 '내부 키'(요청스펙 등) — 표시 경로가 gapLabel 로 번역.

/** API 노드 식별자 — id 우선, 없으면 Neo4j identity 폴백(UI SpackTab 과 동일 규칙). */
const apiId = (a) => String(getNodeProp(a, 'id') || getNodeProp(a, 'identity') || '')

/**
 * SPACK raw → 담당서비스 갭 판정 컨텍스트.
 * [2026-06-13 검수 수정] 게이트를 BE create_md_pipeline 의 multi_service 기준으로 통일:
 * "서비스가 2개 이상(MSA)인데 이 API 가 어느 서비스인지 매핑 안 됨"이 갭. 단일 서비스면
 * 목적지가 자명하므로 면제. (이전 hasMapping 기준은 MSA+매핑0 에서 가장 위험한 갭을
 * 면제하고 단일서비스에서 오탐하던 버그.) archServiceCount 미전달 시 담당서비스 갭 미판정.
 */
export const buildSpackMappingCtx = (spackRaw, archServiceCount = 0) => {
  const mappedApiIds = new Set(
    arr(spackRaw?.api_service_rels).map((r) => String(r?.source_id ?? '')).filter(Boolean),
  )
  return { mappedApiIds, multiService: (archServiceCount || 0) > 1 }
}

/** API 노드 → 갭 라벨 배열 (요청스펙·응답스펙·담당서비스). ctx 는 buildSpackMappingCtx 결과. */
export const apiGaps = (a, ctx = {}) => {
  const method = String(getNodeProp(a, 'method') || '').toUpperCase()
  const gaps = []
  if (['POST', 'PUT', 'PATCH'].includes(method) && bodyFieldCount(a, 'request_body') === 0) gaps.push('요청스펙')
  if (bodyFieldCount(a, 'response_body') === 0) gaps.push('응답스펙')
  if (ctx.multiService && !ctx.mappedApiIds?.has(apiId(a))) gaps.push('담당서비스')
  return gaps
}

/** Entity 노드 → 갭 라벨 배열 (속성). Aggregate 는 invariants 라 대상 아님(호출부가 entity 에만 적용). */
export const entityGaps = (e) => (attrCount(e) === 0 ? ['속성'] : [])

/** "- **이름** — 설명" 한 줄 (설명 없으면 이름만). */
const bullet = (n, label) => {
  const nm = label || name(n)
  const d = desc(n)
  return d ? `- **${nm}** — ${d}` : `- **${nm}**`
}

/** 섹션 — 항목 없으면 통째로 생략(빈 헤딩 노이즈 방지). title 은 호출부가 이미 번역해 전달. */
const section = (title, items, render) => {
  const rows = arr(items).map(render).filter(Boolean)
  return rows.length ? [`## ${title}`, '', ...rows, ''] : []
}

// [2026-06-13 카운트 SSOT] 빌더는 { body, gapCount } 반환 — 갭 배열에서 마커와
// 카운트를 함께 파생(designGraphToMarkdown 이 렌더 텍스트를 정규식으로 되읽던 이중
// 진실원 제거: '2 vs 3' 회귀의 근본). gapCount 는 라벨 누적(BE spec_gaps 와 동일 기준).

/** SPACK 그래프 → { body, gapCount }. 빈 명세는 인라인 ⚠ 마커(공유 헬퍼). */
const spackToMd = (t, raw, opts = {}) => {
  const ctx = buildSpackMappingCtx(raw, opts.archServiceCount)
  let gapCount = 0
  const apiLine = (a) => {
    const method = String(getNodeProp(a, 'method') || '').toUpperCase()
    const path = getNodeProp(a, 'path') || getNodeProp(a, 'endpoint') || ''
    const head = method && path ? `\`${method} ${path}\`` : (name(a) || path || 'API')
    const d = desc(a) || name(a)
    const base = d && d !== head ? `- ${head} — ${d}` : `- ${head}`
    const g = apiGaps(a, ctx)
    gapCount += g.length
    return base + GAP_SUFFIX(t, g)
  }
  const entLine = (e) => {
    const g = entityGaps(e)
    gapCount += g.length
    return bullet(e) + GAP_SUFFIX(t, g)
  }
  const body = [
    ...section('API', raw.apis, apiLine),
    // Entity: attributes(데이터 항목)가 비면 ⚠ — 에이전트가 모델을 지어내는 최대 위험.
    ...section(t('design.spec_md.sec.entity'), raw.entities, entLine),
    ...section(t('design.spec_md.sec.policy'), raw.policies, (p) => {
      const rel = getNodeProp(p, 'related_entity')
      return bullet(p) + (rel ? ` _(${t('design.spec_md.related')}: ${rel})_` : '')
    }),
  ]
  return { body, gapCount }
}

/** DDD 그래프 → { body, gapCount }. DomainEntity 속성갭만 대상(BE create_md_pipeline 일치).
 *  Aggregate 는 invariants 보유(attributes 없음)라 속성갭 비대상 — 오탐 금지. */
const dddToMd = (t, raw) => {
  let gapCount = 0
  const deLine = (e) => {
    const g = entityGaps(e)  // DomainEntity 는 SPACK Entity 와 동일 attributes 구조(decode 공유)
    gapCount += g.length
    return bullet(e) + GAP_SUFFIX(t, g)
  }
  return {
    body: [
      ...section('Bounded Context', raw.contexts, (c) => bullet(c)),
      ...section('Aggregate', raw.aggregates, (a) => bullet(a)),
      ...section('Domain Entity', raw.domain_entities, deLine),
      ...section('Domain Event', raw.domain_events, (e) => bullet(e)),
    ],
    gapCount,
  }
}

/** Architecture 그래프 → { body, gapCount }. (gapCount 0) */
const archToMd = (t, raw) => {
  const svcLine = (s) => {
    const tech = getNodeProp(s, 'tech_stack')
    return bullet(s) + (tech ? ` _(${t('design.spec_md.stack')}: ${tech})_` : '')
  }
  // connection 은 source/target id → 이름 매핑
  const idName = new Map()
  for (const n of [...arr(raw.services), ...arr(raw.databases)]) {
    const id = getNodeProp(n, 'id')
    if (id) idName.set(String(id), name(n))
  }
  const connLine = (c) => {
    const s = idName.get(String(c?.source_id ?? '')) || c?.source_id
    const t2 = idName.get(String(c?.target_id ?? '')) || c?.target_id
    if (!s || !t2) return ''
    return `- ${s} → ${t2}${c?.type ? ` \`${c.type}\`` : ''}`
  }
  return {
    body: [
      ...section('Service', raw.services, svcLine),
      ...section('Database', raw.databases, (d) => bullet(d)),
      ...section(t('design.spec_md.sec.connection'), raw.connections, connLine),
    ],
    gapCount: 0,
  }
}

/**
 * Architecture 그래프 raw → 기술 스택 라벨 목록 (중복 제거, 최대 6개).
 * 핸드오프 프롬프트의 "역할"(R1) 자동 주입에 쓴다 — "FastAPI 시니어" 식.
 * 없으면 빈 배열 → 호출부가 역할 주입을 graceful skip.
 */
export const collectTechStack = (archRaw) => {
  const out = []
  const push = (v) => {
    String(v || '')
      .split(/[,/·|]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => { if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s) })
  }
  for (const n of [...arr(archRaw?.services), ...arr(archRaw?.databases)]) {
    push(getNodeProp(n, 'tech_stack'))
  }
  return out.slice(0, 6)
}

const BUILDERS = { spack: spackToMd, ddd: dddToMd, arch: archToMd }

/** 문서 제목 — 'SPACK — 상세 스펙' 식(서술부만 로케일). */
const titleFor = (t, kind) => t(`design.spec_md.title.${kind}`)

/**
 * 설계 그래프 raw(result[0]) → 단일 마크다운 문서. 데이터 없으면 빈 문자열.
 *
 * @param {Function} t  vue-i18n translate (라벨/헤더 현지화 — 결정성 위해 주입)
 * @param {'spack'|'ddd'|'arch'} kind
 * @param {Object} raw  extractRaw(response) 결과 (그래프 JSON)
 * @param {Object} [opts]  { archServiceCount } — 담당서비스 갭 multiService 게이트용
 * @returns {string}
 */
export const designGraphToMarkdown = (t, kind, raw, opts = {}) => {
  const build = BUILDERS[kind]
  if (!build || !raw || typeof raw !== 'object') return ''
  const { body, gapCount } = build(t, raw, opts)
  if (!body.length) return ''  // 노드 0 → 빈 문서(호출부가 spec/에서 제외)
  // gapCount 는 빌더가 갭 배열에서 직접 누적한 라벨 수(BE spec_gaps·vault totalSpecGaps 와 동일 기준).
  const gapHeader = gapCount
    ? [`> ${t('design.spec_md.gap_header', { n: gapCount })}`, '']
    : []
  return [`# ${titleFor(t, kind)}`, '', ...gapHeader, ...body, `> ${t('design.spec_md.snapshot_footer')}`, ''].join('\n')
}

// ─── [2026-06-22] 미정(갭) 집계 — 핸드오프 open-questions.md 용 ───────────────
// designGraphToMarkdown 은 갭을 본문에 인라인(⚠)으로 분산 표시한다. PM·아키텍트는
// "아직 결정 안 된 것"을 한 곳에서 의사결정 큐로 보고 싶어 한다 — 동일 헬퍼
// (apiGaps·entityGaps·buildSpackMappingCtx)로 라벨을 모아 단일 목록으로 집계.
// 갭 판정 기준은 spec md·obsidian vault 와 완전히 동일(드리프트 없음).

/** API 노드 → 표시명 (spackToMd apiLine 의 head 와 동일 규칙). */
const apiLabel = (a) => {
  const method = String(getNodeProp(a, 'method') || '').toUpperCase()
  const path = getNodeProp(a, 'path') || getNodeProp(a, 'endpoint') || ''
  return method && path ? `${method} ${path}` : (name(a) || path || 'API')
}

/**
 * SPACK/DDD raw → 미정(갭) 집계. designGraphToMarkdown 과 동일 헬퍼·기준.
 * gaps[] 는 한국어 내부 키(표시 경로가 번역). 이름 미정 폴백만 t 로 현지화.
 * @param {Function} t  vue-i18n translate
 * @param {Object} spackRaw  getSpack extractRaw 결과
 * @param {Object} dddRaw    getDDD extractRaw 결과
 * @param {number} [archServiceCount]  담당서비스 갭 multiService 게이트용
 * @returns {{ items: Array<{kind:string, name:string, gaps:string[]}>, total:number }}
 */
export const collectDesignGaps = (t, spackRaw, dddRaw, archServiceCount = 0) => {
  const items = []
  const ctx = buildSpackMappingCtx(spackRaw, archServiceCount)
  const unnamed = () => t('design.spec_md.unnamed')
  for (const a of arr(spackRaw?.apis)) {
    const gaps = apiGaps(a, ctx)
    if (gaps.length) items.push({ kind: 'API', name: apiLabel(a), gaps })
  }
  for (const e of arr(spackRaw?.entities)) {
    const gaps = entityGaps(e)
    if (gaps.length) items.push({ kind: 'Entity', name: name(e) || unnamed(), gaps })
  }
  for (const e of arr(dddRaw?.domain_entities)) {
    const gaps = entityGaps(e)
    if (gaps.length) items.push({ kind: 'Domain Entity', name: name(e) || unnamed(), gaps })
  }
  return { items, total: items.reduce((s, i) => s + i.gaps.length, 0) }
}

/**
 * 미정 집계 → open-questions.md (항목 없으면 빈 문자열 → 호출부가 zip 에서 제외).
 * 종류(API·Entity·Domain Entity)별로 묶고, 각 항목에 어떤 스펙이 비었는지 라벨을 단다.
 * @param {Function} t  vue-i18n translate
 * @param {{items:Array, total:number}} gapResult  collectDesignGaps 결과
 * @returns {string}
 */
export const buildOpenQuestionsMd = (t, gapResult) => {
  if (!gapResult || !gapResult.items?.length) return ''
  const { items, total } = gapResult
  const out = [
    `# ${t('design.spec_md.oq.title')}`,
    '',
    `> ${t('design.spec_md.oq.lead', { n: total })}`,
    '',
  ]
  const order = ['API', 'Entity', 'Domain Entity']
  const byKind = new Map()
  for (const it of items) {
    if (!byKind.has(it.kind)) byKind.set(it.kind, [])
    byKind.get(it.kind).push(it)
  }
  const kinds = [...byKind.keys()].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  for (const kind of kinds) {
    out.push(`## ${kind}`, '')
    for (const it of byKind.get(kind)) out.push(`- **${it.name}** — ${t('design.spec_md.undecided_label')}: ${it.gaps.map((g) => gapLabel(t, g)).join(', ')}`)
    out.push('')
  }
  out.push('---', t('design.spec_md.oq.footer'), '')
  return out.join('\n')
}
