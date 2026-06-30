import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildStartGuide,
  buildAgentBootstrap,
  AGENT_TOOLS,
  skillToMd,
  getCategoryFromSkill,
  addSkillsToZip,
  KNOWN_CATEGORIES,
  normalizeCategory,
  skillFileBase,
} from '@/utils/designExport'
import i18n from '@/plugins/i18n'

// [i18n — 2026-06-25] 빌더가 t(vue-i18n) 를 첫 인자로 받게 바뀜. locale=ko 로 고정해
// i18n.global.t 를 주입하면, 사람용 한국어 텍스트는 기존 리터럴과 바이트 동일이라
// 한국어 단언이 그대로 통과한다. (단, 원래 영어였던 에이전트 지시문은 ko 에선 한국어로
// 출력되므로, 영어 지시문을 검사하던 단언은 안정 앵커/한국어 번역으로 교체했다.)
beforeEach(() => { i18n.global.locale.value = 'ko' })
const t = (k, p) => i18n.global.t(k, p)

describe('buildStartGuide', () => {
  it('프로젝트명을 제목에 포함한다', () => {
    const md = buildStartGuide(t, 'MyApp', false)
    expect(md).toContain('# 🎯 MyApp — 바이브 코딩 시작 가이드')
  })

  it('skills 없으면 단일 zip 안내 + Phase 1 부터, skills 섹션 미포함', () => {
    const md = buildStartGuide(t, 'MyApp', false)
    expect(md).toContain('MyApp_vibe.zip')        // [#2] 단일 zip 으로 배포
    expect(md).toContain('압축을 풀면')
    expect(md).toContain('**Phase 1 — 명세 이해** 를 시작하세요')
    expect(md).not.toContain('_0_skills.zip')     // 별도 skills zip 없음
    // PHASE 0 (규칙 내재화) 자체가 없어야 함 — 헤딩은 locale 무관 마커(### PHASE 0)로 검사.
    expect(md).not.toContain('### PHASE 0')
  })

  it('skills 있으면 skills/ 폴더 안내 + Phase 0(규칙 내재화) 포함', () => {
    const md = buildStartGuide(t, 'MyApp', true)
    expect(md).toContain('MyApp_vibe.zip')
    expect(md).toContain('`skills/`')             // zip 내부 폴더로 동봉
    expect(md).not.toContain('_0_skills.zip')     // 별도 zip 아님
    expect(md).toContain('### PHASE 0')           // Phase 0 헤딩(영어 마커 안정 앵커)
    expect(md).toContain('**Phase 0 — 규칙 내재화** 부터 시작하세요')
  })

  it('[V3] Phase 0 은 전독이 아니라 인덱스 우선 + 태스크 직전 재독 정책', () => {
    const md = buildStartGuide(t, 'MyApp', true)
    // 영어 지시문이 ko 에선 한국어로 번역됨 — 보존 토큰(frontmatter only / RIGHT BEFORE) 으로 앵커.
    expect(md).toContain('frontmatter only')          // 인덱스만 먼저 (보존 토큰)
    expect(md).toContain('Do NOT read every rule body now')  // 보존 토큰
    expect(md).toContain('RIGHT BEFORE each coding task')    // 보존 토큰
  })

  it('[V4] Phase 6 경로 자가검증 + 재개 룰 포함', () => {
    const md = buildStartGuide(t, 'MyApp', false, 'other', true)
    // 영어 지시문이 ko 에선 한국어 — 보존 토큰으로 앵커.
    expect(md).toContain('a path you cannot open is a false check')  // 보존 토큰
    expect(md).toContain('Resuming after an interruption')           // 보존 토큰
    expect(md).toContain('do not start over')                        // 보존 토큰
  })

  it('명세 파일을 프리픽스 없이(zip 내부 실제 파일명과 일치) 설명한다', () => {
    const md = buildStartGuide(t, 'X', false)
    expect(md).toContain('`1_spack.md`')
    expect(md).toContain('`2_ddd.md`')
    expect(md).toContain('`3_architecture.md`')
    expect(md).not.toContain('X_1_spack.md')      // [#4] 프리픽스 제거 확인
  })

  it('[#7] 기술스택은 3_architecture.md 에서 먼저 읽고, 없을 때만 사용자에게 묻는다', () => {
    const md = buildStartGuide(t, 'MyApp', false)
    expect(md).toContain('Tech Stack')                          // arch 의 Tech Stack 필드 참조(보존 토큰)
    // 무조건 stack 결정을 기다리던 모순 문구 제거 — 조건부로만 대기 (영어 원문/한국어 번역 모두에 없어야 함)
    expect(md).not.toContain('AND explicit tech stack decision')
    expect(md).not.toContain('NEVER assume tech stack')
  })

  it('[B] tool 별 시작 안내 + 자동 인식 파일을 맞춤 렌더한다', () => {
    const claude = buildStartGuide(t, 'MyApp', false, 'claude')
    expect(claude).toContain('Claude Code 로 폴더 열기')
    expect(claude).toContain('CLAUDE.md')
    expect(claude).toContain(t('design.vibe.start_line'))       // "시작해줘" 한 마디

    const cursor = buildStartGuide(t, 'MyApp', false, 'cursor')
    expect(cursor).toContain('Cursor 로 폴더 열기')
    expect(cursor).toContain('AGENTS.md')

    const anti = buildStartGuide(t, 'MyApp', false, 'antigravity')
    expect(anti).toContain('Antigravity')
    expect(anti).toContain('AGENTS.md')
  })

  it('[B] 알 수 없는 tool / 미지정이면 other(범용, AGENTS.md) 로 fallback', () => {
    const def = buildStartGuide(t, 'MyApp', false)            // 기본값
    expect(def).toContain('기타 / 잘 모르겠어요 로 폴더 열기')
    expect(def).toContain('AGENTS.md')
    expect(buildStartGuide(t, 'MyApp', false, 'nope')).toContain('기타 / 잘 모르겠어요')
  })

  it('[B] AGENTS.md/CLAUDE.md 도 받은 파일 설명에 포함된다', () => {
    expect(buildStartGuide(t, 'MyApp', false)).toContain('자동 인식 파일')
  })

  it('[zip 한뎁스 2026-06-19] 압축 푼 폴더를 {project}_vibe 로 안내 — 이중 폴더 방지', () => {
    // zip 내부 {project}/ 폴더를 제거(VibePackageModal)해 압축 푼 폴더명이 zip 이름({project}_vibe)이 됨.
    // 가이드도 거기 맞춰야 cd 가 어긋나지 않는다.
    const claude = buildStartGuide(t, 'MyApp', false, 'claude')
    expect(claude).toContain('MyApp_vibe/')          // 압축 푼 폴더명 = zip 이름(이중 폴더 X)
    expect(claude).toContain('cd "MyApp_vibe"')      // cd 안내 — 공백 폴더명 대비 따옴표
    expect(buildStartGuide(t, 'MyApp', false, 'cursor')).toContain('MyApp_vibe/')
  })
})

describe('buildAgentBootstrap (AGENTS.md / CLAUDE.md)', () => {
  it('프로젝트명 + 핵심 규칙 + 명세 파일을 담는다', () => {
    const md = buildAgentBootstrap(t, 'MyApp', false, false)
    expect(md).toContain('AI 에이전트 지침 — MyApp')      // 타이틀(ko 번역 — 에이전트 지시문 헤딩도 로케일화)
    expect(md).toContain('1_spack.md')
    expect(md).toContain('3_architecture.md')
    expect(md).toContain('Tech stack')                     // 기술스택 규칙(보존 토큰)
    // 원래 영어 'Stop after every phase' 는 ko 에선 한국어 — 보존 토큰으로 앵커.
    expect(md).toContain('Stop after every phase')         // 보존 토큰(rule_stop 괄호)
  })

  it('오케스트레이터 유무에 따라 마스터 플랜 진입점을 바꾼다', () => {
    expect(buildAgentBootstrap(t, 'X', false, true)).toContain('00-ORCHESTRATOR.md')
    expect(buildAgentBootstrap(t, 'X', false, false)).toContain('0_START_HERE.md')
  })

  it('skills 있을 때만 skills 규칙 줄을 넣는다', () => {
    expect(buildAgentBootstrap(t, 'X', true, false)).toContain('skills/')
    // 'Follow `skills/` rules' 는 보존 토큰 — skills 없을 땐 그 줄 자체가 없어야 함.
    expect(buildAgentBootstrap(t, 'X', false, false)).not.toContain('Follow `skills/` rules')
  })
})

describe('IMPLEMENTATION-CHECKLIST (Phase 6 전수 대조 루프)', () => {
  it('checklist 동봉 시 PHASE 6 이 체크리스트 기준으로 렌더된다', () => {
    const md = buildStartGuide(t, 'MyApp', false, 'other', true)
    expect(md).toContain('### PHASE 6')             // 헤딩 마커(안정 앵커)
    expect(md).toContain('IMPLEMENTATION-CHECKLIST.md')
    expect(md).toContain('Repeat this loop until 100%')   // 보존 토큰
    expect(md).toContain('전수 대조 체크리스트')   // 받은 파일 설명 섹션(한국어 — 사람용, 유지)
  })

  it('checklist 없어도 PHASE 6 은 자체 인벤토리 fallback 으로 항상 포함', () => {
    const md = buildStartGuide(t, 'MyApp', false)
    expect(md).toContain('### PHASE 6')                  // 헤딩 마커(안정 앵커)
    expect(md).toContain('Build your own inventory')     // 보존 토큰
    expect(md).not.toContain('IMPLEMENTATION-CHECKLIST.md')
  })

  it('bootstrap 도 checklist 를 완료 조건으로 건다 (없으면 미언급)', () => {
    expect(buildAgentBootstrap(t, 'X', false, false, true)).toContain('IMPLEMENTATION-CHECKLIST.md')
    expect(buildAgentBootstrap(t, 'X', false, false, false)).not.toContain('IMPLEMENTATION-CHECKLIST.md')
  })

  it('skills 위반 시 어떤 규칙 위반인지 명시하라는 지시를 포함한다', () => {
    // 영어 'cite WHICH' 가 ko 에선 '어떤(WHICH) ... 명시하세요(cite)' 로 번역됨 —
    // 보존 토큰 (WHICH)·(cite) + `skills/` 파일 참조로 앵커.
    const md = buildAgentBootstrap(t, 'X', true, false)
    expect(md).toContain('(WHICH)')
    expect(md).toContain('(cite)')
  })
})

describe('AGENT_TOOLS', () => {
  it('4종 도구(claude/cursor/antigravity/other)를 노출하고 each 가 autoFile 을 가진다', () => {
    expect(Object.keys(AGENT_TOOLS).sort()).toEqual(['antigravity', 'claude', 'cursor', 'other'])
    expect(AGENT_TOOLS.claude.autoFile).toBe('CLAUDE.md')
    expect(AGENT_TOOLS.cursor.autoFile).toBe('AGENTS.md')
    // [i18n 2026-06-25] open/label 은 design.vibe.tools.* 로 이동 — AGENT_TOOLS 엔 autoFile 만.
    expect(AGENT_TOOLS.other.autoFile).toBe('AGENTS.md')
  })
})

describe('skillToMd', () => {
  it('frontmatter + 제목 + ID 를 포함한다', () => {
    const md = skillToMd(t, { id: 'SKL-1', name: '인증 규칙' })
    expect(md).toContain('name: 인증 규칙')
    expect(md).toContain('# 인증 규칙')
    expect(md).toContain('**ID:** `SKL-1`')
  })

  it('instructions 를 번호 목록으로 렌더한다', () => {
    const md = skillToMd(t, { id: 'SKL-2', name: 'n', instructions: ['첫째', '둘째'] })
    expect(md).toContain('## 지시사항 (Instructions)')
    expect(md).toContain('1. 첫째')
    expect(md).toContain('2. 둘째')
  })

  it('tags 를 코드 백틱으로 렌더한다', () => {
    const md = skillToMd(t, { id: 'SKL-3', name: 'n', tags: ['backEnd', 'auth'] })
    expect(md).toContain('## 태그')
    expect(md).toContain('`backEnd` `auth`')
  })

  it('optional 필드 없으면 빈 항목을 남기지 않는다', () => {
    const md = skillToMd(t, { id: 'SKL-4', name: 'n' })
    expect(md).not.toContain('범위(Scope)')
    expect(md).not.toContain('우선순위')
  })

  it('[동적] cat: 내부 마커는 태그 출력에서 숨긴다', () => {
    const md = skillToMd(t, { id: 'SKL-5', name: 'n', tags: ['cat:결제모듈', 'auth'] })
    expect(md).toContain('`auth`')
    expect(md).not.toContain('cat:결제모듈')
  })
})

describe('getCategoryFromSkill', () => {
  it('알려진 카테고리 태그를 반환한다', () => {
    expect(getCategoryFromSkill({ tags: ['x', 'backEnd'] })).toBe('backEnd')
  })
  it('알려진 카테고리 없으면 etc', () => {
    expect(getCategoryFromSkill({ tags: ['random'] })).toBe('etc')
    expect(getCategoryFromSkill({})).toBe('etc')
  })
  it('KNOWN_CATEGORIES 는 cat: 마커 없는 레거시 스킬 fallback — 필수 운영 카테고리를 포함한다', () => {
    // [2026-06-18 동적화] 카테고리는 cat: 마커로 동적 분류된다(getCategoryFromSkill).
    // KNOWN_CATEGORIES 는 cat: 마커 없는 구 스킬의 fallback 화이트리스트라, "정확히 N종"
    // 고정 단언은 멤버가 늘 때마다 깨진다 — 동적화 정신에 맞춰 '필수 카테고리 포함'만 검증.
    expect([...KNOWN_CATEGORIES]).toEqual(expect.arrayContaining(
      ['frontEnd', 'backEnd', 'db', 'mobile', 'design', 'security', 'devops', 'testing', 'ai', 'core'],
    ))
  })
  it('확장 카테고리 태그도 분류한다', () => {
    expect(getCategoryFromSkill({ tags: ['x', 'ai'] })).toBe('ai')
    expect(getCategoryFromSkill({ tags: ['design'] })).toBe('design')
    expect(getCategoryFromSkill({ tags: ['security'] })).toBe('security')
    expect(getCategoryFromSkill({ tags: ['devops'] })).toBe('devops')
    expect(getCategoryFromSkill({ tags: ['testing'] })).toBe('testing')
  })
})

describe('addSkillsToZip', () => {
  function makeFakeZip() {
    const calls = []
    const zip = {
      folder: vi.fn((cat) => ({
        file: (name, content) => calls.push({ cat, name, content }),
      })),
    }
    return { zip, calls }
  }

  it('빈 목록이면 아무것도 추가하지 않는다', () => {
    const { zip } = makeFakeZip()
    addSkillsToZip(zip, [], t)
    addSkillsToZip(zip, null, t)
    expect(zip.folder).not.toHaveBeenCalled()
  })

  it('[#6] 카테고리 폴더 + {태그}-{id} 파일명으로 추가한다', () => {
    const { zip, calls } = makeFakeZip()
    addSkillsToZip(zip, [{ id: 'SKL-1', name: 'auth', tags: ['backEnd'] }], t)
    expect(calls).toHaveLength(1)
    expect(calls[0].cat).toBe('backEnd')
    expect(calls[0].name).toBe('backEnd-1.md')   // id suffix 로 유니크
    expect(calls[0].content).toContain('# auth')
  })

  it('태그 없으면 id(SKL- 제거, 소문자)로 파일명 + etc 폴더', () => {
    const { zip, calls } = makeFakeZip()
    addSkillsToZip(zip, [{ id: 'SKL-Login', name: 'n' }], t)
    expect(calls[0].cat).toBe('etc')
    expect(calls[0].name).toBe('login.md')
  })

  it('id/태그의 경로 구분자(/·\\)는 - 로 치환 — zip 하위 폴더로 풀리는 사고 방지', () => {
    const { zip, calls } = makeFakeZip()
    addSkillsToZip(zip, [
      { id: 'SKL-SRC/COMPONENTS-PROJECT-ARCHITECTURE', name: 'n', tags: ['frontEnd'] },
      { id: 'SKL-A\\B', name: 'n2', tags: ['backEnd'] },
    ], t)
    expect(calls[0].name).toBe('frontEnd-src-components-project-architecture.md')
    expect(calls[1].name).toBe('backEnd-a-b.md')
    expect(calls.every(c => !c.name.includes('/') && !c.name.includes('\\'))).toBe(true)
  })

  it('Windows 무효문자(<>:*?"|)·공백은 - 로 치환 — 일부 OS 에서 파일 생성 실패 방지 (BE get_skill_path 와 미러)', () => {
    const { zip, calls } = makeFakeZip()
    addSkillsToZip(zip, [
      { id: 'SKL-SCRIPT-SETUP', name: 'n', tags: ['<script setup>', 'frontEnd'] },
      { id: 'SKL-NPM-AUDIT', name: 'n2', tags: ['npm audit', 'security'] },
    ], t)
    // 카테고리는 태그에서 알려진 값(frontEnd/security)으로 분류, 파일명엔 무효문자 없음
    expect(calls[0].cat).toBe('frontEnd')
    expect(calls[1].cat).toBe('security')
    const bad = /[<>:*?"| ]/
    expect(calls.every(c => !bad.test(c.name))).toBe(true)
  })

  it('[#6] 같은 카테고리·같은 첫 태그 스킬 2개가 파일명 충돌 없이 분리된다', () => {
    const { zip, calls } = makeFakeZip()
    addSkillsToZip(zip, [
      { id: 'SKL-3', name: 'auth', tags: ['backEnd'] },
      { id: 'SKL-7', name: 'payment', tags: ['backEnd'] },
    ], t)
    const names = calls.map(c => c.name)
    expect(names).toEqual(['backEnd-3.md', 'backEnd-7.md'])
    expect(new Set(names).size).toBe(2)   // 유니크 — 이전엔 둘 다 backEnd.md 로 충돌
  })

  it('[동적] cat: 마커로 동적 폴더 카테고리를 만들고, 파일명은 cat: 제외 첫 태그를 쓴다', () => {
    const { zip, calls } = makeFakeZip()
    addSkillsToZip(zip, [{ id: 'SKL-1', name: 'pay', tags: ['cat:결제모듈', 'auth'] }], t)
    expect(calls[0].cat).toBe('결제모듈')      // 화이트리스트 밖 동적 폴더 보존
    expect(calls[0].name).toBe('auth-1.md')    // cat: 마커 제외한 첫 태그
  })
})

// ─── 동적 카테고리(cat: 마커) 핵심 동작 — 화이트리스트 하드코딩을 대체 ──────────
describe('getCategoryFromSkill — cat: 마커 동적 분류', () => {
  it('cat: 마커가 있으면 동적 폴더 카테고리(화이트리스트 밖)를 그대로 보존한다', () => {
    expect(getCategoryFromSkill({ tags: ['cat:결제모듈'] })).toBe('결제모듈')
  })
  it('공백·무효문자는 normalizeCategory 로 폴더 안전화한다', () => {
    expect(getCategoryFromSkill({ tags: ['cat:내 팀 규칙'] })).toBe('내-팀-규칙')
  })
  it('cat: 마커가 KNOWN 태그보다 우선한다', () => {
    expect(getCategoryFromSkill({ tags: ['backEnd', 'cat:결제모듈'] })).toBe('결제모듈')
  })
  it('cat: 마커 값이 비면 etc 로 안전화', () => {
    expect(getCategoryFromSkill({ tags: ['cat:'] })).toBe('etc')
  })
  it('core(레거시 fallback)도 분류한다', () => {
    expect(getCategoryFromSkill({ tags: ['core'] })).toBe('core')
  })
})

describe('normalizeCategory', () => {
  it('경로구분자·Windows무효문자·공백류 → -, 앞뒤 - 정리, 빈값 etc', () => {
    expect(normalizeCategory('결제모듈')).toBe('결제모듈')
    expect(normalizeCategory('a/b')).toBe('a-b')
    expect(normalizeCategory('a:b')).toBe('a-b')
    expect(normalizeCategory('내 팀')).toBe('내-팀')
    expect(normalizeCategory('  ')).toBe('etc')
    expect(normalizeCategory('//')).toBe('etc')
  })
})

describe('skillFileBase — cat: 마커 제외', () => {
  it('cat: 마커는 파일 base 에서 제외하고 첫 일반 태그를 쓴다', () => {
    expect(skillFileBase({ id: 'SKL-1', tags: ['cat:결제모듈', 'auth'] })).toBe('auth-1')
  })
  it('cat: 마커만 있으면 id 만 사용한다', () => {
    expect(skillFileBase({ id: 'SKL-Login', tags: ['cat:결제모듈'] })).toBe('login')
  })
})

// [i18n 회귀 가드 — 2026-06-25] en locale 출력엔 한글이 섞이지 않아야 한다.
// 이 빌더들에는 의도적 한국어 마커가 없으므로(agentBundle 의 '⚠️ 미정' 같은 예외 없음),
// en 출력은 100% Hangul-free 여야 한다.
const HANGUL = /[가-힣]/
describe('i18n — en 출력에 한국어 미포함', () => {
  beforeEach(() => { i18n.global.locale.value = 'en' })
  it('buildStartGuide / buildAgentBootstrap / skillToMd (en) 에 한글 없음', () => {
    expect(HANGUL.test(buildStartGuide(t, 'X', true, 'claude', true))).toBe(false)
    expect(HANGUL.test(buildStartGuide(t, 'X', false))).toBe(false)
    expect(HANGUL.test(buildAgentBootstrap(t, 'X', true, true, true, 'enhance'))).toBe(false)
    expect(HANGUL.test(skillToMd(t, { id: 'SKL-1', name: 'n', instructions: ['a'], tags: ['x'] }))).toBe(false)
  })
})
