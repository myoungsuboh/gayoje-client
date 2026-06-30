# Notion Export — Frontend Implementation Plan

> **For agentic workers:** TDD where testable (API helper, dialog logic via vitest); inline execution (subagents can't run `pnpm`). Repo `C:\project\harness`. Run: `pnpm build`, `pnpm exec vitest run <file>`. BE endpoint `POST /api/v2/notion/export` is live (PR #150 merged).

**Goal:** A "Notion 공유" button + dialog that exports CPS/PRD/Design to the user's Notion via the BE endpoint, with a destination picker on first export, progress, per-doc results, connect-gating, and 4-language i18n.

**Architecture:** Add `exportToNotionApi` to `notion.js`. New `NotionExportDialog.vue` (doc checkboxes → call API → on `need_parent` reveal `NotionPageList` picker → re-call with `parent_page_id` → show results). Entry buttons on Deliverables (all docs) + plan CPS/PRD tabs + design page (per-doc), each gating on Notion connection.

**Spec:** `docs/superpowers/specs/2026-06-05-notion-export-design.md`

---

## File Structure
- Modify `src/utils/notion.js` — add `exportToNotionApi({projectName, docs, parentPageId, teamId})`.
- Create `src/components/plan/NotionExportDialog.vue` — the export UI (reuses `NotionPageList`).
- Modify `src/locales/{ko,en,zh,ja}/plan.json` — extend `notion` with `export_*` keys.
- Modify `src/pages/deliverables.vue` — "Notion으로 공유" button (docs=all) + dialog mount.
- Modify `src/pages/plan.vue` — CPS/PRD per-doc "Notion" buttons + dialog mount (or shared).
- Modify `src/pages/design.vue` — "Notion 공유" button (docs=["design"]) + dialog mount.
- Tests: `tests/utils/notionExport.test.js`, `tests/components/notionExportDialog.test.js`.

---

## Task FE-1: `exportToNotionApi`

**Files:** Modify `src/utils/notion.js`; Test `tests/utils/notionExport.test.js`.

Contract (mirror `importNotionPageApi`): POST `${NOTION_BASE}/export` body `{ project_name, docs, parent_page_id?, team_id? }`, `timeout: 300000`. Return `{ success, hub_url, results }` or `{ success:false, error, code, status }`. Guard: no projectName → `{success:false, error:t('plan.notion.export_fail')}`; empty docs → same.

- [ ] **Step 1:** Test — mock `@/utils/axios`:
```javascript
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/utils/axios', () => ({ default: { post: vi.fn() } }))
import axios from '@/utils/axios'
import { exportToNotionApi } from '@/utils/notion'

it('posts body and returns hub_url + results', async () => {
  axios.post.mockResolvedValueOnce({ data: { hub_url: 'u/H', results: [{ doc:'cps', status:'updated' }] } })
  const r = await exportToNotionApi({ projectName: 'p', docs: ['cps'], teamId: 't' })
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/notion/export'),
    { project_name:'p', docs:['cps'], team_id:'t' }, expect.objectContaining({ timeout: 300000 }))
  expect(r.success).toBe(true); expect(r.hub_url).toBe('u/H'); expect(r.results[0].status).toBe('updated')
})
it('includes parent_page_id when given', async () => {
  axios.post.mockResolvedValueOnce({ data: { hub_url:'x', results:[] } })
  await exportToNotionApi({ projectName:'p', docs:['cps'], parentPageId:'PAR' })
  expect(axios.post.mock.calls.at(-1)[1].parent_page_id).toBe('PAR')
})
it('returns success:false on no project', async () => {
  const r = await exportToNotionApi({ projectName:'', docs:['cps'] })
  expect(r.success).toBe(false)
})
it('maps error on rejection', async () => {
  axios.post.mockRejectedValueOnce({ response:{ status:412, data:{ detail:{ code:'NOTION_NOT_LINKED' } } } })
  const r = await exportToNotionApi({ projectName:'p', docs:['cps'] })
  expect(r.success).toBe(false); expect(r.status).toBe(412)
})
```
- [ ] **Step 2:** Run `pnpm exec vitest run tests/utils/notionExport.test.js` → FAIL.
- [ ] **Step 3:** Implement following `importNotionPageApi` (use existing `NOTION_BASE`, `extractError`, `extractErrorCode`, `t`). Body omits `parent_page_id`/`team_id` when falsy.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(notion-fe): exportToNotionApi`.

## Task FE-2: i18n `plan.notion.export_*`

**Files:** Modify `src/locales/{ko,en,zh,ja}/plan.json` (extend existing `notion` object).

Keys (ko shown; translate en/zh/ja, preserve `{project}`/`{n}`/`{total}` + HTML):
```
"export_title": "Notion으로 공유", "export_sub_html": "<strong>{project}</strong> 의 기획·설계를 Notion 에 정리해 공유합니다.",
"export_docs_label": "공유할 문서", "export_doc_cps": "핵심 정리 (CPS)", "export_doc_prd": "요구사항 (PRD)", "export_doc_design": "시스템 설계",
"export_pick_parent_title": "처음 공유 — 저장할 Notion 위치를 선택하세요", "export_pick_parent_sub": "선택한 페이지 아래에 '프로젝트 허브'가 생성됩니다. 한 번만 고르면 다음부턴 자동.",
"export_btn": "공유", "export_btn_loading": "공유 중…", "export_open_hub": "Notion 에서 열기",
"export_done": "Notion 공유 완료", "export_done_partial": "{ok}/{total} 문서 공유 완료",
"export_fail": "Notion 공유에 실패했습니다.", "export_not_linked_cta": "Notion 연동하기",
"export_status_created": "생성", "export_status_updated": "갱신", "export_status_skipped": "건너뜀(내용 없음)", "export_status_failed": "실패",
"export_empty_docs": "공유할 문서를 1개 이상 선택하세요."
```
- [ ] Step 1: Add to ko. Step 2: en/zh/ja parity (translate). Step 3: `pnpm build` ok. Step 4: commit.

## Task FE-3: `NotionExportDialog.vue`

**Files:** Create `src/components/plan/NotionExportDialog.vue`; Test `tests/components/notionExportDialog.test.js`.

Props: `modelValue:Boolean`, `projectName:String`, `teamId:{type:String,default:''}`, `docs:{type:Array,default:()=>['cps','prd','design']}` (preselected). Emits `update:modelValue`.
State machine: `idle` → (export) → if any result `need_parent` → `picking` (show `NotionPageList`) → on select store `parentPageId`, re-export → `done` (show results + hub link) | `error`. Loading flag disables button.
- Doc checkboxes from props.docs (default all checked). Calls `exportToNotionApi`. On `need_parent`, reveal `<NotionPageList :active="state==='picking'" @select="onPickParent" />`. Success → `useSnackbar().showSuccess(t('plan.notion.export_done...'))` + render results list + "Notion에서 열기" (hub_url) link. Failure → showError.
- [ ] **Step 1:** Test (mount with pinia+i18n, stub NotionPageList, mock `exportToNotionApi`): renders 3 doc checkboxes; clicking 공유 calls `exportToNotionApi` with checked docs; `need_parent` result switches to picking + shows picker; success shows hub link. (See `tests/components/glossaryModal.test.js` for mount pattern.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (Vuetify `v-dialog`, follow `NotionImportDialog.vue` styling/`brown` accent, mobile `100dvh` per the mobile-fix convention). **Step 4:** Run → PASS. **Step 5:** Commit.

## Task FE-4: Entry buttons + connect-gating

**Files:** Modify `deliverables.vue`, `plan.vue`, `design.vue`.

Shared gating helper (inline per page or a tiny composable `useNotionExport`): on click → `fetchNotionStatusApi()`; if `status.linked` → open `NotionExportDialog` with appropriate `docs`; else → open `NotionTokenDialog` (connect), on `@connected` reopen export.
- **deliverables.vue:** add button in `.hero-actions` (next to REFRESH ALL), `docs=['cps','prd','design']`, `projectName=store.projectName`, `teamId=useProjectStore().activeTeamId`. Mount `<NotionExportDialog>`.
- **plan.vue:** CPS tab → button `docs=['cps']`; PRD tab → `docs=['prd']`. Place in the `SubTabRow #trailing` slot conditioned on `subTab`. Reuse one `<NotionExportDialog>` with a reactive `exportDocs` ref.
- **design.vue:** header button `docs=['design']`.
- [ ] Steps: wire each page (button + dialog mount + gating), `pnpm build`, manual reason-through, commit per page or one commit.

## Task FE-5: Verify
- [ ] `pnpm build` clean. `pnpm exec vitest run` full (expect prior count + new). 
- [ ] Visual: Claude Preview at desktop+mobile — open each entry, dialog renders, doc checkboxes, (no real Notion needed; mock or just confirm UI). Confirm i18n switch (中文/日本語/EN) shows translated dialog.

## Task FE-6: PR
- [ ] Branch `feat/notion-export-fe` (current). Exclude noise. PR → CI `test` → merge → sync. (Include the spec + BE/FE plan docs in this PR.)

---

## Self-Review
- Spec §4 FE pieces → FE-1/3/4; §5 template is BE-side (done); connect-gating §6 → FE-4; i18n → FE-2. Picker reuse confirmed (`NotionPageList` `:active`+`@select`). need_parent flow handled in FE-3 state machine. No placeholders — contracts + test code given; component internals follow `NotionImportDialog.vue`.
- Executor confirmations: exact `extractErrorCode`/`NOTION_BASE` names in notion.js (read before FE-1); `SubTabRow #trailing` slot availability in plan.vue (read before FE-4); which store each page uses for projectName/teamId.
