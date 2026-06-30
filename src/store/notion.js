/**
 * Notion import store — 페이지 검색 결과 + 커서 + 선택된 페이지 + preview 상태.
 *
 * 사용처:
 *   - components/plan/NotionImportDialog.vue — 다이얼로그 전체 상태
 *
 * 디자인:
 *   - 검색 결과는 cursor 페이지네이션으로 누적. 새 검색어 입력 시 reset.
 *   - preview 는 page_id → preview 객체 캐시 (다이얼로그 내에서만, localStorage X).
 *     BE 도 60초 캐시 → 동일 페이지 재클릭은 거의 무비용.
 *   - 다이얼로그 닫을 때 reset 으로 메모리 회수.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  searchNotionPagesApi,
  previewNotionPageApi,
  normalizeNotionPageApi,
} from '@/utils/notion'

export const useNotionStore = defineStore('notion', () => {
  // ─── 검색 state ──────────────────────────────────────────────
  const query = ref('')                  // 현재 검색어
  const results = ref([])                // 누적 결과 [{ id, title, icon, ... }]
  const nextCursor = ref(null)           // 다음 페이지 커서
  const hasMore = ref(false)             // 더 있는지
  const isSearching = ref(false)         // 첫 페이지 로딩
  const isLoadingMore = ref(false)       // load more 로딩
  const searchError = ref(null)          // { message, code, status } | null

  // ─── 선택 / preview state ────────────────────────────────────
  const selectedPageId = ref(null)
  const previewCache = ref({})           // { [pageId]: preview }
  const isPreviewing = ref(false)
  const previewError = ref(null)

  // ─── 정형화 state ─────────────────────────────────────────────
  // pageId+version 조합으로 캐시 — 같은 페이지의 다른 버전 변환은 다른 결과.
  const normalizedCache = ref({})        // { [`${pageId}::${version}`]: NotionNormalizeResponse }
  const isNormalizing = ref(false)
  const normalizeError = ref(null)

  // ─── computed ────────────────────────────────────────────────
  const selectedPage = computed(() =>
    results.value.find(r => r.id === selectedPageId.value) || null
  )
  const selectedPreview = computed(() =>
    selectedPageId.value ? previewCache.value[selectedPageId.value] || null : null
  )
  const isEmpty = computed(() =>
    !isSearching.value && results.value.length === 0
  )

  // ─── 검색 ────────────────────────────────────────────────────

  /**
   * 새 검색 (커서 리셋). q 가 이전과 같아도 강제 재요청.
   */
  const search = async (q = '') => {
    query.value = q
    results.value = []
    nextCursor.value = null
    hasMore.value = false
    searchError.value = null
    isSearching.value = true
    const result = await searchNotionPagesApi({ q, cursor: null })
    isSearching.value = false
    if (!result.success) {
      searchError.value = { message: result.error, code: result.code, status: result.status }
      return result
    }
    results.value = result.results
    nextCursor.value = result.nextCursor
    hasMore.value = result.hasMore
    return result
  }

  /** 다음 페이지 추가 로드 (커서 이어가기). */
  const loadMore = async () => {
    if (!hasMore.value || !nextCursor.value || isLoadingMore.value) return { success: false }
    isLoadingMore.value = true
    const result = await searchNotionPagesApi({
      q: query.value,
      cursor: nextCursor.value,
    })
    isLoadingMore.value = false
    if (!result.success) {
      searchError.value = { message: result.error, code: result.code, status: result.status }
      return result
    }
    results.value = [...results.value, ...result.results]
    nextCursor.value = result.nextCursor
    hasMore.value = result.hasMore
    return result
  }

  // ─── preview ─────────────────────────────────────────────────

  /**
   * 페이지 선택 + 미리보기. 캐시 hit 시 즉시 반환.
   */
  const selectAndPreview = async (pageId) => {
    if (!pageId) return { success: false }
    selectedPageId.value = pageId
    previewError.value = null
    // 캐시 hit
    if (previewCache.value[pageId]) {
      return { success: true, preview: previewCache.value[pageId], fromCache: true }
    }
    isPreviewing.value = true
    const result = await previewNotionPageApi(pageId)
    isPreviewing.value = false
    if (!result.success) {
      previewError.value = { message: result.error, code: result.code, status: result.status }
      return result
    }
    previewCache.value = { ...previewCache.value, [pageId]: result.preview }
    return result
  }

  // ─── 정형화 ─────────────────────────────────────────────────

  /**
   * 선택된 페이지를 LLM 정형화. 캐시 hit 시 즉시 반환.
   * @param {{ projectName: string, version: string }} ctx
   */
  const normalizeSelected = async ({ projectName, version, force = false }) => {
    if (!selectedPageId.value) return { success: false, error: '페이지가 선택되지 않았습니다.' }
    const key = `${selectedPageId.value}::${version}`
    // force=true: 사용자가 '다시 변환' 명시적으로 누른 경우 → 캐시 무시하고 LLM 재호출.
    // force=false (default): 다이얼로그 재진입 등 → 캐시 hit 으로 LLM 비용 절약.
    if (!force && normalizedCache.value[key]) {
      return { success: true, result: normalizedCache.value[key], fromCache: true }
    }
    normalizeError.value = null
    isNormalizing.value = true
    const result = await normalizeNotionPageApi({
      pageId: selectedPageId.value, projectName, version,
    })
    isNormalizing.value = false
    if (!result.success) {
      // BLOCK 케이스: BE 가 classification 메타도 함께 보냄 — store 에 보관해서 UI 가
      // 분류 chip + 근거 표시 가능 (현재 페이지 동안만).
      normalizeError.value = {
        message: result.error,
        code: result.code,
        status: result.status,
        classification: result.classification || null,
      }
      return result
    }
    normalizedCache.value = { ...normalizedCache.value, [key]: result.result }
    return result
  }

  /** 페이지 선택 해제 시 정형화 결과는 보존 (재선택 시 캐시 hit). */

  // ─── reset ───────────────────────────────────────────────────

  /** 다이얼로그 닫힐 때 호출 — 메모리 회수. */
  const reset = () => {
    query.value = ''
    results.value = []
    nextCursor.value = null
    hasMore.value = false
    searchError.value = null
    isSearching.value = false
    isLoadingMore.value = false
    selectedPageId.value = null
    previewCache.value = {}
    isPreviewing.value = false
    previewError.value = null
    normalizedCache.value = {}
    isNormalizing.value = false
    normalizeError.value = null
  }

  return {
    // state
    query, results, nextCursor, hasMore,
    isSearching, isLoadingMore, searchError,
    selectedPageId, previewCache, isPreviewing, previewError,
    normalizedCache, isNormalizing, normalizeError,
    // computed
    selectedPage, selectedPreview, isEmpty,
    // actions
    search, loadMore, selectAndPreview, normalizeSelected, reset,
  }
})
