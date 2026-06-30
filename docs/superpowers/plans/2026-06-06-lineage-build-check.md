# 코드 구현 점검 재설계 Implementation Plan

> **For agentic workers:** 인라인 TDD 실행(이 환경 서브에이전트 Bash 불가 → 컨트롤러가 직접 테스트/빌드/커밋). 단일 FE PR(base main). 큰 컴포넌트는 "기존 결과 UI를 '고급' 접기로 감싸고 그 위에 단순 카드"로 회귀 최소화.

**Goal:** deliverables 의 "산출물 계보(AI 분석)"를 비전문가용 **"내 기획대로 코드가 다 만들어졌나?" 확인 도구**로 재구성 — Story 중심 단순 결과 카드 1면 + 고급(개발자용) 접기.

**Architecture:** 파생 로직은 순수 util `lineageSummary.js`(단위테스트). `LineageSection.vue` 는 그걸 computed 로 얇게 소비 + 템플릿 재구성(빈 상태 가치안내, 단순 결과 카드, 기존 matrix/탭/품질/4버튼을 `<details>` 고급으로 이동). BE·분석 데이터·고급 기능 로직 무변경.

**Tech Stack:** Vue3 setup · vue-i18n · vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-lineage-build-check-redesign.md`

---

### Task 1: 순수 요약 util + 단위테스트

**Files:**
- Create: `src/utils/lineageSummary.js`
- Test: `tests/utils/lineageSummary.test.js`

- [ ] **Step 1: 실패 테스트 작성** `tests/utils/lineageSummary.test.js`

```js
import { describe, it, expect } from 'vitest'
import { buildLineageSummary } from '@/utils/lineageSummary'

const impl = (p) => ({ repoUrl: 'r', filePath: p, confidence: 'high' })

describe('buildLineageSummary', () => {
  it('빈 데이터 → 0/없음', () => {
    const s = buildLineageSummary(null)
    expect(s.storyTotal).toBe(0)
    expect(s.hasStories).toBe(false)
    expect(s.storyPct).toBe(0)
    expect(s.missingStories).toEqual([])
    expect(s.tech.apis).toEqual({ total: 0, mapped: 0 })
  })

  it('Story 3개 중 2개 구현 → pct 67, 미구현 1개(힌트 병합)', () => {
    const data = {
      stories: [
        { id: 'S1', name: '로그인', implementations: [impl('login.vue')] },
        { id: 'S2', name: '주문', implementations: [impl('order.js')] },
        { id: 'S3', name: '결제', description: '카드 결제', implementations: [] },
      ],
      missingImpl: [{ type: 'story', id: 'S3', name: '결제', reason: '매칭 파일 없음' }],
      apis: [{ id: 'A1', implementations: [impl('a.js')] }, { id: 'A2', implementations: [] }],
      aggregates: [{ id: 'G1', implementations: [impl('g.js')] }],
      services: [],
    }
    const s = buildLineageSummary(data)
    expect(s.storyTotal).toBe(3)
    expect(s.storyImplemented).toBe(2)
    expect(s.storyPct).toBe(67)
    expect(s.hasStories).toBe(true)
    expect(s.implementedStories.map(x => x.id)).toEqual(['S1', 'S2'])
    expect(s.missingStories).toEqual([{ id: 'S3', name: '결제', hint: '매칭 파일 없음' }])
    expect(s.tech.apis).toEqual({ total: 2, mapped: 1 })
    expect(s.tech.aggregates).toEqual({ total: 1, mapped: 1 })
    expect(s.tech.services).toEqual({ total: 0, mapped: 0 })
  })

  it('missingImpl 없으면 description 을 힌트로', () => {
    const s = buildLineageSummary({ stories: [{ id: 'S1', name: 'X', description: '설명', implementations: [] }] })
    expect(s.missingStories[0].hint).toBe('설명')
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/utils/lineageSummary.test.js` → FAIL (모듈 없음).

- [ ] **Step 3: 구현** `src/utils/lineageSummary.js`

```js
/**
 * [2026-06-06] Lineage 결과 → Story 중심 "구현 점검" 요약 (순수 함수, 단위테스트 대상).
 * 구현 여부는 implementations.length 로 직접 판정 — missingImpl 의존 X(이중카운트 회피).
 */
const implementedOf = (arr) => (arr || []).filter((it) => (it.implementations || []).length > 0)

export function buildLineageSummary(data) {
  const stories = (data && data.stories) || []
  const implemented = implementedOf(stories)
  const total = stories.length

  const reasonById = {}
  for (const m of (data && data.missingImpl) || []) {
    if (String(m.type || '').toLowerCase() === 'story') reasonById[m.id] = m.reason || ''
  }
  const missingStories = stories
    .filter((s) => !(s.implementations || []).length)
    .map((s) => ({ id: s.id, name: s.name || s.id, hint: reasonById[s.id] || s.description || '' }))

  const tech = {}
  for (const key of ['apis', 'aggregates', 'services']) {
    const arr = (data && data[key]) || []
    tech[key] = { total: arr.length, mapped: implementedOf(arr).length }
  }

  return {
    storyTotal: total,
    storyImplemented: implemented.length,
    storyPct: total ? Math.round((implemented.length / total) * 100) : 0,
    implementedStories: implemented,
    missingStories,
    hasStories: total > 0,
    tech,
  }
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run tests/utils/lineageSummary.test.js` → PASS.
- [ ] **Step 5: 커밋** `feat(lineage): Story 중심 요약 순수 util + 테스트`

---

### Task 2: 컴포저블 — 요약 computed + 친화 확신도 헬퍼

**Files:** Modify `src/composables/useLineageAnalysis.js`

- [ ] **Step 1: import + computed + export 추가** (matrixCoveragePct computed 아래, ~219행 뒤)

```js
import { buildLineageSummary } from '@/utils/lineageSummary'

// [2026-06-06 재설계] 단순 결과 카드용 Story 중심 요약.
const lineageSummary = computed(() => buildLineageSummary(lineageData.value))

// 단순 카드 전용 확신도 평어 (고급의 confidenceLabel 과 별개; 미등록 시 원본).
export const confidenceFriendly = (c) => {
  const t = i18n.global.t
  const key = `deliverables.lineage.result.conf_${c}`
  const val = t(key)
  return val !== key ? val : (c || '—')
}
```

- [ ] **Step 2: useLineageAnalysis return 에 `lineageSummary` 추가** (computed 묶음에 한 줄)

```js
    matrixCoveragePct,
    lineageSummary,
```

- [ ] **Step 3: 빌드 확인** — `npx vite build` → 성공(템플릿 미사용이라 lint만). 커밋은 Task 3 과 묶음.

---

### Task 3: LineageSection 템플릿 재구성 + i18n + 스타일

**Files:** Modify `src/components/deliverables/LineageSection.vue`, `src/locales/{ko,en,zh,ja}/deliverables.json`

**3a. i18n 신규/개편 키** (`deliverables.lineage.*`) — 4언어 동일 키. ko 값 예시:
```
"title": "내 기획, 코드에 다 들어갔나?"            (기존 "산출물 계보 (AI 분석)")
"desc": "기획한 기능(시나리오)이 실제 코드에 구현됐는지 AI가 한눈에 확인해드려요."
"result": {
  "headline": "기획한 시나리오 {done} / {total} 가 코드에 구현 확인",
  "headline_none": "기획에 사용자 시나리오가 아직 없어요 — PRD 부터 채워주세요",
  "missing_head": "🔴 아직 코드에서 안 보이는 것 {n}개",
  "all_done": "기획한 시나리오가 전부 코드에 있어요 🎉",
  "implemented_head": "✅ 코드에서 확인된 시나리오 {n}개",
  "where": "어디에 있나",
  "tech_rollup": "API {ax}/{at} · 데이터 {gx}/{gt} · 서비스 {sx}/{st} 구현됨",
  "advanced_toggle": "고급 (개발자용) — 상세 매핑·품질·이력",
  "conf_high": "정확히 찾음", "conf_medium": "비슷한 곳에서 찾음",
  "conf_low": "약하게 추정", "conf_unverified": "미확인"
},
"empty": {
  "value_title": "코드를 연결하면, 기획대로 다 만들어졌는지 자동으로 확인해드려요",
  "value_desc": "GitHub Repo 를 연결하고 점검을 누르면, 기획한 기능이 실제 코드 파일에 들어갔는지 대조해 빠진 것까지 콕 집어줘요.",
  "preview_caption": "이런 결과를 보게 돼요 👇",
  "connect_repo": "Repo 연결하기",
  "ready_title": "준비 완료",
  "ready_desc": "점검을 누르면 AI 가 기획 ↔ 코드를 대조해요 (약 1~2분)."
}
```
(en/zh/ja 는 같은 키에 번역. 기존 `empty.repo_needed`/`empty.cta` 는 새 키로 대체하되 미사용 키 제거.)

- [ ] **Step 1: import 에 `confidenceFriendly` 추가 + `lineageSummary` 구조분해** (LineageSection.vue 11행 import, 58행 묶음)
```js
import { useLineageAnalysis, confidenceColor, confidenceLabel, confidenceFriendly } from '@/composables/useLineageAnalysis'
// ...구조분해에 lineageSummary 추가
matrixCoveragePct, lineageSummary,
```
+ 상태색 헬퍼(setup 내):
```js
const statusEmoji = (pct) => (pct >= 80 ? '🎉' : pct >= 50 ? '🙂' : '⚠️')
const statusColor = (pct) => (pct >= 80 ? '#5BA160' : pct >= 50 ? '#E08A3C' : '#C0392B')
```

- [ ] **Step 2: 빈 상태(미연결/분석전) 교체** — 기존 128–152행(`lineage-empty-state` 정적 흐름도)를 가치-우선 안내로 교체:
```html
<div v-if="!lineageData && !isAnalyzingLineage" class="lineage-empty-state">
  <template v-if="!repos.length">
    <p class="lineage-empty-title serif-text">{{ $t('deliverables.lineage.empty.value_title') }}</p>
    <p class="lineage-empty-desc">{{ $t('deliverables.lineage.empty.value_desc') }}</p>
    <div class="lineage-preview" aria-hidden="true">
      <div class="lineage-preview-head">{{ $t('deliverables.lineage.empty.preview_caption') }}</div>
      <div class="lineage-preview-card">
        <div class="lineage-preview-bar"><span style="width:75%"></span></div>
        <div class="lineage-preview-line lineage-preview-line--miss"></div>
        <div class="lineage-preview-line"></div>
      </div>
    </div>
    <button type="button" class="analyze-btn" @click="emit('open-truth-io')">{{ $t('deliverables.lineage.empty.connect_repo') }}</button>
  </template>
  <template v-else>
    <p class="lineage-empty-title serif-text">{{ $t('deliverables.lineage.empty.ready_title') }}</p>
    <p class="lineage-empty-desc">{{ $t('deliverables.lineage.empty.ready_desc') }}</p>
    <button type="button" class="analyze-btn" :disabled="isAnalyzingLineage" @click="triggerAnalyzeLineage">
      <Activity :size="14" class="mr-2" aria-hidden="true" />{{ $t('deliverables.lineage.analyze') }}
    </button>
  </template>
</div>
```
(주의: "Repo 연결하기"는 실제 repo 등록 진입과 연결. 등록 진입이 별 컴포넌트면 emit 신설 대신 기존 동선 재사용 — 구현 시 deliverables.vue 의 repo 등록 트리거 확인 후 배선. 불명확하면 상단 repo 영역으로 스크롤/안내.)

- [ ] **Step 3: 결과 영역 상단에 단순 카드 삽입** — 기존 200행 `lineage-result` 안, zero-match 배너(202–219) 다음에 삽입:
```html
<!-- 단순 결과 카드 (Story 중심) -->
<div v-if="lineageSummary.hasStories" class="build-check">
  <div class="bc-headline">
    <div class="bc-verdict">
      <span class="bc-emoji">{{ statusEmoji(lineageSummary.storyPct) }}</span>
      <span class="bc-text">{{ $t('deliverables.lineage.result.headline', { done: lineageSummary.storyImplemented, total: lineageSummary.storyTotal }) }}</span>
    </div>
    <div class="bc-pct serif-text" :style="{ color: statusColor(lineageSummary.storyPct) }">{{ lineageSummary.storyPct }}<small>%</small></div>
  </div>
  <div class="bc-bar"><div class="bc-bar-fill" :style="{ width: lineageSummary.storyPct + '%', background: statusColor(lineageSummary.storyPct) }"></div></div>

  <!-- 아직 안 보이는 것 (먼저) -->
  <div v-if="lineageSummary.missingStories.length" class="bc-missing">
    <div class="bc-missing-head">{{ $t('deliverables.lineage.result.missing_head', { n: lineageSummary.missingStories.length }) }}</div>
    <ul class="bc-missing-list">
      <li v-for="m in lineageSummary.missingStories" :key="m.id" class="bc-missing-item">
        <span class="bc-missing-name">{{ m.name }}</span>
        <span v-if="m.hint" class="bc-missing-hint">{{ m.hint }}</span>
      </li>
    </ul>
  </div>
  <div v-else class="bc-alldone">{{ $t('deliverables.lineage.result.all_done') }}</div>

  <!-- 구현된 것 -->
  <details v-if="lineageSummary.implementedStories.length" class="bc-impl">
    <summary>{{ $t('deliverables.lineage.result.implemented_head', { n: lineageSummary.implementedStories.length }) }}</summary>
    <ul class="bc-impl-list">
      <li v-for="s in lineageSummary.implementedStories" :key="s.id" class="bc-impl-item">
        <span class="bc-impl-name">{{ s.name || s.id }}</span>
        <span class="bc-impl-where mono-text"
          role="button" tabindex="0"
          @click="openFile(s.implementations[0].repoUrl, s.implementations[0].filePath)"
          @keydown.enter.prevent="openFile(s.implementations[0].repoUrl, s.implementations[0].filePath)">
          {{ s.implementations[0].filePath }}
          <small class="bc-conf">{{ confidenceFriendly(s.implementations[0].confidence) }}</small>
        </span>
      </li>
    </ul>
  </details>

  <!-- 기술 항목 1줄 요약 -->
  <div class="bc-tech">
    {{ $t('deliverables.lineage.result.tech_rollup', {
      ax: lineageSummary.tech.apis.mapped, at: lineageSummary.tech.apis.total,
      gx: lineageSummary.tech.aggregates.mapped, gt: lineageSummary.tech.aggregates.total,
      sx: lineageSummary.tech.services.mapped, st: lineageSummary.tech.services.total }) }}
  </div>
</div>
<div v-else-if="!lineageHasZeroMatch" class="bc-no-story">{{ $t('deliverables.lineage.result.headline_none') }}</div>
```

- [ ] **Step 4: 기존 결과 UI(요약카드·탭·matrix·missing·품질·필터·리스트, 222–493행)를 고급 접기로 래핑** — 222행 직전 `<details class="lineage-advanced"><summary>{{ $t('deliverables.lineage.result.advanced_toggle') }}</summary>` 열고, 493행 list div 닫힘 직후 `</details>` 닫기. 헤더의 4 아이콘 버튼(100–111행)을 이 `<summary>` 옆 또는 details 내부 상단으로 이동(emit 유지). 내부 마크업·로직 변경 없음.

- [ ] **Step 5: 스타일 추가** — `.build-check`(카드: 크림 배경 #FFFBEB~흰, 브라운 보더), `.bc-headline/.bc-pct/.bc-bar`, `.bc-missing`(연빨강 #FEF2F2/보더 #FCA5A5, 맨 위 강조), `.bc-impl`(연녹/중립), `.bc-tech`(작은 회색), `.lineage-advanced > summary`(접기 토글, 회색 작게), `.lineage-preview*`(흐릿한 목업). 모바일 ≤600 카드 패딩 축소. 브랜드(브라운 액센트/골드, 크림) 유지.

- [ ] **Step 6: 빌드** — `npx vite build` → 성공. **i18n 패리티** node 검사(4언어 deliverables.json 동일 키).
- [ ] **Step 7: 커밋** `feat(lineage): 단순 결과 카드 + 고급 접기 + 가치-우선 빈 상태 + i18n`

---

### Task 4: 컴포넌트 테스트 + 프리뷰 더블체크

**Files:** Create `tests/components/lineageSection.test.js`

- [ ] **Step 1: 테스트** — 가짜 `lineageData`(useLineageAnalysis mock 또는 store mock)로: (a) 결과 시 헤드라인 `{done}/{total}` + 미구현 목록 맨 위 노출, (b) `<details.lineage-advanced>` 존재(고급 보존), (c) repos 없을 때 가치-안내+연결 버튼 렌더. 모킹은 기존 notion/eval 컴포넌트 테스트 패턴(`vi.mock` + i18n + pinia + VDialog/무거운 자식 stub) 따름.
- [ ] **Step 2: vitest run → PASS.**
- [ ] **Step 3: 프리뷰 더블체크** — dev 서버에서 로그인+프로젝트 상태 접근이 어려우면, 최소 빌드+컴포넌트 테스트로 갈음하고 결과는 스펙 구조 정합으로 확인. (가능하면 deliverables 진입해 빈 상태/결과 시각 확인)
- [ ] **Step 4: 커밋** `test(lineage): 상태별 렌더 + 고급 보존 회귀`

---

### Task 5: 검증 + PR + 머지

- [ ] `npx vite build` + 전체 `npx vitest run` green. branch `feat/lineage-build-check` → PR base main → CI → merge(운영 반영).

---

## Self-Review
- 스펙 §3.1 카피(3a) / §3.2 상태(Task3 S2,S3) / §3.3 결과카드(Task3 S3) / §3.4 고급 접기(Task3 S4) / §3.5 데이터 재사용(Task1,2 순수 util+computed) / §6 테스트(Task1,4) 전부 매핑.
- 비-placeholder: Task1 코드·테스트 완전. Task3 신규 마크업·신규 카피 구체화. 대형 기존 마크업은 "행 범위 래핑"으로 명시(반복 게재 불필요).
- 타입 정합: `lineageSummary.{storyTotal,storyImplemented,storyPct,implementedStories,missingStories{id,name,hint},hasStories,tech.{apis,aggregates,services}.{total,mapped}}` — Task1 정의 ↔ Task3 사용 일치. `confidenceFriendly` Task2 정의 ↔ Task3 사용 일치.
- 플랜 확인사항: "Repo 연결하기" 배선(Task3 S2 주석), 4버튼 이동 시 emit 유지(Task3 S4).
