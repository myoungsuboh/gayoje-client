/**
 * SpackTab.vue — Policy 카드 렌더링 (2026-05-28 schema align fix).
 *
 * 기존 카드는 name/title/rule 만 찾았는데 BE save 는 category/description/related_entity
 * 만 저장 → 모든 카드가 빈 박스로 보였음. schema 와 align 된 렌더링 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import i18n from '@/plugins/i18n'

const vuetify = createVuetify({ components, directives })
setActivePinia(createPinia())

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// SpackTab 의 무거운 외부 의존을 stub — 우리는 Policy 렌더링만 검증.
vi.mock('@/utils/axios', () => ({
  default: { post: vi.fn(), get: vi.fn(async () => ({ data: { _empty: false } })) },
}))
vi.mock('@/utils/designFetch', () => ({
  fetchWithRetryIfEmpty: vi.fn(async () => ({ data: { _empty: false } })),
  extractRaw: (resp) => resp?.data ?? {},
  isSpackEmpty: () => false,
}))
vi.mock('@/composables/useCrossLink', () => ({
  useCrossLink: () => ({
    setSpackData: vi.fn(),
    serviceFor: () => null,
    chainFor: () => ({}),
    consumeJump: () => null,
    jumpTo: vi.fn(),
  }),
}))
vi.mock('@/components/design/DesignLineagePanel.vue', () => ({
  default: { name: 'DesignLineagePanel', template: '<div/>' },
}))
vi.mock('@/components/common/GuideTooltip.vue', () => ({
  default: { name: 'GuideTooltip', template: '<span/>' },
}))
vi.mock('@/components/design/EvalScoreCard.vue', () => ({
  default: { name: 'EvalScoreCard', template: '<div/>' },
}))

import SpackTab from '@/components/design/SpackTab.vue'

const POLICIES = [
  {
    id: 'POL-01',
    category: 'Performance',
    description: '티켓 전환 및 지급은 펀딩 마감 후 1분 이내에 완료되어야 함',
    related_entity: 'Ticket',
  },
  {
    id: 'POL-02',
    category: 'Security',
    description: '',
    related_entity: 'User',
  },
]

const mountSpack = (policiesOverride = POLICIES) =>
  mount(SpackTab, {
    global: {
      plugins: [createPinia(), vuetify],
      stubs: { transition: false },
    },
  })

describe('SpackTab Policy 카드 (schema align)', () => {
  // jsdom navigator.language 는 'en' → 테스트는 한국어 기준으로 고정
  beforeEach(() => { i18n.global.locale.value = 'ko' })

  it('category badge + id + description + related_entity 모두 표시', async () => {
    const wrapper = mountSpack()
    // SpackTab 의 spackData 를 직접 setter (export 안 됨 → ref 접근 위해 vm internals).
    wrapper.vm.spackData = { apis: [], entities: [], policies: POLICIES, internal_rels: [], implement_rels: [] }
    await wrapper.vm.$nextTick()
    const html = wrapper.html()
    // category badge
    expect(html).toContain('Performance')
    expect(html).toContain('Security')
    // id
    expect(html).toContain('POL-01')
    expect(html).toContain('POL-02')
    // description (non-empty case)
    expect(html).toContain('티켓 전환')
    // related_entity
    expect(html).toContain('Ticket')
    expect(html).toContain('User')
  })

  it('description 이 빈 경우 안내 메시지 표시 (빈 카드 X)', async () => {
    const wrapper = mountSpack()
    wrapper.vm.spackData = {
      apis: [], entities: [], policies: [POLICIES[1]], internal_rels: [], implement_rels: [],
    }
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('내용 없음')
    expect(text).toContain('PRD')
    // category 는 여전히 표시
    expect(text).toContain('Security')
  })

  it('policies 가 비면 "Policy 없음" 표시 (entity 등 있어 컬럼은 노출)', async () => {
    const wrapper = mountSpack()
    wrapper.vm.spackData = {
      apis: [], entities: [{ id: 'ENT-01', name: 'X' }], policies: [],
      internal_rels: [], implement_rels: [],
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Policy 없음')
  })
})
