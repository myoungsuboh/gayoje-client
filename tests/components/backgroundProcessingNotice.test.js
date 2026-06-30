/**
 * BackgroundProcessingNotice — 단일 작업 진행 표시 + 지연 감지.
 *
 * 검증:
 * - stage sub-label + step(N/6) + 진행 바
 * - 3분 초과: "오래 걸리고 있어요" 경고
 * - 8분 초과: "응답하지 않을 수 있어요" stale 경고
 *
 * [2026-06] 단일 작업 stage 라벨/안내문이 i18n(plan.stage.* / plan.bg_notice.*)으로
 * 전환됨 → 실제 i18n 플러그인(ko)을 mount 에 주입. toContain 은 라벨 일부 substring 매칭.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import BackgroundProcessingNotice from '@/components/plan/BackgroundProcessingNotice.vue'
import i18n from '@/plugins/i18n'

const mountNotice = (props) => mount(BackgroundProcessingNotice, {
  props,
  global: { plugins: [i18n] },
})

const singleJob = (over = {}) => [{
  taskId: 't1', kind: 'postMeeting', stage: 'cps_extract',
  startedAt: Date.now(), ...over,
}]

beforeEach(() => {
  vi.useFakeTimers()
  i18n.global.locale.value = 'ko'
})
afterEach(() => vi.useRealTimers())

describe('BackgroundProcessingNotice — 단일 작업', () => {
  it('stage 라벨 + step(N/6) + 진행 바를 렌더한다', () => {
    const w = mountNotice({ activeJobs: singleJob({ stage: 'cps_impact' }) })
    expect(w.text()).toContain('영향 범위 계산 중')
    expect(w.text()).toContain('2 / 6')
    expect(w.find('.bg-proc-notice__bar-fill').exists()).toBe(true)
  })

  it('3분 초과 시 지연 경고를 노출한다', async () => {
    const w = mountNotice({ activeJobs: singleJob({ startedAt: Date.now() - 4 * 60 * 1000 }) })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(w.text()).toContain('예상보다 오래 걸리고')
    expect(w.find('.bg-proc-notice__alert--stale').exists()).toBe(false)
  })

  it('8분 초과 시 stale(응답 없음) 경고로 전환한다', async () => {
    const w = mountNotice({ activeJobs: singleJob({ startedAt: Date.now() - 9 * 60 * 1000 }) })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(w.find('.bg-proc-notice__alert--stale').exists()).toBe(true)
    expect(w.text()).toContain('응답하지 않을 수 있어요')
  })

  it('막 시작한 작업엔 경고가 없다', () => {
    const w = mountNotice({ activeJobs: singleJob() })
    expect(w.find('.bg-proc-notice__alert').exists()).toBe(false)
  })
})
