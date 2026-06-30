---
name: 웹훅 발행 & 수신
description: 외부 서비스에 이벤트를 알리는 웹훅 발행자 구현과 수신자 검증 표준. 웹훅을 새로 발행하거나 외부 웹훅을 안전하게 수신·검증·재시도 처리할 때 읽는다. 키워드: webhook, hmac, event, signature, X-Signature, callback, retry.
rules:
  - "웹훅 발송은 동기 HTTP 경로가 아닌 백그라운드 잡(큐)에서 비동기로 처리한다 (background-job 참조)."
  - "수신자 진위 검증을 위해 HMAC-SHA256 서명을 X-Signature 헤더에 첨부하고, 수신 측에서 검증한다."
  - "발송 실패 시 지수 백오프로 최대 N회 재시도하고, 재시도 로그를 보관한다."
  - "웹훅 페이로드는 이벤트 유형·버전·타임스탬프·멱등 ID를 포함한 envelope 구조를 따른다."
  - "수신 엔드포인트는 200 OK를 즉시 반환하고, 실제 처리는 비동기로 수행해 타임아웃을 방지한다."
tags:
  - "webhook"
  - "hmac"
  - "event"
  - "signature"
  - "X-Signature"
  - "callback"
  - "retry"
---

# 🪝 웹훅 발행 & 수신

> 외부 서비스에 이벤트를 안전하게 전달하고 받는 방식을 통일한다. 웹훅 발행자를 구현하거나 외부 웹훅 수신 엔드포인트를 만들 때 읽는다.

## 1. 핵심 원칙
- 웹훅 발송은 동기 HTTP 경로가 아닌 백그라운드 잡(큐)에서 비동기로 처리한다 (`background-job` 참조).
- 수신자 진위 검증을 위해 HMAC-SHA256 서명을 `X-Signature` 헤더에 첨부하고, 수신 측에서 검증한다.
- 발송 실패 시 지수 백오프로 최대 N회 재시도하고, 재시도 로그를 보관한다.
- 웹훅 페이로드는 이벤트 유형·버전·타임스탬프·멱등 ID를 포함한 envelope 구조를 따른다.
- 수신 엔드포인트는 200 OK를 즉시 반환하고, 실제 처리는 비동기로 수행해 타임아웃을 방지한다.

## 2. 규칙

### 2-1. 페이로드 Envelope 표준

이벤트 유형·버전·타임스탬프·멱등 ID(`id`)를 포함한다.

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

### 2-2. 서명 생성 (발신 측)

```python
import hmac, hashlib

def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
```

### 2-3. 서명 검증 (수신 측)

수신 엔드포인트는 서명을 상수 시간으로 비교하고, 즉시 200을 반환한 뒤 실제 처리는 비동기로 넘긴다.

```python
def verify_signature(secret: str, body: bytes, header: str) -> bool:
    expected = sign_payload(secret, body)
    return hmac.compare_digest(expected, header)  # 상수 시간 비교 필수

@router.post("/webhooks/payment")
async def receive_webhook(request: Request):
    body = await request.body()
    if not verify_signature(WEBHOOK_SECRET, body, request.headers.get("X-Signature", "")):
        raise HTTPException(403)
    background_tasks.add_task(process_event, json.loads(body))
    return {"ok": True}  # 즉시 200 반환
```

### 2-4. 재시도 로그 스키마

발송 실패 시 지수 백오프로 재시도하고, 시도 이력을 보관한다.

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

## 3. 흔한 실수
- ❌ 서명 검증 없이 수신 처리 → 위조 요청 실행. HMAC 검증 필수.
- ❌ 서명 비교를 `==`로 → 타이밍 공격. `hmac.compare_digest` 등 상수시간 비교.
- ❌ 동기 발송(요청 경로에서) → 수신자 지연이 내 API 지연으로 전파. 백그라운드 잡(`background-job`)으로.
- ❌ 수신 시 즉시 200 안 하고 동기 처리 → 발신자 타임아웃·재전송 폭주. 즉시 200 후 비동기 처리.
- ❌ 재시도·멱등성 없음 → 중복 처리/유실. envelope `id`로 멱등 처리 + 지수 백오프 재시도.
- ❌ 발송 실패를 무시 또는 무한 재시도 → 재시도 상한·DLQ로 관리.
- ❌ 예시가 Python뿐이라 주 스택(Spring) 미반영 → HMAC·큐 개념은 동일, 해당 스택 API로 옮긴다.

## 4. 체크리스트
- [ ] 웹훅 발송을 백그라운드 잡(큐)에서 비동기로 처리하는가
- [ ] 페이로드가 `id`·`type`·`version`·`created_at` envelope 구조를 따르는가
- [ ] 발신 측에서 HMAC-SHA256 서명을 `X-Signature` 헤더에 붙이는가
- [ ] 수신 측에서 `hmac.compare_digest` 로 상수 시간 비교 검증하는가
- [ ] 수신 엔드포인트가 즉시 200을 반환하고 처리는 비동기로 넘기는가
- [ ] 발송 실패 시 지수 백오프 재시도와 시도 로그를 보관하는가
