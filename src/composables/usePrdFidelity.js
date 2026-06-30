/**
 * usePrdFidelity — 원본 회의록 ↔ 생성 PRD 정밀 대조(2단계 LLM) 검증.
 *
 * POST /api/v2/prd/fidelity — LLM 1회 호출(토큰 소비)이라 **온디맨드**(run())로만 부른다.
 * (1단계 토큰 비교 시절엔 자동 조회했지만, 이제 사용자가 '대조 검증' 누를 때만.)
 *
 * report: {
 *   available, coverage_pct, summary,
 *   missing: [{ point, evidence, section, severity }],
 *   hallucination: [{ point, severity }]
 * }
 */
import { ref, watch } from 'vue'
import axios from '@/utils/axios'
import { useHarnessStore } from '@/store/harness'

export function usePrdFidelity() {
  const store = useHarnessStore()
  const report = ref(null)
  const loading = ref(false)
  const error = ref(false)

  const run = async () => {
    const pn = store.projectName
    if (!pn || loading.value) return
    loading.value = true
    error.value = false
    try {
      // _silent: 실패해도 전역 토스트 억제(패널 내에서만 안내).
      const { data } = await axios.post(
        '/api/v2/prd/fidelity',
        { project_name: pn, team_id: store.activeTeamId || '' },
        { _silent: true },
      )
      report.value = data
    } catch {
      report.value = null
      error.value = true
    } finally {
      loading.value = false
    }
  }

  // 프로젝트가 바뀌면 이전 결과를 비운다 — 자동 재호출은 하지 않는다(LLM 토큰 절약).
  watch(() => store.projectName, () => { report.value = null; error.value = false })

  return { report, loading, error, run }
}
