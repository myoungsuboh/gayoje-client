/**
 * Uploads store — 사용자별 미팅 로그 업로드 히스토리.
 *
 * 백엔드 (harness-server#4): /auth/me/uploads
 *   목록은 메타만 (id, filename, size, uploaded_at)
 *   본문은 단건 조회 (getUploadApi) 로 별도 — payload 절약.
 *
 * timestamp 는 ms unix (JS Date 호환).
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchUploadsApi,
  addUploadApi,
  getUploadApi,
  removeUploadApi,
} from '@/utils/auth'

// 본문 캐시 — 같은 업로드를 두 번 다운로드하지 않도록.
// store 메모리에만 유지 (localStorage 사용 안 함 — 텍스트가 클 수 있어 quota 위험).

export const useUploadsStore = defineStore('uploads', () => {
  const uploads = ref([])              // [{ id, filename, size, uploaded_at }]
  const contentCache = ref({})         // { [uploadId]: content }
  const isFetching = ref(false)
  const isAdding = ref(false)
  const fetchedAt = ref(null)

  const isEmpty = computed(() => uploads.value.length === 0)

  /** 메타 목록 로드 (30초 캐시). */
  const fetchUploads = async ({ force = false } = {}) => {
    if (!force && fetchedAt.value && Date.now() - fetchedAt.value < 30000) {
      return { success: true, uploads: uploads.value, fromCache: true }
    }
    isFetching.value = true
    const result = await fetchUploadsApi()
    isFetching.value = false
    if (result.success) {
      uploads.value = result.uploads
      fetchedAt.value = Date.now()
    }
    return result
  }

  /**
   * 업로드 등록 — 본문 텍스트를 백엔드에 영속화.
   * @param {{ filename: string, content: string }}
   */
  const addUpload = async ({ filename, content }) => {
    if (!filename || !content) return { success: false, error: '파일명과 본문이 필요합니다.' }
    isAdding.value = true
    const result = await addUploadApi({ filename, content })
    isAdding.value = false
    if (result.success) {
      // 본문은 호출자가 이미 갖고 있으므로 캐시에 미리 넣어둠 (재다운로드 회피)
      if (result.upload?.id) {
        contentCache.value[result.upload.id] = content
      }
      fetchedAt.value = null
      await fetchUploads({ force: true })
    }
    return result
  }

  /**
   * 단건 본문 조회 (캐시 우선). 호출자는 result.content 사용.
   */
  const getUploadContent = async (uploadId) => {
    if (!uploadId) return { success: false, error: 'id 가 비어 있습니다.' }
    const cached = contentCache.value[uploadId]
    if (cached !== undefined) {
      return { success: true, content: cached, fromCache: true }
    }
    const result = await getUploadApi(uploadId)
    if (result.success && result.upload?.content !== undefined) {
      contentCache.value[uploadId] = result.upload.content
      return { success: true, content: result.upload.content, fromCache: false }
    }
    return result
  }

  /** 삭제. */
  const removeUpload = async (uploadId) => {
    const result = await removeUploadApi(uploadId)
    if (result.success) {
      uploads.value = uploads.value.filter(u => u.id !== uploadId)
      delete contentCache.value[uploadId]
    }
    return result
  }

  return {
    uploads, isFetching, isAdding, isEmpty,
    fetchUploads, addUpload, getUploadContent, removeUpload,
  }
})
