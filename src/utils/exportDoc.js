/**
 * 문서 내보내기 유틸 — PRD/CPS 등 markdown 산출물 다운로드 + 클립보드 복사.
 *
 * [왜 markdown 인가 — B2B 핸드오프]
 * PDF 는 이해관계자 보고용이지만, 실제 작업 포맷은 markdown 이다. 사용자는 PRD/CPS 를
 * Cursor·Claude Code 에 붙여넣거나, Notion 에 옮기거나, repo 에 커밋한다. 그 모든 경로의
 * 공통 입력이 markdown 텍스트 → 다운로드(.md) + 원클릭 복사 두 가지를 제공한다.
 */

/**
 * 파일명에 안전한 slug 로 변환 — 프로젝트명에 공백/특수문자가 있어도 OS 파일명 안전.
 * 한글은 보존 (사용자가 파일을 알아볼 수 있어야 함), 경로 구분자/제어문자만 제거.
 */
export const safeFilename = (name, fallback = 'document') => {
  const base = (name || '').trim().replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_').replace(/\s+/g, '_')
  return base || fallback
}

/** YYYYMMDD 스탬프 — 파일명 버전 구분용. */
export const dateStamp = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, '')

/**
 * markdown 텍스트를 .md 파일로 다운로드.
 * @param {string} content  markdown 본문
 * @param {string} filename 확장자 포함 파일명 (예: 'myproj_PRD_20260531.md')
 */
export const downloadMarkdown = (content, filename) => {
  const blob = new Blob([content ?? ''], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * 클립보드 복사 — navigator.clipboard 우선, 미지원/비-https 환경은 textarea fallback.
 * @returns {Promise<boolean>} 성공 여부
 */
export const copyToClipboard = async (text) => {
  const value = text ?? ''
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch { /* fallback 아래로 */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/**
 * 문서 타입 + 프로젝트명 → 표준 .md 파일명.
 * @example buildDocFilename('PRD', '오늘반찬') → '오늘반찬_PRD_20260531.md'
 */
export const buildDocFilename = (docType, projectName) =>
  `${safeFilename(projectName, 'project')}_${docType}_${dateStamp()}.md`
