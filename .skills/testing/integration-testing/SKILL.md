---
name: 통합 테스트 — DB·API·컴포넌트 연동
description: 실제 DB·외부 서비스·API를 포함한 컴포넌트 간 협력을 검증하는 범용 통합 테스트 표준 — 테스트 전용 의존성, 테스트 간 격리(초기화·정리), 계약(스키마·상태·헤더) 검증, 외부 서비스 샌드박스화, CI 재현성. API 계약·DB 연동·외부 서비스 연동을 테스트하거나 CI에서 의존 서비스를 띄워 검증할 때 읽는다. 특정 언어/프레임워크/도구에 무관하다.
rules:
  - "프로덕션을 건드리지 않는다: 테스트 전용 DB·큐·캐시·버킷만 쓰고, 실제 프로덕션 데이터에 연결하지 않는다."
  - "테스트 간 격리: 각 테스트는 알려진 상태에서 시작하고 끝나면 흔적을 지운다(롤백/정리) — 실행 순서와 무관하게 같은 결과가 나와야 한다."
  - "구현이 아니라 계약을 본다: 진짜 요청을 보내 외부에서 관찰 가능한 계약(스키마·상태/오류 코드·헤더·페이로드)을 검증한다."
  - "외부 부수효과는 대역으로: 결제·메일·SMS 등은 샌드박스/가짜 서버로 대체해 진짜 과금·발송·외부 변경을 일으키지 않는다."
  - "결정적이고 재현 가능하게: 시간·랜덤·타이밍·순서에 의존하지 않고(비동기는 완료를 기다린 뒤 단언), 의존 서비스를 코드로 띄워 로컬과 CI가 같게 한다."
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

# 🔗 통합 테스트 — DB·API·컴포넌트 연동

> 단위 테스트가 한 단위를 격리해 검증한다면, 통합 테스트는 실제 DB·외부 서비스·API를 포함한 **컴포넌트 간 협력**을 검증한다. API 계약이나 DB 연동을 테스트하고, CI에서 의존 서비스를 재현 가능하게 띄울 때 읽는다. 특정 언어/프레임워크/테스트 도구에 종속되지 않는 범용 표준이다. 입력값 검증 자체는 `입력값 검증 표준`을 따른다.

## 1. 핵심 원칙
- **프로덕션을 건드리지 않는다**: 테스트 전용 DB·큐·캐시·버킷만 쓰고, 실제 프로덕션 데이터에 연결하지 않는다.
- **테스트 간 격리**: 각 테스트는 알려진 상태에서 시작하고 끝나면 흔적을 지운다(롤백/정리) — 실행 순서와 무관하게 같은 결과가 나와야 한다.
- **구현이 아니라 계약을 본다**: 진짜 요청을 보내 외부에서 관찰 가능한 계약(스키마·상태/오류 코드·헤더·페이로드)을 검증한다.
- **외부 부수효과는 대역으로**: 결제·메일·SMS 등은 샌드박스/가짜 서버로 대체해 진짜 과금·발송·외부 변경을 일으키지 않는다.
- **결정적이고 재현 가능하게**: 시간·랜덤·타이밍·순서에 의존하지 않고(비동기는 완료를 기다린 뒤 단언), 의존 서비스를 코드로 띄워 로컬과 CI가 같게 한다.

## 2. 규칙

### 2-1. 프로덕션이 아닌 테스트 전용 의존성을 쓴다
- DB/큐/캐시/스토리지는 테스트 환경에서 격리된 인스턴스(인메모리 또는 컨테이너)를 가리키게 한다.
- 접속 정보는 환경별 설정으로 주입하고, 프로덕션 접속 정보가 테스트 경로로 새지 않게 한다.

```text
// ❌ 금지 — 프로덕션 DB로 통합 테스트
connect(PROD_DATABASE_URL); runTests()      // 데이터 오염·사고

// ✅ 권장 — 테스트 전용 격리 인스턴스
connect(TEST_DATABASE_URL); runTests()      // 인메모리 또는 컨테이너
```

### 2-2. 테스트 간 격리 — 시작 상태 보장, 끝나면 정리
- 각 테스트(또는 케이스 묶음) 전에 스키마/데이터를 알려진 상태로 만들고, 후에 롤백하거나 비운다.
- 격리 전략(매 테스트 트랜잭션 롤백 / 테이블 truncate / 매번 재생성)은 택1하되 일관되게 적용한다.
- 공용 가변 상태를 테스트끼리 공유하지 않는다 — 순서 의존이 생긴다.

```text
// ❌ 금지 — 정리 없이 데이터가 쌓임 → 순서에 따라 결과가 달라짐
test A: insert X
test B: count == 1   // A가 먼저 돌면 깨짐

// ✅ 권장 — 각 테스트가 격리됨
beforeEach: reset to known state
afterEach:  rollback / cleanup
```

### 2-3. API 통합은 진짜 요청으로 계약을 검증한다
- 핸들러 함수를 직접 호출하지 말고, 실제 HTTP 경로(라우팅·직렬화·검증·미들웨어 포함)를 태운 요청을 보낸다.
- 상태/오류 코드, 응답 스키마, 핵심 헤더를 단언한다. 쓰기 후에는 다시 읽어 실제로 반영됐는지 확인한다.

```text
// ❌ 금지 — 내부 함수 직접 호출(직렬화·라우팅·검증을 건너뜀)
result = controller.create(obj); assert result.ok

// ✅ 권장 — 실제 요청 → 상태·스키마·왕복 검증
res = POST /users {name, email}
assert res.status == 201
id = res.body.id
got = GET /users/{id}
assert got.status == 200 and got.body.name == name
```

### 2-4. 컴포넌트(UI 등) 통합은 외부 호출을 대역으로 막고 비동기 완료 후 단언한다
- UI/뷰 통합 테스트는 컴포넌트를 실제로 렌더링/마운트하되, 바깥으로 나가는 네트워크 호출은 가짜 응답으로 가로챈다.
- 비동기 데이터 로딩이 끝난 뒤(명시적 대기) 화면에 반영된 결과를 검증한다.

```text
// ✅ 권장 — 외부 호출 가로채기 + 비동기 완료 대기 후 단언
mockNetwork(GET /user/u1 → {name: "..."})
render(Profile, {userId: "u1"})
awaitAsyncSettled()              // 비동기 처리 완료를 기다림
assert screen.contains("...")
```

### 2-5. 외부 서비스는 샌드박스/대역으로 — 진짜 부수효과 금지
- 결제·메일·SMS·서드파티 API는 테스트 모드/샌드박스 키 또는 로컬 가짜 서버로 대체한다.
- 진짜 과금·발송·외부 상태 변경을 일으키지 않는다. 응답 지연·실패 같은 경계 상황도 대역으로 재현한다.

```text
// ❌ 금지 — 테스트가 실제 결제/발송을 호출
charge(realCard)        // 비용·부수효과·불안정

// ✅ 권장 — 샌드박스/가짜 서버로 계약만 검증
charge(sandboxCard) → assert request shape & handled response
```

### 2-6. 의존 서비스를 코드로 띄우고 CI에서 재현한다
- DB·캐시 등 의존 서비스를 선언적으로(컨테이너 정의 등) 띄우고, **준비 완료(healthcheck)** 를 확인한 뒤 테스트를 시작한다.
- 같은 정의를 로컬과 CI가 공유해, "내 PC에선 됨"을 없앤다.

```text
// ✅ 권장 — 의존 서비스 기동 → 준비 확인 → 테스트
services: [db, cache]  with healthcheck
wait until healthy
then run integration tests
```

## 3. 흔한 실수

규칙(§2)을 어겼을 때 나타나는 증상들 — 보이면 해당 규칙으로 돌아간다.

- **데이터 오염·사고** → 프로덕션 자원에 연결해 테스트한다(2-1).
- **순서에 따라 깨짐(flaky)** → setup/teardown 누락(2-2), 비동기 완료를 안 기다림(2-4), 시간·랜덤·순서 의존(결정성) 중 하나다.
- **계약 결함을 못 잡음** → 내부 함수를 직접 호출해 "API 테스트"라 부르며 직렬화·라우팅·검증·미들웨어를 건너뛴다(2-3).
- **비용·부수효과** → 외부 서비스를 실제 호출한다(2-5).
- **"내 PC에선 됨"** → 의존 서비스를 코드로 선언하지 않아 CI에서 깨진다(2-6).

## 4. 체크리스트
- [ ] 테스트 전용 DB/의존성(인메모리·컨테이너)을 쓰고 프로덕션 자원을 건드리지 않는가
- [ ] 각 테스트가 알려진 상태에서 시작하고 끝나면 롤백/정리해 서로 격리되는가
- [ ] API 통합 테스트가 진짜 요청으로 상태·스키마·헤더 등 **계약**을 검증하는가
- [ ] 쓰기 후 다시 읽어 실제 반영(왕복)을 확인하는가
- [ ] UI/컴포넌트 통합에서 외부 호출을 대역으로 막고 비동기 완료 후 단언하는가
- [ ] 외부 서비스를 테스트 모드/샌드박스/가짜 서버로 처리했는가 (진짜 부수효과 없음)
- [ ] 시간·랜덤·순서 의존을 제거해 결정적인가
- [ ] 의존 서비스를 코드로 띄우고 준비 확인 후 실행해 CI에서 재현 가능한가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: JVM/Spring+Testcontainers, Node/Jest+supertest, Go/testify 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Python (pytest + httpx + SQLAlchemy + Testcontainers)

진짜 요청으로 계약·왕복 검증 + 테스트별 DB 초기화(2-3, 2-2):

```python
import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine
from app.main import app

# 테스트 전용 DB (인메모리 SQLite 또는 Docker PostgreSQL)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(autouse=True)
async def reset_db():
    """각 테스트 전 테이블 초기화"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_create_and_get_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # 생성
        create_res = await client.post("/users", json={
            "name": "홍길동", "email": "hong@example.com"
        })
        assert create_res.status_code == 201
        user_id = create_res.json()["id"]

        # 조회 — 실제 DB에서 읽어옴
        get_res = await client.get(f"/users/{user_id}")
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "홍길동"
```

인메모리로 부족하면 컨테이너(Testcontainers)로 실제 PostgreSQL을 띄우고 테스트 후 롤백:

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
        await session.rollback()  # 테스트 후 롤백
```

### Vue (Vue Test Utils + Pinia + MSW)

외부 호출 대역 + 비동기 완료 후 단언(2-4):

```javascript
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import UserProfile from "@/components/UserProfile.vue";

// 실제 API 모킹 (MSW 또는 vi.mock)
vi.mock("@/utils/axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: { id: "u1", name: "홍길동", email: "hong@example.com" }
    })
  }
}));

test("사용자 프로필 로드 및 표시", async () => {
  const wrapper = mount(UserProfile, {
    props: { userId: "u1" },
    global: { plugins: [createPinia()] }
  });

  await flushPromises();  // 비동기 처리 완료

  expect(wrapper.text()).toContain("홍길동");
  expect(wrapper.text()).toContain("hong@example.com");
});
```

### CI 의존 서비스 (Docker Compose)

healthcheck로 의존 서비스를 띄운 뒤 실행해 CI에서 재현(2-6):

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
