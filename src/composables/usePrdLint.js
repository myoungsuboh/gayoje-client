/**
 * [B 단계 — 2026-05-25] PRD raw text 충실도 lint.
 *
 * POST /api/v2/prd-lint 호출. LLM 미사용 — ~10ms 응답.
 * debounce 600ms 로 사용자 타이핑 중 과도 호출 방지.
 *
 * 사용:
 *   const { report, loading } = usePrdLint(prdTextRef)
 *   <PrdLintBadge :report="report" :loading="loading" />
 */
import { ref, watch } from 'vue'
import axios from '@/utils/axios'

const DEBOUNCE_MS = 600
const MIN_BYTES = 50  // 그 미만은 의미 없음 (lint 호출 건너뜀)

export function usePrdLint(prdTextRef) {
  const report = ref(null)
  const loading = ref(false)
  const error = ref(null)
  let timer = null

  async function runLint() {
    const text = (prdTextRef?.value ?? prdTextRef) || ''
    if (!text || text.length < MIN_BYTES) {
      report.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      // _silent: true — 사용자 타이핑 중 백그라운드 호출이라 일시 실패 silent.
      const { data } = await axios.post(
        '/api/v2/prd-lint',
        { text },
        { _silent: true },
      )
      report.value = data
    } catch (e) {
      // 권한 등 silent fail — 배지 숨김.
      error.value = e?.response?.data?.detail || e.message || 'lint failed'
      report.value = null
    } finally {
      loading.value = false
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(runLint, DEBOUNCE_MS)
  }

  if (prdTextRef && typeof prdTextRef === 'object' && 'value' in prdTextRef) {
    watch(prdTextRef, schedule, { immediate: true })
  } else {
    schedule()
  }

  return { report, loading, error, runLint }
}
