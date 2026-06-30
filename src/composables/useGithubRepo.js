/**
 * useGithubRepo — GitHub repo 메타 + 트리 로딩 composable.
 *
 * [책임 분할]
 * - 이 composable: repo / tree 메타 state + 로딩 액션
 * - page (code.vue): tab / activeFilePath / content cache / selectFile / mobile toggle
 *
 * [README 자동 오픈]
 * loadRepo 는 fileExplorer 채운 후 README 후보 node 를 결과로 반환.
 * page 는 그 node 를 받아 selectFile 호출 (selectFile 이 fileContentCache /
 * activeFilePath 등 page state 를 다루므로 composable 이 직접 호출하면 결합도 ↑).
 *
 * [state reset]
 * loadRepo 시작 시 fileExplorer / repoInfo 만 리셋. page 의 다른 state (openTabs,
 * activeFilePath, fileContentCache 등) 는 page 가 onLoadStart 콜백으로 처리.
 *
 * Args:
 *   options.onLoadStart : 새 repo 로드 시작 시 호출되는 콜백 (page state reset 용)
 *   options.store       : useHarnessStore() 인스턴스 (githubUrl + autoRegisterRepo 갱신)
 *
 * Returns:
 *   { githubUrl, isRepoLoading, repoError, repoInfo, fileExplorer,
 *     loadRepo(urlOverride?) -> { readme: fileNode | null } }
 */
import { ref } from 'vue'
import axios from '@/utils/axios'
import i18n from '@/plugins/i18n'
import { parseGithubUrl } from '@/utils/github'
import { buildFileTree, mapGithubProxyError } from '@/utils/githubCode'

// 비컴포넌트(composable)에서 번역 — utils/githubCode.js · axios.js 와 동일 패턴.
const t = (key, params) => i18n.global.t(key, params)


export const useGithubRepo = ({ onLoadStart, store } = {}) => {
  // state — composable 안에 위치
  const githubUrl = ref(store?.githubUrl || '')
  const isRepoLoading = ref(false)
  const repoError = ref('')
  const repoInfo = ref(null)         // { owner, repo, branch } | null
  const fileExplorer = ref([])

  /**
   * GitHub repo 메타 + 재귀 트리 fetch.
   *
   * 흐름:
   *   1. URL 파싱 (실패 시 즉시 repoError 설정 후 return)
   *   2. store 갱신 (Lint 페이지 와 single source — store.githubUrl)
   *   3. page state reset 콜백 호출 (onLoadStart)
   *   4. /api/github/repo + /api/github/tree 병렬은 아니지만 sequential fetch
   *   5. fileExplorer 채움
   *   6. README.md root-level 후보 반환 (page 가 selectFile 호출)
   *
   * @param {string} [urlOverride] - 라이브러리 chip 클릭 시 URL 직접 전달
   * @returns {Promise<{ readme: object | null }>}
   *   readme: fileExplorer 의 README.md root-level node (있으면) — page 가 자동 오픈 트리거
   */
  const loadRepo = async (urlOverride) => {
    const url = urlOverride || githubUrl.value
    const parsed = parseGithubUrl(url)
    if (!parsed) {
      repoError.value = t('code.url_input.invalid_url')
      return { readme: null }
    }

    // Deliverables 용 passive 등록 (best-effort) + Lint 공유용 store 갱신.
    const normalized = url.trim()
    if (store?.autoRegisterRepo) {
      store.autoRegisterRepo({ projectName: store.projectName, url: normalized })
    }
    if (store?.setGithubUrl) {
      store.setGithubUrl(normalized)
    }

    // page state reset (openTabs / activeFilePath / fileContentCache / currentContent ...)
    onLoadStart?.()

    isRepoLoading.value = true
    repoError.value = ''
    repoInfo.value = null
    fileExplorer.value = []

    try {
      // 1) 저장소 메타 (default branch 확인)
      const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}`
      const repoRes = await axios.get('/api/github/repo', { params: { url: repoUrl } })
      const branch = repoRes.data?.default_branch || 'main'

      // 2) 재귀 파일 트리
      const treeRes = await axios.get('/api/github/tree', {
        params: { url: repoUrl, ref: branch },
      })
      const treeData = treeRes.data || {}

      if (treeData.truncated) {
        repoError.value = t('code.url_input.truncated')
      }

      repoInfo.value = { owner: parsed.owner, repo: parsed.repo, branch }
      fileExplorer.value = buildFileTree(treeData.tree || [])
      githubUrl.value = repoUrl

    } catch (err) {
      repoError.value = mapGithubProxyError(err)
    } finally {
      // 트리가 채워지자마자 사이드바 로딩 해제
      isRepoLoading.value = false
    }

    // README.md 자동 오픈 후보 — 트리 표시를 막지 않도록 page 에 넘김.
    const readme = fileExplorer.value.find(
      f => f.type === 'file' && f.name.toLowerCase() === 'readme.md' && f.depth === 0,
    ) || null

    return { readme }
  }

  return {
    // state
    githubUrl,
    isRepoLoading,
    repoError,
    repoInfo,
    fileExplorer,
    // actions
    loadRepo,
  }
}
