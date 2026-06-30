import { ref } from 'vue'
import axios from '@/utils/axios'

/**
 * useDocStaleDismiss — CPS/PRD 'markdown_stale 배너 dismiss' 공통 로직.
 *
 * [2026-06 공통화] CpsTab/PrdTab 이 동일 구조로 구현하던 stale dismiss
 * (POST .../markdown-stale/dismiss → 성공 토스트 → saved emit, 실패 시 에러 토스트)를
 * 추출. endpoint·토스트·emit 만 host 가 주입하고, 통신은 utils/axios 그대로 사용.
 *
 * @param {object} opts
 * @param {string} opts.endpoint              dismiss POST 경로 (.../markdown-stale/dismiss)
 * @param {() => string} opts.getProjectName  프로젝트명 getter (없으면 no-op — 기존 동작)
 * @param {() => void} [opts.onOk]            성공 시 (보통 success 토스트)
 * @param {() => void} [opts.onFail]          실패 시 (보통 error 토스트)
 * @param {() => void} [opts.onSaved]         성공 후 부모 알림 (보통 emit('saved'))
 * @returns {{ isDismissingStale: import('vue').Ref<boolean>, dismissStale: () => Promise<void> }}
 */
export function useDocStaleDismiss({ endpoint, getProjectName, onOk, onFail, onSaved } = {}) {
  const isDismissingStale = ref(false)

  const dismissStale = async () => {
    if (!getProjectName?.()) return
    isDismissingStale.value = true
    try {
      const base = import.meta.env.VITE_API_BASE_URL ?? ''
      await axios.post(`${base}${endpoint}`, { project_name: getProjectName() })
      onOk?.()
      onSaved?.()
    } catch (err) {
      console.error('stale dismiss 실패:', err)
      onFail?.()
    } finally {
      isDismissingStale.value = false
    }
  }

  return { isDismissingStale, dismissStale }
}
