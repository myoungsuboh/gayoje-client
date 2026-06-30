/**
 * useMeetingBatch — plan.vue 에서 추출한 미팅 로그 배치 처리 composable.
 *
 * [검증]
 * - 정상 흐름: 3건 모두 성공 → running=false, 모두 done
 * - 중간 실패: 2번째 실패 → batchState.error 세팅, errorIndex=1, running=false
 * - retryBatch: errorIndex 부터 재개, 부분 저장된 expectedVersion 자동 삭제
 * - 입력 정규화: 문자열 배열 → entries 형식 변환
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useMeetingBatch } from '@/composables/useMeetingBatch'

const setup = ({ saveImpl, deleteImpl, meetingLogs = [], baseVersion = 'v1.1' } = {}) => {
  const nextVersion = ref(baseVersion)
  const meetingLogsRef = ref(meetingLogs)
  const isLogsLoading = ref(false)
  const projectName = 'proj_x'

  const saveOne = vi.fn(saveImpl || (async () => {}))
  const deleteOne = vi.fn(deleteImpl || (async () => {}))
  const fetchMeetingLogs = vi.fn(async () => {})

  const batch = useMeetingBatch({
    saveOne,
    deleteOne,
    fetchMeetingLogs,
    nextVersionRef: nextVersion,
    meetingLogsRef,
    projectNameGetter: () => projectName,
    isLogsLoadingRef: isLogsLoading,
  })

  return { batch, saveOne, deleteOne, fetchMeetingLogs, isLogsLoading, meetingLogsRef }
}

describe('useMeetingBatch', () => {
  it('정상 흐름 — 3건 모두 성공', async () => {
    const { batch, saveOne } = setup()
    await batch.runBatch([
      { version: 'V1', title: 'a', content: 'A' },
      { version: 'V2', title: 'b', content: 'B' },
      { version: 'V3', title: 'c', content: 'C' },
    ])
    expect(saveOne).toHaveBeenCalledTimes(3)
    expect(batch.batchState.value.running).toBe(false)
    expect(batch.batchState.value.error).toBeNull()
    expect(batch.batchState.value.logs.every(l => l.status === 'done')).toBe(true)
  })

  it('중간 실패 — 2번째에서 throw → errorIndex=1 + 에러 메시지', async () => {
    let callCount = 0
    const { batch } = setup({
      saveImpl: async () => {
        callCount++
        if (callCount === 2) throw new Error('boom!')
      },
    })
    await batch.runBatch([
      { version: 'V1', content: 'A' },
      { version: 'V2', content: 'B' },
      { version: 'V3', content: 'C' },
    ])
    expect(batch.batchState.value.errorIndex).toBe(1)
    expect(batch.batchState.value.error).toContain('boom!')
    expect(batch.batchState.value.logs[0].status).toBe('done')
    expect(batch.batchState.value.logs[1].status).toBe('error')
    expect(batch.batchState.value.logs[2].status).toBe('pending')
    expect(batch.batchState.value.running).toBe(false)
  })

  it('입력 정규화 — 문자열 배열도 받음', async () => {
    const { batch, saveOne } = setup()
    await batch.runBatch(['raw text 1', 'raw text 2'])
    expect(saveOne).toHaveBeenCalledWith('raw text 1', true)
    expect(saveOne).toHaveBeenCalledWith('raw text 2', true)
    expect(batch.batchState.value.logs[0].sourceVersion).toBe('V1')
    expect(batch.batchState.value.logs[1].sourceVersion).toBe('V2')
  })

  it('retryBatch — 부분 저장된 expectedVersion 자동 삭제 후 재개', async () => {
    let callCount = 0
    const { batch, deleteOne, fetchMeetingLogs, meetingLogsRef } = setup({
      saveImpl: async () => {
        callCount++
        if (callCount === 2) throw new Error('transient')
      },
      meetingLogs: [],
      baseVersion: 'v1.1',
    })

    await batch.runBatch([
      { version: 'V1', content: 'A' },   // 성공 → v1.1
      { version: 'V2', content: 'B' },   // 실패 → 부분저장된 v1.2 가 있다고 가정
      { version: 'V3', content: 'C' },
    ])
    expect(batch.batchState.value.errorIndex).toBe(1)

    // BE 가 v1.2 를 (부분) 저장한 상태로 만들어 둔다고 가정
    meetingLogsRef.value = [{ version: 'v1.2' }]

    // 이후 호출은 정상 성공
    await batch.retryBatch()
    expect(deleteOne).toHaveBeenCalledWith('v1.2', { silent: true, skipConfirm: true })
    expect(fetchMeetingLogs).toHaveBeenCalled()
    // 재시도는 errorIndex(1) 부터 — 즉 V2, V3 다시 시도
    expect(batch.batchState.value.errorIndex).toBe(null)
    expect(batch.batchState.value.running).toBe(false)
  })

  it('retryBatch — 부분 저장된 버전이 없으면 deleteOne skip', async () => {
    let callCount = 0
    const { batch, deleteOne } = setup({
      saveImpl: async () => {
        callCount++
        if (callCount === 1) throw new Error('first call fails')
      },
    })
    await batch.runBatch([
      { version: 'V1', content: 'A' },
    ])
    expect(batch.batchState.value.errorIndex).toBe(0)
    // meetingLogs 비어있음 → expectedVersion 미존재 → delete skip
    await batch.retryBatch()
    expect(deleteOne).not.toHaveBeenCalled()
  })

  it('resetBatch 가 깨끗한 초기 상태로 복귀', async () => {
    const { batch } = setup({ saveImpl: async () => { throw new Error('x') } })
    await batch.runBatch([{ version: 'V1', content: 'A' }])
    expect(batch.batchState.value.error).toBeTruthy()
    batch.resetBatch()
    expect(batch.batchState.value).toEqual({
      running: false, total: 0, current: 0, logs: [], error: null,
      errorIndex: null, entries: [], baseVersion: null,
    })
  })
})
