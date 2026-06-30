import { describe, it, expect } from 'vitest'
import {
  isFakeOrErrorResult,
  buildLintCacheKey,
  detectRepoRole,
  normalizeLintResponse,
} from '@/utils/harnessHelpers'

describe('isFakeOrErrorResult', () => {
  it('error 필드가 있으면 true', () => {
    expect(isFakeOrErrorResult({ result: { error: 'rate limit' } })).toBe(true)
  })

  it('scannedFiles=0 이면 true', () => {
    expect(isFakeOrErrorResult({ result: { scannedFiles: 0 } })).toBe(true)
  })

  it('환각 시그니처: score 0/undef + rulesChecked>0 + violations>0 → true', () => {
    expect(isFakeOrErrorResult({ result: { score: 0, rulesChecked: 5, violations: 3 } })).toBe(true)
    expect(isFakeOrErrorResult({ result: { rulesChecked: 5, violations: 3 } })).toBe(true)
  })

  it('정상 결과는 false', () => {
    expect(isFakeOrErrorResult({ result: { score: 80, scannedFiles: 50, rulesChecked: 10, violations: 2 } })).toBe(false)
  })

  it('null/undefined/빈 객체 안전', () => {
    expect(isFakeOrErrorResult(null)).toBe(false)
    expect(isFakeOrErrorResult(undefined)).toBe(false)
    expect(isFakeOrErrorResult({})).toBe(false)
  })

  it('score>0이면 환각 패턴이어도 정상으로 인정', () => {
    expect(isFakeOrErrorResult({ result: { score: 50, rulesChecked: 5, violations: 3 } })).toBe(false)
  })
})

describe('buildLintCacheKey', () => {
  it('정상 조합', () => {
    expect(buildLintCacheKey('p1', 'https://github.com/a/b')).toBe('p1|https://github.com/a/b')
  })

  it('URL 공백 trim', () => {
    expect(buildLintCacheKey('p1', '  url  ')).toBe('p1|url')
  })

  it('null/undefined 안전 처리', () => {
    expect(buildLintCacheKey(null, null)).toBe('|')
    expect(buildLintCacheKey(undefined, undefined)).toBe('|')
  })

  it('동일 입력은 동일 키 (캐시 일관성)', () => {
    expect(buildLintCacheKey('a', 'b')).toBe(buildLintCacheKey('a', 'b'))
  })
})

describe('detectRepoRole', () => {
  it.each([
    ['https://github.com/a/awesome-frontend', 'frontend'],
    ['https://github.com/a/web-app', 'frontend'],
    ['https://github.com/a/my-vue-store', 'frontend'],
    // 'react-app' — react가 frontend 패턴에 먼저 잡힘 (의도된 동작)
    ['https://github.com/a/my-react-native-app', 'frontend'],
    ['https://github.com/a/server-api', 'backend'],
    ['https://github.com/a/spring-boot-rest', 'backend'],
    ['https://github.com/a/db-migration', 'database'],
    ['https://github.com/a/prisma-schema', 'database'],
    ['https://github.com/a/android-kotlin', 'mobile'],
    ['https://github.com/a/ios-swiftui', 'mobile'],
    ['https://github.com/a/k8s-infra', 'infra'],
    ['https://github.com/a/terraform-aws', 'infra'],
    ['https://github.com/a/docker-compose', 'infra'],
    ['https://github.com/a/ml-research', 'other'],
  ])('%s → %s', (url, expected) => {
    expect(detectRepoRole(url)).toBe(expected)
  })

  it('대소문자 무관', () => {
    expect(detectRepoRole('https://github.com/a/FRONTEND')).toBe('frontend')
  })

  it('null/undefined → other', () => {
    expect(detectRepoRole(null)).toBe('other')
    expect(detectRepoRole(undefined)).toBe('other')
    expect(detectRepoRole('')).toBe('other')
  })
})

describe('normalizeLintResponse', () => {
  it('정상 응답 정규화', () => {
    const raw = {
      result: {
        score: 75,
        scannedFiles: 100,
        rulesChecked: 20,
        violations: 5,
        cases: [
          {
            title: 'SPACK',
            convergence: 80,
            rules: [
              { rule: 'SPACK-01', description: 'NFR 정의', applied: true },
            ],
          },
        ],
      },
    }
    const result = normalizeLintResponse(raw)
    expect(result.ok).toBe(true)
    // [Sprint1 1.2] 새 커버리지 필드는 응답에 없으면 scannedFiles 로 폴백(전체=샘플 → 잘림 없음).
    expect(result.stats).toEqual({
      score: 75, scannedFiles: 100, rulesChecked: 20, violations: 5,
      totalCodeFiles: 100, sampledFiles: 100, coverageTruncated: false,
    })
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0]).toMatchObject({ id: 0, title: 'SPACK', convergence: 80 })
    expect(result.cases[0].rules[0]).toMatchObject({ id: 1, rule: 'SPACK-01', applied: true })
  })

  it('error 필드 → ok:false + reason:error', () => {
    const r = normalizeLintResponse({ result: { error: 'rate limit' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('error')
    expect(r.message).toBe('rate limit')
  })

  it('scannedFiles=0 → ok:false + reason:no_files', () => {
    const r = normalizeLintResponse({ result: { scannedFiles: 0 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no_files')
  })

  it('[Sprint1 1.2] BE snake_case 커버리지 필드 흡수 + 잘림 감지', () => {
    const r = normalizeLintResponse({
      result: {
        score: 60, scanned_files: 320, rules_checked: 10, violations: 4,
        total_code_files: 320, sampled_files: 40, coverage_truncated: true,
        cases: [],
      },
    })
    expect(r.ok).toBe(true)
    expect(r.stats.totalCodeFiles).toBe(320)
    expect(r.stats.sampledFiles).toBe(40)
    expect(r.stats.coverageTruncated).toBe(true)
  })

  it('wrapped 없는 raw 응답도 처리', () => {
    const r = normalizeLintResponse({ score: 50, scannedFiles: 10, rulesChecked: 5, violations: 1, cases: [] })
    expect(r.ok).toBe(true)
    expect(r.stats.score).toBe(50)
  })

  it('cases 누락 시 빈 배열', () => {
    const r = normalizeLintResponse({ result: { score: 50, scannedFiles: 10, rulesChecked: 5, violations: 0 } })
    expect(r.cases).toEqual([])
  })

  it('rule 필드 fallback (rule → id → rule-N)', () => {
    const r = normalizeLintResponse({
      result: {
        score: 50, scannedFiles: 10, rulesChecked: 5, violations: 0,
        cases: [{ rules: [{}, { id: 'R-X' }, { rule: 'R-Y' }] }],
      },
    })
    expect(r.cases[0].rules.map(r => r.rule)).toEqual(['rule-1', 'R-X', 'R-Y'])
  })

  it('null/undefined 안전 처리', () => {
    const r1 = normalizeLintResponse(null)
    const r2 = normalizeLintResponse(undefined)
    expect(r1.ok).toBe(true) // 빈 응답도 형식적으론 ok (empty stats)
    expect(r1.stats.score).toBe(0)
    expect(r2.ok).toBe(true)
  })

  // ─── 2026-05 schema 확장 — evidence + detection_method 보존 ────────

  it('BE evidence-first hybrid 응답: evidence + detection_method 보존', () => {
    const r = normalizeLintResponse({
      result: {
        score: 75,
        scannedFiles: 40,
        rulesChecked: 10,
        violations: 2,
        cases: [{
          title: 'SPACK 준수율',
          convergence: 80,
          rules: [
            {
              rule: 'api:POST /tickets',
              description: '환불',
              applied: true,
              evidence: [
                { file: 'src/api/refund.py', line: 42, snippet: "@router.post('/tickets')", kind: 'endpoint' },
              ],
              detection_method: 'deterministic',
            },
            {
              rule: 'api:POST /missing',
              description: 'fallback case',
              applied: false,
              evidence: [],
              detection_method: 'fallback',
            },
          ],
        }],
      },
    })
    expect(r.ok).toBe(true)
    const [rule1, rule2] = r.cases[0].rules
    expect(rule1.evidence).toHaveLength(1)
    expect(rule1.evidence[0].file).toBe('src/api/refund.py')
    expect(rule1.evidence[0].line).toBe(42)
    expect(rule1.evidence[0].kind).toBe('endpoint')
    expect(rule1.detectionMethod).toBe('deterministic')
    expect(rule2.evidence).toEqual([])
    expect(rule2.detectionMethod).toBe('fallback')
  })

  it('옛 응답 (evidence/detection_method 없음): default 채움', () => {
    const r = normalizeLintResponse({
      result: {
        score: 50, scannedFiles: 5, rulesChecked: 1, violations: 0,
        cases: [{ rules: [{ rule: 'r', description: 'd', applied: true }] }],
      },
    })
    const rule = r.cases[0].rules[0]
    expect(rule.evidence).toEqual([])
    // default 'deterministic' — applied=true 인 옛 항목은 모두 결정적이었다고 간주
    expect(rule.detectionMethod).toBe('deterministic')
  })

  it('evidence 안의 file 누락 항목 필터링', () => {
    const r = normalizeLintResponse({
      result: {
        score: 50, scannedFiles: 5, rulesChecked: 1, violations: 0,
        cases: [{ rules: [{
          rule: 'r', description: 'd', applied: true,
          evidence: [
            { file: 'a.py', line: 1, snippet: 'x', kind: 'endpoint' },
            { line: 2, snippet: 'noisy' },   // file 누락 → drop
            null,                            // 비-객체 → drop
            { file: 'b.py', line: 'not-a-number', snippet: 'y' },  // line 비숫자 → 0 으로 정규화
          ],
        }] }],
      },
    })
    const evs = r.cases[0].rules[0].evidence
    expect(evs).toHaveLength(2)
    expect(evs[0]).toEqual({ file: 'a.py', line: 1, snippet: 'x', kind: 'endpoint' })
    expect(evs[1].file).toBe('b.py')
    expect(evs[1].line).toBe(0)
  })

  it('snake_case scanned_files / rules_checked 도 흡수', () => {
    const r = normalizeLintResponse({
      result: { score: 88, scanned_files: 12, rules_checked: 4, violations: 1, cases: [] },
    })
    expect(r.stats.scannedFiles).toBe(12)
    expect(r.stats.rulesChecked).toBe(4)
  })
})
