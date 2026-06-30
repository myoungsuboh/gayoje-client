/**
 * Notion 페이지 import API helper — backend `/api/v2/notion/*`.
 *
 * 라우트 (app/api/notion_routes.py):
 *   GET  /api/v2/notion/pages?q=&cursor=&page_size=  → 워크스페이스 페이지 검색
 *   GET  /api/v2/notion/pages/{page_id}/preview      → markdown 변환 미리보기
 *   POST /api/v2/notion/import                       → post_meeting 파이프라인 enqueue
 *
 * 에러 코드 매핑 (BE _handle_notion_error):
 *   412 + code='NOTION_NOT_LINKED'    → 노션 미연결 — profile 안내
 *   412 + code='NOTION_TOKEN_REVOKED' → BE 가 자동 unlink — 재연결 안내
 *   429 + code='NOTION_RATE_LIMITED'  → 잠시 후 재시도 (retry_after 힌트)
 *   404 + code='NOTION_NOT_FOUND'     → 페이지 없음/접근 권한 없음
 *   422 + code='NOTION_PAGE_EMPTY'    → 페이지가 비어있음
 *   402 + code='QUOTA_EXCEEDED'       → axios interceptor 가 자동 UpgradePrompt
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'
import i18n from '@/plugins/i18n'

const t = (key) => i18n.global.t(key)

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const NOTION_BASE = `${API_BASE}/api/v2/notion`

/**
 * 응답 detail.code 추출 — BE 가 { code, message } 구조로 보냄.
 * 일반 string detail 도 허용 (legacy).
 */
const extractErrorCode = (error) => {
  const detail = error?.response?.data?.detail
  if (detail && typeof detail === 'object') return detail.code || null
  return null
}

/**
 * 400 NOTION_CONTENT_NOT_SUPPORTED 응답에서 분류 메타 추출.
 * BE: detail = { code, message, classification: { type, confidence, reason, tier } }
 */
const extractClassification = (error) => {
  const detail = error?.response?.data?.detail
  if (detail && typeof detail === 'object' && detail.classification) {
    return detail.classification
  }
  return null
}

/** 분류 type → 라벨 (chip 표시용). */
export const classificationLabel = (type) => {
  switch (type) {
    case 'meeting_log': return t('plan.notion.label_meeting_log')
    case 'retrospective': return t('plan.notion.label_retrospective')
    case 'spec_doc': return t('plan.notion.label_spec_doc')
    case 'task_request': return t('plan.notion.label_task_request')
    case 'general_doc': return t('plan.notion.label_general_doc')
    case 'unknown': return t('plan.notion.label_unknown')
    default: return type || '—'
  }
}

/**
 * 페이지 검색.
 * @param {{ q?: string, cursor?: string, pageSize?: number }} opts
 * @returns {Promise<{
 *   success: boolean,
 *   results?: Array<{ id, title, icon, url, last_edited_time, parent_type }>,
 *   hasMore?: boolean,
 *   nextCursor?: string|null,
 *   error?: string,
 *   code?: string,
 *   status?: number,
 * }>}
 */
export const searchNotionPagesApi = async ({ q = '', cursor = null, pageSize = 25 } = {}) => {
  try {
    const params = { page_size: pageSize }
    if (q) params.q = q
    if (cursor) params.cursor = cursor
    const res = await axios.get(`${NOTION_BASE}/pages`, { params })
    return {
      success: true,
      results: res.data?.results || [],
      hasMore: !!res.data?.has_more,
      nextCursor: res.data?.next_cursor || null,
    }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('plan.notion.err_search_fail')),
      code: extractErrorCode(error),
      status: error?.response?.status,
    }
  }
}

/**
 * 페이지 미리보기 — markdown 변환 결과.
 * BE 가 60초 캐시. 같은 페이지 재호출은 BE 캐시 사용.
 * @param {string} pageId Notion 페이지 ID 또는 URL
 * @returns {Promise<{
 *   success: boolean,
 *   preview?: { page_id, title, markdown, char_count, block_count, last_edited_time },
 *   error?: string,
 *   code?: string,
 *   status?: number,
 * }>}
 */
export const previewNotionPageApi = async (pageId) => {
  if (!pageId) return { success: false, error: t('plan.notion.err_page_id_empty') }
  try {
    const encoded = encodeURIComponent(pageId)
    const res = await axios.get(`${NOTION_BASE}/pages/${encoded}/preview`)
    return { success: true, preview: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('plan.notion.err_preview_fail')),
      code: extractErrorCode(error),
      status: error?.response?.status,
    }
  }
}

/**
 * 페이지 markdown → 표준 미팅 로그 포맷 LLM 정형화 (등록 X).
 *
 * BE `/api/v2/notion/normalize` — 등록 전 결과만 받아서 FE textarea 에 표시.
 *
 * @param {{ pageId: string, projectName: string, version: string }} payload
 * @returns {Promise<{
 *   success: boolean,
 *   result?: {
 *     page_id: string,
 *     title: string,
 *     original_markdown: string,
 *     normalized_markdown: string,
 *     original_char_count: number,
 *     normalized_char_count: number,
 *     truncated: boolean,
 *   },
 *   error?: string,
 *   code?: string,
 *   status?: number,
 * }>}
 */
export const normalizeNotionPageApi = async ({ pageId, projectName, version }) => {
  if (!pageId) return { success: false, error: t('plan.notion.err_page_id_empty') }
  if (!projectName) return { success: false, error: t('plan.notion.err_no_project') }
  if (!version) return { success: false, error: t('plan.notion.err_version_empty') }
  try {
    const body = { page_id: pageId, project_name: projectName, version }
    // 300s timeout — LLM call 평균 3~10초, 보수적으로.
    const res = await axios.post(`${NOTION_BASE}/normalize`, body, { timeout: 300000 })
    return { success: true, result: res.data }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('plan.notion.err_normalize_fail')),
      code: extractErrorCode(error),
      // BLOCK 케이스에서 BE 가 분류 메타도 함께 보냄 — FE 가 사용자에게 근거 노출
      classification: extractClassification(error),
      status: error?.response?.status,
    }
  }
}

/**
 * 페이지를 회의록으로 import — post_meeting 파이프라인 enqueue.
 *
 * 응답 task_id 를 jobsStore.startJob 으로 추적하면 기존 batch UI 와 동일한 진행 표시.
 *
 * @param {{ pageId: string, projectName: string, version: string, date?: string,
 *           previousCpsId?: string, previousPrdId?: string }} payload
 * @returns {Promise<{
 *   success: boolean,
 *   taskId?: string,
 *   pageId?: string,
 *   title?: string,
 *   charCount?: number,
 *   error?: string,
 *   code?: string,
 *   status?: number,
 * }>}
 */
export const importNotionPageApi = async ({
  pageId,
  projectName,
  version,
  date = '',
  meetingContent = null,
  previousCpsId = null,
  previousPrdId = null,
}) => {
  if (!pageId) return { success: false, error: t('plan.notion.err_page_id_empty') }
  if (!projectName) return { success: false, error: t('plan.notion.err_no_project') }
  if (!version) return { success: false, error: t('plan.notion.err_version_empty') }
  try {
    const body = {
      page_id: pageId,
      project_name: projectName,
      version,
      date,
    }
    if (meetingContent != null) body.meeting_content = meetingContent
    if (previousCpsId) body.previous_cps_id = previousCpsId
    if (previousPrdId) body.previous_prd_id = previousPrdId
    // 300s timeout — import 안에서 Notion fetch + 변환까지 BE 가 동기로 처리.
    const res = await axios.post(`${NOTION_BASE}/import`, body, { timeout: 300000 })
    return {
      success: true,
      taskId: res.data?.task_id,
      pageId: res.data?.page_id,
      title: res.data?.title,
      charCount: res.data?.markdown_char_count,
    }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('plan.notion.err_import_fail')),
      code: extractErrorCode(error),
      status: error?.response?.status,
    }
  }
}

/**
 * CPS/PRD/설계를 Notion 허브 페이지로 export (BE 가 멱등 생성/갱신).
 *
 * @param {{ projectName: string, docs: Array<'cps'|'prd'|'design'>,
 *           parentPageId?: string|null, teamId?: string|null }} payload
 * @returns {Promise<{ success:true, hub_url:string|null, results:Array }
 *           | { success:false, error:string, code?:string, status?:number }>}
 *   results[i] = { doc, status: 'created'|'updated'|'skipped'|'failed'|'need_parent', url?, error? }
 */
export const exportToNotionApi = async ({
  projectName,
  docs = [],
  parentPageId = null,
  teamId = null,
} = {}) => {
  if (!projectName) return { success: false, error: t('plan.notion.export_fail') }
  if (!docs || docs.length === 0) {
    return { success: false, error: t('plan.notion.export_empty_docs') }
  }
  try {
    const body = { project_name: projectName, docs }
    if (parentPageId) body.parent_page_id = parentPageId
    // team_id 는 항상 명시 전송 — axios 인터셉터가 team_id==null 일 때 활성 팀을 자동
    // 주입(개인 프로젝트 export 가 팀으로 오염)하는 것을 방지. '' = 개인 프로젝트.
    body.team_id = teamId || ''
    // 300s — BE 가 Notion 페이지 생성/블록 append 까지 동기로 처리.
    const res = await axios.post(`${NOTION_BASE}/export`, body, { timeout: 300000 })
    return {
      success: true,
      hub_url: res.data?.hub_url ?? null,
      results: res.data?.results || [],
    }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, t('plan.notion.export_fail')),
      code: extractErrorCode(error),
      status: error?.response?.status,
    }
  }
}


/**
 * 에러 코드 → 사용자 친화 메시지 변환 (다이얼로그/스낵바 둘 다 사용).
 *
 * 호출자가 코드 분기 분기 안 짜도 한 줄로 처리 가능.
 *   const msg = notionErrorMessage(result.code) || result.error
 */
export const notionErrorMessage = (code) => {
  switch (code) {
    case 'NOTION_NOT_LINKED':
      return t('plan.notion.err_not_linked')
    case 'NOTION_TOKEN_REVOKED':
      return t('plan.notion.err_token_revoked')
    case 'NOTION_RATE_LIMITED':
      return t('plan.notion.err_rate_limited')
    case 'NOTION_NOT_FOUND':
      return t('plan.notion.err_not_found')
    case 'NOTION_PAGE_EMPTY':
      return t('plan.notion.err_page_empty')
    case 'NOTION_PAGE_TOO_SHORT':
      return t('plan.notion.err_page_too_short')
    case 'NOTION_NORMALIZE_FAILED':
      return t('plan.notion.err_normalize_format')
    case 'NOTION_CONTENT_NOT_SUPPORTED':
      return t('plan.notion.err_content_not_supported')
    case 'NOTION_BAD_REQUEST':
      return t('plan.notion.err_bad_request')
    case 'NOTION_UPSTREAM_ERROR':
      return t('plan.notion.err_upstream')
    default:
      return null
  }
}
