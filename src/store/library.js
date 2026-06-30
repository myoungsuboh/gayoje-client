/**
 * Library store — 사용자 VibeRepo 라이브러리 관리.
 * lint/code/deliverables 페이지에서 "내 라이브러리" 드롭다운으로 공유.
 *
 * 백엔드 VibeRepoOut 스키마:
 *   { url, owner_handle, label, description, is_mine, added_at, updated_at }
 *   — id 필드 없음. URL 이 유일 키.
 *   — timestamp 는 ms 단위 (JS Date 호환).
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchLibraryApi, addLibraryApi, removeLibraryApi } from '@/utils/auth'

/** URL 정규화 — 비교 및 중복 체크용. */
const normalizeUrl = (raw) =>
  String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase()

export const useLibraryStore = defineStore('library', () => {
  const repos = ref([])        // [VibeRepoOut]
  const isFetching = ref(false)
  const isAdding = ref(false)
  const fetchedAt = ref(null)

  const isEmpty = computed(() => repos.value.length === 0)

  /** 라이브러리를 서버에서 로드 (30초 캐시). */
  const fetchLibrary = async ({ force = false } = {}) => {
    if (!force && fetchedAt.value && Date.now() - fetchedAt.value < 30000) {
      return { success: true, repos: repos.value, fromCache: true }
    }
    isFetching.value = true
    const result = await fetchLibraryApi()
    isFetching.value = false
    if (result.success) {
      repos.value = result.repos
      fetchedAt.value = Date.now()
    }
    return result
  }

  /**
   * URL 을 라이브러리에 추가 (백엔드는 같은 URL 재호출 시 upsert).
   * @param {{ url: string, label?: string, description?: string, is_mine?: boolean }}
   */
  const addRepo = async ({ url, label = '', description = '', is_mine = true }) => {
    if (!url) return { success: false, error: 'URL이 필요합니다.' }
    isAdding.value = true
    const result = await addLibraryApi({ url, label, description, is_mine })
    isAdding.value = false
    if (result.success) {
      fetchedAt.value = null
      await fetchLibrary({ force: true })
    }
    return result
  }

  /** URL 기준으로 repo 삭제. */
  const removeRepo = async (url) => {
    const result = await removeLibraryApi(url)
    if (result.success) {
      const norm = normalizeUrl(url)
      repos.value = repos.value.filter(r => normalizeUrl(r.url) !== norm)
    }
    return result
  }

  /** URL 이 이미 라이브러리에 있는지 확인. */
  const hasUrl = (url) => {
    if (!url) return false
    const norm = normalizeUrl(url)
    return repos.value.some(r => normalizeUrl(r.url) === norm)
  }

  return {
    repos, isFetching, isAdding, isEmpty,
    fetchLibrary, addRepo, removeRepo, hasUrl,
  }
})
