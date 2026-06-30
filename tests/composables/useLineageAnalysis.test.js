/**
 * useLineageAnalysis 검색/필터 통합 테스트.
 *
 * 모듈 레벨 state라서 vitest의 isolation은 동일 모듈 인스턴스를 공유.
 * 각 테스트 시작 시 직접 reset.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLineageAnalysis } from '@/composables/useLineageAnalysis'

const SAMPLE = {
  apis: [
    { id: 'api-1', name: '로그인 API', endpoint: 'POST /auth/login', implementations: [
      { filePath: 'src/auth/AuthController.ts', confidence: 'high',   repoUrl: 'https://github.com/x/be' },
      { filePath: 'src/auth/AuthService.ts',    confidence: 'medium', repoUrl: 'https://github.com/x/be' },
    ]},
    { id: 'api-2', name: '사용자 조회', endpoint: 'GET /users/:id', implementations: [
      { filePath: 'src/users/UserController.ts', confidence: 'low', repoUrl: 'https://github.com/x/be' },
    ]},
    { id: 'api-3', name: '파일 업로드', endpoint: 'POST /files', implementations: [] },
    { id: 'api-4', name: '결제', endpoint: 'POST /pay', implementations: [
      { filePath: 'PayService.ts', confidence: 'unverified', repoUrl: 'https://github.com/x/fe' },
    ]},
  ],
  aggregates: [], services: [], stories: [], missingImpl: [],
}

describe('useLineageAnalysis 검색/필터', () => {
  let api
  beforeEach(() => {
    setActivePinia(createPinia())
    api = useLineageAnalysis()
    api.lineageData.value = SAMPLE
    api.lineageActiveTab.value = 'apis'
    api.lineageSearch.value = ''
    api.lineageConfidenceFilter.value = 'all'
    api.lineageRepoFilter.value = ''
  })

  it('필터 없음 → 전체 노출', () => {
    expect(api.lineageItems.value).toHaveLength(4)
    expect(api.lineageItemsTotal.value).toBe(4)
  })

  it('이름 한글 검색', () => {
    api.lineageSearch.value = '로그인'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItems.value[0].id).toBe('api-1')
  })

  it('파일 경로 검색', () => {
    api.lineageSearch.value = 'PayService'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItems.value[0].id).toBe('api-4')
  })

  it('엔드포인트 검색', () => {
    api.lineageSearch.value = '/users/'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItems.value[0].id).toBe('api-2')
  })

  it('대소문자 무관', () => {
    api.lineageSearch.value = 'authservice'
    expect(api.lineageItems.value).toHaveLength(1)
  })

  it('confidence high 필터', () => {
    api.lineageConfidenceFilter.value = 'high'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItems.value[0].id).toBe('api-1')
  })

  it('confidence none 필터 — 매핑 없는 항목만', () => {
    api.lineageConfidenceFilter.value = 'none'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItems.value[0].id).toBe('api-3')
  })

  it('confidence unverified 필터', () => {
    api.lineageConfidenceFilter.value = 'unverified'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItems.value[0].id).toBe('api-4')
  })

  it('repo 필터', () => {
    api.lineageRepoFilter.value = 'https://github.com/x/fe'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItems.value[0].id).toBe('api-4')
  })

  it('여러 필터 AND 조합 — 검색 + confidence', () => {
    api.lineageSearch.value = '로그인'
    api.lineageConfidenceFilter.value = 'high'
    expect(api.lineageItems.value).toHaveLength(1)
  })

  it('AND 조합 — 매칭 결과 없음', () => {
    api.lineageSearch.value = '로그인'
    api.lineageConfidenceFilter.value = 'unverified'
    expect(api.lineageItems.value).toHaveLength(0)
  })

  it('lineageItemsTotal은 필터에 영향 안 받음', () => {
    api.lineageSearch.value = '로그인'
    expect(api.lineageItems.value).toHaveLength(1)
    expect(api.lineageItemsTotal.value).toBe(4)
  })
})

// [2026-05-21] 분석 진행률 + ETA + stage 추정 — elapsed 기반 순수 로직.
describe('useLineageAnalysis 진행률/stage (작업량 기반)', () => {
  let api
  beforeEach(() => {
    setActivePinia(createPinia())
    api = useLineageAnalysis()
    api.lineageElapsedSec.value = 0
    api.lineageJobStage.value = ''
  })

  it('단계 신호 전(stage=\'\') → stage 0, 진행률 작게 (elapsed 무관 8% 이하)', () => {
    expect(api.lineageCurrentStageIdx.value).toBe(0)
    expect(api.lineageProgressPct.value).toBe(2)
    api.lineageElapsedSec.value = 15
    expect(api.lineageProgressPct.value).toBeGreaterThan(2)
    expect(api.lineageProgressPct.value).toBeLessThanOrEqual(8)
  })

  it('진행바는 경과시간이 아니라 BE 단계로만 점프 — 100초여도 단계 없으면 8% 캡', () => {
    api.lineageElapsedSec.value = 100
    expect(api.lineageProgressPct.value).toBe(8)
  })

  it('lineage:fetch → stage 0, 12%', () => {
    api.lineageJobStage.value = 'lineage:fetch'
    expect(api.lineageCurrentStageIdx.value).toBe(0)
    expect(api.lineageProgressPct.value).toBe(12)
  })

  it('lineage:trees → stage 0(트리 수집), 38%', () => {
    api.lineageJobStage.value = 'lineage:trees'
    expect(api.lineageCurrentStageIdx.value).toBe(0)
    expect(api.lineageProgressPct.value).toBe(38)
  })

  it('lineage:match → stage 1(매핑), 75%', () => {
    api.lineageJobStage.value = 'lineage:match'
    expect(api.lineageCurrentStageIdx.value).toBe(1)
    expect(api.lineageProgressPct.value).toBe(75)
  })

  it('lineage:saving → stage 2(검증), 92%', () => {
    api.lineageJobStage.value = 'lineage:saving'
    expect(api.lineageCurrentStageIdx.value).toBe(2)
    expect(api.lineageProgressPct.value).toBe(92)
  })

  it('etaText 는 카운트다운이 아니라 경과 시간 보조 표시', () => {
    api.lineageElapsedSec.value = 90
    expect(api.lineageEtaText.value).toBe('경과 1분 30초')
    api.lineageElapsedSec.value = 30
    expect(api.lineageEtaText.value).toBe('경과 30초')
  })
})
