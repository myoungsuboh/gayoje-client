/**
 * obsidianExport.js — Deliverables "Obsidian Vault" 변환 코어 (2026-06-12).
 *
 * [목적] 설계 그래프(SPACK·DDD·Architecture JSON)와 기획 문서(PRD/CPS md)를
 * Obsidian vault 호환 구조(마크다운 + [[위키링크]] + frontmatter)로 변환한다.
 * 사용자는 ZIP 을 풀어 Obsidian 으로 열면 그래프 뷰에서 자기 기획의 구조를
 * 시각적으로 보고, 그 위에서 계속 키워 갈 수 있다 (단방향 스냅샷).
 *
 * [설계 원칙]
 *  - 순수 함수: 네트워크/DOM 없음 — 호출부(HandoffSection)가 fetch 해 주입.
 *    단위 테스트가 쉬워야 파일명↔링크 불일치(고아 링크) 회귀를 막을 수 있다.
 *  - 파일명과 위키링크는 "반드시" 같은 새니타이저를 거친다 — 불일치 = 고아 링크.
 *  - 필드 누락은 해당 노트만 생략/축소 (전체 실패 금지) — getNodeProp 방어 패턴.
 *  - .obsidian/ 설정 폴더는 동봉하지 않는다 (버전 종속 + 사용자 설정 침범).
 *
 * [데이터 모양 — design 탭들과 동일 계약]
 *  spack: { apis[], entities[], policies[], api_service_rels[], entity_mapping_rels[], implement_rels[], internal_rels[] }
 *  ddd:   { contexts[], aggregates[], domain_entities[], domain_events[], aggregate_service_rels[], trigger_rels[], internal_rels[] }
 *  arch:  { services[], databases[], connections[] }
 *  노드:  { id, name|title, description|desc, ... }  (properties 중첩 가능 → getNodeProp)
 *  관계:  { type, source_id, target_id }
 */
import { getNodeProp } from '@/utils/nodeUtils'
// [2026-06-13] 설계 갭 ⚠ 마커를 designMarkdown(spec md)과 공유 — 세 핸드오프
// 경로(코드 ZIP·Deliverables ZIP·Obsidian vault)의 미정 표시를 통일.
import { apiGaps, entityGaps, buildSpackMappingCtx, GAP_SUFFIX } from '@/utils/designMarkdown'
import { extractScreenNames } from '@/utils/prdScreens'
import { parseAttrs } from '@/utils/erdGraph'   // ERD 화면과 동일한 속성 정규화 재활용

// ─── 이름/YAML 안전화 ────────────────────────────────────────────────

/**
 * 노트 파일명 새니타이즈 — Windows 금지문자(\/:*?"<>|) + 위키링크 금지문자([]#^|)
 * 제거. 링크 생성도 이 함수를 거친 이름만 사용한다.
 */
export const sanitizeNoteName = (raw) => {
  const s = String(raw ?? '')
    .replace(/[\\/:*?"<>|[\]#^]/g, ' ')   // 금지문자 → 공백
    .replace(/\s+/g, ' ')                  // 연속 공백 정리
    .trim()
    .slice(0, 80)                          // 과도한 길이 컷 (OS 경로 한도 방어)
    .trim()
  return s || 'untitled'
}

/** YAML frontmatter 값 — 콜론/따옴표 포함 이름 대비, 항상 쌍따옴표 escape. */
export const yamlStr = (v) => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * 조회 API raw(result[0]) → 마크다운 본문 추출.
 *
 * [2026-06-12 더블체크에서 발견] getPRD 는 { result: [{ prd_content }] } 라
 * fetchMd(md/content 폴백)로는 JSON 덤프가 떨어진다 — useSpecCoverage 의
 * _prdBody 와 동일한 계약(prd_content > output > content + \\n 정규화)을
 * 순수 함수로 공유한다. (getCPS 는 content|output.)
 */
export const extractDocMd = (raw) =>
  String(raw?.prd_content || raw?.output || raw?.content || '').replace(/\\n/g, '\n')

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────

const nodeName = (n) => getNodeProp(n, 'name') || getNodeProp(n, 'title') || getNodeProp(n, 'id') || ''
const nodeDesc = (n) => getNodeProp(n, 'description') || getNodeProp(n, 'desc') || ''
const arr = (v) => (Array.isArray(v) ? v : [])
/** md 테이블 셀 — 파이프(|)·개행 이스케이프(표 깨짐 방지). */
const mdCell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()

/** API 노트 표시명: "POST /users" 식 (method+path 없으면 name 으로). */
const apiDisplayName = (a) => {
  const method = String(getNodeProp(a, 'method') || '').toUpperCase()
  const path = getNodeProp(a, 'path') || getNodeProp(a, 'endpoint') || ''
  if (method && path) return `${method} ${path}`
  return nodeName(a) || path || 'API'
}

/**
 * 노트 이름 레지스트리 — 동명 충돌 시 " (2)" suffix.
 * 모든 파일명/링크가 이 레지스트리를 통해서만 만들어진다.
 */
const createRegistry = () => {
  const used = new Set()
  const byId = new Map()   // node id → { name, folder, type }
  const claim = (rawName) => {
    const base = sanitizeNoteName(rawName)
    let name = base
    let i = 2
    while (used.has(name.toLowerCase())) name = `${base} (${i++})`
    used.add(name.toLowerCase())
    return name
  }
  return { claim, byId }
}

// ─── 본체 ────────────────────────────────────────────────────────────

/**
 * Obsidian vault 파일 목록 생성.
 *
 * @param {Object} opts
 * @param {string} opts.projectName
 * @param {string} [opts.prdMd]   PRD 마크다운 (없으면 생략)
 * @param {string} [opts.cpsMd]   CPS 마크다운 (없으면 생략)
 * @param {Object} [opts.spack]   SPACK raw JSON
 * @param {Object} [opts.ddd]     DDD raw JSON
 * @param {Object} [opts.arch]    Architecture raw JSON
 * @param {Function} opts.t       i18n t — 폴더명/라벨/README 현지화
 * @returns {Array<{path: string, content: string}>}
 */
export const buildObsidianVault = ({ projectName, prdMd = '', cpsMd = '', spack = {}, ddd = {}, arch = {}, t }) => {
  const reg = createRegistry()
  const files = []
  const tr = (key, params) => (typeof t === 'function' ? t(key, params) : key)

  const F = {
    plan: sanitizeNoteName(tr('deliverables.obsidian.folder_plan')),
    api: sanitizeNoteName(tr('deliverables.obsidian.folder_api')),
    data: sanitizeNoteName(tr('deliverables.obsidian.folder_data')),
    policy: sanitizeNoteName(tr('deliverables.obsidian.folder_policy')),
    domain: sanitizeNoteName(tr('deliverables.obsidian.folder_domain')),
    service: sanitizeNoteName(tr('deliverables.obsidian.folder_service')),
    screen: sanitizeNoteName(tr('deliverables.obsidian.folder_screen')),
  }
  const HOME = reg.claim(tr('deliverables.obsidian.home_title'))

  // ── 1) 노드 수집 + 이름 선점 (링크 대상이 먼저 확정돼야 고아 링크가 없다) ──
  const CATS = [
    { key: 'api', folder: F.api, type: 'api', items: arr(spack.apis), display: apiDisplayName },
    { key: 'entity', folder: F.data, type: 'entity', items: arr(spack.entities), display: nodeName },
    { key: 'policy', folder: F.policy, type: 'policy', items: arr(spack.policies), display: nodeName },
    { key: 'context', folder: F.domain, type: 'bounded-context', items: arr(ddd.contexts), display: nodeName },
    { key: 'aggregate', folder: F.domain, type: 'aggregate', items: arr(ddd.aggregates), display: nodeName },
    { key: 'domain_entity', folder: F.domain, type: 'domain-entity', items: arr(ddd.domain_entities), display: nodeName },
    { key: 'event', folder: F.domain, type: 'domain-event', items: arr(ddd.domain_events), display: nodeName },
    { key: 'service', folder: F.service, type: 'service', items: arr(arch.services), display: nodeName },
    { key: 'database', folder: F.service, type: 'database', items: arr(arch.databases), display: nodeName },
  ]
  const nodes = []  // { node, name, folder, type, cat }
  for (const cat of CATS) {
    for (const node of cat.items) {
      const name = reg.claim(cat.display(node))
      const id = getNodeProp(node, 'id')
      const meta = { node, name, folder: cat.folder, type: cat.type, cat: cat.key }
      nodes.push(meta)
      if (id) reg.byId.set(String(id), meta)
    }
  }

  // ── 2) 관계 → 양방향 링크 (rel 의미를 모르더라도 그래프 엣지로 보존) ──
  const linksByName = new Map()  // noteName → [{ target, type }]
  const addLink = (a, b, type) => {
    if (!a || !b || a === b) return
    const list = linksByName.get(a) || []
    if (!list.some((l) => l.target === b)) list.push({ target: b, type })
    linksByName.set(a, list)
  }
  const RELS = [
    ...arr(spack.api_service_rels), ...arr(spack.entity_mapping_rels),
    ...arr(spack.implement_rels), ...arr(spack.internal_rels),
    ...arr(ddd.aggregate_service_rels), ...arr(ddd.trigger_rels), ...arr(ddd.internal_rels),
    ...arr(arch.connections),
  ]
  for (const r of RELS) {
    const s = reg.byId.get(String(r?.source_id ?? ''))
    const tgt = reg.byId.get(String(r?.target_id ?? ''))
    if (!s || !tgt) continue  // 한쪽이 export 대상 밖이면 생략 (고아 링크 방지)
    const type = String(r?.type || 'REL')
    addLink(s.name, tgt.name, type)
    addLink(tgt.name, s.name, type)
  }
  // policy.related_entity — 이름 문자열로 연결되는 레거시 관계
  for (const m of nodes.filter((n) => n.cat === 'policy')) {
    const relName = getNodeProp(m.node, 'related_entity')
    if (!relName) continue
    const target = nodes.find((n) => n.cat === 'entity' && nodeName(n.node) === relName)
    if (target) { addLink(m.name, target.name, 'RELATED_ENTITY'); addLink(target.name, m.name, 'RELATED_ENTITY') }
  }

  // ── 3) 노드 노트 렌더 ──
  const relLabel = tr('deliverables.obsidian.section_related')
  const emptyWarn = tr('deliverables.obsidian.empty_node_warn')
  // [2026-06-13] 설계 스펙 갭(요청·응답·담당서비스·속성) — designMarkdown 과 동일 기준.
  // emptyWarn(노드 설명 부재)과는 별개 신호: 설명이 있어도 스펙이 비면 ⚠ 미정 으로 잡는다.
  const gapCtx = buildSpackMappingCtx(spack, arr(arch?.services).length)
  const nodeSpecGaps = (m) => {
    if (m.cat === 'api') return apiGaps(m.node, gapCtx)
    if (m.cat === 'entity' || m.cat === 'domain_entity') return entityGaps(m.node)  // DDD DomainEntity 도 속성갭(BE 일치)
    return []
  }
  let totalSpecGaps = 0
  for (const m of nodes) {
    const front = [
      '---',
      `type: ${yamlStr(m.type)}`,
      `project: ${yamlStr(projectName)}`,
      `tags: [harness/${m.cat}]`,
    ]
    if (m.cat === 'api') {
      const method = String(getNodeProp(m.node, 'method') || '').toUpperCase()
      const path = getNodeProp(m.node, 'path') || getNodeProp(m.node, 'endpoint') || ''
      if (method) front.push(`method: ${yamlStr(method)}`)
      if (path) front.push(`path: ${yamlStr(path)}`)
    }
    front.push('---')

    const desc = nodeDesc(m.node)
    const specGaps = nodeSpecGaps(m)
    if (specGaps.length) totalSpecGaps += specGaps.length
    const links = linksByName.get(m.name) || []
    const body = [
      front.join('\n'),
      '',
      `# ${m.name}`,
      '',
      desc || `> ⚠ ${emptyWarn}`,
      // 설명과 무관한 스펙 갭 — 설명이 있어도 스펙이 비면 표시(에이전트 추측 차단).
      ...(specGaps.length ? [`>${GAP_SUFFIX(tr, specGaps)}`] : []),
      '',
    ]
    // [2026-06-18] entity/domain_entity 속성 테이블 — ERD 화면(parseAttrs)과 동일 정규화.
    // 설계 화면엔 보이는데 export 노트엔 빠지던 갭 보완.
    if (m.cat === 'entity' || m.cat === 'domain_entity') {
      const attrs = parseAttrs(getNodeProp(m.node, 'attributes'))
      if (attrs.length) {
        body.push(
          `## ${tr('deliverables.obsidian.section_attrs')}`,
          '',
          `| ${tr('deliverables.obsidian.attr_field')} | ${tr('deliverables.obsidian.attr_type')} | ${tr('deliverables.obsidian.attr_required')} | ${tr('deliverables.obsidian.attr_constraint')} |`,
          '| --- | --- | :---: | --- |',
          ...attrs.map((a) => `| ${mdCell(a.name)} | ${mdCell(a.type) || '—'} | ${a.required ? '✓' : ''} | ${mdCell(a.constraint)} |`),
          '',
        )
      }
    }
    if (links.length) {
      body.push(`## ${relLabel}`, '')
      for (const l of links) body.push(`- [[${l.target}]] \`${l.type}\``)
      body.push('')
    }
    body.push(`[[${HOME}]]`)
    files.push({ path: `${m.folder}/${m.name}.md`, content: body.join('\n') + '\n' })
  }

  // ── 4) 기획 문서 (PRD/CPS — 원문 그대로 + frontmatter) ──
  const planNotes = []
  if (prdMd && prdMd.trim()) {
    const name = reg.claim('PRD')
    planNotes.push(name)
    files.push({ path: `${F.plan}/${name}.md`, content: `---\ntype: "prd"\nproject: ${yamlStr(projectName)}\ntags: [harness/plan]\n---\n\n${prdMd.trim()}\n\n[[${HOME}]]\n` })
  }
  if (cpsMd && cpsMd.trim()) {
    const name = reg.claim('CPS')
    planNotes.push(name)
    files.push({ path: `${F.plan}/${name}.md`, content: `---\ntype: "cps"\nproject: ${yamlStr(projectName)}\ntags: [harness/plan]\n---\n\n${cpsMd.trim()}\n\n[[${HOME}]]\n` })
  }

  // ── 5) PRD 에서 Screen 노트 추출 (+ 이름 언급 기반 API/Entity 링크) ──
  // Screen 정규식은 prdScreens(단일 출처)와 공유 — useSpecCoverage 와 드리프트 방지.
  const screenNotes = []
  if (prdMd) {
    const seen = new Set()
    for (const nm of extractScreenNames(prdMd)) {
      if (seen.has(nm)) continue
      seen.add(nm)
      const name = reg.claim(nm)
      screenNotes.push(name)
      // 언급 매칭: 화면 이름에 포함된 entity/api 이름 (2자 이상) → 링크
      const mentions = nodes
        .filter((n) => (n.cat === 'entity' || n.cat === 'api') && nodeName(n.node).length >= 2 && nm.includes(nodeName(n.node)))
        .map((n) => n.name)
      const body = [
        `---\ntype: "screen"\nproject: ${yamlStr(projectName)}\ntags: [harness/screen]\n---`,
        '', `# ${name}`, '',
        ...(mentions.length ? [`## ${relLabel}`, '', ...mentions.map((x) => `- [[${x}]]`), ''] : []),
        ...(planNotes.length ? [`[[${planNotes[0]}]] · [[${HOME}]]`] : [`[[${HOME}]]`]),
      ]
      files.push({ path: `${F.screen}/${name}.md`, content: body.join('\n') + '\n' })
    }
  }

  // ── 6) 홈(MOC) — 전 노트 목차 ──
  const group = (label, names) => (names.length ? [`## ${label}`, '', ...names.map((n) => `- [[${n}]]`), ''] : [])
  const byCat = (...cats) => nodes.filter((n) => cats.includes(n.cat)).map((n) => n.name)
  const home = [
    `---\ntype: "home"\nproject: ${yamlStr(projectName)}\ntags: [harness/home]\n---`,
    '',
    `# ${projectName}`,
    '',
    tr('deliverables.obsidian.home_intro'),
    '',
    // 설계 스펙 갭 요약 — spec md(designGraphToMarkdown)의 상단 헤더와 동일 문구로 통일.
    ...(totalSpecGaps
      ? [`> ${tr('design.spec_md.vault_gap_header', { n: totalSpecGaps })}`, '']
      : []),
    ...group(tr('deliverables.obsidian.folder_plan'), planNotes),
    ...group(tr('deliverables.obsidian.folder_screen'), screenNotes),
    ...group('API', byCat('api')),
    ...group(tr('deliverables.obsidian.folder_data'), byCat('entity')),
    ...group(tr('deliverables.obsidian.folder_policy'), byCat('policy')),
    ...group(tr('deliverables.obsidian.folder_domain'), byCat('context', 'aggregate', 'domain_entity', 'event')),
    ...group(tr('deliverables.obsidian.folder_service'), byCat('service', 'database')),
  ]
  files.push({ path: `${HOME}.md`, content: home.join('\n') + '\n' })

  // ── 7) README — 3분 온보딩 + 단방향 스냅샷 고지 ──
  const readme = [
    `# ${projectName} — Obsidian Vault`,
    '',
    tr('deliverables.obsidian.readme_intro'),
    '',
    `## ${tr('deliverables.obsidian.readme_steps_title')}`,
    '',
    `1. ${tr('deliverables.obsidian.readme_step1')}`,
    `2. ${tr('deliverables.obsidian.readme_step2')}`,
    `3. ${tr('deliverables.obsidian.readme_step3')}`,
    '',
    `> ${tr('deliverables.obsidian.readme_note')}`,
    '',
    '---',
    '🤖 Harness Engineering System',
  ]
  files.push({ path: 'README.md', content: readme.join('\n') + '\n' })

  return files
}
