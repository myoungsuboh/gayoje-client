/**
 * githubCode.js 단위 테스트.
 *
 * code.vue 에서 추출한 pure helpers — 각 함수의 정상/엣지 케이스 회귀 가드.
 * 추출 전엔 page 안에 있어서 테스트 불가능했던 buildFileTree 같은 미묘 로직이
 * 이제 단위 검증 가능.
 */
import { describe, it, expect } from 'vitest'

import {
  mapGithubProxyError,
  getIconType,
  getIconDot,
  getLanguage,
  isBinaryExtension,
  buildFileTree,
} from '@/utils/githubCode'
import i18n from '@/plugins/i18n'
// mapGithubProxyError 가 i18n 사용 → 한국어 단언 위해 locale 고정
i18n.global.locale.value = 'ko'


// ─── mapGithubProxyError ───────────────────────────────────


describe('mapGithubProxyError', () => {
  const err = (status, detail) => ({
    response: { status, data: detail !== undefined ? { detail } : {} },
  })

  it('401 → GitHub 연결 안내', () => {
    const msg = mapGithubProxyError(err(401))
    expect(msg).toContain('GitHub 연결이 필요')
    expect(msg).toContain('프로필 페이지')
  })

  it('404 → 저장소/파일 없음 + private 가능성 힌트', () => {
    const msg = mapGithubProxyError(err(404))
    expect(msg).toContain('찾을 수 없')
    expect(msg).toContain('private')
  })

  it('403 with "rate limit" detail → rate limit 안내', () => {
    const msg = mapGithubProxyError(err(403, 'API rate limit exceeded for ...'))
    expect(msg).toContain('호출 한도 초과')
  })

  it('403 with "한도" detail → rate limit 안내 (한글)', () => {
    const msg = mapGithubProxyError(err(403, '호출 한도 도달'))
    expect(msg).toContain('호출 한도 초과')
  })

  it('403 without rate keyword → 일반 권한 부족 안내', () => {
    const msg = mapGithubProxyError(err(403, 'forbidden'))
    expect(msg).toContain('권한이 부족')
    expect(msg).not.toContain('한도 초과')
  })

  it('415 → 바이너리 안내', () => {
    expect(mapGithubProxyError(err(415))).toContain('바이너리')
  })

  it('400 with detail → detail 그대로', () => {
    expect(mapGithubProxyError(err(400, 'invalid url'))).toBe('invalid url')
  })

  it('400 without detail → 기본 메시지', () => {
    expect(mapGithubProxyError(err(400))).toContain('잘못된 요청')
  })

  it('502 → GitHub 호출 실패', () => {
    expect(mapGithubProxyError(err(502, 'upstream error'))).toContain('GitHub 호출 실패')
  })

  it('알 수 없는 status → detail or err.message fallback', () => {
    expect(mapGithubProxyError(err(500, 'oops'))).toBe('oops')
    expect(mapGithubProxyError({ message: 'Network Error' })).toBe('Network Error')
    expect(mapGithubProxyError({})).toBe('알 수 없는 오류')
  })

  it('null/undefined err 도 throw 안 함', () => {
    expect(() => mapGithubProxyError(null)).not.toThrow()
    expect(() => mapGithubProxyError(undefined)).not.toThrow()
  })
})


// ─── getIconType ───────────────────────────────────────────


describe('getIconType', () => {
  it('알려진 확장자 매핑', () => {
    expect(getIconType('vue')).toBe('vue')
    expect(getIconType('ts')).toBe('ts')
    expect(getIconType('tsx')).toBe('ts')   // tsx → ts alias
    expect(getIconType('js')).toBe('js')
    expect(getIconType('jsx')).toBe('js')   // jsx → js alias
    expect(getIconType('py')).toBe('py')
    expect(getIconType('yaml')).toBe('yml')
  })

  it('알 수 없는 확장자 → "file"', () => {
    expect(getIconType('xyz')).toBe('file')
    expect(getIconType('')).toBe('file')
  })
})


// ─── getIconDot ────────────────────────────────────────────


describe('getIconDot', () => {
  it('알려진 타입 → hex 색', () => {
    expect(getIconDot('vue')).toBe('#42b883')
    expect(getIconDot('ts')).toBe('#3178c6')
    expect(getIconDot('js')).toBe('#f7df1e')
  })

  it('알 수 없는 타입 → 기본 회색', () => {
    expect(getIconDot('unknown')).toBe('#bbb')
    expect(getIconDot('')).toBe('#bbb')
  })

  it('file 타입도 회색', () => {
    expect(getIconDot('file')).toBe('#bbb')
  })
})


// ─── getLanguage ───────────────────────────────────────────


describe('getLanguage', () => {
  it('알려진 확장자 → 정식 언어명', () => {
    expect(getLanguage('OrderService.py')).toBe('Python')
    expect(getLanguage('App.vue')).toBe('Vue')
    expect(getLanguage('main.ts')).toBe('TypeScript')
    expect(getLanguage('app.go')).toBe('Go')
  })

  it('알 수 없는 확장자 → 대문자', () => {
    expect(getLanguage('script.xyz')).toBe('XYZ')
  })

  it('대소문자 무관 (소문자 정규화)', () => {
    expect(getLanguage('App.VUE')).toBe('Vue')
    expect(getLanguage('main.Py')).toBe('Python')
  })

  it('여러 점 있는 파일명도 마지막 확장자만', () => {
    expect(getLanguage('archive.tar.gz')).toBe('GZ')   // gz 는 map 에 없음 → uppercase
    expect(getLanguage('test.spec.ts')).toBe('TypeScript')
  })
})


// ─── isBinaryExtension ─────────────────────────────────────


describe('isBinaryExtension', () => {
  it('이미지/폰트/압축 등 binary 는 true', () => {
    expect(isBinaryExtension('logo.png')).toBe(true)
    expect(isBinaryExtension('photo.JPG')).toBe(true)  // case-insensitive
    expect(isBinaryExtension('font.woff2')).toBe(true)
    expect(isBinaryExtension('archive.zip')).toBe(true)
    expect(isBinaryExtension('doc.pdf')).toBe(true)
    expect(isBinaryExtension('binary.exe')).toBe(true)
  })

  it('SVG 는 binary 아님 (XML 텍스트 — 의도적 제외)', () => {
    expect(isBinaryExtension('icon.svg')).toBe(false)
  })

  it('일반 텍스트 확장자 false', () => {
    expect(isBinaryExtension('app.vue')).toBe(false)
    expect(isBinaryExtension('main.py')).toBe(false)
    expect(isBinaryExtension('README.md')).toBe(false)
  })

  it('확장자 없는 파일 → false', () => {
    expect(isBinaryExtension('Makefile')).toBe(false)
    expect(isBinaryExtension('Dockerfile')).toBe(false)
  })
})


// ─── buildFileTree ─────────────────────────────────────────


describe('buildFileTree', () => {
  it('빈 입력 → 빈 출력', () => {
    expect(buildFileTree([])).toEqual([])
  })

  it('단일 root 파일', () => {
    const tree = buildFileTree([
      { path: 'README.md', type: 'blob', size: 1000 },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({
      name: 'README.md',
      type: 'file',
      depth: 0,
      parentId: null,
      path: 'README.md',
      size: 1000,
      icon: 'md',
    })
  })

  it('폴더 + 자식 파일 — DFS pre-order', () => {
    const tree = buildFileTree([
      { path: 'src', type: 'tree' },
      { path: 'src/app.vue', type: 'blob', size: 500 },
    ])
    expect(tree).toHaveLength(2)
    expect(tree[0].name).toBe('src')
    expect(tree[0].type).toBe('folder')
    expect(tree[0].open).toBe(true)    // root 폴더는 자동 펼침
    expect(tree[1].name).toBe('app.vue')
    expect(tree[1].depth).toBe(1)
    expect(tree[1].parentId).toBe(tree[0].id)
  })

  it('같은 부모 아래 — 폴더 먼저 → 알파벳 순', () => {
    const tree = buildFileTree([
      { path: 'README.md', type: 'blob' },
      { path: 'src', type: 'tree' },
      { path: 'package.json', type: 'blob' },
      { path: 'docs', type: 'tree' },
    ])
    // depth 0 만 추려서 순서 확인.
    // localeCompare 의 기본 동작: case-insensitive 비교 → 'package' (p) < 'README' (R).
    // 폴더(docs, src) 가 파일 앞에, 각 그룹은 알파벳 순.
    const rootNames = tree.filter(n => n.depth === 0).map(n => n.name)
    expect(rootNames).toEqual(['docs', 'src', 'package.json', 'README.md'])
  })

  it('중첩 폴더 + DFS 순서 보존', () => {
    const tree = buildFileTree([
      { path: 'src', type: 'tree' },
      { path: 'src/order', type: 'tree' },
      { path: 'src/order/Service.py', type: 'blob' },
      { path: 'src/main.py', type: 'blob' },
    ])
    // DFS: src → src/order → src/order/Service.py → src/main.py
    expect(tree.map(n => n.path)).toEqual([
      'src',
      'src/order',
      'src/order/Service.py',
      'src/main.py',
    ])
    // depth 검증
    expect(tree.map(n => n.depth)).toEqual([0, 1, 2, 1])
  })

  it('nested 폴더는 자동으로 안 열림 (open=true 는 root 만)', () => {
    const tree = buildFileTree([
      { path: 'src', type: 'tree' },
      { path: 'src/order', type: 'tree' },
    ])
    expect(tree[0].open).toBe(true)   // root
    expect(tree[1].open).toBe(false)  // depth 1
  })

  it('파일에는 icon 부여, 폴더에는 없음', () => {
    const tree = buildFileTree([
      { path: 'src', type: 'tree' },
      { path: 'src/Order.vue', type: 'blob' },
    ])
    expect(tree[0].icon).toBeUndefined()   // 폴더
    expect(tree[1].icon).toBe('vue')        // 파일
  })

  it('size 누락 시 0 으로 채움', () => {
    const tree = buildFileTree([{ path: 'a.txt', type: 'blob' }])
    expect(tree[0].size).toBe(0)
  })

  it('확장자 없는 파일 → icon "file"', () => {
    const tree = buildFileTree([{ path: 'Makefile', type: 'blob' }])
    expect(tree[0].icon).toBe('file')
  })

  it('parentId 체인 정확 — 깊은 트리', () => {
    const tree = buildFileTree([
      { path: 'a', type: 'tree' },
      { path: 'a/b', type: 'tree' },
      { path: 'a/b/c.js', type: 'blob' },
    ])
    const [a, b, c] = tree
    expect(a.parentId).toBeNull()
    expect(b.parentId).toBe(a.id)
    expect(c.parentId).toBe(b.id)
  })
})
