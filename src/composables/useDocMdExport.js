import { ref } from 'vue'
import { downloadMarkdown, copyToClipboard, buildDocFilename } from '@/utils/exportDoc'

/**
 * useDocMdExport — CPS/PRD 문서의 'MD 복사 + MD 다운로드' 공통 로직.
 *
 * [2026-06 공통화] CpsTab/PrdTab 이 동일 패턴(빈 내용 가드 → 다운로드/복사 → 토스트,
 * 복사 시 2초간 체크 아이콘 피드백)을 각자 구현하던 것을 추출. host 는 내보낼 content·
 * 파일명 라벨·토스트만 주입하고 UI(버튼)는 그대로 둔다. 실제 파일 저장/클립보드는
 * 기존 utils/exportDoc(downloadMarkdown/copyToClipboard/buildDocFilename)를 그대로 사용.
 *
 * @param {() => string} getContent  내보낼 markdown 반환 (빈 값이면 no-op — 기존 동작 보존)
 * @param {object} opts
 * @param {string} opts.filenameLabel        buildDocFilename 라벨 ('CPS' | 'PRD' …)
 * @param {() => string} [opts.getProjectName]  파일명에 쓸 프로젝트명 (reactive 라 getter)
 * @param {() => void} [opts.onDownloadOk]    다운로드 성공 시 (보통 success 토스트)
 * @param {() => void} [opts.onCopyFail]      복사 실패 시 (보통 error 토스트)
 * @returns {{ mdCopied: import('vue').Ref<boolean>, downloadMd: () => void, copyMd: () => Promise<void> }}
 */
export function useDocMdExport(getContent, { filenameLabel, getProjectName, onDownloadOk, onCopyFail } = {}) {
  const mdCopied = ref(false)

  const downloadMd = () => {
    const content = getContent()
    if (!content) return
    downloadMarkdown(content, buildDocFilename(filenameLabel, getProjectName ? getProjectName() : ''))
    onDownloadOk?.()
  }

  const copyMd = async () => {
    const content = getContent()
    if (!content) return
    const ok = await copyToClipboard(content)
    if (ok) {
      mdCopied.value = true
      setTimeout(() => { mdCopied.value = false }, 2000)
    } else {
      onCopyFail?.()
    }
  }

  return { mdCopied, downloadMd, copyMd }
}
