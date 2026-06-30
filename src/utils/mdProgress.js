/**
 * mdProgress — 바이브 코딩 패키지(create_md) 진행 신호 파싱 + 진행률 밴드.
 *
 * [2026-06] BE create_md 파이프라인이 emit_stage 로 실제 구간을 보고한다:
 *   md:collecting                  명세(그래프 3종)·체크리스트·skills 수집 중
 *   md:docs:<n>/4[:<완료목록>]     병렬 LLM 4건 중 n 건 완료 (목록은 콤마 구분)
 *   md:assembling                  결과 조립(완료 직전)
 *
 * ArchitectureTab 이 폴링으로 받은 stage 문자열을 여기 파서로 해석해 3단계 표시와
 * 문서별 체크(✓)를 실시간으로 그린다. 형식 밖 문자열/빈 값은 null — 구버전 BE
 * (신호 없음)에서는 호출부가 elapsed 추정 폴백을 유지한다.
 */

// 병렬 생성되는 문서 4종 — BE _staged() 의 doc_name 과 1:1 (계약).
export const MD_DOC_KEYS = ['spack', 'ddd', 'architecture', 'orchestrator']

/**
 * stage 문자열 → { idx, done, names } | null
 *   idx   0=수집 / 1=문서 생성 / 2=조립 (FE 3단계 인덱스)
 *   done  완료 문서 수 (0~4)
 *   names 완료 문서 키 배열 (md:docs 누적 목록 — 마지막 쓰기가 전체 누적이라 안전)
 */
export const parseMdStage = (stage) => {
  if (!stage || typeof stage !== 'string') return null
  if (stage === 'md:collecting') return { idx: 0, done: 0, names: [] }
  if (stage === 'md:assembling') return { idx: 2, done: MD_DOC_KEYS.length, names: [...MD_DOC_KEYS] }
  if (stage.startsWith('md:docs:')) {
    const rest = stage.slice('md:docs:'.length)        // "2/4:spack,ddd" | "0/4"
    const [countPart, namesPart] = [rest.split(':')[0], rest.split(':')[1] || '']
    const done = parseInt(countPart, 10)
    if (!Number.isFinite(done) || done < 0) return null
    const names = namesPart
      ? namesPart.split(',').filter((n) => MD_DOC_KEYS.includes(n))
      : []
    return { idx: 1, done: Math.min(done, MD_DOC_KEYS.length), names }
  }
  return null
}

/**
 * 신호 → 진행률 밴드 [floor, ceil].
 * 밴드 안에서는 호출부가 시간 점근(지수)으로 ceil 에 다가가 항상 전진해 보인다.
 * floor 가 단계/완료 수에 따라 단조 증가하므로 (수집 3 → 문서 12·32·52·72·92 →
 * 조립 95) 신호가 도착할 때마다 즉시 눈에 보이는 점프가 생긴다.
 */
export const mdSignalBand = (sig) => {
  if (!sig) return null
  if (sig.idx === 0) return [3, 9]
  if (sig.idx === 1) {
    const floor = Math.min(92, 12 + sig.done * 20)     // 0→12, 1→32, 2→52, 3→72, 4→92
    return [floor, Math.min(94, floor + 17)]
  }
  return [95, 99]                                       // 조립 — 완료 시 overlay 가 닫힘
}
