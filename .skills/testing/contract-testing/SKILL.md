---
name: 계약 테스트 (Contract Testing) — Pact
description: 마이크로서비스·API 소비자(Consumer)와 공급자(Provider) 간의 API 계약을 자동 검증해 통합 오류를 조기에 발견하는 Consumer-Driven Contract Testing 가이드. API 스키마를 바꾸거나 서비스 간 통합을 검증할 때, 배포 가능 여부를 확인할 때 읽는다. 키워드: Pact, OpenAPI, Swagger, consumer, provider, contract, api-schema, Schemathesis.
rules:
  - "소비자(Consumer)가 기대하는 요청·응답 형식을 계약(Pact)으로 정의하고, 공급자(Provider)는 이 계약에 따라 검증한다."
  - "API 스키마 변경 시 소비자 계약 테스트를 먼저 업데이트하고, 공급자가 통과해야 배포를 진행한다."
  - "Pact 브로커를 통해 계약을 공유하고, CI에서 소비자·공급자 양쪽의 계약 테스트를 자동 실행한다."
  - "계약 테스트는 API 동작의 계약 검증에 집중하고, 비즈니스 로직 검증은 단위/통합 테스트에 맡긴다."
  - "OpenAPI/Swagger 스펙을 계약 문서의 출발점으로 활용하고, 코드와 스펙의 일관성을 유지한다."
tags:
  - "Pact"
  - "OpenAPI"
  - "Swagger"
  - "consumer"
  - "provider"
  - "contract"
  - "api-schema"
  - "Schemathesis"
  - "pact"
  - "openapi"
  - "swagger"
---

# 🤝 계약 테스트 (Contract Testing)

> 소비자가 기대하는 요청·응답 형식을 계약(Pact)으로 고정하고, 공급자가 이를 검증해 통합 오류를 조기에 발견한다. API 스키마를 바꾸거나 서비스 간 통합·배포 가능 여부를 확인할 때 읽는다.

## 1. 핵심 원칙
- 소비자(Consumer)가 기대하는 요청·응답 형식을 계약(Pact)으로 정의하고, 공급자(Provider)는 이 계약에 따라 검증한다.
- API 스키마 변경 시 소비자 계약 테스트를 먼저 업데이트하고, 공급자가 통과해야 배포를 진행한다.
- Pact 브로커를 통해 계약을 공유하고, CI에서 소비자·공급자 양쪽의 계약 테스트를 자동 실행한다.
- 계약 테스트는 API 동작의 계약 검증에 집중하고, 비즈니스 로직 검증은 단위/통합 테스트에 맡긴다.
- OpenAPI/Swagger 스펙을 계약 문서의 출발점으로 활용하고, 코드와 스펙의 일관성을 유지한다.

## 2. 규칙

### 2-1. Consumer-Driven Contract Testing 흐름
소비자가 계약을 정의 → 브로커에 공유 → 공급자가 검증 → 배포 가능 여부 확인(can-i-deploy) 순서다.

```
Consumer (FE)          Pact Broker          Provider (BE)
    │                      │                    │
    │── 계약 정의 ──────────▶│                    │
    │   (기대 요청/응답)     │                    │
    │                      │── 계약 공유 ────────▶│
    │                      │                    │── 계약 검증
    │                      │◀─ 검증 결과 ─────────│
    │                      │
    │  배포 가능 여부 확인 (can-i-deploy)
```

### 2-2. Consumer 계약 정의 (Pact.js)
소비자가 기대하는 요청·응답을 계약으로 선언한다. 값이 아니라 형식을 Matcher로 검증한다.

```typescript
// consumer.pact.spec.ts
import { PactV3, MatchersV3 } from "@pact-foundation/pact";

const provider = new PactV3({
  consumer: "frontend-app",
  provider: "user-service",
  dir: "./pacts",
});

describe("User API 계약", () => {
  it("사용자 조회 계약 정의", () => {
    return provider
      .given("사용자 u1이 존재한다")
      .uponReceiving("사용자 u1 조회 요청")
      .withRequest({ method: "GET", path: "/users/u1" })
      .willRespondWith({
        status: 200,
        body: {
          id: MatchersV3.string("u1"),
          name: MatchersV3.string("홍길동"),
          email: MatchersV3.email("hong@example.com"),
        },
      })
      .executeTest(async (mockServer) => {
        const result = await userApi.getUser("u1", mockServer.url);
        expect(result.name).toBe("홍길동");
      });
  });
});
```

### 2-3. Provider 계약 검증 (Python)
공급자는 브로커에서 계약을 가져와 실제 응답이 계약을 만족하는지 검증하고, 검증 결과를 다시 게시한다.

```python
# test_provider_contract.py
import pytest
from pact import Verifier

def test_provider_contracts():
    verifier = Verifier(
        provider="user-service",
        provider_base_url="http://localhost:8000",
    )
    success, logs = verifier.verify_with_broker(
        broker_url="https://pact.mycompany.com",
        publish_version="1.0.0",
        publish_verification_results=True,
        provider_states_setup_url="http://localhost:8000/_pact/setup",
    )
    assert success, f"계약 검증 실패:\n{logs}"
```

### 2-4. OpenAPI 스키마 기반 계약 검증
OpenAPI/Swagger 스펙을 출발점으로 삼아 실제 응답이 스펙과 일치하는지 자동 검증한다.

```python
# Schemathesis — OpenAPI 스펙으로 자동 테스트 생성
import schemathesis

schema = schemathesis.from_uri("http://api.example.com/openapi.json")

@schema.parametrize()
def test_api_spec_compliance(case):
    response = case.call()
    case.validate_response(response)  # 스펙과 실제 응답 비교
```

## 3. 흔한 실수
- 공급자만 계약을 정의 → 소비자의 실제 기대가 반영되지 않아 통합 시 깨진다.
- 계약에 고정 값을 그대로 박음 → Matcher 대신 리터럴을 쓰면 데이터가 바뀔 때마다 깨진다.
- CI에 계약 테스트 미연동 → 스키마 변경이 배포 직전까지 드러나지 않는다.
- 검증 결과 미게시(`publish_verification_results=False`) → can-i-deploy 판단 근거가 사라진다.

## 4. 체크리스트
- [ ] 소비자가 기대하는 요청·응답을 계약으로 정의했는가
- [ ] 계약 값에 리터럴 대신 Matcher(형식 검증)를 사용했는가
- [ ] API 스키마 변경 시 소비자 계약을 먼저 업데이트했는가
- [ ] 공급자가 브로커의 계약을 검증하고 결과를 게시했는가
- [ ] CI에서 소비자·공급자 계약 테스트를 자동 실행하는가
- [ ] 배포 전 can-i-deploy로 호환성을 확인했는가
