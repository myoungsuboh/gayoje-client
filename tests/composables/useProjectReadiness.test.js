/**
 * useProjectReadiness composable 회귀 테스트.
 *
 * 검증 포인트:
 * - projectName 없으면 모두 false
 * - 3 API 응답 (meeting / cps / prd) 별로 has* 플래그 매핑 정확
 * - 같은 프로젝트는 캐시 hit — 재호출 시 axios 한 번만
 * - force=true 면 캐시 무시
 * - invalidate() 호출 후 다음 check() 는 다시 fetch
 * - 동시 호출 시 inflight dedupe — 한 fetch 만 발생
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/axios', () => ({
  default: { get: vi.fn() },
}))
vi.mock('@/store/harness', () => ({
  useHarnessStore: vi.fn(),
  API_BASE: '/api/gateway',
}))

import axios from '@/utils/axios'
import { useHarnessStore } from '@/store/harness'
import { useProjectReadiness } from '@/composables/useProjectReadiness'

const _resp = (resultArr) => ({ data: { result: resultArr } })

describe('useProjectReadiness', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // module-scope state 가 테스트 간 누적되므로 invalidate 로 초기화 (axios 호출 없음).
    useHarnessStore.mockReturnValue({ projectName: '' })
    useProjectReadiness().invalidate()
    axios.get.mockReset()
  })

  it('projectName 없으면 check 후 모두 false', async () => {
    useHarnessStore.mockReturnValue({ projectName: '' })
    const r = useProjectReadiness()
    await r.check()
    expect(r.hasMeetingLogs.value).toBe(false)
    expect(r.hasCps.value).toBe(false)
    expect(r.hasPrd.value).toBe(false)
    expect(r.isReady.value).toBe(false)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('3개 API 모두 데이터 있으면 isReady=true', async () => {
    useHarnessStore.mockReturnValue({ projectName: 'p1' })
    axios.get
      .mockResolvedValueOnce(_resp([{ version: 'v1.1' }]))
      .mockResolvedValueOnce(_resp([{ master_id: 'cps-1' }]))
      .mockResolvedValueOnce(_resp([{ master_id: 'prd-1' }]))
    const r = useProjectReadiness()
    await r.check()
    expect(r.hasMeetingLogs.value).toBe(true)
    expect(r.hasCps.value).toBe(true)
    expect(r.hasPrd.value).toBe(true)
    expect(r.isReady.value).toBe(true)
  })

  it('CPS 만 빈 배열이면 hasCps=false / isReady=false', async () => {
    useHarnessStore.mockReturnValue({ projectName: 'p2' })
    axios.get
      .mockResolvedValueOnce(_resp([{ version: 'v1.1' }]))
      .mockResolvedValueOnce(_resp([]))
      .mockResolvedValueOnce(_resp([{ master_id: 'prd-1' }]))
    const r = useProjectReadiness()
    await r.check()
    expect(r.hasMeetingLogs.value).toBe(true)
    expect(r.hasCps.value).toBe(false)
    expect(r.hasPrd.value).toBe(true)
    expect(r.isReady.value).toBe(false)
  })

  it('한 API 가 reject 돼도 다른 결과는 정상 반영 (Promise.allSettled)', async () => {
    useHarnessStore.mockReturnValue({ projectName: 'p3' })
    axios.get
      .mockResolvedValueOnce(_resp([{ version: 'v1.1' }]))
      .mockRejectedValueOnce(new Error('403'))
      .mockResolvedValueOnce(_resp([{ master_id: 'prd-1' }]))
    const r = useProjectReadiness()
    await r.check()
    expect(r.hasMeetingLogs.value).toBe(true)
    expect(r.hasCps.value).toBe(false)
    expect(r.hasPrd.value).toBe(true)
  })

  it('같은 projectName 두 번 check — 두 번째는 캐시 hit (axios 3회 그대로)', async () => {
    useHarnessStore.mockReturnValue({ projectName: 'p4' })
    axios.get.mockResolvedValue(_resp([{ x: 1 }]))
    const r = useProjectReadiness()
    await r.check()
    expect(axios.get).toHaveBeenCalledTimes(3)
    await r.check()  // 캐시 hit — 추가 호출 없음
    expect(axios.get).toHaveBeenCalledTimes(3)
  })

  it('force=true 면 캐시 무시하고 재조회', async () => {
    useHarnessStore.mockReturnValue({ projectName: 'p5' })
    axios.get.mockResolvedValue(_resp([{ x: 1 }]))
    const r = useProjectReadiness()
    await r.check()
    expect(axios.get).toHaveBeenCalledTimes(3)
    await r.check(true)  // 강제
    expect(axios.get).toHaveBeenCalledTimes(6)
  })

  it('invalidate 후 다음 check 는 재조회', async () => {
    useHarnessStore.mockReturnValue({ projectName: 'p6' })
    axios.get.mockResolvedValue(_resp([{ x: 1 }]))
    const r = useProjectReadiness()
    await r.check()
    expect(axios.get).toHaveBeenCalledTimes(3)
    r.invalidate()
    await r.check()  // 재조회
    expect(axios.get).toHaveBeenCalledTimes(6)
  })

  it('동시에 두 번 호출하면 inflight dedupe — axios 3회만', async () => {
    useHarnessStore.mockReturnValue({ projectName: 'p7' })
    axios.get.mockResolvedValue(_resp([{ x: 1 }]))
    const r = useProjectReadiness()
    await Promise.all([r.check(), r.check()])
    expect(axios.get).toHaveBeenCalledTimes(3)
  })
})
