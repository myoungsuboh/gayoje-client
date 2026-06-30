# MCP 전용 토큰 발급 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 access_token 을 MCP 설정 파일에 그대로 노출하는 보안 사고를 막기 위해, scope/수명/회수가 독립된 MCP 전용 토큰 발급 시스템을 구축한다.

**Architecture:**
- 새 JWT `type="mcp"` (scope claim `["mcp:read"]`, exp=**90일**) 를 별도 발급/관리.
- Neo4j `(:User)-[:OWNS]->(:McpToken {jti, label, created_at, last_used_at, expires_at, revoked})` 로 메타데이터 저장; jti 회수는 기존 `app.core.token_blacklist` (Redis) 재사용.
- MCP 미들웨어는 `type in {"mcp"}` 만 허용 (**access 즉시 차단** — 기존 사용자 재발급 필수, 깨끗하게 전환).
- 회수는 **(1) Neo4j peek(exp 조회) → (2) Redis blacklist.revoke → (3) Neo4j mark revoked** 3단계로 race 최소화.
- 프론트는 발급 직후 1회 평문 표시 (GitHub PAT UX). **모달 안에 토큰 박힌 완성형 IDE 스니펫도 함께 제공** (UX↑, 보안 동등). 카드 영구 영역에는 평문 노출 없음.

**Decisions (2026-05-18 검토 회차):**
- Q1: access_token MCP 즉시 차단 (deprecation window 없음)
- Q2: 모달 안 완성형 스니펫 (placeholder 카드 + 완성형 모달 병행)
- Q3: exp=90일 (GitHub PAT 표준)
- Q4: 큰 task 는 a/b/c 로 분할 (subagent 한 명 = 한 commit 분량)

**Tech Stack:**
- Backend: FastAPI, PyJWT, Neo4j (cypher), Redis (token_blacklist), pytest-asyncio
- Frontend: Vue 3 (composition API), Pinia, Vuetify (v-dialog), axios, vitest
- 기존 인증 인프라 ([app/core/security.py](../../../../../harness-server/app/core/security.py), [app/mcp/auth.py](../../../../../harness-server/app/mcp/auth.py)) 100% 재사용

---

## File Structure

### Backend (`C:\project\harness-server`)

**Create:**
- `app/service/mcp_token_repository.py` — McpToken Neo4j CRUD + 도메인 모델 (McpTokenRow)
- `app/api/mcp_token_routes.py` — `POST/GET/DELETE /api/mcp-tokens`
- `tests/service/test_mcp_token_repository.py` — repository 단위 테스트 (Neo4j fake)
- `tests/api/test_mcp_token_routes.py` — 라우트 통합 테스트

**Modify:**
- `app/core/security.py:50-75` — `create_mcp_token(email, exp_days)` 추가
- `app/mcp/auth.py:118` — `type` 검사를 `mcp` 로 전환 + `last_used_at` 비동기 업데이트
- `app/api/main.py:337-369` — `mcp_token_router` 등록
- `app/schemas.py` — `McpTokenIssueRequest`, `McpTokenIssueResponse`, `McpTokenSummary` 추가
- `tests/mcp/test_mcp_auth.py` — mcp 타입 통과 / access 타입 거부 / revoke 후 401 케이스 추가

### Frontend (`C:\project\harness\.claude\worktrees\distracted-dhawan-d1a839`)

**Create:**
- `src/api/mcpTokens.js` — `issueMcpToken / listMcpTokens / revokeMcpToken`
- `src/components/common/McpTokenIssueDialog.vue` — 발급 모달 (라벨 입력 + 1회 표시)
- `src/components/common/McpTokenList.vue` — 토큰 목록 + 회수 버튼
- `src/utils/__tests__/mcpTokens.test.js` — API 클라이언트 단위 테스트

**Modify:**
- `src/components/common/McpConnectCard.vue` — Access Token 평문 필드 제거, 발급/목록 컴포넌트 통합, 스니펫의 토큰 자리를 placeholder 로 고정
- `src/pages/profile.vue` — 카드 그대로 사용 (변경 없을 수 있음, 검증만)

---

## Phase A: Backend

### Task A1: McpToken repository 스켈레톤 + jti UNIQUE 제약 (TDD)

**Files:**
- Create: `app/service/mcp_token_repository.py`
- Test: `tests/service/test_mcp_token_repository.py`

- [ ] **Step 1: 모듈 스켈레톤 (모델만 — 함수 없음)**

`app/service/mcp_token_repository.py` 생성:

```python
"""
MCP Token Repository — Neo4j (:McpToken) 노드 CRUD.

[책임]
- 사용자(:User)-[:OWNS]->(:McpToken) 그래프 유지
- 발급/조회/회수 cypher 캡슐화
- jti 는 unique constraint — 재발급 충돌 방지

[설계 메모]
- 평문 토큰은 절대 저장하지 않음 — jti + 메타데이터만.
- revoked=true 노드도 즉시 삭제하지 않고 보존 → 감사 로그 활용.
- 만료된 토큰 청소는 follow-up cron PR.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from pydantic import BaseModel

from app.clients import neo4j_client

logger = logging.getLogger(__name__)

# 사용자당 최대 활성 (revoked=false AND 미만료) 토큰 수
MAX_ACTIVE_TOKENS_PER_USER = 10


class McpTokenRow(BaseModel):
    """McpToken 노드 1행 — 외부 응답에 사용 (평문 토큰 없음)."""
    jti: str
    label: str
    created_at: str
    last_used_at: Optional[str] = None
    expires_at: str
    revoked: bool
```

- [ ] **Step 2: 실패 테스트 작성**

`tests/service/test_mcp_token_repository.py` 생성:

```python
"""mcp_token_repository 단위 테스트.

Neo4j 는 monkeypatch 로 인메모리 fake 사용 — 실제 DB 없이 cypher 입력만 검증.
"""
from __future__ import annotations

import pytest

from app.service import mcp_token_repository as repo

pytestmark = pytest.mark.asyncio


@pytest.fixture
def fake_neo4j(monkeypatch):
    """run_cypher 호출을 (query, params) 튜플 리스트로 캡처."""
    calls: list[tuple[str, dict]] = []

    async def _run(query: str, params: dict | None = None):
        calls.append((query, params or {}))
        return []  # cypher 결과는 각 테스트에서 override

    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _run
    )
    return calls


async def test_ensure_constraints_runs_constraint_cypher(fake_neo4j):
    await repo.ensure_constraints()
    assert any("mcp_token_jti_unique" in q for q, _ in fake_neo4j)
```

- [ ] **Step 3: 테스트 실행 → FAIL 확인**

```bash
pytest tests/service/test_mcp_token_repository.py::test_ensure_constraints_runs_constraint_cypher -v
```
Expected: FAIL — `AttributeError: module ... has no attribute 'ensure_constraints'`.

- [ ] **Step 4: 구현 추가**

`app/service/mcp_token_repository.py` 에 추가:

```python
_ENSURE_MCP_TOKEN_CONSTRAINT_CYPHER = """\
CREATE CONSTRAINT mcp_token_jti_unique IF NOT EXISTS
FOR (t:McpToken) REQUIRE t.jti IS UNIQUE
"""


async def ensure_constraints() -> None:
    """앱 부팅 시 1회 호출 — McpToken.jti UNIQUE 제약 보장."""
    await neo4j_client.run_cypher(_ENSURE_MCP_TOKEN_CONSTRAINT_CYPHER)
```

- [ ] **Step 5: 테스트 실행 → PASS**

```bash
pytest tests/service/test_mcp_token_repository.py -v
```
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add app/service/mcp_token_repository.py tests/service/test_mcp_token_repository.py
git commit -m "feat(mcp): McpToken repository skeleton + jti unique constraint"
```

---

### Task A2: 토큰 발급 cypher + repository 함수

**Files:**
- Modify: `app/service/mcp_token_repository.py`
- Test: `tests/service/test_mcp_token_repository.py`

- [ ] **Step 1: 실패 테스트 추가**

`tests/service/test_mcp_token_repository.py` 에 추가:

```python
async def test_create_mcp_token_record_returns_row(fake_neo4j, monkeypatch):
    fixed_now = "2026-05-18T10:00:00Z"
    fixed_jti = "11111111-2222-3333-4444-555555555555"
    monkeypatch.setattr(repo, "_utc_now_iso", lambda: fixed_now)
    monkeypatch.setattr(repo, "_expires_at_iso", lambda days: "2026-08-16T10:00:00Z")

    # CREATE cypher 응답을 모방 — 첫 호출은 count, 두 번째는 CREATE 반환
    async def _run(query: str, params: dict | None = None):
        if "count(t)" in query.lower():
            return [{"active": 0}]
        return [{
            "row": {
                "jti": fixed_jti,
                "label": "노트북-Cursor",
                "created_at": fixed_now,
                "last_used_at": None,
                "expires_at": "2026-08-16T10:00:00Z",
                "revoked": False,
            }
        }]
    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _run
    )

    row = await repo.create_mcp_token_record(
        email="u@e.com", jti=fixed_jti, label="노트북-Cursor", exp_days=90,
    )
    assert row.jti == fixed_jti
    assert row.label == "노트북-Cursor"
    assert row.revoked is False


async def test_create_mcp_token_record_rejects_when_limit_exceeded(monkeypatch):
    async def _run(query: str, params: dict | None = None):
        if "count(t)" in query.lower():
            return [{"active": repo.MAX_ACTIVE_TOKENS_PER_USER}]
        return []
    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _run
    )

    with pytest.raises(repo.McpTokenLimitExceeded):
        await repo.create_mcp_token_record(
            email="u@e.com", jti="x", label="L", exp_days=90,
        )
```

- [ ] **Step 2: 테스트 실행 → FAIL**

```bash
pytest tests/service/test_mcp_token_repository.py::test_create_mcp_token_record_returns_row -v
```
Expected: FAIL — `create_mcp_token_record` 미정의.

- [ ] **Step 3: 구현**

`app/service/mcp_token_repository.py` 에 추가:

```python
class McpTokenLimitExceeded(Exception):
    """사용자가 MAX_ACTIVE_TOKENS_PER_USER 초과로 발급 시도."""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at_iso(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


_COUNT_ACTIVE_CYPHER = """\
MATCH (u:User {email: $email})-[:OWNS]->(t:McpToken)
WHERE t.revoked = false AND datetime(t.expires_at) > datetime()
RETURN count(t) AS active
"""

_CREATE_TOKEN_CYPHER = """\
MATCH (u:User {email: $email})
CREATE (u)-[:OWNS]->(t:McpToken {
    jti: $jti,
    label: $label,
    created_at: $created_at,
    last_used_at: null,
    expires_at: $expires_at,
    revoked: false
})
RETURN {
    jti: t.jti,
    label: t.label,
    created_at: t.created_at,
    last_used_at: t.last_used_at,
    expires_at: t.expires_at,
    revoked: t.revoked
} AS row
"""


async def create_mcp_token_record(
    *, email: str, jti: str, label: str, exp_days: int,
) -> McpTokenRow:
    """McpToken 노드 생성. 한도 초과 시 McpTokenLimitExceeded."""
    count_rows = await neo4j_client.run_cypher(
        _COUNT_ACTIVE_CYPHER, {"email": email}
    )
    active = (count_rows[0] or {}).get("active", 0) if count_rows else 0
    if active >= MAX_ACTIVE_TOKENS_PER_USER:
        raise McpTokenLimitExceeded(
            f"최대 {MAX_ACTIVE_TOKENS_PER_USER}개까지 발급 가능합니다."
        )

    rows = await neo4j_client.run_cypher(
        _CREATE_TOKEN_CYPHER,
        {
            "email": email,
            "jti": jti,
            "label": label.strip()[:80],
            "created_at": _utc_now_iso(),
            "expires_at": _expires_at_iso(exp_days),
        },
    )
    if not rows:
        raise RuntimeError("MCP 토큰 노드 생성 실패")
    return McpTokenRow(**rows[0]["row"])
```

- [ ] **Step 4: 테스트 실행 → PASS**

```bash
pytest tests/service/test_mcp_token_repository.py -v
```
Expected: 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/service/mcp_token_repository.py tests/service/test_mcp_token_repository.py
git commit -m "feat(mcp): create_mcp_token_record + 10-token per-user limit"
```

---

### Task A3a: 토큰 목록 조회 (`list_tokens_for_user`)

**Files:**
- Modify: `app/service/mcp_token_repository.py`
- Test: `tests/service/test_mcp_token_repository.py`

- [ ] **Step 1: 실패 테스트 추가**

```python
async def test_list_tokens_returns_user_rows(monkeypatch):
    captured = {}
    async def _run(query, params=None):
        captured["q"] = query
        captured["p"] = params
        return [{
            "row": {
                "jti": "j1", "label": "A",
                "created_at": "2026-05-01T00:00:00Z",
                "last_used_at": "2026-05-17T00:00:00Z",
                "expires_at": "2026-08-01T00:00:00Z",
                "revoked": False,
            }
        }]
    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _run
    )
    rows = await repo.list_tokens_for_user("u@e.com")
    assert len(rows) == 1
    assert rows[0].jti == "j1"
    assert captured["p"] == {"email": "u@e.com"}
```

- [ ] **Step 2: 테스트 실행 → FAIL**

```bash
pytest tests/service/test_mcp_token_repository.py::test_list_tokens_returns_user_rows -v
```
Expected: FAIL — `list_tokens_for_user` 미정의.

- [ ] **Step 3: 구현**

```python
_LIST_TOKENS_CYPHER = """\
MATCH (u:User {email: $email})-[:OWNS]->(t:McpToken)
RETURN {
    jti: t.jti,
    label: t.label,
    created_at: t.created_at,
    last_used_at: t.last_used_at,
    expires_at: t.expires_at,
    revoked: t.revoked
} AS row
ORDER BY t.created_at DESC
"""


async def list_tokens_for_user(email: str) -> list[McpTokenRow]:
    rows = await neo4j_client.run_cypher(
        _LIST_TOKENS_CYPHER, {"email": email}
    )
    return [McpTokenRow(**r["row"]) for r in rows]
```

- [ ] **Step 4: PASS 확인 + 커밋**

```bash
pytest tests/service/test_mcp_token_repository.py -v
git add app/service/mcp_token_repository.py tests/service/test_mcp_token_repository.py
git commit -m "feat(mcp): list_tokens_for_user"
```

---

### Task A3b: 회수 — peek / mark 두 단계 (race-safe)

**Files:**
- Modify: `app/service/mcp_token_repository.py`
- Test: `tests/service/test_mcp_token_repository.py`

**설계 근거:** Redis blacklist 가 가장 먼저 차단을 발효시키려면 exp_epoch 가 필요한데, 그 값은 Neo4j 에 있다. → `peek_revoke_target` 로 **state 변경 없이** exp_at 만 조회 → blacklist.revoke 호출 → `mark_token_revoked` 로 Neo4j 마킹. 두 cypher 사이 race 가 있어도 이미 Redis 가 막고 있어 MCP 인증은 통과 못 함.

- [ ] **Step 1: 실패 테스트 추가**

```python
async def test_peek_revoke_target_returns_exp_when_owner(monkeypatch):
    async def _run(query, params=None):
        if params.get("email") == "owner@e.com":
            return [{"expires_at": "2026-08-01T00:00:00+00:00"}]
        return []
    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _run
    )
    exp = await repo.peek_revoke_target("owner@e.com", "j1")
    assert isinstance(exp, int)
    assert exp > 0

    miss = await repo.peek_revoke_target("intruder@e.com", "j1")
    assert miss is None


async def test_mark_token_revoked_returns_true_on_success(monkeypatch):
    async def _run(query, params=None):
        if "SET t.revoked = true" in query:
            return [{"jti": params["jti"]}] if params["jti"] == "j1" else []
        return []
    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _run
    )
    assert await repo.mark_token_revoked("owner@e.com", "j1") is True
    assert await repo.mark_token_revoked("owner@e.com", "ghost") is False
```

- [ ] **Step 2: FAIL**

```bash
pytest tests/service/test_mcp_token_repository.py -v -k "peek_revoke or mark_token"
```
Expected: FAIL — 함수 미정의.

- [ ] **Step 3: 구현**

```python
_PEEK_REVOKE_TARGET_CYPHER = """\
MATCH (u:User {email: $email})-[:OWNS]->(t:McpToken {jti: $jti})
WHERE t.revoked = false
RETURN t.expires_at AS expires_at
"""

_MARK_REVOKED_CYPHER = """\
MATCH (u:User {email: $email})-[:OWNS]->(t:McpToken {jti: $jti})
WHERE t.revoked = false
SET t.revoked = true
RETURN t.jti AS jti
"""


async def peek_revoke_target(email: str, jti: str) -> Optional[int]:
    """회수 가능 여부 + exp epoch 만 조회. **state 변경 없음.**

    Returns:
        활성 토큰이고 호출자 소유면 exp epoch, 아니면 None.
    """
    rows = await neo4j_client.run_cypher(
        _PEEK_REVOKE_TARGET_CYPHER, {"email": email, "jti": jti}
    )
    if not rows:
        return None
    exp_iso = rows[0]["expires_at"]
    # Python isoformat 은 +00:00 형태 / Neo4j datetime() 는 다양 — fromisoformat 으로 안전 파싱
    return int(datetime.fromisoformat(exp_iso.replace("Z", "+00:00")).timestamp())


async def mark_token_revoked(email: str, jti: str) -> bool:
    """Neo4j 노드의 revoked=true 마킹. 호출자 소유 + 활성 토큰일 때만."""
    rows = await neo4j_client.run_cypher(
        _MARK_REVOKED_CYPHER, {"email": email, "jti": jti}
    )
    return bool(rows)
```

- [ ] **Step 4: PASS 확인 + 커밋**

```bash
pytest tests/service/test_mcp_token_repository.py -v
git add app/service/mcp_token_repository.py tests/service/test_mcp_token_repository.py
git commit -m "feat(mcp): peek_revoke_target + mark_token_revoked (race-safe split)"
```

---

### Task A3c: `touch_last_used` (best-effort)

**Files:**
- Modify: `app/service/mcp_token_repository.py`
- Test: `tests/service/test_mcp_token_repository.py`

- [ ] **Step 1: 실패 테스트 추가**

```python
async def test_touch_last_used_is_silent_on_missing(monkeypatch):
    async def _run(query, params=None):
        return []
    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _run
    )
    # 존재하지 않는 jti 도 예외 없이 통과 (best-effort)
    await repo.touch_last_used("ghost-jti")


async def test_touch_last_used_swallows_exceptions(monkeypatch):
    async def _raise(*a, **kw):
        raise RuntimeError("neo4j down")
    monkeypatch.setattr(
        "app.service.mcp_token_repository.neo4j_client.run_cypher", _raise
    )
    # 예외 안 던지고 정상 리턴
    await repo.touch_last_used("any")
```

- [ ] **Step 2: FAIL**

```bash
pytest tests/service/test_mcp_token_repository.py -v -k touch_last
```
Expected: FAIL.

- [ ] **Step 3: 구현**

```python
_TOUCH_LAST_USED_CYPHER = """\
MATCH (t:McpToken {jti: $jti})
SET t.last_used_at = $now
"""


async def touch_last_used(jti: str) -> None:
    """MCP 호출 직후 best-effort 업데이트. 실패해도 무시.

    노드 미존재 (이미 회수/삭제) 도 silent — 인증은 미들웨어 단계에서 별도 처리.
    """
    try:
        await neo4j_client.run_cypher(
            _TOUCH_LAST_USED_CYPHER, {"jti": jti, "now": _utc_now_iso()}
        )
    except Exception:  # noqa: BLE001
        logger.debug("touch_last_used failed (best-effort)", exc_info=True)
```

- [ ] **Step 4: PASS 확인 + 커밋**

```bash
pytest tests/service/test_mcp_token_repository.py -v
git add app/service/mcp_token_repository.py tests/service/test_mcp_token_repository.py
git commit -m "feat(mcp): touch_last_used (best-effort, swallows errors)"
```

---

### Task A4: `create_mcp_token` JWT 발급 함수

**Files:**
- Modify: `app/core/security.py:50-75`
- Test: `tests/core/test_security_mcp_token.py` (create)

- [ ] **Step 1: 실패 테스트 작성**

`tests/core/test_security_mcp_token.py` 생성:

```python
"""create_mcp_token / decode 검증."""
from __future__ import annotations

import jwt
import pytest

from app.core import security
from app.core.config import settings


def test_create_mcp_token_returns_token_and_jti():
    token, jti = security.create_mcp_token("u@e.com", exp_days=90)
    payload = jwt.decode(
        token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
    )
    assert payload["sub"] == "u@e.com"
    assert payload["type"] == "mcp"
    assert payload["jti"] == jti
    assert payload["scope"] == ["mcp:read"]
    # exp 가 약 90일 후
    assert payload["exp"] - payload["iat"] >= 89 * 24 * 60 * 60


def test_create_mcp_token_unique_jti_per_call():
    _, jti1 = security.create_mcp_token("u@e.com", exp_days=90)
    _, jti2 = security.create_mcp_token("u@e.com", exp_days=90)
    assert jti1 != jti2
```

- [ ] **Step 2: 테스트 실행 → FAIL**

```bash
pytest tests/core/test_security_mcp_token.py -v
```
Expected: FAIL — `create_mcp_token` 미정의.

- [ ] **Step 3: `app/core/security.py` 에 함수 추가**

[security.py:75](../../../../../harness-server/app/core/security.py:75) 의 `create_refresh_token` 바로 아래:

```python
def create_mcp_token(email: str, exp_days: int = 90) -> tuple[str, str]:
    """MCP 전용 JWT 발급.

    - type="mcp" — MCPAuthMiddleware 가 이 타입만 허용.
    - scope=["mcp:read"] — 현재 모든 MCP tool 이 read-only. 미래 write tool 도입 시 확장.
    - exp_days 기본 90일 — IDE 가 자주 401 안 보도록 길게.

    Returns:
        (token, jti) — jti 는 호출자가 McpToken 노드에 저장.
    """
    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    payload = {
        "sub": email,
        "type": "mcp",
        "scope": ["mcp:read"],
        "jti": jti,
        "iat": now,
        "exp": now + timedelta(days=exp_days),
    }
    token = jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    return token, jti
```

- [ ] **Step 4: 테스트 실행 → PASS**

```bash
pytest tests/core/test_security_mcp_token.py -v
```
Expected: 두 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/core/security.py tests/core/test_security_mcp_token.py
git commit -m "feat(security): create_mcp_token (type=mcp, scope=mcp:read, exp=90d)"
```

---

### Task A5a: 기존 test_mcp_auth.py 영향 분석 + 마이그레이션 준비

**Files:**
- Read: `tests/mcp/test_mcp_auth.py` (전체)

**왜 분리한 task:** A5 의 미들웨어 type 정책 변경은 **기존 3개 테스트** 의 의미를 깨뜨린다. 미들웨어 코드 건드리기 전에 영향 분석을 먼저 명시한다.

- [ ] **Step 1: 기존 테스트 파일 읽기**

```bash
cat tests/mcp/test_mcp_auth.py
```

읽은 결과 (2026-05-18 시점 정리, plan 작성자가 사전 확인 완료):

**type 정책 변경 (`access` → `mcp`) 이후 깨지는 케이스 (3개)**:
1. `test_middleware_rejects_unknown_user` — `create_access_token` 사용. type 검사가 먼저 발동해 "사용자 미존재" 검증이 일어나지 않음 (어쨌든 401 이지만 의미 다름) → **`create_mcp_token` 으로 교체**.
2. `test_middleware_sets_contextvar_for_valid_token` — access 로 성공 흐름 검증. 새 정책에선 401 → **`create_mcp_token` 으로 교체 + 사용자 fixture 그대로**.
3. `test_middleware_resets_contextvar_after_request` — 동일 → **`create_mcp_token` 으로 교체**.

**의미 유지 (변경 불필요, 4개)**:
- `test_middleware_rejects_missing_authorization` — 헤더 없음 401
- `test_middleware_rejects_non_bearer` — Basic 401
- `test_middleware_rejects_expired_token` — `jwt.encode` 로 직접 만든 만료 access — `decode_token` 의 `ExpiredSignatureError` 가 type 검사보다 먼저 발동하므로 401 동일. 의미 OK.
- `test_middleware_rejects_wrong_token_type` — refresh 로 401. 새 정책 하에서도 refresh != mcp → 401. 의미 강화됨.
- `test_middleware_rejects_revoked_token` — access + blacklist=True. 새 정책에선 type 검사가 먼저 → 401. 의미 약간 다름 (blacklist 검사가 시연되지 않음). → **`create_mcp_token` + blacklist 로 교체** 권장.

**최종 마이그레이션 대상: 4개 (위 3 + revoked 테스트)**.

- [ ] **Step 2: 변경 없음 (분석만) — 다음 task 로 진행**

이 task 는 read-only. 커밋 없음.

---

### Task A5b: `create_mcp_token` 기반 신규 미들웨어 테스트 추가 (RED)

**Files:**
- Modify: `tests/mcp/test_mcp_auth.py` (테스트 2개 추가)

- [ ] **Step 1: 실패 테스트 2개 추가**

`tests/mcp/test_mcp_auth.py` 끝에 추가:

```python
# ─── 신규: mcp 타입 토큰 정책 검증 ────────────────────────────


@pytest.mark.asyncio
async def test_middleware_accepts_mcp_type_token(patch_user_lookup, patch_blacklist):
    """type=mcp 토큰은 통과해야 한다."""
    user = _fake_user("alice@example.com")
    patch_user_lookup(user)
    patch_blacklist(False)

    from app.core.security import create_mcp_token
    token, _jti = create_mcp_token("alice@example.com", exp_days=90)

    from app.mcp.auth import MCPAuthMiddleware

    called = {}
    async def app(scope, receive, send):
        called["ok"] = True
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    sent = []
    async def send(m):
        sent.append(m)

    mw = MCPAuthMiddleware(app)
    scope = {
        "type": "http", "method": "POST", "path": "/mcp/sse",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    }
    await mw(scope, lambda: None, send)
    assert called.get("ok") is True
    start = next(m for m in sent if m["type"] == "http.response.start")
    assert start["status"] == 200


@pytest.mark.asyncio
async def test_middleware_rejects_access_type_token(patch_user_lookup, patch_blacklist):
    """기존 access 토큰은 MCP 에서 더 이상 통하지 않아야 한다 (보안 강화)."""
    patch_user_lookup(_fake_user())
    patch_blacklist(False)

    token = create_access_token("alice@example.com")

    from app.mcp.auth import MCPAuthMiddleware

    async def app(scope, receive, send):
        raise AssertionError("should not be called")

    sent = []
    async def send(m):
        sent.append(m)

    mw = MCPAuthMiddleware(app)
    scope = {
        "type": "http", "method": "POST", "path": "/mcp/sse",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    }
    await mw(scope, lambda: None, send)
    start = next(m for m in sent if m["type"] == "http.response.start")
    assert start["status"] == 401
```

- [ ] **Step 2: 테스트 실행 → 2개 FAIL**

```bash
pytest tests/mcp/test_mcp_auth.py::test_middleware_accepts_mcp_type_token tests/mcp/test_mcp_auth.py::test_middleware_rejects_access_type_token -v
```
Expected:
- `accepts_mcp_type_token` FAIL — `create_mcp_token` 미정의 OR 401 (type=access 만 허용 중)
- `rejects_access_type_token` PASS (현재는 access 허용이지만 user 가 fake 라서 200 ... 어 잠깐, 현재 코드 하에선 200 이라 FAIL 일 듯)

→ 두 케이스 모두 RED 확인.

- [ ] **Step 3: 변경 없음 (다음 task 에서 구현)**

이 task 는 RED 상태로 커밋. 다음 task A5c 가 GREEN 만듬.

```bash
git add tests/mcp/test_mcp_auth.py
git commit -m "test(mcp): RED — middleware should accept mcp + reject access"
```

---

### Task A5c: 미들웨어 type 정책 전환 + `_authenticate` payload 반환

**Files:**
- Modify: `app/mcp/auth.py` ([line 30-99 + 102-138](../../../../../harness-server/app/mcp/auth.py:30))

**경고 (executor):** 이 task 는 `_authenticate` 의 리턴 시그니처를 `UserPublic` → `(UserPublic, dict)` 로 바꾼다. 호출부는 동일 파일 내 `__call__` 하나뿐이다 (정찰 완료, 2026-05-18). 외부 호출 없음.

- [ ] **Step 1: `app/mcp/auth.py` 상단 import 추가**

[auth.py:24-37](../../../../../harness-server/app/mcp/auth.py:24) import 블록에 추가:

```python
import asyncio
```

그리고 모듈 레벨 set 하나:

```python
# fire-and-forget Task 참조 보존 — GC 가 in-flight task 를 죽이지 않도록.
_background_tasks: set[asyncio.Task] = set()
```

`_current_mcp_user: ContextVar[...]` 정의 바로 위/아래 어디든.

- [ ] **Step 2: `_authenticate` 가 `(user, payload)` 튜플 반환**

[auth.py:138](../../../../../harness-server/app/mcp/auth.py:138) 끝:

```python
        return users.UserPublic.from_db(user_db), payload
```

(기존 `return users.UserPublic.from_db(user_db)` 한 줄 교체.)

- [ ] **Step 3: type 검사 강화**

[auth.py:117-121](../../../../../harness-server/app/mcp/auth.py:117):

```python
        payload = decode_token(token)
        if payload.get("type") != "mcp":
            raise HTTPException(
                status_code=401,
                detail="MCP 전용 토큰이 필요합니다. 프로필에서 발급하세요.",
            )
```

- [ ] **Step 4: `__call__` 의 호출부 수정 + last_used 트리거**

[auth.py:78-99](../../../../../harness-server/app/mcp/auth.py:78) 의 try/except 블록과 token_ctx 설정 부분을 다음으로 교체:

```python
        request = Request(scope, receive=receive)
        try:
            user, payload = await self._authenticate(request)
        except HTTPException as e:
            response = JSONResponse(
                {"detail": e.detail}, status_code=e.status_code
            )
            await response(scope, receive, send)
            return
        except Exception:  # noqa: BLE001
            logger.exception("mcp auth middleware unexpected error")
            response = JSONResponse(
                {"detail": "internal auth error"}, status_code=500
            )
            await response(scope, receive, send)
            return

        token_ctx = _current_mcp_user.set(user)

        # last_used_at 업데이트 — fire-and-forget. Task 참조는 set 에 보존
        # 후 done callback 으로 제거 (GC 안전 + warning 회피).
        jti = payload.get("jti")
        if jti:
            from app.service import mcp_token_repository
            task = asyncio.create_task(mcp_token_repository.touch_last_used(jti))
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

        try:
            await self.app(scope, receive, send)
        finally:
            _current_mcp_user.reset(token_ctx)
```

- [ ] **Step 5: 기존 깨지는 테스트 4개 마이그레이션**

`tests/mcp/test_mcp_auth.py` 의 4개 케이스를 `create_mcp_token` 으로 교체:

**5a. `test_middleware_rejects_revoked_token`** ([test_mcp_auth.py:199-223](../../../../../harness-server/tests/mcp/test_mcp_auth.py:199)) — `create_access_token` 을 `create_mcp_token` 으로:

```python
    from app.core.security import create_mcp_token
    token, _ = create_mcp_token("alice@example.com", exp_days=90)
```

**5b. `test_middleware_rejects_unknown_user`** ([test_mcp_auth.py:226-250](../../../../../harness-server/tests/mcp/test_mcp_auth.py:226)) — 동일 교체:

```python
    from app.core.security import create_mcp_token
    token, _ = create_mcp_token("ghost@example.com", exp_days=90)
```

**5c. `test_middleware_sets_contextvar_for_valid_token`** ([test_mcp_auth.py:253-285](../../../../../harness-server/tests/mcp/test_mcp_auth.py:253)) — 동일:

```python
    from app.core.security import create_mcp_token
    token, _ = create_mcp_token("alice@example.com", exp_days=90)
```

**5d. `test_middleware_resets_contextvar_after_request`** ([test_mcp_auth.py:288-316](../../../../../harness-server/tests/mcp/test_mcp_auth.py:288)) — 동일:

```python
    from app.core.security import create_mcp_token
    token, _ = create_mcp_token("alice@example.com", exp_days=90)
```

(`create_access_token` import 는 다른 케이스에서 여전히 쓰이므로 file 상단 import 유지.)

- [ ] **Step 6: 테스트 실행 → ALL GREEN**

```bash
pytest tests/mcp/test_mcp_auth.py -v
```
Expected: 12개 (기존 8 + 신규 2 + tool 가드 3, 단 일부 카운트 중복 — 어쨌든 PASS).

- [ ] **Step 7: 커밋**

```bash
git add app/mcp/auth.py tests/mcp/test_mcp_auth.py
git commit -m "feat(mcp): middleware strict mcp-only + touch last_used + payload tuple"
```

---

### Task A6: Pydantic 스키마 + label 정규화 검증

**Files:**
- Modify: `app/schemas.py`
- Test: `tests/core/test_mcp_token_schemas.py` (create)

**왜:** `label.strip()[:80]` 같은 사후 정규화로는 `"   "` (공백) 같은 빈 라벨 통과 위험. Pydantic 단에서 strip + min_length=1 강제.

- [ ] **Step 1: 실패 테스트 작성**

`tests/core/test_mcp_token_schemas.py`:

```python
"""McpToken Pydantic 스키마 검증."""
import pytest
from pydantic import ValidationError

from app.schemas import McpTokenIssueRequest


def test_label_strips_whitespace():
    req = McpTokenIssueRequest(label="  노트북-Cursor  ")
    assert req.label == "노트북-Cursor"


def test_label_whitespace_only_is_rejected():
    with pytest.raises(ValidationError):
        McpTokenIssueRequest(label="   ")


def test_label_empty_string_is_rejected():
    with pytest.raises(ValidationError):
        McpTokenIssueRequest(label="")


def test_label_over_80_chars_is_rejected():
    with pytest.raises(ValidationError):
        McpTokenIssueRequest(label="x" * 81)
```

- [ ] **Step 2: FAIL**

```bash
pytest tests/core/test_mcp_token_schemas.py -v
```
Expected: ImportError — `McpTokenIssueRequest` 미정의.

- [ ] **Step 3: 스키마 정의**

`app/schemas.py` 끝에 추가:

```python
# ===== MCP Tokens =====

from pydantic import field_validator  # noqa: E402 — 기존 import 블록 뒤 추가 (필요 시 상단으로 이동)


class McpTokenIssueRequest(BaseModel):
    label: str = Field(
        min_length=1, max_length=80,
        description="사용자 식별용 라벨 (예: '노트북-Cursor')",
    )

    @field_validator("label", mode="before")
    @classmethod
    def _strip_label(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


class McpTokenIssueResponse(BaseModel):
    """발급 직후 1회 응답 — token 평문 포함."""
    token: str
    jti: str
    label: str
    expires_at: str


class McpTokenSummary(BaseModel):
    """목록 조회 응답 — 평문 토큰 없음."""
    jti: str
    label: str
    created_at: str
    last_used_at: Optional[str] = None
    expires_at: str
    revoked: bool
```

**확인:** `Field`, `Optional`, `BaseModel` 이 [schemas.py:1-3](../../../../../harness-server/app/schemas.py) 상단에 이미 import 되어 있다. `field_validator` 는 이번에 새로 추가.

- [ ] **Step 4: PASS**

```bash
pytest tests/core/test_mcp_token_schemas.py -v
```
Expected: 4개 모두 PASS. (strip + min_length=1 조합으로 빈/공백 라벨 모두 차단.)

- [ ] **Step 5: 커밋**

```bash
git add app/schemas.py tests/core/test_mcp_token_schemas.py
git commit -m "feat(mcp): McpToken schemas with label strip+min_length validator"
```

---

### Task A7a: 라우트 + 테스트 (race-safe revoke)

**Files:**
- Create: `app/api/mcp_token_routes.py`
- Test: `tests/api/test_mcp_token_routes.py`

**핵심 변경 from 초안:** revoke 호출 순서가 **peek (Neo4j read) → blacklist.revoke (Redis) → mark_revoked (Neo4j write)**. Redis 가 가장 먼저 차단을 발효.

- [ ] **Step 1: 실패 테스트 작성**

`tests/api/test_mcp_token_routes.py`:

```python
"""mcp_token_routes 단위 테스트.

라우트는 Depends(get_current_user) 를 쓰므로 user 는 직접 주입,
repository / token_blacklist 는 mock.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api import mcp_token_routes as routes
from app.service.user_repository import UserPublic

pytestmark = pytest.mark.asyncio


def _user(email: str = "u@e.com") -> UserPublic:
    return UserPublic(
        id="u-1", email=email, name="t",
        subscription_type="free", is_admin=False, auto_progress=True,
    )


async def test_issue_returns_plaintext_token_once(monkeypatch):
    captured = {}

    def fake_create(email, exp_days):
        captured["email"] = email
        return ("plaintext-token", "jti-1")

    async def fake_repo(*, email, jti, label, exp_days):
        captured["jti"] = jti
        captured["label"] = label
        from app.service.mcp_token_repository import McpTokenRow
        return McpTokenRow(
            jti=jti, label=label,
            created_at="2026-05-18T00:00:00+00:00",
            expires_at="2026-08-16T00:00:00+00:00",
            revoked=False,
        )

    monkeypatch.setattr(routes.security, "create_mcp_token", fake_create)
    monkeypatch.setattr(
        routes.mcp_token_repository, "create_mcp_token_record", fake_repo
    )

    from app.schemas import McpTokenIssueRequest
    resp = await routes.issue_mcp_token_route(
        McpTokenIssueRequest(label="노트북-Cursor"), current_user=_user(),
    )
    assert resp.token == "plaintext-token"
    assert resp.jti == "jti-1"
    assert captured["label"] == "노트북-Cursor"


async def test_issue_returns_400_on_limit_exceeded(monkeypatch):
    from app.service.mcp_token_repository import McpTokenLimitExceeded
    monkeypatch.setattr(routes.security, "create_mcp_token", lambda e, exp_days: ("t", "j"))

    async def fake_repo(**kw):
        raise McpTokenLimitExceeded("limit")
    monkeypatch.setattr(
        routes.mcp_token_repository, "create_mcp_token_record", fake_repo
    )

    from app.schemas import McpTokenIssueRequest
    with pytest.raises(HTTPException) as exc:
        await routes.issue_mcp_token_route(
            McpTokenIssueRequest(label="L"), current_user=_user(),
        )
    assert exc.value.status_code == 400


async def test_list_returns_summaries(monkeypatch):
    from app.service.mcp_token_repository import McpTokenRow
    async def fake_list(email):
        return [McpTokenRow(
            jti="j1", label="A",
            created_at="2026-05-01T00:00:00+00:00",
            last_used_at=None,
            expires_at="2026-08-01T00:00:00+00:00",
            revoked=False,
        )]
    monkeypatch.setattr(
        routes.mcp_token_repository, "list_tokens_for_user", fake_list
    )
    resp = await routes.list_mcp_tokens_route(current_user=_user())
    assert len(resp) == 1
    assert resp[0].jti == "j1"


async def test_revoke_calls_blacklist_before_mark_revoked(monkeypatch):
    """race 안전: Redis 가 Neo4j 마킹보다 먼저 호출되어야 한다."""
    call_order: list[str] = []

    async def fake_peek(email, jti):
        call_order.append("peek")
        return 99999

    async def fake_blacklist(jti, exp_epoch):
        call_order.append("blacklist")
        assert exp_epoch == 99999

    async def fake_mark(email, jti):
        call_order.append("mark")
        return True

    monkeypatch.setattr(
        routes.mcp_token_repository, "peek_revoke_target", fake_peek
    )
    monkeypatch.setattr(routes.token_blacklist, "revoke", fake_blacklist)
    monkeypatch.setattr(
        routes.mcp_token_repository, "mark_token_revoked", fake_mark
    )

    await routes.revoke_mcp_token_route(jti="j1", current_user=_user())
    assert call_order == ["peek", "blacklist", "mark"]


async def test_revoke_returns_404_when_not_owner(monkeypatch):
    async def fake_peek(email, jti):
        return None  # 소유 아님 / 이미 회수
    monkeypatch.setattr(
        routes.mcp_token_repository, "peek_revoke_target", fake_peek
    )
    with pytest.raises(HTTPException) as exc:
        await routes.revoke_mcp_token_route(jti="ghost", current_user=_user())
    assert exc.value.status_code == 404
```

- [ ] **Step 2: FAIL**

```bash
pytest tests/api/test_mcp_token_routes.py -v
```
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 라우트 작성**

`app/api/mcp_token_routes.py`:

```python
"""
MCP 전용 토큰 발급/조회/회수 API.

[보안]
- 모든 엔드포인트 Depends(get_current_user) — 로그인 access_token 필요.
- 평문 토큰은 발급 (POST) 응답에서만 1회 노출. 목록/조회에서는 jti+메타만.
- 회수는 (1) peek (Neo4j read — 소유/exp 조회, state 변경 없음)
        → (2) Redis token_blacklist (즉시 발효)
        → (3) Neo4j mark revoked (감사 트레일)
  순으로 race window 최소화.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core import security, token_blacklist
from app.core.security import get_current_user
from app.schemas import (
    McpTokenIssueRequest,
    McpTokenIssueResponse,
    McpTokenSummary,
)
from app.service import mcp_token_repository
from app.service.user_repository import UserPublic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp-tokens", tags=["mcp-tokens"])


@router.post("", response_model=McpTokenIssueResponse, status_code=201)
async def issue_mcp_token_route(
    payload: McpTokenIssueRequest,
    current_user: UserPublic = Depends(get_current_user),
) -> McpTokenIssueResponse:
    """MCP 전용 토큰 1개 발급. 평문은 이 응답에서만 반환된다."""
    token, jti = security.create_mcp_token(current_user.email, exp_days=90)
    try:
        row = await mcp_token_repository.create_mcp_token_record(
            email=current_user.email,
            jti=jti,
            label=payload.label,
            exp_days=90,
        )
    except mcp_token_repository.McpTokenLimitExceeded as e:
        raise HTTPException(status_code=400, detail=str(e))
    return McpTokenIssueResponse(
        token=token, jti=row.jti, label=row.label, expires_at=row.expires_at,
    )


@router.get("", response_model=list[McpTokenSummary])
async def list_mcp_tokens_route(
    current_user: UserPublic = Depends(get_current_user),
) -> list[McpTokenSummary]:
    rows = await mcp_token_repository.list_tokens_for_user(current_user.email)
    return [McpTokenSummary(**r.model_dump()) for r in rows]


@router.delete("/{jti}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_mcp_token_route(
    jti: str,
    current_user: UserPublic = Depends(get_current_user),
) -> None:
    # (1) Neo4j read — 소유권/exp 조회. state 변경 없음.
    exp_epoch = await mcp_token_repository.peek_revoke_target(
        current_user.email, jti
    )
    if exp_epoch is None:
        raise HTTPException(
            status_code=404,
            detail="존재하지 않거나 이미 회수된 토큰입니다.",
        )

    # (2) Redis — 즉시 발효. 미들웨어가 이 시점부터 401 발급.
    await token_blacklist.revoke(jti, exp_epoch)

    # (3) Neo4j write — 감사 트레일. 실패해도 인증 차단은 이미 성공한 상태.
    marked = await mcp_token_repository.mark_token_revoked(
        current_user.email, jti
    )
    if not marked:
        logger.warning(
            "mark_token_revoked returned False for jti=%s — Redis 차단은 유효", jti
        )
```

- [ ] **Step 4: PASS**

```bash
pytest tests/api/test_mcp_token_routes.py -v
```
Expected: 5개 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/api/mcp_token_routes.py tests/api/test_mcp_token_routes.py
git commit -m "feat(mcp): POST/GET/DELETE /api/mcp-tokens with race-safe revoke"
```

---

### Task A7b: 라우터 등록 + lifespan 에 ensure_constraints 추가

**Files:**
- Modify: `app/api/main.py` ([line 112-172](../../../../../harness-server/app/api/main.py:112) lifespan, [line 369](../../../../../harness-server/app/api/main.py:369) router include)

**확인 (executor):** [main.py:112-172](../../../../../harness-server/app/api/main.py:112) 에 `async def lifespan(app):` 함수가 이미 있다 (Neo4j driver, arq pool 정리). `@app.on_event` 아님. ensure_constraints 는 이 lifespan 의 startup 부분에 추가.

- [ ] **Step 1: 라우터 등록**

[main.py:369](../../../../../harness-server/app/api/main.py:369) (`app.include_router(inquiry_admin_router)` 다음 라인) 에 추가:

```python
# [2026-05-18] MCP 전용 토큰 — 사용자별 발급/조회/회수.
from app.api.mcp_token_routes import router as mcp_token_router
app.include_router(mcp_token_router)
```

- [ ] **Step 2: lifespan 에 ensure_constraints 호출 추가**

[main.py:112-172](../../../../../harness-server/app/api/main.py:112) 의 `lifespan` 함수 내부, **startup 측** (yield 이전) 의 다른 ensure_* 호출 근처에 추가:

```python
        from app.service import mcp_token_repository
        await mcp_token_repository.ensure_constraints()
```

(구체 위치는 기존 `user_repository.ensure_constraints` 같은 호출이 있다면 그 뒤. 없으면 yield 직전에.)

- [ ] **Step 3: 서버 부팅 확인 (smoke test)**

```bash
uvicorn app.api.main:app --port 8001 &
sleep 3
curl -i http://localhost:8001/api/mcp-tokens
kill %1
```
Expected: `401 Unauthorized` (인증 없음 — 라우터는 정상 등록됨), startup 로그에 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/api/main.py
git commit -m "chore(mcp): register mcp_token_router + ensure_constraints in lifespan"
```

---

### Task A7c: 백엔드 전체 회귀

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 백엔드 테스트**

```bash
pytest tests/ -x --ff
```
Expected: 기존 + 신규 모두 PASS. 실패 시 가장 먼저 깨진 케이스부터 fix.

- [ ] **Step 2: import 정리 (있다면)**

```bash
ruff check app/ tests/
```
Expected: 경고 없음 또는 사전과 동일 수준.

- [ ] **Step 3: 커밋 (필요 시)**

회귀에서 stragglers 가 잡히면 fix 커밋. 없으면 skip.

---

## Phase B: Frontend

### Task B1: API client (`src/api/mcpTokens.js`)

**Files:**
- Create: `src/api/mcpTokens.js`
- Test: `tests/api/mcpTokens.test.js`

**Path 검증:** 코드베이스의 테스트는 루트 `tests/{composables,store,utils,api,integration}/` 구조 (정찰 완료). `src/__tests__/` 가 아니라 **루트 `tests/`** 에 둔다. `tests/api/` 디렉토리는 없을 수 있으므로 필요 시 생성.

- [ ] **Step 1: 실패 테스트 작성**

`tests/api/mcpTokens.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

import axios from '@/utils/axios'
import {
  issueMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from '@/api/mcpTokens'

describe('mcpTokens API', () => {
  beforeEach(() => {
    axios.post.mockReset()
    axios.get.mockReset()
    axios.delete.mockReset()
  })

  it('issueMcpToken posts label and returns token payload', async () => {
    axios.post.mockResolvedValue({
      data: { token: 'tok', jti: 'j1', label: 'L', expires_at: '2026-08-16' },
    })
    const res = await issueMcpToken('노트북-Cursor')
    expect(axios.post).toHaveBeenCalledWith('/api/mcp-tokens', {
      label: '노트북-Cursor',
    })
    expect(res.token).toBe('tok')
  })

  it('listMcpTokens returns array', async () => {
    axios.get.mockResolvedValue({ data: [{ jti: 'j1' }] })
    const res = await listMcpTokens()
    expect(axios.get).toHaveBeenCalledWith('/api/mcp-tokens')
    expect(res).toHaveLength(1)
  })

  it('revokeMcpToken DELETEs by jti', async () => {
    axios.delete.mockResolvedValue({ status: 204 })
    await revokeMcpToken('j1')
    expect(axios.delete).toHaveBeenCalledWith('/api/mcp-tokens/j1')
  })
})
```

- [ ] **Step 2: 테스트 실행 → FAIL**

```bash
npx vitest run tests/api/mcpTokens.test.js
```
Expected: FAIL — `@/api/mcpTokens` 모듈 없음.

- [ ] **Step 3: 구현**

`src/api/mcpTokens.js`:

```javascript
/**
 * MCP 전용 토큰 API client.
 *
 * - 로그인 access_token 으로 인증 (axios 인터셉터가 자동 첨부).
 * - 발급 응답의 `token` 은 평문 — 한 번만 받을 수 있으므로 즉시 모달에 표시 후 컴포넌트 state 에서 제거.
 */
import axios from '@/utils/axios'

export const issueMcpToken = async (label) => {
  const res = await axios.post('/api/mcp-tokens', { label })
  return res.data
}

export const listMcpTokens = async () => {
  const res = await axios.get('/api/mcp-tokens')
  return res.data
}

export const revokeMcpToken = async (jti) => {
  await axios.delete(`/api/mcp-tokens/${jti}`)
}
```

- [ ] **Step 4: 테스트 실행 → PASS**

```bash
npx vitest run tests/api/mcpTokens.test.js
```
Expected: 3개 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/api/mcpTokens.js tests/api/mcpTokens.test.js
git commit -m "feat(mcp): FE API client for MCP token issue/list/revoke"
```

---

### Task B2: 발급 모달 (`McpTokenIssueDialog.vue`)

**Files:**
- Create: `src/components/common/McpTokenIssueDialog.vue`

**핵심 (Q2 결정):** 모달 Stage 2 에 **토큰 평문 박힌 완성형 IDE 스니펫** 제공 → 사용자가 그대로 복사해 paste. 카드의 placeholder 스니펫은 "토큰 형식 미리보기" 용도로 유지 (다른 task).

- [ ] **Step 1: 컴포넌트 작성**

`src/components/common/McpTokenIssueDialog.vue`:

```vue
<script setup>
/**
 * MCP 토큰 발급 모달.
 *
 * [흐름]
 * 1. 라벨 입력 → "발급"
 * 2. POST /api/mcp-tokens → 응답 `token` 평문 받음
 * 3. **이 모달에서만** 평문 표시 + **토큰 박힌 완성형 IDE 스니펫** 제공
 * 4. "안전하게 저장했음" 체크 후에만 닫기 허용
 * 5. 닫히면 평문은 state 에서 즉시 제거 (다시 못 봄)
 *
 * [보안 설계]
 * - 평문 토큰은 props 로 새지 않음 — 이 컴포넌트 내부 ref 만 보유.
 * - watch(modelValue) 가 닫힐 때 ref 들 reset → 다음 렌더 시 평문 흔적 0.
 */
import { ref, computed, watch } from 'vue'
import { Copy, Check, AlertTriangle } from 'lucide-vue-next'
import { issueMcpToken } from '@/api/mcpTokens'
import { useSnackbar } from '@/composables/useSnackbar'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'issued'])

const { showSuccess, showError } = useSnackbar()

const MCP_BASE =
  import.meta.env.VITE_API_BACKEND_URL || 'https://api.harness-system.com'
const MCP_ENDPOINT = `${MCP_BASE}/mcp/sse`

const label = ref('')
const issuing = ref(false)
const issuedToken = ref('')      // 평문 — 모달 닫힐 때 ''
const issuedJti = ref('')
const issuedExpiresAt = ref('')
const copyConfirmed = ref(false)
const copiedField = ref(null)     // 'token' | 'snippet'

const canIssue = computed(() => label.value.trim().length > 0 && !issuing.value)
const canClose = computed(() => !issuedToken.value || copyConfirmed.value)

// 토큰 박힌 완성형 스니펫 — Cursor 와 Claude Code 동일 schema
const fullSnippet = computed(() => {
  if (!issuedToken.value) return ''
  return JSON.stringify({
    mcpServers: {
      harness: {
        url: MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${issuedToken.value}` },
      },
    },
  }, null, 2)
})

const issue = async () => {
  if (!canIssue.value) return
  issuing.value = true
  try {
    const res = await issueMcpToken(label.value.trim())
    issuedToken.value = res.token
    issuedJti.value = res.jti
    issuedExpiresAt.value = res.expires_at
    emit('issued')
  } catch (e) {
    const msg = e?.response?.data?.detail || '토큰 발급 실패'
    showError(msg)
  } finally {
    issuing.value = false
  }
}

const copy = async (value, field) => {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = field
    setTimeout(() => {
      if (copiedField.value === field) copiedField.value = null
    }, 1800)
    showSuccess(field === 'token' ? '토큰 복사됨' : '스니펫 복사됨')
  } catch {
    showError('복사 실패 — 수동 복사 필요')
  }
}

const close = () => {
  if (!canClose.value) return
  emit('update:modelValue', false)
}

// 모달 닫힐 때 평문 토큰 메모리에서 제거
watch(() => props.modelValue, (open) => {
  if (!open) {
    issuedToken.value = ''
    issuedJti.value = ''
    issuedExpiresAt.value = ''
    label.value = ''
    copyConfirmed.value = false
    copiedField.value = null
  }
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    :persistent="!canClose"
    @update:model-value="(v) => !v && close()"
  >
    <v-card class="pa-5">
      <h3 class="text-h6 mb-3">MCP 토큰 발급</h3>

      <!-- Stage 1: 라벨 입력 -->
      <template v-if="!issuedToken">
        <p class="text-body-2 text-muted mb-3">
          이 토큰을 어디서 쓸지 식별할 라벨을 입력하세요. 발급 후 변경할 수 없습니다.
        </p>
        <v-text-field
          v-model="label"
          placeholder="예: 노트북-Cursor, 회사데스크탑-Claude"
          maxlength="80"
          counter
          autofocus
          @keydown.enter="issue"
        />
        <div class="d-flex justify-end gap-2 mt-3">
          <v-btn variant="text" @click="close">취소</v-btn>
          <v-btn color="primary" :loading="issuing" :disabled="!canIssue" @click="issue">
            발급
          </v-btn>
        </div>
      </template>

      <!-- Stage 2: 평문 토큰 + 완성형 스니펫 -->
      <template v-else>
        <div class="warning-box mb-3">
          <AlertTriangle :size="16" class="mr-2" />
          이 토큰은 <strong>지금 한 번만</strong> 표시됩니다. 안전한 곳에 저장한 뒤 확인해 주세요.
        </div>

        <div class="field-label">토큰 (단독 — 다른 도구에 직접 입력 시)</div>
        <div class="token-row mb-3">
          <code class="token-value mono-text">{{ issuedToken }}</code>
          <button class="icon-btn" :title="copiedField === 'token' ? '복사됨' : '복사'" @click="copy(issuedToken, 'token')">
            <Check v-if="copiedField === 'token'" :size="14" class="text-success" />
            <Copy v-else :size="14" />
          </button>
        </div>

        <div class="field-label">완성형 IDE 설정 (Cursor `~/.cursor/mcp.json` · Claude Code 프로젝트 루트 `.mcp.json`)</div>
        <div class="snippet-wrap mb-3">
          <pre class="snippet mono-text">{{ fullSnippet }}</pre>
          <button class="icon-btn snippet-copy" :title="copiedField === 'snippet' ? '복사됨' : '복사'" @click="copy(fullSnippet, 'snippet')">
            <Check v-if="copiedField === 'snippet'" :size="14" class="text-success" />
            <Copy v-else :size="14" />
          </button>
        </div>

        <p class="text-caption text-muted mb-2">
          만료: {{ issuedExpiresAt }} (90일) · 프로젝트 루트 <code>.mcp.json</code> 사용 시 반드시 <code>.gitignore</code> 에 <code>.mcp.json</code> 추가하세요.
        </p>

        <v-checkbox
          v-model="copyConfirmed"
          label="안전한 곳에 저장했고, 이 창을 닫으면 다시 볼 수 없음을 이해합니다."
          density="compact"
          hide-details
        />

        <div class="d-flex justify-end mt-3">
          <v-btn color="primary" :disabled="!canClose" @click="close">
            <Check :size="14" class="mr-1" /> 완료
          </v-btn>
        </div>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.warning-box {
  display: flex; align-items: center;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 6px; font-size: 13px;
}
.field-label {
  font-size: 12px; font-weight: 600;
  color: var(--text-muted, #999); margin-bottom: 6px;
}
.token-row {
  display: flex; align-items: center; gap: 6px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; padding: 8px 12px;
}
.token-value {
  flex-grow: 1; font-size: 12px; word-break: break-all;
}
.icon-btn {
  flex-shrink: 0; padding: 6px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; color: var(--text-muted, #999);
  cursor: pointer; transition: all 0.15s;
}
.icon-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--text-main, #fff); }
.snippet-wrap { position: relative; }
.snippet {
  margin: 0; padding: 12px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; font-size: 12px; line-height: 1.5;
  overflow-x: auto; white-space: pre;
}
.snippet-copy { position: absolute; top: 8px; right: 8px; }
.text-success { color: #10b981; }
</style>
```

- [ ] **Step 2: 빌드 syntax check**

```bash
npm run build
```
Expected: 빌드 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/components/common/McpTokenIssueDialog.vue
git commit -m "feat(mcp): McpTokenIssueDialog — 1회 평문 + 완성형 IDE 스니펫"
```

---

### Task B3: 토큰 목록 (`McpTokenList.vue`)

**Files:**
- Create: `src/components/common/McpTokenList.vue`

**핵심:** 회수 confirmation 은 native `window.confirm` 아니라 코드베이스의 [useConfirm](src/composables/useConfirm.js) (Promise 기반 ConfirmDialog) 사용.

- [ ] **Step 1: 컴포넌트 작성**

`src/components/common/McpTokenList.vue`:

```vue
<script setup>
/**
 * 현재 사용자의 MCP 토큰 목록.
 *
 * - 평문 토큰 표시 0 — label / 마지막 사용 / 만료 / 회수 버튼만.
 * - 회수는 useConfirm (Promise 기반) → DELETE → 목록 reload.
 *
 * 부모가 `ref.reload()` 호출해 새 발급 직후 갱신.
 */
import { ref, onMounted } from 'vue'
import { Trash2, RefreshCw } from 'lucide-vue-next'
import { listMcpTokens, revokeMcpToken } from '@/api/mcpTokens'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'

const { showSuccess, showError } = useSnackbar()
const confirm = useConfirm()

const tokens = ref([])
const loading = ref(false)
const revoking = ref(null)  // jti

const load = async () => {
  loading.value = true
  try {
    tokens.value = await listMcpTokens()
  } catch (e) {
    showError(e?.response?.data?.detail || '목록 조회 실패')
  } finally {
    loading.value = false
  }
}

const revoke = async (token) => {
  const ok = await confirm({
    title: 'MCP 토큰 회수',
    message: `"${token.label}" 토큰을 회수합니다.\n사용 중인 IDE 는 즉시 401 을 받게 됩니다.\n계속할까요?`,
    confirmText: '회수',
    cancelText: '취소',
    variant: 'danger',
  })
  if (!ok) return

  revoking.value = token.jti
  try {
    await revokeMcpToken(token.jti)
    showSuccess('회수되었습니다')
    await load()
  } catch (e) {
    showError(e?.response?.data?.detail || '회수 실패')
  } finally {
    revoking.value = null
  }
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

const statusOf = (t) => {
  if (t.revoked) return { label: '회수됨', cls: 'status-revoked' }
  if (new Date(t.expires_at) < new Date()) return { label: '만료', cls: 'status-expired' }
  return { label: '활성', cls: 'status-active' }
}

defineExpose({ reload: load })
onMounted(load)
</script>

<template>
  <section class="mcp-token-list">
    <div class="list-header">
      <span class="list-title">발급된 MCP 토큰</span>
      <v-btn icon size="x-small" variant="text" :loading="loading" @click="load">
        <RefreshCw :size="14" />
      </v-btn>
    </div>

    <div v-if="tokens.length === 0 && !loading" class="empty">
      아직 발급한 MCP 토큰이 없습니다.
    </div>

    <table v-else class="tokens-table">
      <thead>
        <tr>
          <th>라벨</th>
          <th>상태</th>
          <th>마지막 사용</th>
          <th>만료</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tokens" :key="t.jti">
          <td class="label-cell">{{ t.label }}</td>
          <td>
            <span class="status-pill" :class="statusOf(t).cls">{{ statusOf(t).label }}</span>
          </td>
          <td>{{ fmtDate(t.last_used_at) }}</td>
          <td>{{ fmtDate(t.expires_at) }}</td>
          <td>
            <v-btn
              v-if="!t.revoked"
              icon size="x-small" variant="text" color="error"
              :loading="revoking === t.jti"
              @click="revoke(t)"
            >
              <Trash2 :size="14" />
            </v-btn>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.mcp-token-list {
  margin-top: 18px;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #999);
}
.empty {
  padding: 14px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-muted, #888);
  text-align: center;
}
.tokens-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.tokens-table th {
  text-align: left;
  font-weight: 500;
  color: var(--text-muted, #999);
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.tokens-table td {
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.label-cell {
  font-weight: 500;
}
.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.status-active { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.status-revoked { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.status-expired { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }
</style>
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/common/McpTokenList.vue
git commit -m "feat(mcp): McpTokenList — 평문 토큰 없는 목록 + 회수 버튼"
```

---

### Task B4: McpConnectCard 재설계 — 평문 토큰 노출 제거 + 5 tools 섹션 유지

**Files:**
- Modify: `src/components/common/McpConnectCard.vue` (전면 교체)

**핵심 변경 from 초안:**
- placeholder 텍스트 `<YOUR_MCP_TOKEN>` → **`YOUR_MCP_TOKEN_HERE`** (꺾쇠 사용자 혼동 방지)
- `<v-btn prepend-icon ...>` 의 prepend-icon 속성 **제거** (안에 `<Plus />` 슬롯 있음)
- 기존 "제공 도구 5종" 섹션 **유지** (사용자가 뭘 연결하는지 가장 잘 설명하던 부분)
- 카드 스니펫은 placeholder 미리보기 용도 — 실제 사용 시엔 모달의 완성형 스니펫 권장

- [ ] **Step 1: 컴포넌트 전체 재작성**

`src/components/common/McpConnectCard.vue` 를 다음으로 교체:

```vue
<script setup>
/**
 * MCP Connect Card — Cursor / Claude Code 가 우리 MCP 서버에 연결하는 안내.
 *
 * [보안 설계 — 2026-05-18 개정]
 * - 평문 토큰은 이 카드에서 절대 노출 안 됨. 발급은 모달에서만, 1회 표시.
 * - 카드의 스니펫은 형식 미리보기 용도 (`YOUR_MCP_TOKEN_HERE` placeholder).
 * - 실제 사용 시엔 발급 모달의 "완성형 스니펫" 을 복사하는 게 더 편함.
 */
import { ref, computed } from 'vue'
import { Sparkles, Copy, ExternalLink, Check, Plus } from 'lucide-vue-next'
import McpTokenIssueDialog from './McpTokenIssueDialog.vue'
import McpTokenList from './McpTokenList.vue'

const MCP_BASE =
  import.meta.env.VITE_API_BACKEND_URL || 'https://api.harness-system.com'
const MCP_ENDPOINT = `${MCP_BASE}/mcp/sse`

const issueOpen = ref(false)
const listRef = ref(null)
const copiedField = ref(null)

const TOKEN_PLACEHOLDER = 'YOUR_MCP_TOKEN_HERE'  // 꺾쇠 없음 — paste 시 혼동 방지

const previewConfig = computed(() => JSON.stringify({
  mcpServers: {
    harness: {
      url: MCP_ENDPOINT,
      headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
    },
  },
}, null, 2))

const copy = async (value, field) => {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = field
    setTimeout(() => {
      if (copiedField.value === field) copiedField.value = null
    }, 1800)
  } catch {
    // clipboard 권한 없거나 비-https — 무시
  }
}

const onIssued = () => {
  listRef.value?.reload?.()
}
</script>

<template>
  <section class="mcp-card" aria-label="AI 에이전트 연결">
    <div class="mcp-card-header">
      <Sparkles :size="18" class="mr-2" />
      <span class="mcp-card-title">AI 코딩 에이전트 연결 (MCP)</span>
      <span class="mcp-badge">NEW</span>
    </div>

    <p class="mcp-intro text-muted text-body-2">
      Cursor / Claude Code 가 이 프로젝트의 PRD Story · Aggregate · API 추적성을
      <strong>직접 조회</strong>할 수 있습니다. 코드 파일을 편집하면 에이전트가
      "이 파일이 어떤 Story 의 구현인지" 즉시 컨텍스트로 활용.
    </p>

    <!-- Endpoint -->
    <div class="mcp-field">
      <span class="mcp-field-label">MCP Endpoint</span>
      <div class="mcp-field-row">
        <code class="mcp-value mono-text">{{ MCP_ENDPOINT }}</code>
        <button
          class="mcp-icon-btn"
          :title="copiedField === 'endpoint' ? '복사됨' : '복사'"
          @click="copy(MCP_ENDPOINT, 'endpoint')"
        >
          <Check v-if="copiedField === 'endpoint'" :size="14" class="text-success" />
          <Copy v-else :size="14" />
        </button>
      </div>
    </div>

    <!-- Token issuance CTA — 평문 노출 없음 -->
    <div class="mcp-field">
      <span class="mcp-field-label">
        Access Token
        <span class="mcp-field-hint text-caption text-muted">
          — 발급 후 <strong>한 번만</strong> 표시됩니다. 발급 모달 안에 토큰 포함된 완성형 스니펫이 제공돼요.
        </span>
      </span>
      <v-btn color="primary" size="small" @click="issueOpen = true">
        <Plus :size="14" class="mr-1" /> 새 MCP 토큰 발급
      </v-btn>
    </div>

    <McpTokenList ref="listRef" />

    <!-- Config preview snippet — placeholder 형식 안내 -->
    <div class="mcp-field mt-4">
      <span class="mcp-field-label">
        IDE 설정 형식 (Cursor <code>~/.cursor/mcp.json</code> · Claude Code <code>.mcp.json</code>)
        <span class="mcp-field-hint text-caption text-muted">
          — 발급 모달에 토큰 박힌 완성형이 있어요. 이건 형식 미리보기.
          프로젝트 루트 <code>.mcp.json</code> 사용 시 <strong><code>.gitignore</code> 에 추가</strong> 필수.
        </span>
      </span>
      <div class="mcp-snippet-wrap">
        <pre class="mcp-snippet mono-text">{{ previewConfig }}</pre>
        <button
          class="mcp-icon-btn mcp-snippet-copy"
          :title="copiedField === 'preview' ? '복사됨' : '복사 (placeholder 포함)'"
          @click="copy(previewConfig, 'preview')"
        >
          <Check v-if="copiedField === 'preview'" :size="14" class="text-success" />
          <Copy v-else :size="14" />
        </button>
      </div>
    </div>

    <!-- Available tools 요약 (사용자가 뭘 연결하는지 명확히) -->
    <div class="mcp-tools">
      <span class="mcp-field-label">제공 도구 (5종, 모두 read-only)</span>
      <ul class="mcp-tools-list">
        <li>
          <code>find_spec_for_file</code> — 파일 경로 → 이 파일을 구현하는 Story /
          Aggregate / API / Service
        </li>
        <li>
          <code>trace_upstream</code> — Design 노드 → PRD Story → Epic 체인
        </li>
        <li>
          <code>list_design_nodes</code> — 프로젝트의 design 노드 전체 + Story 요약
        </li>
        <li>
          <code>get_story</code> — Story 상세 + 파생된 design 노드 + 화면
        </li>
        <li>
          <code>search_spec</code> — spec 항목 텍스트 검색 (name + description)
        </li>
      </ul>
    </div>

    <p class="mcp-footnote text-caption text-muted">
      <ExternalLink :size="11" class="mr-1" />
      MCP (Model Context Protocol) — Anthropic 표준. Cursor 0.45+, Claude Code 모두 지원.
    </p>

    <McpTokenIssueDialog v-model="issueOpen" @issued="onIssued" />
  </section>
</template>

<style scoped>
.mcp-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 20px 24px;
}
.mcp-card-header { display: flex; align-items: center; margin-bottom: 12px; }
.mcp-card-title { font-size: 15px; font-weight: 600; color: var(--text-main, #fff); }
.mcp-badge {
  margin-left: 10px; padding: 2px 8px; border-radius: 4px;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
}
.mcp-intro { margin-bottom: 16px; line-height: 1.55; }
.mcp-field { margin-bottom: 14px; }
.mcp-field-label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--text-muted, #999); margin-bottom: 6px;
}
.mcp-field-hint { font-weight: 400; margin-left: 4px; }
.mcp-field-row { display: flex; align-items: center; gap: 6px; }
.mcp-value {
  flex-grow: 1; padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; font-size: 13px; word-break: break-all;
}
.mcp-icon-btn {
  flex-shrink: 0; padding: 6px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; color: var(--text-muted, #999);
  cursor: pointer; transition: all 0.15s;
}
.mcp-icon-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); color: var(--text-main, #fff); }
.mcp-snippet-wrap { position: relative; }
.mcp-snippet {
  margin: 0; padding: 12px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; font-size: 12px; line-height: 1.5;
  overflow-x: auto; white-space: pre;
}
.mcp-snippet-copy { position: absolute; top: 8px; right: 8px; }
.mcp-tools { margin-top: 18px; margin-bottom: 12px; }
.mcp-tools-list {
  margin: 6px 0 0 0; padding-left: 18px;
  font-size: 13px; line-height: 1.7;
}
.mcp-tools-list code {
  background: rgba(124, 58, 237, 0.15);
  color: #a78bfa;
  padding: 1px 6px; border-radius: 3px; font-size: 12px;
}
.mcp-footnote { display: flex; align-items: center; margin-top: 16px; margin-bottom: 0; }
.text-success { color: #10b981; }
</style>
```

- [ ] **Step 2: 빌드 + 시각 확인 (dev)**

```bash
npm run dev
```

브라우저에서 `/profile` 접속 → MCP 카드 검증:
- Access Token 평문 영역 사라졌는지
- "새 MCP 토큰 발급" 클릭 → 모달 → 라벨 입력 → 발급 → 평문 토큰 + **완성형 스니펫** 두 영역 표시 → 복사 → 체크박스 → "완료"
- 발급 후 카드 안 토큰 목록에 한 줄 추가
- 회수 버튼 → **ConfirmDialog** (native confirm 아님) → "회수" → 목록 갱신, 상태 "회수됨"
- 카드 스니펫의 `Bearer YOUR_MCP_TOKEN_HERE` placeholder 정상 표시 (꺾쇠 없음)
- 제공 도구 5종 섹션 유지

- [ ] **Step 3: 커밋**

```bash
git add src/components/common/McpConnectCard.vue
git commit -m "refactor(mcp): McpConnectCard — 평문 토큰 노출 제거, 발급/목록 통합, 5tools 유지"
```

---

## Phase C: 검증 및 마무리

### Task C1: end-to-end 동작 확인 (수동)

- [ ] **Step 1: 백엔드 + 프론트 동시 기동**

backend (in `C:\project\harness-server`):
```bash
uvicorn app.api.main:app --reload --port 8000
```

frontend (in worktree):
```bash
npm run dev
```

- [ ] **Step 2: 시나리오 1 — 발급 → Cursor 연결 → 호출 성공**

1. 로그인 → /profile → "새 MCP 토큰 발급" → 라벨 "Test-Cursor" → 발급
2. 평문 토큰 복사 → `~/.cursor/mcp.json` 의 `<YOUR_MCP_TOKEN>` 자리에 붙여넣음
3. Cursor 재시작 → MCP 도구 `list_design_nodes` 호출 → 성공 응답 받음
4. 백엔드 로그에 401 없음 확인

- [ ] **Step 3: 시나리오 2 — 회수 → 즉시 401**

1. /profile 목록에서 방금 발급한 토큰 회수 버튼
2. Cursor 에서 동일 MCP 도구 재호출 → 401 받는지 확인 (Redis 블랙리스트 동작)

- [ ] **Step 4: 시나리오 3 — 옛 access_token 거부**

1. localStorage 의 `harness_token` 을 복사
2. `.mcp.json` 의 토큰 자리에 붙여넣음 → MCP 호출
3. **401 "MCP 전용 토큰이 필요합니다"** 받는지 확인 (회귀 방지)

- [ ] **Step 5: 시나리오 4 — 한도 초과**

1. 동일 사용자로 11번 발급 시도 → 11번째 400 "최대 10개..." 받는지

세 시나리오 모두 통과하면 다음.

---

### Task C2: 전체 회귀 + 커밋 정리

- [ ] **Step 1: 백엔드 전체 테스트**

```bash
cd C:\project\harness-server
pytest tests/ -x
```
Expected: 전체 PASS.

- [ ] **Step 2: 프론트 전체 테스트**

```bash
cd C:\project\harness\.claude\worktrees\distracted-dhawan-d1a839
npx vitest run
```
Expected: 전체 PASS.

- [ ] **Step 3: 프론트 빌드**

```bash
npm run build
```
Expected: 빌드 성공, lint 경고 0.

- [ ] **Step 4: README / 가이드 한 줄 추가 (있다면)**

`README.md` 에 MCP 섹션이 있다면, "사용자는 프로필 페이지에서 MCP 전용 토큰을 발급해 사용한다" 한 줄. 없으면 skip.

- [ ] **Step 5: 마이그레이션 노트 (CHANGELOG)**

`CHANGELOG.md` 또는 비슷한 파일이 있으면:

```markdown
### 2026-05-18 — MCP 전용 토큰 시스템

**Breaking change:** 기존에 로그인 access_token 으로 MCP 를 사용 중이던 사용자는
프로필 페이지에서 새 MCP 토큰을 발급받아 IDE 설정을 갱신해야 합니다.
이는 access_token 이 계정 전체 권한이라 노출 시 결제·삭제까지 가능한 보안 리스크를
근본 차단하기 위한 변경입니다.
```

- [ ] **Step 6: 최종 검토 커밋 (있다면 stragglers)**

```bash
git status
git diff --stat
```

남은 변경 없으면 종료. 있으면:

```bash
git add <files>
git commit -m "docs(mcp): migration note for MCP-only tokens"
```

---

## Self-Review Checklist (writer — 2회 검토 + 패치 반영 완료)

- [x] **Spec coverage**:
  - 노출 차단 → B4 (카드 UI 평문 제거), B2 (모달 1회 표시 + watch reset)
  - 전용 토큰 → A2 (repository) + A4 (JWT type=mcp, scope=mcp:read, exp=90d)
  - 회수 (race-safe) → A3b (peek/mark 분리), A7a (3단계 호출 순서 강제 test)
  - 만료 표시 → A4 (exp_days), B3 (status pill: active/revoked/expired)
  - 한도 → A2 (MAX_ACTIVE_TOKENS_PER_USER=10)
  - last_used 추적 → A3c (best-effort), A5c (asyncio + _background_tasks set)
  - 사용자 안내 → B2 (`.gitignore` 안내), B4 (placeholder/완성형 구분)
  - 라벨 정규화 → A6 (field_validator strip + min_length)
  - 기존 테스트 회귀 → A5a (분석), A5c (4개 마이그레이션)
- [x] **No placeholders** — 모든 cypher / Vue template / pytest body 완전 작성
- [x] **Type consistency** — `McpTokenRow.{jti,label,created_at,last_used_at,expires_at,revoked}` / `McpTokenSummary` (동일 shape) / `McpTokenIssueResponse.{token,jti,label,expires_at}` 일관
- [x] **Bite-sized** — 큰 task 분할: A3 → 3개, A5 → 3개, A7 → 3개 (subagent 1명 = 1 commit)
- [x] **Cross-references 검증**:
  - A5c 의 `create_mcp_token` 사용은 A4 가 먼저 끝나야 동작 ✓ (순서 정합)
  - A7a 의 `peek_revoke_target` / `mark_token_revoked` 는 A3b 에서 정의 ✓
  - A6 의 `McpTokenIssueRequest` 는 A7a 라우트가 import ✓
  - B4 의 `McpTokenIssueDialog` / `McpTokenList` 는 B2/B3 에서 정의 ✓
- [x] **Decision log (Q1-Q4)**:
  - Q1 즉시 차단 (deprecation window 없음) ✓ A5c
  - Q2 모달 안 완성형 스니펫 ✓ B2 Stage 2
  - Q3 exp=90일 ✓ A4 default
  - Q4 task 분할 ✓ A3a/b/c, A5a/b/c, A7a/b/c

## Open Risks (실행 중 살피기)

1. **`get_current_user` import 경로 미확정** — A7a 의 `from app.core.security import get_current_user` 가 맞는지는 [security.py](../../../../../harness-server/app/core/security.py) 상단에서 정의 확인 필요. 실행자가 first task time 에 grep.
2. **lifespan 의 ensure_* 호출 위치** — [main.py:112-172](../../../../../harness-server/app/api/main.py:112) 안에 user_repository.ensure_constraints 같은 기존 호출이 있다면 그 옆이 자연스러움. 없으면 yield 직전.
3. **vitest 의 alias 해석** — `@/utils/axios` mock 이 첫 시도에서 동작 안 하면 `vite.config.js` 의 alias 확인.
4. **frontend test 디렉토리 생성** — `tests/api/` 가 없을 가능성. 첫 task 에서 mkdir.
