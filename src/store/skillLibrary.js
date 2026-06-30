/**
 * Skill Library store — 유저 단위 스킬 보관함 상태 관리.
 *
 * [용도]
 * - SkillLibraryModal 이 메인 소비자
 * - RuleGeneratorTab 의 "라이브러리에서 가져오기" / AI 추천 라이브러리 옵션도 공유
 *
 * [캐시]
 * - 첫 진입 시 fetch, 이후 30초 캐시 (force=true 또는 mutation 직후 무효화)
 * - mutation (folder/skill CRUD) 후 자동 갱신
 *
 * [한도 표시]
 * - totalSkillCount / skillLimit / isAtLimit / atRiskOfLimit (80%+)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchSkillLibraryApi,
  createFolderApi,
  updateFolderApi,
  deleteFolderApi,
  createLibrarySkillApi,
  updateLibrarySkillApi,
  deleteLibrarySkillApi,
  importFromProjectApi,
  exportToProjectApi,
  checkExportConflictsApi,
} from '@/utils/skillLibrary'

const CACHE_TTL_MS = 30_000

// 폴더 컬러 preset 6종 — 사용자 결정 (Phase 1 확정)
export const FOLDER_COLOR_PRESETS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#6b7280', label: 'Gray' },
]

// 폴더 이름 / 카테고리 검증 — backend name_validation.py 와 동일 정규식.
// (FE 가 입력 시점에 사전 차단 + BE 도 422 던짐 — 이중 방어)
const NAME_PATTERN = /^[가-힣a-zA-Z0-9 \-_]{1,50}$/

/** 입력 시점 검증 — 위반 시 사용자에게 빨갛게 표시할 메시지 반환. 통과면 null. */
export const validateFolderName = (name) => {
  if (!name || !name.trim()) return '이름을 입력해주세요.'
  const trimmed = name.trim()
  if (trimmed.length > 50) return `최대 50자까지 입력 가능합니다. (현재 ${trimmed.length}자)`
  if (!NAME_PATTERN.test(trimmed)) {
    return "한글, 영문, 숫자, 공백, '-', '_' 만 사용 가능합니다."
  }
  return null
}

export const useSkillLibraryStore = defineStore('skillLibrary', () => {
  // ─── state ───────────────────────────────────────────
  // 백엔드 응답 구조 그대로 보존 — 가공은 computed 에서.
  const entries = ref([])              // [{ folder, skills }]
  const totalSkillCount = ref(0)
  const skillLimit = ref(100)
  const subscriptionType = ref('free')

  const isLoading = ref(false)
  const isMutating = ref(false)       // 폴더/스킬 CRUD 진행 중
  const errorMsg = ref('')
  const fetchedAt = ref(0)

  // ─── derived ─────────────────────────────────────────
  /** 폴더 트리 (탭/사이드바 용). 최신순 정렬. */
  const folders = computed(() => entries.value.map(e => e.folder))

  /** folder.id → entry 매핑 (O(1) 조회). */
  const entriesByFolderId = computed(() => {
    const m = new Map()
    for (const e of entries.value) m.set(e.folder.id, e)
    return m
  })

  /** 전체 스킬 flat list. 검색 / 일괄 작업용. */
  const allSkills = computed(() => {
    const out = []
    for (const e of entries.value) {
      for (const s of e.skills) out.push(s)
    }
    return out
  })

  /** skill.id → skill 매핑. */
  const skillsById = computed(() => {
    const m = new Map()
    for (const s of allSkills.value) m.set(s.id, s)
    return m
  })

  const usagePct = computed(() => {
    if (!skillLimit.value) return 0
    return Math.min(100, Math.round((totalSkillCount.value / skillLimit.value) * 100))
  })
  const isAtLimit = computed(() => totalSkillCount.value >= skillLimit.value)
  const atRiskOfLimit = computed(() => usagePct.value >= 80 && !isAtLimit.value)

  const isEmpty = computed(() => entries.value.length === 0)

  /** 폴더 id 별 스킬 리스트 조회. */
  const skillsInFolder = (folderId) => entriesByFolderId.value.get(folderId)?.skills ?? []

  /** 폴더 id → 폴더 객체 조회. */
  const folderById = (folderId) => entriesByFolderId.value.get(folderId)?.folder ?? null

  // ─── actions: 조회 ───────────────────────────────────

  /**
   * 라이브러리 로드. force=false 면 30초 캐시. mutation 직후엔 자동으로 force.
   */
  const load = async ({ force = false } = {}) => {
    if (!force && entries.value.length > 0 && Date.now() - fetchedAt.value < CACHE_TTL_MS) {
      return { success: true, fromCache: true }
    }
    if (isLoading.value) return { success: false, error: 'already loading' }
    isLoading.value = true
    errorMsg.value = ''
    const r = await fetchSkillLibraryApi()
    isLoading.value = false
    if (!r.success) {
      errorMsg.value = r.error
      return { success: false, error: r.error }
    }
    entries.value = r.data?.entries ?? []
    totalSkillCount.value = r.data?.total_skill_count ?? 0
    skillLimit.value = r.data?.skill_limit ?? 100
    subscriptionType.value = r.data?.subscription_type ?? 'free'
    fetchedAt.value = Date.now()
    return { success: true }
  }

  // ─── actions: 폴더 CRUD ──────────────────────────────

  const createFolder = async (payload) => {
    isMutating.value = true
    const r = await createFolderApi(payload)
    isMutating.value = false
    if (r.success) await load({ force: true })
    return r
  }

  const updateFolder = async (folderId, payload) => {
    isMutating.value = true
    const r = await updateFolderApi(folderId, payload)
    isMutating.value = false
    if (r.success) await load({ force: true })
    return r
  }

  const deleteFolder = async (folderId, cascade) => {
    isMutating.value = true
    const r = await deleteFolderApi(folderId, cascade)
    isMutating.value = false
    if (r.success) await load({ force: true })
    return r
  }

  // ─── actions: 스킬 CRUD ──────────────────────────────

  const addSkill = async (payload) => {
    isMutating.value = true
    const r = await createLibrarySkillApi(payload)
    isMutating.value = false
    if (r.success) await load({ force: true })
    return r
  }

  const updateSkill = async (skillId, payload) => {
    isMutating.value = true
    const r = await updateLibrarySkillApi(skillId, payload)
    isMutating.value = false
    if (r.success) await load({ force: true })
    return r
  }

  const deleteSkill = async (skillId) => {
    isMutating.value = true
    const r = await deleteLibrarySkillApi(skillId)
    isMutating.value = false
    if (r.success) await load({ force: true })
    return r
  }

  // ─── actions: Import / Export ───────────────────────

  const importFromProject = async (payload) => {
    isMutating.value = true
    const r = await importFromProjectApi(payload)
    isMutating.value = false
    if (r.success) await load({ force: true })
    return r
  }

  const exportToProject = async (payload) => {
    isMutating.value = true
    const r = await exportToProjectApi(payload)
    isMutating.value = false
    // export 는 라이브러리 자체엔 변화 없음 — 갱신 불필요
    return r
  }

  const checkExportConflicts = (payload) => checkExportConflictsApi(payload)

  // ─── reset (로그아웃 시) ─────────────────────────────

  const reset = () => {
    entries.value = []
    totalSkillCount.value = 0
    skillLimit.value = 100
    subscriptionType.value = 'free'
    fetchedAt.value = 0
    errorMsg.value = ''
  }

  return {
    // state
    entries, totalSkillCount, skillLimit, subscriptionType,
    isLoading, isMutating, errorMsg,
    // derived
    folders, allSkills, skillsById, entriesByFolderId,
    usagePct, isAtLimit, atRiskOfLimit, isEmpty,
    skillsInFolder, folderById,
    // actions
    load, createFolder, updateFolder, deleteFolder,
    addSkill, updateSkill, deleteSkill,
    importFromProject, exportToProject, checkExportConflicts,
    reset,
  }
})
