/**
 * useRepoLintScores — deliverables.vue 에서 추출한 lint score + KPI composable.
 *
 * [검증]
 * - cache hit 시 store.fetchLastLintResult 호출 안 함
 * - cache miss 시 BE fetch + lintByUrl 갱신
 * - 이미 loaded 된 repo 는 재호출 시 skip
 * - kpi: avg / lintCount / totalFiles / totalLoc / lastUpdated 정상 집계
 * - score 가 null 인 repo 는 평균 계산에서 제외
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRepoLintScores } from '@/composables/useRepoLintScores'

const makeStore = ({ cached = {}, fetched = {} } = {}) => ({
  projectName: 'proj_x',
  getCachedLint: vi.fn((pn, url) => cached[url] || null),
  fetchLastLintResult: vi.fn(async ({ githubUrl }) => fetched[githubUrl] || { success: true, found: false }),
})

describe('useRepoLintScores — loadLintForRepo', () => {
  it('cache hit 면 BE fetch 안 함', async () => {
    const repos = ref([{ url: 'r1' }])
    const meta = ref({})
    const store = makeStore({
      cached: { r1: { data: { result: { score: 88 } }, savedAt: 1700 } },
    })
    const { lintByUrl } = useRepoLintScores(repos, meta, store)
    await nextTick()
    await nextTick()
    expect(store.fetchLastLintResult).not.toHaveBeenCalled()
    expect(lintByUrl.value['r1']).toEqual({ score: 88, savedAt: 1700, loaded: true })
  })

  it('cache miss + BE found → score 갱신', async () => {
    const repos = ref([{ url: 'r2' }])
    const meta = ref({})
    const store = makeStore({
      fetched: { r2: { success: true, found: true, data: { result: { score: 71 } }, savedAt: 2000 } },
    })
    const { lintByUrl } = useRepoLintScores(repos, meta, store)
    await nextTick(); await nextTick()
    expect(store.fetchLastLintResult).toHaveBeenCalledTimes(1)
    expect(lintByUrl.value['r2']).toEqual({ score: 71, savedAt: 2000, loaded: true })
  })

  it('cache miss + BE not found → loaded=true / score=null', async () => {
    const repos = ref([{ url: 'r3' }])
    const meta = ref({})
    const store = makeStore()  // fetched empty → found=false
    const { lintByUrl } = useRepoLintScores(repos, meta, store)
    await nextTick(); await nextTick()
    expect(lintByUrl.value['r3']).toEqual({ score: null, savedAt: null, loaded: true })
  })

  it('이미 loaded 된 repo 는 직접 loadLintForRepo 재호출해도 skip', async () => {
    const repos = ref([{ url: 'r4' }])
    const meta = ref({})
    const store = makeStore({
      cached: { r4: { data: { result: { score: 50 } }, savedAt: 1 } },
    })
    const { loadLintForRepo } = useRepoLintScores(repos, meta, store)
    await nextTick(); await nextTick()
    store.getCachedLint.mockClear()
    await loadLintForRepo('r4')
    expect(store.getCachedLint).not.toHaveBeenCalled()
  })
})

describe('useRepoLintScores — kpi', () => {
  it('평균은 score 가 숫자인 repo 만 — null 제외', async () => {
    const repos = ref([
      { url: 'a', updatedAt: 100 },
      { url: 'b', updatedAt: 200 },
      { url: 'c', updatedAt: 50 },
    ])
    const meta = ref({
      a: { tree: { fileCount: 10, estimatedLoc: 1000 } },
      b: { tree: { fileCount: 5,  estimatedLoc: 500 } },
      c: { tree: { fileCount: 1,  estimatedLoc: 100 } },
    })
    const store = makeStore({
      cached: {
        a: { data: { result: { score: 80 } }, savedAt: 1 },
        b: { data: { result: { score: 60 } }, savedAt: 2 },
        // c: 캐시 없고 BE도 없음 → null
      },
    })
    const { kpi } = useRepoLintScores(repos, meta, store)
    await nextTick(); await nextTick()
    expect(kpi.value.repoCount).toBe(3)
    expect(kpi.value.lintCount).toBe(2)         // c 는 null 이라 제외
    expect(kpi.value.lintAvg).toBe(70)
    expect(kpi.value.totalFiles).toBe(16)
    expect(kpi.value.totalLoc).toBe(1600)
    expect(kpi.value.lastUpdated).toBe(200)
  })

  it('repo 0개 → 모두 0 / null', async () => {
    const repos = ref([])
    const meta = ref({})
    const store = makeStore()
    const { kpi } = useRepoLintScores(repos, meta, store)
    await nextTick()
    expect(kpi.value).toEqual({
      repoCount: 0,
      lintAvg: null,
      lintCount: 0,
      totalFiles: 0,
      totalLoc: 0,
      lastUpdated: 0,
    })
  })

  it('meta 가 없는 repo 는 totalFiles/Loc 누락분 무시 (NaN 안 됨)', async () => {
    const repos = ref([{ url: 'r1' }])
    const meta = ref({})       // r1 meta 미존재
    const store = makeStore()
    const { kpi } = useRepoLintScores(repos, meta, store)
    await nextTick(); await nextTick()
    expect(kpi.value.totalFiles).toBe(0)
    expect(kpi.value.totalLoc).toBe(0)
  })
})
