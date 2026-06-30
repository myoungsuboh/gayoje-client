/**
 * harness store에서 사용하는 순수 함수 모음.
 * Pinia store 안에 두면 테스트가 어려워서 별도 모듈로 추출.
 */

/**
 * lint 결과가 가짜/에러인지 판정.
 * - error 필드가 있거나
 * - scannedFiles=0이거나
 * - score 미확정인데 violations만 있는 환각 시그니처
 */
export const isFakeOrErrorResult = (data) => {
  const r = data?.result || {}
  if (r.error) return true
  if (r.scannedFiles === 0) return true
  if ((r.score === 0 || r.score === undefined) && r.rulesChecked > 0 && r.violations > 0) return true
  return false
}

/** lint cache key: projectName + githubUrl 조합 (공백 trim) */
export const buildLintCacheKey = (pn, gu) => `${pn || ''}|${(gu || '').trim()}`

/** Repo URL에서 역할(frontend/backend/database/mobile/infra/other) 추론 */
export const detectRepoRole = (url) => {
  const u = String(url || '').toLowerCase()
  if (/(frontend|front-end|web-?app|client|\bfe\b|next|vue|react|nuxt)/.test(u)) return 'frontend'
  if (/(backend|back-end|server|api|\bbe\b|spring|nest|fastify|django|rails)/.test(u)) return 'backend'
  if (/(database|schema|migration|prisma|flyway|liquibase|\bdb\b)/.test(u)) return 'database'
  if (/(mobile|android|ios|flutter|react-native|\bapp\b)/.test(u)) return 'mobile'
  if (/(infra|terraform|k8s|kubernetes|docker|deploy|cicd|cd-)/.test(u)) return 'infra'
  return 'other'
}

/**
 * lint API 응답을 화면 상태로 정규화.
 * 입력: BE LintResult (raw or wrapped in { result: {...} })
 * 출력: { ok: true, stats, cases } 또는 { ok: false, reason, message }
 *
 * [2026-05 schema 확장 — BE evidence-first hybrid 대응]
 *   - rule.evidence: 결정적/LLM 매칭의 file:line:snippet 인용 배열
 *   - rule.detection_method: 'deterministic' | 'llm' | 'fallback'
 *   옛 캐시 (필드 없음) 도 default 로 채워 안전하게 호환.
 *
 * BE 가 snake_case (`scanned_files`, `rules_checked`, `detection_method`) 와
 * 일부 camelCase (`scannedFiles` etc.) 를 혼용할 수 있어 양쪽 모두 흡수.
 */
export const normalizeLintResponse = (raw) => {
  const data = raw?.result || raw || {}

  if (data.error) {
    return { ok: false, reason: 'error', message: data.error }
  }
  // camelCase / snake_case 둘 다 흡수
  // 명시적으로 0 일 때만 'no_files' 로 reject (undefined/null 은 ok=true 유지 — 기존 의미 보존)
  if (data.scannedFiles === 0 || data.scanned_files === 0) {
    return { ok: false, reason: 'no_files', message: '코드 파일을 가져올 수 없습니다 (저장소 접근 불가).' }
  }
  const scannedFiles = data.scannedFiles ?? data.scanned_files ?? 0
  const rulesChecked = data.rulesChecked ?? data.rules_checked ?? 0

  // [Sprint1 1.2] 커버리지 정직화. 백엔드는 spec 토큰이 경로에 매칭되는 코드
  // 파일만 최대 N개 샘플링해 본문을 검사한다. totalCodeFiles=레포 전체 코드
  // 파일, sampledFiles=실제 본문을 가져와 검사한 수. 레거시 응답엔 두 필드가
  // 없으므로 scannedFiles 로 폴백(=전체를 다 본 것으로 보수적 가정 → 경고 안 띄움).
  const totalCodeFiles = data.totalCodeFiles ?? data.total_code_files ?? scannedFiles
  const sampledFiles = data.sampledFiles ?? data.sampled_files ?? scannedFiles
  const coverageTruncated =
    data.coverageTruncated ?? data.coverage_truncated ?? (sampledFiles < totalCodeFiles)

  return {
    ok: true,
    stats: {
      score: data.score ?? 0,
      scannedFiles,
      totalCodeFiles,
      sampledFiles,
      coverageTruncated,
      rulesChecked,
      violations: data.violations ?? 0,
    },
    cases: (data.cases || []).map((c, i) => ({
      id: i,
      title: c.title || `Case ${i + 1}`,
      convergence: c.convergence ?? 0,
      rules: (c.rules || []).map((r, j) => ({
        id: j + 1,
        rule: r.rule || r.id || `rule-${j + 1}`,
        description: r.description || '',
        applied: !!r.applied,
        // evidence: [{file, line, snippet, kind}] — BE 결정적 grep 매칭 결과
        evidence: Array.isArray(r.evidence)
          ? r.evidence.map((e) => ({
            file: String(e?.file || ''),
            line: Number.isFinite(e?.line) ? Number(e.line) : 0,
            snippet: String(e?.snippet || ''),
            kind: String(e?.kind || ''),
          })).filter((e) => e.file)
          : [],
        // detection_method: 'deterministic' | 'llm' | 'fallback'
        // BE 가 snake_case 로 보냄. 옛 응답은 'deterministic' default (적용된 항목은 옳음).
        detectionMethod:
          r.detection_method || r.detectionMethod || 'deterministic',
      })),
    })),
  }
}
