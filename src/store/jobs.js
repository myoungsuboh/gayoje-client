/**
 * 비동기 작업 추적 store — B (백그라운드 폴링 + 완료 알림) + 영속화.
 *
 * [배경 — 2026-05]
 * postMeeting 같은 LLM 호출은 worker 에서 ~2분 걸림. 사용자가 그 동안 페이지에서
 * 묶이지 않도록 store 가 백그라운드에서 폴링하고 완료 시 토스트 + 데이터 갱신.
 *
 * [영속화 — 2026-05-17]
 * Vercel 새 배포로 인한 chunk hash 변경 → router.onError 의 hard reload 시점에
 * SPA 메모리 전체가 reset → 진행 중이던 polling promise + batch chain 사라짐.
 * 사용자가 "배치가 갑자기 멈췄다" 호소.
 *
 * 대응:
 *   1) _jobs, batchState 를 localStorage 에 persist
 *   2) store 부팅 시 _jobs 안의 in-progress task 는 자동으로 polling 재개
 *      (콜백 closure 는 잃었지만 BE 결과 fetch + UI 카운트 cleanup 까지는 가능)
 *   3) plan.vue 가 mount 시 `attachBatchHandlers(...)` 로 onAllComplete/onError/
 *      enqueueOne 콜백을 다시 wire — 그러면 batch chain 재개됨.
 *
 * [정책]
 * - 같은 taskId 중복 startJob 은 dedupe.
 * - 완료/실패 시 onComplete/onError 콜백 + 자동으로 store 에서 제거.
 *
 * [batch chain — B4]
 * 배치 모드 (V1 → V2 → V3 sequential 누적) 도 store 안에서 chain 으로 동작 →
 * 사용자가 페이지 떠나도 chain 이 계속 enqueue → 완료 시 토스트. batchState 도
 * store 안에 두어 페이지 재진입 시 진행 상황 그대로 노출.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { pollJobUntilDone, isPrdError } from '@/utils/asyncJob'
import { useSnackbar } from '@/composables/useSnackbar'

const _initBatchState = () => ({
  running: false,
  total: 0,
  current: 0,
  logs: [],
  error: null,
  errorIndex: null,
  entries: [],
  baseVersion: null,
  projectName: null,
  // [중지 기능 — 2026-05-18]
  // cancelRequested: 사용자가 중지 요청. 현재 처리 중인 작업은 BE 에서 계속 진행되지만
  //                  완료 후 다음 entry 로 진행하지 않고 chain 종료.
  // cancelled: 중지 요청이 실제로 반영되어 chain 이 종료된 상태 — UI 가 "중지됨" 으로 표시.
  cancelRequested: false,
  cancelled: false,
})

export const useJobsStore = defineStore('jobs', () => {
  // taskId → reactive 정보 — 헤더 chip 등 single-job UI 용.
  const _jobs = ref({})
  // 배치 진행 상태 — MeetingLogTab batch UI 가 직접 본다.
  const batchState = ref(_initBatchState())
  // [2026-05-18 보안] 영속화된 state 의 소유자 email — 사용자 전환 시 격리.
  // logout 안 거치고 다른 사용자가 같은 브라우저로 로그인하는 케이스에서 이전 사용자
  // 의 batchState/_jobs 가 새 사용자 화면에 노출되던 사고 대응.
  const ownerEmail = ref('')

  // 영속화에서 제외되는 in-memory 핸들러. plan.vue 가 mount 시 다시 wire.
  // 주의: ref 가 아닌 일반 변수 — reactive 일 필요 없음, persist 대상 아님.
  let _batchHandlers = null  // { enqueueOne, onAllComplete, onError, projectName }
  let _resumed = false       // store 부팅 시 1회만 자동 resume 시도
  let _stepLoopRunning = false  // step loop 중복 실행 방지 (page reload 후 false 로 시작)
  // [중지 — 2026-06-01] 단일 잡 polling 의 AbortController 보관소 (taskId → controller).
  // 영속화 제외(in-memory) — page reload 후엔 resumeOrphanJobs 가 새로 만든다.
  let _controllers = {}

  /**
   * 사용자 전환 감지 — plan.vue / App.vue 가 attachBatchHandlers 또는 mount 시 호출.
   * 영속화된 ownerEmail 이 현재 user.email 과 다르면 store 전체 reset.
   *
   * @param {string} currentEmail 현재 로그인된 사용자 이메일
   */
  const assertOwner = (currentEmail) => {
    const cur = (currentEmail || '').toLowerCase().trim()
    const stored = (ownerEmail.value || '').toLowerCase().trim()
    if (!cur) return  // 사용자 정보 없음 — skip (호출자가 보장해야 함)
    if (!stored) {
      // 첫 로그인 — ownership claim
      ownerEmail.value = cur
      return
    }
    if (stored !== cur) {
      // 다른 사용자의 영속화 state — 즉시 reset
      _jobs.value = {}
      batchState.value = _initBatchState()
      _batchHandlers = null
      _stepLoopRunning = false
      Object.values(_controllers).forEach((c) => c?.abort())
      _controllers = {}
      ownerEmail.value = cur
    }
  }

  // ─── Single-job API ────────────────────────────────────────

  /**
   * 백그라운드 작업 등록 + 폴링 시작.
   */
  const startJob = (opts) => {
    if (!opts?.taskId) return
    if (_jobs.value[opts.taskId]) return
    _jobs.value = {
      ...(_jobs.value),
      [opts.taskId]: {
        taskId: opts.taskId,
        label: opts.label || '작업 진행 중',
        projectName: opts.projectName || null,
        kind: opts.kind || 'unknown',
        stage: 'queued',
        startedAt: Date.now(),
      },
    }

    _pollAndCleanup(opts.taskId, opts.onComplete, opts.onError)
  }

  // 폴링 + cleanup — 단일 모드 + 부팅 시 자동 resume 양쪽에서 재사용.
  const _pollAndCleanup = (taskId, onComplete, onError) => {
    // [중지] poll 에 AbortSignal 전달 — stopJob(taskId) 가 abort 하면 poll 이
    // CanceledError 로 즉시 빠져나온다. resume 경로도 이 함수를 거치므로 reload 후에도
    // 동일하게 중지 가능.
    const controller = new AbortController()
    _controllers[taskId] = controller
    pollJobUntilDone(taskId, {
      signal: controller.signal,
      onProgress: (info) => {
        const current = _jobs.value[taskId]
        if (!current) return
        _jobs.value = {
          ...(_jobs.value),
          [taskId]: {
            ...current,
            stage: info?.stage || info?.status || current.stage,
          },
        }
      },
    })
      .then((finalInfo) => {
        delete _controllers[taskId]
        _removeJob(taskId)
        try { onComplete?.(finalInfo) } catch (e) { console.error('onComplete error:', e) }
      })
      .catch((err) => {
        delete _controllers[taskId]
        _removeJob(taskId)
        // 사용자 중지(abort)는 실패가 아님 — onError/토스트 생략.
        if (err?.name === 'CanceledError') return
        try { onError?.(err) } catch (e) { console.error('onError error:', e) }
      })
  }

  const _removeJob = (taskId) => {
    if (!_jobs.value[taskId]) return
    const next = { ...(_jobs.value) }
    delete next[taskId]
    _jobs.value = next
  }

  /**
   * 단일 백그라운드 잡 중지 — 헤더 칩/진행 알림의 "중지" 클릭에서 호출.
   *
   * poll 의 AbortSignal 을 끊어 즉시 빠져나오게 하고 UI 에서 제거한다. 이미 BE worker
   * 에서 도는 작업 자체는 계속 진행될 수 있으나(arq 즉시 kill 불가) FE 는 더 추적/표시하지
   * 않는다 — stopBatch 의 "UI 즉시 중지 / 결과는 나중에 자동 합류" 철학과 동일.
   */
  const stopJob = (taskId) => {
    if (!taskId) return
    _controllers[taskId]?.abort()
    delete _controllers[taskId]
    _removeJob(taskId)  // 폴링 catch 를 기다리지 않고 UI 즉시 idle 처리
  }

  /** 활성 단일 잡 전부 중지 — 헤더의 전역 "중지" 컨트롤용. */
  const stopAllActiveJobs = () => {
    Object.keys(_jobs.value || {}).forEach((taskId) => {
      _controllers[taskId]?.abort()
      delete _controllers[taskId]
    })
    _jobs.value = {}
  }

  // ─── Batch chain API (B4) ──────────────────────────────────

  const resetBatch = () => {
    batchState.value = _initBatchState()
    _batchHandlers = null
  }

  /**
   * 배치 chain 중지 요청.
   *
   * [2026-05-18 즉시 중지]
   * 이전엔 "현재 entry 가 BE 에서 끝날 때까지 (2~5분) 대기 후 chain 종료" 의
   * graceful stop 이었음 — 사용자가 "중지" 클릭하고도 한참 "중지 중..." 표시되어
   * UX 답답함 호소. 이제 step loop 가 즉시 빠져나오도록 cancel signal 발사.
   *
   * 현재 진행 중인 BE 작업(V12 등) 자체는 worker 에서 계속 진행되며 완료 시
   * onComplete 콜백이 logs[i].status='done' 으로 갱신해 History 에도 자동 반영.
   * 즉, "UI 는 즉시 중지 / V12 결과는 잠시 후 자동 합류" 의 백그라운드 마무리.
   */
  const stopBatch = () => {
    if (!batchState.value.running) return
    batchState.value.cancelRequested = true
    // 진행 중인 step 의 await Promise.race 를 즉시 풀어 step 함수가 끝나도록.
    if (_currentStepCanceller) {
      try { _currentStepCanceller() } catch {}
      _currentStepCanceller = null
    }
  }

  // 진행 중인 step 이 BE 작업을 기다리는 동안 사용자가 stopBatch 를 호출하면
  // 이 canceller 를 trigger 해서 await 를 즉시 풀어줌. step 안에서만 set/clear.
  let _currentStepCanceller = null

  /**
   * 전체 reset — logout 시 호출 (clearSession 의 localStorage 정리와 별개로
   * 메모리 상의 reactive state 도 함께 비움). 라우터 가드/auth.js 의 logout 흐름이 호출.
   */
  const resetAll = () => {
    _jobs.value = {}
    batchState.value = _initBatchState()
    ownerEmail.value = ''
    _batchHandlers = null
    _stepLoopRunning = false
    Object.values(_controllers).forEach((c) => c?.abort())
    _controllers = {}
  }

  /**
   * 배치 chain — V1 → V2 → V3 sequential. 각 V 는 startJob 으로 백그라운드 폴링.
   * 페이지 떠나도 store 가 살아있어 chain 계속 진행.
   *
   * @param {Object} opts
   * @param {Array}    opts.entries       [{ version, title, content }] — 처리 순서
   * @param {number}   [opts.startIndex=0] 재시도 시 시작 인덱스 (이전 logs 보존)
   * @param {string}   [opts.baseVersion]  재시도 cleanup 시 사용
   * @param {string}   opts.projectName    멀티프로젝트 분리용
   * @param {Function} opts.enqueueOne     (entry) => Promise<string|null> — task_id 반환.
   * @param {Function} [opts.onAllComplete] 모든 V 끝났을 때 호출
   * @param {Function} [opts.onError]       errorIndex 처리 후 외부 통지용
   */
  const runBatchChain = (opts) => {
    const entries = (opts.entries || []).map((e, i) =>
      typeof e === 'string'
        ? { version: `V${i + 1}`, title: '', content: e }
        : { version: e.version ?? `V${i + 1}`, title: e.title ?? '', content: e.content },
    )
    const startIndex = opts.startIndex ?? 0

    if (startIndex === 0) {
      batchState.value = {
        running: true,
        total: entries.length,
        current: 0,
        logs: entries.map((e, i) => ({
          index: i,
          status: 'pending',
          sourceVersion: e.version,
          title: e.title,
          taskId: null,         // [persist] 재개 시 polling 재시작용
        })),
        error: null,
        errorIndex: null,
        entries,
        baseVersion: opts.baseVersion ?? null,
        projectName: opts.projectName ?? null,
        cancelRequested: false,
        cancelled: false,
      }
    } else {
      // 재시도 — 기존 logs 유지하고 해당 인덱스부터 다시
      const prev = batchState.value
      prev.running = true
      prev.error = null
      prev.errorIndex = null
      prev.cancelRequested = false
      prev.cancelled = false
      for (let i = startIndex; i < prev.logs.length; i++) {
        prev.logs[i].status = 'pending'
        prev.logs[i].taskId = null
      }
    }

    // 핸들러 보관 — page reload 후 plan.vue 가 attachBatchHandlers 로 다시 set
    _batchHandlers = {
      enqueueOne: opts.enqueueOne,
      onAllComplete: opts.onAllComplete,
      onError: opts.onError,
      projectName: opts.projectName ?? null,
    }

    _runStepLoop(startIndex)
  }

  // 중지 요청이 있을 때 chain 을 정리하는 helper.
  // i: 다음에 처리하려던 인덱스. i 이후의 pending logs 는 cancelled 로 마킹.
  const _finalizeCancel = (i) => {
    const logs = batchState.value.logs || []
    for (let j = i; j < logs.length; j++) {
      if (logs[j].status === 'pending') logs[j].status = 'cancelled'
    }
    batchState.value.running = false
    batchState.value.cancelled = true
    batchState.value.cancelRequested = false
    _stepLoopRunning = false
  }

  // 실제 chain step loop — runBatchChain 또는 resume 양쪽에서 호출.
  // 중복 실행 가드는 _stepLoopRunning flag 로 처리.
  const _runStepLoop = (startIndex) => {
    if (_stepLoopRunning) return
    _stepLoopRunning = true

    const step = async (i) => {
      const entries = batchState.value.entries || []

      // 중지 요청 체크 — 다음 entry 로 진행하기 전에 빠져나감.
      // (현재 진행 중인 BE 작업은 못 막지만, 다음 entry enqueue 는 막을 수 있다)
      if (batchState.value.cancelRequested) {
        _finalizeCancel(i)
        return
      }

      if (i >= entries.length) {
        batchState.value.running = false
        _stepLoopRunning = false
        try { _batchHandlers?.onAllComplete?.() } catch (e) { console.error('onAllComplete error:', e) }
        return
      }
      batchState.value.current = i + 1
      batchState.value.logs[i].status = 'running'

      try {
        let taskId = batchState.value.logs[i].taskId || null

        // resume 케이스 — 이미 enqueue 된 task 가 있으면 enqueue 재시도하지 말고 폴링만.
        if (!taskId) {
          if (!_batchHandlers?.enqueueOne) {
            // 핸들러 미부착 상태 — plan.vue mount 대기. step 종료, batchState.running=true 유지.
            batchState.value.logs[i].status = 'pending'
            _stepLoopRunning = false
            return
          }
          // [batch 파이프라이닝] 다음 entry 를 함께 전달 — BE 가 이번 버전 merge 도는
          // 동안 다음 버전 extract 를 선반입(prefetch)해 처리 시간 단축. 마지막은 null.
          const nextEntry = entries[i + 1] || null
          taskId = await _batchHandlers.enqueueOne(entries[i], nextEntry)
          if (taskId) {
            batchState.value.logs[i].taskId = taskId
          }
        }

        if (taskId) {
          // job 완료/실패 시 logs[i].status 를 직접 갱신하도록 콜백에 책임 위임.
          // step 함수가 cancel 로 일찍 빠져나가도 background 의 startJob 폴링이
          // 계속 살아있다 완료 시점에 콜백 fire → 'done' 으로 자동 합류.
          const jobPromise = new Promise((resolve, reject) => {
            startJob({
              taskId,
              label: `${entries[i].version} 미팅 처리`,
              projectName: _batchHandlers?.projectName || batchState.value.projectName,
              kind: 'postMeeting',
              onComplete: (finalInfo) => {
                const log = batchState.value.logs?.[i]
                if (log) {
                  log.status = 'done'
                  log.taskId = null
                  // [2026-05-26] BE 가 PRD mode='no_changes' 반환 시 사용자에게
                  // "왜 이 회의는 변경 없나" 안내. (보강·결정 회의록 false positive 회피)
                  const prdMode = finalInfo?.prd?.mode
                  if (isPrdError(finalInfo)) {
                    // [2026-06] BE 가 PRD 를 error 로 강등(CPS 는 저장)한 경우 — 놓치면
                    // '완료 + 빈/낡은 PRD' 무음 누락. 사용자에게 재생성 필요를 경고로 표면화.
                    log.prdMode = 'error'
                    try {
                      const { showWarning } = useSnackbar()
                      const srcVer = log.sourceVersion || `${i + 1}번째`
                      showWarning(
                        `${srcVer} ⚠️ CPS는 저장됐지만 PRD 생성에 실패했습니다 — 회의록 재처리 또는 PRD 재생성이 필요합니다.`,
                        { timeout: 10000 },
                      )
                    } catch (e) { /* snackbar 미준비 시 silent */ }
                  } else if (prdMode === 'no_changes') {
                    log.prdMode = 'no_changes'
                    try {
                      const { showSuccess } = useSnackbar()
                      const srcVer = log.sourceVersion || `${i + 1}번째`
                      showSuccess(
                        `${srcVer} ℹ️ 새 Epic/Story 없음 — 기존 기획서(PRD) 보강·결정만 있어 PRD 변동 없음. 다음 회의로 진행합니다.`,
                        { timeout: 7000 },
                      )
                    } catch (e) { /* snackbar 미준비 시 silent */ }
                  }
                }
                resolve('done')
              },
              onError: (err) => {
                const log = batchState.value.logs?.[i]
                if (log) log.status = 'error'
                reject(err)
              },
            })
          })

          // 즉시 중지 신호 — stopBatch 가 호출되면 이 canceller 가 'cancelled' 로 resolve.
          const cancelPromise = new Promise((resolve) => {
            _currentStepCanceller = () => resolve('cancelled')
          })

          const winner = await Promise.race([jobPromise, cancelPromise])
          _currentStepCanceller = null

          if (winner === 'cancelled') {
            // BE 작업은 background 에서 계속 진행 — 미래의 reject 가 unhandled
            // promise rejection 되지 않도록 swallow.
            jobPromise.catch(() => {})
            // logs[i].status 는 'running' 상태 유지 — background 완료 시 'done' 으로 전환.
            // 사용자에게는 UI 헤더가 "중지됨" + 이 항목만 finishing 표시.
            _finalizeCancel(i + 1)
            return
          }
          // 정상 완료 path — status='done' 은 onComplete 콜백에서 이미 set 됨.
        } else {
          // taskId 없는 동기 완료 path — 직접 done 마킹.
          batchState.value.logs[i].status = 'done'
          batchState.value.logs[i].taskId = null
        }

        // 현재 entry 완료 후 다시 중지 요청 확인 (race 중 stopBatch 호출이 살짝 늦은 경우).
        if (batchState.value.cancelRequested) {
          _finalizeCancel(i + 1)
          return
        }
        step(i + 1)
      } catch (err) {
        batchState.value.logs[i].status = 'error'
        batchState.value.errorIndex = i
        const srcVer = batchState.value.logs[i].sourceVersion
        batchState.value.error =
          `${srcVer ? `${srcVer} (${i + 1}번째)` : `${i + 1}번째`} 로그 처리 중 오류: ${err?.message || err}`
        batchState.value.running = false
        _stepLoopRunning = false
        try { _batchHandlers?.onError?.(err) } catch (e) { console.error('onError error:', e) }
      }
    }
    step(startIndex)
  }

  /**
   * Page reload 후 plan.vue 가 mount 시 호출.
   * 활성 batch 가 있으면 enqueueOne / onAllComplete / onError 콜백을 다시 wire 하고
   * 진행 중이던 곳부터 chain 재개.
   *
   * @returns {boolean} 재개된 batch 가 있으면 true
   */
  const attachBatchHandlers = (handlers) => {
    // [보안] owner 검증 — 다른 사용자의 영속화 state 가 있으면 즉시 reset 후 진행.
    if (handlers.userEmail) {
      assertOwner(handlers.userEmail)
    }
    _batchHandlers = {
      enqueueOne: handlers.enqueueOne,
      onAllComplete: handlers.onAllComplete,
      onError: handlers.onError,
      projectName: handlers.projectName ?? batchState.value.projectName,
    }
    // 현재 in-progress batch 가 있으면 resume
    if (batchState.value.running) {
      const resumeIdx = _findResumeIndex()
      if (resumeIdx >= 0) {
        _runStepLoop(resumeIdx)
        return true
      }
    }
    return false
  }

  // 부팅 후 처음 attach 시점에 사용 — running / pending 인 첫 인덱스 찾기.
  const _findResumeIndex = () => {
    const logs = batchState.value.logs || []
    for (let i = 0; i < logs.length; i++) {
      const s = logs[i].status
      if (s === 'running' || s === 'pending') return i
    }
    return -1
  }

  /**
   * Store 부팅 시 자동 호출 — _jobs 안의 task 들 polling 재개 (콜백 없이).
   * 부팅 후 1회만 동작.
   */
  const resumeOrphanJobs = () => {
    if (_resumed) return
    _resumed = true
    const ids = Object.keys(_jobs.value || {})
    for (const taskId of ids) {
      // 콜백 closure 는 잃었음 — 결과만 fetch 해서 store 에서 제거.
      // batch chain 재개는 attachBatchHandlers 가 별도로 처리하므로 single-mode
      // 잔재만 정리 (있다면).
      _pollAndCleanup(taskId, null, null)
    }
  }

  // 모듈 로드 시점에 즉시 호출 — Pinia hydration 이 setup 호출 후에 일어나므로
  // 실제 resume 은 setTimeout 으로 한 turn 뒤로 보냄.
  setTimeout(() => resumeOrphanJobs(), 0)

  // ─── Selectors ─────────────────────────────────────────────
  const activeJobs = computed(() => Object.values(_jobs.value))
  const activeCount = computed(() => activeJobs.value.length)
  const hasActive = computed(() => activeCount.value > 0 || batchState.value.running)

  return {
    // single-job
    activeJobs, activeCount, hasActive,
    startJob,
    stopJob,
    stopAllActiveJobs,
    // batch chain
    batchState,
    resetBatch,
    stopBatch,
    resetAll,
    runBatchChain,
    attachBatchHandlers,
    assertOwner,
    ownerEmail,
    // resume (테스트 / 디버깅용 노출)
    resumeOrphanJobs,
  }
}, {
  // [2026-05-17 영속화] hard reload 시점에 잃어버리던 background work 보존.
  // 콜백 closure 는 persist 불가 — plan.vue 가 mount 시 attachBatchHandlers 로 재wire.
  // [2026-05-18 보안] ownerEmail 도 함께 persist — 사용자 전환 시 격리.
  persist: {
    key: 'gayoje_jobs_state_v1',
    pick: ['_jobs', 'batchState', 'ownerEmail'],
  },
})
