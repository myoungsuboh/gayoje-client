# 관리자 — 계정 정지 / 비밀번호 초기화 메일 발송 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 패널에서 사용자 계정을 일시 정지/해제하고, 비밀번호 초기화 메일을 발송하는 기능을 추가한다. 정지된 계정은 모든 인증 경로(login/refresh/get_current_user/OAuth callback)에서 즉시 차단된다.

**Architecture:** `User` 노드에 `is_suspended` + `suspended_at` 타임스탬프를 추가하고, JWT `iat`과 `suspended_at`을 비교해 활성 토큰을 일괄 무효화한다. JTI 매핑 없이 User 노드 한 곳으로 강력 차단. 비번 초기화는 기존 `password_reset_repository.create_token`을 admin 라우트에서 호출.

**Tech Stack:** FastAPI + Neo4j (Python BE), Vue 3 + Vite (FE), pytest + Vitest, bcrypt + PyJWT, Resend email.

**Spec:** [docs/superpowers/specs/2026-05-18-admin-suspend-and-password-reset-design.md](../specs/2026-05-18-admin-suspend-and-password-reset-design.md)

**Working directories:**
- BE: `C:\project\harness-server` (모든 BE 경로는 이 root 기준)
- FE worktree: `C:\project\harness\.claude\worktrees\elastic-northcutt-394606` (현재 작업 폴더, 모든 FE 경로 기준)

**Test 실행 명령:**
- BE 단일: `cd C:\project\harness-server && pytest tests/path/test_x.py::test_name -v`
- BE 전체: `cd C:\project\harness-server && pytest -x`
- FE 단일: `pnpm vitest run tests/path.test.js`

---

## Phase A — BE 데이터 모델 & 감사 액션

### Task 1: 감사 로그 액션 상수 추가

**Files:**
- Modify: `app/service/audit_repository.py`
- Test: 별도 테스트 불필요 (상수)

- [ ] **Step 1: `audit_repository.py` 상수 추가**

`ACTION_INFRA_COST_UPDATE = "infra_cost_update"` 라인 바로 아래 (현재 line 58 부근):

```python
# ─── 관리자 계정 운영 (2026-05-18) ───
# 정지/해제: reversible 일시 정지. 결제 분쟁/abuse 차단 시 발동.
ACTION_USER_SUSPEND = "user_suspend"
ACTION_USER_UNSUSPEND = "user_unsuspend"
# 비밀번호 초기화 메일 발송 — 관리자가 사용자 대신 forgot-password 흐름 트리거.
# 관리자는 비밀번호를 알지 못함 (사용자가 메일 링크로 직접 설정).
ACTION_PASSWORD_RESET_SENT = "password_reset_sent"
```

- [ ] **Step 2: Commit**

```bash
cd C:\project\harness-server
git add app/service/audit_repository.py
git commit -m "feat(audit): suspend/unsuspend/password_reset_sent 액션 상수 추가"
```

---

### Task 2: User 모델에 suspend 필드 추가 + migration

**Files:**
- Modify: `app/service/user_repository.py`
- Test: `tests/service/test_user_repository_suspend_fields.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/service/test_user_repository_suspend_fields.py` 생성:

```python
"""User 노드의 suspend 관련 필드가 UserInDB 에 정상 매핑되는지 검증."""
from __future__ import annotations
import pytest
from app.service import user_repository

pytestmark = pytest.mark.asyncio


async def test_get_user_by_email_includes_suspend_fields(monkeypatch):
    """Cypher 응답에 suspend 필드가 있으면 UserInDB 에 그대로 매핑."""
    fake_row = {
        "user": {
            "id": "u1", "email": "a@x.com", "name": "A",
            "hashed_password": "h", "github_username": "",
            "subscription_type": "free", "is_admin": False,
            "auto_progress": True,
            "is_suspended": True,
            "suspended_at": "2026-05-18T10:00:00Z",
            "suspended_reason": "abuse",
            "suspended_by_email": "admin@x.com",
            "unsuspended_at": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-05-18T10:00:00Z",
        }
    }

    async def fake_run(cypher, params=None, database=None):
        return [fake_row]

    monkeypatch.setattr(
        "app.service.user_repository.neo4j_client.run_cypher", fake_run
    )

    user = await user_repository.get_user_by_email("a@x.com")
    assert user is not None
    assert user.is_suspended is True
    assert user.suspended_at == "2026-05-18T10:00:00Z"
    assert user.suspended_reason == "abuse"
    assert user.suspended_by_email == "admin@x.com"
    assert user.unsuspended_at is None


async def test_get_user_by_email_defaults_suspend_false_when_missing(monkeypatch):
    """legacy 사용자 — suspend 필드가 응답에 없어도 default false."""
    fake_row = {
        "user": {
            "id": "u1", "email": "a@x.com", "name": "A",
            "hashed_password": "h", "github_username": "",
            "subscription_type": "free", "is_admin": False,
            "auto_progress": True,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-05-18T10:00:00Z",
        }
    }

    async def fake_run(cypher, params=None, database=None):
        return [fake_row]

    monkeypatch.setattr(
        "app.service.user_repository.neo4j_client.run_cypher", fake_run
    )

    user = await user_repository.get_user_by_email("a@x.com")
    assert user.is_suspended is False
    assert user.suspended_at is None
    assert user.suspended_reason is None
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd C:\project\harness-server
pytest tests/service/test_user_repository_suspend_fields.py -v
```
Expected: FAIL — `UserInDB has no attribute 'is_suspended'`

- [ ] **Step 3: `UserInDB` 모델 확장**

`app/service/user_repository.py` 의 `class UserInDB(BaseModel)` 에 필드 추가 (auto_progress 다음 줄에):

```python
    # [2026-05-18] 관리자 계정 정지 — reversible. is_suspended=True 면 모든 인증 경로 차단.
    is_suspended: bool = False
    # JWT iat 비교 기준 — 정지 시점 이전 발급 토큰을 일괄 무효화하는 핵심 timestamp.
    suspended_at: Optional[str] = None
    suspended_reason: Optional[str] = None
    suspended_by_email: Optional[str] = None
    unsuspended_at: Optional[str] = None
```

- [ ] **Step 4: `_GET_USER_BY_EMAIL_CYPHER` 에 suspend 필드 RETURN 추가**

`_GET_USER_BY_EMAIL_CYPHER` 의 RETURN dict 안에 (auto_progress 다음에) 추가:

```cypher
    is_suspended: COALESCE(u.is_suspended, false),
    suspended_at: toString(u.suspended_at),
    suspended_reason: COALESCE(u.suspended_reason, ''),
    suspended_by_email: COALESCE(u.suspended_by_email, ''),
    unsuspended_at: toString(u.unsuspended_at),
```

- [ ] **Step 5: `get_user_by_email` 매핑 추가**

`get_user_by_email` 함수의 `return UserInDB(...)` 부분에 추가:

```python
        is_suspended=bool(user.get("is_suspended", False)),
        suspended_at=user.get("suspended_at") or None,
        suspended_reason=user.get("suspended_reason") or None,
        suspended_by_email=user.get("suspended_by_email") or None,
        unsuspended_at=user.get("unsuspended_at") or None,
```

(Cypher 의 `COALESCE(... , '')` 가 빈 문자열을 반환하므로 `or None` 으로 정규화.)

- [ ] **Step 6: `_MIGRATE_USER_DEFAULTS_CYPHER` 에 is_suspended default 추가**

`_MIGRATE_USER_DEFAULTS_CYPHER` 의 WHERE 절과 SET 절을 다음과 같이 수정:

```cypher
_MIGRATE_USER_DEFAULTS_CYPHER = """\
// 기존 User 에 subscription_type / is_admin / is_suspended default 채우기. Idempotent.
MATCH (u:User)
WHERE u.subscription_type IS NULL OR u.is_admin IS NULL OR u.is_suspended IS NULL
SET u.subscription_type = COALESCE(u.subscription_type, 'free'),
    u.subscription_updated_at = COALESCE(u.subscription_updated_at, datetime()),
    u.is_admin = COALESCE(u.is_admin, false),
    u.is_suspended = COALESCE(u.is_suspended, false)
RETURN count(u) AS migrated
"""
```

- [ ] **Step 7: 테스트 실행 — 통과 확인**

```bash
pytest tests/service/test_user_repository_suspend_fields.py -v
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/service/user_repository.py tests/service/test_user_repository_suspend_fields.py
git commit -m "feat(user): UserInDB 에 suspend 필드 + migration 추가"
```

---

## Phase B — BE admin repository (정지/해제 로직)

### Task 3: AdminUserRow 모델 확장 + 목록/상세 Cypher 업데이트

**Files:**
- Modify: `app/service/admin_repository.py`
- Test: `tests/service/test_admin_repository_suspend_row.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/service/test_admin_repository_suspend_row.py` 생성:

```python
"""AdminUserRow 가 suspend 필드 + has_password 까지 노출하는지 검증."""
from __future__ import annotations
from typing import Any, Dict, List, Optional
import pytest

from app.service import admin_repository

pytestmark = pytest.mark.asyncio


class _FakeRunCypher:
    def __init__(self, responses): self._r = list(responses); self.calls = []
    async def __call__(self, cypher, params=None, database=None):
        self.calls.append({"cypher": cypher, "params": params or {}})
        return self._r.pop(0) if self._r else []


async def test_list_users_returns_suspend_and_has_password(monkeypatch):
    fake = _FakeRunCypher([
        [{"user": {
            "id": "1", "email": "a@x.com", "name": "A",
            "github_username": "", "subscription_type": "free",
            "subscription_updated_at": None,
            "is_admin": False,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "is_suspended": True,
            "suspended_at": "2026-05-18T10:00:00Z",
            "suspended_reason": "abuse",
            "suspended_by_email": "admin@x.com",
            "unsuspended_at": None,
            "has_password": True,
        }}],
        [{"total": 1}],
    ])
    monkeypatch.setattr(
        "app.service.admin_repository.neo4j_client.run_cypher", fake
    )
    out = await admin_repository.list_users()
    u = out["users"][0]
    assert u.is_suspended is True
    assert u.suspended_reason == "abuse"
    assert u.suspended_by_email == "admin@x.com"
    assert u.has_password is True


async def test_list_users_defaults_when_missing(monkeypatch):
    fake = _FakeRunCypher([
        [{"user": {
            "id": "1", "email": "a@x.com", "name": "A",
            "github_username": "", "subscription_type": "free",
            "is_admin": False, "has_password": False,
        }}],
        [{"total": 1}],
    ])
    monkeypatch.setattr(
        "app.service.admin_repository.neo4j_client.run_cypher", fake
    )
    out = await admin_repository.list_users()
    u = out["users"][0]
    assert u.is_suspended is False
    assert u.suspended_at is None
    assert u.has_password is False
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/service/test_admin_repository_suspend_row.py -v
```
Expected: FAIL — `AdminUserRow has no field 'is_suspended'` or `'has_password'`.

- [ ] **Step 3: `AdminUserRow` 필드 추가**

`app/service/admin_repository.py` `class AdminUserRow(BaseModel)` 에 (updated_at 다음 줄에) 추가:

```python
    # [2026-05-18] 정지 상태
    is_suspended: bool = False
    suspended_at: Optional[str] = None
    suspended_reason: Optional[str] = None
    suspended_by_email: Optional[str] = None
    unsuspended_at: Optional[str] = None
    # 비밀번호 가입자 vs OAuth-only — FE 가 "비번 초기화" 버튼 활성화 여부 판단.
    has_password: bool = False
```

- [ ] **Step 4: `_LIST_USERS_CYPHER` RETURN dict 에 필드 추가**

기존 RETURN dict 안에 (updated_at 다음 줄에) 추가:

```cypher
    is_suspended: COALESCE(u.is_suspended, false),
    suspended_at: toString(u.suspended_at),
    suspended_reason: COALESCE(u.suspended_reason, ''),
    suspended_by_email: COALESCE(u.suspended_by_email, ''),
    unsuspended_at: toString(u.unsuspended_at),
    has_password: COALESCE(u.hashed_password, '') <> ''
```

- [ ] **Step 5: `_GET_USER_DETAIL_CYPHER` 의 user dict 에도 동일 필드 추가**

`_GET_USER_DETAIL_CYPHER` 의 `RETURN { user: {...} }` 안 user dict 에 위 5+1 필드 추가.

- [ ] **Step 6: `_CHANGE_SUBSCRIPTION_CYPHER` 와 `_SET_ADMIN_CYPHER` 의 user dict 에도 동일 필드 추가**

두 Cypher 모두 user 응답 dict 안에 추가 (구독 변경/admin 토글 응답이 행 데이터를 갱신하므로 일관성).

- [ ] **Step 7: `_row_to_admin_user` 헬퍼 업데이트**

```python
def _row_to_admin_user(row: Dict[str, Any]) -> Optional[AdminUserRow]:
    if not row or not row.get("email"):
        return None
    return AdminUserRow(
        id=row.get("id", ""),
        email=row["email"],
        name=row.get("name", ""),
        github_username=row.get("github_username") or None,
        subscription_type=row.get("subscription_type") or SUBSCRIPTION_FREE,
        subscription_updated_at=row.get("subscription_updated_at"),
        is_admin=bool(row.get("is_admin")),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
        is_suspended=bool(row.get("is_suspended", False)),
        suspended_at=row.get("suspended_at") or None,
        suspended_reason=row.get("suspended_reason") or None,
        suspended_by_email=row.get("suspended_by_email") or None,
        unsuspended_at=row.get("unsuspended_at") or None,
        has_password=bool(row.get("has_password", False)),
    )
```

- [ ] **Step 8: 테스트 실행 — 통과 확인**

```bash
pytest tests/service/test_admin_repository_suspend_row.py -v
```
Expected: PASS

- [ ] **Step 9: 기존 admin_repository 테스트도 회귀 확인**

```bash
pytest tests/service/test_admin_repository.py -v
```
Expected: ALL PASS (기존 테스트들이 새 default 필드와 호환되어야 함).

- [ ] **Step 10: Commit**

```bash
git add app/service/admin_repository.py tests/service/test_admin_repository_suspend_row.py
git commit -m "feat(admin): AdminUserRow 에 suspend + has_password 필드 추가"
```

---

### Task 4: suspend / unsuspend Cypher + repository 함수

**Files:**
- Modify: `app/service/admin_repository.py`
- Test: `tests/service/test_admin_repository_suspend.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/service/test_admin_repository_suspend.py` 생성:

```python
"""admin_repository.suspend_user / unsuspend_user — atomic last-admin 보호 검증."""
from __future__ import annotations
from typing import Any, Dict, List, Optional
import pytest

from app.service import admin_repository

pytestmark = pytest.mark.asyncio


class _FakeRunCypher:
    def __init__(self, responses): self._r = list(responses); self.calls = []
    async def __call__(self, cypher, params=None, database=None):
        self.calls.append({"cypher": cypher, "params": params or {}})
        return self._r.pop(0) if self._r else []


def _ok_user_row(email: str, **kw) -> Dict[str, Any]:
    base = {
        "id": "1", "email": email, "name": "X",
        "github_username": "", "subscription_type": "free",
        "is_admin": False, "has_password": True,
        "is_suspended": True,
        "suspended_at": "2026-05-18T10:00:00Z",
        "suspended_reason": "abuse",
        "suspended_by_email": "admin@x.com",
    }
    base.update(kw)
    return base


async def test_suspend_user_ok(monkeypatch):
    fake = _FakeRunCypher([
        [{"result": {"status": "ok", "user": _ok_user_row("u@x.com")}}],
    ])
    monkeypatch.setattr(
        "app.service.admin_repository.neo4j_client.run_cypher", fake
    )
    out = await admin_repository.suspend_user(
        target_email="u@x.com", reason="abuse", by_admin_email="admin@x.com"
    )
    assert out["status"] == "ok"
    assert out["user"].is_suspended is True
    assert out["user"].suspended_reason == "abuse"
    # cypher 에 정상 파라미터 전달 확인
    p = fake.calls[0]["params"]
    assert p["email"] == "u@x.com"
    assert p["reason"] == "abuse"
    assert p["by"] == "admin@x.com"


async def test_suspend_user_last_admin_blocked(monkeypatch):
    fake = _FakeRunCypher([
        [{"result": {"status": "last_admin", "message": "마지막 관리자입니다."}}],
    ])
    monkeypatch.setattr(
        "app.service.admin_repository.neo4j_client.run_cypher", fake
    )
    out = await admin_repository.suspend_user(
        target_email="onlyadmin@x.com", reason="", by_admin_email="other@x.com"
    )
    assert out["status"] == "last_admin"
    assert "마지막 관리자" in out["message"]


async def test_suspend_user_not_found(monkeypatch):
    fake = _FakeRunCypher([[]])
    monkeypatch.setattr(
        "app.service.admin_repository.neo4j_client.run_cypher", fake
    )
    out = await admin_repository.suspend_user(
        target_email="ghost@x.com", reason="", by_admin_email="admin@x.com"
    )
    assert out["status"] == "not_found"


async def test_unsuspend_user_ok(monkeypatch):
    fake = _FakeRunCypher([
        [{"result": {"status": "ok", "user": _ok_user_row(
            "u@x.com", is_suspended=False,
            unsuspended_at="2026-05-18T11:00:00Z",
        )}}],
    ])
    monkeypatch.setattr(
        "app.service.admin_repository.neo4j_client.run_cypher", fake
    )
    out = await admin_repository.unsuspend_user(target_email="u@x.com")
    assert out["status"] == "ok"
    assert out["user"].is_suspended is False


async def test_unsuspend_user_not_found(monkeypatch):
    fake = _FakeRunCypher([[]])
    monkeypatch.setattr(
        "app.service.admin_repository.neo4j_client.run_cypher", fake
    )
    out = await admin_repository.unsuspend_user(target_email="ghost@x.com")
    assert out["status"] == "not_found"
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/service/test_admin_repository_suspend.py -v
```
Expected: FAIL — `module 'admin_repository' has no attribute 'suspend_user'`.

- [ ] **Step 3: Cypher 상수 추가**

`app/service/admin_repository.py` 의 `_SET_ADMIN_CYPHER` 다음에 추가:

```python
_SUSPEND_USER_CYPHER = """\
// 계정 정지 — atomic last-admin 보호.
// 대상이 active admin 이고, 현재 active admin 수 <= 1 이면 거부.
// active admin = is_admin=true AND is_suspended=false.
MATCH (u:User {email: $email})
OPTIONAL MATCH (a:User)
  WHERE a.is_admin = true AND COALESCE(a.is_suspended, false) = false
WITH u, count(a) AS active_admin_count
WITH u, active_admin_count,
     (COALESCE(u.is_admin, false)
      AND COALESCE(u.is_suspended, false) = false
      AND active_admin_count <= 1) AS would_orphan
CALL {
    WITH u, would_orphan
    WITH u WHERE NOT would_orphan
    SET u.is_suspended = true,
        u.suspended_at = datetime(),
        u.suspended_reason = $reason,
        u.suspended_by_email = $by,
        u.updated_at = datetime()
    RETURN u AS updated
}
RETURN CASE
    WHEN would_orphan THEN {
        status: 'last_admin',
        message: '마지막 관리자입니다. 다른 관리자를 먼저 지정한 뒤 정지하세요.'
    }
    ELSE {
        status: 'ok',
        user: {
            id: u.id, email: u.email, name: u.name,
            github_username: COALESCE(u.github_username, ''),
            subscription_type: COALESCE(u.subscription_type, 'free'),
            subscription_updated_at: toString(u.subscription_updated_at),
            is_admin: COALESCE(u.is_admin, false),
            created_at: toString(u.created_at),
            updated_at: toString(u.updated_at),
            is_suspended: u.is_suspended,
            suspended_at: toString(u.suspended_at),
            suspended_reason: COALESCE(u.suspended_reason, ''),
            suspended_by_email: COALESCE(u.suspended_by_email, ''),
            unsuspended_at: toString(u.unsuspended_at),
            has_password: COALESCE(u.hashed_password, '') <> ''
        }
    }
END AS result
"""


_UNSUSPEND_USER_CYPHER = """\
// 정지 해제 — last-admin 보호 불필요 (해제는 admin 수를 줄이지 않음).
// suspended_reason/by 는 보존 (이력 참고). unsuspended_at 갱신.
MATCH (u:User {email: $email})
SET u.is_suspended = false,
    u.unsuspended_at = datetime(),
    u.updated_at = datetime()
RETURN {
    status: 'ok',
    user: {
        id: u.id, email: u.email, name: u.name,
        github_username: COALESCE(u.github_username, ''),
        subscription_type: COALESCE(u.subscription_type, 'free'),
        subscription_updated_at: toString(u.subscription_updated_at),
        is_admin: COALESCE(u.is_admin, false),
        created_at: toString(u.created_at),
        updated_at: toString(u.updated_at),
        is_suspended: false,
        suspended_at: toString(u.suspended_at),
        suspended_reason: COALESCE(u.suspended_reason, ''),
        suspended_by_email: COALESCE(u.suspended_by_email, ''),
        unsuspended_at: toString(u.unsuspended_at),
        has_password: COALESCE(u.hashed_password, '') <> ''
    }
} AS result
"""
```

- [ ] **Step 4: `suspend_user` / `unsuspend_user` 함수 추가**

파일 끝에 추가:

```python
async def suspend_user(
    *, target_email: str, reason: Optional[str], by_admin_email: str,
) -> Dict[str, Any]:
    """
    사용자 정지. atomic last-admin 보호.

    Returns:
      { status: 'ok' | 'last_admin' | 'not_found',
        user?: AdminUserRow, message?: str }
    """
    rows = await neo4j_client.run_cypher(
        _SUSPEND_USER_CYPHER,
        {"email": target_email, "reason": (reason or ""), "by": by_admin_email},
    )
    if not rows:
        return {"status": "not_found"}
    result = (rows[0] or {}).get("result") or {}
    s = result.get("status")
    if s == "last_admin":
        return {"status": "last_admin", "message": result.get("message")}
    if s == "ok":
        user = _row_to_admin_user(result.get("user") or {})
        if not user:
            return {"status": "not_found"}
        return {"status": "ok", "user": user}
    return {"status": "not_found"}


async def unsuspend_user(*, target_email: str) -> Dict[str, Any]:
    """
    사용자 정지 해제. suspended_reason / suspended_by_email 은 보존 (이력 참고).

    Returns:
      { status: 'ok' | 'not_found', user?: AdminUserRow }
    """
    rows = await neo4j_client.run_cypher(
        _UNSUSPEND_USER_CYPHER, {"email": target_email}
    )
    if not rows:
        return {"status": "not_found"}
    result = (rows[0] or {}).get("result") or {}
    user = _row_to_admin_user(result.get("user") or {})
    if not user:
        return {"status": "not_found"}
    return {"status": "ok", "user": user}
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
pytest tests/service/test_admin_repository_suspend.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/service/admin_repository.py tests/service/test_admin_repository_suspend.py
git commit -m "feat(admin): suspend_user / unsuspend_user cypher + 함수 추가"
```

---

## ⏸ Checkpoint A — 데이터 계층 점검

여기까지 진행한 변경: User/AdminUserRow 모델 + cypher + repository 함수. **인증 강제는 아직 없음** — 즉, DB 에 `is_suspended=true` 박혀도 사용자는 차단 안 됨.

**더블 체크**:
```bash
cd C:\project\harness-server
pytest tests/service/test_admin_repository_suspend.py tests/service/test_admin_repository_suspend_row.py tests/service/test_user_repository_suspend_fields.py tests/service/test_admin_repository.py -v
```
모두 PASS 인지 확인 후 다음 phase 로.

---

## Phase C — BE admin routes

### Task 5: PATCH /api/admin/users/{email}/suspend 라우트

**Files:**
- Modify: `app/api/admin_routes.py`
- Test: `tests/api/test_admin_suspend_route.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/api/test_admin_suspend_route.py` 생성:

```python
"""PATCH /api/admin/users/{email}/suspend — 정상/본인/last-admin/없음 케이스."""
from __future__ import annotations
from types import SimpleNamespace
from typing import Any, Dict, List
import pytest
from fastapi import HTTPException

from app.api import admin_routes
from app.service.admin_repository import AdminUserRow
from app.service.user_repository import UserPublic

pytestmark = pytest.mark.asyncio


def _admin(email: str = "admin@x.com") -> UserPublic:
    return UserPublic(id="a-1", email=email, name="Admin",
                      subscription_type="free", is_admin=True)


def _fake_request() -> SimpleNamespace:
    return SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"),
        scope={"type": "http"}, headers={}, state=SimpleNamespace(),
        url=SimpleNamespace(path="/api/admin/users/x/suspend"),
        method="PATCH",
    )


@pytest.fixture
def audit_recorder(monkeypatch):
    calls: List[Dict[str, Any]] = []
    async def fake_write(**kw): calls.append(kw); return "id"
    monkeypatch.setattr(
        "app.api.admin_routes.audit_repository.write", fake_write
    )
    return calls


@pytest.fixture
def suspend_recorder(monkeypatch):
    calls: List[Dict[str, Any]] = []
    state = {"return": {"status": "ok"}}

    def _user(email="u@x.com"):
        return AdminUserRow(
            id="1", email=email, name="U", subscription_type="free",
            is_admin=False, is_suspended=True,
            suspended_at="2026-05-18T10:00:00Z",
            suspended_reason="abuse", suspended_by_email="admin@x.com",
            has_password=True,
        )

    async def fake_suspend(**kw):
        calls.append(kw)
        ret = state["return"]
        if ret.get("status") == "ok" and "user" not in ret:
            ret = {**ret, "user": _user(kw["target_email"])}
        return ret
    monkeypatch.setattr(
        "app.api.admin_routes.admin_repository.suspend_user", fake_suspend
    )
    return calls, state


async def test_suspend_success_calls_repo_and_audit(suspend_recorder, audit_recorder):
    calls, _ = suspend_recorder
    out = await admin_routes.suspend_user_route.__wrapped__(
        request=_fake_request(), email="u@x.com",
        payload=admin_routes.SuspendUserRequest(reason="abuse"),
        admin=_admin(),
    )
    assert out["user"]["email"] == "u@x.com"
    assert out["user"]["is_suspended"] is True
    assert calls[0] == {"target_email": "u@x.com", "reason": "abuse",
                        "by_admin_email": "admin@x.com"}
    assert audit_recorder[0]["action"] == "user_suspend"
    assert audit_recorder[0]["target_email"] == "u@x.com"
    assert audit_recorder[0]["payload"] == {"reason": "abuse"}


async def test_suspend_self_blocked(suspend_recorder, audit_recorder):
    with pytest.raises(HTTPException) as exc:
        await admin_routes.suspend_user_route.__wrapped__(
            request=_fake_request(), email="admin@x.com",
            payload=admin_routes.SuspendUserRequest(reason="oops"),
            admin=_admin("admin@x.com"),
        )
    assert exc.value.status_code == 400
    assert "자기 자신" in exc.value.detail
    assert audit_recorder == []


async def test_suspend_last_admin_blocked(suspend_recorder, audit_recorder):
    _, state = suspend_recorder
    state["return"] = {"status": "last_admin", "message": "마지막 관리자입니다."}
    with pytest.raises(HTTPException) as exc:
        await admin_routes.suspend_user_route.__wrapped__(
            request=_fake_request(), email="last@x.com",
            payload=admin_routes.SuspendUserRequest(reason=""),
            admin=_admin(),
        )
    assert exc.value.status_code == 400
    assert "마지막 관리자" in exc.value.detail
    assert audit_recorder == []


async def test_suspend_not_found(suspend_recorder, audit_recorder):
    _, state = suspend_recorder
    state["return"] = {"status": "not_found"}
    with pytest.raises(HTTPException) as exc:
        await admin_routes.suspend_user_route.__wrapped__(
            request=_fake_request(), email="ghost@x.com",
            payload=admin_routes.SuspendUserRequest(reason=""),
            admin=_admin(),
        )
    assert exc.value.status_code == 404
    assert audit_recorder == []
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/api/test_admin_suspend_route.py -v
```
Expected: FAIL — `suspend_user_route` 미존재.

- [ ] **Step 3: 라우트 + DTO 추가**

`app/api/admin_routes.py` 상단 imports 아래 `SUBSCRIPTION_TYPES` import 옆에 추가:

```python
from app.service.audit_repository import (
    ACTION_ADMIN_GRANT,
    ACTION_ADMIN_REVOKE,
    ACTION_SUBSCRIPTION_CHANGE,
    ACTION_USAGE_RESET,
    ACTION_USER_SUSPEND,
    ACTION_USER_UNSUSPEND,
    ACTION_PASSWORD_RESET_SENT,
)
```

DTO 추가 (`SetAdminRequest` 다음):

```python
class SuspendUserRequest(BaseModel):
    reason: Optional[str] = Field(
        default=None, max_length=500,
        description="정지 사유. 비어 있으면 사용자에게 메시지 노출 안 함.",
    )
```

`reset_user_usage_route` 다음에 라우트 추가:

```python
@router.patch("/users/{email}/suspend")
@limiter.limit("10/minute")
async def suspend_user_route(
    request: Request,
    email: str,
    payload: SuspendUserRequest,
    admin: UserPublic = Depends(get_admin_user),
) -> Dict[str, Any]:
    """
    사용자 계정 정지. 본인 정지 + last-admin 정지는 차단.

    동작:
    - is_suspended=true, suspended_at=datetime() SET
    - 모든 활성 토큰(access/refresh) 즉시 무효화 (iat < suspended_at)
    - 다음 로그인 시 명시 메시지 표시
    """
    if email.lower() == admin.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="자기 자신의 계정은 정지할 수 없습니다.",
        )

    reason = (payload.reason or "").strip()
    result = await admin_repository.suspend_user(
        target_email=email, reason=reason, by_admin_email=admin.email,
    )
    s = result.get("status")
    if s == "last_admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("message") or "마지막 관리자입니다.",
        )
    if s != "ok":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )

    await audit_repository.write(
        actor_email=admin.email,
        action=ACTION_USER_SUSPEND,
        target_email=email,
        payload={"reason": reason or None},
    )
    logger.info("admin: %s suspended %s (reason=%r)", admin.email, email, reason)
    return {"user": result["user"].model_dump()}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pytest tests/api/test_admin_suspend_route.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin_routes.py tests/api/test_admin_suspend_route.py
git commit -m "feat(admin): PATCH /api/admin/users/{email}/suspend 라우트"
```

---

### Task 6: PATCH /api/admin/users/{email}/unsuspend 라우트

**Files:**
- Modify: `app/api/admin_routes.py`
- Test: `tests/api/test_admin_unsuspend_route.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/api/test_admin_unsuspend_route.py` 생성:

```python
"""PATCH /api/admin/users/{email}/unsuspend — 정상/없음."""
from __future__ import annotations
from types import SimpleNamespace
from typing import Any, Dict, List
import pytest
from fastapi import HTTPException

from app.api import admin_routes
from app.service.admin_repository import AdminUserRow
from app.service.user_repository import UserPublic

pytestmark = pytest.mark.asyncio


def _admin() -> UserPublic:
    return UserPublic(id="a-1", email="admin@x.com", name="A",
                      subscription_type="free", is_admin=True)


def _req():
    return SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"), scope={"type": "http"},
        headers={}, state=SimpleNamespace(),
        url=SimpleNamespace(path="/api/admin/users/x/unsuspend"),
        method="PATCH",
    )


@pytest.fixture
def audit_recorder(monkeypatch):
    calls: List[Dict[str, Any]] = []
    async def fake_write(**kw): calls.append(kw); return "id"
    monkeypatch.setattr(
        "app.api.admin_routes.audit_repository.write", fake_write
    )
    return calls


@pytest.fixture
def unsuspend_recorder(monkeypatch):
    state = {"return": {"status": "ok"}}

    def _user(email):
        return AdminUserRow(
            id="1", email=email, name="U", subscription_type="free",
            is_admin=False, is_suspended=False,
            suspended_at="2026-05-18T10:00:00Z",
            suspended_reason="abuse",
            suspended_by_email="admin@x.com",
            unsuspended_at="2026-05-18T11:00:00Z",
            has_password=True,
        )

    async def fake_unsuspend(**kw):
        ret = state["return"]
        if ret.get("status") == "ok" and "user" not in ret:
            ret = {**ret, "user": _user(kw["target_email"])}
        return ret
    monkeypatch.setattr(
        "app.api.admin_routes.admin_repository.unsuspend_user", fake_unsuspend
    )
    return state


async def test_unsuspend_success(unsuspend_recorder, audit_recorder):
    out = await admin_routes.unsuspend_user_route.__wrapped__(
        request=_req(), email="u@x.com", admin=_admin(),
    )
    assert out["user"]["email"] == "u@x.com"
    assert out["user"]["is_suspended"] is False
    assert out["user"]["unsuspended_at"] == "2026-05-18T11:00:00Z"
    assert audit_recorder[0]["action"] == "user_unsuspend"
    assert audit_recorder[0]["target_email"] == "u@x.com"
    assert audit_recorder[0]["payload"] == {}


async def test_unsuspend_not_found(unsuspend_recorder, audit_recorder):
    unsuspend_recorder["return"] = {"status": "not_found"}
    with pytest.raises(HTTPException) as exc:
        await admin_routes.unsuspend_user_route.__wrapped__(
            request=_req(), email="ghost@x.com", admin=_admin(),
        )
    assert exc.value.status_code == 404
    assert audit_recorder == []
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/api/test_admin_unsuspend_route.py -v
```
Expected: FAIL — `unsuspend_user_route` 미존재.

- [ ] **Step 3: 라우트 추가**

`suspend_user_route` 다음에 추가:

```python
@router.patch("/users/{email}/unsuspend")
@limiter.limit("10/minute")
async def unsuspend_user_route(
    request: Request,
    email: str,
    admin: UserPublic = Depends(get_admin_user),
) -> Dict[str, Any]:
    """사용자 정지 해제. suspended_reason / suspended_by_email 은 보존 (이력 참고용)."""
    result = await admin_repository.unsuspend_user(target_email=email)
    if result.get("status") != "ok":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )
    await audit_repository.write(
        actor_email=admin.email,
        action=ACTION_USER_UNSUSPEND,
        target_email=email,
        payload={},
    )
    logger.info("admin: %s unsuspended %s", admin.email, email)
    return {"user": result["user"].model_dump()}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pytest tests/api/test_admin_unsuspend_route.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin_routes.py tests/api/test_admin_unsuspend_route.py
git commit -m "feat(admin): PATCH /api/admin/users/{email}/unsuspend 라우트"
```

---

### Task 7: POST /api/admin/users/{email}/send-password-reset 라우트

**Files:**
- Modify: `app/api/admin_routes.py`
- Test: `tests/api/test_admin_send_password_reset_route.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/api/test_admin_send_password_reset_route.py` 생성:

```python
"""POST /api/admin/users/{email}/send-password-reset — 정상/OAuth-only/없음."""
from __future__ import annotations
from types import SimpleNamespace
from typing import Any, Dict, List
import pytest
from fastapi import HTTPException

from app.api import admin_routes
from app.service.user_repository import UserInDB, UserPublic

pytestmark = pytest.mark.asyncio


def _admin() -> UserPublic:
    return UserPublic(id="a-1", email="admin@x.com", name="A",
                      subscription_type="free", is_admin=True)


def _req():
    return SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"), scope={"type": "http"},
        headers={}, state=SimpleNamespace(),
        url=SimpleNamespace(path="/api/admin/users/x/send-password-reset"),
        method="POST",
    )


def _user_with_password(email="u@x.com") -> UserInDB:
    return UserInDB(
        id="1", email=email, name="U", hashed_password="bcrypt$xxx",
        subscription_type="free", is_admin=False,
    )


def _oauth_only_user(email="oa@x.com") -> UserInDB:
    return UserInDB(
        id="2", email=email, name="OAUTH", hashed_password="",
        subscription_type="free", is_admin=False,
    )


@pytest.fixture
def audit_recorder(monkeypatch):
    calls: List[Dict[str, Any]] = []
    async def fake_write(**kw): calls.append(kw); return "id"
    monkeypatch.setattr(
        "app.api.admin_routes.audit_repository.write", fake_write
    )
    return calls


@pytest.fixture
def email_recorder(monkeypatch):
    """email_lib.send_email + create_token + render_password_reset_email 스텁."""
    state: Dict[str, Any] = {
        "user": _user_with_password(),
        "token": "tkn-abc",
        "email_enabled": True,
        "send_calls": [],
        "create_calls": [],
    }

    async def fake_get(email):
        u = state["user"]
        return u if u and u.email == email else None
    monkeypatch.setattr(
        "app.api.admin_routes.user_repository.get_user_by_email", fake_get
    )

    async def fake_create(email):
        state["create_calls"].append(email)
        return state["token"]
    monkeypatch.setattr(
        "app.api.admin_routes.password_reset_repository.create_token", fake_create
    )

    # render_password_reset_email 은 동기. 단순 반환.
    def fake_render(recipient_name, reset_link, expire_minutes):
        return ("subject", "<html/>", "text")
    monkeypatch.setattr(
        "app.api.admin_routes.email_lib.render_password_reset_email",
        fake_render,
    )

    async def fake_send(to, subject, html, text):
        state["send_calls"].append({"to": to, "subject": subject})
    monkeypatch.setattr(
        "app.api.admin_routes.email_lib.send_email", fake_send
    )

    # settings 의 email_enabled / password_reset_url 모킹은 단순 속성 변조
    class _S:
        email_enabled = True
        password_reset_url = "https://app/reset"
    monkeypatch.setattr("app.api.admin_routes.settings", _S, raising=False)

    return state


async def test_send_password_reset_success(email_recorder, audit_recorder):
    out = await admin_routes.send_password_reset_route.__wrapped__(
        request=_req(), email="u@x.com", admin=_admin(),
    )
    assert out["success"] is True
    assert out.get("warning") is None
    assert email_recorder["create_calls"] == ["u@x.com"]
    assert email_recorder["send_calls"][0]["to"] == "u@x.com"
    assert audit_recorder[0]["action"] == "password_reset_sent"
    assert audit_recorder[0]["target_email"] == "u@x.com"


async def test_send_password_reset_oauth_only_blocked(email_recorder, audit_recorder):
    email_recorder["user"] = _oauth_only_user()
    with pytest.raises(HTTPException) as exc:
        await admin_routes.send_password_reset_route.__wrapped__(
            request=_req(), email="oa@x.com", admin=_admin(),
        )
    assert exc.value.status_code == 400
    assert "OAuth" in exc.value.detail
    assert email_recorder["create_calls"] == []
    assert audit_recorder == []


async def test_send_password_reset_not_found(email_recorder, audit_recorder):
    email_recorder["user"] = None
    with pytest.raises(HTTPException) as exc:
        await admin_routes.send_password_reset_route.__wrapped__(
            request=_req(), email="ghost@x.com", admin=_admin(),
        )
    assert exc.value.status_code == 404


async def test_send_password_reset_email_disabled_returns_warning(
    email_recorder, audit_recorder, monkeypatch,
):
    class _S:
        email_enabled = False
        password_reset_url = "https://app/reset"
    monkeypatch.setattr("app.api.admin_routes.settings", _S, raising=False)
    out = await admin_routes.send_password_reset_route.__wrapped__(
        request=_req(), email="u@x.com", admin=_admin(),
    )
    assert out["success"] is True
    assert out["warning"] == "email_disabled"
    # 토큰은 생성됐어도 메일 발송은 시도 안 함
    assert email_recorder["create_calls"] == ["u@x.com"]
    assert email_recorder["send_calls"] == []
    # audit 은 기록 (관리자 액션 추적)
    assert audit_recorder[0]["action"] == "password_reset_sent"
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/api/test_admin_send_password_reset_route.py -v
```
Expected: FAIL — `send_password_reset_route` 미존재.

- [ ] **Step 3: imports 추가**

`app/api/admin_routes.py` 상단에:

```python
from app.core.config import settings
from app.service import (
    admin_repository,
    audit_repository,
    email_lib,
    password_reset_repository,
    usage_repository,
    user_repository,
)
```

(`from app.service import admin_repository, audit_repository, usage_repository` 라인을 위와 같이 확장. `email_lib` 가 `app.service` 아래에 없다면 실제 경로 확인. 기존 `auth_routes.py` 가 `from app.service import email_lib` 또는 `from app.lib import email as email_lib` 중 어느 패턴인지 확인 후 매칭.)

확인 명령:
```bash
grep -n "email_lib\|email_repository" app/api/auth_routes.py | head -3
```
거기서 쓰는 import 경로를 그대로 복사.

- [ ] **Step 4: 라우트 추가**

```python
@router.post("/users/{email}/send-password-reset")
@limiter.limit("10/minute")
async def send_password_reset_route(
    request: Request,
    email: str,
    admin: UserPublic = Depends(get_admin_user),
) -> Dict[str, Any]:
    """
    사용자에게 비밀번호 재설정 메일 발송.

    - OAuth-only 사용자(`hashed_password == ''`)는 400 (소셜 로그인으로 재접속 안내).
    - 미가입 사용자는 404 (admin 라우트이므로 enumeration 방어 불필요).
    - `email_enabled=False` 면 토큰만 생성, 응답에 warning='email_disabled' 포함.
    """
    user_db = await user_repository.get_user_by_email(email)
    if user_db is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )
    if not user_db.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth 가입자는 비밀번호 초기화 대상이 아닙니다. 소셜 로그인으로 재접속하세요.",
        )

    token = await password_reset_repository.create_token(email)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="비밀번호 재설정 토큰 생성에 실패했습니다.",
        )

    warning: Optional[str] = None
    if settings.email_enabled:
        reset_link = f"{settings.password_reset_url}?token={token}"
        subject, html, text = email_lib.render_password_reset_email(
            recipient_name=user_db.name or email.split("@")[0],
            reset_link=reset_link,
            expire_minutes=password_reset_repository.TOKEN_EXPIRE_MINUTES,
        )
        try:
            await email_lib.send_email(to=email, subject=subject, html=html, text=text)
        except Exception as e:  # noqa: BLE001
            logger.warning("admin send-password-reset: 발송 실패 (email=%s): %s", email, e)
            warning = "email_send_failed"
    else:
        warning = "email_disabled"
        logger.warning(
            "admin send-password-reset: email_enabled=False (email=%s) — 토큰만 생성", email,
        )

    await audit_repository.write(
        actor_email=admin.email,
        action=ACTION_PASSWORD_RESET_SENT,
        target_email=email,
        payload={"warning": warning} if warning else {},
    )
    logger.info(
        "admin: %s sent password reset to %s (warning=%s)", admin.email, email, warning,
    )
    return {"success": True, "email": email, "warning": warning}
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
pytest tests/api/test_admin_send_password_reset_route.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/admin_routes.py tests/api/test_admin_send_password_reset_route.py
git commit -m "feat(admin): POST /api/admin/users/{email}/send-password-reset 라우트"
```

---

## ⏸ Checkpoint B — 관리자 라우트 점검

세 라우트가 모두 동작하는지 빠른 회귀:
```bash
cd C:\project\harness-server
pytest tests/api/test_admin_suspend_route.py tests/api/test_admin_unsuspend_route.py tests/api/test_admin_send_password_reset_route.py tests/api/test_admin_reset_usage_route.py -v
```
**아직 인증 강제가 없으므로** 정지된 사용자도 로그인 가능. 다음 phase 에서 막는다.

---

## Phase D — BE 인증 강제 (강력 차단)

### Task 8: auth_service.login 에서 정지 검사

**Files:**
- Modify: `app/service/auth_service.py`
- Test: `tests/service/test_auth_service_suspended_login.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/service/test_auth_service_suspended_login.py` 생성:

```python
"""auth_service.login — 정지된 사용자는 403 + account_suspended code."""
from __future__ import annotations
from typing import Optional
import pytest
from fastapi import HTTPException

from app.service import auth_service
from app.service.auth_service import LoginRequest
from app.service.user_repository import UserInDB

pytestmark = pytest.mark.asyncio


def _user(*, is_suspended=False, reason: Optional[str] = None) -> UserInDB:
    return UserInDB(
        id="1", email="a@x.com", name="A",
        hashed_password="$2b$12$validbcrypthashplaceholder0000000000000000000000000000",
        subscription_type="free", is_admin=False,
        is_suspended=is_suspended, suspended_reason=reason,
    )


async def test_suspended_user_login_returns_403_with_code(monkeypatch):
    async def fake_get(email):
        return _user(is_suspended=True, reason="abuse")
    monkeypatch.setattr(
        "app.service.auth_service.users.get_user_by_email", fake_get
    )
    # verify_password 는 True 로 통과시켜 정지 분기만 검증
    monkeypatch.setattr(
        "app.service.auth_service.verify_password",
        lambda plain, hashed: True,
    )

    with pytest.raises(HTTPException) as exc:
        await auth_service.login(LoginRequest(email="a@x.com", password="x"))
    assert exc.value.status_code == 403
    assert isinstance(exc.value.detail, dict)
    assert exc.value.detail["code"] == "account_suspended"
    assert "abuse" in exc.value.detail["message"]


async def test_suspended_user_no_reason_returns_generic_message(monkeypatch):
    async def fake_get(email):
        return _user(is_suspended=True, reason=None)
    monkeypatch.setattr(
        "app.service.auth_service.users.get_user_by_email", fake_get
    )
    monkeypatch.setattr(
        "app.service.auth_service.verify_password",
        lambda plain, hashed: True,
    )

    with pytest.raises(HTTPException) as exc:
        await auth_service.login(LoginRequest(email="a@x.com", password="x"))
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "account_suspended"
    # 사유 미입력 → 일반 메시지 (사유 본문 미포함)
    assert "고객센터" in exc.value.detail["message"]
    assert "abuse" not in exc.value.detail["message"]


async def test_wrong_password_still_401_no_enumeration(monkeypatch):
    """정지 상태여도 비번 틀리면 401 (계정 존재 노출 방지)."""
    async def fake_get(email):
        return _user(is_suspended=True, reason="abuse")
    monkeypatch.setattr(
        "app.service.auth_service.users.get_user_by_email", fake_get
    )
    monkeypatch.setattr(
        "app.service.auth_service.verify_password",
        lambda plain, hashed: False,
    )

    with pytest.raises(HTTPException) as exc:
        await auth_service.login(LoginRequest(email="a@x.com", password="bad"))
    assert exc.value.status_code == 401
    # 403/account_suspended 가 아님
    assert isinstance(exc.value.detail, str) or exc.value.detail.get("code") != "account_suspended"
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/service/test_auth_service_suspended_login.py -v
```
Expected: FAIL — login 이 정지 검사 안 함.

- [ ] **Step 3: `login` 에 정지 검사 + 헬퍼 추가**

`app/service/auth_service.py` 의 `login` 함수 안, `if not user_db or not verify_password(...)` 블록 *다음* 에 추가:

```python
async def login(payload: LoginRequest) -> tuple[UserPublic, str, str]:
    """로그인. Neo4j 에서 user 조회 → bcrypt 비교 → JWT 발급."""
    user_db: UserInDB | None = await users.get_user_by_email(payload.email)

    # 보안: 이메일 없음/비번 틀림을 동일 메시지로 (enumeration 방지)
    if not user_db or not verify_password(payload.password, user_db.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )

    # [2026-05-18] 정지된 계정 차단 — 비번 검증 후 검사 (enumeration 방어 일관).
    if user_db.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "account_suspended",
                "message": _suspended_message(user_db.suspended_reason),
            },
        )

    access = create_access_token(user_db.email)
    refresh = create_refresh_token(user_db.email)
    return UserPublic.from_db(user_db), access, refresh


def _suspended_message(reason: Optional[str]) -> str:
    """정지 사용자에게 보여줄 메시지. reason 입력 시 사용자에게 노출, 아니면 일반 안내."""
    if reason and reason.strip():
        return f"계정이 정지되었습니다. 사유: {reason.strip()}"
    return "계정이 정지되었습니다. 고객센터로 문의해 주세요."
```

`Optional` import 가 이미 있는지 확인 (없으면 `from typing import Optional` 추가).

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pytest tests/service/test_auth_service_suspended_login.py -v
```
Expected: PASS

- [ ] **Step 5: 기존 auth_service 테스트 회귀 확인**

```bash
pytest tests/service/test_auth_service.py -v
```
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add app/service/auth_service.py tests/service/test_auth_service_suspended_login.py
git commit -m "feat(auth): 로그인 시 is_suspended 검사 (403 account_suspended)"
```

---

### Task 9: refresh_access_token 에서 정지 + iat 검사

**Files:**
- Modify: `app/service/auth_service.py`
- Test: `tests/service/test_auth_service_suspended_refresh.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/service/test_auth_service_suspended_refresh.py` 생성:

```python
"""refresh_access_token — 정지 + iat<suspended_at 거부."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException

import jwt
from app.core.config import settings
from app.service import auth_service
from app.service.user_repository import UserInDB

pytestmark = pytest.mark.asyncio


def _make_refresh(*, iat_offset_sec: int = -60) -> str:
    now = datetime.now(timezone.utc) + timedelta(seconds=iat_offset_sec)
    payload = {
        "sub": "a@x.com", "type": "refresh", "jti": "j1",
        "iat": now, "exp": now + timedelta(days=7),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY,
                      algorithm=settings.JWT_ALGORITHM)


def _user(*, is_suspended=False, suspended_at=None) -> UserInDB:
    return UserInDB(
        id="1", email="a@x.com", name="A", hashed_password="h",
        subscription_type="free", is_admin=False,
        is_suspended=is_suspended, suspended_at=suspended_at,
    )


async def test_suspended_user_refresh_rejected(monkeypatch):
    async def fake_get(email):
        return _user(is_suspended=True,
                     suspended_at="2099-01-01T00:00:00Z")  # 미래 (no iat collision)
    monkeypatch.setattr(
        "app.service.auth_service.users.get_user_by_email", fake_get
    )

    async def fake_revoked(jti): return False
    monkeypatch.setattr(
        "app.service.auth_service.token_blacklist.is_revoked", fake_revoked
    )

    async def fake_revoke(jti, exp): return None
    monkeypatch.setattr(
        "app.service.auth_service.token_blacklist.revoke_if_new", fake_revoke
    )

    token = _make_refresh()
    with pytest.raises(HTTPException) as exc:
        await auth_service.refresh_access_token(token)
    assert exc.value.status_code == 401
    assert "정지" in exc.value.detail or "suspended" in str(exc.value.detail).lower()


async def test_iat_before_suspended_at_rejected(monkeypatch):
    """해제→재정지 시나리오: 이전 정지 이전 발급된 refresh 도 거부."""
    # 토큰 iat = now-60, suspended_at = now-30 → iat < suspended_at
    suspended_at_iso = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()

    async def fake_get(email):
        # 현재는 정지 *해제* 상태지만 iat < suspended_at 이므로 거부돼야 함
        return _user(is_suspended=False, suspended_at=suspended_at_iso)
    monkeypatch.setattr(
        "app.service.auth_service.users.get_user_by_email", fake_get
    )
    async def fake_revoked(jti): return False
    monkeypatch.setattr(
        "app.service.auth_service.token_blacklist.is_revoked", fake_revoked
    )
    async def fake_revoke(jti, exp): return None
    monkeypatch.setattr(
        "app.service.auth_service.token_blacklist.revoke_if_new", fake_revoke
    )

    token = _make_refresh(iat_offset_sec=-60)
    with pytest.raises(HTTPException) as exc:
        await auth_service.refresh_access_token(token)
    assert exc.value.status_code == 401


async def test_iat_after_suspended_at_allowed(monkeypatch):
    """정지 해제 후 새로 발급된 토큰은 정상."""
    suspended_at_iso = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()

    async def fake_get(email):
        return _user(is_suspended=False, suspended_at=suspended_at_iso)
    monkeypatch.setattr(
        "app.service.auth_service.users.get_user_by_email", fake_get
    )
    async def fake_revoked(jti): return False
    monkeypatch.setattr(
        "app.service.auth_service.token_blacklist.is_revoked", fake_revoked
    )
    async def fake_revoke(jti, exp): return None
    monkeypatch.setattr(
        "app.service.auth_service.token_blacklist.revoke_if_new", fake_revoke
    )

    token = _make_refresh(iat_offset_sec=-60)
    new_access, new_refresh = await auth_service.refresh_access_token(token)
    assert isinstance(new_access, str) and isinstance(new_refresh, str)
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/service/test_auth_service_suspended_refresh.py -v
```
Expected: FAIL.

- [ ] **Step 3: `refresh_access_token` 에 정지 + iat 검사 추가**

`app/service/auth_service.py` 의 `refresh_access_token` 함수에서, `user_db = await users.get_user_by_email(email)` + `if not user_db: ...` 블록 *다음* 에 추가:

```python
    # 탈퇴된 유저의 refresh token 차단
    user_db = await users.get_user_by_email(email)
    if not user_db:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다.",
        )

    # [2026-05-18] 정지된 계정 차단 + iat 비교로 정지 이전 발급 토큰 거부.
    _enforce_not_suspended(user_db, token_iat=payload.get("iat"))
```

파일 하단(`refresh_access_token` 뒤)에 헬퍼 추가:

```python
def _enforce_not_suspended(
    user_db: UserInDB, *, token_iat: Optional[int],
) -> None:
    """
    정지된 계정이거나, 토큰 iat 이 마지막 정지 시점 이전이면 401.

    - 현재 is_suspended=true → 즉시 401
    - is_suspended=false 여도 token.iat < user.suspended_at 이면 401 (안전망)
    """
    if user_db.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="계정이 정지되었습니다.",
        )
    if token_iat is None or not user_db.suspended_at:
        return
    suspended_epoch = _to_epoch(user_db.suspended_at)
    if suspended_epoch is None:
        return
    if int(token_iat) < suspended_epoch:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="세션이 만료되었습니다. 다시 로그인해 주세요.",
        )


def _to_epoch(iso: str) -> Optional[int]:
    """Neo4j toString(datetime) ISO → epoch second. 파싱 실패 시 None (안전)."""
    if not iso:
        return None
    s = iso.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError:
        return None
```

`datetime`, `timezone` 이 이미 import 되어 있는지 확인 (없으면 `from datetime import datetime, timezone` 추가).

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pytest tests/service/test_auth_service_suspended_refresh.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/service/auth_service.py tests/service/test_auth_service_suspended_refresh.py
git commit -m "feat(auth): refresh 시 is_suspended + iat<suspended_at 검사"
```

---

### Task 10: get_current_user 에서 정지 + iat 검사

**Files:**
- Modify: `app/core/security.py`
- Test: `tests/core/test_security_suspended.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/core/test_security_suspended.py` 생성:

```python
"""get_current_user — 정지된 사용자는 401."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException
import jwt

from app.core import security
from app.core.config import settings
from app.service.user_repository import UserInDB

pytestmark = pytest.mark.asyncio


def _access(iat_offset_sec: int = -60) -> str:
    now = datetime.now(timezone.utc) + timedelta(seconds=iat_offset_sec)
    return jwt.encode(
        {"sub": "a@x.com", "type": "access", "jti": "j1",
         "iat": now, "exp": now + timedelta(minutes=15)},
        settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM,
    )


def _user(*, is_suspended=False, suspended_at=None) -> UserInDB:
    return UserInDB(
        id="1", email="a@x.com", name="A", hashed_password="h",
        subscription_type="free", is_admin=False,
        is_suspended=is_suspended, suspended_at=suspended_at,
    )


async def test_suspended_user_get_current_user_401(monkeypatch):
    async def fake_get(email):
        return _user(is_suspended=True)
    monkeypatch.setattr(
        "app.service.user_repository.get_user_by_email", fake_get
    )
    async def fake_blacklist(jti): return False
    monkeypatch.setattr(
        "app.core.security.token_blacklist.is_revoked", fake_blacklist
    )

    with pytest.raises(HTTPException) as exc:
        await security.get_current_user(token=_access())
    assert exc.value.status_code == 401
    assert "정지" in exc.value.detail


async def test_iat_before_suspended_at_rejected(monkeypatch):
    suspended_at = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    async def fake_get(email):
        return _user(is_suspended=False, suspended_at=suspended_at)
    monkeypatch.setattr(
        "app.service.user_repository.get_user_by_email", fake_get
    )
    async def fake_blacklist(jti): return False
    monkeypatch.setattr(
        "app.core.security.token_blacklist.is_revoked", fake_blacklist
    )
    with pytest.raises(HTTPException) as exc:
        await security.get_current_user(token=_access(iat_offset_sec=-60))
    assert exc.value.status_code == 401


async def test_normal_user_passes(monkeypatch):
    async def fake_get(email):
        return _user(is_suspended=False, suspended_at=None)
    monkeypatch.setattr(
        "app.service.user_repository.get_user_by_email", fake_get
    )
    async def fake_blacklist(jti): return False
    monkeypatch.setattr(
        "app.core.security.token_blacklist.is_revoked", fake_blacklist
    )
    user = await security.get_current_user(token=_access())
    assert user.email == "a@x.com"
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/core/test_security_suspended.py -v
```
Expected: FAIL — `get_current_user` 정지 검사 없음.

- [ ] **Step 3: `get_current_user` 에 정지 검사 추가**

`app/core/security.py` 의 `get_current_user`, `user_db = await users.get_user_by_email(email)` + `if not user_db: ...` 블록 *다음* 에 추가:

```python
    # Neo4j 직접 조회 (탈퇴 시 즉시 차단됨)
    user_db = await users.get_user_by_email(email)
    if not user_db:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다.",
        )

    # [2026-05-18] 정지 / iat 비교 — 활성 토큰 일괄 무효화.
    if user_db.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="계정이 정지되었습니다.",
        )
    token_iat = payload.get("iat")
    if token_iat is not None and user_db.suspended_at:
        suspended_epoch = _suspended_at_to_epoch(user_db.suspended_at)
        if suspended_epoch is not None and int(token_iat) < suspended_epoch:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="세션이 만료되었습니다. 다시 로그인해 주세요.",
            )

    return users.UserPublic.from_db(user_db)
```

파일 어디든(top-level) 헬퍼 추가 (auth_service 의 `_to_epoch` 와 동일 로직 — DRY 를 위해 별도 모듈로 빼고 싶다면 `app/core/timeparse.py` 신설 가능. 여기선 우선 inline):

```python
def _suspended_at_to_epoch(iso: str) -> Optional[int]:
    """Neo4j toString(datetime) ISO → epoch second."""
    if not iso:
        return None
    s = iso.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError:
        return None
```

`Optional` import 가 이미 있는지 확인.

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pytest tests/core/test_security_suspended.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/core/security.py tests/core/test_security_suspended.py
git commit -m "feat(auth): get_current_user 에서 is_suspended + iat 검사"
```

---

### Task 11: OAuth callback (GitHub/Google) 에서 정지 검사

**Files:**
- Modify: `app/api/auth_routes.py`
- Test: `tests/api/test_oauth_callback_suspended.py`

OAuth 콜백은 `UserPublic` 만 반환받기 때문에 `is_suspended` 필드 접근이 안 됨. 콜백에서 `users.get_user_by_email(user.email)` 로 한 번 더 조회해 검사하거나, `UserPublic` 에도 `is_suspended` 노출 — 간단함을 위해 `UserPublic` 에 추가하지 않고 콜백에서 추가 조회.

- [ ] **Step 1: 실패 테스트 작성**

`tests/api/test_oauth_callback_suspended.py` 생성:

```python
"""GitHub/Google callback — 정지된 사용자는 FE 로 ?error=suspended redirect."""
from __future__ import annotations
from typing import Optional
import pytest

from app.api import auth_routes
from app.service.user_repository import UserInDB, UserPublic

pytestmark = pytest.mark.asyncio


def _public(email="a@x.com") -> UserPublic:
    return UserPublic(id="1", email=email, name="A",
                      subscription_type="free", is_admin=False)


def _indb(*, is_suspended=False, reason: Optional[str] = None) -> UserInDB:
    return UserInDB(
        id="1", email="a@x.com", name="A", hashed_password="",
        subscription_type="free", is_admin=False,
        is_suspended=is_suspended, suspended_reason=reason,
    )


@pytest.fixture
def common_github_mocks(monkeypatch):
    """GitHub callback 의존성 — code/state/exchange/user 모두 통과시키고
    사용자 조회만 변조 가능하게."""
    class _S:
        github_oauth_enabled = True
        admin_emails_list = []
        github_oauth_scopes_list = []
        frontend_callback_url = "https://app/callback"
    monkeypatch.setattr("app.api.auth_routes.settings", _S, raising=False)

    monkeypatch.setattr(
        "app.api.auth_routes.github_oauth.verify_state_token",
        lambda s: {"mode": "login"},
    )
    async def fake_exchange(code): return "gh-token"
    monkeypatch.setattr(
        "app.api.auth_routes.github_oauth.exchange_code_for_token", fake_exchange
    )
    async def fake_fetch(token):
        return {"github_id": 1, "login": "x", "email": "a@x.com", "name": "A"}
    monkeypatch.setattr(
        "app.api.auth_routes.github_oauth.fetch_github_user", fake_fetch
    )
    return monkeypatch


async def test_github_callback_suspended_redirects_with_error(common_github_mocks):
    monkeypatch = common_github_mocks
    async def fake_find_by_gh(gh_id): return _public()
    monkeypatch.setattr(
        "app.api.auth_routes.users.find_by_github_id", fake_find_by_gh
    )
    async def fake_get_by_email(email):
        return _indb(is_suspended=True, reason="abuse")
    monkeypatch.setattr(
        "app.api.auth_routes.users.get_user_by_email", fake_get_by_email
    )

    resp = await auth_routes.github_callback_route(code="c", state="s")
    # _redirect_to_frontend 는 RedirectResponse. location header 검사.
    loc = resp.headers.get("location", "")
    assert "error=suspended" in loc or "error=account_suspended" in loc
    # access_token query 미포함 확인 — 토큰 발급 안 됨
    assert "access_token=" not in loc
```

(Google 도 동일 패턴 1개 케이스만; 시간 절약을 위해 GitHub 케이스만 명시. PR 검토 시 Google 도 동일 변경을 한 줄로 검증 가능.)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pytest tests/api/test_oauth_callback_suspended.py -v
```
Expected: FAIL — GitHub callback 이 정지 검사 안 함.

- [ ] **Step 3: GitHub callback 에 정지 검사 추가**

`app/api/auth_routes.py` `github_callback_route` 의 `# 성공 — 우리 JWT 발급` 직전에 추가:

```python
    # [2026-05-18] 정지된 계정은 토큰 발급 차단.
    # UserPublic 에 is_suspended 필드가 없어 UserInDB 로 재조회.
    full = await users.get_user_by_email(user.email)
    if full and full.is_suspended:
        return _redirect_to_frontend(
            mode=mode,
            error=f"suspended:{full.suspended_reason or ''}",
        )

    # 성공 — 우리 JWT 발급
    access = create_access_token(user.email)
    ...
```

- [ ] **Step 4: Google callback 에 동일 검사 추가**

`google_callback_route` 의 `access = create_access_token(user.email)` 직전에 동일 로직 (단, `redirect` 헬퍼 사용):

```python
    full = await users.get_user_by_email(user.email)
    if full and full.is_suspended:
        return redirect(
            mode=mode,
            error=f"suspended:{full.suspended_reason or ''}",
        )

    access = create_access_token(user.email)
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
pytest tests/api/test_oauth_callback_suspended.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/auth_routes.py tests/api/test_oauth_callback_suspended.py
git commit -m "feat(auth): OAuth callback 에서 is_suspended 검사 후 FE 로 error redirect"
```

---

## ⏸ Checkpoint C — BE 통합 검증

BE 전체 테스트 회귀:
```bash
cd C:\project\harness-server
pytest -x
```
모두 PASS 인지 확인. 실패 시 stop & fix (특히 기존 admin/auth 테스트가 새 default 필드와 호환 안 되면 매핑 수정).

**수동 시나리오 점검 (선택)**:
1. 테스트 사용자 1명 생성 → DB 에서 `is_suspended=true, suspended_at=datetime()` SET.
2. 그 사용자의 access token 으로 `/auth/me` 호출 → 401 `"계정이 정지되었습니다."` 확인.
3. 그 사용자로 `/auth/login` → 403 + `{code: "account_suspended"}` 확인.

---

## Phase E — FE API + 관리자 페이지

### Task 12: 관리자 API 헬퍼 3종 추가

**Files:**
- Modify: `src/utils/admin.js`
- Test: `tests/admin-api-suspend.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/admin-api-suspend.test.js` 생성 (Vitest):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({
  default: { patch: vi.fn(), post: vi.fn(), get: vi.fn() },
}))
vi.mock('@/utils/apiErrors', () => ({ extractError: (e, fb) => fb }))

import axios from '@/utils/axios'
import {
  suspendUserApi,
  unsuspendUserApi,
  sendPasswordResetApi,
} from '@/utils/admin'

beforeEach(() => {
  axios.patch.mockReset()
  axios.post.mockReset()
})

describe('suspendUserApi', () => {
  it('PATCH 정상 호출 + reason 전달', async () => {
    axios.patch.mockResolvedValue({ data: { user: { email: 'u@x.com', is_suspended: true } } })
    const r = await suspendUserApi('u@x.com', { reason: 'abuse' })
    expect(r.success).toBe(true)
    expect(r.user.is_suspended).toBe(true)
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/u%40x.com/suspend'),
      { reason: 'abuse' },
    )
  })
  it('에러 시 success=false + error 메시지', async () => {
    axios.patch.mockRejectedValue({ response: { status: 400 } })
    const r = await suspendUserApi('u@x.com', { reason: '' })
    expect(r.success).toBe(false)
    expect(r.status).toBe(400)
  })
})

describe('unsuspendUserApi', () => {
  it('PATCH 정상 호출', async () => {
    axios.patch.mockResolvedValue({ data: { user: { email: 'u@x.com', is_suspended: false } } })
    const r = await unsuspendUserApi('u@x.com')
    expect(r.success).toBe(true)
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/u%40x.com/unsuspend'),
      {},
    )
  })
})

describe('sendPasswordResetApi', () => {
  it('POST 정상 호출', async () => {
    axios.post.mockResolvedValue({ data: { success: true, email: 'u@x.com' } })
    const r = await sendPasswordResetApi('u@x.com')
    expect(r.success).toBe(true)
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/u%40x.com/send-password-reset'),
      {},
    )
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

작업 폴더(FE worktree)에서:
```bash
pnpm vitest run tests/admin-api-suspend.test.js
```
Expected: FAIL — 함수 미정의.

- [ ] **Step 3: `src/utils/admin.js` 에 헬퍼 추가**

파일 끝에 추가:

```js
/**
 * 사용자 계정 정지.
 * @param {string} email
 * @param {{ reason?: string }} opts — reason 미지정 시 사용자에게 사유 노출 안 함
 */
export const suspendUserApi = async (email, { reason = '' } = {}) => {
  try {
    const res = await axios.patch(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/suspend`,
      { reason },
    )
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '계정 정지에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 사용자 계정 정지 해제.
 */
export const unsuspendUserApi = async (email) => {
  try {
    const res = await axios.patch(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/unsuspend`,
      {},
    )
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '정지 해제에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}

/**
 * 비밀번호 재설정 메일 발송 (관리자 → 사용자).
 *
 * BE 응답:
 *   { success: true, email, warning: 'email_disabled' | 'email_send_failed' | null }
 *
 * OAuth-only 사용자는 400. 미가입은 404.
 */
export const sendPasswordResetApi = async (email) => {
  try {
    const res = await axios.post(
      `${AUTH_BASE}/api/admin/users/${encodeURIComponent(email)}/send-password-reset`,
      {},
    )
    return { success: true, ...(res.data || {}) }
  } catch (error) {
    return {
      success: false,
      error: extractError(error, '비밀번호 재설정 메일 발송에 실패했습니다.'),
      status: error?.response?.status,
    }
  }
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pnpm vitest run tests/admin-api-suspend.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/admin.js tests/admin-api-suspend.test.js
git commit -m "feat(admin-api): suspend/unsuspend/sendPasswordReset 헬퍼 추가"
```

---

### Task 13: 관리자 페이지에 상태 컬럼 + 다이얼로그 3종

**Files:**
- Modify: `src/pages/admin/index.vue`

이 작업은 양이 많아 단계 세분화:

- [ ] **Step 1: imports 추가**

`src/pages/admin/index.vue` `<script setup>` 상단 lucide-vue-next + admin import 에 추가:

```js
import {
  ArrowLeft, Search, Crown, Loader2, Github, RefreshCw, ChevronRight, ChevronLeft,
  ShieldCheck, Shield, BadgeCheck, History, X, AlertCircle, FileSearch, TrendingUp,
  MessageSquare,
  UserX, UserCheck, Mail,   // ← 추가
} from 'lucide-vue-next'
import {
  listAdminUsersApi,
  getAdminUserDetailApi,
  changeSubscriptionApi,
  resetUserUsageApi,
  setAdminApi,
  suspendUserApi,           // ← 추가
  unsuspendUserApi,         // ← 추가
  sendPasswordResetApi,     // ← 추가
} from '@/utils/admin'
```

- [ ] **Step 2: state + 다이얼로그 핸들러 추가**

`toggleAdmin` 함수 다음에 추가:

```js
// ─── 정지 / 해제 다이얼로그 ────────────────────────────────
const suspendDialogOpen = ref(false)
const suspendDialogTarget = ref(null)
const suspendDialogReason = ref('')
const suspendDialogSubmitting = ref(false)

const openSuspendDialog = (user) => {
  if (user.email.toLowerCase() === (me.value?.email || '').toLowerCase()) {
    showError?.('자기 자신의 계정은 정지할 수 없습니다.')
    return
  }
  suspendDialogTarget.value = user
  suspendDialogReason.value = ''
  suspendDialogOpen.value = true
}

const submitSuspend = async () => {
  if (!suspendDialogTarget.value) return
  suspendDialogSubmitting.value = true
  const targetEmail = suspendDialogTarget.value.email
  const res = await suspendUserApi(targetEmail, {
    reason: suspendDialogReason.value.trim(),
  })
  suspendDialogSubmitting.value = false
  if (!res.success) {
    showError?.(res.error || '계정 정지에 실패했습니다.')
    return
  }
  showSuccess?.(`${targetEmail} 계정을 정지했습니다.`)
  suspendDialogOpen.value = false
  await load()
  if (selectedEmail.value === targetEmail) await openDetail(targetEmail)
}

const unsuspendDialogOpen = ref(false)
const unsuspendDialogTarget = ref(null)
const unsuspendDialogSubmitting = ref(false)

const openUnsuspendDialog = (user) => {
  unsuspendDialogTarget.value = user
  unsuspendDialogOpen.value = true
}

const submitUnsuspend = async () => {
  if (!unsuspendDialogTarget.value) return
  unsuspendDialogSubmitting.value = true
  const targetEmail = unsuspendDialogTarget.value.email
  const res = await unsuspendUserApi(targetEmail)
  unsuspendDialogSubmitting.value = false
  if (!res.success) {
    showError?.(res.error || '정지 해제에 실패했습니다.')
    return
  }
  showSuccess?.(`${targetEmail} 정지를 해제했습니다.`)
  unsuspendDialogOpen.value = false
  await load()
  if (selectedEmail.value === targetEmail) await openDetail(targetEmail)
}

// ─── 비밀번호 초기화 메일 다이얼로그 ───────────────────────
const resetPwDialogOpen = ref(false)
const resetPwDialogTarget = ref(null)
const resetPwDialogSubmitting = ref(false)

const openResetPwDialog = (user) => {
  if (!user.has_password) {
    showError?.('OAuth 가입자는 비밀번호 초기화 대상이 아닙니다.')
    return
  }
  resetPwDialogTarget.value = user
  resetPwDialogOpen.value = true
}

const submitResetPw = async () => {
  if (!resetPwDialogTarget.value) return
  resetPwDialogSubmitting.value = true
  const targetEmail = resetPwDialogTarget.value.email
  const res = await sendPasswordResetApi(targetEmail)
  resetPwDialogSubmitting.value = false
  if (!res.success) {
    showError?.(res.error || '비밀번호 재설정 메일 발송에 실패했습니다.')
    return
  }
  const warn = res.warning
  if (warn === 'email_disabled') {
    showError?.(`${targetEmail} 토큰은 생성됐으나 이메일 발송이 비활성화 상태입니다.`)
  } else if (warn === 'email_send_failed') {
    showError?.(`${targetEmail} 토큰은 생성됐으나 이메일 발송에 실패했습니다.`)
  } else {
    showSuccess?.(`${targetEmail} 에게 비밀번호 재설정 메일을 발송했습니다.`)
  }
  resetPwDialogOpen.value = false
}
```

- [ ] **Step 3: 테이블 헤더 + 행에 컬럼/액션 추가**

`<thead><tr>` 의 `<th>가입</th>` 앞에 `<th>상태</th>` 추가:

```html
<thead>
  <tr>
    <th>이메일</th>
    <th>이름</th>
    <th>GitHub</th>
    <th>구독</th>
    <th>권한</th>
    <th>상태</th>  <!-- 추가 -->
    <th>가입</th>
    <th>액션</th>
  </tr>
</thead>
```

`<tbody>` 의 각 사용자 행 (`<tr v-for="u in users"`) 안 `<td>` 들 중 `가입` 셀 *앞* 에 상태 셀 추가:

```html
<td>
  <span v-if="u.is_suspended" class="status-chip status-chip--suspended"
        :title="`정지: ${u.suspended_at || ''} ${u.suspended_reason ? '— ' + u.suspended_reason : ''}`">
    정지됨
  </span>
  <span v-else class="status-chip status-chip--active">정상</span>
</td>
```

액션 `<td>` 안(기존 admin-toggle / reset-usage 버튼들 옆)에 추가:

```html
<!-- 정지 / 해제 -->
<button
  v-if="!u.is_suspended"
  class="row-action-btn row-action-btn--danger"
  :disabled="u.email.toLowerCase() === (me?.email || '').toLowerCase()"
  :title="u.email.toLowerCase() === (me?.email || '').toLowerCase()
    ? '자기 자신의 계정은 정지할 수 없습니다'
    : '계정 정지'"
  @click="openSuspendDialog(u)"
>
  <UserX :size="13" />
  <span>정지</span>
</button>
<button
  v-else
  class="row-action-btn row-action-btn--primary"
  title="정지 해제"
  @click="openUnsuspendDialog(u)"
>
  <UserCheck :size="13" />
  <span>해제</span>
</button>

<!-- 비밀번호 초기화 메일 -->
<button
  class="row-action-btn"
  :disabled="!u.has_password"
  :title="u.has_password
    ? '비밀번호 재설정 메일 발송'
    : 'OAuth 가입자는 소셜 로그인으로 재접속하세요'"
  @click="openResetPwDialog(u)"
>
  <Mail :size="13" />
  <span>비번 메일</span>
</button>
```

- [ ] **Step 4: 다이얼로그 3종 마크업 추가**

`</template>` 직전(다른 다이얼로그들과 같은 위치)에 추가. 기존 `subDialogOpen` 다이얼로그의 마크업 스타일을 참고하여 일관성 있게:

```html
<!-- 정지 다이얼로그 -->
<div v-if="suspendDialogOpen" class="dialog-overlay" @click.self="suspendDialogOpen = false">
  <div class="dialog-panel">
    <div class="dialog-header">
      <h3>계정 정지</h3>
      <button class="dialog-close" @click="suspendDialogOpen = false"><X :size="14" /></button>
    </div>
    <div class="dialog-body">
      <p><strong>{{ suspendDialogTarget?.email }}</strong> 계정을 정지하시겠습니까?</p>
      <p class="dialog-hint">정지 시 즉시 로그인 차단 + 모든 활성 세션 무효화됩니다.</p>
      <label>
        <span>사유 (선택)</span>
        <textarea
          v-model="suspendDialogReason"
          maxlength="500"
          rows="3"
          placeholder="비워두면 사용자에게 노출되지 않습니다"
        />
      </label>
    </div>
    <div class="dialog-actions">
      <button class="btn-secondary" @click="suspendDialogOpen = false" :disabled="suspendDialogSubmitting">취소</button>
      <button class="btn-danger" @click="submitSuspend" :disabled="suspendDialogSubmitting">
        <Loader2 v-if="suspendDialogSubmitting" :size="13" class="spin" />
        정지하기
      </button>
    </div>
  </div>
</div>

<!-- 해제 다이얼로그 -->
<div v-if="unsuspendDialogOpen" class="dialog-overlay" @click.self="unsuspendDialogOpen = false">
  <div class="dialog-panel">
    <div class="dialog-header">
      <h3>정지 해제</h3>
      <button class="dialog-close" @click="unsuspendDialogOpen = false"><X :size="14" /></button>
    </div>
    <div class="dialog-body">
      <p><strong>{{ unsuspendDialogTarget?.email }}</strong> 정지를 해제하시겠습니까?</p>
      <p v-if="unsuspendDialogTarget?.suspended_reason" class="dialog-hint">
        기존 정지 사유: {{ unsuspendDialogTarget.suspended_reason }}
      </p>
    </div>
    <div class="dialog-actions">
      <button class="btn-secondary" @click="unsuspendDialogOpen = false" :disabled="unsuspendDialogSubmitting">취소</button>
      <button class="btn-primary" @click="submitUnsuspend" :disabled="unsuspendDialogSubmitting">
        <Loader2 v-if="unsuspendDialogSubmitting" :size="13" class="spin" />
        해제하기
      </button>
    </div>
  </div>
</div>

<!-- 비밀번호 초기화 메일 다이얼로그 -->
<div v-if="resetPwDialogOpen" class="dialog-overlay" @click.self="resetPwDialogOpen = false">
  <div class="dialog-panel">
    <div class="dialog-header">
      <h3>비밀번호 재설정 메일 발송</h3>
      <button class="dialog-close" @click="resetPwDialogOpen = false"><X :size="14" /></button>
    </div>
    <div class="dialog-body">
      <p><strong>{{ resetPwDialogTarget?.email }}</strong> 에게 비밀번호 재설정 링크를 발송합니다.</p>
      <p class="dialog-hint">사용자가 메일의 링크를 클릭해 직접 새 비밀번호를 설정합니다 (30분 후 만료).</p>
    </div>
    <div class="dialog-actions">
      <button class="btn-secondary" @click="resetPwDialogOpen = false" :disabled="resetPwDialogSubmitting">취소</button>
      <button class="btn-primary" @click="submitResetPw" :disabled="resetPwDialogSubmitting">
        <Loader2 v-if="resetPwDialogSubmitting" :size="13" class="spin" />
        메일 발송
      </button>
    </div>
  </div>
</div>
```

(다이얼로그 클래스명은 파일 내 기존 패턴 — `dialog-overlay`, `dialog-panel` 등 — 을 따른다. 만약 기존 다이얼로그가 `<Teleport>` 또는 다른 컴포넌트 패턴이라면 그 패턴을 그대로 사용.)

- [ ] **Step 5: 스타일 (필요 시) 추가**

`<style scoped>` 내에 (기존 `.action-btn` 색 패턴 참고):

```css
.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}
.status-chip--active {
  background: rgba(34, 197, 94, 0.12);
  color: rgb(34, 197, 94);
}
.status-chip--suspended {
  background: rgba(239, 68, 68, 0.14);
  color: rgb(239, 68, 68);
}
.row-action-btn--danger {
  color: rgb(239, 68, 68);
}
.row-action-btn--primary {
  color: var(--accent, #4f46e5);
}
.dialog-hint {
  font-size: 0.85rem;
  color: var(--text-muted, #888);
  margin: 0.5em 0;
}
```

(이미 정의된 토큰/클래스가 있으면 그대로 사용.)

- [ ] **Step 6: 상세 패널 — 정지 배너 (선택, 기본 권장)**

상세 패널 마크업 내 user 정보 표시 영역 상단에:

```html
<div v-if="detail?.user?.is_suspended" class="detail-suspended-banner">
  <AlertCircle :size="14" /> 이 계정은 정지 상태입니다.
  <div class="detail-suspended-meta">
    <div v-if="detail.user.suspended_at">정지: {{ formatDate(detail.user.suspended_at) }}</div>
    <div v-if="detail.user.suspended_reason">사유: {{ detail.user.suspended_reason }}</div>
    <div v-if="detail.user.suspended_by_email">담당: {{ detail.user.suspended_by_email }}</div>
  </div>
</div>
<div v-else-if="detail?.user?.unsuspended_at" class="detail-suspended-meta-faint">
  최근 해제: {{ formatDate(detail.user.unsuspended_at) }}
</div>
```

스타일:
```css
.detail-suspended-banner {
  padding: 0.5em 0.75em;
  background: rgba(239, 68, 68, 0.10);
  color: rgb(239, 68, 68);
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 0.5em;
}
.detail-suspended-meta { margin-top: 0.4em; font-size: 0.8rem; }
.detail-suspended-meta-faint { font-size: 0.8rem; opacity: 0.55; }
```

- [ ] **Step 7: dev 서버 실행 + 수동 검증**

```bash
pnpm dev
```
브라우저에서 `/admin` 진입 후:
- [ ] 상태 컬럼이 모든 행에 표시되는지 (전부 `정상` 칩)
- [ ] 비번 메일 버튼: 일반 사용자 활성 / OAuth-only 사용자 비활성 + tooltip
- [ ] 정지 다이얼로그 사유 textarea + 본인 행 정지 버튼 disabled
- [ ] BE 가 정상 동작하므로 임의 사용자 정지 시도 → 알림 + 행 상태 `정지됨` 으로 변경 확인
- [ ] 해제 → `정상` 복귀

문제 없으면:

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/index.vue
git commit -m "feat(admin-ui): 정지/해제/비번 메일 다이얼로그 + 상태 컬럼 추가"
```

---

## ⏸ Checkpoint D — FE 관리자 페이지 검수

수동 시나리오:
1. 일반 사용자 정지 → 그 사용자의 localStorage 토큰을 가진 브라우저 새 탭에서 임의 API 호출 → 401 확인.
2. 해제 → 그 사용자 재로그인 → 정상.
3. OAuth-only 사용자 비번 메일 버튼 → disabled + tooltip 확인.

문제 있으면 [Phase E] 작업 재검토.

---

## Phase F — FE 로그인 / OAuth callback 에러 처리

### Task 14: 로그인 페이지에서 정지 메시지 표시

**Files:**
- Modify: `src/pages/login.vue`

- [ ] **Step 1: 현재 에러 처리 패턴 확인**

```bash
grep -n "axios\|errorMessage\|loginApi\|login\|catch\|response" "src/pages/login.vue" | head -25
```

기존이 axios 응답을 어떤 함수(`loginApi` 등)로 감싸는지 확인. `extractError` 가 backend `detail` 을 문자열로 추출하는지, dict 도 처리하는지 확인:

```bash
grep -n "extractError" src/utils/apiErrors.js
cat src/utils/apiErrors.js
```

`extractError` 가 `detail` 이 dict 일 때 `.message` 를 추출 못 하면 다음 단계에서 보강.

- [ ] **Step 2: 정지 메시지 분기 추가**

`src/pages/login.vue` 의 login submit 핸들러(예: `submitLogin`, `onSubmit`, `login()`) 의 에러 처리 부분에서:

기존 패턴 예시 (실제 코드에 맞춰 적용):
```js
const res = await loginApi({ email, password })
if (!res.success) {
  // [2026-05-18] 정지된 계정 — 명시 메시지 우선 노출.
  if (res.status === 403 && res.detail?.code === 'account_suspended') {
    errorMessage.value = res.detail.message || '계정이 정지되었습니다. 고객센터로 문의해 주세요.'
    return
  }
  errorMessage.value = res.error || '로그인에 실패했습니다.'
}
```

`loginApi` 가 `detail` 을 그대로 노출하지 않으면 `src/utils/auth.js` 의 `loginApi` 를 보강:

```bash
grep -n "loginApi\|extractError" src/utils/auth.js | head -10
```

`loginApi` 의 catch 블록을 다음과 같이 수정:

```js
} catch (error) {
  return {
    success: false,
    error: extractError(error, '로그인에 실패했습니다.'),
    status: error?.response?.status,
    detail: error?.response?.data?.detail,  // ← 추가: dict detail 노출
  }
}
```

- [ ] **Step 3: 수동 검증**

dev 서버에서:
1. 정상 계정 정지 (관리자로) → 그 계정으로 로그인 시도 → "계정이 정지되었습니다. 사유: …" 또는 일반 메시지 확인.
2. 잘못된 비밀번호 → 기존 "이메일 또는 비밀번호가 올바르지 않습니다." 유지 확인 (regression).

- [ ] **Step 4: Commit**

```bash
git add src/pages/login.vue src/utils/auth.js
git commit -m "feat(login): account_suspended 응답에 명시 메시지 표시"
```

---

### Task 15: OAuth callback 페이지에서 suspended error 처리

**Files:**
- Modify: `src/pages/auth/callback.vue` (또는 OAuth 콜백 라우트 컴포넌트)

- [ ] **Step 1: 콜백 페이지 확인**

```bash
ls src/pages/auth
grep -rn "error=\|error.value\|router.replace.*login" src/pages/auth | head -10
```

`location.hash` 또는 `?error=` query 를 파싱하는 위치를 확인.

- [ ] **Step 2: suspended 에러 처리 추가**

콜백 페이지의 에러 파싱 분기에서 (`error` 가 `'suspended:...'` 로 시작하면 분기):

```js
// [2026-05-18] 정지된 계정의 OAuth 시도.
if (errorParam?.startsWith('suspended')) {
  // 'suspended:<reason>' 형식. reason 비어있을 수 있음.
  const reason = errorParam.slice('suspended:'.length)
  const msg = reason
    ? `계정이 정지되었습니다. 사유: ${decodeURIComponent(reason)}`
    : '계정이 정지되었습니다. 고객센터로 문의해 주세요.'
  router.replace({ path: '/login', query: { error: 'suspended', msg } })
  return
}
```

로그인 페이지에서 `route.query.msg` 를 받아 `errorMessage` 에 세팅 (Task 14 의 흐름과 합치):

```js
// login.vue onMounted 또는 setup
if (route.query.error === 'suspended' && route.query.msg) {
  errorMessage.value = route.query.msg
}
```

- [ ] **Step 3: 수동 검증**

dev 서버에서:
1. OAuth-only 사용자 정지 (admin) → GitHub 로 로그인 시도 → 로그인 페이지로 redirect + 정지 메시지 표시.

- [ ] **Step 4: Commit**

```bash
git add src/pages/auth/callback.vue src/pages/login.vue
git commit -m "feat(oauth): callback 에서 suspended 에러 처리 + 로그인 페이지 메시지 표시"
```

---

## ⏸ Final Checkpoint — 운영 시나리오 점검

### BE 전체 회귀
```bash
cd C:\project\harness-server
pytest -x
```

### FE 전체 회귀
```bash
cd C:\project\harness\.claude\worktrees\elastic-northcutt-394606
pnpm vitest run
```

### 운영 시나리오 (수동, 권장)

각 시나리오 통과 시 ☑️:

- [ ] **A. 정상 흐름**: 일반 비번 사용자 정지 → 로그인 시도 (정상 비번) → 403 + "계정이 정지되었습니다…" 표시
- [ ] **B. 활성 세션 무효화**: 사용자 로그인 상태 → 관리자가 정지 → 사용자의 다음 API 호출 → 401 "계정이 정지되었습니다."
- [ ] **C. refresh 차단**: B 직후 사용자 SPA 가 refresh-token 시도 → 401 (재로그인 강제)
- [ ] **D. 해제 후 정상화**: 관리자가 해제 → 사용자 재로그인 → 정상 동작
- [ ] **E. iat 안전망**: 정지→해제→재정지 시퀀스 후, 첫 정지 직전 발급된 토큰으로 API 호출 → 401
- [ ] **F. 본인 정지 차단**: 관리자가 자기 자신 정지 시도 → 400 (FE 도 버튼 disabled)
- [ ] **G. last-admin 보호**: 활성 admin 이 1명인 상황에서 그 admin 정지 시도 → 400
- [ ] **H. 비번 메일 정상**: 일반 사용자 비번 초기화 → 메일 수신 → 링크 클릭 → 새 비번 설정 → 로그인 성공
- [ ] **I. OAuth-only 비번 초기화 차단**: OAuth-only 사용자 비번 초기화 시도 → 400 + FE 버튼 disabled
- [ ] **J. OAuth callback 정지**: 정지된 GitHub 사용자 OAuth 시도 → 로그인 페이지로 redirect + 정지 메시지
- [ ] **K. 감사 로그**: 위 모든 정지/해제/비번 발송 액션이 `/admin/audit-logs` 에 actor + target + payload 와 함께 기록

모두 ☑️ 면 작업 완료.

---

## 부록 — 작업 시 자주 참고할 파일/라인

- BE 인증 진입점: [app/core/security.py:121](harness-server/app/core/security.py:121) `get_current_user`
- BE 로그인: [app/service/auth_service.py:69](harness-server/app/service/auth_service.py:69) `login`
- BE refresh: [app/service/auth_service.py:130](harness-server/app/service/auth_service.py:130) `refresh_access_token`
- BE GitHub callback: [app/api/auth_routes.py:694](harness-server/app/api/auth_routes.py:694) `github_callback_route`
- BE Google callback: [app/api/auth_routes.py:917](harness-server/app/api/auth_routes.py:917) `google_callback_route`
- BE forgot/reset 흐름: [app/api/auth_routes.py:1190](harness-server/app/api/auth_routes.py:1190)
- BE admin 라우트 패턴 참고: [app/api/admin_routes.py:182](harness-server/app/api/admin_routes.py:182) `reset_user_usage_route`
- FE 관리자 페이지: [src/pages/admin/index.vue](src/pages/admin/index.vue)
- FE 관리자 API: [src/utils/admin.js](src/utils/admin.js)
