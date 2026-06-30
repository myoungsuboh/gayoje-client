---
name: Test Data & Fixture Management
description: A universal standard for test data, fixtures, and seeds — generate within the test, defaults + override only what you need, fake data, fixture scope and inter-test isolation, idempotent seeds. Read this when generating or sharing test data, or writing/maintaining DB seed scripts. Stack-agnostic.
rules:
  - "Data is owned by the test: rather than a pre-populated shared global, each test (or its setup) creates its own data so it does not waver with execution order."
  - "Defaults + override: the generator fills every field with sensible defaults, and the test overrides only meaningful values — breaking duplication and coupling to irrelevant fields."
  - "Fake and deterministic data: use generated fake values instead of sensitive real data (security and compliance), and fix the seed for randomness so it is reproducible while keeping diversity."
  - "Balance isolation and reuse: create expensive-to-build resources once at a broad scope and reuse them, and isolate data created by a test at a narrow scope for cleanup/rollback."
  - "Push heavy or repeated things out: keep large inputs as files + path constants, and write DB seeds idempotently (ignore/update if present)."
tags:
  - "factory"
  - "fixture"
  - "faker"
  - "seed"
  - "mock_data"
  - "pytest.fixture"
  - "beforeEach"
  - "factory_boy"
---

# 🏭 Test Data & Fixture Management

> Create test data inside the test with factories that carry sensible defaults, use fake data, reuse expensive resources by splitting scope while isolating tests from one another, and write seeds idempotently. Read this when generating or sharing test data, or writing/maintaining DB seed scripts. This is a universal standard not tied to any specific language/framework/library.

## 1. Core Principles
- **Data is owned by the test**: rather than a pre-populated shared global, each test (or its setup) creates its own data so it does not waver with execution order.
- **Defaults + override**: the generator fills every field with sensible defaults, and the test overrides only meaningful values — breaking duplication and coupling to irrelevant fields.
- **Fake and deterministic data**: use generated fake values instead of sensitive real data (security and compliance), and fix the seed for randomness so it is reproducible while keeping diversity.
- **Balance isolation and reuse**: create expensive-to-build resources once at a broad scope and reuse them, and isolate data created by a test at a narrow scope for cleanup/rollback.
- **Push heavy or repeated things out**: keep large inputs as files + path constants, and write DB seeds idempotently (ignore/update if present).

## 2. Rules

### 2-1. Test Data via Factories, Created Inside the Test
- Do not have multiple tests jointly read and write data baked into a shared global fixture.
- Each test (or its setup) creates its own data so it does not interfere with other tests.

```text
// ❌ Forbidden — sharing data pre-built in a global (fragile to order/interference)
GLOBAL.users = [alice, bob]        // created once at module load
test A: GLOBAL.users[0].activate()    // mutates state
test B: assert GLOBAL.users[0].active?  // breaks if A runs first

// ✅ Recommended — create fresh with a factory per test
test A: u = makeUser();  u.activate();  assert ...
test B: u = makeUser();  assert u.inactive?
```

### 2-2. The Generator Fills Defaults, the Test Overrides Only What It Needs
- The data generator provides plausible defaults for every required field.
- The calling test overrides only the fields directly relevant to that test's intent — leaving the rest to defaults.

```text
// ❌ Forbidden — every test specifies all fields (duplication + fragile to irrelevant fields)
makeUser(id=…, name=…, email=…, role="user", createdAt=…, active=true)

// ✅ Recommended — override only meaningful values on top of defaults
makeUser()                       // all defaults
makeUser(role="admin")           // only the value this test cares about
makeAdmin() = makeUser(role="admin")   // name frequently used variants as helpers
```

### 2-3. Fake Data Instead of Sensitive Real Data
- Do not put real names, real emails, phones, addresses, card numbers, etc. into tests.
- Use a fake data generator to make format-conforming fake values. Specify a locale if needed.

```text
// ❌ Forbidden — real personal information
makeUser(name="John Doe", email="real.person@gmail.com")

// ✅ Recommended — generated fake data
makeUser(name=fakeName(locale="ko"), email=fakeEmail())
```

### 2-4. Fixture Tiers: Split Cost by Scope, Isolate Tests
- Create expensive resources (DB engine/schema, app context, etc.) once at a broad scope (suite/session) and reuse them.
- Keep data created by each test at a narrow scope (per-test), and roll back/clean up when done so it does not leak into the next test.

```text
// ✅ Recommended — split scope: expensive things once, data per-test + isolated
fixture(scope=session)  dbEngine:  create schema   → shared by all tests
fixture(scope=test) dbSession: begin transaction → (test) → rollback when done
fixture(scope=test) sampleUser(dbSession): makeUser() then return
```

### 2-5. Fix the Seed for Randomness That Shakes Results
- Where random generation can make verification unstable, fix the seed to make it reproducible.
- But keep data diversity so the same value is not repeated, missing edge cases.

```text
// ❌ Forbidden — values change every run, occasionally failing (flaky)
random.seed = currentTime

// ✅ Recommended — reproducible with a fixed seed
random.seed = 1234
```

### 2-6. Large Data as Files, Paths as Constants
- Keep large inputs (sample JSON/CSV, etc.) as files instead of inlining them in test code.
- Do not scatter that path as a relative path across tests; define it as a constant in one place and reference it.

```text
// ❌ Forbidden — fragile relative paths everywhere
load("../../../fixtures/big.json")

// ✅ Recommended — define as a constant in one place and reference
FIXTURES_DIR = <absolute/root path relative to the project>
load(FIXTURES_DIR + "/big.json")
```

### 2-7. Seed Scripts Idempotently
- Write DB seeds in an "ignore (or update) if present" manner so that running them multiple times reaches the same state without duplicates or errors.
- Do not unconditionally INSERT — re-runs create duplicate keys/duplicate rows.

```text
// ❌ Forbidden — re-run creates duplicates/errors
for name in categories: INSERT category(name)

// ✅ Recommended — idempotent (ignore/update if present)
for name in categories: getOrCreate category(name)
```

## 3. Common Mistakes

Symptoms that appear when you break the rules (§2) — when you see them, go back to the relevant rule.

- **Results change with order** → depends on globally shared data (2-1), or does not clean up traces a test left behind (2-4), polluting the next test.
- **Tests break on irrelevant changes** → specifies all fields every time without defaults (2-2), coupling even to fields you do not care about.
- **Occasional failure (flaky)** → randomness without a fixed seed (2-5) makes values differ each run.
- **Slow** → recreates expensive resources for every test (2-4).
- **Re-runs break** → seed is not idempotent (2-7), creating duplicate keys/duplicate rows.
- **Others** → real data exposure (2-3), large inline + relative path overuse (2-6) are also prevented by their respective rules.

## 4. Checklist
- [ ] Do you create test data inside the test and not depend on shared global state?
- [ ] Does the data generator provide defaults, with the test overriding only what it needs?
- [ ] Do you use fake (generated) data instead of real sensitive data?
- [ ] Are expensive resources created once at a broad scope, with each test's data cleaned up/rolled back when done for isolation?
- [ ] Did you fix the seed for randomness that shakes verification, making it reproducible?
- [ ] Did you keep large data as files and define paths as constants?
- [ ] Do seed scripts operate idempotently?

## Appendix: Per-Stack Examples

> The following are reference implementation examples. Add examples matching the stack your team uses (test runner, fixture tool, fake data library) following the same pattern. The principles/rules in 1–4 above are the standard, and the appendix is merely application cases. The two stack examples are samples showing the same rules, and even if code exists for only one side, the rule applies equally to both.

### Python (factory_boy / Faker)

#### Factory Pattern
Define a Factory with defaults, and override only the values you need in the test.

```python
# tests/factories.py
from factory import Factory, Faker, SubFactory
from factory.alchemy import SQLAlchemyModelFactory
from datetime import datetime

class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session = db.session

    id = Factory.LazyFunction(lambda: str(uuid4()))
    name = Faker("name", locale="ko_KR")
    email = Faker("email")
    role = "user"
    created_at = Factory.LazyFunction(datetime.utcnow)

class OrderFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Order
        sqlalchemy_session = db.session

    user = SubFactory(UserFactory)
    total_amount = Faker("random_int", min=1000, max=100000)
    status = "pending"

# Used in the test
def test_user_can_view_own_orders():
    user = UserFactory.create()
    orders = OrderFactory.create_batch(3, user=user)
    # Override defaults
    special_order = OrderFactory.create(user=user, status="completed", total_amount=50000)
```

#### pytest Fixture Tiers
Split scope (session/function) so expensive resources are created once, and isolate each test with transaction rollback.

```python
# conftest.py — shared fixtures

@pytest.fixture(scope="session")
def db_engine():
    """Created once for the whole session"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(db_engine):
    """Transaction rollback for each test"""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def sample_user(db_session):
    """Create a user for the test"""
    user = UserFactory(session=db_session)
    db_session.flush()
    return user
```

#### Idempotent Seed Script
Write it to ignore if already present, like `get_or_create`, so the result is the same across multiple runs.

```python
# scripts/seed.py
def seed_categories():
    categories = ["Electronics", "Books", "Clothing"]
    for name in categories:
        # Ignore if already present — idempotent
        Category.get_or_create(name=name)

if __name__ == "__main__":
    seed_categories()
    print("Seed completed")
```

### TypeScript / JavaScript (faker-js)

#### Factory Pattern
Spread `overrides` to overwrite only per-test values on top of defaults, and make variants as separate helpers.

```typescript
// tests/factories/user.factory.ts
import { faker } from "@faker-js/faker";

export const createUser = (overrides: Partial<User> = {}): User => ({
  id: faker.string.uuid(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: "user",
  createdAt: new Date(),
  ...overrides,  // per-test override
});

export const createAdmin = () => createUser({ role: "admin" });

// Used in the test
test("an admin can view all users", () => {
  const admin = createAdmin();
  const users = Array.from({ length: 5 }, () => createUser());
  // ...
});
```

#### Fixture Scope · Idempotent Seed (Concept Mapping)

The `pytest fixture` tiers (2-4) and idempotent seed (2-7) from the Python example above apply by the same rules in JS/TS. Only the tools differ:

- **Scope·isolation (2-4)**: prepare expensive resources (DB/container) once with `beforeAll`, and isolate each test with transaction rollback or truncate in `beforeEach`/`afterEach` (common to Vitest/Jest).
- **Idempotent seed (2-7)**: write the seed script with the ORM's upsert (e.g., Prisma `upsert`, TypeORM `save`) to "update/ignore if present" instead of `INSERT`.
