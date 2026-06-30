/**
 * CPS markdown 섹션 파서.
 *
 * [배경]
 * BE 프롬프트(cps_extract / cps_merge / rebuild_cps)는 항상 4개 섹션을 같은 순서로 출력한다.
 *   ### 1. Context (배경 및 상황)
 *   ### 2. Problem (핵심 문제)
 *   ### 3. Solution (최종 해결책 및 기획 방향)
 *   ### 4. Pending & Action Items
 *   ### ⚙️ Harness Journey Record   ← FE 표시 대상 아님 (시스템 메타)
 *
 * FE 에서는 섹션 단위로 보기/편집하기 위해 markdown 을 분해한다.
 *
 * [정책]
 * - 헤더 매칭은 `^### N. 제목` (N=1..4). 형식이 깨졌으면 빈 배열 반환 → 호출자가 fallback.
 * - Harness Journey Record 이후는 모두 제외 (편집 대상 아님).
 * - replace 시에는 Journey Record / 1~4 외 섹션은 손대지 않고 통과시킨다.
 */

const JOURNEY_MARK = '### ⚙️ Harness Journey'
// [i18n] 다국어 생성 시 'Harness Journey' 가 번역될 수 있어 정확 문자열 매칭이 깨진다.
// ⚙️ 이모지가 박힌 헤더를 언어 무관 컷 지점으로 사용 (이모지는 번역 안 됨).
// #{1,4}: LLM 이 간혹 ## 또는 #### 로 출력해도 잡히도록 헤딩 레벨 유연화.
// export — CpsTab.vue 등 다른 파서가 동일 컷 로직을 재사용(리터럴 재구현 드리프트 방지).
export const JOURNEY_MARK_RE = /^#{1,4}\s*⚙️/m

const ID_BY_NUM = {
  1: 'context',
  2: 'problem',
  3: 'solution',
  4: 'pending',
}

const NUM_BY_ID = {
  context: 1,
  problem: 2,
  solution: 3,
  pending: 4,
}

/**
 * CPS markdown 을 섹션 배열로 분해.
 *
 * @param {string} md
 * @returns {Array<{ id: string, num: number, title: string, content: string }>}
 *   content 는 헤더 라인 포함, trim 됨.
 *   형식이 안 맞거나 빈 입력이면 빈 배열.
 */
export function parseCpsSections(md) {
  if (!md || typeof md !== 'string') return []

  const journeyMatch = md.match(JOURNEY_MARK_RE)
  const journeyIdx = journeyMatch ? journeyMatch.index : md.indexOf(JOURNEY_MARK)
  const body = journeyIdx >= 0 ? md.slice(0, journeyIdx) : md

  const re = /^###\s+(\d+)\.\s+(.+?)\s*$/gm
  const matches = [...body.matchAll(re)]
  if (matches.length === 0) return []

  const sections = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const num = parseInt(m[1], 10)
    if (!ID_BY_NUM[num]) continue

    const start = m.index
    const next = matches[i + 1]
    const end = next ? next.index : body.length
    const content = body.slice(start, end).trim()

    sections.push({
      id: ID_BY_NUM[num],
      num,
      title: m[2].trim(),
      content,
    })
  }
  return sections
}

/**
 * 특정 섹션만 새 내용으로 교체한 전체 markdown 을 반환.
 * 다른 섹션 + 상단 preamble(`## 📄 CPS...`) + Journey Record 는 그대로 보존.
 *
 * @param {string} md         원본 전체 markdown
 * @param {string} id         'context' | 'problem' | 'solution' | 'pending'
 * @param {string} newContent 새 섹션 본문 (헤더 라인 포함 권장)
 * @returns {string}          교체된 전체 markdown. id 가 잘못되거나 섹션을 못 찾으면 원본 그대로.
 */
export function replaceCpsSection(md, id, newContent) {
  if (!md || !id || typeof newContent !== 'string') return md
  const num = NUM_BY_ID[id]
  if (!num) return md

  const journeyMatch = md.match(JOURNEY_MARK_RE)
  const journeyIdx = journeyMatch ? journeyMatch.index : md.indexOf(JOURNEY_MARK)
  const body = journeyIdx >= 0 ? md.slice(0, journeyIdx) : md
  const tail = journeyIdx >= 0 ? md.slice(journeyIdx) : ''

  const headerRe = new RegExp(`^###\\s+${num}\\.\\s+.+?$`, 'm')
  const headerMatch = body.match(headerRe)
  if (!headerMatch) return md

  const startIdx = headerMatch.index

  // 다음 `### M.` (M > num) 시작 위치 찾기 — 없으면 body 끝
  const nextRe = /^###\s+(\d+)\.\s+/gm
  nextRe.lastIndex = startIdx + headerMatch[0].length
  let endIdx = body.length
  let nm
  while ((nm = nextRe.exec(body)) !== null) {
    if (parseInt(nm[1], 10) > num) {
      endIdx = nm.index
      break
    }
  }

  // 새 내용 정규화: 끝 공백 제거 + 다음 섹션과 빈줄 1개 확보
  const normalized = newContent.replace(/\s+$/, '') + '\n\n'
  return body.slice(0, startIdx) + normalized + body.slice(endIdx) + tail
}

/**
 * Problem 섹션 안의 PRB-XX 갯수.
 * @param {string} content
 * @returns {number}
 */
export function countPrbs(content) {
  if (!content) return 0
  return (content.match(/\bPRB-\d+/g) || []).length
}

/**
 * Solution 섹션 안의 RES-XX 갯수.
 * @param {string} content
 * @returns {number}
 */
export function countResolutions(content) {
  if (!content) return 0
  return (content.match(/\bRES-\d+/g) || []).length
}

/**
 * Problem 섹션에서 PRB 아이템 추출.
 * - **[PRB-01] 키워드**: 내용 형식.
 *
 * @param {string} content
 * @returns {Array<{ id: string, summary: string, description: string }>}
 */
export function parseProblemItems(content) {
  if (!content) return []
  const out = []
  const re = /- \*\*\[(PRB-\d+)\]\s*(.*?)\*\*:\s*(.*)/g
  let m
  while ((m = re.exec(content)) !== null) {
    out.push({
      id: m[1],
      summary: (m[2] || '').trim(),
      description: (m[3] || '').trim(),
    })
  }
  return out
}

/**
 * Solution 섹션에서 RES 아이템 추출.
 * - `[RES-01] 해결안A`: [매핑: PRB-01 카테고리/구체안] 형식.
 *
 * @param {string} content
 * @returns {Array<{ id: string, summary: string, mappedTo: string }>}
 *   mappedTo 는 "PRB-01 카테고리/구체안" 형태(있으면) — 없으면 빈 문자열.
 */
export function parseResolutionItems(content) {
  if (!content) return []
  const out = []
  // ` 가 정규식 안에서 그대로 OK. m[3] 는 mapping body.
  // [i18n] 매핑 라벨('매핑:')은 다국어 생성 시 'Mapping:'·'マッピング:'·
  // 'Problem Resolution:'(18자) 등으로 번역되거나 생략될 수 있다.
  // {0,32}: 최대 32자 라벨 접두사를 선택적으로 건너뛰고 본문(PRB-XX ...)만 캡처.
  const re = /- `\[(RES-\d+)\]\s*(.*?)`\s*:\s*\[(?:[^\]:]{0,32}:\s*)?([^\]]+)\]/g
  let m
  while ((m = re.exec(content)) !== null) {
    out.push({
      id: m[1],
      summary: (m[2] || '').trim(),
      mappedTo: (m[3] || '').trim(),
    })
  }
  return out
}

/**
 * Pending & Action Items 섹션에서 top-level 그룹 추출.
 * - **미결정 사항**:, - **Next Steps**: 같은 패턴.
 *
 * [중요] ^ 라인 시작 anchor 사용 — 들여쓰기된 sub-bullet 의 `**...**` 은 제외.
 * (예: "  - **미결정 사항** / **Next Steps**:" 같은 sub-bullet 은 그룹 아님)
 *
 * @param {string} content
 * @returns {Array<{ title: string, anchorId: string }>}
 *   anchorId 는 'pending-0', 'pending-1' 식 인덱스 기반 안정 키.
 */
export function parsePendingGroups(content) {
  if (!content) return []
  const out = []
  // m 플래그 + ^ — 라인 시작에서만 매치. 들여쓰기 없는 top-level bullet 한정.
  // [i18n] 불릿은 '-'·'*' 모두, 콜론은 ASCII ':' + 전각 '：'(일·중 표기) 모두 허용 —
  // 안 그러면 ja/zh CPS 의 pending 그룹이 nav 에서 통째로 사라진다(CpsTab 미러와 동일 규칙).
  const re = /^[-*]\s+\*\*([^*]+)\*\*\s*[:：]/gm
  let m
  let idx = 0
  while ((m = re.exec(content)) !== null) {
    const title = (m[1] || '').trim()
    if (title) {
      out.push({ title, anchorId: `pending-${idx}` })
      idx += 1
    }
  }
  return out
}
