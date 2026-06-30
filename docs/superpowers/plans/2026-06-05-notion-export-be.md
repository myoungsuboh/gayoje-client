# Notion Export — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repo: `C:\project\harness-server` (FastAPI/Neo4j/arq). Run tests with `pytest`.

**Goal:** Add a backend `POST /api/v2/notion/export` endpoint that renders a project's CPS/PRD/Design into a branded Notion "hub page + 3 sub-pages", idempotently (re-export updates the same pages).

**Architecture:** Extend `NotionClient` with write ops (create/append/archive). New pure converter `markdown_to_notion_blocks.py` and design renderer `design_to_markdown.py`. New `notion_export_service.py` orchestrates fetch→render→upsert. New route mirrors existing `notion_routes.py` patterns. Page-id mapping stored on `(:User)-[:NOTION_EXPORT]->(:Project)`.

**Tech Stack:** FastAPI, httpx (async), Neo4j (cypher), pytest (asyncio + monkeypatch), Notion API v1 (2022-06-28).

**Spec:** `C:\project\harness\docs\superpowers\specs\2026-06-05-notion-export-design.md`

---

## File Structure

- Create `app/core/markdown_to_notion_blocks.py` — pure: markdown string → list[NotionBlock dict]. Handles rich-text 2000-char split, depth flattening. No I/O.
- Create `app/core/design_to_markdown.py` — pure: SpackGraph/DddGraph/ArchitectureGraph → markdown string (tables, toggles via `> ` sections, mermaid). No I/O.
- Modify `app/clients/notion_client.py` — add `create_page`, `append_block_children` (100-chunk), `archive_block_children`.
- Modify `app/service/user_repository.py` — add `get_notion_export_map`, `save_notion_export_map`.
- Create `app/service/notion_export_service.py` — orchestrates fetch → render → upsert hub + subpages.
- Modify `app/api/notion_routes.py` — add `NotionExportRequest`/`NotionExportResponse` + `POST /export` route.
- Tests: `tests/core/test_markdown_to_notion_blocks.py`, `tests/core/test_design_to_markdown.py`, `tests/clients/test_notion_client_write.py`, `tests/service/test_notion_export_service.py`, `tests/api/test_notion_export_route.py`.

---

## Task 1: NotionClient write methods

**Files:**
- Modify: `app/clients/notion_client.py`
- Test: `tests/clients/test_notion_client_write.py` (create)

Contracts to add to `NotionClient`:
- `async def create_page(self, *, parent_page_id: str, title: str, icon_emoji: str | None = None, children: list[dict] | None = None) -> dict` → POST `/v1/pages` with `{"parent": {"page_id": parent_page_id}, "icon": {"emoji": ...}, "properties": {"title": {"title": [{"text": {"content": title}}]}}, "children": children[:100]}`. Returns created page (has `id`, `url`).
- `async def append_block_children(self, *, block_id: str, children: list[dict]) -> None` → POST `/v1/blocks/{block_id}/children` in **chunks of 100** (loop).
- `async def archive_block_children(self, *, block_id: str) -> None` → GET children (reuse existing pagination helper) then PATCH each child `/v1/blocks/{child_id}` with `{"archived": true}`.

- [ ] **Step 1: Write failing tests** in `tests/clients/test_notion_client_write.py`. Mock httpx via monkeypatching the client's `_request` (follow how existing client tests stub network, or patch `httpx.AsyncClient`). Test cases:

```python
import pytest
from app.clients.notion_client import NotionClient
pytestmark = pytest.mark.asyncio

async def test_create_page_posts_parent_title_icon(monkeypatch):
    calls = []
    async def fake_request(self, method, url, *, json=None, params=None, context):
        calls.append((method, url, json)); return {"id": "pg1", "url": "u"}
    monkeypatch.setattr(NotionClient, "_request", fake_request)
    c = NotionClient(user_token="t")
    out = await c.create_page(parent_page_id="par", title="Hello", icon_emoji="📦",
                              children=[{"x": 1}])
    assert out["id"] == "pg1"
    m, url, body = calls[0]
    assert m == "POST" and url.endswith("/pages")
    assert body["parent"]["page_id"] == "par"
    assert body["icon"]["emoji"] == "📦"
    assert body["properties"]["title"]["title"][0]["text"]["content"] == "Hello"

async def test_append_chunks_100(monkeypatch):
    chunks = []
    async def fake_request(self, method, url, *, json=None, params=None, context):
        chunks.append(len(json["children"])); return {}
    monkeypatch.setattr(NotionClient, "_request", fake_request)
    c = NotionClient(user_token="t")
    await c.append_block_children(block_id="b", children=[{"i": i} for i in range(230)])
    assert chunks == [100, 100, 30]

async def test_archive_children_patches_each(monkeypatch):
    async def fake_get_blocks_raw(self, block_id):  # however existing client lists children
        return [{"id": "c1"}, {"id": "c2"}]
    patched = []
    async def fake_request(self, method, url, *, json=None, params=None, context):
        if method == "PATCH": patched.append((url, json)); return {}
        return {"results": [{"id": "c1"}, {"id": "c2"}], "has_more": False}
    monkeypatch.setattr(NotionClient, "_request", fake_request)
    c = NotionClient(user_token="t")
    await c.archive_block_children(block_id="b")
    assert all(j["archived"] is True for _, j in patched)
    assert len(patched) == 2
```

- [ ] **Step 2: Run, verify FAIL** — `pytest tests/clients/test_notion_client_write.py -v` → methods undefined.
- [ ] **Step 3: Implement** the three methods in `notion_client.py` using the existing `_request` helper + `_API_BASE`. For `append_block_children`, loop `for i in range(0, len(children), 100): await self._request("POST", f"{_API_BASE}/blocks/{block_id}/children", json={"children": children[i:i+100]}, context="append")`. For `archive_block_children`, list direct children (reuse the same listing the existing `get_page_blocks` uses for one level — do NOT recurse; archiving a parent archives its subtree) and PATCH each `{"archived": True}`.
- [ ] **Step 4: Run, verify PASS** — `pytest tests/clients/test_notion_client_write.py -v`.
- [ ] **Step 5: Commit** — `git add app/clients/notion_client.py tests/clients/test_notion_client_write.py && git commit -m "feat(notion): NotionClient create_page/append/archive write ops"`

---

## Task 2: markdown → Notion blocks converter

**Files:**
- Create: `app/core/markdown_to_notion_blocks.py`
- Test: `tests/core/test_markdown_to_notion_blocks.py`

Contract: `def markdown_to_blocks(md: str) -> list[dict]` returns a flat list of Notion block dicts. Supported lines → blocks:
- `# ` → heading_1, `## ` → heading_2, `### ` → heading_3 (Notion has only h1-3; `####+` → heading_3 + bold prefix is overkill → map `####`+ to heading_3).
- `- `/`* ` → bulleted_list_item; `1. ` → numbered_list_item; `- [ ]`/`- [x]` → to_do (checked bool).
- `> ` → quote; ` ``` ` fenced → code (capture language); `---` → divider; `| a | b |` consecutive → table; blank → skip; else → paragraph.
- Inline rich-text: `**bold**`, `*italic*`/`_italic_`, `` `code` ``, `[text](url)` → annotations/links. Each rich-text content string **split into ≤2000-char segments**.

Helper `_rich_text(s: str) -> list[dict]` produces `[{"type":"text","text":{"content": chunk},...}]` splitting at 2000.

- [ ] **Step 1: Write failing tests**:

```python
from app.core.markdown_to_notion_blocks import markdown_to_blocks, _rich_text

def _type(b): return b["type"]

def test_headings_and_paragraph():
    bs = markdown_to_blocks("# Title\n\nhello world")
    assert _type(bs[0]) == "heading_1"
    assert bs[0]["heading_1"]["rich_text"][0]["text"]["content"] == "Title"
    assert _type(bs[1]) == "paragraph"

def test_bullets_and_todo_and_numbered():
    bs = markdown_to_blocks("- a\n- b\n1. one\n- [ ] todo\n- [x] done")
    assert _type(bs[0]) == "bulleted_list_item"
    assert _type(bs[2]) == "numbered_list_item"
    assert _type(bs[3]) == "to_do" and bs[3]["to_do"]["checked"] is False
    assert bs[4]["to_do"]["checked"] is True

def test_code_fence_keeps_language():
    bs = markdown_to_blocks("```python\nx=1\n```")
    assert _type(bs[0]) == "code"
    assert bs[0]["code"]["language"] == "python"
    assert "x=1" in bs[0]["code"]["rich_text"][0]["text"]["content"]

def test_divider_and_quote():
    bs = markdown_to_blocks("> note\n\n---")
    assert _type(bs[0]) == "quote"
    assert _type(bs[1]) == "divider"

def test_table():
    bs = markdown_to_blocks("| A | B |\n| --- | --- |\n| 1 | 2 |")
    assert _type(bs[0]) == "table"
    assert bs[0]["table"]["table_width"] == 2

def test_rich_text_splits_at_2000():
    seg = _rich_text("x" * 4500)
    assert [len(s["text"]["content"]) for s in seg] == [2000, 2000, 500]

def test_inline_bold_and_link():
    bs = markdown_to_blocks("a **b** [c](http://x)")
    rts = bs[0]["paragraph"]["rich_text"]
    assert any(r["text"]["content"] == "b" and r["annotations"]["bold"] for r in rts)
    assert any(r["text"].get("link", {}).get("url") == "http://x" for r in rts if r["text"].get("link"))
```

- [ ] **Step 2: Run, verify FAIL** — `pytest tests/core/test_markdown_to_notion_blocks.py -v`.
- [ ] **Step 3: Implement** `markdown_to_notion_blocks.py`. Line-based parser; a small inline tokenizer for bold/italic/code/link (regex). `_rich_text` splits content at 2000. Table: collect consecutive `|` rows, skip the `---` separator row, build `table` block with `table_row` children (each cell = rich_text). Cap total blocks defensively (e.g., 1800) and append a truncation note paragraph if exceeded.
- [ ] **Step 4: Run, verify PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(notion): markdown_to_notion_blocks converter (rich-text 2000 split, tables, code)"`

---

## Task 3: Design graph → markdown renderer

**Files:**
- Create: `app/core/design_to_markdown.py`
- Test: `tests/core/test_design_to_markdown.py`

Contracts (consume the exact shapes from `query_repository`):
- `def spack_to_markdown(spack: SpackGraph) -> str` — `## 기능 명세 (SPACK)` + API table (`| API | Method | Path | 설명 |` from apis[].endpoint/method/path/description) + Entity table (name/description) + Policy list (name: description; rules).
- `def ddd_to_markdown(ddd: DddGraph) -> str` — `## 도메인 모델 (DDD)`; per BoundedContext (`### {name}`) list its aggregates (matched via internal_rels BELONGS_TO/PART_OF or by context grouping) with their domain_entities/domain_events as nested bullets.
- `def architecture_to_markdown(arch: ArchitectureGraph) -> str` — `## 시스템 아키텍처` + a mermaid code fence (```mermaid\ngraph LR\n  {svc}-->{db/connection}) built from services/databases/connections (use connection.protocol/auth as edge labels) + a short services/databases bullet list as text fallback.
- `def design_to_markdown(spack, ddd, arch) -> str` — concatenates the three with a leading `# 🏗️ 시스템 설계`. Empty graphs → a "아직 생성되지 않았습니다" note for that section (never crash).

- [ ] **Step 1: Write failing tests** with minimal real-shaped fixtures:

```python
from app.core.design_to_markdown import spack_to_markdown, ddd_to_markdown, architecture_to_markdown
from app.service.query_repository import SpackGraph, DddGraph, ArchitectureGraph

def test_spack_renders_api_table():
    g = SpackGraph(apis=[{"id":"a1","endpoint":"/users","method":"GET","path":"/users","description":"list"}],
                   entities=[{"id":"e1","name":"User","description":"user"}],
                   policies=[{"id":"p1","name":"Retry","description":"max 3","rules":["<=3"]}])
    md = spack_to_markdown(g)
    assert "기능 명세 (SPACK)" in md
    assert "/users" in md and "GET" in md and "| API |" in md
    assert "User" in md and "Retry" in md

def test_architecture_emits_mermaid():
    g = ArchitectureGraph(services=[{"id":"s1","name":"API"}], databases=[{"id":"d1","name":"DB"}],
        connections=[{"source_id":"s1","target_id":"d1","type":"CONNECTS_TO","protocol":"tcp","auth":"bearer"}])
    md = architecture_to_markdown(g)
    assert "```mermaid" in md and "graph" in md and "API" in md and "DB" in md

def test_empty_graphs_no_crash():
    assert "SPACK" in spack_to_markdown(SpackGraph())
    assert ddd_to_markdown(DddGraph())  # returns note, no exception
```

- [ ] **Step 2: Run, verify FAIL**.
- [ ] **Step 3: Implement** `design_to_markdown.py`. Map nodes by `id`. For mermaid, sanitize node names to safe ids (`re.sub(r'\W','_',name)`), label edges with protocol/auth. Guard every list access (`g.apis or []`).
- [ ] **Step 4: Run, verify PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(notion): design graph → markdown (SPACK tables, DDD, architecture mermaid)"`

---

## Task 4: Page-id mapping storage

**Files:**
- Modify: `app/service/user_repository.py`
- Test: `tests/service/test_notion_export_map.py`

Contracts:
- `async def get_notion_export_map(email: str, project_name: str) -> dict | None` → returns `{"hub_page_id":..., "cps_page_id":..., "prd_page_id":..., "design_page_id":..., "synced_at":...}` or None.
- `async def save_notion_export_map(email: str, project_name: str, *, hub_page_id, cps_page_id=None, prd_page_id=None, design_page_id=None) -> None` → MERGE relationship, SET non-null ids + `synced_at = timestamp()`.

Cypher (follow `_LINK_NOTION_CYPHER` style; `$param` binding, `MERGE`):
```cypher
MATCH (u:User {email: $email})
MERGE (p:Project {name: $project_name})
MERGE (u)-[r:NOTION_EXPORT]->(p)
SET r.hub_page_id = coalesce($hub_page_id, r.hub_page_id),
    r.cps_page_id = coalesce($cps_page_id, r.cps_page_id),
    r.prd_page_id = coalesce($prd_page_id, r.prd_page_id),
    r.design_page_id = coalesce($design_page_id, r.design_page_id),
    r.synced_at = timestamp()
RETURN r
```
Note: confirm the `Project` node label/key used elsewhere (search `:Project` in query_repository); if projects aren't `:Project` nodes, store the map as user properties keyed by project (`u.notion_export_{hash}`), or on whatever node represents a project. **Executor: verify the project node model before writing — match existing convention.**

- [ ] **Step 1: Write failing tests** mocking `neo4j_client.run_cypher`:

```python
import pytest
from app.service import user_repository as ur
pytestmark = pytest.mark.asyncio

async def test_save_then_get_roundtrip(monkeypatch):
    store = {}
    async def fake_run(cy, params):
        if "MERGE (u)-[r:NOTION_EXPORT]" in cy:
            store.update({k: v for k, v in params.items() if v is not None}); return [{"r": store}]
        return [{"hub_page_id": store.get("hub_page_id"), "cps_page_id": store.get("cps_page_id"),
                 "prd_page_id": store.get("prd_page_id"), "design_page_id": store.get("design_page_id"),
                 "synced_at": 1}]
    monkeypatch.setattr(ur.neo4j_client, "run_cypher", fake_run)
    await ur.save_notion_export_map("u@e.com", "proj", hub_page_id="H", cps_page_id="C")
    got = await ur.get_notion_export_map("u@e.com", "proj")
    assert got["hub_page_id"] == "H" and got["cps_page_id"] == "C"
```

- [ ] **Step 2: Run, verify FAIL**.
- [ ] **Step 3: Implement** both functions with their Cypher constants.
- [ ] **Step 4: Run, verify PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(notion): store per-(user,project) Notion export page-id map"`

---

## Task 5: Export service (orchestration + idempotent upsert)

**Files:**
- Create: `app/service/notion_export_service.py`
- Test: `tests/service/test_notion_export_service.py`

Contract: `async def export_project_to_notion(*, email: str, project_name: str, team_id: str, docs: list[str], parent_page_id: str | None, client: NotionClient) -> dict` returns `{"hub_url":..., "results":[{"doc","status","url"?,"error"?}]}`.

Logic:
1. Load map = `get_notion_export_map`. If no hub yet: require `parent_page_id` (else result error `need_parent`); `create_page(parent_page_id, title=f"📦 {project_name} — 기획·설계 (by Harness)", icon="📦", children=<hub banner blocks>)`; save hub_page_id.
2. For each doc in docs:
   - fetch source: cps→`get_master_cps`; prd→`get_master_prd`; design→`get_spack_graph`+`get_ddd_graph`+`get_architecture_graph` (confirm getter names).
   - if source empty → result `{doc, status:"skipped"}`.
   - render markdown → `markdown_to_blocks`.
   - sub_id = map[f"{doc}_page_id"]; if missing → `create_page(parent=hub_page_id, title=<doc title>, icon)` then save id; else `archive_block_children(sub_id)`.
   - `append_block_children(sub_id, blocks)`; result `{doc, status: created|updated, url}`.
3. `save_notion_export_map(... synced_at)`. Return hub_url + results.

- [ ] **Step 1: Write failing test** with a fake client + monkeypatched repo getters:

```python
import pytest
from app.service import notion_export_service as svc
pytestmark = pytest.mark.asyncio

class FakeClient:
    def __init__(self): self.created=[]; self.appended={}; self.archived=[]
    async def create_page(self, *, parent_page_id, title, icon_emoji=None, children=None):
        pid=f"pg{len(self.created)}"; self.created.append((parent_page_id,title)); return {"id":pid,"url":f"u/{pid}"}
    async def append_block_children(self, *, block_id, children): self.appended.setdefault(block_id,[]).extend(children)
    async def archive_block_children(self, *, block_id): self.archived.append(block_id)

async def test_first_export_creates_hub_and_subpages(monkeypatch):
    monkeypatch.setattr(svc.user_repository, "get_notion_export_map", lambda *a, **k: _async(None))
    monkeypatch.setattr(svc.user_repository, "save_notion_export_map", lambda *a, **k: _async(None))
    monkeypatch.setattr(svc.query_repository, "get_master_cps", lambda *a, **k: _async(_cps("# CPS\nbody")))
    c = FakeClient()
    out = await svc.export_project_to_notion(email="u@e.com", project_name="p", team_id="",
            docs=["cps"], parent_page_id="PAR", client=c)
    assert out["hub_url"].startswith("u/")
    assert any(r["doc"]=="cps" and r["status"]=="created" for r in out["results"])
    assert c.archived == []  # first time, nothing to archive

async def test_reexport_archives_then_appends(monkeypatch):
    m = {"hub_page_id":"H","cps_page_id":"C"}
    monkeypatch.setattr(svc.user_repository, "get_notion_export_map", lambda *a, **k: _async(m))
    monkeypatch.setattr(svc.user_repository, "save_notion_export_map", lambda *a, **k: _async(None))
    monkeypatch.setattr(svc.query_repository, "get_master_cps", lambda *a, **k: _async(_cps("# CPS\nv2")))
    c = FakeClient()
    out = await svc.export_project_to_notion(email="u@e.com", project_name="p", team_id="",
            docs=["cps"], parent_page_id=None, client=c)
    assert "C" in c.archived and "C" in c.appended
    assert any(r["status"]=="updated" for r in out["results"])
```
(Helpers `_async(v)`, `_cps(md)` returning a CpsMaster — define in the test file.)

- [ ] **Step 2: Run, verify FAIL**.
- [ ] **Step 3: Implement** the service. Confirm design getter function names in `query_repository`; import `markdown_to_blocks`, `design_to_markdown`, hub-banner builder (small helper producing callout+divider+links blocks).
- [ ] **Step 4: Run, verify PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(notion): export service — idempotent hub + subpage upsert"`

---

## Task 6: Export route

**Files:**
- Modify: `app/api/notion_routes.py`
- Test: `tests/api/test_notion_export_route.py`

Add (mirror existing import route patterns exactly):
```python
class NotionExportRequest(BaseModel):
    project_name: str = Field(..., min_length=1)
    docs: list[str] = Field(default_factory=lambda: ["cps", "prd", "design"])
    parent_page_id: Optional[str] = None
    team_id: Optional[str] = None

class NotionExportResult(BaseModel):
    doc: str; status: str; url: Optional[str] = None; error: Optional[str] = None

class NotionExportResponse(BaseModel):
    hub_url: Optional[str] = None
    results: list[NotionExportResult] = []

@router.post("/export", response_model=NotionExportResponse, summary="CPS/PRD/Design → Notion 허브 공유")
@limiter.limit("6/minute")
async def export_to_notion(request: Request, payload: NotionExportRequest,
                           current_user: UserPublic = Depends(get_current_user)) -> NotionExportResponse:
    token = await _get_notion_token_or_412(current_user.email)
    client = NotionClient(user_token=token)
    try:
        out = await notion_export_service.export_project_to_notion(
            email=current_user.email, project_name=payload.project_name,
            team_id=payload.team_id or "", docs=payload.docs,
            parent_page_id=payload.parent_page_id, client=client)
    except NotionError as e:
        raise await _handle_notion_error(current_user.email, e)
    return NotionExportResponse(**out)
```
**Executor:** confirm whether project ownership/team auth needs an explicit guard here (check how import/getCPS routes validate the caller owns `project_name`; replicate it before calling the service).

- [ ] **Step 1: Write failing tests** (follow `tests/api/test_notion_routes.py` fakes: `_user`, `_fake_request`, `_patch_users`, `_patch_client`):

```python
import pytest
from fastapi import HTTPException
from app.api import notion_routes as routes
pytestmark = pytest.mark.asyncio

async def test_export_412_when_not_linked(monkeypatch):
    monkeypatch.setattr(routes.user_repository, "get_notion_info", _no_notion_info)
    with pytest.raises(HTTPException) as e:
        await routes.export_to_notion(request=_fake_request(),
            payload=routes.NotionExportRequest(project_name="p"), current_user=_user())
    assert e.value.status_code == 412

async def test_export_success(monkeypatch):
    monkeypatch.setattr(routes.user_repository, "get_notion_info", _ok_notion_info)
    monkeypatch.setattr(routes, "NotionClient", lambda **kw: object())
    async def fake_export(**kw):
        return {"hub_url": "u/H", "results": [{"doc":"cps","status":"updated","url":"u/C"}]}
    monkeypatch.setattr(routes.notion_export_service, "export_project_to_notion", fake_export)
    out = await routes.export_to_notion(request=_fake_request(),
        payload=routes.NotionExportRequest(project_name="p", docs=["cps"]), current_user=_user())
    assert out.hub_url == "u/H" and out.results[0].status == "updated"
```
(Copy `_user/_fake_request/_ok_notion_info/_no_notion_info` + the `_disable_limiter` fixture from `test_notion_routes.py`.)

- [ ] **Step 2: Run, verify FAIL**.
- [ ] **Step 3: Implement** route + models + `import app.service.notion_export_service`. Ensure router is already registered (it is — same `router`).
- [ ] **Step 4: Run, verify PASS** — `pytest tests/api/test_notion_export_route.py -v`.
- [ ] **Step 5: Run full suite** — `pytest -q` (expect existing tests still green).
- [ ] **Step 6: Commit** — `git commit -m "feat(notion): POST /api/v2/notion/export route"`

---

## Task 7: Manual smoke + PR

- [ ] **Step 1:** Start the app locally (follow repo README run cmd), open Swagger `/docs`, confirm `POST /api/v2/notion/export` appears with the request schema.
- [ ] **Step 2:** Full test suite green: `pytest -q`.
- [ ] **Step 3:** Branch + PR. Push `feat/notion-export-be`; PR to `master` (BE default branch). Wait for CI; merge per repo workflow. **Do NOT run deploy manually.**

---

## Self-Review

- **Spec coverage:** §4 BE pieces → Tasks 1-6. §3 storage/idempotency → Tasks 4-5. §5 template (hub banner, subpage render) → Tasks 2,3,5. §7 errors → Task 6 (reuses `_handle_notion_error`, `_get_notion_token_or_412`). §6 permissions → Task 6 (per-user token via `_get_notion_token_or_412`). Async/arq (§10) deferred — Task 6 is synchronous; if Notion calls exceed request timeout in smoke test, add an arq job wrapper (follow `enqueue_post_meeting`/`get_job_status`) as a follow-up task.
- **Open confirmations flagged for executor:** (a) `:Project` node model for Task 4; (b) design getter function names in Task 5; (c) project-ownership guard in Task 6; (d) one-level child listing for archive in Task 1.
- **No placeholders:** test code is concrete; converter/renderer algorithms specified; pattern references point to exact files.

---

## Execution Handoff
After this BE plan is executed and merged, a **separate FE plan** (`2026-06-05-notion-export-fe.md`) covers: `exportToNotionApi`, `NotionExportDialog.vue` (doc checkboxes + reuse `NotionPageList` picker + progress), entry buttons (Deliverables + each doc tab), connect-gating, and 4-language i18n.
