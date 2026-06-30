---
name: API 설계 원칙 (REST/HTTP, 스택 중립)
description: REST/HTTP API 의 설계 원칙 — 리소스 모델링·URL 명명, HTTP 메서드/상태코드 의미론, 일관된 에러 응답 포맷(RFC 7807), 필터·정렬·페이지네이션 쿼리 규약, 무상태성. 스택에 무관한 범용 표준으로, 새 엔드포인트를 설계하거나 응답·에러 포맷을 정할 때 읽는다. (버전 전략은 `api-versioning-swagger`, 멱등성은 `idempotency`, 페이지네이션 구현은 `pagination-filtering`, 인증/인가는 `authn-authz` 에 위임.) 키워드: REST, resource, HTTP method, status code, idempotent, RFC 7807, problem+json, content negotiation, HATEOAS.
rules:
  - "리소스 중심 URL: 경로는 동사가 아니라 명사(리소스)로 짓는다 — /users/{id}/orders (O), /getUserOrders (X). 컬렉션은 복수형."
  - "메서드 의미 준수: GET(조회·부작용 없음)·POST(생성)·PUT(전체 교체)·PATCH(부분 수정)·DELETE(삭제). GET 으로 상태를 바꾸지 않는다."
  - "상태코드 의미 준수: 2xx 성공·4xx 클라이언트 잘못·5xx 서버 잘못. 200 에 에러를 담아 보내지 않는다(예: {success:false} 를 200 으로)."
  - "일관된 에러 포맷: 모든 에러는 동일한 구조로 응답한다. RFC 7807(application/problem+json: type·title·status·detail) 또는 프로젝트 공통 에러 스키마를 따른다."
  - "조회 규약 표준화: 필터·정렬·페이지네이션을 쿼리 파라미터로 일관되게 노출한다(예: ?status=open&sort=-created_at&page=2)."
  - "무상태성: 각 요청은 자기충족적이어야 한다 — 서버 세션에 요청 간 상태를 숨기지 않는다(인증 토큰 등은 매 요청에 전달)."
tags:
  - "REST"
  - "resource"
  - "HTTP method"
  - "status code"
  - "idempotent"
  - "RFC 7807"
  - "problem+json"
  - "content negotiation"
  - "HATEOAS"
  - "PATCH"
  - "ETag"
---

# 🔌 API 설계 원칙 (REST/HTTP, 스택 중립)

> REST/HTTP API 가 예측 가능하고 일관되도록 설계 원칙을 통일한다. 리소스 모델링·메서드/상태코드 의미·에러 포맷·조회 규약을 정한다. 새 엔드포인트를 설계하거나 응답·에러 포맷을 정할 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.
>
> 경계: API **버전 전략**은 [api-versioning-swagger](../api-versioning-swagger/SKILL.md), **멱등성 보장**은 [idempotency](../idempotency/SKILL.md), **페이지네이션 구현**은 [pagination-filtering](../pagination-filtering/SKILL.md), **인증/인가**는 [authn-authz](../../security/authn-authz/SKILL.md) 를 본다. 본 스킬은 그 위의 **설계 원칙**을 다룬다.

## 1. 핵심 원칙

- **리소스 중심**: URL 은 행위(verb)가 아니라 자원(noun)을 가리킨다.
- **메서드·상태코드 의미 준수**: HTTP 의 표준 의미를 그대로 쓴다 — 재발명하지 않는다.
- **일관된 에러 포맷**: 모든 에러가 같은 모양이어야 클라이언트가 한 번만 처리한다.
- **무상태성**: 요청은 자기충족적 — 서버 세션에 상태를 숨기지 않는다.

## 2. 규칙

### 2-1. 리소스 모델링 & URL 명명

```
✅ 권장 (명사·복수·계층)
GET    /users/{id}/orders          # 사용자의 주문 목록
POST   /orders                     # 주문 생성
GET    /orders/{id}                # 주문 단건
PATCH  /orders/{id}                # 주문 부분 수정

❌ 금지 (동사·행위를 URL 에)
POST   /createOrder
GET    /getUserOrders?userId=5
POST   /orders/{id}/cancelAndRefund   # 행위는 상태 변경으로 모델링
```

- 컬렉션은 복수형(`/orders`), 단건은 `/orders/{id}`.
- 행위가 꼭 필요하면(검색·배치) 하위 리소스나 명확한 액션으로: `POST /orders/{id}/refunds`.

### 2-2. HTTP 메서드 의미

| 메서드 | 용도 | 멱등성 | 비고 |
|--------|------|--------|------|
| GET | 조회 | ✓ | 부작용 없음 — 캐시 가능 |
| POST | 생성·비멱등 작업 | ✗ | 매 호출이 새 리소스 |
| PUT | 전체 교체 | ✓ | 같은 바디로 여러 번 = 같은 결과 |
| PATCH | 부분 수정 | △ | 보통 비멱등 |
| DELETE | 삭제 | ✓ | 이미 삭제됨도 성공 처리 가능 |

> 멱등성을 **보장하는 구현**(중복 요청 방어, Idempotency-Key)은 `idempotency` 스킬을 본다.

### 2-3. 상태코드 의미

```
2xx 성공      200 OK · 201 Created(+Location) · 204 No Content
4xx 클라 잘못  400 검증실패 · 401 미인증 · 403 권한없음 · 404 없음 · 409 충돌 · 422 의미오류 · 429 과다요청
5xx 서버 잘못  500 내부오류 · 503 일시불가
```

- ❌ 금지: `200 OK` 바디에 `{ "success": false, "error": ... }` — 에러를 200 으로 숨기면 클라이언트·프록시·모니터링이 성공으로 오인한다.
- 생성 성공은 `201` + `Location` 헤더로 새 리소스 위치를 알린다.

### 2-4. 일관된 에러 응답 (RFC 7807)

```json
// Content-Type: application/problem+json
{
  "type": "https://example.com/errors/insufficient-stock",
  "title": "재고 부족",
  "status": 409,
  "detail": "상품 SKU-123 의 재고가 3개 남아 5개 주문 불가",
  "instance": "/orders/789"
}
```

- 모든 에러가 **동일한 스키마**를 따른다(RFC 7807 또는 프로젝트 공통 에러 객체).
- `detail` 은 사람이 읽을 수 있게, `type` 은 기계가 분기할 수 있게.
- 민감정보(스택트레이스·내부 경로)는 바디에 넣지 않는다.

### 2-5. 조회 규약 — 필터·정렬·페이지네이션

```
GET /orders?status=open&customer=5&sort=-created_at&page=2&size=20
```

- 필터는 필드명 쿼리(`status=open`), 정렬은 `sort=-created_at`(`-` 내림차순) 규약을 정하고 일관 적용.
- 페이지네이션 **방식 선택·구현**(offset vs cursor)은 `pagination-filtering` 스킬을 본다 — 여기선 "쿼리로 일관 노출" 원칙만.

### 2-6. 콘텐츠 협상 & 캐싱(기본)

- 요청/응답 형식은 `Content-Type`·`Accept` 로 협상(기본 `application/json`).
- 조회 응답에 `ETag`/`Last-Modified` 를 주면 조건부 요청(`If-None-Match`)으로 대역폭을 아낀다.

## 3. 흔한 실수

- URL 에 행위를 박음(`/getX`, `/doY`) → REST 가 아니라 RPC 가 된다. 리소스+메서드로 표현하라.
- 모든 응답을 `200` 으로 주고 바디 플래그로 성패 구분 → HTTP 의미를 버리는 것. 상태코드를 제대로 쓰라.
- 엔드포인트마다 에러 모양이 다름 → 클라이언트가 케이스별로 분기해야 한다. 하나로 통일하라.
- GET 에 부작용(상태 변경)을 넣음 → 캐시·프리페치·재시도가 의도치 않게 데이터를 바꾼다.

## 4. 체크리스트

- [ ] URL 이 동사가 아니라 리소스(명사·복수)인가
- [ ] 메서드·상태코드를 표준 의미대로 썼는가 (200 에 에러를 숨기지 않았는가)
- [ ] 모든 에러가 동일한 포맷(RFC 7807 또는 공통 스키마)인가
- [ ] 필터·정렬·페이지네이션을 일관된 쿼리 규약으로 노출했는가
- [ ] 요청이 자기충족적인가 (서버 세션에 요청 간 상태를 숨기지 않았는가)

## 부록: 관련 스킬 위임

- 버전 전략(`/v1/`, Deprecation/Sunset): `api-versioning-swagger`
- 멱등성 보장(Idempotency-Key, 중복 방어): `idempotency`
- 페이지네이션 구현(offset/cursor): `pagination-filtering`
- 인증/인가: `authn-authz` · 입력 검증: `input-validation`
