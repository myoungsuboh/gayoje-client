/**
 * agentBundle.js — 핸드오프 번들 문서 빌더 (재발 방지 가드 ③ — 2026-06-13).
 *
 * [왜 이 테스트가 존재하나] 이 빌더들은 AgentExportPanel.vue 컴포넌트 내부 함수라
 * 테스트가 0건이었고, 그래서 'AGENTS.md footer 에 Claude Code 잔존'·'llms.txt
 * overview 헤딩 누수'·'BUILD_PLAN footer 도구 불일치' 같은 "조립 텍스트" 버그가
 * 오직 사람 눈에만 의존해 반복적으로 샜다. 의미 단언으로 그 부류를 자동 차단한다.
 *
 * [i18n — 2026-06-25] 빌더가 t(vue-i18n) 를 첫 인자로 받게 바뀜. locale=ko 로 고정해
 * i18n.global.t 를 주입하면 ko 값이 기존 한국어 리터럴과 바이트 동일이라 골든 단언이
 * 그대로 통과한다. en 출력에 한글이 안 섞이는지도 가볍게 검증.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildAgentContextMd, buildCursorRules, buildBuildPlanMd, buildLlmsTxt, buildStartPrompt, buildImplementationStatus, planIsMeaningful, buildWorkRules, roleLine,
} from '@/utils/agentBundle'
import i18n from '@/plugins/i18n'

// 모든 테스트는 locale=ko 고정 — ko 값이 바이트 동일이라 골든 단언이 그대로 통과.
beforeEach(() => { i18n.global.locale.value = 'ko' })
const t = (k, p) => i18n.global.t(k, p)

const SPECS = {
  prd: '# 🚀 PRD: Foo\n\n### 1. Product Overview\n- **Product Vision**: 운동 습관 기록 앱\n',
  architecture: '# Architecture',
  ddd: '# DDD',
  spack: '# SPACK',
  techStack: ['FastAPI', 'PostgreSQL'],
}
const PLAN = { recommended_stack: 'FastAPI', milestones: ['m1'], scope_now: ['s1'], risks: ['r1'], acceptance_criteria: ['a1'] }

describe('buildAgentContextMd — CLAUDE.md vs AGENTS.md 도구 분기', () => {
  it('CLAUDE.md: 헤더·footer 모두 "Claude Code"', () => {
    const md = buildAgentContextMd(t, 'Foo', SPECS, PLAN, 'claude', '2026-01-01')
    expect(md).toContain('이 파일은 Claude Code 가')
    expect(md).toContain('코딩은 Claude Code.')
    expect(md).toContain('FastAPI · PostgreSQL')  // 역할 주입
  })
  it('[회귀 가드] AGENTS.md: 본문·footer 어디에도 "Claude Code" 없음', () => {
    const md = buildAgentContextMd(t, 'Foo', SPECS, PLAN, 'agents', '2026-01-01')
    expect(md).not.toContain('Claude Code')  // ← AGENTS.md footer 잔존 버그 재발 차단
    expect(md).toContain('Cursor · Codex · Windsurf')
    expect(md).toContain('코딩은 당신의 AI 코딩 도구.')
  })
  it('plan 없으면 BUILD_PLAN docList 줄 없음, techStack 없으면 graceful 역할', () => {
    const md = buildAgentContextMd(t, 'Foo', { prd: '', architecture: '', ddd: '', spack: '' }, null, 'claude', 'x')
    expect(md).not.toContain('BUILD_PLAN.md')
    expect(md).toContain('신중한 시니어 개발자')
  })
})

describe('buildBuildPlanMd — footer 도구 중립(단일 번들)', () => {
  it('[회귀 가드] footer 에 "Claude Code" 하드코딩 없음', () => {
    const md = buildBuildPlanMd(t, PLAN, 'Foo')
    expect(md).not.toContain('Claude Code')
    expect(md).toContain('코딩은 당신의 AI 코딩 도구.')
    expect(md).toContain('## 추천 스택')
  })
})

describe('buildLlmsTxt — overview 헤딩 누수 차단', () => {
  it('[회귀 가드] overview 줄에 "#" 헤딩 없음, 첫 실내용 줄 추출', () => {
    const txt = buildLlmsTxt(t, SPECS, 'Foo', true)
    const overviewLine = txt.split('\n').find((l) => l.startsWith('> '))
    expect(overviewLine).toBe('> Product Vision: 운동 습관 기록 앱')  // ### 헤딩 안 샘
    expect(txt).toContain('[BUILD_PLAN.md](BUILD_PLAN.md)')
    expect(txt).toContain('[SPACK](spec/spack.md)')
  })
  it('빈 PRD → 기본 문구 폴백, 링크는 존재하는 문서만', () => {
    const txt = buildLlmsTxt(t, { prd: '', spack: '# x' }, 'Foo', false)
    expect(txt).toContain('Harness 로 생성한 기획·설계 번들입니다.')
    expect(txt).not.toContain('[BUILD_PLAN.md]')  // hasPlan=false
    expect(txt).not.toContain('[PRD]')            // prd 없음
  })
})

describe('buildCursorRules / buildStartPrompt / buildWorkRules', () => {
  it('cursorrules: 마크다운 굵게(**) 제거 + 역할·규칙 포함', () => {
    const r = buildCursorRules(t, 'Foo', ['Vue'])
    expect(r).not.toContain('**')
    expect(r).toContain('Vue')
    expect(r).toContain('⚠️ 미정')  // 갭 규칙 포함
  })
  it('startPrompt: ⚠ 미정·import 확인·자기검토 규칙 포함', () => {
    const p = buildStartPrompt(t, 'Foo')
    expect(p).toContain('"Foo" 프로젝트')
    expect(p).toContain('⚠️ 미정')
    expect(p).toContain('가정·위험·불확실한 점')
  })
  it('buildWorkRules 에 import 실재·⚠ 미정 규칙 둘 다 존재(공존)', () => {
    const rules = buildWorkRules(t)
    expect(rules.some((r) => r.includes('레지스트리'))).toBe(true)
    expect(rules.some((r) => r.includes('⚠️ 미정'))).toBe(true)
  })
  it('roleLine: 4개 초과 스택은 4개로 컷', () => {
    expect(roleLine(t, ['a', 'b', 'c', 'd', 'e'])).toContain('a · b · c · d')
    expect(roleLine(t, [])).toContain('신중한 시니어')
  })
  it('planIsMeaningful: 빈 플랜 false, 내용 있으면 true', () => {
    expect(planIsMeaningful(null)).toBe(false)
    expect(planIsMeaningful({})).toBe(false)
    expect(planIsMeaningful({ milestones: ['m'] })).toBe(true)
  })
})

// [2026-06] delta-aware(import 한 기존 코드 위에 강화) 빌더 — Phase 2.
describe('enhance mode (import 한 기존 프로젝트 → 기존 위에 강화)', () => {
  it('buildStartPrompt greenfield 는 기존과 동일(기본값)', () => {
    expect(buildStartPrompt(t, 'X', 'greenfield')).toBe(buildStartPrompt(t, 'X'))
    expect(buildStartPrompt(t, 'X')).toContain('프로젝트를 만들려고 해')
    expect(buildStartPrompt(t, 'X')).not.toContain('IMPLEMENTATION_STATUS.md')
  })

  it('buildStartPrompt enhance 는 재작성 금지 + STATUS + repo 맥락', () => {
    const p = buildStartPrompt(t, 'X', 'enhance')
    expect(p).toContain('이어서 개선·확장')
    expect(p).toContain('처음부터 새 프로젝트를 만들지 마')
    expect(p).toContain('IMPLEMENTATION_STATUS.md')
    expect(p).toContain('가져온 그 저장소(repo) 안에서')
  })

  it('buildAgentContextMd enhance 는 STATUS 포인터 + 강화 안내, greenfield 엔 없음', () => {
    const gf = buildAgentContextMd(t, 'X', SPECS, null, 'claude', 'STAMP')
    const en = buildAgentContextMd(t, 'X', SPECS, null, 'claude', 'STAMP', 'enhance')
    expect(gf).not.toContain('IMPLEMENTATION_STATUS.md')
    expect(gf).not.toContain('기존 코드베이스를 가져온')
    expect(en).toContain('IMPLEMENTATION_STATUS.md')
    expect(en).toContain('기존 코드베이스를 가져온')
    // 기본 호출(mode 인자 없이)은 greenfield 와 동일 — 기존 호출부 회귀 방지.
    expect(buildAgentContextMd(t, 'X', SPECS, null, 'claude', 'STAMP')).toBe(gf)
  })

  it('buildImplementationStatus 분류: ✅ high / ⚠️ low / ⬜ missing / drift', () => {
    const lineage = {
      aggregates: [{ id: 'Order', name: 'Order', implementations: [{ filePath: 'src/order/Order.py', confidence: 'high', verified: true }] }],
      apis: [{ id: 'RefundApi', name: 'Refund', implementations: [{ filePath: 'src/api/refund.py', confidence: 'low', verified: false }] }],
      stories: [], services: [],
      missingImpl: [{ type: 'api', id: 'Cancel', name: 'Cancel Order', reason: '코드 미발견' }],
      drifts: [{ filePath: 'src/legacy/old.py' }],
    }
    const md = buildImplementationStatus(t, lineage, { repoUrl: 'https://github.com/u/r', stamp: 'S' })
    expect(md).toMatch(/✅ 이미 구현됨[\s\S]*Order[\s\S]*src\/order\/Order\.py/)
    expect(md).toMatch(/⚠️ 부분\/저신뢰[\s\S]*Refund/)
    expect(md).toMatch(/⬜ 아직 미구현[\s\S]*Cancel Order/)
    expect(md).toMatch(/drift[\s\S]*src\/legacy\/old\.py/)
    expect(md).toContain('https://github.com/u/r')
    expect(md).toContain('\n\n---')   // [회귀가드] drift 섹션과 '---' 구분선 사이 빈 줄 — 누락 시 _(없음)_ 가 CommonMark setext H2 로 오렌더되고 ko 골든 1바이트 회귀
  })

  it('buildImplementationStatus 빈 lineage → 빈 문자열(번들에서 제외)', () => {
    expect(buildImplementationStatus(t, null)).toBe('')
    expect(buildImplementationStatus(t, undefined)).toBe('')
  })
})

// [i18n 회귀 가드 — 2026-06-25] en locale 출력엔 한글이 섞이지 않아야 한다.
// 단, '⚠️ 미정' 마커는 보존 대상(번역 금지)이라 의도적으로 한글을 포함하므로 제거 후 검사.
const noHangul = (s) => /[가-힣]/.test(s.replace(/미정/g, ''))
describe('i18n — en 출력에 한국어 미포함', () => {
  it('buildStartPrompt(en) greenfield/enhance 에 한글 없음(보존 마커 제외)', () => {
    i18n.global.locale.value = 'en'
    expect(noHangul(buildStartPrompt(t, 'x'))).toBe(false)
    expect(noHangul(buildStartPrompt(t, 'x', 'enhance'))).toBe(false)
  })
  it('buildAgentContextMd / buildBuildPlanMd / buildLlmsTxt (en) 에 한글 없음(보존 마커 제외)', () => {
    i18n.global.locale.value = 'en'
    // PRD 본문은 사용자 입력 그대로(overview 에 인용)라 번역 대상이 아니므로 영문 spec 으로 검사.
    const EN_SPECS = { prd: '', architecture: '# A', ddd: '# D', spack: '# S', techStack: ['FastAPI'] }
    expect(noHangul(buildAgentContextMd(t, 'x', EN_SPECS, PLAN, 'agents', 'S', 'enhance'))).toBe(false)
    expect(noHangul(buildBuildPlanMd(t, PLAN, 'x'))).toBe(false)
    expect(noHangul(buildLlmsTxt(t, { prd: '', spack: '# x' }, 'x', false))).toBe(false)
  })
})
