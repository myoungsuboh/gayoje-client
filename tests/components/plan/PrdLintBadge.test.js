/**
 * PrdLintBadge.vue — PRD 충실도 배지 (2026-05-28 UX 개선).
 *
 * 검증:
 *  - issue.detail.target_section 으로 안내 탭 라벨 표시
 *  - '보러가기' 클릭 시 jump-to-section 이벤트로 section key 전파
 *  - target_section 없으면 '보러가기' 버튼 미노출
 *  - loading 상태 메시지
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'
import PrdLintBadge from '@/components/plan/PrdLintBadge.vue'

// jsdom navigator.language 는 'en' → i18n 마이그레이션 후 한국어 단언이 깨지지 않도록 ko 고정.
beforeEach(() => { i18n.global.locale.value = 'ko' })

const mountOpts = { global: { plugins: [i18n] } }

const REPORT_WITH_ERROR = {
  score: 0.8,
  summary: { errors: 1, warnings: 0, infos: 0, stories_found: 0, size_bytes: 800 },
  issues: [
    {
      code: 'PRD_NO_STORY',
      severity: 'error',
      message: 'Story 0개 — 기능 명세 없음',
      hint: "Epic & Story 탭에 '**[Story 1.1] 기능명**' 형식으로 각 기능을 작성. 예: ...",
      detail: { target_section: 'epic' },
    },
  ],
}

describe('PrdLintBadge', () => {
  it('loading 상태 메시지 표시', () => {
    const wrapper = mount(PrdLintBadge, { props: { loading: true }, ...mountOpts })
    expect(wrapper.text()).toContain('측정 중')
  })

  it('issue 의 target_section 으로 안내 탭 라벨 표시', () => {
    const wrapper = mount(PrdLintBadge, { props: { report: REPORT_WITH_ERROR }, ...mountOpts })
    // section tag 가 'Epic & Story 탭' 으로 표시
    expect(wrapper.text()).toContain('Epic & Story 탭')
    // 메시지 + hint 모두 표시 (이전엔 한 줄 ellipsis → 잘렸음)
    expect(wrapper.text()).toContain('Story 0개')
    expect(wrapper.text()).toContain('Epic & Story 탭에')
  })

  it("'보러가기' 클릭 시 jump-to-section 이벤트 emit", async () => {
    const wrapper = mount(PrdLintBadge, { props: { report: REPORT_WITH_ERROR }, ...mountOpts })
    const jumpBtn = wrapper.find('.top-issue__jump')
    expect(jumpBtn.exists()).toBe(true)
    await jumpBtn.trigger('click')
    const emits = wrapper.emitted('jump-to-section')
    expect(emits).toBeTruthy()
    expect(emits[0]).toEqual(['epic'])
  })

  it('target_section 없으면 보러가기 버튼 미노출', () => {
    const report = {
      score: 0.9,
      summary: { errors: 0, warnings: 1, infos: 0, stories_found: 1, size_bytes: 900 },
      issues: [
        {
          code: 'CUSTOM_RULE',
          severity: 'warning',
          message: 'x',
          hint: 'y',
          detail: {}, // target_section 없음
        },
      ],
    }
    const wrapper = mount(PrdLintBadge, { props: { report }, ...mountOpts })
    expect(wrapper.find('.top-issue__jump').exists()).toBe(false)
  })

  it('error 가 warning 보다 우선 — error 가 topIssue', () => {
    const report = {
      score: 0.7,
      summary: { errors: 1, warnings: 1, infos: 0, stories_found: 0, size_bytes: 800 },
      issues: [
        {
          code: 'PRD_NO_NFR',
          severity: 'warning',
          message: 'NFR 부재',
          hint: 'h1',
          detail: { target_section: 'nfr' },
        },
        {
          code: 'PRD_NO_STORY',
          severity: 'error',
          message: 'Story 0개',
          hint: 'h2',
          detail: { target_section: 'epic' },
        },
      ],
    }
    const wrapper = mount(PrdLintBadge, { props: { report }, ...mountOpts })
    // error 가 우선이므로 epic 탭으로 안내
    expect(wrapper.text()).toContain('Epic & Story 탭')
    expect(wrapper.text()).not.toContain('NFR 부재')
  })
})
