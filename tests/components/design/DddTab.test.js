/**
 * DddTab.vue — 비전공자용 UX 개선 (2026-05-28).
 *
 * 검증:
 *  - 영어 jargon 라벨이 한글 우선 표기로 일관 적용 (제목/부제목/섹션/범례)
 *  - "읽는 법"(테두리 스타일) 안내 노출
 *  - PRD 미연결 항목을 콕 집는 "보강 안내" 패널 (떠먹여주기)
 *  - 8개 cap 초과 시 "+N개 더"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import i18n from '@/plugins/i18n'

const vuetify = createVuetify({ components, directives })

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// useEvalScore / axios 는 네트워크 의존 → stub
vi.mock('@/composables/useEvalScore', () => ({
  useEvalScore: () => ({ score: { value: null }, loading: { value: false } }),
}))
vi.mock('@/utils/axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })) } }))

import DddTab from '@/components/design/DddTab.vue'

const stubs = {
  GuideTooltip: true,
  LineageCoverageBadge: true,
  DesignLineagePanel: true,
  EmptyTabState: true,
  EvalScoreCard: true,
}

const mountTab = async (dddData) => {
  const wrapper = mount(DddTab, {
    global: { stubs, plugins: [createPinia(), vuetify] },
  })
  // fetchData 를 우회하고 직접 데이터 주입
  wrapper.vm.dddData = dddData
  await wrapper.vm.$nextTick()
  return wrapper
}

const baseData = (overrides = {}) => ({
  contexts: [{ id: 'CTX-01', name: '작업 관리' }],
  aggregates: [],
  domain_entities: [],
  domain_events: [],
  internal_rels: [],
  trigger_rels: [],
  aggregate_service_rels: [],
  ...overrides,
})

describe('DddTab UX (비전공자 한글화 + 보강 안내)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // jsdom navigator.language 는 'en' → 테스트는 한국어 기준으로 고정
    i18n.global.locale.value = 'ko'
  })

  it('제목·부제목이 한글 우선으로 표기', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: [{ id: 'AGG-01', name: '작업' }],
    }))
    const text = wrapper.text()
    expect(text).toContain('업무 지도')
    // 부제목 한글 용어
    expect(text).toContain('업무 영역')
    expect(text).toContain('데이터 묶음')
    expect(text).toContain('일어난 사건')
  })

  it('"읽는 법"(테두리 스타일) 안내 노출', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: [{ id: 'AGG-01', name: '작업' }],
    }))
    const text = wrapper.text()
    expect(text).toContain('직접 연결')
    expect(text).toContain('출처 모름')
  })

  it('PRD 미연결 항목을 콕 집어 보강 안내 (떠먹여주기)', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: [
        { id: 'AGG-01', name: '연결됨', lineage: { confidence: 'direct', related_stories: [{ story_id: 'S-1' }] } },
        { id: 'AGG-02', name: '미연결묶음' },  // lineage 없음
      ],
      domain_entities: [
        { id: 'DENT-01', name: '미연결데이터' },  // lineage 없음
      ],
    }))
    const text = wrapper.text()
    expect(text).toContain('PRD 기능과 연결 안 된 항목')
    // 구체적 항목 이름 노출
    expect(text).toContain('미연결묶음')
    expect(text).toContain('미연결데이터')
    // 보강 chip DOM
    expect(wrapper.findAll('.fix-chip').length).toBeGreaterThanOrEqual(2)
  })

  it('모두 PRD 연결되면 보강 안내 숨김', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: [
        { id: 'AGG-01', name: '작업', lineage: { confidence: 'direct', related_stories: [{ story_id: 'S-1' }] } },
      ],
    }))
    expect(wrapper.find('.ddd-fixguide').exists()).toBe(false)
  })

  it('미연결 8개 초과 시 "+N개 더" 표시', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: Array.from({ length: 10 }, (_, i) => ({ id: `AGG-${i}`, name: `묶음${i}` })),
    }))
    expect(wrapper.find('.fix-chip--more').text()).toContain('+2개 더')
  })

  it('Aggregate 카드에 설명 + 지켜야 할 규칙(invariants) 노출', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: [{
        id: 'AGG-01', name: 'Task',
        description: '사용자가 처리할 작업 단위',
        invariants: ['마감일은 생성일보다 늦어야 함'],
        lineage: { confidence: 'direct', related_stories: [{ story_id: 'S-1' }] },
      }],
      internal_rels: [{ type: 'BELONGS_TO', source_id: 'AGG-01', target_id: 'CTX-01' }],
    }))
    const text = wrapper.text()
    expect(text).toContain('사용자가 처리할 작업 단위')
    expect(text).toContain('지켜야 할 규칙')
    expect(text).toContain('마감일은 생성일보다 늦어야 함')
  })

  it('invariants 가 JSON string 으로 와도 복원해서 표시', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: [{
        id: 'AGG-01', name: 'Task',
        invariants: '["수량은 0 이상"]',  // Neo4j JSON string 직렬화 케이스
      }],
      internal_rels: [{ type: 'BELONGS_TO', source_id: 'AGG-01', target_id: 'CTX-01' }],
    }))
    expect(wrapper.text()).toContain('수량은 0 이상')
  })

  it('Entity 카드에 이름 + 한 줄 설명 노출 (chip → card)', async () => {
    const wrapper = await mountTab(baseData({
      aggregates: [{ id: 'AGG-01', name: 'Task' }],
      domain_entities: [{
        id: 'DENT-01', name: 'TaskProgress',
        description: '작업의 진행 상태를 추적하는 데이터',
      }],
      internal_rels: [
        { type: 'BELONGS_TO', source_id: 'AGG-01', target_id: 'CTX-01' },
        { type: 'PART_OF', source_id: 'DENT-01', target_id: 'AGG-01' },
      ],
    }))
    const text = wrapper.text()
    expect(text).toContain('TaskProgress')
    expect(text).toContain('작업의 진행 상태를 추적하는 데이터')
    expect(wrapper.find('.ent-card').exists()).toBe(true)
  })

  it('Context 헤더에 영역 설명 노출', async () => {
    const wrapper = await mountTab(baseData({
      contexts: [{ id: 'CTX-01', name: '작업 관리', description: '작업의 생성·할당·완료를 다루는 영역' }],
      aggregates: [{ id: 'AGG-01', name: 'Task' }],
    }))
    expect(wrapper.text()).toContain('작업의 생성·할당·완료를 다루는 영역')
  })
})
