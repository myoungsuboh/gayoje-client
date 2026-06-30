/**
 * useFixAgent — lint.vue 에서 추출한 Fix Agent 명세서 생성·다운로드 composable.
 *
 * [검증]
 * - getLintResult() 가 null 반환 → "먼저 Lint 분석" 에러
 * - BE success=false → error 메시지 노출
 * - 응답 markdown 미포함 → "100% 달성" 메시지
 * - 응답 markdown 포함 → downloadMarkdown 호출 + 성공 메시지
 * - 호출 중 throw → finally 가 loading false 로 복귀
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// downloadMarkdown 을 mock — 실제 DOM 다운로드 트리거 없이 호출만 검증.
vi.mock('@/utils/download', () => ({
  downloadMarkdown: vi.fn(),
}))

import { downloadMarkdown } from '@/utils/download'
import { useFixAgent } from '@/composables/useFixAgent'

const makeStore = ({ generateImpl } = {}) => ({
  projectName: 'proj_x',
  generateFixSpec: vi.fn(generateImpl || (async () => ({ success: true, data: {} }))),
})

const setup = ({ generateImpl, getLintResult } = {}) => {
  const store = makeStore({ generateImpl })
  const githubUrl = ref('https://github.com/x/y')
  const agent = useFixAgent({
    store,
    githubUrlRef: githubUrl,
    getLintResult: getLintResult || (() => ({ score: 80, cases: [] })),
  })
  return { store, agent, githubUrl }
}

beforeEach(() => {
  downloadMarkdown.mockReset()
})

describe('useFixAgent', () => {
  it('getLintResult 가 null → "먼저 Lint 분석" 에러 + BE 호출 안 함', async () => {
    const { store, agent } = setup({ getLintResult: () => null })
    await agent.executeFixAgent()
    expect(agent.fixSpecError.value).toContain('먼저 Lint 분석')
    expect(store.generateFixSpec).not.toHaveBeenCalled()
    expect(agent.fixSpecLoading.value).toBe(false)
  })

  it('BE success=false → result.error 노출', async () => {
    const { agent } = setup({
      generateImpl: async () => ({ success: false, error: '서버 오류' }),
    })
    await agent.executeFixAgent()
    expect(agent.fixSpecError.value).toBe('서버 오류')
    expect(downloadMarkdown).not.toHaveBeenCalled()
  })

  it('BE 응답 data.success=false → data.message 노출', async () => {
    const { agent } = setup({
      generateImpl: async () => ({
        success: true,
        data: { success: false, message: 'LLM 한도 초과' },
      }),
    })
    await agent.executeFixAgent()
    expect(agent.fixSpecError.value).toBe('LLM 한도 초과')
  })

  it('markdown 미포함 → "100% 달성" 메시지 (다운로드 안 함)', async () => {
    const { agent } = setup({
      generateImpl: async () => ({
        success: true,
        data: { message: '모두 통과', markdown: '' },
      }),
    })
    await agent.executeFixAgent()
    expect(agent.fixSpecMessage.value).toBe('모두 통과')
    expect(downloadMarkdown).not.toHaveBeenCalled()
  })

  it('markdown 미포함 + 메시지도 없으면 default 메시지', async () => {
    const { agent } = setup({
      generateImpl: async () => ({ success: true, data: {} }),
    })
    await agent.executeFixAgent()
    expect(agent.fixSpecMessage.value).toContain('100%')
    expect(downloadMarkdown).not.toHaveBeenCalled()
  })

  it('markdown 포함 → downloadMarkdown 호출 + 성공 메시지 + filename', async () => {
    const { agent } = setup({
      generateImpl: async () => ({
        success: true,
        data: { markdown: '# spec', filename: 'fix-x.md' },
      }),
    })
    await agent.executeFixAgent()
    expect(downloadMarkdown).toHaveBeenCalledWith('# spec', 'fix-x.md')
    expect(agent.fixSpecMessage.value).toContain('fix-x.md')
  })

  it('filename 미제공 시 projectName 으로 fallback', async () => {
    const { agent } = setup({
      generateImpl: async () => ({
        success: true,
        data: { markdown: '# spec' },
      }),
    })
    await agent.executeFixAgent()
    expect(downloadMarkdown).toHaveBeenCalledWith('# spec', 'fix-spec-proj_x.md')
  })

  it('호출 중 throw → finally 가 loading false 로 복귀 + error 노출', async () => {
    const { agent } = setup({
      generateImpl: async () => { throw new Error('네트워크 단절') },
    })
    await agent.executeFixAgent()
    expect(agent.fixSpecError.value).toBe('네트워크 단절')
    expect(agent.fixSpecLoading.value).toBe(false)
  })

  it('실행 직전 message/error 가 초기화됨 (이전 호출의 잔여물 cleanup)', async () => {
    const { agent } = setup({
      generateImpl: async () => ({
        success: true,
        data: { markdown: '# spec' },
      }),
    })
    // 의도적으로 stale state 주입
    agent.fixSpecMessage.value = '이전 메시지'
    agent.fixSpecError.value = '이전 에러'
    await agent.executeFixAgent()
    expect(agent.fixSpecError.value).toBe('')
    expect(agent.fixSpecMessage.value).toContain('다운로드 완료')
  })
})
