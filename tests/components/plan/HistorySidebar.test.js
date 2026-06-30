/**
 * HistorySidebar.vue — 버전 History 사이드바 (MeetingLogTab 에서 분리, 2026-05-27).
 *
 * 분리 후 props/emits 계약 + 헤더 버튼 비활성화/active + 버전 리스트 렌더 검증.
 *
 * [2026-06-10 UX 개편] 헤더가 아이콘 3개 → "새 회의록" 주 버튼(.history-primary-btn)
 * + ⋯ 더보기 메뉴(.history-more-btn → VMenu, Notion/배치 항목)로 변경됨에 맞춰 갱신.
 * VMenu 내용은 body 레벨 overlay 로 teleport 되므로 document.body 에서 조회한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const vuetify = createVuetify({ components, directives })

// jsdom 엔 ResizeObserver 가 없음 — VProgressCircular(isLoading 분기)가 사용하므로 stub.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import HistorySidebar from '@/components/plan/HistorySidebar.vue'
import i18n from '@/plugins/i18n'

let wrapper = null

const mountSidebar = (props = {}) => {
  wrapper = mount(HistorySidebar, {
    props: {
      meetingLogs: [],
      selectedLog: '',
      isLoading: false,
      nextVersion: 'v1.1',
      isNewLogMode: false,
      isAnyProcessing: false,
      showBatchPanel: false,
      ...props,
    },
    global: { plugins: [vuetify] },
  })
  return wrapper
}

// VMenu 항목은 overlay 로 teleport — 트리거 클릭 후 body 에서 찾는다.
const openMenu = async (w) => {
  await w.find('.history-more-btn').trigger('click')
  await vi.dynamicImportSettled?.()
  await w.vm.$nextTick()
}

beforeEach(() => {
  i18n.global.locale.value = 'ko'
})

afterEach(() => {
  // teleport 된 overlay 가 다음 테스트로 새지 않도록 정리
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('HistorySidebar — 헤더: 새 회의록 주 버튼', () => {
  it('기본: 텍스트 라벨이 있는 주 버튼 + ⋯ 메뉴 트리거 렌더', () => {
    const w = mountSidebar()
    const primary = w.find('.history-primary-btn')
    expect(primary.exists()).toBe(true)
    expect(primary.text()).toContain('새 회의록')
    expect(w.find('.history-more-btn').exists()).toBe(true)
  })

  it('isAnyProcessing=true 면 주 버튼 disabled + 이유 title', () => {
    const w = mountSidebar({ isAnyProcessing: true })
    const primary = w.find('.history-primary-btn')
    expect(primary.attributes('disabled')).toBeDefined()
    expect(primary.attributes('title')).toBeTruthy()
  })

  it('isNewLogMode=true 면 주 버튼은 숨김이 아니라 disabled (항상 보임)', () => {
    const w = mountSidebar({ isNewLogMode: true })
    const primary = w.find('.history-primary-btn')
    expect(primary.exists()).toBe(true)
    expect(primary.attributes('disabled')).toBeDefined()
  })

  it('showBatchPanel=true 면 주 버튼 disabled (숨김 아님)', () => {
    const w = mountSidebar({
      showBatchPanel: true,
      meetingLogs: [{ version: 'v1.0' }],
      selectedLog: 'v1.0',
    })
    const primary = w.find('.history-primary-btn')
    expect(primary.exists()).toBe(true)
    expect(primary.attributes('disabled')).toBeDefined()
  })

  it('대기 상태면 주 버튼 활성 + 클릭 → new-log emit', async () => {
    const w = mountSidebar({
      meetingLogs: [{ version: 'v1.0', date: '2026-05-27' }],
      selectedLog: 'v1.0',
    })
    const primary = w.find('.history-primary-btn')
    expect(primary.attributes('disabled')).toBeUndefined()
    await primary.trigger('click')
    expect(w.emitted('new-log')).toBeTruthy()
  })
})

describe('HistorySidebar — 헤더: ⋯ 보조 액션 메뉴', () => {
  it('⋯ 클릭 → Notion / 배치 항목이 제목+설명과 함께 노출', async () => {
    const w = mountSidebar()
    await openMenu(w)
    const notion = document.body.querySelector('.history-menu-item--notion')
    const batch = document.body.querySelector('.history-menu-item--batch')
    expect(notion).toBeTruthy()
    expect(batch).toBeTruthy()
    // 제목 + 설명(기존 ⓘ 가이드 문구) 동시 노출
    expect(notion.querySelector('.history-menu-title')).toBeTruthy()
    expect(notion.querySelector('.history-menu-desc').textContent.length).toBeGreaterThan(5)
    expect(batch.querySelector('.history-menu-desc').textContent.length).toBeGreaterThan(5)
  })

  it('Notion 항목 클릭 → open-notion emit', async () => {
    const w = mountSidebar()
    await openMenu(w)
    document.body.querySelector('.history-menu-item--notion').click()
    await w.vm.$nextTick()
    expect(w.emitted('open-notion')).toBeTruthy()
  })

  it('배치 항목 클릭 → toggle-batch emit', async () => {
    const w = mountSidebar()
    await openMenu(w)
    document.body.querySelector('.history-menu-item--batch').click()
    await w.vm.$nextTick()
    expect(w.emitted('toggle-batch')).toBeTruthy()
  })

  it('isAnyProcessing=true 면 메뉴 항목 disabled + 이유 문구', async () => {
    const w = mountSidebar({ isAnyProcessing: true })
    await openMenu(w)
    const items = document.body.querySelectorAll('.history-menu-item')
    expect(items.length).toBe(2)
    items.forEach((item) => {
      expect(item.disabled).toBe(true)
      expect(item.querySelector('.history-menu-desc').textContent).toContain('진행 중')
    })
  })

  it('showBatchPanel=true 면 배치 항목 active 표시', async () => {
    const w = mountSidebar({
      showBatchPanel: true,
      meetingLogs: [{ version: 'v1.0' }],
      selectedLog: 'v1.0',
    })
    await openMenu(w)
    const batch = document.body.querySelector('.history-menu-item--batch')
    expect(batch.classList.contains('history-menu-item--active')).toBe(true)
    expect(batch.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('HistorySidebar — 버전 리스트', () => {
  it('meetingLogs 만큼 .version-item 렌더', () => {
    const w = mountSidebar({
      meetingLogs: [{ version: 'v1.0' }, { version: 'v1.1' }],
      selectedLog: 'v1.1',
    })
    expect(w.findAll('.version-item').length).toBe(2)
  })

  it('selectedLog 항목에 --active 클래스', () => {
    const w = mountSidebar({
      meetingLogs: [{ version: 'v1.0' }, { version: 'v1.1' }],
      selectedLog: 'v1.1',
    })
    expect(w.findAll('.version-item--active').length).toBe(1)
  })

  it('isNewLogMode=true 면 draft placeholder(.version-item--draft) 렌더', () => {
    const w = mountSidebar({ isNewLogMode: true })
    expect(w.find('.version-item--draft').exists()).toBe(true)
    expect(w.text()).toContain('v1.1')  // nextVersion
  })

  it('로그 없고 신규 모드 아니면 "No logs found"', () => {
    const w = mountSidebar({ meetingLogs: [], isNewLogMode: false })
    expect(w.text()).toContain('No logs found')
  })

  it('isLoading=true 면 progress 표시 + 리스트 미렌더', () => {
    const w = mountSidebar({ isLoading: true, meetingLogs: [{ version: 'v1.0' }] })
    expect(w.find('.version-list-wrapper').exists()).toBe(false)
  })
})

describe('HistorySidebar — emits', () => {
  beforeEach(() => vi.clearAllMocks())

  it('버전 클릭 → select emit (version)', async () => {
    const w = mountSidebar({
      meetingLogs: [{ version: 'v1.0' }],
      selectedLog: '',
    })
    await w.find('.version-item').trigger('click')
    expect(w.emitted('select')).toBeTruthy()
    expect(w.emitted('select')[0]).toEqual(['v1.0'])
  })

  it('미리보기(Eye) 클릭 → preview emit (select 미발생)', async () => {
    const w = mountSidebar({
      meetingLogs: [{ version: 'v1.0' }],
      selectedLog: '',
    })
    await w.find('.preview-btn').trigger('click')
    expect(w.emitted('preview')).toBeTruthy()
    expect(w.emitted('preview')[0]).toEqual(['v1.0'])
    expect(w.emitted('select')).toBeFalsy()
  })
})
