/**
 * 비동기 큐 작업 폴링 헬퍼.
 *
 * [배경 — 2026-05]
 * 이전엔 /api/gateway/postMeeting 가 동기 실행으로 1~4분 응답 → Cloudflare
 * ~100s 한계로 배치(V2/V3) 빈번 실패. BE 가 arq 큐로 enqueue + 즉시 task_id 반환
 * 으로 바뀌면서 FE 가 폴링해서 결과를 가져온다.
 *
 * [사용법]
 *   const res = await axios.post('/api/gateway/postMeeting', payload)
 *   const taskId = extractTaskId(res.data)
 *   if (taskId) await pollJobUntilDone(taskId)
 *
 * [확장성]
 * deleteMeeting / createDesign 등 다른 LLM 핸들러가 비동기 전환될 때 같은 헬퍼
 * 재사용 가능 — 응답 shape 가 { result: { task_id, status } } 면 그대로 동작.
 */
import axios from '@/utils/axios'
import { API_BASE } from '@/store/harness'
import i18n from '@/plugins/i18n'
// 비컴포넌트(util)에서 번역 — axios.js · github.js 와 동일 패턴.
const t = (key, params) => i18n.global.t(key, params)

/**
 * postMeeting 결과의 PRD 단계가 'error' 로 강등됐는지 판정.
 *
 * BE(post_meeting_pipeline_job)는 PRD 의 **결정적** 실패(orphan / 빈-merge ValueError 등)를
 * job 실패(=arq 재시도 폭주)로 두지 않고 prd.mode='error' 로 강등해 CPS 는 커밋·보존하고 job 은
 * 성공으로 반환한다. 따라서 FE 는 이 플래그를 **명시적으로 표면화**해야 한다 — 안 그러면 사용자에겐
 * '녹색 완료 토스트 + 빈/낡은 PRD' 로 보여 'CPS 가득 / PRD 빈' 무음 누락이 재생산된다.
 *
 * @param {any} jobResult get_job_status 의 result dict (= onComplete 의 finalInfo)
 * @returns {boolean}
 */
export function isPrdError(jobResult) {
  return jobResult?.prd?.mode === 'error'
}

const DEFAULT_INTERVAL_MS = 3000        // 폴링 주기
// [체감 개선] 작업 직후 초기 구간은 더 자주 폴링 — "방금 누른 게 먹혔나" 불안 제거.
// 첫 stage 변화(queued → cps_running 등)를 빨리 잡아 진행률이 즉시 움직이게 한다.
const WARMUP_MS = 6000                  // 처음 6초 동안
const WARMUP_INTERVAL_MS = 1000         // 1초 간격으로
const DEFAULT_MAX_WAIT_MS = 30 * 60 * 1000   // 30분 한계 (postMeeting 은 보통 1~4분)
const STATUS_REQUEST_TIMEOUT_MS = 15_000

/**
 * 응답 데이터에서 task_id 추출 — gateway 의 result wrapper / 배열 wrapper 모두 흡수.
 *
 *   { result: { task_id: 'x' } }
 *   { result: [{ task_id: 'x' }] }
 *   { task_id: 'x' }                  (raw)
 *
 * @param {any} data axios response.data
 * @returns {string|null}
 */
export const extractTaskId = (data) => {
  if (!data) return null
  const inner = data.result ?? data
  const obj = Array.isArray(inner) ? inner[0] : inner
  if (!obj || typeof obj !== 'object') return null
  return obj.task_id || obj.taskId || null
}

/**
 * arq job status — gateway 응답에서 정규화된 info 객체 추출.
 */
const _readStatusInfo = (data) => {
  if (!data) return null
  const inner = data.result ?? data
  return Array.isArray(inner) ? inner[0] : inner
}

/**
 * 작업이 완료될 때까지 폴링. 기본 3초 간격, 30분 한계.
 *
 * @param {string} taskId
 * @param {Object} opts
 * @param {number} [opts.intervalMs] 폴링 간격 (기본 3000ms)
 * @param {number} [opts.maxWaitMs]  최대 대기 (기본 30분)
 * @param {(info:Object) => void} [opts.onProgress] 매 폴링마다 호출 (UI 갱신용)
 * @param {AbortSignal} [opts.signal] 사용자 취소용 — aborted 면 CanceledError throw.
 *
 * @returns {Promise<Object>} 'complete' 시점의 info ({ task_id, project_name, status, result, ... })
 * @throws {Error} 실패 / 타임아웃 / 네트워크 오류 / 취소(CanceledError)
 */
export const pollJobUntilDone = async (taskId, opts = {}) => {
  if (!taskId) throw new Error(t('errors.job.no_task_id'))
  const stepMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  const deadlineMs = Date.now() + (opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS)
  const signal = opts.signal

  // 시작 직후 WARMUP_MS 동안은 짧은 간격으로 폴링(첫 피드백 가속), 이후 기본 간격으로.
  // 호출자가 더 짧은 intervalMs 를 줬다면 그대로 존중(min).
  const startMs = Date.now()
  const nextDelayMs = () =>
    (Date.now() - startMs < WARMUP_MS ? Math.min(WARMUP_INTERVAL_MS, stepMs) : stepMs)

  // [2026-06-10] 연속 401 카운터 — 인터셉터가 refresh+재시도까지 끝낸 뒤에도 401 이면
  // 세션 회복 불가(예: 다중 탭 refresh 회전 충돌)다. 이전엔 401 이 "그 외" 분기로
  // 무한 재시도돼 30분 한계까지 3초마다 헛폴링(실사고: 682회)했다.
  let auth401Streak = 0

  while (Date.now() < deadlineMs) {
    // 사용자 취소 — 폴링 루프 중단. axios CanceledError 와 동일 name 으로 통일해
    // 호출자의 기존 abort 분기 (name === 'CanceledError') 재사용.
    if (signal?.aborted) {
      const err = new Error('cancelled by user')
      err.name = 'CanceledError'
      throw err
    }
    let info
    try {
      const { data } = await axios.get(`${API_BASE}/getJobStatus`, {
        params: { task_id: taskId },
        timeout: STATUS_REQUEST_TIMEOUT_MS,
        signal,
      })
      info = _readStatusInfo(data)
    } catch (err) {
      // 사용자 취소는 즉시 전파 (재시도 안 함).
      if (axios.isCancel?.(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
        throw err
      }
      // 일시 네트워크 장애는 재시도. axios interceptor 가 401 자동 refresh.
      // 404 는 task 진짜 없음 — 즉시 실패.
      const status = err?.response?.status
      if (status === 404) {
        throw new Error(t('errors.job.not_found'))
      }
      if (status === 403) {
        throw new Error(t('errors.job.forbidden'))
      }
      if (status === 401) {
        // 인터셉터의 refresh 후 재시도까지 실패한 401 — 3연속이면 세션 만료로 중단.
        auth401Streak += 1
        if (auth401Streak >= 3) {
          throw new Error(t('errors.session_expired'))
        }
      } else {
        auth401Streak = 0
      }
      // 그 외 (5xx / 네트워크) — 다음 폴링까지 대기 후 재시도
      await new Promise(r => setTimeout(r, stepMs))
      continue
    }
    auth401Streak = 0

    if (!info) {
      await new Promise(r => setTimeout(r, nextDelayMs()))
      continue
    }

    opts.onProgress?.(info)

    if (info.status === 'complete') {
      // arq 의 'complete' 는 성공/실패 무관 "job 종료" 신호. error 가 있거나 result 가
      // 빈 경우 (worker 즉시 실패 등) 명시적으로 throw 해서 호출자가 fetch 안 일어나게 함.
      if (info.error) throw new Error(info.error)
      const result = info.result
      if (result && typeof result === 'object' && result.error) {
        throw new Error(String(result.error))
      }
      return info
    }
    if (info.status === 'not_found') {
      throw new Error(t('errors.job.not_found'))
    }
    if (info.error) {
      throw new Error(info.error)
    }
    // 'queued' | 'in_progress' | 'deferred' — 계속 폴링
    await new Promise(r => setTimeout(r, nextDelayMs()))
  }
  throw new Error(t('errors.job.timeout'))
}
