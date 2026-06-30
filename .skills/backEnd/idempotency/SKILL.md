---
name: 멱등성 (Idempotency) 보장
description: 중복 요청·재시도에도 같은 결과를 보장하는 멱등성 키 패턴과 구현 표준. 결제·주문·이메일 발송 등 부작용이 있는 POST 엔드포인트를 만들거나, 재시도·중복 요청 처리를 정할 때 읽는다. 키워드: idempotency, idempotent, Idempotency-Key, retry, payment, duplicate, redis.
rules:
  - "결제·주문·이메일 발송 등 부작용이 있는 POST 엔드포인트는 Idempotency-Key 헤더를 지원한다."
  - "동일 키의 첫 요청 결과를 캐시(Redis·DB)에 저장하고, 재요청 시 저장된 결과를 반환한다."
  - "멱등성 키는 클라이언트가 생성한 UUID v4를 사용하고, TTL은 24시간 이상으로 설정한다."
  - "처리 중인 요청의 중복 도달은 409 Conflict로 응답하거나, 완료까지 polling 방식을 제공한다."
  - "PUT/DELETE는 URI+파라미터가 동일하면 멱등이므로 별도 키가 불필요하다."
tags:
  - "idempotency"
  - "idempotent"
  - "Idempotency-Key"
  - "retry"
  - "payment"
  - "duplicate"
  - "redis"
---

# 🔁 멱등성 (Idempotency) 보장

> 중복 요청·재시도에도 같은 결과를 보장한다. 부작용이 있는 POST 엔드포인트를 만들거나 재시도·중복 처리를 정할 때 읽는다.

## 1. 핵심 원칙
- 결제·주문·이메일 발송 등 부작용이 있는 POST 엔드포인트는 `Idempotency-Key` 헤더를 지원한다.
- 동일 키의 첫 요청 결과를 캐시(Redis·DB)에 저장하고, 재요청 시 저장된 결과를 반환한다.
- 멱등성 키는 클라이언트가 생성한 UUID v4를 사용하고, TTL은 24시간 이상으로 설정한다.
- 처리 중인 요청의 중복 도달은 409 Conflict로 응답하거나, 완료까지 polling 방식을 제공한다.
- PUT/DELETE는 URI+파라미터가 동일하면 멱등이므로 별도 키가 불필요하다.

## 2. 규칙

### 2-1. 처리 흐름
```
Client → POST /payments  (Idempotency-Key: uuid-abc)
         ↓
Server: Redis에 key=uuid-abc 존재?
  No  → 처리 → 결과 저장(TTL 24h) → 201 Created
  Yes → 저장된 결과 반환 → 200 OK (처리 생략)
```

### 2-2. Redis 기반 구현 (Python 예시)
```python
IDEMPOTENCY_TTL = 86400  # 24시간

async def idempotent(key: str, handler):
    cached = await redis.get(f"idem:{key}")
    if cached:
        return json.loads(cached)          # ✅ 재요청 — 저장된 결과 반환
    result = await handler()
    await redis.set(f"idem:{key}", json.dumps(result), ex=IDEMPOTENCY_TTL)
    return result
```

### 2-3. API 요청 예시
```http
POST /api/payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{"amount": 10000, "currency": "KRW"}
```

### 2-4. 오류 처리
- 키 충돌(처리 중): `409 Conflict`, Retry-After 헤더 포함
- 키 없이 POST: `400 Bad Request` (멱등성 요구 엔드포인트)
- 만료 후 재사용: 새 요청으로 처리(키 재생성 권장)

## 3. 흔한 실수
- 부작용 있는 POST에 멱등성 키 미지원 → 재시도 시 중복 결제·중복 발송.
- 결과를 저장하지 않고 키 존재 여부만 확인 → 재요청에 응답 본문을 줄 수 없다.
- TTL을 너무 짧게 설정 → 정당한 재시도가 새 요청으로 처리된다.
- PUT/DELETE에 불필요한 키 요구 → 본래 멱등이므로 과설계.

## 4. 체크리스트
- [ ] 부작용 있는 POST 엔드포인트가 `Idempotency-Key`를 지원하는가
- [ ] 첫 요청 결과를 캐시에 저장하고 재요청 시 반환하는가
- [ ] 키는 클라이언트 UUID v4, TTL은 24시간 이상인가
- [ ] 처리 중 중복은 409 Conflict로 응답하는가
- [ ] PUT/DELETE에 불필요한 키를 요구하지 않는가
