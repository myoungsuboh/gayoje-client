/**
 * prdScreens.js — PRD 본문에서 Screen 이름 추출 (단일 출처).
 *
 * [왜 — 2026-06-13 심층검수 #7] obsidianExport.js 와 useSpecCoverage.js 가 동일한
 * Screen 정규식을 각자 정의해, PRD 헤딩 포맷이 바뀌면 한쪽만 고쳐 vault Screen 노트
 * 수 ≠ lint 커버리지 항목 수로 드리프트할 위험이 있었다. 한 곳으로 통일한다.
 *
 * 형식: '### ~ #### 🖥️ [Screen: 이름]' 또는 '[이름]' (이모지 VS16 옵셔널, 헤딩 레벨 2~4).
 * [i18n] 대괄호 폼 '[Screen: 이름]' + 무괄호 폼 'Screen: 이름' 둘 다 — 비-ko 생성에서
 * 모델이 대괄호를 떨군 PRD(이미 생성된 옛 산출물 포함)도 화면을 놓치지 않게 한다.
 * [normalize-우선] 무괄호 'Screen:' 라벨의 다국어 번역형(画面:/界面:/屏幕:/화면:/スクリーン:)도
 * 수용 — PrdTab.parsedScreens 정규식과 동일 접두 셋(두 파일 쌍으로 함께 유지).
 */
const SCREEN_RE = /#{2,4}\s*🖥️?\s*(?:\[([^\]]+)\]|(?:Screen|화면|画面|界面|屏幕|スクリーン)\s*[:：]\s*([^\[\]\n]+))/gi

/** PRD 마크다운 → Screen 이름 배열('Screen:' 접두 제거, 빈 이름 제외, 중복 유지는 호출부). */
export const extractScreenNames = (prdMd) => {
  const out = []
  const re = new RegExp(SCREEN_RE.source, 'gi')  // 호출 간 lastIndex 격리 (i: 무괄호 'Screen:' 대소문자 무관)
  let m
  while ((m = re.exec(prdMd || '')) !== null) {
    // 대괄호 폼은 group1, 무괄호 폼은 group2.
    const raw = (m[1] != null ? m[1] : m[2]) || ''
    // [i18n] 'Screen:' 구조 라벨은 다국어 생성 시 '画面:'·'界面:'·'스크린:' 등으로
    // 번역될 수 있어, 알려진 변형까지 접두 제거 (없으면 그대로).
    const nm = raw.trim().replace(/^(?:Screen|화면|画面|界面|屏幕|スクリーン)\s*[:：]\s*/i, '')
    if (nm) out.push(nm)
  }
  return out
}
