/**
 * Lineage store — analyzeLineage + Lineage Truth (정답 라벨) + PR 코멘트.
 *
 * [Truth/History 데이터 일원화]
 * 이전에는 truth/history 가 localStorage 전용 → 디바이스 의존, 팀 공유 불가,
 * 시크릿 모드 손실. 이제 BE `/api/v2/lineage/truth*` 로 일원화.
 * localStorage 는 in-memory 캐시 역할만 (네트워크 일시 실패 시 graceful 표시용)
 * — 사용자 전환 시 clearSession 이 정리.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from '@/utils/axios'
import { extractTaskId, pollJobUntilDone } from '@/utils/asyncJob'
import { API_BASE } from './api'
import { useProjectStore } from './project'
import { T_SHORT_MS, T_DEFAULT_MS, T_LONG_MS } from '@/utils/timeouts'

const LINEAGE_CACHE_KEY = 'harness_lineage_cache_v1'
const LINEAGE_TRUTH_KEY = 'harness_lineage_truth_v1'

// 분석 결과 캐시는 여전히 LS 사용 (큰 데이터 + 네트워크 비용). 사용자 전환 시 cleared.
const AI_SUGGEST_ENABLED =
  String(import.meta.env.VITE_LINEAGE_AI_SUGGEST || '').toLowerCase() === 'true'
const PR_COMMENT_ENABLED =
  String(import.meta.env.VITE_PR_COMMENT_ENABLED || '').toLowerCase() === 'true'

const loadJsonLS = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
const saveJsonLS = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const truthKey = (pn, itemType, itemId) =>
  `${pn || ''}|${itemType || ''}|${itemId || ''}`

export const useLineageStore = defineStore('lineage', () => {
  const projectStore = useProjectStore()
  const lineageCache = ref(loadJsonLS(LINEAGE_CACHE_KEY))
  const isAnalyzingLineage = ref(false)
  // localStorage 의 truth 는 더 이상 단일 source — 네트워크 실패 시 graceful 표시용
  // in-memory mirror 로만 사용. BE 가 단일 진실원.
  const lineageTruthCache = ref(loadJsonLS(LINEAGE_TRUTH_KEY))

  // 진행 중인 analyzeLineage 의 AbortController. 페이지 이탈/명시적 취소 시
  // controller.abort() → axios 가 throw → finally 가 state 정리.
  let _analyzeAbortController = null
  const cancelAnalyzeLineage = () => {
    if (_analyzeAbortController) {
      _analyzeAbortController.abort()
      _analyzeAbortController = null
    }
  }

  // ─── Lineage 분석 ──
  const getCachedLineage = (pn) => {
    const key = pn || projectStore.projectName
    return lineageCache.value[key] || null
  }
  const setCachedLineage = (pn, data, savedAt) => {
    const key = pn || projectStore.projectName
    lineageCache.value[key] = { data, savedAt: savedAt || Date.now() }
    saveJsonLS(LINEAGE_CACHE_KEY, lineageCache.value)
  }
  const clearLineageCache = (pn) => {
    if (pn) delete lineageCache.value[pn]
    else lineageCache.value = {}
    saveJsonLS(LINEAGE_CACHE_KEY, lineageCache.value)
  }

  const analyzeLineage = async ({ projectName: pn, onStage } = {}) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn) return { success: false, error: 'projectName required' }
    // 이전 호출 in-flight 면 취소 (사용자가 빠르게 두 번 클릭 / 페이지 전환 후 복귀).
    cancelAnalyzeLineage()
    const controller = new AbortController()
    _analyzeAbortController = controller
    isAnalyzingLineage.value = true
    try {
      // [2026-05-26] sync /analyzeLineage → v2 비동기 큐. multi-repo tree fetch +
      // 매칭이 크면 Caddy 305s timeout 위험. v2Base = VITE_API_BASE_URL (410 함정 회피).
      const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
      const enqueueRes = await axios.post(`${v2Base}/api/v2/pipelines/lineage`,
        { project_name: effectivePn },
        { timeout: 15_000, signal: controller.signal })
      const taskId = extractTaskId(enqueueRes.data)
      if (!taskId) throw new Error('Lineage 작업 등록 실패 — task_id 누락.')
      const info = await pollJobUntilDone(taskId, {
        intervalMs: 2000,
        maxWaitMs: 10 * 60 * 1000,
        signal: controller.signal,
        // [progress fix] BE 가 보내는 실제 단계(lineage:fetch/trees/match/saving)를
        // 호출자(useLineageAnalysis)로 전달 → 진행바를 작업량 기반으로 채움.
        onProgress: (i) => { if (i?.stage && typeof onStage === 'function') onStage(i.stage) },
      })
      // job result = LineageResult dict (wrap 없음). body.result || body 양쪽 호환.
      const result = info?.result ?? {}
      const savedAt = Date.now()
      setCachedLineage(effectivePn, result, savedAt)
      return { success: true, data: result, savedAt }
    } catch (error) {
      // abort 는 사용자 의도 — 성공/실패 어느 쪽도 아닌 별도 신호.
      if (axios.isCancel?.(error) || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
        return { success: false, cancelled: true, error: 'cancelled by user' }
      }
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      let msg = detail || error?.message || 'analyze lineage failed'
      if (status === 503) {
        msg = 'AI 작업 큐가 일시적으로 사용 불가합니다. 1~2분 후 다시 시도해주세요.'
      } else if (status === 429) {
        msg = '너무 자주 요청했습니다. 잠시 후 다시 시도하세요.'
      } else if (msg.includes('시간 안에 완료되지')) {
        msg = 'Lineage 분석이 10분 안에 못 끝났어요. 잠시 후 다시 시도하세요.'
      }
      return { success: false, error: msg }
    } finally {
      isAnalyzingLineage.value = false
      if (_analyzeAbortController === controller) _analyzeAbortController = null
    }
  }

  const fetchLastLineage = async ({ projectName: pn } = {}) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn) return { success: false, error: 'projectName required' }
    const cached = getCachedLineage(effectivePn)
    if (cached) {
      return { success: true, data: cached.data, savedAt: cached.savedAt, fromCache: true }
    }
    try {
      // v2 endpoint — gateway 우회로 (JWT + assert_owns 직접).
      // 404 = 결과 없음, 403 = ownership 부재 (axios interceptor 가 토스트).
      const response = await axios.get('/api/v2/pipelines/lineage/last', {
        params: { project_name: effectivePn },
        timeout: T_DEFAULT_MS,
      })
      const result = response.data || {}
      if (!result.data) return { success: true, found: false }
      setCachedLineage(effectivePn, result.data, result.saved_at)
      return { success: true, data: result.data, savedAt: result.saved_at, fromCache: false }
    } catch (error) {
      if (error?.response?.status === 404) return { success: true, found: false }
      return { success: false, error: error.message || 'fetch lineage failed' }
    }
  }

  // ─── Lineage Truth (정답 라벨) — BE API 가 단일 진실원 ──
  // BE 경로: `/api/v2/lineage/truth*` (JWT + assert_owns). axios 인스턴스가 자동 Bearer.
  //
  // [LS mirror 정책 — Sprint 8 P2 명료화]
  // localStorage 의 `harness_lineage_truth_v1` 는 *read-side cache* 일 뿐:
  //  - fetchLineageTruth 응답 → LS 에 mirror (다음 네트워크 실패 시 graceful 표시용)
  //  - save / delete → BE 호출 후 응답 그대로 LS 갱신 (다른 화면 즉시 동기화)
  //  - import → 직후 fetchLineageTruth 호출해 LS 전체 재동기화
  // 즉, BE 응답이 도착하기 전 LS 에 *임의* write 하지 않는다. 네트워크 실패 시엔
  // LS 의 옛 값을 fromServer=false 플래그와 함께 노출 (호출자가 신선도 판단).
  const readTruthFromLocal = (effectivePn, itemType) => {
    const prefix = `${effectivePn}|${itemType ? itemType + '|' : ''}`
    return Object.entries(lineageTruthCache.value)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v)
  }
  const writeTruthToLocal = (effectivePn, t) => {
    const k = truthKey(effectivePn, t.itemType, t.itemId)
    lineageTruthCache.value[k] = t
    saveJsonLS(LINEAGE_TRUTH_KEY, lineageTruthCache.value)
  }
  const removeTruthFromLocal = (effectivePn, itemType, itemId) => {
    const k = truthKey(effectivePn, itemType, itemId)
    delete lineageTruthCache.value[k]
    saveJsonLS(LINEAGE_TRUTH_KEY, lineageTruthCache.value)
  }

  const saveLineageTruth = async ({ projectName: pn, itemType, itemId, expectedFiles }) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn || !itemType || !itemId) {
      return { success: false, error: 'projectName + itemType + itemId required' }
    }
    const files = Array.isArray(expectedFiles) ? expectedFiles : []
    try {
      const response = await axios.post('/api/v2/lineage/truth',
        { project_name: effectivePn, item_type: itemType, item_id: itemId, expected_files: files },
        { timeout: T_SHORT_MS })
      // 응답을 mirror 캐시에 반영 (다른 컴포넌트가 즉시 본 값으로 동기화)
      const saved = response.data || {
        itemType, itemId, expectedFiles: files, updatedAt: Date.now(),
      }
      writeTruthToLocal(effectivePn, {
        itemType: saved.itemType, itemId: saved.itemId,
        expectedFiles: saved.expectedFiles || files,
        updatedAt: saved.updatedAt || Date.now(),
      })
      return { success: true, data: saved, syncedToServer: true }
    } catch (error) {
      // BE 실패 — 사용자에게 분명히 알림 (이전엔 silent localStorage 만 저장).
      return {
        success: false,
        syncedToServer: false,
        error: error?.response?.data?.detail || error.message || 'truth 저장 실패',
        status: error?.response?.status,
      }
    }
  }

  const fetchLineageTruth = async ({ projectName: pn, itemType } = {}) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn) return { success: false, error: 'projectName required' }
    try {
      const params = { project_name: effectivePn }
      if (itemType) params.item_type = itemType
      const response = await axios.get('/api/v2/lineage/truth', { params, timeout: T_SHORT_MS })
      const items = Array.isArray(response.data) ? response.data : []
      // 응답으로 LS mirror 갱신 — 동일 키 덮어쓰기, 다른 itemType 의 캐시는 보존.
      for (const t of items) {
        writeTruthToLocal(effectivePn, t)
      }
      return { success: true, items, fromServer: true }
    } catch (error) {
      // 네트워크 실패 — LS mirror 로 graceful degrade. 호출자가 fromServer 플래그로 구분.
      return {
        success: true,
        items: readTruthFromLocal(effectivePn, itemType),
        fromServer: false,
        error: error?.response?.data?.detail || error.message,
      }
    }
  }

  const deleteLineageTruth = async ({ projectName: pn, itemType, itemId }) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn || !itemType || !itemId) {
      return { success: false, error: 'projectName + itemType + itemId required' }
    }
    try {
      await axios.delete('/api/v2/lineage/truth', {
        params: { project_name: effectivePn, item_type: itemType, item_id: itemId },
        timeout: T_SHORT_MS,
      })
      removeTruthFromLocal(effectivePn, itemType, itemId)
      return { success: true, syncedToServer: true }
    } catch (error) {
      return {
        success: false,
        syncedToServer: false,
        error: error?.response?.data?.detail || error.message,
        status: error?.response?.status,
      }
    }
  }

  const importLineageTruth = async ({ projectName: pn, items, override = false }) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn) return { success: false, error: 'projectName required' }
    if (!Array.isArray(items)) return { success: false, error: 'items must be array' }
    try {
      const response = await axios.post('/api/v2/lineage/truth/import',
        { project_name: effectivePn, items, override },
        { timeout: T_DEFAULT_MS })
      const { written = 0, skipped = 0 } = response.data || {}
      // 임포트 직후 전체 truth 를 다시 조회해 LS mirror 동기화 (다음 fetchLineageTruth 와 중복 호출 줄이려)
      try {
        await fetchLineageTruth({ projectName: effectivePn })
      } catch (_) { /* mirror 동기화 실패는 무시 — 다음 화면 진입 시 fetch */ }
      return { success: true, written, skipped, syncedToServer: true }
    } catch (error) {
      return {
        success: false,
        syncedToServer: false,
        error: error?.response?.data?.detail || error.message,
        status: error?.response?.status,
      }
    }
  }

  const suggestLineageTruth = async ({ projectName: pn, itemType, itemId, itemName, repoUrls = [] }) => {
    const effectivePn = pn || projectStore.projectName
    if (!effectivePn || !itemType || !itemId) {
      return { success: false, error: 'projectName + itemType + itemId required' }
    }
    if (!AI_SUGGEST_ENABLED) {
      return { success: true, suggestions: [], enabled: false, reason: 'AI suggest disabled (set VITE_LINEAGE_AI_SUGGEST=true)' }
    }
    try {
      const response = await axios.post(`${API_BASE}/suggestLineageTruth`, {
        projectName: effectivePn, itemType, itemId, itemName, repoUrls,
      }, { timeout: T_LONG_MS })
      const suggestions = response.data?.suggestions || []
      return { success: true, suggestions, enabled: true }
    } catch (error) {
      return { success: false, error: error.message, enabled: true }
    }
  }

  const postPRComment = async ({ prUrl, body, projectName: pn }) => {
    const effectivePn = pn || projectStore.projectName
    if (!prUrl || !body) return { success: false, error: 'prUrl + body required' }
    if (!PR_COMMENT_ENABLED) {
      return { success: false, error: 'PR 코멘트 미활성 (VITE_PR_COMMENT_ENABLED=true 필요)', enabled: false }
    }
    try {
      const response = await axios.post(`${API_BASE}/postPRComment`, {
        prUrl, body, projectName: effectivePn,
      }, { timeout: T_DEFAULT_MS })
      if (response.data?.success === false) {
        return { success: false, error: response.data.error || 'PR 게시 실패' }
      }
      return { success: true, commentUrl: response.data?.commentUrl }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  return {
    isAnalyzingLineage,
    analyzeLineage, cancelAnalyzeLineage,
    fetchLastLineage, getCachedLineage, clearLineageCache,
    saveLineageTruth, fetchLineageTruth, deleteLineageTruth,
    importLineageTruth, suggestLineageTruth, postPRComment,
  }
})
