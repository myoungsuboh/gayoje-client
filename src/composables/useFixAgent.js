/**
 * Fix Agent 작업 지시서 생성 + 다운로드.
 *
 * [추출 배경]
 * lint.vue 가 1050 줄로 커진 주요 원인 중 하나. executeFixAgent + fixSpec state
 * 가 페이지 한 가운데 ~67 줄 차지하고, "lint 결과를 입력으로 받아 작업 지시서
 * .md 를 다운로드한다" 는 단일 책임이라 분리하기 쉽다.
 *
 * [입력]
 *   - store: HarnessStore — generateFixSpec / projectName
 *   - getLintResult: () => ({ stats, cases }) — 페이지의 현재 표시 데이터
 *
 * [반환]
 *   - fixSpecLoading / fixSpecMessage / fixSpecError refs
 *   - executeFixAgent(): Promise<void> — 실행 + .md 다운로드 + 상태 갱신
 *
 * [정책]
 * - lint 결과가 없으면 (`getLintResult()` 가 null 반환) error 메시지만 세팅.
 * - BE 가 success=false 응답 → message 또는 default 에러 노출.
 * - markdown 미포함 응답 → "100% 달성 — 작업 불필요" 안내 (BE 가 message 제공).
 * - markdown 포함 → 파일명 추론 + downloadMarkdown 호출.
 */
import { ref } from 'vue'
import { downloadMarkdown } from '@/utils/download'

export const useFixAgent = ({ store, githubUrlRef, getLintResult }) => {
  const fixSpecLoading = ref(false)
  const fixSpecMessage = ref('')
  const fixSpecError = ref('')

  const executeFixAgent = async () => {
    fixSpecMessage.value = ''
    fixSpecError.value = ''

    const lintResult = getLintResult()
    if (!lintResult) {
      fixSpecError.value = '먼저 Lint 분석을 실행해주세요.'
      return
    }

    fixSpecLoading.value = true
    try {
      const result = await store.generateFixSpec({
        projectName: store.projectName,
        githubUrl: githubUrlRef.value,
        lintResult,
      })

      if (!result.success) {
        fixSpecError.value = result.error || '명세서 생성에 실패했습니다.'
        return
      }

      const data = result.data || {}
      if (data.success === false) {
        fixSpecError.value = data.message || '명세서 생성에 실패했습니다.'
        return
      }

      if (!data.markdown) {
        // 100% 달성 케이스 (실패 항목 없음)
        fixSpecMessage.value = data.message || '이미 100% 달성. 추가 작업이 필요하지 않습니다.'
        return
      }

      const filename = data.filename || `fix-spec-${store.projectName || 'harness'}.md`
      downloadMarkdown(data.markdown, filename)
      fixSpecMessage.value = `작업 지시서 다운로드 완료: ${filename}`
    } catch (e) {
      fixSpecError.value = e?.message || '명세서 생성 중 오류가 발생했습니다.'
    } finally {
      fixSpecLoading.value = false
    }
  }

  return {
    fixSpecLoading,
    fixSpecMessage,
    fixSpecError,
    executeFixAgent,
  }
}
