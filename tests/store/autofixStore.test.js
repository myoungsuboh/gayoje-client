/**
 * autofixStore — PRD "AI로 보완하기" 진행/결과를 store 가 소유 (탭/페이지 전환 생존).
 *
 * 검증:
 *  - changed=true → pendingDiff 안착 (PrdTab 이 remount 돼도 watcher 로 재노출 가능)
 *  - 이미 진행 중이면 재실행 차단 (중복 → Gemini quota 낭비 방지)
 *  - clearPending / changed=false(needsInput) / error / 프로젝트 격리
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/axios', () => ({
  default: { post: vi.fn() },
}))

import axios from '@/utils/axios'
import { useAutofixStore } from '@/store/autofix'

describe('autofixStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    axios.post.mockReset()
  })

  it('changed=true 면 결과를 pendingDiff 에 안착시킨다', async () => {
    axios.post.mockResolvedValue({
      data: { changed: true, markdown: 'NEW', current_markdown: 'OLD', needs_input: [] },
    })
    const store = useAutofixStore()
    const res = await store.runAutofix('proj', 'TEXT')

    expect(res.changed).toBe(true)
    expect(store.isAutofixing('proj')).toBe(false)
    expect(store.pendingDiff('proj')).toEqual({ oldMd: 'OLD', newMd: 'NEW', baseUpdatedAt: null })
  })

  it('[2026-06-10 lost-update 가드] baseUpdatedAt 이 pendingDiff 까지 round-trip 된다', async () => {
    axios.post.mockResolvedValue({
      data: { changed: true, markdown: 'NEW', current_markdown: 'OLD', needs_input: [] },
    })
    const store = useAutofixStore()
    await store.runAutofix('proj', 'TEXT', { baseUpdatedAt: 1781075626 })

    // 보완 시작 시점 PRD 버전이 diff 와 함께 보존 — 적용 PATCH 의 client_updated_at 용.
    expect(store.pendingDiff('proj')).toEqual({
      oldMd: 'OLD', newMd: 'NEW', baseUpdatedAt: 1781075626,
    })

    // 승인/취소 후엔 스냅샷도 함께 비워진다 (다음 보완에 이월 금지).
    store.clearPending('proj')
    expect(store.pendingDiff('proj')).toBeNull()
  })

  it('이미 진행 중이면 재실행을 차단한다 (중복 가드)', async () => {
    let resolveFn
    axios.post.mockReturnValue(new Promise((r) => { resolveFn = r }))
    const store = useAutofixStore()

    const p1 = store.runAutofix('proj', 'T')   // 진행 시작 (running=true)
    expect(store.isAutofixing('proj')).toBe(true)

    const res2 = await store.runAutofix('proj', 'T')   // 중복 시도
    expect(res2).toEqual({ duplicate: true })
    expect(axios.post).toHaveBeenCalledTimes(1)        // 두 번째는 요청조차 안 함

    resolveFn({ data: { changed: true, markdown: 'X' } })
    await p1
    expect(store.isAutofixing('proj')).toBe(false)
  })

  it('clearPending 으로 diff 를 비운다', async () => {
    axios.post.mockResolvedValue({ data: { changed: true, markdown: 'N', current_markdown: 'O' } })
    const store = useAutofixStore()
    await store.runAutofix('proj', 'T')
    expect(store.pendingDiff('proj')).not.toBeNull()

    store.clearPending('proj')
    expect(store.pendingDiff('proj')).toBeNull()
  })

  it('changed=false 면 pendingDiff 없음 + needsInput 반환', async () => {
    axios.post.mockResolvedValue({
      data: { changed: false, needs_input: [{ topic: 'auth', question: '?' }] },
    })
    const store = useAutofixStore()
    const res = await store.runAutofix('proj', 'T')

    expect(res.changed).toBe(false)
    expect(store.pendingDiff('proj')).toBeNull()
    expect(store.needsInput('proj')).toHaveLength(1)
  })

  it('요청 실패 시 {error} 반환 + 진행 상태 해제', async () => {
    axios.post.mockRejectedValue({ response: { status: 500 } })
    const store = useAutofixStore()
    const res = await store.runAutofix('proj', 'T')

    expect(res.error).toBeTruthy()
    expect(store.isAutofixing('proj')).toBe(false)
  })

  it('프로젝트별로 상태가 격리된다', async () => {
    axios.post.mockResolvedValue({ data: { changed: true, markdown: 'A', current_markdown: 'a' } })
    const store = useAutofixStore()
    await store.runAutofix('projA', 'T')

    expect(store.pendingDiff('projA')).not.toBeNull()
    expect(store.pendingDiff('projB')).toBeNull()
    expect(store.isAutofixing('projB')).toBe(false)
  })

  // ─── [2026-06] BE 영속값 복원 — 새로고침/다른 기기에서 인터뷰 안내 유지 ───

  it('restoreNeedsInput — 빈 store 에 BE 영속값을 복원한다', () => {
    const store = useAutofixStore()
    store.restoreNeedsInput('proj', [{ topic: 't', question: 'q' }])
    expect(store.needsInput('proj')).toEqual([{ topic: 't', question: 'q' }])
  })

  it('restoreNeedsInput — dismiss 된 프로젝트는 복원하지 않는다 (X 가 안 되살아나게)', () => {
    const store = useAutofixStore()
    store.restoreNeedsInput('proj', [{ topic: 't', question: 'q' }])
    store.clearNeedsInput('proj')   // 사용자 X
    store.restoreNeedsInput('proj', [{ topic: 't', question: 'q' }])  // 탭 복귀 재-hydrate
    expect(store.needsInput('proj')).toEqual([])
  })

  it('restoreNeedsInput — 이미 값이 있으면 덮지 않는다 (방금 받은 새 진단 우선)', async () => {
    axios.post.mockResolvedValue({
      data: { changed: false, markdown: '', needs_input: [{ topic: 'fresh', question: 'q' }] },
    })
    const store = useAutofixStore()
    await store.runAutofix('proj', 'T')
    store.restoreNeedsInput('proj', [{ topic: 'stale', question: 'q0' }])
    expect(store.needsInput('proj')).toEqual([{ topic: 'fresh', question: 'q' }])
  })

  it('runAutofix 재실행은 이전 dismiss 를 해제한다 (새 결과는 다시 보여야)', async () => {
    axios.post.mockResolvedValue({
      data: { changed: false, markdown: '', needs_input: [{ topic: 'n', question: 'q' }] },
    })
    const store = useAutofixStore()
    store.clearNeedsInput('proj')   // dismiss 상태에서
    await store.runAutofix('proj', 'T')
    expect(store.needsInput('proj')).toEqual([{ topic: 'n', question: 'q' }])
  })

  it('syncNeedsCleared — BE 가 비웠으면(인터뷰 merge 등) 세션 패널도 내린다', () => {
    const store = useAutofixStore()
    store.restoreNeedsInput('proj', [{ topic: 't', question: 'q' }])
    store.syncNeedsCleared('proj')
    expect(store.needsInput('proj')).toEqual([])
    // dismiss 가 아니므로 이후 새 영속값 복원은 다시 가능.
    store.restoreNeedsInput('proj', [{ topic: 't2', question: 'q2' }])
    expect(store.needsInput('proj')).toEqual([{ topic: 't2', question: 'q2' }])
  })

  it('syncNeedsCleared — 진행 중이면 no-op (옛 fetch 가 새 진단을 못 지우게)', async () => {
    let resolveFn
    axios.post.mockReturnValue(new Promise((r) => { resolveFn = r }))
    const store = useAutofixStore()
    const p = store.runAutofix('proj', 'T')
    store.syncNeedsCleared('proj')   // 진행 중 도착한 옛 getPRD
    resolveFn({ data: { changed: false, markdown: '', needs_input: [{ topic: 'n', question: 'q' }] } })
    await p
    expect(store.needsInput('proj')).toEqual([{ topic: 'n', question: 'q' }])
  })
})
