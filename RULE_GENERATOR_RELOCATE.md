# Rule Generator → Design 서브탭으로 이동 (코딩 규칙 빈-stack 버그 수정)

> FE 전용 최소 변경 (BE 변경 없음). 대상 리포: `harness` (Vue 3 + Vuetify).
> 작업 브랜치: `claude/card-expansion-styling-8qskW`. base: `master`.
> **Option B 확정** — 새 상위 step 신설/다운로드 통합은 하지 않음(아래 "범위 밖" 참고).

---

## Context (왜 하는가)

- **Rule Generator(코딩 규칙)의 STEP 1 "Project stack" 은 Design 의 Architecture(`getArchitecture` → Arch 노드 `tech_stack`)에서만 나온다.** STEP 2 "AI 제안"도 plan + stack 을 쓴다.
- 그런데 Rule Generator 가 현재 **`01 Plan` 의 마지막 서브탭**(`plan.vue` tabs: `log→cps→prd→eslint`)이라 **`02 Design` 보다 먼저** 위치 → stack 이 항상 비어 "Create the design first…"(`rule.stack.no_design`) 만 뜬다. (정상 동작이지만 순서가 거꾸로.)
- **수정:** Rule Generator 를 Plan 에서 빼서 **Design 의 4번째 서브탭**으로 옮긴다. SPACK/DDD/Architecture 다음에 위치 → Architecture 가 생긴 뒤라 stack 이 정상 채워진다. 라우트/상위 step 번호/페이지 신설 없음 → **변경 최소·회귀 위험 최저.**

> **범위 밖(향후 별도 과제):** 바이브코딩 다운로드가 3곳(Design `VibePackageModal` · Code `AgentExportPanel` · Deliverables `HandoffSection`)에 분산돼 있음. 통합은 가치 있으나 이 작업과 분리. 여기서는 손대지 않는다.

---

## 현재 구조 (file:line, 탐색으로 확정)

**Plan 서브탭:** `src/pages/plan.vue`
- `tabs` computed (797–802): `log / cps / prd / eslint(=Rule Generator, subtitle 'Rule Generator', guide 'rule-generator-tab')`.
- `RuleGeneratorTab` import (12), 렌더 `v-if subTab==='eslint'` (1019–1021).
- 딥링크 `route.query.tab` 소비 (74–98).

**Design 페이지:** `src/pages/design.vue`
- store: `useHarnessStore()` → `store.projectName` (41행 등). ArchitectureTab 도 같은 store.
- 서브탭 상태 `const designTab = ref('spack')` (44). 서브탭 점프 메커니즘 존재: `jump.tab`(52), `designTab.value = designTab_`(513).
- `SubTabRow v-model="designTab"` (751–828): `spack / ddd / architecture`.
- 렌더 (882–884): `SpackTab v-if 'spack'` / `DddTab v-else-if 'ddd'` / `ArchitectureTab v-else-if 'architecture'`.
- (참고) 바이브 버튼/모달(649–659, 841) — **이번엔 안 건드림.**

**Rule Generator:** `src/components/plan/RuleGeneratorTab.vue` + `src/components/plan/rule/*` + `src/composables/useProjectStack.js`(getArchitecture) / `useSkillRegistry`. 프로젝트 스코프 skills CRUD라 **어느 페이지에 마운트하든 동작 동일** (이동 안전).

**rule 탭으로 가는 딥링크 2곳 (갱신 필요):**
- `src/components/plan/CpsTab.vue:816` → `@click="emit('navigate', 'eslint')"` (Plan 내부 탭 전환 emit).
- `src/pages/home.vue:194` → `route: '/plan?tab=eslint'`.

---

## 구현 단계

1. **Design 에 'rules' 서브탭 추가** `src/pages/design.vue`
   - `SubTabRow`(751–828) tabs 배열에 4번째 추가:
     `{ value: 'rules', title: $t('design.tabs.rules'), subtitle: 'Coding Rules', guide: 'rule-generator-tab' }`
   - 렌더(882–884 뒤)에 추가: `<RuleGeneratorTab v-else-if="designTab === 'rules'" :project-name="store.projectName" />`
   - `import RuleGeneratorTab from '@/components/plan/RuleGeneratorTab.vue'` 추가.
   - 컴포넌트 자체 수정 불필요 — stack 은 같은 페이지 Architecture 에서 채워짐.

2. **Plan 에서 Rule Generator 제거** `src/pages/plan.vue`
   - tabs 배열(797–802)에서 `eslint` 항목 삭제 → `log / cps / prd`.
   - 렌더 블록(1019–1021) + import(12) 삭제.

3. **딥링크 갱신 (rule 탭이 Plan→Design 으로 이동)**
   - `src/components/plan/CpsTab.vue:816`: `emit('navigate','eslint')` 는 이제 Plan 에 없는 탭 → **Design 의 rules 서브탭으로 이동**하도록 변경. 예: `router.push('/design?tab=rules')` (design.vue 의 `jump.tab` 점프가 query 를 읽는지 확인 후, 안 읽으면 query 소비 로직 추가 — plan.vue 74–98 패턴 참고). 이 CTA 가 CpsTab 의 부모(plan.vue)로 emit 되어 처리되던 구조면, plan.vue 의 해당 핸들러를 라우터 이동으로 교체.
   - `src/pages/home.vue:194`: `route: '/plan?tab=eslint'` → `'/design?tab=rules'`. 잠금조건 `unlocked: s.prd` 는 그대로 둘지(규칙은 design 후가 자연스러우니 `s.prd` 유지 가능) 검토.
   - grep 재확인: `tab: 'eslint'`, `tab=eslint`, `'eslint'`, `navigate', 'eslint`.

4. **design.vue 가 `?tab=rules` 딥링크를 여는지 확인/보강**
   - 44/52/513 의 `designTab`/`jump.tab` 가 `route.query.tab` 을 소비하는지 확인. 소비하면 'rules' 만 허용값에 포함되게. 안 하면 plan.vue(74–98)처럼 mounted 시 `route.query.tab` → `designTab` 반영 추가.

5. **i18n (4개 로케일: en/ko/zh/ja)**
   - `design.json` 의 `tabs.*`(spack/ddd/architecture 가 정의된 위치 — 실제 키 경로 확인 후) 옆에 `tabs.rules` 추가. 라벨은 기존 `plan.tab.eslint` 값("Coding Rules" 등) 재사용/이전.
   - `plan.json` 의 `tab.eslint` 는 미사용 시 제거(또는 보존해도 무방).
   - `rule.*` 문자열 변경 없음(컴포넌트 그대로 이동).
   - 4개 로케일 동일 키로 일괄 추가.

---

## 검증 (end-to-end)

1. `npm run dev` (프로젝트 표준) → **Plan** 서브탭이 `Meeting Log / CPS / PRD` 만 (Coding Rules 사라짐).
2. **Design** 서브탭이 `SPACK / DDD / Architecture / Coding Rules` 4개로 표시.
3. **핵심 회귀:** Architecture 생성 전 Coding Rules 서브탭 → "Create the design first…" (단, 이제 같은 Design 화면이라 바로 옆에서 Architecture 생성 가능). **Architecture 생성 후 → STEP 1 Project stack 에 FE/BE/DB 칩이 채워짐.** (빈-stack 문제 해소 확인)
4. STEP 2 AI 제안 + STEP 3 수동 규칙 CRUD 정상.
5. 딥링크: `CpsTab` 의 규칙 CTA, `home.vue` 강점 카드 클릭 → Design 의 rules 서브탭으로 정상 이동. 옛 `/plan?tab=eslint` 잔존 없음.
6. `npm run build` / SFC compile 통과. 콘솔 에러·깨진 i18n 키(`{{ key }}` 노출) 없음. 4개 로케일 라벨 정상.

---

## 리스크/주의

- **딥링크 2곳**(CpsTab:816, home.vue:194) 누락 시 죽은 링크 — 반드시 갱신 + grep 재확인.
- design.vue 가 `?tab=rules` 를 안 열면 CTA 가 spack 으로 떨어짐 → 4번 항목으로 보강.
- `design.tabs.*` i18n 실제 키 경로 확인(en/design.json 단순 grep 으로 안 잡혔음 — 중첩/다른 파일일 수 있음).
- Coding Rules 는 'design graph'(spack/ddd/arch)와 성격이 다른 skills CRUD지만, "Design 직후" 라는 위치 의미상 자연스러움.

## 작업 순서 요약 (다음 세션 체크리스트)

- [ ] design.vue: rules 서브탭 추가 + RuleGeneratorTab 렌더/import
- [ ] plan.vue: eslint 탭/렌더/import 제거
- [ ] 딥링크 갱신: CpsTab.vue:816, home.vue:194 (+ grep 재확인)
- [ ] design.vue `?tab=rules` 딥링크 소비 확인/보강
- [ ] i18n 4개 로케일: `design.tabs.rules` 추가, `plan.tab.eslint` 정리
- [ ] 검증 1~6
- [ ] 커밋·푸시·PR (base master, 브랜치 `claude/card-expansion-styling-8qskW`)
