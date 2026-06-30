/**
 * 프로젝트 repo 별 lint 점수 lazy 로드 + 집계 KPI.
 *
 * [추출 배경]
 * deliverables.vue 가 657 줄로 비대 — 가장 큰 도메인 블록 (lintByUrl 상태,
 * loadLintForRepo, kpi computed) 을 분리. 페이지는 view 책임만 남기고
 * "각 repo 의 lint 점수가 어떻게 계산되는가" 는 이 composable 안에서 자족.
 *
 * [입력]
 *   - repos: ref<Repo[]>  — useProjectRepos 의 결과
 *   - repoMetaByUrl: ref<{ [url]: { tree?, ... } }>  — useRepoEnrichment 의 결과
 *   - store: HarnessStore  — getCachedLint / fetchLastLintResult / projectName
 *
 * [반환]
 *   - lintByUrl: ref<{ [url]: { score, savedAt, loaded } }>
 *   - loadLintForRepo(url): Promise<void>  — 캐시 hit 면 skip
 *   - kpi: computed<{ repoCount, lintAvg, lintCount, totalFiles, totalLoc, lastUpdated }>
 *
 * lazy 정책: 새 repo 추가 시에만 추가 fetch. 페이지 진입 시 repos 전체 watch.
 */
import { ref, computed, watch } from 'vue'

export const useRepoLintScores = (repos, repoMetaByUrl, store) => {
  const lintByUrl = ref({})

  const loadLintForRepo = async (url) => {
    // 이미 entry 가 있으면 in-flight 또는 완료 — 어느 쪽이든 BE 중복 fetch 차단.
    // (이전엔 loaded 만 체크 → watch immediate + 첫 reactive update 의 ms 격차 사이에
    //  중복 호출 가능. Sprint 8 P2 픽스.)
    if (lintByUrl.value[url]) return
    lintByUrl.value[url] = { score: null, savedAt: null, loaded: false }

    const cached = store.getCachedLint(store.projectName, url)
    if (cached?.data?.result) {
      lintByUrl.value[url] = {
        score: cached.data.result.score,
        savedAt: cached.savedAt,
        loaded: true,
      }
      return
    }

    const fetched = await store.fetchLastLintResult({
      projectName: store.projectName,
      githubUrl: url,
    })
    if (fetched.success && fetched.found) {
      lintByUrl.value[url] = {
        score: fetched.data?.result?.score ?? null,
        savedAt: fetched.savedAt,
        loaded: true,
      }
    } else {
      lintByUrl.value[url] = { score: null, savedAt: null, loaded: true }
    }
  }

  // repos 가 바뀔 때마다 누락된 repo 의 lint 만 lazy 로드 (이미 loaded 면 skip).
  watch(
    repos,
    async (list) => {
      for (const r of list || []) await loadLintForRepo(r.url)
    },
    { deep: true, immediate: true },
  )

  const kpi = computed(() => {
    const list = repos.value || []
    const scores = list
      .map((r) => lintByUrl.value[r.url]?.score)
      .filter((s) => typeof s === 'number')
    const avg = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null

    const lastUpdated = list
      .map((r) => r.updatedAt || r.addedAt || 0)
      .reduce((a, b) => Math.max(a, b), 0)

    // 메타에서 총 LOC + 파일 수 합산
    let totalFiles = 0
    let totalLoc = 0
    for (const r of list) {
      const meta = repoMetaByUrl.value?.[r.url]
      if (meta?.tree) {
        totalFiles += meta.tree.fileCount || 0
        totalLoc += meta.tree.estimatedLoc || 0
      }
    }

    return {
      repoCount: list.length,
      lintAvg: avg,
      lintCount: scores.length,
      totalFiles,
      totalLoc,
      lastUpdated,
    }
  })

  return { lintByUrl, loadLintForRepo, kpi }
}
