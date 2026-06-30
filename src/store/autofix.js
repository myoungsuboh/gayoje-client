/**
 * PRD "AI로 보완하기"(autofix) 진행/결과 상태 store — 2026-06-01.
 *
 * [배경]
 * 기존엔 PrdTab 안의 로컬 ref(isAutofixing + diff refs)로 autofix 를 돌려서, 사용자가
 * 탭(회의록/CPS/PRD/코딩규칙) 또는 페이지(01~05)를 전환하면 PrdTab 이 unmount 되며
 * 진행 상태와 결과(diff)가 통째로 사라졌다("갔다 오면 초기화").
 *
 * [해결 — 옵션 A]
 * autofix 의 진행/결과(diff)/needs_input 을 컴포넌트가 아니라 이 store(앱 싱글톤)가
 * 소유한다. 요청도 store 가 들고 있으므로 PrdTab 이 unmount 돼도 결과가 store 에 안착하고,
 * 다시 mount 되면 PrdTab 이 store 를 읽어 diff 를 재노출한다. 앱 내 탭/페이지 전환 모두 생존.
 * (in-memory — 브라우저 새로고침 시엔 진행 중 요청을 이어갈 수 없어 초기화. 그건 옵션 B 영역.)
 *
 * [중복 방지]
 * 같은 프로젝트에 보완이 이미 도는 중이면 재실행을 거부({duplicate:true}) — Gemini quota
 * 낭비 + diff 중복 노출 방지.
 *
 * [UI-agnostic]
 * 토스트/모달은 호출부(PrdTab)가 결과를 받아 처리. store 는 상태 + 요청만 담당해
 * 단위 테스트가 쉽고 화면 의존이 없다.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import axios from '@/utils/axios'
import { T_PIPELINE_MS } from '@/utils/timeouts'

export const useAutofixStore = defineStore('autofix', () => {
  // projectName -> { running: bool, oldMd: string, newMd: string, needsInput: Array }
  const _byProject = ref({})

  const _entry = (p) => (p ? _byProject.value[p] : null)

  /** 해당 프로젝트의 autofix 요청이 진행 중인지. */
  const isAutofixing = (p) => !!_entry(p)?.running
  /** 승인 대기 중인 diff 결과 ({oldMd,newMd,baseUpdatedAt}) 또는 null. */
  const pendingDiff = (p) => {
    const e = _entry(p)
    return e && e.newMd
      ? { oldMd: e.oldMd || '', newMd: e.newMd, baseUpdatedAt: e.baseUpdatedAt ?? null }
      : null
  }
  /** AI 가 자동으로 못 채워 인터뷰가 필요한 항목들. */
  const needsInput = (p) => _entry(p)?.needsInput || []

  const _patch = (p, patch) => {
    _byProject.value = {
      ...(_byProject.value),
      [p]: { ...(_byProject.value[p] || {}), ...patch },
    }
  }

  /**
   * 보완 실행 — 요청 + 결과를 store 에 안착시키고, 토스트용 요약을 반환.
   *
   * @returns {Promise<{duplicate?:boolean, changed?:boolean, needsInput?:Array, error?:any}>}
   *   - duplicate: 이미 진행 중이라 무시됨 (재실행 차단)
   *   - changed: diff(pendingDiff) 생성됨 — 호출부는 모달만 띄우면 됨
   *   - needsInput: 인터뷰 필요한 항목
   *   - error: 요청 실패 (호출부가 상태코드로 토스트 결정)
   */
  const runAutofix = async (projectName, text, opts = {}) => {
    if (!projectName) return { error: new Error('project_name 누락') }
    if (isAutofixing(projectName)) return { duplicate: true }

    const base = opts.base ?? (import.meta.env.VITE_API_BASE_URL ?? '')
    // [2026-06-10 lost-update 가드] 보완 시작 시점의 PRD last_updated 스냅샷.
    // diff 승인(PATCH) 시 client_updated_at 으로 보내 — 보완 도중 미팅 처리 등으로
    // PRD 가 바뀌었으면 BE optimistic lock 이 409 로 거부 (덮어쓰기 유실 차단).
    // 새 진단 시작 — 이전 dismiss 는 더 이상 유효하지 않음 (새 결과는 다시 보여야).
    _patch(projectName, {
      running: true, oldMd: '', newMd: '', needsInput: [],
      baseUpdatedAt: opts.baseUpdatedAt ?? null,
      needsDismissed: false,
    })
    try {
      const { data } = await axios.post(
        `${base}/api/v2/prd/autofix`,
        { project_name: projectName, text },
        // [2026-06-10] 90s → T_PIPELINE_MS(5분): BE autofix 파이프라인은 LLM 포함
        // 실측 72~88s — 90s 는 네트워크 지연만 더해져도 초과(실제 타임아웃 발생).
        { timeout: T_PIPELINE_MS },
      )
      const ni = Array.isArray(data?.needs_input) ? data.needs_input : []
      if (data?.changed && data?.markdown) {
        _patch(projectName, {
          running: false,
          oldMd: data.current_markdown || text || '',
          newMd: data.markdown,
          needsInput: ni,
        })
        return { changed: true, needsInput: ni }
      }
      _patch(projectName, { running: false, oldMd: '', newMd: '', needsInput: ni })
      return { changed: false, needsInput: ni }
    } catch (err) {
      _patch(projectName, { running: false, oldMd: '', newMd: '', needsInput: [] })
      return { error: err }
    }
  }

  /** 승인/취소 후 — diff 결과만 비움 (needsInput 은 dismiss 로 별도). */
  const clearPending = (projectName) => {
    if (projectName) _patch(projectName, { oldMd: '', newMd: '', baseUpdatedAt: null })
  }
  /** needs_input 안내 닫기 — 같은 세션의 재-hydrate(탭 복귀 등)도 막는다. */
  const clearNeedsInput = (projectName) => {
    if (projectName) _patch(projectName, { needsInput: [], needsDismissed: true })
  }

  /**
   * [2026-06] BE 영속값(getPRD 의 autofix_needs_input)으로 복원 — 새로고침/다른
   * 기기에서도 '인터뷰 필요' 안내 유지. 진행 중(곧 새 결과)·이미 있음·dismiss 됨
   * 이면 no-op (서버 값이 사용자 최신 행동을 덮지 않게).
   */
  const restoreNeedsInput = (projectName, items) => {
    if (!projectName || !Array.isArray(items) || items.length === 0) return
    const e = _entry(projectName)
    if (e?.running || e?.needsDismissed || (e?.needsInput || []).length > 0) return
    _patch(projectName, { needsInput: items })
  }

  /**
   * [2026-06] BE 가 비웠음을 반영 — 인터뷰 답변→merge(자동 소멸)나 다른 기기의
   * dismiss 후, 세션에 떠 있던 패널이 이미 채워진 질문을 계속 보여주지 않게.
   * dismissed 플래그는 안 세움 (사용자 행동이 아니라 서버 상태 동기화).
   * 진행 중이면 no-op — 곧 도착할 새 진단을 옛 fetch 가 지우지 않게.
   */
  const syncNeedsCleared = (projectName) => {
    if (!projectName) return
    const e = _entry(projectName)
    if (e?.running || (e?.needsInput || []).length === 0) return
    _patch(projectName, { needsInput: [] })
  }

  return {
    isAutofixing,
    pendingDiff,
    needsInput,
    runAutofix,
    clearPending,
    clearNeedsInput,
    restoreNeedsInput,
    syncNeedsCleared,
  }
})
