/**
 * prdScreens.js — Screen 추출 단일 출처 (심층검수 #7 드리프트 방지).
 * obsidianExport vault Screen 노트 ↔ 기획 lint 항목이 같은 규칙을 쓰는지 가드.
 */
import { describe, it, expect } from 'vitest'
import { extractScreenNames } from '@/utils/prdScreens'

describe('extractScreenNames', () => {
  it('🖥️ [Screen: 이름], 헤딩 레벨 2~4, Screen: 접두 제거 (🖥 필수·VS16 옵셔널 — 원본 정규식 보존)', () => {
    const md = '### 🖥️ [Screen: 대시보드]\n내용\n#### 🖥️ [설정]\n## 🖥 [Screen: 로그인]'  // VS16 없는 🖥 도 OK
    expect(extractScreenNames(md)).toEqual(['대시보드', '설정', '로그인'])
  })
  it('🖥 이모지 없는 헤딩은 비매칭(원본 동작), 빈 입력 안전', () => {
    expect(extractScreenNames('### [홈]\n그냥 [텍스트]')).toEqual([])  // 🖥 없음 → 미매칭
    expect(extractScreenNames('')).toEqual([])
    expect(extractScreenNames(null)).toEqual([])
  })
  it('연속 호출에 lastIndex 누수 없음(매 호출 새 정규식)', () => {
    const md = '### 🖥️ [A]\n### 🖥️ [B]'
    expect(extractScreenNames(md)).toEqual(['A', 'B'])
    expect(extractScreenNames(md)).toEqual(['A', 'B'])  // 두 번째도 동일
  })
})

describe('extractScreenNames — i18n (다국어 생성 견고성)', () => {
  it("번역된 'Screen:' 접두(화면/画面/界面/スクリーン)도 제거", () => {
    const md = [
      '### 🖥️ [Screen: Dashboard]',
      '#### 🖥️ [画面: ダッシュボード]',
      '### 🖥️ [界面: 仪表盘]',
      '## 🖥️ [화면: 대시보드]',
    ].join('\n')
    expect(extractScreenNames(md)).toEqual(['Dashboard', 'ダッシュボード', '仪表盘', '대시보드'])
  })

  it('무괄호 폼 🖥️ Screen: 이름 (비-ko 모델이 [] 떨군 케이스) 도 추출', () => {
    const md = [
      '#### 🖥️ Screen: Dashboard',
      '#### 🖥️ [Screen: Settings]',   // 괄호 폼과 혼재해도 둘 다
      '### 🖥️ screen: Profile',        // 소문자 (i 플래그)
    ].join('\n')
    expect(extractScreenNames(md)).toEqual(['Dashboard', 'Settings', 'Profile'])
  })

  it('이모지 없는 무괄호 헤딩은 여전히 비매칭(프로즈 오탐 차단)', () => {
    // 🖥 필수 — 'Screen:' 단어가 일반 헤딩/산문에 있어도 화면으로 오인하지 않음.
    expect(extractScreenNames('### Screen: not a screen heading')).toEqual([])
  })

  it("중국어 '屏幕:' 접두 + 전각 콜론 '：' 도 제거", () => {
    const md = [
      '### 🖥️ [屏幕: 登录]',        // zh 'screen' = 屏幕 (접두 제거 대상)
      '#### 🖥️ [画面：ダッシュボード]',  // 전각 콜론 ：
    ].join('\n')
    expect(extractScreenNames(md)).toEqual(['登录', 'ダッシュボード'])
  })

  it('[normalize-우선] 무괄호 + 번역된 라벨(画面:/界面:/화면:)도 추출', () => {
    // 모델이 대괄호를 떨구고 'Screen:' 라벨까지 번역한 헤더 — 종전 정규식은 통째로 누락했음.
    const md = [
      '#### 🖥️ 画面: ダッシュボード',   // ja 무괄호 + 번역 라벨
      '#### 🖥️ 界面：仪表盘',           // zh 무괄호 + 전각 콜론
      '### 🖥️ 화면: 대시보드',          // ko 무괄호
      '#### 🖥️ Screen: Plain',          // en 무괄호 (회귀 0)
    ].join('\n')
    expect(extractScreenNames(md)).toEqual(['ダッシュボード', '仪表盘', '대시보드', 'Plain'])
  })
})
