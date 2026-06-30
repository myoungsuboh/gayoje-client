/**
 * Code 페이지 전용 helpers — GitHub 데이터 → UI 표시.
 *
 * [github.js 와의 책임 분리]
 * - `github.js`: 외부 github.com/api REST 호출 (Deliverables 의 비인증 조회)
 * - `githubCode.js` (이 파일): BE 프록시(/api/github/*) 응답 → Code 페이지 UI
 *
 * [`parseGithubUrl` 은 github.js 의 것 재사용]
 * code.vue 에 자체 정의된 버전은 단일 trailing slash + case-sensitive `.git`
 * 처리라 다음 케이스 누락:
 *   - `https://github.com/owner/repo//` (다중 슬래시)
 *   - `https://github.com/owner/repo.GIT` (case 변형)
 * github.js 의 것이 더 robust 라 통합 — 이 통합 자체가 잠재 버그 fix.
 *
 * [순수 함수 정책]
 * 이 파일의 모든 export 는 side-effect 없는 pure function. 테스트 용이.
 * Vue / store / DOM 의존 0건 (단, 사용자 메시지는 i18n 로 번역 — 테스트는 locale=ko 고정).
 */
import i18n from '@/plugins/i18n'
// 비컴포넌트(util)에서 번역 — axios.js · github.js 와 동일 패턴.
const t = (key, params) => i18n.global.t(key, params)


// ─── Axios 에러 → 사용자 친화 메시지 ────────────────────────
//
// BE 프록시(/api/github/*) 의 axios 에러를 의미별로 매핑.
// FE 는 BE 응답 메시지를 그대로 노출하지 않고 이 매퍼 통과.

/**
 * BE GitHub 프록시 axios 에러 → 한국어 안내.
 *
 * @param {*} err axios 에러 객체 (err.response.status / err.response.data.detail)
 * @returns {string} 사용자에게 보여줄 한 문장
 *
 * 401: 사용자 GitHub OAuth 미연결 (axios interceptor 가 refresh 후 retry 했는데도 401)
 *      → 프로필 페이지로 안내
 * 404: 저장소/파일 없음 또는 권한 부족 private repo
 * 403: rate limit (detail 에 'rate limit' 또는 '한도' 포함) vs 일반 권한 부족 구분
 * 415: 바이너리 파일
 * 400: 잘못된 요청 — detail 그대로
 * 502: GitHub 호출 실패
 * 기타: detail or err.message fallback
 */
export const mapGithubProxyError = (err) => {
  const status = err?.response?.status
  const detail = err?.response?.data?.detail || err?.message || ''
  if (status === 401) {
    return t('errors.github.connect_required')
  }
  if (status === 404) {
    return t('errors.github.not_found')
  }
  if (status === 403) {
    return detail.includes('rate limit') || detail.includes('한도')
      ? t('errors.github.rate_limit', { detail })
      : t('errors.github.forbidden', { detail })
  }
  if (status === 415) {
    return t('errors.github.binary')
  }
  if (status === 400) {
    return detail || t('errors.github.bad_request')
  }
  if (status === 502) {
    return t('errors.github.proxy_fail', { detail })
  }
  return detail || err?.message || t('errors.github.unknown')
}


// ─── 파일 아이콘 / 언어 표시 helpers ─────────────────────────

/**
 * 확장자 → 아이콘 식별자. file tree / tab 의 색 점 색상 결정에 사용.
 *
 * @param {string} ext 소문자 확장자 (예: 'vue', 'ts')
 * @returns {string} 'vue' | 'ts' | 'js' | ... | 'file' (unknown)
 */
export const getIconType = (ext) => {
  const map = {
    vue: 'vue', ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js',
    json: 'json', md: 'md', css: 'css', scss: 'css', sass: 'css',
    html: 'html', py: 'py', go: 'go', java: 'java',
    yml: 'yml', yaml: 'yml', sh: 'sh', bash: 'sh',
    rs: 'rs', rb: 'rb', php: 'php', env: 'env', lock: 'lock', txt: 'txt',
  }
  return map[ext] || 'file'
}

/**
 * 아이콘 타입 → 색상 hex. file tree / tab dot 색.
 *
 * @param {string} iconType getIconType 의 반환값
 * @returns {string} hex 색상 (e.g. '#42b883')
 */
export const getIconDot = (iconType) => {
  const map = {
    vue: '#42b883', ts: '#3178c6', js: '#f7df1e', json: '#f7df1e',
    md: '#999', css: '#264de4', html: '#e34f26', py: '#3572A5',
    go: '#00ADD8', java: '#b07219', yml: '#cb171e', sh: '#89e051',
    rs: '#dea584', rb: '#701516', php: '#777bb4',
    txt: '#bbb', file: '#bbb', env: '#ecd53f', lock: '#ccc',
  }
  return map[iconType] || '#bbb'
}

/**
 * 파일명 → 언어 라벨 (status bar 표시용).
 *
 * @param {string} filename 'OrderService.py'
 * @returns {string} 'Python' (alias 매핑) 또는 확장자 대문자 (fallback)
 */
export const getLanguage = (filename) => {
  const ext = filename.split('.').pop().toLowerCase()
  const map = {
    vue: 'Vue', ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
    json: 'JSON', md: 'Markdown', css: 'CSS', scss: 'SCSS', sass: 'SASS',
    html: 'HTML', py: 'Python', go: 'Go', java: 'Java', rs: 'Rust',
    rb: 'Ruby', php: 'PHP', yml: 'YAML', yaml: 'YAML', sh: 'Shell',
    txt: 'Text', env: 'Env', lock: 'Lock',
  }
  return map[ext] || ext.toUpperCase()
}

/**
 * 바이너리 파일 판정 — 텍스트로 표시 안 함.
 *
 * SVG 는 XML 텍스트라 의도적 제외 (소스 조회 가능).
 *
 * @param {string} filename
 * @returns {boolean}
 */
export const isBinaryExtension = (filename) => {
  const binaryExts = [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'zip', 'tar', 'gz', 'rar', '7z',
    'pdf', 'exe', 'bin', 'dll', 'so', 'dylib',
    'mp3', 'mp4', 'wav', 'mov', 'avi',
  ]
  const ext = filename.split('.').pop().toLowerCase()
  return binaryExts.includes(ext)
}


// ─── File tree 변환 ───────────────────────────────────────────

/**
 * GitHub Tree API 의 flat 응답 → 화면 표시용 정렬된 트리.
 *
 * 입력 형식 (GitHub Tree API 응답의 `tree` 배열):
 *   [{ path: 'src/foo/bar.js', type: 'blob' | 'tree', size: 123 }, ...]
 *
 * 출력: DFS pre-order 정렬 + 부모/자식 관계 + 깊이 정보가 포함된 평면 배열.
 * FE 는 v-for 로 한 번에 렌더 + parentId 체인으로 visibility 계산.
 *
 * @param {Array<{path:string, type:string, size?:number}>} items GitHub tree response
 * @returns {Array<Object>} 정렬된 노드 배열:
 *   { id, name, type: 'folder'|'file', depth, parentId, path, size,
 *     open?: bool (folder, root 만 true), icon?: string (file) }
 *
 * [정렬 규칙]
 * - 같은 부모 아래: 폴더 먼저 → 알파벳 순
 * - 최상위는 depth=0
 *
 * [성능]
 * O(n log n) (sort) + O(n) (build) + O(n) (DFS). 수천 파일도 빠름.
 */
export const buildFileTree = (items) => {
  const pathToId = {}
  let idCounter = 1

  // 같은 부모 아래: 폴더 먼저 → 알파벳 순
  const sorted = [...items].sort((a, b) => {
    const da = a.path.split('/').length
    const db = b.path.split('/').length
    if (da !== db) return da - db
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  for (const item of sorted) pathToId[item.path] = idCounter++

  // 노드 생성 + 부모별 자식 목록 구성
  const nodeMap = {}
  const childrenMap = {}

  for (const item of sorted) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const depth = parts.length - 1
    const parentPath = parts.slice(0, -1).join('/')
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''

    const node = {
      id: pathToId[item.path],
      name,
      type: item.type === 'tree' ? 'folder' : 'file',
      depth,
      parentId: parentPath ? (pathToId[parentPath] ?? null) : null,
      path: item.path,
      size: item.size || 0,
    }

    if (node.type === 'folder') {
      node.open = depth === 0     // root 폴더만 자동 펼침
      childrenMap[item.path] = []
    } else {
      node.icon = getIconType(ext)
    }

    nodeMap[item.path] = node

    if (parentPath) {
      if (!childrenMap[parentPath]) childrenMap[parentPath] = []
      childrenMap[parentPath].push(node)
    }
  }

  // DFS pre-order: 부모 → 자식 순서로 평면 배열 구성
  const result = []
  const dfs = (path) => {
    result.push(nodeMap[path])
    for (const child of (childrenMap[path] || [])) {
      dfs(child.path)
    }
  }

  for (const item of sorted.filter(i => !i.path.includes('/'))) {
    dfs(item.path)
  }

  return result
}
