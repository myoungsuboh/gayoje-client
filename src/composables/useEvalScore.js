/**
 * [Phase E — 2026-05-25] 프로젝트 명세 충실도 점수 fetch.
 *
 * BE 의 GET /api/v2/projects/{name}/eval-score 호출.
 * LLM 미사용 — 그래프 fetch + scorer 만. ~100ms 응답.
 *
 * 응답:
 *   {
 *     project_name, overall,
 *     tier1/2/3/4: { score, weight, sub_metrics, notes },
 *     summary
 *   }
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import axios from '@/utils/axios'

// [2026-05-25 즉시 수정 #4] 점수 갱신 이벤트 채널.
// 미팅로그 업로드 / PRD 변경 / design pipeline 실행 후 호출자가 emit 하면
// 모든 EvalScore 인스턴스가 자동 refetch.
const _refreshListeners = new Set()
export function notifyEvalScoreRefresh() {
  for (const fn of _refreshListeners) {
    try { fn() } catch { /* swallow */ }
  }
}

// [2026-05] 임의의 재조회 콜백을 refresh 버스에 등록. 백그라운드 잡(autofill 등)
// 완료 시 notifyEvalScoreRefresh() 한 번으로 점수뿐 아니라 SPACK 내용 같은 관련
// 데이터까지 함께 갱신하기 위함. 반환된 unsubscribe 를 onBeforeUnmount 에서 호출.
export function onEvalScoreRefresh(fn) {
  if (typeof fn !== 'function') return () => {}
  _refreshListeners.add(fn)
  return () => _refreshListeners.delete(fn)
}

export function useEvalScore(projectNameRef) {
  const score = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function fetchScore() {
    const isRef =
      projectNameRef &&
      typeof projectNameRef === 'object' &&
      'value' in projectNameRef
    const name = isRef ? projectNameRef.value : projectNameRef
    if (!name || typeof name !== 'string') {
      score.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      // _silent: true — 백그라운드 polling 이라 일시 실패 시 토스트 표시 안 함.
      const { data } = await axios.get(
        `/api/v2/projects/${encodeURIComponent(name)}/eval-score`,
        { _silent: true },
      )
      score.value = data
    } catch (e) {
      // 빈 그래프 또는 ownership 등 — 카드 숨기고 조용히 실패.
      error.value = e?.response?.data?.detail || e.message || 'fetch failed'
      score.value = null
    } finally {
      loading.value = false
    }
  }

  if (projectNameRef && typeof projectNameRef === 'object' && 'value' in projectNameRef) {
    watch(projectNameRef, fetchScore, { immediate: true })
  } else {
    fetchScore()
  }

  // [#4 — 2026-05-25] 외부 이벤트 (미팅로그 업로드 등) 시 refetch.
  // 호출자 lifecycle 안에서 등록/해제 — 메모리 leak 방지.
  if (typeof onMounted === 'function') {
    try {
      onMounted(() => _refreshListeners.add(fetchScore))
      onBeforeUnmount(() => _refreshListeners.delete(fetchScore))
    } catch {
      // 컴포넌트 lifecycle 외 호출 — silent.
    }
  }

  return { score, loading, error, fetchScore }
}
