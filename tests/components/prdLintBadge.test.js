/**
 * PrdLintBadge — 'AI로 보완하기' 진입점 (하이브리드 자동 보완) 회귀 가드.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'
import PrdLintBadge from '@/components/plan/PrdLintBadge.vue'

// jsdom navigator.language 는 'en' → i18n 마이그레이션 후 한국어 단언이 깨지지 않도록 ko 고정.
beforeEach(() => { i18n.global.locale.value = 'ko' })

const mountOpts = { global: { plugins: [i18n] } }

// [2026-06-06] AI 보완 가능한 이슈(PRD_NO_ERROR_CASE 등 — MANUAL_CODES 미포함)라야
// '보완하기' 버튼이 노출된다(#230 분류).
const reportWithIssues = {
  score: 0.8,
  summary: { errors: 1, warnings: 0, infos: 0, stories_found: 2 },
  issues: [
    {
      code: 'PRD_NO_ERROR_CASE',
      severity: 'error',
      message: '에러 응답 명세 부족',
      hint: 'Epic & Story 탭에 에러 케이스를 ...',
      detail: { target_section: 'epic' },
    },
  ],
}

// 직접 작성만 필요한(AI 보완 불가) 이슈만 있는 리포트 — 버튼 숨김 + 안내 노출.
// PRD_NO_NFR(성능 수치)은 근거가 없으면 autofix 가 needs_input 질문으로만 넘기는 manual 항목.
const reportManualOnly = {
  score: 0.6,
  summary: { errors: 0, warnings: 1, infos: 0, stories_found: 2 },
  issues: [
    {
      code: 'PRD_NO_NFR',
      severity: 'warning',
      message: 'NFR(성능/보안) 명시 없음',
      hint: 'NFR 탭에 응답시간·가용성 등을 적어주세요.',
      detail: { target_section: 'nfr' },
    },
  ],
}

// PRD_NO_STORY 는 BE autofix 가 비어 있는 Story 섹션을 채우는 autofixable 코드
// (prd_autofix.md 규칙 2-(a) + harness-server test_autofix_fills_stories). → 보완 버튼 노출.
const reportNoStory = {
  score: 0.7,
  summary: { errors: 1, warnings: 0, infos: 0, stories_found: 0 },
  issues: [
    {
      code: 'PRD_NO_STORY',
      severity: 'error',
      message: 'Story 0개 — 기능 명세 없음',
      hint: 'Epic & Story 탭에 ...',
      detail: { target_section: 'epic' },
    },
  ],
}

const cleanReport = { score: 1.0, summary: { errors: 0, warnings: 0, infos: 0 }, issues: [] }

describe('PrdLintBadge — AI 보완 진입점', () => {
  it('issue 가 있으면 "AI로 보완하기" 버튼을 노출한다', () => {
    const w = mount(PrdLintBadge, { props: { report: reportWithIssues }, ...mountOpts })
    expect(w.find('.ai-fix-btn').exists()).toBe(true)
    expect(w.find('.ai-fix-btn').text()).toContain('AI로 보완하기')
  })

  it('버튼 클릭 시 ai-fix 이벤트를 emit 한다', async () => {
    const w = mount(PrdLintBadge, { props: { report: reportWithIssues }, ...mountOpts })
    await w.find('.ai-fix-btn').trigger('click')
    expect(w.emitted('ai-fix')).toBeTruthy()
  })

  it('issue 가 없으면 버튼을 숨긴다', () => {
    const w = mount(PrdLintBadge, { props: { report: cleanReport }, ...mountOpts })
    expect(w.find('.ai-fix-btn').exists()).toBe(false)
  })

  it('직접작성 전용(manual) 이슈만 있으면 버튼 숨김 + 직접작성 안내 노출', () => {
    const w = mount(PrdLintBadge, { props: { report: reportManualOnly }, ...mountOpts })
    expect(w.find('.ai-fix-btn').exists()).toBe(false)
    expect(w.find('.manual-notice').exists()).toBe(true)
  })

  it('PRD_NO_STORY(빈 Story)는 autofixable — 보완 버튼을 노출한다', () => {
    const w = mount(PrdLintBadge, { props: { report: reportNoStory }, ...mountOpts })
    expect(w.find('.ai-fix-btn').exists()).toBe(true)
  })

  it('fixing=true 면 버튼이 비활성 + "AI 보완 중…" 표기', () => {
    const w = mount(PrdLintBadge, { props: { report: reportWithIssues, fixing: true }, ...mountOpts })
    const btn = w.find('.ai-fix-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('AI 보완 중')
  })

  it('기존 "보러가기"(jump-to-section)도 그대로 동작', async () => {
    const w = mount(PrdLintBadge, { props: { report: reportWithIssues }, ...mountOpts })
    await w.find('.top-issue__jump').trigger('click')
    expect(w.emitted('jump-to-section')?.[0]).toEqual(['epic'])
  })
})

// ─── [2026-06-10] needs_input CTA 전환 — 반복 클릭 루프 차단 ───────────

describe('PrdLintBadge — needs_input 인터뷰 CTA 전환', () => {
  it('needsInputCount>0 이면 보완 버튼 대신 인터뷰 CTA 를 노출한다', async () => {
    const w = mount(PrdLintBadge, {
      props: { report: reportWithIssues, needsInputCount: 2 },
      ...mountOpts,
    })
    const btn = w.find('.ai-fix-btn--interview')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('인터뷰로 채우기')
    // 일반 보완 버튼은 숨김 — 재보완해도 같은 질문이 돌아오기 때문.
    expect(w.findAll('.ai-fix-btn').length).toBe(1)

    await btn.trigger('click')
    expect(w.emitted('go-interview')).toBeTruthy()
    expect(w.emitted('ai-fix')).toBeFalsy()
  })

  it('보완 진행 중(fixing)에는 인터뷰 CTA 대신 진행 표시를 유지한다', () => {
    const w = mount(PrdLintBadge, {
      props: { report: reportWithIssues, needsInputCount: 2, fixing: true },
      ...mountOpts,
    })
    expect(w.find('.ai-fix-btn--interview').exists()).toBe(false)
    expect(w.find('.ai-fix-btn').text()).toContain('AI 보완 중')
  })

  it('needsInputCount=0(기본)이면 기존 동작 그대로', () => {
    const w = mount(PrdLintBadge, { props: { report: reportWithIssues }, ...mountOpts })
    expect(w.find('.ai-fix-btn--interview').exists()).toBe(false)
    expect(w.find('.ai-fix-btn').text()).toContain('AI로 보완하기')
  })
})

// ─── [2026-06-10 ①-3] 95%+ & INFO 만 — '충분해요' 톤 전환 ─────────────

describe('PrdLintBadge — 충분(sufficient) 상태', () => {
  const reportSufficient = {
    score: 0.96,
    summary: { errors: 0, warnings: 0, infos: 2, stories_found: 5 },
    issues: [
      { code: 'STORY_NO_VALIDATION', severity: 'info', message: 'Story-01.2: 검증 규칙 없음',
        hint: '...', detail: { target_section: 'epic' } },
    ],
  }

  it('95%+ & error/warning 0 이면 충분 태그 + 안심 안내, 시급 이슈 박스 숨김', () => {
    const w = mount(PrdLintBadge, { props: { report: reportSufficient }, ...mountOpts })
    expect(w.find('.sufficient-tag').exists()).toBe(true)
    expect(w.find('.sufficient-note').text()).toContain('선택 보강')
    expect(w.find('.top-issue-row').exists()).toBe(false)
    // 더 올리고 싶은 사용자 경로(보완 버튼)는 유지.
    expect(w.find('.ai-fix-btn').exists()).toBe(true)
  })

  it('warning 이 남아 있으면 95%+ 라도 충분 처리하지 않는다', () => {
    const report = {
      score: 0.95,
      summary: { errors: 0, warnings: 1, infos: 0, stories_found: 5 },
      issues: [{ code: 'PRD_NO_AUTH', severity: 'warning', message: '인증 명시 없음',
                 hint: '...', detail: { target_section: 'nfr' } }],
    }
    const w = mount(PrdLintBadge, { props: { report }, ...mountOpts })
    expect(w.find('.sufficient-tag').exists()).toBe(false)
    expect(w.find('.top-issue-row').exists()).toBe(true)
  })

  it('점수 95% 미만이면 기존 동작 그대로', () => {
    const w = mount(PrdLintBadge, { props: { report: reportWithIssues }, ...mountOpts })
    expect(w.find('.sufficient-tag').exists()).toBe(false)
  })
})
