---
name: 契約テスト (Contract Testing) — Pact
description: マイクロサービス・APIの消費者(Consumer)と提供者(Provider)間のAPI契約を自動検証し、統合エラーを早期に発見するConsumer-Driven Contract Testingガイド。APIスキーマを変更したり、サービス間の統合を検証したり、デプロイ可否を確認するときに読む。キーワード: Pact, OpenAPI, Swagger, consumer, provider, contract, api-schema, Schemathesis。
rules:
  - "消費者(Consumer)が期待するリクエスト・レスポンス形式を契約(Pact)として定義し、提供者(Provider)はこの契約に従って検証する。"
  - "APIスキーマ変更時は消費者契約テストを先に更新し、提供者が通過してからデプロイを進める。"
  - "Pactブローカーを通じて契約を共有し、CIで消費者・提供者双方の契約テストを自動実行する。"
  - "契約テストはAPI動作の契約検証に集中し、ビジネスロジック検証は単体/統合テストに任せる。"
  - "OpenAPI/Swaggerスペックを契約文書の出発点として活用し、コードとスペックの一貫性を維持する。"
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

# 🤝 契約テスト (Contract Testing)

> 消費者が期待するリクエスト・レスポンス形式を契約(Pact)として固定し、提供者がこれを検証して統合エラーを早期に発見する。APIスキーマを変更したり、サービス間の統合・デプロイ可否を確認するときに読む。

## 1. 核心原則
- 消費者(Consumer)が期待するリクエスト・レスポンス形式を契約(Pact)として定義し、提供者(Provider)はこの契約に従って検証する。
- APIスキーマ変更時は消費者契約テストを先に更新し、提供者が通過してからデプロイを進める。
- Pactブローカーを通じて契約を共有し、CIで消費者・提供者双方の契約テストを自動実行する。
- 契約テストはAPI動作の契約検証に集中し、ビジネスロジック検証は単体/統合テストに任せる。
- OpenAPI/Swaggerスペックを契約文書の出発点として活用し、コードとスペックの一貫性を維持する。

## 2. 規則

### 2-1. Consumer-Driven Contract Testing の流れ
消費者が契約を定義 → ブローカーに共有 → 提供者が検証 → デプロイ可否確認(can-i-deploy)の順だ。

```
Consumer (FE)          Pact Broker          Provider (BE)
    │                      │                    │
    │── 契約定義 ──────────▶│                    │
    │   (期待リクエスト/レスポンス) │                    │
    │                      │── 契約共有 ────────▶│
    │                      │                    │── 契約検証
    │                      │◀─ 検証結果 ─────────│
    │                      │
    │  デプロイ可否確認 (can-i-deploy)
```

### 2-2. Consumer 契約定義 (Pact.js)
消費者が期待するリクエスト・レスポンスを契約として宣言する。値ではなく形式をMatcherで検証する。

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

### 2-3. Provider 契約検証 (Python)
提供者はブローカーから契約を取得し、実際のレスポンスが契約を満たすか検証し、検証結果を再び公開する。

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

### 2-4. OpenAPI スキーマベースの契約検証
OpenAPI/Swaggerスペックを出発点とし、実際のレスポンスがスペックと一致するか自動検証する。

```python
# Schemathesis — OpenAPI 스펙으로 자동 테스트 생성
import schemathesis

schema = schemathesis.from_uri("http://api.example.com/openapi.json")

@schema.parametrize()
def test_api_spec_compliance(case):
    response = case.call()
    case.validate_response(response)  # 스펙과 실제 응답 비교
```

## 3. よくある間違い
- 提供者だけが契約を定義 → 消費者の実際の期待が反映されず、統合時に壊れる。
- 契約に固定値をそのまま埋め込む → Matcherの代わりにリテラルを使うとデータが変わるたびに壊れる。
- CIに契約テスト未連携 → スキーマ変更がデプロイ直前まで表面化しない。
- 検証結果未公開(`publish_verification_results=False`) → can-i-deploy判断の根拠が消える。

## 4. チェックリスト
- [ ] 消費者が期待するリクエスト・レスポンスを契約として定義したか
- [ ] 契約値にリテラルの代わりにMatcher(形式検証)を使ったか
- [ ] APIスキーマ変更時に消費者契約を先に更新したか
- [ ] 提供者がブローカーの契約を検証し結果を公開したか
- [ ] CIで消費者・提供者契約テストを自動実行しているか
- [ ] デプロイ前にcan-i-deployで互換性を確認したか
