# 산출물 계보 → "코드 구현 점검" 사용자 친화 재설계

- **Date**: 2026-06-06
- **Status**: Approved (design) → implementation
- **Repo**: FE `C:\project\harness` (BE 변경 없음)
- **Scope**: `deliverables.vue` 의 Lineage 섹션(`LineageSection.vue`) FE 표현/카피 전면 재구성

## 1. 문제 / 목표
deliverables 페이지의 **"산출물 계보 (AI 분석)"** 는 분석 전 화면이 ERD/워크플로우처럼 보이고(`Meeting Log → CPS·PRD → SPACK/DDD/Architecture → repo`), `PRD Story·DDD Aggregate·SPACK API·Architecture Service`, `계보/drift/matrix/정답라벨/precision·recall` 같은 전문용어가 가득해 **비전문가가 "무엇을·왜" 하는지 못 읽고 이탈**한다.

실제로 이 기능은 repo 연결 후 AI가 **"기획한 기능이 실제 코드 어느 파일에 구현됐는지"** 를 대조해 커버리지·미구현·drift 를 알려주는 **"내 기획대로 코드가 다 만들어졌나?" 확인 도구**다. 이 가치를 비전문가가 즉시 이해하도록 표현을 재구성한다.

**결정 사항(브레인스토밍):**
- 방향 = **확인 도구로 단순화** (고급 기능은 삭제 ✕ → '고급/개발자용'으로 접어두기).
- 표시 단위 = **사용자 시나리오(PRD Story) 중심** (가장 사람 말에 가까움).
- 화면 모양 = **결과 카드 1면 + 고급 접기**.

## 2. 검증된 현재 메커니즘 (재사용 기반, BE 무변경)
- **컴포넌트**: `src/components/deliverables/LineageSection.vue` (deliverables.vue:371 에서 렌더, props `repos/repoRoleByUrl/openFile`, emits `open-truth-io/open-badge/open-diff/open-graph`).
- **상태 관리**: `useLineageAnalysis.js`(모듈 싱글톤 — `lineageData/isAnalyzing/lineageMsg/탭·필터/진행단계`), `useLineageQuality.js`(정답라벨·precision/recall/F1).
- **BE 결과 `LineageResultData`** (그대로 사용):
  - `stories[] / aggregates[] / apis[] / services[]` 각 `{ id, name, description?, endpoint?(api), implementations:[{ repoUrl, role?, filePath, confidence:'high'|'medium'|'low', reason?, verified }] }`
  - `missingImpl[] { type, id, name, reason }` · `drifts[] { kind, repoUrl, filePath, symbol, hint }`
  - `stats { storiesCount, aggregatesCount, apisCount, servicesCount, totalImpls, verifiedImpls, missingCount, driftCount }`
- **현재 결과 UI**: 6탭(matrix/aggregates/apis/services/stories/missing), matrix 표(TYPE/ID/NAME/구현위치/STATUS) + 필터, 품질(P/R/F1), 상단 4버튼(정답라벨 IO·뱃지·이력·그래프).
- **분석 진행**: 3단계 마커(`lineage:fetch/trees → match → saving`) + 경과시간.
- **i18n**: `src/locales/{ko,en,zh,ja}/deliverables.json` 의 `deliverables.lineage.*`.

## 3. 설계

### 3.1 재정의 & 카피 (전문용어 제거)
- 제목: `산출물 계보 (AI 분석)` → **"내 기획, 코드에 다 들어갔나?"** + 작은 태그 `AI 자동 점검`.
- 설명: → **"기획한 기능(시나리오)이 실제 코드에 구현됐는지 AI가 한눈에 확인해드려요."**
- 평어 교체: lineage/계보→"코드 구현 점검", drift→"기획에 없는 코드", missing→"아직 코드에서 안 보이는 것", confidence high/medium/low→"정확히 찾음 / 비슷한 거 찾음 / 약하게 추정". (matrix/aggregate/precision 등은 '고급' 안에서만 등장)

### 3.2 상태별 화면
1. **repo 미연결** (현재 ERD 흐름도 자리): 가치 먼저 — *"코드(GitHub)를 연결하면, 기획한 기능이 다 만들어졌는지 자동 대조해드려요."* + **흐릿한 결과-카드 미리보기**("이런 걸 보게 돼요") + `[Repo 연결하기]`(기존 repo 등록 진입 재사용).
2. **연결됨·분석 전**: *"준비 완료 — 점검을 누르면 AI가 기획↔코드를 대조해요 (약 1~2분)."* + 큰 `[점검 시작]`.
3. **분석 중**: 기존 3단계 진행바 유지, 카피만 친화화("코드 읽는 중 → 기획과 맞춰보는 중 → 확인 중") + 경과시간.
4. **결과**: 3.3 결과 카드.
5. **0 매칭**: 기존 진단 배너 유지 + 친절 카피(흔한 원인 3가지 + 재시도).
6. **에러**: 친절 배너/토스트 + `[다시 시도]`.

### 3.3 결과 카드 (핵심 1면, 위→아래)
1. **판정 헤드라인**: **"기획한 시나리오 {구현}/{전체} 가 코드에 구현 확인 · {pct}%"** + 진행바 + 상태(🎉 ≥80 / 🙂 50–79 / ⚠️ <50; 색은 기존 pctColor 톤).
   - 계산: 전체 = `stats.storiesCount`(없으면 `stories.length`), 구현 = `stories` 중 `implementations.length>0` 개수. pct = 구현/전체.
2. **🔴 아직 코드에서 안 보이는 것 (맨 위, actionable)**: `missingImpl` 중 `type==='story'` + `stories` 중 impl 0개 → 시나리오 이름 + 힌트(reason). *"이건 아직 안 만들어졌어요"* 톤. 0개면 "전부 구현 확인됨 🎉".
3. **✅ 구현된 것**: impl 있는 `stories` 목록 — 이름 + 펼치면 "어디에 있나"(filePath 클릭→GitHub, 기존 openFile) + 확신도 평어. (기존 펼침/검색 재사용, 단 confidence 라벨 평어화)
4. **기술 항목 1줄 요약(안심용)**: *"API {x}/{n} · 데이터 {x}/{n} · 서비스 {x}/{n} 구현됨 — 자세히"* → 클릭 시 3.4 고급 펼침. (숫자는 stats/각 배열에서 계산)
5. **▸ 고급 (개발자용)** — 기본 접힘.

### 3.4 고급(개발자용) 접기 — 전부 보존, 무손실
기존 **matrix(필터·커버리지) · 종류별 탭(aggregates/apis/services) · drift · 품질(precision/recall/F1·정답라벨)** + 상단 4버튼(정답라벨 IO·뱃지·이력·그래프)을 이 접기 영역으로 이동. 동작·데이터 변경 없음(위치만 이동). 펼치면 현행 UI 그대로.

### 3.5 데이터 흐름 / 재사용
- **BE 무변경.** `triggerAnalyzeLineage()` / `lineageData` / `useLineageQuality` 그대로.
- 신규 computed(FE): `storyImplemented/storyTotal/storyPct`, `missingStories`, `implementedStories`, `techRollup({apis,aggregates,services} 각 mapped/total)`. 모두 기존 `lineageData`/`stats` 파생.
- Story↔API 자동 그룹핑은 데이터 링크 불확실 → **v1 제외**(기술 항목은 종류별로 고급에서 표시).

## 4. 에러 / 엣지
- repo 미연결: 점검 버튼 비활성 + 연결 안내(크래시 ✕).
- 0 매칭: 진단 배너(원인 + 재시도).
- 분석 실패(타임아웃/quota): 친절 배너 + 재시도, 기존 결과 있으면 유지.
- story 0개(설계에 Story 없음): 헤드라인 대신 "기획에 사용자 시나리오가 아직 없어요 — PRD 먼저 채워주세요" 안내.

## 5. 범위
- **v1 포함**: 카피/상태/결과카드 재구성, Story 중심 헤드라인+미구현 우선, 기술 1줄 요약, 고급 접기(기존 기능 이동·보존), repo 미연결 가치 안내+미리보기, i18n 4언어 개편, 반응형/브랜드.
- **v1 제외(YAGNI)**: BE 매칭 알고리즘/스키마 변경, 새 분석 종류, 품질 로직 변경(이동만), Story→API 자동 그룹핑, repo 등록 플로우 자체 재설계(진입 버튼만 친절화).

## 6. 테스트
- 단위(vitest): 신규 computed(storyPct/missingStories/implementedStories/techRollup) — 가짜 `lineageData` 로 경계값(0건/전부/일부). confidence→평어 매핑.
- 컴포넌트: 상태별 렌더(미연결/분석전/결과/0매칭) 분기, 고급 접기 토글, 미구현 목록 맨 위 노출.
- 회귀: 기존 고급 기능(matrix/품질/4버튼) 렌더·이벤트 유지.
- 빌드 + 프리뷰 시각 확인(중간 체크포인트).

## 7. 미해결 / 플랜 확인사항
- `missingImpl` 에 story 항목이 실제로 담기는지(아니면 `stories` 중 impl 0 만으로 미구현 판정해야 하는지) — 플랜에서 실제 데이터로 확인.
- 확신도 평어 매핑 위치(기존 i18n `matrix.filters.high/medium/low` 재사용 vs 신규 키).
- 고급 접기로 옮길 때 기존 4버튼 emit/다이얼로그 배선 유지 확인.
