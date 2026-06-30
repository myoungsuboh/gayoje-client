---
name: Test Strategy & Pyramid
description: A standard for a balanced test strategy based on the test pyramid (Unit→Integration→E2E). Read this when deciding the team's way of writing tests, or how much of which test to put on a new feature. Keywords: test, describe, it(, expect, mock, assert, beforeEach, afterEach, given, test pyramid, Given-When-Then.
rules:
  - "Follow the test pyramid — unit tests (70%) are the most, then integration tests (20%), then E2E (10%)."
  - "Write tests in the Given-When-Then (Arrange-Act-Assert) pattern to make the intent clear."
  - "Write test names as clear descriptive statements that include 'what is being tested' and 'under what condition'."
  - "Tests must be independent of one another and not depend on execution order or the state of other tests."
  - "Isolate external dependencies (DB·API·filesystem) with Mock·Stub in unit tests, and use real dependencies in integration tests."
tags:
  - "test"
  - "describe"
  - "it("
  - "expect"
  - "mock"
  - "assert"
  - "beforeEach"
  - "afterEach"
  - "given"
  - "테스트 피라미드"
  - "Given-When-Then"
foundational: true
---

# 🧪 Test Strategy & Pyramid

> Write balanced tests based on the test pyramid. Read this when deciding the team's way of writing tests, or how much of which test to put on a new feature.

## 1. Core Principles
- Follow the test pyramid — unit tests (70%) are the most, then integration tests (20%), then E2E (10%).
- Write tests in the Given-When-Then (Arrange-Act-Assert) pattern to make the intent clear.
- Write test names as clear descriptive statements that include 'what is being tested' and 'under what condition'.
- Tests must be independent of one another and not depend on execution order or the state of other tests.
- Isolate external dependencies (DB·API·filesystem) with Mock·Stub in unit tests, and use real dependencies in integration tests.

## 2. Rules

### 2-1. Test Pyramid (Arranged by Ratio)

```
          ┌──────────┐
          │   E2E    │  10% — full flow of user scenarios
          │(Playwright│
          └──────────┘
        ┌────────────────┐
        │  Integration   │  20% — integration between components, DB integration
        │   Tests        │
        └────────────────┘
    ┌─────────────────────────┐
    │      Unit Tests         │  70% — isolated verification at function/class unit
    │    (fast·independent·many)     │
    └─────────────────────────┘
```

### 2-2. Given-When-Then Pattern

```python
# Python
class TestUserService:
    def test_create_user_success(self, mock_db, mock_email):
        # Given — test preconditions
        request = CreateUserRequest(name="홍길동", email="hong@example.com")
        mock_db.save.return_value = User(id="u1", **request.dict())

        # When — execute the test target
        result = user_service.create(request)

        # Then — verify the expected result
        assert result.id == "u1"
        assert result.name == "홍길동"
        mock_email.send_welcome.assert_called_once_with("hong@example.com")
```

```javascript
// JavaScript (Vitest/Jest)
describe("UserService", () => {
  describe("create()", () => {
    it("유효한 이메일로 사용자 생성 시 id를 반환한다", async () => {
      // Given
      const request = { name: "홍길동", email: "hong@example.com" };
      mockDb.save.mockResolvedValue({ id: "u1", ...request });

      // When
      const result = await userService.create(request);

      // Then
      expect(result.id).toBe("u1");
      expect(mockEmail.sendWelcome).toHaveBeenCalledWith("hong@example.com");
    });
  });
});
```

### 2-3. Test Isolation (No Shared State)

```python
# Each test is independent — no shared state
@pytest.fixture(autouse=True)
def reset_db():
    # initialize before test
    yield
    db.rollback()  # rollback after test
```

### 2-4. Mock vs Stub vs Fake (Choosing the Dependency Isolation Method)

| Type | Use | Example |
|------|------|------|
| Mock | Verify calls | `mockEmail.assert_called_once()` |
| Stub | Fixed return value | `mockDb.find.return_value = user` |
| Fake | Behaves like the real thing | in-memory DB |
| Spy | Real call + observe | `jest.spyOn(obj, 'method')` |

## 3. Common Mistakes
- ❌ Inverted pyramid (too much E2E) → slow and brittle, a maintenance burden. Center on unit tests.
- ❌ Tests coupled to implementation details → break on every refactor. Verify public behavior·contracts.
- ❌ Chasing only the coverage number → mass-producing "just-passing" tests with no assertions. Put meaningful assertions.
- ❌ Shared state between tests → execution-order dependence·flaky. Guarantee independence with isolation·rollback.
- ❌ Calling external dependencies (DB·API) for real in unit tests → slow and unstable. Isolate with Mock/Stub.
- ❌ Testing only the happy path → also verify errors·boundary values·null·concurrency.
- ❌ No assertion messages·clear test names → slow to pinpoint the cause on failure.

## 4. Checklist
- [ ] Is the unit/integration/E2E ratio close to the pyramid (70/20/10)?
- [ ] Does each test reveal its intent with Given-When-Then?
- [ ] Does the test name capture 'what·under what condition'?
- [ ] Are tests independent of execution order·other tests' state?
- [ ] Did you isolate unit tests' external dependencies with Mock·Stub?
