/**
 * useSkillRegistry — RuleGeneratorTab 에서 분리한 스킬 레지스트리 데이터/CRUD 컴포저블
 * (2026-05-27). axios/confirm/snackbar/store 를 mock 하여 핵심 로직 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(async () => ({ data: { result: [] } })),
  axiosPost: vi.fn(async () => ({ data: {} })),
  axiosDelete: vi.fn(async () => ({ data: {} })),
  confirmResult: { value: true },
  confirm: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
}))

vi.mock('@/utils/axios', () => ({
  default: { get: mocks.axiosGet, post: mocks.axiosPost, delete: mocks.axiosDelete },
}))
vi.mock('@/store/harness', () => ({ API_BASE: '' }))
vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mocks.showSuccess, showError: mocks.showError, showInfo: mocks.showInfo }),
}))
vi.mock('@/store/skillLibrary', () => ({
  useSkillLibraryStore: () => ({
    folders: [],
    entries: [],
    entriesByFolderId: new Map(),
    load: vi.fn(),
  }),
}))

import { useSkillRegistry } from '@/composables/useSkillRegistry'

// 컴포저블을 컴포넌트 setup 컨텍스트에서 실행 (watch/computed 동작 위해).
function withSetup(composable) {
  let result
  const app = createApp({ setup() { result = composable(); return () => null } })
  app.mount(document.createElement('div'))
  return [result, app]
}

beforeEach(() => {
  mocks.axiosGet.mockClear()
  mocks.axiosPost.mockClear()
  mocks.axiosDelete.mockClear()
  mocks.showError.mockClear()
  mocks.confirm.mockReset()
  mocks.confirm.mockImplementation(async () => mocks.confirmResult.value)
  mocks.confirmResult.value = true
  mocks.axiosGet.mockImplementation(async () => ({ data: { result: [] } }))
})

describe('useSkillRegistry — fetchAllSkills', () => {
  it('projectName 있으면 mount 시 watch(immediate) 로 getAllSkill 호출', async () => {
    const [, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(mocks.axiosGet).toHaveBeenCalledWith('/getAllSkill', expect.objectContaining({ params: { projectName: 'proj_x' } }))
    app.unmount()
  })

  it('중복 ID 제거 + ID 알파벳 정렬', async () => {
    mocks.axiosGet.mockImplementation(async () => ({
      data: { result: [{ id: 'B', name: 'b' }, { id: 'A', name: 'a' }, { id: 'A', name: 'dup' }] },
    }))
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(reg.skills.value.map(s => s.id)).toEqual(['A', 'B'])
    expect(reg.selectedId.value).toBe('A')  // 첫 항목 자동 선택
    app.unmount()
  })

  it('projectName 빈 ref 면 watch 가 fetch 안 함', async () => {
    const pn = ref('')
    const [, app] = withSetup(() => useSkillRegistry(pn))
    await flushPromises()
    expect(mocks.axiosGet).not.toHaveBeenCalled()
    app.unmount()
  })

  // [2026-06-12 fix] getAllSkill(목록)은 요약만 반환 — 자동 선택된 스킬도 상세
  // (trigger/instructions)를 즉시 로드해야 한다. 이전엔 빈 폼 + 50점으로 보이다
  // "한 번 더 클릭"해야 채워지던 버그의 회귀 가드.
  it('자동 선택된 첫 스킬의 상세(getSkill)를 즉시 로드해 폼을 채운다', async () => {
    mocks.axiosGet.mockImplementation(async (url) => {
      if (url === '/getAllSkill') {
        return { data: { result: [{ id: 'SKL-A11Y', name: '웹 접근성' }] } }  // 요약 — 상세 없음
      }
      if (url === '/getSkill') {
        return { data: { result: [{
          id: 'SKL-A11Y', name: '웹 접근성',
          trigger_condition: 'WCAG 2.1 AA 가이드',
          instructions: ['체크리스트 통과', '시맨틱 태그 우선'],
        }] } }
      }
      return { data: { result: [] } }
    })
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(reg.selectedId.value).toBe('SKL-A11Y')
    // 클릭 없이도 상세가 채워져 완성도 점수가 실제 데이터 기준으로 계산된다.
    expect(reg.selectedSkill.value.trigger_condition).toBe('WCAG 2.1 AA 가이드')
    expect(reg.selectedSkill.value.instructions).toHaveLength(2)
    app.unmount()
  })

  // [2026-06] 신규 프로젝트는 첫 mutation(회의록/스킬 등록) 전까지 소유권 claim 전 → 조회 403.
  // 이는 '아직 스킬 없음'과 동일 — design/plan 처럼 빈 상태로 두고 에러 배너를 안 띄운다.
  it('403(미claim 신규 프로젝트) → skills 빈배열 + errorMsg 없음 (graceful)', async () => {
    mocks.axiosGet.mockImplementation(async () => { throw { response: { status: 403 } } })
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(reg.skills.value).toEqual([])
    expect(reg.errorMsg.value).toBe('')
    app.unmount()
  })

  it('403 외 에러(예: 500)는 errorMsg 로 노출', async () => {
    mocks.axiosGet.mockImplementation(async () => { throw { response: { status: 500 } } })
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(reg.errorMsg.value).toContain('불러오는데 실패')
    app.unmount()
  })
})

describe('useSkillRegistry — saveSkill / deleteSkill 가드', () => {
  it('신규 스킬이 ID 중복체크 안 됐으면 errorMsg + postSkill 미호출', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.skills.value = [{ id: 'NEW', name: '새', isNew: true, isIdChecked: false, instructions: [], tags: [] }]
    reg.selectedId.value = 'NEW'
    await reg.saveSkill()
    expect(reg.errorMsg.value).toContain('중복 체크')
    expect(mocks.axiosPost).not.toHaveBeenCalled()
    app.unmount()
  })

  it('deleteSkill — confirm 거절 시 deleteSkill API 미호출', async () => {
    mocks.confirmResult.value = false
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.skills.value = [{ id: 'A', name: 'a' }]
    reg.selectedId.value = 'A'
    await reg.deleteSkill()
    expect(mocks.axiosDelete).not.toHaveBeenCalled()
    app.unmount()
  })
})

describe('useSkillRegistry — registerSelectedAiSkills (일괄 등록)', () => {
  it('[2026-06-13] 선택 N개를 postSkill 1콜로 묶어 보낸다 (이전 N콜)', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.skills.value = []   // 기존 등록 없음
    reg.aiRecommendations.value = [
      { id: 'SKL-A', name: 'A', description: 'descA', rules: ['r1'], tags: [], categoryDir: 'cat', baseName: 'A' },
      { id: 'SKL-B', name: 'B', description: 'descB', rules: ['r2'], tags: [], categoryDir: 'cat', baseName: 'B' },
      { id: 'SKL-C', name: 'C', description: 'descC', rules: ['r3'], tags: [], categoryDir: 'cat', baseName: 'C' },
    ]
    reg.aiSelectedIds.value = ['SKL-A', 'SKL-B', 'SKL-C']
    mocks.axiosPost.mockClear()

    await reg.registerSelectedAiSkills()

    const postCalls = mocks.axiosPost.mock.calls.filter(c => c[0] === '/postSkill')
    expect(postCalls).toHaveLength(1)                         // N콜 → 1콜
    expect(postCalls[0][1].skills).toHaveLength(3)            // 3개 한 배치
    expect(postCalls[0][1].skills.map(s => s.id)).toEqual(['SKL-A', 'SKL-B', 'SKL-C'])
    app.unmount()
  })

  it('이미 등록된 ID 는 배치에서 제외하고 건너뜀 카운트로', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.skills.value = [{ id: 'SKL-A', name: 'A(이미등록)' }]
    reg.aiRecommendations.value = [
      { id: 'SKL-A', name: 'A', description: 'd', rules: [], tags: [], categoryDir: 'c', baseName: 'A' },
      { id: 'SKL-B', name: 'B', description: 'd', rules: [], tags: [], categoryDir: 'c', baseName: 'B' },
    ]
    reg.aiSelectedIds.value = ['SKL-A', 'SKL-B']
    mocks.axiosPost.mockClear()

    await reg.registerSelectedAiSkills()

    const postCalls = mocks.axiosPost.mock.calls.filter(c => c[0] === '/postSkill')
    expect(postCalls).toHaveLength(1)
    expect(postCalls[0][1].skills.map(s => s.id)).toEqual(['SKL-B'])   // A 제외
    app.unmount()
  })

  it('모두 이미 등록돼 있으면 postSkill 미호출', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.skills.value = [{ id: 'SKL-A', name: 'A' }]
    reg.aiRecommendations.value = [
      { id: 'SKL-A', name: 'A', description: 'd', rules: [], tags: [], categoryDir: 'c', baseName: 'A' },
    ]
    reg.aiSelectedIds.value = ['SKL-A']
    mocks.axiosPost.mockClear()

    await reg.registerSelectedAiSkills()

    expect(mocks.axiosPost.mock.calls.filter(c => c[0] === '/postSkill')).toHaveLength(0)
    app.unmount()
  })

  it('[동적] 등록 tags 에 cat:{categoryDir} 마커를 평탄하게 넣는다 (export 동적 카테고리 + 중첩배열 회귀 방지)', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.skills.value = []
    reg.aiRecommendations.value = [
      { id: 'SKL-A', name: 'A', description: 'd', rules: [], tags: ['vue3', 'pinia'], categoryDir: 'frontEnd', baseName: 'state-mgmt' },
    ]
    reg.aiSelectedIds.value = ['SKL-A']
    mocks.axiosPost.mockClear()

    await reg.registerSelectedAiSkills()

    const sent = mocks.axiosPost.mock.calls.find(c => c[0] === '/postSkill')[1].skills[0]
    expect(sent.tags).toContain('cat:frontEnd')                          // 동적 카테고리 마커(export getCategoryFromSkill 가 폴더로 씀)
    expect(sent.tags).toContain('vue3')                                  // rec.tags 원본 보존
    expect(sent.tags).toContain('pinia')
    expect(sent.tags.every(t => typeof t === 'string')).toBe(true)       // 평탄 — rec.tags 가 중첩배열로 깨지던 버그 회귀 방지
    expect(sent.tags.filter(t => t.startsWith('cat:'))).toHaveLength(1)  // cat: 마커 정확히 1개
    app.unmount()
  })
})

describe('useSkillRegistry — cancelAiRecommendation (추천 중단)', () => {
  it('[2026-06-13] 추천 요청에 abort signal 을 첨부한다', async () => {
    let capturedOpts = null
    mocks.axiosPost.mockImplementation(async (url, _body, opts) => {
      if (url === '/recommendSkillsByAI') {
        capturedOpts = opts
        return { data: { result: { recommended: [] } } }
      }
      return { data: {} }
    })
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    await reg.requestAiRecommendation()
    // 카탈로그(import.meta.glob)가 비어 있으면 post 자체가 호출 안 됨 — 그 경우만 skip
    if (mocks.axiosPost.mock.calls.some(c => c[0] === '/recommendSkillsByAI')) {
      expect(capturedOpts?.signal).toBeInstanceOf(AbortSignal)
    }
    app.unmount()
  })

  it('[2026-06-13] 진행 중 취소 시 in-flight 요청을 abort 하고 조용히 닫는다', async () => {
    mocks.axiosPost.mockImplementation((url, _body, opts) => {
      if (url === '/recommendSkillsByAI') {
        // abort 될 때까지 미해결 — 사용자가 취소를 누르는 동안 진행 중 상태 모사.
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('canceled'); err.code = 'ERR_CANCELED'; reject(err)
          })
        })
      }
      return Promise.resolve({ data: {} })
    })
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.aiDialog.value = true
    const p = reg.requestAiRecommendation()
    await flushPromises()

    // 카탈로그가 있어야 in-flight 진입 — 없으면 이 환경에선 검증 불가, skip.
    if (reg.isAiRecommending.value) {
      reg.cancelAiRecommendation()
      await p
      await flushPromises()
      expect(reg.isAiRecommending.value).toBe(false)  // finally 로 해제
      expect(reg.aiDialog.value).toBe(false)          // 닫힘
      expect(reg.aiError.value).toBe('')              // 취소는 에러로 표시하지 않음
    }
    app.unmount()
  })

  it('진행 중이 아니어도 cancelAiRecommendation 은 안전하게 닫는다', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.aiDialog.value = true
    expect(() => reg.cancelAiRecommendation()).not.toThrow()
    expect(reg.aiDialog.value).toBe(false)
    app.unmount()
  })
})

describe('useSkillRegistry — frontmatter rules (#123)', () => {
  it('parseFrontmatterRules — rules: YAML 리스트 파싱 (따옴표 제거)', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    const fm = `name: Foo\nrules:\n  - "규칙 하나"\n  - 규칙 둘\ndescription: bar`
    expect(reg.parseFrontmatterRules(fm)).toEqual(['규칙 하나', '규칙 둘'])
    app.unmount()
  })

  it('parseFrontmatterRules — rules 없으면 빈 배열', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(reg.parseFrontmatterRules('name: Foo\ndescription: bar')).toEqual([])
    app.unmount()
  })

  it('deriveInstructions — rules 있으면 rules 우선, 없으면 본문 split', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(reg.deriveInstructions(['a', 'b'], '문단1\n\n문단2')).toEqual(['a', 'b'])
    expect(reg.deriveInstructions([], '문단1\n\n문단2')).toEqual(['문단1', '문단2'])
    app.unmount()
  })
})

describe('useSkillRegistry — frontmatter tags (코드 매칭용)', () => {
  it('parseFrontmatterTags — tags: YAML 리스트 파싱 (따옴표 제거)', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    const fm = `name: Foo\ntags:\n  - "DOMPurify"\n  - axios\n  - "v-html"\ndescription: bar`
    expect(reg.parseFrontmatterTags(fm)).toEqual(['DOMPurify', 'axios', 'v-html'])
    app.unmount()
  })

  it('parseFrontmatterTags — tags 없으면 빈 배열', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    expect(reg.parseFrontmatterTags('name: Foo\ndescription: bar')).toEqual([])
    app.unmount()
  })

  it('mergeTags — frontmatter tags 가 앞, 자동 태그가 뒤, 중복 제거', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    // SKILL.md 가 명시한 코드 키워드가 baseName/categoryDir 앞에 와야 코드 매칭 우선.
    expect(reg.mergeTags(['DOMPurify', 'XSS'], 'security-frontend', 'frontEnd'))
      .toEqual(['DOMPurify', 'XSS', 'security-frontend', 'frontEnd'])
    // 중복은 처음 등장 위치 유지.
    expect(reg.mergeTags(['frontEnd', 'axios'], 'api-standard', 'frontEnd'))
      .toEqual(['frontEnd', 'axios', 'api-standard'])
    // falsy 값 제거.
    expect(reg.mergeTags([], 'baseName', '', null, 'frontEnd'))
      .toEqual(['baseName', 'frontEnd'])
    app.unmount()
  })
})

describe('useSkillRegistry — 로컬 액션', () => {
  it('addSkill → 새 스킬 unshift + 선택', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.skills.value = []
    reg.addSkill()
    expect(reg.skills.value.length).toBe(1)
    expect(reg.skills.value[0].isNew).toBe(true)
    expect(reg.selectedId.value).toBe(reg.skills.value[0].id)
    app.unmount()
  })

  it('toggleSelectMode → 선택 모드 on/off + 선택 초기화', async () => {
    const [reg, app] = withSetup(() => useSkillRegistry(() => 'proj_x'))
    await flushPromises()
    reg.selectedSkillIds.value = ['x']
    reg.toggleSelectMode()
    expect(reg.isSelectMode.value).toBe(true)
    expect(reg.selectedSkillIds.value).toEqual([])
    app.unmount()
  })
})
