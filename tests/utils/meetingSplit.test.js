import { describe, it, expect } from 'vitest'
import { parseLogEntries } from '@/utils/meetingSplit'

// [2026-06 양식 자유화] 기존 BatchPanel 파서는 `\n---\n` 구분 + `[미팅 로그` 하드 필터라
// 자유 양식 문서가 "0건 감지"로 무음 탈락했다. 새 파서: 필터 제거 + 구분자/헤더 휴리스틱 +
// 버전 자동 부여(배치 내 유일성 보장 — 동일 버전이 같은 배치에서 서로 덮어쓰지 않게).

const LEGACY_DOC = [
  '# 🤖 [AI 계정 관리] 미팅 로그 (V1 ~ V3)',
  '',
  '## [Phase 1: 현황 진단]',
  '',
  '### [미팅 로그 V1] - 킥오프: 목표와 범위 확정',
  '* **일시:** 2026-02-03',
  '* **PO:** "중복 결제가 적발됐습니다."',
  '---',
  '### [미팅 로그 V2] - 신청 프로세스 설계',
  '* **PM:** "신청 양식을 설계합시다."',
  '---',
  '### [미팅 로그 V3] - 승인 라인 결정',
  '* **PL:** "팀장 1차 검토로 갑니다."',
].join('\n')

describe('parseLogEntries — 기존 양식 호환', () => {
  it('레거시 양식(### [미팅 로그 Vn] - 제목 + ---)은 기존과 동일하게 파싱', () => {
    const entries = parseLogEntries(LEGACY_DOC)
    expect(entries.map(e => e.version)).toEqual(['V1', 'V2', 'V3'])
    expect(entries[0].title).toBe('킥오프: 목표와 범위 확정')
    expect(entries[1].title).toBe('신청 프로세스 설계')
    expect(entries[0].content).toContain('중복 결제')
  })

  it('CRLF 입력도 동일 파싱 (Windows .txt 업로드)', () => {
    const entries = parseLogEntries(LEGACY_DOC.replace(/\n/g, '\r\n'))
    expect(entries.map(e => e.version)).toEqual(['V1', 'V2', 'V3'])
  })
})

describe('parseLogEntries — 양식 자유화 (구 파서의 무음 탈락 제거)', () => {
  it('[미팅 로그 마커 없는 --- 구분 문서: 구 파서는 0건, 이제 전부 감지', () => {
    const doc = [
      '첫 회의 내용입니다. 결제 모듈을 Paddle 로 바꾸기로 했습니다.',
      '---',
      '두 번째 회의: 보안 서약 전자서명을 도입합니다.',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.version)).toEqual(['V1', 'V2'])  // 자동 부여
    expect(entries[0].title).toBeNull()                         // 컴포넌트가 기본 제목 채움
  })

  it('--- 없이 회의 헤더(## 회의록 ...)가 반복되면 헤더 기준 분할', () => {
    const doc = [
      '## 회의록 V1 - 킥오프',
      '내용 A입니다.',
      '',
      '## 회의록 V2 - 설계 리뷰',
      '내용 B입니다.',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.version)).toEqual(['V1', 'V2'])
    expect(entries[0].title).toBe('킥오프')
    expect(entries[1].content).toContain('내용 B')
  })

  it('날짜 헤더(## 2026-06-01 ...)도 회의 경계로 인식 — 버전은 자동, 제목은 헤더 라인', () => {
    const doc = [
      '## 2026-06-01 주간 회의',
      '안건: 토큰 비용.',
      '',
      '## 2026-06-08 주간 회의',
      '안건: PRD 누락.',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.version)).toEqual(['V1', 'V2'])
    expect(entries[0].title).toContain('2026-06-01')
  })

  it('구분자가 전혀 없는 자유 줄글은 1건으로 등록 (탈락 아님)', () => {
    const doc = '오늘 회의에서는 미팅 로그 양식 자유화를 논의했고, 분할 휴리스틱을 도입하기로 했다.'
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(1)
    expect(entries[0].version).toBe('V1')
    expect(entries[0].content).toBe(doc)
  })

  it('빈 섹션은 제외, 헤딩만 있는 구분 청크(## [Phase 2])는 다음 엔트리에 합침', () => {
    const doc = [
      '### [미팅 로그 V1] - 첫 회의',
      '내용 1',
      '---',
      '## [Phase 2: 확장]',
      '---',
      '### [미팅 로그 V2] - 두 번째',
      '내용 2',
      '---',
      '   ',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(2)
    expect(entries[1].content).toContain('[Phase 2: 확장]')   // 유실 아님 — 다음 회의에 합류
    expect(entries[1].content).toContain('내용 2')
  })

  it('마커 없는 실질 내용 청크(예: 프로젝트 최종 요약)도 엔트리로 노출 — 무음 탈락 금지', () => {
    const doc = [
      '### [미팅 로그 V1] - 첫 회의',
      '내용 1',
      '---',
      '## 📊 프로젝트 최종 요약',
      '이 프로젝트는 신청·승인·배정·관리 4단계로 구성되며 비용 30% 절감을 목표로 한다.',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(2)
    expect(entries[1].version).toBe('V2')                      // 자동 부여
    expect(entries[1].title).toContain('프로젝트 최종 요약')
  })

  it('소문자 문서버전 표기 "(v0.3 → v1.2)" 를 회의 버전으로 오인하지 않음 (실샘플 회귀)', () => {
    const doc = [
      '### [미팅 로그 V1] - 첫 회의',
      '내용 1',
      '---',
      '## 📊 프로젝트 최종 요약 (v0.3 → v1.2)',
      '요약 본문입니다. 충분한 길이의 실질 내용.',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries[1].version).toBe('V2')                       // V0 아님 — 자동 부여
    expect(entries[1].title).toBe('📊 프로젝트 최종 요약 (v0.3 → v1.2)')  // 제목 훼손 없음
  })

  it('[과분할 방지] 단일 회의 안의 섹션 헤딩(## 회의 개요/내용/결론)으로 쪼개지 않음', () => {
    const doc = [
      '## 회의 개요',
      '참석자: PO, PM. 안건: 결제 모듈 전환.',
      '',
      '## 회의 내용',
      'Paddle 로 전환하기로 합의. 보안 서약 전자서명 도입.',
      '',
      '## 회의 결론',
      '다음 주까지 신청 양식 초안 작성.',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(1)   // 한 회의 — 섹션 헤딩은 경계 아님
  })

  it('[과분할 방지] 헤딩 중간의 날짜(## 1차 출시일정: 2026-07-01)는 회의 경계 아님', () => {
    const doc = [
      '## 1차 출시일정: 2026-07-01 확정',
      '백엔드 배포 먼저.',
      '',
      '## 2차 출시일정: 2026-08-15 예정',
      '프론트 기능 플래그로.',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries).toHaveLength(1)   // 날짜는 헤딩 "시작"일 때만 경계 (## 2026-06-01 ...)
  })

  it('[기존 버전 보호] reserved 버전은 자동 부여가 피해감 — 명시 버전은 의도적 덮어쓰기로 유지', () => {
    const doc = [
      '첫 번째 무버전 회의 메모입니다.',
      '---',
      '### [미팅 로그 V2] - 재업로드한 회의',
      '명시 버전은 기존 V2 를 덮어쓰려는 의도.',
      '---',
      '두 번째 무버전 회의 메모입니다.',
    ].join('\n')
    const entries = parseLogEntries(doc, { reserved: ['V1', 'V2', 'V26'] })
    expect(entries[1].version).toBe('V2')          // 명시 → 유지 (의도적 덮어쓰기, UI 태그 표시)
    expect(entries[0].version).toBe('V27')          // 자동 → 기존(V26까지) 뒤로
    expect(entries[2].version).toBe('V28')
    // autoVersion 마킹 — 자동 부여 엔트리는 배치 pre-cleanup(silent 삭제)을 타면 안 됨.
    // 어떤 경로로든(타이밍 엣지 등) 기존 버전과 겹쳐도 사용자 데이터 silent 파괴 불가.
    expect(entries[0].autoVersion).toBe(true)
    expect(entries[1].autoVersion).toBe(false)      // 명시 버전 = 의도적 교체만 삭제 허용
    expect(entries[2].autoVersion).toBe(true)
  })

  it('중복/충돌 버전은 배치 내에서 유일하게 재부여 (BE 동일-id 덮어쓰기 방지)', () => {
    const doc = [
      '### [미팅 로그 V3] - 회의 A',
      '내용 A',
      '---',
      '### [미팅 로그 V3] - 회의 B (오타로 중복)',
      '내용 B',
    ].join('\n')
    const entries = parseLogEntries(doc)
    expect(entries[0].version).toBe('V3')
    expect(entries[1].version).not.toBe('V3')                  // 재부여
    expect(new Set(entries.map(e => e.version)).size).toBe(2)
  })
})

// ─── 번들 샘플 파일 회귀 가드 (2026-06-11) ──────────────────────
// BatchPanel 의 샘플은 이 파서로 분할돼 데모의 첫인상을 만든다 — 파일을 고치거나
// 파서 휴리스틱을 바꿀 때 분할이 깨지면 "샘플인데 0건/파편" 사고. 실제 파일로 고정.
import roomSampleRaw from '../../샘플 미팅 로그/회의실_예약_시스템_미팅_로그.txt?raw'

describe('번들 샘플 — 회의실 예약 시스템', () => {
  it('정확히 6건(V1~V6)으로 분할되고 제목·본문이 온전하다', () => {
    const entries = parseLogEntries(roomSampleRaw)
    expect(entries).toHaveLength(6)
    expect(entries.map(e => e.version)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
    expect(entries[0].title).toContain('킥오프')
    expect(entries[5].title).toContain('MVP')
    // 각 회의가 BE 최소 분량(200자)을 충분히 넘는다 — 배치 등록 시 422 방지.
    for (const e of entries) expect(e.content.length).toBeGreaterThan(500)
    // 명시 버전 표기가 그대로 인식됐다 (autoVersion 아님).
    for (const e of entries) expect(e.autoVersion).toBe(false)
  })
})
