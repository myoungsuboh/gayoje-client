import { describe, it, expect } from 'vitest'
import { isPrdError } from '@/utils/asyncJob'

// [2026-06] BE(post_meeting_pipeline_job)가 PRD 의 결정적 실패를 prd.mode='error' 로 강등해
// job 을 성공 반환하므로, FE 는 이 플래그를 표면화해야 한다(안 그러면 '완료+빈 PRD' 무음 누락).
describe('isPrdError', () => {
  it('prd.mode === "error" 면 true (CPS 는 성공이어도)', () => {
    const result = {
      cps: { mode: 'first_run', master_cps_id: 'doc_cps_master_x' },
      prd: { mode: 'error', diagnostic: { error: 'orphan/빈-merge', error_type: 'RuntimeError' } },
    }
    expect(isPrdError(result)).toBe(true)
  })

  it('정상 PRD mode 들은 false (first_run / incremental / no_changes)', () => {
    expect(isPrdError({ prd: { mode: 'first_run' } })).toBe(false)
    expect(isPrdError({ prd: { mode: 'incremental' } })).toBe(false)
    expect(isPrdError({ prd: { mode: 'no_changes' } })).toBe(false)
  })

  it('prd 누락 / null / undefined / 빈 객체에 안전 (false)', () => {
    expect(isPrdError(null)).toBe(false)
    expect(isPrdError(undefined)).toBe(false)
    expect(isPrdError({})).toBe(false)
    expect(isPrdError({ cps: { mode: 'first_run' } })).toBe(false)
    expect(isPrdError({ prd: null })).toBe(false)
  })
})
