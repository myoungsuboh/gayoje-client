import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import i18n from '@/plugins/i18n'

// 무거운 의존만 모킹 — 데이터 파생(lineageSummary/matrixRows 등)은 실제 컴포저블로 검증.
vi.mock('@/store/harness', () => ({
  useHarnessStore: () => ({ isAnalyzingLineage: false, projectName: 'p' }),
}))
vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showErrorWithRetry: vi.fn() }),
}))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => vi.fn() }))
// 품질(정답라벨/precision)은 '고급' 전용 — 단순 카드와 무관. 워처 부작용 회피 위해 모킹.
vi.mock('@/composables/useLineageQuality', () => ({
  TAB_TO_ITEM_TYPE: { aggregates: 'aggregate', apis: 'api', services: 'service', stories: 'story' },
  useLineageQuality: () => ({
    truthDialogOpen: { value: false }, truthDialogItem: { value: null }, truthDialogType: { value: '' },
    openTruthDialog: vi.fn(), hasTruth: () => false,
    lineageQualityCurrent: null, formatPct: (x) => String(x),
  }),
}))

import { useLineageAnalysis } from '@/composables/useLineageAnalysis'
import LineageSection from '@/components/deliverables/LineageSection.vue'

// 모듈 싱글톤 — 컴포넌트 내부 호출과 같은 lineageData 를 공유.
const la = useLineageAnalysis()

const fake = {
  summary: '요약',
  stats: { totalImpls: 2, storiesCount: 3 },
  stories: [
    { id: 'S1', name: '로그인', implementations: [{ repoUrl: 'r', filePath: 'login.vue', confidence: 'high' }] },
    { id: 'S2', name: '주문', implementations: [{ repoUrl: 'r', filePath: 'order.js', confidence: 'medium' }] },
    { id: 'S3', name: '결제', implementations: [] },
  ],
  apis: [], aggregates: [], services: [],
  missingImpl: [{ type: 'story', id: 'S3', name: '결제', reason: '매칭 파일 없음' }],
  drifts: [],
}

const mountIt = (props = {}) =>
  mount(LineageSection, {
    props: { repos: [{ url: 'r', role: 'frontend' }], repoRoleByUrl: {}, openFile: vi.fn(), ...props },
    global: { plugins: [i18n], stubs: { GuideTooltip: true } },
  })

describe('LineageSection 재설계', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'ko'
    la.lineageData.value = null
  })

  it('repos 미연결 → 가치 안내 + Repo 연결 CTA', () => {
    const w = mountIt({ repos: [] })
    expect(w.text()).toContain('코드를 연결하면')
    expect(w.find('.lineage-empty-state .analyze-btn').exists()).toBe(true)
    expect(w.find('.lineage-preview').exists()).toBe(true)
  })

  it('연결 버튼 클릭 → connect-repo emit', async () => {
    const w = mountIt({ repos: [] })
    await w.find('.lineage-empty-state .analyze-btn').trigger('click')
    expect(w.emitted('connect-repo')).toBeTruthy()
  })

  it('결과 → Story 판정 헤드라인(2/3) + 미구현 먼저 + 고급 보존', async () => {
    la.lineageData.value = fake
    const w = mountIt()
    await nextTick()
    expect(w.find('.build-check').exists()).toBe(true)
    expect(w.text()).toContain('2 / 3')
    // 미구현(결제)이 노출
    expect(w.find('.bc-missing').exists()).toBe(true)
    expect(w.text()).toContain('결제')
    // 기존 상세는 '고급' details 로 보존
    expect(w.find('details.lineage-advanced').exists()).toBe(true)
  })

  it('전부 구현 → all_done, 미구현 박스 없음', async () => {
    la.lineageData.value = {
      ...fake,
      stories: [{ id: 'S1', name: '로그인', implementations: [{ repoUrl: 'r', filePath: 'a.js', confidence: 'high' }] }],
      missingImpl: [],
      stats: { totalImpls: 1, storiesCount: 1 },
    }
    const w = mountIt()
    await nextTick()
    expect(w.find('.bc-missing').exists()).toBe(false)
    expect(w.find('.bc-alldone').exists()).toBe(true)
  })
})
