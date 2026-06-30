/**
 * 미팅 로그 배치 분할 — 양식 자유화 파서 (2026-06).
 *
 * [배경]
 * 기존 BatchPanel 인라인 파서는 `\n---\n` 구분 + `[미팅 로그` 하드 필터였다. 자유 양식
 * 문서(날짜 헤더 회의록 모음, 노션 export, 마커 없는 메모)는 필터에서 통째로 탈락해
 * "0건 감지" — 에러도 없는 무음 드롭. 이 파서는 필터를 없애고 휴리스틱으로 분할한다:
 *
 *   1) hr 구분선(---/===/___ 단독 라인)으로 1차 분할
 *   2) 한 조각 안에 회의 헤더 라인(미팅/회의 헤딩, V토큰 헤딩, 날짜 헤딩)이 2개 이상이면
 *      헤더 기준 2차 분할 (--- 없이 헤더만 반복되는 문서 지원)
 *   3) 빈 조각 제외, 헤딩만 있는 구분 조각(## [Phase 2] 등)은 다음 조각에 합침 (유실 금지)
 *   4) 구분 신호가 전혀 없으면 전체 1건 (탈락이 아니라 단일 회의로 등록)
 *
 * 버전: 명시(Vn)가 있으면 사용하되 배치 내 중복이면 재부여 — BE 가 (project, version) id 로
 * MERGE 하므로 같은 배치에서 동일 버전이 서로 덮어쓰는 사고 방지. 없으면 (max+1)부터 자동.
 * 제목: 첫 라인이 마크다운 헤딩/날짜 헤더일 때만 추출, 아니면 null (호출측이 기본 제목 채움).
 */

// hr 단독 라인 (앞뒤 공백 허용): --- / === / ___
const HR_SPLIT_RE = /\n\s*(?:-{3,}|={3,}|_{3,})\s*\n/

// 기존 표준 양식 — 하위호환 1순위 (제목 추출 정확도 최상).
const LEGACY_HEADER_RE = /###\s*\[미팅 로그 V(\d+)\]\s*[-–]\s*(.+)/

// "회의 시작" 헤더 라인 — 2차 분할 경계. 라인 시작 기준이라 본문 중간의
// "* **일시:** 2026-02-03" 같은 불릿/문장 내 날짜는 매칭되지 않는다.
//
// [과분할 방지 — 2026-06] 경계 신호는 "문서 단위" 키워드만:
// - 미팅/회의 키워드는 미팅 로그·회의록·회의 기록처럼 **문서를 뜻하는 합성어**만 인정.
//   단일 회의 안의 섹션 헤딩(## 회의 개요/내용/결론)이 경계로 오인돼 한 회의가 여러 건으로
//   쪼개지면 CPS/PRD 가 파편으로 돌아 버전 오염 + 토큰 낭비 — 모호하면 "안 쪼갬"이 안전
//   (최악이 1건 등록 = BE 가 통으로 분석).
// - 날짜는 헤딩 **시작**일 때만(## 2026-06-01 주간회의). 헤딩 중간 날짜(## 출시일정:
//   2026-07-01)는 일정 섹션이지 회의 경계가 아니다.
const HEADER_LINE_RES = [
  /^#{1,6}\s*\[?\s*(?:미팅\s*로그|회의록|회의\s*기록|meeting\s*(?:log|notes?))/i,
  /^#{1,6}\s*\[?\s*V\d+\b/i,                                // 헤딩이 V토큰으로 시작 (## V3 ...)
  /^#{1,6}\s*\[?\(?\s*\d{4}[-./]\d{1,2}[-./]\d{1,2}/,       // 헤딩 시작이 날짜
  /^\d{4}[-./]\d{1,2}[-./]\d{1,2}\s*(?:\([^)]*\))?\s*$/,    // 날짜 단독 라인
  /^(?:#{1,6}\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일[^\n]*(?:회의|미팅)/, // "6월 1일 주간 회의"
]

const isHeaderLine = (line) => HEADER_LINE_RES.some((re) => re.test(line))

// 헤딩만 있는 조각 (## [Phase 2] 같은 구분 헤더) — 회의가 아니라 구획 표시.
const isHeadingOnlyChunk = (text) =>
  text.split('\n').every((l) => !l.trim() || /^#{1,6}\s/.test(l))

/** 조각 안에 회의 헤더가 2개 이상이면 헤더 라인 기준으로 분할. 아니면 [조각] 그대로. */
function subSplitByHeaders(chunk) {
  const lines = chunk.split('\n')
  const headerIdx = []
  lines.forEach((l, i) => { if (isHeaderLine(l)) headerIdx.push(i) })
  if (headerIdx.length < 2) return [chunk]
  const pieces = []
  if (headerIdx[0] > 0) pieces.push(lines.slice(0, headerIdx[0]).join('\n'))
  for (let k = 0; k < headerIdx.length; k++) {
    const end = k + 1 < headerIdx.length ? headerIdx[k + 1] : lines.length
    pieces.push(lines.slice(headerIdx[k], end).join('\n'))
  }
  return pieces
}

/** 본문에서 (version|null, title|null) 추출. */
function extractMeta(body) {
  const legacy = body.match(LEGACY_HEADER_RE)
  if (legacy) return { version: `V${legacy[1]}`, title: legacy[2].trim() }

  const firstLine = (body.split('\n').find((l) => l.trim()) || '').trim()
  // 제목은 첫 라인이 헤딩이거나 날짜 헤더일 때만 — 자유 줄글의 첫 문장을 제목으로 오인하지 않게.
  const looksTitled = /^#{1,6}\s/.test(firstLine) || isHeaderLine(firstLine)
  if (!looksTitled) return { version: null, title: null }

  const cleaned = firstLine.replace(/^#{1,6}\s*/, '').trim()
  // 버전 토큰은 **대문자 V + 소수점 비후속**만 — "(v0.3 → v1.2)" 같은 문서 버전 표기를
  // 회의 버전으로 오인(V0)하지 않게 (실샘플 스모크에서 발견된 케이스).
  const VERSION_TOKEN_RE = /\bV(\d+)\b(?!\.\d)/
  const vm = cleaned.match(VERSION_TOKEN_RE)
  // "회의록 V1 - 킥오프" 처럼 대시 앞부분이 회의 표식이면 대시 뒷부분이 진짜 제목.
  let title = cleaned
  const dash = cleaned.match(/^(.*?)[-–—]\s*(.+)$/)
  if (dash && (/(?:미팅|회의|meeting)/i.test(dash[1]) || VERSION_TOKEN_RE.test(dash[1]))) title = dash[2]
  title = title
    .replace(/\[?\s*미팅\s*로그\s*\]?/i, '')
    .replace(VERSION_TOKEN_RE, '')
    .replace(/^[\s[\]:·\-–—]+|[\s[\]:·\-–—]+$/g, '')
    .trim()
  return { version: vm ? `V${vm[1]}` : null, title: title || null }
}

/**
 * 자유 양식 텍스트 → 배치 엔트리 목록.
 * @param {string} rawText
 * @param {{reserved?: string[]}} [opts] reserved: 프로젝트에 이미 존재하는 버전 목록.
 *   **자동 부여**가 이 버전들을 피해 (max+1)부터 — 무버전 문서가 기존 V1·V2 미팅로그/CPS
 *   delta 를 모르고 덮어쓰는 사고 방지. 문서에 **명시**된 버전은 reserved 와 겹쳐도 유지
 *   (재업로드=의도적 덮어쓰기, UI 가 '이미 존재 · 덮어씀' 태그로 표시).
 * @returns {{index:number, version:string, title:(string|null), content:string}[]}
 */
export function parseLogEntries(rawText, { reserved = [] } = {}) {
  if (!rawText || !rawText.trim()) return []
  // Windows(CRLF) 업로드 .txt 도 동일 동작.
  const text = rawText.replace(/\r\n?/g, '\n')

  // 1차 hr 분할 → 2차 헤더 분할 → 평탄화.
  const pieces = text.split(HR_SPLIT_RE).flatMap(subSplitByHeaders)

  // 빈 조각 제외 + 헤딩-only 구분 조각은 다음 실내용 조각의 머리로 합침 (내용 유실 금지).
  const merged = []
  let carry = ''
  for (const piece of pieces) {
    const trimmed = piece.trim()
    if (!trimmed) continue
    if (isHeadingOnlyChunk(trimmed)) { carry = carry ? `${carry}\n${trimmed}` : trimmed; continue }
    merged.push(carry ? `${carry}\n${trimmed}` : trimmed)
    carry = ''
  }
  if (carry) {
    // 꼬리에 남은 헤딩-only 조각 — 앞 엔트리에 붙이거나(있으면), 그 자체를 1건으로.
    if (merged.length) merged[merged.length - 1] += `\n${carry}`
    else merged.push(carry)
  }

  const entries = merged.map((content, index) => ({ index, content, ...extractMeta(content) }))

  // 버전 유일화: 명시 버전은 선착순 유지(reserved 와 겹쳐도 의도적 덮어쓰기로 인정),
  // 배치 내 중복·미지정은 (명시·reserved 최댓값+1)부터 자동 부여.
  const used = new Set()
  let next = 1
  for (const e of entries) {
    const m = e.version && e.version.match(/^V(\d+)$/i)
    if (m && !used.has(`V${m[1]}`)) {
      e.version = `V${m[1]}`
      // 명시 버전 — 사용자가 의도한 식별자. 기존 버전과 겹치면 "의도적 교체"로 취급
      // (배치 pre-cleanup 의 silent 삭제+재처리 허용).
      e.autoVersion = false
      used.add(e.version)
      next = Math.max(next, Number(m[1]) + 1)
    } else {
      e.version = null
    }
  }
  // 자동 부여는 프로젝트 기존 버전(reserved)도 피해감 — 모르고 덮어쓰기 방지.
  const autoUsed = new Set(used)
  for (const r of reserved) {
    const m = String(r || '').match(/^V(\d+)$/i)
    if (!m) continue
    autoUsed.add(`V${m[1]}`)
    next = Math.max(next, Number(m[1]) + 1)
  }
  for (const e of entries) {
    if (e.version) continue
    while (autoUsed.has(`V${next}`)) next++
    e.version = `V${next}`
    // 자동 부여 — 사용자가 고른 번호가 아니므로, 어떤 경로로든 기존 버전과 겹쳐도
    // 배치 pre-cleanup 이 기존 미팅을 silent 삭제하면 안 됨 (호출측 가드 신호).
    e.autoVersion = true
    autoUsed.add(e.version)
  }
  return entries
}
