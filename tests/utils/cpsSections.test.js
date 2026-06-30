/**
 * cpsSections 유틸 단위 테스트 — 4섹션 파싱 + 부분 교체 + 카운트.
 */
import { describe, it, expect } from 'vitest'
import {
  parseCpsSections,
  replaceCpsSection,
  countPrbs,
  countResolutions,
  parseProblemItems,
  parseResolutionItems,
  parsePendingGroups,
} from '@/utils/cpsSections'

const SAMPLE = `## 📄 CPS 명세서: TestProj (v1)

### 1. Context (배경 및 상황)

배경 텍스트.

### 2. Problem (핵심 문제)

- **[PRB-01] 첫 문제**: 상세
- **[PRB-02] 두 번째 문제**: 상세

### 3. Solution (최종 해결책 및 기획 방향)

- \`[RES-01] 해결안A\`: [매핑: PRB-01 .../...]
- \`[RES-02] 해결안B\`: [매핑: PRB-02 .../...]

### 4. Pending & Action Items

- TODO: 후속 작업

### ⚙️ Harness Journey Record

- 시스템 메타 (FE 표시 안 함)
`

describe('parseCpsSections', () => {
  it('4섹션을 순서대로 분해 — Journey 는 제외', () => {
    const out = parseCpsSections(SAMPLE)
    expect(out).toHaveLength(4)
    expect(out.map(s => s.id)).toEqual(['context', 'problem', 'solution', 'pending'])
    expect(out.map(s => s.num)).toEqual([1, 2, 3, 4])
  })

  it('각 섹션 content 에 해당 헤더가 포함', () => {
    const out = parseCpsSections(SAMPLE)
    expect(out[0].content).toMatch(/^### 1\. Context/)
    expect(out[1].content).toMatch(/^### 2\. Problem/)
    expect(out[1].content).toContain('PRB-01')
    expect(out[2].content).toContain('RES-01')
  })

  it('Journey Record 내용이 4섹션에 섞이지 않음', () => {
    const out = parseCpsSections(SAMPLE)
    for (const s of out) {
      expect(s.content).not.toContain('시스템 메타')
    }
  })

  it('빈/잘못된 입력 → 빈 배열', () => {
    expect(parseCpsSections('')).toEqual([])
    expect(parseCpsSections(null)).toEqual([])
    expect(parseCpsSections(undefined)).toEqual([])
    expect(parseCpsSections('no headers here')).toEqual([])
  })

  it('Journey Record 없어도 동작', () => {
    const md = SAMPLE.split('### ⚙️ Harness Journey')[0]
    const out = parseCpsSections(md)
    expect(out).toHaveLength(4)
  })
})

describe('replaceCpsSection', () => {
  it('Problem 섹션 교체 — 다른 섹션 + Journey 보존', () => {
    const newProblem = '### 2. Problem (핵심 문제)\n\n- **[PRB-99] 새 문제**: 교체됨'
    const out = replaceCpsSection(SAMPLE, 'problem', newProblem)
    expect(out).toContain('PRB-99')
    // Problem 섹션의 원본 라인(`**[PRB-01] 첫 문제**`)은 사라져야 함.
    // Solution 섹션의 매핑 텍스트(`[매핑: PRB-01 .../...]`)에는 여전히 PRB-01 가 등장하므로
    // 단순 toContain 으로 확인하면 안 됨 — 새 파싱 결과로 검증.
    const parsed = parseCpsSections(out)
    const newProblemSection = parsed.find(s => s.id === 'problem')
    expect(newProblemSection.content).not.toContain('첫 문제')
    expect(newProblemSection.content).toContain('새 문제')
    expect(out).toContain('### 1. Context')
    expect(out).toContain('### 3. Solution')
    expect(out).toContain('### 4. Pending')
    expect(out).toContain('### ⚙️ Harness Journey')
    expect(out).toContain('시스템 메타')
  })

  it('Pending(마지막 섹션) 교체 — Journey 살아있음', () => {
    const newPending = '### 4. Pending & Action Items\n\n- 새 후속'
    const out = replaceCpsSection(SAMPLE, 'pending', newPending)
    expect(out).toContain('새 후속')
    expect(out).not.toContain('TODO: 후속 작업')
    expect(out).toContain('### ⚙️ Harness Journey')
  })

  it('잘못된 id → 원본 그대로', () => {
    expect(replaceCpsSection(SAMPLE, 'unknown', 'x')).toBe(SAMPLE)
    expect(replaceCpsSection(SAMPLE, '', 'x')).toBe(SAMPLE)
  })

  it('newContent 가 문자열이 아님 → 원본 그대로', () => {
    expect(replaceCpsSection(SAMPLE, 'problem', null)).toBe(SAMPLE)
    expect(replaceCpsSection(SAMPLE, 'problem', undefined)).toBe(SAMPLE)
  })

  it('교체 결과를 다시 파싱하면 여전히 4섹션', () => {
    const newSolution = '### 3. Solution (최종 해결책 및 기획 방향)\n\n- 새 솔루션'
    const out = replaceCpsSection(SAMPLE, 'solution', newSolution)
    const parsed = parseCpsSections(out)
    expect(parsed).toHaveLength(4)
    expect(parsed[2].content).toContain('새 솔루션')
  })
})

describe('countPrbs / countResolutions', () => {
  it('Problem 섹션에서 PRB 갯수', () => {
    const sections = parseCpsSections(SAMPLE)
    const problem = sections.find(s => s.id === 'problem')
    expect(countPrbs(problem.content)).toBe(2)
  })

  it('Solution 섹션에서 RES 갯수', () => {
    const sections = parseCpsSections(SAMPLE)
    const solution = sections.find(s => s.id === 'solution')
    expect(countResolutions(solution.content)).toBe(2)
  })

  it('빈 문자열 → 0', () => {
    expect(countPrbs('')).toBe(0)
    expect(countResolutions('')).toBe(0)
    expect(countPrbs(null)).toBe(0)
  })
})

describe('parseProblemItems', () => {
  it('PRB 라인 추출 — id/summary/description', () => {
    const sections = parseCpsSections(SAMPLE)
    const problem = sections.find(s => s.id === 'problem')
    const items = parseProblemItems(problem.content)
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('PRB-01')
    expect(items[0].summary).toBe('첫 문제')
    expect(items[0].description).toBe('상세')
    expect(items[1].id).toBe('PRB-02')
    expect(items[1].summary).toBe('두 번째 문제')
  })

  it('빈/null → 빈 배열', () => {
    expect(parseProblemItems('')).toEqual([])
    expect(parseProblemItems(null)).toEqual([])
  })

  it('PRB 가 없으면 빈 배열', () => {
    expect(parseProblemItems('### 2. Problem\n\n본문만 있음.')).toEqual([])
  })
})

describe('parseResolutionItems', () => {
  it('RES 라인 추출 — id/summary/mappedTo', () => {
    const sections = parseCpsSections(SAMPLE)
    const solution = sections.find(s => s.id === 'solution')
    const items = parseResolutionItems(solution.content)
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('RES-01')
    expect(items[0].summary).toBe('해결안A')
    expect(items[0].mappedTo).toContain('PRB-01')
  })

  it('빈/null → 빈 배열', () => {
    expect(parseResolutionItems('')).toEqual([])
    expect(parseResolutionItems(null)).toEqual([])
  })
})

describe('parsePendingGroups', () => {
  it('미결정 사항 / Next Steps 같은 top-level 그룹 추출 + anchorId 인덱스', () => {
    const md = `### 4. Pending & Action Items
- **미결정 사항**:
  - 항목 1
- **Next Steps**:
  - 단계 1`
    const groups = parsePendingGroups(md)
    expect(groups).toHaveLength(2)
    expect(groups[0].title).toBe('미결정 사항')
    expect(groups[0].anchorId).toBe('pending-0')
    expect(groups[1].title).toBe('Next Steps')
    expect(groups[1].anchorId).toBe('pending-1')
  })

  it('들여쓰기된 nested bold sub-bullet 은 그룹에서 제외 (top-level 만)', () => {
    // 실제 데이터에서 발견된 케이스 — sub-bullet 안에 `**미결정 사항** / **Next Steps**:` 가
    // 있으면 이전 regex 는 잘못 매치했음. ^ anchor 추가로 차단.
    const md = `### 4. Pending & Action Items
- **미결정 사항**:
  - 자체 크롤러 ...
  - **미결정 사항** / **Next Steps**: 2026년 3월 9일 ...
- **Next Steps**:
  - 다음 미팅 ...`
    const groups = parsePendingGroups(md)
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.title)).toEqual(['미결정 사항', 'Next Steps'])
  })

  it('top-level bullet 가 없으면 빈 배열', () => {
    expect(parsePendingGroups('- 그냥 일반 bullet')).toEqual([])
    expect(parsePendingGroups('')).toEqual([])
  })

  it('[i18n] 전각 콜론 ：(일·중) + * 불릿 + 번역 제목도 추출', () => {
    // ja/zh 생성에서 라벨 콜론이 전각 '：' 로, 불릿이 '*' 로 나와도 그룹이 잡혀야 한다
    // (안 그러면 pending nav 가 통째로 빈다).
    const ja = `### 4. Pending & Action Items
- **未決事項**：
  - 項目 1
* **次のステップ**： 来週`
    const groups = parsePendingGroups(ja)
    expect(groups.map(g => g.title)).toEqual(['未決事項', '次のステップ'])

    const zh = `### 4. Pending & Action Items
- **未决事项**：内容`
    expect(parsePendingGroups(zh)[0].title).toBe('未决事项')
  })
})

describe('cpsSections — i18n (다국어 생성 견고성)', () => {
  it('parseResolutionItems: 매핑 라벨이 번역(Mapping/マッピング/映射)되거나 생략돼도 RES 추출', () => {
    const md = [
      '### 3. Solution',
      '- `[RES-01] Core`: [매핑: PRB-01 / ko body]',
      '- `[RES-02] Core`: [Mapping: PRB-02 / en body]',
      '- `[RES-03] Core`: [マッピング: PRB-03 / ja body]',
      '- `[RES-04] Core`: [映射: PRB-04 / zh body]',
      '- `[RES-05] Core`: [PRB-05 / no label]',
    ].join('\n')
    const items = parseResolutionItems(md)
    expect(items.map(i => i.id)).toEqual(['RES-01', 'RES-02', 'RES-03', 'RES-04', 'RES-05'])
    expect(items[1].mappedTo).toBe('PRB-02 / en body')
    expect(items[4].mappedTo).toBe('PRB-05 / no label')
  })

  it('parseCpsSections: Harness Journey 마커가 번역돼도 ⚙️ 앵커로 본문에서 분리', () => {
    const md = [
      '### 1. Context\nbody',
      '### 2. Problem\nbody',
      '### ⚙️ ハーネス記録',  // 번역된 journey 헤더
      '- State: planning',
    ].join('\n')
    const secs = parseCpsSections(md)
    // journey 이후는 섹션에서 제외 → context/problem 둘만
    expect(secs.map(s => s.id)).toEqual(['context', 'problem'])
    expect(secs.some(s => s.content.includes('ハーネス記録'))).toBe(false)
  })

  it('parseCpsSections: Journey 헤딩이 ## 또는 #### 로 와도 컷 포인트로 인식 (B1)', () => {
    // LLM 이 ### 대신 ## 또는 #### 를 쓰면 Journey 내용이 pending 섹션으로 새는 버그.
    for (const hashes of ['##', '###', '####']) {
      const md = [
        '### 1. Context\nbody',
        '### 2. Problem\nbody',
        '### 3. Solution\nbody',
        '### 4. Pending\nbody',
        `${hashes} ⚙️ Harness Journey`,
        '- LEAKED: should not appear',
      ].join('\n')
      const secs = parseCpsSections(md)
      expect(secs).toHaveLength(4)
      expect(secs.some(s => s.content.includes('LEAKED'))).toBe(false)
    }
  })

  it('parseResolutionItems: 라벨이 16자 초과(예: Problem Resolution)여도 mappedTo 에서 분리 (B2)', () => {
    // "Problem Resolution" = 18자 — 이전 {0,16} 한도에서는 라벨이 mappedTo 에 남았음.
    const md = `### 3. Solution
- \`[RES-01] Fix A\`: [Problem Resolution: PRB-01 / details]`
    const items = parseResolutionItems(md)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('RES-01')
    expect(items[0].mappedTo).toBe('PRB-01 / details')
  })
})
