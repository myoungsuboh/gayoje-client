---
name: Integration Testing — DB·API·Component Wiring
description: A general integration-testing standard that verifies collaboration between components including a real DB, external services, and APIs — test-only dependencies, isolation between tests (reset/cleanup), contract (schema·status·header) verification, sandboxing external services, CI reproducibility. Read it when testing API contracts, DB wiring, or external-service integration, or when spinning up dependent services in CI to verify. It is independent of any specific language/framework/tool.
rules:
  - "Don't touch production: use only test-only DB/queue/cache/buckets, and never connect to real production data."
  - "Isolation between tests: each test starts from a known state and erases its traces when done (rollback/cleanup) — it must produce the same result regardless of execution order."
  - "Look at the contract, not the implementation: send a real request and verify the externally observable contract (schema·status/error code·headers·payload)."
  - "Use doubles for external side effects: replace payment·email·SMS, etc. with sandbox/fake servers so no real charges·sends·external changes occur."
  - "Be deterministic and reproducible: don't depend on time·randomness·timing·order (for async, assert after waiting for completion), and spin up dependent services in code so local and CI match."
tags:
  - "testcontainers"
  - "docker-compose"
  - "pytest-asyncio"
  - "supertest"
  - "TestClient"
  - "integration"
  - "database"
  - "httpx"
---

# 🔗 Integration Testing — DB·API·Component Wiring

> Where a unit test verifies a single unit in isolation, an integration test verifies **collaboration between components** including a real DB, external services, and APIs. Read it when testing API contracts or DB wiring, and when spinning up dependent services reproducibly in CI. It is a general standard not tied to any specific language/framework/test tool. Input validation itself follows the `Input Validation Standard`.

## 1. Core Principles
- **Don't touch production**: use only test-only DB/queue/cache/buckets, and never connect to real production data.
- **Isolation between tests**: each test starts from a known state and erases its traces when done (rollback/cleanup) — it must produce the same result regardless of execution order.
- **Look at the contract, not the implementation**: send a real request and verify the externally observable contract (schema·status/error code·headers·payload).
- **Use doubles for external side effects**: replace payment·email·SMS, etc. with sandbox/fake servers so no real charges·sends·external changes occur.
- **Be deterministic and reproducible**: don't depend on time·randomness·timing·order (for async, assert after waiting for completion), and spin up dependent services in code so local and CI match.

## 2. Rules

### 2-1. Use test-only dependencies, not production
- Point the DB/queue/cache/storage at an isolated instance (in-memory or a container) in the test environment.
- Inject connection info via per-environment configuration, and don't let production connection info leak into the test path.

```text
// ❌ Forbidden — integration test against the production DB
connect(PROD_DATABASE_URL); runTests()      // data pollution, incidents

// ✅ Recommended — a test-only isolated instance
connect(TEST_DATABASE_URL); runTests()      // in-memory or container
```

### 2-2. Isolation between tests — guarantee a start state, clean up when done
- Before each test (or group of cases) bring the schema/data to a known state, and afterward roll back or empty it.
- Pick one isolation strategy (per-test transaction rollback / table truncate / recreate each time) but apply it consistently.
- Don't share common mutable state across tests — it creates ordering dependencies.

```text
// ❌ Forbidden — data accumulates without cleanup → results change with order
test A: insert X
test B: count == 1   // breaks if A runs first

// ✅ Recommended — each test is isolated
beforeEach: reset to known state
afterEach:  rollback / cleanup
```

### 2-3. API integration verifies the contract with real requests
- Don't call the handler function directly; send a request that goes through the real HTTP path (routing·serialization·validation·middleware included).
- Assert the status/error code, response schema, and key headers. After a write, read again to confirm it was actually reflected.

```text
// ❌ Forbidden — calling the internal function directly (skips serialization·routing·validation)
result = controller.create(obj); assert result.ok

// ✅ Recommended — real request → status·schema·round-trip verification
res = POST /users {name, email}
assert res.status == 201
id = res.body.id
got = GET /users/{id}
assert got.status == 200 and got.body.name == name
```

### 2-4. Component (UI, etc.) integration blocks external calls with doubles and asserts after async completion
- UI/view integration tests actually render/mount the component but intercept outbound network calls with fake responses.
- After the async data loading finishes (explicit wait), verify the result reflected on screen.

```text
// ✅ Recommended — intercept external calls + assert after waiting for async completion
mockNetwork(GET /user/u1 → {name: "..."})
render(Profile, {userId: "u1"})
awaitAsyncSettled()              // wait for async processing to complete
assert screen.contains("...")
```

### 2-5. External services via sandbox/double — no real side effects
- Replace payment·email·SMS·third-party APIs with test-mode/sandbox keys or a local fake server.
- Don't cause real charges·sends·external state changes. Reproduce edge conditions like response delays·failures via doubles too.

```text
// ❌ Forbidden — the test calls real payment/sending
charge(realCard)        // cost·side effects·instability

// ✅ Recommended — verify only the contract with sandbox/fake server
charge(sandboxCard) → assert request shape & handled response
```

### 2-6. Spin up dependent services in code and reproduce in CI
- Spin up dependent services like the DB·cache declaratively (container definitions, etc.), confirm **readiness (healthcheck)**, then start the tests.
- Share the same definition between local and CI to eliminate "works on my machine."

```text
// ✅ Recommended — start dependent services → confirm readiness → test
services: [db, cache]  with healthcheck
wait until healthy
then run integration tests
```

## 3. Common Mistakes

Symptoms that appear when you break a rule (§2) — when you see them, go back to that rule.

- **Data pollution·incidents** → testing against production resources (2-1).
- **Breaks depending on order (flaky)** → one of: missing setup/teardown (2-2), not waiting for async completion (2-4), dependence on time·randomness·order (determinism).
- **Misses contract defects** → calling the internal function directly and calling it an "API test," skipping serialization·routing·validation·middleware (2-3).
- **Cost·side effects** → calling external services for real (2-5).
- **"Works on my machine"** → not declaring dependent services in code, so it breaks in CI (2-6).

## 4. Checklist
- [ ] Do you use a test-only DB/dependency (in-memory·container) without touching production resources?
- [ ] Does each test start from a known state and roll back/clean up when done, isolated from one another?
- [ ] Does the API integration test verify the **contract** (status·schema·headers, etc.) with real requests?
- [ ] After a write, do you read again to confirm actual reflection (round-trip)?
- [ ] In UI/component integration, do you block external calls with doubles and assert after async completion?
- [ ] Did you handle external services with test mode/sandbox/fake server (no real side effects)?
- [ ] Did you remove dependence on time·randomness·order to make it deterministic?
- [ ] Do you spin up dependent services in code and run after confirming readiness, so it's reproducible in CI?

## Appendix: Examples by Stack

> The following are reference implementation examples. Add examples matching the stack your team uses (e.g., JVM/Spring+Testcontainers, Node/Jest+supertest, Go/testify, etc.) with the same patterns. The principles and rules of 1–4 above are the standard; the appendix is merely an application of them.

### Python (pytest + httpx + SQLAlchemy + Testcontainers)

Contract·round-trip verification with real requests + per-test DB reset (2-3, 2-2):

```python
import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine
from app.main import app

# Test-only DB (in-memory SQLite or Docker PostgreSQL)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(autouse=True)
async def reset_db():
    """Reset tables before each test"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_create_and_get_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # create
        create_res = await client.post("/users", json={
            "name": "Hong Gildong", "email": "hong@example.com"
        })
        assert create_res.status_code == 201
        user_id = create_res.json()["id"]

        # read — fetched from the real DB
        get_res = await client.get(f"/users/{user_id}")
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "Hong Gildong"
```

If in-memory is not enough, spin up a real PostgreSQL with a container (Testcontainers) and roll back after the test:

```python
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg.get_connection_url()

@pytest.fixture
async def db_session(postgres):
    engine = create_async_engine(postgres)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
        await session.rollback()  # roll back after the test
```

### Vue (Vue Test Utils + Pinia + MSW)

External-call double + assert after async completion (2-4):

```javascript
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import UserProfile from "@/components/UserProfile.vue";

// Mock the real API (MSW or vi.mock)
vi.mock("@/utils/axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: { id: "u1", name: "Hong Gildong", email: "hong@example.com" }
    })
  }
}));

test("load and display user profile", async () => {
  const wrapper = mount(UserProfile, {
    props: { userId: "u1" },
    global: { plugins: [createPinia()] }
  });

  await flushPromises();  // async processing complete

  expect(wrapper.text()).toContain("Hong Gildong");
  expect(wrapper.text()).toContain("hong@example.com");
});
```

### CI dependent services (Docker Compose)

Spin up dependent services with healthchecks and run, to reproduce in CI (2-6):

```yaml
# docker-compose.test.yml
services:
  test:
    build: .
    command: pytest tests/integration/ -v
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://postgres:test@postgres:5432/testdb

  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_PASSWORD: test }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 2s
      retries: 10
```
