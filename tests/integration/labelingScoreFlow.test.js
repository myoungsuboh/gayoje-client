/**
 * 통합 검증: 라벨 등록 → Precision/Recall/F1 점수 변화
 *
 * 시나리오 (deliverables.vue의 lineageQualityCurrent computed와 동일 로직):
 *   1) lineage 결과(actual)는 고정
 *   2) truth 0건 → quality = null (라벨 없으면 평가 불가)
 *   3) 정답을 정확히 맞게 등록 → P=R=F1=1.0
 *   4) 정답에 누락(FN) 추가 → recall ↓
 *   5) actual에는 있는데 정답엔 없는 잡음(FP) 시나리오 → precision ↓
 *   6) 라벨 삭제 → 다시 평가 대상 0개 → null
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateLineage } from '@/utils/lineageQuality'

// deliverables.vue의 매핑과 동일
const TAB_TO_ITEM_TYPE = { apis: 'api', services: 'service', aggregates: 'aggregate', stories: 'story' }

// AI가 분석한 lineage 결과 (고정 fixture)
const lineageData = {
  apis: [
    {
      id: 'api-001',
      name: 'POST /auth/login',
      type: 'api',
      implementations: [
        { filePath: 'src/auth/AuthController.ts', confidence: 'high' },
        { filePath: 'src/auth/AuthService.ts',    confidence: 'medium' },
      ],
    },
    {
      id: 'api-002',
      name: 'GET /users/:id',
      type: 'api',
      implementations: [
        { filePath: 'src/users/UserController.ts', confidence: 'high' },
      ],
    },
  ],
}

// 라벨 캐시 시뮬레이션 (store.truthByType에 해당)
let truthByType
beforeEach(() => {
  truthByType = { api: new Map(), service: new Map(), aggregate: new Map(), story: new Map() }
})

// deliverables.vue의 lineageQualityCurrent computed를 그대로 재현
const computeQuality = (activeTab) => {
  const t = TAB_TO_ITEM_TYPE[activeTab]
  if (!t) return null
  const items = lineageData[activeTab] || []
  const truthMap = truthByType[t]
  if (!truthMap || truthMap.size === 0) return null
  const truth = Array.from(truthMap.entries()).map(([id, expectedFiles]) => ({ id, expectedFiles }))
  return evaluateLineage(items, truth, { mode: 'endsWith' })
}

describe('라벨 등록 → 점수 변화 (사용성 검증)', () => {
  it('1단계: 라벨 0건 → quality = null', () => {
    const q = computeQuality('apis')
    expect(q).toBeNull()
  })

  it('2단계: 정답을 actual과 정확히 동일하게 등록 → 만점', () => {
    truthByType.api.set('api-001', ['src/auth/AuthController.ts', 'src/auth/AuthService.ts'])
    truthByType.api.set('api-002', ['src/users/UserController.ts'])
    const q = computeQuality('apis')

    expect(q).not.toBeNull()
    expect(q.coverage).toEqual({ labeled: 2, total: 2 })
    expect(q.macro.precision).toBe(1)
    expect(q.macro.recall).toBe(1)
    expect(q.macro.f1).toBe(1)
    expect(q.micro.tp).toBe(3)
    expect(q.micro.fp).toBe(0)
    expect(q.micro.fn).toBe(0)
  })

  it('3단계: 정답에 누락(FN) 추가 → recall만 떨어지고 precision은 유지', () => {
    // api-001: 실제 정답은 3개인데 AI는 2개만 매칭 → FN=1
    truthByType.api.set('api-001', [
      'src/auth/AuthController.ts',
      'src/auth/AuthService.ts',
      'src/auth/AuthRepository.ts', // ← AI가 놓친 파일
    ])
    const q = computeQuality('apis')

    expect(q.micro.tp).toBe(2)
    expect(q.micro.fp).toBe(0)
    expect(q.micro.fn).toBe(1)
    expect(q.micro.precision).toBe(1)            // 매칭된 건 모두 정답
    expect(q.micro.recall).toBeCloseTo(2 / 3, 5) // 0.667
    expect(q.micro.f1).toBeCloseTo(0.8, 5)
  })

  it('4단계: 정답이 짧아지면(FP) precision 떨어지고 recall은 유지', () => {
    // api-001: 정답은 1개인데 AI가 2개를 매칭 → FP=1
    truthByType.api.set('api-001', ['src/auth/AuthController.ts'])
    const q = computeQuality('apis')

    expect(q.micro.tp).toBe(1)
    expect(q.micro.fp).toBe(1)
    expect(q.micro.fn).toBe(0)
    expect(q.micro.precision).toBeCloseTo(0.5, 5)
    expect(q.micro.recall).toBe(1)
    expect(q.micro.f1).toBeCloseTo(2 / 3, 5)
  })

  it('5단계: endsWith 모드 — basename만으로도 매칭됨', () => {
    // 정답은 짧은 경로지만 actual은 긴 경로
    truthByType.api.set('api-001', ['AuthController.ts', 'AuthService.ts'])
    const q = computeQuality('apis')

    expect(q.micro.tp).toBe(2)
    expect(q.micro.fp).toBe(0)
    expect(q.micro.precision).toBe(1)
  })

  it('6단계: 라벨 삭제(빈 Map) → quality = null로 복귀', () => {
    truthByType.api.set('api-001', ['src/auth/AuthController.ts'])
    expect(computeQuality('apis')).not.toBeNull()

    truthByType.api.delete('api-001')
    expect(computeQuality('apis')).toBeNull()
  })

  it('7단계: 부분 라벨 — 라벨 있는 산출물만 평가 대상에 포함', () => {
    // api-001만 라벨 등록, api-002는 미라벨 → coverage = 1/2
    truthByType.api.set('api-001', ['src/auth/AuthController.ts', 'src/auth/AuthService.ts'])
    const q = computeQuality('apis')

    expect(q.coverage).toEqual({ labeled: 1, total: 2 })
    expect(q.perItem).toHaveLength(1)
    expect(q.perItem[0].id).toBe('api-001')
  })
})
