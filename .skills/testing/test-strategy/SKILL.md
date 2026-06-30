---
name: 테스트 전략 & 피라미드
description: 테스트 피라미드(Unit→Integration→E2E) 기반의 균형 잡힌 테스트 전략 표준. 팀의 테스트 작성 방식을 정하거나 새 기능에 어떤 테스트를 얼마나 둘지 결정할 때 읽는다. 키워드: test, describe, it(, expect, mock, assert, beforeEach, afterEach, given, 테스트 피라미드, Given-When-Then.
rules:
  - "테스트 피라미드를 따른다 — 단위 테스트(70%)가 가장 많고, 통합 테스트(20%), E2E(10%) 순으로 구성한다."
  - "테스트는 Given-When-Then(Arrange-Act-Assert) 패턴으로 작성해 의도를 명확히 한다."
  - "테스트 이름은 '무엇을 테스트하는지'와 '어떤 조건에서'를 포함하는 명확한 설명문으로 작성한다."
  - "테스트는 서로 독립적이어야 하며, 실행 순서나 다른 테스트의 상태에 의존하지 않는다."
  - "외부 의존성(DB·API·파일시스템)은 단위 테스트에서 Mock·Stub으로 격리하고, 통합 테스트에서는 실제 의존성을 사용한다."
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

# 🧪 테스트 전략 & 피라미드

> 테스트 피라미드 기반으로 균형 잡힌 테스트를 작성한다. 팀의 테스트 작성 방식을 정하거나 새 기능에 어떤 테스트를 얼마나 둘지 결정할 때 읽는다.

## 1. 핵심 원칙
- 테스트 피라미드를 따른다 — 단위 테스트(70%)가 가장 많고, 통합 테스트(20%), E2E(10%) 순으로 구성한다.
- 테스트는 Given-When-Then(Arrange-Act-Assert) 패턴으로 작성해 의도를 명확히 한다.
- 테스트 이름은 '무엇을 테스트하는지'와 '어떤 조건에서'를 포함하는 명확한 설명문으로 작성한다.
- 테스트는 서로 독립적이어야 하며, 실행 순서나 다른 테스트의 상태에 의존하지 않는다.
- 외부 의존성(DB·API·파일시스템)은 단위 테스트에서 Mock·Stub으로 격리하고, 통합 테스트에서는 실제 의존성을 사용한다.

## 2. 규칙

### 2-1. 테스트 피라미드 (비율로 배치)

```
          ┌──────────┐
          │   E2E    │  10% — 사용자 시나리오 전체 흐름
          │(Playwright│
          └──────────┘
        ┌────────────────┐
        │  Integration   │  20% — 컴포넌트 간 통합, DB 연동
        │   Tests        │
        └────────────────┘
    ┌─────────────────────────┐
    │      Unit Tests         │  70% — 함수/클래스 단위 격리 검증
    │    (빠름·독립적·많음)     │
    └─────────────────────────┘
```

### 2-2. Given-When-Then 패턴

```python
# Python
class TestUserService:
    def test_create_user_success(self, mock_db, mock_email):
        # Given — 테스트 전제 조건
        request = CreateUserRequest(name="홍길동", email="hong@example.com")
        mock_db.save.return_value = User(id="u1", **request.dict())

        # When — 테스트 대상 실행
        result = user_service.create(request)

        # Then — 기대 결과 검증
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

### 2-3. 테스트 격리 (공유 상태 없음)

```python
# 각 테스트는 독립 — 공유 상태 없음
@pytest.fixture(autouse=True)
def reset_db():
    # 테스트 전 초기화
    yield
    db.rollback()  # 테스트 후 롤백
```

### 2-4. Mock vs Stub vs Fake (의존성 격리 방식 선택)

| 유형 | 용도 | 예시 |
|------|------|------|
| Mock | 호출 검증 | `mockEmail.assert_called_once()` |
| Stub | 고정 반환값 | `mockDb.find.return_value = user` |
| Fake | 실제처럼 동작 | 인메모리 DB |
| Spy | 실제 호출 + 관찰 | `jest.spyOn(obj, 'method')` |

## 3. 흔한 실수
- ❌ 피라미드 역전(E2E 과다) → 느리고 깨지기 쉬워 유지보수 부담. 단위 테스트 중심으로.
- ❌ 구현 세부에 결합된 테스트 → 리팩터링마다 깨짐. 공개 동작·계약을 검증한다.
- ❌ 커버리지 수치만 추구 → assertion 없는 "통과만 하는" 테스트 양산. 의미 있는 단언을 둔다.
- ❌ 테스트 간 공유 상태 → 실행 순서 의존·플래키. 격리·롤백으로 독립을 보장한다.
- ❌ 단위 테스트에서 외부 의존성(DB·API)을 실제 호출 → 느리고 불안정. Mock/Stub으로 격리.
- ❌ 행복 경로만 테스트 → 에러·경계값·null·동시성을 함께 검증한다.
- ❌ 단언 메시지·명확한 테스트명 없음 → 실패 시 원인 파악이 느려진다.

## 4. 체크리스트
- [ ] 단위/통합/E2E 비율이 피라미드(70/20/10)에 가깝게 구성되었는가
- [ ] 각 테스트가 Given-When-Then으로 의도를 드러내는가
- [ ] 테스트 이름에 '무엇을·어떤 조건에서'가 담겼는가
- [ ] 테스트가 실행 순서·다른 테스트 상태에 의존하지 않는가
- [ ] 단위 테스트의 외부 의존성을 Mock·Stub으로 격리했는가
