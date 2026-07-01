/**
 * Repos store — 프로젝트별 repo CRUD + GitHub API 메타 enrich.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from '@/utils/axios'
import { enrichRepo as ghEnrichRepo } from '@/utils/github'
import { detectRepoRole } from '@/utils/harnessHelpers'
import { API_BASE } from './api'
import { useProjectStore } from './project'
import { T_SHORT_MS } from '@/utils/timeouts'

const REPO_META_CACHE_KEY = 'gayoje_repo_meta_v1'
const REPO_META_TTL = 60 * 60 * 1000 // 1시간

const loadRepoMetaCache = () => {
  try {
    const raw = localStorage.getItem(REPO_META_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
const saveRepoMetaCache = (cache) => {
  try { localStorage.setItem(REPO_META_CACHE_KEY, JSON.stringify(cache)) } catch {}
}

export const useReposStore = defineStore('repos', () => {
  const projectStore = useProjectStore()
  const projectReposCache = ref({})   // { [projectName]: { repos, fetchedAt } }
  const repoMetaCache = ref(loadRepoMetaCache())

  const fetchProjectRepos = async ({ projectName: pn, force = false } = {}) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn) return { success: false, error: 'projectName required' }

    if (!force) {
      const cached = projectReposCache.value[effectivePn]
      if (cached && Date.now() - cached.fetchedAt < 30000) {
        return { success: true, repos: cached.repos, fromCache: true }
      }
    }

    try {
      const response = await axios.post(`${API_BASE}/getProjectRepos`,
        { projectName: effectivePn },
        { timeout: T_SHORT_MS })
      const repos = (response.data && response.data.repos) || []
      projectReposCache.value[effectivePn] = { repos, fetchedAt: Date.now() }
      return { success: true, repos, fromCache: false }
    } catch (error) {
      return { success: false, error: error.message || 'fetch repos failed' }
    }
  }

  const addProjectRepo = async ({ projectName: pn, url, role, label }) => {
    const effectivePn = pn || projectStore.projectName
    const effectiveUrl = String(url || '').trim().replace(/\/+$/, '').replace(/\.git$/i, '')
    if (!effectivePn || !effectiveUrl) return { success: false, error: 'projectName + url required' }

    const effectiveRole = role || detectRepoRole(effectiveUrl)
    const effectiveLabel = label || ''

    try {
      const response = await axios.post(`${API_BASE}/addProjectRepo`, {
        projectName: effectivePn,
        url: effectiveUrl,
        role: effectiveRole,
        label: effectiveLabel,
      }, { timeout: T_SHORT_MS })
      delete projectReposCache.value[effectivePn]
      return { success: true, data: response.data }
    } catch (error) {
      return { success: false, error: error.message || 'add repo failed' }
    }
  }

  const deleteProjectRepo = async ({ projectName: pn, url }) => {
    const effectivePn = pn || projectStore.projectName
    const effectiveUrl = String(url || '').trim().replace(/\/+$/, '').replace(/\.git$/i, '')
    if (!effectivePn || !effectiveUrl) return { success: false, error: 'projectName + url required' }

    try {
      const response = await axios.post(`${API_BASE}/deleteProjectRepo`, {
        projectName: effectivePn,
        url: effectiveUrl,
      }, { timeout: T_SHORT_MS })
      delete projectReposCache.value[effectivePn]
      return { success: true, data: response.data }
    } catch (error) {
      return { success: false, error: error.message || 'delete repo failed' }
    }
  }

  const autoRegisterRepo = async (args) => {
    try { await addProjectRepo(args) } catch { /* silent */ }
  }

  // ─── Repo Meta (GitHub API enrichment) ──
  const getCachedRepoMeta = (url) => {
    const entry = repoMetaCache.value[url]
    if (!entry) return null
    if (Date.now() - entry.fetchedAt > REPO_META_TTL) return null
    return entry
  }

  const fetchRepoMeta = async ({ url, force = false } = {}) => {
    if (!url) return { success: false, error: 'url required' }
    if (!force) {
      const cached = getCachedRepoMeta(url)
      if (cached) return { success: true, data: cached.data, fromCache: true, fetchedAt: cached.fetchedAt }
    }
    const result = await ghEnrichRepo(url)
    if (!result.ok) {
      return { success: false, error: result.error || 'fetch failed', status: result.status }
    }
    repoMetaCache.value[url] = { data: result, fetchedAt: Date.now() }
    saveRepoMetaCache(repoMetaCache.value)
    return { success: true, data: result, fromCache: false, fetchedAt: Date.now() }
  }

  const clearRepoMetaCache = (url) => {
    if (url) delete repoMetaCache.value[url]
    else repoMetaCache.value = {}
    saveRepoMetaCache(repoMetaCache.value)
  }

  return {
    fetchProjectRepos, addProjectRepo, deleteProjectRepo, autoRegisterRepo,
    detectRepoRole,
    fetchRepoMeta, getCachedRepoMeta, clearRepoMetaCache,
  }
})
