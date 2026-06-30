---
name: Contract Testing (Contract Testing) — Pact
description: A Consumer-Driven Contract Testing guide that automatically verifies the API contract between microservice/API Consumers and Providers to catch integration errors early. Read when changing an API schema, verifying integration between services, or checking deployability. Keywords: Pact, OpenAPI, Swagger, consumer, provider, contract, api-schema, Schemathesis.
rules:
  - "The Consumer defines the request/response format it expects as a contract (Pact), and the Provider verifies against this contract."
  - "When changing an API schema, update the consumer contract test first, and proceed to deploy only after the provider passes."
  - "Share contracts through a Pact broker, and run both consumer and provider contract tests automatically in CI."
  - "Contract tests focus on verifying the contract of API behavior; leave business logic verification to unit/integration tests."
  - "Use the OpenAPI/Swagger spec as the starting point for the contract document, and keep code and spec consistent."
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

# 🤝 Contract Testing (Contract Testing)

> The consumer pins the request/response format it expects as a contract (Pact), and the provider verifies it to catch integration errors early. Read when changing an API schema or checking integration/deployability between services.

## 1. Core Principles
- The Consumer defines the request/response format it expects as a contract (Pact), and the Provider verifies against this contract.
- When changing an API schema, update the consumer contract test first, and proceed to deploy only after the provider passes.
- Share contracts through a Pact broker, and run both consumer and provider contract tests automatically in CI.
- Contract tests focus on verifying the contract of API behavior; leave business logic verification to unit/integration tests.
- Use the OpenAPI/Swagger spec as the starting point for the contract document, and keep code and spec consistent.

## 2. Rules

### 2-1. Consumer-Driven Contract Testing flow
The order is: the consumer defines the contract → shares it to the broker → the provider verifies → check deployability (can-i-deploy).

```
Consumer (FE)          Pact Broker          Provider (BE)
    │                      │                    │
    │── define contract ───▶│                    │
    │   (expected req/res)  │                    │
    │                      │── share contract ──▶│
    │                      │                    │── verify contract
    │                      │◀─ verification ─────│
    │                      │
    │  check deployability (can-i-deploy)
```

### 2-2. Consumer contract definition (Pact.js)
The consumer declares the request/response it expects as a contract. It verifies the format, not the value, with a Matcher.

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

### 2-3. Provider contract verification (Python)
The provider fetches the contract from the broker, verifies that the actual response satisfies the contract, and publishes the verification result back.

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

### 2-4. OpenAPI schema-based contract verification
Using the OpenAPI/Swagger spec as the starting point, automatically verify that the actual response matches the spec.

```python
# Schemathesis — OpenAPI 스펙으로 자동 테스트 생성
import schemathesis

schema = schemathesis.from_uri("http://api.example.com/openapi.json")

@schema.parametrize()
def test_api_spec_compliance(case):
    response = case.call()
    case.validate_response(response)  # 스펙과 실제 응답 비교
```

## 3. Common Mistakes
- Only the provider defines the contract → the consumer's actual expectations are not reflected, so it breaks at integration.
- Embedding fixed values directly in the contract → using literals instead of Matchers breaks every time the data changes.
- Not wiring contract tests into CI → schema changes do not surface until right before deployment.
- Not publishing verification results (`publish_verification_results=False`) → the basis for the can-i-deploy decision disappears.

## 4. Checklist
- [ ] Did you define the request/response the consumer expects as a contract?
- [ ] Did you use Matchers (format verification) instead of literals for contract values?
- [ ] When changing an API schema, did you update the consumer contract first?
- [ ] Does the provider verify the broker's contract and publish the result?
- [ ] Do you run consumer and provider contract tests automatically in CI?
- [ ] Did you check compatibility with can-i-deploy before deploying?
