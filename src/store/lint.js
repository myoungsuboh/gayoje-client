/**
 * Lint store — Lint 캐시 + run/fetch/fix-spec API.
 *
 * 캐시는 localStorage 에 (검증·마이그레이션 로직 동반).
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from '@/utils/axios'
import { extractTaskId, pollJobUntilDone } from '@/utils/asyncJob'
import { isFakeOrErrorResult, buildLintCacheKey } from '@/utils/harnessHelpers'
import i18n from '@/plugins/i18n'
import { API_BASE } from './api'
import { useProjectStore } from './project'
import { T_DEFAULT_MS } from '@/utils/timeouts'

const LINT_CACHE_KEY = 'harness_lint_cache_v1'

const loadLintCacheFromStorage = () => {
  try {
    const raw = localStorage.getItem(LINT_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const saveLintCacheToStorage = (cache) => {
  try {
    localStorage.setItem(LINT_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // quota exceeded — silently ignore
  }
}

export const useLintStore = defineStore('lint', () => {
  const projectStore = useProjectStore()
  const lintCache = ref(loadLintCacheFromStorage())
  const isLinting = ref(false)
  const isGeneratingFixSpec = ref(false)

  // 진행 중인 runLint 의 AbortController. 페이지 이탈 / 강제 종료 시 abort.
  let _lintAbortController = null
  const cancelLint = () => {
    if (_lintAbortController) {
      _lintAbortController.abort()
      _lintAbortController = null
    }
  }

  const getCachedLint = (pn, gu) => {
    const key = buildLintCacheKey(pn, gu)
    const entry = lintCache.value[key]
    if (!entry) return null
    // 옛 가짜/에러 결과 자동 정리
    if (isFakeOrErrorResult(entry.data)) {
      delete lintCache.value[key]
      saveLintCacheToStorage(lintCache.value)
      return null
    }
    return entry
  }

  const setCachedLint = (pn, gu, data) => {
    if (isFakeOrErrorResult(data)) return false
    const key = buildLintCacheKey(pn, gu)
    lintCache.value[key] = { data, savedAt: Date.now() }
    saveLintCacheToStorage(lintCache.value)
    return true
  }

  const clearProjectLintCache = (pn) => {
    const prefix = `${pn || ''}|`
    Object.keys(lintCache.value).forEach((k) => {
      if (k.startsWith(prefix)) delete lintCache.value[k]
    })
    saveLintCacheToStorage(lintCache.value)
  }

  const runLint = async ({ projectName: pn, githubUrl: gu, force = false }) => {
    const effectivePn = pn || projectStore.projectName
    const effectiveGu = (gu || projectStore.githubUrl || '').trim()

    if (!force) {
      const cached = getCachedLint(effectivePn, effectiveGu)
      if (cached) {
        return { success: true, data: cached.data, fromCache: true, savedAt: cached.savedAt }
      }
    }

    cancelLint()
    const controller = new AbortController()
    _lintAbortController = controller
    isLinting.value = true
    try {
      // [2026-05-26] sync /runLint → v2 비동기 큐. Caddy 305s 안에 큰 repo
      // lint (Phase A 샘플 + Phase B LLM residual) 못 끝나면 Network Error 발생
      // 하던 문제 해소. v2Base = VITE_API_BASE_URL (API_BASE='/api/gateway' 아님 — 410 함정).
      const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
      const enqueueRes = await axios.post(`${v2Base}/api/v2/pipelines/lint`, {
        project_name: effectivePn,
        github_url: effectiveGu,
      }, { timeout: 15_000, signal: controller.signal })
      const taskId = extractTaskId(enqueueRes.data)
      if (!taskId) throw new Error(i18n.global.t('lint.store.enqueue_failed'))
      const info = await pollJobUntilDone(taskId, {
        intervalMs: 2000,
        maxWaitMs: 10 * 60 * 1000,
        signal: controller.signal,
      })
      // job result = LintResult dict (wrap 없음). sync 응답은 { result: {...} }
      // 형태였으므로 동일하게 wrapping → setCachedLint / 소비처 호환.
      const wrapped = { result: info?.result ?? {} }
      setCachedLint(effectivePn, effectiveGu, wrapped)
      return { success: true, data: wrapped, fromCache: false, savedAt: Date.now() }
    } catch (error) {
      if (axios.isCancel?.(error) || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
        return { success: false, cancelled: true, error: 'cancelled by user' }
      }
      // BE 상태별 사용자 친화 메시지 매핑.
      //   403: 프로젝트 ownership 없음 (다른 사용자가 만든 프로젝트 또는 아직 미생성)
      //   429: rate limit
      //   기타: BE detail 또는 default
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      let msg = detail || error?.message || i18n.global.t('lint.store.run_default')
      if (status === 403) {
        msg = i18n.global.t('lint.store.no_permission', { project: effectivePn })
      } else if (status === 404) {
        msg = i18n.global.t('lint.store.not_found')
      } else if (status === 503) {
        msg = i18n.global.t('lint.store.queue_unavailable')
      } else if (status === 429) {
        msg = i18n.global.t('lint.store.rate_limit')
      } else if (msg.includes('시간 안에 완료되지')) {
        msg = i18n.global.t('lint.store.run_timeout')
      }
      return { success: false, error: msg, status }
    } finally {
      isLinting.value = false
      if (_lintAbortController === controller) _lintAbortController = null
    }
  }

  const fetchLastLintResult = async ({ projectName: pn, githubUrl: gu }) => {
    const effectivePn = pn || projectStore.projectName
    const effectiveGu = (gu || projectStore.githubUrl || '').trim()
    if (!effectivePn || !effectiveGu) return { success: false, error: 'missing input' }
    try {
      const response = await axios.get(`${API_BASE}/getLastLintResult`, {
        params: { projectName: effectivePn, githubUrl: effectiveGu },
        timeout: T_DEFAULT_MS,
      })
      const body = response.data || {}
      if (!body.found || !body.result) {
        return { success: true, found: false }
      }
      const wrapped = { result: body.result }
      setCachedLint(effectivePn, effectiveGu, wrapped)
      return { success: true, found: true, data: wrapped, savedAt: body.savedAt || Date.now() }
    } catch (error) {
      return { success: false, error: error.message || 'fetch failed' }
    }
  }

  const generateFixSpec = async ({ projectName: pn, githubUrl: gu, lintResult }) => {
    const effectivePn = pn || projectStore.projectName
    const effectiveGu = (gu || projectStore.githubUrl || '').trim()

    if (!effectivePn || !effectiveGu) {
      return { success: false, error: i18n.global.t('lint.store.fix_spec_missing_input') }
    }
    if (!lintResult || !Array.isArray(lintResult.cases)) {
      return { success: false, error: i18n.global.t('lint.store.fix_spec_no_result') }
    }

    isGeneratingFixSpec.value = true
    try {
      // [2026-05-26] sync /generateFixSpec → v2 비동기 큐. lint_result 가 크면
      // LLM 처리 길어져 Caddy 305s timeout 위험. v2Base = VITE_API_BASE_URL.
      const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
      const enqueueRes = await axios.post(`${v2Base}/api/v2/pipelines/generate_fix_spec`, {
        project_name: effectivePn,
        github_url: effectiveGu,
        lint_result: lintResult,
      }, { timeout: 15_000 })
      const taskId = extractTaskId(enqueueRes.data)
      if (!taskId) throw new Error(i18n.global.t('lint.store.fix_spec_enqueue_failed'))
      const info = await pollJobUntilDone(taskId, {
        intervalMs: 2000,
        maxWaitMs: 10 * 60 * 1000,
      })
      isGeneratingFixSpec.value = false
      // job result = { success, markdown, filename, message, metadata } (wrap 없음).
      // sync 응답은 { result: {...} } 였으므로 동일 wrapping.
      return { success: true, data: { result: info?.result ?? {} } }
    } catch (error) {
      isGeneratingFixSpec.value = false
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      let msg = detail || error?.message || i18n.global.t('lint.store.fix_spec_default')
      if (status === 503) {
        msg = i18n.global.t('lint.store.queue_unavailable')
      } else if (status === 429) {
        msg = i18n.global.t('lint.store.rate_limit')
      } else if (msg.includes('시간 안에 완료되지')) {
        msg = i18n.global.t('lint.store.fix_spec_timeout')
      }
      return { success: false, error: msg }
    }
  }

  return {
    isLinting, isGeneratingFixSpec,
    getCachedLint, setCachedLint, clearProjectLintCache,
    runLint, cancelLint,
    fetchLastLintResult, generateFixSpec,
  }
})
