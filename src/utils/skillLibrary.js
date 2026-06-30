/**
 * Skill Library API — 유저 단위 스킬 보관함 호출.
 *
 * 백엔드 (harness-server) 의 /auth/me/skill-library/* 매핑:
 *   GET    /                          → fetchSkillLibraryApi()
 *   POST   /folders                   → createFolderApi(payload)
 *   PATCH  /folders/{id}              → updateFolderApi(id, payload)
 *   DELETE /folders/{id}?cascade=bool → deleteFolderApi(id, cascade)
 *   POST   /skills                    → createLibrarySkillApi(payload)
 *   PATCH  /skills/{id}               → updateLibrarySkillApi(id, payload)
 *   DELETE /skills/{id}               → deleteLibrarySkillApi(id)
 *   POST   /import-from-project       → importFromProjectApi(payload)
 *   POST   /export-to-project         → exportToProjectApi(payload)
 *   POST   /check-export-conflicts    → checkExportConflictsApi(payload)
 *
 * [응답 규약]
 * 성공: { success: true, data: ... }
 * 실패: { success: false, error: string, status?: number, detail?: object }
 *
 * 한도 초과 (402 QUOTA_EXCEEDED) 는 axios interceptor 가 UpgradePromptDialog
 * 자동 트리거 — 호출자는 reject 받지만 추가 UX 처리 불필요.
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'
import i18n from '@/plugins/i18n'

const t = (key) => i18n.global.t(key)

const AUTH_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const PREFIX = `${AUTH_BASE}/auth/me/skill-library`

// ─── 전체 조회 ──────────────────────────────────────────

/**
 * 내 스킬 라이브러리 전체. 빈 사용자는 backend 가 자동 5개 폴더 생성 후 반환.
 *
 * Returns:
 *   { success: true, data: {
 *       entries: [{ folder: {id, name, ...}, skills: [{...}] }],
 *       total_skill_count: number,
 *       skill_limit: number,
 *       subscription_type: 'free' | 'pro'
 *     }}
 */
export const fetchSkillLibraryApi = async () => {
  try {
    const res = await axios.get(PREFIX)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.fetch_failed')),
      status: error?.response?.status,
    }
  }
}

// ─── 폴더 CRUD ──────────────────────────────────────────

/**
 * @param {{ name: string, description?: string, color?: string, category?: string }} payload
 */
export const createFolderApi = async (payload) => {
  try {
    const res = await axios.post(`${PREFIX}/folders`, payload)
    return { success: true, folder: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.folder_create_failed')),
      status: error?.response?.status,
    }
  }
}

/**
 * @param {string} folderId
 * @param {{ name?: string, description?: string, color?: string, category?: string }} payload
 */
export const updateFolderApi = async (folderId, payload) => {
  try {
    const res = await axios.patch(`${PREFIX}/folders/${encodeURIComponent(folderId)}`, payload)
    return { success: true, folder: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.folder_update_failed')),
      status: error?.response?.status,
    }
  }
}

/**
 * 폴더 삭제.
 * @param {string} folderId
 * @param {boolean} cascade — true: 안 스킬도 삭제 / false: '미분류' 폴더로 이동
 *
 * Returns:
 *   { success: true, result: { mode: 'cascade'|'moved', deleted_skill_count?, moved_skill_count?, unfiled_folder_id? } }
 *
 * 주의: 시스템 미분류 폴더(is_system) 본인을 cascade=false 로 삭제 시 backend 가
 * 자동 cascade 전환 → result.mode='cascade' 로 반환 (FE 는 그에 따라 메시지).
 */
export const deleteFolderApi = async (folderId, cascade = false) => {
  try {
    const res = await axios.delete(
      `${PREFIX}/folders/${encodeURIComponent(folderId)}`,
      { params: { cascade } },
    )
    return { success: true, result: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.folder_delete_failed')),
      status: error?.response?.status,
    }
  }
}

// ─── 스킬 CRUD ──────────────────────────────────────────

/**
 * @param {{ folder_id: string, name: string, scope?: string, priority?: 'High'|'Medium'|'Low',
 *           trigger_condition?: string, instructions?: string[], tags?: string[] }} payload
 */
export const createLibrarySkillApi = async (payload) => {
  try {
    const res = await axios.post(`${PREFIX}/skills`, payload)
    return { success: true, skill: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.skill_create_failed')),
      status: error?.response?.status,
      detail: error?.response?.data?.detail,  // 한도 초과 (402) 의 경우 FE 가 검사
    }
  }
}

/**
 * @param {string} skillId
 * @param {object} payload — 부분 업데이트. folder_id 지정 시 폴더 이동.
 */
export const updateLibrarySkillApi = async (skillId, payload) => {
  try {
    const res = await axios.patch(`${PREFIX}/skills/${encodeURIComponent(skillId)}`, payload)
    return { success: true, skill: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.skill_update_failed')),
      status: error?.response?.status,
    }
  }
}

export const deleteLibrarySkillApi = async (skillId) => {
  try {
    await axios.delete(`${PREFIX}/skills/${encodeURIComponent(skillId)}`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.skill_delete_failed')),
      status: error?.response?.status,
    }
  }
}

// ─── Import / Export ───────────────────────────────────

/**
 * 프로젝트 Skill 들을 라이브러리 폴더로 복사.
 * @param {{ project_name: string, skill_ids: string[], folder_id: string }} payload
 *
 * Returns:
 *   { success: true, data: { imported: [...], new_total_skill_count: number, skill_limit: number } }
 *
 * 한도 초과 시: success=false, status=402, detail.code='QUOTA_EXCEEDED' (interceptor 가 모달).
 */
export const importFromProjectApi = async (payload) => {
  try {
    const res = await axios.post(`${PREFIX}/import-from-project`, payload)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.import_failed')),
      status: error?.response?.status,
      detail: error?.response?.data?.detail,
    }
  }
}

/**
 * 라이브러리 스킬을 현재 프로젝트의 Skill 노드로 복사.
 * @param {{ project_name: string, library_skill_ids: string[],
 *           conflict_strategy: 'overwrite'|'skip'|'rename' }} payload
 *
 * Returns:
 *   { success: true, data: { imported_ids, skipped_ids, renamed } }
 */
export const exportToProjectApi = async (payload) => {
  try {
    const res = await axios.post(`${PREFIX}/export-to-project`, payload)
    return { success: true, data: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.export_failed')),
      status: error?.response?.status,
    }
  }
}

/**
 * export 전 충돌 ID 미리 검사 — FE 가 다이얼로그 표시 여부 결정용.
 * @param {{ project_name: string, skill_ids: string[] }} payload
 *
 * Returns: { success: true, conflictingIds: string[] }
 */
export const checkExportConflictsApi = async (payload) => {
  try {
    const res = await axios.post(`${PREFIX}/check-export-conflicts`, payload)
    return { success: true, conflictingIds: res.data?.conflicting_ids || [] }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('rule.skill_library_api.conflict_check_failed')),
      status: error?.response?.status,
    }
  }
}
