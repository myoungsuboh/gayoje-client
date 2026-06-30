// GitHub API 클라이언트 — Public repo 비인증 조회 (60req/hr 제한)
//
// Deliverables 화면의 Repo 카드 풍부화에 사용.
// 모든 함수는 { ok, data, error } 형태로 반환 (실패해도 throw 안 함).

import i18n from '@/plugins/i18n'
// 비컴포넌트(util)에서 번역 — axios.js · asyncJob.js 와 동일 패턴.
const t = (key, params) => i18n.global.t(key, params)

const GH_API = 'https://api.github.com'

const ghHeaders = {
  Accept: 'application/vnd.github.v3+json',
}

// ─── URL 파싱 ────────────────────────────────────────────────
export const parseGithubUrl = (url) => {
  try {
    const cleaned = String(url || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\.git$/i, '')
    if (!cleaned) return null
    const withProtocol = cleaned.startsWith('http') ? cleaned : `https://${cleaned}`
    const u = new URL(withProtocol)
    if (!u.hostname.includes('github.com')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') }
  } catch {
    return null
  }
}

/**
 * Lint evidence 의 file:line 을 GitHub blob 페이지 URL 로 변환.
 *
 * GitHub 은 `HEAD` 참조가 default branch 로 자동 resolve 됨 → 운영에서 default
 * branch 가 master 든 main 이든 동일하게 동작. branch 정보가 응답에 없어 별도
 * fetch 비용을 피하기 위해 'HEAD' 고정.
 *
 * Args:
 *   repoUrl: 'https://github.com/owner/repo' (or owner/repo). 파싱 실패 시 null.
 *   file:    'src/api/refund.py' (leading slash 없어도 OK)
 *   line:    1-based 라인 번호. 0 이거나 falsy 면 #L 앵커 생략.
 *
 * Returns: 'https://github.com/{owner}/{repo}/blob/HEAD/{file}#L{line}' 또는 null.
 */
export const buildGithubBlobLink = (repoUrl, file, line = 0) => {
  const parsed = parseGithubUrl(repoUrl)
  if (!parsed || !file) return null
  const cleanFile = String(file).replace(/^\/+/, '')
  const encodedFile = cleanFile
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  const lineNum = Number(line) || 0
  const anchor = lineNum > 0 ? `#L${lineNum}` : ''
  return `https://github.com/${parsed.owner}/${parsed.repo}/blob/HEAD/${encodedFile}${anchor}`
}

// ─── 단일 fetch 헬퍼 ────────────────────────────────────────
const ghFetch = async (path, { signal } = {}) => {
  try {
    const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders, signal })
    if (!res.ok) {
      return { ok: false, status: res.status, error: `GitHub API ${res.status}` }
    }
    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message || 'fetch failed' }
  }
}

// ─── 1. 기본 메타 (default_branch, pushed_at, ...) ─────────
export const fetchRepoMeta = (owner, repo) =>
  ghFetch(`/repos/${owner}/${repo}`)

// ─── 2. 언어 분포 (bytes 단위) ──────────────────────────────
export const fetchLanguages = (owner, repo) =>
  ghFetch(`/repos/${owner}/${repo}/languages`)

// ─── 3. 기여자 (top N) ──────────────────────────────────────
export const fetchContributors = (owner, repo, perPage = 10) =>
  ghFetch(`/repos/${owner}/${repo}/contributors?per_page=${perPage}`)

// ─── 4. 커밋 (heatmap + total count) ────────────────────────
export const fetchCommits = (owner, repo, branch = 'main', perPage = 100) =>
  ghFetch(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}`)

// ─── 5. README (raw markdown) ───────────────────────────────
export const fetchReadme = async (owner, repo) => {
  // GitHub readme API는 base64 인코딩된 content 반환
  const r = await ghFetch(`/repos/${owner}/${repo}/readme`)
  if (!r.ok) return r
  try {
    const binary = atob((r.data.content || '').replace(/\n/g, ''))
    // UTF-8 디코딩 (한국어/이모지 surrogate pair 안전)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const utf8 = new TextDecoder('utf-8').decode(bytes)
    return { ok: true, data: { content: utf8, name: r.data.name } }
  } catch (err) {
    return { ok: false, error: 'README decode failed' }
  }
}

// ─── 6. Tree (recursive, file count + LOC 추정) ─────────────
export const fetchTreeStats = async (owner, repo, branch = 'main') => {
  const r = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
  if (!r.ok) return r
  const tree = Array.isArray(r.data.tree) ? r.data.tree : []
  const files = tree.filter((t) => t.type === 'blob')
  const totalBytes = files.reduce((acc, t) => acc + (t.size || 0), 0)
  // LOC 추정: 텍스트 기준 평균 1줄=40바이트 가정
  const estimatedLoc = Math.round(totalBytes / 40)
  return {
    ok: true,
    data: {
      fileCount: files.length,
      totalBytes,
      estimatedLoc,
      truncated: !!r.data.truncated,
    },
  }
}

// ─── 일괄 enrichment ────────────────────────────────────────
// 한 repo의 모든 메타를 병렬로 가져옴. 일부 실패는 부분 결과로 반환.
export const enrichRepo = async (url) => {
  const parsed = parseGithubUrl(url)
  if (!parsed) {
    return { ok: false, error: 'invalid GitHub URL', url }
  }
  const { owner, repo } = parsed

  // 1단계: 기본 메타 먼저 (default_branch 알아야 commits/tree 가능)
  const metaRes = await fetchRepoMeta(owner, repo)
  if (!metaRes.ok) {
    return { ok: false, error: metaRes.error, status: metaRes.status, url, owner, repo }
  }
  const meta = metaRes.data
  const branch = meta.default_branch || 'main'

  // 2단계: 나머지 5개를 병렬 (한 개 실패해도 나머지는 살림)
  const [langRes, contribRes, commitsRes, readmeRes, treeRes] = await Promise.all([
    fetchLanguages(owner, repo),
    fetchContributors(owner, repo, 10),
    fetchCommits(owner, repo, branch, 100),
    fetchReadme(owner, repo),
    fetchTreeStats(owner, repo, branch),
  ])

  return {
    ok: true,
    url,
    owner,
    repo,
    branch,
    meta: {
      description: meta.description || '',
      defaultBranch: branch,
      pushedAt: meta.pushed_at || null,
      stargazers: meta.stargazers_count || 0,
      forks: meta.forks_count || 0,
      openIssues: meta.open_issues_count || 0,
      license: meta.license?.spdx_id || null,
      visibility: meta.visibility || 'public',
    },
    languages: langRes.ok ? langRes.data : {},
    contributors: contribRes.ok
      ? (contribRes.data || []).map((c) => ({
          login: c.login,
          avatarUrl: c.avatar_url,
          contributions: c.contributions || 0,
        }))
      : [],
    commits: commitsRes.ok
      ? (commitsRes.data || []).map((c) => ({
          sha: c.sha?.slice(0, 7),
          message: (c.commit?.message || '').split('\n')[0].slice(0, 80),
          author: c.commit?.author?.name || c.author?.login || 'unknown',
          date: c.commit?.author?.date || null,
        }))
      : [],
    readme: readmeRes.ok ? readmeRes.data.content : null,
    tree: treeRes.ok ? treeRes.data : { fileCount: 0, totalBytes: 0, estimatedLoc: 0 },
  }
}

// ─── 헬퍼: 언어 분포 → 정규화된 배열 ────────────────────────
export const normalizeLanguages = (langs) => {
  if (!langs || typeof langs !== 'object') return []
  const total = Object.values(langs).reduce((a, b) => a + b, 0)
  if (!total) return []
  return Object.entries(langs)
    .map(([name, bytes]) => ({ name, bytes, percent: Math.round((bytes / total) * 1000) / 10 }))
    .sort((a, b) => b.bytes - a.bytes)
}

// ─── 헬퍼: 커밋 → 90일 히트맵 ───────────────────────────────
// returns: [{ date: 'YYYY-MM-DD', count: N }] (오늘 기준 90일치)
export const buildCommitHeatmap = (commits, days = 90) => {
  const buckets = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    buckets[key] = 0
  }
  for (const c of commits) {
    if (!c.date) continue
    const key = c.date.slice(0, 10)
    if (key in buckets) buckets[key]++
  }
  return Object.entries(buckets)
    .map(([date, count]) => ({ date, count }))
    .reverse() // 과거 → 현재 순
}

// ─── 헬퍼: 시간 차이 상대 표시 (locale 반영, 함수명은 호환 위해 유지) ──────
export const formatRelativeKr = (iso) => {
  if (iso == null || iso === '') return '—'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const diffMs = Date.now() - ts
  if (diffMs < 0) return t('common.relative.just_now')
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return t('common.relative.just_now')
  if (diffMin < 60) return t('common.relative.min_ago', { n: diffMin })
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return t('common.relative.hr_ago', { n: diffHr })
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return t('common.relative.day_ago', { n: diffDay })
  const diffMon = Math.floor(diffDay / 30)
  if (diffMon < 12) return t('common.relative.mon_ago', { n: diffMon })
  return t('common.relative.yr_ago', { n: Math.floor(diffMon / 12) })
}

// ─── 헬퍼: GitHub 403 응답에서 rate limit 정보 추출 ─────────
// X-RateLimit-Reset (unix sec) 또는 Retry-After (sec) 우선순위로 reset 시각 계산.
// 반환: { isRateLimit: bool, resetAt: Date|null, remaining: number|null }
export const parseRateLimit = (response) => {
  if (!response) return { isRateLimit: false, resetAt: null, remaining: null }
  const headers = response.headers
  const get = (k) => (typeof headers?.get === 'function' ? headers.get(k) : null)

  const remainingRaw = get('X-RateLimit-Remaining')
  const remaining = remainingRaw == null ? null : parseInt(remainingRaw, 10)
  const isRateLimit = response.status === 403 && remaining === 0

  // X-RateLimit-Reset = absolute unix seconds
  const resetUnix = parseInt(get('X-RateLimit-Reset') || '', 10)
  if (!isNaN(resetUnix) && resetUnix > 0) {
    return { isRateLimit, resetAt: new Date(resetUnix * 1000), remaining }
  }
  // Retry-After = relative seconds (또는 HTTP date)
  const retryAfter = get('Retry-After')
  if (retryAfter) {
    const sec = parseInt(retryAfter, 10)
    if (!isNaN(sec)) return { isRateLimit, resetAt: new Date(Date.now() + sec * 1000), remaining }
    const date = Date.parse(retryAfter)
    if (!isNaN(date)) return { isRateLimit, resetAt: new Date(date), remaining }
  }
  return { isRateLimit, resetAt: null, remaining }
}

// 카운트다운 표시용: 남은 시간을 "5분 12초", "32초"(ko) / "5m 12s"(en) 등으로 포맷
export const formatCountdown = (resetAt, now = Date.now()) => {
  if (!resetAt) return ''
  const diffMs = resetAt.getTime() - now
  if (diffMs <= 0) return t('common.countdown.soon')
  const totalSec = Math.ceil(diffMs / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return t('common.countdown.in_sec', { s: sec })
  if (sec === 0) return t('common.countdown.in_min', { m: min })
  return t('common.countdown.in_min_sec', { m: min, s: sec })
}

// ─── 헬퍼: 바이트 → human readable ──────────────────────────
export const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}
