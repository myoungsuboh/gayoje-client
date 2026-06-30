---
name: 契约测试 (Contract Testing) — Pact
description: 自动验证微服务·API消费者(Consumer)与提供者(Provider)之间的API契约,以尽早发现集成错误的Consumer-Driven Contract Testing指南。在更改API模式、验证服务间集成、或确认可否部署时阅读。关键词: Pact, OpenAPI, Swagger, consumer, provider, contract, api-schema, Schemathesis。
rules:
  - "消费者(Consumer)将其期望的请求·响应格式定义为契约(Pact),提供者(Provider)依据此契约进行验证。"
  - "更改API模式时先更新消费者契约测试,提供者通过后再推进部署。"
  - "通过Pact broker共享契约,在CI中自动运行消费者·提供者双方的契约测试。"
  - "契约测试专注于API行为的契约验证,业务逻辑验证交给单元/集成测试。"
  - "将OpenAPI/Swagger规范作为契约文档的起点,保持代码与规范的一致性。"
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

# 🤝 契约测试 (Contract Testing)

> 消费者将其期望的请求·响应格式固定为契约(Pact),提供者验证它以尽早发现集成错误。在更改API模式或确认服务间集成·可否部署时阅读。

## 1. 核心原则
- 消费者(Consumer)将其期望的请求·响应格式定义为契约(Pact),提供者(Provider)依据此契约进行验证。
- 更改API模式时先更新消费者契约测试,提供者通过后再推进部署。
- 通过Pact broker共享契约,在CI中自动运行消费者·提供者双方的契约测试。
- 契约测试专注于API行为的契约验证,业务逻辑验证交给单元/集成测试。
- 将OpenAPI/Swagger规范作为契约文档的起点,保持代码与规范的一致性。

## 2. 规则

### 2-1. Consumer-Driven Contract Testing 流程
顺序为:消费者定义契约 → 共享到broker → 提供者验证 → 确认可否部署(can-i-deploy)。

```
Consumer (FE)          Pact Broker          Provider (BE)
    │                      │                    │
    │── 定义契约 ──────────▶│                    │
    │   (期望请求/响应)     │                    │
    │                      │── 共享契约 ────────▶│
    │                      │                    │── 验证契约
    │                      │◀─ 验证结果 ─────────│
    │                      │
    │  确认可否部署 (can-i-deploy)
```

### 2-2. Consumer 契约定义 (Pact.js)
消费者将其期望的请求·响应声明为契约。用Matcher验证的是格式而非值。

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

### 2-3. Provider 契约验证 (Python)
提供者从broker获取契约,验证实际响应是否满足契约,并将验证结果再次发布。

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

### 2-4. 基于OpenAPI模式的契约验证
以OpenAPI/Swagger规范为起点,自动验证实际响应是否与规范一致。

```python
# Schemathesis — OpenAPI 스펙으로 자동 테스트 생성
import schemathesis

schema = schemathesis.from_uri("http://api.example.com/openapi.json")

@schema.parametrize()
def test_api_spec_compliance(case):
    response = case.call()
    case.validate_response(response)  # 스펙과 실제 응답 비교
```

## 3. 常见错误
- 仅提供者定义契约 → 未反映消费者的实际期望,集成时破裂。
- 在契约中直接硬编码固定值 → 用字面量而非Matcher,数据一变就破裂。
- 未将契约测试接入CI → 模式更改直到部署前一刻才暴露。
- 未发布验证结果(`publish_verification_results=False`) → can-i-deploy判断的依据消失。

## 4. 检查清单
- [ ] 是否将消费者期望的请求·响应定义为契约
- [ ] 契约值是否使用Matcher(格式验证)而非字面量
- [ ] 更改API模式时是否先更新了消费者契约
- [ ] 提供者是否验证broker的契约并发布了结果
- [ ] 是否在CI中自动运行消费者·提供者契约测试
- [ ] 部署前是否用can-i-deploy确认了兼容性
