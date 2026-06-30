---
name: 단위 테스트 — 격리·빠름·신뢰
description: 함수·클래스 단위를 외부 의존성으로부터 격리해 빠르고 신뢰할 수 있는 단위 테스트를 쓰는 범용(foundational) 표준 — 1동작 1테스트, FIRST, 경계값·예외, 외부 의존성(시간·HTTP·DB·파일) 격리, 파라미터화. 단위 테스트를 새로 쓰거나 외부 의존성·시간·경계값을 어떻게 다룰지 정할 때 읽는다(단위/통합/E2E 범위 선택은 test-strategy). 특정 언어/도구에 무관하다.
rules:
  - "1동작 1테스트: 테스트 1개는 하나의 동작(논리 흐름·결과)만 검증한다 — 한 동작을 확인하는 어서션 여러 개는 괜찮다. 케이스가 다르면 나눈다."
  - "외부와 비결정 요소를 격리한다: DB·HTTP·파일·시간·랜덤처럼 단위 바깥에 있는 것은 테스트 더블로 대체해, 결과가 외부 환경·실행 순서·현재 시각에 흔들리지 않게(결정적) 한다."
  - "정상만이 아니라 경계·예외까지: 경계값(0·최소·최대·null·빈 컬렉션)과 실패 경로를 함께 본다."
  - "자동 판정 + 좋은 실패 메시지: 눈으로 비교하지 않아도 성공/실패가 자동으로 갈리고, 실패 시 무엇이 왜 틀렸는지 드러난다."
  - "테스트도 프로덕션 품질로: 반복 준비는 공통 fixture/helper로, 입력만 다른 케이스는 파라미터화로 묶는다."
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

# 🔬 단위 테스트 — 격리·빠름·신뢰

> 함수·클래스 단위를 외부 의존성으로부터 격리해, 빠르고 언제든 동일한 결과를 내는 신뢰할 수 있는 테스트를 만든다. 단위 테스트를 새로 작성하거나 외부 의존성·시간·경계값을 어떻게 다룰지 정할 때 읽는다. 특정 언어/테스트 도구에 종속되지 않는 범용 표준이다. (무엇을 단위/통합/E2E 중 무엇으로 검증할지 범위 결정은 test-strategy 참고)

## 1. 핵심 원칙
- **1동작 1테스트**: 테스트 1개는 하나의 동작(논리 흐름·결과)만 검증한다 — 한 동작을 확인하는 어서션 여러 개는 괜찮다. 케이스가 다르면 나눈다.
- **외부와 비결정 요소를 격리한다**: DB·HTTP·파일·시간·랜덤처럼 단위 바깥에 있는 것은 테스트 더블로 대체해, 결과가 외부 환경·실행 순서·현재 시각에 흔들리지 않게(결정적) 한다.
- **정상만이 아니라 경계·예외까지**: 경계값(0·최소·최대·null·빈 컬렉션)과 실패 경로를 함께 본다.
- **자동 판정 + 좋은 실패 메시지**: 눈으로 비교하지 않아도 성공/실패가 자동으로 갈리고, 실패 시 무엇이 왜 틀렸는지 드러난다.
- **테스트도 프로덕션 품질로**: 반복 준비는 공통 fixture/helper로, 입력만 다른 케이스는 파라미터화로 묶는다.

## 2. 규칙

### 2-1. 좋은 단위 테스트의 특성 (FIRST)

| 특성 | 의미 |
|------|------|
| **F**ast | 밀리초 단위로 실행 (DB·네트워크 없음) |
| **I**solated | 다른 테스트와 독립적 (공유 상태·실행 순서에 무관) |
| **R**epeatable | 언제 어디서든 동일 결과 |
| **S**elf-validating | 자동으로 성공/실패 판단 |
| **T**imely | 프로덕션 코드 작성 전후 적시에 작성 |

### 2-2. 한 테스트는 한 동작만 검증한다
- 케이스(정상·경계·예외)가 다르면 테스트를 나눈다. 한 테스트에 여러 동작을 욱여넣지 않는다.
- 테스트 이름만 보고도 "무엇을 보장하는지" 읽히게 한다.

```text
// ❌ 금지 — 한 테스트가 여러 동작을 한꺼번에 검증 (실패 시 원인 모호)
test("discount"):
  assert discount(10000, member=true)  == 9000
  assert discount(0,     member=true)  == 0
  assert discount(10000, member=false) == 10000

// ✅ 권장 — 동작마다 별도 테스트, 이름으로 의도가 드러남
test("회원은 10% 할인"):        assert discount(10000, member=true)  == 9000
test("가격 0이면 0"):           assert discount(0,     member=true)  == 0
test("비회원은 할인 없음"):     assert discount(10000, member=false) == 10000
```

### 2-3. 경계값과 예외 경로를 반드시 검증한다
- 정상 케이스만 보지 말고 경계(0, 최소·최대, null/없음, 빈 컬렉션)와 실패·예외를 함께 본다.
- 예외는 "던져지는지"뿐 아니라 "올바른 종류/사유로 던져지는지"까지 검증한다.

```text
// ❌ 금지 — 정상 경로 한 줄만 검증, 경계·예외는 방치
test("정상가 할인만 확인")

// ✅ 권장 — 경계·예외까지 케이스로 분리해 검증
test("경계: 가격 0 → 0")
test("예외: 음수 가격 → '가격은 0 이상' 오류를 던진다")
test("경계: 빈 장바구니 → 합계 0")
```

### 2-4. 외부 의존성은 테스트 더블로 격리한다
- DB·HTTP·파일시스템·메시지큐 등 단위 바깥 자원은 실제로 호출하지 말고 Mock/Stub/Fake로 대체한다.
- 단위가 협력자에게 "무엇을 어떻게 요청했는지"(상호작용)와 "응답을 어떻게 처리하는지"를 검증한다.

```text
// ❌ 금지 — 실제 외부 시스템을 때려서 느리고 불안정
test("프로필 조회"):
  result = userApi.fetchProfile("u1")   // 실서버 HTTP 호출 → 네트워크에 의존
  assert result.name == "홍길동"

// ✅ 권장 — 협력자를 더블로 대체, 단위 로직만 검증
test("프로필 조회"):
  httpClient.get = stub(returns { id:"u1", name:"홍길동" })
  result = userApi.fetchProfile("u1")
  assert result.name == "홍길동"
```

### 2-5. 시간·랜덤 등 비결정 요소를 고정한다
- "현재 시각"·난수·UUID처럼 호출할 때마다 달라지는 값은 테스트 더블/페이크로 고정해 결정적으로 만든다.
- 코드가 시계·난수원을 직접 부르지 말고 주입받게 설계하면 고정하기 쉽다.

```text
// ❌ 금지 — 실제 현재 시각에 의존 → 토요일에만 통과/실패
test("주말 여부"):
  assert isWeekend() == true     // 오늘이 토요일일 때만 맞음

// ✅ 권장 — 시간을 고정해 결과를 결정적으로
test("토요일은 주말이다"):
  clock.fixTo("2026-06-14")      // 토요일로 고정
  assert isWeekend() == true
```

### 2-6. 중복은 파라미터화·fixture로 제거한다
- 입력만 다르고 검증 구조가 같은 케이스는 표(데이터)로 묶어 파라미터화한다.
- 반복되는 준비(setup)는 공통 fixture/helper로 추출하되, 테스트의 의도가 가려지지 않을 만큼만 공유한다.

```text
// ❌ 금지 — 같은 검증을 입력만 바꿔 복붙
test("a@b.com 유효"):     assert isValidEmail("a@b.com") == true
test("invalid 무효"):     assert isValidEmail("invalid") == false
test("@no.com 무효"):     assert isValidEmail("@no.com") == false

// ✅ 권장 — 케이스를 데이터로 묶어 한 테스트로
test_each([
  ("a@b.com", true),
  ("invalid", false),
  ("@no.com", false),
  ("",        false),
])("이메일 검증", (input, expected):
  assert isValidEmail(input) == expected
)
```

## 3. 흔한 실수

규칙(§2)을 어겼을 때 나타나는 증상들 — 보이면 해당 규칙으로 돌아간다.

- **실패해도 원인을 못 짚음** → 한 테스트에 여러 동작을 묶어(2-2) 무엇이 깨졌는지 모호하거나, 실패 메시지가 "expected true, got false"뿐이다(자동 판정·메시지 부재).
- **프로덕션에서만 터짐** → 정상 경로만 검증하고 경계·예외(2-3)를 방치했다.
- **가끔/특정 환경에서만 깨짐(flaky)** → 외부 의존성을 실제 호출하거나(2-4), 현재 시각·난수에 의존하거나(2-5), 테스트 간 상태를 공유해 실행 순서를 탄다(isolation).
- **테스트가 부풀고 깨지기 쉬움** → 입력만 다른 케이스를 복붙한다(2-6).

## 4. 체크리스트
- [ ] 테스트 1개가 하나의 동작만 검증하는가 (이름으로 의도가 읽히는가)
- [ ] 경계값(0·최소·최대·null/없음·빈 컬렉션)과 예외 경로를 검증했는가
- [ ] 외부 의존성(DB·HTTP·파일시스템·시간·랜덤)을 테스트 더블로 격리했는가
- [ ] 시간·난수 등 비결정 요소를 고정해 결정적(repeatable)으로 만들었는가
- [ ] 테스트 간 상태를 공유하지 않아 실행 순서에 무관한가 (isolated)
- [ ] 성공/실패가 자동 판정되고(self-validating), 실패 메시지로 원인을 알 수 있는가
- [ ] 중복 케이스를 파라미터화로, 반복 준비를 공통 fixture/helper로 추출했는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(테스트 러너·모킹 라이브러리)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Python (pytest)

경계·예외(2-3):

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

시간 격리(2-5, `unittest.mock.patch`):

```python
from unittest.mock import patch
from datetime import datetime, date

def test_is_weekend_saturday():
    with patch("app.services.datetime") as mock_dt:
        mock_dt.today.return_value = date(2026, 6, 14)  # 토요일
        assert is_weekend() is True
```

HTTP 격리(2-4, `AsyncMock`):

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

파라미터화(2-6, `@pytest.mark.parametrize`):

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

### JS (Jest 등)

시간 격리(2-5, fake timer):

```javascript
// Jest — 시스템 시간 모킹
beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-14") });
});
afterEach(() => jest.useRealTimers());
```
