---
name: API Design Principles (REST/HTTP, Stack-Neutral)
description: Design principles for REST/HTTP APIs — resource modeling and URL naming, HTTP method/status-code semantics, a consistent error response format (RFC 7807), filter/sort/pagination query conventions, and statelessness. A universal, stack-independent standard to read when designing a new endpoint or deciding response/error formats. (Versioning strategy is delegated to `api-versioning-swagger`, idempotency to `idempotency`, pagination implementation to `pagination-filtering`, and authentication/authorization to `authn-authz`.) Keywords: REST, resource, HTTP method, status code, idempotent, RFC 7807, problem+json, content negotiation, HATEOAS.
rules:
  - "Resource-centric URLs: name paths after nouns (resources), not verbs — /users/{id}/orders (O), /getUserOrders (X). Use plural for collections."
  - "Honor method semantics: GET (read, no side effects), POST (create), PUT (full replace), PATCH (partial update), DELETE (delete). Never change state with GET."
  - "Honor status-code semantics: 2xx success, 4xx client error, 5xx server error. Never return an error inside a 200 (e.g. {success:false} with 200)."
  - "Consistent error format: respond to every error with the same structure. Follow RFC 7807 (application/problem+json: type, title, status, detail) or the project's common error schema."
  - "Standardize query conventions: expose filtering, sorting, and pagination consistently via query parameters (e.g. ?status=open&sort=-created_at&page=2)."
  - "Statelessness: each request must be self-contained — do not hide cross-request state in a server session (pass auth tokens etc. on every request)."
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

# 🔌 API Design Principles (REST/HTTP, Stack-Neutral)

> Unify design principles so that REST/HTTP APIs are predictable and consistent. Define resource modeling, method/status-code semantics, error format, and query conventions. Read this when designing a new endpoint or deciding response/error formats. It is a universal standard not tied to any specific language/framework.
>
> Boundaries: For API **versioning strategy** see [api-versioning-swagger](../api-versioning-swagger/SKILL.md), for **idempotency guarantees** see [idempotency](../idempotency/SKILL.md), for **pagination implementation** see [pagination-filtering](../pagination-filtering/SKILL.md), and for **authentication/authorization** see [authn-authz](../../security/authn-authz/SKILL.md). This skill covers the **design principles** above those.

## 1. Core Principles

- **Resource-centric**: A URL points to a resource (noun), not an action (verb).
- **Honor method/status-code semantics**: Use HTTP's standard meanings as-is — do not reinvent them.
- **Consistent error format**: Every error must have the same shape so the client handles it just once.
- **Statelessness**: Requests are self-contained — do not hide state in a server session.

## 2. Rules

### 2-1. Resource Modeling & URL Naming

```
✅ Recommended (nouns, plural, hierarchy)
GET    /users/{id}/orders          # a user's order list
POST   /orders                     # create order
GET    /orders/{id}                # single order
PATCH  /orders/{id}                # partial update of order

❌ Forbidden (verbs/actions in the URL)
POST   /createOrder
GET    /getUserOrders?userId=5
POST   /orders/{id}/cancelAndRefund   # model the action as a state change
```

- Collections are plural (`/orders`), a single item is `/orders/{id}`.
- If an action is truly necessary (search, batch), use a sub-resource or a clear action: `POST /orders/{id}/refunds`.

### 2-2. HTTP Method Semantics

| Method | Purpose | Idempotent | Note |
|--------|------|--------|------|
| GET | Read | ✓ | No side effects — cacheable |
| POST | Create / non-idempotent op | ✗ | Each call creates a new resource |
| PUT | Full replace | ✓ | Same body multiple times = same result |
| PATCH | Partial update | △ | Usually non-idempotent |
| DELETE | Delete | ✓ | Already-deleted can be treated as success |

> For the **implementation that guarantees idempotency** (duplicate-request protection, Idempotency-Key), see the `idempotency` skill.

### 2-3. Status-Code Semantics

```
2xx Success      200 OK · 201 Created(+Location) · 204 No Content
4xx Client error 400 validation fail · 401 unauthenticated · 403 forbidden · 404 not found · 409 conflict · 422 semantic error · 429 too many requests
5xx Server error 500 internal error · 503 temporarily unavailable
```

- ❌ Forbidden: a `200 OK` body containing `{ "success": false, "error": ... }` — hiding an error in a 200 makes clients, proxies, and monitoring mistake it for success.
- Signal a successful creation with `201` + a `Location` header pointing to the new resource.

### 2-4. Consistent Error Responses (RFC 7807)

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

- Every error follows the **same schema** (RFC 7807 or the project's common error object).
- `detail` is human-readable; `type` is machine-branchable.
- Do not put sensitive info (stack traces, internal paths) in the body.

### 2-5. Query Conventions — Filter, Sort, Pagination

```
GET /orders?status=open&customer=5&sort=-created_at&page=2&size=20
```

- Filters use field-name queries (`status=open`); decide a sort convention like `sort=-created_at` (`-` for descending) and apply it consistently.
- For **choosing/implementing the pagination method** (offset vs cursor), see the `pagination-filtering` skill — here only the principle of "consistent exposure via query."

### 2-6. Content Negotiation & Caching (basics)

- Negotiate request/response format via `Content-Type`/`Accept` (default `application/json`).
- Providing `ETag`/`Last-Modified` on read responses saves bandwidth through conditional requests (`If-None-Match`).

## 3. Common Mistakes

- Embedding actions in the URL (`/getX`, `/doY`) → it becomes RPC, not REST. Express it with resource + method.
- Returning everything as `200` and distinguishing success/failure by a body flag → that discards HTTP semantics. Use status codes properly.
- Different error shapes per endpoint → the client must branch case by case. Unify them into one.
- Putting side effects (state changes) into GET → caching, prefetching, and retries change data unintentionally.

## 4. Checklist

- [ ] Is the URL a resource (noun, plural) rather than a verb?
- [ ] Did you use methods/status codes per their standard meaning (not hiding an error in a 200)?
- [ ] Does every error use the same format (RFC 7807 or a common schema)?
- [ ] Are filter/sort/pagination exposed through consistent query conventions?
- [ ] Is the request self-contained (not hiding cross-request state in a server session)?

## Appendix: Related Skill Delegation

- Versioning strategy (`/v1/`, Deprecation/Sunset): `api-versioning-swagger`
- Idempotency guarantees (Idempotency-Key, duplicate protection): `idempotency`
- Pagination implementation (offset/cursor): `pagination-filtering`
- Authentication/authorization: `authn-authz` · input validation: `input-validation`
