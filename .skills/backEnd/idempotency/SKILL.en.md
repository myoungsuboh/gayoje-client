---
name: Ensuring Idempotency (Idempotency)
description: An idempotency-key pattern and implementation standard that guarantees the same result even under duplicate requests and retries. Read when building POST endpoints with side effects such as payment, ordering, or email sending, or when deciding how to handle retries and duplicate requests. Keywords: idempotency, idempotent, Idempotency-Key, retry, payment, duplicate, redis.
rules:
  - "POST endpoints with side effects such as payment, ordering, and email sending support the Idempotency-Key header."
  - "Store the result of the first request for a given key in a cache (Redis/DB), and on re-request return the stored result."
  - "The idempotency key uses a client-generated UUID v4, and the TTL is set to 24 hours or more."
  - "Respond to a duplicate arrival of an in-progress request with 409 Conflict, or provide a polling mechanism until completion."
  - "PUT/DELETE are idempotent when the URI+parameters are identical, so no separate key is needed."
tags:
  - "idempotency"
  - "idempotent"
  - "Idempotency-Key"
  - "retry"
  - "payment"
  - "duplicate"
  - "redis"
---

# 🔁 Ensuring Idempotency (Idempotency)

> Guarantee the same result even under duplicate requests and retries. Read when building POST endpoints with side effects or when deciding retry/duplicate handling.

## 1. Core Principles
- POST endpoints with side effects such as payment, ordering, and email sending support the `Idempotency-Key` header.
- Store the result of the first request for a given key in a cache (Redis/DB), and on re-request return the stored result.
- The idempotency key uses a client-generated UUID v4, and the TTL is set to 24 hours or more.
- Respond to a duplicate arrival of an in-progress request with 409 Conflict, or provide a polling mechanism until completion.
- PUT/DELETE are idempotent when the URI+parameters are identical, so no separate key is needed.

## 2. Rules

### 2-1. Processing flow
```
Client → POST /payments  (Idempotency-Key: uuid-abc)
         ↓
Server: does key=uuid-abc exist in Redis?
  No  → process → store result (TTL 24h) → 201 Created
  Yes → return stored result → 200 OK (skip processing)
```

### 2-2. Redis-based implementation (Python example)
```python
IDEMPOTENCY_TTL = 86400  # 24 hours

async def idempotent(key: str, handler):
    cached = await redis.get(f"idem:{key}")
    if cached:
        return json.loads(cached)          # ✅ re-request — return stored result
    result = await handler()
    await redis.set(f"idem:{key}", json.dumps(result), ex=IDEMPOTENCY_TTL)
    return result
```

### 2-3. API request example
```http
POST /api/payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{"amount": 10000, "currency": "KRW"}
```

### 2-4. Error handling
- Key conflict (in progress): `409 Conflict`, include a Retry-After header
- POST without a key: `400 Bad Request` (idempotency-required endpoint)
- Reuse after expiry: handled as a new request (regenerating the key is recommended)

## 3. Common Mistakes
- POST with side effects does not support an idempotency key → duplicate payment / duplicate sending on retry.
- Only checking whether the key exists without storing the result → cannot return a response body on re-request.
- Setting the TTL too short → a legitimate retry gets handled as a new request.
- Requiring an unnecessary key on PUT/DELETE → over-design, since they are inherently idempotent.

## 4. Checklist
- [ ] Does the POST endpoint with side effects support `Idempotency-Key`?
- [ ] Is the first request's result stored in the cache and returned on re-request?
- [ ] Is the key a client-side UUID v4, and is the TTL 24 hours or more?
- [ ] Is an in-progress duplicate answered with 409 Conflict?
- [ ] Does it avoid requiring an unnecessary key on PUT/DELETE?
