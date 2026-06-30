---
name: Webhook Publishing & Receiving
description: Standards for implementing a webhook publisher that notifies external services of events and for verifying received webhooks. Read this when publishing a new webhook or when safely receiving, verifying, and retrying external webhooks. Keywords: webhook, hmac, event, signature, X-Signature, callback, retry.
rules:
  - "Webhook delivery is handled asynchronously in a background job (queue) rather than on the synchronous HTTP path (see background-job)."
  - "Attach an HMAC-SHA256 signature in the X-Signature header to verify sender authenticity, and verify it on the receiving side."
  - "On delivery failure, retry up to N times with exponential backoff and retain the retry log."
  - "The webhook payload follows an envelope structure containing the event type, version, timestamp, and idempotency ID."
  - "The receiving endpoint returns 200 OK immediately and performs the actual processing asynchronously to prevent timeouts."
tags:
  - "webhook"
  - "hmac"
  - "event"
  - "signature"
  - "X-Signature"
  - "callback"
  - "retry"
---

# 🪝 Webhook Publishing & Receiving

> Standardize how events are safely delivered to and received from external services. Read this when implementing a webhook publisher or building an endpoint that receives external webhooks.

## 1. Core Principles
- Webhook delivery is handled asynchronously in a background job (queue) rather than on the synchronous HTTP path (`background-job`).
- Attach an HMAC-SHA256 signature in the `X-Signature` header to verify sender authenticity, and verify it on the receiving side.
- On delivery failure, retry up to N times with exponential backoff and retain the retry log.
- The webhook payload follows an envelope structure containing the event type, version, timestamp, and idempotency ID.
- The receiving endpoint returns 200 OK immediately and performs the actual processing asynchronously to prevent timeouts.

## 2. Rules

### 2-1. Payload Envelope Standard

Include the event type, version, timestamp, and idempotency ID (`id`).

```json
{
  "id": "evt_01JXYZ",
  "type": "order.completed",
  "version": "1.0",
  "created_at": "2026-06-13T12:00:00Z",
  "data": {
    "order_id": "ORD-123",
    "amount": 50000
  }
}
```

### 2-2. Signature Generation (Sender Side)

```python
import hmac, hashlib

def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
```

### 2-3. Signature Verification (Receiver Side)

The receiving endpoint compares the signature in constant time, returns 200 immediately, and hands off the actual processing asynchronously.

```python
def verify_signature(secret: str, body: bytes, header: str) -> bool:
    expected = sign_payload(secret, body)
    return hmac.compare_digest(expected, header)  # constant-time comparison required

@router.post("/webhooks/payment")
async def receive_webhook(request: Request):
    body = await request.body()
    if not verify_signature(WEBHOOK_SECRET, body, request.headers.get("X-Signature", "")):
        raise HTTPException(403)
    background_tasks.add_task(process_event, json.loads(body))
    return {"ok": True}  # return 200 immediately
```

### 2-4. Retry Log Schema

On delivery failure, retry with exponential backoff and retain the attempt history.

```sql
CREATE TABLE webhook_attempts (
  id UUID PRIMARY KEY,
  event_id VARCHAR,
  endpoint_url VARCHAR,
  status_code INT,
  attempt_no INT,
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 3. Common Mistakes
- ❌ Processing received requests without signature verification → forged requests get executed. HMAC verification is required.
- ❌ Comparing signatures with `==` → timing attack. Use constant-time comparison such as `hmac.compare_digest`.
- ❌ Synchronous delivery (on the request path) → receiver latency propagates into your own API latency. Use a background job (`background-job`).
- ❌ Processing synchronously instead of returning 200 immediately on receipt → sender timeouts and a flood of retransmissions. Return 200 immediately, then process asynchronously.
- ❌ No retries or idempotency → duplicate processing/loss. Use the envelope `id` for idempotency + exponential backoff retries.
- ❌ Ignoring delivery failures or retrying infinitely → manage with a retry cap and a DLQ.
- ❌ Examples are Python-only and do not reflect the main stack (Spring) → the HMAC and queue concepts are identical; port them to that stack's API.

## 4. Checklist
- [ ] Is webhook delivery handled asynchronously in a background job (queue)?
- [ ] Does the payload follow the `id`·`type`·`version`·`created_at` envelope structure?
- [ ] Does the sender side attach an HMAC-SHA256 signature in the `X-Signature` header?
- [ ] Does the receiver side verify with constant-time comparison using `hmac.compare_digest`?
- [ ] Does the receiving endpoint return 200 immediately and hand off processing asynchronously?
- [ ] On delivery failure, are exponential backoff retries and an attempt log retained?
