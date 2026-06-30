/**
 * Repository 메타데이터 enrichment (GitHub API).
 *
 * 책임:
 *   - 각 repo에 대해 meta/languages/commits/contributors/readme/tree lazy 로드
 *   - 카드 표시용 헬퍼 (top languages, last commit, file count, LOC, commit count)
 *   - repos 변경 watch → 자동 enrichment 트리거
 */
import { ref, watch } from 'vue'
import { useHarnessStore } from '@/store/harness'
import { normalizeLanguages, formatRelativeKr } from '@/utils/github'

export const useRepoEnrichment = (reposRef) => {
  const store = useHarnessStore()

  // url → enriched data
  const repoMetaByUrl = ref({})
  // url → bool (in-flight)
  const repoMetaLoading = ref({})

  const loadRepoMeta = async (url, force = false) => {
    if (repoMetaLoading.value[url]) return
    if (!force) {
      const cached = store.getCachedRepoMeta(url)
      if (cached) {
        repoMetaByUrl.value[url] = { ...cached.data, fetchedAt: cached.fetchedAt }
        return
      }
    }
    repoMetaLoading.value[url] = true
    const result = await store.fetchRepoMeta({ url, force })
    repoMetaLoading.value[url] = false
    if (result.success) {
      repoMetaByUrl.value[url] = { ...result.data, fetchedAt: result.fetchedAt }
    } else {
      repoMetaByUrl.value[url] = { ok: false, error: result.error, status: result.status }
    }
  }

  const refreshRepoMeta = (url) => loadRepoMeta(url, true)

  // repos 변경 시 메타 lazy 로드 (병렬)
  watch(reposRef, async (list) => {
    for (const r of list) {
      if (!repoMetaByUrl.value[r.url] && !repoMetaLoading.value[r.url]) {
        loadRepoMeta(r.url) // await 안 함 — 병렬
      }
    }
  }, { deep: true })

  // 프로젝트 변경 시 메타 캐시 초기화
  watch(() => store.projectName, () => { repoMetaByUrl.value = {} })

  // ─── 카드 표시용 헬퍼 ─────────────────────────────────────
  const topLanguagesFor = (url) => {
    const meta = repoMetaByUrl.value[url]
    if (!meta?.languages) return []
    return normalizeLanguages(meta.languages).slice(0, 4)
  }
  const lastCommitFor = (url) => {
    const meta = repoMetaByUrl.value[url]
    return meta?.meta?.pushedAt ? formatRelativeKr(meta.meta.pushedAt) : '—'
  }
  const fileCountFor = (url) => {
    const meta = repoMetaByUrl.value[url]
    return meta?.tree?.fileCount || null
  }
  const locFor = (url) => {
    const meta = repoMetaByUrl.value[url]
    return meta?.tree?.estimatedLoc || null
  }
  const commitCountFor = (url) => {
    const meta = repoMetaByUrl.value[url]
    return meta?.commits?.length || 0
  }

  // 전체 repo 메타 새로고침
  const refreshAllMeta = async () => {
    for (const r of reposRef.value) await loadRepoMeta(r.url, true)
  }

  return {
    repoMetaByUrl,
    repoMetaLoading,
    loadRepoMeta,
    refreshRepoMeta,
    refreshAllMeta,
    topLanguagesFor,
    lastCommitFor,
    fileCountFor,
    locFor,
    commitCountFor,
  }
}
