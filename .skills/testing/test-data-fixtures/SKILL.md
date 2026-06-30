---
name: 테스트 데이터 & Fixture 관리
description: 테스트 데이터·픽스처·시드의 범용 표준 — 테스트 내부 생성, 기본값 + 필요한 값만 오버라이드, 가짜 데이터, 픽스처 범위와 테스트 간 격리, 멱등 시드. 테스트 데이터를 생성·공유하거나 DB 시드 스크립트를 작성·정비할 때 읽는다. 스택에 무관하다.
rules:
  - "데이터는 테스트가 소유한다: 미리 채운 공유 전역이 아니라 각 테스트(또는 그 셋업)가 자기 데이터를 만들어, 실행 순서에 흔들리지 않게 한다."
  - "기본값 + 오버라이드: 생성기가 모든 필드에 합리적 기본값을 채우고, 테스트는 의미 있는 값만 덮어쓴다 — 중복과 무관한 필드 결합을 끊는다."
  - "가짜·결정적 데이터: 민감한 실데이터 대신 생성된 가짜 값을 쓰고(보안·규정), 무작위는 시드를 고정해 재현 가능하되 다양성은 유지한다."
  - "격리와 재사용의 균형: 만들기 비싼 자원은 넓은 범위에서 한 번 만들어 재사용하고, 테스트가 만든 데이터는 좁은 범위로 격리해 정리/롤백한다."
  - "무겁거나 반복되는 것은 밖으로: 대용량 입력은 파일 + 경로 상수로 두고, DB 시드는 멱등하게(있으면 무시/갱신) 작성한다."
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

# 🏭 테스트 데이터 & Fixture 관리

> 테스트 데이터를 테스트 안에서 합리적 기본값을 갖춘 팩토리로 만들고, 가짜 데이터를 쓰며, 비용 큰 자원은 범위를 나눠 재사용하되 테스트끼리는 격리하고, 시드는 멱등하게 작성한다. 테스트 데이터를 생성·공유하거나 DB 시드 스크립트를 작성·정비할 때 읽는다. 특정 언어/프레임워크/라이브러리에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **데이터는 테스트가 소유한다**: 미리 채운 공유 전역이 아니라 각 테스트(또는 그 셋업)가 자기 데이터를 만들어, 실행 순서에 흔들리지 않게 한다.
- **기본값 + 오버라이드**: 생성기가 모든 필드에 합리적 기본값을 채우고, 테스트는 의미 있는 값만 덮어쓴다 — 중복과 무관한 필드 결합을 끊는다.
- **가짜·결정적 데이터**: 민감한 실데이터 대신 생성된 가짜 값을 쓰고(보안·규정), 무작위는 시드를 고정해 재현 가능하되 다양성은 유지한다.
- **격리와 재사용의 균형**: 만들기 비싼 자원은 넓은 범위에서 한 번 만들어 재사용하고, 테스트가 만든 데이터는 좁은 범위로 격리해 정리/롤백한다.
- **무겁거나 반복되는 것은 밖으로**: 대용량 입력은 파일 + 경로 상수로 두고, DB 시드는 멱등하게(있으면 무시/갱신) 작성한다.

## 2. 규칙

### 2-1. 테스트 데이터는 팩토리로, 테스트 안에서 생성
- 공유 전역 픽스처에 미리 박아둔 데이터를 여러 테스트가 함께 읽고 쓰지 않는다.
- 각 테스트(또는 그 셋업)가 자기 데이터를 만들어, 다른 테스트와 간섭하지 않게 한다.

```text
// ❌ 금지 — 전역에 미리 만든 데이터를 공유 (순서·간섭에 취약)
GLOBAL.users = [alice, bob]        // 모듈 로드 시 1회 생성
test A: GLOBAL.users[0].활성화()    // 상태를 바꿈
test B: assert GLOBAL.users[0].활성?  // A가 먼저 돌면 깨짐

// ✅ 권장 — 테스트마다 팩토리로 새로 생성
test A: u = makeUser();  u.활성화();  assert ...
test B: u = makeUser();  assert u.비활성?
```

### 2-2. 생성기는 기본값을 채우고, 테스트는 필요한 값만 오버라이드
- 데이터 생성기는 모든 필수 필드에 그럴듯한 기본값을 제공한다.
- 호출하는 테스트는 그 테스트의 의도와 직접 관련된 필드만 덮어쓴다 — 나머지는 기본값에 맡긴다.

```text
// ❌ 금지 — 매 테스트가 전 필드를 지정 (중복 + 무관한 필드에 취약)
makeUser(id=…, name=…, email=…, role="user", createdAt=…, active=true)

// ✅ 권장 — 기본값 위에 의미 있는 값만 오버라이드
makeUser()                       // 전부 기본값
makeUser(role="admin")           // 이 테스트가 신경 쓰는 값만
makeAdmin() = makeUser(role="admin")   // 자주 쓰는 변형은 이름 붙인 헬퍼로
```

### 2-3. 민감한 실데이터 대신 가짜 데이터
- 실명·실제 이메일·전화·주소·카드번호 등을 테스트에 넣지 않는다.
- 가상 데이터 생성기로 형식만 맞는 가짜 값을 만든다. 필요하면 로케일을 지정한다.

```text
// ❌ 금지 — 실제 개인정보
makeUser(name="홍길동", email="real.person@gmail.com")

// ✅ 권장 — 생성된 가짜 데이터
makeUser(name=fakeName(locale="ko"), email=fakeEmail())
```

### 2-4. 픽스처 계층: 범위로 비용을 나누고, 테스트는 격리
- 만들기 비싼 자원(DB 엔진/스키마, 앱 컨텍스트 등)은 넓은 범위(스위트/세션)에서 한 번만 만들어 재사용한다.
- 각 테스트가 만든 데이터는 좁은 범위(테스트별)로 두고, 끝나면 롤백/정리해 다음 테스트로 새지 않게 한다.

```text
// ✅ 권장 — 범위를 나눠: 비싼 건 1회, 데이터는 테스트별 + 격리
fixture(scope=세션)  dbEngine:  스키마 생성   → 모든 테스트가 공유
fixture(scope=테스트) dbSession: 트랜잭션 시작 → (테스트) → 끝나면 롤백
fixture(scope=테스트) sampleUser(dbSession): makeUser() 후 반환
```

### 2-5. 결과를 흔드는 무작위는 시드 고정
- 무작위 생성으로 검증이 불안정해질 수 있는 곳은 시드를 고정해 재현 가능하게 한다.
- 단, 같은 값만 반복되어 엣지 케이스를 못 보는 일이 없도록 데이터 다양성은 유지한다.

```text
// ❌ 금지 — 매 실행마다 값이 달라져 가끔 실패 (flaky)
random.seed = 현재시각

// ✅ 권장 — 시드 고정으로 재현 가능
random.seed = 1234
```

### 2-6. 대용량 데이터는 파일로, 경로는 상수로
- 큰 입력(샘플 JSON/CSV 등)은 테스트 코드에 인라인하지 말고 파일로 둔다.
- 그 경로는 테스트마다 상대 경로로 흩뿌리지 말고 한곳의 상수로 정의해 참조한다.

```text
// ❌ 금지 — 곳곳에 깨지기 쉬운 상대 경로
load("../../../fixtures/big.json")

// ✅ 권장 — 한곳에 상수로 정의해 참조
FIXTURES_DIR = <프로젝트 기준 절대/루트 경로>
load(FIXTURES_DIR + "/big.json")
```

### 2-7. 시드 스크립트는 멱등하게
- DB 시드는 "있으면 무시(또는 갱신)" 방식으로 작성해, 여러 번 실행해도 중복·오류 없이 같은 상태가 되게 한다.
- 무조건 INSERT 하지 않는다 — 재실행 시 중복 키·중복 행을 만든다.

```text
// ❌ 금지 — 재실행하면 중복/오류
for name in 카테고리: INSERT category(name)

// ✅ 권장 — 멱등 (있으면 무시/갱신)
for name in 카테고리: getOrCreate category(name)
```

## 3. 흔한 실수

규칙(§2)을 어겼을 때 나타나는 증상들 — 보이면 해당 규칙으로 돌아간다.

- **순서에 따라 결과가 바뀜** → 전역 공유 데이터에 의존하거나(2-1), 테스트가 남긴 흔적을 정리하지 않아(2-4) 다음 테스트가 오염된다.
- **무관한 변경에 테스트가 깨짐** → 기본값 없이 매번 전 필드를 지정해(2-2) 신경 쓰지 않는 필드까지 결합돼 있다.
- **가끔 실패(flaky)** → 시드 고정 없는 무작위(2-5) 때문에 실행마다 값이 달라진다.
- **느림** → 비싼 자원을 매 테스트마다 재생성한다(2-4).
- **재실행이 깨짐** → 시드가 멱등하지 않아(2-7) 중복 키·중복 행을 만든다.
- **그 외** → 실데이터 노출(2-3), 대용량 인라인 + 상대 경로 남발(2-6)도 각 규칙으로 막는다.

## 4. 체크리스트
- [ ] 테스트 데이터를 테스트 내부에서 생성하고 공유 전역 상태에 의존하지 않는가
- [ ] 데이터 생성기가 기본값을 제공하고, 테스트는 필요한 값만 오버라이드하는가
- [ ] 실제 민감 데이터 대신 가짜(생성된) 데이터를 사용하는가
- [ ] 비싼 자원은 넓은 범위에서 1회 생성하고, 각 테스트 데이터는 끝나면 정리/롤백해 격리하는가
- [ ] 검증을 흔드는 무작위는 시드를 고정해 재현 가능하게 했는가
- [ ] 대용량 데이터를 파일로 두고 경로를 상수로 정의했는가
- [ ] 시드 스크립트가 멱등하게 동작하는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(테스트 러너·픽스처 도구·가짜데이터 라이브러리)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다. 두 스택 예시는 같은 규칙을 보여주는 표본이며, 한쪽에만 코드가 있어도 규칙은 양쪽에 동일하게 적용된다.

### Python (factory_boy / Faker)

#### Factory 패턴
기본값을 갖춘 Factory를 정의하고, 테스트에서 필요한 값만 오버라이드한다.

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

# 테스트에서 사용
def test_user_can_view_own_orders():
    user = UserFactory.create()
    orders = OrderFactory.create_batch(3, user=user)
    # 기본값 오버라이드
    special_order = OrderFactory.create(user=user, status="completed", total_amount=50000)
```

#### pytest Fixture 계층
범위(session/function)를 나눠 비용이 큰 자원은 한 번만 만들고, 각 테스트는 트랜잭션 롤백으로 격리한다.

```python
# conftest.py — 공유 fixture

@pytest.fixture(scope="session")
def db_engine():
    """세션 전체에서 한 번만 생성"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(db_engine):
    """각 테스트마다 트랜잭션 롤백"""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def sample_user(db_session):
    """테스트용 사용자 생성"""
    user = UserFactory(session=db_session)
    db_session.flush()
    return user
```

#### 멱등 시드 스크립트
`get_or_create`처럼 이미 있으면 무시하도록 작성해 여러 번 실행해도 결과가 같게 한다.

```python
# scripts/seed.py
def seed_categories():
    categories = ["Electronics", "Books", "Clothing"]
    for name in categories:
        # 이미 있으면 무시 — 멱등
        Category.get_or_create(name=name)

if __name__ == "__main__":
    seed_categories()
    print("Seed completed")
```

### TypeScript / JavaScript (faker-js)

#### Factory 패턴
`overrides`를 펼쳐 기본값 위에 테스트별 값만 덮어쓰고, 변형은 별도 헬퍼로 만든다.

```typescript
// tests/factories/user.factory.ts
import { faker } from "@faker-js/faker";

export const createUser = (overrides: Partial<User> = {}): User => ({
  id: faker.string.uuid(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: "user",
  createdAt: new Date(),
  ...overrides,  // 테스트별 오버라이드
});

export const createAdmin = () => createUser({ role: "admin" });

// 테스트에서 사용
test("관리자는 모든 사용자를 조회할 수 있다", () => {
  const admin = createAdmin();
  const users = Array.from({ length: 5 }, () => createUser());
  // ...
});
```

#### 픽스처 범위 · 멱등 시드 (개념 매핑)

위 Python 예시의 `pytest fixture` 계층(2-4)과 멱등 시드(2-7)는 JS/TS에서도 같은 규칙으로 적용된다. 도구만 다르다:

- **범위·격리(2-4)**: `beforeAll`로 비싼 자원(DB/컨테이너)을 1회 준비하고, `beforeEach`/`afterEach`에서 각 테스트를 트랜잭션 롤백이나 truncate로 격리한다 (Vitest/Jest 공통).
- **멱등 시드(2-7)**: 시드 스크립트는 `INSERT` 대신 ORM의 upsert(예: Prisma `upsert`, TypeORM `save`)로 "있으면 갱신/무시"하게 작성한다.
