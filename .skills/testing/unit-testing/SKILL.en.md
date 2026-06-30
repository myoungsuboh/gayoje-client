---
name: Unit Testing — Isolated · Fast · Reliable
description: A foundational, language- and tool-agnostic standard for writing fast, reliable unit tests that isolate functions and classes from external dependencies — one behavior per test, FIRST, boundary values and exceptions, isolation of external dependencies (time·HTTP·DB·file), parameterization. Read this when writing new unit tests or deciding how to handle external dependencies, time, or boundary values (for choosing unit/integration/E2E scope, see test-strategy). Independent of any specific language or tool.
rules:
  - "One behavior per test: a single test verifies only one behavior (logic flow·result) — multiple assertions that confirm a single behavior are fine. If the case differs, split it."
  - "Isolate external and nondeterministic factors: replace anything outside the unit — DB·HTTP·file·time·random — with test doubles so the result does not waver (stays deterministic) with the external environment, execution order, or current time."
  - "Not just the happy path, but boundaries and exceptions too: examine boundary values (0·min·max·null·empty collection) together with failure paths."
  - "Automatic verdict + good failure messages: success/failure is decided automatically without eyeballing, and on failure it reveals what went wrong and why."
  - "Tests at production quality too: extract repeated setup into shared fixtures/helpers, and group cases that differ only in input via parameterization."
tags:
  - "jest"
  - "vitest"
  - "pytest"
  - "unittest"
  - "mock"
  - "spy"
  - "assert"
  - "toBe"
  - "toEqual"
  - "@Test"
  - "JUnit"
foundational: true
---

# 🔬 Unit Testing — Isolated · Fast · Reliable

> Isolate functions and classes from external dependencies to build reliable tests that run fast and always produce the same result. Read this when writing new unit tests or deciding how to handle external dependencies, time, or boundary values. It is a universal standard not tied to any specific language or testing tool. (For deciding the scope of what to verify with unit/integration/E2E, see test-strategy)

## 1. Core Principles
- **One behavior per test**: a single test verifies only one behavior (logic flow·result) — multiple assertions that confirm a single behavior are fine. If the case differs, split it.
- **Isolate external and nondeterministic factors**: replace anything outside the unit — DB·HTTP·file·time·random — with test doubles so the result does not waver (stays deterministic) with the external environment, execution order, or current time.
- **Not just the happy path, but boundaries and exceptions too**: examine boundary values (0·min·max·null·empty collection) together with failure paths.
- **Automatic verdict + good failure messages**: success/failure is decided automatically without eyeballing, and on failure it reveals what went wrong and why.
- **Tests at production quality too**: extract repeated setup into shared fixtures/helpers, and group cases that differ only in input via parameterization.

## 2. Rules

### 2-1. Characteristics of a good unit test (FIRST)

| Characteristic | Meaning |
|------|------|
| **F**ast | Runs in milliseconds (no DB·network) |
| **I**solated | Independent of other tests (unaffected by shared state·execution order) |
| **R**epeatable | Same result anytime, anywhere |
| **S**elf-validating | Judges success/failure automatically |
| **T**imely | Written at the right time, before or after production code |

### 2-2. One test verifies only one behavior
- If the case (normal·boundary·exception) differs, split the test. Do not cram multiple behaviors into one test.
- Make it readable from the test name alone "what it guarantees."

```text
// ❌ Forbidden — one test verifies several behaviors at once (cause is ambiguous on failure)
test("discount"):
  assert discount(10000, member=true)  == 9000
  assert discount(0,     member=true)  == 0
  assert discount(10000, member=false) == 10000

// ✅ Recommended — a separate test per behavior, intent revealed by the name
test("members get 10% off"):       assert discount(10000, member=true)  == 9000
test("price 0 yields 0"):          assert discount(0,     member=true)  == 0
test("non-members get no discount"): assert discount(10000, member=false) == 10000
```

### 2-3. Always verify boundary values and exception paths
- Don't look only at normal cases; examine boundaries (0, min·max, null/absent, empty collection) together with failures·exceptions.
- For exceptions, verify not only "that it is thrown" but also "that it is thrown with the correct kind/reason."

```text
// ❌ Forbidden — verifies only one line of the normal path, leaving boundaries·exceptions neglected
test("verify normal-price discount only")

// ✅ Recommended — separate boundaries·exceptions into their own cases and verify them
test("boundary: price 0 → 0")
test("exception: negative price → throws a 'price must be 0 or more' error")
test("boundary: empty cart → total 0")
```

### 2-4. Isolate external dependencies with test doubles
- Resources outside the unit such as DB·HTTP·filesystem·message queue should not be called for real; replace them with Mock/Stub/Fake.
- Verify "what and how the unit requested" from collaborators (interaction) and "how it handles the response."

```text
// ❌ Forbidden — hits a real external system, making it slow and unstable
test("fetch profile"):
  result = userApi.fetchProfile("u1")   // real-server HTTP call → depends on the network
  assert result.name == "Hong Gil-dong"

// ✅ Recommended — replace the collaborator with a double, verify only the unit logic
test("fetch profile"):
  httpClient.get = stub(returns { id:"u1", name:"Hong Gil-dong" })
  result = userApi.fetchProfile("u1")
  assert result.name == "Hong Gil-dong"
```

### 2-5. Pin down nondeterministic factors like time·random
- Values that change on every call — "current time"·random numbers·UUID — should be pinned with test doubles/fakes to make them deterministic.
- It becomes easy to pin if you design the code to receive the clock·random source by injection rather than calling them directly.

```text
// ❌ Forbidden — depends on the real current time → passes/fails only on Saturday
test("is it weekend"):
  assert isWeekend() == true     // correct only when today is Saturday

// ✅ Recommended — pin the time to make the result deterministic
test("Saturday is a weekend"):
  clock.fixTo("2026-06-14")      // pinned to Saturday
  assert isWeekend() == true
```

### 2-6. Eliminate duplication with parameterization·fixtures
- Cases that differ only in input but share the same verification structure should be grouped into a table (data) and parameterized.
- Extract repeated setup into shared fixtures/helpers, but share only as much as does not obscure the test's intent.

```text
// ❌ Forbidden — copy-pasting the same verification with only the input changed
test("a@b.com valid"):    assert isValidEmail("a@b.com") == true
test("invalid invalid"):  assert isValidEmail("invalid") == false
test("@no.com invalid"):  assert isValidEmail("@no.com") == false

// ✅ Recommended — group cases as data into one test
test_each([
  ("a@b.com", true),
  ("invalid", false),
  ("@no.com", false),
  ("",        false),
])("email validation", (input, expected):
  assert isValidEmail(input) == expected
)
```

## 3. Common Mistakes

Symptoms that appear when rules (§2) are broken — when you see them, return to the corresponding rule.

- **Can't pinpoint the cause even on failure** → multiple behaviors are bundled into one test (2-2) so it's ambiguous what broke, or the failure message is only "expected true, got false" (absence of automatic verdict·message).
- **Blows up only in production** → only the normal path is verified, leaving boundaries·exceptions (2-3) neglected.
- **Breaks only sometimes/in specific environments (flaky)** → calls external dependencies for real (2-4), depends on the current time·random (2-5), or shares state between tests and rides on execution order (isolation).
- **Tests bloat and are fragile** → cases differing only in input are copy-pasted (2-6).

## 4. Checklist
- [ ] Does a single test verify only one behavior (is the intent readable from the name)
- [ ] Did you verify boundary values (0·min·max·null/absent·empty collection) and exception paths
- [ ] Did you isolate external dependencies (DB·HTTP·filesystem·time·random) with test doubles
- [ ] Did you pin nondeterministic factors like time·random to make them deterministic (repeatable)
- [ ] Is it independent of execution order by not sharing state between tests (isolated)
- [ ] Is success/failure judged automatically (self-validating), and can you tell the cause from the failure message
- [ ] Did you extract duplicate cases into parameterization, and repeated setup into shared fixtures/helpers

## Appendix: Examples by Stack

> Below are reference implementation examples. Add examples matching your team's stack (test runner·mocking library) in the same pattern. The principles·rules of 1–4 above are the standard; the appendix is merely an application thereof.

### Python (pytest)

Boundaries·exceptions (2-3):

```python
class TestCalculateDiscount:
    # 정상 케이스
    def test_10percent_for_membership(self):
        assert calculate_discount(price=10000, is_member=True) == 9000

    # 경계값
    def test_zero_price_returns_zero(self):
        assert calculate_discount(price=0, is_member=True) == 0

    def test_negative_price_raises_error(self):
        with pytest.raises(ValueError, match="가격은 0 이상이어야 합니다"):
            calculate_discount(price=-100, is_member=True)

    # 예외 케이스
    def test_non_member_no_discount(self):
        assert calculate_discount(price=10000, is_member=False) == 10000
```

Time isolation (2-5, `unittest.mock.patch`):

```python
from unittest.mock import patch
from datetime import datetime, date

def test_is_weekend_saturday():
    with patch("app.services.datetime") as mock_dt:
        mock_dt.today.return_value = date(2026, 6, 14)  # 토요일
        assert is_weekend() is True
```

HTTP isolation (2-4, `AsyncMock`):

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_fetch_user_profile():
    mock_response = AsyncMock()
    mock_response.json = AsyncMock(return_value={"id": "u1", "name": "홍길동"})

    with patch("httpx.AsyncClient.get", return_value=mock_response):
        result = await user_api.fetch_profile("u1")

    assert result.name == "홍길동"
```

Parameterization (2-6, `@pytest.mark.parametrize`):

```python
@pytest.mark.parametrize("input,expected", [
    ("hello@email.com", True),
    ("invalid-email", False),
    ("@nodomain.com", False),
    ("", False),
])
def test_email_validation(input, expected):
    assert is_valid_email(input) == expected
```

### JS (Jest etc.)

Time isolation (2-5, fake timer):

```javascript
// Jest — 시스템 시간 모킹
beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-14") });
});
afterEach(() => jest.useRealTimers());
```
