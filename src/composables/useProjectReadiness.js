/**
 * 프로젝트의 다음 단계 진입 가능 여부 체크 — Design / Lint / Deliverables 가드.
 *
 * [배경 — 2026-05-18]
 * 신규 프로젝트 생성 직후 (또는 미팅 로그를 작성 안 한 상태) Design / Lint /
 * Deliverables 페이지에 진입 가능했고, 빈 화면 또는 "Request failed with status
 * code 403" 같은 raw 에러가 노출됐다. 사용자 피드백 — "미팅로그 입력 안 했거나
 * CPS, PRD 없으면 다른 기능들은 안 보여주는 게 맞다".
 *
 * [구현]
 * - 한 번에 3개 query API (getMeetingVersions / getCPS / getPRD) 병렬 호출.
 * - 결과를 module-scope reactive 에 캐싱 → 페이지 간 이동 시 중복 호출 절감.
 * - 같은 projectName 이면 force=false 호출 시 캐시 그대로 반환.
 * - 프로젝트 변경 / 강제 새로고침 시 force=true 로 재조회.
 *
 * [사용 패턴]
 * ```js
 * const readiness = useProjectReadiness()
 * onMounted(readiness.check)
 * watch(() => store.projectName, () => readiness.check(true))
 * ```
 * 템플릿에서:
 * ```vue
 * <ProjectNotReadyCard v-if="!readiness.isReady.value" :state="readiness.state" />
 * <div v-else>...정상 페이지...</div>
 * ```
 */
import { ref, computed } from 'vue'
import axios from '@/utils/axios'
import { useHarnessStore, API_BASE } from '@/store/harness'
import { T_DEFAULT_MS } from '@/utils/timeouts'

// Module-scope — 모든 사용처가 동일 reactive 공유. Pinia store 까지는 과한 규모라
// composable + module ref 패턴 채택.
const _state = ref({
  projectName: null,
  hasMeetingLogs: false,
  hasCps: false,
  hasPrd: false,
})
const _isChecking = ref(false)

// 동일 프로젝트에 대해 동시에 여러 페이지가 check() 호출하는 race 방지용.
let _inflightPromise = null
let _inflightPn = null

const _toBool = (settled) => {
  if (settled.status !== 'fulfilled') return false
  const result = settled.value?.data?.result
  return Array.isArray(result) && result.length > 0
}

export function useProjectReadiness() {
  const store = useHarnessStore()

  /**
   * 현재 projectName 기준으로 readiness 재조회.
   *
   * @param {boolean} force true 면 캐시 무시하고 항상 fetch.
   */
  const check = async (force = false) => {
    const pn = store.projectName
    if (!pn) {
      _state.value = {
        projectName: null,
        hasMeetingLogs: false,
        hasCps: false,
        hasPrd: false,
      }
      return
    }
    // 캐시 hit — 같은 프로젝트면 재호출 안 함.
    if (!force && _state.value.projectName === pn) return
    // 동시 호출 dedupe — 같은 프로젝트의 in-flight 만. 다른 프로젝트/force 는 새로 요청.
    if (_inflightPromise && _inflightPn === pn) return _inflightPromise

    _isChecking.value = true
    _inflightPn = pn
    const params = { projectName: pn }
    const requests = Promise.allSettled([
      axios.get(`${API_BASE}/getMeetingVersions`, { params, timeout: T_DEFAULT_MS }),
      axios.get(`${API_BASE}/getCPS`, { params, timeout: T_DEFAULT_MS }),
      axios.get(`${API_BASE}/getPRD`, { params, timeout: T_DEFAULT_MS }),
    ])
    const p = requests.then((results) => {
      if (store.projectName !== pn) return  // 그 사이 프로젝트 전환됐으면 적용 안 함
      const [logs, cps, prd] = results
      _state.value = {
        projectName: pn,
        hasMeetingLogs: _toBool(logs),
        hasCps: _toBool(cps),
        hasPrd: _toBool(prd),
      }
    }).finally(() => {
      if (_inflightPromise === p) { _inflightPromise = null; _inflightPn = null; _isChecking.value = false }
    })
    _inflightPromise = p
    return _inflightPromise
  }

  const hasMeetingLogs = computed(() => _state.value.hasMeetingLogs)
  const hasCps = computed(() => _state.value.hasCps)
  const hasPrd = computed(() => _state.value.hasPrd)
  // 모든 단계 산출물이 있어야 다음 페이지(Design / Lint / Deliverables) 사용 가능.
  const isReady = computed(
    () => _state.value.hasMeetingLogs && _state.value.hasCps && _state.value.hasPrd,
  )

  /**
   * 캐시 무효화 — 미팅 로그 저장 / CPS·PRD 생성 완료 같은 이벤트 직후 호출.
   * 다음 페이지 진입 시 check() 가 강제 재조회하도록 cached projectName 만 비움.
   */
  const invalidate = () => {
    _state.value = { ..._state.value, projectName: null }
  }

  return {
    isChecking: _isChecking,
    state: _state,
    hasMeetingLogs,
    hasCps,
    hasPrd,
    isReady,
    check,
    invalidate,
  }
}
