/**
 * 클라이언트 사이드 파일 다운로드 유틸 (순수 함수, 비즈니스 로직 X)
 */

/**
 * 텍스트 컨텐츠를 Blob으로 변환해 사용자에게 다운로드
 * @param {string} content - 파일 본문 텍스트
 * @param {string} filename - 다운로드 파일명
 * @param {string} mimeType - MIME 타입 (기본: text/plain)
 */
export const downloadText = (content, filename, mimeType = 'text/plain') => {
  if (!content) throw new Error('다운로드할 컨텐츠가 비어있습니다.')
  if (!filename) throw new Error('파일명이 지정되지 않았습니다.')

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // 메모리 누수 방지: blob URL 즉시 해제
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 임의 Blob 다운로드 (바이너리 — xlsx/zip 등 비텍스트 파일용).
 * @param {Blob} blob
 * @param {string} filename
 */
export const downloadBlob = (blob, filename) => {
  if (!blob) throw new Error('다운로드할 Blob이 비어있습니다.')
  if (!filename) throw new Error('파일명이 지정되지 않았습니다.')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 마크다운 다운로드 헬퍼 (downloadText의 .md 특화 버전)
 * @param {string} markdown - 마크다운 컨텐츠
 * @param {string} filename - .md 확장자 포함 권장 (없으면 자동 추가)
 */
export const downloadMarkdown = (markdown, filename) => {
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`
  downloadText(markdown, safeName, 'text/markdown')
}
