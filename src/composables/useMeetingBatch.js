/**
 * 미팅 로그 배치 처리 상태 + 재시도 로직.
 *
 * [추출 배경]
 * plan.vue 가 627 줄로 커진 주요 원인 중 하나 — batchState ref + runBatch +
 * retryBatch 가 ~120 줄을 차지. 이 부분은 미팅 도메인 로직이라 페이지의
 * navigation / sub-tab / cps/prd 표시와 직교한다. 분리해 plan.vue 의
 * "이 페이지가 무엇을 보여주는가" 가 더 잘 보이게 한다.
 *
 * [관계]
 * useMeetingBatch 는 외부에서 주입받은 두 함수 (saveOne, deleteOne) 와 외부의
 * nextVersionRef / fetchMeetingLogs / meetingLogsRef 에 의존. 페이지가 그 함수를
 * 가지고 있으므로 host 가 inject 한다 (DI 패턴). 단방향 의존성 — composable 이
 * 페이지 internals 를 직접 import 하지 않아 테스트 용이.
 */
import { ref } from 'vue'

export const useMeetingBatch = ({
  saveOne,                  // (content: string, silent: boolean) => Promise<void>
  deleteOne,                // (version: string, opts: { silent?: boolean, skipConfirm?: boolean }) => Promise<void>
  fetchMeetingLogs,         // (projectName: string, autoSelect?: boolean) => Promise<void>
  nextVersionRef,           // ref<string>  (예: 'v1.1')
  meetingLogsRef,           // ref<Array>
  projectNameGetter,        // () => string
  isLogsLoadingRef,         // ref<boolean>
}) => {
  // entries/baseVersion 은 재시도(retry) 시 cleanup 대상 버전 계산을 위해 보관.
  const batchState = ref({
    running: false,
    total: 0,
    current: 0,
    logs: [],
    error: null,
    errorIndex: null,
    entries: [],
    baseVersion: null,
  })

  const resetBatch = () => {
    batchState.value = {
      running: false, total: 0, current: 0, logs: [], error: null,
      errorIndex: null, entries: [], baseVersion: null,
    }
  }

  /**
   * 배치 처리.
   * - entries: `{ version, title, content }[]` 또는 문자열 배열 (하위호환).
   * - startIndex: 0 = 새 배치 / >0 = 재시도 (기존 logs 유지).
   */
  const runBatch = async (entries, startIndex = 0) => {
    const normalized = entries.map((e, i) =>
      typeof e === 'string'
        ? { version: `V${i + 1}`, title: '', content: e }
        : { version: e.version ?? `V${i + 1}`, title: e.title ?? '', content: e.content }
    )

    if (startIndex === 0) {
      batchState.value = {
        running: true,
        total: normalized.length,
        current: 0,
        logs: normalized.map((e, i) => ({
          index: i, status: 'pending',
          sourceVersion: e.version, title: e.title,
        })),
        error: null,
        errorIndex: null,
        entries: normalized,
        baseVersion: nextVersionRef.value,
      }
    } else {
      const prev = batchState.value
      prev.running = true
      prev.error = null
      prev.errorIndex = null
      for (let i = startIndex; i < prev.logs.length; i++) {
        prev.logs[i].status = 'pending'
      }
    }

    for (let i = startIndex; i < normalized.length; i++) {
      batchState.value.current = i + 1
      batchState.value.logs[i].status = 'running'
      try {
        await saveOne(normalized[i].content, true)
        batchState.value.logs[i].status = 'done'
      } catch (err) {
        batchState.value.logs[i].status = 'error'
        batchState.value.errorIndex = i
        const srcVer = batchState.value.logs[i].sourceVersion
        batchState.value.error =
          `${srcVer ? `${srcVer} (${i + 1}번째)` : `${i + 1}번째`} 로그 처리 중 오류: ${err.message}`
        batchState.value.running = false
        return
      }
    }

    batchState.value.running = false
  }

  /**
   * V{errorIndex+1} 의 부분 저장 데이터를 silent 삭제 후 같은 인덱스부터 재개.
   * BE /deleteMeeting 이 마스터 CPS/PRD 재구성까지 처리 — 별도 병합본 정리 불필요.
   */
  const retryBatch = async () => {
    const { errorIndex, entries, baseVersion } = batchState.value
    if (errorIndex == null || !entries.length) return

    const projectName = projectNameGetter()
    await fetchMeetingLogs(projectName, false)

    const expectedVersion = (() => {
      if (!baseVersion) return null
      const m = baseVersion.match(/v(\d+)\.(\d+)/)
      if (!m) return null
      return `v${parseInt(m[1])}.${parseInt(m[2]) + errorIndex}`
    })()

    if (
      expectedVersion &&
      meetingLogsRef.value.some(l => l.version === expectedVersion)
    ) {
      isLogsLoadingRef.value = true
      try {
        await deleteOne(expectedVersion, { silent: true, skipConfirm: true })
        await fetchMeetingLogs(projectName, false)
      } finally {
        isLogsLoadingRef.value = false
      }
    }

    await runBatch(entries, errorIndex)
  }

  return { batchState, resetBatch, runBatch, retryBatch }
}
